/**
 * BingoAlert — full-screen celebration when a bingo line is detected.
 *
 * - Scale-spring entrance animation for the "BINGO!" text
 * - Shows the 5 squares that completed the line (by short_text)
 * - Points earned this announcement
 * - canvas-confetti burst fired on mount
 * - Auto-dismisses after 3 seconds, or tap anywhere to dismiss early
 *
 * Wrapped in AnimatePresence by parent for exit animation.
 */

import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Trophy } from 'lucide-react'
import confetti from 'canvas-confetti'
import type { BingoSquareRow } from '../../types/database'
import type { CelebrationData } from '../../hooks/useBingo'

interface Props {
  data: CelebrationData
  squares: (BingoSquareRow | null)[]
  playerName: string
  playerColor: string
  onDismiss: () => void
}

export default function BingoAlert({
  data,
  squares,
  playerName,
  playerColor,
  onDismiss,
}: Props) {
  // Fire confetti on mount, auto-dismiss after 3s
  useEffect(() => {
    // Two-burst confetti from bottom corners
    const defaults = {
      startVelocity: 45,
      spread: 60,
      ticks: 80,
      zIndex: 9999,
      colors: ['#D4AF37', '#FFD700', '#FFF8DC', '#ffffff', '#059669'],
    }

    confetti({ ...defaults, origin: { x: 0.15, y: 1 }, angle: 60, particleCount: 60 })
    confetti({ ...defaults, origin: { x: 0.85, y: 1 }, angle: 120, particleCount: 60 })

    const t = setTimeout(onDismiss, 3000)
    return () => clearTimeout(t)
  }, [onDismiss])

  // Get the squares for the first (or only) completed line
  const celebLine = data.lines[0] ?? []
  const lineSquares = celebLine.map((idx) => squares[idx])

  const isFirstBingo = data.totalBingos === 1
  const isBlackout = data.totalBingos >= 12 // all 12 lines complete

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[9000] flex items-center justify-center"
      onClick={onDismiss}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />

      {/* Content */}
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 320, damping: 22 }}
        className="relative z-10 flex flex-col items-center gap-5 px-6 max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Player color chip */}
        <div className="flex items-center gap-2.5">
          <span
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: playerColor }}
          />
          <span className="text-white/70 text-sm font-medium">{playerName}</span>
        </div>

        {/* BINGO! headline */}
        <motion.div
          initial={{ scale: 0.6 }}
          animate={{ scale: [0.6, 1.12, 1] }}
          transition={{ type: 'spring', stiffness: 350, damping: 18, delay: 0.05 }}
          className="text-center"
        >
          <p
            className="text-7xl font-black tracking-tight leading-none"
            style={{ color: '#D4AF37', textShadow: '0 0 40px rgba(212,175,55,0.6)' }}
          >
            {isBlackout ? 'BLACKOUT!' : 'BINGO!'}
          </p>
          {data.totalBingos > 1 && !isBlackout && (
            <p className="text-sm text-white/60 mt-1">
              Line {data.totalBingos}
            </p>
          )}
        </motion.div>

        {/* Points badge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex items-center gap-2 bg-oscar-gold/15 border border-oscar-gold/40 rounded-full px-4 py-2"
        >
          <Trophy size={14} className="text-oscar-gold" />
          <span className="text-oscar-gold font-bold text-sm">
            +{data.pointsEarned} points
          </span>
        </motion.div>

        {/* The 5 winning squares */}
        {celebLine.length === 5 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="w-full"
          >
            <p className="text-xs text-white/40 uppercase tracking-widest text-center mb-2">
              {isFirstBingo ? 'Winning line' : 'New line'}
            </p>
            <div className="grid grid-cols-5 gap-1">
              {lineSquares.map((sq, i) => (
                <div
                  key={i}
                  className="bg-emerald-500/20 border border-emerald-400/50 rounded-lg p-1.5 flex items-center justify-center min-h-[44px]"
                >
                  <p className="text-[9px] text-emerald-300 text-center leading-tight font-medium line-clamp-3">
                    {celebLine[i] === 12 ? 'FREE' : (sq?.short_text ?? '?')}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        <p className="text-xs text-white/25 mt-1">Tap to dismiss</p>
      </motion.div>
    </motion.div>
  )
}
