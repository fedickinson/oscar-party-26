#!/usr/bin/env -S npx tsx

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  assessLegacyShowPackAuthoringWorksheet,
  projectLegacyShowPackAuthoringWorksheet,
  serializeLegacyShowPackAuthoringWorksheet,
  type LegacyShowPackAuthoringWorksheet,
} from '../src/lib/legacy-show-pack-authoring'
import type { LegacyShowPackMigrationWorksheet } from '../src/lib/legacy-show-pack-audit'
import {
  applyLegacyGlobalReviewDecisions,
  buildLegacyGlobalReviewPacket,
  LEGACY_GLOBAL_REVIEW_COLLECTIONS,
  legacyGlobalReviewCollectionSha256,
  legacyGlobalReviewSealIssue,
  serializeLegacyGlobalReviewDecisionTemplate,
  serializeLegacyGlobalReviewPacket,
  type LegacyGlobalReviewDecisionManifest,
} from '../src/lib/legacy-global-review'
import { sha256Hex } from '../src/lib/sha256'
import { assertOutputDoesNotAliasSource, writeUtf8FileSafely } from './lib/safe-write.mts'

interface Options {
  legacy: string
  authoring: string
  decisions?: string
  packet?: string
  decisionTemplate?: string
  inPlace: boolean
  force: boolean
}

function parse(argv: string[]): Options {
  const options: Options = {
    legacy: 'show-packs/research/hotd-s3-finale-legacy-worksheet.json',
    authoring: 'show-packs/research/hotd-s3-finale-authoring.json',
    inPlace: false,
    force: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--legacy') options.legacy = argv[++index] ?? ''
    else if (arg === '--authoring') options.authoring = argv[++index] ?? ''
    else if (arg === '--decisions') options.decisions = argv[++index] ?? ''
    else if (arg === '--packet') options.packet = argv[++index] ?? ''
    else if (arg === '--decision-template') options.decisionTemplate = argv[++index] ?? ''
    else if (arg === '--in-place') options.inPlace = true
    else if (arg === '--force') options.force = true
    else if (arg !== '--plan') throw new Error(`unknown argument ${arg}`)
  }
  if (options.inPlace && !options.decisions) throw new Error('--in-place requires --decisions')
  if (options.decisions && options.packet) throw new Error('--decisions cannot be combined with --packet')
  if (options.inPlace && options.packet) throw new Error('--in-place cannot be combined with --packet')
  if (options.decisionTemplate && !options.packet) throw new Error('--decision-template requires --packet')
  if (options.force && !options.packet) throw new Error('--force requires --packet')
  if (options.packet !== undefined && !options.packet) throw new Error('--packet needs a path')
  if (options.decisionTemplate !== undefined && !options.decisionTemplate) {
    throw new Error('--decision-template needs a path')
  }
  return options
}

function file(path: string, label: string): string {
  const resolved = resolve(path)
  if (!path || !existsSync(resolved)) throw new Error(`${label} does not exist: ${resolved}`)
  return resolved
}

function read(path: string, label: string): { raw: string; value: unknown } {
  const raw = readFileSync(path, 'utf8')
  try { return { raw, value: JSON.parse(raw) } } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function main(): void {
  const options = parse(process.argv.slice(2))
  const legacyPath = file(options.legacy, 'legacy worksheet')
  const authoringPath = file(options.authoring, 'authoring worksheet')
  const legacyInput = read(legacyPath, 'legacy worksheet')
  const authoringInput = read(authoringPath, 'authoring worksheet')
  const legacySha = sha256Hex(legacyInput.raw)
  const authoring = authoringInput.value as LegacyShowPackAuthoringWorksheet
  const authoringSha = sha256Hex(authoringInput.raw)
  const legacy = legacyInput.value as LegacyShowPackMigrationWorksheet
  console.log('[legacy-global-review] target=local-filesystem')
  console.log(`[legacy-global-review] mode=${options.packet ? 'packet' : options.decisions ? options.inPlace ? 'apply-in-place' : 'validate' : 'plan'}`)
  console.log(`[legacy-global-review] authoring=${authoringPath}`)
  for (const collection of LEGACY_GLOBAL_REVIEW_COLLECTIONS) {
    const digest = legacyGlobalReviewCollectionSha256(authoring, collection)
    const issue = legacyGlobalReviewSealIssue(authoring, collection)
    console.log(`[legacy-global-review] collection=${collection} sha256=${digest} review=${issue === null ? 'current' : 'open'}`)
    if (issue !== null) console.log(`[legacy-global-review] collection=${collection} reason=${issue}`)
  }
  if (options.packet) {
    const packetPath = resolve(options.packet)
    const decisionTemplatePath = options.decisionTemplate
      ? resolve(options.decisionTemplate)
      : null
    if (decisionTemplatePath === packetPath) {
      throw new Error('decision template path must differ from packet path')
    }
    assertOutputDoesNotAliasSource(packetPath, [
      { label: 'legacy worksheet', path: legacyPath },
      { label: 'authoring worksheet', path: authoringPath },
    ])
    if (existsSync(packetPath) && !options.force) {
      throw new Error(`packet already exists: ${packetPath}; pass --force to replace it`)
    }
    if (decisionTemplatePath) {
      assertOutputDoesNotAliasSource(decisionTemplatePath, [
        { label: 'legacy worksheet', path: legacyPath },
        { label: 'authoring worksheet', path: authoringPath },
        { label: 'global review packet', path: packetPath },
      ])
      if (existsSync(decisionTemplatePath) && !options.force) {
        throw new Error(`decision template already exists: ${decisionTemplatePath}; pass --force to replace it`)
      }
    }
    projectLegacyShowPackAuthoringWorksheet(legacy, legacySha, authoring)
    const packet = buildLegacyGlobalReviewPacket(authoring, authoringSha)
    const bytes = serializeLegacyGlobalReviewPacket(packet)
    const decisionTemplateBytes = decisionTemplatePath
      ? serializeLegacyGlobalReviewDecisionTemplate(packet)
      : null
    for (const section of packet.collections) {
      console.log(`[legacy-global-review] packet_collection=${section.collection} entries=${section.entries.length} blockers=${section.review_blockers.length}`)
      for (const blocker of section.review_blockers) {
        console.log(`[legacy-global-review] packet_blocker=${section.collection}:${blocker}`)
      }
    }
    console.log(`[legacy-global-review] packet_bytes=${Buffer.byteLength(bytes)} sha256=${sha256Hex(bytes)}`)
    if (decisionTemplatePath && decisionTemplateBytes) {
      console.log(`[legacy-global-review] decision_template_bytes=${Buffer.byteLength(decisionTemplateBytes)} sha256=${sha256Hex(decisionTemplateBytes)}`)
      writeUtf8FileSafely(decisionTemplatePath, decisionTemplateBytes, options.force)
      console.log(`[legacy-global-review] wrote=${decisionTemplatePath}`)
      console.log('[legacy-global-review] template notes remain null; no approval granted')
    }
    writeUtf8FileSafely(packetPath, bytes, options.force)
    console.log(`[legacy-global-review] wrote=${packetPath}`)
    return
  }
  if (!options.decisions) {
    console.log('[legacy-global-review] no approvals inferred; no file written')
    return
  }
  const decisionsPath = file(options.decisions, 'global review decisions')
  const decisionsInput = read(decisionsPath, 'global review decisions')
  if (options.inPlace) {
    assertOutputDoesNotAliasSource(authoringPath, [
      { label: 'legacy worksheet', path: legacyPath },
      { label: 'global review decisions', path: decisionsPath },
    ])
  }
  const result = applyLegacyGlobalReviewDecisions({
    authoring,
    manifest: decisionsInput.value as LegacyGlobalReviewDecisionManifest,
  })
  const status = assessLegacyShowPackAuthoringWorksheet(
    legacy,
    legacySha,
    result.worksheet,
  )
  if (status.issues.length > 0) throw new Error(`authoring status has issues: ${status.issues[0]}`)
  const bytes = serializeLegacyShowPackAuthoringWorksheet(result.worksheet)
  console.log(`[legacy-global-review] applied=${result.applied_collections.join(',')}`)
  console.log(`[legacy-global-review] global_review=${status.lanes.global_review.filled}/${status.lanes.global_review.total}`)
  console.log(`[legacy-global-review] authoring_ready=${status.ready}`)
  console.log(`[legacy-global-review] bytes=${Buffer.byteLength(bytes)} sha256=${sha256Hex(bytes)}`)
  if (!options.inPlace) {
    console.log('[legacy-global-review] no file written')
    return
  }
  writeUtf8FileSafely(authoringPath, bytes, true)
  console.log(`[legacy-global-review] wrote=${authoringPath}`)
}

try { main() } catch (error) {
  console.error(`[legacy-global-review] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
