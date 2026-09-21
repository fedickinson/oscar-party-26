/**
 * winner-feed — the Scores tab's live feed entries, derived from canonical rows.
 *
 * The feed used to exist only as a side effect of the Realtime winner callback,
 * so a phone that reloaded mid-show had an empty feed while the stats below it
 * named winners. One builder now serves both paths: the callback builds the one
 * entry its event announced, and hydration seeds the whole feed from the
 * canonical record. Nothing is recomputed twice from a second copy of the rules.
 *
 * Pure by contract: no React, no Supabase, no async.
 */

import { findDraftPointsForWinner } from './scoring'
import { computeConvictionPortfolioScores } from './conviction'
import type {
  CategoryRow,
  ConfidencePickRow,
  ConvictionPickRow,
  DraftEntityRow,
  DraftPickRow,
  GameModel,
  NomineeRow,
  PlayerRow,
} from '../types/database'

export interface PlayerImpact {
  playerId: string
  playerName: string
  avatarId: string
  confidenceDelta: number
  confidencePickedName: string | null
  confidenceCorrect: boolean
  draftDelta: number
  draftedEntityName: string | null
}

export interface WinnerFeedEntry {
  kind: 'winner'
  categoryId: number
  categoryName: string
  categoryTier: number
  categoryPoints: number
  winnerName: string
  winnerFilm: string
  /** Second winner name when there is a tie */
  tieWinnerName: string | null
  /** Second winner film when there is a tie */
  tieWinnerFilm: string | null
  time: Date
  playerImpacts: PlayerImpact[]
}

/** Everything one feed entry needs, all of it owned elsewhere. */
export interface WinnerFeedContext {
  gameModel: GameModel
  players: readonly PlayerRow[]
  categories: readonly CategoryRow[]
  nominees: readonly NomineeRow[]
  confidencePicks: readonly ConfidencePickRow[]
  convictionPicks: readonly ConvictionPickRow[]
  draftPicks: readonly DraftPickRow[]
  draftEntities: readonly DraftEntityRow[]
}

export interface WinnerFeedOutcome {
  categoryId: number
  winnerId: string
  tieWinnerId: string | null
  time: Date
}

/**
 * One feed entry for one declared outcome, or null when the category or the
 * winning nominee is not in the loaded record yet. The caller decides what a
 * null means — the Realtime path waits for the row, hydration skips it.
 */
export function buildWinnerFeedEntry(
  context: WinnerFeedContext,
  outcome: WinnerFeedOutcome,
): WinnerFeedEntry | null {
  const category = context.categories.find((c) => c.id === outcome.categoryId)
  if (!category) return null

  const winner = context.nominees.find((n) => n.id === outcome.winnerId)
  if (!winner) return null

  const tieWinner = outcome.tieWinnerId
    ? context.nominees.find((n) => n.id === outcome.tieWinnerId) ?? null
    : null

  const categoriesWithOutcome = context.categories.map((c) => (
    c.id === outcome.categoryId
      ? { ...c, winner_id: outcome.winnerId, tie_winner_id: outcome.tieWinnerId }
      : c
  ))
  const isConviction = context.gameModel === 'conviction_portfolio'

  const draftWinnerResult = isConviction
    ? { playerId: null, points: 0, entityId: null }
    : findDraftPointsForWinner(
      outcome.categoryId,
      outcome.winnerId,
      categoriesWithOutcome,
      [...context.nominees],
      [...context.draftEntities],
      [...context.draftPicks],
    )

  const draftTieResult = !isConviction && outcome.tieWinnerId
    ? findDraftPointsForWinner(
      outcome.categoryId,
      outcome.tieWinnerId,
      categoriesWithOutcome,
      [...context.nominees],
      [...context.draftEntities],
      [...context.draftPicks],
    )
    : { playerId: null, points: 0, entityId: null }

  const draftImpactByPlayer = new Map<string, { points: number; entityNames: string[] }>()
  for (const result of [draftWinnerResult, draftTieResult]) {
    if (!result.playerId || !result.entityId || result.points <= 0) continue
    const entity = context.draftEntities.find((candidate) => candidate.id === result.entityId)
    if (!entity) continue
    const entityName = entity.type === 'film' ? entity.film_name : entity.name
    const current = draftImpactByPlayer.get(result.playerId) ?? { points: 0, entityNames: [] }
    current.points += result.points
    if (entityName && !current.entityNames.includes(entityName)) current.entityNames.push(entityName)
    draftImpactByPlayer.set(result.playerId, current)
  }

  const playerImpacts: PlayerImpact[] = context.players.map((player) => {
    const convictionOutcome = isConviction
      ? computeConvictionPortfolioScores(
          context.players,
          context.convictionPicks,
          categoriesWithOutcome.filter((c) => c.id === outcome.categoryId),
        ).get(player.id)
      : null
    const confPick = context.confidencePicks.find(
      (p) => p.player_id === player.id && p.category_id === outcome.categoryId,
    )
    // In a tie, picks matching EITHER winner are correct. Compared by
    // nominee id, never by the confidence row's own is_correct — that
    // projection may not have arrived when a live event builds this entry.
    const confidenceCorrect = convictionOutcome != null
      ? convictionOutcome.correctPickCount > 0
      : confPick
        ? (confPick.nominee_id === outcome.winnerId || confPick.nominee_id === outcome.tieWinnerId)
        : false
    const confidenceDelta = convictionOutcome?.score ?? (confidenceCorrect ? confPick!.confidence : 0)
    const pickedNominee = confPick
      ? context.nominees.find((n) => n.id === confPick.nominee_id)
      : null
    const draftImpact = draftImpactByPlayer.get(player.id)

    return {
      playerId: player.id,
      playerName: player.name,
      avatarId: player.avatar_id,
      confidenceDelta,
      confidencePickedName: convictionOutcome ? category.name : (pickedNominee?.name ?? null),
      confidenceCorrect,
      draftDelta: draftImpact?.points ?? 0,
      draftedEntityName: draftImpact?.entityNames.join(' and ') || null,
    }
  })

  return {
    kind: 'winner',
    categoryId: category.id,
    categoryName: category.name,
    categoryTier: category.tier,
    categoryPoints: category.points,
    winnerName: winner.name,
    winnerFilm: winner.film_name,
    tieWinnerName: tieWinner?.name ?? null,
    tieWinnerFilm: tieWinner?.film_name ?? null,
    time: outcome.time,
    playerImpacts,
  }
}

/**
 * The announced ordering of the resolved slate, oldest first.
 *
 * `room_winners` carries no timestamp, so the only announced time available is
 * the category's own `announced_at` — set for a room-declared event, null for
 * an authored pack row whose winner arrived through the scheduled command. A
 * row without one falls back to the authored slate order, and untimed rows sort
 * before timed ones so a live declaration never appears older than the slate.
 */
export function compareAnnouncedOrder(left: CategoryRow, right: CategoryRow): number {
  const leftAt = parseAnnouncedAt(left)
  const rightAt = parseAnnouncedAt(right)
  if (leftAt != null && rightAt != null && leftAt !== rightAt) return leftAt - rightAt
  if (leftAt != null && rightAt == null) return 1
  if (leftAt == null && rightAt != null) return -1
  if (left.display_order !== right.display_order) return left.display_order - right.display_order
  return left.id - right.id
}

function parseAnnouncedAt(category: CategoryRow): number | null {
  if (!category.announced_at) return null
  const parsed = Date.parse(category.announced_at)
  return Number.isNaN(parsed) ? null : parsed
}

/**
 * The whole feed, rebuilt from the canonical record at hydration.
 *
 * Seeded entries are stamped strictly before `hydratedAtMs` and in announced
 * order, so a winner that arrives live afterwards always sorts above them and
 * the reloaded feed reads in the same direction as the one that was watched.
 */
export function seedWinnerFeedEntries(
  context: WinnerFeedContext,
  hydratedAtMs: number,
): WinnerFeedEntry[] {
  const resolved = context.categories
    .filter((category) => category.winner_id != null)
    .sort(compareAnnouncedOrder)

  return resolved.flatMap((category, index) => {
    const entry = buildWinnerFeedEntry(context, {
      categoryId: category.id,
      winnerId: category.winner_id!,
      tieWinnerId: category.tie_winner_id,
      time: new Date(hydratedAtMs - (resolved.length - index)),
    })
    return entry ? [entry] : []
  })
}

/**
 * Publishes a seeded snapshot over whatever the live callbacks already built.
 *
 * The canonical rows decide which categories are in the feed — an undone
 * declaration disappears — while a category the live path already announced
 * keeps the real time it was witnessed at, so hydrating mid-show does not
 * reshuffle the feed around the lead changes beside it. One entry per category,
 * so a Realtime event that overlapped the fetch cannot leave a duplicate.
 */
export function mergeSeededWinnerEntries(
  existing: readonly WinnerFeedEntry[],
  seeded: readonly WinnerFeedEntry[],
): WinnerFeedEntry[] {
  const witnessedAt = new Map(existing.map((entry) => [entry.categoryId, entry.time]))
  return seeded.map((entry) => {
    const live = witnessedAt.get(entry.categoryId)
    return live ? { ...entry, time: live } : entry
  })
}
