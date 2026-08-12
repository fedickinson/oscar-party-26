import { describe, expect, it } from 'vitest'
import { computeNightAwards } from './night-awards'
import type {
  CategoryRow,
  ConfidencePickRow,
  DraftEntityRow,
  DraftPickRow,
  NomineeRow,
  PlayerRow,
} from '../types/database'
import type { ScoredPlayer } from './scoring'

describe('night awards game model', () => {
  it('keeps dragon identity out of character scoring in conviction rooms', () => {
    const players = [{ id: 'player-1', name: 'A' }] as PlayerRow[]
    const leaderboard = [{
      player: players[0],
      totalScore: 10,
      ensembleScore: 0,
      confidenceScore: 10,
      bingoScore: 0,
      correctPickCount: 1,
      topCorrectPick: 10,
      rank: 1,
    }] as ScoredPlayer[]
    const categories = [{
      id: 1,
      name: 'The dragon flies',
      points: 10,
      winner_id: 'dragon-1',
      tie_winner_id: null,
      display_order: 1,
    }] as CategoryRow[]
    const nominees = [{
      id: 'dragon-1', name: 'Vhagar', type: 'film', film_name: 'Vhagar',
    }] as NomineeRow[]
    const entities = [{
      id: 'dragon-1', name: 'Vhagar', type: 'film', film_name: 'Vhagar',
    }] as DraftEntityRow[]
    const draftPicks = [{
      id: 'draft-1', player_id: 'player-1', entity_id: 'dragon-1', round: 1, pick_number: 0,
    }] as DraftPickRow[]

    const legacy = computeNightAwards(
      leaderboard, players, categories, nominees, entities, draftPicks,
      [] as ConfidencePickRow[], [], 'legacy_ensemble',
    )
    const conviction = computeNightAwards(
      leaderboard, players, categories, nominees, entities, draftPicks,
      [] as ConfidencePickRow[], [], 'conviction_portfolio',
    )

    expect(legacy.characterAwards).not.toEqual([])
    expect(conviction.characterAwards).toEqual([])
    expect(conviction.playerAwards).toHaveLength(1)
  })
})
