/**
 * ReadyUpScreen — shown after a player taps "Got it" on the draft explainer.
 *
 * Shows all players with ready/not-ready status, then runs a 3-2-1 countdown
 * when everyone is ready. The host writes phase='draft' after the countdown;
 * all clients navigate via their realtime subscription (standard pattern).
 */

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Clock } from 'lucide-react'
import confetti from 'canvas-confetti'
import Avatar from './Avatar'
import type { PlayerRow } from '../types/database'

interface ReadyUpScreenProps {
  players: PlayerRow[]
  readyPlayerIds: string[]
  isHost: boolean
  onCountdownComplete: () => void
  /** Unix ms timestamp recorded when all players first became ready. Used to
   *  derive the correct countdown position for clients that mount late. */
  countdownStartedAt: number
}

type Stage = 'waiting' | 'countdown' | 'go'

export default function ReadyUpScreen({
  players,
  readyPlayerIds,
  isHost,
  onCountdownComplete,
  countdownStartedAt,
}: ReadyUpScreenProps) {
  const allReady = players.length > 0 && readyPlayerIds.length >= players.length

  // Derive the initial count from how much time has already elapsed since all
  // players became ready. This ensures a late-mounting client (e.g. the last
  // player to tap "Got it") shows the correct number instead of always starting
  // from 3 and missing intermediate ticks.
  // ── Countdown, derived from a shared wall-clock instant ───────────────────
  //
  // Previously this was a chain of setTimeouts per client. Each client ran its
  // own independent chain, so any interruption — unmount, a re-render clearing
  // the timers, background-tab throttling — froze that client on whatever
  // number it happened to be showing. And because only the host fires the phase
  // change, a frozen host left everyone else stranded on "go" indefinitely.
  //
  // Now a single interval recomputes the stage from `countdownStartedAt` every
  // 100ms. Missing a tick is harmless: the next one derives the correct state
  // from the clock rather than from the previous tick. There is no chain to
  // break.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!allReady) return
    const id = setInterval(() => setNow(Date.now()), 100)
    return () => clearInterval(id)
  }, [allReady])

  const elapsed = allReady ? now - countdownStartedAt : 0
  const stage: Stage = !allReady ? 'waiting' : elapsed >= 3000 ? 'go' : 'countdown'
  const count = elapsed >= 2000 ? 1 : elapsed >= 1000 ? 2 : 3

  // Fire the phase change once the countdown is spent. Host-only, and guarded
  // by a ref so repeated ticks past the threshold cannot fire it twice.
  const completedRef = useRef(false)
  const onCountdownCompleteRef = useRef(onCountdownComplete)
  useEffect(() => { onCountdownCompleteRef.current = onCountdownComplete })

  useEffect(() => {
    if (!allReady || !isHost || completedRef.current) return
    if (elapsed < 3600) return
    completedRef.current = true
    onCountdownCompleteRef.current()
  }, [allReady, isHost, elapsed])

  // Confetti on the "go" beat, once.
  const celebratedRef = useRef(false)
  useEffect(() => {
    if (stage !== 'go' || celebratedRef.current) return
    celebratedRef.current = true
    confetti({
      particleCount: 120,
      spread: 80,
      origin: { y: 0.5 },
      colors: ['#D4AF37', '#ffffff', '#12163A'],
    })
  }, [stage])

  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center px-4"
      style={{ background: 'linear-gradient(135deg, #0A0E27ee, #12163Aee)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      {/* Countdown overlay — covers the player list */}
      <AnimatePresence mode="wait">
        {stage === 'countdown' && (
          <motion.div
            key="countdown-overlay"
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <AnimatePresence mode="wait">
              <motion.span
                key={count}
                className="text-[160px] font-black text-accent leading-none select-none"
                initial={{ scale: 2, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.4, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 22 }}
              >
                {count}
              </motion.span>
            </AnimatePresence>
          </motion.div>
        )}

        {stage === 'go' && (
          <motion.div
            key="go-overlay"
            className="absolute inset-0 flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.span
              className="text-7xl font-black text-accent leading-none select-none"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 20 }}
            >
              Draft time.
            </motion.span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Player list — visible during 'waiting', fades when countdown starts */}
      <motion.div
        className="w-full max-w-md flex flex-col gap-5"
        animate={{ opacity: stage === 'waiting' ? 1 : 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Header */}
        <div className="text-center">
          <p className="text-xs text-white/40 uppercase tracking-widest mb-1">The Draft</p>
          <h1 className="text-2xl font-bold text-white">Ready up</h1>
          <p className="text-white/50 text-sm mt-1">Waiting for everyone to read the rules</p>
        </div>

        {/* Player list */}
        <div className="relief-glass p-5">
          <motion.ul className="space-y-3" layout>
            {players.map((p) => {
              const isReady = readyPlayerIds.includes(p.id)
              return (
                <motion.li
                  key={p.id}
                  layout
                  className="flex items-center gap-3"
                >
                  <Avatar
                    avatarId={p.avatar_id}
                    size="md"
                    emotion={isReady ? 'happy' : 'neutral'}
                  />
                  <span className="flex-1 font-semibold text-white truncate">{p.name}</span>
                  <AnimatePresence mode="wait">
                    {isReady ? (
                      <motion.div
                        key="ready"
                        className="flex items-center gap-1.5 text-emerald-400 text-sm font-medium"
                        initial={{ opacity: 0, x: 8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 24 }}
                      >
                        <Check size={15} />
                        Ready
                      </motion.div>
                    ) : (
                      <motion.div
                        key="reading"
                        className="flex items-center gap-1.5 text-amber-400/80 text-sm"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        <Clock size={15} />
                        Reading…
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.li>
              )
            })}
          </motion.ul>
        </div>

        {/* "All ready" status */}
        <AnimatePresence>
          {allReady && (
            <motion.p
              className="text-center text-accent font-semibold text-sm"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              Everyone's ready — starting…
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  )
}
