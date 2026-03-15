/**
 * scoring.ts — pure scoring functions, zero side effects.
 *
 * WHY SEPARATE FROM THE HOOK?
 * Pure functions with no side effects can be unit tested without mocking
 * Supabase or React. The hook (useScores) orchestrates data fetching and
 * subscriptions; this file computes results. If a scoring rule changes,
 * you fix it here and the test suite catches any regressions instantly.
 *
 * SCORING CASCADE (what happens when host announces a winner):
 *
 *   1. Host taps "Adrien Brody" as Best Actor winner
 *   2. useAdmin.setWinner() writes two things to Supabase:
 *        a. UPDATE categories SET winner_id = 'brody-uuid' WHERE id = 5
 *        b. UPDATE confidence_picks
 *              SET is_correct = (nominee_id = 'brody-uuid')
 *           WHERE category_id = 5 AND room_id = 'room-uuid'
 *   3. Supabase broadcasts two streams of Realtime events:
 *        - categories UPDATE → every client's useScores subscription fires
 *        - confidence_picks UPDATE (one per player) → same subscription fires
 *   4. Each client updates their local state arrays → React re-renders
 *   5. computeLeaderboard() is called with fresh state:
 *        - confidenceScore: sums picks where is_correct = true
 *        - ensembleScore: re-evaluates which draft entity matches the winner
 *   6. Leaderboard re-sorts by totalScore and all players see the new ranking
 *
 * ENSEMBLE SCORING ENTITY MATCH:
 *   The draft entity for a person (e.g. "Adrien Brody") is identified by:
 *     entity.type === 'person' AND entity.name === nominee.name
 *     AND entity.nominations.some(n => n.category_id === categoryId)
 *   The category_id check prevents false matches for someone like "Taylor Swift"
 *   who might theoretically appear in both acting and music categories.
 *
 *   Film entities (e.g. "The Brutalist") match by film_name.
 */

import type {
  CategoryRow,
  NomineeRow,
  DraftEntityRow,
  DraftPickRow,
  PlayerRow,
  ConfidencePickRow,
} from '../types/database'

// ─── Public result types ──────────────────────────────────────────────────────

export interface ScoredPlayer {
  player: PlayerRow
  ensembleScore: number
  confidenceScore: number
  bingoScore: number
  totalScore: number
}

// ─── scoreConfidencePick ──────────────────────────────────────────────────────

/**
 * Scores a single confidence pick against the announced winner.
 *
 * If the player chose the correct nominee, they earn their confidence number
 * as points (higher confidence = higher risk = higher reward).
 * A wrong pick scores zero — no penalty.
 */
export function scoreConfidencePick(
  pick: ConfidencePickRow,
  winnerId: string,
): number {
  return pick.nominee_id === winnerId ? pick.confidence : 0
}

// ─── findDraftPointsForWinner ─────────────────────────────────────────────────

/**
 * Returns the playerId who should receive draft points for this category
 * winner, and the point value. Returns { playerId: null, points: 0 } if
 * nobody drafted the winning entity.
 *
 * PERSON vs FILM determination:
 *   Uses the winning nominee's `type` field from the nominees table.
 *   'person' → find draft entity by name + category nomination.
 *   'film'   → find draft entity by film_name.
 *
 * This is more reliable than keyword-matching on category names, since
 * the DB is the source of truth for whether a nominee is a person or film.
 */
export function findDraftPointsForWinner(
  categoryId: number,
  winnerId: string,
  categories: CategoryRow[],
  nominees: NomineeRow[],
  draftEntities: DraftEntityRow[],
  draftPicks: DraftPickRow[],
): { playerId: string | null; points: number } {
  const category = categories.find((c) => c.id === categoryId)
  if (!category) return { playerId: null, points: 0 }

  const winningNominee = nominees.find((n) => n.id === winnerId)
  if (!winningNominee) return { playerId: null, points: 0 }

  let matchingEntity: DraftEntityRow | undefined

  if (winningNominee.type === 'person') {
    // Person entities: match by name, then verify nominated in this category.
    // The nominations JSONB contains { category_id, category_name, points }.
    matchingEntity = draftEntities.find((entity) => {
      if (entity.type !== 'person') return false
      if (entity.name !== winningNominee.name) return false

      // Verify this entity is actually nominated in the winning category.
      // Guards against false name collisions.
      const noms = entity.nominations as Array<{ category_id?: number }>
      if (!Array.isArray(noms) || noms.length === 0) return true // no nomination data — trust the name match
      return noms.some((n) => n.category_id === categoryId)
    })
  } else {
    // Film entities: match by film_name, type === 'film'.
    // For Best Picture nominees, film_name may be empty (the film IS the nominee),
    // so fall back to matching against the nominee's name field.
    const nomFilmTitle = winningNominee.film_name || winningNominee.name
    matchingEntity = draftEntities.find(
      (entity) =>
        entity.type === 'film' &&
        entity.film_name === nomFilmTitle,
    )
  }

  if (!matchingEntity) return { playerId: null, points: 0 }

  const pick = draftPicks.find((p) => p.entity_id === matchingEntity!.id)
  if (!pick) return { playerId: null, points: 0 }

  return { playerId: pick.player_id, points: category.points }
}

// ─── computeLeaderboard ───────────────────────────────────────────────────────

/**
 * Computes the full leaderboard from raw DB state.
 *
 * Called on every relevant state change — categories with a new winner_id,
 * confidence_picks with updated is_correct values, etc.
 *
 * Performance: O(players × categories) which for a party game (4 players,
 * 24 categories) is ~96 iterations per recompute. This is negligible.
 * No memoization needed.
 *
 * @param bingoScores  playerId → bingo points. Pass new Map() to stub.
 */
export function computeLeaderboard(
  players: PlayerRow[],
  confidencePicks: ConfidencePickRow[],
  draftPicks: DraftPickRow[],
  draftEntities: DraftEntityRow[],
  categories: CategoryRow[],
  nominees: NomineeRow[],
  bingoScores: Map<string, number>,
): ScoredPlayer[] {
  const announcedCategories = categories.filter((c) => c.winner_id != null)

  return players
    .map((player) => {
      // ── Confidence score ──────────────────────────────────────────────────
      // Sum of confidence values for every pick where is_correct === true.
      const confidenceScore = confidencePicks
        .filter((p) => p.player_id === player.id && p.is_correct === true)
        .reduce((sum, p) => sum + p.confidence, 0)

      // ── Ensemble score ────────────────────────────────────────────────────
      // For each announced category, check if this player's drafted entity won.
      // Each matching entity earns category.points.
      const ensembleScore = announcedCategories.reduce((sum, cat) => {
        const { playerId, points } = findDraftPointsForWinner(
          cat.id,
          cat.winner_id!,
          categories,
          nominees,
          draftEntities,
          draftPicks,
        )
        return playerId === player.id ? sum + points : sum
      }, 0)

      // ── Bingo score ───────────────────────────────────────────────────────
      // Stubbed — will be populated when bingo scoring is implemented.
      const bingoScore = bingoScores.get(player.id) ?? 0

      const totalScore = confidenceScore + ensembleScore + bingoScore

      return { player, ensembleScore, confidenceScore, bingoScore, totalScore }
    })
    .sort((a, b) => b.totalScore - a.totalScore)
}
