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
  // Spotlight
  spotlightCategoryId: number | null
  spotlightNomineeIds: string[]
  isHost: boolean
  openSpotlight: (categoryId: number) => Promise<void>
  closeSpotlight: () => Promise<void>
  confirmSpotlightWinner: (nomineeId: string) => Promise<void>
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
  spotlightCategoryId,
  spotlightNomineeIds,
  isHost,
  openSpotlight,
  closeSpotlight,
  confirmSpotlightWinner,
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
        onClose={closeSpotlight}
        chatSection={<ChatSection fill />}
      />
    )
  }

  // ── Normal mode ───────────────────────────────────────────────────────────────

  const hasAnyWinner = categories.some((c) => c.winner_id != null)
  const viewKey = spotlightContent ? `spotlight-${spotlightCategoryId}` : hasAnyWinner ? 'live' : 'pre'

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={viewKey}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18, ease: 'easeInOut' }}
        className="h-full"
      >
        {spotlightContent ?? (
          hasAnyWinner ? (
            <LiveHomeView
              categories={categories}
              nominees={nominees}
              confidencePicks={confidencePicks}
              draftPicks={draftPicks}
              draftEntities={draftEntities}
              leaderboard={leaderboard}
              isHost={isHost}
              openSpotlight={openSpotlight}
            />
          ) : (
            <PreCeremonyView
              categories={categories}
              nominees={nominees}
              confidencePicks={confidencePicks}
              draftPicks={draftPicks}
              draftEntities={draftEntities}
              leaderboard={leaderboard}
              onNavigateToWinnersTab={onNavigateToWinnersTab}
              onNavigateToBingo={onNavigateToBingo}
            />
          )
        )}
      </motion.div>
    </AnimatePresence>
  )
}
