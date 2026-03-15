/**
 * SubmitStatus — pinned bottom bar for the confidence picks page.
 *
 * BEFORE submission:
 *   Shows "X / 24 picks assigned" progress + Submit button (enabled when isComplete).
 *
 * AFTER submission (myHasSubmitted):
 *   Shows which players have submitted (color dots + check/clock icons).
 *   Host additionally sees a "Lock & Continue" button once they've submitted.
 *   Host can lock even if not all players have submitted (auto-fills stragglers).
 */

import { motion } from 'framer-motion'
import { Check, Clock, Lock } from 'lucide-react'
import type { PlayerRow } from '../../types/database'

interface Props {
  players: PlayerRow[]
  submittedPlayerIds: Set<string>
  myPlayerId: string
  completedPickCount: number
  missingConfidenceCount: number
  totalCategories: number
  isComplete: boolean
  myHasSubmitted: boolean
  isHost: boolean
  isSubmitting: boolean
  isLocking: boolean
  onSubmit: () => void
  onLock: () => void
}

export default function SubmitStatus({
  players,
  submittedPlayerIds,
  myPlayerId,
  completedPickCount,
  missingConfidenceCount,
  totalCategories,
  isComplete,
  myHasSubmitted,
  isHost,
  isSubmitting,
  isLocking,
  onSubmit,
  onLock,
}: Props) {
  const submittedCount = submittedPlayerIds.size
  const allSubmitted = submittedCount >= players.length

  return (
    <div className="flex-shrink-0 backdrop-blur-lg bg-white/8 border-t border-white/10 px-4 pt-3 pb-5 space-y-3">
      {myHasSubmitted ? (
        <>
          {/* Player submit status dots */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/40 flex-1">
              {submittedCount} of {players.length} submitted
            </span>
            <div className="flex items-center gap-2">
              {players.map((player) => {
                const hasSubmitted = submittedPlayerIds.has(player.id)
                const isMe = player.id === myPlayerId
                return (
                  <div key={player.id} className="flex flex-col items-center gap-1">
                    <div
                      className={[
                        'w-7 h-7 rounded-full flex items-center justify-center border-2',
                        hasSubmitted ? 'border-transparent' : 'border-white/20 border-dashed',
                      ].join(' ')}
                      style={hasSubmitted ? { backgroundColor: player.color } : undefined}
                    >
                      {hasSubmitted ? (
                        <Check size={12} className="text-white" strokeWidth={3} />
                      ) : (
                        <Clock size={11} className="text-white/30" />
                      )}
                    </div>
                    <span
                      className={[
                        'text-[10px] leading-none',
                        isMe ? 'text-white/60' : 'text-white/30',
                      ].join(' ')}
                    >
                      {isMe ? 'you' : player.name.split(' ')[0]}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Host lock button */}
          {isHost && (
            <div className="space-y-1.5">
              {!allSubmitted && (
                <p className="text-xs text-white/35 text-center">
                  Players who haven't submitted will have picks auto-assigned for them.
                </p>
              )}
              <motion.button
                onClick={onLock}
                disabled={isLocking}
                whileTap={!isLocking ? { scale: 0.97 } : undefined}
                className={[
                  'w-full py-3.5 rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-2',
                  !isLocking
                    ? 'bg-oscar-gold text-deep-navy hover:bg-oscar-gold-light'
                    : 'bg-white/10 text-white/30 cursor-not-allowed',
                ].join(' ')}
              >
                {isLocking ? (
                  <>
                    <div className="w-4 h-4 border-2 border-deep-navy/50 border-t-deep-navy rounded-full animate-spin" />
                    Locking…
                  </>
                ) : (
                  <>
                    <Lock size={16} />
                    Lock Picks & Start Show
                  </>
                )}
              </motion.button>
            </div>
          )}

          {!isHost && !allSubmitted && (
            <p className="text-xs text-white/30 text-center">
              Waiting for the host to lock picks…
            </p>
          )}
        </>
      ) : (
        <>
          {/* Progress bar */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-oscar-gold rounded-full"
                animate={{ width: `${(completedPickCount / Math.max(totalCategories, 1)) * 100}%` }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
              />
            </div>
            <span className="text-xs text-white/40 font-mono flex-shrink-0 tabular-nums">
              {completedPickCount}/{totalCategories}
            </span>
          </div>

          {/* Confidence number nudge — shown when all nominees are picked but some numbers are missing */}
          {missingConfidenceCount > 0 && completedPickCount + missingConfidenceCount === totalCategories && (
            <p className="text-xs text-amber-400/80 text-center">
              {missingConfidenceCount} {missingConfidenceCount === 1 ? 'category is' : 'categories are'} missing a confidence number — look for the amber badges above
            </p>
          )}

          {/* Submit button */}
          <motion.button
            onClick={onSubmit}
            disabled={!isComplete || isSubmitting}
            whileTap={isComplete && !isSubmitting ? { scale: 0.97 } : undefined}
            className={[
              'w-full py-4 rounded-2xl font-bold text-lg transition-all flex items-center justify-center gap-2',
              isComplete && !isSubmitting
                ? 'bg-oscar-gold text-deep-navy hover:bg-oscar-gold-light'
                : 'bg-white/10 text-white/30 cursor-not-allowed',
            ].join(' ')}
          >
            {isSubmitting ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Submitting…
              </>
            ) : isComplete ? (
              <>
                <Check size={18} strokeWidth={3} />
                Submit Picks
              </>
            ) : missingConfidenceCount > 0 && completedPickCount + missingConfidenceCount === totalCategories ? (
              `${missingConfidenceCount} ${missingConfidenceCount === 1 ? 'number' : 'numbers'} still needed`
            ) : (
              `${totalCategories - completedPickCount} picks remaining`
            )}
          </motion.button>
        </>
      )}
    </div>
  )
}
