#!/usr/bin/env -S npx tsx

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import {
  buildSettlementDropReceiptPrerequisitesPacket,
  RECEIPT_PREREQUISITE_TABLES,
  serializeSettlementDropReceiptPrerequisitesDecisionTemplate,
  serializeSettlementDropReceiptPrerequisitesPacket,
} from '../src/lib/settlement-drop-receipt-prerequisites'
import type { SealedTextArtifact } from '../src/lib/settlement-drop-asset-semantics'
import {
  assertOutputDoesNotAliasSource,
  canonicalProspectivePath,
  writeUtf8FileSafely,
} from './lib/safe-write.mts'

interface Options {
  roomCode: string
  snapshotDirectory: string
  packet?: string
  decisionTemplate?: string
  force: boolean
}

function usage(): never {
  console.error('Usage: npx tsx scripts/review-settlement-drop-receipt-prerequisites.mts --room CODE --snapshot-dir DIR [--packet PACKET.json --decision-template DECISIONS.json] [--force]')
  process.exit(1)
}

function parseArgs(argv: string[]): Options {
  let roomCode = ''
  let snapshotDirectory = ''
  let packet: string | undefined
  let decisionTemplate: string | undefined
  let force = false
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--room') roomCode = argv[++index] ?? ''
    else if (arg === '--snapshot-dir') snapshotDirectory = argv[++index] ?? ''
    else if (arg === '--packet') packet = argv[++index] ?? ''
    else if (arg === '--decision-template') decisionTemplate = argv[++index] ?? ''
    else if (arg === '--force') force = true
    else if (arg === '--help' || arg === '-h') usage()
    else throw new Error(`unknown argument ${arg}`)
  }
  if (!roomCode || !snapshotDirectory) usage()
  if (packet !== undefined && !packet) throw new Error('--packet needs a path')
  if (decisionTemplate !== undefined && !decisionTemplate) throw new Error('--decision-template needs a path')
  if (Boolean(packet) !== Boolean(decisionTemplate)) {
    throw new Error('--packet and --decision-template must be supplied together')
  }
  return { roomCode, snapshotDirectory, packet, decisionTemplate, force }
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
  const options = parseArgs(process.argv.slice(2))
  const snapshotDirectory = realpathSync(resolve(options.snapshotDirectory))
  if (!statSync(snapshotDirectory).isDirectory()) throw new Error('snapshot directory must be a directory')
  const paths = Object.fromEntries(RECEIPT_PREREQUISITE_TABLES.map((table) => [
    table, existingFile(resolve(snapshotDirectory, `${table}.json`), `snapshot table ${table}`),
  ])) as Record<typeof RECEIPT_PREREQUISITE_TABLES[number], string>
  const packetPath = options.packet ? resolve(options.packet) : undefined
  const decisionPath = options.decisionTemplate ? resolve(options.decisionTemplate) : undefined
  if (packetPath && decisionPath
    && canonicalProspectivePath(packetPath) === canonicalProspectivePath(decisionPath)) {
    throw new Error('packet and decision template must use different paths')
  }
  const sources = Object.entries(paths).map(([label, path]) => ({ label, path }))
  for (const [label, path] of [['packet', packetPath], ['decision template', decisionPath]] as const) {
    if (!path) continue
    assertOutputDoesNotAliasSource(path, sources)
    if (existsSync(path) && !options.force) throw new Error(`${label} already exists: ${path}; pass --force to replace it`)
  }
  const packet = buildSettlementDropReceiptPrerequisitesPacket({
    room_code: options.roomCode,
    tables: Object.fromEntries(Object.entries(paths).map(([table, path]) => [table, sealedArtifact(path)])) as Parameters<typeof buildSettlementDropReceiptPrerequisitesPacket>[0]['tables'],
  })
  const packetBytes = serializeSettlementDropReceiptPrerequisitesPacket(packet)
  const decisionBytes = serializeSettlementDropReceiptPrerequisitesDecisionTemplate(packet)
  console.log('[settlement-drop-receipt-prerequisites] target=local-filesystem')
  console.log(`[settlement-drop-receipt-prerequisites] mode=${packetPath ? 'write' : 'dry-run'}`)
  console.log(`[settlement-drop-receipt-prerequisites] room=${packet.target.room_code} phase=${packet.canonical_state.snapshot_phase}`)
  console.log(`[settlement-drop-receipt-prerequisites] canonical_receipt_recoverable=${packet.canonical_state.canonical_receipt_recoverable}`)
  console.log(`[settlement-drop-receipt-prerequisites] candidates=${packet.coverage.candidate_entries} players=${packet.coverage.players} draft_picks=${packet.coverage.draft_picks} bingo_marks=${packet.coverage.bingo_marks}`)
  console.log(`[settlement-drop-receipt-prerequisites] schema_gaps=${packet.schema_gaps.join(',') || 'none'}`)
  console.log(`[settlement-drop-receipt-prerequisites] packet_bytes=${Buffer.byteLength(packetBytes)} sha256=${createHash('sha256').update(packetBytes).digest('hex')}`)
  console.log(`[settlement-drop-receipt-prerequisites] decision_bytes=${Buffer.byteLength(decisionBytes)} sha256=${createHash('sha256').update(decisionBytes).digest('hex')}`)
  if (!packetPath || !decisionPath) {
    console.log('[settlement-drop-receipt-prerequisites] valid=true; no file written')
    return
  }
  writeUtf8FileSafely(decisionPath, decisionBytes, options.force)
  writeUtf8FileSafely(packetPath, packetBytes, options.force)
  console.log(`[settlement-drop-receipt-prerequisites] wrote_decision_template=${decisionPath}`)
  console.log(`[settlement-drop-receipt-prerequisites] wrote_packet=${packetPath}`)
}

try {
  main()
} catch (error) {
  console.error(`[settlement-drop-receipt-prerequisites] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
