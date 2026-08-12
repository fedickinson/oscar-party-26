#!/usr/bin/env -S npx tsx

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import {
  buildSettlementDropApprovalDocket,
  serializeSettlementDropApprovalDocket,
  type SettlementDropApprovalLaneKind,
} from '../src/lib/settlement-drop-approval-docket'
import type { SealedTextArtifact } from '../src/lib/settlement-drop-asset-semantics'
import { assertOutputDoesNotAliasSource, writeUtf8FileSafely } from './lib/safe-write.mts'

const LANE_ARGS: Array<{ kind: SettlementDropApprovalLaneKind; option: string }> = [
  { kind: 'receipt_prerequisites', option: 'receipt-prerequisites' },
  { kind: 'player_identity', option: 'player-identity' },
  { kind: 'asset_semantics', option: 'asset-semantics' },
  { kind: 'quote_markup', option: 'quote-markup' },
  { kind: 'presentation_structure', option: 'presentation-structure' },
]

function usage(): never {
  console.error('Usage: npx tsx scripts/build-settlement-drop-approval-docket.mts --room CODE --audit AUDIT.json --receipt-prerequisites PACKET.json --receipt-prerequisites-decisions DECISIONS.json --player-identity PACKET.json --player-identity-decisions DECISIONS.json --asset-semantics PACKET.json --asset-semantics-decisions DECISIONS.json --quote-markup PACKET.json --quote-markup-decisions DECISIONS.json --presentation-structure PACKET.json --presentation-structure-decisions DECISIONS.json [--output DOCKET.json] [--force]')
  process.exit(1)
}

function args(argv: string[]): Map<string, string | true> {
  const result = new Map<string, string | true>()
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--force') result.set('force', true)
    else if (arg === '--help' || arg === '-h') usage()
    else if (arg.startsWith('--')) {
      const value = argv[++index]
      if (!value || value.startsWith('--')) throw new Error(`${arg} needs a value`)
      result.set(arg.slice(2), value)
    } else throw new Error(`unknown argument ${arg}`)
  }
  return result
}

function existingFile(path: string, label: string): string {
  if (!existsSync(path)) throw new Error(`${label} does not exist: ${path}`)
  const realPath = realpathSync(path)
  if (!statSync(realPath).isFile()) throw new Error(`${label} must be a file`)
  return realPath
}

function sealedArtifact(path: string): SealedTextArtifact {
  const bytes = readFileSync(path)
  return {
    raw: bytes.toString('utf8'),
    seal: { name: basename(path), bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') },
  }
}

function main(): void {
  const options = args(process.argv.slice(2))
  const roomCode = options.get('room')
  const auditOption = options.get('audit')
  if (typeof roomCode !== 'string' || typeof auditOption !== 'string') usage()
  const auditPath = existingFile(resolve(auditOption), 'audit')
  const lanes = LANE_ARGS.map(({ kind, option }) => {
    const packet = options.get(option)
    const decisions = options.get(`${option}-decisions`)
    if (typeof packet !== 'string' || typeof decisions !== 'string') usage()
    return {
      kind,
      packetPath: existingFile(resolve(packet), `${kind} packet`),
      decisionPath: existingFile(resolve(decisions), `${kind} decisions`),
    }
  })
  const outputOption = options.get('output')
  const outputPath = typeof outputOption === 'string' ? resolve(outputOption) : undefined
  const force = options.get('force') === true
  const sources = [
    { label: 'migration audit', path: auditPath },
    ...lanes.flatMap((lane) => [
      { label: `${lane.kind} packet`, path: lane.packetPath },
      { label: `${lane.kind} decisions`, path: lane.decisionPath },
    ]),
  ]
  if (outputPath) {
    assertOutputDoesNotAliasSource(outputPath, sources)
    if (existsSync(outputPath) && !force) throw new Error(`output already exists: ${outputPath}; pass --force to replace it`)
  }
  const docket = buildSettlementDropApprovalDocket({
    room_code: roomCode,
    audit: sealedArtifact(auditPath),
    lanes: lanes.map((lane) => ({
      kind: lane.kind,
      packet: sealedArtifact(lane.packetPath),
      decisions: sealedArtifact(lane.decisionPath),
    })),
  })
  const bytes = serializeSettlementDropApprovalDocket(docket)
  console.log('[settlement-drop-approval-docket] target=local-filesystem')
  console.log(`[settlement-drop-approval-docket] mode=${outputPath ? 'write' : 'dry-run'}`)
  console.log(`[settlement-drop-approval-docket] room=${docket.target.room_code} blockers=${docket.blockers.length}`)
  for (const lane of docket.lanes) {
    console.log(`[settlement-drop-approval-docket] lane=${lane.kind} units=${lane.decision_units} required=${lane.required_values} open=${lane.open_values} status=${lane.decision_status} blocker=${lane.blocker_present}`)
  }
  console.log(`[settlement-drop-approval-docket] bytes=${Buffer.byteLength(bytes)} sha256=${createHash('sha256').update(bytes).digest('hex')}`)
  if (!outputPath) {
    console.log('[settlement-drop-approval-docket] valid=true; no file written')
    return
  }
  writeUtf8FileSafely(outputPath, bytes, force)
  console.log(`[settlement-drop-approval-docket] wrote=${outputPath}`)
}

try {
  main()
} catch (error) {
  console.error(`[settlement-drop-approval-docket] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
