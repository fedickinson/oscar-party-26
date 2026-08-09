/**
 * bingo-utils.ts — pure bingo functions, zero side effects.
 *
 * The card is a 5×5 grid laid out as a flat 25-element array:
 *   indices  0– 4  = row 0 (top)
 *   indices  5– 9  = row 1
 *   indices 10–14  = row 2  ← index 12 is FREE CENTER
 *   indices 15–19  = row 3
 *   indices 20–24  = row 4 (bottom)
 *
 * card.squares stores bingo_square IDs at each position.
 * Position 12 always stores 0 (the sentinel for FREE).
 *
 * BINGO_LINES: the 12 winning combinations.
 * FREE CENTER (index 12) appears in row 2, col 2, and both diagonals.
 */

import type {
  BingoCardRow,
  BingoMarkRow,
  BingoSquareRow,
  CategoryRow,
  LikelihoodTier,
  NomineeRow,
} from '../types/database'

// ─── Constants ────────────────────────────────────────────────────────────────

export const FREE_CENTER_INDEX = 12

export const BINGO_LINES: readonly number[][] = [
  // 5 rows
  [0, 1, 2, 3, 4],
  [5, 6, 7, 8, 9],
  [10, 11, 12, 13, 14],
  [15, 16, 17, 18, 19],
  [20, 21, 22, 23, 24],
  // 5 columns
  [0, 5, 10, 15, 20],
  [1, 6, 11, 16, 21],
  [2, 7, 12, 17, 22],
  [3, 8, 13, 18, 23],
  [4, 9, 14, 19, 24],
  // 2 diagonals
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
]

// ─── BINGO_LINE_PALETTE ───────────────────────────────────────────────────────

/** One color entry per BINGO_LINES index (rows 0-4, cols 5-9, diags 10-11). */
export const BINGO_LINE_PALETTE: Array<{
  bg: string
  border: string
  text: string
  glow: string
}> = [
  { bg: 'rgba(16,185,129,0.22)', border: 'rgba(52,211,153,0.65)', text: 'rgba(110,231,183,0.95)', glow: 'rgba(16,185,129,0.12)' },  // emerald — row 0
  { bg: 'rgba(14,165,233,0.22)', border: 'rgba(56,189,248,0.65)', text: 'rgba(125,211,252,0.95)', glow: 'rgba(14,165,233,0.12)' },  // sky — row 1
  { bg: 'rgba(139,92,246,0.22)', border: 'rgba(167,139,250,0.65)', text: 'rgba(196,181,253,0.95)', glow: 'rgba(139,92,246,0.12)' }, // violet — row 2
  { bg: 'rgba(244,63,94,0.22)', border: 'rgba(251,113,133,0.65)', text: 'rgba(253,164,175,0.95)', glow: 'rgba(244,63,94,0.12)' },   // rose — row 3
  { bg: 'rgba(245,158,11,0.22)', border: 'rgba(251,191,36,0.65)', text: 'rgba(252,211,77,0.95)', glow: 'rgba(245,158,11,0.12)' },   // amber — row 4
  { bg: 'rgba(20,184,166,0.22)', border: 'rgba(45,212,191,0.65)', text: 'rgba(94,234,212,0.95)', glow: 'rgba(20,184,166,0.12)' },   // teal — col 0
  { bg: 'rgba(99,102,241,0.22)', border: 'rgba(129,140,248,0.65)', text: 'rgba(165,180,252,0.95)', glow: 'rgba(99,102,241,0.12)' }, // indigo — col 1
  { bg: 'rgba(217,70,239,0.22)', border: 'rgba(232,121,249,0.65)', text: 'rgba(240,171,252,0.95)', glow: 'rgba(217,70,239,0.12)' }, // fuchsia — col 2
  { bg: 'rgba(249,115,22,0.22)', border: 'rgba(251,146,60,0.65)', text: 'rgba(253,186,116,0.95)', glow: 'rgba(249,115,22,0.12)' },  // orange — col 3
  { bg: 'rgba(132,204,22,0.22)', border: 'rgba(163,230,53,0.65)', text: 'rgba(190,242,100,0.95)', glow: 'rgba(132,204,22,0.12)' },  // lime — col 4
  { bg: 'rgba(6,182,212,0.22)', border: 'rgba(34,211,238,0.65)', text: 'rgba(103,232,249,0.95)', glow: 'rgba(6,182,212,0.12)' },    // cyan — diag TL-BR
  { bg: 'rgba(236,72,153,0.22)', border: 'rgba(244,114,182,0.65)', text: 'rgba(249,168,212,0.95)', glow: 'rgba(236,72,153,0.12)' }, // pink — diag TR-BL
]

// ─── Board composition ────────────────────────────────────────────────────────

/**
 * Tier mix for one board's 24 live squares.
 *
 * The master pool ships a 7/10/6/2 recommendation for 25 squares. This card has
 * a free centre, so one slot comes off — taken from toss_up, the deepest tier
 * (38 of the 75 squares), because that is where losing one changes the feel
 * least. The free centre is itself a guaranteed mark, so the board still plays
 * like the 25-square shape the researcher balanced.
 *
 * Expected hits per board land around 11 of 24, which is the number that keeps a
 * card live into the last act instead of filling out in the first twenty minutes.
 */
export const BOARD_TIER_MIX: Record<LikelihoodTier, number> = {
  likely: 7,
  toss_up: 9,
  long_shot: 6,
  chaos: 2,
}

export const TIER_LABEL: Record<LikelihoodTier, string> = {
  likely: 'Likely',
  toss_up: 'Toss-up',
  long_shot: 'Long shot',
  chaos: 'Chaos',
}

/**
 * Chip colors for tier badges, built on the semantic theme tokens rather than
 * four arbitrary hues. Rarity escalates by weight, not by rainbow:
 *
 *   likely / toss-up  → surface, separated only by text brightness. Seventeen of
 *                       a board's 24 squares are one of these two, so they have
 *                       to sit quietly.
 *   long shot / chaos → accent. These are the eight squares worth planning
 *                       around, and they are exactly the ones the grid pips.
 *
 * Values are plain CSS so this file stays framework-free, same as
 * BINGO_LINE_PALETTE above.
 */
export const TIER_STYLE: Record<LikelihoodTier, { text: string; bg: string; border: string }> = {
  likely: {
    text: 'rgba(255,255,255,0.5)',
    bg: 'var(--color-surface)',
    border: 'var(--color-surface-line)',
  },
  toss_up: {
    text: 'rgba(255,255,255,0.8)',
    bg: 'var(--color-surface)',
    border: 'var(--color-surface-line)',
  },
  long_shot: {
    text: 'var(--color-accent-light)',
    bg: 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
    border: 'color-mix(in srgb, var(--color-accent) 40%, transparent)',
  },
  chaos: {
    text: 'var(--color-accent-light)',
    bg: 'color-mix(in srgb, var(--color-accent) 32%, transparent)',
    border: 'color-mix(in srgb, var(--color-accent-light) 65%, transparent)',
  },
}

/**
 * Tiers that get a corner pip on the grid, and how bright it burns.
 *
 * Likely and toss-up are the baseline — seventeen of a board's 24 squares — so
 * pipping them would mark almost everything and mean nothing. The pip says
 * "rarer than the rest of your card", which only the bottom two tiers are.
 *
 * Exported so BingoSquare and the legend under the card cannot drift apart: a
 * legend that disagrees with the thing it explains is worse than no legend.
 */
export const PIP_TIERS: LikelihoodTier[] = ['long_shot', 'chaos']
export const PIP_OPACITY: Record<'long_shot' | 'chaos', number> = {
  long_shot: 0.5,
  chaos: 0.95,
}

/** Board-quality targets, all from the master pool's balancing_method. */
const MAX_TAG_PER_BOARD = 4        // hard: no storyline may own more than this
const PREFERRED_TAG_PER_BOARD = 3  // soft: pay a cost above this
const SOFT_OVERLAP_CAP = 8         // soft: shared squares with any existing board
const HARD_OVERLAP_CAP = 10        // hard-ish: pay a lot above this
const EV_TOLERANCE = 0.3           // boards should sit within this many expected hits
const TARGET_APPEARANCES = 2       // ~2 board appearances per square across the pool
const MIN_FUN_TYPES = 6            // tonal variety on a single board
const CANDIDATE_BOARDS = 400       // candidates generated, best one wins

/**
 * Pairs where the first square all but guarantees the second, so marking one
 * hands you the other. One such pair on a board is a fun jackpot ladder; three
 * is a board that resolves in a single moment.
 *
 * Keyed by pool slug. Derived by reading the win conditions — the pool does not
 * encode nesting itself.
 */
export const NESTED_SQUARE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['aemond_dies', 'named_death'],
  ['poison_works', 'aemond_dies'],
  ['poison_works', 'named_death'],
  ['dragon_eats_name', 'dragon_snack'],
  ['dragon_eats_name', 'named_death'],
  ['dreamfyre_real_ride', 'dreamfyre_appears'],
  ['corlys_loses_more', 'gratuitous_gore'],
  ['head_comes_off', 'gratuitous_gore'],
  ['dragon_dies', 'dragon_wounded'],
]

const TIERS = Object.keys(BOARD_TIER_MIX) as LikelihoodTier[]

/** True when a square carries the researched metadata the balancer needs. */
function hasTierData(s: BingoSquareRow): boolean {
  return (
    (TIERS as string[]).includes(s.likelihood_tier) &&
    typeof s.probability_pct === 'number'
  )
}

/** Expected number of squares that will hit on a board, from the pool estimates. */
export function boardExpectedHits(ids: number[], byId: Map<number, BingoSquareRow>): number {
  return ids.reduce((sum, id) => sum + (byId.get(id)?.probability_pct ?? 0) / 100, 0)
}

/** Weighted pick without replacement. Returns the chosen index, or -1 if all weights are 0. */
function weightedPick(weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0)
  if (total <= 0) return -1
  let r = Math.random() * total
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]
    if (r <= 0) return i
  }
  return weights.length - 1
}

/**
 * Draws `count` squares from one tier, biased toward squares that few existing
 * boards use, and refusing any square that would push a storyline tag past
 * MAX_TAG_PER_BOARD. Falls back to ignoring the tag cap if it paints itself into
 * a corner — a slightly lopsided board beats a short one.
 */
function drawFromTier(
  pool: BingoSquareRow[],
  count: number,
  useCount: Map<number, number>,
  tagCount: Map<string, number>,
): BingoSquareRow[] {
  const remaining = [...pool]
  const picked: BingoSquareRow[] = []

  for (let n = 0; n < count && remaining.length > 0; n++) {
    const weight = (s: BingoSquareRow, respectTags: boolean) => {
      if (respectTags) {
        const blocked = (s.storyline_tags ?? []).some(
          (t) => (tagCount.get(t) ?? 0) >= MAX_TAG_PER_BOARD,
        )
        if (blocked) return 0
      }
      // 1/(1+uses)^2 — an unused square is 4x a once-used one, 9x a twice-used one
      return 1 / Math.pow(1 + (useCount.get(s.id) ?? 0), 2)
    }

    let idx = weightedPick(remaining.map((s) => weight(s, true)))
    if (idx === -1) idx = weightedPick(remaining.map((s) => weight(s, false)))
    if (idx === -1) idx = Math.floor(Math.random() * remaining.length)

    const [chosen] = remaining.splice(idx, 1)
    picked.push(chosen)
    for (const tag of chosen.storyline_tags ?? []) {
      tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1)
    }
  }

  return picked
}

/**
 * Cost of a candidate board. Lower is better; 0 is a board that satisfies every
 * target. Each term maps to one line of the pool's balancing_method.
 */
function scoreCandidate(
  candidate: BingoSquareRow[],
  ctx: {
    targetEv: number
    existingCards: number[][]
    existingEv: number[]
    useCount: Map<number, number>
    byId: Map<number, BingoSquareRow>
  },
): number {
  const ids = candidate.map((s) => s.id)
  const ev = boardExpectedHits(ids, ctx.byId)
  let cost = 0

  // Difficulty on target, and close to the boards already dealt.
  // Weighted heavily: "nobody got the easy card" is the one complaint that
  // makes the whole game feel unfair, and the other terms are cosmetic next
  // to it.
  //
  // Every board is pulled to within half a tolerance of the target rather than
  // just to within tolerance of each other. Boards are dealt one at a time as
  // players arrive, so pinning each to the same absolute number is what keeps
  // the sixth board close to the first — chaining board-to-board comparisons
  // lets the room drift.
  const evGap = Math.abs(ev - ctx.targetEv)
  cost += evGap * 6
  cost += Math.max(0, evGap - EV_TOLERANCE / 2) * 20
  for (const otherEv of ctx.existingEv) {
    cost += Math.max(0, Math.abs(ev - otherEv) - EV_TOLERANCE) * 8
  }

  // Don't deal someone a near-copy of another player's board
  const idSet = new Set(ids)
  for (const card of ctx.existingCards) {
    const overlap = card.filter((id) => id !== 0 && idSet.has(id)).length
    cost += Math.max(0, overlap - SOFT_OVERLAP_CAP) * 1.5
    cost += Math.max(0, overlap - HARD_OVERLAP_CAP) * 4
  }

  // One storyline shouldn't decide the whole board
  const tagCount = new Map<string, number>()
  for (const s of candidate) {
    for (const tag of s.storyline_tags ?? []) tagCount.set(tag, (tagCount.get(tag) ?? 0) + 1)
  }
  for (const c of tagCount.values()) {
    cost += Math.max(0, c - PREFERRED_TAG_PER_BOARD) * 1.5
    cost += Math.max(0, c - MAX_TAG_PER_BOARD) * 4
  }

  // Mechanically balanced but tonally flat is still a bad board
  const funTypes = new Set(candidate.map((s) => s.fun_type).filter(Boolean))
  cost += Math.max(0, MIN_FUN_TYPES - funTypes.size) * 0.75

  // Squares that resolve together shouldn't stack up
  const slugs = new Set(candidate.map((s) => s.slug))
  const nested = NESTED_SQUARE_PAIRS.filter(([a, b]) => slugs.has(a) && slugs.has(b)).length
  cost += Math.max(0, nested - 1) * 6

  // Spread the pool across boards instead of leaning on the same favourites
  for (const s of candidate) {
    cost += Math.max(0, (ctx.useCount.get(s.id) ?? 0) - (TARGET_APPEARANCES - 1)) * 1.5
  }

  return cost
}

/**
 * Legacy path: fewest-used-first selection, no difficulty balancing.
 * Used when the squares table predates the master pool migration, so a client
 * on an old schema still deals a playable card instead of throwing.
 */
function generateUnbalancedCard(allSquares: BingoSquareRow[], existingCards: number[][]): number[] {
  const freq = new Map<number, number>()
  for (const card of existingCards) {
    for (const id of card) {
      if (id === 0) continue
      freq.set(id, (freq.get(id) ?? 0) + 1)
    }
  }

  const sorted = [...allSquares].sort((a, b) => {
    const diff = (freq.get(a.id) ?? 0) - (freq.get(b.id) ?? 0)
    return diff !== 0 ? diff : Math.random() - 0.5
  })

  return layOutCard(sorted.slice(0, 24).map((s) => s.id))
}

/** Shuffles 24 ids and drops the FREE sentinel into the centre. */
function layOutCard(ids: number[]): number[] {
  const selected = [...ids]
  for (let i = selected.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[selected[i], selected[j]] = [selected[j], selected[i]]
  }
  return [...selected.slice(0, 12), 0, ...selected.slice(12)]
}

// ─── generateBingoCard ────────────────────────────────────────────────────────

/**
 * Deals one 25-element card (24 live squares + FREE at index 12).
 *
 * Boards are drawn to a fixed tier mix, then chosen from CANDIDATE_BOARDS
 * candidates by scoreCandidate — so every player gets a board of roughly equal
 * expected difficulty without getting a copy of anyone else's.
 *
 * Cards are dealt one at a time as players arrive, not solved for jointly, so
 * `existingCards` is how a new board knows what to differ from. The first board
 * dealt in a room is scored on difficulty and variety alone.
 */
export function generateBingoCard(
  allSquares: BingoSquareRow[],
  existingCards: number[][],
): number[] {
  const pool = allSquares.filter((s) => s.id !== 0)

  if (pool.length < 24) {
    console.error(`generateBingoCard: need at least 24 squares, got ${pool.length}`)
    return generateUnbalancedCard(pool, existingCards)
  }

  const byTier = new Map<LikelihoodTier, BingoSquareRow[]>()
  for (const tier of TIERS) byTier.set(tier, [])
  for (const s of pool) {
    if (hasTierData(s)) byTier.get(s.likelihood_tier)!.push(s)
  }

  // Un-migrated squares table — fall back rather than deal a broken card
  const shortTier = TIERS.find((t) => byTier.get(t)!.length < BOARD_TIER_MIX[t])
  if (shortTier) {
    console.warn(
      `generateBingoCard: tier "${shortTier}" has ${byTier.get(shortTier)!.length} squares but a board needs ` +
        `${BOARD_TIER_MIX[shortTier]}. Falling back to unbalanced selection.`,
    )
    return generateUnbalancedCard(pool, existingCards)
  }

  const byId = new Map(pool.map((s) => [s.id, s]))

  // How often each square already appears across the room's boards
  const useCount = new Map<number, number>()
  for (const card of existingCards) {
    for (const id of card) {
      if (id === 0) continue
      useCount.set(id, (useCount.get(id) ?? 0) + 1)
    }
  }

  // Target difficulty: the tier mix evaluated against this pool's own averages,
  // so it stays correct if the pool is ever revised.
  const targetEv = TIERS.reduce((sum, tier) => {
    const tierPool = byTier.get(tier)!
    const mean = tierPool.reduce((a, s) => a + s.probability_pct / 100, 0) / tierPool.length
    return sum + mean * BOARD_TIER_MIX[tier]
  }, 0)

  const existingEv = existingCards.map((card) =>
    boardExpectedHits(card.filter((id) => id !== 0), byId),
  )

  const ctx = { targetEv, existingCards, existingEv, useCount, byId }

  let best: BingoSquareRow[] | null = null
  let bestCost = Infinity

  for (let attempt = 0; attempt < CANDIDATE_BOARDS; attempt++) {
    const tagCount = new Map<string, number>()
    const candidate: BingoSquareRow[] = []
    for (const tier of TIERS) {
      candidate.push(...drawFromTier(byTier.get(tier)!, BOARD_TIER_MIX[tier], useCount, tagCount))
    }
    if (candidate.length < 24) continue

    const cost = scoreCandidate(candidate, ctx)
    if (cost < bestCost) {
      bestCost = cost
      best = candidate
      if (cost === 0) break // can't do better than every target met
    }
  }

  if (!best) return generateUnbalancedCard(pool, existingCards)

  return layOutCard(best.map((s) => s.id))
}

// ─── checkBingo ───────────────────────────────────────────────────────────────

/**
 * Checks all 12 lines against the current marked indices.
 * FREE CENTER is always treated as marked regardless of the input set.
 *
 * @param prevLines  Previously known complete lines. Used to compute newLines.
 *                   Pass [] on first call; pass the last result's lines after that.
 */
export function checkBingo(
  markedIndices: Set<number>,
  prevLines: readonly number[][] = [],
): { hasBingo: boolean; lines: number[][]; newLines: number[][] } {
  const effective = new Set(markedIndices)
  effective.add(FREE_CENTER_INDEX)

  const lines = BINGO_LINES.filter((line) =>
    line.every((idx) => effective.has(idx)),
  ) as number[][]

  const prevKeys = new Set(prevLines.map((l) => l.join(',')))
  const newLines = lines.filter((l) => !prevKeys.has(l.join(',')))

  return { hasBingo: lines.length > 0, lines, newLines }
}

// ─── countBingos ─────────────────────────────────────────────────────────────

export function countBingos(lines: number[][]): number {
  return lines.length
}

// ─── isBlackout ───────────────────────────────────────────────────────────────

/** All 25 positions marked (free center counts automatically). */
export function isBlackout(markedIndices: Set<number>): boolean {
  const effective = new Set(markedIndices)
  effective.add(FREE_CENTER_INDEX)
  return effective.size === 25
}

// ─── splitWinCondition ────────────────────────────────────────────────────────

/**
 * Splits prose into sentences: a terminator counts as one only when whitespace
 * or the end of the string follows it, so "10.5" and "S3.E8" stay whole.
 *
 * Written as a scan rather than the obvious `split(/(?<=[.!?])\s+/)` on purpose.
 * Lookbehind is a parse-time syntax error on Safari before 16.4 — not a broken
 * bingo card, a blank app, because the whole bundle fails to parse. Not a trade
 * worth making to save six lines on a phone-first party app.
 */
function splitSentences(text: string): string[] {
  const trimmed = text.trim()
  const out: string[] = []
  let start = 0

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i]
    if (char !== '.' && char !== '!' && char !== '?') continue
    const next = trimmed[i + 1]
    if (next !== undefined && !/\s/.test(next)) continue
    const sentence = trimmed.slice(start, i + 1).trim()
    if (sentence) out.push(sentence)
    start = i + 1
  }

  // Anything after the last terminator (or text with no terminator at all)
  const tail = trimmed.slice(start).trim()
  if (tail) out.push(tail)

  return out
}

/**
 * Splits a square's win condition into the rule and its fine print.
 *
 * Every one of the 75 pool entries is exactly two sentences: what must happen,
 * then the qualifier. The qualifier is the half worth reading during the
 * episode — "Roaring, posturing, chasing without contact ... does not count" is
 * what settles the argument, while the rule half only restates the title.
 *
 * DELIBERATELY UNLABELLED. 69 of the 75 qualifiers narrow the square, but six
 * widen it ("A refusal counts if it changes what happens", "Sword, axe, dragon,
 * accident, or another gruesome method all count"). Calling the second sentence
 * "what doesn't count" would be confidently wrong on those six, at the exact
 * moment someone is deciding. The sentences already say which way they cut, so
 * this surfaces the text and lets it speak.
 *
 * Falls back to putting everything in `rule` if a square is ever written as a
 * single sentence.
 */
export function splitWinCondition(winCondition: string): { rule: string; finePrint: string } {
  const sentences = splitSentences(winCondition)

  if (sentences.length < 2) return { rule: winCondition.trim(), finePrint: '' }

  return {
    rule: sentences.slice(0, -1).join(' '),
    finePrint: sentences[sentences.length - 1],
  }
}

// ─── computeSquarePoints ──────────────────────────────────────────────────────

/**
 * What one approved square is worth, by how unlikely it was.
 *
 * Catching "Named Dragon Snack" (12%) is five times the read that "Named Death"
 * (80%) is, and the pool's probability estimates are what make that sayable in
 * points. Tiers rather than a formula on probability_pct because a party needs a
 * number you can shout: chaos squares are worth five, everyone understands that
 * by the second one.
 */
export const TIER_POINTS: Record<LikelihoodTier, number> = {
  likely: 1,
  toss_up: 2,
  long_shot: 3,
  chaos: 5,
}

/**
 * Sums the tier value of every marked square on a card.
 *
 * `squares` is the 25-entry positional array (null at the free centre), so
 * indices line up with markedIndices. Squares without tier data score 0 rather
 * than throwing — a pre-migration card still totals, it just totals lines only.
 */
export function computeSquarePoints(
  squares: ReadonlyArray<BingoSquareRow | null>,
  markedIndices: Set<number>,
): number {
  let points = 0
  for (const index of markedIndices) {
    if (index === FREE_CENTER_INDEX) continue
    const tier = squares[index]?.likelihood_tier
    if (tier) points += TIER_POINTS[tier] ?? 0
  }
  return points
}

// ─── computeBingoScore ────────────────────────────────────────────────────────

/**
 * Scoring breakdown:
 *   Each approved square → 1 / 2 / 3 / 5 pts by tier (see TIER_POINTS)
 *   1st bingo line       → 15 pts
 *   2nd bingo line       → 10 pts
 *   3rd+ bingo line      → 5 pts each
 *   Blackout bonus       → 25 pts
 *
 * WHY THE SQUARE POINTS CAME BACK
 * They were removed in the first rebalance for a good reason: they "paid for
 * card luck rather than for reading the episode", because with a hand-written
 * pool one player's card could be far easier than another's. The researched
 * pool and the tier-balanced generator killed that objection. Every board is
 * now drawn to the same 7/9/6/2 tier mix, so two players' cards have identical
 * expected square points by construction (~20.4), and land within ~0.4 expected
 * hits of each other. What differs is what actually happened and who caught it.
 *
 * The same rebalance also left a hole. It set the line values against the old
 * pool, where squares like "a dragon roars in close-up" hit by default and
 * "multiple lines are near-certain". The new pool averages 46% per square, so
 * lines are genuinely rare. Simulating 12,000 boards against the pool's own
 * probabilities, line-only scoring paid a mean of 5.1 and left **70.6% of
 * players on exactly zero** — a whole third of the night that most people never
 * score in. Blackout came up 0 times in 12,000; it stays as a myth, not a plan.
 *
 * Tier points fix that without re-inflating the mode. Measured over the same
 * 12,000 boards: mean 25.6, median 22, p10 14, p90 42, nobody on zero. That is
 * the "~30 in a typical game" the previous rebalance was aiming for, and it
 * keeps the original intent — Draft and Picks decide the winner, bingo decides
 * between players who played those equally well.
 *
 * Lines keep their values. They now sit on top of a base everyone earns, which
 * is what makes a line feel like a spike instead of the only thing worth having.
 *
 * `squarePoints` defaults to 0 so a caller without square metadata to hand still
 * gets the line-only total instead of a wrong one.
 */
export function computeBingoScore(
  bingoCount: number,
  hasBlackout: boolean,
  squarePoints = 0,
): number {
  let score = squarePoints
  if (bingoCount >= 1) score += 15
  if (bingoCount >= 2) score += 10
  if (bingoCount >= 3) score += (bingoCount - 2) * 5
  if (hasBlackout) score += 25
  return score
}

// ─── checkObjectiveCondition ─────────────────────────────────────────────────

/**
 * Determines whether an objective bingo square's condition is currently met.
 *
 * Pattern matching covers the most common square types:
 *   "[name] wins any award"     → checks all winning nominees for name/film match
 *   "[name] speaks at the podium" → equivalent to wins any award
 *   "[name] wins [category]"    → checks specific category winner
 *
 * Unrecognized patterns conservatively return false — the host approves manually.
 */
// Returns true if `nameStr` contains `target` as a whole word (not a substring
// of another word). e.g. "ryan" matches "Ryan Coogler" but not "Renée Zellweger".
function nameMatchesTarget(nameStr: string, target: string): boolean {
  // Escape regex metacharacters in target before building the word-boundary pattern
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`).test(nameStr)
}

export function checkObjectiveCondition(
  squareText: string,
  categories: CategoryRow[],
  nominees: NomineeRow[],
): boolean {
  const text = squareText.toLowerCase().trim()

  const winnerIds = new Set<string>()
  categories.filter((c) => c.winner_id != null).forEach((c) => {
    winnerIds.add(c.winner_id!)
    if (c.tie_winner_id) winnerIds.add(c.tie_winner_id)
  })
  if (winnerIds.size === 0) return false

  const winningNominees = nominees.filter((n) => winnerIds.has(n.id))
  if (winningNominees.length === 0) return false

  // ── Pattern: "[target] wins any award" ───────────────────────────────────
  const winsAnyMatch = text.match(/^(.+?)\s+wins any award/)
  if (winsAnyMatch) {
    const target = winsAnyMatch[1]
    return winningNominees.some(
      (n) =>
        nameMatchesTarget(n.name.toLowerCase(), target) ||
        nameMatchesTarget(n.film_name.toLowerCase(), target),
    )
  }

  // ── Pattern: "[target] speaks at the podium" ─────────────────────────────
  const podiumMatch = text.match(/^(.+?)\s+(?:speaks at|at)\s+the podium/)
  if (podiumMatch) {
    const target = podiumMatch[1]
    return winningNominees.some((n) => nameMatchesTarget(n.name.toLowerCase(), target))
  }

  // ── Pattern: "[person] wins [category name]" ─────────────────────────────
  const winsCatMatch = text.match(/^(.+?)\s+wins\s+(.+)$/)
  if (winsCatMatch) {
    const personTarget = winsCatMatch[1]
    const catTarget = winsCatMatch[2].toLowerCase().replace(/^best\s+/, '')

    const cat = categories.find((c) => {
      const cn = c.name.toLowerCase().replace(/^best\s+/, '')
      return cn.includes(catTarget) || catTarget.includes(cn)
    })

    if (cat?.winner_id) {
      const winner = nominees.find((n) => n.id === cat.winner_id)
      const tieWinner = cat.tie_winner_id ? nominees.find((n) => n.id === cat.tie_winner_id) : null
      const matchesWinner = winner
        ? nameMatchesTarget(winner.name.toLowerCase(), personTarget) ||
            nameMatchesTarget(winner.film_name.toLowerCase(), personTarget)
        : false
      const matchesTie = tieWinner
        ? nameMatchesTarget(tieWinner.name.toLowerCase(), personTarget) ||
            nameMatchesTarget(tieWinner.film_name.toLowerCase(), personTarget)
        : false
      return matchesWinner || matchesTie
    }
  }

  return false
}

// ─── computePlayerBingoScores ─────────────────────────────────────────────────

/**
 * Rolls a room's cards and marks up into per-player bingo scores and line counts.
 *
 * Extracted from useScores so the public results view computes bingo the same
 * way the live one does. Two copies of "which marks count and what are they
 * worth" would drift the first time the scale was retuned — which has already
 * happened once, when the Oscars values were rebalanced for the episode format.
 *
 * Only `approved` marks score. Pending and denied are ignored: the host is the
 * arbiter, and a mark nobody has confirmed is a claim, not a point.
 *
 * `squaresById` is the bingo_squares table keyed by id. Pass it to score the
 * per-square tier points; omit it and the total is lines only, which is what a
 * caller that has not fetched the squares table should get rather than a
 * silently low number.
 */
export function computePlayerBingoScores(
  players: Array<{ id: string }>,
  cards: BingoCardRow[],
  marks: BingoMarkRow[],
  squaresById?: Map<number, BingoSquareRow>,
): { scores: Map<string, number>; counts: Map<string, number> } {
  const scores = new Map<string, number>()
  const counts = new Map<string, number>()

  for (const player of players) {
    const card = cards.find((c) => c.player_id === player.id)
    if (!card) continue

    const approved = new Set<number>()
    marks
      .filter((m) => m.card_id === card.id && m.status === 'approved')
      .forEach((m) => approved.add(m.square_index))

    // Positional square array so indices line up with the mark indices
    const positional = squaresById
      ? (card.squares as number[]).map((id) => (id === 0 ? null : squaresById.get(id) ?? null))
      : []

    const { lines } = checkBingo(approved)
    const bingoCount = countBingos(lines)
    scores.set(
      player.id,
      computeBingoScore(bingoCount, isBlackout(approved), computeSquarePoints(positional, approved)),
    )
    counts.set(player.id, bingoCount)
  }

  return { scores, counts }
}
