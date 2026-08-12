#!/usr/bin/env -S node --import tsx

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildShowPackCommentaryPlan,
  publishShowPackCommentary,
  serializeShowPackCommentaryPlan,
} from '../src/lib/show-pack-commentary'
import { createShowPackFlywheelSeed, serializeShowPackFlywheelSeed } from '../src/lib/show-pack-flywheel'
import { parseShowPack } from '../src/lib/show-pack'
import {
  applyShowPackResearchIntake,
  buildShowPackResearchIntakePacket,
  serializeShowPackResearchIntakeDecisionTemplate,
  serializeShowPackResearchIntakePacket,
  serializeShowPackResearchIntakeResult,
} from '../src/lib/show-pack-research-intake'
import { serializeSettlementReceipt, type SettlementReceipt } from '../src/lib/settlement-receipt'
import { sha256Hex } from '../src/lib/sha256'

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const workspace = mkdtempSync('/private/tmp/show-pack-factory-')
const runsPath = join(workspace, 'runs')
let checks = 0

function check(condition: unknown, message: string): asserts condition {
  checks += 1
  if (!condition) throw new Error(message)
  console.log(`PASS ${message}`)
}

function write(name: string, value: unknown): string {
  const path = join(workspace, name)
  writeFileSync(path, typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  return path
}

function run(args: string[], expectedStatus = 0): string {
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/run-show-pack-factory.mts', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 30_000,
  })
  if (result.error) throw result.error
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (output.trim()) console.log(output.trim())
  check(result.status === expectedStatus, `factory command exited ${expectedStatus}`)
  return output
}

function runDirectory(output: string): string {
  const line = output.split('\n').find((candidate) => candidate.startsWith('[show-pack-factory] run='))
  if (!line) throw new Error('factory output did not name its run directory')
  return line.slice('[show-pack-factory] run='.length)
}

function authorization(plan: ReturnType<typeof buildShowPackCommentaryPlan>) {
  return {
    authorization_version: 1 as const,
    artifact: 'show-pack-commentary-authorization' as const,
    target: { ...plan.target },
    plan_sha256: sha256Hex(serializeShowPackCommentaryPlan(plan)),
    source_sha256: plan.source_sha256,
    authorized_request_ids: plan.jobs.map((job) => job.request_id),
    authorized_budget: structuredClone(plan.budget),
    note: 'Synthetic dogfood authority; no external model call.',
  }
}

async function main(): Promise<void> {
  try {
    const receipt: SettlementReceipt = {
      version: 1,
      source: 'synthetic-proof',
      room_code: 'PROOF',
      room_id: '11111111-1111-4111-8111-111111111111',
      settlement_id: '22222222-2222-4222-8222-222222222222',
      settlement_version: 1,
      manifest_hash: 'a'.repeat(64),
      revision: { settled_at: '2026-08-12T12:00:00.000Z', supersedes_id: null },
      show_pack: {
        registry_id: '33333333-3333-4333-8333-333333333333',
        pack_id: 'proof-predecessor',
        version: 1,
      },
      players: [{ id: 'player-one', name: 'Player One' }],
      characters: [{ id: 'fox', name: 'The Fox', player_id: 'player-one' }],
      settled_facts: [{
        id: 'fox-breaks-bargain',
        sequence: 1,
        title: 'The Fox breaks the bargain',
        outcome: 'resolved',
        board_status: 'authored',
        winner: { id: 'fox', name: 'The Fox' },
      }],
      score_events: [],
      personal_cards: [{
        player_id: 'player-one',
        bingo: Array.from({ length: 25 }, (_, index) => ({
          label: index === 12 ? 'FREE' : `Square ${index + 1}`,
          marked: index === 12,
          free: index === 12,
        })),
      }],
    }
    const receiptRaw = serializeSettlementReceipt(receipt)
    const receiptPath = write('receipt.json', receiptRaw)
    const seed = createShowPackFlywheelSeed(receipt, sha256Hex(receiptRaw), { allowProof: true })
    const seedRaw = serializeShowPackFlywheelSeed(seed)
    const seedPath = write('seed.json', seedRaw)
    const candidatesRaw = `${JSON.stringify({
      candidate_version: 1,
      artifact: 'show-pack-research-candidates',
      target: seed.predecessor,
      sources: [{
        id: 'proof-recap', kind: 'recap', title: 'Proof recap', locator: 'https://example.test/recap',
      }],
      claims: [{
        id: 'proof-recap-claim', canon: 'screen', text: 'The recap says the Fox broke the bargain.',
        source_ids: ['proof-recap'], candidate_cross_check_claim_ids: ['predecessor-screen-fact-001'],
      }],
    }, null, 2)}\n`
    const packet = buildShowPackResearchIntakePacket(seedRaw, candidatesRaw)
    const decisions = JSON.parse(serializeShowPackResearchIntakeDecisionTemplate(packet))
    Object.assign(decisions.sources[0], { disposition: 'include', note: 'Reviewed proof recap.' })
    Object.assign(decisions.claims[0], {
      disposition: 'include',
      status: 'verified',
      approved_cross_check_claim_ids: ['predecessor-screen-fact-001'],
      note: 'Cross-checked against the canonical settled screen claim.',
    })
    const candidatesPath = write('research-candidates.json', candidatesRaw)
    const packetPath = write('research-packet.json', serializeShowPackResearchIntakePacket(packet))
    const decisionsPath = write('research-decisions.json', decisions)
    const researchPath = write(
      'research.json',
      serializeShowPackResearchIntakeResult(applyShowPackResearchIntake(packet, decisions)),
    )
    const authoring = JSON.parse(readFileSync(
      join(repoRoot, 'show-packs/examples/hotd-s3e8-proof.json'),
      'utf8',
    ))
    authoring.commentary_requests = [{
      id: 'proof-commentary',
      speaker: 'cersei',
      fact_claim_ids: ['aegon-alive-after-episode-seven'],
      angle_claim_ids: ['sunfyre-reunion-audience-favorite'],
      angle: 'Judge the political use of the bond without inventing a new scene event.',
      publication: { status: 'pending' },
    }]
    const authoringPath = write('authoring.json', authoring)
    const baseArgs = [
      '--input', authoringPath,
      '--seed', seedPath,
      '--receipt', receiptPath,
      '--allow-proof',
      '--research', researchPath,
      '--research-candidates', candidatesPath,
      '--research-packet', packetPath,
      '--research-decisions', decisionsPath,
      '--output-dir', runsPath,
    ]

    const firstOutput = run(baseArgs)
    check(firstOutput.includes('stage=awaiting_commentary_authorization'),
      'pending factory run stops at the explicit authorization boundary')
    const firstRun = runDirectory(firstOutput)
    expectFiles(firstRun, [
      'commentary-plan.json', 'commentary-review.html', 'run.json', 'status.json', 'working.json',
    ])
    const runManifest = JSON.parse(readFileSync(join(firstRun, 'run.json'), 'utf8'))
    check(runManifest.inputs.every((input: { path?: string }) => input.path === undefined),
      'run manifest seals input hashes without leaking local paths')
    check(parseShowPack(readFileSync(join(firstRun, 'working.json'), 'utf8'))
      .claims.some((claim) => claim.id === 'proof-recap-claim'),
    'factory working pack contains exact-rebuilt reviewed research')

    const repeatedOutput = run(baseArgs)
    check(repeatedOutput.includes('write_state=reused') && runDirectory(repeatedOutput) === firstRun,
      'exact rerun verifies and reuses the immutable run')

    const workingRaw = readFileSync(join(firstRun, 'working.json'), 'utf8')
    const working = parseShowPack(workingRaw)
    const plan = buildShowPackCommentaryPlan(working, sha256Hex(workingRaw))
    const authorizationPath = write('authorization.json', authorization(plan))
    const ready = await publishShowPackCommentary(working, async () => ({
      text: 'The living claimant remains inside the record.',
      attempts: 1,
      lastViolations: [],
    }), { approvedPlan: plan, authorization: authorization(plan) })
    const readyPath = write('ready.json', ready)
    const missingAuthorityOutput = run([...baseArgs, '--continuation', readyPath], 1)
    check(missingAuthorityOutput.includes('each --continuation requires one source-ordered'),
      'factory CLI rejects a detached continuation before reading it')
    const continuationAuthorityArgs = [
      '--approved-plan', join(firstRun, 'commentary-plan.json'),
      '--authorization', authorizationPath,
    ]
    const readyOutput = run([
      ...baseArgs, '--continuation', readyPath, ...continuationAuthorityArgs,
    ])
    check(readyOutput.includes('stage=publishable'),
      'publication-only continuation reaches the compiler boundary')
    const readyRun = runDirectory(readyOutput)
    expectFiles(readyRun, ['compiled.json', 'run.json', 'status.json', 'working.json'])
    check(parseShowPack(readFileSync(join(readyRun, 'compiled.json'), 'utf8'))
      .commentary_requests[0].publication.status === 'ready',
    'compiled artifact retains grounded ready commentary')

    const drifted = structuredClone(ready)
    drifted.pack.title = 'A drifted pack title'
    const driftPath = write('drifted.json', drifted)
    const driftOutput = run([
      ...baseArgs, '--continuation', driftPath, ...continuationAuthorityArgs,
    ], 1)
    check(driftOutput.includes('changed content outside commentary publications'),
      'factory rejects continuation drift outside publication records')

    const blocked = await publishShowPackCommentary(working, async () => ({
      text: 'An unsupported event happened.',
      attempts: 3,
      lastViolations: ['The event is absent from the exhaustive fact block.'],
    }), { approvedPlan: plan, authorization: authorization(plan) })
    const blockedPath = write('blocked.json', blocked)
    const blockedOutput = run([
      ...baseArgs, '--continuation', blockedPath, ...continuationAuthorityArgs,
    ])
    check(blockedOutput.includes('stage=blocked_grounding'),
      'residual findings stop without silently planning more spend')
    const retryOutput = run([
      ...baseArgs, '--continuation', blockedPath, ...continuationAuthorityArgs, '--retry-blocked',
    ])
    check(retryOutput.includes('stage=awaiting_commentary_authorization')
      && retryOutput.includes('plan_jobs=1'),
    'explicit retry opens a new bounded authorization doorway')

    check(readdirSync(runsPath).length === 4,
      'distinct invocation states retain four immutable run histories')
    writeFileSync(join(firstRun, 'status.json'), '{}\n', 'utf8')
    const driftedRunOutput = run(baseArgs, 1)
    check(driftedRunOutput.includes('has drifted artifact status.json'),
      'factory refuses a drifted immutable run instead of overwriting it')
    console.log(`[show-pack-factory-dogfood] PASS checks=${checks}; no network or model called`)
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
}

function expectFiles(path: string, expected: string[]): void {
  check(JSON.stringify(readdirSync(path).sort()) === JSON.stringify([...expected].sort()),
    `run ${path.split('/').pop()} has the exact expected artifact set`)
}

main().catch((error) => {
  console.error(`[show-pack-factory-dogfood] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
