/**
 * PreCeremonyView — Home tab content before the first winner is announced.
 *
 * Layout (full-height, no page scroll):
 *   1. Compact hero card — start show / waiting + bingo CTA
 *   2. Collapsible pre-show stats — collapsed by default, tap to expand
 *   3. ChatSection — fills all remaining vertical space (prominent)
 *
 * Before show_started:
 *   Host sees "Start the Show" button -> writes show_started=true to DB.
 *   Non-hosts see "Waiting for show to begin..."
 *
 * After show_started, before first winner:
 *   All players see "The show has begun! Waiting for first category..."
 *   Host can still navigate to Winners tab to begin announcing.
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Grid3X3, Trophy, Clapperboard, ChevronDown, ChevronUp, BarChart2 } from 'lucide-react'
import { useGame } from '../../context/GameContext'
import ChatSection from './ChatSection'
import QuickStats from './QuickStats'
import type { CategoryRow, ConfidencePickRow, DraftPickRow, DraftEntityRow, NomineeRow } from '../../types/database'
import type { ScoredPlayer } from '../../lib/scoring'

interface Props {
  categories: CategoryRow[]
  nominees: NomineeRow[]
  confidencePicks: ConfidencePickRow[]
  draftPicks: DraftPickRow[]
  draftEntities: DraftEntityRow[]
  leaderboard: ScoredPlayer[]
  showStarted: boolean
  onStartShow: () => Promise<void>
  onNavigateToWinnersTab: () => void
  onNavigateToBingo: () => void
}

// ─── Collapsible Stats Section ────────────────────────────────────────────────

function CollapsibleStats({
  categories,
  nominees,
  confidencePicks,
  draftPicks,
  draftEntities,
  leaderboard,
}: {
  categories: CategoryRow[]
  nominees: NomineeRow[]
  confidencePicks: ConfidencePickRow[]
  draftPicks: DraftPickRow[]
  draftEntities: DraftEntityRow[]
  leaderboard: ScoredPlayer[]
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3 flex items-center justify-between gap-2"
      >
        <div className="flex items-center gap-2 min-w-0">
          <BarChart2 size={15} className="text-oscar-gold flex-shrink-0" />
          <span className="text-sm font-semibold text-white/80 flex-shrink-0">Pre-show Stats</span>
          {!expanded && (
            <span className="text-xs text-white/35 truncate">Tap to view breakdowns</span>
          )}
        </div>
        {expanded
          ? <ChevronUp size={16} className="text-white/35 flex-shrink-0" />
          : <ChevronDown size={16} className="text-white/35 flex-shrink-0" />
        }
      </motion.button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/8 px-3 py-3 max-h-[40vh] overflow-y-auto">
              <QuickStats
                isPreCeremony
                categories={categories}
                nominees={nominees}
                confidencePicks={confidencePicks}
                draftPicks={draftPicks}
                draftEntities={draftEntities}
                leaderboard={leaderboard}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PreCeremonyView({
  categories,
  nominees,
  confidencePicks,
  draftPicks,
  draftEntities,
  leaderboard,
  showStarted,
  onStartShow,
  onNavigateToWinnersTab,
  onNavigateToBingo,
}: Props) {
  const { player } = useGame()
  const isHost = player?.is_host ?? false
  const [starting, setStarting] = useState(false)

  async function handleStartShow() {
    if (starting) return
    setStarting(true)
    try {
      await onStartShow()
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="h-full flex flex-col max-w-md mx-auto overflow-hidden">
      {/* Fixed top: hero card + collapsible stats */}
      <div className="px-4 pt-4 space-y-3 flex-shrink-0">
        {/* Compact hero card */}
        <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-4">
          <div className="flex items-center gap-3">
            {/* Icon */}
            {showStarted ? (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center flex-shrink-0"
              >
                <Clapperboard size={18} className="text-emerald-400" />
              </motion.div>
            ) : (
              <motion.div
                animate={{ scale: [1, 1.12, 1], opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                className="w-10 h-10 rounded-full bg-oscar-gold/15 border border-oscar-gold/30 flex items-center justify-center flex-shrink-0"
              >
                <Trophy size={18} className="text-oscar-gold" />
              </motion.div>
            )}

            {/* Text + action */}
            <div className="flex-1 min-w-0">
              {showStarted ? (
                <>
                  <h2 className="text-sm font-bold text-white">The show has begun</h2>
                  <p className="text-xs text-white/45">Waiting for first category</p>
                </>
              ) : (
                <>
                  <h2 className="text-sm font-bold text-white">The show starts soon</h2>
                  <p className="text-xs text-white/45">Picks locked. Bingo cards set.</p>
                </>
              )}
            </div>

            {/* Action button */}
            {showStarted && isHost ? (
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={onNavigateToWinnersTab}
                className="px-3 py-2 rounded-xl bg-oscar-gold font-semibold text-midnight text-xs flex-shrink-0"
                style={{ boxShadow: '0 0 16px rgba(212,175,55,0.3)' }}
              >
                Winners
              </motion.button>
            ) : !showStarted && isHost ? (
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={handleStartShow}
                disabled={starting}
                className="px-3 py-2 rounded-xl bg-oscar-gold font-semibold text-midnight text-xs flex-shrink-0 disabled:opacity-60"
                style={{ boxShadow: '0 0 16px rgba(212,175,55,0.3)' }}
              >
                {starting ? 'Starting...' : 'Start Show'}
              </motion.button>
            ) : !showStarted ? (
              <span className="text-[11px] text-white/35 italic flex-shrink-0">Waiting...</span>
            ) : null}
          </div>

          {/* Bingo CTA — compact inline row */}
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={onNavigateToBingo}
            className="w-full mt-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center gap-2 text-xs font-semibold text-emerald-400"
          >
            <Grid3X3 size={14} />
            View your Bingo card
          </motion.button>
        </div>

        {/* Collapsible pre-show stats */}
        <CollapsibleStats
          categories={categories}
          nominees={nominees}
          confidencePicks={confidencePicks}
          draftPicks={draftPicks}
          draftEntities={draftEntities}
          leaderboard={leaderboard}
        />
      </div>

      {/* Chat fills remaining vertical space */}
      <div className="flex-1 flex flex-col min-h-0 px-4 pt-3" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <p className="text-xs uppercase tracking-wider text-white/35 mb-2 px-1 flex-shrink-0">Chat</p>
        <ChatSection fill />
      </div>
    </div>
  )
}
