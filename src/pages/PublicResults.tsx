/**
 * PublicResults — the shareable, read-only standings at /recap/:code.
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
 * It DOES pass roomCode, so every player card links through to that person's
 * own page — which is the point of sharing the link at all.
 *
 * The fetch lives in useRoomSnapshot, shared with the per-player keepsake.
 */

import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useRoomSnapshot } from '../hooks/useRoomSnapshot'
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

export default function PublicResults() {
  const { code } = useParams<{ code: string }>()
  const { snapshot, notFound } = useRoomSnapshot(code)

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
      roomCode={snapshot.roomCode}
      /* No onShareResults / onDownloadRecap and no currentPlayerId: this viewer
         has no card of their own to highlight and no session to generate from. */
    />
  )
}
