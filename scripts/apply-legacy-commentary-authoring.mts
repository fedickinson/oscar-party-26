#!/usr/bin/env -S npx tsx

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { LegacyShowPackMigrationWorksheet } from '../src/lib/legacy-show-pack-audit'
import {
  assessLegacyShowPackAuthoringWorksheet,
  serializeLegacyShowPackAuthoringWorksheet,
  type LegacyShowPackAuthoringWorksheet,
} from '../src/lib/legacy-show-pack-authoring'
import {
  applyLegacyCommentaryDecisions,
  type LegacyCommentaryDecisionManifest,
} from '../src/lib/legacy-commentary-authoring'
import { assertOutputDoesNotAliasSource, writeUtf8FileSafely } from './lib/safe-write.mts'

interface Options {
  legacy: string
  authoring: string
  decisions: string
  inPlace: boolean
}

function parse(argv: string[]): Options {
  const options: Options = {
    legacy: 'show-packs/research/hotd-s3-finale-legacy-worksheet.json',
    authoring: 'show-packs/research/hotd-s3-finale-authoring.json',
    decisions: 'show-packs/research/hotd-s3-finale-commentary-decisions.json',
    inPlace: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--legacy') options.legacy = argv[++index] ?? ''
    else if (arg === '--authoring') options.authoring = argv[++index] ?? ''
    else if (arg === '--decisions') options.decisions = argv[++index] ?? ''
    else if (arg === '--in-place') options.inPlace = true
    else throw new Error(`unknown argument ${arg}`)
  }
  return options
}

function file(path: string, label: string): string {
  const resolved = resolve(path)
  if (!path || !existsSync(resolved)) throw new Error(`${label} does not exist: ${resolved}`)
  return resolved
}

function read(path: string, label: string): { raw: string; value: unknown } {
  const raw = readFileSync(path, 'utf8')
  try { return { raw, value: JSON.parse(raw) } } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function sha(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function main(): void {
  const options = parse(process.argv.slice(2))
  const legacyPath = file(options.legacy, 'legacy worksheet')
  const authoringPath = file(options.authoring, 'authoring worksheet')
  const decisionsPath = file(options.decisions, 'commentary decisions')
  if (options.inPlace) {
    assertOutputDoesNotAliasSource(authoringPath, [
      { label: 'legacy worksheet', path: legacyPath },
      { label: 'commentary decisions', path: decisionsPath },
    ])
  }
  const legacyInput = read(legacyPath, 'legacy worksheet')
  const authoringInput = read(authoringPath, 'authoring worksheet')
  const decisionsInput = read(decisionsPath, 'commentary decisions')
  const legacySha = sha(legacyInput.raw)
  const result = applyLegacyCommentaryDecisions({
    authoring: authoringInput.value as LegacyShowPackAuthoringWorksheet,
    manifest: decisionsInput.value as LegacyCommentaryDecisionManifest,
  })
  const status = assessLegacyShowPackAuthoringWorksheet(
    legacyInput.value as LegacyShowPackMigrationWorksheet,
    legacySha,
    result.worksheet,
  )
  if (status.issues.length > 0) throw new Error(`authoring status has issues: ${status.issues[0]}`)
  const bytes = serializeLegacyShowPackAuthoringWorksheet(result.worksheet)
  console.log('[legacy-commentary-authoring] target=local-filesystem')
  console.log(`[legacy-commentary-authoring] mode=${options.inPlace ? 'write-in-place' : 'dry-run'}`)
  console.log(`[legacy-commentary-authoring] voices=${result.applied_voice_ids.length}`)
  console.log(`[legacy-commentary-authoring] requests=${result.applied_request_ids.length}`)
  console.log(`[legacy-commentary-authoring] global_review=${status.lanes.global_review.filled}/${status.lanes.global_review.total}`)
  console.log(`[legacy-commentary-authoring] authoring_ready=${status.ready}`)
  console.log(`[legacy-commentary-authoring] bytes=${Buffer.byteLength(bytes)} sha256=${sha(bytes)}`)
  if (!options.inPlace) {
    console.log('[legacy-commentary-authoring] no file written')
    return
  }
  writeUtf8FileSafely(authoringPath, bytes, true)
  console.log(`[legacy-commentary-authoring] wrote=${authoringPath}`)
}

try { main() } catch (error) {
  console.error(`[legacy-commentary-authoring] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
