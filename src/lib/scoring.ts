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
 *   2. declare_scheduled_winner() inserts one room_winners fact while holding
 *      the room lock. Its database trigger derives confidence_picks.is_correct
 *      in that same transaction.
 *   3. Supabase broadcasts two streams of Realtime events:
 *        - room_winners INSERT → every client's useScores subscription fires
 *        - confidence_picks UPDATE (one per player) → same subscription fires
 *   4. Each client updates their local state arrays → React re-renders
 *   5. computeLeaderboard() is called with fresh state:
 *        - confidenceScore: sums picks where is_correct = true
 *        - ensembleScore: re-evaluates which draft entity matches the winner
 *   6. Leaderboard re-sorts by totalScore and all players see the new ranking
 *
 * ENSEMBLE SCORING ENTITY MATCH:
 *   Versioned catalogs match the winning nominee to a draft entity by the
 *   immutable (show_pack_id, pack_key, type) identity compiled from one show
 *   pack. Display names are presentation and may collide. The fixed legacy
 *   catalog retains its historical name/film-title compatibility lane.
 */

import type {
  CategoryRow,
  NomineeRow,
  DraftEntityRow,
  DraftPickRow,
  PlayerRow,
  ConfidencePickRow,
  ConvictionPickRow,
  GameModel,
} from '../types/database'
import { assessDraftEntityForNominee } from './draft-identity'
import { computeConvictionPortfolioScores } from './conviction'

// ─── Public result types ──────────────────────────────────────────────────────

export interface ScoredPlayer {
  player: PlayerRow
  ensembleScore: number
  confidenceScore: number
  bingoScore: number
  totalScore: number
  rank: number
  /** Number of confidence picks that came in correct. Tiebreak input. */
  correctPickCount: number
  /** Highest confidence value spent on a pick that came in correct. Tiebreak input. */
  topCorrectPick: number
}

// ─── compareForRank ───────────────────────────────────────────────────────────

/**
 * Total ordering over scored players — the rule that decides who wins.
 *
 * WHY A CASCADE AND NOT JUST totalScore:
 * Every event pays 4, 6, 8 or 10, draft points are those same values (or 1.5x
 * of them), and there are only 20 events and 3-4 players. Exact ties at the top
 * are not an edge case here, they are a normal Tuesday. Crowning co-champions
 * on the first collision would happen often enough to feel like the game
 * failed to finish rather than like a genuine dead heat.
 *
 * The cascade breaks ties toward prediction skill, in descending order of how
 * much deliberate judgement each step reflects:
 *
 *   1. totalScore       — the game as played
 *   2. confidenceScore  — who read the episode better. Draft points depend
 *                         partly on draft position and on who was still on the
 *                         board; confidence is a pure, simultaneous, everyone-
 *                         gets-the-same-budget prediction.
 *   3. correctPickCount — breadth: called more events right, even if the
 *                         weighting paid out less
 *   4. topCorrectPick   — nerve: put the biggest number on the line and hit it
 *
 * Bingo is deliberately absent. It is dealt, not decided, so it should never be
 * the thing that separates two players who are otherwise level.
 *
 * Returns 0 only on a true dead heat, which is then a real co-championship.
 */
export function compareForRank(a: ScoredPlayer, b: ScoredPlayer): number {
  if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore
  if (b.confidenceScore !== a.confidenceScore) return b.confidenceScore - a.confidenceScore
  if (b.correctPickCount !== a.correctPickCount) return b.correctPickCount - a.correctPickCount
  return b.topCorrectPick - a.topCorrectPick
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
 * winner, the point value, and the draft entity credited. Returns all-null/zero
 * if nobody drafted the winning entity.
 *
 * `entityId` exists so callers that need to say WHICH roster slot earned the
 * points (the end-of-night awards) reuse this matcher instead of re-deriving
 * it. A second implementation of "which entity does this winner map to" would
 * drift from this one the first time either changed.
 *
 * PERSON vs FILM determination uses the winning nominee's `type`, but identity
 * comes from the versioned pack key. Name and film-title matching are confined
 * to the fixed legacy/unscoped compatibility branch in draft-identity.ts.
 *
 * FILM FALLBACK FOR UNDRAFTED PEOPLE:
 *   If the winning person has no individual draft entity (or nobody picked
 *   them), points fall through to whoever drafted their film. This handles
 *   technical categories (Makeup & Hairstyling, Costume Design, Sound, etc.)
 *   where the crew members are not individually draftable — the film owner
 *   benefits instead. Individually drafted people (actors, directors) take
 *   priority: if someone drafted the person, the film drafter gets nothing.
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
): { playerId: string | null; points: number; entityId: string | null } {
  const category = categories.find((c) => c.id === categoryId)
  if (!category) return { playerId: null, points: 0, entityId: null }

  const winningNominee = nominees.find((n) => n.id === winnerId)
  if (!winningNominee) return { playerId: null, points: 0, entityId: null }

  const pickForEntity = (entity: DraftEntityRow | undefined) =>
    entity ? (draftPicks.find((p) => p.entity_id === entity.id) ?? null) : null
  const entityResolution = assessDraftEntityForNominee(winningNominee, draftEntities)
  if (entityResolution.state === 'ambiguous') {
    return { playerId: null, points: 0, entityId: null }
  }
  const resolvedEntity = entityResolution.state === 'matched' ? entityResolution.row : undefined

  if (winningNominee.type === 'person') {
    const personEntity = resolvedEntity?.type === 'person' ? resolvedEntity : undefined

    const personPick = pickForEntity(personEntity)
    if (personPick) {
      // Someone drafted this person individually — they get 1.5x points.
      // The multiplier rewards the more specific, risky prediction over
      // drafting a film that passively collects technical category wins.
      // The film drafter gets nothing for this category.
      return {
        playerId: personPick.player_id,
        points: Math.round(category.points * 1.5),
        entityId: personEntity!.id,
      }
    }

    // Nobody drafted this person (or they weren't a draftable entity).
    // Fall back to awarding points to whoever drafted their film.
    // This is how technical category wins (e.g. Best Makeup & Hairstyling)
    // reward the player who drafted the winning film.
    //
    // INERT FOR THE HotD FINALE — deliberately kept, not overlooked:
    //   A character's `film_name` carries their HOUSE ("The Blacks", "Harrenhal"),
    //   while the only `film`-type draft entities are DRAGONS, whose film_name is
    //   the dragon's own name ("Vhagar"). The two namespaces never intersect, so
    //   this branch always falls through to { playerId: null, points: 0 } and an
    //   undrafted character's win simply pays nobody.
    //
    //   That is the correct outcome here, not a gap to paper over. The draft pool
    //   is 38 entities against 3-4 players taking ~9 each, so nearly everything is
    //   owned and this path rarely fires at all. Routing an undrafted character's
    //   win to their house-mates or to a dragon would hand points to a player who
    //   never made that call.
    //
    //   The branch stays because it is correct for any film-shaped property (the
    //   archived Oscars seed, or a future one) where film_name names a draftable
    //   film. If a HotD-style seed ever wants an overflow rule, give characters a
    //   real link to a draftable parent — don't reinterpret film_name.
    const filmTitle = winningNominee.film_name
    if (filmTitle) {
      const filmCandidates = draftEntities.filter((entity) => (
        entity.type === 'film'
        && entity.film_name === filmTitle
        && (winningNominee.show_pack_id
          ? entity.show_pack_id === winningNominee.show_pack_id
          : !entity.show_pack_id)
      ))
      const filmEntity = filmCandidates.length === 1 ? filmCandidates[0] : undefined
      const filmPick = pickForEntity(filmEntity)
      if (filmPick) {
        return { playerId: filmPick.player_id, points: category.points, entityId: filmEntity!.id }
      }
    }

    return { playerId: null, points: 0, entityId: null }
  } else {
    const filmEntity = resolvedEntity?.type === 'film' ? resolvedEntity : undefined

    const pick = pickForEntity(filmEntity)
    if (!pick) return { playerId: null, points: 0, entityId: null }
    return { playerId: pick.player_id, points: category.points, entityId: filmEntity!.id }
  }
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
  convictionPicks: ConvictionPickRow[] = [],
  gameModel: GameModel = 'legacy_ensemble',
): ScoredPlayer[] {
  const announcedCategories = categories.filter((c) => c.winner_id != null)
  const convictionScores = gameModel === 'conviction_portfolio'
    ? computeConvictionPortfolioScores(players, convictionPicks, categories)
    : new Map()

  const sorted = players
    .map((player) => {
      // ── Confidence score ──────────────────────────────────────────────────
      // Sum of confidence values for every pick where is_correct === true.
      const correctPicks = confidencePicks.filter(
        (p) => p.player_id === player.id && p.is_correct === true,
      )
      const conviction = convictionScores.get(player.id)
      const confidenceScore = gameModel === 'conviction_portfolio'
        ? (conviction?.score ?? 0)
        : correctPicks.reduce((sum, p) => sum + p.confidence, 0)

      // Tiebreak inputs — see compareForRank.
      const correctPickCount = gameModel === 'conviction_portfolio'
        ? (conviction?.correctPickCount ?? 0)
        : correctPicks.length
      const topCorrectPick = gameModel === 'conviction_portfolio'
        ? (conviction?.topCorrectPick ?? 0)
        : correctPicks.reduce((max, p) => Math.max(max, p.confidence), 0)

      // ── Ensemble score ────────────────────────────────────────────────────
      // For each announced category, check if this player's drafted entity won.
      // Each matching entity earns category.points.
      // In a tie, both winners' draft entities earn points independently.
      const ensembleScore = gameModel === 'conviction_portfolio' ? 0 : announcedCategories.reduce((sum, cat) => {
        const { playerId, points } = findDraftPointsForWinner(
          cat.id,
          cat.winner_id!,
          categories,
          nominees,
          draftEntities,
          draftPicks,
        )
        let catPoints = playerId === player.id ? points : 0

        // Check second winner in a tie
        if (cat.tie_winner_id) {
          const tieResult = findDraftPointsForWinner(
            cat.id,
            cat.tie_winner_id,
            categories,
            nominees,
            draftEntities,
            draftPicks,
          )
          if (tieResult.playerId === player.id) catPoints += tieResult.points
        }

        return sum + catPoints
      }, 0)

      // ── Bingo score ───────────────────────────────────────────────────────
      // Stubbed — will be populated when bingo scoring is implemented.
      const bingoScore = bingoScores.get(player.id) ?? 0

      const totalScore = confidenceScore + ensembleScore + bingoScore

      return {
        player,
        ensembleScore,
        confidenceScore,
        bingoScore,
        totalScore,
        rank: 0,
        correctPickCount,
        topCorrectPick,
      }
    })
    .sort(compareForRank)

  // Assign ranks using standard competition ranking (1224):
  // Tied players share the same rank; the next rank skips ahead.
  // e.g. two players tied at #1 both get rank 1, the next gets rank 3.
  //
  // Players share a rank only when compareForRank returns 0 — a true dead heat
  // on every tiebreak, not merely on totalScore. Comparing totalScore alone
  // here would have handed rank 1 to two players the sort had already
  // separated, so the UI would announce co-champions while the leaderboard
  // showed one of them above the other.
  let currentRank = 1
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && compareForRank(sorted[i - 1], sorted[i]) === 0) {
      sorted[i].rank = sorted[i - 1].rank
    } else {
      sorted[i].rank = currentRank
    }
    currentRank++
  }

  return sorted
}
