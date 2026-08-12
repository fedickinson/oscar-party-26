import { describe, expect, it } from 'vitest'
import {
  compareForRank,
  computeLeaderboard,
  findDraftPointsForWinner,
  scoreConfidencePick,
  type ScoredPlayer,
} from './scoring'
import type {
  CategoryRow,
  ConfidencePickRow,
  ConvictionPickRow,
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
  created_at: '2026-03-15T00:00:00Z',
})

const category = (id: number, points: number, over: Partial<CategoryRow> = {}): CategoryRow => ({
  id,
  name: `Category ${id}`,
  tier: 1,
  points,
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
  created_at: '2026-03-15T00:00:00Z',
})

const confidencePick = (
  playerId: string,
  categoryId: number,
  confidence: number,
  isCorrect: boolean | null,
  nomineeId = 'nom-1',
): ConfidencePickRow => ({
  id: `${playerId}-${categoryId}`,
  room_id: 'room-1',
  player_id: playerId,
  category_id: categoryId,
  nominee_id: nomineeId,
  confidence,
  is_correct: isCorrect,
  created_at: '2026-03-15T00:00:00Z',
})

const convictionPick = (playerId: string, beatId: number): ConvictionPickRow => ({
  room_id: 'room-1',
  player_id: playerId,
  beat_id: beatId,
  created_at: '2026-03-15T00:00:00Z',
})

const scored = (over: Partial<ScoredPlayer> = {}): ScoredPlayer => ({
  player: player('p1'),
  ensembleScore: 0,
  confidenceScore: 0,
  bingoScore: 0,
  totalScore: 0,
  rank: 0,
  correctPickCount: 0,
  topCorrectPick: 0,
  ...over,
})

// ─── scoreConfidencePick ──────────────────────────────────────────────────────

describe('scoreConfidencePick', () => {
  it('pays the confidence value on a correct call', () => {
    expect(scoreConfidencePick(confidencePick('p1', 1, 17, null, 'winner'), 'winner')).toBe(17)
  })

  it('pays nothing on a wrong call, and never penalises', () => {
    expect(scoreConfidencePick(confidencePick('p1', 1, 17, null, 'loser'), 'winner')).toBe(0)
  })
})

// ─── compareForRank ───────────────────────────────────────────────────────────

describe('compareForRank', () => {
  it('ranks on total score first', () => {
    expect(compareForRank(scored({ totalScore: 50 }), scored({ totalScore: 40 }))).toBeLessThan(0)
  })

  it('breaks a total tie on confidence score', () => {
    const a = scored({ totalScore: 50, confidenceScore: 30 })
    const b = scored({ totalScore: 50, confidenceScore: 20 })
    expect(compareForRank(a, b)).toBeLessThan(0)
  })

  it('then on how many calls came in', () => {
    const a = scored({ totalScore: 50, confidenceScore: 30, correctPickCount: 5 })
    const b = scored({ totalScore: 50, confidenceScore: 30, correctPickCount: 3 })
    expect(compareForRank(a, b)).toBeLessThan(0)
  })

  it('then on nerve — the biggest number that landed', () => {
    const base = { totalScore: 50, confidenceScore: 30, correctPickCount: 5 }
    const a = scored({ ...base, topCorrectPick: 20 })
    const b = scored({ ...base, topCorrectPick: 12 })
    expect(compareForRank(a, b)).toBeLessThan(0)
  })

  it('returns 0 only on a true dead heat across every tiebreak', () => {
    const same = { totalScore: 50, confidenceScore: 30, correctPickCount: 5, topCorrectPick: 20 }
    expect(compareForRank(scored(same), scored(same))).toBe(0)
  })

  it('ignores bingo, which is dealt rather than decided', () => {
    const a = scored({ totalScore: 50, bingoScore: 40 })
    const b = scored({ totalScore: 50, bingoScore: 0 })
    expect(compareForRank(a, b)).toBe(0)
  })
})

// ─── findDraftPointsForWinner ─────────────────────────────────────────────────

describe('findDraftPointsForWinner', () => {
  const categories = [category(1, 8), category(2, 5)]
  const nominees = [
    nominee('nom-person', { name: 'Rhaenyra', type: 'person', film_name: 'The Blacks' }),
    nominee('nom-film', { name: 'Vhagar', type: 'film', film_name: 'Vhagar' }),
    nominee('nom-bestpic', { name: 'The Brutalist', type: 'film', film_name: '' }),
  ]

  it('pays the person drafter 1.5x, rounded', () => {
    const entities = [entity('e-person', { name: 'Rhaenyra', type: 'person' })]
    const result = findDraftPointsForWinner(
      1, 'nom-person', categories, nominees, entities, [draftPick('p1', 'e-person')],
    )
    expect(result).toEqual({ playerId: 'p1', points: 12, entityId: 'e-person' })
  })

  it('uses stable versioned identity when display names collide', () => {
    const versionedWinner = nominee('nom-versioned', {
      name: 'The Dragon',
      film_name: 'The Dragon Film',
      show_pack_id: 'pack-finale',
      pack_key: 'the-dragon-rider',
    })
    const entities = [
      entity('e-wrong', {
        name: 'The Dragon',
        show_pack_id: 'pack-finale',
        pack_key: 'the-dragon-decoy',
      }),
      entity('e-right', {
        name: 'The Dragon',
        show_pack_id: 'pack-finale',
        pack_key: 'the-dragon-rider',
      }),
    ]
    const result = findDraftPointsForWinner(
      1,
      versionedWinner.id,
      categories,
      [versionedWinner],
      entities,
      [draftPick('wrong-player', 'e-wrong'), draftPick('right-player', 'e-right')],
    )
    expect(result).toEqual({ playerId: 'right-player', points: 12, entityId: 'e-right' })
  })

  it('pays nobody when a versioned identity is ambiguous', () => {
    const versionedWinner = nominee('nom-versioned', {
      name: 'The Dragon',
      film_name: 'The Dragon Film',
      show_pack_id: 'pack-finale',
      pack_key: 'the-dragon-rider',
    })
    const entities = [
      entity('e-first', {
        name: 'The Dragon',
        show_pack_id: 'pack-finale',
        pack_key: 'the-dragon-rider',
      }),
      entity('e-second', {
        name: 'The Dragon',
        show_pack_id: 'pack-finale',
        pack_key: 'the-dragon-rider',
      }),
      entity('e-film-fallback', {
        name: 'The Dragon Film',
        type: 'film',
        film_name: 'The Dragon Film',
        show_pack_id: 'pack-finale',
        pack_key: 'the-dragon-film',
      }),
    ]
    expect(findDraftPointsForWinner(
      1,
      versionedWinner.id,
      categories,
      [versionedWinner],
      entities,
      [
        draftPick('first-player', 'e-first'),
        draftPick('second-player', 'e-second'),
        draftPick('film-player', 'e-film-fallback'),
      ],
    )).toEqual({ playerId: null, points: 0, entityId: null })
  })

  it('rounds a half-point multiplier up', () => {
    // 5 points x 1.5 = 7.5. Pinned because the rounding direction is a rule,
    // not an implementation detail.
    const entities = [entity('e-person', { name: 'Rhaenyra', type: 'person' })]
    const result = findDraftPointsForWinner(
      2, 'nom-person', categories, nominees, entities, [draftPick('p1', 'e-person')],
    )
    expect(result.points).toBe(8)
  })

  it('falls through to the film drafter at 1x when nobody drafted the person', () => {
    const entities = [entity('e-film', { name: 'The Blacks', type: 'film', film_name: 'The Blacks' })]
    const result = findDraftPointsForWinner(
      1, 'nom-person', categories, nominees, entities, [draftPick('p2', 'e-film')],
    )
    expect(result).toEqual({ playerId: 'p2', points: 8, entityId: 'e-film' })
  })

  it('gives the film drafter nothing when the person was drafted individually', () => {
    const entities = [
      entity('e-person', { name: 'Rhaenyra', type: 'person' }),
      entity('e-film', { name: 'The Blacks', type: 'film', film_name: 'The Blacks' }),
    ]
    const result = findDraftPointsForWinner(
      1, 'nom-person', categories, nominees, entities,
      [draftPick('p1', 'e-person'), draftPick('p2', 'e-film')],
    )
    expect(result.playerId).toBe('p1')
  })

  it('pays nobody when the winning entity is undrafted', () => {
    const result = findDraftPointsForWinner(1, 'nom-person', categories, nominees, [], [])
    expect(result).toEqual({ playerId: null, points: 0, entityId: null })
  })

  it('matches a film winner on film_name at 1x', () => {
    const entities = [entity('e-dragon', { name: 'Vhagar', type: 'film', film_name: 'Vhagar' })]
    const result = findDraftPointsForWinner(
      1, 'nom-film', categories, nominees, entities, [draftPick('p3', 'e-dragon')],
    )
    expect(result).toEqual({ playerId: 'p3', points: 8, entityId: 'e-dragon' })
  })

  it('falls back to the nominee name when a film nominee has no film_name', () => {
    const entities = [entity('e-bp', { name: 'The Brutalist', type: 'film', film_name: 'The Brutalist' })]
    const result = findDraftPointsForWinner(
      1, 'nom-bestpic', categories, nominees, entities, [draftPick('p4', 'e-bp')],
    )
    expect(result.playerId).toBe('p4')
  })

  it('returns nothing for an unknown category or nominee', () => {
    expect(findDraftPointsForWinner(99, 'nom-person', categories, nominees, [], []))
      .toEqual({ playerId: null, points: 0, entityId: null })
    expect(findDraftPointsForWinner(1, 'ghost', categories, nominees, [], []))
      .toEqual({ playerId: null, points: 0, entityId: null })
  })
})

// ─── computeLeaderboard ───────────────────────────────────────────────────────

describe('computeLeaderboard', () => {
  const players = [player('p1'), player('p2')]

  it('counts only picks explicitly marked correct', () => {
    const picks = [
      confidencePick('p1', 1, 10, true),
      confidencePick('p1', 2, 7, false),
      confidencePick('p1', 3, 5, null), // not yet announced
    ]
    const [p1] = computeLeaderboard(players, picks, [], [], [], [], new Map())
    expect(p1.confidenceScore).toBe(10)
    expect(p1.correctPickCount).toBe(1)
    expect(p1.topCorrectPick).toBe(10)
  })

  it('adds draft points for announced categories only', () => {
    const categories = [
      category(1, 8, { winner_id: 'nom-1' }),
      category(2, 6), // no winner yet
    ]
    const nominees = [nominee('nom-1', { name: 'Rhaenyra' }), nominee('nom-2', { name: 'Aemond' })]
    const entities = [entity('e1', { name: 'Rhaenyra' }), entity('e2', { name: 'Aemond' })]
    const picks = [draftPick('p1', 'e1'), draftPick('p2', 'e2')]

    const board = computeLeaderboard(players, [], picks, entities, categories, nominees, new Map())
    const p1 = board.find((b) => b.player.id === 'p1')!
    const p2 = board.find((b) => b.player.id === 'p2')!
    expect(p1.ensembleScore).toBe(12) // 8 x 1.5
    expect(p2.ensembleScore).toBe(0)
  })

  it('pays both sides of a tied category', () => {
    const categories = [category(1, 8, { winner_id: 'nom-1', tie_winner_id: 'nom-2' })]
    const nominees = [nominee('nom-1', { name: 'Rhaenyra' }), nominee('nom-2', { name: 'Aemond' })]
    const entities = [entity('e1', { name: 'Rhaenyra' }), entity('e2', { name: 'Aemond' })]
    const picks = [draftPick('p1', 'e1'), draftPick('p1', 'e2')]

    const [p1] = computeLeaderboard(players, [], picks, entities, categories, nominees, new Map())
    expect(p1.ensembleScore).toBe(24) // both winners, 12 each
  })

  it('totals confidence, ensemble and bingo', () => {
    const [p1] = computeLeaderboard(
      players, [confidencePick('p1', 1, 10, true)], [], [], [], [],
      new Map([['p1', 30]]),
    )
    expect(p1.bingoScore).toBe(30)
    expect(p1.totalScore).toBe(40)
  })

  it('sorts by the ranking cascade and assigns standard competition ranks', () => {
    const three = [player('p1'), player('p2'), player('p3')]
    const picks = [
      confidencePick('p1', 1, 10, true),
      confidencePick('p2', 1, 10, true),
      confidencePick('p3', 1, 4, true),
    ]
    const board = computeLeaderboard(three, picks, [], [], [], [], new Map())
    // p1 and p2 are a genuine dead heat on every tiebreak, so they share rank 1
    // and the next player takes rank 3 — never rank 2.
    expect(board.map((b) => [b.player.id, b.rank])).toEqual([
      ['p1', 1],
      ['p2', 1],
      ['p3', 3],
    ])
  })

  it('does not share a rank when a tiebreak separated the players', () => {
    const picks = [
      confidencePick('p1', 1, 10, true),
      confidencePick('p2', 1, 6, true),
      confidencePick('p2', 2, 4, true),
    ]
    // Equal totals (10 each), but p1 spent one bigger number and p2 spread it.
    const board = computeLeaderboard(players, picks, [], [], [], [], new Map())
    expect(board.map((b) => b.totalScore)).toEqual([10, 10])
    expect(board.map((b) => b.rank)).toEqual([1, 2])
    expect(board[0].player.id).toBe('p2') // more correct calls wins the tiebreak
  })

  it('returns an empty board for no players', () => {
    expect(computeLeaderboard([], [], [], [], [], [], new Map())).toEqual([])
  })

  it('moves scarcity to conviction and gives the identity draft no passive score', () => {
    const declared = category(1, 35, {
      winner_id: 'nom-1',
      source_signature_beat_id: 10,
    })
    const board = computeLeaderboard(
      players,
      [],
      [draftPick('p2', 'e1')],
      [entity('e1', { name: 'Rhaenyra' })],
      [declared],
      [nominee('nom-1', { name: 'Rhaenyra' })],
      new Map(),
      [convictionPick('p1', 10)],
      'conviction_portfolio',
    )

    expect(board.find((entry) => entry.player.id === 'p1')).toMatchObject({
      confidenceScore: 35,
      ensembleScore: 0,
      totalScore: 35,
      correctPickCount: 1,
      topCorrectPick: 35,
    })
    expect(board.find((entry) => entry.player.id === 'p2')).toMatchObject({
      confidenceScore: 0,
      ensembleScore: 0,
      totalScore: 0,
    })
  })
})
