/**
 * story-prompts.ts — pure prompt builder for the Story of the Night feature.
 *
 * buildStoryPrompt constructs a system + user message pair for Claude that
 * generates a short, witty narrative of the party game in progress.
 *
 * Output: plain text, 2-3 sentences, under 80 words.
 * NO JSON — unlike buildAnalysisPrompt, this returns prose directly.
 */

import type {
  CategoryRow,
  NomineeRow,
  PlayerRow,
  ConfidencePickRow,
  DraftPickRow,
  DraftEntityRow,
} from '../types/database'
import type { ScoredPlayer } from './scoring'

export function buildStoryPrompt(
  categories: CategoryRow[],
  nominees: NomineeRow[],
  players: PlayerRow[],
  leaderboard: ScoredPlayer[],
  confidencePicks: ConfidencePickRow[],
  draftPicks: DraftPickRow[],
  draftEntities: DraftEntityRow[],
  announcedCount: number,
): { system: string; user: string } {
  const totalCategories = categories.length
  const announced = categories.filter((c) => c.winner_id != null)

  // ── Winners summary ──────────────────────────────────────────────────────────

  const winnerLines = announced
    .map((c) => {
      const winner = nominees.find((n) => n.id === c.winner_id)
      const desc = winner
        ? `${winner.name}${winner.film_name ? ` (${winner.film_name})` : ''}`
        : 'Unknown'
      return `  ${c.name}: ${desc}`
    })
    .join('\n')

  // ── Leaderboard summary ──────────────────────────────────────────────────────

  const leaderboardLines = leaderboard
    .map((entry, i) => {
      const { player, fantasyScore, confidenceScore, bingoScore, totalScore } = entry
      return `  ${i + 1}. ${player.name} — ${totalScore} pts (confidence: ${confidenceScore}, draft: ${fantasyScore}, bingo: ${bingoScore})`
    })
    .join('\n')

  // ── Notable moments: high-confidence picks that paid off or missed ────────────

  const notableLines: string[] = []
  for (const cat of announced) {
    const highPick = confidencePicks
      .filter((p) => p.category_id === cat.id && p.confidence >= 18)
      .sort((a, b) => b.confidence - a.confidence)[0]

    if (highPick) {
      const p = players.find((pl) => pl.id === highPick.player_id)
      const pickedNominee = nominees.find((n) => n.id === highPick.nominee_id)
      const winnerNominee = nominees.find((n) => n.id === cat.winner_id)
      const paid = highPick.is_correct === true
      if (p && pickedNominee) {
        notableLines.push(
          `  ${p.name} put ${highPick.confidence} on ${pickedNominee.name} (${cat.name}) — ${
            paid ? 'CORRECT, big payout!' : `WRONG (${winnerNominee?.name ?? '?'} won)`
          }`,
        )
      }
    }
  }

  // ── Draft concentration: who went all-in on a single film? ──────────────────

  const allInLines: string[] = []
  for (const player of players) {
    const picks = draftPicks.filter((p) => p.player_id === player.id)
    const filmCounts: Record<string, number> = {}
    for (const pick of picks) {
      const entity = draftEntities.find((e) => e.id === pick.entity_id)
      if (entity?.film_name) {
        filmCounts[entity.film_name] = (filmCounts[entity.film_name] ?? 0) + 1
      }
    }
    const topFilm = Object.entries(filmCounts).sort((a, b) => b[1] - a[1])[0]
    if (topFilm && topFilm[1] >= 3) {
      allInLines.push(
        `  ${player.name} went heavy on ${topFilm[0]} (${topFilm[1]} entities drafted)`,
      )
    }
  }

  // ── System prompt ────────────────────────────────────────────────────────────

  const system = `\
You are a witty, engaging sports-style commentator covering an Oscars party game night. Write like a mix of ESPN GameDay and Vanity Fair — dramatic but fun. You know the players by name and their game positions.

CRITICAL: Return ONLY plain prose. No markdown. No bullet points. No lists. No headers. Just 2-3 sentences of flowing narrative. Under 80 words total.`

  // ── User prompt ──────────────────────────────────────────────────────────────

  const notableSection = notableLines.length > 0
    ? `\nNotable moments:\n${notableLines.join('\n')}\n`
    : ''

  const draftSection = allInLines.length > 0
    ? `\nDraft concentration:\n${allInLines.join('\n')}\n`
    : ''

  const user = `\
98th Academy Awards — ${announcedCount} of ${totalCategories} categories announced.

Announced winners:
${winnerLines || '  (none yet)'}

Current standings:
${leaderboardLines}
${notableSection}${draftSection}
Write 2-3 sentences about the night so far. Use player names. Reference specific picks, confidence values, and films. Make it dramatic and fun. Plain text only, under 80 words.`

  return { system, user }
}
