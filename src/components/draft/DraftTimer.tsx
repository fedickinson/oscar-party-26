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
    <motion.div
      animate={
        isMyTurn && !isDraftComplete
          ? {
              boxShadow: [
                '0 0 0px 0px rgba(212,175,55,0)',
                '0 0 20px 5px rgba(212,175,55,0.4)',
                '0 0 10px 2px rgba(212,175,55,0.2)',
              ],
            }
          : { boxShadow: '0 0 0px 0px rgba(212,175,55,0)' }
      }
      transition={
        isMyTurn && !isDraftComplete
          ? { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }
          : { duration: 0.35 }
      }
      className="rounded-2xl mb-3 flex-shrink-0"
      style={
        isMyTurn && !isDraftComplete
          ? {
              background: 'linear-gradient(135deg, rgba(212,175,55,0.18) 0%, rgba(212,175,55,0.06) 100%)',
              border: '1.5px solid rgba(212,175,55,0.5)',
              backdropFilter: 'blur(12px)',
            }
          : {
              background: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.12)',
              backdropFilter: 'blur(12px)',
            }
      }
    >
      {/* YOUR TURN banner — only shown when it's the current player's turn */}
      {isMyTurn && !isDraftComplete && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 22 }}
          className="flex items-center justify-center gap-2 px-4 pt-3 pb-0"
        >
          <motion.div
            animate={{ scale: [1, 1.12, 1] }}
            transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Star size={14} className="text-oscar-gold fill-current" />
          </motion.div>
          <span
            className="text-sm font-extrabold uppercase tracking-[0.18em]"
            style={{ color: '#D4AF37' }}
          >
            Your Turn
          </span>
          <motion.div
            animate={{ scale: [1, 1.12, 1] }}
            transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
          >
            <Star size={14} className="text-oscar-gold fill-current" />
          </motion.div>
        </motion.div>
      )}

      <div className="p-4">
        {/* Top line: round info + drafter name */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-white/50 uppercase tracking-wider">
            Round {round} · Pick {pickInRound}
          </span>

          {isDraftComplete ? (
            <span className="text-xs font-semibold text-oscar-gold">Ensemble Complete!</span>
          ) : isMyTurn ? (
            <motion.span
              animate={{ opacity: [1, 0.55, 1] }}
              transition={{ duration: 1.2, repeat: Infinity }}
              className="text-xs font-bold text-oscar-gold uppercase tracking-wider flex items-center gap-1"
            >
              Pick now!
            </motion.span>
          ) : currentDrafter ? (
            <span className="text-xs text-white/60">
              <span
                className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
                style={{ backgroundColor: currentDrafter.color }}
              />
              {currentDrafter.name}'s turn
            </span>
          ) : null}
        </div>

        {/* Timer bar track */}
        <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: isMyTurn && !isDraftComplete ? 'rgba(212,175,55,0.15)' : 'rgba(255,255,255,0.08)' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: isMyTurn && !isDraftComplete ? color : 'rgba(255,255,255,0.3)' }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.25, ease: 'linear' }}
          />
        </div>

        {/* Timer count */}
        <div className="flex justify-end mt-1.5">
          {isDraftComplete ? null : (
            <motion.span
              className="text-xs font-mono tabular-nums"
              style={{ color: isMyTurn ? color : 'rgba(255,255,255,0.35)' }}
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
    </motion.div>
  )
}
