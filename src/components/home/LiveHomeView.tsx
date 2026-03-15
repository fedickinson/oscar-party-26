/**
 * LiveHomeView — Home tab content during the ceremony (after first winner announced).
 *
 * Story of the Night at top, live stats, chat, browse collapsible at bottom.
 */

import ChatSection from './ChatSection'
import QuickStats from './QuickStats'
import StoryOfTheNight from './StoryOfTheNight'
import { useStory } from '../../hooks/useStory'
import type { CategoryRow, ConfidencePickRow, DraftPickRow, DraftEntityRow, NomineeRow } from '../../types/database'
import type { ScoredPlayer } from '../../lib/scoring'

interface Props {
  categories: CategoryRow[]
  nominees: NomineeRow[]
  confidencePicks: ConfidencePickRow[]
  draftPicks: DraftPickRow[]
  draftEntities: DraftEntityRow[]
  leaderboard: ScoredPlayer[]
}

export default function LiveHomeView({
  categories,
  nominees,
  confidencePicks,
  draftPicks,
  draftEntities,
  leaderboard,
}: Props) {
  const { story, isGenerating, announcedCount, refreshStory } = useStory(
    categories,
    nominees,
    confidencePicks,
    draftPicks,
    draftEntities,
    leaderboard,
  )

  return (
    <div className="px-4 py-6 pb-24 space-y-4 max-w-md mx-auto">
      {/* Story of the Night — AI narrative */}
      <StoryOfTheNight
        story={story}
        isGenerating={isGenerating}
        announcedCount={announcedCount}
        onRefresh={refreshStory}
      />

      {/* Live stats */}
      <div>
        <p className="text-xs uppercase tracking-wider text-white/35 mb-2 px-1">Live stats</p>
        <QuickStats
          isPreCeremony={false}
          categories={categories}
          nominees={nominees}
          confidencePicks={confidencePicks}
          draftPicks={draftPicks}
          draftEntities={draftEntities}
          leaderboard={leaderboard}
        />
      </div>

      {/* Chat */}
      <div>
        <p className="text-xs uppercase tracking-wider text-white/35 mb-2 px-1">Chat</p>
        <ChatSection />
      </div>

    </div>
  )
}
