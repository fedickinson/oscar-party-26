/**
 * PublicResults — the shareable, read-only version of the results page.
 *
 * WHY THIS EXISTS
 * /room/:code/results bounces anyone without a player session straight to the
 * home page. That is correct for a live room, but it meant every results link
 * ever shared was dead on arrival for the person receiving it: they were not at
 * the party, so they have no session, so they got redirected. The share button
 * was producing links that only worked for people who did not need them.
 *
 * This route reads the same data and renders the same view, minus anything that
 * assumes a viewer:
 *   - no phase subscription (the night is over; nothing will change)
 *   - no companion generation (that is the host's job and already happened)
 *   - no "You" highlight, no recap download, no share button
 *
 * A ONE-SHOT SNAPSHOT, NOT A LIVE VIEW
 * Deliberately no Realtime subscriptions. This is a record of a finished night
 * being read by someone who was not there — there is nothing to keep in sync,
 * and subscribing would hold a websocket open for every casual link click.
 */

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { computeLeaderboard } from '../lib/scoring'
import { computePlayerBingoScores } from '../lib/bingo-utils'
import { computeNightAwards } from '../lib/night-awards'
import {
  computeScoreTimeline,
  identifyTurningPoints,
  identifyHeadToHead,
  describeFinalStretch,
  computeBreakdownTimeline,
} from '../lib/timeline-utils'
import PostCeremonyView from '../components/home/PostCeremonyView'
import type {
  BingoCardRow,
  BingoMarkRow,
  BingoSquareRow,
  CategoryRow,
  ConfidencePickRow,
  DraftEntityRow,
  DraftPickRow,
  NomineeRow,
  PlayerRow,
  PlayerVerdictRow,
  RoomWinnerRow,
} from '../types/database'

interface Snapshot {
  players: PlayerRow[]
  categories: CategoryRow[]
  nominees: NomineeRow[]
  confidencePicks: ConfidencePickRow[]
  draftPicks: DraftPickRow[]
  draftEntities: DraftEntityRow[]
  bingoCards: BingoCardRow[]
  bingoMarks: BingoMarkRow[]
  /** The static square pool, keyed by id — carries the tier each mark scores on */
  bingoSquaresById: Map<number, BingoSquareRow>
  verdicts: Map<string, PlayerVerdictRow>
}

export default function PublicResults() {
  const { code } = useParams<{ code: string }>()
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!code) return
    let cancelled = false

    async function load() {
      // Room codes are the only handle a link recipient has. maybeSingle over
      // single: a mistyped or expired code is an expected outcome here, not an
      // exception — this page is reached by people pasting links.
      const { data: room } = await supabase
        .from('rooms')
        .select('id')
        .eq('code', code!.toUpperCase())
        .maybeSingle()

      if (cancelled) return
      if (!room) { setNotFound(true); return }

      const roomId = room.id as string

      const [
        playersRes, catRes, nomRes, cpRes, dpRes, deRes, rwRes, bcRes, pvRes, bsRes,
      ] = await Promise.all([
        supabase.from('players').select().eq('room_id', roomId),
        supabase.from('categories').select().order('display_order'),
        supabase.from('nominees').select(),
        supabase.from('confidence_picks').select().eq('room_id', roomId),
        supabase.from('draft_picks').select().eq('room_id', roomId),
        supabase.from('draft_entities').select(),
        supabase.from('room_winners').select().eq('room_id', roomId),
        supabase.from('bingo_cards').select().eq('room_id', roomId),
        supabase.from('player_verdicts').select().eq('room_id', roomId),
        supabase.from('bingo_squares').select(),
      ])
      if (cancelled) return

      // Winners are per-room; the global categories table carries no result.
      // Same merge useScores performs on load.
      const winnerMap = new Map<number, RoomWinnerRow>(
        ((rwRes.data ?? []) as RoomWinnerRow[]).map((rw) => [rw.category_id, rw]),
      )
      const categories = ((catRes.data ?? []) as CategoryRow[]).map((c) => ({
        ...c,
        winner_id: winnerMap.get(c.id)?.winner_id ?? null,
        tie_winner_id: winnerMap.get(c.id)?.tie_winner_id ?? null,
      }))

      const bingoCards = (bcRes.data ?? []) as BingoCardRow[]
      let bingoMarks: BingoMarkRow[] = []
      if (bingoCards.length > 0) {
        const { data: markData } = await supabase
          .from('bingo_marks')
          .select()
          .in('card_id', bingoCards.map((c) => c.id))
        if (cancelled) return
        bingoMarks = (markData ?? []) as BingoMarkRow[]
      }

      setSnapshot({
        players: (playersRes.data ?? []) as PlayerRow[],
        categories,
        nominees: (nomRes.data ?? []) as NomineeRow[],
        confidencePicks: (cpRes.data ?? []) as ConfidencePickRow[],
        draftPicks: (dpRes.data ?? []) as DraftPickRow[],
        draftEntities: (deRes.data ?? []) as DraftEntityRow[],
        bingoCards,
        bingoMarks,
        bingoSquaresById: new Map(
          ((bsRes.data ?? []) as BingoSquareRow[]).map((sq) => [sq.id, sq]),
        ),
        verdicts: new Map(
          ((pvRes.data ?? []) as PlayerVerdictRow[]).map((r) => [r.player_id, r]),
        ),
      })
    }

    load()
    return () => { cancelled = true }
  }, [code])

  // ── Derived (identical pipeline to the live results page) ──────────────────

  const leaderboard = useMemo(() => {
    if (!snapshot) return []
    const { scores } = computePlayerBingoScores(
      snapshot.players,
      snapshot.bingoCards,
      snapshot.bingoMarks,
      snapshot.bingoSquaresById,
    )
    return computeLeaderboard(
      snapshot.players,
      snapshot.confidencePicks,
      snapshot.draftPicks,
      snapshot.draftEntities,
      snapshot.categories,
      snapshot.nominees,
      scores,
    )
  }, [snapshot])

  const timeline = useMemo(
    () =>
      snapshot
        ? computeScoreTimeline(
            snapshot.categories,
            snapshot.confidencePicks,
            snapshot.draftPicks,
            snapshot.draftEntities,
            snapshot.nominees,
            snapshot.players,
          )
        : [],
    [snapshot],
  )

  const awards = useMemo(
    () =>
      snapshot
        ? computeNightAwards(
            leaderboard,
            snapshot.players,
            snapshot.categories,
            snapshot.nominees,
            snapshot.draftEntities,
            snapshot.draftPicks,
            snapshot.confidencePicks,
            timeline,
          )
        : { playerAwards: [], characterAwards: [] },
    [snapshot, leaderboard, timeline],
  )

  const breakdowns = useMemo(
    () =>
      snapshot
        ? computeBreakdownTimeline(
            timeline,
            snapshot.players,
            snapshot.categories,
            snapshot.confidencePicks,
            snapshot.draftPicks,
            snapshot.draftEntities,
            snapshot.nominees,
          )
        : { confidence: [], draft: [] },
    [snapshot, timeline],
  )

  if (notFound) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-8 text-center">
        <p className="text-base font-semibold text-white">No such room</p>
        <p className="text-sm text-white/45 mt-2">
          This link points at a party that does not exist, or one whose room code has changed.
        </p>
      </div>
    )
  }

  if (!snapshot) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <PostCeremonyView
      leaderboard={leaderboard}
      players={snapshot.players}
      timeline={timeline}
      turningPoints={identifyTurningPoints(timeline, snapshot.players)}
      headToHead={identifyHeadToHead(timeline, snapshot.players)}
      finalStretchNarrative={describeFinalStretch(timeline, snapshot.players)}
      confidenceData={breakdowns.confidence}
      draftData={breakdowns.draft}
      playerAwards={awards.playerAwards}
      characterAwards={awards.characterAwards}
      verdicts={snapshot.verdicts}
      /* No onShareResults / onDownloadRecap and no currentPlayerId: this viewer
         has no card of their own to highlight and no session to generate from. */
    />
  )
}
