/**
 * HomeTab — routes to PreCeremonyView, LiveHomeView, or SpotlightView.
 *
 * Routing:
 *   active spotlight  → SpotlightView (replaces entire home content)
 *   any winner exists → LiveHomeView
 *   pre-ceremony      → PreCeremonyView
 *
 * SpotlightView gets assembled nomineeData built here from scores props + players.
 */

import type React from 'react'
import { useEffect, useRef } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useGame } from '../../context/GameContext'

import PreCeremonyView from '../home/PreCeremonyView'
import LiveHomeView from '../home/LiveHomeView'
import ChatSection from '../home/ChatSection'
import SpotlightView, { type SpotlightNomineeData } from '../spotlight/SpotlightView'
import type {
  CategoryRow,
  ConfidencePickRow,
  DraftPickRow,
  DraftEntityRow,
  NomineeRow,
} from '../../types/database'
import { findDraftPointsForWinner, type ScoredPlayer } from '../../lib/scoring'

/**
 * How long entry lasts before the column is left to the viewer.
 *
 * Long enough to outlast the chat ledger's 5s post-subscribe reconciliation
 * (`CHAT_REALTIME_STABILIZATION_MS` in useChat): that re-fetch publishes a new
 * transcript, the chat re-anchors, and without this the column jumped to 65px
 * six seconds after a silent arrival. Any real gesture ends it immediately, so
 * the only thing this window holds off is a programmatic scroll.
 */
const ENTRY_SETTLE_MS = 7000

/** Any of these means a person is driving the column now, not a layout effect. */
const VIEWER_INPUT_EVENTS = ['pointerdown', 'touchstart', 'wheel', 'keydown'] as const

/** The tab's own scroll column: the first scroller on the way down, not the chat list inside it. */
function findOuterScroller(root: HTMLElement): HTMLElement | null {
  const queue: Element[] = [...root.children]
  while (queue.length > 0) {
    const element = queue.shift()!
    if (!(element instanceof HTMLElement)) continue
    const overflowY = getComputedStyle(element).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll') return element
    queue.push(...element.children)
  }
  return null
}

interface Props {
  categories: CategoryRow[]
  nominees: NomineeRow[]
  confidencePicks: ConfidencePickRow[]
  draftPicks: DraftPickRow[]
  draftEntities: DraftEntityRow[]
  leaderboard: ScoredPlayer[]
  onNavigateToWinnersTab: () => void
  onNavigateToBingo: () => void
  showStarted: boolean
  onStartShow: () => Promise<void>
  // Spotlight
  spotlightCategoryId: number | null
  spotlightNomineeIds: string[]
  isHost: boolean
  refereeEnabled: boolean
  openSpotlight: (categoryId: number) => Promise<void>
  closeSpotlight: () => Promise<void>
  confirmSpotlightWinner: (nomineeId: string) => Promise<void>
  confirmSpotlightTieWinner: (nomineeId1: string, nomineeId2: string) => Promise<void>
  // Film encyclopedia link
  onFilmLinkTap?: (filmTitle: string) => void
}

export default function HomeTab({
  categories,
  nominees,
  confidencePicks,
  draftPicks,
  draftEntities,
  leaderboard,
  onNavigateToWinnersTab,
  onNavigateToBingo,
  showStarted,
  onStartShow,
  spotlightCategoryId,
  spotlightNomineeIds,
  isHost,
  refereeEnabled,
  openSpotlight,
  closeSpotlight,
  confirmSpotlightWinner,
  confirmSpotlightTieWinner,
  onFilmLinkTap,
}: Props) {
  const { player } = useGame()
  const currentPlayerId = player?.id ?? ''

  // ── Spotlight mode ────────────────────────────────────────────────────────────

  const spotlightCategory = spotlightCategoryId != null
    ? categories.find((c) => c.id === spotlightCategoryId)
    : undefined

  let spotlightContent: React.ReactNode = null
  if (spotlightCategory) {
    const spotlightNominees = nominees.filter((n) => spotlightNomineeIds.includes(n.id))

    const nomineeData: SpotlightNomineeData[] = spotlightNominees.map((nominee) => {
      const myPick = confidencePicks.find(
        (cp) =>
          cp.player_id === currentPlayerId &&
          cp.category_id === spotlightCategoryId &&
          cp.nominee_id === nominee.id,
      )
      const draftResult = findDraftPointsForWinner(
        spotlightCategory.id,
        nominee.id,
        categories,
        nominees,
        draftEntities,
        draftPicks,
      )
      const myDraftPick = draftResult.playerId === currentPlayerId

      return { nominee, myConfidence: myPick?.confidence ?? null, myDraftPick }
    })

    spotlightContent = (
      <SpotlightView
        category={spotlightCategory}
        nomineeData={nomineeData}
        isHost={isHost && refereeEnabled}
        onSelectWinner={confirmSpotlightWinner}
        onSelectTieWinner={confirmSpotlightTieWinner}
        onClose={closeSpotlight}
        chatSection={<ChatSection fill onFilmLinkTap={onFilmLinkTap} />}
      />
    )
  }

  // ── Normal mode ───────────────────────────────────────────────────────────────

  const hasAnyWinner = categories.some((c) => c.winner_id != null)
  const viewKey = spotlightContent ? `spotlight-${spotlightCategoryId}` : (showStarted || hasAnyWinner) ? 'live' : 'pre'

  // Spotlight gets a dramatic reveal; normal tab switches are subtle fades
  const isSpotlight = !!spotlightContent

  // ── Reset-on-entry ────────────────────────────────────────────────────────
  //
  // The Home tab was arriving about 65px down its own column, slicing the
  // pre-show heading in half. Nothing on this screen asks for that: the chat
  // panel anchors itself to its newest line with `scrollIntoView`, and that
  // walks every scrollable ancestor, including this tab's column. It fires
  // again on each chat hydration pass, so a single reset at mount does not
  // hold. The mobile grammar's rule is that scroll position resets on entry,
  // and entry is the settle after mount, not one frame of it.
  //
  // So the column is pinned to the top for the entry window and released the
  // moment the viewer touches the screen — this never fights a real gesture,
  // and it stops on its own. Only the outermost scroller inside this tab is
  // touched; the chat's own list is nested below it and keeps the position it
  // chose. The lasting fix belongs where the anchor is, in the chat panel,
  // which should scroll its own list rather than every ancestor it has.
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = contentRef.current
    if (!root) return

    const column = findOuterScroller(root)
    if (!column) return

    let released = false
    const release = () => {
      if (released) return
      released = true
      window.clearTimeout(timer)
      column.removeEventListener('scroll', pinToTop)
      for (const event of VIEWER_INPUT_EVENTS) root.removeEventListener(event, release)
    }
    function pinToTop() {
      if (released) return
      if (column!.scrollTop !== 0) column!.scrollTop = 0
    }

    const timer = window.setTimeout(release, ENTRY_SETTLE_MS)
    column.addEventListener('scroll', pinToTop)
    for (const event of VIEWER_INPUT_EVENTS) {
      root.addEventListener(event, release, { passive: true })
    }
    pinToTop()

    return release
  }, [viewKey])

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        ref={contentRef}
        key={viewKey}
        initial={isSpotlight ? { opacity: 0, y: 28, scale: 0.97 } : { opacity: 0 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={isSpotlight ? { opacity: 0, y: -12, scale: 0.98 } : { opacity: 0 }}
        transition={
          isSpotlight
            ? { type: 'spring', stiffness: 280, damping: 26, mass: 0.9 }
            : { duration: 0.18, ease: 'easeInOut' }
        }
        className="h-full"
      >
        {spotlightContent ?? (
          (showStarted || hasAnyWinner) ? (
            <LiveHomeView
              categories={categories}
              nominees={nominees}
              confidencePicks={confidencePicks}
              draftPicks={draftPicks}
              draftEntities={draftEntities}
              leaderboard={leaderboard}
              isHost={isHost && refereeEnabled}
              showStarted={showStarted}
              openSpotlight={openSpotlight}
              onFilmLinkTap={onFilmLinkTap}
            />
          ) : (
            <PreCeremonyView
              categories={categories}
              nominees={nominees}
              confidencePicks={confidencePicks}
              draftPicks={draftPicks}
              draftEntities={draftEntities}
              leaderboard={leaderboard}
              showStarted={showStarted}
              onStartShow={onStartShow}
              onNavigateToWinnersTab={onNavigateToWinnersTab}
              onNavigateToBingo={onNavigateToBingo}
            />
          )
        )}
      </motion.div>
    </AnimatePresence>
  )
}
