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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useGame } from '../context/GameContext'
import { useScores } from '../hooks/useScores'
import { useAICompanions } from '../hooks/useAICompanions'
import { useChatReactivity } from '../hooks/useChatReactivity'
import { useSpotlight } from '../hooks/useSpotlight'
import { useChat } from '../hooks/useChat'
import { useRoomSubscription } from '../hooks/useRoom'
import { findDraftPointsForWinner } from '../lib/scoring'
import { supabase } from '../lib/supabase'
import TabBar from '../components/live/TabBar'
import HomeTab from '../components/live/HomeTab'
import BingoTab from '../components/live/BingoTab'
import ScoresTab from '../components/live/ScoresTab'
import WinnersTab from '../components/live/WinnersTab'
import MyPicksTab from '../components/live/MyPicksTab'
import WinnerAnnouncement, { type AnnouncementData } from '../components/live/WinnerAnnouncement'
import FinaleOverlay from '../components/live/FinaleOverlay'
import SpotlightNotification from '../components/spotlight/SpotlightNotification'
import BrowseSection from '../components/home/BrowseSection'
import PhaseExplainer from '../components/PhaseExplainer'
import WelcomeCard from '../components/live/WelcomeCard'
import Toast, { useToast } from '../components/ui/Toast'

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
  const [highlightFilmTitle, setHighlightFilmTitle] = useState<string | null>(null)

  const roomId = room?.id
  const isHost = player?.is_host ?? false
  const currentPlayerId = player?.id ?? ''
  const showStarted = room?.show_started ?? false

  useRoomSubscription(roomId)
  const scores = useScores(roomId)
  // Use a distinct channelKey so this subscription gets its own Supabase channel
  // instance — prevents ChatSection's removeChannel call from killing this one.
  const { messages } = useChat(roomId, 'live-badges')

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
    return set
  }, [chatBadge, bingoBadge, scoresBadge])

  const { predictionsRef } = useChatReactivity(
    roomId,
    players,
    scores.nominees,
    scores.leaderboard,
    scores.categories,
    isHost,
  )

  useAICompanions(
    scores.categories,
    scores.nominees,
    scores.confidencePicks,
    scores.draftPicks,
    scores.draftEntities,
    scores.leaderboard,
    isHost,
    predictionsRef,
    showStarted,
  )

  const {
    isSpotlightActive,
    spotlightCategoryId,
    spotlightNomineeIds,
    openSpotlight,
    closeSpotlight,
    confirmSpotlightWinner,
    confirmSpotlightTieWinner,
  } = useSpotlight()

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

  function handleFilmLinkTap(filmTitle: string) {
    setHighlightFilmTitle(filmTitle)
    selectTab(5)
  }

  // ── Pending bingo count + toast (host only) ───────────────────────────────

  const [pendingBingoCount, setPendingBingoCount] = useState(0)

  const refreshPendingCount = useCallback(async () => {
    if (!roomId) return
    const { data: cards } = await supabase
      .from('bingo_cards')
      .select('id')
      .eq('room_id', roomId)
    if (!cards?.length) { setPendingBingoCount(0); return }
    const { count } = await supabase
      .from('bingo_marks')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .in('card_id', cards.map((c) => c.id))
    setPendingBingoCount(count ?? 0)
  }, [roomId])

  useEffect(() => {
    if (!isHost || !roomId) return
    refreshPendingCount()
  }, [isHost, roomId, refreshPendingCount])

  useEffect(() => {
    if (!isHost || !roomId) return

    const channel = supabase
      .channel(`live-bingo-host:${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bingo_marks' },
        async (payload) => {
          const mark = payload.new as { card_id: string; square_index: number; status: string }
          const { data: card } = await supabase
            .from('bingo_cards')
            .select()
            .eq('id', mark.card_id)
            .eq('room_id', roomId)
            .maybeSingle()
          if (!card) return

          const markerPlayer = players.find((p) => p.id === card.player_id)
          const playerName = markerPlayer?.name ?? 'Someone'

          const squareId = card.squares[mark.square_index]
          const { data: square } = await supabase
            .from('bingo_squares')
            .select('short_text')
            .eq('id', squareId)
            .maybeSingle()
          const squareText = (square as { short_text: string } | null)?.short_text ?? 'a square'

          // Only notify the host for marks that require manual approval.
          // Auto-approved marks (objective squares, host's own card) don't
          // need the host's attention.
          if (mark.status === 'pending') {
            showToast(`${playerName} marked: ${squareText}`, 'warning')
            setPendingBingoCount((prev) => prev + 1)
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bingo_marks' },
        () => { refreshPendingCount() },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [isHost, roomId, players, showToast, refreshPendingCount])

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

  async function handleStartShow() {
    if (!room || showStarted) return
    await supabase
      .from('rooms')
      .update({ show_started: true })
      .eq('id', room.id)
    // Realtime subscription propagates the update to all clients
  }

  // ── End Ceremony ─────────────────────────────────────────────────────────

  const [isEndingCeremony, setIsEndingCeremony] = useState(false)

  async function handleEndCeremony() {
    if (!room || isEndingCeremony) return
    setIsEndingCeremony(true)
    const { error } = await supabase
      .from('rooms')
      .update({ phase: 'finished' })
      .eq('id', room.id)
    if (error) {
      // Reset flag so host can retry
      setIsEndingCeremony(false)
    }
    // Navigation handled by phase watcher below
  }

  // ── Finale overlay ────────────────────────────────────────────────────────

  const [showFinale, setShowFinale] = useState(false)

  function handleFinaleDismiss() {
    setShowFinale(false)
    navigate(`/room/${code}/results`)
  }

  // ── Phase navigation ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!room) return
    if (room.phase === 'finished') {
      // Show the finale overlay for all clients before navigating
      setShowFinale(true)
    }
  }, [room?.phase, code, navigate])

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
        className="flex flex-col bg-deep-navy"
        style={{ height: 'calc(100dvh - 1.5rem)', marginBottom: '-1.5rem' }}
      >
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
                  openSpotlight={openSpotlight}
                  closeSpotlight={closeSpotlight}
                  confirmSpotlightWinner={confirmSpotlightWinner}
                  confirmSpotlightTieWinner={confirmSpotlightTieWinner}
                  onEndCeremony={handleEndCeremony}
                  isEndingCeremony={isEndingCeremony}
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
                <div className="px-4 pb-6">
                  <WinnersTab
                    roomId={roomId}
                    isHost={isHost}
                    onEndCeremony={handleEndCeremony}
                    isEndingCeremony={isEndingCeremony}
                    openSpotlight={openSpotlight}
                    onDevAutoCompleteRunning={(running) => { suppressAnnouncementsRef.current = running }}
                  />
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
                    draftPicks={scores.draftPicks}
                    draftEntities={scores.draftEntities}
                    onSwitchToBingo={() => selectTab(1)}
                  />
                </div>
              </motion.div>
            )}

            {tab === 5 && (
              <motion.div
                key="films"
                custom={direction}
                variants={tabVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={tabTransition}
                className="absolute inset-0 overflow-y-auto"
              >
                <div className="px-4 py-6 pb-24 max-w-md mx-auto">
                  <BrowseSection
                    highlightFilmTitle={highlightFilmTitle}
                    onHighlightComplete={() => setHighlightFilmTitle(null)}
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
