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

import { AnimatePresence, motion } from 'framer-motion'
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
    <div className="flex-shrink-0 backdrop-blur-lg bg-white/8 border-t border-white/10 px-4 pt-4 pb-6 space-y-4">
      <AnimatePresence mode="wait" initial={false}>
        {myHasSubmitted ? (
          <motion.div
            key="submitted"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="space-y-4"
          >
            {/* Player submit status row */}
            <div className="flex items-center gap-3">
              {/* Count label */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white/60 leading-none">
                  {submittedCount} of {players.length} submitted
                </p>
                {!allSubmitted && (
                  <p className="text-[11px] text-white/30 mt-1 leading-none">
                    Waiting for others…
                  </p>
                )}
                {allSubmitted && (
                  <p className="text-[11px] text-emerald-400/80 mt-1 leading-none">
                    All picks are in
                  </p>
                )}
              </div>

              {/* Player avatar dots */}
              <div className="flex items-center gap-3">
                {players.map((player, i) => {
                  const hasSubmitted = submittedPlayerIds.has(player.id)
                  const isMe = player.id === myPlayerId
                  return (
                    <motion.div
                      key={player.id}
                      className="flex flex-col items-center gap-1.5"
                      initial={{ opacity: 0, scale: 0.7 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{
                        delay: i * 0.05,
                        type: 'spring',
                        stiffness: 400,
                        damping: 22,
                      }}
                    >
                      {/* Dot with check or clock */}
                      <motion.div
                        className={[
                          'w-8 h-8 rounded-full flex items-center justify-center border-2',
                          hasSubmitted
                            ? 'border-transparent'
                            : 'border-dashed border-white/20',
                        ].join(' ')}
                        style={hasSubmitted ? { backgroundColor: player.color } : undefined}
                        animate={hasSubmitted ? { scale: [1, 1.15, 1] } : {}}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                      >
                        {hasSubmitted ? (
                          <Check size={13} className="text-white" strokeWidth={3} />
                        ) : (
                          <Clock size={12} className="text-white/25" />
                        )}
                      </motion.div>

                      {/* Name label */}
                      <span
                        className={[
                          'text-[10px] leading-none font-medium',
                          isMe
                            ? hasSubmitted
                              ? 'text-white/70'
                              : 'text-white/50'
                            : hasSubmitted
                              ? 'text-white/40'
                              : 'text-white/20',
                        ].join(' ')}
                      >
                        {isMe ? 'You' : player.name.split(' ')[0]}
                      </span>
                    </motion.div>
                  )
                })}
              </div>
            </div>

            {/* Host lock button */}
            {isHost && (
              <div className="space-y-2">
                {!allSubmitted && (
                  <p className="text-[11px] text-white/35 text-center leading-snug">
                    Players who haven't submitted will have picks auto-assigned.
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
                      Lock Picks &amp; Start Show
                    </>
                  )}
                </motion.button>
              </div>
            )}

            {!isHost && (
              <p className="text-xs text-white/30 text-center">
                Waiting for the host to lock picks…
              </p>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="picking"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="space-y-3"
          >
            {/* Progress bar */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
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

            {/* Confidence number nudge */}
            {missingConfidenceCount > 0 && completedPickCount + missingConfidenceCount === totalCategories && (
              <p className="text-xs text-amber-400/80 text-center leading-snug">
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
