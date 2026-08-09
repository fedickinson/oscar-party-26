/**
 * ceremony-context.ts — formats researched encyclopedia data for injection into
 * AI companion prompts.
 *
 * No React, no Supabase, no async. Unit-testable.
 *
 * WHY IT MATTERS
 * Season 3 postdates the model's training cutoff, so anything not injected here
 * is invented. These builders are the only thing standing between the companions
 * and confidently fabricated deaths, dragons and betrayals.
 *
 * WHAT IT WILL NOT DO
 * Never emits spoiler-tagged material. safeCriticism() filters it, and the
 * dossier fields chosen below are all already-aired. See westeros-encyclopedia.ts.
 */

import {
  getCharacter,
  getDragon,
  isDead,
  safeCriticism,
  hasEncyclopedia,
  stateOfPlay,
  episodeRecaps,
} from '../data/westeros-encyclopedia'

// ─── buildEventContext ───────────────────────────────────────────────────────
// Called when the Game Master logs an event. `characterName` is whoever the host
// assigned it to — the single most useful thing we can ground the companions on.

export function buildEventContext(
  eventName: string,
  characterName?: string,
): string {
  if (!hasEncyclopedia()) return ''

  const parts: string[] = []

  if (characterName) {
    const c = getCharacter(characterName)
    if (c) {
      const lines = [
        `${c.name} (${c.actor}) — ${c.house}, ${c.allegiance}.`,
        c.dragon ? `Dragon: ${c.dragon.name} — ${c.dragon.notes}` : 'No dragon.',
        `Status entering the finale: ${c.statusEnteringFinale}`,
        `This season: ${c.arcThisSeason}`,
      ]
      if (c.whatTheyveLost) lines.push(`Has lost: ${c.whatTheyveLost}`)
      if (c.discourse) lines.push(`Critical view: ${c.discourse}`)
      // How the room actually feels. Keeps the companions in step with the
      // people watching rather than arguing against them.
      if (c.audienceReaction) lines.push(`HOW VIEWERS FEEL ABOUT THEM: ${c.audienceReaction}`)
      parts.push(lines.join('\n'))
    } else if (getDragon(characterName)) {
      const d = getDragon(characterName)!
      parts.push([
        `${d.name} — dragon, ${d.allegiance}${d.rider ? `, ridden by ${d.rider}` : ', riderless'}.`,
        `Status: ${d.status}`,
        `HOW VIEWERS FEEL ABOUT THEM: ${d.audienceReaction}`,
      ].join('\n'))
    } else if (isDead(characterName)) {
      // The host can legitimately log an event about someone who died earlier
      // in the season. Say so rather than letting the model treat them as live.
      parts.push(
        `NOTE: ${characterName} died earlier this season and is not alive in this episode. React accordingly.`,
      )
    }
  }

  // The event text may name a dragon even when the assigned character is human
  // — "Aemond burns Tumbleton" vs "Vermithor falls". Pick that up too.
  const named = getDragon(eventName)
  if (named && !parts.some((p) => p.startsWith(named.name))) {
    parts.push(
      `${named.name} — dragon, ${named.allegiance}. ${named.status}\nHOW VIEWERS FEEL ABOUT THEM: ${named.audienceReaction}`,
    )
  }

  return parts.join('\n\n')
}

// ─── buildSeasonPreamble ─────────────────────────────────────────────────────
// Called once at the start of the night. Gives the companions the board.

export function buildSeasonPreamble(): string {
  if (!hasEncyclopedia()) return ''

  const lastEp = episodeRecaps[episodeRecaps.length - 1]
  const recent = lastEp
    ? `\nWhat happened last episode ("${lastEp.title}"):\n${lastEp.events.map((e) => `- ${e}`).join('\n')}`
    : ''

  // A small, rotating slice of criticism — enough to give the companions real
  // opinions to hold, not so much that it crowds out the persona instructions.
  const takes = safeCriticism()
    .filter((c) => c.category !== 'sexual-violence')
    .slice(0, 6)
    .map((c) => `- ${c.point}`)
    .join('\n')

  return [
    `STATE OF PLAY GOING INTO TONIGHT:\n${stateOfPlay}`,
    recent.trim(),
    takes ? `HOW THIS SEASON HAS BEEN RECEIVED (you may hold these views, and disagree with each other about them):\n${takes}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

// ─── Back-compat shims ───────────────────────────────────────────────────────
// The Oscars build called these; keep the names working so call sites do not
// all have to change at once.

export function buildCategoryContext(eventName: string, characterName?: string): string {
  return buildEventContext(eventName, characterName)
}

export function buildCeremonyPreamble(): string {
  return buildSeasonPreamble()
}
