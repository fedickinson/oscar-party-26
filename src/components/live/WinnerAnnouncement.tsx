/**
 * WinnerAnnouncement — full-screen overlay shown to all players when a
 * category winner is confirmed.
 *
 * Shows three visually distinct sections:
 *   1. Winner — category + name + film
 *   2. Confidence Pick — did this player pick correctly? Points gained.
 *   3. Fantasy Draft — who drafted the winner entity and how many pts.
 *
 * Auto-dismisses after 8 seconds. Tap anywhere to dismiss early.
 * Fires confetti if the current player scored on either game.
 *
 * Queuing is handled by the parent (Live.tsx).
 */

import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Check, User, X } from 'lucide-react'
import confetti from 'canvas-confetti'
import { CategoryIcon } from '../../lib/category-icons'

const DISMISS_MS = 8000

export interface AnnouncementData {
  categoryName: string
  winnerName: string
  winnerFilm: string
  confidenceResult: {
    pickedName: string
    confidence: number
    isCorrect: boolean
  } | null
  draftResult: {
    playerName: string
    playerColor: string
    points: number
    isCurrentPlayer: boolean
  } | null
}

interface Props {
  announcement: AnnouncementData
  onDismiss: () => void
}

export default function WinnerAnnouncement({ announcement, onDismiss }: Props) {
  const { categoryName, winnerName, winnerFilm, confidenceResult, draftResult } = announcement

  const scored =
    confidenceResult?.isCorrect ||
    draftResult?.isCurrentPlayer

  useEffect(() => {
    if (scored) {
      confetti({
        particleCount: 120,
        spread: 70,
        origin: { y: 0.55 },
        colors: ['#D4AF37', '#ffffff', '#F5E6A3'],
      })
    }

    const timer = setTimeout(onDismiss, DISMISS_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onDismiss}
    >
      <motion.div
        initial={{ scale: 0.85, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 360, damping: 30 }}
        className="backdrop-blur-xl bg-deep-navy/96 border border-white/15 rounded-3xl p-5 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >

        {/* ── Winner ─────────────────────────────────────────────────────── */}
        <div className="text-center mb-4">
          <p className="text-[10px] text-white/35 uppercase tracking-widest mb-2">
            {categoryName}
          </p>
          <div className="flex justify-center mb-2">
            <div className="w-10 h-10 rounded-full bg-oscar-gold/15 border border-oscar-gold/30 flex items-center justify-center">
              <CategoryIcon categoryName={categoryName} size={18} className="text-oscar-gold" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-oscar-gold leading-tight">
            {winnerName}
          </h2>
          {winnerFilm && (
            <p className="text-sm text-white/40 mt-0.5">{winnerFilm}</p>
          )}
        </div>

        {/* ── Score sections ──────────────────────────────────────────────── */}
        <div className="space-y-2 mb-4">

          {/* Confidence Pick */}
          {confidenceResult && (
            <div>
              <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1 px-0.5">
                Confidence Pick
              </p>
              <div
                className={[
                  'rounded-2xl px-3.5 py-3 flex items-center gap-3 border',
                  confidenceResult.isCorrect
                    ? 'bg-emerald-500/10 border-emerald-500/25'
                    : 'bg-white/4 border-white/8',
                ].join(' ')}
              >
                {/* Icon */}
                <div
                  className={[
                    'w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0',
                    confidenceResult.isCorrect
                      ? 'bg-emerald-500/20'
                      : 'bg-red-500/12',
                  ].join(' ')}
                >
                  {confidenceResult.isCorrect ? (
                    <Check size={15} className="text-emerald-400" strokeWidth={3} />
                  ) : (
                    <X size={15} className="text-red-400/70" strokeWidth={2.5} />
                  )}
                </div>

                {/* Score + label */}
                <div className="flex-1 min-w-0">
                  <p
                    className={[
                      'text-lg font-bold leading-none',
                      confidenceResult.isCorrect ? 'text-emerald-400' : 'text-white/30',
                    ].join(' ')}
                  >
                    {confidenceResult.isCorrect
                      ? `+${confidenceResult.confidence} pts`
                      : '0 pts'}
                  </p>
                  <p className="text-xs text-white/35 mt-0.5 truncate">
                    You picked {confidenceResult.pickedName}
                    {!confidenceResult.isCorrect && ' — wrong pick'}
                  </p>
                </div>

                {/* Confidence badge when correct */}
                {confidenceResult.isCorrect && (
                  <span className="text-[10px] font-bold text-emerald-400/60 bg-emerald-400/10 px-2 py-1 rounded-lg flex-shrink-0">
                    {confidenceResult.confidence}x
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Fantasy Draft — only shown when someone drafted the winner */}
          {draftResult && (
            <div>
              <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1 px-0.5">
                Fantasy Draft
              </p>
              <div
                className={[
                  'rounded-2xl px-3.5 py-3 flex items-center gap-3 border',
                  draftResult.isCurrentPlayer
                    ? 'bg-oscar-gold/10 border-oscar-gold/25'
                    : 'bg-white/4 border-white/8',
                ].join(' ')}
              >
                {/* Player color swatch */}
                <div
                  className="w-8 h-8 rounded-xl flex-shrink-0"
                  style={{ backgroundColor: draftResult.playerColor + '55' }}
                />

                {/* Name + points */}
                <div className="flex-1 min-w-0">
                  <p
                    className={[
                      'text-lg font-bold leading-none truncate',
                      draftResult.isCurrentPlayer ? 'text-oscar-gold' : 'text-white/60',
                    ].join(' ')}
                  >
                    {draftResult.isCurrentPlayer ? 'You' : draftResult.playerName}
                  </p>
                  <p className="text-xs text-white/35 mt-0.5">
                    +{draftResult.points} ensemble pts
                  </p>
                </div>

                {/* Nominee type icon */}
                <div
                  className={[
                    'w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0',
                    draftResult.isCurrentPlayer ? 'bg-oscar-gold/15' : 'bg-white/8',
                  ].join(' ')}
                >
                  <User
                    size={14}
                    className={draftResult.isCurrentPlayer ? 'text-oscar-gold' : 'text-white/30'}
                  />
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Auto-dismiss progress bar */}
        <div className="h-0.5 bg-white/8 rounded-full overflow-hidden mb-2">
          <motion.div
            className="h-full bg-white/25 rounded-full"
            initial={{ width: '100%' }}
            animate={{ width: '0%' }}
            transition={{ duration: DISMISS_MS / 1000, ease: 'linear' }}
          />
        </div>

        <p className="text-[11px] text-white/20 text-center">Tap to dismiss</p>
      </motion.div>
    </motion.div>
  )
}
