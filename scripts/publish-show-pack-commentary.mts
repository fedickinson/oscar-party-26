/**
 * Batch the pending commentary requests in a show pack through grounded-line.
 * Planning is read-only. Generation checkpoints after every completed request
 * and never mutates the authoring input.
 *
 *   npx tsx scripts/publish-show-pack-commentary.mts --input PACK.json --output WORKING.json --plan-output PLAN.json
 *   npx tsx scripts/publish-show-pack-commentary.mts --input PACK.json --output WORKING.json --request REQUEST_ID --plan-output PLAN.json
 *   npx tsx scripts/publish-show-pack-commentary.mts --input LEGACY.json --legacy-worksheet AUDIT.json --output WORKING.json --plan-output PLAN.json
 *   npx tsx scripts/publish-show-pack-commentary.mts --input PACK.json --output WORKING.json --approved-plan PLAN.json --authorization AUTHORIZATION.json --generate
 *   npx tsx scripts/publish-show-pack-commentary.mts --input PACK.json --output WORKING.json --resume --plan-output RESUME-PLAN.json
 *   npx tsx scripts/publish-show-pack-commentary.mts --input PACK.json --output WORKING.json --resume --approved-plan RESUME-PLAN.json --authorization RESUME-AUTHORIZATION.json --generate
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileShowPack, parseShowPack, type ShowPack } from '../src/lib/show-pack'
import {
  assertShowPackCommentaryPlanCurrent,
  assertShowPackCommentaryAuthorizationCurrent,
  buildShowPackCommentaryPlan,
  publishShowPackCommentary,
  serializeShowPackCommentaryPlan,
  type ShowPackCommentaryAuthorization,
  type ShowPackCommentaryPlan,
} from '../src/lib/show-pack-commentary'
import type { LegacyShowPackMigrationWorksheet } from '../src/lib/legacy-show-pack-audit'
import {
  assessLegacyShowPackAuthoringWorksheet,
  applyLegacyCommentaryPublications,
  projectLegacyShowPackAuthoringWorksheet,
  serializeLegacyShowPackAuthoringWorksheet,
  type LegacyShowPackAuthoringWorksheet,
} from '../src/lib/legacy-show-pack-authoring'
import { assertOutputDoesNotAliasSource, writeUtf8FileSafely } from './lib/safe-write.mts'

function arg(name: string): string | null {
  const index = process.argv.indexOf(name)
  return index >= 0 ? (process.argv[index + 1] ?? null) : null
}

function requiredArg(name: string): string {
  const value = arg(name)
  if (!value) throw new Error(`${name} is required`)
  return value
}

function args(name: string): string[] {
  const values: string[] = []
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] !== name) continue
    const value = process.argv[index + 1]
    if (!value || value.startsWith('--')) throw new Error(`${name} needs a value`)
    values.push(value)
  }
  return values
}

function counts(pack: ShowPack): Record<'pending' | 'ready' | 'blocked', number> {
  const result = { pending: 0, ready: 0, blocked: 0 }
  for (const request of pack.commentary_requests) result[request.publication.status] += 1
  return result
}

function atomicWrite(path: string, pack: ShowPack): void {
  const bytes = `${JSON.stringify(pack, null, 2)}\n`
  parseShowPack(bytes)
  writeUtf8FileSafely(path, bytes, true)
}

function parseJson(raw: string, label: string): unknown {
  try { return JSON.parse(raw) } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function main(): Promise<void> {
  const inputPath = resolve(requiredArg('--input'))
  const outputPath = resolve(requiredArg('--output'))
  const legacyWorksheetArg = arg('--legacy-worksheet')
  const legacyWorksheetPath = legacyWorksheetArg ? resolve(legacyWorksheetArg) : null
  const planOutputArg = arg('--plan-output')
  const planOutputPath = planOutputArg ? resolve(planOutputArg) : null
  const approvedPlanArg = arg('--approved-plan')
  const approvedPlanPath = approvedPlanArg ? resolve(approvedPlanArg) : null
  const authorizationArg = arg('--authorization')
  const authorizationPath = authorizationArg ? resolve(authorizationArg) : null
  const shouldGenerate = process.argv.includes('--generate')
  const shouldResume = process.argv.includes('--resume')
  const retryBlocked = process.argv.includes('--retry-blocked')
  const requestIds = args('--request')
  const force = process.argv.includes('--force')

  if (process.argv.includes('--plan-output') && !planOutputArg) {
    throw new Error('--plan-output needs a path')
  }
  if (process.argv.includes('--approved-plan') && !approvedPlanArg) {
    throw new Error('--approved-plan needs a path')
  }
  if (process.argv.includes('--authorization') && !authorizationArg) {
    throw new Error('--authorization needs a path')
  }
  if (planOutputPath && shouldGenerate) throw new Error('--plan-output cannot be combined with --generate')
  if (planOutputPath && approvedPlanPath) {
    throw new Error('--plan-output cannot be combined with --approved-plan')
  }
  if (planOutputPath && authorizationPath) {
    throw new Error('--plan-output cannot be combined with --authorization')
  }
  if (shouldGenerate && !approvedPlanPath) {
    throw new Error('--generate requires --approved-plan')
  }
  if (shouldGenerate && !authorizationPath) {
    throw new Error('--generate requires --authorization')
  }
  if (authorizationPath && !shouldGenerate) {
    throw new Error('--authorization requires --generate')
  }
  if (approvedPlanPath && !existsSync(approvedPlanPath)) {
    throw new Error(`approved plan does not exist: ${approvedPlanPath}`)
  }
  if (authorizationPath && !existsSync(authorizationPath)) {
    throw new Error(`commentary authorization does not exist: ${authorizationPath}`)
  }
  if (planOutputPath === outputPath) throw new Error('plan output must differ from the working-pack output')

  if (inputPath === outputPath) throw new Error('output must differ from the authoring input')
  if (!existsSync(inputPath)) throw new Error(`input does not exist: ${inputPath}`)
  if (legacyWorksheetPath && !existsSync(legacyWorksheetPath)) {
    throw new Error(`legacy worksheet does not exist: ${legacyWorksheetPath}`)
  }
  assertOutputDoesNotAliasSource(outputPath, [
    { label: 'show-pack authoring input', path: inputPath },
    ...(legacyWorksheetPath
      ? [{ label: 'legacy migration worksheet', path: legacyWorksheetPath }]
      : []),
    ...(approvedPlanPath
      ? [{ label: 'approved commentary plan', path: approvedPlanPath }]
      : []),
    ...(authorizationPath
      ? [{ label: 'commentary authorization', path: authorizationPath }]
      : []),
  ])
  if (planOutputPath) {
    assertOutputDoesNotAliasSource(planOutputPath, [
      { label: 'show-pack authoring input', path: inputPath },
      ...(legacyWorksheetPath
        ? [{ label: 'legacy migration worksheet', path: legacyWorksheetPath }]
        : []),
    ])
    if (existsSync(planOutputPath) && !force) {
      throw new Error(`plan output already exists: ${planOutputPath}; use --force to replace it`)
    }
  }
  if (shouldResume && !existsSync(outputPath)) throw new Error('--resume requires an existing output file')
  if (shouldGenerate && !shouldResume && existsSync(outputPath) && !force) {
    throw new Error(`output already exists: ${outputPath}; use --resume or --force`)
  }

  const workingPath = shouldResume ? outputPath : inputPath
  let legacy: LegacyShowPackMigrationWorksheet | null = null
  let legacyWorksheetSha256: string | null = null
  let legacyAuthoring: LegacyShowPackAuthoringWorksheet | null = null
  let pack: ShowPack
  const workingRaw = readFileSync(workingPath, 'utf8')
  if (legacyWorksheetPath) {
    const legacyRaw = readFileSync(legacyWorksheetPath, 'utf8')
    legacy = parseJson(legacyRaw, 'legacy migration worksheet') as LegacyShowPackMigrationWorksheet
    legacyWorksheetSha256 = createHash('sha256').update(legacyRaw).digest('hex')
    legacyAuthoring = parseJson(
      workingRaw,
      'legacy authoring worksheet',
    ) as LegacyShowPackAuthoringWorksheet
    pack = projectLegacyShowPackAuthoringWorksheet(
      legacy,
      legacyWorksheetSha256,
      legacyAuthoring,
    )
  } else {
    pack = parseShowPack(workingRaw)
  }
  const before = counts(pack)
  const currentPlan = buildShowPackCommentaryPlan(
    pack,
    createHash('sha256').update(workingRaw).digest('hex'),
    {
      retryBlocked,
      requestIds: requestIds.length > 0 ? requestIds : undefined,
      skipReadyRequestIds: shouldResume,
    },
  )
  console.log(`[show-pack-commentary] target=${shouldGenerate ? 'local-filesystem + Anthropic' : 'local-filesystem'}`)
  console.log(`[show-pack-commentary] mode=${shouldGenerate ? 'generate' : 'plan'}`)
  console.log(`[show-pack-commentary] source=${workingPath}`)
  console.log(`[show-pack-commentary] output=${outputPath}`)
  console.log(`[show-pack-commentary] format=${legacy ? 'legacy-authoring-worksheet' : 'schema-v3-pack'}`)
  console.log(`[show-pack-commentary] pending=${before.pending} ready=${before.ready} blocked=${before.blocked}`)
  console.log(`[show-pack-commentary] selection=${requestIds.length > 0 ? requestIds.join(',') : 'all-eligible'}`)

  if (planOutputPath) {
    const plan = currentPlan
    const bytes = serializeShowPackCommentaryPlan(plan)
    console.log(`[show-pack-commentary] plan_jobs=${plan.jobs.length}`)
    console.log(`[show-pack-commentary] first_pass_calls=${plan.budget.first_pass.total_calls_min}-${plan.budget.first_pass.total_calls_max} first_pass_max_output_tokens=${plan.budget.first_pass.max_output_tokens}`)
    console.log(`[show-pack-commentary] worst_case_calls=${plan.budget.worst_case.total_calls_min}-${plan.budget.worst_case.total_calls_max} worst_case_max_output_tokens=${plan.budget.worst_case.max_output_tokens}`)
    console.log(`[show-pack-commentary] input_token_estimate=unavailable`)
    console.log(`[show-pack-commentary] currency_estimate=unavailable`)
    for (const job of plan.jobs) {
      console.log(`[show-pack-commentary] plan_request=${job.request_id} speaker=${job.speaker} status=${job.publication_status}`)
    }
    console.log(`[show-pack-commentary] plan_bytes=${Buffer.byteLength(bytes)} sha256=${createHash('sha256').update(bytes).digest('hex')}`)
    writeUtf8FileSafely(planOutputPath, bytes, force)
    console.log(`[show-pack-commentary] wrote=${planOutputPath}`)
    console.log('[show-pack-commentary] no model called; no working pack written')
    return
  }

  let approvedPlan: ShowPackCommentaryPlan | null = null
  let approvedPlanRaw: string | null = null
  let authorization: ShowPackCommentaryAuthorization | null = null
  if (approvedPlanPath) {
    approvedPlanRaw = readFileSync(approvedPlanPath, 'utf8')
    const parsedPlan = parseJson(approvedPlanRaw, 'approved commentary plan')
    assertShowPackCommentaryPlanCurrent(currentPlan, parsedPlan)
    approvedPlan = parsedPlan
    console.log(`[show-pack-commentary] approved_plan=${approvedPlanPath}`)
    console.log(`[show-pack-commentary] approved_plan_jobs=${currentPlan.jobs.length}`)
  }

  if (authorizationPath) {
    const parsedAuthorization = parseJson(
      readFileSync(authorizationPath, 'utf8'),
      'commentary authorization',
    )
    assertShowPackCommentaryAuthorizationCurrent(approvedPlanRaw!, parsedAuthorization)
    authorization = parsedAuthorization
    console.log(`[show-pack-commentary] authorization=${authorizationPath}`)
    console.log(`[show-pack-commentary] authorized_jobs=${currentPlan.jobs.length}`)
  }

  if (!shouldGenerate) {
    console.log('[show-pack-commentary] no model called; no file written')
    return
  }

  const { groundedLine } = await import('./grounded-line.mts')
  const writeCheckpoint = (checkpoint: ShowPack): void => {
    if (legacy && legacyWorksheetSha256 && legacyAuthoring) {
      const worksheet = applyLegacyCommentaryPublications(legacyAuthoring, checkpoint)
      projectLegacyShowPackAuthoringWorksheet(legacy, legacyWorksheetSha256, worksheet)
      writeUtf8FileSafely(
        outputPath,
        serializeLegacyShowPackAuthoringWorksheet(worksheet),
        true,
      )
    } else {
      atomicWrite(outputPath, checkpoint)
    }
  }
  const published = await publishShowPackCommentary(pack, groundedLine, {
    approvedPlan: approvedPlan!,
    authorization: authorization!,
    onProgress: (checkpoint) => {
      writeCheckpoint(checkpoint)
      const state = counts(checkpoint)
      console.log(`[show-pack-commentary] checkpoint pending=${state.pending} ready=${state.ready} blocked=${state.blocked}`)
    },
  })

  // Ensure a zero-request or already-complete resume still produces the named
  // output on an explicitly authorized generation run.
  writeCheckpoint(published)
  const after = counts(published)
  let publishable = true
  try { compileShowPack(published) } catch { publishable = false }
  console.log(`[show-pack-commentary] complete pending=${after.pending} ready=${after.ready} blocked=${after.blocked}`)
  console.log(`[show-pack-commentary] commentary_publishable=${publishable}`)
  if (legacy && legacyWorksheetSha256 && legacyAuthoring) {
    const outputWorksheet = applyLegacyCommentaryPublications(legacyAuthoring, published)
    const status = assessLegacyShowPackAuthoringWorksheet(
      legacy,
      legacyWorksheetSha256,
      outputWorksheet,
    )
    console.log(`[show-pack-commentary] authoring_ready=${status.ready}`)
  }
  if (!publishable) process.exitCode = 2
}

main().catch((error) => {
  console.error(`[show-pack-commentary] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
