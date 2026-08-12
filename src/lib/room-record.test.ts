import { describe, expect, it } from 'vitest'
import { buildCanonicalRoomRecord } from './room-record'
import type {
  BingoMarkRow,
  CategoryRow,
  ConfidencePickRow,
  RoomSettlementBingoMarkRow,
  RoomSettlementEntryRow,
  RoomSettlementRow,
  RoomWinnerRow,
} from '../types/database'

const categories: CategoryRow[] = [
  {
    id: 1,
    name: 'The Crown',
    tier: 1,
    points: 10,
    display_order: 1,
    winner_id: null,
    tie_winner_id: null,
    announced_at: null,
    source_signature_beat_id: 42,
    source_trigger_contract: {
      title: 'The Crown',
      condition: 'The crown must be placed visibly.',
      exclusions: ['A spoken intention does not count.'],
      adjudication: {
        proxies: 'do_not_count',
        offscreen: 'do_not_count',
        mentions: 'do_not_count',
      },
      title_review: { status: 'approved', note: 'The title matches the rule.' },
      basis_claim_ids: ['claim-crown'],
    },
  },
  { id: 2, name: 'The Dragon', tier: 2, points: 8, display_order: 2, winner_id: null, tie_winner_id: null, announced_at: null },
  { id: 99, name: 'Provisional only', tier: 3, points: 4, display_order: 99, winner_id: null, tie_winner_id: null, announced_at: null },
]

const roomWinners: RoomWinnerRow[] = [
  { room_id: 'room-1', category_id: 1, winner_id: 'nominee-a', tie_winner_id: null },
  { room_id: 'room-1', category_id: 99, winner_id: 'nominee-a', tie_winner_id: null },
]

const confidencePicks: ConfidencePickRow[] = [
  { id: 'pick-1', room_id: 'room-1', player_id: 'player-1', category_id: 1, nominee_id: 'nominee-b', confidence: 2, is_correct: false, created_at: '2026-08-09T00:00:00Z' },
  { id: 'pick-2', room_id: 'room-1', player_id: 'player-1', category_id: 2, nominee_id: 'nominee-a', confidence: 1, is_correct: null, created_at: '2026-08-09T00:00:00Z' },
]

const liveMarks: BingoMarkRow[] = [
  { id: 'live-mark', card_id: 'card-1', square_index: 3, status: 'approved', marked_at: '2026-08-09T00:00:00Z' },
]

const settlement: RoomSettlementRow = {
  id: 'settlement-1',
  room_id: 'room-1',
  version: 1,
  manifest_hash: 'a'.repeat(64),
  title: 'The researched record',
  actor: 'operator',
  bingo_mode: 'replace',
  supersedes_id: null,
  created_at: '2026-08-10T00:00:00Z',
}

const entries: RoomSettlementEntryRow[] = [
  {
    id: 101,
    settlement_id: settlement.id,
    entry_key: 'crown-corrected',
    name: 'The Crown, corrected',
    category_id: 1,
    outcome: 'resolved',
    points: 10,
    winner_id: 'nominee-b',
    tie_winner_id: null,
    display_order: 1,
    occurred_at: '2026-08-09T01:00:00Z',
    warrant: { verdict: 'true', sources: [{ kind: 'screen', ref: '01:00' }] },
  },
  {
    id: 102,
    settlement_id: settlement.id,
    entry_key: 'dragon-void',
    name: 'The Dragon did not resolve',
    category_id: 2,
    outcome: 'void',
    points: 8,
    winner_id: null,
    tie_winner_id: null,
    display_order: 2,
    occurred_at: null,
    warrant: { verdict: 'true', sources: [{ kind: 'published_record', ref: 'recap-1' }] },
  },
  {
    id: 103,
    settlement_id: settlement.id,
    entry_key: 'new-true-event',
    name: 'A researched event',
    category_id: null,
    outcome: 'resolved',
    points: 6,
    winner_id: 'nominee-c',
    tie_winner_id: null,
    display_order: 3,
    occurred_at: '2026-08-09T02:00:00Z',
    warrant: { verdict: 'true', sources: [{ kind: 'eyewitness', ref: 'table-1' }] },
  },
]

const settlementMarks: RoomSettlementBingoMarkRow[] = [
  {
    settlement_id: settlement.id,
    card_id: 'card-1',
    square_index: 7,
    marked_at: '2026-08-09T02:30:00Z',
    warrant: { verdict: 'true', sources: [{ kind: 'screen', ref: '02:30' }] },
  },
]

describe('buildCanonicalRoomRecord', () => {
  it('uses the provisional room winners until a settlement is active', () => {
    const record = buildCanonicalRoomRecord({
      activeSettlementId: null,
      categories,
      roomWinners,
      confidencePicks,
      bingoMarks: liveMarks,
      settlements: [],
      settlementEntries: [],
      settlementBingoMarks: [],
    })

    expect(record.source).toBe('live')
    expect(record.categories.find((category) => category.id === 1)?.winner_id).toBe('nominee-a')
    expect(record.categories.find((category) => category.id === 99)?.winner_id).toBe('nominee-a')
    expect(record.confidencePicks).toBe(confidencePicks)
    expect(record.bingoMarks).toBe(liveMarks)
  })

  it('replaces the provisional ledger and recomputes every settled channel', () => {
    const record = buildCanonicalRoomRecord({
      activeSettlementId: settlement.id,
      categories,
      roomWinners,
      confidencePicks,
      bingoMarks: liveMarks,
      settlements: [settlement],
      settlementEntries: entries,
      settlementBingoMarks: settlementMarks,
    })

    expect(record.source).toBe('settled')
    expect(record.categories.map((category) => category.name)).toEqual([
      'The Crown, corrected',
      'A researched event',
    ])
    expect(record.categories.map((category) => category.id)).toEqual([1, -103])
    expect(record.categories[0]).toEqual(expect.objectContaining({
      source_signature_beat_id: 42,
      source_trigger_contract: categories[0].source_trigger_contract,
    }))
    expect(record.confidencePicks.map((pick) => pick.is_correct)).toEqual([true, false])
    expect(record.bingoMarks).toEqual([
      expect.objectContaining({ card_id: 'card-1', square_index: 7, status: 'approved' }),
    ])
  })

  it('fails closed instead of silently showing the provisional score', () => {
    expect(() => buildCanonicalRoomRecord({
      activeSettlementId: 'missing',
      categories,
      roomWinners,
      confidencePicks,
      bingoMarks: liveMarks,
      settlements: [],
      settlementEntries: [],
      settlementBingoMarks: [],
    })).toThrow('Active settlement missing was not loaded')
  })

  it('requires every staked prediction to be explicitly settled', () => {
    expect(() => buildCanonicalRoomRecord({
      activeSettlementId: settlement.id,
      categories,
      roomWinners,
      confidencePicks,
      bingoMarks: liveMarks,
      settlements: [settlement],
      settlementEntries: entries.filter((entry) => entry.category_id !== 2),
      settlementBingoMarks: settlementMarks,
    })).toThrow('Settlement does not resolve prediction category 2')
  })

  it('reads the preserved bingo snapshot instead of mutable live marks', () => {
    const record = buildCanonicalRoomRecord({
      activeSettlementId: settlement.id,
      categories,
      roomWinners,
      confidencePicks,
      bingoMarks: liveMarks,
      settlements: [{ ...settlement, bingo_mode: 'preserve_live' }],
      settlementEntries: entries,
      settlementBingoMarks: settlementMarks,
    })

    expect(record.bingoMarks).toEqual([
      expect.objectContaining({ card_id: 'card-1', square_index: 7, status: 'approved' }),
    ])
    expect(record.bingoMarks).not.toContainEqual(
      expect.objectContaining({ square_index: 3 }),
    )
  })
})
