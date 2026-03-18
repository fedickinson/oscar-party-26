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

import type { BingoSquareRow, CategoryRow, NomineeRow } from '../types/database'

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

// ─── generateBingoCard ────────────────────────────────────────────────────────

/**
 * Generates a shuffled 25-element card array.
 * Prefers squares that appear less often in existing cards for variety.
 * Position 12 is always 0 (FREE CENTER).
 */
export function generateBingoCard(
  allSquares: BingoSquareRow[],
  existingCards: number[][],
): number[] {
  // Count how many existing cards use each square
  const freq = new Map<number, number>()
  for (const card of existingCards) {
    for (const id of card) {
      if (id === 0) continue
      freq.set(id, (freq.get(id) ?? 0) + 1)
    }
  }

  if (allSquares.length < 24) {
    console.error(`generateBingoCard: need at least 24 squares, got ${allSquares.length}`)
  }

  // Sort by frequency ascending; tie-break randomly for variety
  const sorted = [...allSquares].sort((a, b) => {
    const diff = (freq.get(a.id) ?? 0) - (freq.get(b.id) ?? 0)
    return diff !== 0 ? diff : Math.random() - 0.5
  })

  // Select 24 unique squares (fewest-used first)
  const selected = sorted.slice(0, 24).map((s) => s.id)

  // Fisher-Yates shuffle
  for (let i = selected.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[selected[i], selected[j]] = [selected[j], selected[i]]
  }

  // Insert FREE sentinel at position 12
  return [...selected.slice(0, 12), 0, ...selected.slice(12)]
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

// ─── computeBingoScore ────────────────────────────────────────────────────────

/**
 * Scoring breakdown:
 *   1st bingo line  → 25 pts
 *   2nd bingo line  → 15 pts
 *   3rd+ bingo line → 10 pts each
 *   Blackout bonus  → 50 pts
 *   Each approved square (excluding free center) → 1 pt
 */
export function computeBingoScore(
  bingoCount: number,
  hasBlackout: boolean,
  approvedSquareCount: number,
): number {
  let score = 0
  if (bingoCount >= 1) score += 25
  if (bingoCount >= 2) score += 15
  if (bingoCount >= 3) score += (bingoCount - 2) * 10
  if (hasBlackout) score += 50
  score += approvedSquareCount
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
