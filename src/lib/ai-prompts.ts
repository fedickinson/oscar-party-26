/**
 * ai-prompts.ts — pure prompt builder and shared types for the AI analysis feature.
 *
 * buildAnalysisPrompt constructs a system + user message pair for Claude.
 * The system prompt establishes the journalist persona. The user message
 * provides the ceremony results and hot takes in a structured format and
 * requests a single, strictly-typed JSON object back.
 *
 * AnalysisResult is the canonical type for the parsed Claude response.
 * It is stored verbatim in rooms.ai_analysis (jsonb) and read back in
 * MorningAfter.tsx by casting room.ai_analysis as AnalysisResult.
 */

import type { HotTakeRow, CategoryRow, NomineeRow, PlayerRow } from '../types/database'

// ─── Response shape ───────────────────────────────────────────────────────────

export interface PlayerAnalysis {
  player_name: string
  alignment_score: number // 0–100: how aligned with critical consensus
  key_agreements: string[]
  key_disagreements: string[]
  standout_insight: string
}

export interface AnalysisResult {
  media_narrative: string
  player_analyses: PlayerAnalysis[]
  awards: {
    most_prescient: { player_name: string; reason: string }
    most_contrarian: { player_name: string; reason: string }
    called_it: { player_name: string; prediction: string; evidence: string }
    best_written: { player_name: string; reason: string }
  }
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

export function buildAnalysisPrompt(
  hotTakes: HotTakeRow[],
  players: PlayerRow[],
  categories: CategoryRow[],
  nominees: NomineeRow[],
): { system: string; user: string } {
  const winnerLines = categories
    .filter((c) => c.winner_id != null)
    .map((c) => {
      const winner = nominees.find((n) => n.id === c.winner_id)
      const winnerDesc = winner
        ? `${winner.name}${winner.film_name ? ` (${winner.film_name})` : ''}`
        : 'Unknown'
      return `  ${c.name}: ${winnerDesc}`
    })
    .join('\n')

  const playerTakeLines = hotTakes
    .map((take) => {
      const p = players.find((pl) => pl.id === take.player_id)
      return `${p?.name ?? 'Unknown Player'}:\n"${take.text}"`
    })
    .join('\n\n')

  const system = `\
You are an entertainment journalist who has read every major outlet's next-day coverage of the 98th Academy Awards — The New York Times, Variety, The Hollywood Reporter, IndieWire, and Entertainment Weekly among them. You know exactly what the critical consensus was: which wins were celebrated, which were seen as snubs, what moments defined the broadcast, and what the narrative arc of the night was.

Your task: compare each party guest's hot take to that media consensus. Score them honestly. Reward genuine insight and prescience. Flag contrarianism with evidence. Find the most interesting quote in each take.

CRITICAL INSTRUCTION: Return ONLY valid JSON. No markdown. No code fences. No backticks. No explanation text before or after. The entire response must be parseable by JSON.parse().`

  const user = `\
98th Academy Awards — official results:
${winnerLines}

Party guest hot takes (written immediately after the ceremony):
${playerTakeLines}

Analyze each take against the actual next-day media consensus you know. Return ONLY this JSON (no other text):
{
  "media_narrative": "2–3 sentence description of the critical consensus — what critics said the night's defining story was, which wins were celebrated, which felt like snubs, tone of coverage overall",
  "player_analyses": [
    {
      "player_name": "exact name as written above",
      "alignment_score": 0,
      "key_agreements": ["one or two points where their take matched critical consensus"],
      "key_disagreements": ["one point where they diverged from critics, or empty array if fully aligned"],
      "standout_insight": "the most interesting, specific, or well-articulated thing they wrote — quote or close paraphrase"
    }
  ],
  "awards": {
    "most_prescient": { "player_name": "name", "reason": "what they saw coming that critics confirmed" },
    "most_contrarian": { "player_name": "name", "reason": "what they believed that flew in the face of consensus" },
    "called_it": { "player_name": "name", "prediction": "the specific call they made", "evidence": "what happened that proved them right" },
    "best_written": { "player_name": "name", "reason": "what made their prose or framing stand out" }
  }
}`

  return { system, user }
}
