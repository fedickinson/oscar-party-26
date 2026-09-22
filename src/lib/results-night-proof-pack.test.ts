import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BOARD_TIER_MIX } from './bingo-utils'
import {
  compileShowPack,
  parseShowPack,
  resolveGameContract,
  type LikelihoodTier,
  type ShowPackGameContract,
} from './show-pack'
import {
  assertActivatableShowPack,
  buildShowPackActivationPlan,
  describeShowPackRuntime,
} from './show-pack-activation'

/**
 * The Results Night example pack is the template the next real event is
 * authored from, so its contract profile, activation shape and sealed portraits
 * are proven here rather than only by the compile CLI.
 */
const packUrl = new URL('../../show-packs/examples/results-night-proof.json', import.meta.url)
const authored = parseShowPack(readFileSync(packUrl, 'utf8'))

/** Byte-for-byte the profile in results_night_game_contract(). */
const RESULTS_NIGHT_PROFILE: ShowPackGameContract = {
  version: 1,
  commitment: 'confidence_allocation',
  conviction_budget: null,
  identity: { selection: 'exclusive_entity_draft', scoring: 'ensemble' },
  scarcity: { commitments: 'ranked_allocation', identity: 'exclusive' },
  visibility: 'sealed_until_lock',
  cadence: 'immediate_per_outcome',
  continuity: 'no_carryover',
}

describe('results-night example show pack', () => {
  it('compiles to exactly the Results Night contract profile', () => {
    const compiled = compileShowPack(authored)
    expect(compiled.schema_version).toBe(4)
    expect(compiled.game_contract).toEqual(RESULTS_NIGHT_PROFILE)
    expect(resolveGameContract(compiled)).toEqual(RESULTS_NIGHT_PROFILE)
    expect(describeShowPackRuntime(compiled).gameModel).toBe('legacy_ensemble')
  })

  it('declares official_result authority on every wager', () => {
    const compiled = compileShowPack(authored)
    expect(compiled.pack.fact_source).toBe('scheduled')
    for (const wager of [
      ...compiled.predictions,
      ...compiled.signature_beats,
      ...compiled.bingo_squares,
    ]) {
      expect(wager.truth_authority).toBe('official_result')
      expect(wager.exclusions.length).toBeGreaterThan(0)
      expect(wager.basis_claim_ids.length).toBeGreaterThan(0)
      expect(wager.title_review.status).toBe('approved')
      for (const decision of Object.values(wager.adjudication)) {
        expect(decision).not.toBe('unspecified')
      }
    }
  })

  it('passes the activation gate and projects the full normalized catalog', async () => {
    const compiled = compileShowPack(authored)
    expect(() => assertActivatableShowPack(compiled)).not.toThrow()

    const plan = await buildShowPackActivationPlan(authored)
    expect(plan.packRef).toBe('results-night-proof@1')
    expect(plan.showPack.game_contract).toEqual(RESULTS_NIGHT_PROFILE)
    expect(plan.nominees).toHaveLength(6)
    expect(plan.draftEntities).toHaveLength(6)
    expect(plan.categories).toHaveLength(5)
    expect(plan.signatureBeats).toHaveLength(6)
    expect(plan.bingoSquares.length).toBeGreaterThanOrEqual(24)
    expect(plan.manifestSha256).toMatch(/^[0-9a-f]{64}$/)
    for (const beat of plan.signatureBeats) {
      expect(beat.entity_id).toBeTruthy()
      expect(['likely', 'toss_up', 'long_shot', 'chaos']).toContain(beat.odds)
    }
    for (const category of plan.categories) {
      const candidates = plan.categoryNominees.filter((row) => row.category_id === category.id)
      expect(candidates.length).toBeGreaterThanOrEqual(3)
      expect(candidates.length).toBeLessThanOrEqual(6)
    }
  })

  it('carries enough of every tier to deal one full board', () => {
    const counts = new Map<LikelihoodTier, number>()
    for (const square of authored.bingo_squares) {
      counts.set(square.likelihood_tier, (counts.get(square.likelihood_tier) ?? 0) + 1)
    }
    for (const [tier, needed] of Object.entries(BOARD_TIER_MIX) as Array<[LikelihoodTier, number]>) {
      expect(counts.get(tier) ?? 0).toBeGreaterThanOrEqual(needed)
    }
  })

  it('projects a complete four-voice runtime cast with post-show order', () => {
    const voices = authored.commentary_voices
    expect(voices).toHaveLength(4)
    expect(voices.every((voice) => voice.runtime !== undefined)).toBe(true)
    expect(voices.filter((voice) => voice.runtime?.slot === 'narrator')).toHaveLength(1)
    const farewells = voices
      .map((voice) => voice.runtime!.post_show!.farewell)
      .sort((left, right) => left.order - right.order)
    expect(farewells.map((farewell) => farewell.order)).toEqual([1, 2, 3, 4])
    expect(farewells[0].delay_seconds).toBe(0)
    for (let index = 1; index < farewells.length; index += 1) {
      expect(farewells[index].delay_seconds).toBeGreaterThan(farewells[index - 1].delay_seconds)
    }
    const milestone = authored.runtime_ceremonies?.milestones?.[0]
    expect(milestone?.declared_event_count).toBe(3)
    const runtimeIds = new Set(voices.map((voice) => voice.id))
    for (const speaker of milestone?.voices ?? []) expect(runtimeIds.has(speaker.voice_id)).toBe(true)
  })

  it('seals every portrait against the committed bytes under public/', () => {
    for (const entity of authored.entities) {
      const file = new URL(`../../public${entity.portrait.path}`, import.meta.url)
      const bytes = readFileSync(file)
      expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(entity.portrait.sha256)
    }
  })

  it('fails the activation gate when the contract drifts off the profile', () => {
    const drifted = compileShowPack(authored)
    drifted.game_contract = { ...RESULTS_NIGHT_PROFILE, visibility: 'open_counts' }
    expect(() => assertActivatableShowPack(drifted)).toThrow('Results Night contract profile')
  })
})
