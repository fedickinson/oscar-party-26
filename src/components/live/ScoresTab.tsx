/**
 * ScoresTab — the "Scores" tab content for the live dashboard.
 *
 * Layout:
 *   1. Leaderboard (compact) — ranks, avatars, names, scores with delta badges
 *   2. "Live Feed" divider
 *   3. ActivityFeed — reverse-chronological scoring events with per-player impacts
 */

import Leaderboard from './Leaderboard'
import ActivityFeed from './ActivityFeed'
import type { ScoredPlayer } from '../../lib/scoring'
import type { FeedEvent } from '../../hooks/useScores'

interface Props {
  leaderboard: ScoredPlayer[]
  activityFeed: FeedEvent[]
  currentPlayerId: string
}

export default function ScoresTab({ leaderboard, activityFeed, currentPlayerId }: Props) {
  return (
    <div className="flex flex-col gap-4 py-2">
      <section>
        <p className="text-xs text-white/35 uppercase tracking-widest mb-3">Standings</p>
        <Leaderboard leaderboard={leaderboard} currentPlayerId={currentPlayerId} />
      </section>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-white/8" />
        <span className="text-[10px] text-white/25 uppercase tracking-widest">Live Feed</span>
        <div className="flex-1 h-px bg-white/8" />
      </div>

      <section className="pb-2">
        <ActivityFeed feed={activityFeed} />
      </section>
    </div>
  )
}
