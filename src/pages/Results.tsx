/**
 * Results — final standings page (phase: finished).
 *
 * Reached when Admin sets room phase to 'finished' (all 24 categories
 * announced). All players navigate here simultaneously via Realtime.
 *
 * Renders PostCeremonyView which includes:
 *   1. Winner celebration with confetti
 *   2. Full leaderboard
 *   3. Interactive score timeline (recharts)
 *   4. Key turning points
 *   5. Game breakdown charts (confidence, draft, bingo)
 *   6. Head-to-head rivalry card
 *   7. Final stretch narrative
 */

import { useEffect, useMemo, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import { useRoomSubscription } from '../hooks/useRoom'
import { useScores } from '../hooks/useScores'
import { useRecap } from '../hooks/useRecap'
import { supabase } from '../lib/supabase'
import {
  buildPostShowPrompt,
  parseCompanionResponse,
} from '../lib/companion-prompts'
import {
  computeScoreTimeline,
  identifyTurningPoints,
  identifyHeadToHead,
  describeFinalStretch,
  computeBreakdownTimeline,
} from '../lib/timeline-utils'
import PostCeremonyView from '../components/home/PostCeremonyView'

export default function Results() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { room, player, players, loading } = useGame()

  useRoomSubscription(room?.id)

  const scores = useScores(room?.id)

  useEffect(() => {
    if (!loading && !player) navigate('/')
  }, [loading, player, navigate])

  // ── Post-show companion farewell messages (fires once, host only) ──────────
  //
  // Waits for scores to load, then checks if a post-show message has already
  // been sent. If not, fires the buildPostShowPrompt and inserts messages.
  // Only the host fires the API call; all players receive via Realtime.

  const postShowFiredRef = useRef(false)
  const isHost = player?.is_host ?? false

  useEffect(() => {
    if (!room || !isHost || scores.isLoading || postShowFiredRef.current) return
    if (scores.leaderboard.length === 0) return

    postShowFiredRef.current = true

    const timer = setTimeout(async () => {
      // Guard: skip if post-show messages already exist (page reload case)
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', room.id)
        .eq('player_id', 'system')
        .eq('text', 'Final Standings')
      if (count != null && count > 0) return

      // Insert a system divider
      await supabase.from('messages').insert({
        room_id: room.id,
        player_id: 'system',
        text: 'Final Standings',
      })

      // Fire post-show companion messages
      const prompt = buildPostShowPrompt(
        scores.leaderboard,
        players,
        scores.categories,
        scores.confidencePicks,
      )

      try {
        const response = await fetch('/api/anthropic/v1/messages', {
          method: 'POST',
          headers: {
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-6',
            max_tokens: 400,
            system: prompt.system,
            messages: [{ role: 'user', content: prompt.user }],
          }),
        })

        if (!response.ok) return
        const data = await response.json()
        const raw = (data?.content?.[0]?.text ?? '') as string
        if (!raw) return

        const messages = parseCompanionResponse(raw)
        for (const msg of messages) {
          if (msg.delay_seconds === 0) {
            await supabase.from('messages').insert({
              room_id: room.id,
              player_id: msg.companion_id,
              text: msg.text,
            })
          } else {
            setTimeout(() => {
              supabase.from('messages').insert({
                room_id: room.id,
                player_id: msg.companion_id,
                text: msg.text,
              })
            }, msg.delay_seconds * 1000)
          }
        }
      } catch {
        // Companions are nice-to-have — silently fail
      }
    }, 3000) // 3s delay to let scores settle and FinaleOverlay dismiss

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room, isHost, scores.isLoading, scores.leaderboard.length])

  // Compute timeline data (memoized — only recomputes when scores data changes)
  const timeline = useMemo(
    () =>
      computeScoreTimeline(
        scores.categories,
        scores.confidencePicks,
        scores.draftPicks,
        scores.draftEntities,
        scores.nominees,
        players,
      ),
    [scores.categories, scores.confidencePicks, scores.draftPicks, scores.draftEntities, scores.nominees, players],
  )

  const turningPoints = useMemo(
    () => identifyTurningPoints(timeline, players),
    [timeline, players],
  )

  const headToHead = useMemo(
    () => identifyHeadToHead(timeline, players),
    [timeline, players],
  )

  const finalStretchNarrative = useMemo(
    () => describeFinalStretch(timeline, players),
    [timeline, players],
  )

  const breakdowns = useMemo(
    () =>
      computeBreakdownTimeline(
        timeline,
        players,
        scores.categories,
        scores.confidencePicks,
        scores.draftPicks,
        scores.draftEntities,
        scores.nominees,
      ),
    [timeline, players, scores.categories, scores.confidencePicks, scores.draftPicks, scores.draftEntities, scores.nominees],
  )

  const { downloadRecap, isGenerating } = useRecap({
    roomId: room?.id,
    roomCode: room?.code,
    leaderboard: scores.leaderboard,
    categories: scores.categories,
    nominees: scores.nominees,
    confidencePicks: scores.confidencePicks,
    players,
    playerBingoCounts: scores.playerBingoCounts,
  })

  if (loading || scores.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-oscar-gold border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!room || !player) return null

  return (
    <PostCeremonyView
      leaderboard={scores.leaderboard}
      players={players}
      timeline={timeline}
      turningPoints={turningPoints}
      headToHead={headToHead}
      finalStretchNarrative={finalStretchNarrative}
      confidenceData={breakdowns.confidence}
      draftData={breakdowns.draft}
      onDownloadRecap={downloadRecap}
      isGeneratingRecap={isGenerating}
    />
  )
}
