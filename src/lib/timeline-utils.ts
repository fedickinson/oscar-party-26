/**
 * timeline-utils.ts — pure functions for post-ceremony score timeline.
 *
 * Computes how each player's score evolved category-by-category across
 * the night, identifies dramatic turning points, and finds the closest
 * head-to-head rivalry.
 *
 * Zero React, zero Supabase, zero side effects — unit-testable.
 */

import type {
  CategoryRow,
  ConfidencePickRow,
  DraftPickRow,
  DraftEntityRow,
  NomineeRow,
  PlayerRow,
} from '../types/database'
import { findDraftPointsForWinner } from './scoring'
import type { PlayerScoreDetail, TimelinePoint, TurningPoint, HeadToHead } from '../types/timeline'

export type { PlayerScoreDetail, TimelinePoint, TurningPoint, HeadToHead }

// ─── computeScoreTimeline ───────────────────────────────────────────────────────

/**
 * Builds an ordered array of TimelinePoints, one per announced category.
 *
 * Categories are ordered by display_order (the ceremony presentation order).
 * Only categories with a winner_id set are included.
 *
 * For each category, each player's delta is computed from:
 *   - Confidence: did they pick the winner? If so, +confidence value.
 *   - Draft: did they draft the winning entity? If so, +category.points.
 */
export function computeScoreTimeline(
  categories: CategoryRow[],
  confidencePicks: ConfidencePickRow[],
  draftPicks: DraftPickRow[],
  draftEntities: DraftEntityRow[],
  nominees: NomineeRow[],
  players: PlayerRow[],
): TimelinePoint[] {
  const announced = categories
    .filter((c) => c.winner_id != null)
    .sort((a, b) => {
      if (a.announced_at && b.announced_at) {
        return new Date(a.announced_at).getTime() - new Date(b.announced_at).getTime()
      }
      return a.display_order - b.display_order
    })

  // Running cumulative scores per player
  const cumulative: Record<string, number> = {}
  players.forEach((p) => { cumulative[p.id] = 0 })

  return announced.map((cat, index) => {
    const winner = nominees.find((n) => n.id === cat.winner_id)
    const playerScores: Record<string, PlayerScoreDetail> = {}

    players.forEach((player) => {
      // Confidence delta
      const confPick = confidencePicks.find(
        (cp) => cp.player_id === player.id && cp.category_id === cat.id,
      )
      const confCorrect = confPick ? (confPick.nominee_id === cat.winner_id || confPick.nominee_id === cat.tie_winner_id) : false
      const confDelta = confCorrect ? confPick!.confidence : 0

      // Draft delta (first winner)
      const { playerId: draftWinnerId, points: draftPoints } = findDraftPointsForWinner(
        cat.id,
        cat.winner_id!,
        categories,
        nominees,
        draftEntities,
        draftPicks,
      )
      let draftDelta = draftWinnerId === player.id ? draftPoints : 0

      // Draft delta for tie winner (if any)
      if (cat.tie_winner_id) {
        const tieResult = findDraftPointsForWinner(
          cat.id,
          cat.tie_winner_id,
          categories,
          nominees,
          draftEntities,
          draftPicks,
        )
        if (tieResult.playerId === player.id) draftDelta += tieResult.points
      }

      const delta = confDelta + draftDelta
      cumulative[player.id] = (cumulative[player.id] ?? 0) + delta

      let source: PlayerScoreDetail['source'] = 'none'
      if (confDelta > 0 && draftDelta > 0) source = 'both'
      else if (confDelta > 0) source = 'confidence'
      else if (draftDelta > 0) source = 'draft'

      playerScores[player.id] = {
        cumulative: cumulative[player.id],
        delta,
        source,
      }
    })

    return {
      categoryIndex: index + 1,
      categoryName: cat.name,
      winnerName: winner?.name ?? 'Unknown',
      winnerFilm: winner?.film_name ?? '',
      playerScores,
    }
  })
}

// ─── identifyTurningPoints ──────────────────────────────────────────────────────

/**
 * Finds max 4 key moments in the timeline:
 *   - Lead changes (player A was leading, now player B leads)
 *   - Biggest single-category swing (largest delta by any player)
 *   - Category where the gap between 1st and 2nd was closest
 *
 * Returns descriptions using player names, not IDs.
 */
export function identifyTurningPoints(
  timeline: TimelinePoint[],
  players: PlayerRow[],
): TurningPoint[] {
  if (timeline.length === 0) return []

  const nameMap = new Map(players.map((p) => [p.id, p.name]))
  const playerIds = players.map((p) => p.id)
  const points: TurningPoint[] = []

  // Track lead changes
  let prevLeaderId: string | null = null
  for (const point of timeline) {
    const sorted = [...playerIds].sort(
      (a, b) =>
        (point.playerScores[b]?.cumulative ?? 0) -
        (point.playerScores[a]?.cumulative ?? 0),
    )
    const currentLeader = sorted[0]
    const currentLeaderScore = point.playerScores[currentLeader]?.cumulative ?? 0

    if (
      prevLeaderId !== null &&
      currentLeader !== prevLeaderId &&
      currentLeaderScore > 0
    ) {
      points.push({
        categoryIndex: point.categoryIndex,
        categoryName: point.categoryName,
        description: `${nameMap.get(currentLeader) ?? 'Unknown'} took the lead after ${point.categoryName}`,
      })
    }
    prevLeaderId = currentLeader
  }

  // Find biggest single swing
  let biggestDelta = 0
  let biggestSwingPoint: TimelinePoint | null = null
  let biggestSwingPlayer = ''

  for (const point of timeline) {
    for (const pid of playerIds) {
      const d = point.playerScores[pid]?.delta ?? 0
      if (d > biggestDelta) {
        biggestDelta = d
        biggestSwingPoint = point
        biggestSwingPlayer = pid
      }
    }
  }

  if (biggestSwingPoint && biggestDelta > 0) {
    // Avoid duplicating a lead-change point
    const alreadyListed = points.some(
      (p) => p.categoryIndex === biggestSwingPoint!.categoryIndex,
    )
    if (!alreadyListed) {
      points.push({
        categoryIndex: biggestSwingPoint.categoryIndex,
        categoryName: biggestSwingPoint.categoryName,
        description: `${nameMap.get(biggestSwingPlayer) ?? 'Unknown'} scored ${biggestDelta} points on ${biggestSwingPoint.categoryName} — the biggest swing of the night`,
      })
    }
  }

  // Find the closest gap moment (smallest non-zero gap between 1st and 2nd)
  let closestGap = Infinity
  let closestPoint: TimelinePoint | null = null

  for (const point of timeline) {
    const scores = playerIds
      .map((pid) => point.playerScores[pid]?.cumulative ?? 0)
      .sort((a, b) => b - a)
    if (scores.length >= 2 && scores[0] > 0) {
      const gap = scores[0] - scores[1]
      if (gap < closestGap && gap >= 0) {
        closestGap = gap
        closestPoint = point
      }
    }
  }

  if (closestPoint && closestGap < Infinity) {
    const alreadyListed = points.some(
      (p) => p.categoryIndex === closestPoint!.categoryIndex,
    )
    if (!alreadyListed) {
      const gapText =
        closestGap === 0
          ? 'The scores were tied'
          : `Only ${closestGap} point${closestGap === 1 ? '' : 's'} separated 1st and 2nd`
      points.push({
        categoryIndex: closestPoint.categoryIndex,
        categoryName: closestPoint.categoryName,
        description: `${gapText} after ${closestPoint.categoryName}`,
      })
    }
  }

  // Sort by category order and cap at 4
  return points
    .sort((a, b) => a.categoryIndex - b.categoryIndex)
    .slice(0, 4)
}

// ─── identifyHeadToHead ─────────────────────────────────────────────────────────

/**
 * Finds the two players who spent the most categories within 5 points of
 * each other. This is the "closest rivalry" of the night.
 */
export function identifyHeadToHead(
  timeline: TimelinePoint[],
  players: PlayerRow[],
): HeadToHead | null {
  if (players.length < 2 || timeline.length === 0) return null

  const nameMap = new Map(players.map((p) => [p.id, p.name]))
  let bestPair: [string, string] = [players[0].id, players[1].id]
  let bestNeck = 0

  // Check all pairs
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i].id
      const b = players[j].id
      let neckCount = 0

      for (const point of timeline) {
        const scoreA = point.playerScores[a]?.cumulative ?? 0
        const scoreB = point.playerScores[b]?.cumulative ?? 0
        if (Math.abs(scoreA - scoreB) <= 5) neckCount++
      }

      if (neckCount > bestNeck) {
        bestNeck = neckCount
        bestPair = [a, b]
      }
    }
  }

  if (bestNeck === 0) return null

  const nameA = nameMap.get(bestPair[0]) ?? 'Unknown'
  const nameB = nameMap.get(bestPair[1]) ?? 'Unknown'
  const pct = Math.round((bestNeck / timeline.length) * 100)

  return {
    playerA: bestPair[0],
    playerB: bestPair[1],
    categoriesNeck: bestNeck,
    narrative: `${nameA} and ${nameB} were within 5 points of each other for ${bestNeck} of ${timeline.length} categories (${pct}% of the night)`,
  }
}

// ─── describeFinalStretch ───────────────────────────────────────────────────────

/**
 * Generates a natural-language narrative about the last 6 categories.
 * Covers: who gained the most ground, any lead changes, and the final gap.
 */
export function describeFinalStretch(
  timeline: TimelinePoint[],
  players: PlayerRow[],
): string {
  if (timeline.length < 2) return 'Not enough categories to analyze the final stretch.'

  const stretchSize = Math.min(6, timeline.length)
  const stretch = timeline.slice(-stretchSize)
  const nameMap = new Map(players.map((p) => [p.id, p.name]))
  const playerIds = players.map((p) => p.id)

  // Score at start of stretch vs end
  const startPoint = timeline.length > stretchSize
    ? timeline[timeline.length - stretchSize - 1]
    : null

  const endPoint = timeline[timeline.length - 1]

  // Compute gains during the stretch
  const gains: Array<{ id: string; gain: number }> = playerIds.map((pid) => {
    const startScore = startPoint
      ? startPoint.playerScores[pid]?.cumulative ?? 0
      : 0
    const endScore = endPoint.playerScores[pid]?.cumulative ?? 0
    return { id: pid, gain: endScore - startScore }
  })

  gains.sort((a, b) => b.gain - a.gain)
  const topGainer = gains[0]

  // Final standings
  const finalScores = playerIds
    .map((pid) => ({
      id: pid,
      score: endPoint.playerScores[pid]?.cumulative ?? 0,
    }))
    .sort((a, b) => b.score - a.score)

  const winner = finalScores[0]
  const runnerUp = finalScores[1]
  const finalGap = winner && runnerUp ? winner.score - runnerUp.score : 0

  const parts: string[] = []

  // Who gained the most
  if (topGainer && topGainer.gain > 0) {
    parts.push(
      `${nameMap.get(topGainer.id) ?? 'Unknown'} surged with ${topGainer.gain} points in the final ${stretchSize} categories`,
    )
  }

  // Lead changes in the stretch
  let stretchLeadChanges = 0
  let prevLeader: string | null = startPoint
    ? playerIds.reduce((a, b) =>
        (startPoint.playerScores[a]?.cumulative ?? 0) >=
        (startPoint.playerScores[b]?.cumulative ?? 0)
          ? a
          : b,
      )
    : null

  for (const point of stretch) {
    const leader = playerIds.reduce((a, b) =>
      (point.playerScores[a]?.cumulative ?? 0) >=
      (point.playerScores[b]?.cumulative ?? 0)
        ? a
        : b,
    )
    if (prevLeader && leader !== prevLeader) stretchLeadChanges++
    prevLeader = leader
  }

  if (stretchLeadChanges > 0) {
    parts.push(
      `The lead changed hands ${stretchLeadChanges} time${stretchLeadChanges === 1 ? '' : 's'} down the stretch`,
    )
  }

  // Final gap
  if (winner && runnerUp) {
    const winnerName = nameMap.get(winner.id) ?? 'Unknown'
    if (finalGap === 0) {
      parts.push(`${winnerName} and ${nameMap.get(runnerUp.id) ?? 'Unknown'} finished in a dead heat`)
    } else {
      parts.push(`${winnerName} sealed the victory by ${finalGap} point${finalGap === 1 ? '' : 's'}`)
    }
  }

  return parts.join('. ') + '.'
}

// ─── computeBreakdownTimeline ───────────────────────────────────────────────────

/**
 * Splits the main timeline into confidence-only and draft-only cumulative
 * lines, for use in the MiniTimelines breakdown charts.
 */
export function computeBreakdownTimeline(
  timeline: TimelinePoint[],
  players: PlayerRow[],
  categories: CategoryRow[],
  confidencePicks: ConfidencePickRow[],
  draftPicks: DraftPickRow[],
  draftEntities: DraftEntityRow[],
  nominees: NomineeRow[],
): {
  confidence: Array<{ categoryIndex: number; categoryName: string } & Record<string, number>>
  draft: Array<{ categoryIndex: number; categoryName: string } & Record<string, number>>
} {
  const announced = categories
    .filter((c) => c.winner_id != null)
    .sort((a, b) => {
      if (a.announced_at && b.announced_at) {
        return new Date(a.announced_at).getTime() - new Date(b.announced_at).getTime()
      }
      return a.display_order - b.display_order
    })

  const confCumulative: Record<string, number> = {}
  const draftCumulative: Record<string, number> = {}
  players.forEach((p) => {
    confCumulative[p.id] = 0
    draftCumulative[p.id] = 0
  })

  const confidenceData: Array<Record<string, number | string>> = []
  const draftData: Array<Record<string, number | string>> = []

  announced.forEach((cat, index) => {
    const confRow: Record<string, number | string> = {
      categoryIndex: index + 1,
      categoryName: cat.name,
    }
    const draftRow: Record<string, number | string> = {
      categoryIndex: index + 1,
      categoryName: cat.name,
    }

    players.forEach((player) => {
      // Confidence
      const confPick = confidencePicks.find(
        (cp) => cp.player_id === player.id && cp.category_id === cat.id,
      )
      const confCorrect = confPick ? (confPick.nominee_id === cat.winner_id || confPick.nominee_id === cat.tie_winner_id) : false
      const confDelta = confCorrect ? confPick!.confidence : 0
      confCumulative[player.id] += confDelta
      confRow[player.id] = confCumulative[player.id]

      // Draft (first winner)
      const { playerId: draftWinnerId, points: draftPoints } = findDraftPointsForWinner(
        cat.id,
        cat.winner_id!,
        categories,
        nominees,
        draftEntities,
        draftPicks,
      )
      let draftDelta = draftWinnerId === player.id ? draftPoints : 0
      // Draft (tie winner)
      if (cat.tie_winner_id) {
        const tieResult = findDraftPointsForWinner(
          cat.id,
          cat.tie_winner_id,
          categories,
          nominees,
          draftEntities,
          draftPicks,
        )
        if (tieResult.playerId === player.id) draftDelta += tieResult.points
      }
      draftCumulative[player.id] += draftDelta
      draftRow[player.id] = draftCumulative[player.id]
    })

    confidenceData.push(confRow)
    draftData.push(draftRow)
  })

  return {
    confidence: confidenceData as Array<{ categoryIndex: number; categoryName: string } & Record<string, number>>,
    draft: draftData as Array<{ categoryIndex: number; categoryName: string } & Record<string, number>>,
  }
}
