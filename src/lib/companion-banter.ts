/**
 * companion-banter — who talks back to whom, and when.
 *
 * WHAT THIS ADDS
 * The companions already react to two things: events the Game Master logs, and
 * messages the players type. Both are spokes off a hub — everything points at
 * the thing that just happened, nobody points at each other. Within a single
 * generation they can cross-reference (they are written in one batch), but once
 * that batch lands the thread dies. Nobody picks it back up.
 *
 * This makes them pick it back up. Someone says something; a minute later
 * somebody else answers it. That is the difference between seven commentators
 * and a room.
 *
 * WHY IT IS A WEIGHTED TABLE AND NOT "PICK A RANDOM ONE"
 * A random responder produces mush — everyone equally interested in everyone.
 * The comedy is in the specific pairs: Olenna will always stop what she is doing
 * to bury Joffrey, Cersei cannot let Tyrion finish a thought, Arya answers
 * cruelty and ignores everything else. Weighting the pairs means the same
 * relationships recur all night, which is what makes it read as people who know
 * each other rather than a cast list being shuffled.
 *
 * WHY NED IS NOT IN THE TABLE AS A SPEAKER
 * He is the record. He narrates every event and does not squabble. Giving him
 * zero outbound weight is a characterisation decision, not an oversight — the
 * moment he starts bickering he stops being the fixed point the others are
 * reacting against. Other people talk back to HIM; he does not return it.
 *
 * Pure — no React, no Supabase, no clock. `rand` is injected so the whole thing
 * is testable and so a caller can make a run deterministic.
 */

import type { CompanionId } from '../data/ai-companions'

/**
 * Directed weights: BANTER_AFFINITY[speaker][responder] is how strongly
 * `responder` wants the last word after `speaker` talks. Roughly 0-10.
 * Absent pair = that person would not bother.
 *
 * Read a row as "X just said something — who looks up?"
 */
export const BANTER_AFFINITY: Partial<
  Record<CompanionId, Partial<Record<CompanionId, number>>>
> = {
  // The record provokes the cynics. Undercutting a solemn line is reliably funny,
  // and it is the only way Ned participates in a conversation.
  ned: { olenna: 3, tyrion: 3, cersei: 2, arya: 1 },

  // Cersei cannot let him speak unanswered; Joffrey resents him structurally.
  tyrion: { cersei: 9, olenna: 4, joffrey: 4, daenerys: 2, arya: 1 },

  // Everyone has something to say to Cersei, which is the point of Cersei.
  cersei: { tyrion: 8, olenna: 7, daenerys: 5, arya: 2, joffrey: 3 },

  // The big one. Nobody defends him except his mother, and she always does.
  joffrey: { olenna: 9, tyrion: 7, arya: 6, cersei: 5, daenerys: 3 },

  // Sincerity at a table of cynics is an invitation.
  daenerys: { cersei: 7, olenna: 5, tyrion: 4, arya: 3, joffrey: 3 },

  // She lands a closing line; someone occasionally survives it.
  olenna: { cersei: 6, tyrion: 5, joffrey: 4, daenerys: 2 },

  // She says almost nothing, so answering her is mostly about the silence after.
  arya: { tyrion: 3, cersei: 2, olenna: 3, daenerys: 2 },
}

/** How often a companion message gets answered at all, before weighting. */
export const BANTER_BASE_CHANCE = 0.38

/** A reply can be replied to once. Past that the thread has to die. */
export const MAX_BANTER_DEPTH = 2

/**
 * Depth decay: a first reply is normal, a reply-to-a-reply is rarer and must
 * be, or two characters will volley until someone closes the tab.
 */
export function chanceAtDepth(depth: number): number {
  if (depth === 0) return BANTER_BASE_CHANCE
  if (depth === 1) return BANTER_BASE_CHANCE * 0.45
  return 0
}

export interface BanterPick {
  responderId: CompanionId
  /** Milliseconds to wait before the reply lands. */
  delayMs: number
}

/**
 * Decide whether anyone answers `speakerId`, and who.
 *
 * @param speakerId   who just spoke
 * @param depth       0 if they were reacting to an event or a player, 1 if they
 *                    were themselves already answering somebody
 * @param excludeIds  companions on cooldown or otherwise unavailable
 * @param rand        injected for testability
 */
export function pickBanterResponder(
  speakerId: string,
  depth: number,
  excludeIds: string[] = [],
  rand: () => number = Math.random,
): BanterPick | null {
  if (depth >= MAX_BANTER_DEPTH) return null

  const row = BANTER_AFFINITY[speakerId as CompanionId]
  if (!row) return null

  const candidates = (Object.entries(row) as [CompanionId, number][]).filter(
    ([id, w]) => w > 0 && id !== speakerId && !excludeIds.includes(id),
  )
  if (!candidates.length) return null

  // Does anyone answer at all? Scaled by how interested the room is in this
  // speaker — a line from Joffrey is far more likely to get picked up than one
  // from Arya, and that asymmetry is doing real characterisation work.
  const totalWeight = candidates.reduce((sum, [, w]) => sum + w, 0)
  const interest = Math.min(1, totalWeight / 20)
  if (rand() > chanceAtDepth(depth) * interest) return null

  // Weighted draw over whoever is left.
  let roll = rand() * totalWeight
  let responderId = candidates[0][0]
  for (const [id, w] of candidates) {
    roll -= w
    if (roll <= 0) {
      responderId = id
      break
    }
  }

  return { responderId, delayMs: banterDelayMs(depth, rand) }
}

/**
 * How long before the reply lands.
 *
 * Not instant, and deliberately variable. An immediate answer reads as a
 * machine; a uniform 30s reads as a cron job. The second hop waits longer
 * because by then the exchange should feel like it is winding down rather than
 * accelerating.
 */
export function banterDelayMs(depth: number, rand: () => number = Math.random): number {
  const [min, max] = depth === 0 ? [11_000, 34_000] : [22_000, 52_000]
  return Math.round(min + rand() * (max - min))
}
