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
    <div className="relief-glass flex-shrink-0 border-t px-4 pt-4 pb-6 space-y-4" style={{ borderColor: 'var(--t-line)' }}>
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
            <div className="flex items-start gap-3 min-w-0">
              {/* Count label */}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-[var(--t-text-muted)] leading-none tabular-nums">
                  {submittedCount} of {players.length} submitted
                </p>
                {!allSubmitted && (
                  <p className="text-xs text-[var(--t-pending)] mt-1 leading-none">
                    Waiting for others…
                  </p>
                )}
                {allSubmitted && (
                  <p className="text-xs text-[var(--t-positive)] mt-1 leading-none">
                    All picks are in
                  </p>
                )}
              </div>

              {/* Player avatar dots */}
              <div className="flex flex-wrap items-start justify-end gap-2 min-w-0">
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
                            : 'border-dashed border-[var(--t-line)]',
                        ].join(' ')}
                        style={hasSubmitted ? { backgroundColor: player.color } : undefined}
                        animate={hasSubmitted ? { scale: [1, 1.15, 1] } : {}}
                        transition={{ duration: 0.3, ease: 'easeOut' }}
                      >
                        {hasSubmitted ? (
                          <Check size={13} className="text-[var(--t-text)]" strokeWidth={3} />
                        ) : (
                          <Clock size={12} className="text-[var(--t-negative)]" />
                        )}
                      </motion.div>

                      {/* Name label */}
                      <span
                        className={[
                          'text-xs leading-none font-medium',
                          isMe
                            ? hasSubmitted
                              ? 'text-[var(--t-text)]'
                              : 'text-[var(--t-text-muted)]'
                            : hasSubmitted
                              ? 'text-[var(--t-text-muted)]'
                              : 'text-[var(--t-negative)]',
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
                  <p className="text-xs text-[var(--t-negative)] text-center leading-snug">
                    Players who haven't submitted will have picks auto-assigned.
                  </p>
                )}
                <motion.button
                  onClick={onLock}
                  disabled={isLocking}
                  whileTap={!isLocking ? { scale: 0.97 } : undefined}
                  className={[
                    'w-full min-h-[52px] py-3 rounded-2xl border font-bold text-base transition-all flex items-center justify-center gap-2',
                    !isLocking
                      ? 'material-enamel relief-raised text-[var(--t-personal-text)] border-[var(--t-personal-device)]'
                      : 'text-[var(--t-negative)] border-[var(--t-line-soft)] cursor-not-allowed',
                  ].join(' ')}
                  style={!isLocking ? undefined : { backgroundColor: 'var(--t-negative-soft)' }}
                >
                  {isLocking ? (
                    <>
                      <div className="w-4 h-4 border-2 border-[var(--t-line)] border-t-[var(--t-text)] rounded-full animate-spin" />
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
              <p className="text-xs text-[var(--t-pending)] text-center">
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
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--t-negative-soft)' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: 'var(--t-pending)' }}
                  animate={{ width: `${(completedPickCount / Math.max(totalCategories, 1)) * 100}%` }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                />
              </div>
              <span className="font-display text-xs text-[var(--t-text-muted)] flex-shrink-0 tabular-nums">
                {completedPickCount}/{totalCategories}
              </span>
            </div>

            {/* Confidence number nudge */}
            {missingConfidenceCount > 0 && completedPickCount + missingConfidenceCount === totalCategories && (
              <p className="text-xs text-[var(--t-pending)] text-center leading-snug">
                {missingConfidenceCount} {missingConfidenceCount === 1 ? 'category is' : 'categories are'} missing a confidence number — look for the amber badges above
              </p>
            )}

            {/* Submit button */}
            <motion.button
              onClick={onSubmit}
              disabled={!isComplete || isSubmitting}
              whileTap={isComplete && !isSubmitting ? { scale: 0.97 } : undefined}
              className={[
                'w-full min-h-[52px] py-3 rounded-2xl border font-bold text-lg transition-all flex items-center justify-center gap-2',
                isComplete && !isSubmitting
                  ? 'material-enamel relief-raised text-[var(--t-personal-text)] border-[var(--t-personal-device)]'
                  : 'text-[var(--t-negative)] border-[var(--t-line-soft)] cursor-not-allowed',
              ].join(' ')}
              style={isComplete && !isSubmitting ? undefined : { backgroundColor: 'var(--t-negative-soft)' }}
            >
              {isSubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-[var(--t-line)] border-t-[var(--t-text)] rounded-full animate-spin" />
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
