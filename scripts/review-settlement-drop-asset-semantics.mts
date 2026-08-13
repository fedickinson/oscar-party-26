#!/usr/bin/env -S npx tsx

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import {
  buildSettlementDropAssetSemanticsPacket,
  serializeSettlementDropAssetSemanticsDecisionTemplate,
  serializeSettlementDropAssetSemanticsPacket,
  type SealedTextArtifact,
} from '../src/lib/settlement-drop-asset-semantics'
import {
  assertOutputDoesNotAliasSource,
  canonicalProspectivePath,
  writeUtf8FileSafely,
} from './lib/safe-write.mts'

interface CliOptions {
  roomCode: string
  ceremony: string
  assets: string
  extraction: string
  packet?: string
  decisionTemplate?: string
  force: boolean
}

function usage(): never {
  console.error('Usage: npx tsx scripts/review-settlement-drop-asset-semantics.mts --room CODE --ceremony FILE.html --assets assets.json --extraction asset-extraction.json [--packet PACKET.json --decision-template DECISIONS.json] [--force]')
  process.exit(1)
}

function parseArgs(argv: string[]): CliOptions {
  let roomCode = ''
  let ceremony = ''
  let assets = ''
  let extraction = ''
  let packet: string | undefined
  let decisionTemplate: string | undefined
  let force = false
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--room') roomCode = argv[++index] ?? ''
    else if (arg === '--ceremony') ceremony = argv[++index] ?? ''
    else if (arg === '--assets') assets = argv[++index] ?? ''
    else if (arg === '--extraction') extraction = argv[++index] ?? ''
    else if (arg === '--packet') packet = argv[++index] ?? ''
    else if (arg === '--decision-template') decisionTemplate = argv[++index] ?? ''
    else if (arg === '--force') force = true
    else if (arg === '--help' || arg === '-h') usage()
    else throw new Error(`unknown argument ${arg}`)
  }
  if (!roomCode || !ceremony || !assets || !extraction) usage()
  if (packet !== undefined && !packet) throw new Error('--packet needs a path')
  if (decisionTemplate !== undefined && !decisionTemplate) throw new Error('--decision-template needs a path')
  if (Boolean(packet) !== Boolean(decisionTemplate)) {
    throw new Error('--packet and --decision-template must be supplied together')
  }
  return { roomCode, ceremony, assets, extraction, packet, decisionTemplate, force }
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
  const ceremonyPath = existingFile(resolve(options.ceremony), 'ceremony')
  const assetsPath = existingFile(resolve(options.assets), 'legacy assets')
  const extractionPath = existingFile(resolve(options.extraction), 'asset extraction')
  const packetPath = options.packet ? resolve(options.packet) : undefined
  const decisionPath = options.decisionTemplate ? resolve(options.decisionTemplate) : undefined
  if (packetPath && decisionPath
    && canonicalProspectivePath(packetPath) === canonicalProspectivePath(decisionPath)) {
    throw new Error('packet and decision template must use different paths')
  }
  const sources = [
    { label: 'ceremony', path: ceremonyPath },
    { label: 'legacy assets', path: assetsPath },
    { label: 'asset extraction', path: extractionPath },
  ]
  for (const [label, path] of [['packet', packetPath], ['decision template', decisionPath]] as const) {
    if (!path) continue
    assertOutputDoesNotAliasSource(path, sources)
    if (existsSync(path) && !options.force) throw new Error(`${label} already exists: ${path}; pass --force to replace it`)
  }

  const packet = buildSettlementDropAssetSemanticsPacket({
    room_code: options.roomCode,
    ceremony: sealedArtifact(ceremonyPath),
    legacy_assets: sealedArtifact(assetsPath),
    extraction: sealedArtifact(extractionPath),
  })
  const packetBytes = serializeSettlementDropAssetSemanticsPacket(packet)
  const decisionBytes = serializeSettlementDropAssetSemanticsDecisionTemplate(packet)
  const packetHash = createHash('sha256').update(packetBytes).digest('hex')
  const decisionHash = createHash('sha256').update(decisionBytes).digest('hex')

  console.log('[settlement-drop-asset-semantics] target=local-filesystem')
  console.log(`[settlement-drop-asset-semantics] mode=${packetPath ? 'write' : 'dry-run'}`)
  console.log(`[settlement-drop-asset-semantics] room=${packet.target.room_code}`)
  console.log(`[settlement-drop-asset-semantics] assets=${packet.coverage.assets} occurrences=${packet.coverage.exact_ceremony_occurrences} image_uses=${packet.coverage.html_image_uses}`)
  console.log(`[settlement-drop-asset-semantics] assignments=characters:${packet.coverage.character_assignments},pundits:${packet.coverage.pundit_assignments},player_sigils:${packet.coverage.player_sigil_assignments}`)
  console.log(`[settlement-drop-asset-semantics] unassigned_assets=${packet.coverage.assets_without_structured_assignment}`)
  console.log(`[settlement-drop-asset-semantics] packet_bytes=${Buffer.byteLength(packetBytes)} sha256=${packetHash}`)
  console.log(`[settlement-drop-asset-semantics] decision_bytes=${Buffer.byteLength(decisionBytes)} sha256=${decisionHash}`)
  if (!packetPath || !decisionPath) {
    console.log('[settlement-drop-asset-semantics] valid=true; no file written')
    return
  }

  writeUtf8FileSafely(decisionPath, decisionBytes, options.force)
  writeUtf8FileSafely(packetPath, packetBytes, options.force)
  console.log(`[settlement-drop-asset-semantics] wrote_decision_template=${decisionPath}`)
  console.log(`[settlement-drop-asset-semantics] wrote_packet=${packetPath}`)
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[settlement-drop-asset-semantics] ERROR: ${message}`)
  process.exit(1)
}
