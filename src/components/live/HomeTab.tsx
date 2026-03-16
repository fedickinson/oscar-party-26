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
import type { ScoredPlayer } from '../../lib/scoring'

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
  openSpotlight: (categoryId: number) => Promise<void>
  closeSpotlight: () => Promise<void>
  confirmSpotlightWinner: (nomineeId: string) => Promise<void>
  confirmSpotlightTieWinner: (nomineeId1: string, nomineeId2: string) => Promise<void>
  // Finale
  onEndCeremony: () => Promise<void>
  isEndingCeremony: boolean
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
  openSpotlight,
  closeSpotlight,
  confirmSpotlightWinner,
  confirmSpotlightTieWinner,
  onEndCeremony,
  isEndingCeremony,
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
      const filmTitle = nominee.film_name || nominee.name
      const matchingEntity = draftEntities.find((e) =>
        nominee.type === 'person'
          ? e.type === 'person' && e.name === nominee.name
          : e.type === 'film' && e.film_name === filmTitle,
      )
      const myDraftPick = matchingEntity
        ? draftPicks.some(
            (dp) => dp.entity_id === matchingEntity.id && dp.player_id === currentPlayerId,
          )
        : false

      return { nominee, myConfidence: myPick?.confidence ?? null, myDraftPick }
    })

    spotlightContent = (
      <SpotlightView
        category={spotlightCategory}
        nomineeData={nomineeData}
        isHost={isHost}
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

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
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
              isHost={isHost}
              showStarted={showStarted}
              openSpotlight={openSpotlight}
              onEndCeremony={onEndCeremony}
              isEndingCeremony={isEndingCeremony}
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
