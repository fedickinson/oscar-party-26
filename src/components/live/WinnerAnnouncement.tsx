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
import { User } from 'lucide-react'
import confetti from 'canvas-confetti'
import { FilmIcon } from '../../lib/film-icons'
import { Hallmark } from '../ui/Hallmarks'

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
    const rootStyles = getComputedStyle(document.documentElement)
    const tokenColor = (token: string) => rootStyles.getPropertyValue(token).trim()
    const celebrationColors = [
      tokenColor('--t-wax'),
      tokenColor('--t-vellum-light'),
      tokenColor('--t-ornament'),
      tokenColor('--t-vellum-deep'),
    ]

    // Always fire a gentle burst for the announcement
    confetti({
      particleCount: scored ? 160 : 60,
      spread: scored ? 80 : 55,
      origin: { y: 0.5, x: 0.5 },
      colors: celebrationColors,
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
          colors: celebrationColors.slice(0, 3),
          startVelocity: 30,
          angle: 55,
        })
        confetti({
          particleCount: 55,
          spread: 60,
          origin: { y: 0.6, x: 0.85 },
          colors: celebrationColors.slice(0, 3),
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
      style={{ background: 'var(--t-overlay)', backdropFilter: 'blur(20px)' }}
      onClick={onDismiss}
    >
      <motion.div
        initial={{ scaleX: 0.96, scaleY: 0.2, opacity: 0, y: -12 }}
        animate={{ scaleX: 1, scaleY: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0, y: -16, transition: { duration: 0.22, ease: 'easeIn' } }}
        transition={{ type: 'spring', stiffness: 340, damping: 24, mass: 0.85 }}
        className="relative w-full max-w-sm origin-top"
        onClick={(e) => e.stopPropagation()}
      >
        <section
          className="material-vellum deckled scribe-ruled relief-raised relative max-h-[calc(100dvh-2rem)] overflow-y-auto px-5 pb-5 pt-6 text-center"
          style={{ color: 'var(--t-ink)' }}
          aria-label="Scoring result"
        >
          <div className="motif-band narrow mb-4" aria-hidden />

          <motion.div
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: scored ? 1 : 0.72 }}
            transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.1 }}
            className="wax-seal relief-seal"
          >
            <Hallmark id="hallmark-iron-throne" size={62} />
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.2 }}
            className="mb-2 text-[12px] font-extrabold uppercase tracking-[0.18em]"
            style={{ color: 'var(--t-ink-muted)' }}
          >
            {categoryName}
          </motion.p>

          <motion.h2
            initial={{ opacity: 0, scale: 0.78, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.16 }}
            className={[
              'font-display font-extrabold leading-tight',
              isTie ? 'text-[24px]' : 'text-[28px]',
            ].join(' ')}
          >
            {winnerName}
            {isTie && (
              <>
                <span
                  className="mx-1.5 text-[18px] font-normal"
                  style={{ color: 'var(--t-ink-muted)' }}
                >
                  &amp;
                </span>
                {tieWinnerName}
              </>
            )}
          </motion.h2>

          {isTie && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.22, duration: 0.2 }}
              className="mt-1.5 text-[10px] font-bold uppercase tracking-widest"
              style={{ color: 'var(--t-ink-muted)' }}
            >
              Tie
            </motion.p>
          )}

          {winnerFilm && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.26, duration: 0.22 }}
              className="mt-2 flex items-center justify-center gap-1.5 font-manuscript"
              style={{ color: 'var(--t-ink-muted)' }}
            >
              <FilmIcon filmName={winnerFilm} size={12} className="flex-shrink-0" />
              <p className="text-[16px] font-bold leading-tight">
                {winnerFilm}
                {isTie && tieWinnerFilm && tieWinnerFilm !== winnerFilm && (
                  <span> / {tieWinnerFilm}</span>
                )}
              </p>
            </motion.div>
          )}

          {(allConfidenceResults.length > 0 || draftResult) && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.28 }}
              className="relief-glass mt-5 space-y-4 p-3 text-left font-sans"
              style={{ color: 'var(--t-text)' }}
            >
              {allConfidenceResults.length > 0 && (
                <div>
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]"
                    style={{ color: 'var(--t-text-dim)' }}
                  >
                    Confidence Picks
                  </motion.p>

                  <div>
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
                        className="relative flex min-h-11 items-center gap-2.5 border-b px-1 py-2 last:border-b-0"
                        style={{ borderColor: 'var(--t-line-soft)' }}
                      >
                        {result.isCorrect && (
                          <div
                            className="absolute bottom-2 left-0 top-2 w-0.5"
                            style={{ background: 'var(--t-positive)' }}
                          />
                        )}

                        <div
                          className="h-3.5 w-3.5 flex-shrink-0 rounded-full"
                          style={{ background: result.playerColor, opacity: 0.8 }}
                        />

                        <div className="flex min-w-0 flex-1 items-baseline gap-1.5 overflow-hidden">
                          <span
                            className="flex-shrink-0 text-[13px] font-bold leading-none"
                            style={{ color: result.isCurrentPlayer ? 'var(--t-text)' : 'var(--t-text-muted)' }}
                          >
                            {result.isCurrentPlayer ? 'You' : result.playerName}
                          </span>
                          <span
                            className="truncate text-[11px] leading-none"
                            style={{ color: 'var(--t-text-dim)' }}
                          >
                            {'→ ' + result.pickedName}
                          </span>
                        </div>

                        {result.isCorrect && (
                          <motion.span
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 22, delay: 0.38 + index * 0.07 }}
                            className="flex-shrink-0 border px-1.5 py-0.5 text-[10px] font-extrabold tabular-nums"
                            style={{
                              background: 'var(--t-positive-soft)',
                              borderColor: 'var(--t-positive)',
                              color: 'var(--t-positive)',
                            }}
                          >
                            {result.confidence}×
                          </motion.span>
                        )}

                        <span
                          className="flex-shrink-0 text-[11px] font-bold tabular-nums"
                          style={{ color: result.isCorrect ? 'var(--t-positive)' : 'var(--t-negative)' }}
                        >
                          {result.isCorrect ? `+${result.confidence}` : '0'} pts
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {draftResult && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 26, delay: 0.38 + allConfidenceResults.length * 0.07 }}
                >
                  <p
                    className="mb-1.5 px-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]"
                    style={{ color: 'var(--t-text-dim)' }}
                  >
                    Ensemble Draft
                  </p>

                  <div
                    className="relative flex min-h-11 items-center gap-3 border-t px-1 pt-3"
                    style={{ borderColor: 'var(--t-line-soft)' }}
                  >
                    {draftResult.isCurrentPlayer && (
                      <div
                        className="absolute bottom-0 left-0 top-3 w-0.5"
                        style={{ background: 'var(--t-positive)' }}
                      />
                    )}

                    <div
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border"
                      style={{
                        background: draftResult.playerColor,
                        borderColor: 'var(--t-line-strong)',
                      }}
                    >
                      <User size={14} style={{ color: 'var(--t-text)' }} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-bold leading-none">
                        {draftResult.isCurrentPlayer ? 'You' : draftResult.playerName}
                      </p>
                      <p
                        className="mt-1 text-[11px] tabular-nums"
                        style={{ color: 'var(--t-text-dim)' }}
                      >
                        +{draftResult.points} ensemble pts
                      </p>
                    </div>

                    {draftResult.isCurrentPlayer && (
                      <motion.span
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: 'spring', stiffness: 500, damping: 22, delay: 0.48 }}
                        className="flex-shrink-0 border px-2 py-1 text-[11px] font-extrabold tabular-nums"
                        style={{
                          background: 'var(--t-positive-soft)',
                          borderColor: 'var(--t-positive)',
                          color: 'var(--t-positive)',
                        }}
                      >
                        +{draftResult.points}
                      </motion.span>
                    )}
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          <div
            className="mt-4 h-0.5 overflow-hidden rounded-full"
            style={{ background: 'var(--t-vellum-deep)' }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ background: scored ? 'var(--t-ink)' : 'var(--t-ink-muted)' }}
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: DISMISS_MS / 1000, ease: 'linear' }}
            />
          </div>

          <p
            className="mt-2.5 text-center text-[10px] tracking-wide"
            style={{ color: 'var(--t-ink-muted)' }}
          >
            Tap anywhere to dismiss
          </p>
        </section>
      </motion.div>
    </motion.div>
  )
}
