/**
 * player-recap.ts — assembles ONE person's night into a self-contained record.
 *
 * WHAT THIS IS FOR
 * The leaderboard says who won. The Reckoning card says what your night was in
 * one line. This is the long version: your roster and what each character
 * actually did for you, the calls that made and cost you the game, your bingo
 * board as it finished, and the lines from the chat that were about you.
 *
 * It is the artifact a player keeps. Everything else on the results page is
 * about the room; this is about them.
 *
 * PURE, AND DELIBERATELY SO
 * Takes raw rows in, returns a plain object out — no React, no Supabase, no
 * fetching. That is what lets the same builder serve three consumers that
 * cannot share a runtime: the in-app page, the standalone HTML file a player
 * downloads, and the public link someone opens with no session.
 */

import { tallyEntityPoints } from './night-awards'
import type { PlayerAward } from './night-awards'
import { checkBingo, countBingos, FREE_CENTER_INDEX } from './bingo-utils'
import { getCompanionById, isCompanionId } from '../data/ai-companions'
import type { ScoredPlayer } from './scoring'
import type { TimelinePoint } from '../types/timeline'
import type {
  BingoCardRow,
  BingoMarkRow,
  BingoSquareRow,
  CategoryRow,
  ConfidencePickRow,
  DraftEntityRow,
  DraftPickRow,
  MessageRow,
  NomineeRow,
  PlayerRow,
  PlayerVerdictRow,
} from '../types/database'

// ─── Public shape ─────────────────────────────────────────────────────────────

export interface RosterEntry {
  name: string
  /** 'person' is a character, 'film' is a dragon in the HotD seed. */
  kind: 'character' | 'dragon'
  /** 1-based for display. pick_number is 0-based in the database. */
  pickNumber: number
  round: number
  points: number
  wins: Array<{ event: string; points: number }>
}

export interface RecapMoment {
  label: string
  headline: string
  detail: string
}

export interface RecapLine {
  author: string
  kind: 'you' | 'companion' | 'player'
  /** Present for companion lines so the renderer can colour the byline. */
  companionId?: string
  text: string
}

export interface BingoCell {
  index: number
  label: string
  approved: boolean
  isFree: boolean
  /** True when this cell is part of a completed line. */
  inLine: boolean
}

export interface PlayerRecapData {
  roomCode: string
  playerName: string
  avatarColors: { primary: string; secondary: string }

  title: string
  titleBlurb: string
  titleStat: string
  verdict: { text: string; companionName: string; companionId: string } | null

  rank: number
  playerCount: number
  totalScore: number
  confidenceScore: number
  ensembleScore: number
  bingoScore: number

  roster: RosterEntry[]
  moments: RecapMoment[]
  bingo: { cells: BingoCell[]; lineCount: number; approvedCount: number } | null
  lines: RecapLine[]

  /** Printed in the footer so a downloaded file can find its way home. */
  recapUrl: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Whole-word, case-insensitive name match.
 *
 * Substring matching would pull in every line containing "Al" for a player
 * called Al, and companions reference each other constantly. Escaped because a
 * player name is free text and a stray "(" would otherwise throw.
 */
function mentionsName(text: string, name: string): boolean {
  if (name.length < 2) return false
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`, 'i').test(text)
}

// ─── Builder ──────────────────────────────────────────────────────────────────

export interface BuildPlayerRecapArgs {
  player: PlayerRow
  players: PlayerRow[]
  leaderboard: ScoredPlayer[]
  award: PlayerAward | undefined
  verdict: PlayerVerdictRow | undefined
  categories: CategoryRow[]
  nominees: NomineeRow[]
  draftEntities: DraftEntityRow[]
  draftPicks: DraftPickRow[]
  confidencePicks: ConfidencePickRow[]
  timeline: TimelinePoint[]
  bingoCards: BingoCardRow[]
  bingoMarks: BingoMarkRow[]
  bingoSquaresById: Map<number, BingoSquareRow>
  messages: MessageRow[]
  roomCode: string
  recapUrl: string
  avatarColors: { primary: string; secondary: string }
}

export function buildPlayerRecap(args: BuildPlayerRecapArgs): PlayerRecapData {
  const {
    player, players, leaderboard, award, verdict, categories, nominees,
    draftEntities, draftPicks, confidencePicks, timeline, bingoCards,
    bingoMarks, bingoSquaresById, messages, roomCode, recapUrl, avatarColors,
  } = args

  const entry = leaderboard.find((e) => e.player.id === player.id)
  const categoryName = (id: number) => categories.find((c) => c.id === id)?.name ?? 'an event'

  // ── Roster ────────────────────────────────────────────────────────────────
  const tallies = tallyEntityPoints(categories, nominees, draftEntities, draftPicks, players)
  const roster: RosterEntry[] = [...tallies.values()]
    .filter((t) => t.ownerId === player.id)
    .map((t) => ({
      name: t.entity.name,
      kind: t.entity.type === 'film' ? ('dragon' as const) : ('character' as const),
      pickNumber: (t.pickNumber ?? 0) + 1,
      round: t.round ?? 0,
      points: t.points,
      wins: t.wins,
    }))
    // Biggest earner first — the roster reads as a story, not a draft order.
    .sort((a, b) => b.points - a.points)

  // ── Moments ───────────────────────────────────────────────────────────────
  const myPicks = confidencePicks.filter((p) => p.player_id === player.id)
  const correct = myPicks.filter((p) => p.is_correct === true).sort((a, b) => b.confidence - a.confidence)
  const missed = myPicks.filter((p) => p.is_correct === false).sort((a, b) => b.confidence - a.confidence)

  const moments: RecapMoment[] = []

  if (correct[0]) {
    moments.push({
      label: 'Best call',
      headline: categoryName(correct[0].category_id),
      detail: `You staked ${correct[0].confidence} on it and it came in.`,
    })
  }
  if (missed[0]) {
    moments.push({
      label: 'The one that hurt',
      headline: categoryName(missed[0].category_id),
      detail: `${missed[0].confidence} points staked, nothing back.`,
    })
  }

  // Biggest single swing, read off the event-by-event timeline.
  let bestSwing = { delta: 0, event: '' }
  for (const point of timeline) {
    const mine = point.playerScores[player.id]
    if (mine && mine.delta > bestSwing.delta) {
      bestSwing = { delta: mine.delta, event: point.categoryName }
    }
  }
  if (bestSwing.delta > 0) {
    moments.push({
      label: 'Biggest swing',
      headline: bestSwing.event,
      detail: `${bestSwing.delta} points in one moment.`,
    })
  }

  const topEarner = roster.find((r) => r.points > 0)
  if (topEarner) {
    moments.push({
      label: 'Carried you',
      headline: topEarner.name,
      detail: `${topEarner.points} points across ${topEarner.wins.length} event${topEarner.wins.length === 1 ? '' : 's'}.`,
    })
  }

  // ── Bingo board ───────────────────────────────────────────────────────────
  const card = bingoCards.find((c) => c.player_id === player.id)
  let bingo: PlayerRecapData['bingo'] = null
  if (card) {
    const approved = new Set<number>()
    bingoMarks
      .filter((m) => m.card_id === card.id && m.status === 'approved')
      .forEach((m) => approved.add(m.square_index))

    const { lines } = checkBingo(approved)
    const inLine = new Set<number>(lines.flat())

    bingo = {
      cells: (card.squares as number[]).map((squareId, index) => {
        const isFree = index === FREE_CENTER_INDEX
        const square = bingoSquaresById.get(squareId)
        return {
          index,
          label: isFree ? 'FREE' : (square?.short_text || square?.title || '—'),
          approved: isFree || approved.has(index),
          isFree,
          inLine: inLine.has(index),
        }
      }),
      lineCount: countBingos(lines),
      approvedCount: approved.size,
    }
  }

  // ── Lines from the chat ───────────────────────────────────────────────────
  //
  // Two kinds, in priority order: what the companions said ABOUT you, then what
  // you said yourself. Everything else is the room's night, not yours.
  const playerNames = new Map(players.map((p) => [p.id, p.name]))
  const aboutYou: RecapLine[] = []
  const yourOwn: RecapLine[] = []

  for (const m of messages) {
    if (m.player_id === player.id) {
      if (m.text.trim().length > 0) {
        yourOwn.push({ author: player.name, kind: 'you', text: m.text })
      }
      continue
    }
    if (isCompanionId(m.player_id) && mentionsName(m.text, player.name)) {
      const companion = getCompanionById(m.player_id)
      aboutYou.push({
        author: companion?.name ?? m.player_id,
        kind: 'companion',
        companionId: m.player_id,
        text: m.text,
      })
      continue
    }
    // Another human naming you — keeps the table's banter in the keepsake.
    if (playerNames.has(m.player_id) && mentionsName(m.text, player.name)) {
      aboutYou.push({
        author: playerNames.get(m.player_id) ?? 'Someone',
        kind: 'player',
        text: m.text,
      })
    }
  }

  // Cap the section so the artifact stays readable. Prefer lines about you;
  // backfill with your own, longest first — a one-word "lol" is not a keepsake.
  const lines = [
    ...aboutYou.slice(0, 6),
    ...yourOwn.sort((a, b) => b.text.length - a.text.length).slice(0, 4),
  ].slice(0, 8)

  return {
    roomCode,
    playerName: player.name,
    avatarColors,
    title: award?.title ?? 'Kept the Watch',
    titleBlurb: award?.blurb ?? 'Sat through the whole Dance and lived to argue about it.',
    titleStat: award?.stat ?? `${entry?.totalScore ?? 0} pts on the night`,
    verdict: verdict
      ? {
          text: verdict.verdict,
          companionName: getCompanionById(verdict.companion_id)?.name ?? verdict.companion_id,
          companionId: verdict.companion_id,
        }
      : null,
    rank: entry?.rank ?? 0,
    playerCount: leaderboard.length,
    totalScore: entry?.totalScore ?? 0,
    confidenceScore: entry?.confidenceScore ?? 0,
    ensembleScore: entry?.ensembleScore ?? 0,
    bingoScore: entry?.bingoScore ?? 0,
    roster,
    moments,
    bingo,
    lines,
    recapUrl,
  }
}
