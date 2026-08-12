#!/usr/bin/env -S npx tsx

import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import type {
  SettlementDropApprovalDocket,
  SettlementDropApprovalLaneKind,
} from '../src/lib/settlement-drop-approval-docket'
import {
  buildSettlementDropApprovalDecisions,
  type SettlementDropApprovalTranscript,
} from '../src/lib/settlement-drop-approval-workbench'
import { writeUtf8FileSafely } from './lib/safe-write.mts'

const LANES: Array<{ kind: SettlementDropApprovalLaneKind; option: string }> = [
  { kind: 'receipt_prerequisites', option: 'receipt-prerequisites' },
  { kind: 'player_identity', option: 'player-identity' },
  { kind: 'asset_semantics', option: 'asset-semantics' },
  { kind: 'quote_markup', option: 'quote-markup' },
  { kind: 'presentation_structure', option: 'presentation-structure' },
]

function usage(): never {
  console.error('Usage: npx tsx scripts/build-settlement-drop-approval-decisions.mts --docket DOCKET.json --transcript TRANSCRIPT.json --receipt-prerequisites PACKET.json --receipt-prerequisites-decisions DECISIONS.json --player-identity PACKET.json --player-identity-decisions DECISIONS.json --asset-semantics PACKET.json --asset-semantics-decisions DECISIONS.json --quote-markup PACKET.json --quote-markup-decisions DECISIONS.json --presentation-structure PACKET.json --presentation-structure-decisions DECISIONS.json [--output-dir DIRECTORY]')
  process.exit(1)
}

function parse(argv: string[]): Map<string, string> {
  const result = new Map<string, string>()
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--help' || arg === '-h') usage()
    if (!arg.startsWith('--')) throw new Error(`unknown argument ${arg}`)
    const value = argv[++index]
    if (!value || value.startsWith('--')) throw new Error(`${arg} needs a value`)
    result.set(arg.slice(2), value)
  }
  return result
}

function file(raw: string, label: string): string {
  const path = resolve(raw)
  if (!existsSync(path)) throw new Error(`${label} does not exist: ${path}`)
  const real = realpathSync(path)
  if (!statSync(real).isFile()) throw new Error(`${label} must be a file`)
  return real
}

function digest(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function main(): void {
  const options = parse(process.argv.slice(2))
  const docketArg = options.get('docket')
  const transcriptArg = options.get('transcript')
  if (!docketArg || !transcriptArg) usage()
  const docketPath = file(docketArg, 'approval docket')
  const transcriptPath = file(transcriptArg, 'approval transcript')
  const packetPaths = Object.fromEntries(LANES.map(({ kind, option }) => {
    const value = options.get(option)
    if (!value) usage()
    return [kind, file(value, `${kind} packet`)]
  })) as Record<SettlementDropApprovalLaneKind, string>
  const decisionPaths = Object.fromEntries(LANES.map(({ kind, option }) => {
    const value = options.get(`${option}-decisions`)
    if (!value) usage()
    return [kind, file(value, `${kind} decisions`)]
  })) as Record<SettlementDropApprovalLaneKind, string>
  const docketRaw = readFileSync(docketPath, 'utf8')
  const docket = JSON.parse(docketRaw) as SettlementDropApprovalDocket
  const transcriptRaw = readFileSync(transcriptPath, 'utf8')
  const transcript = JSON.parse(transcriptRaw) as SettlementDropApprovalTranscript
  const packetRaw = Object.fromEntries(LANES.map(({ kind }) => [kind, readFileSync(packetPaths[kind], 'utf8')])) as Record<SettlementDropApprovalLaneKind, string>
  const decisionRaw = Object.fromEntries(LANES.map(({ kind }) => [kind, readFileSync(decisionPaths[kind], 'utf8')])) as Record<SettlementDropApprovalLaneKind, string>
  const result = buildSettlementDropApprovalDecisions({
    docket_raw: docketRaw,
    packet_raw: packetRaw,
    decision_raw: decisionRaw,
    asset_data_urls: {},
  }, transcript)
  const laneFiles = Object.fromEntries(LANES.map(({ kind }) => {
    const name = docket.lanes.find((lane) => lane.kind === kind)?.decisions.name
    if (!name || basename(name) !== name || name === '.' || name === '..') {
      throw new Error(`${kind} docket decision filename is invalid`)
    }
    return [kind, name]
  })) as Record<SettlementDropApprovalLaneKind, string>
  const outputNames = Object.values(laneFiles)
  if (new Set(outputNames).size !== outputNames.length) {
    throw new Error('docket decision filenames must be unique')
  }
  if (outputNames.includes('approval-build.json')) {
    throw new Error('docket decision filename approval-build.json is reserved')
  }
  const buildRecord = {
    build_version: 1,
    artifact: 'settlement-drop-approval-build',
    target: docket.target,
    docket_sha256: digest(docketRaw),
    transcript_sha256: digest(transcriptRaw),
    transcript_note: result.note,
    lanes: LANES.map(({ kind }) => ({
      kind,
      packet_sha256: digest(packetRaw[kind]),
      baseline_decisions_sha256: digest(decisionRaw[kind]),
      output_file: laneFiles[kind],
      output_sha256: digest(result.decision_raw[kind]),
      ...result.status[kind],
    })),
  }
  const buildRaw = `${JSON.stringify(buildRecord, null, 2)}\n`
  const outputArg = options.get('output-dir')
  const outputPath = outputArg ? resolve(outputArg) : null
  console.log('[settlement-drop-approval-decisions] target=local-filesystem')
  console.log(`[settlement-drop-approval-decisions] mode=${outputPath ? 'write-new-directory' : 'dry-run'}`)
  console.log(`[settlement-drop-approval-decisions] room=${docket.target.room_code} transcript_sha256=${digest(transcriptRaw)}`)
  for (const { kind } of LANES) {
    const status = result.status[kind]
    console.log(`[settlement-drop-approval-decisions] lane=${kind} required=${status.required_values} open=${status.open_values} status=${status.status} sha256=${digest(result.decision_raw[kind])}`)
  }
  console.log(`[settlement-drop-approval-decisions] build_bytes=${Buffer.byteLength(buildRaw)} build_sha256=${digest(buildRaw)}`)
  if (!outputPath) {
    console.log('[settlement-drop-approval-decisions] valid=true; no file written')
    return
  }
  if (existsSync(outputPath)) throw new Error(`output directory already exists: ${outputPath}`)
  const parent = dirname(outputPath)
  if (!existsSync(parent) || !statSync(parent).isDirectory() || realpathSync(parent) !== parent) {
    throw new Error('output parent must be an existing real directory')
  }
  const temporary = join(parent, `.${basename(outputPath)}.${process.pid}.${randomUUID()}.tmp`)
  try {
    mkdirSync(temporary, { mode: 0o700 })
    for (const { kind } of LANES) {
      writeUtf8FileSafely(join(temporary, laneFiles[kind]), result.decision_raw[kind], false, 0o600)
    }
    writeUtf8FileSafely(join(temporary, 'approval-build.json'), buildRaw, false, 0o600)
    renameSync(temporary, outputPath)
  } catch (error) {
    if (existsSync(temporary)) rmSync(temporary, { recursive: true })
    throw new Error(`could not publish immutable output directory: ${error instanceof Error ? error.message : String(error)}`)
  }
  console.log(`[settlement-drop-approval-decisions] wrote=${outputPath}`)
  console.log('[settlement-drop-approval-decisions] rebuild the approval docket against these outputs; no settlement or canonical source was changed')
}

try { main() } catch (error) {
  console.error(`[settlement-drop-approval-decisions] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
