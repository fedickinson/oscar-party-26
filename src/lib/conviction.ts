import type { CategoryRow, ConvictionPickRow, PlayerRow } from '../types/database'
import type { ShowPackGameContract } from '../types/game-contract'

/** Reads the one canonical portfolio size from the room-bound show-pack contract. */
export function resolveConvictionBudget(
  contract: ShowPackGameContract | null | undefined,
): number | null {
  if (contract?.commitment !== 'open_conviction') return null
  const budget = contract.conviction_budget
  return Number.isInteger(budget) && Number(budget) > 0 ? budget : null
}

export interface ConvictionPortfolioScore {
  score: number
  correctPickCount: number
  topCorrectPick: number
}

const EMPTY_SCORE: ConvictionPortfolioScore = {
  score: 0,
  correctPickCount: 0,
  topCorrectPick: 0,
}

/**
 * Scores the resolved authored beats in a room-declared show.
 *
 * Every slot is equal weight. A resolved beat owns one authored integer pot;
 * its believers split that pot equally and an indivisible remainder is not
 * awarded. Duplicate provisional declarations cannot pay the same belief
 * twice: the earliest canonical display row owns the outcome.
 */
export function computeConvictionPortfolioScores(
  players: readonly PlayerRow[],
  picks: readonly ConvictionPickRow[],
  categories: readonly CategoryRow[],
): Map<string, ConvictionPortfolioScore> {
  const playerIds = new Set(players.map((player) => player.id))
  const scores = new Map(players.map((player) => [player.id, { ...EMPTY_SCORE }]))
  const believersByBeat = new Map<number, Set<string>>()

  for (const pick of picks) {
    if (!playerIds.has(pick.player_id)) continue
    const believers = believersByBeat.get(pick.beat_id) ?? new Set<string>()
    believers.add(pick.player_id)
    believersByBeat.set(pick.beat_id, believers)
  }

  const paidBeats = new Set<number>()
  const resolved = [...categories]
    .filter((category) => category.winner_id != null && category.source_signature_beat_id != null)
    .sort((left, right) => left.display_order - right.display_order || left.id - right.id)

  for (const category of resolved) {
    const beatId = category.source_signature_beat_id as number
    if (paidBeats.has(beatId)) continue
    paidBeats.add(beatId)

    const believers = believersByBeat.get(beatId)
    if (!believers || believers.size === 0) continue
    const payout = Math.floor(category.points / believers.size)

    for (const playerId of believers) {
      const current = scores.get(playerId)
      if (!current) continue
      current.score += payout
      current.correctPickCount += 1
      current.topCorrectPick = Math.max(current.topCorrectPick, payout)
    }
  }

  return scores
}
