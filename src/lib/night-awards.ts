/**
 * night-awards.ts — end-of-night honours, as pure functions.
 *
 * WHY THIS EXISTS
 * The leaderboard rewards exactly one person. Everyone else reads a number and
 * finds out they lost. These awards give every player something that is true
 * about their night and worth screenshotting — and they give the table the
 * argument it actually wants to have, which is about the characters, not the
 * points.
 *
 * DETERMINISTIC BY DESIGN
 * Nothing here calls an LLM. Titles are computed from the same rows the
 * leaderboard is computed from, so they are stable across reloads, identical on
 * every client, and still correct if the Anthropic call on the Results page
 * fails. The written verdict layered on top of these is the part that may go
 * missing; the title and the stat never do.
 *
 * ATTRIBUTION REUSES ONE MATCHER
 * "Which entity earned these points" comes from findDraftPointsForWinner's
 * entityId, not from a second copy of the person/film matching rules. A parallel
 * implementation would drift the first time either changed.
 */

import { findDraftPointsForWinner } from './scoring'
import type { ScoredPlayer } from './scoring'
import type { TimelinePoint } from '../types/timeline'
import type {
  CategoryRow,
  NomineeRow,
  DraftEntityRow,
  DraftPickRow,
  ConfidencePickRow,
  PlayerRow,
} from '../types/database'

// ─── Public types ─────────────────────────────────────────────────────────────

export interface PlayerAward {
  playerId: string
  playerName: string
  /** Short honorific shown as the card headline. */
  title: string
  /** One data-derived sentence explaining why they earned it. */
  blurb: string
  /** Compact stat line under the title. */
  stat: string
}

export interface CharacterAward {
  kind: 'character_of_the_night' | 'the_bust' | 'best_value'
  label: string
  entityName: string
  /** Null when nobody drafted them — which is its own story. */
  ownerName: string | null
  points: number
  detail: string
}

export interface NightAwards {
  playerAwards: PlayerAward[]
  characterAwards: CharacterAward[]
}

// ─── Per-entity point attribution ─────────────────────────────────────────────

export interface EntityTally {
  entity: DraftEntityRow
  points: number
  ownerId: string | null
  ownerName: string | null
  /** Draft round the owner spent on them. Null when undrafted. */
  round: number | null
  pickNumber: number | null
  /**
   * Every event this entity won, in resolution order.
   *
   * Recorded here rather than re-walked by callers so there is exactly one
   * traversal of "which entity earned what" in the codebase. The awards only
   * need the total; the personal recap needs the itemised list, and a second
   * walk would drift from this one the first time the matcher changed.
   */
  wins: Array<{ event: string; points: number }>
}

/**
 * Totals what each draft entity actually paid out across the whole night.
 *
 * Walks every resolved event exactly as computeLeaderboard does — including the
 * tie winner, which pays independently — and buckets the points by the entity
 * credited rather than by the player who owns them.
 */
export function tallyEntityPoints(
  categories: CategoryRow[],
  nominees: NomineeRow[],
  draftEntities: DraftEntityRow[],
  draftPicks: DraftPickRow[],
  players: PlayerRow[],
): Map<string, EntityTally> {
  const playerById = new Map(players.map((p) => [p.id, p]))
  const pickByEntity = new Map(draftPicks.map((p) => [p.entity_id, p]))

  const tallies = new Map<string, EntityTally>()
  for (const entity of draftEntities) {
    const pick = pickByEntity.get(entity.id) ?? null
    tallies.set(entity.id, {
      entity,
      points: 0,
      ownerId: pick?.player_id ?? null,
      ownerName: pick ? (playerById.get(pick.player_id)?.name ?? null) : null,
      round: pick?.round ?? null,
      pickNumber: pick?.pick_number ?? null,
      wins: [],
    })
  }

  const resolved = categories.filter((c) => c.winner_id != null)
  for (const cat of resolved) {
    for (const winnerId of [cat.winner_id, cat.tie_winner_id]) {
      if (!winnerId) continue
      const { points, entityId } = findDraftPointsForWinner(
        cat.id,
        winnerId,
        categories,
        nominees,
        draftEntities,
        draftPicks,
      )
      if (!entityId) continue
      const tally = tallies.get(entityId)
      if (tally) {
        tally.points += points
        tally.wins.push({ event: cat.name, points })
      }
    }
  }

  return tallies
}

// ─── Character awards ─────────────────────────────────────────────────────────

function computeCharacterAwards(tallies: Map<string, EntityTally>): CharacterAward[] {
  const all = [...tallies.values()]
  const drafted = all.filter((t) => t.ownerId != null)
  const awards: CharacterAward[] = []

  // Character of the Night — biggest earner on the board, drafted or not.
  // Deliberately not restricted to owned entities: "the best character of the
  // night was sitting undrafted the whole time" is the single funniest outcome
  // this award can produce, and hiding it would be a worse table moment.
  const top = [...all].sort((a, b) => b.points - a.points)[0]
  if (top && top.points > 0) {
    awards.push({
      kind: 'character_of_the_night',
      label: 'Character of the Night',
      entityName: top.entity.name,
      ownerName: top.ownerName,
      points: top.points,
      detail: top.ownerName
        ? `Earned ${top.points} points for ${top.ownerName}.`
        : `Earned ${top.points} points and nobody drafted them.`,
    })
  }

  // The Bust — the earliest pick of the draft that never paid out. Scoped to
  // drafted entities with exactly zero, ranked by how early the pick was, so
  // this lands on a confident first-round call rather than a shrug in round four.
  const busts = drafted
    .filter((t) => t.points === 0 && t.pickNumber != null)
    .sort((a, b) => (a.pickNumber ?? 0) - (b.pickNumber ?? 0))
  const bust = busts[0]
  if (bust) {
    awards.push({
      kind: 'the_bust',
      label: 'The Bust',
      entityName: bust.entity.name,
      ownerName: bust.ownerName,
      points: 0,
      // pick_number is 0-based in the database — the archived Oscars draft runs
      // 0..43 for 44 picks. Nobody says "you went at pick zero".
      detail: `Pick #${(bust.pickNumber ?? 0) + 1} overall. Scored nothing all night.`,
    })
  }

  // Best Value — most points from the back half of the draft. Rewards the read
  // nobody else made, which is the only part of draft position a player controls.
  const withPicks = drafted.filter((t) => t.pickNumber != null && t.points > 0)
  if (withPicks.length > 0) {
    const medianPick =
      [...withPicks].sort((a, b) => (a.pickNumber ?? 0) - (b.pickNumber ?? 0))[
        Math.floor(withPicks.length / 2)
      ]?.pickNumber ?? 0
    const lateSteal = withPicks
      .filter((t) => (t.pickNumber ?? 0) >= medianPick)
      .sort((a, b) => b.points - a.points)[0]
    if (lateSteal && lateSteal.entity.id !== top?.entity.id) {
      awards.push({
        kind: 'best_value',
        label: 'Best Value',
        entityName: lateSteal.entity.name,
        ownerName: lateSteal.ownerName,
        points: lateSteal.points,
        detail: `Went at pick #${(lateSteal.pickNumber ?? 0) + 1} and paid out ${lateSteal.points}.`,
      })
    }
  }

  return awards
}

// ─── Player titles ────────────────────────────────────────────────────────────

/**
 * Everything about one player's night that a title might be built from.
 * Computed once per player, then read by every candidate title.
 */
interface PlayerProfile {
  entry: ScoredPlayer
  bestEntityName: string | null
  bestEntityPoints: number
  dragonPoints: number
  topStake: number
  topStakeHit: boolean
  topStakeCategory: string | null
  worstMiss: number
  worstMissCategory: string | null
  bestSingleSwing: number
  lateSurge: number
  neverBelowSecond: boolean
}

function buildProfiles(
  leaderboard: ScoredPlayer[],
  categories: CategoryRow[],
  confidencePicks: ConfidencePickRow[],
  tallies: Map<string, EntityTally>,
  timeline: TimelinePoint[],
): PlayerProfile[] {
  const categoryName = (id: number) => categories.find((c) => c.id === id)?.name ?? null

  // Last third of the night, where a comeback would show up.
  const lateFrom = Math.floor(timeline.length * (2 / 3))

  return leaderboard.map((entry) => {
    const owned = [...tallies.values()].filter((t) => t.ownerId === entry.player.id)
    const best = [...owned].sort((a, b) => b.points - a.points)[0] ?? null
    const dragonPoints = owned
      .filter((t) => t.entity.type === 'film')
      .reduce((sum, t) => sum + t.points, 0)

    const myPicks = confidencePicks.filter((p) => p.player_id === entry.player.id)
    const biggestStake = [...myPicks].sort((a, b) => b.confidence - a.confidence)[0] ?? null
    const misses = myPicks.filter((p) => p.is_correct === false)
    const worstMiss = [...misses].sort((a, b) => b.confidence - a.confidence)[0] ?? null

    let bestSingleSwing = 0
    let lateSurge = 0
    let neverBelowSecond = timeline.length > 0
    timeline.forEach((point, i) => {
      const mine = point.playerScores[entry.player.id]
      if (!mine) return
      if (mine.delta > bestSingleSwing) bestSingleSwing = mine.delta
      if (i >= lateFrom) lateSurge += mine.delta

      // Rank at this moment = how many players are strictly ahead.
      const ahead = Object.entries(point.playerScores).filter(
        ([pid, s]) => pid !== entry.player.id && s.cumulative > mine.cumulative,
      ).length
      if (ahead > 1) neverBelowSecond = false
    })

    return {
      entry,
      bestEntityName: best && best.points > 0 ? best.entity.name : null,
      bestEntityPoints: best?.points ?? 0,
      dragonPoints,
      topStake: biggestStake?.confidence ?? 0,
      topStakeHit: biggestStake?.is_correct === true,
      topStakeCategory: biggestStake ? categoryName(biggestStake.category_id) : null,
      worstMiss: worstMiss?.confidence ?? 0,
      worstMissCategory: worstMiss ? categoryName(worstMiss.category_id) : null,
      bestSingleSwing,
      lateSurge,
      neverBelowSecond,
    }
  })
}

interface TitleCandidate {
  id: string
  title: string
  /** Higher wins the title. Zero or below means "this story isn't there". */
  strength: (p: PlayerProfile) => number
  blurb: (p: PlayerProfile) => string
  stat: (p: PlayerProfile) => string
}

/**
 * The title pool.
 *
 * Strengths are tuned so the most striking story wins the player rather than
 * the largest raw number — a 20-point stake landed is a better line than 60
 * accumulated draft points, so it scores higher despite the smaller figure.
 * There are more titles than players by design: with a fixed list the last
 * player always gets the leftover, and the leftover always reads as a
 * consolation prize.
 */
const TITLE_POOL: TitleCandidate[] = [
  {
    id: 'valyrian_nerve',
    title: 'Nerves of Valyrian Steel',
    strength: (p) => (p.topStakeHit ? p.topStake * 4 : 0),
    blurb: (p) =>
      `Put their biggest number of the night on ${p.topStakeCategory ?? 'the line'} and watched it come in.`,
    stat: (p) => `${p.topStake} staked, ${p.topStake} banked`,
  },
  {
    id: 'kingmaker',
    title: 'The Kingmaker',
    strength: (p) => p.bestEntityPoints * 1.2,
    blurb: (p) => `${p.bestEntityName} carried them, and did it almost single-handed.`,
    stat: (p) => `${p.bestEntityPoints} pts from ${p.bestEntityName}`,
  },
  {
    id: 'long_game',
    title: 'The Long Game',
    strength: (p) => p.lateSurge * 1.5,
    blurb: () => 'Quiet for most of the episode, then took the back third apart.',
    stat: (p) => `${p.lateSurge} pts in the closing stretch`,
  },
  {
    id: 'held_the_line',
    title: 'Held the Line',
    strength: (p) => (p.neverBelowSecond ? 55 : 0),
    blurb: () => 'Never dropped out of the top two. Not once, all night.',
    stat: () => 'Top two, start to finish',
  },
  {
    id: 'dragonrider',
    title: 'Dragonrider',
    strength: (p) => p.dragonPoints * 1.4,
    blurb: () => 'Took a dragon and let it do the work.',
    stat: (p) => `${p.dragonPoints} pts on dragonback`,
  },
  {
    id: 'one_shot',
    title: 'One Shot',
    strength: (p) => p.bestSingleSwing * 2,
    blurb: () => 'One moment did more for them than the rest of the night combined.',
    stat: (p) => `${p.bestSingleSwing} pts from a single beat`,
  },
  {
    id: 'cold_reader',
    title: 'The Cold Reader',
    strength: (p) => p.entry.correctPickCount * 7,
    blurb: (p) => `Called ${p.entry.correctPickCount} of them right. Read the episode better than it read itself.`,
    stat: (p) => `${p.entry.correctPickCount} correct predictions`,
  },
  {
    id: 'bled_out',
    title: 'Bled Out',
    strength: (p) => p.worstMiss * 1.1,
    blurb: (p) =>
      `Staked ${p.worstMiss} on ${p.worstMissCategory ?? 'the wrong call'} and got nothing back for it.`,
    stat: (p) => `${p.worstMiss} points left on the field`,
  },
]

/** Given to anyone the pool has nothing for. Never insulting — they still showed up. */
const FALLBACK_TITLE: Omit<TitleCandidate, 'strength'> = {
  id: 'kept_the_watch',
  title: 'Kept the Watch',
  blurb: () => 'Sat through the whole Dance and lived to argue about it.',
  stat: (p) => `${p.entry.totalScore} pts on the night`,
}

/**
 * Assigns one distinct title per player.
 *
 * Greedy over every (player, title) pairing sorted by strength: the single most
 * compelling story in the room gets claimed first, and both that player and that
 * title leave the pool. This beats per-player argmax, which happily hands the
 * same title to three people and then needs a tiebreak anyway.
 */
function assignPlayerTitles(profiles: PlayerProfile[]): PlayerAward[] {
  const pairs: Array<{ profile: PlayerProfile; candidate: TitleCandidate; strength: number }> = []
  for (const profile of profiles) {
    for (const candidate of TITLE_POOL) {
      const strength = candidate.strength(profile)
      if (strength > 0) pairs.push({ profile, candidate, strength })
    }
  }
  pairs.sort((a, b) => b.strength - a.strength)

  const takenPlayers = new Set<string>()
  const takenTitles = new Set<string>()
  const awards = new Map<string, PlayerAward>()

  for (const { profile, candidate } of pairs) {
    const pid = profile.entry.player.id
    if (takenPlayers.has(pid) || takenTitles.has(candidate.id)) continue
    takenPlayers.add(pid)
    takenTitles.add(candidate.id)
    awards.set(pid, {
      playerId: pid,
      playerName: profile.entry.player.name,
      title: candidate.title,
      blurb: candidate.blurb(profile),
      stat: candidate.stat(profile),
    })
  }

  // Anyone the pool had no positive story for still gets a card.
  for (const profile of profiles) {
    const pid = profile.entry.player.id
    if (awards.has(pid)) continue
    awards.set(pid, {
      playerId: pid,
      playerName: profile.entry.player.name,
      title: FALLBACK_TITLE.title,
      blurb: FALLBACK_TITLE.blurb(profile),
      stat: FALLBACK_TITLE.stat(profile),
    })
  }

  // Leaderboard order, so the card list reads alongside the standings.
  return profiles.map((p) => awards.get(p.entry.player.id)!)
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export function computeNightAwards(
  leaderboard: ScoredPlayer[],
  players: PlayerRow[],
  categories: CategoryRow[],
  nominees: NomineeRow[],
  draftEntities: DraftEntityRow[],
  draftPicks: DraftPickRow[],
  confidencePicks: ConfidencePickRow[],
  timeline: TimelinePoint[],
): NightAwards {
  const tallies = tallyEntityPoints(categories, nominees, draftEntities, draftPicks, players)
  const profiles = buildProfiles(leaderboard, categories, confidencePicks, tallies, timeline)
  return {
    playerAwards: assignPlayerTitles(profiles),
    characterAwards: computeCharacterAwards(tallies),
  }
}
