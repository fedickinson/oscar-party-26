import { describe, expect, it } from 'vitest'
import { buildSettlementPreview } from './settlement-preview'
import type { SettlementManifest } from './settlement-manifest'
import type {
  BingoCardRow,
  BingoMarkRow,
  BingoSquareRow,
  CategoryRow,
  ConfidencePickRow,
  DraftEntityRow,
  DraftPickRow,
  NomineeRow,
  PlayerRow,
  RoomWinnerRow,
} from '../types/database'

const warrant = { verdict: 'true' as const, sources: [{ kind: 'episode', ref: 'S3E8 00:10:00' }] }

function fixture(mode: 'preserve_live' | 'replace' = 'preserve_live') {
  const players = [
    { id: 'p1', name: 'Arya' },
    { id: 'p2', name: 'Tyrion' },
  ] as PlayerRow[]
  const categories = [{
    id: 1, name: 'Finds the path', points: 4, display_order: 1,
    winner_id: 'nom-wolf', tie_winner_id: null, announced_at: null,
  }] as CategoryRow[]
  const nominees = [{ id: 'nom-wolf', name: 'Wolf', type: 'person', film_name: 'Wolves' }] as NomineeRow[]
  const draftEntities = [{ id: 'wolf', name: 'Wolf', type: 'person', film_name: 'Wolves', nominations: [], nom_count: 0 }] as DraftEntityRow[]
  const draftPicks = [{ id: 'draft-1', player_id: 'p1', entity_id: 'wolf' }] as DraftPickRow[]
  const confidencePicks = [{ id: 'confidence-1', player_id: 'p2', category_id: 1, nominee_id: 'nom-wolf', confidence: 3 }] as ConfidencePickRow[]
  const squareIds = Array.from({ length: 25 }, (_, index) => index === 12 ? 0 : index + 1)
  const bingoCards = [
    { id: 'card-1', player_id: 'p1', squares: squareIds },
    { id: 'card-2', player_id: 'p2', squares: squareIds },
  ] as BingoCardRow[]
  const bingoSquares = squareIds.filter(Boolean).map((id) => ({ id, slug: `square-${id}`, title: `Square ${id}`, likelihood_tier: 'likely' })) as BingoSquareRow[]
  const liveMarks = [0, 1, 2, 3, 4].map((squareIndex) => ({
    id: `mark-${squareIndex}`, card_id: 'card-1', square_index: squareIndex,
    status: 'approved', marked_at: `2026-08-11T01:0${squareIndex}:00.000Z`,
  })) as BingoMarkRow[]
  const manifest: SettlementManifest = {
    version: 1,
    title: 'The true record',
    actor: 'The host',
    entries: [{
      key: 'category:1', name: 'Finds the path', category_id: 1,
      outcome: 'resolved', points: 4, winner: 'nom-wolf', warrant,
    }],
    bingo: mode === 'preserve_live'
      ? { mode, warrant }
      : { mode, marks: [] },
    expected: {
      player_totals: mode === 'preserve_live' ? { p1: 26, p2: 3 } : { p1: 6, p2: 3 },
      character_points: { wolf: 6 },
    },
  }
  return {
    manifest,
    room: { id: 'room-1', code: 'ROOM', phase: 'finished', show_pack_id: 'pack-1', active_settlement_id: null, game_model: 'legacy_ensemble' as const },
    players, categories, nominees, confidencePicks, convictionPicks: [],
    draftPicks, draftEntities, bingoCards, bingoSquares, liveMarks,
    roomWinners: [{ room_id: 'room-1', category_id: 1, winner_id: 'nom-wolf', tie_winner_id: null }] as RoomWinnerRow[],
    activeSettlements: [], activeSettlementEntries: [], activeSettlementMarks: [],
  }
}

describe('buildSettlementPreview', () => {
  it('resolves one researched record through the canonical score and evidence cascade', () => {
    const preview = buildSettlementPreview(fixture())
    expect(preview.resolvedEntries).toMatchObject([{
      entry_key: 'category:1', winner_id: 'nom-wolf', points: 4,
    }])
    expect(preview.resolvedBingoMarks).toHaveLength(5)
    expect(preview.playerTotals).toEqual({ p1: 26, p2: 3 })
    expect(preview.characterPoints).toEqual({ wolf: 6 })
    expect(preview.receiptEvidence.score_events.map((event) => event.id)).toContain('draft:1:primary:wolf')
    expect(preview.inputSnapshot.bingo_marks).toHaveLength(5)
    expect(preview.manifestHash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('supports an intentionally empty replacement bingo ledger without changing the locked live input snapshot', () => {
    const preview = buildSettlementPreview(fixture('replace'))
    expect(preview.resolvedBingoMarks).toEqual([])
    expect(preview.playerTotals).toEqual({ p1: 6, p2: 3 })
    expect(preview.inputSnapshot.bingo_marks).toHaveLength(5)
  })

  it('can compute ledgers for an offline composer, while settle preflight still verifies declared expectations', () => {
    const value = fixture()
    value.manifest.expected.player_totals.p1 = 999
    expect(() => buildSettlementPreview(value)).toThrow('player totals mismatch for p1')
    expect(buildSettlementPreview(value, { verifyExpected: false }).playerTotals).toEqual({ p1: 26, p2: 3 })
  })
})
