#!/usr/bin/env -S npx tsx

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import type { SealedTextArtifact } from '../src/lib/settlement-drop-asset-semantics'
import {
  buildSettlementDropReceiptBindingPacket,
  inspectSettlementDropReceiptBindingDecisions,
  serializeSettlementDropReceiptBindingDecisionTemplate,
  serializeSettlementDropReceiptBindingPacket,
} from '../src/lib/settlement-drop-receipt-binding'
import {
  assertOutputDoesNotAliasSource,
  canonicalProspectivePath,
  writeUtf8FileSafely,
} from './lib/safe-write.mts'

interface Options {
  receipt: string
  presentationStructure: string
  presentationDecisions: string
  assetSemantics: string
  beatlines: string
  packet?: string
  decisionTemplate?: string
  bindingDecisions?: string
  force: boolean
}

function usage(): never {
  console.error('Usage: npx tsx scripts/review-settlement-drop-receipt-binding.mts --receipt RECEIPT.json --presentation-structure PACKET.json --presentation-decisions DECISIONS.json --asset-semantics ASSETS.json --beatlines BEATLINES.json [--binding-decisions DECISIONS.json] [--packet PACKET.json --decision-template TEMPLATE.json] [--force]')
  process.exit(1)
}

function parseArgs(argv: string[]): Options {
  let receipt = ''
  let presentationStructure = ''
  let presentationDecisions = ''
  let assetSemantics = ''
  let beatlines = ''
  let packet: string | undefined
  let decisionTemplate: string | undefined
  let bindingDecisions: string | undefined
  let force = false
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--receipt') receipt = argv[++index] ?? ''
    else if (arg === '--presentation-structure') presentationStructure = argv[++index] ?? ''
    else if (arg === '--presentation-decisions') presentationDecisions = argv[++index] ?? ''
    else if (arg === '--asset-semantics') assetSemantics = argv[++index] ?? ''
    else if (arg === '--beatlines') beatlines = argv[++index] ?? ''
    else if (arg === '--packet') packet = argv[++index] ?? ''
    else if (arg === '--decision-template') decisionTemplate = argv[++index] ?? ''
    else if (arg === '--binding-decisions') bindingDecisions = argv[++index] ?? ''
    else if (arg === '--force') force = true
    else if (arg === '--help' || arg === '-h') usage()
    else throw new Error(`unknown argument ${arg}`)
  }
  if (!receipt || !presentationStructure || !presentationDecisions || !assetSemantics || !beatlines) usage()
  if (Boolean(packet) !== Boolean(decisionTemplate)) {
    throw new Error('--packet and --decision-template must be supplied together')
  }
  if (force && !packet) throw new Error('--force requires packet outputs')
  return {
    receipt, presentationStructure, presentationDecisions, assetSemantics, beatlines,
    packet, decisionTemplate, bindingDecisions, force,
  }
}

function existingFile(raw: string, label: string): string {
  const path = resolve(raw)
  if (!existsSync(path)) throw new Error(`${label} does not exist: ${path}`)
  const realPath = realpathSync(path)
  if (!statSync(realPath).isFile()) throw new Error(`${label} must be a file`)
  return realPath
}

function sealed(path: string): SealedTextArtifact {
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
  const paths = {
    receipt: existingFile(options.receipt, 'settlement receipt'),
    presentationPacket: existingFile(options.presentationStructure, 'presentation structure packet'),
    presentationDecisions: existingFile(options.presentationDecisions, 'presentation structure decisions'),
    assetPacket: existingFile(options.assetSemantics, 'asset semantics packet'),
    beatlines: existingFile(options.beatlines, 'beatlines'),
  }
  const packetPath = options.packet ? resolve(options.packet) : undefined
  const decisionPath = options.decisionTemplate ? resolve(options.decisionTemplate) : undefined
  const bindingDecisionPath = options.bindingDecisions
    ? existingFile(options.bindingDecisions, 'receipt binding decisions')
    : undefined
  if (packetPath && decisionPath
    && canonicalProspectivePath(packetPath) === canonicalProspectivePath(decisionPath)) {
    throw new Error('packet and decision template must use different paths')
  }
  const sources = [
    ...Object.entries(paths).map(([label, path]) => ({ label, path })),
    ...(bindingDecisionPath ? [{ label: 'receipt binding decisions', path: bindingDecisionPath }] : []),
  ]
  for (const [label, path] of [['packet', packetPath], ['decision template', decisionPath]] as const) {
    if (!path) continue
    assertOutputDoesNotAliasSource(path, sources)
    if (existsSync(path) && !options.force) {
      throw new Error(`${label} already exists: ${path}; pass --force to replace it`)
    }
  }
  const packet = buildSettlementDropReceiptBindingPacket({
    receipt: sealed(paths.receipt),
    presentationPacket: sealed(paths.presentationPacket),
    presentationDecisions: sealed(paths.presentationDecisions),
    assetPacket: sealed(paths.assetPacket),
    beatlines: sealed(paths.beatlines),
  })
  const packetBytes = serializeSettlementDropReceiptBindingPacket(packet)
  const decisionBytes = serializeSettlementDropReceiptBindingDecisionTemplate(packet)
  console.log('[settlement-drop-receipt-binding] target=local-filesystem')
  console.log(`[settlement-drop-receipt-binding] mode=${packetPath ? 'write' : 'dry-run'}`)
  console.log(`[settlement-drop-receipt-binding] room=${packet.target.room_code} settlement=${packet.target.settlement_id}@${packet.target.settlement_version}`)
  console.log(`[settlement-drop-receipt-binding] beats=${packet.coverage.included_beats} score_events=${packet.coverage.score_events} unscored_facts=${packet.coverage.unscored_facts}`)
  console.log(`[settlement-drop-receipt-binding] legacy_lines=${packet.coverage.legacy_lines} candidate_bound=${packet.coverage.legacy_lines_with_candidate_beat}`)
  console.log(`[settlement-drop-receipt-binding] packet_bytes=${Buffer.byteLength(packetBytes)} sha256=${createHash('sha256').update(packetBytes).digest('hex')}`)
  console.log(`[settlement-drop-receipt-binding] decision_bytes=${Buffer.byteLength(decisionBytes)} sha256=${createHash('sha256').update(decisionBytes).digest('hex')}`)
  if (bindingDecisionPath) {
    const decisions = JSON.parse(readFileSync(bindingDecisionPath, 'utf8')) as unknown
    const status = inspectSettlementDropReceiptBindingDecisions(packet, decisions)
    console.log(`[settlement-drop-receipt-binding] binding_status=${status.status} required=${status.required_values} open=${status.open_values}`)
    if (status.open_items.length > 0) {
      console.log(`[settlement-drop-receipt-binding] open_items=${status.open_items.join(',')}`)
    }
  }
  if (!packetPath || !decisionPath) {
    console.log('[settlement-drop-receipt-binding] valid=true; no file written')
    return
  }
  writeUtf8FileSafely(decisionPath, decisionBytes, options.force)
  writeUtf8FileSafely(packetPath, packetBytes, options.force)
  console.log(`[settlement-drop-receipt-binding] wrote_decision_template=${decisionPath}`)
  console.log(`[settlement-drop-receipt-binding] wrote_packet=${packetPath}`)
}

try {
  main()
} catch (error) {
  console.error(`[settlement-drop-receipt-binding] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
