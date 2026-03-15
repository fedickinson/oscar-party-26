/**
 * DraftTimer — the top bar of the draft page.
 *
 * Shows: round/pick context, whose turn it is, and a visual countdown bar.
 *
 * The bar is animated with framer-motion's `animate` prop. We update
 * `timeRemaining` every 250ms in useDraft, and the bar's width transition
 * is `duration: 0.25, ease: 'linear'` — matching the update interval for
 * a smooth, jitter-free shrink animation.
 *
 * Color states:
 *   > 20s  →  green  (plenty of time)
 *   10–20s →  yellow (getting close)
 *   < 10s  →  red + pulse animation (urgent)
 */

import { motion } from 'framer-motion'
import { Star } from 'lucide-react'
import type { PlayerRow } from '../../types/database'

interface Props {
  timeRemaining: number
  totalTime: number
  currentDrafter: PlayerRow | null
  isMyTurn: boolean
  round: number
  pickInRound: number
  isDraftComplete: boolean
}

function timerColor(t: number): string {
  if (t > 20) return '#059669' // emerald
  if (t > 10) return '#D97706' // amber
  return '#DC2626' // red
}

export default function DraftTimer({
  timeRemaining,
  totalTime,
  currentDrafter,
  isMyTurn,
  round,
  pickInRound,
  isDraftComplete,
}: Props) {
  const pct = Math.max(0, (timeRemaining / totalTime) * 100)
  const color = timerColor(timeRemaining)
  const isUrgent = timeRemaining < 10 && !isDraftComplete

  return (
    <div className="backdrop-blur-lg bg-white/10 border border-white/15 rounded-2xl p-4 mb-3 flex-shrink-0">
      {/* Top line: round info + drafter name */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-white/50 uppercase tracking-wider">
          Round {round} · Pick {pickInRound}
        </span>

        {isDraftComplete ? (
          <span className="text-xs font-semibold text-oscar-gold">Draft Complete!</span>
        ) : isMyTurn ? (
          <motion.span
            animate={{ opacity: [1, 0.6, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
            className="text-xs font-bold text-oscar-gold uppercase tracking-wider flex items-center gap-1"
          >
            <Star size={10} className="fill-current" /> Your Turn!
          </motion.span>
        ) : currentDrafter ? (
          <span className="text-xs text-white/70">
            <span
              className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
              style={{ backgroundColor: currentDrafter.color }}
            />
            {currentDrafter.name}'s turn
          </span>
        ) : null}
      </div>

      {/* Timer bar track */}
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.25, ease: 'linear' }}
        />
      </div>

      {/* Timer count */}
      <div className="flex justify-end mt-1.5">
        {isDraftComplete ? null : (
          <motion.span
            className="text-xs font-mono tabular-nums"
            style={{ color }}
            animate={isUrgent ? { opacity: [1, 0.4, 1] } : { opacity: 1 }}
            transition={
              isUrgent
                ? { duration: 0.5, repeat: Infinity }
                : { duration: 0 }
            }
          >
            {timeRemaining}s
          </motion.span>
        )}
      </div>
    </div>
  )
}
