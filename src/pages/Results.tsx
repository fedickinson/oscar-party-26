/**
 * Results — standings page (provisional at finished, researched at closed).
 *
 * Reached when the room phase becomes finished or closed. All players navigate
 * here simultaneously via Realtime; the active settlement selects the record.
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

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Clapperboard, RefreshCw } from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { useGame } from '../context/GameContext'
import { usePlayersSubscription, useRoomSubscription } from '../hooks/useRoom'
import { useScores } from '../hooks/useScores'
import { useRecap } from '../hooks/useRecap'
import { useShareResults } from '../hooks/useShareResults'
import { checkBingo, FREE_CENTER_INDEX } from '../lib/bingo-utils'
import {
  computeScoreTimeline,
  identifyTurningPoints,
  identifyHeadToHead,
  describeFinalStretch,
  computeBreakdownTimeline,
} from '../lib/timeline-utils'
import { computeNightAwards } from '../lib/night-awards'
import { usePlayerVerdicts } from '../hooks/usePlayerVerdicts'
import { usePostShowCompanions } from '../hooks/usePostShowCompanions'
import { useOperatorAuthority } from '../context/OperatorAuthorityContext'
import PostCeremonyView from '../components/home/PostCeremonyView'
import { Hallmark } from '../components/ui/Hallmarks'
import { resolveRuntimeNarrativeMode } from '../lib/runtime-narrative'

export default function Results() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { room, player, players, loading } = useGame()
  const { capability: operatorCapability } = useOperatorAuthority()

  const roomSync = useRoomSubscription(room?.id)
  const rosterSync = usePlayersSubscription(room?.id)

  const scores = useScores(room?.id, room?.active_settlement_id)

  const [gateDismissed, setGateDismissed] = useState(() => {
    if (new URLSearchParams(window.location.search).get('gate') === 'reset') {
      localStorage.removeItem('ceremony_gate_v1')
      return false
    }
    return localStorage.getItem('ceremony_gate_v1') === 'passed'
  })
  // `finished` is the live, provisional ledger and opens immediately. Only a
  // researched `closed` room owns the ceremony gate and its sealed-record copy.
  const gated = room?.phase === 'closed' && !gateDismissed

  const bingo = useMemo(() => {
    const card = scores.bingoCards.find((row) => row.player_id === player?.id) ?? null
    if (!card) return { squares: [], marks: [], bingoLines: [] }

    const squareById = new Map(scores.bingoSquares.map((square) => [square.id, square]))
    const squares = card.squares.map((id) => id === 0 ? null : (squareById.get(id) ?? null))
    const marks = scores.bingoMarks.filter((mark) => mark.card_id === card.id)
    const markedIndices = new Set<number>([FREE_CENTER_INDEX])
    marks.filter((mark) => mark.status === 'approved')
      .forEach((mark) => markedIndices.add(mark.square_index))

    return { squares, marks, bingoLines: checkBingo(markedIndices, []).lines }
  }, [player?.id, scores.bingoCards, scores.bingoMarks, scores.bingoSquares])

  useEffect(() => {
    if (!loading && !player) navigate('/')
  }, [loading, player, navigate])

  const isHost = player?.is_host ?? false
  const legacyLiveCastEnabled = resolveRuntimeNarrativeMode(room?.show_pack_id) === 'legacy_live_cast'
  const browserGroundingAuthorized = legacyLiveCastEnabled && isHost && operatorCapability !== null
  usePostShowCompanions({
    roomId: room?.id,
    hostPlayerId: room?.host_id,
    isHost: browserGroundingAuthorized,
    operatorCapability,
    ready: !roomSync.isLoading && roomSync.syncError == null &&
      !rosterSync.isLoading && rosterSync.syncError == null &&
      !scores.isLoading && scores.recordError == null && scores.leaderboard.length > 0,
    provisional: room?.phase === 'finished' && scores.recordSource === 'live',
    leaderboard: scores.leaderboard,
    players,
    categories: scores.categories,
    confidencePicks: scores.confidencePicks,
  })

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
        scores.convictionPicks,
        room?.game_model ?? 'legacy_ensemble',
      ),
    [scores.categories, scores.confidencePicks, scores.draftPicks, scores.draftEntities, scores.nominees, scores.convictionPicks, players, room?.game_model],
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
        scores.convictionPicks,
        room?.game_model ?? 'legacy_ensemble',
      ),
    [timeline, players, scores.categories, scores.confidencePicks, scores.draftPicks, scores.draftEntities, scores.nominees, scores.convictionPicks, room?.game_model],
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
        room?.game_model ?? 'legacy_ensemble',
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
      room?.game_model,
    ],
  )

  const { verdicts } = usePlayerVerdicts({
    roomId: room?.id,
    hostPlayerId: player?.id,
    isHost: browserGroundingAuthorized,
    operatorCapability,
    playerAwards: awards.playerAwards,
    leaderboard: scores.leaderboard,
    players,
    ready: !roomSync.isLoading && roomSync.syncError == null &&
      !rosterSync.isLoading && rosterSync.syncError == null &&
      !scores.isLoading && scores.recordError == null && scores.leaderboard.length > 0,
    recordSource: scores.recordSource,
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

  if (loading || roomSync.isLoading || rosterSync.isLoading || scores.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (roomSync.syncError) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md items-center px-4">
        <section className="material-stone relief-inset w-full rounded-2xl p-4" role="alert">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--t-pending)]" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-display text-xs uppercase tracking-widest text-[var(--t-pending)]">
                Room record unavailable
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--t-text-muted)]">
                The provisional or settled record cannot be chosen safely until the shared room row is current.
              </p>
              <button
                type="button"
                onClick={roomSync.retrySync}
                className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--t-line)] bg-[var(--t-surface)] px-4 text-sm font-bold text-[var(--t-text)]"
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
                Retry room synchronization
              </button>
            </div>
          </div>
        </section>
      </div>
    )
  }

  if (rosterSync.syncError) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md items-center px-4">
        <section className="material-stone relief-inset w-full rounded-2xl p-4" role="alert">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--t-pending)]" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-display text-xs uppercase tracking-widest text-[var(--t-pending)]">
                Player roster unavailable
              </p>
              <p className="mt-2 text-sm leading-relaxed text-[var(--t-text-muted)]">
                Final keepsakes and farewells wait until the complete room roster is current.
              </p>
              <button
                type="button"
                onClick={rosterSync.retrySync}
                className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--t-line)] bg-[var(--t-surface)] px-4 text-sm font-bold text-[var(--t-text)]"
              >
                <RefreshCw className="h-4 w-4" aria-hidden />
                Retry roster synchronization
              </button>
            </div>
          </div>
        </section>
      </div>
    )
  }

  if (scores.recordError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-8 text-center">
        <p className="text-base font-semibold text-white">The record could not be opened</p>
        <p className="text-sm text-white/45 mt-2">{scores.recordError}</p>
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
            The researched record is sealed
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
      {scores.recordSource === 'settled' ? (
        <div className="max-w-md mx-auto px-4 pt-6">
          <a
            href="/ceremony.html"
            className="flex items-center gap-3 rounded-2xl border border-oscar-gold/40 bg-white/5 backdrop-blur-lg px-4 py-3 shadow-lg"
          >
            <Clapperboard size={18} className="text-oscar-gold flex-shrink-0" />
            <span className="font-semibold text-oscar-gold">The Ceremony</span>
            <span className="ml-auto text-xs text-white/40">rewatch &rsaquo;</span>
          </a>
        </div>
      ) : (
        <div className="max-w-md mx-auto px-4 pt-6">
          <div
            className="material-stone relief-inset rounded-2xl border p-4"
            style={{ borderColor: 'var(--t-pending)' }}
          >
            <p className="text-xs font-bold uppercase tracking-widest text-[color:var(--t-pending)]">
              Live record · provisional
            </p>
            <p className="mt-1 text-sm leading-relaxed text-[color:var(--t-text-muted)]">
              The live floor is closed. Research can still amend these standings
              before settlement publishes the record.
            </p>
          </div>
        </div>
      )}

      <PostCeremonyView
      recordSource={scores.recordSource}
      leaderboard={scores.leaderboard}
      players={players}
      timeline={timeline}
      turningPoints={turningPoints}
      headToHead={headToHead}
      finalStretchNarrative={finalStretchNarrative}
      confidenceData={breakdowns.confidence}
      draftData={breakdowns.draft}
      gameModel={room.game_model ?? 'legacy_ensemble'}
      onDownloadRecap={scores.recordSource === 'settled' ? downloadRecap : undefined}
      isGeneratingRecap={isGenerating}
      onShareResults={scores.recordSource === 'settled'
        ? () => shareResults(scores.leaderboard, players, room.code)
        : undefined}
      isCopied={isCopied}
      bingoSquares={bingo.squares}
      bingoMarks={bingo.marks}
      bingoLines={bingo.bingoLines}
      playerAwards={awards.playerAwards}
      characterAwards={awards.characterAwards}
      verdicts={verdicts}
      currentPlayerId={player.id}
      roomCode={scores.recordSource === 'settled' ? room.code : undefined}
      onSharePlayerCard={scores.recordSource === 'settled'
        ? (playerId) => {
            const award = awards.playerAwards.find((a) => a.playerId === playerId)
            if (!award || !room) return
            sharePlayerCard(
              award,
              scores.leaderboard.find((e) => e.player.id === playerId),
              verdicts.get(playerId),
              room.code,
            )
          }
        : undefined}
    />
    </>
  )
}
