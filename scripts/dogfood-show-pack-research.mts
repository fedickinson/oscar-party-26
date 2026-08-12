#!/usr/bin/env -S node --import tsx

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createShowPackFlywheelSeed,
  serializeShowPackFlywheelSeed,
} from '../src/lib/show-pack-flywheel'
import { serializeSettlementReceipt, type SettlementReceipt } from '../src/lib/settlement-receipt'
import { sha256Hex } from '../src/lib/sha256'

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const workspace = mkdtempSync('/private/tmp/show-pack-research-')
let checks = 0

function check(condition: unknown, message: string): asserts condition {
  checks += 1
  if (!condition) throw new Error(message)
  console.log(`PASS ${message}`)
}

function run(script: string, args: string[], expectedStatus = 0): string {
  const result = spawnSync(process.execPath, ['--import', 'tsx', script, ...args], {
    cwd: repoRoot, encoding: 'utf8', timeout: 30_000,
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
  const receipt: SettlementReceipt = {
    version: 1, source: 'synthetic-proof', room_code: 'PROOF',
    room_id: '11111111-1111-4111-8111-111111111111',
    settlement_id: '22222222-2222-4222-8222-222222222222', settlement_version: 1,
    manifest_hash: 'a'.repeat(64),
    revision: { settled_at: '2026-08-11T03:00:00.000Z', supersedes_id: null },
    show_pack: {
      registry_id: '33333333-3333-4333-8333-333333333333',
      pack_id: 'proof-predecessor', version: 1,
    },
    players: [{ id: 'player-one', name: 'Player One' }],
    characters: [{ id: 'fox', name: 'The Fox', player_id: 'player-one' }],
    settled_facts: [{
      id: 'fox-breaks-bargain', sequence: 1, title: 'The Fox breaks the bargain',
      outcome: 'resolved', board_status: 'authored', winner: { id: 'fox', name: 'The Fox' },
    }],
    score_events: [],
    personal_cards: [{
      player_id: 'player-one',
      bingo: Array.from({ length: 25 }, (_, index) => ({
        label: index === 12 ? 'FREE' : `Square ${index + 1}`, marked: index === 12, free: index === 12,
      })),
    }],
  }
  const receiptRaw = serializeSettlementReceipt(receipt)
  const receiptPath = write('receipt.json', receiptRaw)
  const seed = createShowPackFlywheelSeed(receipt, sha256Hex(receiptRaw), { allowProof: true })
  const seedPath = write('seed.json', serializeShowPackFlywheelSeed(seed))
  const candidatesPath = write('candidates.json', {
    candidate_version: 1,
    artifact: 'show-pack-research-candidates',
    target: seed.predecessor,
    sources: [{
      id: 'proof-recap', kind: 'recap', title: 'Proof recap', locator: 'https://example.test/recap',
    }, {
      id: 'proof-sentiment', kind: 'sentiment', title: 'Proof reaction sweep', locator: 'research:proof',
    }],
    claims: [{
      id: 'proof-recap-claim', canon: 'screen', text: 'The recap says the Fox broke the bargain.',
      source_ids: ['proof-recap'], candidate_cross_check_claim_ids: ['predecessor-screen-fact-001'],
    }, {
      id: 'proof-discourse-claim', canon: 'discourse', text: 'The bargain break drew approval.',
      source_ids: ['proof-sentiment'], candidate_cross_check_claim_ids: [],
    }],
  })
  const packetPath = join(workspace, 'packet.json')
  const templatePath = join(workspace, 'decisions.json')
  const reviewOutput = run('scripts/review-show-pack-research.mts', [
    '--seed', seedPath, '--candidates', candidatesPath,
    '--packet', packetPath, '--decision-template', templatePath,
  ])
  check(reviewOutput.includes('canonical_screen_claims=1'), 'review exposes canonical cross-check evidence')
  const decisions = JSON.parse(readFileSync(templatePath, 'utf8'))
  Object.assign(decisions.sources[0], { disposition: 'include', note: 'Reviewed recap source.' })
  Object.assign(decisions.sources[1], { disposition: 'include', note: 'Reviewed sentiment source.' })
  Object.assign(decisions.claims[0], {
    disposition: 'include', status: 'verified',
    approved_cross_check_claim_ids: ['predecessor-screen-fact-001'],
    note: 'Cross-checked against the canonical settlement claim.',
  })
  Object.assign(decisions.claims[1], {
    disposition: 'include', status: 'verified', approved_cross_check_claim_ids: [],
    note: 'Reviewed as discourse only.',
  })
  writeFileSync(templatePath, `${JSON.stringify(decisions, null, 2)}\n`, 'utf8')
  const resultPath = join(workspace, 'research.json')
  const applyOutput = run('scripts/apply-show-pack-research.mts', [
    '--seed', seedPath, '--candidates', candidatesPath, '--packet', packetPath,
    '--decisions', templatePath, '--output', resultPath,
  ])
  check(applyOutput.includes('sources=3 claims=2'), 'apply emits reviewed research plus its review record')
  check(JSON.parse(readFileSync(resultPath, 'utf8')).claims[0].source_ids.includes('predecessor-research-review'),
    'verified recap claim carries the hash-bound cross-check record')

  const composedPath = join(workspace, 'composed-authoring.json')
  const composeOutput = run('scripts/compose-show-pack-flywheel.mts', [
    '--input', 'show-packs/examples/hotd-s3e8-proof.json',
    '--seed', seedPath, '--receipt', receiptPath,
    '--research', resultPath, '--research-candidates', candidatesPath,
    '--research-packet', packetPath, '--research-decisions', templatePath,
    '--authoring', '--allow-proof', '--output', composedPath,
  ])
  check(composeOutput.includes('research=') && composeOutput.includes('pack=hotd-s3e8-proof@1'),
    'flywheel composer consumes the complete reviewed research chain')
  const composed = JSON.parse(readFileSync(composedPath, 'utf8'))
  check(composed.sources.some((source: { id: string }) => source.id === 'predecessor-research-review')
    && composed.claims.some((claim: { id: string }) => claim.id === 'proof-recap-claim'),
  'composed authoring pack contains the reviewed research evidence')

  decisions.claims[0].approved_cross_check_claim_ids = []
  writeFileSync(templatePath, `${JSON.stringify(decisions, null, 2)}\n`, 'utf8')
  const failed = run('scripts/apply-show-pack-research.mts', [
    '--seed', seedPath, '--candidates', candidatesPath, '--packet', packetPath,
    '--decisions', templatePath,
  ], 1)
  check(failed.includes('requires an approved canonical screen cross-check'),
    'apply rejects recap promotion without independent screen warrant')
  console.log(`[show-pack-research-dogfood] PASS checks=${checks}; no network or model called`)
} finally {
  rmSync(workspace, { recursive: true, force: true })
}
