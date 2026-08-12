import { describe, expect, it } from 'vitest'
import { buildSettlementInputSnapshot } from './settlement-input'
import type {
  BingoCardRow,
  BingoMarkRow,
  ConfidencePickRow,
  ConvictionPickRow,
  DraftPickRow,
  PlayerRow,
} from '../types/database'

describe('settlement input snapshot', () => {
  it('captures every room-scoped field that can change settled scores or receipt identity', () => {
    const players = [
      { id: 'player-b', name: 'B' },
      { id: 'player-a', name: 'A' },
    ] as PlayerRow[]
    const confidencePicks = [{
      id: 'confidence-b', player_id: 'player-b', category_id: 2,
      nominee_id: 'nominee-b', confidence: 3, is_correct: false,
    }, {
      id: 'confidence-a', player_id: 'player-a', category_id: 1,
      nominee_id: 'nominee-a', confidence: 5, is_correct: true,
    }] as ConfidencePickRow[]
    const draftPicks = [{
      id: 'draft-b', player_id: 'player-b', entity_id: 'entity-b', round: 2, pick_number: 2,
    }, {
      id: 'draft-a', player_id: 'player-a', entity_id: 'entity-a', round: 1, pick_number: 1,
    }] as DraftPickRow[]
    const convictionPicks = [{
      room_id: 'room', player_id: 'player-b', beat_id: 9,
    }, {
      room_id: 'room', player_id: 'player-a', beat_id: 12,
    }, {
      room_id: 'room', player_id: 'player-a', beat_id: 3,
    }] as ConvictionPickRow[]
    const bingoCards = [{
      id: 'card-b', player_id: 'player-b', squares: [2, 0],
    }, {
      id: 'card-a', player_id: 'player-a', squares: [1, 0],
    }] as BingoCardRow[]
    const bingoMarks = [{
      id: 'mark-pending', card_id: 'card-a', square_index: 4,
      status: 'pending', marked_at: '2026-08-10T01:00:00.000Z',
    }, {
      id: 'mark-b', card_id: 'card-b', square_index: 3,
      status: 'approved', marked_at: '2026-08-10T01:03:00.000Z',
    }, {
      id: 'mark-a', card_id: 'card-a', square_index: 1,
      status: 'approved', marked_at: '2026-08-10T01:01:00.000Z',
    }] as BingoMarkRow[]

    expect(buildSettlementInputSnapshot({
      players, confidencePicks, convictionPicks, draftPicks, bingoCards, bingoMarks,
    })).toEqual({
      players: [
        { id: 'player-a', name: 'A' },
        { id: 'player-b', name: 'B' },
      ],
      confidence_picks: [
        {
          id: 'confidence-a', player_id: 'player-a', category_id: 1,
          nominee_id: 'nominee-a', confidence: 5,
        },
        {
          id: 'confidence-b', player_id: 'player-b', category_id: 2,
          nominee_id: 'nominee-b', confidence: 3,
        },
      ],
      conviction_picks: [
        { player_id: 'player-a', beat_id: 3 },
        { player_id: 'player-a', beat_id: 12 },
        { player_id: 'player-b', beat_id: 9 },
      ],
      draft_picks: [
        { id: 'draft-a', player_id: 'player-a', entity_id: 'entity-a' },
        { id: 'draft-b', player_id: 'player-b', entity_id: 'entity-b' },
      ],
      bingo_cards: [
        { id: 'card-a', player_id: 'player-a', squares: [1, 0] },
        { id: 'card-b', player_id: 'player-b', squares: [2, 0] },
      ],
      bingo_marks: [
        {
          card_id: 'card-a', square_index: 1,
          marked_at: '2026-08-10T01:01:00.000Z',
        },
        {
          card_id: 'card-b', square_index: 3,
          marked_at: '2026-08-10T01:03:00.000Z',
        },
      ],
    })
  })
})
