#!/usr/bin/env -S npx tsx

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import {
  buildSettlementDropPlayerIdentityPacket,
  serializeSettlementDropPlayerIdentityDecisionTemplate,
  serializeSettlementDropPlayerIdentityPacket,
} from '../src/lib/settlement-drop-player-identity'
import type { SealedTextArtifact } from '../src/lib/settlement-drop-asset-semantics'
import {
  assertOutputDoesNotAliasSource,
  canonicalProspectivePath,
  writeUtf8FileSafely,
} from './lib/safe-write.mts'

interface CliOptions {
  roomCode: string
  ceremony: string
  tiers: string
  personal: string
  board: string
  rooms: string
  players: string
  packet?: string
  decisionTemplate?: string
  force: boolean
}

function usage(): never {
  console.error('Usage: npx tsx scripts/review-settlement-drop-player-identity.mts --room CODE --ceremony FILE.html --tiers tiers.json --personal personal.json --board board.json --rooms rooms.json --players players.json [--packet PACKET.json --decision-template DECISIONS.json] [--force]')
  process.exit(1)
}

function parseArgs(argv: string[]): CliOptions {
  const paths = { ceremony: '', tiers: '', personal: '', board: '', rooms: '', players: '' }
  let roomCode = ''
  let packet: string | undefined
  let decisionTemplate: string | undefined
  let force = false
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--room') roomCode = argv[++index] ?? ''
    else if (arg === '--ceremony') paths.ceremony = argv[++index] ?? ''
    else if (arg === '--tiers') paths.tiers = argv[++index] ?? ''
    else if (arg === '--personal') paths.personal = argv[++index] ?? ''
    else if (arg === '--board') paths.board = argv[++index] ?? ''
    else if (arg === '--rooms') paths.rooms = argv[++index] ?? ''
    else if (arg === '--players') paths.players = argv[++index] ?? ''
    else if (arg === '--packet') packet = argv[++index] ?? ''
    else if (arg === '--decision-template') decisionTemplate = argv[++index] ?? ''
    else if (arg === '--force') force = true
    else if (arg === '--help' || arg === '-h') usage()
    else throw new Error(`unknown argument ${arg}`)
  }
  if (!roomCode || Object.values(paths).some((path) => !path)) usage()
  if (packet !== undefined && !packet) throw new Error('--packet needs a path')
  if (decisionTemplate !== undefined && !decisionTemplate) throw new Error('--decision-template needs a path')
  if (Boolean(packet) !== Boolean(decisionTemplate)) {
    throw new Error('--packet and --decision-template must be supplied together')
  }
  return { roomCode, ...paths, packet, decisionTemplate, force }
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
    seal: {
      name: basename(path),
      bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    },
  }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2))
  const sourcePaths = {
    ceremony: existingFile(resolve(options.ceremony), 'ceremony'),
    tiers: existingFile(resolve(options.tiers), 'tiers'),
    personal: existingFile(resolve(options.personal), 'personal'),
    board: existingFile(resolve(options.board), 'board'),
    rooms: existingFile(resolve(options.rooms), 'rooms snapshot'),
    players: existingFile(resolve(options.players), 'players snapshot'),
  }
  const packetPath = options.packet ? resolve(options.packet) : undefined
  const decisionPath = options.decisionTemplate ? resolve(options.decisionTemplate) : undefined
  if (packetPath && decisionPath
    && canonicalProspectivePath(packetPath) === canonicalProspectivePath(decisionPath)) {
    throw new Error('packet and decision template must use different paths')
  }
  const sources = Object.entries(sourcePaths).map(([label, path]) => ({ label, path }))
  for (const [label, path] of [['packet', packetPath], ['decision template', decisionPath]] as const) {
    if (!path) continue
    assertOutputDoesNotAliasSource(path, sources)
    if (existsSync(path) && !options.force) throw new Error(`${label} already exists: ${path}; pass --force to replace it`)
  }

  const packet = buildSettlementDropPlayerIdentityPacket({
    room_code: options.roomCode,
    ...Object.fromEntries(Object.entries(sourcePaths).map(([key, path]) => [key, sealedArtifact(path)])),
  } as Parameters<typeof buildSettlementDropPlayerIdentityPacket>[0])
  const packetBytes = serializeSettlementDropPlayerIdentityPacket(packet)
  const decisionBytes = serializeSettlementDropPlayerIdentityDecisionTemplate(packet)
  const packetHash = createHash('sha256').update(packetBytes).digest('hex')
  const decisionHash = createHash('sha256').update(decisionBytes).digest('hex')

  console.log('[settlement-drop-player-identity] target=local-filesystem')
  console.log(`[settlement-drop-player-identity] mode=${packetPath ? 'write' : 'dry-run'}`)
  console.log(`[settlement-drop-player-identity] room=${packet.target.room_code} snapshot_room_id=${packet.target.snapshot_room_id}`)
  console.log(`[settlement-drop-player-identity] players=${packet.coverage.snapshot_players} exact_uuid_joins=${packet.coverage.exact_uuid_joins} display_name_variants=${packet.coverage.display_name_variants}`)
  console.log(`[settlement-drop-player-identity] missing=tiers:${packet.coverage.missing_from_tiers.length},personal:${packet.coverage.missing_from_personal.length},board:${packet.coverage.missing_from_board.length}`)
  console.log(`[settlement-drop-player-identity] packet_bytes=${Buffer.byteLength(packetBytes)} sha256=${packetHash}`)
  console.log(`[settlement-drop-player-identity] decision_bytes=${Buffer.byteLength(decisionBytes)} sha256=${decisionHash}`)
  if (!packetPath || !decisionPath) {
    console.log('[settlement-drop-player-identity] valid=true; no file written')
    return
  }
  writeUtf8FileSafely(decisionPath, decisionBytes, options.force)
  writeUtf8FileSafely(packetPath, packetBytes, options.force)
  console.log(`[settlement-drop-player-identity] wrote_decision_template=${decisionPath}`)
  console.log(`[settlement-drop-player-identity] wrote_packet=${packetPath}`)
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[settlement-drop-player-identity] ERROR: ${message}`)
  process.exit(1)
}
