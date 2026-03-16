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
import { Star, User } from 'lucide-react'
import confetti from 'canvas-confetti'
import { CategoryIcon } from '../../lib/category-icons'
import { FilmIcon } from '../../lib/film-icons'

const DISMISS_MS = 8000

export interface AnnouncementData {
  categoryName: string
  winnerName: string
  winnerFilm: string
  /** Second winner name when there is a tie */
  tieWinnerName: string | null
  /** Second winner film when there is a tie */
  tieWinnerFilm: string | null
  confidenceResult: {          // kept for confetti/scored logic (current player)
    pickedName: string
    confidence: number
    isCorrect: boolean
  } | null
  allConfidenceResults: {      // every player in the room
    playerId: string
    playerName: string
    playerColor: string
    pickedName: string
    confidence: number
    isCorrect: boolean
    isCurrentPlayer: boolean
  }[]
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
  const { categoryName, winnerName, winnerFilm, tieWinnerName, tieWinnerFilm, confidenceResult, allConfidenceResults, draftResult } = announcement
  const isTie = tieWinnerName != null

  const scored =
    confidenceResult?.isCorrect ||
    draftResult?.isCurrentPlayer

  useEffect(() => {
    // Always fire a gentle burst for the announcement
    confetti({
      particleCount: scored ? 160 : 60,
      spread: scored ? 80 : 55,
      origin: { y: 0.5, x: 0.5 },
      colors: ['#D4AF37', '#ffffff', '#F5E6A3', '#E8CC6A'],
      startVelocity: scored ? 38 : 22,
      gravity: 0.9,
      scalar: scored ? 1.1 : 0.85,
    })

    // Second burst from the sides on scored
    if (scored) {
      setTimeout(() => {
        confetti({
          particleCount: 55,
          spread: 60,
          origin: { y: 0.6, x: 0.15 },
          colors: ['#D4AF37', '#F5E6A3', '#ffffff'],
          startVelocity: 30,
          angle: 55,
        })
        confetti({
          particleCount: 55,
          spread: 60,
          origin: { y: 0.6, x: 0.85 },
          colors: ['#D4AF37', '#F5E6A3', '#ffffff'],
          startVelocity: 30,
          angle: 125,
        })
      }, 250)
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
      transition={{ duration: 0.28 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(2,4,16,0.92)', backdropFilter: 'blur(20px)' }}
      onClick={onDismiss}
    >
      {/* Decorative radial glow behind card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: scored ? 0.22 : 0.1, scale: 1 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        className="absolute inset-0 pointer-events-none"
        style={{
          background: scored
            ? 'radial-gradient(ellipse 55% 42% at 50% 50%, rgba(212,175,55,1) 0%, transparent 100%)'
            : 'radial-gradient(ellipse 50% 38% at 50% 50%, rgba(255,255,255,0.4) 0%, transparent 100%)',
        }}
      />

      <motion.div
        initial={{ scale: 0.68, opacity: 0, y: 36 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0, y: -16, transition: { duration: 0.22, ease: 'easeIn' } }}
        transition={{ type: 'spring', stiffness: 340, damping: 24, mass: 0.85 }}
        className="relative backdrop-blur-xl rounded-3xl w-full max-w-sm overflow-hidden"
        style={{
          background: scored
            ? 'linear-gradient(150deg, rgba(16,12,4,0.99) 0%, rgba(22,18,6,0.99) 60%, rgba(14,18,50,0.99) 100%)'
            : 'linear-gradient(150deg, rgba(10,14,39,0.99) 0%, rgba(14,18,50,0.99) 100%)',
          border: scored
            ? '1px solid rgba(212,175,55,0.50)'
            : '1px solid rgba(255,255,255,0.12)',
          boxShadow: scored
            ? '0 0 80px 16px rgba(212,175,55,0.16), 0 0 32px 4px rgba(212,175,55,0.12), 0 12px 48px rgba(0,0,0,0.6)'
            : '0 12px 48px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gold shimmer sweep — scored */}
        {scored && (
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'linear-gradient(108deg, transparent 20%, rgba(212,175,55,0.12) 48%, rgba(245,230,163,0.07) 52%, transparent 78%)',
            }}
            animate={{ x: ['-140%', '240%'] }}
            transition={{ duration: 1.1, delay: 0.3, ease: 'easeOut' }}
          />
        )}

        {/* Second shimmer pass */}
        {scored && (
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'linear-gradient(108deg, transparent 20%, rgba(212,175,55,0.07) 50%, transparent 78%)',
            }}
            animate={{ x: ['-140%', '240%'] }}
            transition={{ duration: 1.1, delay: 1.4, ease: 'easeOut' }}
          />
        )}

        {/* ── Top accent bar ──────────────────────────────────────────────── */}
        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.45, delay: 0.06, ease: [0.16, 1, 0.3, 1] }}
          className="h-0.5 origin-left"
          style={{
            background: scored
              ? 'linear-gradient(90deg, transparent, #D4AF37 30%, #F5E6A3 50%, #D4AF37 70%, transparent)'
              : 'linear-gradient(90deg, transparent, rgba(255,255,255,0.18) 50%, transparent)',
          }}
        />

        <div className="p-5 pb-4">

          {/* ── Winner ──────────────────────────────────────────────────────── */}
          <div className="text-center mb-5">

            {/* Category label */}
            <motion.p
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08, duration: 0.2 }}
              className="text-[10px] text-white/35 uppercase tracking-[0.24em] mb-3 font-medium"
            >
              {categoryName}
            </motion.p>

            {/* Category icon */}
            <motion.div
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.1 }}
              className="flex justify-center mb-3"
            >
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center relative"
                style={{
                  background: scored
                    ? 'linear-gradient(135deg, rgba(212,175,55,0.22) 0%, rgba(212,175,55,0.10) 100%)'
                    : 'rgba(255,255,255,0.07)',
                  border: scored
                    ? '1px solid rgba(212,175,55,0.45)'
                    : '1px solid rgba(255,255,255,0.12)',
                  boxShadow: scored
                    ? '0 0 32px 6px rgba(212,175,55,0.20), inset 0 1px 0 rgba(212,175,55,0.18)'
                    : undefined,
                }}
              >
                <CategoryIcon
                  categoryName={categoryName}
                  size={26}
                  className={scored ? 'text-oscar-gold' : 'text-white/55'}
                />
                {/* Star burst for scored */}
                {scored && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0 }}
                    animate={{ scale: [0, 1.4, 1], opacity: [0, 1, 0] }}
                    transition={{ duration: 0.55, delay: 0.2 }}
                    className="absolute inset-0 flex items-center justify-center pointer-events-none"
                  >
                    <Star size={48} className="text-oscar-gold" fill="rgba(212,175,55,0.15)" />
                  </motion.div>
                )}
              </div>
            </motion.div>

            {/* Winner name — the big reveal */}
            <motion.h2
              initial={{ opacity: 0, scale: 0.78, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.16 }}
              className={[
                'font-extrabold text-oscar-gold leading-tight tracking-tight',
                isTie ? 'text-xl' : 'text-3xl',
              ].join(' ')}
              style={{
                textShadow: scored
                  ? '0 0 32px rgba(212,175,55,0.55), 0 0 64px rgba(212,175,55,0.22)'
                  : '0 0 20px rgba(212,175,55,0.28)',
              }}
            >
              {winnerName}
              {isTie && (
                <>
                  <span className="text-white/25 text-lg mx-1.5 font-normal">&</span>
                  {tieWinnerName}
                </>
              )}
            </motion.h2>

            {isTie && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.22, duration: 0.2 }}
                className="text-[10px] text-amber-400/75 uppercase tracking-widest mt-1.5 font-bold"
              >
                Tie
              </motion.p>
            )}

            {winnerFilm && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.26, duration: 0.22 }}
                className="flex items-center justify-center gap-1.5 mt-1.5"
              >
                <FilmIcon filmName={winnerFilm} size={11} className="text-white/28 flex-shrink-0" />
                <p className="text-sm text-white/40 leading-tight">
                  {winnerFilm}
                  {isTie && tieWinnerFilm && tieWinnerFilm !== winnerFilm && (
                    <span className="text-white/22"> / {tieWinnerFilm}</span>
                  )}
                </p>
              </motion.div>
            )}
          </div>

          {/* Divider */}
          <motion.div
            initial={{ scaleX: 0, opacity: 0 }}
            animate={{ scaleX: 1, opacity: 1 }}
            transition={{ duration: 0.35, delay: 0.28 }}
            className="h-px mx-1 mb-4 origin-center"
            style={{
              background: scored
                ? 'linear-gradient(90deg, transparent, rgba(212,175,55,0.18) 50%, transparent)'
                : 'rgba(255,255,255,0.06)',
            }}
          />

          {/* ── Score sections ──────────────────────────────────────────────── */}
          <div className="space-y-2 mb-4">

            {/* Confidence Picks — all players */}
            {allConfidenceResults.length > 0 && (
              <div>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-[9px] text-white/25 uppercase tracking-[0.18em] mb-1.5 px-0.5 font-semibold"
                >
                  Confidence Picks
                </motion.p>
                <div className="space-y-1">
                  {allConfidenceResults.map((result, index) => (
                    <motion.div
                      key={result.playerId}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{
                        type: 'spring',
                        stiffness: 340,
                        damping: 28,
                        delay: 0.32 + index * 0.07,
                      }}
                      className={[
                        'px-3 py-2.5 rounded-xl flex items-center gap-2.5 border relative overflow-hidden',
                        result.isCorrect
                          ? 'border-emerald-500/20'
                          : 'border-white/6',
                      ].join(' ')}
                      style={{
                        background: result.isCorrect
                          ? 'linear-gradient(135deg, rgba(16,185,129,0.10) 0%, rgba(16,185,129,0.06) 100%)'
                          : 'rgba(255,255,255,0.03)',
                      }}
                    >
                      {/* Correct row left-edge accent */}
                      {result.isCorrect && (
                        <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-xl bg-emerald-500/50" />
                      )}

                      {/* Player color dot */}
                      <div
                        className="w-3.5 h-3.5 rounded-full flex-shrink-0 ring-1 ring-white/10"
                        style={{ background: result.playerColor + 'cc' }}
                      />

                      {/* Name + picked */}
                      <div className="flex-1 min-w-0 flex items-baseline gap-1.5 overflow-hidden">
                        <span
                          className={[
                            'text-[13px] font-bold leading-none flex-shrink-0',
                            result.isCurrentPlayer
                              ? result.isCorrect ? 'text-white' : 'text-white/85'
                              : 'text-white/60',
                          ].join(' ')}
                        >
                          {result.isCurrentPlayer ? 'You' : result.playerName}
                        </span>
                        <span className="text-[11px] text-white/34 truncate leading-none">
                          {'→ ' + result.pickedName}
                        </span>
                      </div>

                      {/* Confidence multiplier pill (correct only) */}
                      {result.isCorrect && (
                        <motion.span
                          initial={{ scale: 0.5, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 22, delay: 0.38 + index * 0.07 }}
                          className="text-[10px] font-extrabold text-emerald-400/80 bg-emerald-400/10 border border-emerald-400/18 px-1.5 py-0.5 rounded-md flex-shrink-0"
                        >
                          {result.confidence}×
                        </motion.span>
                      )}

                      {/* Points badge */}
                      <span
                        className={[
                          'text-[11px] font-bold flex-shrink-0 tabular-nums',
                          result.isCorrect ? 'text-emerald-400' : 'text-white/18',
                        ].join(' ')}
                      >
                        {result.isCorrect ? `+${result.confidence}` : '0'} pts
                      </span>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Ensemble Draft */}
            {draftResult && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 26, delay: 0.38 + allConfidenceResults.length * 0.07 }}
              >
                <p className="text-[9px] text-white/25 uppercase tracking-[0.18em] mb-1.5 px-0.5 font-semibold">
                  Ensemble Draft
                </p>
                <div
                  className={[
                    'rounded-2xl px-3.5 py-3 flex items-center gap-3 border relative overflow-hidden',
                    draftResult.isCurrentPlayer
                      ? 'bg-oscar-gold/10 border-oscar-gold/28'
                      : 'bg-white/3 border-white/7',
                  ].join(' ')}
                >
                  {draftResult.isCurrentPlayer && (
                    <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-2xl bg-oscar-gold/50" />
                  )}

                  {/* Player color swatch */}
                  <div
                    className="w-9 h-9 rounded-xl flex-shrink-0 flex items-center justify-center"
                    style={{
                      background: draftResult.playerColor + '44',
                      border: `1px solid ${draftResult.playerColor}28`,
                    }}
                  >
                    <User
                      size={14}
                      className={draftResult.isCurrentPlayer ? 'text-oscar-gold' : 'text-white/30'}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p
                      className={[
                        'text-base font-bold leading-none truncate',
                        draftResult.isCurrentPlayer ? 'text-oscar-gold' : 'text-white/50',
                      ].join(' ')}
                    >
                      {draftResult.isCurrentPlayer ? 'You' : draftResult.playerName}
                    </p>
                    <p className="text-[11px] text-white/28 mt-0.5">
                      +{draftResult.points} ensemble pts
                    </p>
                  </div>

                  {draftResult.isCurrentPlayer && (
                    <motion.span
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 500, damping: 22, delay: 0.48 }}
                      className="text-[11px] font-extrabold text-oscar-gold/80 bg-oscar-gold/10 border border-oscar-gold/22 px-2 py-1 rounded-lg flex-shrink-0"
                    >
                      +{draftResult.points}
                    </motion.span>
                  )}
                </div>
              </motion.div>
            )}

          </div>

          {/* Auto-dismiss progress bar */}
          <div className="h-0.5 bg-white/6 rounded-full overflow-hidden mb-2.5">
            <motion.div
              className="h-full rounded-full"
              style={{
                background: scored
                  ? 'linear-gradient(90deg, #D4AF37, #F5E6A3)'
                  : 'rgba(255,255,255,0.25)',
              }}
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: DISMISS_MS / 1000, ease: 'linear' }}
            />
          </div>

          <p className="text-[10px] text-white/16 text-center tracking-wide">Tap anywhere to dismiss</p>
        </div>
      </motion.div>
    </motion.div>
  )
}
