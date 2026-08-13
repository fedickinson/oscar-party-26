#!/usr/bin/env -S npx tsx

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildSettlementDropFinalAuthoringPacket,
  inspectSettlementDropFinalAuthoringDecisions,
  serializeSettlementDropFinalAuthoringDecisionTemplate,
  serializeSettlementDropFinalAuthoringPacket,
} from '../src/lib/settlement-drop-final-composer'
import { sha256Hex } from '../src/lib/sha256'
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
  assetDecisions: string
  playerIdentity: string
  playerIdentityDecisions: string
  packet?: string
  decisionTemplate?: string
  decisions?: string
  force: boolean
}

function usage(): never {
  console.error('Usage: npx tsx scripts/review-settlement-drop-final-authoring.mts --receipt RECEIPT.json --presentation-structure PACKET.json --presentation-decisions DECISIONS.json --asset-semantics PACKET.json --asset-decisions DECISIONS.json --player-identity PACKET.json --player-identity-decisions DECISIONS.json [--decisions FINAL-DECISIONS.json] [--packet PACKET.json --decision-template TEMPLATE.json] [--force]')
  process.exit(1)
}

function parseArgs(argv: string[]): Options {
  const values = new Map<string, string>()
  let force = false
  const valued = new Set([
    '--receipt', '--presentation-structure', '--presentation-decisions', '--asset-semantics',
    '--asset-decisions', '--player-identity', '--player-identity-decisions', '--packet',
    '--decision-template', '--decisions',
  ])
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--force') force = true
    else if (arg === '--help' || arg === '-h') usage()
    else if (valued.has(arg)) {
      const value = argv[++index]
      if (!value || value.startsWith('--')) throw new Error(`${arg} needs a path`)
      values.set(arg, value)
    } else throw new Error(`unknown argument ${arg}`)
  }
  const required = (name: string): string => values.get(name) ?? usage()
  const packet = values.get('--packet')
  const decisionTemplate = values.get('--decision-template')
  if (Boolean(packet) !== Boolean(decisionTemplate)) {
    throw new Error('--packet and --decision-template must be supplied together')
  }
  if (force && !packet) throw new Error('--force requires packet outputs')
  return {
    receipt: required('--receipt'),
    presentationStructure: required('--presentation-structure'),
    presentationDecisions: required('--presentation-decisions'),
    assetSemantics: required('--asset-semantics'),
    assetDecisions: required('--asset-decisions'),
    playerIdentity: required('--player-identity'),
    playerIdentityDecisions: required('--player-identity-decisions'),
    packet,
    decisionTemplate,
    decisions: values.get('--decisions'),
    force,
  }
}

function existingFile(raw: string, label: string): string {
  const path = resolve(raw)
  if (!existsSync(path)) throw new Error(`${label} does not exist: ${path}`)
  const real = realpathSync(path)
  if (!statSync(real).isFile()) throw new Error(`${label} must be a file`)
  return real
}

function main(): void {
  const options = parseArgs(process.argv.slice(2))
  const sources = {
    receipt: existingFile(options.receipt, 'settlement receipt'),
    presentationStructure: existingFile(options.presentationStructure, 'presentation structure packet'),
    presentationDecisions: existingFile(options.presentationDecisions, 'presentation structure decisions'),
    assetSemantics: existingFile(options.assetSemantics, 'asset semantics packet'),
    assetDecisions: existingFile(options.assetDecisions, 'asset semantics decisions'),
    playerIdentity: existingFile(options.playerIdentity, 'player identity packet'),
    playerIdentityDecisions: existingFile(options.playerIdentityDecisions, 'player identity decisions'),
  }
  const decisionsPath = options.decisions
    ? existingFile(options.decisions, 'final authoring decisions')
    : undefined
  const packetPath = options.packet ? resolve(options.packet) : undefined
  const templatePath = options.decisionTemplate ? resolve(options.decisionTemplate) : undefined
  if (packetPath && templatePath
    && canonicalProspectivePath(packetPath) === canonicalProspectivePath(templatePath)) {
    throw new Error('packet and decision template must use different paths')
  }
  const protectedSources = [
    ...Object.entries(sources).map(([label, path]) => ({ label, path })),
    ...(decisionsPath ? [{ label: 'final authoring decisions', path: decisionsPath }] : []),
  ]
  for (const [label, path] of [['packet', packetPath], ['decision template', templatePath]] as const) {
    if (!path) continue
    assertOutputDoesNotAliasSource(path, protectedSources)
    if (existsSync(path) && !options.force) {
      throw new Error(`${label} already exists: ${path}; pass --force to replace it`)
    }
  }
  const read = (path: string): string => readFileSync(path, 'utf8')
  const packet = buildSettlementDropFinalAuthoringPacket({
    receiptRaw: read(sources.receipt),
    presentationPacketRaw: read(sources.presentationStructure),
    presentationDecisionsRaw: read(sources.presentationDecisions),
    assetPacketRaw: read(sources.assetSemantics),
    assetDecisionsRaw: read(sources.assetDecisions),
    playerIdentityPacketRaw: read(sources.playerIdentity),
    playerIdentityDecisionsRaw: read(sources.playerIdentityDecisions),
  })
  const packetRaw = serializeSettlementDropFinalAuthoringPacket(packet)
  const templateRaw = serializeSettlementDropFinalAuthoringDecisionTemplate(packet)
  console.log('[settlement-drop-final-authoring] target=local-filesystem')
  console.log(`[settlement-drop-final-authoring] mode=${packetPath ? 'write' : 'dry-run'}`)
  console.log(`[settlement-drop-final-authoring] room=${packet.target.room_code} settlement=${packet.target.settlement_id}@${packet.target.settlement_version}`)
  console.log(`[settlement-drop-final-authoring] players=${packet.players.length} characters=${packet.characters.length}`)
  console.log(`[settlement-drop-final-authoring] packet_bytes=${Buffer.byteLength(packetRaw)} sha256=${sha256Hex(packetRaw)}`)
  if (decisionsPath) {
    const status = inspectSettlementDropFinalAuthoringDecisions(packet, JSON.parse(read(decisionsPath)))
    console.log(`[settlement-drop-final-authoring] decision_status=${status.status} required=${status.required_values} open=${status.open_values}`)
    if (status.open_items.length) console.log(`[settlement-drop-final-authoring] open_items=${status.open_items.join(',')}`)
  }
  if (!packetPath || !templatePath) {
    console.log('[settlement-drop-final-authoring] valid=true; no file written')
    return
  }
  writeUtf8FileSafely(templatePath, templateRaw, options.force)
  writeUtf8FileSafely(packetPath, packetRaw, options.force)
  console.log(`[settlement-drop-final-authoring] wrote_decision_template=${templatePath}`)
  console.log(`[settlement-drop-final-authoring] wrote_packet=${packetPath}`)
}

try {
  main()
} catch (error) {
  console.error(`[settlement-drop-final-authoring] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
