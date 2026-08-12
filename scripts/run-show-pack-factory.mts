#!/usr/bin/env -S node --import tsx

import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs'
import { basename, join, resolve } from 'node:path'
import {
  assertShowPackFlywheelSeedMatchesReceipt,
  composeShowPackWithFlywheel,
} from '../src/lib/show-pack-flywheel'
import { runShowPackFactory, serializeShowPackFactoryStatus } from '../src/lib/show-pack-factory'
import { serializeShowPackCommentaryPlan } from '../src/lib/show-pack-commentary'
import { renderShowPackCommentaryPlanReviewHtml } from '../src/lib/show-pack-commentary-authorization'
import { assertShowPackResearchIntakeResultCurrent } from '../src/lib/show-pack-research-intake'
import { parseSettlementReceipt, serializeSettlementReceipt } from '../src/lib/settlement-receipt'
import { sha256Hex } from '../src/lib/sha256'
import { canonicalProspectivePath, writeUtf8FileSafely } from './lib/safe-write.mts'
import { verifyShowPackPortraitAssets } from './lib/show-pack-assets.mts'

interface Options {
  input: string
  seed: string
  receipt: string
  outputDir?: string
  continuations: string[]
  approvedPlans: string[]
  authorizations: string[]
  research?: string
  researchCandidates?: string
  researchPacket?: string
  researchDecisions?: string
  retryBlocked: boolean
  allowProof: boolean
}

interface InputArtifact {
  label: string
  path: string
  sha256: string
}

interface FactoryRunManifest {
  run_version: 1
  artifact: 'show-pack-factory-run'
  target: { pack_id: string; pack_version: number }
  authority: { allow_proof: boolean; retry_blocked: boolean }
  inputs: Array<{ label: string; sha256: string }>
  status_sha256: string
  artifacts: Array<{ name: string; sha256: string }>
}

function usage(): never {
  console.error('Usage: node --import tsx scripts/run-show-pack-factory.mts --input NEXT-PACK.json --seed SEED.json --receipt RECEIPT.json [--research RESEARCH.json --research-candidates CANDIDATES.json --research-packet PACKET.json --research-decisions DECISIONS.json] [--continuation GROUNDED.json --approved-plan PLAN.json --authorization AUTHORIZATION.json]... [--retry-blocked] [--output-dir DIRECTORY] [--allow-proof]')
  process.exit(1)
}

function parseArgs(argv: string[]): Options {
  const values = new Map<string, string>()
  const continuations: string[] = []
  const approvedPlans: string[] = []
  const authorizations: string[] = []
  let retryBlocked = false
  let allowProof = false
  const valued = new Set([
    '--input', '--seed', '--receipt', '--output-dir', '--continuation',
    '--approved-plan', '--authorization', '--research',
    '--research-candidates', '--research-packet', '--research-decisions',
  ])
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--retry-blocked') retryBlocked = true
    else if (arg === '--allow-proof') allowProof = true
    else if (arg === '--help' || arg === '-h') usage()
    else if (valued.has(arg)) {
      const value = argv[++index]
      if (!value || value.startsWith('--')) throw new Error(`${arg} needs a path`)
      if (arg === '--continuation') continuations.push(value)
      else if (arg === '--approved-plan') approvedPlans.push(value)
      else if (arg === '--authorization') authorizations.push(value)
      else {
        if (values.has(arg)) throw new Error(`${arg} must be supplied once`)
        values.set(arg, value)
      }
    } else throw new Error(`unknown argument ${arg}`)
  }
  const input = values.get('--input')
  const seed = values.get('--seed')
  const receipt = values.get('--receipt')
  if (!input || !seed || !receipt) usage()
  const research = values.get('--research')
  const researchCandidates = values.get('--research-candidates')
  const researchPacket = values.get('--research-packet')
  const researchDecisions = values.get('--research-decisions')
  const researchValues = [research, researchCandidates, researchPacket, researchDecisions]
  if (researchValues.some(Boolean) && !researchValues.every(Boolean)) {
    throw new Error('all four research artifacts must be supplied together')
  }
  if (continuations.length !== approvedPlans.length || continuations.length !== authorizations.length) {
    throw new Error('each --continuation requires one source-ordered --approved-plan and --authorization')
  }
  return {
    input,
    seed,
    receipt,
    outputDir: values.get('--output-dir'),
    continuations,
    approvedPlans,
    authorizations,
    research,
    researchCandidates,
    researchPacket,
    researchDecisions,
    retryBlocked,
    allowProof,
  }
}

function file(raw: string, label: string): string {
  const path = resolve(raw)
  if (!existsSync(path)) throw new Error(`${label} does not exist: ${path}`)
  const real = realpathSync(path)
  if (!statSync(real).isFile()) throw new Error(`${label} must be a file`)
  return real
}

function readArtifact(raw: string, label: string): InputArtifact & { bytes: string } {
  const path = file(raw, label)
  const bytes = readFileSync(path, 'utf8')
  return { label, path, bytes, sha256: sha256Hex(bytes) }
}

function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

function verifyOrWriteRun(runPath: string, files: Map<string, string>): 'created' | 'reused' {
  if (existsSync(runPath)) {
    const real = realpathSync(runPath)
    if (!statSync(real).isDirectory() || real !== runPath) {
      throw new Error(`factory run path must be a real directory: ${runPath}`)
    }
    const actual = readdirSync(runPath).sort()
    const expected = [...files.keys()].sort()
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`existing factory run ${basename(runPath)} has an unexpected artifact set`)
    }
    for (const [name, bytes] of files) {
      const artifactPath = join(runPath, name)
      const linkIdentity = lstatSync(artifactPath)
      const fileIdentity = statSync(artifactPath)
      if (!linkIdentity.isFile() || linkIdentity.isSymbolicLink() || fileIdentity.nlink !== 1) {
        throw new Error(`existing factory run ${basename(runPath)} has aliased artifact ${name}`)
      }
      if (readFileSync(artifactPath, 'utf8') !== bytes) {
        throw new Error(`existing factory run ${basename(runPath)} has drifted artifact ${name}`)
      }
    }
    return 'reused'
  }
  const temporary = mkdtempSync(join(resolve(runPath, '..'), `.${basename(runPath)}.`))
  try {
    for (const [name, bytes] of files) writeUtf8FileSafely(join(temporary, name), bytes, false)
    renameSync(temporary, runPath)
  } finally {
    if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true })
  }
  return 'created'
}

function main(): void {
  const options = parseArgs(process.argv.slice(2))
  const authoring = readArtifact(options.input, 'show-pack authoring input')
  const seedArtifact = readArtifact(options.seed, 'flywheel seed')
  const receiptArtifact = readArtifact(options.receipt, 'settlement receipt')
  const continuations = options.continuations.map((path, index) => (
    readArtifact(path, `factory continuation ${index + 1}`)
  ))
  const approvedPlans = options.approvedPlans.map((path, index) => (
    readArtifact(path, `factory continuation ${index + 1} approved plan`)
  ))
  const authorizations = options.authorizations.map((path, index) => (
    readArtifact(path, `factory continuation ${index + 1} authorization`)
  ))
  const researchArtifact = options.research ? readArtifact(options.research, 'research result') : null
  const researchCandidates = options.researchCandidates
    ? readArtifact(options.researchCandidates, 'research candidates')
    : null
  const researchPacket = options.researchPacket
    ? readArtifact(options.researchPacket, 'research packet')
    : null
  const researchDecisions = options.researchDecisions
    ? readArtifact(options.researchDecisions, 'research decisions')
    : null

  const receipt = parseSettlementReceipt(receiptArtifact.bytes)
  const canonicalReceipt = serializeSettlementReceipt(receipt)
  const receiptSha256 = sha256Hex(canonicalReceipt)
  const seed = assertShowPackFlywheelSeedMatchesReceipt(
    seedArtifact.bytes,
    receipt,
    receiptSha256,
    { allowProof: options.allowProof },
  )
  const research = researchArtifact && researchCandidates && researchPacket && researchDecisions
    ? assertShowPackResearchIntakeResultCurrent({
        flywheelSeedRaw: seedArtifact.bytes,
        candidatesRaw: researchCandidates.bytes,
        packetRaw: researchPacket.bytes,
        decisionsRaw: researchDecisions.bytes,
        resultRaw: researchArtifact.bytes,
      })
    : undefined
  const composed = composeShowPackWithFlywheel(authoring.bytes, seed, research)
  verifyShowPackPortraitAssets(composed)
  const result = runShowPackFactory(composed, {
    retryBlocked: options.retryBlocked,
    ...(continuations.length > 0
      ? {
          continuationSteps: continuations.map((continuation, index) => ({
            continuation_raw: continuation.bytes,
            plan_raw: approvedPlans[index].bytes,
            authorization_raw: authorizations[index].bytes,
          })),
        }
      : {}),
  })
  if (result.compiled) verifyShowPackPortraitAssets(result.compiled)

  const inputs: InputArtifact[] = [authoring, seedArtifact, receiptArtifact]
  if (researchArtifact && researchCandidates && researchPacket && researchDecisions) {
    inputs.push(researchArtifact, researchCandidates, researchPacket, researchDecisions)
  }
  for (let index = 0; index < continuations.length; index += 1) {
    inputs.push(continuations[index], approvedPlans[index], authorizations[index])
  }
  const publicInputs = inputs.map(({ label, sha256 }) => ({ label, sha256 }))
  const statusRaw = serializeShowPackFactoryStatus(result.status)
  const payloads = new Map<string, string>([
    ['working.json', result.working_raw],
    ['status.json', statusRaw],
  ])
  if (result.plan) {
    const planRaw = serializeShowPackCommentaryPlan(result.plan)
    payloads.set('commentary-plan.json', planRaw)
    payloads.set('commentary-review.html', renderShowPackCommentaryPlanReviewHtml(planRaw))
  }
  if (result.compiled_raw) payloads.set('compiled.json', result.compiled_raw)
  const manifest: FactoryRunManifest = {
    run_version: 1,
    artifact: 'show-pack-factory-run',
    target: { ...result.status.target },
    authority: { allow_proof: options.allowProof, retry_blocked: options.retryBlocked },
    inputs: publicInputs,
    status_sha256: sha256Hex(statusRaw),
    artifacts: [...payloads].map(([name, bytes]) => ({ name, sha256: sha256Hex(bytes) })),
  }
  payloads.set('run.json', serialize(manifest))

  console.log('[show-pack-factory] target=local-filesystem')
  console.log(`[show-pack-factory] mode=${options.outputDir ? 'write' : 'dry-run'}`)
  console.log(`[show-pack-factory] pack=${result.status.target.pack_id}@${result.status.target.pack_version}`)
  console.log(`[show-pack-factory] stage=${result.status.stage}`)
  console.log(`[show-pack-factory] working_sha256=${result.status.working_sha256}`)
  console.log(`[show-pack-factory] commentary=pending:${result.status.commentary.pending},ready:${result.status.commentary.ready},blocked:${result.status.commentary.blocked}`)
  if (result.plan) {
    console.log(`[show-pack-factory] plan_jobs=${result.plan.jobs.length}`)
    console.log(`[show-pack-factory] first_pass_calls=${result.plan.budget.first_pass.total_calls_min}-${result.plan.budget.first_pass.total_calls_max}`)
    console.log(`[show-pack-factory] worst_case_calls=${result.plan.budget.worst_case.total_calls_min}-${result.plan.budget.worst_case.total_calls_max}`)
    console.log('[show-pack-factory] boundary=human review and model authorization required; no model called')
  } else if (result.status.stage === 'blocked_grounding') {
    console.log('[show-pack-factory] boundary=residual grounding findings require human judgment; use --retry-blocked only after review')
  } else {
    console.log(`[show-pack-factory] compiled_sha256=${result.status.compiled_sha256}`)
  }
  if (!options.outputDir) {
    console.log('[show-pack-factory] no files written')
    return
  }

  const requestedOutputRoot = resolve(options.outputDir)
  const outputRoot = canonicalProspectivePath(requestedOutputRoot)
  if (outputRoot !== requestedOutputRoot) {
    throw new Error(`output directory must not traverse a symlink: ${requestedOutputRoot}`)
  }
  if (!existsSync(outputRoot)) mkdirSync(outputRoot, { recursive: true })
  if (realpathSync(outputRoot) !== outputRoot || !statSync(outputRoot).isDirectory()) {
    throw new Error(`output directory must be a real directory: ${outputRoot}`)
  }
  const invocationSha256 = sha256Hex(serialize({
    inputs: publicInputs,
    retry_blocked: options.retryBlocked,
    allow_proof: options.allowProof,
  }))
  const runName = `${result.status.target.pack_id}-v${result.status.target.pack_version}-${result.status.working_sha256.slice(0, 16)}-${invocationSha256}`
  const runPath = join(outputRoot, runName)
  const writeState = verifyOrWriteRun(runPath, payloads)
  console.log(`[show-pack-factory] run=${runPath}`)
  console.log(`[show-pack-factory] artifacts=${[...payloads.keys()].join(',')}`)
  console.log(`[show-pack-factory] write_state=${writeState}`)
}

try { main() } catch (error) {
  console.error(`[show-pack-factory] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
