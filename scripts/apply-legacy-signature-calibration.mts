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
  applyLegacySignatureCalibration,
  type LegacySignatureCalibrationManifest,
} from '../src/lib/legacy-signature-calibration'
import { assertOutputDoesNotAliasSource, writeUtf8FileSafely } from './lib/safe-write.mts'

interface CliOptions {
  legacy: string
  authoring: string
  calibration: string
  output?: string
  force: boolean
  inPlace: boolean
}

function usage(): never {
  console.error('Usage: npx tsx scripts/apply-legacy-signature-calibration.mts [--legacy FILE] [--authoring FILE] [--calibration FILE] [--output FILE --force | --in-place]')
  process.exit(1)
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    legacy: 'show-packs/research/hotd-s3-finale-legacy-worksheet.json',
    authoring: 'show-packs/research/hotd-s3-finale-authoring.json',
    calibration: 'show-packs/research/hotd-s3-finale-signature-calibration.json',
    force: false,
    inPlace: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--legacy') options.legacy = argv[++index] ?? ''
    else if (arg === '--authoring') options.authoring = argv[++index] ?? ''
    else if (arg === '--calibration') options.calibration = argv[++index] ?? ''
    else if (arg === '--output') options.output = argv[++index] ?? ''
    else if (arg === '--force') options.force = true
    else if (arg === '--in-place') options.inPlace = true
    else if (arg === '--help' || arg === '-h') usage()
    else throw new Error(`unknown argument ${arg}`)
  }
  for (const [label, path] of Object.entries({
    legacy: options.legacy,
    authoring: options.authoring,
    calibration: options.calibration,
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
  const calibrationPath = existingFile(options.calibration, 'signature calibration manifest')
  const outputPath = options.inPlace
    ? authoringPath
    : options.output ? resolve(options.output) : undefined
  const inputs = [
    { label: 'legacy migration worksheet', path: legacyPath },
    { label: 'legacy authoring worksheet', path: authoringPath },
    { label: 'signature calibration manifest', path: calibrationPath },
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
  const calibrationInput = readJson(calibrationPath, 'signature calibration manifest')
  const legacySha = sha256(legacyInput.raw)
  const legacy = legacyInput.value as LegacyShowPackMigrationWorksheet
  const authoring = authoringInput.value as LegacyShowPackAuthoringWorksheet
  const manifest = calibrationInput.value as LegacySignatureCalibrationManifest

  console.log('[legacy-signature-calibration] target=local-filesystem')
  console.log(`[legacy-signature-calibration] mode=${options.inPlace ? 'write-in-place' : outputPath ? 'write' : 'dry-run'}`)
  console.log(`[legacy-signature-calibration] legacy=${legacyPath} sha256=${legacySha}`)
  console.log(`[legacy-signature-calibration] authoring=${authoringPath}`)
  console.log(`[legacy-signature-calibration] calibration=${calibrationPath}`)

  const result = applyLegacySignatureCalibration({
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
  console.log(`[legacy-signature-calibration] applied=${result.applied_beat_ids.length}`)
  console.log(`[legacy-signature-calibration] probabilities=${status.lanes.signature_beat_probability.filled}/${status.lanes.signature_beat_probability.total}`)
  console.log(`[legacy-signature-calibration] likelihoods=${status.lanes.signature_beat_likelihood.filled}/${status.lanes.signature_beat_likelihood.total}`)
  console.log(`[legacy-signature-calibration] contracts=${status.lanes.signature_beat_contract.filled}/${status.lanes.signature_beat_contract.total}`)
  console.log(`[legacy-signature-calibration] authoring_ready=${status.ready}`)
  console.log(`[legacy-signature-calibration] bytes=${Buffer.byteLength(bytes)} sha256=${sha256(bytes)}`)
  if (!outputPath) {
    console.log('[legacy-signature-calibration] no file written')
    return
  }
  writeUtf8FileSafely(outputPath, bytes, options.force || options.inPlace)
  console.log(`[legacy-signature-calibration] wrote=${outputPath}`)
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[legacy-signature-calibration] ERROR: ${message}`)
  process.exit(1)
}
