#!/usr/bin/env -S npx tsx

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  projectLegacyShowPackAuthoringWorksheet,
  type LegacyShowPackAuthoringWorksheet,
} from '../src/lib/legacy-show-pack-authoring'
import type { LegacyShowPackMigrationWorksheet } from '../src/lib/legacy-show-pack-audit'
import {
  buildLegacyGlobalReviewPacket,
  serializeLegacyGlobalReviewDecisionTemplate,
  serializeLegacyGlobalReviewPacket,
} from '../src/lib/legacy-global-review'
import { buildLegacyGlobalReviewDecisionDraftFromAttestations } from '../src/lib/legacy-global-review-attestation'
import { sha256Hex } from '../src/lib/sha256'
import { assertOutputDoesNotAliasSource, writeUtf8FileSafely } from './lib/safe-write.mts'

interface Options {
  legacy: string
  authoring: string
  packet: string
  decisionTemplate: string
  attestations: string
  output?: string
  force: boolean
}

function usage(): never {
  console.error('Usage: npx tsx scripts/build-legacy-global-review-decisions.mts --legacy LEGACY.json --authoring AUTHORING.json --packet PACKET.md --decision-template TEMPLATE.json --attestations ATTESTATIONS.json [--output DECISIONS.json] [--force]')
  process.exit(1)
}

function parse(argv: string[]): Options {
  const result: Partial<Options> & { force: boolean } = { force: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--force') result.force = true
    else if (arg === '--help' || arg === '-h') usage()
    else if (arg.startsWith('--')) {
      const value = argv[++index]
      if (!value || value.startsWith('--')) throw new Error(`${arg} needs a value`)
      if (arg === '--legacy') result.legacy = value
      else if (arg === '--authoring') result.authoring = value
      else if (arg === '--packet') result.packet = value
      else if (arg === '--decision-template') result.decisionTemplate = value
      else if (arg === '--attestations') result.attestations = value
      else if (arg === '--output') result.output = value
      else throw new Error(`unknown argument ${arg}`)
    } else throw new Error(`unknown argument ${arg}`)
  }
  if (!result.legacy || !result.authoring || !result.packet
    || !result.decisionTemplate || !result.attestations) usage()
  if (result.force && !result.output) throw new Error('--force requires --output')
  return result as Options
}

function file(raw: string, label: string): string {
  const path = resolve(raw)
  if (!existsSync(path)) throw new Error(`${label} does not exist: ${path}`)
  const realPath = realpathSync(path)
  if (!statSync(realPath).isFile()) throw new Error(`${label} must be a file`)
  return realPath
}

function json<T>(raw: string, label: string): T {
  try { return JSON.parse(raw) as T } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function main(): void {
  const options = parse(process.argv.slice(2))
  const legacyPath = file(options.legacy, 'legacy worksheet')
  const authoringPath = file(options.authoring, 'authoring worksheet')
  const packetPath = file(options.packet, 'global review packet')
  const decisionTemplatePath = file(options.decisionTemplate, 'global review decision template')
  const attestationsPath = file(options.attestations, 'global review attestations')
  const legacyRaw = readFileSync(legacyPath, 'utf8')
  const authoringRaw = readFileSync(authoringPath, 'utf8')
  const packetRaw = readFileSync(packetPath, 'utf8')
  const decisionTemplateRaw = readFileSync(decisionTemplatePath, 'utf8')
  const attestationRaw = readFileSync(attestationsPath, 'utf8')
  const legacy = json<LegacyShowPackMigrationWorksheet>(legacyRaw, 'legacy worksheet')
  const authoring = json<LegacyShowPackAuthoringWorksheet>(authoringRaw, 'authoring worksheet')
  const attestation = json<unknown>(attestationRaw, 'global review attestations')

  projectLegacyShowPackAuthoringWorksheet(legacy, sha256Hex(legacyRaw), authoring)
  const packet = buildLegacyGlobalReviewPacket(authoring, sha256Hex(authoringRaw))
  if (packetRaw !== serializeLegacyGlobalReviewPacket(packet)) {
    throw new Error('global review Markdown is stale or does not match the authoritative worksheets')
  }
  if (decisionTemplateRaw !== serializeLegacyGlobalReviewDecisionTemplate(packet)) {
    throw new Error('global review decision template is stale or does not match the authoritative worksheets')
  }
  const decision = buildLegacyGlobalReviewDecisionDraftFromAttestations({
    packet,
    packet_markdown: packetRaw,
    packet_markdown_sha256: sha256Hex(packetRaw),
    decision_template_raw: decisionTemplateRaw,
  }, attestation)
  const bytes = `${JSON.stringify(decision, null, 2)}\n`
  const outputPath = options.output ? resolve(options.output) : null
  const sources = [
    { label: 'legacy worksheet', path: legacyPath },
    { label: 'authoring worksheet', path: authoringPath },
    { label: 'global review packet', path: packetPath },
    { label: 'global review decision template', path: decisionTemplatePath },
    { label: 'global review attestations', path: attestationsPath },
  ]
  if (outputPath) {
    assertOutputDoesNotAliasSource(outputPath, sources)
    if (existsSync(outputPath) && !options.force) {
      throw new Error(`output already exists: ${outputPath}; pass --force to replace it`)
    }
    if (realpathSync(dirname(outputPath)) !== dirname(outputPath)) {
      throw new Error('output parent must not be a symlink')
    }
  }
  console.log('[legacy-global-review-decisions] target=local-filesystem')
  console.log(`[legacy-global-review-decisions] mode=${outputPath ? 'write' : 'dry-run'}`)
  console.log(`[legacy-global-review-decisions] pack=${packet.target.pack_id}@${packet.target.pack_version}`)
  console.log(`[legacy-global-review-decisions] approvals=${decision.approvals.map((value) => value.collection).join(',')}`)
  console.log(`[legacy-global-review-decisions] bytes=${Buffer.byteLength(bytes)} sha256=${sha256Hex(bytes)}`)
  if (!outputPath) {
    console.log('[legacy-global-review-decisions] valid=true; no file written')
    return
  }
  writeUtf8FileSafely(outputPath, bytes, options.force)
  console.log(`[legacy-global-review-decisions] wrote=${outputPath}`)
}

try { main() } catch (error) {
  console.error(`[legacy-global-review-decisions] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
