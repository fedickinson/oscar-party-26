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
import type { VerdictLineCandidate } from './companion-prompts'
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
  /** The companion's reason this line made the cut. Absent on fallback picks. */
  note?: string
}

export interface BingoCell {
  index: number
  label: string
  approved: boolean
  isFree: boolean
  /** True when this cell is part of a completed line. */
  inLine: boolean
  /** The full square text — what the grid tile abbreviates. */
  text: string
  /** The strict adjudication rule, including what does NOT count. */
  winCondition: string
  /** likely | toss_up | long_shot | chaos */
  tier: string
  probabilityPct: number
}

export interface PlayerRecapData {
  roomCode: string
  playerName: string
  avatarColors: { primary: string; secondary: string }

  title: string
  /** True when the title was written for this player rather than drawn from the pool. */
  titleIsBespoke: boolean
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

// ─── Candidate lines ──────────────────────────────────────────────────────────

/**
 * Narrows the transcript to the lines that plausibly belong in each player's
 * keepsake, keyed by player id.
 *
 * Shared by two callers with different jobs: the verdict prompt offers these to
 * the model to choose from, and buildPlayerRecap falls back to them wholesale
 * when the model produced no picks. Both must draw from the same pool or the
 * fallback would surface lines the model had never been allowed to consider.
 *
 * A line qualifies when it is BY the player, or when it names them — from a
 * companion or from another human at the table. Everything else is the room's
 * night rather than theirs.
 */
export function collectLineCandidates(
  messages: MessageRow[],
  players: PlayerRow[],
): Map<string, VerdictLineCandidate[]> {
  const playerNames = new Map(players.map((p) => [p.id, p.name]))
  const out = new Map<string, VerdictLineCandidate[]>()
  for (const p of players) out.set(p.id, [])

  for (const m of messages) {
    const text = m.text.trim()
    // 'system' and the synthetic divider rows are plumbing, not conversation.
    if (!text || m.player_id === 'system' || !SPEAKABLE.test(text)) continue

    const authorName = playerNames.get(m.player_id)
      ?? (isCompanionId(m.player_id) ? getCompanionById(m.player_id)?.name ?? m.player_id : null)
    if (!authorName) continue

    for (const p of players) {
      const isOwn = m.player_id === p.id
      if (!isOwn && !mentionsName(text, p.name)) continue
      out.get(p.id)!.push({ messageId: m.id, author: isOwn ? p.name : authorName, text })
    }
  }

  // Cap per player. The model reads every candidate for every slot, so an
  // unbounded chat would blow the prompt out on a talkative night. Newest first
  // is wrong here — the funniest line is as likely to be from the first act —
  // so keep chronological order and trim the tail.
  for (const [id, list] of out) out.set(id, list.slice(0, 24))
  return out
}

/** Rejects lines with no letters at all — reactions, stray punctuation. */
const SPEAKABLE = /[a-z]/i

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
          text: isFree ? 'Free centre square' : (square?.text ?? ''),
          winCondition: square?.win_condition ?? '',
          tier: square?.likelihood_tier ?? '',
          probabilityPct: square?.probability_pct ?? 0,
        }
      }),
      lineCount: countBingos(lines),
      approvedCount: approved.size,
    }
  }

  // ── Lines from the chat ───────────────────────────────────────────────────
  //
  // Preferred source is the companion's own picks, stored on the verdict row.
  // Choosing the memorable line out of a night's chat is a judgement call, and
  // the heuristic below could only ever approximate it by length — which
  // reliably surfaced the most VERBOSE line rather than the best one.
  const playerNames = new Map(players.map((p) => [p.id, p.name]))
  const messageById = new Map(messages.map((m) => [m.id, m]))

  const describe = (m: MessageRow, note?: string): RecapLine => {
    if (m.player_id === player.id) {
      return { author: player.name, kind: 'you', text: m.text, note }
    }
    if (isCompanionId(m.player_id)) {
      return {
        author: getCompanionById(m.player_id)?.name ?? m.player_id,
        kind: 'companion',
        companionId: m.player_id,
        text: m.text,
        note,
      }
    }
    return { author: playerNames.get(m.player_id) ?? 'Someone', kind: 'player', text: m.text, note }
  }

  const highlights = (verdict?.highlights ?? []) as Array<{ message_id?: string; note?: string }>
  let lines: RecapLine[] = highlights
    .map((h) => {
      const m = h.message_id ? messageById.get(h.message_id) : undefined
      return m ? describe(m, h.note || undefined) : null
    })
    .filter((l): l is RecapLine => l !== null)

  // Fallback: no verdict row, or the model returned nothing usable. Drawn from
  // the same candidate pool the model was offered, so the two paths can never
  // surface different universes of lines — lines about you first, then your own
  // longest, which is the best a rule can do without reading them.
  if (lines.length === 0) {
    const candidates = collectLineCandidates(messages, players).get(player.id) ?? []
    const own = candidates.filter((c) => messageById.get(c.messageId)?.player_id === player.id)
    const about = candidates.filter((c) => messageById.get(c.messageId)?.player_id !== player.id)
    lines = [
      ...about.slice(0, 4),
      ...own.sort((a, b) => b.text.length - a.text.length).slice(0, 3),
    ]
      .slice(0, 6)
      .map((c) => describe(messageById.get(c.messageId)!))
  }

  return {
    roomCode,
    playerName: player.name,
    avatarColors,
    // The companion's name for this player wins when there is one; the computed
    // pool title is the guarantee that everyone gets something.
    title: verdict?.title?.trim() || award?.title || 'Kept the Watch',
    titleIsBespoke: Boolean(verdict?.title?.trim()),
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
