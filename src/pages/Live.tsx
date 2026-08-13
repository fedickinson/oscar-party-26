/**
 * Live — the live phase dashboard (four-tab mobile shell).
 *
 * Tab 0: Bingo    (BingoTab)
 * Tab 1: Scores   (ScoresTab)
 * Tab 2: Winners  (WinnersTab)  ← host controls + all-player view
 * Tab 3: My Picks (MyPicksTab)
 *
 * TAB SWITCHING:
 *   { tab, direction } state tracks active tab and slide direction.
 *   direction = 1  → advancing (new tab is to the right; slides in from right)
 *   direction = -1 → going back (new tab is to the left; slides in from left)
 *
 * WINNER ANNOUNCEMENTS:
 *   Watches scores.categories for new winner_id values after initial load.
 *   Queues AnnouncementData objects; WinnerAnnouncement shows one at a time
 *   and auto-dismisses after 5s. Queue advances on dismiss.
 *
 * PHASE NAVIGATION:
 *   useEffect watches room?.phase. When the host advances the room phase,
 *   all players navigate to the next page at once.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useGame } from '../context/GameContext'
import { useScores } from '../hooks/useScores'
import { useAICompanions } from '../hooks/useAICompanions'
import { useChatReactivity } from '../hooks/useChatReactivity'
import { useSpotlight } from '../hooks/useSpotlight'
import { useChat } from '../hooks/useChat'
import { useRoomSubscription, usePlayersSubscription } from '../hooks/useRoom'
import { useRoomPresence } from '../hooks/useRoomPresence'
import { useOperatorHeartbeat } from '../hooks/useOperatorHeartbeat'
import { useOperatorAuthority } from '../context/OperatorAuthorityContext'
import { findDraftPointsForWinner } from '../lib/scoring'
import { deriveEngineHeartbeat, deriveNarrativeSequence, derivePresenceRows } from '../lib/operator-lens'
import { resolveRuntimeNarrativeMode } from '../lib/runtime-narrative'
import { supabase } from '../lib/supabase'
import TabBar from '../components/live/TabBar'
import WatchSyncBar from '../components/live/WatchSyncBar'
import SyncDevPanel from '../components/live/SyncDevPanel'
import HomeTab from '../components/live/HomeTab'
import BingoTab from '../components/live/BingoTab'
import ScoresTab from '../components/live/ScoresTab'
import GameMasterConsole from '../components/live/GameMasterConsole'
import WinnersTab from '../components/live/WinnersTab'
import MyPicksTab from '../components/live/MyPicksTab'
import WinnerAnnouncement, { type AnnouncementData } from '../components/live/WinnerAnnouncement'
import { AlertTriangle, Clapperboard, RefreshCw, X } from 'lucide-react'
import FinaleOverlay from '../components/live/FinaleOverlay'
import SpotlightNotification from '../components/spotlight/SpotlightNotification'
import PhaseExplainer from '../components/PhaseExplainer'
import WelcomeCard from '../components/live/WelcomeCard'
import Toast, { useToast } from '../components/ui/Toast'
import type { BeatActivationRow, SignatureBeatRow } from '../types/database'

// Entering tab slides in from direction * 100%, exits to direction * -100%
const tabVariants = {
  initial: (dir: number) => ({ x: `${dir * 100}%`, opacity: 0 }),
  animate: { x: '0%', opacity: 1 },
  exit: (dir: number) => ({ x: `${dir * -100}%`, opacity: 0 }),
}

const tabTransition = { type: 'tween', ease: 'easeInOut', duration: 0.22 } as const

export default function Live() {
  const { code } = useParams()
  const navigate = useNavigate()
  const { room, player, players } = useGame()
  const [{ tab, direction }, setTabState] = useState({ tab: 0, direction: 1 })
  const [showBingoExplainer, setShowBingoExplainer] = useState(false)

  const roomId = room?.id
  const isHost = player?.is_host ?? false
  const currentPlayerId = player?.id ?? ''
  const showStarted = room?.show_started ?? false
  const legacyLiveCastEnabled = resolveRuntimeNarrativeMode(room?.show_pack_id) === 'legacy_live_cast'
  const {
    capability: operatorCapability,
    isLoading: operatorCapabilityLoading,
    authority: refereeAuthority,
  } = useOperatorAuthority()

  // The host client is the room's engine: companion schedules, welcome queues,
  // bingo reactions all run in ITS timers. A locked phone suspends them all.
  // Ask the browser to keep the screen awake while the host is on this page;
  // re-acquire whenever the tab becomes visible again (locks release it).
  useEffect(() => {
    if (!isHost || !('wakeLock' in navigator)) return
    let lock: { release: () => Promise<void> } | null = null
    const acquire = async () => {
      try {
        lock = await (navigator as Navigator & { wakeLock: { request: (t: string) => Promise<never> } })
          .wakeLock.request('screen')
      } catch { /* denied or unsupported — reload-recovery guards still cover us */ }
    }
    void acquire()
    const onVis = () => { if (document.visibilityState === 'visible') void acquire() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      void lock?.release().catch(() => {})
    }
  }, [isHost])

  const roomSync = useRoomSubscription(roomId)
  // Players must stay live here, not just in the lobby. The watch-sync layer
  // reads per-player rows — episode_started_at, watch_group, is_remote_holder —
  // and "Alec started the New York screen" reaches the other five phones as a
  // players UPDATE. Without this subscription the roster froze at mount: the
  // start button never cleared (even for the person who pressed it), holder
  // handoffs were invisible, and a late joiner never appeared.
  const rosterSync = usePlayersSubscription(roomId)
  const scores = useScores(roomId, room?.active_settlement_id)
  // Use a distinct channelKey so this subscription gets its own Supabase channel
  // instance — prevents ChatSection's removeChannel call from killing this one.
  const {
    messages,
    isLoading: messagesLoading,
    syncError: messagesSyncError,
  } = useChat(roomId, 'live-badges')
  const presence = useRoomPresence(roomId, player)
  const heartbeat = useOperatorHeartbeat(isHost ? roomId : undefined)
  const operatorPresenceRows = useMemo(
    () => derivePresenceRows(
      players,
      presence.metas,
      presence.isSynced && !rosterSync.isLoading && rosterSync.syncError == null,
    ),
    [players, presence.metas, presence.isSynced, rosterSync.isLoading, rosterSync.syncError],
  )
  const narrativeSequence = useMemo(
    () => deriveNarrativeSequence(messages, messagesLoading || messagesSyncError != null),
    [messages, messagesLoading, messagesSyncError],
  )
  const engineHeartbeat = useMemo(
    () => deriveEngineHeartbeat(heartbeat.heartbeat, heartbeat.isLoading, heartbeat.nowMs),
    [heartbeat.heartbeat, heartbeat.isLoading, heartbeat.nowMs],
  )
  const [signatureBeats, setSignatureBeats] = useState<SignatureBeatRow[]>([])
  const [beatActivations, setBeatActivations] = useState<BeatActivationRow[]>([])

  // Beat choices are frozen before the episode starts, so the live dashboard
  // only needs one snapshot per room.
  useEffect(() => {
    if (!roomId || !room) return
    let cancelled = false
    void Promise.all([
      supabase.from('signature_beats').select().eq('show_pack_id', room.show_pack_id).order('points', { ascending: false }),
      supabase.from('beat_activations').select().eq('room_id', roomId),
    ]).then(([beatRes, activationRes]) => {
      if (cancelled) return
      setSignatureBeats((beatRes.data ?? []) as SignatureBeatRow[])
      setBeatActivations((activationRes.data ?? []) as BeatActivationRow[])
    })
    return () => { cancelled = true }
  }, [roomId, room?.show_pack_id])

  // ── Tab badge notifications ─────────────────────────────────────────────────
  //
  // Home (tab 0): unread chat messages since the player last left the Home tab.
  // Bingo (tab 1): a new bingo line was achieved by this player.
  // Scores (tab 2): the leaderboard leader changed.

  const [chatBadge, setChatBadge] = useState(false)
  const [bingoBadge, setBingoBadge] = useState(false)
  const [scoresBadge, setScoresBadge] = useState(false)

  // Chat badge: track message count when leaving Home tab
  const lastSeenMessageCountRef = useRef<number>(0)

  // Seed the ref on first message load so existing messages don't trigger a badge
  const chatSeededRef = useRef(false)
  useEffect(() => {
    if (!chatSeededRef.current && messages.length > 0) {
      lastSeenMessageCountRef.current = messages.length
      chatSeededRef.current = true
    }
  }, [messages.length])

  useEffect(() => {
    if (tab !== 0 && chatSeededRef.current && messages.length > lastSeenMessageCountRef.current) {
      setChatBadge(true)
    }
  }, [messages.length, tab])

  // Scores badge: detect lead changes
  const topPlayerId = scores.leaderboard.length > 0 ? scores.leaderboard[0].player.id : null
  const prevTopPlayerRef = useRef<string | null>(null)
  const scoresSeededRef = useRef(false)

  useEffect(() => {
    if (scores.isLoading || !topPlayerId) {
      prevTopPlayerRef.current = topPlayerId
      return
    }
    if (!scoresSeededRef.current) {
      prevTopPlayerRef.current = topPlayerId
      scoresSeededRef.current = true
      return
    }
    if (prevTopPlayerRef.current !== topPlayerId) {
      if (tab !== 2) setScoresBadge(true)
    }
    prevTopPlayerRef.current = topPlayerId
  }, [topPlayerId, scores.isLoading, tab])

  // Bingo badge: detect when current player's bingo count increases
  const myBingoCount = scores.playerBingoCounts.get(currentPlayerId) ?? 0
  const prevBingoCountRef = useRef<number>(0)
  const bingoSeededRef = useRef(false)

  useEffect(() => {
    if (scores.isLoading) return
    if (!bingoSeededRef.current) {
      prevBingoCountRef.current = myBingoCount
      bingoSeededRef.current = true
      return
    }
    if (myBingoCount > prevBingoCountRef.current) {
      if (tab !== 1) setBingoBadge(true)
    }
    prevBingoCountRef.current = myBingoCount
  }, [myBingoCount, scores.isLoading, tab])

  // Clear badges when visiting the corresponding tab
  useEffect(() => {
    if (tab === 0) {
      setChatBadge(false)
      lastSeenMessageCountRef.current = messages.length
    }
    if (tab === 1) setBingoBadge(false)
    if (tab === 2) setScoresBadge(false)
  }, [tab, messages.length])

  const tabBadges = useMemo(() => {
    const set = new Set<number>()
    if (chatBadge) set.add(0)
    if (bingoBadge) set.add(1)
    if (scoresBadge) set.add(2)
    if (isHost && !operatorCapabilityLoading && operatorCapability === null) set.add(3)
    return set
  }, [chatBadge, bingoBadge, scoresBadge, isHost, operatorCapabilityLoading, operatorCapability])

  const chatReactivity = useChatReactivity(
    roomId,
    players,
    scores.nominees,
    scores.leaderboard,
    scores.categories,
    legacyLiveCastEnabled && isHost && operatorCapability !== null,
    operatorCapability,
  )
  const { predictionsRef } = chatReactivity

  useAICompanions(
    scores.categories,
    scores.nominees,
    scores.confidencePicks,
    scores.draftPicks,
    scores.draftEntities,
    scores.leaderboard,
    legacyLiveCastEnabled && isHost && operatorCapability !== null,
    operatorCapability,
    predictionsRef,
    showStarted,
    !scores.isLoading && scores.recordError == null &&
      !roomSync.isLoading && roomSync.syncError == null &&
      !rosterSync.isLoading && rosterSync.syncError == null,
  )

  const {
    isSpotlightActive,
    spotlightCategoryId,
    spotlightNomineeIds,
    spotlightActionError,
    clearSpotlightActionError,
    openSpotlight,
    closeSpotlight,
    confirmSpotlightWinner,
    confirmSpotlightTieWinner,
  } = useSpotlight(refereeAuthority.enabled ? operatorCapability : null)

  // ── Spotlight notification + tab switch ───────────────────────────────────────

  const prevSpotlightCategoryIdRef = useRef<number | null>(null)
  const [showSpotlightNotification, setShowSpotlightNotification] = useState(false)
  const [notificationCategory, setNotificationCategory] = useState<{ name: string; tier: number } | null>(null)
  // SpotlightView only renders after the notification banner finishes — prevents
  // the banner from overlapping the SpotlightView content mid-slide-in.
  const [spotlightDisplayId, setSpotlightDisplayId] = useState<number | null>(null)

  useEffect(() => {
    const prev = prevSpotlightCategoryIdRef.current
    prevSpotlightCategoryIdRef.current = spotlightCategoryId

    if (spotlightCategoryId != null && spotlightCategoryId !== prev) {
      const cat = scores.categories.find((c) => c.id === spotlightCategoryId)
      if (cat) {
        setNotificationCategory({ name: cat.name, tier: cat.tier })
        setShowSpotlightNotification(true)
        // Clear display id so SpotlightView unmounts until notification completes
        setSpotlightDisplayId(null)
      }
    } else if (spotlightCategoryId == null && prev != null) {
      // Spotlight closed — clear display id immediately
      setSpotlightDisplayId(null)
    }
  }, [spotlightCategoryId, scores.categories])

  function handleSpotlightNotificationComplete() {
    setShowSpotlightNotification(false)
    // Now safe to show SpotlightView — notification is gone
    setSpotlightDisplayId(spotlightCategoryIdRef.current)
    selectTab(0)
  }

  // Keep a ref for the announcement guard (avoids stale closure in useEffect below)
  const spotlightCategoryIdRef = useRef(spotlightCategoryId)
  spotlightCategoryIdRef.current = spotlightCategoryId

  const { toast, showToast, dismissToast } = useToast()

  // ── Welcome card (shown once per player per room) ────────────────────────
  const welcomeSeenKey = `oscar_welcome_seen_${roomId}_${player?.id}`
  const [showWelcome, setShowWelcome] = useState(
    () => !!(roomId && player?.id) && !localStorage.getItem(`oscar_welcome_seen_${roomId}_${player?.id}`),
  )

  function handleDismissWelcome() {
    localStorage.setItem(welcomeSeenKey, '1')
    setShowWelcome(false)
  }

  // ── Bingo peek tracking ───────────────────────────────────────────────────
  const bingoPeekedKey = `oscar_bingo_peeked_${roomId}_${player?.id}`
  const [hasPeekedBingo, setHasPeekedBingo] = useState(
    () => !!localStorage.getItem(bingoPeekedKey),
  )

  function handleNavigateToBingo() {
    // Re-read from localStorage at navigation time — the lazy useState initializer
    // may have run before roomId/player were available, leaving hasPeekedBingo stale.
    const peeked = !!localStorage.getItem(bingoPeekedKey)
    if (!peeked) {
      setShowBingoExplainer(true)
    } else {
      selectTab(1)
    }
  }

  function handleBingoExplainerContinue() {
    localStorage.setItem(bingoPeekedKey, '1')
    setHasPeekedBingo(true)
    setShowBingoExplainer(false)
    selectTab(1)
  }

  // The Films tab is gone (it rendered the Oscars film encyclopedia), so a
  // film-link tap in chat has nowhere to go. Kept as a no-op rather than
  // removing the prop chain, which threads through ChatSection.
  function handleFilmLinkTap(_filmTitle: string) {}

  // ── Winner announcement queue ─────────────────────────────────────────────
  //
  // seenWinnerCategoryIds: initialized on first data load with all already-
  // announced categories. Subsequent category updates are checked against it;
  // new winners get queued. This prevents replaying history on page load.

  const [announcementQueue, setAnnouncementQueue] = useState<AnnouncementData[]>([])
  const seenWinnerCategoryIds = useRef<Set<number> | null>(null)
  // Suppressed during dev auto-complete so the rapid winner cascade doesn't flood the UI
  const suppressAnnouncementsRef = useRef(false)

  useEffect(() => {
    if (scores.isLoading) return

    if (seenWinnerCategoryIds.current === null) {
      // First load — mark all currently-announced categories as already seen
      seenWinnerCategoryIds.current = new Set(
        scores.categories
          .filter((c) => c.winner_id != null)
          .map((c) => c.id),
      )
      return
    }

    // Detect newly-announced categories
    scores.categories.forEach((cat) => {
      if (cat.winner_id == null) return
      if (seenWinnerCategoryIds.current!.has(cat.id)) return

      seenWinnerCategoryIds.current!.add(cat.id)

      // Skip announcement pop-ups during dev auto-complete
      if (suppressAnnouncementsRef.current) return

      const winner = scores.nominees.find((n) => n.id === cat.winner_id)
      if (!winner) return

      const tieWinner = cat.tie_winner_id
        ? scores.nominees.find((n) => n.id === cat.tie_winner_id)
        : null

      // Helper: check if a nominee_id matches either winner in a tie
      const isWinningPick = (nomineeId: string) =>
        nomineeId === cat.winner_id || (cat.tie_winner_id != null && nomineeId === cat.tie_winner_id)

      // Confidence impact for current player (kept for confetti/scored logic)
      const myPick = scores.confidencePicks.find(
        (p) => p.player_id === currentPlayerId && p.category_id === cat.id,
      )
      const pickedNominee = myPick
        ? scores.nominees.find((n) => n.id === myPick.nominee_id)
        : null
      const confidenceResult = myPick
        ? {
            pickedName: pickedNominee?.name ?? 'Unknown',
            confidence: myPick.confidence,
            // Use nominee_id comparison, not is_correct, because the
            // confidence_picks.is_correct DB update may not have arrived
            // via Realtime yet when this announcement fires.
            isCorrect: isWinningPick(myPick.nominee_id),
          }
        : null

      // Confidence results for all players in the room
      const allConfidenceResults = players
        .map((player) => {
          const pick = scores.confidencePicks.find(
            (p) => p.player_id === player.id && p.category_id === cat.id,
          )
          if (!pick) return null
          const pickedNom = scores.nominees.find((n) => n.id === pick.nominee_id)
          return {
            playerId: player.id,
            playerName: player.name,
            playerColor: player.color ?? '#ffffff',
            pickedName: pickedNom?.name ?? 'Unknown',
            confidence: pick.confidence,
            isCorrect: isWinningPick(pick.nominee_id),
            isCurrentPlayer: player.id === currentPlayerId,
          }
        })
        .filter(Boolean) as AnnouncementData['allConfidenceResults']

      // Draft impact
      const { playerId: draftPlayerId, points: draftPoints } = findDraftPointsForWinner(
        cat.id,
        cat.winner_id!,
        scores.categories,
        scores.nominees,
        scores.draftEntities,
        scores.draftPicks,
      )
      const draftPlayer = draftPlayerId ? players.find((p) => p.id === draftPlayerId) : null
      const draftResult = draftPlayer
        ? {
            playerName: draftPlayer.name,
            playerColor: draftPlayer.color ?? '#ffffff',
            points: draftPoints,
            isCurrentPlayer: draftPlayerId === currentPlayerId,
          }
        : null

      setAnnouncementQueue((prev) => [
        ...prev,
        {
          categoryName: cat.name,
          winnerName: winner.name,
          winnerFilm: winner.film_name ?? '',
          tieWinnerName: tieWinner?.name ?? null,
          tieWinnerFilm: tieWinner?.film_name ?? null,
          confidenceResult,
          allConfidenceResults,
          draftResult,
        },
      ])
    })
  }, [
    scores.categories,
    scores.isLoading,
    scores.nominees,
    scores.confidencePicks,
    scores.draftPicks,
    scores.draftEntities,
    currentPlayerId,
    players,
  ])

  // ── Start Show ───────────────────────────────────────────────────────────────

  // Starting the episode is TWO facts: the game goes live for everyone, and this
  // screen's clock gets an origin. The RPC does both atomically — see
  // 20260809160000_episode_clock.sql. Note the missing `showStarted` guard: the
  // second screen still needs to start ITS clock after the first screen has
  // already flipped the room live, so this stays callable.
  async function handleStartShow() {
    if (!room || !currentPlayerId) return
    if (roomSync.isLoading || roomSync.syncError != null) {
      showToast('The shared room record must synchronize before this screen can start.', 'warning')
      return
    }
    const { error } = await supabase.rpc('start_episode_for_screen_authorized', {
      p_room_id: room.id,
      p_actor_player_id: currentPlayerId,
      p_operator_capability: operatorCapability,
    })
    if (error) {
      showToast(`Could not start the episode clock: ${error.message}`, 'warning')
    }
    // Realtime subscription propagates both updates to all clients
  }

  // ── Close the live floor ─────────────────────────────────────────────────

  const [isClosingNight, setIsClosingNight] = useState(false)
  const [closeNightError, setCloseNightError] = useState<string | null>(null)

  async function handleCloseNight() {
    if (!room || !currentPlayerId || !isHost || isClosingNight) return
    if (!refereeAuthority.enabled || !operatorCapability) {
      setCloseNightError(refereeAuthority.message ?? 'Current host authority is required.')
      return
    }
    if (roomSync.isLoading || roomSync.syncError != null) {
      setCloseNightError('The shared room record must synchronize before the night can close.')
      return
    }
    if (room.phase !== 'live') {
      setCloseNightError('This room is no longer live. Reload to see its current phase.')
      return
    }

    setIsClosingNight(true)
    setCloseNightError(null)
    try {
      const { error } = await supabase.rpc('close_live_floor_authorized', {
        p_room_id: room.id,
        p_actor_player_id: currentPlayerId,
        p_operator_capability: operatorCapability,
      })
      if (error) throw new Error(error.message)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The request did not complete.'
      setCloseNightError(`Could not close the night: ${message}`)
    } finally {
      setIsClosingNight(false)
    }
    // Do not navigate here. The rooms Realtime update moves every phone through
    // the phase watcher below, preserving the shared-transition contract.
  }

  // ── Finale overlay ────────────────────────────────────────────────────────

  const [showFinale, setShowFinale] = useState(false)

  function handleFinaleDismiss() {
    setShowFinale(false)
    navigate(`/room/${code}/results`)
  }

  // ── Phase navigation ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!room || roomSync.isLoading || roomSync.syncError != null) return
    if (room.phase === 'finished' || room.phase === 'closed') {
      // The ceremony gates the ending: a device that has not witnessed it
      // goes straight to the curtain — no standings leak on the way.
      if (localStorage.getItem('ceremony_gate_v1') !== 'passed') {
        navigate(`/room/${code}/results`)
        return
      }
      // Witnessed devices get the finale overlay before the ledger.
      setShowFinale(true)
    }
  }, [room?.phase, roomSync.isLoading, roomSync.syncError, code, navigate])

  function selectTab(next: number) {
    setTabState((prev) => ({
      tab: next,
      direction: next > prev.tab ? 1 : -1,
    }))
  }

  return (
    <>
      {showBingoExplainer && (
        <PhaseExplainer phase="bingo" onContinue={handleBingoExplainerContinue} />
      )}
      <div
        className="flex flex-col bg-ground"
        style={{ height: 'calc(100dvh - 1.5rem)', marginBottom: '-1.5rem' }}
      >
        {roomSync.syncError && (
          <div className="mx-3 mt-2 flex min-h-11 flex-shrink-0 items-center gap-2 rounded-xl border border-[var(--t-pending)] bg-[var(--t-pending-soft)] px-3 py-2">
            <AlertTriangle size={15} className="flex-shrink-0 text-[var(--t-pending)]" />
            <p className="min-w-0 flex-1 text-xs text-[var(--t-text-muted)]">
              Shared phase updates are paused on this phone.
            </p>
            <button
              type="button"
              onClick={roomSync.retrySync}
              className="inline-flex min-h-11 flex-shrink-0 items-center gap-1.5 text-xs font-semibold text-[var(--t-pending)]"
            >
              <RefreshCw size={13} />
              Retry
            </button>
          </div>
        )}

        {rosterSync.syncError && (
          <div className="mx-3 mt-2 flex min-h-11 flex-shrink-0 items-center gap-2 rounded-xl border border-[var(--t-pending)] bg-[var(--t-pending-soft)] px-3 py-2">
            <AlertTriangle size={15} className="flex-shrink-0 text-[var(--t-pending)]" />
            <p className="min-w-0 flex-1 text-xs text-[var(--t-text-muted)]">
              Player updates are paused on this phone.
            </p>
            <button
              type="button"
              onClick={rosterSync.retrySync}
              className="inline-flex min-h-11 flex-shrink-0 items-center gap-1.5 text-xs font-semibold text-[var(--t-pending)]"
            >
              <RefreshCw size={13} />
              Retry
            </button>
          </div>
        )}

        {isHost && spotlightActionError && (
          <div className="mx-3 mt-2 flex min-h-11 flex-shrink-0 items-center gap-2 rounded-xl border border-[var(--t-pending)] bg-[var(--t-pending-soft)] px-3 py-2" role="alert">
            <AlertTriangle size={15} className="flex-shrink-0 text-[var(--t-pending)]" aria-hidden />
            <p className="min-w-0 flex-1 text-xs text-[var(--t-text-muted)]">
              {spotlightActionError}
            </p>
            <button
              type="button"
              onClick={clearSpotlightActionError}
              className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-[var(--t-pending)]"
              aria-label="Dismiss spotlight error"
            >
              <X size={15} aria-hidden />
            </button>
          </div>
        )}

        {isHost && chatReactivity.syncError && (
          <div className="mx-3 mt-2 flex min-h-11 flex-shrink-0 items-center gap-2 rounded-xl border border-[var(--t-pending)] bg-[var(--t-pending-soft)] px-3 py-2">
            <AlertTriangle size={15} className="flex-shrink-0 text-[var(--t-pending)]" />
            <p className="min-w-0 flex-1 text-xs text-[var(--t-text-muted)]">
              AI chat reactions are paused on this host phone.
            </p>
            <button
              type="button"
              onClick={chatReactivity.retrySync}
              className="inline-flex min-h-11 flex-shrink-0 items-center gap-1.5 text-xs font-semibold text-[var(--t-pending)]"
            >
              <RefreshCw size={13} />
              Retry
            </button>
          </div>
        )}

        {/* Sync bar — always visible above the tabs. Two playbacks (one screen
            in New York, one remote) drift apart over 75 minutes, and the room
            reacting to something the remote viewer has not seen is the failure
            mode this whole thing exists to prevent. */}
        {/* Hidden on the Bingo tab: the card needs every vertical pixel, and
            the big pre-show start button was sitting on top of it. Sync
            controls stay one tab-tap away. */}
        {/* Watch-sync DISABLED mid-party (user call): the room runs as one
            conversation, not two tracked playbacks. Remount WatchSyncBar here
            to re-enable — the hook, RPCs and bar all still work. */}

        {/* Scrollable tab content */}
        <div className="flex-1 overflow-hidden relative">
          <AnimatePresence initial={false} custom={direction}>
            {tab === 0 && (
              <motion.div
                key="home"
                custom={direction}
                variants={tabVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={tabTransition}
                className="absolute inset-0 overflow-hidden"
              >
                <HomeTab
                  categories={scores.categories}
                  nominees={scores.nominees}
                  confidencePicks={scores.confidencePicks}
                  draftPicks={scores.draftPicks}
                  draftEntities={scores.draftEntities}
                  leaderboard={scores.leaderboard}
                  onNavigateToWinnersTab={() => selectTab(3)}
                  onNavigateToBingo={handleNavigateToBingo}
                  showStarted={showStarted}
                  onStartShow={handleStartShow}
                  spotlightCategoryId={spotlightDisplayId}
                  spotlightNomineeIds={spotlightNomineeIds}
                  isHost={isHost}
                  refereeEnabled={refereeAuthority.enabled}
                  openSpotlight={openSpotlight}
                  closeSpotlight={closeSpotlight}
                  confirmSpotlightWinner={confirmSpotlightWinner}
                  confirmSpotlightTieWinner={confirmSpotlightTieWinner}
                  onFilmLinkTap={handleFilmLinkTap}
                />
              </motion.div>
            )}

            {tab === 1 && roomId && (
              <motion.div
                key="bingo"
                custom={direction}
                variants={tabVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={tabTransition}
                className="absolute inset-0 overflow-y-auto"
              >
                <div className="px-4 pb-6">
                  <BingoTab
                    roomId={roomId}
                    isHost={isHost}
                    categories={scores.categories}
                    nominees={scores.nominees}
                    leaderboard={scores.leaderboard}
                    onShowExplainer={() => setShowBingoExplainer(true)}
                    onSquareApproved={(text) => showToast(`Approved: ${text}`, 'success')}
                  />
                </div>
              </motion.div>
            )}

            {tab === 2 && (
              <motion.div
                key="scores"
                custom={direction}
                variants={tabVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={tabTransition}
                className="absolute inset-0 overflow-y-auto"
              >
                <div className="px-4 pb-6">
                  <ScoresTab
                    leaderboard={scores.leaderboard}
                    activityFeed={scores.activityFeed}
                    currentPlayerId={currentPlayerId}
                    categories={scores.categories}
                    nominees={scores.nominees}
                    confidencePicks={scores.confidencePicks}
                    draftPicks={scores.draftPicks}
                    draftEntities={scores.draftEntities}
                    gameModel={room?.game_model ?? 'legacy_ensemble'}
                  />
                </div>
              </motion.div>
            )}

            {tab === 3 && roomId && (
              <motion.div
                key="winners"
                custom={direction}
                variants={tabVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={tabTransition}
                className="absolute inset-0 overflow-y-auto"
              >
                <div className="pb-6">
                  {room?.game_model === 'conviction_portfolio' ? (
                    <GameMasterConsole
                      roomId={roomId}
                      isHost={isHost}
                      operatorCapability={operatorCapability}
                      operatorCapabilityLoading={operatorCapabilityLoading}
                      myRosterNames={scores.draftPicks
                        .filter((dp) => dp.player_id === currentPlayerId)
                        .map((dp) => scores.draftEntities.find((e) => e.id === dp.entity_id)?.name)
                        .filter((n): n is string => !!n)}
                      onCloseNight={handleCloseNight}
                      isClosingNight={isClosingNight}
                      closeNightError={closeNightError}
                      operatorPresenceRows={operatorPresenceRows}
                      narrativeSequence={narrativeSequence}
                      engineHeartbeat={engineHeartbeat}
                      heartbeatError={heartbeat.error}
                    />
                  ) : (
                    <div className="px-4">
                      <WinnersTab
                        roomId={roomId}
                        isHost={isHost}
                        onCloseNight={handleCloseNight}
                        isClosingNight={isClosingNight}
                        closeNightError={closeNightError}
                        refereeEnabled={refereeAuthority.enabled}
                        refereeAuthorityMessage={refereeAuthority.message}
                        operatorCapability={refereeAuthority.enabled ? operatorCapability : null}
                        openSpotlight={openSpotlight}
                      />
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {tab === 4 && (
              <motion.div
                key="my-picks"
                custom={direction}
                variants={tabVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={tabTransition}
                className="absolute inset-0 overflow-y-auto"
              >
                <div className="px-4 pb-6">
                  <MyPicksTab
                    currentPlayerId={currentPlayerId}
                    leaderboard={scores.leaderboard}
                    categories={scores.categories}
                    nominees={scores.nominees}
                    confidencePicks={scores.confidencePicks}
                    convictionPicks={scores.convictionPicks}
                    gameModel={room?.game_model ?? 'legacy_ensemble'}
                    draftPicks={scores.draftPicks}
                    draftEntities={scores.draftEntities}
                    players={players}
                    signatureBeats={signatureBeats}
                    beatActivations={beatActivations}
                    onSwitchToBingo={() => selectTab(1)}
                  />
                </div>
              </motion.div>
            )}


          </AnimatePresence>
        </div>

        {/* Bottom tab bar */}
        <TabBar
          activeTab={tab}
          onSelect={(next) => next === 1 ? handleNavigateToBingo() : selectTab(next)}
          badges={tabBadges}
          isHost={isHost}
        />
      </div>

      {/* Spotlight notification — slides in on any tab when spotlight opens */}
      <AnimatePresence>
        {showSpotlightNotification && notificationCategory && (
          <SpotlightNotification
            key={`spotlight-notif-${spotlightCategoryId}`}
            categoryName={notificationCategory.name}
            tier={notificationCategory.tier}
            onComplete={handleSpotlightNotificationComplete}
          />
        )}
      </AnimatePresence>

      {/* Finale overlay — shown for ALL clients when ceremony ends */}
      <AnimatePresence>
        {showFinale && (
          <FinaleOverlay
            leaderboard={scores.leaderboard}
            totalCategories={scores.categories.length}
            onDismiss={handleFinaleDismiss}
          />
        )}
      </AnimatePresence>

      {/* Winner announcements — shown on top of spotlight */}
      <AnimatePresence>
        {announcementQueue[0] && (
          <WinnerAnnouncement
            key={`${announcementQueue[0].categoryName}-${announcementQueue[0].winnerName}`}
            announcement={announcementQueue[0]}
            onDismiss={() => setAnnouncementQueue((q) => q.slice(1))}
          />
        )}
      </AnimatePresence>

      <Toast toast={toast} onDismiss={dismissToast} />

      {/* Welcome orientation card — shown once on first visit */}
      <AnimatePresence>
        {showWelcome && (
          <WelcomeCard onDismiss={handleDismissWelcome} />
        )}
      </AnimatePresence>
    </>
  )
}
