import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { createSettlementReceipt, type SettlementReceipt } from './settlement-receipt'
import {
  assertShowPackFlywheelSeedMatchesReceipt,
  composeShowPackWithFlywheel,
  createShowPackFlywheelSeed,
  finalizeShowPackFlywheelComposition,
  serializeShowPackFlywheelSeed,
} from './show-pack-flywheel'
import { compileShowPack, parseShowPack, type ShowPack } from './show-pack'
import type { ShowPackResearchIntakeResult } from './show-pack-research-intake'

function card(playerId: string) {
  return {
    player_id: playerId,
    bingo: Array.from({ length: 25 }, (_, index) => ({
      label: index === 12 ? 'FREE' : `Square ${index + 1}`,
      marked: index === 12,
      free: index === 12,
    })),
  }
}

function receiptInput(source: SettlementReceipt['source'] = 'scripts/settle-room.mts'): SettlementReceipt {
  return {
    version: 1,
    source,
    room_code: 'NIGHT1',
    room_id: '22222222-2222-4222-8222-222222222222',
    settlement_id: '11111111-1111-4111-8111-111111111111',
    settlement_version: 3,
    manifest_hash: 'a'.repeat(64),
    revision: {
      settled_at: '2026-08-11T01:30:00.000Z',
      supersedes_id: '44444444-4444-4444-8444-444444444444',
    },
    show_pack: {
      registry_id: '33333333-3333-4333-8333-333333333333',
      pack_id: 'hotd-s3e7',
      version: 7,
    },
    players: [
      { id: 'player-one', name: 'Private Player One' },
      { id: 'player-two', name: 'Private Player Two' },
    ],
    characters: [
      { id: 'fox', name: 'The Fox', player_id: 'player-one' },
      { id: 'owl', name: 'The Owl' },
    ],
    settled_facts: [
      {
        id: 'fox-breaks-bargain',
        sequence: 1,
        title: 'The Fox breaks the bargain',
        outcome: 'resolved',
        board_status: 'authored',
        occurred_at: '2026-08-11T01:02:03.000Z',
        winner: { id: 'fox', name: 'The Fox' },
      },
      {
        id: 'gate-void',
        sequence: 2,
        title: 'The old gate opens',
        outcome: 'void',
        board_status: 'authored',
      },
      {
        id: 'witness-at-wall',
        sequence: 3,
        title: 'A witness reaches the wall',
        outcome: 'resolved',
        board_status: 'unscored',
        occurred_at: '2026-08-11T01:04:05.000Z',
        winner: { id: 'owl', name: 'The Owl' },
      },
    ],
    score_events: [
      {
        id: 'adjustment:1',
        kind: 'adjustment',
        player_id: 'player-one',
        character_id: 'fox',
        label: 'Duplicate declaration removed',
        points: -2,
      },
      {
        id: 'bingo-blackout:card-1',
        kind: 'bingo',
        player_id: 'player-two',
        label: 'Bingo blackout',
        points: 25,
      },
      {
        id: 'bingo-line:card-1:0',
        kind: 'bingo',
        player_id: 'player-two',
        label: 'Bingo line 1',
        points: 15,
      },
      {
        id: 'bingo-square:card-1:4',
        kind: 'bingo',
        player_id: 'player-two',
        label: 'A witness returns',
        points: 3,
      },
      {
        id: 'draft:4:primary:fox',
        kind: 'draft',
        player_id: 'player-one',
        character_id: 'fox',
        label: 'The Fox: breaks the bargain',
        points: 6,
        trigger: {
          source_signature_beat_id: 4,
          contract: {
            title: 'The Fox breaks the bargain',
            condition: 'The Fox must visibly refuse the agreed exchange.',
            exclusions: ['A private doubt without a refusal does not count.'],
            adjudication: {
              proxies: 'do_not_count',
              offscreen: 'do_not_count',
              mentions: 'do_not_count',
            },
            title_review: {
              status: 'approved',
              note: 'The title states the same visible refusal as the condition.',
            },
            basis_claim_ids: ['screen-bargain'],
          },
        },
      },
      {
        id: 'prediction:9',
        kind: 'prediction',
        player_id: 'player-two',
        label: 'The old gate opens',
        points: 5,
      },
    ],
    personal_cards: [card('player-one'), card('player-two')],
  }
}

const receiptSha256 = 'b'.repeat(64)

function authoringPack(): ShowPack {
  return parseShowPack(readFileSync(
    new URL('../../show-packs/examples/hotd-s3e8-proof.json', import.meta.url),
    'utf8',
  ))
}

describe('show-pack flywheel seed', () => {
  it('binds the exact predecessor settlement and carries every event once', () => {
    const seed = createShowPackFlywheelSeed(
      createSettlementReceipt(receiptInput()),
      receiptSha256,
    )

    expect(seed.predecessor).toEqual({
      pack_id: 'hotd-s3e7',
      settlement_id: '11111111-1111-4111-8111-111111111111',
      settlement_version: 3,
    })
    expect(seed.attestation).toEqual({
      pack_version: 7,
      registry_id: '33333333-3333-4333-8333-333333333333',
      receipt_source: 'scripts/settle-room.mts',
      manifest_hash: 'a'.repeat(64),
      receipt_sha256: receiptSha256,
      revision: {
        settled_at: '2026-08-11T01:30:00.000Z',
        supersedes_id: '44444444-4444-4444-8444-444444444444',
      },
    })
    expect(seed.schema_version).toBe(3)
    expect(seed.facts.map((fact) => fact.id)).toEqual([
      'fox-breaks-bargain',
      'gate-void',
      'witness-at-wall',
    ])
    expect(seed.events.map((event) => event.id)).toEqual([
      'adjustment:1',
      'bingo-blackout:card-1',
      'bingo-line:card-1:0',
      'bingo-square:card-1:4',
      'draft:4:primary:fox',
      'prediction:9',
    ])
    expect(new Set(seed.events.map((event) => event.id)).size).toBe(seed.events.length)
  })

  it('promotes resolved facts and bingo squares without duplicating draft or prediction scoring', () => {
    const seed = createShowPackFlywheelSeed(
      createSettlementReceipt(receiptInput()),
      receiptSha256,
    )

    expect(seed.screen_claims).toEqual([
      {
        id: 'predecessor-screen-fact-001',
        canon: 'screen',
        status: 'verified',
        text: 'The Fox breaks the bargain: The Fox',
        source_ids: ['predecessor-settlement'],
      },
      {
        id: 'predecessor-screen-fact-002',
        canon: 'screen',
        status: 'verified',
        text: 'A witness reaches the wall: The Owl',
        source_ids: ['predecessor-settlement'],
      },
      {
        id: 'predecessor-screen-bingo-001',
        canon: 'screen',
        status: 'verified',
        text: 'A witness returns',
        source_ids: ['predecessor-settlement'],
      },
    ])
    expect(seed.facts.map((fact) => [fact.id, fact.screen_claim_id])).toEqual([
      ['fox-breaks-bargain', 'predecessor-screen-fact-001'],
      ['gate-void', undefined],
      ['witness-at-wall', 'predecessor-screen-fact-002'],
    ])
    expect(seed.events.map((event) => [event.id, event.screen_claim_id])).toEqual([
      ['adjustment:1', undefined],
      ['bingo-blackout:card-1', undefined],
      ['bingo-line:card-1:0', undefined],
      ['bingo-square:card-1:4', 'predecessor-screen-bingo-001'],
      ['draft:4:primary:fox', undefined],
      ['prediction:9', undefined],
    ])
  })

  it('retains the complete roster and derives character impact from canonical events', () => {
    const seed = createShowPackFlywheelSeed(
      createSettlementReceipt(receiptInput()),
      receiptSha256,
    )

    expect(seed.entities).toEqual([
      {
        id: 'fox',
        name: 'The Fox',
        net_points: 4,
        event_ids: ['adjustment:1', 'draft:4:primary:fox'],
      },
      {
        id: 'owl',
        name: 'The Owl',
        net_points: 0,
        event_ids: [],
      },
    ])
  })

  it('carries the exact reviewed trigger doctrine with its settled event', () => {
    const receipt = createSettlementReceipt(receiptInput())
    const seed = createShowPackFlywheelSeed(receipt, receiptSha256)

    expect(seed.events.find((event) => event.id === 'draft:4:primary:fox')?.trigger)
      .toEqual(receipt.score_events.find((event) => event.id === 'draft:4:primary:fox')?.trigger)
  })

  it('emits a byte-stable, public-safe research artifact', () => {
    const receipt = createSettlementReceipt(receiptInput())
    const first = serializeShowPackFlywheelSeed(
      createShowPackFlywheelSeed(receipt, receiptSha256),
    )
    const second = serializeShowPackFlywheelSeed(
      createShowPackFlywheelSeed(receipt, receiptSha256),
    )

    expect(first).toBe(second)
    expect(first.endsWith('\n')).toBe(true)
    expect(first).not.toContain('Private Player')
    expect(first).not.toContain('player-one')
    expect(first).not.toContain('player-two')
    expect(first).not.toContain('personal_cards')
    expect(first).not.toContain('room_id')
  })

  it('retains the settled fact timeline when the settlement scored no events', () => {
    const emptyReceipt = receiptInput()
    emptyReceipt.score_events = []

    const seed = createShowPackFlywheelSeed(
      createSettlementReceipt(emptyReceipt),
      receiptSha256,
    )

    expect(seed.events).toEqual([])
    expect(seed.facts).toHaveLength(3)
    expect(seed.screen_claims.map((claim) => claim.id)).toEqual([
      'predecessor-screen-fact-001',
      'predecessor-screen-fact-002',
    ])
    expect(seed.entities.map((entity) => [entity.id, entity.net_points, entity.event_ids])).toEqual([
      ['fox', 0, []],
      ['owl', 0, []],
    ])
  })

  it('fails closed on invalid provenance and synthetic proof receipts', () => {
    const receipt = createSettlementReceipt(receiptInput())
    expect(() => createShowPackFlywheelSeed(receipt, 'not-a-digest'))
      .toThrow('receipt SHA-256 must be a lowercase SHA-256 digest')

    const legacy = createSettlementReceipt({ ...receiptInput(), show_pack: undefined })
    expect(() => createShowPackFlywheelSeed(legacy, receiptSha256))
      .toThrow('settlement receipt has no show-pack attestation')

    const noFacts = receiptInput()
    delete noFacts.settled_facts
    expect(() => createShowPackFlywheelSeed(createSettlementReceipt(noFacts), receiptSha256))
      .toThrow('settlement receipt has no settled-fact timeline; re-emit it with settle-room')

    const noRevision = receiptInput()
    delete noRevision.revision
    expect(() => createShowPackFlywheelSeed(createSettlementReceipt(noRevision), receiptSha256))
      .toThrow('settlement receipt has no revision provenance; re-emit it with settle-room')

    const proof = createSettlementReceipt(receiptInput('synthetic-proof'))
    expect(() => createShowPackFlywheelSeed(proof, receiptSha256))
      .toThrow('synthetic proof receipt requires explicit proof authority')
    const proofSeed = createShowPackFlywheelSeed(proof, receiptSha256, { allowProof: true })
    expect(proofSeed.artifact).toBe('show-pack-flywheel-seed')
    expect(proofSeed.attestation.receipt_source).toBe('synthetic-proof')
  })

  it('verifies that a flywheel seed exactly matches its canonical receipt', () => {
    const receipt = createSettlementReceipt(receiptInput())
    const seed = createShowPackFlywheelSeed(receipt, receiptSha256)

    expect(assertShowPackFlywheelSeedMatchesReceipt(
      serializeShowPackFlywheelSeed(seed),
      receipt,
      receiptSha256,
    )).toEqual(seed)

    const edited = structuredClone(seed)
    edited.events[0].points -= 1
    expect(() => assertShowPackFlywheelSeedMatchesReceipt(
      JSON.stringify(edited),
      receipt,
      receiptSha256,
    )).toThrow('flywheel seed does not match its canonical settlement receipt')
    expect(() => assertShowPackFlywheelSeedMatchesReceipt('{', receipt, receiptSha256))
      .toThrow('flywheel seed is not valid JSON')
  })

  it('composes receipt-owned evidence into a complete next-show pack', () => {
    const seed = createShowPackFlywheelSeed(
      createSettlementReceipt(receiptInput()),
      receiptSha256,
    )
    const pack = authoringPack()
    pack.entities[0].dossier.fact_claim_ids.push('predecessor-screen-fact-001')
    pack.predictions[0].basis_claim_ids.push('predecessor-screen-fact-002')

    const composed = composeShowPackWithFlywheel(JSON.stringify(pack), seed)
    const compiled = compileShowPack(composed)

    expect(compiled.pack.predecessor).toEqual(seed.predecessor)
    expect(compiled.sources).toContainEqual(seed.source)
    expect(compiled.claims).toEqual(expect.arrayContaining(seed.screen_claims))
    expect(compiled.entities[0].dossier.fact_claim_ids).toContain('predecessor-screen-fact-001')
    expect(compiled.predictions[0].basis_claim_ids).toContain('predecessor-screen-fact-002')
  })

  it('reserves predecessor evidence to one canonical composer', () => {
    const seed = createShowPackFlywheelSeed(
      createSettlementReceipt(receiptInput()),
      receiptSha256,
    )

    const withPredecessor = authoringPack()
    withPredecessor.pack.predecessor = seed.predecessor
    expect(() => composeShowPackWithFlywheel(JSON.stringify(withPredecessor), seed))
      .toThrow('flywheel authoring pack must omit pack.predecessor')

    const withSource = authoringPack()
    withSource.sources.push(seed.source)
    expect(() => composeShowPackWithFlywheel(JSON.stringify(withSource), seed))
      .toThrow('flywheel source id predecessor-settlement is reserved')

    const withClaim = authoringPack()
    withClaim.claims.push(seed.screen_claims[0])
    expect(() => composeShowPackWithFlywheel(JSON.stringify(withClaim), seed))
      .toThrow('flywheel claim id predecessor-screen-fact-001 is reserved')

    const withInventedPredecessorClaim = authoringPack()
    withInventedPredecessorClaim.claims.push({
      ...seed.screen_claims[0],
      id: 'predecessor-screen-999',
    })
    expect(() => composeShowPackWithFlywheel(JSON.stringify(withInventedPredecessorClaim), seed))
      .toThrow('flywheel claim id predecessor-screen-999 is reserved')
  })

  it('stages injected claims for grounded commentary before the publication gate', () => {
    const seed = createShowPackFlywheelSeed(
      createSettlementReceipt(receiptInput()),
      receiptSha256,
    )
    const pack = authoringPack()
    pack.commentary_requests.push({
      id: 'predecessor-reaction',
      speaker: 'cersei',
      fact_claim_ids: ['predecessor-screen-fact-001'],
      angle_claim_ids: [],
      angle: 'Judge what this settled turn changes about the next show.',
      publication: { status: 'pending' },
    })
    const composed = composeShowPackWithFlywheel(JSON.stringify(pack), seed)

    expect(finalizeShowPackFlywheelComposition(composed, 'authoring').commentary_requests[0])
      .toMatchObject({ fact_claim_ids: ['predecessor-screen-fact-001'], publication: { status: 'pending' } })
    expect(() => finalizeShowPackFlywheelComposition(composed, 'compiled'))
      .toThrow('commentary predecessor-reaction is not ready for publication')
  })

  it('injects reviewed recap and sentiment research beside canonical predecessor evidence', () => {
    const seed = createShowPackFlywheelSeed(
      createSettlementReceipt(receiptInput()),
      receiptSha256,
    )
    const research: ShowPackResearchIntakeResult = {
      result_version: 1,
      artifact: 'show-pack-research-intake',
      target: seed.predecessor,
      packet_sha256: 'c'.repeat(64),
      decisions_sha256: 'd'.repeat(64),
      sources: [{
        id: 'predecessor-recap-review', kind: 'recap',
        title: 'Reviewed recap', locator: 'https://example.test/recap',
      }, {
        id: 'predecessor-sentiment-review', kind: 'sentiment',
        title: 'Reviewed sentiment', locator: 'research:sentiment',
      }],
      claims: [{
        id: 'reviewed-recap-claim', canon: 'screen', status: 'verified',
        text: 'The Fox broke the bargain.',
        source_ids: ['predecessor-recap-review', 'predecessor-settlement'],
      }, {
        id: 'reviewed-discourse-claim', canon: 'discourse', status: 'verified',
        text: 'The bargain break drew strong approval.',
        source_ids: ['predecessor-sentiment-review'],
      }],
    }
    const pack = authoringPack()
    pack.entities[0].dossier.discourse_claim_ids.push('reviewed-discourse-claim')

    const composed = composeShowPackWithFlywheel(JSON.stringify(pack), seed, research)

    expect(composed.sources).toEqual(expect.arrayContaining(research.sources))
    expect(composed.claims).toEqual(expect.arrayContaining(research.claims))
    expect(composed.entities[0].dossier.discourse_claim_ids).toContain('reviewed-discourse-claim')
  })

  it('rejects research for another settlement and invalid intake provenance', () => {
    const seed = createShowPackFlywheelSeed(
      createSettlementReceipt(receiptInput()),
      receiptSha256,
    )
    const research: ShowPackResearchIntakeResult = {
      result_version: 1,
      artifact: 'show-pack-research-intake',
      target: { ...seed.predecessor, settlement_version: seed.predecessor.settlement_version + 1 },
      packet_sha256: 'c'.repeat(64), decisions_sha256: 'd'.repeat(64), sources: [], claims: [],
    }
    expect(() => composeShowPackWithFlywheel(JSON.stringify(authoringPack()), seed, research))
      .toThrow('research intake does not target the canonical flywheel settlement')

    research.target = seed.predecessor
    research.decisions_sha256 = 'not-a-digest'
    expect(() => composeShowPackWithFlywheel(JSON.stringify(authoringPack()), seed, research))
      .toThrow('research intake provenance is invalid')
  })
})
