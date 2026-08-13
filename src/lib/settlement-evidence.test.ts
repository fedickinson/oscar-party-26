import { describe, expect, it } from 'vitest'
import {
  buildPostCloseSettlementReceipt,
  buildSettlementReceiptEvidence,
  buildSettlementReceiptFacts,
} from './settlement-evidence'
import type {
  BingoCardRow,
  BingoMarkRow,
  BingoSquareRow,
  CategoryRow,
  ConfidencePickRow,
  ConvictionPickRow,
  DraftEntityRow,
  DraftPickRow,
  NomineeRow,
  PlayerRow,
  RoomSettlementEntryRow,
} from '../types/database'

const triggerContract = {
  title: 'Finds the path',
  condition: 'The Wolf must visibly find and enter the hidden path.',
  exclusions: ['A map alone does not count.'],
  adjudication: {
    proxies: 'do_not_count' as const,
    offscreen: 'do_not_count' as const,
    mentions: 'do_not_count' as const,
  },
  title_review: {
    status: 'approved' as const,
    note: 'The title matches the visible action.',
  },
  basis_claim_ids: ['screen-claim-42'],
}

function fixture() {
  const players = [
    { id: 'arya', name: 'Arya' },
    { id: 'tyrion', name: 'Tyrion' },
  ] as PlayerRow[]
  const categories = [{
    id: 1,
    name: 'Finds the path',
    points: 4,
    winner_id: 'nominee-wolf',
    tie_winner_id: null,
    display_order: 1,
    source_signature_beat_id: 42,
    source_trigger_contract: triggerContract,
  }] as CategoryRow[]
  const nominees = [{
    id: 'nominee-wolf',
    name: 'The Wolf',
    type: 'person',
    film_name: 'House Wolf',
  }, {
    id: 'nominee-scribe',
    name: 'The Scribe',
    type: 'person',
    film_name: 'House Scribe',
  }] as NomineeRow[]
  const draftEntities = [{
    id: 'wolf',
    name: 'The Wolf',
    type: 'person',
    film_name: 'House Wolf',
    nominations: [],
    nom_count: 0,
  }] as DraftEntityRow[]
  const draftPicks = [{ id: 'pick-wolf', player_id: 'arya', entity_id: 'wolf' }] as DraftPickRow[]
  const confidencePicks = [{
    id: 'pick-path',
    player_id: 'tyrion',
    category_id: 1,
    nominee_id: 'nominee-wolf',
    confidence: 3,
    is_correct: true,
  }] as ConfidencePickRow[]
  const squareIds = Array.from({ length: 25 }, (_, index) => index === 12 ? 0 : index + 1)
  const bingoCards = [
    { id: 'card-arya', player_id: 'arya', squares: squareIds },
    { id: 'card-tyrion', player_id: 'tyrion', squares: squareIds },
  ] as BingoCardRow[]
  const bingoSquares = squareIds
    .filter((id) => id !== 0)
    .map((id) => ({
      id,
      title: `Square ${id}`,
      likelihood_tier: 'likely',
    })) as BingoSquareRow[]
  const bingoMarks = [0, 1, 2, 3, 4].map((squareIndex) => ({
    id: `mark-${squareIndex}`,
    card_id: 'card-arya',
    square_index: squareIndex,
    status: 'approved',
  })) as BingoMarkRow[]

  return {
    players,
    categories,
    nominees,
    draftEntities,
    draftPicks,
    confidencePicks,
    bingoCards,
    bingoSquares,
    bingoMarks,
  }
}

describe('settlement receipt evidence', () => {
  it('turns the complete ordered settlement timeline into public receipt facts', () => {
    const entries = [
      {
        id: 30,
        entry_key: 'witness-at-wall',
        name: 'The witness reaches the wall',
        category_id: null,
        outcome: 'resolved',
        winner_id: 'nominee-wolf',
        tie_winner_id: 'nominee-scribe',
        display_order: 3,
        occurred_at: '2026-08-11T01:04:05.000Z',
      },
      {
        id: 10,
        entry_key: 'path-found',
        name: 'The hidden path is found',
        category_id: 1,
        outcome: 'resolved',
        winner_id: 'nominee-wolf',
        tie_winner_id: null,
        display_order: 1,
        occurred_at: '2026-08-11T01:02:03.000Z',
      },
      {
        id: 20,
        entry_key: 'gate-void',
        name: 'The north gate opens',
        category_id: 2,
        outcome: 'void',
        winner_id: null,
        tie_winner_id: null,
        display_order: 2,
        occurred_at: null,
      },
    ] as RoomSettlementEntryRow[]

    expect(buildSettlementReceiptFacts(entries, fixture().nominees)).toEqual([
      {
        id: 'path-found',
        sequence: 1,
        title: 'The hidden path is found',
        outcome: 'resolved',
        board_status: 'authored',
        occurred_at: '2026-08-11T01:02:03.000Z',
        winner: { id: 'nominee-wolf', name: 'The Wolf' },
      },
      {
        id: 'gate-void',
        sequence: 2,
        title: 'The north gate opens',
        outcome: 'void',
        board_status: 'authored',
      },
      {
        id: 'witness-at-wall',
        sequence: 3,
        title: 'The witness reaches the wall',
        outcome: 'resolved',
        board_status: 'unscored',
        occurred_at: '2026-08-11T01:04:05.000Z',
        winner: { id: 'nominee-wolf', name: 'The Wolf' },
        tie_winner: { id: 'nominee-scribe', name: 'The Scribe' },
      },
    ])
  })

  it('fails closed when settlement facts cannot resolve their winner or ordering', () => {
    const entry = {
      id: 10,
      entry_key: 'path-found',
      name: 'The hidden path is found',
      category_id: 1,
      outcome: 'resolved',
      winner_id: 'missing-nominee',
      tie_winner_id: null,
      display_order: 1,
      occurred_at: '2026-08-11T01:02:03.000Z',
    } as RoomSettlementEntryRow
    expect(() => buildSettlementReceiptFacts([entry], fixture().nominees))
      .toThrow('settlement entry path-found references unknown winner missing-nominee')

    const duplicate = { ...entry, id: 11, entry_key: 'second-fact', winner_id: 'nominee-wolf' }
    expect(() => buildSettlementReceiptFacts([
      { ...entry, winner_id: 'nominee-wolf' },
      duplicate,
    ], fixture().nominees)).toThrow('duplicate settlement display order 1')
  })

  it('itemizes the same draft, prediction, square, and line points as canonical scoring', () => {
    const evidence = buildSettlementReceiptEvidence(fixture())

    expect(evidence.players).toEqual([
      { id: 'arya', name: 'Arya' },
      { id: 'tyrion', name: 'Tyrion' },
    ])
    expect(evidence.characters).toEqual([
      { id: 'wolf', name: 'The Wolf', player_id: 'arya' },
    ])
    expect(evidence.score_events).toEqual([
      {
        id: 'bingo-line:card-arya:0',
        kind: 'bingo',
        player_id: 'arya',
        label: 'Bingo line 1',
        points: 15,
      },
      ...[0, 1, 2, 3, 4].map((index) => ({
        id: `bingo-square:card-arya:${index}`,
        kind: 'bingo' as const,
        player_id: 'arya',
        label: `Square ${index + 1}`,
        points: 1,
      })),
      {
        id: 'draft:1:primary:wolf',
        kind: 'draft',
        player_id: 'arya',
        character_id: 'wolf',
        label: 'The Wolf: Finds the path',
        points: 6,
        trigger: {
          source_signature_beat_id: 42,
          contract: triggerContract,
        },
      },
      {
        id: 'prediction:pick-path',
        kind: 'prediction',
        player_id: 'tyrion',
        label: 'Finds the path: The Wolf',
        points: 3,
      },
    ])
    expect(evidence.personal_cards[0].player_id).toBe('arya')
    expect(evidence.personal_cards[0].bingo[0]).toEqual({ label: 'Square 1', marked: true, free: false })
    expect(evidence.personal_cards[0].bingo[12]).toEqual({ label: 'FREE', marked: true, free: true })
    expect(evidence.personal_cards[1].bingo[0].marked).toBe(false)
  })

  it('settles a crowded conviction pot as prediction evidence without character ownership', () => {
    const input = fixture()
    const evidence = buildSettlementReceiptEvidence({
      ...input,
      gameModel: 'conviction_portfolio',
      confidencePicks: [],
      convictionPicks: [
        { room_id: 'room-1', player_id: 'arya', beat_id: 42, created_at: '' },
        { room_id: 'room-1', player_id: 'tyrion', beat_id: 42, created_at: '' },
      ] as ConvictionPickRow[],
    })

    expect(evidence.score_events).toContainEqual({
      id: 'conviction:1:arya',
      kind: 'prediction',
      player_id: 'arya',
      label: 'Finds the path',
      points: 2,
      trigger: {
        source_signature_beat_id: 42,
        contract: triggerContract,
      },
    })
    expect(evidence.score_events).toContainEqual(expect.objectContaining({
      id: 'conviction:1:tyrion',
      points: 2,
    }))
    expect(evidence.score_events.some((event) => event.kind === 'draft')).toBe(false)
  })

  it('fails closed when a card or square cannot be represented canonically', () => {
    const missingCard = fixture()
    missingCard.bingoCards.pop()
    expect(() => buildSettlementReceiptEvidence(missingCard)).toThrow('player tyrion has no bingo card')

    const missingSquare = fixture()
    missingSquare.bingoSquares = missingSquare.bingoSquares.filter((square) => square.id !== 1)
    expect(() => buildSettlementReceiptEvidence(missingSquare)).toThrow('card card-arya references missing square 1')
  })

  it('rejects a declaration that carries only half of its source provenance', () => {
    const evidence = fixture()
    evidence.categories[0].source_trigger_contract = null

    expect(() => buildSettlementReceiptEvidence(evidence)).toThrow(
      'category 1 has incomplete source-beat provenance',
    )
  })

  it('assembles receipt identity only from the frozen post-close rows', () => {
    const receipt = buildPostCloseSettlementReceipt({
      room: {
        id: '11111111-1111-4111-8111-111111111111',
        code: 'ROOM1',
        phase: 'closed',
        show_pack_id: '22222222-2222-4222-8222-222222222222',
        active_settlement_id: '33333333-3333-4333-8333-333333333333',
      },
      settlement: {
        id: '33333333-3333-4333-8333-333333333333',
        room_id: '11111111-1111-4111-8111-111111111111',
        version: 2,
        manifest_hash: 'a'.repeat(64),
        supersedes_id: '44444444-4444-4444-8444-444444444444',
        created_at: '2026-08-11T01:30:00.000Z',
      },
      showPack: {
        id: '22222222-2222-4222-8222-222222222222',
        pack_key: 'proof-show',
        version: 7,
      },
      facts: [{
        id: 'path-found',
        sequence: 1,
        title: 'The hidden path is found',
        outcome: 'resolved',
        board_status: 'authored',
        winner: { id: 'nominee-wolf', name: 'The Wolf' },
      }],
      evidence: buildSettlementReceiptEvidence(fixture()),
    })

    expect(receipt).toMatchObject({
      source: 'scripts/settle-room.mts',
      room_code: 'ROOM1',
      room_id: '11111111-1111-4111-8111-111111111111',
      settlement_id: '33333333-3333-4333-8333-333333333333',
      settlement_version: 2,
      manifest_hash: 'a'.repeat(64),
      revision: {
        settled_at: '2026-08-11T01:30:00.000Z',
        supersedes_id: '44444444-4444-4444-8444-444444444444',
      },
      show_pack: {
        registry_id: '22222222-2222-4222-8222-222222222222',
        pack_id: 'proof-show',
        version: 7,
      },
    })
    expect(receipt.score_events).toHaveLength(8)
    expect(receipt.settled_facts?.map((fact) => fact.id)).toEqual(['path-found'])
  })

  it('rejects post-close rows that do not describe one canonical record', () => {
    const input = {
      room: {
        id: '11111111-1111-4111-8111-111111111111',
        code: 'ROOM1',
        phase: 'closed' as const,
        show_pack_id: '22222222-2222-4222-8222-222222222222',
        active_settlement_id: '33333333-3333-4333-8333-333333333333',
      },
      settlement: {
        id: '33333333-3333-4333-8333-333333333333',
        room_id: '11111111-1111-4111-8111-111111111111',
        version: 1,
        manifest_hash: 'a'.repeat(64),
        supersedes_id: null,
        created_at: '2026-08-11T01:30:00.000Z',
      },
      showPack: {
        id: '22222222-2222-4222-8222-222222222222',
        pack_key: 'proof-show',
        version: 7,
      },
      facts: [{
        id: 'path-found',
        sequence: 1,
        title: 'The hidden path is found',
        outcome: 'resolved' as const,
        board_status: 'authored' as const,
        winner: { id: 'nominee-wolf', name: 'The Wolf' },
      }],
      evidence: buildSettlementReceiptEvidence(fixture()),
    }

    expect(() => buildPostCloseSettlementReceipt({
      ...input,
      room: { ...input.room, phase: 'finished' },
    })).toThrow('post-close receipt requires a closed room')
    expect(() => buildPostCloseSettlementReceipt({
      ...input,
      room: {
        ...input.room,
        active_settlement_id: '55555555-5555-4555-8555-555555555555',
      },
    })).toThrow('post-close receipt settlement is not active for room ROOM1')
    expect(() => buildPostCloseSettlementReceipt({
      ...input,
      settlement: {
        ...input.settlement,
        room_id: '55555555-5555-4555-8555-555555555555',
      },
    })).toThrow('post-close receipt settlement belongs to another room')
    expect(() => buildPostCloseSettlementReceipt({
      ...input,
      showPack: {
        ...input.showPack,
        id: '55555555-5555-4555-8555-555555555555',
      },
    })).toThrow('post-close receipt show pack is not bound to room ROOM1')
  })
})
