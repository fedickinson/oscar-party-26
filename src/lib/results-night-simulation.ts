/**
 * results-night-simulation.ts — pure Monte Carlo core for pricing a Results
 * Night draft. No React, no Supabase, no filesystem, no network.
 *
 * WHY THIS EXISTS
 * `show-packs/research/vma-2026/BRIEF.md` section 6 leaves the D8 draft point
 * scale as a placeholder and names one way to settle it: play the night ten
 * thousand times against a stated per-candidate probability and look at what
 * draft position is actually worth. The decision rule is in DECISION_RULE_TEXT
 * below, and the only honest way to apply it is to score simulated nights
 * through the same functions a real room scores through.
 *
 * WHAT MAKES THE NUMBER TRUSTWORTHY
 * Nothing here re-derives a scoring rule. Winners are sampled, picks are made,
 * and then the night is handed to `computeLeaderboard` with rows shaped like
 * the ones `buildShowPackActivationPlan` projects into the catalog, so draft
 * credit runs through `findDraftPointsForWinner` and bingo runs through
 * `generateBingoCard` / `computeSquarePoints` / `computeBingoScore`. A second
 * implementation of any of those would drift from the room the first time
 * either changed, and a drifted simulation is worse than no simulation.
 *
 * DETERMINISM
 * Every stochastic choice draws from a seeded mulberry32 stream. The one
 * exception is inside `generateBingoCard`, which reaches for `Math.random`
 * directly; rather than fork the real dealer, the seeded stream is installed as
 * `Math.random` for the duration of that call and restored afterwards. The card
 * a simulated player holds is therefore the card the real generator would deal,
 * and the whole run still reproduces byte for byte from its seed.
 */

import {
  checkBingo,
  computeBingoScore,
  computeSquarePoints,
  countBingos,
  generateBingoCard,
  isBlackout,
} from './bingo-utils'
import { assessDraftEntityForNominee } from './draft-identity'
import { generateSnakeOrder } from './draft-utils'
import { getConfidenceRange } from './mode-utils'
import { computeLeaderboard } from './scoring'
import type { ShowPackActivationPlan } from './show-pack-activation'
import type {
  BingoSquareRow,
  CategoryRow,
  ConfidencePickRow,
  DraftEntityRow,
  DraftPickRow,
  LikelihoodTier,
  NomineeRow,
  PlayerRow,
} from '../types/database'

// ─── Tunable policy constants ─────────────────────────────────────────────────

/** Rounds of the snake draft. Matches the four-round Results Night draft. */
export const DRAFT_ROUNDS = 4

/** Multiplier `findDraftPointsForWinner` pays a drafted person entity. */
export const PERSON_DRAFT_MULTIPLIER = 1.5

/** How often a confidence pick goes to the favourite rather than a coin flip. */
export const FAVORITE_PICK_RATE = 0.7

/**
 * Noise added to a chosen candidate's probability before the confidence
 * numbers are ranked. Zero would make every player's allocation identical and
 * the spread of scores would be pure winner luck; this keeps the ordering
 * mostly sane and occasionally wrong, which is how people actually rank.
 */
export const CONFIDENCE_NOISE = 0.2

/** Tolerance on a category's probabilities summing to one. */
export const PROBABILITY_SUM_TOLERANCE = 0.01

export const MIN_PLAYERS = 4
export const MAX_PLAYERS = 10

/** Verbatim from BRIEF section 6, so the script cannot quietly restate it. */
export const DECISION_RULE_TEXT =
  'Decision rule: change the D8 point scale only if draft slot one wins more than about a '
  + 'third of nights or draft exceeds a third of total score. Otherwise leave it.'

const DECISION_THRESHOLD = 1 / 3

const SIM_ROOM_ID = 'simulated-room'
const SIM_TIMESTAMP = '2026-01-01T00:00:00.000Z'
const LIKELIHOOD_TIERS: LikelihoodTier[] = ['likely', 'toss_up', 'long_shot', 'chaos']

// ─── Seeded PRNG ──────────────────────────────────────────────────────────────

/**
 * mulberry32 — small, fast, and good enough for a policy question.
 *
 * Seeded rather than `Math.random` because a pricing decision that cannot be
 * re-derived from the number printed next to it is an anecdote.
 */
export function createRng(seed: number): () => number {
  if (!Number.isInteger(seed)) throw new Error(`seed must be a finite integer, received ${seed}`)
  let state = seed >>> 0
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomInt(rng: () => number, bound: number): number {
  return Math.min(bound - 1, Math.floor(rng() * bound))
}

function shuffle<T>(values: readonly T[], rng: () => number): T[] {
  const copy = [...values]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = randomInt(rng, index + 1)
    ;[copy[index], copy[swap]] = [copy[swap], copy[index]]
  }
  return copy
}

/**
 * Runs `body` with the seeded stream installed as `Math.random`.
 *
 * `generateBingoCard` is the real dealer and it calls `Math.random` directly.
 * Copying it here to thread an rng through would create exactly the second
 * implementation this module exists to avoid, so the stream is swapped in
 * instead and always restored.
 */
function withSeededRandom<T>(rng: () => number, body: () => T): T {
  const original = Math.random
  Math.random = rng
  try {
    return body()
  } finally {
    Math.random = original
  }
}

// ─── Catalog projection ───────────────────────────────────────────────────────

export interface SimulationCatalog {
  categories: CategoryRow[]
  nominees: NomineeRow[]
  draftEntities: DraftEntityRow[]
  bingoSquares: BingoSquareRow[]
  /** Category id to the nominee ids a player may pick, in pack order. */
  candidateNomineeIdsByCategory: Map<number, string[]>
}

function assertLikelihoodTier(value: string, squareId: number): LikelihoodTier {
  if ((LIKELIHOOD_TIERS as string[]).includes(value)) return value as LikelihoodTier
  throw new Error(`bingo square ${squareId} has unknown likelihood tier "${value}"`)
}

/**
 * Projects one activation plan into the exact row shapes the leaderboard reads.
 *
 * The plan is what `activate-show-pack.mts` installs, so simulating these rows
 * is simulating the rows a bound room would actually hold.
 */
export function buildSimulationCatalog(plan: ShowPackActivationPlan): SimulationCatalog {
  const categories: CategoryRow[] = plan.categories.map((category) => ({
    id: category.id,
    name: category.name,
    tier: category.tier,
    points: category.points,
    display_order: category.display_order,
    winner_id: null,
    tie_winner_id: null,
    announced_at: null,
    show_pack_id: category.show_pack_id,
    room_id: null,
    pack_key: category.pack_key,
  }))
  const nominees: NomineeRow[] = plan.nominees.map((nominee) => ({
    id: nominee.id,
    name: nominee.name,
    type: nominee.type,
    film_name: nominee.film_name,
    image_url: nominee.image_url,
    show_pack_id: nominee.show_pack_id,
    pack_key: nominee.pack_key,
  }))
  const draftEntities: DraftEntityRow[] = plan.draftEntities.map((entity) => ({
    id: entity.id,
    name: entity.name,
    type: entity.type,
    nominations: entity.nominations,
    film_name: entity.film_name,
    nom_count: entity.nom_count,
    show_pack_id: entity.show_pack_id,
    pack_key: entity.pack_key,
  }))
  const bingoSquares: BingoSquareRow[] = plan.bingoSquares.map((square) => ({
    id: square.id,
    text: square.text,
    short_text: square.short_text,
    is_objective: square.is_objective,
    slug: square.slug,
    title: square.title,
    win_condition: square.win_condition,
    probability_pct: square.probability_pct,
    likelihood_tier: assertLikelihoodTier(square.likelihood_tier, square.id),
    category: square.category,
    why_it_is_fun: square.why_it_is_fun,
    storyline_tags: square.storyline_tags,
    fun_type: square.fun_type,
    show_pack_id: square.show_pack_id,
    pack_key: square.pack_key,
  }))

  const candidateNomineeIdsByCategory = new Map<number, string[]>()
  for (const category of categories) candidateNomineeIdsByCategory.set(category.id, [])
  for (const link of plan.categoryNominees) {
    const bucket = candidateNomineeIdsByCategory.get(link.category_id)
    if (!bucket) throw new Error(`candidate link names unknown category ${link.category_id}`)
    bucket.push(link.nominee_id)
  }

  return { categories, nominees, draftEntities, bingoSquares, candidateNomineeIdsByCategory }
}

// ─── Odds ─────────────────────────────────────────────────────────────────────

export interface OddsCandidate {
  artist_id: string
  artist?: string
  work?: string
  probability: number
}

export interface OddsCategory {
  category: string
  presented?: string
  candidates: OddsCandidate[]
}

export interface OddsDocument {
  generated_at?: string
  note?: string
  categories: OddsCategory[]
}

export type OddsSource = OddsDocument | 'uniform'

export interface ResolvedCandidate {
  nomineeId: string
  entityId: string
  probability: number
}

export interface ResolvedOdds {
  source: 'file' | 'uniform'
  byCategory: Map<number, ResolvedCandidate[]>
}

/** Case and whitespace insensitive, because a research lane types titles by hand. */
function normalizeTitle(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

export function parseOddsDocument(raw: string): OddsDocument {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`odds file is not valid JSON: ${message}`)
  }
  if (typeof value !== 'object' || value === null) throw new Error('odds file must be a JSON object')
  const document = value as Record<string, unknown>
  if (!Array.isArray(document.categories)) throw new Error('odds file needs a categories array')

  const categories: OddsCategory[] = document.categories.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null) {
      throw new Error(`odds categories[${index}] must be an object`)
    }
    const category = entry as Record<string, unknown>
    if (typeof category.category !== 'string' || !category.category.trim()) {
      throw new Error(`odds categories[${index}] needs a non-empty category title`)
    }
    if (!Array.isArray(category.candidates) || category.candidates.length === 0) {
      throw new Error(`odds category "${category.category}" needs a non-empty candidates array`)
    }
    const candidates: OddsCandidate[] = category.candidates.map((raw_candidate, candidateIndex) => {
      if (typeof raw_candidate !== 'object' || raw_candidate === null) {
        throw new Error(`odds category "${category.category}" candidate ${candidateIndex} must be an object`)
      }
      const candidate = raw_candidate as Record<string, unknown>
      if (typeof candidate.artist_id !== 'string' || !candidate.artist_id.trim()) {
        throw new Error(`odds category "${category.category}" candidate ${candidateIndex} needs artist_id`)
      }
      if (typeof candidate.probability !== 'number' || !Number.isFinite(candidate.probability)) {
        throw new Error(`odds candidate "${candidate.artist_id}" needs a numeric probability`)
      }
      return {
        artist_id: candidate.artist_id,
        artist: typeof candidate.artist === 'string' ? candidate.artist : undefined,
        work: typeof candidate.work === 'string' ? candidate.work : undefined,
        probability: candidate.probability,
      }
    })
    return {
      category: category.category,
      presented: typeof category.presented === 'string' ? category.presented : undefined,
      candidates,
    }
  })

  return {
    generated_at: typeof document.generated_at === 'string' ? document.generated_at : undefined,
    note: typeof document.note === 'string' ? document.note : undefined,
    categories,
  }
}

/**
 * Joins an odds document to the pack catalog, or spreads probability evenly.
 *
 * Every mismatch is fatal. A simulation that silently dropped an unpriced
 * category would answer the pricing question with a smaller game than the one
 * being priced, which is the failure mode worth guarding hardest against.
 */
export function resolveOdds(catalog: SimulationCatalog, source: OddsSource): ResolvedOdds {
  const entityIdByNomineeId = new Map<string, string>()
  for (const nominee of catalog.nominees) {
    if (!nominee.pack_key) throw new Error(`nominee ${nominee.id} has no pack key to join odds on`)
    entityIdByNomineeId.set(nominee.id, nominee.pack_key)
  }

  const byCategory = new Map<number, ResolvedCandidate[]>()

  if (source === 'uniform') {
    for (const category of catalog.categories) {
      const nomineeIds = catalog.candidateNomineeIdsByCategory.get(category.id) ?? []
      if (nomineeIds.length === 0) throw new Error(`category "${category.name}" has no candidates`)
      const share = 1 / nomineeIds.length
      byCategory.set(category.id, nomineeIds.map((nomineeId) => ({
        nomineeId,
        entityId: entityIdByNomineeId.get(nomineeId)!,
        probability: share,
      })))
    }
    return { source: 'uniform', byCategory }
  }

  const oddsByTitle = new Map<string, OddsCategory>()
  for (const entry of source.categories) {
    const key = normalizeTitle(entry.category)
    if (oddsByTitle.has(key)) throw new Error(`odds file names category "${entry.category}" twice`)
    oddsByTitle.set(key, entry)
  }

  const matchedTitles = new Set<string>()
  for (const category of catalog.categories) {
    const key = normalizeTitle(category.name)
    const entry = oddsByTitle.get(key)
    if (!entry) throw new Error(`odds file has no entry for pack category "${category.name}"`)
    matchedTitles.add(key)

    const nomineeIds = catalog.candidateNomineeIdsByCategory.get(category.id) ?? []
    if (nomineeIds.length === 0) throw new Error(`category "${category.name}" has no candidates`)

    const probabilityByEntityId = new Map<string, number>()
    for (const candidate of entry.candidates) {
      if (probabilityByEntityId.has(candidate.artist_id)) {
        throw new Error(`odds category "${entry.category}" prices "${candidate.artist_id}" twice`)
      }
      if (candidate.probability < 0 || candidate.probability > 1) {
        throw new Error(
          `odds category "${entry.category}" candidate "${candidate.artist_id}" has probability `
          + `${candidate.probability}, which is outside 0 to 1`,
        )
      }
      probabilityByEntityId.set(candidate.artist_id, candidate.probability)
    }

    const packEntityIds = new Set(nomineeIds.map((nomineeId) => entityIdByNomineeId.get(nomineeId)!))
    for (const entityId of probabilityByEntityId.keys()) {
      if (!packEntityIds.has(entityId)) {
        throw new Error(
          `odds category "${entry.category}" prices "${entityId}", which is not a candidate of pack `
          + `category "${category.name}"`,
        )
      }
    }

    const resolved: ResolvedCandidate[] = nomineeIds.map((nomineeId) => {
      const entityId = entityIdByNomineeId.get(nomineeId)!
      const probability = probabilityByEntityId.get(entityId)
      if (probability === undefined) {
        throw new Error(
          `odds category "${entry.category}" never prices candidate "${entityId}" of pack category `
          + `"${category.name}"`,
        )
      }
      return { nomineeId, entityId, probability }
    })

    const total = resolved.reduce((sum, candidate) => sum + candidate.probability, 0)
    if (Math.abs(total - 1) > PROBABILITY_SUM_TOLERANCE) {
      throw new Error(
        `odds category "${entry.category}" probabilities sum to ${total.toFixed(4)}, not 1 within `
        + `${PROBABILITY_SUM_TOLERANCE}`,
      )
    }

    byCategory.set(category.id, resolved)
  }

  for (const [key, entry] of oddsByTitle) {
    if (!matchedTitles.has(key)) {
      throw new Error(`odds file prices category "${entry.category}", which the pack does not predict`)
    }
  }

  return { source: 'file', byCategory }
}

// ─── Draft valuation ──────────────────────────────────────────────────────────

/**
 * Expected draft points per entity under the odds.
 *
 * Mirrors `findDraftPointsForWinner`: a person candidate resolved to a person
 * draft entity pays `round(points * 1.5)`, a film candidate resolved to a film
 * draft entity pays `points`. The film-overflow branch (an undrafted person's
 * win falling through to whoever holds their film) is deliberately not priced
 * here, because whether it fires depends on what the other drafters did, and a
 * greedy picker cannot know that at pick time.
 */
export function expectedDraftValues(
  catalog: SimulationCatalog,
  odds: ResolvedOdds,
): Map<string, number> {
  const values = new Map<string, number>()
  for (const entity of catalog.draftEntities) values.set(entity.id, 0)

  const nomineeById = new Map(catalog.nominees.map((nominee) => [nominee.id, nominee]))
  for (const category of catalog.categories) {
    const candidates = odds.byCategory.get(category.id) ?? []
    for (const candidate of candidates) {
      const nominee = nomineeById.get(candidate.nomineeId)
      if (!nominee) continue
      const resolution = assessDraftEntityForNominee(nominee, catalog.draftEntities)
      if (resolution.state !== 'matched') continue
      const entity = resolution.row
      const payout = nominee.type === 'person'
        ? (entity.type === 'person' ? Math.round(category.points * PERSON_DRAFT_MULTIPLIER) : 0)
        : (entity.type === 'film' ? category.points : 0)
      if (payout === 0) continue
      values.set(entity.id, (values.get(entity.id) ?? 0) + candidate.probability * payout)
    }
  }

  return values
}

// ─── One night ────────────────────────────────────────────────────────────────

export interface SimulationContext {
  catalog: SimulationCatalog
  odds: ResolvedOdds
  entityValues: Map<string, number>
}

export function prepareSimulation(
  catalog: SimulationCatalog,
  odds: ResolvedOdds,
): SimulationContext {
  return { catalog, odds, entityValues: expectedDraftValues(catalog, odds) }
}

export interface NightPlayerResult {
  playerId: string
  /** Position in this night's randomly drawn draft order, 1-based. */
  draftSlot: number
  confidenceScore: number
  draftScore: number
  bingoScore: number
  totalScore: number
  rank: number
  /**
   * Mean count of identical square ids between this player's card and each
   * other card dealt tonight, out of the 24 live squares. Averaging it over
   * the room gives the mean pairwise overlap, because every unordered pair is
   * counted once from each side.
   */
  sharedSquares: number
}

function buildPlayers(playerCount: number): PlayerRow[] {
  return Array.from({ length: playerCount }, (_, index) => ({
    id: `sim-player-${index + 1}`,
    room_id: SIM_ROOM_ID,
    name: `Player ${index + 1}`,
    avatar_id: 'sim',
    color: 'sim',
    is_host: index === 0,
    created_at: SIM_TIMESTAMP,
  }))
}

function sampleCandidate(candidates: ResolvedCandidate[], rng: () => number): ResolvedCandidate {
  const roll = rng()
  let cumulative = 0
  for (const candidate of candidates) {
    cumulative += candidate.probability
    if (roll < cumulative) return candidate
  }
  return candidates[candidates.length - 1]
}

function favoriteCandidate(candidates: ResolvedCandidate[]): ResolvedCandidate {
  return candidates.reduce((best, candidate) => (
    candidate.probability > best.probability ? candidate : best
  ), candidates[0])
}

/**
 * Plays one night end to end and returns the scored table.
 *
 * Order matters: the draft is greedy under the same odds every drafter can see,
 * so draft position is the only thing separating two players' rosters. That is
 * precisely the quantity section 6 asks about.
 */
export function simulateNight(
  context: SimulationContext,
  playerCount: number,
  rng: () => number,
): NightPlayerResult[] {
  const { catalog, odds, entityValues } = context
  const players = buildPlayers(playerCount)

  // ── Draft ───────────────────────────────────────────────────────────────
  const draftOrder = shuffle(players.map((player) => player.id), rng)
  const slotByPlayerId = new Map(draftOrder.map((playerId, index) => [playerId, index + 1]))
  const snakeOrder = generateSnakeOrder(draftOrder, DRAFT_ROUNDS)
  const available = [...catalog.draftEntities].sort((left, right) => left.id.localeCompare(right.id))
  const picks = Math.min(snakeOrder.length, available.length)

  const draftPicks: DraftPickRow[] = []
  for (let pickNumber = 0; pickNumber < picks; pickNumber += 1) {
    let bestIndex = 0
    let bestValue = -Infinity
    for (let index = 0; index < available.length; index += 1) {
      const value = entityValues.get(available[index].id) ?? 0
      if (value > bestValue) {
        bestValue = value
        bestIndex = index
      }
    }
    const [entity] = available.splice(bestIndex, 1)
    draftPicks.push({
      id: `sim-pick-${pickNumber}`,
      room_id: SIM_ROOM_ID,
      player_id: snakeOrder[pickNumber],
      entity_id: entity.id,
      round: Math.floor(pickNumber / playerCount) + 1,
      pick_number: pickNumber,
      created_at: SIM_TIMESTAMP,
    })
  }

  // ── Confidence ──────────────────────────────────────────────────────────
  const confidenceRange = getConfidenceRange(catalog.categories.length)
  const confidencePicks: ConfidencePickRow[] = []
  for (const player of players) {
    const chosen: Array<{ categoryId: number; nomineeId: string; rankScore: number }> = []
    for (const category of catalog.categories) {
      const candidates = odds.byCategory.get(category.id)!
      const candidate = rng() < FAVORITE_PICK_RATE
        ? favoriteCandidate(candidates)
        : candidates[randomInt(rng, candidates.length)]
      const rankScore = candidate.probability + (rng() - 0.5) * CONFIDENCE_NOISE
      chosen.push({ categoryId: category.id, nomineeId: candidate.nomineeId, rankScore })
    }
    // Biggest number on the belief the player rates highest.
    chosen.sort((left, right) => left.rankScore - right.rankScore)
    chosen.forEach((entry, index) => {
      confidencePicks.push({
        id: `sim-confidence-${player.id}-${entry.categoryId}`,
        room_id: SIM_ROOM_ID,
        player_id: player.id,
        category_id: entry.categoryId,
        nominee_id: entry.nomineeId,
        confidence: confidenceRange - (chosen.length - 1 - index),
        is_correct: null,
        created_at: SIM_TIMESTAMP,
      })
    })
  }

  // ── Winners ─────────────────────────────────────────────────────────────
  const winnerByCategory = new Map<number, string>()
  const categories: CategoryRow[] = catalog.categories.map((category) => {
    const winner = sampleCandidate(odds.byCategory.get(category.id)!, rng)
    winnerByCategory.set(category.id, winner.nomineeId)
    return { ...category, winner_id: winner.nomineeId, announced_at: SIM_TIMESTAMP }
  })
  // The database trigger derives is_correct in the declaring transaction.
  for (const pick of confidencePicks) {
    pick.is_correct = winnerByCategory.get(pick.category_id) === pick.nominee_id
  }

  // ── Bingo ───────────────────────────────────────────────────────────────
  // One broadcast, one truth: a square either happened tonight or it did not,
  // and every card holding it marks together.
  const squareHit = new Map<number, boolean>()
  for (const square of catalog.bingoSquares) {
    squareHit.set(square.id, rng() < square.probability_pct / 100)
  }
  const squareById = new Map(catalog.bingoSquares.map((square) => [square.id, square]))
  const dealtCards: number[][] = []
  const cardSquareIds: Array<Set<number>> = []
  const bingoScores = new Map<string, number>()
  for (const player of players) {
    const card = withSeededRandom(rng, () => generateBingoCard(catalog.bingoSquares, dealtCards))
    dealtCards.push(card)
    cardSquareIds.push(new Set(card.filter((id) => id !== 0)))
    const positional = card.map((id) => (id === 0 ? null : squareById.get(id) ?? null))
    const marked = new Set<number>()
    card.forEach((id, index) => {
      if (id !== 0 && squareHit.get(id)) marked.add(index)
    })
    const { lines } = checkBingo(marked)
    bingoScores.set(player.id, computeBingoScore(
      countBingos(lines),
      isBlackout(marked),
      computeSquarePoints(positional, marked),
    ))
  }

  // ── Card overlap ────────────────────────────────────────────────────────
  // Draft pricing cannot see this: two players can be handed most of the same
  // board out of a shallow pool, which makes their bingo scores move together
  // rather than separate them. Counted here so the table can show it.
  const sharedByPlayerId = new Map<string, number>()
  players.forEach((player, index) => {
    let shared = 0
    for (let other = 0; other < cardSquareIds.length; other += 1) {
      if (other === index) continue
      for (const id of cardSquareIds[index]) {
        if (cardSquareIds[other].has(id)) shared += 1
      }
    }
    const pairs = cardSquareIds.length - 1
    sharedByPlayerId.set(player.id, pairs > 0 ? shared / pairs : 0)
  })

  // ── Score ───────────────────────────────────────────────────────────────
  const scored = computeLeaderboard(
    players,
    confidencePicks,
    draftPicks,
    catalog.draftEntities,
    categories,
    catalog.nominees,
    bingoScores,
    [],
    'legacy_ensemble',
  )

  return scored.map((row) => ({
    playerId: row.player.id,
    draftSlot: slotByPlayerId.get(row.player.id)!,
    confidenceScore: row.confidenceScore,
    draftScore: row.ensembleScore,
    bingoScore: row.bingoScore,
    totalScore: row.totalScore,
    rank: row.rank,
    sharedSquares: sharedByPlayerId.get(row.player.id) ?? 0,
  }))
}

// ─── Aggregation ──────────────────────────────────────────────────────────────

export interface SimulationSlotSummary {
  /** 1-based draft slot, or 0 for the pooled row. */
  slot: number
  winRate: number
  confidenceShare: number
  draftShare: number
  bingoShare: number
  bingoMean: number
  bingoP10: number
  bingoP90: number
  zeroBingoShare: number
  /** Mean identical square ids between two players' cards, out of 24. */
  meanSharedSquares: number
  meanTotal: number
}

export interface SimulationSummary {
  playerCount: number
  nights: number
  seed: number
  draftRounds: number
  categoryCount: number
  draftEntityCount: number
  bingoSquareCount: number
  picksPerNight: number
  oddsSource: 'file' | 'uniform'
  slots: SimulationSlotSummary[]
  overall: SimulationSlotSummary
  decisionRule: string
  verdict: 'flatten' | 'keep current scale'
  verdictReason: string
}

export interface SimulationOptions {
  catalog: SimulationCatalog
  odds: OddsSource
  playerCount: number
  nights: number
  seed: number
  /** Called every `progressEvery` nights so a long run is not a silent one. */
  onProgress?: (completed: number, total: number) => void
  progressEvery?: number
}

interface SlotAccumulator {
  wins: number
  players: number
  totalSum: number
  bingoScores: number[]
  zeroBingo: number
  sharedSquaresSum: number
  confidenceShareSum: number
  draftShareSum: number
  bingoShareSum: number
  shareSamples: number
}

function newAccumulator(): SlotAccumulator {
  return {
    wins: 0,
    players: 0,
    totalSum: 0,
    bingoScores: [],
    zeroBingo: 0,
    sharedSquaresSum: 0,
    confidenceShareSum: 0,
    draftShareSum: 0,
    bingoShareSum: 0,
    shareSamples: 0,
  }
}

function record(accumulator: SlotAccumulator, row: NightPlayerResult): void {
  accumulator.players += 1
  if (row.rank === 1) accumulator.wins += 1
  accumulator.totalSum += row.totalScore
  accumulator.bingoScores.push(row.bingoScore)
  if (row.bingoScore === 0) accumulator.zeroBingo += 1
  accumulator.sharedSquaresSum += row.sharedSquares
  if (row.totalScore > 0) {
    accumulator.confidenceShareSum += row.confidenceScore / row.totalScore
    accumulator.draftShareSum += row.draftScore / row.totalScore
    accumulator.bingoShareSum += row.bingoScore / row.totalScore
    accumulator.shareSamples += 1
  }
}

/** Nearest-rank percentile. No interpolation: these are point scores, not a continuum. */
function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0
  const rank = Math.ceil(fraction * sorted.length)
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1))
  return sorted[index]
}

function summarize(slot: number, accumulator: SlotAccumulator): SimulationSlotSummary {
  const sorted = [...accumulator.bingoScores].sort((left, right) => left - right)
  const samples = accumulator.shareSamples || 1
  const players = accumulator.players || 1
  return {
    slot,
    winRate: accumulator.wins / players,
    confidenceShare: accumulator.confidenceShareSum / samples,
    draftShare: accumulator.draftShareSum / samples,
    bingoShare: accumulator.bingoShareSum / samples,
    bingoMean: sorted.reduce((sum, value) => sum + value, 0) / players,
    bingoP10: percentile(sorted, 0.1),
    bingoP90: percentile(sorted, 0.9),
    zeroBingoShare: accumulator.zeroBingo / players,
    meanSharedSquares: accumulator.sharedSquaresSum / players,
    meanTotal: accumulator.totalSum / players,
  }
}

export function runSimulation(options: SimulationOptions): SimulationSummary {
  const { catalog, playerCount, nights, seed } = options
  if (!Number.isInteger(playerCount) || playerCount < MIN_PLAYERS || playerCount > MAX_PLAYERS) {
    throw new Error(`players must be an integer from ${MIN_PLAYERS} to ${MAX_PLAYERS}, received ${playerCount}`)
  }
  if (!Number.isInteger(nights) || nights < 1) {
    throw new Error(`nights must be an integer of at least 1, received ${nights}`)
  }
  if (catalog.categories.length === 0) throw new Error('pack has no predictions to simulate')
  if (catalog.draftEntities.length === 0) throw new Error('pack has no draftable entities to simulate')

  const odds = resolveOdds(catalog, options.odds)
  const context = prepareSimulation(catalog, odds)
  const rng = createRng(seed)

  const bySlot = Array.from({ length: playerCount }, () => newAccumulator())
  const overall = newAccumulator()
  const progressEvery = options.progressEvery ?? 0

  for (let night = 0; night < nights; night += 1) {
    for (const row of simulateNight(context, playerCount, rng)) {
      record(bySlot[row.draftSlot - 1], row)
      record(overall, row)
    }
    if (options.onProgress && progressEvery > 0 && (night + 1) % progressEvery === 0) {
      options.onProgress(night + 1, nights)
    }
  }

  const slots = bySlot.map((accumulator, index) => summarize(index + 1, accumulator))
  const overallSummary = summarize(0, overall)
  const slotOneWinRate = slots[0].winRate
  const flattenForSlot = slotOneWinRate > DECISION_THRESHOLD
  const flattenForShare = overallSummary.draftShare > DECISION_THRESHOLD
  const verdict = flattenForSlot || flattenForShare ? 'flatten' : 'keep current scale'
  const reasons: string[] = []
  if (flattenForSlot) reasons.push(`draft slot 1 wins ${formatPercent(slotOneWinRate)} of nights`)
  if (flattenForShare) reasons.push(`draft is ${formatPercent(overallSummary.draftShare)} of total score`)
  const verdictReason = verdict === 'flatten'
    ? reasons.join(' and ')
    : `draft slot 1 wins ${formatPercent(slotOneWinRate)} of nights and draft is `
      + `${formatPercent(overallSummary.draftShare)} of total score, both at or under a third`

  return {
    playerCount,
    nights,
    seed,
    draftRounds: DRAFT_ROUNDS,
    categoryCount: catalog.categories.length,
    draftEntityCount: catalog.draftEntities.length,
    bingoSquareCount: catalog.bingoSquares.length,
    picksPerNight: Math.min(playerCount * DRAFT_ROUNDS, catalog.draftEntities.length),
    oddsSource: odds.source,
    slots,
    overall: overallSummary,
    decisionRule: DECISION_RULE_TEXT,
    verdict,
    verdictReason,
  }
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

function formatScore(value: number): string {
  return value.toFixed(1)
}

function formatRow(label: string, slot: SimulationSlotSummary): string {
  return `| ${label} | ${formatPercent(slot.winRate)} | ${formatPercent(slot.confidenceShare)} `
    + `| ${formatPercent(slot.draftShare)} | ${formatPercent(slot.bingoShare)} `
    + `| ${formatScore(slot.bingoMean)} | ${formatScore(slot.bingoP10)} | ${formatScore(slot.bingoP90)} `
    + `| ${formatPercent(slot.zeroBingoShare)} | ${formatScore(slot.meanSharedSquares)} `
    + `| ${formatScore(slot.meanTotal)} |`
}

/** One Markdown table: a row per draft slot, then the pooled row. */
export function formatSimulationTable(summary: SimulationSummary): string {
  const lines = [
    '| Draft slot | Win rate | Confidence share | Draft share | Bingo share | Bingo mean | Bingo p10 | Bingo p90 | Zero bingo | Shared squares | Mean total |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ]
  for (const slot of summary.slots) lines.push(formatRow(String(slot.slot), slot))
  lines.push(formatRow('All', summary.overall))
  return lines.join('\n')
}
