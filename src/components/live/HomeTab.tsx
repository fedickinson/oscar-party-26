/**
 * HomeTab — routes to PreCeremonyView or LiveHomeView based on whether
 * any category has a winner set.
 *
 * No new DB column needed — the presence of any winner is the signal.
 */

import PreCeremonyView from '../home/PreCeremonyView'
import LiveHomeView from '../home/LiveHomeView'
import type { CategoryRow, ConfidencePickRow, DraftPickRow, DraftEntityRow, NomineeRow } from '../../types/database'
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
}: Props) {
  const hasAnyWinner = categories.some((c) => c.winner_id != null)

  if (hasAnyWinner) {
    return (
      <LiveHomeView
        categories={categories}
        nominees={nominees}
        confidencePicks={confidencePicks}
        draftPicks={draftPicks}
        draftEntities={draftEntities}
        leaderboard={leaderboard}
      />
    )
  }

  return (
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
}
