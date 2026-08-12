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
  applyLegacyPredictionContractDecisions,
  type LegacyPredictionContractDecisionManifest,
} from '../src/lib/legacy-prediction-authoring'
import { assertOutputDoesNotAliasSource, writeUtf8FileSafely } from './lib/safe-write.mts'

interface CliOptions {
  legacy: string
  authoring: string
  decisions: string
  output?: string
  force: boolean
  inPlace: boolean
}

function usage(): never {
  console.error('Usage: npx tsx scripts/apply-legacy-prediction-authoring.mts [--legacy FILE] [--authoring FILE] [--decisions FILE] [--output FILE --force | --in-place]')
  process.exit(1)
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    legacy: 'show-packs/research/hotd-s3-finale-legacy-worksheet.json',
    authoring: 'show-packs/research/hotd-s3-finale-authoring.json',
    decisions: 'show-packs/research/hotd-s3-finale-prediction-decisions.json',
    force: false,
    inPlace: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--legacy') options.legacy = argv[++index] ?? ''
    else if (arg === '--authoring') options.authoring = argv[++index] ?? ''
    else if (arg === '--decisions') options.decisions = argv[++index] ?? ''
    else if (arg === '--output') options.output = argv[++index] ?? ''
    else if (arg === '--force') options.force = true
    else if (arg === '--in-place') options.inPlace = true
    else if (arg === '--help' || arg === '-h') usage()
    else throw new Error(`unknown argument ${arg}`)
  }
  for (const [label, path] of Object.entries({
    legacy: options.legacy,
    authoring: options.authoring,
    decisions: options.decisions,
  })) {
    if (!path) throw new Error(`--${label} needs a path`)
  }
  if (options.output !== undefined && !options.output) throw new Error('--output needs a path')
  if (options.force && !options.output) throw new Error('--force requires --output')
  if (options.inPlace && options.output) throw new Error('--in-place cannot be combined with --output')
  if (options.inPlace && options.force) throw new Error('--in-place cannot be combined with --force')
  return options
}

function existingFile(path: string, label: string): string {
  const resolved = resolve(path)
  if (!existsSync(resolved)) throw new Error(`${label} does not exist: ${resolved}`)
  return resolved
}

function readJson(path: string, label: string): { raw: string; value: unknown } {
  const raw = readFileSync(path, 'utf8')
  try {
    return { raw, value: JSON.parse(raw) }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${label} is not valid JSON: ${message}`)
  }
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function main(): void {
  const options = parseArgs(process.argv.slice(2))
  const legacyPath = existingFile(options.legacy, 'legacy migration worksheet')
  const authoringPath = existingFile(options.authoring, 'legacy authoring worksheet')
  const decisionsPath = existingFile(options.decisions, 'prediction decision manifest')
  const outputPath = options.inPlace
    ? authoringPath
    : options.output ? resolve(options.output) : undefined
  const inputs = [
    { label: 'legacy migration worksheet', path: legacyPath },
    { label: 'legacy authoring worksheet', path: authoringPath },
    { label: 'prediction decision manifest', path: decisionsPath },
  ]
  if (outputPath) {
    assertOutputDoesNotAliasSource(
      outputPath,
      options.inPlace ? inputs.filter((input) => input.path !== authoringPath) : inputs,
    )
    if (!options.inPlace && existsSync(outputPath) && !options.force) {
      throw new Error(`output already exists: ${outputPath}; pass --force to replace it`)
    }
  }

  const legacyInput = readJson(legacyPath, 'legacy migration worksheet')
  const authoringInput = readJson(authoringPath, 'legacy authoring worksheet')
  const manifestInput = readJson(decisionsPath, 'prediction decision manifest')
  const legacySha = sha256(legacyInput.raw)
  const legacy = legacyInput.value as LegacyShowPackMigrationWorksheet
  const authoring = authoringInput.value as LegacyShowPackAuthoringWorksheet
  const manifest = manifestInput.value as LegacyPredictionContractDecisionManifest

  console.log('[legacy-prediction-authoring] target=local-filesystem')
  console.log(`[legacy-prediction-authoring] mode=${options.inPlace ? 'write-in-place' : outputPath ? 'write' : 'dry-run'}`)
  console.log(`[legacy-prediction-authoring] legacy=${legacyPath} sha256=${legacySha}`)
  console.log(`[legacy-prediction-authoring] authoring=${authoringPath}`)
  console.log(`[legacy-prediction-authoring] decisions=${decisionsPath}`)

  const result = applyLegacyPredictionContractDecisions({
    legacy,
    legacyWorksheetSha256: legacySha,
    authoring,
    manifest,
  })
  const status = assessLegacyShowPackAuthoringWorksheet(legacy, legacySha, result.worksheet)
  if (status.issues.length > 0) {
    throw new Error(`authoring status has issues: ${status.issues[0]}`)
  }
  const bytes = serializeLegacyShowPackAuthoringWorksheet(result.worksheet)
  console.log(`[legacy-prediction-authoring] applied=${result.applied_prediction_ids.length}`)
  console.log(`[legacy-prediction-authoring] prediction_contracts=${status.lanes.prediction_contract.filled}/${status.lanes.prediction_contract.total}`)
  console.log(`[legacy-prediction-authoring] authoring_ready=${status.ready}`)
  console.log(`[legacy-prediction-authoring] bytes=${Buffer.byteLength(bytes)} sha256=${sha256(bytes)}`)
  if (!outputPath) {
    console.log('[legacy-prediction-authoring] no file written')
    return
  }
  writeUtf8FileSafely(outputPath, bytes, options.force || options.inPlace)
  console.log(`[legacy-prediction-authoring] wrote=${outputPath}`)
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[legacy-prediction-authoring] ERROR: ${message}`)
  process.exit(1)
}
