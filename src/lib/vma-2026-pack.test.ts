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
 * The real 2026 MTV Video Music Awards pack. Authored from the committed
 * research packets under show-packs/research/vma-2026/research/, which are all
 * search-summary grade pending a round-two source verification pass. This test
 * proves the contract profile, the activation gate, the dealable bingo pool and
 * the sealed portraits without touching Supabase or the network.
 */
const packUrl = new URL('../../show-packs/research/vma-2026/vma-2026-authoring.json', import.meta.url)
const authored = parseShowPack(readFileSync(packUrl, 'utf8'))

const oddsUrl = new URL('../../show-packs/research/vma-2026/research/03-odds.json', import.meta.url)
const odds = JSON.parse(readFileSync(oddsUrl, 'utf8')) as {
  categories: Array<{ category: string; candidates: Array<{ artist_id: string }> }>
}

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

describe('2026 VMA show pack', () => {
  it('compiles to exactly the Results Night contract profile', () => {
    const compiled = compileShowPack(authored)
    expect(compiled.schema_version).toBe(4)
    expect(compiled.pack.id).toBe('vma-2026')
    expect(compiled.pack.version).toBe(1)
    expect(compiled.pack.fact_source).toBe('scheduled')
    expect(compiled.game_contract).toEqual(RESULTS_NIGHT_PROFILE)
    expect(resolveGameContract(compiled)).toEqual(RESULTS_NIGHT_PROFILE)
    expect(describeShowPackRuntime(compiled).gameModel).toBe('legacy_ensemble')
  })

  it('declares official_result authority and explicit doctrine on every wager', () => {
    const compiled = compileShowPack(authored)
    for (const wager of [
      ...compiled.predictions,
      ...compiled.signature_beats,
      ...compiled.bingo_squares,
    ]) {
      expect(wager.truth_authority).toBe('official_result')
      expect(wager.exclusions.length).toBeGreaterThan(0)
      expect(wager.basis_claim_ids.length).toBeGreaterThan(0)
      expect(wager.title_review.status).toBe('approved')
      expect(wager.title_review.note.trim().length).toBeGreaterThan(0)
      for (const decision of Object.values(wager.adjudication)) {
        expect(decision).not.toBe('unspecified')
      }
    }
    for (const square of compiled.bingo_squares) {
      expect(square.adjudication).toEqual({
        proxies: 'do_not_count',
        offscreen: 'do_not_count',
        mentions: 'do_not_count',
      })
      expect(square.why_it_is_fun.trim().length).toBeGreaterThan(0)
      expect(square.storyline_tags.length).toBeGreaterThan(0)
    }
  })

  it('keeps every wager on a verified screen or discourse claim', () => {
    const canonById = new Map(authored.claims.map((claim) => [claim.id, claim]))
    for (const wager of [
      ...authored.predictions,
      ...authored.signature_beats,
      ...authored.bingo_squares,
    ]) {
      for (const claimId of wager.basis_claim_ids) {
        const claim = canonById.get(claimId)
        expect(claim).toBeDefined()
        expect(claim!.status).toBe('verified')
        expect(['screen', 'discourse']).toContain(claim!.canon)
      }
    }
    // Discourse never grounds a prediction on its own or at all.
    for (const prediction of authored.predictions) {
      for (const claimId of prediction.basis_claim_ids) {
        expect(canonById.get(claimId)!.canon).toBe('screen')
      }
    }
  })

  it('passes the activation gate and projects the full normalized catalog', async () => {
    const compiled = compileShowPack(authored)
    expect(() => assertActivatableShowPack(compiled)).not.toThrow()

    const plan = await buildShowPackActivationPlan(authored)
    expect(plan.packRef).toBe('vma-2026@1')
    expect(plan.showPack.game_contract).toEqual(RESULTS_NIGHT_PROFILE)
    expect(plan.nominees).toHaveLength(67)
    expect(plan.draftEntities).toHaveLength(67)
    expect(plan.categories).toHaveLength(23)
    // confidence_picks caps a ranked confidence number at 24.
    expect(plan.categories.length).toBeLessThanOrEqual(24)
    expect(plan.signatureBeats).toHaveLength(12)
    expect(plan.bingoSquares.length).toBeGreaterThanOrEqual(24)
    expect(plan.manifestSha256).toMatch(/^[0-9a-f]{64}$/)
    for (const beat of plan.signatureBeats) {
      expect(beat.entity_id).toBeTruthy()
      expect(beat.partner_entity_id).toBeNull()
      expect(['likely', 'toss_up', 'long_shot', 'chaos']).toContain(beat.odds)
    }
    for (const category of plan.categories) {
      const candidates = plan.categoryNominees.filter((row) => row.category_id === category.id)
      expect(candidates.length).toBeGreaterThanOrEqual(2)
    }
    expect(plan.categoryNominees).toHaveLength(155)
  })

  it('resolves every odds-file category and candidate onto the pack', () => {
    const compiled = compileShowPack(authored)
    const titles = new Set(compiled.predictions.map((prediction) => prediction.title))
    const entityIds = new Set(compiled.entities.map((entity) => entity.id))
    const candidatesByTitle = new Map(
      compiled.predictions.map((prediction) => [prediction.title, new Set(prediction.candidate_entity_ids)]),
    )
    expect(titles.size).toBe(odds.categories.length)
    for (const category of odds.categories) {
      expect(titles.has(category.category)).toBe(true)
      const packCandidates = candidatesByTitle.get(category.category)!
      for (const candidate of category.candidates) {
        expect(entityIds.has(candidate.artist_id)).toBe(true)
        expect(packCandidates.has(candidate.artist_id)).toBe(true)
      }
      // D1: duplicates within a category collapse to one candidate slot.
      expect(packCandidates.size).toBe(new Set(category.candidates.map((row) => row.artist_id)).size)
    }
  })

  it('prices every category on the D8 placeholder scale', () => {
    const marquee = new Set([
      'Video of the Year',
      'Artist of the Year',
      'Song of the Year',
      'Best New Artist',
    ])
    const lowTier = new Set([
      'Best Direction',
      'Best Choreography',
      'Best Cinematography',
      'Best Editing',
      'Best Visual Effects',
      'Best Art Direction',
      'Best Group',
      'Best Long Form Video',
      'Best Album',
      'Song of Summer',
    ])
    for (const prediction of authored.predictions) {
      if (marquee.has(prediction.title)) {
        expect(prediction.points).toBe(8)
        expect(prediction.tier).toBe(1)
      } else if (lowTier.has(prediction.title)) {
        expect(prediction.points).toBe(6)
        expect(prediction.tier).toBe(3)
      } else {
        expect(prediction.points).toBe(6)
        expect(prediction.tier).toBe(2)
      }
    }
  })

  it('names one draftable entity on every signature beat', () => {
    const draftable = new Set(
      authored.entities.filter((entity) => entity.draftable).map((entity) => entity.id),
    )
    expect(authored.signature_beats.length).toBeGreaterThanOrEqual(8)
    expect(authored.signature_beats.length).toBeLessThanOrEqual(12)
    for (const beat of authored.signature_beats) {
      expect(beat.entity_ids).toHaveLength(1)
      expect(draftable.has(beat.entity_ids[0])).toBe(true)
    }
  })

  it('carries enough of every tier to deal one full board', () => {
    expect(authored.bingo_squares.length).toBeGreaterThanOrEqual(40)
    expect(authored.bingo_squares.length).toBeLessThanOrEqual(48)
    const counts = new Map<LikelihoodTier, number>()
    for (const square of authored.bingo_squares) {
      counts.set(square.likelihood_tier, (counts.get(square.likelihood_tier) ?? 0) + 1)
    }
    for (const [tier, needed] of Object.entries(BOARD_TIER_MIX) as Array<[LikelihoodTier, number]>) {
      expect(counts.get(tier) ?? 0).toBeGreaterThanOrEqual(needed)
    }
  })

  it('derives every likelihood tier exactly from its authored probability', () => {
    const expected = (pct: number): LikelihoodTier => {
      if (pct >= 60) return 'likely'
      if (pct >= 40) return 'toss_up'
      if (pct >= 20) return 'long_shot'
      return 'chaos'
    }
    for (const trigger of [...authored.bingo_squares, ...authored.signature_beats]) {
      expect(trigger.likelihood_tier).toBe(expected(trigger.probability_pct))
    }
  })

  it('projects a complete four-voice runtime cast with post-show order', () => {
    const voices = authored.commentary_voices
    expect(voices.map((voice) => voice.id)).toEqual(['tally', 'flare', 'archivum', 'glimmer'])
    expect(voices.every((voice) => voice.runtime !== undefined)).toBe(true)
    expect(voices.filter((voice) => voice.runtime?.slot === 'narrator')).toHaveLength(1)
    expect(authored.commentary_requests).toHaveLength(0)
    const attitudeById = new Map(authored.claims.map((claim) => [claim.id, claim]))
    for (const voice of voices) {
      expect(voice.attitude_claim_ids.length).toBeGreaterThan(0)
      for (const claimId of voice.attitude_claim_ids) {
        expect(attitudeById.get(claimId)!.canon).toBe('source_material')
        expect(attitudeById.get(claimId)!.status).toBe('attitude_only')
      }
    }
    const farewells = voices
      .map((voice) => voice.runtime!.post_show!.farewell)
      .sort((left, right) => left.order - right.order)
    expect(farewells.map((farewell) => farewell.order)).toEqual([1, 2, 3, 4])
    expect(farewells[0].delay_seconds).toBe(0)
    for (let index = 1; index < farewells.length; index += 1) {
      expect(farewells[index].delay_seconds).toBeGreaterThan(farewells[index - 1].delay_seconds)
    }
    const milestones = authored.runtime_ceremonies?.milestones ?? []
    expect(milestones.map((milestone) => milestone.declared_event_count)).toEqual([5, 12])
    const runtimeIds = new Set(voices.map((voice) => voice.id))
    for (const milestone of milestones) {
      expect(milestone.voices).toHaveLength(4)
      for (const speaker of milestone.voices) expect(runtimeIds.has(speaker.voice_id)).toBe(true)
    }
  })

  it('seals every portrait against the committed bytes under public/', () => {
    expect(authored.entities).toHaveLength(67)
    for (const entity of authored.entities) {
      expect(entity.kind).toBe('person')
      expect(entity.draftable).toBe(true)
      expect(entity.portrait.path).toBe(`/portraits/vma-2026/${entity.id}.png`)
      const file = new URL(`../../public${entity.portrait.path}`, import.meta.url)
      const bytes = readFileSync(file)
      expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(entity.portrait.sha256)
    }
  })

  it('records the round-two verification caveat on every source', () => {
    expect(authored.sources).toHaveLength(7)
    for (const source of authored.sources) {
      expect(source.title).toContain('search-summary grade; round-two source verification pending')
    }
  })

  it('fails the activation gate when the contract drifts off the profile', () => {
    const drifted = compileShowPack(authored)
    drifted.game_contract = { ...RESULTS_NIGHT_PROFILE, visibility: 'open_counts' }
    expect(() => assertActivatableShowPack(drifted)).toThrow('Results Night contract profile')
  })
})
