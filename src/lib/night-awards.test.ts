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
import type { TimelinePoint } from '../types/timeline'

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

describe('night awards wording', () => {
  // One drafted 'film'-pool entity that earned, so the Dragonrider story fires,
  // plus a second player the pool has nothing for, so the fallback fires too.
  function fixture() {
    const players = [
      { id: 'player-1', name: 'A' },
      { id: 'player-2', name: 'B' },
    ] as PlayerRow[]
    const leaderboard = [
      {
        player: players[0], totalScore: 40, ensembleScore: 40, confidenceScore: 0,
        bingoScore: 0, correctPickCount: 0, topCorrectPick: 0, rank: 1,
      },
      {
        player: players[1], totalScore: 0, ensembleScore: 0, confidenceScore: 0,
        bingoScore: 0, correctPickCount: 0, topCorrectPick: 0, rank: 2,
      },
    ] as ScoredPlayer[]
    const categories = [{
      id: 1, name: 'Video of the Year', points: 40,
      winner_id: 'entity-1', tie_winner_id: null, display_order: 1,
    }] as CategoryRow[]
    const nominees = [{
      id: 'entity-1', name: 'GENER8ION', type: 'film', film_name: 'GENER8ION',
    }] as NomineeRow[]
    const entities = [{
      id: 'entity-1', name: 'GENER8ION', type: 'film', film_name: 'GENER8ION',
    }] as DraftEntityRow[]
    const draftPicks = [{
      id: 'draft-1', player_id: 'player-1', entity_id: 'entity-1', round: 1, pick_number: 0,
    }] as DraftPickRow[]
    return { players, leaderboard, categories, nominees, entities, draftPicks }
  }

  function awardsFor(isLegacy: boolean) {
    const f = fixture()
    return computeNightAwards(
      f.leaderboard, f.players, f.categories, f.nominees, f.entities, f.draftPicks,
      [] as ConfidencePickRow[], [], 'legacy_ensemble', isLegacy,
    )
  }

  it('keeps the legacy honours exactly as they were', () => {
    const { playerAwards, characterAwards } = awardsFor(true)
    const titles = playerAwards.map((a) => a.title)
    expect(titles).toContain('Dragonrider')
    expect(titles).toContain('Kept the Watch')
    expect(playerAwards.find((a) => a.title === 'Dragonrider')?.stat).toContain('dragonback')
    expect(playerAwards.find((a) => a.title === 'Kept the Watch')?.blurb).toContain('Dance')
    expect(characterAwards[0].label).toBe('Character of the Night')
  })

  it('names nothing from another show for a non-legacy pack', () => {
    const { playerAwards, characterAwards } = awardsFor(false)
    const words = [
      ...playerAwards.map((a) => `${a.title} ${a.blurb} ${a.stat}`),
      ...characterAwards.map((a) => `${a.label} ${a.detail}`),
    ].join(' ').toLowerCase()
    for (const banned of ['valyrian', 'dragon', 'the watch', 'the dance']) {
      expect(words).not.toContain(banned)
    }
    expect(playerAwards.map((a) => a.title)).toContain('Headliner')
    expect(playerAwards.map((a) => a.title)).toContain('Stayed for All of It')
    expect(characterAwards[0].label).toBe('Pick of the Night')
  })

  it('keeps the episode out of the long-game and cold-reader cards for a non-legacy pack', () => {
    // Player 1 called ten picks right, which outscores every other story for
    // them; player 2 earned everything in the closing stretch, spread across two
    // points so the surge beats the single-swing card.
    const f = fixture()
    const leaderboard = [
      { ...f.leaderboard[0], correctPickCount: 10 },
      f.leaderboard[1],
    ] as ScoredPlayer[]
    const point = (index: number, delta: number): TimelinePoint => ({
      categoryIndex: index,
      categoryName: `Category ${index}`,
      winnerName: 'GENER8ION',
      winnerFilm: 'GENER8ION',
      playerScores: { 'player-2': { cumulative: delta, delta, source: 'confidence' } },
    })
    const timeline = [point(0, 0), point(1, 0), point(2, 0), point(3, 0), point(4, 30), point(5, 30)]
    const awards = (isLegacy: boolean) => computeNightAwards(
      leaderboard, f.players, f.categories, f.nominees, f.entities, f.draftPicks,
      [] as ConfidencePickRow[], timeline, 'legacy_ensemble', isLegacy,
    ).playerAwards

    const legacy = awards(true)
    expect(legacy.find((a) => a.title === 'The Cold Reader')?.blurb).toContain('the episode')
    expect(legacy.find((a) => a.title === 'The Long Game')?.blurb).toContain('the episode')

    const neutral = awards(false)
    const coldReader = neutral.find((a) => a.title === 'The Cold Reader')
    const longGame = neutral.find((a) => a.title === 'The Long Game')
    expect(coldReader?.blurb).toBe('Called 10 of them right. Read the show better than it read itself.')
    expect(longGame?.blurb).toBe('Quiet for most of the show, then took the back third apart.')
    for (const award of neutral) expect(award.blurb.toLowerCase()).not.toContain('episode')
  })

  it('assigns one distinct card per player under either wording', () => {
    for (const isLegacy of [true, false]) {
      const { playerAwards } = awardsFor(isLegacy)
      expect(playerAwards).toHaveLength(2)
      expect(new Set(playerAwards.map((a) => a.title)).size).toBe(2)
      for (const award of playerAwards) {
        expect(award.title.length).toBeGreaterThan(0)
        expect(award.blurb.length).toBeGreaterThan(0)
        expect(award.stat.length).toBeGreaterThan(0)
      }
    }
  })
})
