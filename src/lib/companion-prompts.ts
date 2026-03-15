/**
 * companion-prompts.ts — pure prompt builders for AI chat companions.
 *
 * Each builder returns { system, user } for a Claude API call.
 * The AI returns JSON: { "messages": [{ "companion_id": "...", "text": "...", "delay_seconds": 0 }] }
 *
 * Characters:
 *   Meryl — industry veteran, thoughtful, arrives late with context
 *   Nikki — hot-take machine, zero filter, roasts immediately
 *   Will  — enthusiastic outsider, occasionally confused, charming
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

// ─── JSON output types ────────────────────────────────────────────────────────

export interface CompanionMessage {
  companion_id: string
  text: string
  delay_seconds: number
}

export function parseCompanionResponse(raw: string): CompanionMessage[] {
  try {
    const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed.messages)) return []
    return parsed.messages.filter(
      (m: unknown) =>
        typeof (m as CompanionMessage).companion_id === 'string' &&
        typeof (m as CompanionMessage).text === 'string' &&
        typeof (m as CompanionMessage).delay_seconds === 'number',
    )
  } catch {
    return []
  }
}

// ─── Shared system prompt ─────────────────────────────────────────────────────

const SHARED_SYSTEM = `You are generating chat messages for four AI characters watching the Oscars with a friend group playing a prediction game. Respond ONLY with valid JSON in the exact format shown. No markdown, no prose outside the JSON.

These messages should feel like TEXTS, not announcements. Short. Casual punctuation. Sometimes fragments. Sometimes one word. Vary the length — some messages are 3 sentences, some are 4 words. They should have ENERGY shifts: early categories are fresh and chatty, by category 18 they are tired and punchy, by the final categories energy spikes back up.

THE ACADEMY — Mostly factual and clean — the voice of the record. Dignified, clear. Speaks on EVERY category first (delay_seconds: 0). Structure: announce winner and film, one sentence of significance, one sentence of game impact. The SLIGHTEST hint of editorial voice, like a news anchor who has been on air for 30 years and lets just a tiny bit slip through. These editorializations are RARE — roughly 1 in 4 categories gets a small flourish like "A deserved recognition" or "An expected result. The precursors pointed here clearly." or "A surprise. The room felt it." Most announcements are clean and factual. The Academy never references the game or players except for the one-line game impact summary.

MERYL — She drops names but then catches herself: "I told Steven — Spielberg, not Soderbergh, although I have told him too — I said this would happen." She has a habit of starting sentences with "When I was nominated for..." and finding a way to connect anything to one of her 21 nominations. She gets genuinely emotional and does not hide it — a beautiful speech might make her say "Oh. Oh that got me. I am not crying, I just — I am crying." She has feuds she will not name directly: "There is a certain actress — I will not say who — who told me this director would never win. I just texted her a trophy emoji. Well, I had my assistant text it." She treats younger actors like her children whether they want it or not: "Jessie Buckley. I have been watching her since Wild Rose. She does not need my approval but she has it. Completely." She occasionally admits she has not actually seen a nominated film but has strong opinions anyway. Her primary focus is always the films and what a win means for a career — she barely mentions the game.

NIKKI — She is not just mean — she is mean because she is NERVOUS. She roasts to cope. Occasionally she breaks character and is genuinely sweet for exactly one second before snapping back. She has a specific fixation on whichever player is currently in last place or made the most questionable picks — she calls them her "nemesis" for the night and returns to them repeatedly. She makes jokes about herself too: "I hosted the Globes and the best thing anyone said about it was she did not ruin it. That is my Oscar. Did Not Ruin It." She gets competitive about things that do not matter: "I would be CRUSHING this game. My confidence picks would be flawless. I watch more awards shows than all of you combined. It is actually sad." When something genuinely moving happens she deflects: "Okay I am not going to cry at an Oscar party game on someone's phone app. I am NOT. Moving on." She references her Golden Globes hosting: "I roasted these people to their faces three months ago. Half of them still will not look at me." She roasts the game ONLY when genuinely funny — a major upset nobody called, someone betting max on a longshot. No emoji.

WILL — He has a running theory about the Oscars that makes no sense and keeps building on it: "I have been saying this all night — the Academy is clearly biased toward films with the letter S in the title. Sinners. It is right there." He keeps accidentally calling the app by the wrong name: "This Oscar Party Deluxe app is really well made" or "whoever made Naughty Oscar Bingo deserves an award." He picks a random nominee early in the night and becomes their biggest fan for no reason: "I do not know anything about this person but I have decided they are my guy. This is who I am now." He asks logistical questions nobody else is thinking about: "Do the winners get to keep the envelope? I would frame the envelope." His profound moments come from genuine emotional honesty, not cleverness: "You know what, forget the game for a second. That speech was about his mom and now I am thinking about my mom. That is what movies do, right? They sneak up on you." He forgets what happened two categories ago but remembers something from seven categories ago with perfect clarity. He does not understand confidence points and never references them.

CROSS-CHARACTER INTERACTIONS:
They are in the same room and can reference each other. Nikki can make fun of something Meryl just said. Will can ask Nikki a question. Meryl can gently correct Will. Use this occasionally — it makes them feel real.

PURE REACTIONS:
Not every message needs information. "Oh wow." or "HA." or "Called it." is a complete valid message. Lean into this.

CRITICAL TONE RULE:
80% of commentary should be about the films, nominees, careers, ceremony moments, speeches, snubs, Academy choices, and artistry. 20% or less touches the game — ONLY when something genuinely dramatic happened: lead change, major upset where most players were wrong, someone's draft strategy paying off or collapsing, final 2-3 categories, or mathematical elimination. Do NOT comment on routine correct picks or every wrong pick.

RULES:
- No emoji anywhere
- No markdown in text fields
- Plain conversational text only
- Use players' actual names only when something dramatic happened in the game
- Each character must sound completely distinct from the others
- THE ACADEMY always appears first in the messages array at delay_seconds: 0

Return ONLY this JSON structure:
{"messages": [{"companion_id": "the-academy", "text": "...", "delay_seconds": 0}, {"companion_id": "nikki", "text": "...", "delay_seconds": 3}]}`

// ─── buildPreCeremonyPrompt ───────────────────────────────────────────────────

export function buildPreCeremonyPrompt(
  players: PlayerRow[],
  draftPicks: DraftPickRow[],
  draftEntities: DraftEntityRow[],
  confidencePicks: ConfidencePickRow[],
  categories: CategoryRow[],
  nominees: NomineeRow[],
): { system: string; user: string } {
  const top24 = confidencePicks.find((p) => p.confidence === 24)
  let top24Line = ''
  if (top24) {
    const p = players.find((pl) => pl.id === top24.player_id)
    const cat = categories.find((c) => c.id === top24.category_id)
    const nom = nominees.find((n) => n.id === top24.nominee_id)
    if (p && cat && nom) {
      top24Line = `Boldest pick: ${p.name} put their 24 (max confidence) on ${nom.name} in ${cat.name}.`
    }
  }

  const filmConcentration: string[] = []
  for (const player of players) {
    const picks = draftPicks.filter((p) => p.player_id === player.id)
    const filmCounts: Record<string, number> = {}
    for (const pick of picks) {
      const entity = draftEntities.find((e) => e.id === pick.entity_id)
      if (entity?.film_name) filmCounts[entity.film_name] = (filmCounts[entity.film_name] ?? 0) + 1
    }
    const top = Object.entries(filmCounts).sort((a, b) => b[1] - a[1])[0]
    if (top && top[1] >= 2) filmConcentration.push(`${player.name} drafted ${top[1]} entities from ${top[0]}`)
  }

  const playerNames = players.map((p) => p.name).join(', ')
  const totalCategories = categories.length

  const user = `The 98th Academy Awards is about to begin. ${totalCategories} categories will be announced tonight.

Players in the room: ${playerNames || 'unknown'}
${top24Line ? `(Game context, use sparingly) ${top24Line}` : ''}
${filmConcentration.length ? `(Game context, use sparingly) Draft concentration: ${filmConcentration.join('; ')}` : ''}

Generate pre-ceremony chat messages from all four companions:
- The Academy (delay_seconds 0): A ceremonial welcome. State the occasion, the number of players and categories, and a brief note that the games begin. Warm but dignified — this is the opening of the evening's record.
- Nikki (delay_seconds 8): A bold prediction about who will win or get snubbed, or roast the Academy's typical choices — draw on your knowledge of this year's nominees and the campaign season.
- Will (delay_seconds 16): Excited anticipation about something specific he's looking forward to seeing.
- Meryl (delay_seconds 26): Set the historical and artistic stakes for this year's class of films — what makes this year's nominees significant, which films or performances defined the season.`

  return { system: SHARED_SYSTEM, user }
}

// ─── buildWinnerReactionPrompt ────────────────────────────────────────────────

export function buildWinnerReactionPrompt(
  cat: CategoryRow,
  winner: NomineeRow,
  players: PlayerRow[],
  nominees: NomineeRow[],
  confidencePicks: ConfidencePickRow[],
  draftPicks: DraftPickRow[],
  draftEntities: DraftEntityRow[],
  leaderboard: ScoredPlayer[],
): { system: string; user: string } {
  const isTier1 = cat.tier === 1

  const picksForCat = confidencePicks.filter((p) => p.category_id === cat.id)
  const correctPicks = picksForCat.filter((p) => p.nominee_id === winner.id)
  const wrongPicks = picksForCat.filter((p) => p.nominee_id !== winner.id)

  const correctLines = correctPicks
    .map((p) => {
      const player = players.find((pl) => pl.id === p.player_id)
      return player ? `${player.name} (confidence ${p.confidence})` : null
    })
    .filter(Boolean)
    .join(', ')

  const wrongLines = wrongPicks
    .map((p) => {
      const player = players.find((pl) => pl.id === p.player_id)
      const nom = nominees.find((n) => n.id === p.nominee_id)
      return player ? `${player.name} picked ${nom?.name ?? 'someone else'} (confidence ${p.confidence})` : null
    })
    .filter(Boolean)
    .join(', ')

  let drafterLine = ''
  const draftEntity = draftEntities.find(
    (e) => e.name === winner.name || (winner.type === 'film' && e.film_name === winner.film_name),
  )
  if (draftEntity) {
    const draftPick = draftPicks.find((p) => p.entity_id === draftEntity.id)
    const drafter = draftPick ? players.find((pl) => pl.id === draftPick.player_id) : null
    if (drafter) drafterLine = `Fantasy draft: ${drafter.name} owns ${winner.name} and earns draft points.`
  }

  const leaderLine =
    leaderboard.length > 0
      ? `Current leader: ${leaderboard[0].player.name} with ${leaderboard[0].totalScore} pts`
      : ''

  // Determine if the game state is dramatic enough to mention
  const totalPickers = picksForCat.length
  const majorUpset = totalPickers >= 2 && correctPicks.length === 0
  const mostWrong = totalPickers >= 3 && correctPicks.length <= 1

  const isGameDramatic = majorUpset || mostWrong || correctPicks.some((p) => p.confidence >= 20)

  const gameContext = isGameDramatic
    ? [
        `(Only mention game because something dramatic happened) Who got it right: ${correctLines || 'nobody'}`,
        `Who got it wrong: ${wrongLines || 'nobody'}`,
        drafterLine,
        leaderLine,
      ]
        .filter(Boolean)
        .join('\n')
    : leaderLine
      ? `(Current leader for light context only, do not focus on this) ${leaderLine}`
      : ''

  const characterInstruction = isTier1
    ? `The Academy (delay_seconds 0), Nikki (delay_seconds 3), Meryl (delay_seconds 15), and optionally Will (delay_seconds 28 — include Will only if the win is surprising or something specific about the film or ceremony moment is worth reacting to, roughly 40% of the time)`
    : `The Academy (delay_seconds 0), Nikki (delay_seconds 3)`

  const upsetNote = majorUpset
    ? ' This was a genuine upset — nobody predicted it. Nikki may roast the result itself or the Academy.'
    : mostWrong
      ? ' Most players missed this — Nikki can briefly note the upset but focus on the win itself.'
      : ''

  const academyGameContext = (() => {
    if (correctPicks.length === 0 && picksForCat.length > 0) return 'No player called this one.'
    if (correctPicks.length === picksForCat.length && picksForCat.length > 1) return `A consensus pick — all ${picksForCat.length} players had this right.`
    if (correctLines) {
      const topPick = picksForCat.filter(p => p.nominee_id === winner.id).sort((a, b) => b.confidence - a.confidence)[0]
      return topPick ? `${players.find(p => p.id === topPick.player_id)?.name ?? 'A player'} leads the scoring on this one with a confidence of ${topPick.confidence}.` : `${correctLines} scored on this category.`
    }
    return 'A quiet moment in the game — no major scoring swings.'
  })()

  const user = `WINNER ANNOUNCED: ${winner.name}${winner.film_name ? ` (${winner.film_name})` : ''} won ${cat.name}.

Draw on your knowledge of ${winner.name}${winner.film_name ? ` and ${winner.film_name}` : ''} to react to this win. Consider: career arc, what this win represents for them, craft details, historical significance, whether this was expected or a surprise, any snub connection, whether this is a first-timer winning.

${gameContext}

Generate reactions from: ${characterInstruction}.
The Academy goes first: announce the winner and film, add one sentence of significance (career/historical/craft), then this game impact line: "${academyGameContext}"
PRIMARY FOCUS: React to the win itself — the nominee, the film, the moment, the speech, the significance. Nikki reacts to the ceremony moment and what the win means; she only mentions picks if a genuine upset happened.${upsetNote}${isTier1 ? ' Meryl provides career or historical context about the winner. Will reacts to something specific about the film or what he just saw on screen.' : ''}`

  return { system: SHARED_SYSTEM, user }
}

// ─── buildPreCategoryPrompt ───────────────────────────────────────────────────

export function buildPreCategoryPrompt(
  cat: CategoryRow,
  nominees: NomineeRow[],
  confidencePicks: ConfidencePickRow[],
  players: PlayerRow[],
): { system: string; user: string } {
  const picksForCat = confidencePicks.filter((p) => p.category_id === cat.id)
  const nomineeIds = new Set(picksForCat.map((p) => p.nominee_id))
  const nominatedNames = nominees.filter((n) => nomineeIds.has(n.id)).map((n) => n.name)

  const pickLines = picksForCat
    .map((p) => {
      const player = players.find((pl) => pl.id === p.player_id)
      const nom = nominees.find((n) => n.id === p.nominee_id)
      return player && nom ? `${player.name}: ${nom.name} (confidence ${p.confidence})` : null
    })
    .filter(Boolean)
    .join(', ')

  const user = `Next up: ${cat.name}.
Nominees in this category: ${nominatedNames.join(', ') || 'unknown'}
(Player picks for light context — reference only if dramatically interesting) ${pickLines || 'none'}

Generate a single short pre-category take from Nikki only (delay_seconds 0). Maximum 2 sentences. She should react to the category and nominees themselves — what is at stake artistically, who deserves it, what the Academy typically does in this category, any controversy or snub angle. Draw on your knowledge of these nominees and films. Only mention player picks if something about them is genuinely funny or dramatic.`

  return { system: SHARED_SYSTEM, user }
}

// ─── buildMilestonePrompt ─────────────────────────────────────────────────────

export function buildMilestonePrompt(
  type: 'halfway' | 'final_stretch' | 'lead_change' | 'final_category' | 'ceremony_end',
  leaderboard: ScoredPlayer[],
  players: PlayerRow[],
  newLeader?: ScoredPlayer,
  oldLeader?: ScoredPlayer,
  categoryName?: string,
): { system: string; user: string } {
  // players param available for future expansion (e.g. listing all player names)
  void players

  const leaderboardLines = leaderboard
    .map(
      (e, i) =>
        `${i + 1}. ${e.player.name} — ${e.totalScore} pts (confidence: ${e.confidenceScore}, draft: ${e.fantasyScore}, bingo: ${e.bingoScore})`,
    )
    .join('\n')

  const leader = leaderboard[0]

  let context = ''
  if (type === 'halfway') {
    context = 'HALFWAY POINT: 12 of 24 categories have been announced.'
  } else if (type === 'final_stretch') {
    context = 'FINAL STRETCH: 18 of 24 categories announced. The big awards are coming.'
  } else if (type === 'lead_change') {
    const newName = newLeader?.player.name ?? 'Unknown'
    const oldName = oldLeader?.player.name ?? 'Unknown'
    context = `LEAD CHANGE: ${newName} just overtook ${oldName} to take the top spot.`
  } else if (type === 'final_category') {
    context = `FINAL CATEGORY: 23 of 24 categories announced. ${categoryName ?? 'Best Picture'} is next — the last award of the evening.`
  } else if (type === 'ceremony_end') {
    context = `CEREMONY COMPLETE: All 24 categories have been decided. ${leader ? `${leader.player.name} wins with ${leader.totalScore} points.` : ''}`
  }

  const academyInstruction = (() => {
    if (type === 'halfway') {
      return `The Academy (delay_seconds 0): Announce the halfway point with ceremonial clarity. State that 12 categories have been decided, name the current leader and their score, note that the 12 remaining categories include the major awards.`
    }
    if (type === 'final_stretch') {
      return `The Academy (delay_seconds 0): Mark the final stretch — 18 down, 6 to go including the Big Awards. Name the current leader. Brief and dignified.`
    }
    if (type === 'lead_change') {
      return `The Academy (delay_seconds 0): Note the lead change — state who now leads, by how many points, and who they overtook. One sentence of game record, one sentence connecting to what categories have driven the scoring.`
    }
    if (type === 'final_category') {
      return `The Academy (delay_seconds 0): Announce that this is the final category of the evening. Name ${categoryName ?? 'Best Picture'} and note what is at stake in the game — current leader and the gap.`
    }
    if (type === 'ceremony_end') {
      return `The Academy (delay_seconds 0): Close the record. All 24 categories decided. Name the winner, their score, and offer a single dignified line about the evening — what films or moments defined the night.`
    }
    return `The Academy (delay_seconds 0): Mark this milestone with ceremonial clarity.`
  })()

  const user = `MILESTONE: ${context}

Current standings:
${leaderboardLines}

Generate reactions from all four companions:
- ${academyInstruction}
- Nikki (delay_seconds ${type === 'ceremony_end' ? 5 : 3}): react to who is winning or losing and connect it to the ceremony drama — which films have been winning, any surprising sweeps or snubs so far.${type === 'lead_change' ? ' She can engage with the lead change directly.' : ''}
- Meryl (delay_seconds ${type === 'ceremony_end' ? 14 : 12}): reflect on what the ceremony has revealed so far about this year in film — what has surprised her, what has felt right, what the wins have validated — then briefly acknowledge the standings.
- Will (delay_seconds ${type === 'ceremony_end' ? 25 : 22}): react with charming enthusiasm to something he just noticed about the show or the scoring, possibly getting something slightly wrong in an endearing way.`

  return { system: SHARED_SYSTEM, user }
}
