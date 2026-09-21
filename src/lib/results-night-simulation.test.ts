import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BOARD_TIER_MIX } from './bingo-utils'
import {
  buildSimulationCatalog,
  createRng,
  expectedDraftValues,
  formatSimulationTable,
  parseOddsDocument,
  prepareSimulation,
  resolveOdds,
  runSimulation,
  simulateNight,
  type OddsDocument,
  type SimulationCatalog,
} from './results-night-simulation'
import { parseShowPack } from './show-pack'
import { buildShowPackActivationPlan } from './show-pack-activation'
import type {
  BingoSquareRow,
  CategoryRow,
  DraftEntityRow,
  LikelihoodTier,
  NomineeRow,
} from '../types/database'

/**
 * The simulation exists to price the draft, so the thing under test is not the
 * arithmetic in this file — it is that the night runs through the same
 * `computeLeaderboard`, `findDraftPointsForWinner` and `computeBingoScore` a
 * real room runs through. Every assertion below is chosen to fail if the
 * simulation ever grows its own private copy of one of those rules.
 */

const SHOW_PACK_ID = 'pack-fixture'
const CATEGORY_POINTS = 8

function fixtureSquares(probabilityPct: number): BingoSquareRow[] {
  const squares: BingoSquareRow[] = []
  let id = 1
  for (const [tier, count] of Object.entries(BOARD_TIER_MIX) as Array<[LikelihoodTier, number]>) {
    for (let index = 0; index < count; index += 1) {
      squares.push({
        id,
        text: `square ${id}`,
        short_text: `square ${id}`,
        is_objective: false,
        slug: `square-${id}`,
        title: `square ${id}`,
        win_condition: `square ${id}`,
        probability_pct: probabilityPct,
        likelihood_tier: tier,
        category: null,
        why_it_is_fun: null,
        storyline_tags: [`tag-${id}`],
        fun_type: null,
        show_pack_id: SHOW_PACK_ID,
        pack_key: `square-${id}`,
      })
      id += 1
    }
  }
  return squares
}

/** One category, two person candidates, both draftable — the smallest room that can price a draft. */
function fixtureCatalog(probabilityPct = 0): SimulationCatalog {
  const categories: CategoryRow[] = [{
    id: 1,
    name: 'Category A',
    tier: 1,
    points: CATEGORY_POINTS,
    display_order: 1,
    winner_id: null,
    tie_winner_id: null,
    announced_at: null,
    show_pack_id: SHOW_PACK_ID,
    room_id: null,
    pack_key: 'category-a',
  }]
  const nominees: NomineeRow[] = [
    {
      id: 'nominee-a',
      name: 'Artist A',
      type: 'person',
      film_name: 'Label A',
      image_url: '/portraits/a.avif',
      show_pack_id: SHOW_PACK_ID,
      pack_key: 'artist-a',
    },
    {
      id: 'nominee-b',
      name: 'Artist B',
      type: 'person',
      film_name: 'Label B',
      image_url: '/portraits/b.avif',
      show_pack_id: SHOW_PACK_ID,
      pack_key: 'artist-b',
    },
  ]
  const draftEntities: DraftEntityRow[] = nominees.map((nominee) => ({
    id: `entity-${nominee.pack_key}`,
    name: nominee.name,
    type: 'person',
    nominations: [{
      category_id: 1,
      nominee_id: nominee.id,
      category_name: 'Category A',
      points: CATEGORY_POINTS,
    }],
    film_name: nominee.film_name,
    nom_count: 1,
    show_pack_id: SHOW_PACK_ID,
    pack_key: nominee.pack_key ?? '',
  }))
  return {
    categories,
    nominees,
    draftEntities,
    bingoSquares: fixtureSquares(probabilityPct),
    candidateNomineeIdsByCategory: new Map([[1, ['nominee-a', 'nominee-b']]]),
  }
}

/** Artist A is a certainty, so the winner, the greedy pick and the payout are all forced. */
function certainOdds(): OddsDocument {
  return {
    generated_at: '2026-09-21',
    note: 'fixture',
    categories: [{
      category: '  category a  ',
      presented: 'on air',
      candidates: [
        { artist_id: 'artist-a', artist: 'Artist A', work: 'Work A', probability: 1 },
        { artist_id: 'artist-b', artist: 'Artist B', work: 'Work B', probability: 0 },
      ],
    }],
  }
}

describe('createRng', () => {
  it('is deterministic per seed and differs across seeds', () => {
    const first = createRng(7)
    const second = createRng(7)
    const other = createRng(8)
    const draw = (rng: () => number) => [rng(), rng(), rng(), rng()]
    const values = draw(first)
    expect(draw(second)).toEqual(values)
    expect(draw(other)).not.toEqual(values)
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('refuses a seed that is not a finite integer', () => {
    expect(() => createRng(1.5)).toThrow(/integer/)
    expect(() => createRng(Number.NaN)).toThrow(/integer/)
  })
})

describe('resolveOdds', () => {
  it('assigns equal probability per candidate for the uniform source', () => {
    const resolved = resolveOdds(fixtureCatalog(), 'uniform')
    expect(resolved.source).toBe('uniform')
    expect(resolved.byCategory.get(1)).toEqual([
      { nomineeId: 'nominee-a', entityId: 'artist-a', probability: 0.5 },
      { nomineeId: 'nominee-b', entityId: 'artist-b', probability: 0.5 },
    ])
  })

  it('joins by normalized category title and entity id', () => {
    const resolved = resolveOdds(fixtureCatalog(), certainOdds())
    expect(resolved.source).toBe('file')
    expect(resolved.byCategory.get(1)?.map((candidate) => candidate.probability)).toEqual([1, 0])
  })

  it('fails closed on a category the pack does not predict', () => {
    const odds = certainOdds()
    odds.categories.push({ category: 'Category Z', candidates: [{ artist_id: 'artist-a', probability: 1 }] })
    expect(() => resolveOdds(fixtureCatalog(), odds)).toThrow(/Category Z/)
  })

  it('fails closed on a pack category with no odds entry', () => {
    const odds = certainOdds()
    odds.categories = []
    expect(() => resolveOdds(fixtureCatalog(), odds)).toThrow(/Category A/)
  })

  it('fails closed on a candidate that is not in the category', () => {
    const odds = certainOdds()
    odds.categories[0].candidates.push({ artist_id: 'artist-zz', probability: 0 })
    expect(() => resolveOdds(fixtureCatalog(), odds)).toThrow(/artist-zz/)
  })

  it('fails closed on a pack candidate the odds file never prices', () => {
    const odds = certainOdds()
    odds.categories[0].candidates = [{ artist_id: 'artist-a', probability: 1 }]
    expect(() => resolveOdds(fixtureCatalog(), odds)).toThrow(/artist-b/)
  })

  it('fails closed when probabilities do not sum to one within 0.01', () => {
    const odds = certainOdds()
    odds.categories[0].candidates[0].probability = 0.8
    expect(() => resolveOdds(fixtureCatalog(), odds)).toThrow(/sum/)
  })

  it('accepts a sum inside the 0.01 tolerance', () => {
    const odds = certainOdds()
    odds.categories[0].candidates[0].probability = 0.995
    expect(() => resolveOdds(fixtureCatalog(), odds)).not.toThrow()
  })

  it('fails closed on a probability outside zero and one', () => {
    const odds = certainOdds()
    odds.categories[0].candidates[0].probability = 1.4
    odds.categories[0].candidates[1].probability = -0.4
    expect(() => resolveOdds(fixtureCatalog(), odds)).toThrow(/probability/)
  })
})

describe('parseOddsDocument', () => {
  it('rejects a document without a categories array', () => {
    expect(() => parseOddsDocument('{"generated_at":"x"}')).toThrow(/categories/)
  })

  it('rejects a candidate without an artist id', () => {
    const raw = JSON.stringify({ categories: [{ category: 'A', candidates: [{ probability: 1 }] }] })
    expect(() => parseOddsDocument(raw)).toThrow(/artist_id/)
  })

  it('rejects bytes that are not JSON', () => {
    expect(() => parseOddsDocument('not json')).toThrow(/JSON/)
  })
})

describe('expectedDraftValues', () => {
  it('prices a person entity at category points times 1.5, rounded', () => {
    const catalog = fixtureCatalog()
    const values = expectedDraftValues(catalog, resolveOdds(catalog, certainOdds()))
    expect(values.get('entity-artist-a')).toBe(Math.round(CATEGORY_POINTS * 1.5))
    expect(values.get('entity-artist-b')).toBe(0)
  })
})

describe('simulateNight', () => {
  it('pays the drafted winner exactly category points times 1.5 through computeLeaderboard', () => {
    const catalog = fixtureCatalog()
    const context = prepareSimulation(catalog, resolveOdds(catalog, certainOdds()))
    const results = simulateNight(context, 4, createRng(11))

    const paid = results.filter((row) => row.draftScore > 0)
    expect(paid).toHaveLength(1)
    expect(paid[0].draftScore).toBe(Math.round(CATEGORY_POINTS * 1.5))
    // The greedy policy hands the certainty to whoever drafts first.
    expect(paid[0].draftSlot).toBe(1)
    for (const row of results) {
      if (row.playerId === paid[0].playerId) continue
      expect(row.draftScore).toBe(0)
    }
  })

  it('scores bingo through the real tier, line and blackout rules', () => {
    const catalog = fixtureCatalog(100)
    const context = prepareSimulation(catalog, resolveOdds(catalog, 'uniform'))
    const results = simulateNight(context, 4, createRng(3))

    // Every square hits: 7x1 + 9x2 + 6x3 + 2x5 square points, twelve lines, blackout.
    const squarePoints = 7 * 1 + 9 * 2 + 6 * 3 + 2 * 5
    const expected = squarePoints + 15 + 10 + (12 - 2) * 5 + 25
    for (const row of results) expect(row.bingoScore).toBe(expected)
  })

  it('leaves every player on zero bingo when no square hits', () => {
    const catalog = fixtureCatalog(0)
    const context = prepareSimulation(catalog, resolveOdds(catalog, 'uniform'))
    const results = simulateNight(context, 4, createRng(3))
    for (const row of results) expect(row.bingoScore).toBe(0)
  })

  it('spends every confidence number exactly once per player', () => {
    const catalog = fixtureCatalog()
    const context = prepareSimulation(catalog, resolveOdds(catalog, 'uniform'))
    const results = simulateNight(context, 5, createRng(2))
    // One category means the range is 1..1, so a correct pick is worth exactly 1.
    for (const row of results) expect([0, 1]).toContain(row.confidenceScore)
  })

  it('gives every player a distinct draft slot', () => {
    const catalog = fixtureCatalog()
    const context = prepareSimulation(catalog, resolveOdds(catalog, 'uniform'))
    const results = simulateNight(context, 6, createRng(5))
    expect([...results].map((row) => row.draftSlot).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6])
  })
})

describe('runSimulation', () => {
  it('is deterministic under a seed and moves when the seed changes', { timeout: 20_000 }, () => {
    const catalog = fixtureCatalog(50)
    const options = { catalog, odds: 'uniform' as const, playerCount: 5, nights: 8, seed: 42 }
    const first = runSimulation(options)
    const second = runSimulation(options)
    expect(second).toEqual(first)
    const other = runSimulation({ ...options, seed: 43 })
    expect(other).not.toEqual(first)
  })

  it('reports one row per draft slot plus a decision verdict', () => {
    const catalog = fixtureCatalog(50)
    const summary = runSimulation({ catalog, odds: 'uniform', playerCount: 4, nights: 20, seed: 9 })
    expect(summary.slots.map((slot) => slot.slot)).toEqual([1, 2, 3, 4])
    expect(['flatten', 'keep current scale']).toContain(summary.verdict)
    // A night that clears both thresholds names the scale it is keeping, not a
    // placeholder: D8 settled the 3/2 scale, so there is no placeholder left.
    const settled = runSimulation({ catalog, odds: 'uniform', playerCount: 6, nights: 20, seed: 2 })
    expect(settled.verdict).toBe('keep current scale')
    const shareTotal = summary.overall.confidenceShare
      + summary.overall.draftShare
      + summary.overall.bingoShare
    expect(shareTotal).toBeCloseTo(1, 6)
  })

  it('refuses a player count outside four to ten', () => {
    const catalog = fixtureCatalog()
    expect(() => runSimulation({ catalog, odds: 'uniform', playerCount: 3, nights: 1, seed: 1 }))
      .toThrow(/players/)
    expect(() => runSimulation({ catalog, odds: 'uniform', playerCount: 11, nights: 1, seed: 1 }))
      .toThrow(/players/)
  })

  it('refuses a night count below one', () => {
    const catalog = fixtureCatalog()
    expect(() => runSimulation({ catalog, odds: 'uniform', playerCount: 4, nights: 0, seed: 1 }))
      .toThrow(/nights/)
  })

  it('renders one markdown table with a row per slot and an overall row', () => {
    const catalog = fixtureCatalog(50)
    const summary = runSimulation({ catalog, odds: 'uniform', playerCount: 4, nights: 10, seed: 4 })
    const table = formatSimulationTable(summary)
    const rows = table.split('\n').filter((line) => line.startsWith('|'))
    expect(rows).toHaveLength(2 + 4 + 1)
    expect(table).toContain('| All |')
    expect(table).toContain('Shared squares')
    expect(table).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u)
  })

  // Pool overlap is the thing draft pricing cannot see: two players can hold the
  // same night's board. The fixture pool is exactly one board deep, so every
  // pair must share all 24 live squares — the ceiling, stated exactly.
  it('reports mean pairwise shared squares between two cards', () => {
    const catalog = fixtureCatalog(50)
    const summary = runSimulation({ catalog, odds: 'uniform', playerCount: 4, nights: 10, seed: 4 })
    expect(summary.overall.meanSharedSquares).toBe(24)
    for (const slot of summary.slots) expect(slot.meanSharedSquares).toBe(24)
  })
})

describe('buildSimulationCatalog', () => {
  it('projects the committed Results Night example pack into scoreable rows', async () => {
    const packUrl = new URL('../../show-packs/examples/results-night-proof.json', import.meta.url)
    const plan = await buildShowPackActivationPlan(parseShowPack(readFileSync(packUrl, 'utf8')))
    const catalog = buildSimulationCatalog(plan)

    expect(catalog.categories).toHaveLength(plan.categories.length)
    expect(catalog.nominees).toHaveLength(plan.nominees.length)
    expect(catalog.draftEntities).toHaveLength(plan.draftEntities.length)
    expect(catalog.bingoSquares).toHaveLength(plan.bingoSquares.length)
    for (const [categoryId, nomineeIds] of catalog.candidateNomineeIdsByCategory) {
      expect(nomineeIds.length).toBeGreaterThanOrEqual(2)
      expect(catalog.categories.some((row) => row.id === categoryId)).toBe(true)
    }

    const summary = runSimulation({ catalog, odds: 'uniform', playerCount: 6, nights: 2, seed: 1 })
    expect(summary.slots).toHaveLength(6)
    expect(Number.isFinite(summary.overall.meanTotal)).toBe(true)
  })
})
