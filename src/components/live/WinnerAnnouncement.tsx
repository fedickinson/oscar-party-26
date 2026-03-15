/**
 * WinnerAnnouncement — full-screen overlay shown to all players when a
 * category winner is confirmed.
 *
 * Shows three visually distinct sections:
 *   1. Winner — category + name + film
 *   2. Confidence Pick — did this player pick correctly? Points gained.
 *   3. Ensemble Draft — who drafted the winner entity and how many pts.
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
import { FilmIcon } from '../../lib/film-icons'

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(4,6,20,0.88)', backdropFilter: 'blur(16px)' }}
      onClick={onDismiss}
    >
      <motion.div
        initial={{ scale: 0.72, opacity: 0, y: 28 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: -12 }}
        transition={{ type: 'spring', stiffness: 360, damping: 26 }}
        className="relative backdrop-blur-xl rounded-3xl p-5 w-full max-w-sm overflow-hidden"
        style={{
          background: 'linear-gradient(150deg, rgba(10,14,39,0.99) 0%, rgba(14,18,50,0.99) 100%)',
          border: scored
            ? '1px solid rgba(212,175,55,0.40)'
            : '1px solid rgba(255,255,255,0.10)',
          boxShadow: scored
            ? '0 0 56px 10px rgba(212,175,55,0.14), 0 8px 40px rgba(0,0,0,0.5)'
            : '0 8px 40px rgba(0,0,0,0.45)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gold shimmer — scored */}
        {scored && (
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'linear-gradient(110deg, transparent 25%, rgba(212,175,55,0.08) 50%, transparent 75%)',
            }}
            animate={{ x: ['-130%', '230%'] }}
            transition={{ duration: 1.2, delay: 0.35, ease: 'easeOut' }}
          />
        )}

        {/* Second shimmer pass for scored */}
        {scored && (
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'linear-gradient(110deg, transparent 25%, rgba(212,175,55,0.05) 50%, transparent 75%)',
            }}
            animate={{ x: ['-130%', '230%'] }}
            transition={{ duration: 1.2, delay: 1.2, ease: 'easeOut' }}
          />
        )}

        {/* ── Winner ─────────────────────────────────────────────────────── */}
        <div className="text-center mb-5">
          <motion.p
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04, duration: 0.22 }}
            className="text-[9px] text-white/30 uppercase tracking-[0.22em] mb-3"
          >
            {categoryName}
          </motion.p>

          {/* Category icon with glow */}
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 360, damping: 20, delay: 0.07 }}
            className="flex justify-center mb-3"
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center relative"
              style={{
                background: scored
                  ? 'rgba(212,175,55,0.18)'
                  : 'rgba(255,255,255,0.07)',
                border: scored
                  ? '1px solid rgba(212,175,55,0.40)'
                  : '1px solid rgba(255,255,255,0.12)',
                boxShadow: scored
                  ? '0 0 24px 4px rgba(212,175,55,0.18)'
                  : undefined,
              }}
            >
              <CategoryIcon
                categoryName={categoryName}
                size={24}
                className={scored ? 'text-oscar-gold' : 'text-white/60'}
              />
            </div>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, scale: 0.85, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 280, damping: 22, delay: 0.12 }}
            className="text-2xl font-extrabold text-oscar-gold leading-tight"
          >
            {winnerName}
          </motion.h2>

          {winnerFilm && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.22 }}
              className="flex items-center justify-center gap-1.5 mt-1"
            >
              <FilmIcon filmName={winnerFilm} size={11} className="text-white/30 flex-shrink-0" />
              <p className="text-sm text-white/38">{winnerFilm}</p>
            </motion.div>
          )}
        </div>

        {/* Divider */}
        <div className="h-px bg-white/6 mx-1 mb-4" />

        {/* ── Score sections ──────────────────────────────────────────────── */}
        <div className="space-y-2 mb-4">

          {/* Confidence Pick */}
          {confidenceResult && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 24, delay: 0.22 }}
            >
              <p className="text-[9px] text-white/25 uppercase tracking-[0.18em] mb-1.5 px-0.5">
                Confidence Pick
              </p>
              <div
                className={[
                  'rounded-2xl px-3.5 py-3 flex items-center gap-3 border',
                  confidenceResult.isCorrect
                    ? 'bg-emerald-500/10 border-emerald-500/22'
                    : 'bg-white/3 border-white/7',
                ].join(' ')}
              >
                <div
                  className={[
                    'w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0',
                    confidenceResult.isCorrect
                      ? 'bg-emerald-500/20'
                      : 'bg-red-500/10',
                  ].join(' ')}
                >
                  {confidenceResult.isCorrect ? (
                    <Check size={16} className="text-emerald-400" strokeWidth={3} />
                  ) : (
                    <X size={16} className="text-red-400/65" strokeWidth={2.5} />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p
                    className={[
                      'text-lg font-bold leading-none',
                      confidenceResult.isCorrect ? 'text-emerald-400' : 'text-white/25',
                    ].join(' ')}
                  >
                    {confidenceResult.isCorrect
                      ? `+${confidenceResult.confidence} pts`
                      : '0 pts'}
                  </p>
                  <p className="text-xs text-white/32 mt-0.5 truncate">
                    You picked {confidenceResult.pickedName}
                    {!confidenceResult.isCorrect && ' — wrong pick'}
                  </p>
                </div>

                {confidenceResult.isCorrect && (
                  <span className="text-[10px] font-extrabold text-emerald-400/70 bg-emerald-400/10 border border-emerald-400/15 px-2 py-1 rounded-lg flex-shrink-0">
                    {confidenceResult.confidence}×
                  </span>
                )}
              </div>
            </motion.div>
          )}

          {/* Ensemble Draft */}
          {draftResult && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 24, delay: 0.3 }}
            >
              <p className="text-[9px] text-white/25 uppercase tracking-[0.18em] mb-1.5 px-0.5">
                Ensemble Draft
              </p>
              <div
                className={[
                  'rounded-2xl px-3.5 py-3 flex items-center gap-3 border',
                  draftResult.isCurrentPlayer
                    ? 'bg-oscar-gold/10 border-oscar-gold/22'
                    : 'bg-white/3 border-white/7',
                ].join(' ')}
              >
                {/* Player color swatch */}
                <div
                  className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center"
                  style={{
                    background: draftResult.playerColor + '44',
                    border: `1px solid ${draftResult.playerColor}30`,
                  }}
                >
                  <User
                    size={14}
                    className={draftResult.isCurrentPlayer ? 'text-oscar-gold' : 'text-white/35'}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <p
                    className={[
                      'text-lg font-bold leading-none truncate',
                      draftResult.isCurrentPlayer ? 'text-oscar-gold' : 'text-white/55',
                    ].join(' ')}
                  >
                    {draftResult.isCurrentPlayer ? 'You' : draftResult.playerName}
                  </p>
                  <p className="text-xs text-white/32 mt-0.5">
                    +{draftResult.points} ensemble pts
                  </p>
                </div>

                {draftResult.isCurrentPlayer && (
                  <span className="text-[10px] font-extrabold text-oscar-gold/70 bg-oscar-gold/10 border border-oscar-gold/20 px-2 py-1 rounded-lg flex-shrink-0">
                    +{draftResult.points}
                  </span>
                )}
              </div>
            </motion.div>
          )}

        </div>

        {/* Auto-dismiss progress bar */}
        <div className="h-0.5 bg-white/6 rounded-full overflow-hidden mb-2">
          <motion.div
            className={[
              'h-full rounded-full',
              scored ? 'bg-oscar-gold/60' : 'bg-white/22',
            ].join(' ')}
            initial={{ width: '100%' }}
            animate={{ width: '0%' }}
            transition={{ duration: DISMISS_MS / 1000, ease: 'linear' }}
          />
        </div>

        <p className="text-[10px] text-white/18 text-center tracking-wide">Tap anywhere to dismiss</p>
      </motion.div>
    </motion.div>
  )
}
