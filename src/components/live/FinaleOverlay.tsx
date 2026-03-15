/**
 * FinaleOverlay — full-screen celebration shown to ALL players when the host
 * ends the ceremony (rooms.phase transitions to 'finished').
 *
 * Shown in Live.tsx instead of immediately navigating. After the overlay
 * auto-dismisses (or the player taps "See Final Standings"), the caller
 * navigates to /results.
 *
 * Fires confetti on mount. Auto-dismisses after DISMISS_MS.
 */

import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Trophy } from 'lucide-react'
import confetti from 'canvas-confetti'
import type { ScoredPlayer } from '../../lib/scoring'

const DISMISS_MS = 5000

interface Props {
  leaderboard: ScoredPlayer[]
  totalCategories: number
  onDismiss: () => void
}

export default function FinaleOverlay({ leaderboard, totalCategories, onDismiss }: Props) {
  const leader = leaderboard[0]

  useEffect(() => {
    // Two-burst confetti
    confetti({
      particleCount: 180,
      spread: 90,
      origin: { x: 0.3, y: 0.5 },
      colors: ['#D4AF37', '#ffffff', '#F5E6A3', '#ffd700'],
    })
    confetti({
      particleCount: 180,
      spread: 90,
      origin: { x: 0.7, y: 0.5 },
      colors: ['#D4AF37', '#ffffff', '#F5E6A3', '#ffd700'],
    })

    const timer = setTimeout(onDismiss, DISMISS_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-[70] flex items-center justify-center p-6"
      style={{ background: 'rgba(4, 6, 20, 0.92)', backdropFilter: 'blur(20px)' }}
      onClick={onDismiss}
    >
      <motion.div
        initial={{ scale: 0.72, opacity: 0, y: 36 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: -20 }}
        transition={{ type: 'spring', stiffness: 300, damping: 24, mass: 0.85 }}
        className="w-full max-w-sm rounded-3xl px-6 py-8 text-center overflow-hidden relative"
        style={{
          background: 'linear-gradient(155deg, rgba(10,14,39,0.99) 0%, rgba(15,19,52,0.99) 100%)',
          border: '1px solid rgba(212,175,55,0.45)',
          boxShadow: '0 0 72px 14px rgba(212,175,55,0.16), 0 12px 48px rgba(0,0,0,0.55)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gold shimmer sweep — first pass */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(112deg, transparent 20%, rgba(212,175,55,0.10) 50%, transparent 80%)',
          }}
          animate={{ x: ['-150%', '250%'] }}
          transition={{ duration: 1.6, delay: 0.35, ease: 'easeOut' }}
        />
        {/* Second shimmer pass */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(112deg, transparent 20%, rgba(212,175,55,0.06) 50%, transparent 80%)',
          }}
          animate={{ x: ['-150%', '250%'] }}
          transition={{ duration: 1.6, delay: 1.6, ease: 'easeOut' }}
        />

        {/* Trophy icon with glow */}
        <motion.div
          initial={{ scale: 0.35, opacity: 0, rotate: -15 }}
          animate={{ scale: 1, opacity: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 20, delay: 0.1 }}
          className="flex justify-center mb-5"
        >
          <div
            className="rounded-2xl flex items-center justify-center relative"
            style={{
              background: 'rgba(212,175,55,0.18)',
              border: '1px solid rgba(212,175,55,0.40)',
              boxShadow: '0 0 32px 6px rgba(212,175,55,0.22)',
              width: 72,
              height: 72,
            }}
          >
            <Trophy size={32} className="text-oscar-gold" />
          </div>
        </motion.div>

        {/* Label */}
        <motion.p
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.28 }}
          className="text-[10px] uppercase tracking-[0.22em] text-white/38 mb-2"
        >
          The ceremony is complete
        </motion.p>

        <motion.h2
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.24 }}
          className="text-3xl font-extrabold text-oscar-gold leading-tight"
        >
          All {totalCategories} decided
        </motion.h2>

        {/* Leader card */}
        {leader && (
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 26, delay: 0.36 }}
            className="mt-6 rounded-2xl px-4 py-4 text-center"
            style={{
              background: 'rgba(212,175,55,0.09)',
              border: '1px solid rgba(212,175,55,0.22)',
            }}
          >
            <p className="text-[9px] uppercase tracking-[0.2em] text-white/30 mb-2">
              Tonight's champion
            </p>

            <div className="flex items-center justify-center gap-3 mb-3">
              <div
                className="w-11 h-11 rounded-xl flex-shrink-0"
                style={{
                  background: `linear-gradient(135deg, ${(leader.player.color ?? '#D4AF37')}66, ${(leader.player.color ?? '#D4AF37')}33)`,
                  border: `1px solid ${(leader.player.color ?? '#D4AF37')}40`,
                }}
              />
              <p className="text-xl font-extrabold text-white truncate">{leader.player.name}</p>
            </div>

            <p className="text-4xl font-black text-oscar-gold tabular-nums leading-none">
              {leader.totalScore}
              <span className="text-lg font-semibold text-oscar-gold/45 ml-1.5">pts</span>
            </p>

            {leaderboard.length > 1 && (
              <p className="text-[11px] text-white/28 mt-1.5">
                +{leader.totalScore - leaderboard[1].totalScore} pts ahead of {leaderboard[1].player.name}
              </p>
            )}
          </motion.div>
        )}

        {/* Auto-dismiss progress bar */}
        <div className="mt-6 h-0.5 bg-white/8 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-oscar-gold/55 rounded-full"
            initial={{ width: '100%' }}
            animate={{ width: '0%' }}
            transition={{ duration: DISMISS_MS / 1000, ease: 'linear' }}
          />
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55 }}
          className="text-[10px] text-white/22 mt-3 tracking-wide"
        >
          Tap to see final standings
        </motion.p>
      </motion.div>
    </motion.div>
  )
}
