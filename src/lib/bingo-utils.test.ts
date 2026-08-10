import { describe, expect, it } from 'vitest'
import {
  BOARD_TIER_MIX,
  FREE_CENTER_INDEX,
  TIER_POINTS,
  boardExpectedHits,
  checkBingo,
  checkObjectiveCondition,
  computeBingoScore,
  computePlayerBingoScores,
  computeSquarePoints,
  countBingos,
  generateBingoCard,
  isBlackout,
  splitWinCondition,
} from './bingo-utils'
import type {
  BingoCardRow,
  BingoMarkRow,
  BingoSquareRow,
  CategoryRow,
  LikelihoodTier,
  NomineeRow,
} from '../types/database'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const square = (id: number, over: Partial<BingoSquareRow> = {}): BingoSquareRow => ({
  id,
  text: `Square ${id}`,
  short_text: `S${id}`,
  is_objective: false,
  slug: `square_${id}`,
  title: `S${id}`,
  win_condition: 'It happens on screen. Talking about it does not count.',
  probability_pct: 50,
  likelihood_tier: 'toss_up',
  category: null,
  why_it_is_fun: null,
  storyline_tags: null,
  fun_type: 'chaos',
  ...over,
})

/** A pool shaped like the real one: 75 squares spread across the four tiers. */
function buildPool(): BingoSquareRow[] {
  const spec: Array<[LikelihoodTier, number, number]> = [
    // tier, count, probability
    ['likely', 22, 80],
    ['toss_up', 28, 50],
    ['long_shot', 18, 25],
    ['chaos', 7, 10],
  ]
  const pool: BingoSquareRow[] = []
  let id = 1
  for (const [tier, count, probability] of spec) {
    for (let n = 0; n < count; n++) {
      pool.push(
        square(id, {
          likelihood_tier: tier,
          probability_pct: probability,
          storyline_tags: [`thread_${id % 9}`],
          fun_type: `fun_${id % 8}`,
        }),
      )
      id++
    }
  }
  return pool
}

const card = (id: string, playerId: string, squares: number[]): BingoCardRow => ({
  id,
  room_id: 'room-1',
  player_id: playerId,
  squares,
  created_at: '2026-03-15T00:00:00Z',
})

const mark = (
  cardId: string,
  squareIndex: number,
  status: BingoMarkRow['status'] = 'approved',
): BingoMarkRow => ({
  id: `${cardId}-${squareIndex}`,
  card_id: cardId,
  square_index: squareIndex,
  status,
  marked_at: '2026-03-15T00:00:00Z',
})

// ─── checkBingo ───────────────────────────────────────────────────────────────

describe('checkBingo', () => {
  it('finds no line on an empty card, free centre notwithstanding', () => {
    const result = checkBingo(new Set())
    expect(result.hasBingo).toBe(false)
    expect(result.lines).toEqual([])
  })

  it('completes a top row from five marks', () => {
    const result = checkBingo(new Set([0, 1, 2, 3, 4]))
    expect(result.hasBingo).toBe(true)
    expect(result.lines).toContainEqual([0, 1, 2, 3, 4])
  })

  it('completes a diagonal from four marks because the centre is free', () => {
    const result = checkBingo(new Set([0, 6, 18, 24]))
    expect(result.hasBingo).toBe(true)
    expect(result.lines).toContainEqual([0, 6, 12, 18, 24])
  })

  it('reports only lines that are new since the previous check', () => {
    const first = checkBingo(new Set([0, 1, 2, 3, 4]))
    const second = checkBingo(new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), first.lines)
    expect(second.lines).toHaveLength(2)
    expect(second.newLines).toEqual([[5, 6, 7, 8, 9]])
  })

  it('treats an unchanged board as producing no new lines', () => {
    const first = checkBingo(new Set([0, 1, 2, 3, 4]))
    expect(checkBingo(new Set([0, 1, 2, 3, 4]), first.lines).newLines).toEqual([])
  })
})

describe('countBingos', () => {
  it('counts completed lines', () => {
    expect(countBingos([[0, 1, 2, 3, 4], [5, 6, 7, 8, 9]])).toBe(2)
    expect(countBingos([])).toBe(0)
  })
})

describe('isBlackout', () => {
  it('is true only when every position is covered', () => {
    const all = new Set(Array.from({ length: 25 }, (_, i) => i).filter((i) => i !== FREE_CENTER_INDEX))
    expect(isBlackout(all)).toBe(true)
  })

  it('is false one square short', () => {
    const nearly = new Set(
      Array.from({ length: 25 }, (_, i) => i).filter((i) => i !== FREE_CENTER_INDEX && i !== 7),
    )
    expect(isBlackout(nearly)).toBe(false)
  })
})

// ─── Scoring economy ──────────────────────────────────────────────────────────

describe('the bingo economy', () => {
  it('pays squares by tier: 1 / 2 / 3 / 5', () => {
    // The numbers you shout across a room. Changing them changes the game.
    expect(TIER_POINTS).toEqual({ likely: 1, toss_up: 2, long_shot: 3, chaos: 5 })
  })

  it('deals a fixed 7 / 9 / 6 / 2 tier mix, totalling 24 live squares', () => {
    expect(BOARD_TIER_MIX).toEqual({ likely: 7, toss_up: 9, long_shot: 6, chaos: 2 })
    expect(Object.values(BOARD_TIER_MIX).reduce((a, b) => a + b, 0)).toBe(24)
  })
})

describe('computeSquarePoints', () => {
  const positional: Array<BingoSquareRow | null> = Array.from({ length: 25 }, (_, i) =>
    i === FREE_CENTER_INDEX ? null : square(i + 100, { likelihood_tier: 'chaos' }),
  )

  it('sums the tier value of each marked square', () => {
    expect(computeSquarePoints(positional, new Set([0, 1]))).toBe(10)
  })

  it('never pays for the free centre', () => {
    expect(computeSquarePoints(positional, new Set([FREE_CENTER_INDEX]))).toBe(0)
  })

  it('scores a square with no tier data as zero instead of throwing', () => {
    const untiered: Array<BingoSquareRow | null> = [null, null, null]
    expect(computeSquarePoints(untiered, new Set([0, 1, 2]))).toBe(0)
  })
})

describe('computeBingoScore', () => {
  it('pays 15 / 25 / 30 for the first three lines', () => {
    expect(computeBingoScore(1, false)).toBe(15)
    expect(computeBingoScore(2, false)).toBe(25)
    expect(computeBingoScore(3, false)).toBe(30)
  })

  it('pays 5 for each line beyond the third', () => {
    expect(computeBingoScore(4, false)).toBe(35)
    expect(computeBingoScore(5, false)).toBe(40)
  })

  it('adds 25 for a blackout', () => {
    expect(computeBingoScore(1, true)).toBe(40)
  })

  it('adds square points on top of the lines', () => {
    expect(computeBingoScore(1, false, 20)).toBe(35)
  })

  it('returns line-only scoring when the caller has no square metadata', () => {
    expect(computeBingoScore(0, false)).toBe(0)
    expect(computeBingoScore(2, false)).toBe(25)
  })
})

// ─── computePlayerBingoScores ─────────────────────────────────────────────────

describe('computePlayerBingoScores', () => {
  const pool = buildPool()
  const squaresById = new Map(pool.map((s) => [s.id, s]))
  const ids = pool.slice(0, 24).map((s) => s.id)
  const layout = [...ids.slice(0, 12), 0, ...ids.slice(12)]
  const players = [{ id: 'p1' }, { id: 'p2' }]
  const cards = [card('c1', 'p1', layout)]

  it('counts approved marks only', () => {
    const marks = [mark('c1', 0), mark('c1', 1, 'pending'), mark('c1', 2, 'denied')]
    const { scores } = computePlayerBingoScores(players, cards, marks, squaresById)
    // One approved likely square, no lines.
    expect(scores.get('p1')).toBe(TIER_POINTS.likely)
  })

  it('scores lines and squares together', () => {
    const marks = [0, 1, 2, 3, 4].map((i) => mark('c1', i))
    const { scores, counts } = computePlayerBingoScores(players, cards, marks, squaresById)
    expect(counts.get('p1')).toBe(1)
    expect(scores.get('p1')).toBe(15 + 5 * TIER_POINTS.likely)
  })

  it('falls back to line-only scoring without the squares table', () => {
    const marks = [0, 1, 2, 3, 4].map((i) => mark('c1', i))
    const { scores } = computePlayerBingoScores(players, cards, marks)
    expect(scores.get('p1')).toBe(15)
  })

  it('omits a player who has no card', () => {
    const { scores } = computePlayerBingoScores(players, cards, [], squaresById)
    expect(scores.has('p2')).toBe(false)
  })

  it('ignores marks belonging to another card', () => {
    const { scores } = computePlayerBingoScores(players, cards, [mark('c2', 0)], squaresById)
    expect(scores.get('p1')).toBe(0)
  })
})

// ─── generateBingoCard ────────────────────────────────────────────────────────

describe('generateBingoCard', () => {
  const pool = buildPool()
  const byId = new Map(pool.map((s) => [s.id, s]))
  const tierOf = (id: number) => byId.get(id)!.likelihood_tier

  it('lays out 25 positions with the free sentinel dead centre', () => {
    const board = generateBingoCard(pool, [])
    expect(board).toHaveLength(25)
    expect(board[FREE_CENTER_INDEX]).toBe(0)
  })

  it('deals 24 distinct squares', () => {
    const board = generateBingoCard(pool, [])
    const live = board.filter((id) => id !== 0)
    expect(live).toHaveLength(24)
    expect(new Set(live).size).toBe(24)
  })

  it('honours the tier mix on every board it deals', () => {
    for (let n = 0; n < 10; n++) {
      const live = generateBingoCard(pool, []).filter((id) => id !== 0)
      const counts = live.reduce<Record<string, number>>((acc, id) => {
        acc[tierOf(id)] = (acc[tierOf(id)] ?? 0) + 1
        return acc
      }, {})
      expect(counts).toEqual(BOARD_TIER_MIX)
    }
  })

  it('keeps every board in a room at comparable difficulty', () => {
    // The promise the balancer makes: nobody gets the easy card.
    const dealt: number[][] = []
    for (let n = 0; n < 6; n++) dealt.push(generateBingoCard(pool, dealt))

    const evs = dealt.map((board) => boardExpectedHits(board.filter((id) => id !== 0), byId))
    expect(Math.max(...evs) - Math.min(...evs)).toBeLessThanOrEqual(1)
  })

  it('does not hand a player a copy of an existing board', () => {
    const first = generateBingoCard(pool, [])
    const second = generateBingoCard(pool, [first])
    const overlap = second.filter((id) => id !== 0 && first.includes(id)).length
    expect(overlap).toBeLessThan(24)
  })

  it('still deals a playable card from a pool with no tier data', () => {
    // A client on a pre-migration schema must get a card, not an exception.
    const untiered = pool.slice(0, 30).map((s) => ({
      ...s,
      likelihood_tier: 'unknown' as unknown as LikelihoodTier,
    }))
    const board = generateBingoCard(untiered, [])
    expect(board).toHaveLength(25)
    expect(board[FREE_CENTER_INDEX]).toBe(0)
    expect(new Set(board.filter((id) => id !== 0)).size).toBe(24)
  })
})

describe('boardExpectedHits', () => {
  it('sums the pool probabilities of the squares on a board', () => {
    const byId = new Map([
      [1, square(1, { probability_pct: 80 })],
      [2, square(2, { probability_pct: 20 })],
    ])
    expect(boardExpectedHits([1, 2], byId)).toBeCloseTo(1)
  })

  it('treats an unknown square as contributing nothing', () => {
    expect(boardExpectedHits([99], new Map())).toBe(0)
  })
})

// ─── splitWinCondition ────────────────────────────────────────────────────────

describe('splitWinCondition', () => {
  it('puts the last sentence in the fine print, where the argument gets settled', () => {
    const result = splitWinCondition(
      'A dragon kills a named character on screen. Roaring without contact does not count.',
    )
    expect(result.rule).toBe('A dragon kills a named character on screen.')
    expect(result.finePrint).toBe('Roaring without contact does not count.')
  })

  it('keeps a multi-sentence rule together, splitting off only the qualifier', () => {
    const result = splitWinCondition('One. Two. Three.')
    expect(result.rule).toBe('One. Two.')
    expect(result.finePrint).toBe('Three.')
  })

  it('leaves a single-sentence condition entirely in the rule', () => {
    const result = splitWinCondition('Someone cries.')
    expect(result).toEqual({ rule: 'Someone cries.', finePrint: '' })
  })

  it('handles a condition written with no terminator at all', () => {
    expect(splitWinCondition('Someone cries')).toEqual({ rule: 'Someone cries', finePrint: '' })
  })
})

// ─── checkObjectiveCondition ──────────────────────────────────────────────────

describe('checkObjectiveCondition', () => {
  const categories: CategoryRow[] = [
    {
      id: 1,
      name: 'Best Director',
      tier: 1,
      points: 8,
      display_order: 1,
      winner_id: 'nom-1',
      tie_winner_id: null,
      announced_at: null,
    },
  ]
  const nominees: NomineeRow[] = [
    { id: 'nom-1', name: 'Ryan Coogler', type: 'person', film_name: 'Sinners', image_url: '' },
    { id: 'nom-2', name: 'Bryan Adams', type: 'person', film_name: 'Other', image_url: '' },
  ]

  it('resolves "wins any award" against every announced winner', () => {
    expect(checkObjectiveCondition('Ryan Coogler wins any award', categories, nominees)).toBe(true)
    expect(checkObjectiveCondition('Bryan Adams wins any award', categories, nominees)).toBe(false)
  })

  it('matches on whole words, so "ryan" does not hit "Bryan"', () => {
    const bryanWon = [{ ...categories[0], winner_id: 'nom-2' }]
    expect(checkObjectiveCondition('Ryan Coogler wins any award', bryanWon, nominees)).toBe(false)
  })

  it('matches a film as well as a person', () => {
    expect(checkObjectiveCondition('Sinners wins any award', categories, nominees)).toBe(true)
  })

  it('resolves a named category, ignoring a leading "Best"', () => {
    expect(checkObjectiveCondition('Ryan Coogler wins Best Director', categories, nominees)).toBe(true)
    expect(checkObjectiveCondition('Bryan Adams wins Best Director', categories, nominees)).toBe(false)
  })

  it('is false before anything has been announced', () => {
    const unannounced = [{ ...categories[0], winner_id: null }]
    expect(checkObjectiveCondition('Ryan Coogler wins any award', unannounced, nominees)).toBe(false)
  })

  it('is false for a phrasing it does not understand, leaving the host to rule', () => {
    expect(checkObjectiveCondition('someone cries during a speech', categories, nominees)).toBe(false)
  })
})
