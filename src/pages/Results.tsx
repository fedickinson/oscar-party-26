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

import { useEffect, useMemo, useRef, useState } from 'react'
import { Clapperboard } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import { useRoomSubscription } from '../hooks/useRoom'
import { useScores } from '../hooks/useScores'
import { useRecap } from '../hooks/useRecap'
import { useShareResults } from '../hooks/useShareResults'
import { useBingo } from '../hooks/useBingo'
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
import { computeNightAwards } from '../lib/night-awards'
import { usePlayerVerdicts } from '../hooks/usePlayerVerdicts'
import PostCeremonyView from '../components/home/PostCeremonyView'
import { Hallmark } from '../components/ui/Hallmarks'

export default function Results() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { room, player, players, loading } = useGame()

  useRoomSubscription(room?.id)

  const scores = useScores(room?.id)

  const [gateDismissed, setGateDismissed] = useState(() => {
    if (new URLSearchParams(window.location.search).get('gate') === 'reset') {
      localStorage.removeItem('ceremony_gate_v1')
      return false
    }
    return localStorage.getItem('ceremony_gate_v1') === 'passed'
  })
  const gated = !gateDismissed

  const bingo = useBingo(room?.id, scores.categories, scores.nominees)

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
            model: 'claude-sonnet-5',
            max_tokens: 400,
            // Thinking off for the same reason as the other two callers: on
            // Sonnet 5 max_tokens caps thinking + text together.
            thinking: { type: 'disabled' },
            output_config: { effort: 'low' },
            system: [
              {
                type: 'text',
                text: prompt.system,
                cache_control: { type: 'ephemeral', ttl: '1h' },
              },
            ],
            messages: [{ role: 'user', content: prompt.user }],
          }),
        })

        if (!response.ok) return
        const data = await response.json()
        const blocks = (data?.content ?? []) as Array<{ type?: string; text?: string }>
        const raw = (blocks.find((b) => b.type === 'text')?.text ?? '') as string
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

  // ── The Reckoning ──────────────────────────────────────────────────────────
  //
  // Titles and character awards are pure and cheap, so they are computed here
  // and rendered immediately. The written verdicts are fetched/generated
  // separately and layered on when (if) they arrive.

  const awards = useMemo(
    () =>
      computeNightAwards(
        scores.leaderboard,
        players,
        scores.categories,
        scores.nominees,
        scores.draftEntities,
        scores.draftPicks,
        scores.confidencePicks,
        timeline,
      ),
    [
      scores.leaderboard,
      players,
      scores.categories,
      scores.nominees,
      scores.draftEntities,
      scores.draftPicks,
      scores.confidencePicks,
      timeline,
    ],
  )

  const { verdicts } = usePlayerVerdicts({
    roomId: room?.id,
    isHost,
    playerAwards: awards.playerAwards,
    leaderboard: scores.leaderboard,
    players,
    ready: !scores.isLoading && scores.leaderboard.length > 0,
  })

  const { shareResults, sharePlayerCard, isCopied } = useShareResults()

  const { downloadRecap, isGenerating } = useRecap({
    roomId: room?.id,
    roomCode: room?.code,
    leaderboard: scores.leaderboard,
    categories: scores.categories,
    nominees: scores.nominees,
    confidencePicks: scores.confidencePicks,
    draftPicks: scores.draftPicks,
    draftEntities: scores.draftEntities,
    players,
    playerBingoCounts: scores.playerBingoCounts,
    playerAwards: awards.playerAwards,
    characterAwards: awards.characterAwards,
    verdicts,
  })

  if (loading || scores.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!room || !player) return null

  // ── The liminal passage ────────────────────────────────────────────────────
  // The ceremony is the ending; the ledger is the appendix. First arrival gets
  // the gate — the standings stay veiled until the ceremony has been entered
  // (or deliberately declined). One flag, per device.
  if (gated) {
    // The gate IS the ceremony's closed curtain — same velvet, same seam,
    // same type. Passing through should feel like the same doorway.
    return (
      <div
        className="fixed inset-0 z-[60] flex flex-col items-center justify-center px-8 text-center"
        style={{
          background: [
            'repeating-linear-gradient(90deg, rgba(126,44,34,.52) 0 13px, rgba(34,11,10,.74) 13px 38px, rgba(88,30,24,.44) 38px 51px, rgba(24,8,8,.80) 51px 74px)',
            'linear-gradient(180deg,#2b100c 0%,#1a0908 55%,#120606 100%)',
          ].join(','),
        }}
      >
        {/* the seam where the curtain will part */}
        <div
          className="absolute inset-y-0 left-1/2 w-[3px] -translate-x-1/2 pointer-events-none"
          style={{ borderLeft: '3px double rgba(185,134,63,.5)' }}
        />
        <div
          className="relative rounded-2xl px-7 py-9 flex flex-col items-center"
          style={{
            background: 'rgba(7,6,9,.58)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: '1px solid rgba(226,213,185,.10)',
          }}
        >
          <Hallmark id="hallmark-dance" size={56} className="text-[#b9863f]" />
          <p
            className="mt-5 text-[11px] uppercase text-[#b9863f]"
            style={{ fontFamily: '"SF Mono",Menlo,Consolas,monospace', letterSpacing: '0.4em' }}
          >
            The record is sealed
          </p>
          <h1
            className="mt-3 text-[34px] font-bold leading-tight text-[#f0e5cb]"
            style={{ fontFamily: '"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif' }}
          >
            The Night<br />of the Dance
          </h1>
          <p
            className="mt-3 text-[15px] italic max-w-[28ch] leading-relaxed text-[#cdbc98]"
            style={{ fontFamily: '"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif' }}
          >
            The ceremony must be witnessed before the ledger opens.
          </p>
          <a
            href="/ceremony.html"
            onClick={() => localStorage.setItem('ceremony_gate_v1', 'passed')}
            className="mt-8 flex items-center justify-center gap-2.5 rounded-full px-8 min-h-[52px] text-[13px] font-semibold uppercase text-[#b9863f]"
            style={{
              fontFamily: '"SF Mono",Menlo,Consolas,monospace',
              letterSpacing: '0.16em',
              border: '1px solid #b9863f',
              background: 'rgba(185,134,63,.10)',
            }}
          >
            Enter the Ceremony
          </a>
          <button
            onClick={() => { localStorage.setItem('ceremony_gate_v1', 'passed'); setGateDismissed(true) }}
            className="mt-5 text-[11px] min-h-[44px] text-[#cdbc98]/60 underline underline-offset-4"
            style={{ fontFamily: '"SF Mono",Menlo,Consolas,monospace', letterSpacing: '0.08em' }}
          >
            I have witnessed it — open the standings
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="max-w-md mx-auto px-4 pt-6">
        <a
          href="/ceremony.html"
          className="block rounded-2xl border-2 border-oscar-gold/50 bg-white/5 backdrop-blur-lg p-5 shadow-lg"
        >
          <div className="font-mono text-[10px] tracking-[0.3em] uppercase text-oscar-gold/70">
            The morning after
          </div>
          <div className="mt-1 text-xl font-bold text-white">
            The Ceremony has been written
          </div>
          <p className="mt-1.5 text-sm text-white/60 leading-relaxed">
            The true record of the finale — every beat adjudicated, the cast's
            verdicts, and your own card waiting at the end.
          </p>
          <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-oscar-gold/60 px-4 py-2.5 font-semibold text-oscar-gold">
            <Clapperboard size={18} />
            Enter the Ceremony
          </div>
        </a>
      </div>

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
      onShareResults={() => shareResults(scores.leaderboard, players, room.code)}
      isCopied={isCopied}
      bingoSquares={bingo.squares}
      bingoMarks={bingo.marks}
      bingoLines={bingo.bingoLines}
      playerAwards={awards.playerAwards}
      characterAwards={awards.characterAwards}
      verdicts={verdicts}
      currentPlayerId={player.id}
      roomCode={room.code}
      onSharePlayerCard={(playerId) => {
        const award = awards.playerAwards.find((a) => a.playerId === playerId)
        if (!award || !room) return
        sharePlayerCard(
          award,
          scores.leaderboard.find((e) => e.player.id === playerId),
          verdicts.get(playerId),
          room.code,
        )
      }}
    />
    </>
  )
}
