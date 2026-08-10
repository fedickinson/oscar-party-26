/**
 * PreCeremonyView — Home tab content before the first winner is announced.
 *
 * Layout (full-height, no page scroll):
 *   1. Compact hero card — start episode / waiting + bingo CTA
 *   2. Collapsible pre-show stats — collapsed by default, tap to expand
 *   3. ChatSection — fills all remaining vertical space (prominent)
 *
 * Before show_started:
 *   Anyone holding a remote (see lib/watch-groups) gets a large, full-width
 *   "Start the episode" button -> writes show_started=true. Everyone else waits.
 *   It is not host-only: the host may be in a different country from the screen
 *   that actually starts playing.
 *
 * After show_started, before the first logged event:
 *   All players see "The episode has begun".
 *   Host can jump to the Events tab to start logging.
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Grid3X3, Trophy, Flame, ChevronDown, ChevronUp, BarChart2, Play, Maximize2, Minimize2 } from 'lucide-react'
import { useGame } from '../../context/GameContext'
import ChatSection from './ChatSection'
import TeamPicker from '../TeamPicker'
import QuickStats from './QuickStats'
import type { CategoryRow, ConfidencePickRow, DraftPickRow, DraftEntityRow, NomineeRow } from '../../types/database'
import type { ScoredPlayer } from '../../lib/scoring'
import { remoteHolderIds } from '../../lib/watch-groups'

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
          <BarChart2 size={15} className="text-accent flex-shrink-0" />
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
  const { player, players } = useGame()
  const isHost = player?.is_host ?? false
  // Anyone holding a remote can start the episode. Six people are spread across
  // separate screens tonight, and whoever presses play on a screen is the person
  // who knows the moment it actually starts — the host may not be in that room.
  // The host is always included as a fallback: a location where nobody claimed
  // the remote would otherwise have no one who can start, and discovering that
  // at 9pm is not the moment to fix it.
  const canStart = player ? isHost || remoteHolderIds(players).includes(player.id) : false
  const [starting, setStarting] = useState(false)
  const [chatExpanded, setChatExpanded] = useState(false)

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
    <div className="h-full max-w-md mx-auto overflow-y-auto">
      {/* Stacked cards — the page scrolls; nothing can be crushed off-screen */}
      <div className="px-4 pt-4 space-y-3">
        {/* Compact hero card */}
        <div className="relief-glass p-4">
          <div className="flex items-center gap-3">
            {/* Icon */}
            {showStarted ? (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 22 }}
                className="w-10 h-10 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center flex-shrink-0"
              >
                <Flame size={18} className="text-emerald-400" />
              </motion.div>
            ) : (
              <motion.div
                animate={{ scale: [1, 1.12, 1], opacity: [0.7, 1, 0.7] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                className="w-10 h-10 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center flex-shrink-0"
              >
                <Trophy size={18} className="text-accent" />
              </motion.div>
            )}

            {/* Text + action */}
            <div className="flex-1 min-w-0">
              {showStarted ? (
                <>
                  <h2 className="text-sm font-bold text-white">The episode has begun</h2>
                  <p className="text-xs text-white/45">Watching for the first scoring moment</p>
                </>
              ) : (
                <>
                  <h2 className="text-sm font-bold text-white">The episode starts soon</h2>
                  <p className="text-xs text-white/45">Rosters locked. Bingo cards dealt.</p>
                </>
              )}
            </div>

            {/* Events shortcut once the episode is running — host only */}
            {showStarted && isHost && (
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={onNavigateToWinnersTab}
                className="px-3 py-2 rounded-xl bg-accent font-semibold text-ground-deep text-xs flex-shrink-0"
                style={{ boxShadow: '0 0 16px rgba(185,134,63,0.3)' }}
              >
                Events
              </motion.button>
            )}
          </div>

          {/* ── Start the episode ─────────────────────────────────────────────
              Deliberately full-width and tall. It is pressed once, in a dark
              room, at the exact second the episode begins — with a phone in one
              hand. A small button in the corner of a card is the wrong shape
              for that. */}
          {!showStarted && canStart && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleStartShow}
              disabled={starting}
              className="w-full mt-3 py-4 rounded-2xl bg-accent font-extrabold text-ground-deep
                         text-lg tracking-wide flex items-center justify-center gap-2
                         disabled:opacity-60"
              style={{ boxShadow: '0 0 28px rgba(185,134,63,0.35)' }}
            >
              <Play size={20} strokeWidth={2.5} fill="currentColor" />
              {starting ? 'Starting…' : 'Start the episode'}
            </motion.button>
          )}
          {!showStarted && canStart && (
            <p className="text-[11px] text-white/35 text-center mt-1.5">
              Press this the moment it starts on your screen.
            </p>
          )}
          {!showStarted && !canStart && (
            <p className="text-xs text-white/35 text-center mt-3 italic">
              Waiting for someone to press play…
            </p>
          )}

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

        {/* Allegiance — declared here, defected from anywhere */}
        <TeamPicker />

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

      {/* Chat: guaranteed height, never crushed by the cards above; the
          expand button hands it the entire screen. */}
      <div
        className="flex flex-col px-4 pt-3"
        style={{ height: '62vh', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex items-center justify-between mb-2 px-1">
          <p className="text-xs uppercase tracking-wider text-white/35">Chat</p>
          <button
            onClick={() => setChatExpanded(true)}
            aria-label="Expand chat"
            className="w-9 h-9 -mr-1 flex items-center justify-center text-white/45 hover:text-white"
          >
            <Maximize2 size={15} />
          </button>
        </div>
        <ChatSection fill />
      </div>

      {/* Fullscreen chat — the phone's natural pre-show mode */}
      <AnimatePresence>
        {chatExpanded && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 flex flex-col bg-[var(--t-ground,#0A0E27)] max-w-md mx-auto"
            style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))', paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            <div className="flex items-center justify-between px-4 pb-2 flex-shrink-0">
              <p className="text-xs uppercase tracking-wider text-white/35">Chat</p>
              <button
                onClick={() => setChatExpanded(false)}
                aria-label="Close chat"
                className="w-9 h-9 -mr-1 flex items-center justify-center text-white/60 hover:text-white"
              >
                <Minimize2 size={16} />
              </button>
            </div>
            <div className="flex-1 flex flex-col min-h-0 px-4">
              <ChatSection fill />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
