#!/usr/bin/env -S npx tsx

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildShowPackResearchIntakePacket,
  inspectShowPackResearchIntakeDecisions,
  serializeShowPackResearchIntakeDecisionTemplate,
  serializeShowPackResearchIntakePacket,
} from '../src/lib/show-pack-research-intake'
import { sha256Hex } from '../src/lib/sha256'
import {
  assertOutputDoesNotAliasSource,
  canonicalProspectivePath,
  writeUtf8FileSafely,
} from './lib/safe-write.mts'

interface Options {
  seed: string
  candidates: string
  packet?: string
  decisionTemplate?: string
  decisions?: string
  force: boolean
}

function usage(): never {
  console.error('Usage: npx tsx scripts/review-show-pack-research.mts --seed SEED.json --candidates CANDIDATES.json [--decisions DECISIONS.json] [--packet PACKET.json --decision-template TEMPLATE.json] [--force]')
  process.exit(1)
}

function parseArgs(argv: string[]): Options {
  const values = new Map<string, string>()
  let force = false
  const valued = new Set(['--seed', '--candidates', '--packet', '--decision-template', '--decisions'])
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
  const seed = values.get('--seed')
  const candidates = values.get('--candidates')
  if (!seed || !candidates) usage()
  const packet = values.get('--packet')
  const decisionTemplate = values.get('--decision-template')
  if (Boolean(packet) !== Boolean(decisionTemplate)) {
    throw new Error('--packet and --decision-template must be supplied together')
  }
  if (force && !packet) throw new Error('--force requires packet outputs')
  return { seed, candidates, packet, decisionTemplate, decisions: values.get('--decisions'), force }
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
  const seedPath = existingFile(options.seed, 'flywheel seed')
  const candidatesPath = existingFile(options.candidates, 'research candidates')
  const decisionsPath = options.decisions
    ? existingFile(options.decisions, 'research intake decisions')
    : undefined
  const packetPath = options.packet ? resolve(options.packet) : undefined
  const templatePath = options.decisionTemplate ? resolve(options.decisionTemplate) : undefined
  if (packetPath && templatePath
    && canonicalProspectivePath(packetPath) === canonicalProspectivePath(templatePath)) {
    throw new Error('packet and decision template must use different paths')
  }
  const sources = [
    { label: 'flywheel seed', path: seedPath },
    { label: 'research candidates', path: candidatesPath },
    ...(decisionsPath ? [{ label: 'research intake decisions', path: decisionsPath }] : []),
  ]
  for (const [label, path] of [['packet', packetPath], ['decision template', templatePath]] as const) {
    if (!path) continue
    assertOutputDoesNotAliasSource(path, sources)
    if (existsSync(path) && !options.force) {
      throw new Error(`${label} already exists: ${path}; pass --force to replace it`)
    }
  }
  const packet = buildShowPackResearchIntakePacket(
    readFileSync(seedPath, 'utf8'),
    readFileSync(candidatesPath, 'utf8'),
  )
  const packetRaw = serializeShowPackResearchIntakePacket(packet)
  const templateRaw = serializeShowPackResearchIntakeDecisionTemplate(packet)
  console.log('[show-pack-research-review] target=local-filesystem')
  console.log(`[show-pack-research-review] mode=${packetPath ? 'write' : 'dry-run'}`)
  console.log(`[show-pack-research-review] predecessor=${packet.target.pack_id} settlement=${packet.target.settlement_id}@${packet.target.settlement_version}`)
  console.log(`[show-pack-research-review] sources=${packet.sources.length} claims=${packet.claims.length} canonical_screen_claims=${packet.canonical_screen_claims.length}`)
  console.log(`[show-pack-research-review] packet_bytes=${Buffer.byteLength(packetRaw)} sha256=${sha256Hex(packetRaw)}`)
  if (decisionsPath) {
    const decisions = JSON.parse(readFileSync(decisionsPath, 'utf8')) as unknown
    const status = inspectShowPackResearchIntakeDecisions(packet, decisions)
    console.log(`[show-pack-research-review] decision_status=${status.status} required=${status.required_values} open=${status.open_values}`)
    if (status.open_items.length) console.log(`[show-pack-research-review] open_items=${status.open_items.join(',')}`)
  }
  if (!packetPath || !templatePath) {
    console.log('[show-pack-research-review] valid=true; no file written')
    return
  }
  writeUtf8FileSafely(templatePath, templateRaw, options.force)
  writeUtf8FileSafely(packetPath, packetRaw, options.force)
  console.log(`[show-pack-research-review] wrote_decision_template=${templatePath}`)
  console.log(`[show-pack-research-review] wrote_packet=${packetPath}`)
}

try {
  main()
} catch (error) {
  console.error(`[show-pack-research-review] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
