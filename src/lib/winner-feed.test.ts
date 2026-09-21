import { describe, expect, it } from 'vitest'
import {
  buildWinnerFeedEntry,
  mergeSeededWinnerEntries,
  seedWinnerFeedEntries,
  type WinnerFeedContext,
  type WinnerFeedEntry,
} from './winner-feed'
import type {
  CategoryRow,
  ConfidencePickRow,
  DraftEntityRow,
  DraftPickRow,
  NomineeRow,
  PlayerRow,
} from '../types/database'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const player = (id: string, name = id): PlayerRow => ({
  id,
  room_id: 'room-1',
  name,
  avatar_id: 'a1',
  color: '#fff',
  is_host: false,
  created_at: '2026-09-21T00:00:00Z',
})

const category = (id: number, over: Partial<CategoryRow> = {}): CategoryRow => ({
  id,
  name: `Category ${id}`,
  tier: 1,
  points: 3,
  display_order: id,
  winner_id: null,
  tie_winner_id: null,
  announced_at: null,
  ...over,
})

const nominee = (id: string, over: Partial<NomineeRow> = {}): NomineeRow => ({
  id,
  name: id,
  type: 'person',
  film_name: '',
  image_url: '',
  ...over,
})

const entity = (id: string, over: Partial<DraftEntityRow> = {}): DraftEntityRow => ({
  id,
  name: id,
  type: 'person',
  nominations: [],
  film_name: '',
  nom_count: 1,
  ...over,
})

const draftPick = (playerId: string, entityId: string): DraftPickRow => ({
  id: `${playerId}-${entityId}`,
  room_id: 'room-1',
  player_id: playerId,
  entity_id: entityId,
  round: 1,
  pick_number: 1,
  created_at: '2026-09-21T00:00:00Z',
})

const confidencePick = (
  playerId: string,
  categoryId: number,
  confidence: number,
  nomineeId: string,
): ConfidencePickRow => ({
  id: `${playerId}-${categoryId}`,
  room_id: 'room-1',
  player_id: playerId,
  category_id: categoryId,
  nominee_id: nomineeId,
  confidence,
  is_correct: null,
  created_at: '2026-09-21T00:00:00Z',
})

function context(over: Partial<WinnerFeedContext> = {}): WinnerFeedContext {
  return {
    gameModel: 'legacy_ensemble',
    players: [player('p1', 'Mara'), player('p2', 'Dez')],
    categories: [category(1), category(2)],
    nominees: [nominee('n1'), nominee('n2')],
    confidencePicks: [],
    convictionPicks: [],
    draftPicks: [],
    draftEntities: [],
    ...over,
  }
}

// ─── buildWinnerFeedEntry ─────────────────────────────────────────────────────

describe('buildWinnerFeedEntry', () => {
  it('credits the confidence stake and the draft claim on the same outcome', () => {
    const ctx = context({
      categories: [category(1, { name: 'Best Album', points: 2, tier: 2 })],
      nominees: [nominee('n1', { name: 'Sienna Spiro' }), nominee('n2')],
      confidencePicks: [confidencePick('p1', 1, 7, 'n1'), confidencePick('p2', 1, 4, 'n2')],
      draftEntities: [entity('e1', { name: 'Sienna Spiro' })],
      draftPicks: [draftPick('p2', 'e1')],
    })

    const built = buildWinnerFeedEntry(ctx, {
      categoryId: 1,
      winnerId: 'n1',
      tieWinnerId: null,
      time: new Date(1000),
    })

    expect(built).not.toBeNull()
    expect(built!.categoryName).toBe('Best Album')
    expect(built!.categoryTier).toBe(2)
    expect(built!.winnerName).toBe('Sienna Spiro')

    const mara = built!.playerImpacts.find((impact) => impact.playerId === 'p1')!
    expect(mara.confidenceCorrect).toBe(true)
    expect(mara.confidenceDelta).toBe(7)

    const dez = built!.playerImpacts.find((impact) => impact.playerId === 'p2')!
    expect(dez.confidenceCorrect).toBe(false)
    expect(dez.confidenceDelta).toBe(0)
    // A person drafted individually pays round(category.points * 1.5).
    expect(dez.draftDelta).toBe(3)
    expect(dez.draftedEntityName).toBe('Sienna Spiro')
  })

  it('counts a stake on either side of a tie as correct', () => {
    const ctx = context({
      categories: [category(1, { points: 3 })],
      confidencePicks: [confidencePick('p2', 1, 5, 'n2')],
    })

    const built = buildWinnerFeedEntry(ctx, {
      categoryId: 1,
      winnerId: 'n1',
      tieWinnerId: 'n2',
      time: new Date(1000),
    })

    const dez = built!.playerImpacts.find((impact) => impact.playerId === 'p2')!
    expect(dez.confidenceCorrect).toBe(true)
    expect(dez.confidenceDelta).toBe(5)
  })

  it('returns null while the category or the winning nominee is unknown', () => {
    expect(buildWinnerFeedEntry(context(), {
      categoryId: 99, winnerId: 'n1', tieWinnerId: null, time: new Date(1000),
    })).toBeNull()
    expect(buildWinnerFeedEntry(context(), {
      categoryId: 1, winnerId: 'unknown', tieWinnerId: null, time: new Date(1000),
    })).toBeNull()
  })
})

// ─── seedWinnerFeedEntries ────────────────────────────────────────────────────

describe('seedWinnerFeedEntries', () => {
  it('seeds one entry per resolved category and none for an unresolved one', () => {
    const ctx = context({
      categories: [
        category(1, { winner_id: 'n1' }),
        category(2),
        category(3, { winner_id: 'n2' }),
      ],
    })

    const seeded = seedWinnerFeedEntries(ctx, 10_000)

    expect(seeded.map((entry) => entry.categoryId)).toEqual([1, 3])
  })

  it('stamps every seeded entry before hydration, in announced order', () => {
    const ctx = context({
      categories: [
        category(1, { winner_id: 'n1', display_order: 2 }),
        category(2, { winner_id: 'n2', display_order: 1 }),
      ],
    })

    const seeded = seedWinnerFeedEntries(ctx, 10_000)
    const byId = new Map(seeded.map((entry) => [entry.categoryId, entry.time.getTime()]))

    expect(byId.get(2)!).toBeLessThan(byId.get(1)!)
    for (const time of byId.values()) expect(time).toBeLessThan(10_000)
  })

  it('orders a timestamped declaration after an untimed authored row', () => {
    const ctx = context({
      categories: [
        category(1, { winner_id: 'n1', announced_at: '2026-09-21T20:00:00Z', display_order: 9 }),
        category(2, { winner_id: 'n2', display_order: 1 }),
      ],
    })

    const seeded = seedWinnerFeedEntries(ctx, 10_000)

    expect(seeded.map((entry) => entry.categoryId)).toEqual([2, 1])
  })
})

// ─── mergeSeededWinnerEntries ─────────────────────────────────────────────────

describe('mergeSeededWinnerEntries', () => {
  const seededFor = (categoryId: number, timeMs: number): WinnerFeedEntry => ({
    kind: 'winner',
    categoryId,
    categoryName: `Category ${categoryId}`,
    categoryTier: 1,
    categoryPoints: 3,
    winnerName: 'n1',
    winnerFilm: '',
    tieWinnerName: null,
    tieWinnerFilm: null,
    time: new Date(timeMs),
    playerImpacts: [],
  })

  it('keeps one entry per category when a live event overlapped hydration', () => {
    const merged = mergeSeededWinnerEntries(
      [seededFor(1, 5_000)],
      [seededFor(1, 100), seededFor(2, 200)],
    )

    expect(merged).toHaveLength(2)
    expect(merged.filter((entry) => entry.categoryId === 1)).toHaveLength(1)
  })

  it('keeps the witnessed time of a category the live path already announced', () => {
    const merged = mergeSeededWinnerEntries([seededFor(1, 5_000)], [seededFor(1, 100)])

    expect(merged[0].time.getTime()).toBe(5_000)
  })

  it('drops an entry the canonical record no longer resolves', () => {
    const merged = mergeSeededWinnerEntries([seededFor(1, 5_000)], [seededFor(2, 200)])

    expect(merged.map((entry) => entry.categoryId)).toEqual([2])
  })
})
