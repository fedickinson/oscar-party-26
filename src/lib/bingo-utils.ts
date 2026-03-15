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
export function checkObjectiveCondition(
  squareText: string,
  categories: CategoryRow[],
  nominees: NomineeRow[],
): boolean {
  const text = squareText.toLowerCase().trim()

  const winnerIds = new Set(
    categories.filter((c) => c.winner_id != null).map((c) => c.winner_id!),
  )
  if (winnerIds.size === 0) return false

  const winningNominees = nominees.filter((n) => winnerIds.has(n.id))
  if (winningNominees.length === 0) return false

  // ── Pattern: "[target] wins any award" ───────────────────────────────────
  const winsAnyMatch = text.match(/^(.+?)\s+wins any award/)
  if (winsAnyMatch) {
    const target = winsAnyMatch[1]
    return winningNominees.some(
      (n) =>
        n.name.toLowerCase().includes(target) ||
        n.film_name.toLowerCase().includes(target),
    )
  }

  // ── Pattern: "[target] speaks at the podium" ─────────────────────────────
  const podiumMatch = text.match(/^(.+?)\s+(?:speaks at|at)\s+the podium/)
  if (podiumMatch) {
    const target = podiumMatch[1]
    return winningNominees.some((n) => n.name.toLowerCase().includes(target))
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
      return winner
        ? winner.name.toLowerCase().includes(personTarget) ||
            winner.film_name.toLowerCase().includes(personTarget)
        : false
    }
  }

  return false
}
