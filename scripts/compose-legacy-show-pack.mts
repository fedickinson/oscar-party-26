#!/usr/bin/env -S npx tsx

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { LegacyShowPackMigrationWorksheet } from '../src/lib/legacy-show-pack-audit'
import {
  assessLegacyShowPackAuthoringWorksheet,
  buildLegacyShowPackAuthoringWorksheet,
  finalizeLegacyShowPackAuthoringWorksheet,
  serializeLegacyShowPackAuthoringWorksheet,
  type LegacyShowPackPreparationOptions,
} from '../src/lib/legacy-show-pack-authoring'
import { assertOutputDoesNotAliasSource, writeUtf8FileSafely } from './lib/safe-write.mts'
import { verifyShowPackPortraitAssets } from './lib/show-pack-assets.mts'

interface CliOptions {
  worksheet: string
  authoring?: string
  output?: string
  force: boolean
  status: boolean
  targetId?: string
  targetVersion?: number
  targetTitle?: string
  canonCutoff?: string
  legacyFilmKind?: 'film' | 'creature'
  candidatePolicy?: 'audited-category-links'
}

function usage(): never {
  console.error('Usage: npx tsx scripts/compose-legacy-show-pack.mts --worksheet AUDIT.json [--authoring AUTHORING.json] [--status | --output FILE.json] [--force] [--target-id ID --target-version N --target-title TITLE --canon-cutoff TEXT] [--legacy-film-kind film|creature] [--candidate-policy audited-category-links]')
  process.exit(1)
}

function parseArgs(argv: string[]): CliOptions {
  let worksheet = ''
  let authoring: string | undefined
  let output: string | undefined
  let force = false
  let status = false
  let targetId: string | undefined
  let targetVersion: number | undefined
  let targetTitle: string | undefined
  let canonCutoff: string | undefined
  let legacyFilmKind: 'film' | 'creature' | undefined
  let candidatePolicy: 'audited-category-links' | undefined
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--worksheet') worksheet = argv[++index] ?? ''
    else if (arg === '--authoring') authoring = argv[++index] ?? ''
    else if (arg === '--output') output = argv[++index] ?? ''
    else if (arg === '--force') force = true
    else if (arg === '--status') status = true
    else if (arg === '--target-id') targetId = argv[++index] ?? ''
    else if (arg === '--target-version') targetVersion = Number(argv[++index] ?? '')
    else if (arg === '--target-title') targetTitle = argv[++index] ?? ''
    else if (arg === '--canon-cutoff') canonCutoff = argv[++index] ?? ''
    else if (arg === '--legacy-film-kind') {
      const value = argv[++index] ?? ''
      if (value !== 'film' && value !== 'creature') {
        throw new Error('--legacy-film-kind must be film or creature')
      }
      legacyFilmKind = value
    } else if (arg === '--candidate-policy') {
      const value = argv[++index] ?? ''
      if (value !== 'audited-category-links') {
        throw new Error('--candidate-policy must be audited-category-links')
      }
      candidatePolicy = value
    }
    else if (arg === '--help' || arg === '-h') usage()
    else throw new Error(`unknown argument ${arg}`)
  }
  if (!worksheet) usage()
  if (authoring !== undefined && !authoring) throw new Error('--authoring needs a path')
  if (output !== undefined && !output) throw new Error('--output needs a path')
  if (status && !authoring) throw new Error('--status requires --authoring')
  if (status && output) throw new Error('--status is read-only and cannot use --output')
  if (status && force) throw new Error('--status is read-only and cannot use --force')
  const targetFieldCount = [targetId, targetVersion, targetTitle, canonCutoff]
    .filter((value) => value !== undefined).length
  if (targetFieldCount !== 0 && targetFieldCount !== 4) {
    throw new Error('--target-id, --target-version, --target-title, and --canon-cutoff must be supplied together')
  }
  const hasPreparationDecision = targetFieldCount > 0 || legacyFilmKind || candidatePolicy
  if (authoring && hasPreparationDecision) {
    throw new Error('preparation decisions cannot be combined with --authoring')
  }
  return {
    worksheet,
    authoring,
    output,
    force,
    status,
    targetId,
    targetVersion,
    targetTitle,
    canonCutoff,
    legacyFilmKind,
    candidatePolicy,
  }
}

function existingFile(path: string, label: string): string {
  const resolved = resolve(path)
  if (!existsSync(resolved)) throw new Error(`${label} does not exist: ${resolved}`)
  return resolved
}

function parseJson(raw: string, label: string): unknown {
  try {
    return JSON.parse(raw)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${label} is not valid JSON: ${message}`)
  }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2))
  const worksheetPath = existingFile(options.worksheet, 'legacy migration worksheet')
  const authoringPath = options.authoring
    ? existingFile(options.authoring, 'legacy authoring worksheet')
    : undefined
  const outputPath = options.output ? resolve(options.output) : undefined
  const inputPaths = [
    { label: 'legacy migration worksheet', path: worksheetPath },
    ...(authoringPath ? [{ label: 'legacy authoring worksheet', path: authoringPath }] : []),
  ]
  if (outputPath) {
    assertOutputDoesNotAliasSource(outputPath, inputPaths)
    if (existsSync(outputPath) && !options.force) {
      throw new Error(`output already exists: ${outputPath}; pass --force to replace it`)
    }
  }

  const legacyRaw = readFileSync(worksheetPath, 'utf8')
  const worksheetSha256 = createHash('sha256').update(legacyRaw).digest('hex')
  const legacy = parseJson(legacyRaw, 'legacy migration worksheet') as LegacyShowPackMigrationWorksheet

  console.log('[legacy-show-pack-compose] target=local-filesystem')
  console.log(`[legacy-show-pack-compose] mode=${outputPath ? 'write' : 'dry-run'}`)
  console.log(`[legacy-show-pack-compose] worksheet=${worksheetPath} sha256=${worksheetSha256}`)

  if (options.status) {
    const authoringRaw = readFileSync(authoringPath!, 'utf8')
    const authoring = parseJson(authoringRaw, 'legacy authoring worksheet')
    const status = assessLegacyShowPackAuthoringWorksheet(legacy, worksheetSha256, authoring)
    console.log('[legacy-show-pack-compose] stage=status')
    console.log(`[legacy-show-pack-compose] authoring=${authoringPath}`)
    for (const [name, lane] of Object.entries(status.lanes)) {
      console.log(`[legacy-show-pack-compose] lane=${name} filled=${lane.filled}/${lane.total} open=${lane.open_ids.length}`)
      if (lane.open_ids.length > 0) {
        console.log(`[legacy-show-pack-compose] lane=${name} open_ids=${lane.open_ids.join(',')}`)
      }
    }
    for (const issue of status.issues) {
      console.log(`[legacy-show-pack-compose] issue=${issue}`)
    }
    console.log(`[legacy-show-pack-compose] authoring_ready=${status.ready}`)
    console.log('[legacy-show-pack-compose] no file written')
    return
  }

  let bytes: string
  if (!authoringPath) {
    const preparation: LegacyShowPackPreparationOptions = {}
    if (options.targetId !== undefined
      && options.targetVersion !== undefined
      && options.targetTitle !== undefined
      && options.canonCutoff !== undefined) {
      preparation.target = {
        id: options.targetId,
        version: options.targetVersion,
        title: options.targetTitle,
        canon_cutoff: options.canonCutoff,
      }
    }
    if (options.legacyFilmKind) preparation.legacyFilmKind = options.legacyFilmKind
    if (options.candidatePolicy) preparation.candidatePolicy = options.candidatePolicy
    const draft = buildLegacyShowPackAuthoringWorksheet(legacy, worksheetSha256, preparation)
    bytes = serializeLegacyShowPackAuthoringWorksheet(draft)
    console.log('[legacy-show-pack-compose] stage=prepare')
    console.log(`[legacy-show-pack-compose] source_pack=${draft.source.pack_key}`)
    console.log(draft.pack_draft.id && draft.pack_draft.version
      ? `[legacy-show-pack-compose] target_pack=${draft.pack_draft.id}@${draft.pack_draft.version}`
      : '[legacy-show-pack-compose] target_pack=pending-human-approval')
    console.log(`[legacy-show-pack-compose] entity_decisions=${draft.entities.length} prediction_decisions=${draft.predictions.length}`)
    console.log(`[legacy-show-pack-compose] beat_decisions=${draft.signature_beats.length} bingo_decisions=${draft.bingo_squares.length}`)
    if (options.legacyFilmKind) {
      const mapped = draft.entities.filter((entity) => entity.legacy_record.legacy_type === 'film').length
      console.log(`[legacy-show-pack-compose] legacy_film_kind=${options.legacyFilmKind} mapped=${mapped}`)
    }
    if (options.candidatePolicy) {
      const divergences = legacy.authoring_queue.legacy_nomination_candidate_divergences.length
      console.log(`[legacy-show-pack-compose] candidate_policy=${options.candidatePolicy} divergences_resolved=${divergences}`)
    }
    console.log('[legacy-show-pack-compose] authoring_complete=false')
  } else {
    const authoringRaw = readFileSync(authoringPath, 'utf8')
    const authoring = parseJson(authoringRaw, 'legacy authoring worksheet')
    const pack = finalizeLegacyShowPackAuthoringWorksheet(legacy, worksheetSha256, authoring)
    verifyShowPackPortraitAssets(pack)
    bytes = `${JSON.stringify(pack, null, 2)}\n`
    console.log('[legacy-show-pack-compose] stage=authoring')
    console.log(`[legacy-show-pack-compose] authoring=${authoringPath}`)
    console.log(`[legacy-show-pack-compose] pack=${pack.pack.id}@${pack.pack.version}`)
    console.log(`[legacy-show-pack-compose] sources=${pack.sources.length} claims=${pack.claims.length} entities=${pack.entities.length}`)
    console.log(`[legacy-show-pack-compose] predictions=${pack.predictions.length} beats=${pack.signature_beats.length} bingo=${pack.bingo_squares.length}`)
    console.log(`[legacy-show-pack-compose] voices=${pack.commentary_voices.length} commentary=${pack.commentary_requests.length}`)
    console.log('[legacy-show-pack-compose] authoring_valid=true publishable=not-checked')
  }

  const outputSha256 = createHash('sha256').update(bytes).digest('hex')
  console.log(`[legacy-show-pack-compose] bytes=${Buffer.byteLength(bytes)} sha256=${outputSha256}`)
  if (!outputPath) {
    console.log('[legacy-show-pack-compose] no file written')
    return
  }
  writeUtf8FileSafely(outputPath, bytes, options.force)
  console.log(`[legacy-show-pack-compose] wrote=${outputPath}`)
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[legacy-show-pack-compose] ERROR: ${message}`)
  process.exit(1)
}
