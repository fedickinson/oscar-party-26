#!/usr/bin/env -S npx tsx

import { createHash } from 'node:crypto'
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
import { renderLegacyGlobalReviewAttestationHtml } from '../src/lib/legacy-global-review-attestation'
import { renderLegacyGlobalReviewHtml } from '../src/lib/legacy-global-review-html'
import { sha256Hex } from '../src/lib/sha256'
import {
  assertOutputDoesNotAliasSource,
  canonicalProspectivePath,
  writeUtf8FileSafely,
} from './lib/safe-write.mts'

interface Options {
  legacy: string
  authoring: string
  packet: string
  decisionTemplate: string
  output?: string
  attestationOutput?: string
  force: boolean
}

function usage(): never {
  console.error('Usage: npx tsx scripts/generate-legacy-global-review-html.mts --legacy LEGACY.json --authoring AUTHORING.json --packet PACKET.md --decision-template DECISIONS.json [--output REVIEW.html] [--attestation-output DESK.html] [--force]')
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
      else if (arg === '--output') result.output = value
      else if (arg === '--attestation-output') result.attestationOutput = value
      else throw new Error(`unknown argument ${arg}`)
    } else throw new Error(`unknown argument ${arg}`)
  }
  if (!result.legacy || !result.authoring || !result.packet || !result.decisionTemplate) usage()
  if (result.force && !result.output && !result.attestationOutput) {
    throw new Error('--force requires --output or --attestation-output')
  }
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
  const decisionPath = file(options.decisionTemplate, 'global review decision template')
  const legacyRaw = readFileSync(legacyPath, 'utf8')
  const authoringRaw = readFileSync(authoringPath, 'utf8')
  const packetRaw = readFileSync(packetPath, 'utf8')
  const decisionRaw = readFileSync(decisionPath, 'utf8')
  const legacy = json<LegacyShowPackMigrationWorksheet>(legacyRaw, 'legacy worksheet')
  const authoring = json<LegacyShowPackAuthoringWorksheet>(authoringRaw, 'authoring worksheet')

  projectLegacyShowPackAuthoringWorksheet(legacy, sha256Hex(legacyRaw), authoring)
  const packet = buildLegacyGlobalReviewPacket(authoring, sha256Hex(authoringRaw))
  const expectedPacket = serializeLegacyGlobalReviewPacket(packet)
  if (packetRaw !== expectedPacket) throw new Error('global review Markdown is stale or does not match the authoritative worksheets')
  const expectedDecisions = serializeLegacyGlobalReviewDecisionTemplate(packet)
  if (decisionRaw !== expectedDecisions) throw new Error('global review decision template is stale or does not match the authoritative worksheets')

  const renderInput = {
    packet,
    packet_markdown: packetRaw,
    packet_markdown_sha256: sha256Hex(packetRaw),
    decision_template_raw: decisionRaw,
  }
  const html = renderLegacyGlobalReviewHtml(renderInput)
  const attestationHtml = renderLegacyGlobalReviewAttestationHtml(renderInput)
  const outputPath = options.output ? resolve(options.output) : null
  const attestationOutputPath = options.attestationOutput
    ? resolve(options.attestationOutput)
    : null
  const sources = [
    { label: 'legacy worksheet', path: legacyPath },
    { label: 'authoring worksheet', path: authoringPath },
    { label: 'global review packet', path: packetPath },
    { label: 'global review decision template', path: decisionPath },
  ]
  const outputs = [
    ...(outputPath ? [{ label: 'review output', path: outputPath }] : []),
    ...(attestationOutputPath ? [{ label: 'attestation output', path: attestationOutputPath }] : []),
  ]
  if (outputs.length === 2
    && canonicalProspectivePath(outputs[0].path) === canonicalProspectivePath(outputs[1].path)) {
    throw new Error('review and attestation outputs must differ')
  }
  for (const output of outputs) {
    assertOutputDoesNotAliasSource(output.path, [
      ...sources,
      ...outputs.filter((candidate) => candidate.path !== output.path),
    ])
    if (existsSync(output.path) && !options.force) {
      throw new Error(`${output.label} already exists: ${output.path}; pass --force to replace it`)
    }
    if (realpathSync(dirname(output.path)) !== dirname(output.path)) {
      throw new Error('output parent must not be a symlink')
    }
  }
  console.log('[legacy-global-review-html] target=local-filesystem')
  console.log(`[legacy-global-review-html] mode=${outputs.length > 0 ? 'write' : 'dry-run'}`)
  console.log(`[legacy-global-review-html] pack=${packet.target.pack_id}@${packet.target.pack_version}`)
  for (const collection of packet.collections) {
    console.log(`[legacy-global-review-html] collection=${collection.collection} entries=${collection.entries.length} review=${collection.current_review} blockers=${collection.review_blockers.length}`)
  }
  console.log(`[legacy-global-review-html] bytes=${Buffer.byteLength(html)} sha256=${createHash('sha256').update(html).digest('hex')}`)
  console.log(`[legacy-global-review-html] attestation_bytes=${Buffer.byteLength(attestationHtml)} attestation_sha256=${createHash('sha256').update(attestationHtml).digest('hex')}`)
  if (outputs.length === 0) {
    console.log('[legacy-global-review-html] valid=true; no file written')
    return
  }
  if (outputPath) {
    writeUtf8FileSafely(outputPath, html, options.force)
    console.log(`[legacy-global-review-html] wrote=${outputPath}`)
  }
  if (attestationOutputPath) {
    writeUtf8FileSafely(attestationOutputPath, attestationHtml, options.force)
    console.log(`[legacy-global-review-html] wrote=${attestationOutputPath}`)
  }
}

try { main() } catch (error) {
  console.error(`[legacy-global-review-html] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
