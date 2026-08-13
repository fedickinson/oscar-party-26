#!/usr/bin/env -S npx tsx

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import {
  buildSettlementDropQuoteMarkupPacket,
  serializeSettlementDropQuoteMarkupDecisionTemplate,
  serializeSettlementDropQuoteMarkupPacket,
} from '../src/lib/settlement-drop-quote-markup'
import type { SealedTextArtifact } from '../src/lib/settlement-drop-asset-semantics'
import {
  assertOutputDoesNotAliasSource,
  canonicalProspectivePath,
  writeUtf8FileSafely,
} from './lib/safe-write.mts'

interface Options {
  roomCode: string
  takes: string
  packet?: string
  decisionTemplate?: string
  force: boolean
}

function usage(): never {
  console.error('Usage: npx tsx scripts/review-settlement-drop-quote-markup.mts --room CODE --takes takes.json [--packet PACKET.json --decision-template DECISIONS.json] [--force]')
  process.exit(1)
}

function parseArgs(argv: string[]): Options {
  let roomCode = ''
  let takes = ''
  let packet: string | undefined
  let decisionTemplate: string | undefined
  let force = false
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--room') roomCode = argv[++index] ?? ''
    else if (arg === '--takes') takes = argv[++index] ?? ''
    else if (arg === '--packet') packet = argv[++index] ?? ''
    else if (arg === '--decision-template') decisionTemplate = argv[++index] ?? ''
    else if (arg === '--force') force = true
    else if (arg === '--help' || arg === '-h') usage()
    else throw new Error(`unknown argument ${arg}`)
  }
  if (!roomCode || !takes) usage()
  if (packet !== undefined && !packet) throw new Error('--packet needs a path')
  if (decisionTemplate !== undefined && !decisionTemplate) throw new Error('--decision-template needs a path')
  if (Boolean(packet) !== Boolean(decisionTemplate)) {
    throw new Error('--packet and --decision-template must be supplied together')
  }
  return { roomCode, takes, packet, decisionTemplate, force }
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
      name: basename(path), bytes: bytes.byteLength,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    },
  }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2))
  const takesPath = existingFile(resolve(options.takes), 'takes')
  const packetPath = options.packet ? resolve(options.packet) : undefined
  const decisionPath = options.decisionTemplate ? resolve(options.decisionTemplate) : undefined
  if (packetPath && decisionPath
    && canonicalProspectivePath(packetPath) === canonicalProspectivePath(decisionPath)) {
    throw new Error('packet and decision template must use different paths')
  }
  for (const [label, path] of [['packet', packetPath], ['decision template', decisionPath]] as const) {
    if (!path) continue
    assertOutputDoesNotAliasSource(path, [{ label: 'takes', path: takesPath }])
    if (existsSync(path) && !options.force) throw new Error(`${label} already exists: ${path}; pass --force to replace it`)
  }
  const packet = buildSettlementDropQuoteMarkupPacket({
    room_code: options.roomCode,
    takes: sealedArtifact(takesPath),
  })
  const packetBytes = serializeSettlementDropQuoteMarkupPacket(packet)
  const decisionBytes = serializeSettlementDropQuoteMarkupDecisionTemplate(packet)
  console.log('[settlement-drop-quote-markup] target=local-filesystem')
  console.log(`[settlement-drop-quote-markup] mode=${packetPath ? 'write' : 'dry-run'}`)
  console.log(`[settlement-drop-quote-markup] room=${packet.target.room_code}`)
  console.log(`[settlement-drop-quote-markup] quotes=${packet.coverage.quotes} markup_quotes=${packet.coverage.quotes_with_markup} emphasis_spans=${packet.coverage.emphasis_spans}`)
  console.log(`[settlement-drop-quote-markup] packet_bytes=${Buffer.byteLength(packetBytes)} sha256=${createHash('sha256').update(packetBytes).digest('hex')}`)
  console.log(`[settlement-drop-quote-markup] decision_bytes=${Buffer.byteLength(decisionBytes)} sha256=${createHash('sha256').update(decisionBytes).digest('hex')}`)
  if (!packetPath || !decisionPath) {
    console.log('[settlement-drop-quote-markup] valid=true; no file written')
    return
  }
  writeUtf8FileSafely(decisionPath, decisionBytes, options.force)
  writeUtf8FileSafely(packetPath, packetBytes, options.force)
  console.log(`[settlement-drop-quote-markup] wrote_decision_template=${decisionPath}`)
  console.log(`[settlement-drop-quote-markup] wrote_packet=${packetPath}`)
}

try {
  main()
} catch (error) {
  console.error(`[settlement-drop-quote-markup] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
