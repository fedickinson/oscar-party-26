import { describe, expect, it } from 'vitest'
import { computeConvictionPortfolioScores, resolveConvictionBudget } from './conviction'
import { computeScoreTimeline } from './timeline-utils'
import type { CategoryRow, ConvictionPickRow, PlayerRow } from '../types/database'

const player = (id: string): PlayerRow => ({
  id,
  room_id: 'room-1',
  name: id,
  avatar_id: 'avatar',
  color: 'token',
  is_host: false,
  created_at: '2026-08-11T00:00:00.000Z',
})

const conviction = (playerId: string, beatId: number): ConvictionPickRow => ({
  room_id: 'room-1',
  player_id: playerId,
  beat_id: beatId,
  created_at: '2026-08-11T00:00:00.000Z',
})

const declaredBeat = (
  id: number,
  beatId: number | null,
  points: number,
  displayOrder = id,
): CategoryRow => ({
  id,
  name: `Fact ${id}`,
  tier: 1,
  points,
  display_order: displayOrder,
  winner_id: 'winner',
  tie_winner_id: null,
  announced_at: '2026-08-11T01:00:00.000Z',
  source_signature_beat_id: beatId,
})

describe('conviction portfolio scoring', () => {
  it('reads the portfolio budget only from an open-conviction contract', () => {
    expect(resolveConvictionBudget({
      version: 1,
      commitment: 'open_conviction',
      conviction_budget: 8,
      identity: { selection: 'exclusive_entity_draft', scoring: 'none' },
      scarcity: { commitments: 'fixed_budget', identity: 'exclusive' },
      visibility: 'open_counts',
      cadence: 'immediate_facts_and_event_close',
      continuity: 'canon_write_back',
    })).toBe(8)
    expect(resolveConvictionBudget(undefined)).toBeNull()
    expect(resolveConvictionBudget({
      version: 1,
      commitment: 'confidence_allocation',
      conviction_budget: null,
      identity: { selection: 'exclusive_entity_draft', scoring: 'ensemble' },
      scarcity: { commitments: 'ranked_allocation', identity: 'exclusive' },
      visibility: 'sealed_until_lock',
      cadence: 'immediate_per_outcome',
      continuity: 'no_carryover',
    })).toBeNull()
  })

  it('pays the full authored pot to a correct lonely believer', () => {
    const scores = computeConvictionPortfolioScores(
      [player('arya'), player('tyrion')],
      [conviction('arya', 10)],
      [declaredBeat(1, 10, 35)],
    )

    expect(scores.get('arya')).toEqual({ score: 35, correctPickCount: 1, topCorrectPick: 35 })
    expect(scores.get('tyrion')).toEqual({ score: 0, correctPickCount: 0, topCorrectPick: 0 })
  })

  it('splits a crowded pot equally and burns the indivisible remainder', () => {
    const scores = computeConvictionPortfolioScores(
      [player('arya'), player('tyrion'), player('ned')],
      [conviction('arya', 10), conviction('tyrion', 10), conviction('ned', 10)],
      [declaredBeat(1, 10, 25)],
    )

    expect(scores.get('arya')?.score).toBe(8)
    expect(scores.get('tyrion')?.score).toBe(8)
    expect(scores.get('ned')?.score).toBe(8)
  })

  it('does not pay an unscored free declaration or an unresolved beat', () => {
    const unresolved = { ...declaredBeat(2, 11, 45), winner_id: null }
    const scores = computeConvictionPortfolioScores(
      [player('arya')],
      [conviction('arya', 10), conviction('arya', 11)],
      [declaredBeat(1, null, 10), unresolved],
    )

    expect(scores.get('arya')).toEqual({ score: 0, correctPickCount: 0, topCorrectPick: 0 })
  })

  it('pays one pot when duplicate provisional facts reference the same beat', () => {
    const scores = computeConvictionPortfolioScores(
      [player('arya')],
      [conviction('arya', 10)],
      [declaredBeat(2, 10, 35, 2), declaredBeat(1, 10, 35, 1)],
    )

    expect(scores.get('arya')).toEqual({ score: 35, correctPickCount: 1, topCorrectPick: 35 })
  })

  it('projects conviction rather than identity ownership into the score timeline', () => {
    const players = [player('arya'), player('tyrion')]
    const point = computeScoreTimeline(
      [declaredBeat(1, 10, 35)],
      [],
      [{
        id: 'dragon', room_id: 'room-1', player_id: 'tyrion', entity_id: 'dragon',
        round: 1, pick_number: 0, created_at: '2026-08-11T00:00:00.000Z',
      }],
      [{ id: 'dragon', name: 'Dragon', type: 'film', nominations: [], film_name: 'Dragon', nom_count: 1 }],
      [{ id: 'winner', name: 'Dragon', type: 'film', film_name: 'Dragon', image_url: '' }],
      players,
      [conviction('arya', 10)],
      'conviction_portfolio',
    )[0]

    expect(point.playerScores.arya).toMatchObject({ delta: 35, source: 'confidence' })
    expect(point.playerScores.tyrion).toMatchObject({ delta: 0, source: 'none' })
  })
})
