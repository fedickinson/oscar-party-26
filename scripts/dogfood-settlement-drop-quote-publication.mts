#!/usr/bin/env -S npx tsx

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildSettlementDropQuoteGroundingPlan,
  serializeSettlementDropQuoteGroundingPacket,
  serializeSettlementDropQuoteGroundingPlan,
  type SettlementDropQuoteGroundingDecisionTemplate,
  type SettlementDropQuoteGroundingPacket,
} from '../src/lib/settlement-drop-quote-grounding'
import type { SettlementDropQuoteAuthorizationTranscript } from '../src/lib/settlement-drop-quote-publication'
import { sha256Hex } from '../src/lib/sha256'

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const workspace = mkdtempSync('/private/tmp/settlement-drop-quote-publication-')
let checks = 0

function check(condition: unknown, message: string): asserts condition {
  checks += 1
  if (!condition) throw new Error(message)
  console.log(`PASS ${message}`)
}

function run(script: string, args: string[], expectedStatus = 0): string {
  const result = spawnSync(process.execPath, ['--import', 'tsx', script, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 30_000,
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (output.trim()) console.log(output.trim())
  if (result.error) throw result.error
  check(result.status === expectedStatus, `${script} exited ${expectedStatus}`)
  return output
}

function write(name: string, value: unknown): string {
  const path = join(workspace, name)
  writeFileSync(path, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  return path
}

try {
  const seal = { name: 'synthetic.json', bytes: 3, sha256: 'a'.repeat(64) }
  const packet: SettlementDropQuoteGroundingPacket = {
    packet_version: 1,
    artifact: 'settlement-drop-quote-grounding-review',
    target: {
      room_code: 'PROOF',
      settlement_id: '11111111-1111-4111-8111-111111111111',
      settlement_version: 1,
      manifest_hash: 'b'.repeat(64),
    },
    inputs: {
      receipt: seal, ceremony: seal, beatlines: seal, legacy_assets: seal, extraction: seal,
      takes: seal, presentation_structure: seal, presentation_decisions: seal,
      asset_semantics: seal, asset_decisions: seal, quote_markup: seal,
      quote_markup_decisions: seal, receipt_binding: seal, receipt_binding_decisions: seal,
    },
    doctrine: {
      pipeline: 'scripts/grounded-line.mts',
      fact_source_kinds: ['screen_capture', 'table_testimony', 'operator_record', 'settlement_record', 'recap'],
      independent_screen_warrants: ['screen_capture', 'table_testimony', 'operator_record', 'settlement_record'],
      source_material_role: 'attitude_only',
      recap_role: 'corroboration_only',
    },
    coverage: {
      approved_take_groups: 1, quotes: 1, quotes_with_legacy_markup: 0,
      receipt_characters: 1, approved_pundit_assets: 1,
    },
    receipt_characters: [{ id: 'wolf', name: 'Wolf' }],
    settlement_records: [{
      record_key: 'score_event:wolf', id: 'wolf', kind: 'score_event',
      label: 'The wolf arrived', beat_id: 'arrival',
    }],
    pundit_assets: [{ asset_id: 'reader', speaker: 'The Reader', approved_alt_text: 'The Reader' }],
    quotes: [{
      quote_key: 'arrival:0', group: 'arrival', quote_index: 0, beat_id: 'arrival',
      slide_index: 1, legacy_speaker: 'The Reader', legacy_text: 'Old line.',
      markup_approved_plain_text: 'Old line.', legacy_had_markup: false,
      candidate_pundit_asset_ids: ['reader'],
      legacy_refs: [{ name: 'Wolf', candidate_character_id: 'wolf' }],
    }],
  }
  const packetRaw = serializeSettlementDropQuoteGroundingPacket(packet)
  const decisions: SettlementDropQuoteGroundingDecisionTemplate = {
    decision_version: 1,
    artifact: 'settlement-drop-quote-grounding-decisions',
    target: packet.target,
    expected_packet_sha256: sha256Hex(packetRaw),
    decisions: [{
      quote_key: 'arrival:0',
      disposition: null, speaker: null, portrait_asset_id: null, ref_character_ids: null,
      voice_instruction: null, screen_facts: null, source_material_attitude: null,
      angle: null, note: null,
    }],
  }
  const decision = decisions.decisions[0] as Record<string, unknown>
  Object.assign(decision, {
    disposition: 'replace', speaker: 'The Reader', portrait_asset_id: 'reader',
    ref_character_ids: ['wolf'], voice_instruction: 'Speak plainly.',
    screen_facts: [{
      text: 'The wolf arrived',
      sources: [{ kind: 'settlement_record', ref: 'score_event:wolf' }],
    }],
    source_material_attitude: [], angle: 'Notice only the recorded arrival.',
  })
  const decisionsRaw = `${JSON.stringify(decisions, null, 2)}\n`
  const planRaw = serializeSettlementDropQuoteGroundingPlan(
    buildSettlementDropQuoteGroundingPlan(packet, decisionsRaw),
  )
  const packetPath = write('packet.json', packetRaw)
  const decisionsPath = write('decisions.json', decisionsRaw)
  const planPath = write('plan.json', planRaw)
  const reviewPath = join(workspace, 'review.html')
  const transcript: SettlementDropQuoteAuthorizationTranscript = {
    transcript_version: 1,
    artifact: 'settlement-drop-quote-authorization-transcript',
    target: packet.target,
    plan_sha256: sha256Hex(planRaw),
    acknowledged_job_ids: ['arrival:0'],
    acknowledged_omission_ids: [],
    acknowledged_budget: JSON.parse(planRaw).budget,
    note: 'Authorize the exact synthetic grounded quote.',
  }
  const transcriptPath = write('transcript.json', transcript)
  const authorizationPath = join(workspace, 'authorization.json')
  const checkpointPath = join(workspace, 'checkpoint.json')
  const publicationPath = join(workspace, 'publication.json')

  const reviewOutput = run('scripts/generate-settlement-drop-quote-authorization-review.mts', [
    '--plan', planPath, '--output', reviewPath,
  ])
  check(reviewOutput.includes('no model called'), 'review command proves the no-model boundary')
  check(readFileSync(reviewPath, 'utf8').includes("default-src 'none'"), 'review carries an offline content policy')
  const authorizationOutput = run('scripts/build-settlement-drop-quote-authorization.mts', [
    '--plan', planPath, '--transcript', transcriptPath, '--output', authorizationPath,
  ])
  check(authorizationOutput.includes('no model called'), 'authorization builder proves the no-model boundary')
  const validateOutput = run('scripts/publish-settlement-drop-quotes.mts', [
    '--packet', packetPath, '--decisions', decisionsPath, '--approved-plan', planPath,
    '--authorization', authorizationPath, '--checkpoint', checkpointPath, '--output', publicationPath,
  ])
  check(validateOutput.includes('current=true; no file written; no model called'), 'publication dry-run validates without generation')

  decision.angle = 'A changed human decision invalidates the old plan.'
  writeFileSync(decisionsPath, `${JSON.stringify(decisions, null, 2)}\n`, 'utf8')
  const staleOutput = run('scripts/publish-settlement-drop-quotes.mts', [
    '--packet', packetPath, '--decisions', decisionsPath, '--approved-plan', planPath,
    '--authorization', authorizationPath, '--checkpoint', checkpointPath, '--output', publicationPath,
  ], 1)
  check(staleOutput.includes('approved quote grounding plan is stale'), 'publication rejects changed reviewed decisions')
  console.log(`[settlement-drop-quote-publication-dogfood] PASS checks=${checks}; no model called`)
} finally {
  rmSync(workspace, { recursive: true, force: true })
}
