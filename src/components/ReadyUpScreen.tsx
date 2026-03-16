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
  function deriveInitialCount(): number {
    const elapsed = Date.now() - countdownStartedAt
    if (elapsed >= 3000) return 1
    if (elapsed >= 2000) return 1
    if (elapsed >= 1000) return 2
    return 3
  }

  const [stage, setStage] = useState<Stage>(allReady ? 'countdown' : 'waiting')
  const [count, setCount] = useState(allReady ? deriveInitialCount() : 3)
  const startedRef = useRef(false)
  // Keep a stable ref so the timeout always calls the latest callback without
  // being in the dependency array (which would cancel the timeouts on re-render).
  const onCountdownCompleteRef = useRef(onCountdownComplete)
  useEffect(() => {
    onCountdownCompleteRef.current = onCountdownComplete
  })

  // Kick off the countdown as soon as all players are ready.
  // Guard with a ref so we only start it once even if readyPlayerIds fluctuates.
  // Timers are stored in a ref so the unmount cleanup can cancel them, but
  // allReady toggling false→true after the countdown has started will NOT
  // cancel the already-running timers (that would leave clients stuck on "3").
  const timersRef = useRef<(ReturnType<typeof setTimeout> | null)[]>([])

  useEffect(() => {
    if (!allReady || startedRef.current) return
    startedRef.current = true

    // Calculate how much of the 3-second countdown has already elapsed so
    // that a client who mounts late schedules its remaining ticks correctly.
    const elapsed = Date.now() - countdownStartedAt
    const remaining2 = Math.max(0, 1000 - elapsed)
    const remaining1 = Math.max(0, 2000 - elapsed)
    const remainingGo = Math.max(0, 3000 - elapsed)
    const remainingComplete = Math.max(0, 3600 - elapsed)

    setStage('countdown')
    setCount(deriveInitialCount())

    const t1 = remaining2 > 0 ? setTimeout(() => setCount(2), remaining2) : null
    const t2 = remaining1 > 0 ? setTimeout(() => setCount(1), remaining1) : null
    const t3 = setTimeout(() => {
      setStage('go')
      confetti({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.5 },
        colors: ['#D4AF37', '#ffffff', '#12163A'],
      })
    }, remainingGo)
    const t4 = setTimeout(() => {
      if (isHost) onCountdownCompleteRef.current()
    }, remainingComplete)

    timersRef.current = [t1, t2, t3, t4]
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allReady])

  // Cancel timers only on unmount, not on every allReady change.
  useEffect(() => {
    return () => {
      timersRef.current.forEach((t) => { if (t) clearTimeout(t) })
    }
  }, [])

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
                className="text-[160px] font-black text-oscar-gold leading-none select-none"
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
              className="text-7xl font-black text-oscar-gold leading-none select-none"
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 500, damping: 20 }}
            >
              Ensemble time.
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
          <p className="text-xs text-white/40 uppercase tracking-widest mb-1">Ensemble</p>
          <h1 className="text-2xl font-bold text-white">Ready up</h1>
          <p className="text-white/50 text-sm mt-1">Waiting for everyone to read the rules</p>
        </div>

        {/* Player list */}
        <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-5">
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
              className="text-center text-oscar-gold font-semibold text-sm"
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
