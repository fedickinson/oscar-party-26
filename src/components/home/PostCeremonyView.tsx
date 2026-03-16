/**
 * PostCeremonyView — full post-ceremony analysis layout.
 *
 * Sections (in order):
 *   1. "The Night Is Over" header + winning player celebration + confetti
 *   2. ScoreTimeline (combined, ~220px tall)
 *   3. TurningPoints cards
 *   4. MiniTimelines (confidence, draft, bingo breakdowns)
 *   5. HeadToHead card — closest rivalry
 *   6. "Final Stretch" narrative — what happened in last 6 categories
 *
 * Receives all computed data as props — no Supabase calls here.
 */

import { Fragment, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, ChevronDown, Download, Grid3X3, Loader2, Share2, Swords, Trophy, TrendingUp } from 'lucide-react'
import confetti from 'canvas-confetti'
import Avatar from '../Avatar'
import ScoreTimeline from './ScoreTimeline'
import TurningPoints from './TurningPoints'
import MiniTimelines from './MiniTimelines'
import BingoCard from '../bingo/BingoCard'
import type { BingoMarkRow, BingoSquareRow, PlayerRow } from '../../types/database'
import type { ScoredPlayer } from '../../lib/scoring'
import type { TimelinePoint, TurningPoint as TurningPointType, HeadToHead } from '../../lib/timeline-utils'
import { AVATAR_CONFIGS } from '../../data/avatars'

interface Props {
  leaderboard: ScoredPlayer[]
  players: PlayerRow[]
  timeline: TimelinePoint[]
  turningPoints: TurningPointType[]
  headToHead: HeadToHead | null
  finalStretchNarrative: string
  confidenceData: Array<Record<string, number | string>>
  draftData: Array<Record<string, number | string>>
  onDownloadRecap?: () => void
  isGeneratingRecap?: boolean
  onShareResults?: () => void
  isCopied?: boolean
  bingoSquares?: (BingoSquareRow | null)[]
  bingoMarks?: BingoMarkRow[]
  bingoLines?: number[][]
}

function getPlayerColor(avatarId: string): string {
  const config = AVATAR_CONFIGS.find((a) => a.id === avatarId)
  return config?.colorPrimary ?? '#888888'
}

export default function PostCeremonyView({
  leaderboard,
  players,
  timeline,
  turningPoints,
  headToHead,
  finalStretchNarrative,
  confidenceData,
  draftData,
  onDownloadRecap,
  isGeneratingRecap,
  onShareResults,
  isCopied,
  bingoSquares,
  bingoMarks,
  bingoLines,
}: Props) {
  const confettiFired = useRef(false)
  const [bingoExpanded, setBingoExpanded] = useState(false)

  // Fire three-burst confetti cannon on mount
  useEffect(() => {
    if (confettiFired.current || leaderboard.length === 0) return
    confettiFired.current = true

    const goldDefaults = {
      ticks: 120,
      zIndex: 9999,
      colors: ['#D4AF37', '#FFD700', '#F5E6A3', '#ffffff', '#FFF8DC'],
      gravity: 0.85,
      scalar: 1.05,
    }

    // Burst 1: center cannon (immediate)
    confetti({
      ...goldDefaults,
      particleCount: 140,
      spread: 80,
      origin: { x: 0.5, y: 0.55 },
      startVelocity: 48,
    })

    // Burst 2: left cannon (t=400ms)
    setTimeout(() => {
      confetti({
        ...goldDefaults,
        particleCount: 90,
        spread: 65,
        angle: 60,
        origin: { x: 0.1, y: 0.65 },
        startVelocity: 42,
      })
    }, 400)

    // Burst 3: right cannon (t=700ms)
    setTimeout(() => {
      confetti({
        ...goldDefaults,
        particleCount: 90,
        spread: 65,
        angle: 120,
        origin: { x: 0.9, y: 0.65 },
        startVelocity: 42,
      })
    }, 700)

    // Final trailing burst (t=1200ms)
    setTimeout(() => {
      confetti({
        ...goldDefaults,
        particleCount: 60,
        spread: 90,
        origin: { x: 0.5, y: 0.4 },
        startVelocity: 32,
        scalar: 0.85,
      })
    }, 1200)
  }, [leaderboard])

  // Floating particle positions (deterministic so no hydration mismatch)
  const floatingParticles = [
    { x: '8%',  delay: 0,    duration: 5.2, size: 3 },
    { x: '18%', delay: 0.8,  duration: 6.8, size: 2 },
    { x: '28%', delay: 1.5,  duration: 4.9, size: 4 },
    { x: '42%', delay: 0.3,  duration: 7.1, size: 2 },
    { x: '55%', delay: 1.1,  duration: 5.6, size: 3 },
    { x: '68%', delay: 0.6,  duration: 6.3, size: 2 },
    { x: '78%', delay: 1.9,  duration: 5.0, size: 4 },
    { x: '88%', delay: 0.2,  duration: 6.7, size: 2 },
    { x: '92%', delay: 1.4,  duration: 4.8, size: 3 },
    { x: '35%', delay: 2.1,  duration: 7.4, size: 2 },
  ]

  const winners = leaderboard.filter((e) => e.rank === 1)
  const isTie = winners.length > 1

  // Rank medal colors for top 3
  const rankColors: Record<number, string> = {
    1: '#D4AF37',
    2: '#C0C0C0',
    3: '#CD7F32',
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="flex flex-col gap-6 pb-16 px-4 py-6 max-w-md mx-auto"
    >
      {/* ── Floating background particles ────────────────────────────────────── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        <AnimatePresence>
          {leaderboard.length > 0 && floatingParticles.map((p, i) => (
            <motion.div
              key={i}
              className="absolute bottom-0 rounded-full"
              style={{
                left: p.x,
                width: p.size,
                height: p.size,
                background: 'rgba(212,175,55,0.55)',
                boxShadow: '0 0 6px 1px rgba(212,175,55,0.35)',
              }}
              initial={{ y: '100dvh', opacity: 0 }}
              animate={{
                y: [0, -900],
                opacity: [0, 0.7, 0.7, 0],
              }}
              transition={{
                duration: p.duration,
                delay: p.delay,
                repeat: Infinity,
                repeatDelay: p.delay + 2.5,
                ease: 'easeOut',
              }}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* ── 1. Header ──────────────────────────────────────────────────────── */}
      <div className="text-center relative z-10">
        <motion.p
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.05 }}
          className="text-[10px] text-oscar-gold/55 uppercase tracking-[0.28em] mb-2"
        >
          98th Academy Awards
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="text-3xl font-extrabold text-white leading-tight"
        >
          Final Standings
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.18 }}
          className="text-xs text-white/30 mt-1.5 tracking-wide"
        >
          The night is over
        </motion.p>
      </div>

      {/* ── 2. Champion hero card ─────────────────────────────────────────── */}
      {winners.length > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.2 }}
          className="relative z-10 backdrop-blur-xl rounded-3xl overflow-hidden"
          style={isTie && winners.length >= 2 ? {
            background: 'linear-gradient(150deg, rgba(25,20,5,0.98) 0%, rgba(18,14,4,0.98) 50%, rgba(10,14,39,0.98) 100%)',
            border: '1px solid transparent',
            backgroundClip: 'padding-box',
            boxShadow: `0 0 90px 16px rgba(212,175,55,0.20), 0 0 48px 6px rgba(212,175,55,0.13), 0 8px 48px rgba(0,0,0,0.65), inset 0 0 0 1px rgba(212,175,55,0.45)`,
          } : {
            background: 'linear-gradient(150deg, rgba(25,20,5,0.98) 0%, rgba(18,14,4,0.98) 50%, rgba(10,14,39,0.98) 100%)',
            border: '1px solid rgba(212,175,55,0.5)',
            boxShadow: '0 0 80px 12px rgba(212,175,55,0.14), 0 0 40px 4px rgba(212,175,55,0.10), 0 8px 48px rgba(0,0,0,0.55)',
          }}
        >
          {/* Tie: dual-color side-split glow overlay */}
          {isTie && winners.length >= 2 && (
            <motion.div
              className="absolute inset-0 rounded-3xl pointer-events-none"
              style={{
                background: `linear-gradient(90deg, ${getPlayerColor(winners[0].player.avatar_id)}33 0%, transparent 45%, transparent 55%, ${getPlayerColor(winners[1].player.avatar_id)}33 100%)`,
              }}
              animate={{ opacity: [0.55, 1, 0.55] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
            />
          )}

          {/* Pulsing outer glow ring */}
          <motion.div
            className="absolute inset-0 rounded-3xl pointer-events-none"
            animate={isTie ? {
              boxShadow: [
                '0 0 40px 6px rgba(212,175,55,0.14)',
                '0 0 72px 18px rgba(212,175,55,0.28)',
                '0 0 40px 6px rgba(212,175,55,0.14)',
              ],
            } : {
              boxShadow: [
                '0 0 32px 4px rgba(212,175,55,0.10)',
                '0 0 56px 12px rgba(212,175,55,0.20)',
                '0 0 32px 4px rgba(212,175,55,0.10)',
              ],
            }}
            transition={{ duration: isTie ? 2.2 : 2.8, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Top accent bar — dual-color split for ties */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.55, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="h-0.5 origin-left"
            style={{
              background: isTie && winners.length >= 2
                ? `linear-gradient(90deg, transparent 0%, ${getPlayerColor(winners[0].player.avatar_id)} 15%, ${getPlayerColor(winners[0].player.avatar_id)}cc 42%, #F5E6A3 50%, ${getPlayerColor(winners[1].player.avatar_id)}cc 58%, ${getPlayerColor(winners[1].player.avatar_id)} 85%, transparent 100%)`
                : 'linear-gradient(90deg, transparent, #D4AF37 20%, #F5E6A3 50%, #D4AF37 80%, transparent)',
            }}
          />

          {/* Shimmer sweep — fires on mount */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'linear-gradient(108deg, transparent 20%, rgba(212,175,55,0.11) 48%, rgba(245,230,163,0.07) 52%, transparent 78%)',
            }}
            animate={{ x: ['-140%', '240%'] }}
            transition={{ duration: 1.3, delay: 0.55, ease: 'easeOut' }}
          />
          {/* Slow repeating shimmer — dual sweep for ties */}
          {isTie ? (
            <>
              <motion.div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'linear-gradient(108deg, transparent 30%, rgba(212,175,55,0.06) 50%, transparent 70%)',
                }}
                animate={{ x: ['-140%', '240%'] }}
                transition={{ duration: 2.8, delay: 2.8, repeat: Infinity, repeatDelay: 5.5, ease: 'easeInOut' }}
              />
              <motion.div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'linear-gradient(252deg, transparent 30%, rgba(212,175,55,0.05) 50%, transparent 70%)',
                }}
                animate={{ x: ['240%', '-140%'] }}
                transition={{ duration: 2.8, delay: 5.6, repeat: Infinity, repeatDelay: 5.5, ease: 'easeInOut' }}
              />
            </>
          ) : (
            <motion.div
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'linear-gradient(108deg, transparent 30%, rgba(212,175,55,0.06) 50%, transparent 70%)',
              }}
              animate={{ x: ['-140%', '240%'] }}
              transition={{ duration: 2.8, delay: 2.8, repeat: Infinity, repeatDelay: 4.5, ease: 'easeInOut' }}
            />
          )}

          {/* Radial gold glow at center */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse 70% 55% at 50% 30%, rgba(212,175,55,0.10) 0%, transparent 100%)',
            }}
          />

          <div className="relative z-10 p-6 text-center">
            {/* Champion badge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.7, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 20, delay: 0.3 }}
              className="flex justify-center mb-5"
            >
              {isTie ? (
                <motion.div
                  className="flex items-center gap-2 px-5 py-1.5 rounded-full"
                  animate={{ boxShadow: [
                    '0 0 18px 3px rgba(212,175,55,0.20)',
                    '0 0 30px 7px rgba(212,175,55,0.35)',
                    '0 0 18px 3px rgba(212,175,55,0.20)',
                  ]}}
                  transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                  style={{
                    background: 'linear-gradient(135deg, rgba(212,175,55,0.28) 0%, rgba(212,175,55,0.14) 100%)',
                    border: '1px solid rgba(212,175,55,0.55)',
                  }}
                >
                  <Trophy size={11} className="text-oscar-gold flex-shrink-0" />
                  <span className="text-[11px] font-extrabold text-oscar-gold uppercase tracking-[0.24em]">
                    Co-Champions
                  </span>
                  <Trophy size={11} className="text-oscar-gold flex-shrink-0" />
                </motion.div>
              ) : (
                <div
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full"
                  style={{
                    background: 'linear-gradient(135deg, rgba(212,175,55,0.22) 0%, rgba(212,175,55,0.10) 100%)',
                    border: '1px solid rgba(212,175,55,0.45)',
                    boxShadow: '0 0 16px 2px rgba(212,175,55,0.18)',
                  }}
                >
                  <Trophy size={10} className="text-oscar-gold" />
                  <span className="text-[10px] font-extrabold text-oscar-gold uppercase tracking-[0.22em]">
                    Tonight's Champion
                  </span>
                </div>
              )}
            </motion.div>

            {/* Avatar(s) with bloom glow */}
            <motion.div
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 320, damping: 22, delay: 0.38 }}
              className="flex justify-center mb-4"
            >
              {isTie ? (
                <div className="flex items-center justify-center gap-2">
                  {winners.map((w, idx) => {
                    // Each avatar pulse is phase-offset by half a cycle so they breathe in opposite sync
                    const phaseDelay = idx % 2 === 0 ? 0 : 1.2
                    const playerColor = getPlayerColor(w.player.avatar_id)
                    return (
                      <Fragment key={w.player.id}>
                        <div className="relative flex-shrink-0">
                          {/* Outer bloom — avatar's own color */}
                          <motion.div
                            className="absolute rounded-full pointer-events-none"
                            style={{
                              inset: '-14px',
                              background: `radial-gradient(circle, ${playerColor}55 0%, transparent 72%)`,
                              filter: 'blur(12px)',
                            }}
                            animate={{ opacity: [0.45, 1, 0.45] }}
                            transition={{ duration: 2.4, delay: phaseDelay, repeat: Infinity, ease: 'easeInOut' }}
                          />
                          {/* Avatar-colored ring pulse — phase-offset */}
                          <motion.div
                            className="absolute rounded-full pointer-events-none"
                            style={{
                              inset: '-4px',
                              border: `2px solid ${playerColor}99`,
                              borderRadius: '9999px',
                            }}
                            animate={{ opacity: [0.35, 0.9, 0.35], scale: [0.97, 1.04, 0.97] }}
                            transition={{ duration: 2.4, delay: phaseDelay, repeat: Infinity, ease: 'easeInOut' }}
                          />
                          <Avatar
                            avatarId={w.player.avatar_id}
                            size="lg"
                            emotion="happy"
                          />
                        </div>
                        {/* "TIE" label between the two avatars (only after first, before last) */}
                        {idx < winners.length - 1 && (
                          <div className="flex flex-col items-center gap-1 flex-shrink-0 px-1">
                            <div className="h-px w-5" style={{ background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.45), transparent)' }} />
                            <span
                              className="text-[9px] font-extrabold tracking-[0.30em] uppercase"
                              style={{ color: 'rgba(212,175,55,0.70)' }}
                            >
                              TIE
                            </span>
                            <div className="h-px w-5" style={{ background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.45), transparent)' }} />
                          </div>
                        )}
                      </Fragment>
                    )
                  })}
                </div>
              ) : (
                <div className="relative">
                  {/* Outer bloom */}
                  <motion.div
                    className="absolute rounded-full pointer-events-none"
                    style={{
                      inset: '-14px',
                      background: `radial-gradient(circle, ${getPlayerColor(winners[0].player.avatar_id)}55 0%, transparent 72%)`,
                      filter: 'blur(12px)',
                    }}
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  {/* Gold ring pulse */}
                  <motion.div
                    className="absolute rounded-full pointer-events-none"
                    style={{
                      inset: '-5px',
                      border: '2px solid rgba(212,175,55,0.55)',
                      borderRadius: '9999px',
                    }}
                    animate={{ opacity: [0.4, 0.85, 0.4], scale: [0.97, 1.03, 0.97] }}
                    transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                  />
                  <Avatar avatarId={winners[0].player.avatar_id} size="xl" emotion="happy" />
                </div>
              )}
            </motion.div>

            {/* Winner name(s) */}
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.5 }}
              className="text-2xl font-extrabold text-white leading-tight"
            >
              {winners.map((w) => w.player.name).join(' & ')}
            </motion.p>

            {/* Score */}
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22, delay: 0.58 }}
              className="mt-2 mb-5 flex flex-col items-center gap-1"
            >
              {isTie && (
                <div className="flex items-center gap-2 mb-0.5">
                  <div className="h-px w-8" style={{ background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.40))' }} />
                  <span className="text-[9px] font-extrabold tracking-[0.28em] uppercase" style={{ color: 'rgba(212,175,55,0.55)' }}>
                    tied at
                  </span>
                  <div className="h-px w-8" style={{ background: 'linear-gradient(90deg, rgba(212,175,55,0.40), transparent)' }} />
                </div>
              )}
              <div>
                <span
                  className="text-5xl font-black tabular-nums text-oscar-gold"
                  style={{ textShadow: '0 0 40px rgba(212,175,55,0.5), 0 0 80px rgba(212,175,55,0.2)' }}
                >
                  {winners[0].totalScore}
                </span>
                <span className="text-lg font-semibold text-oscar-gold/45 ml-2">points</span>
              </div>
            </motion.div>

            {/* Score breakdown chips (hidden on tie since each winner has different breakdowns) */}
            {!isTie && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.68 }}
              className="flex justify-center gap-2.5"
            >
              {[
                { label: 'Draft', value: winners[0].ensembleScore },
                { label: 'Picks', value: winners[0].confidenceScore },
                { label: 'Bingo', value: winners[0].bingoScore },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="flex flex-col items-center gap-1 rounded-xl px-3.5 py-2"
                  style={{
                    background: 'rgba(212,175,55,0.08)',
                    border: '1px solid rgba(212,175,55,0.20)',
                  }}
                >
                  <span className="text-[10px] text-oscar-gold/50 uppercase tracking-wide font-medium">{label}</span>
                  <span className="text-sm font-extrabold text-oscar-gold/90 tabular-nums">{value}</span>
                </div>
              ))}
            </motion.div>
            )}
          </div>

          {/* Bottom accent bar */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.55, delay: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="h-px origin-right"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.3) 50%, transparent)',
            }}
          />
        </motion.div>
      )}

      {/* ── 3. Full leaderboard ───────────────────────────────────────────── */}
      <section className="relative z-10">
        <p className="text-[10px] text-white/35 uppercase tracking-[0.18em] mb-3 font-medium">Full Standings</p>
        <div className="space-y-2">
          {leaderboard.map((entry, i) => {
            const medalColor = rankColors[entry.rank]
            const rankTied = leaderboard.filter((e) => e.rank === entry.rank).length > 1
            return (
              <motion.div
                key={entry.player.id}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 28, delay: 0.32 + i * 0.07 }}
                className={[
                  'flex items-center gap-3 px-3.5 py-3 rounded-2xl border relative overflow-hidden',
                  entry.rank === 1
                    ? 'bg-oscar-gold/8 border-oscar-gold/25'
                    : 'bg-white/4 border-white/7',
                ].join(' ')}
                style={
                  entry.rank === 1
                    ? { boxShadow: '0 0 24px 2px rgba(212,175,55,0.07)' }
                    : undefined
                }
              >
                {/* Left accent bar for top 3 — dual-color for tied entries */}
                {entry.rank <= 3 && (
                  <div
                    className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-2xl"
                    style={{
                      background: rankTied
                        ? `linear-gradient(180deg, ${medalColor}cc 0%, ${medalColor}66 50%, ${medalColor}cc 100%)`
                        : `linear-gradient(180deg, ${medalColor}88 0%, ${medalColor}33 100%)`,
                    }}
                  />
                )}

                {/* Rank badge — show "=" prefix for ties */}
                <div className="w-7 flex items-center justify-center flex-shrink-0">
                  {rankTied ? (
                    <div className="flex flex-col items-center leading-none">
                      <span
                        className="text-[8px] font-extrabold tracking-tight"
                        style={{ color: medalColor ?? 'rgba(212,175,55,0.65)', opacity: 0.75 }}
                      >
                        =
                      </span>
                      <span
                        className="text-[11px] font-extrabold tabular-nums"
                        style={{ color: medalColor ?? 'rgba(255,255,255,0.25)' }}
                      >
                        {entry.rank}
                      </span>
                    </div>
                  ) : medalColor ? (
                    <span
                      className="text-[11px] font-extrabold tabular-nums"
                      style={{ color: medalColor }}
                    >
                      {entry.rank}
                    </span>
                  ) : (
                    <span className="text-[11px] text-white/25 font-bold tabular-nums">{entry.rank}</span>
                  )}
                </div>

                <Avatar
                  avatarId={entry.player.avatar_id}
                  size="sm"
                  emotion={entry.rank === 1 ? 'happy' : 'neutral'}
                />

                <span className={[
                  'text-sm font-semibold flex-1 truncate',
                  entry.rank === 1 ? 'text-white' : 'text-white/65',
                ].join(' ')}>
                  {entry.player.name}
                </span>

                {/* Breakdown + total */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="flex flex-col items-end gap-0.5">
                    <p className="text-[9px] text-white/18 leading-none tracking-wide">D · C · B</p>
                    <p className="text-[10px] text-white/35 tabular-nums leading-none">
                      {entry.ensembleScore} · {entry.confidenceScore} · {entry.bingoScore}
                    </p>
                  </div>
                  <p className="text-base font-extrabold tabular-nums leading-none">
                    <span style={{ color: medalColor ?? 'rgba(255,255,255,0.85)' }}>
                      {entry.totalScore}
                    </span>
                    <span className="text-[10px] text-white/25 font-normal ml-0.5">pt</span>
                  </p>
                </div>
              </motion.div>
            )
          })}
        </div>
      </section>

      {/* ── 4. Score Timeline ──────────────────────────────────────────────── */}
      <div className="relative z-10">
        <ScoreTimeline timeline={timeline} players={players} />
      </div>

      {/* ── 5. Turning Points ──────────────────────────────────────────────── */}
      <div className="relative z-10">
        <TurningPoints turningPoints={turningPoints} />
      </div>

      {/* ── 6. Mini Timelines ──────────────────────────────────────────────── */}
      <div className="relative z-10">
        <MiniTimelines
          confidenceData={confidenceData}
          draftData={draftData}
          leaderboard={leaderboard}
          players={players}
        />
      </div>

      {/* ── 7. Head-to-Head ────────────────────────────────────────────────── */}
      {headToHead && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 28, delay: 0.5 }}
          className="relative z-10 bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-4"
        >
          <div className="flex items-center gap-2 mb-4">
            <div className="w-7 h-7 rounded-lg bg-oscar-gold/10 border border-oscar-gold/20 flex items-center justify-center flex-shrink-0">
              <Swords size={13} className="text-oscar-gold/80" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-white/40">
              Closest Rivalry
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 mb-4">
            {(() => {
              const playerA = players.find((p) => p.id === headToHead.playerA)
              const playerB = players.find((p) => p.id === headToHead.playerB)
              const colorA = getPlayerColor(playerA?.avatar_id ?? '')
              const colorB = getPlayerColor(playerB?.avatar_id ?? '')
              return (
                <>
                  <div className="text-center flex-1">
                    <div
                      className="w-12 h-12 rounded-full mx-auto mb-1.5 border-2 flex items-center justify-center"
                      style={{
                        background: `linear-gradient(135deg, ${colorA}, ${colorA}88)`,
                        borderColor: colorA + '55',
                        boxShadow: `0 0 16px 2px ${colorA}30`,
                      }}
                    >
                      <span className="text-sm font-bold text-white leading-none" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>
                        {(playerA?.name ?? 'U').charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs text-white/75 font-semibold truncate">
                      {playerA?.name ?? 'Unknown'}
                    </p>
                  </div>
                  <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                    <span className="text-[10px] font-extrabold text-white/30 tracking-widest">VS</span>
                  </div>
                  <div className="text-center flex-1">
                    <div
                      className="w-12 h-12 rounded-full mx-auto mb-1.5 border-2 flex items-center justify-center"
                      style={{
                        background: `linear-gradient(135deg, ${colorB}, ${colorB}88)`,
                        borderColor: colorB + '55',
                        boxShadow: `0 0 16px 2px ${colorB}30`,
                      }}
                    >
                      <span className="text-sm font-bold text-white leading-none" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.4)' }}>
                        {(playerB?.name ?? 'U').charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs text-white/75 font-semibold truncate">
                      {playerB?.name ?? 'Unknown'}
                    </p>
                  </div>
                </>
              )
            })()}
          </div>
          <p className="text-sm text-white/60 text-center leading-relaxed">
            {headToHead.narrative}
          </p>
        </motion.div>
      )}

      {/* ── 6. Final Stretch Narrative ─────────────────────────────────────── */}
      {finalStretchNarrative && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 28, delay: 0.6 }}
          className="relative z-10 bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-4"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 rounded-lg bg-oscar-gold/10 border border-oscar-gold/20 flex items-center justify-center flex-shrink-0">
              <TrendingUp size={13} className="text-oscar-gold/80" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-white/40">
              The Final Stretch
            </p>
          </div>
          <p className="text-sm text-white/65 leading-relaxed">{finalStretchNarrative}</p>
        </motion.div>
      )}

      {/* ── 8. My Bingo Card ───────────────────────────────────────── */}
      {bingoSquares && bingoSquares.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 28, delay: 0.65 }}
          className="relative z-10 bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl overflow-hidden"
        >
          {/* Header row — tappable toggle */}
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={() => setBingoExpanded((v) => !v)}
            className="w-full flex items-center gap-2 px-4 py-3.5"
          >
            <div className="w-7 h-7 rounded-lg bg-oscar-gold/10 border border-oscar-gold/20 flex items-center justify-center flex-shrink-0">
              <Grid3X3 size={13} className="text-oscar-gold/80" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-white/40 flex-1 text-left">
              My Bingo Card
            </p>
            {(bingoLines?.length ?? 0) > 0 && (
              <span className="text-[10px] font-bold text-oscar-gold/70 tabular-nums mr-1">
                {bingoLines!.length} {bingoLines!.length === 1 ? 'Bingo' : 'Bingos'}
              </span>
            )}
            <motion.div
              animate={{ rotate: bingoExpanded ? 180 : 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            >
              <ChevronDown size={15} className="text-white/30" />
            </motion.div>
          </motion.button>

          {/* Collapsible card */}
          <AnimatePresence initial={false}>
            {bingoExpanded && (
              <motion.div
                key="bingo-card-panel"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                style={{ overflow: 'hidden' }}
              >
                <div className="px-3 pb-4 flex justify-center">
                  <BingoCard
                    squares={bingoSquares}
                    marks={bingoMarks ?? []}
                    bingoLines={bingoLines ?? []}
                    disabled
                    selectedIndex={null}
                    onSelect={() => {}}
                    onDeselect={() => {}}
                    onConfirm={async () => {}}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* ── 7. Share + Download Buttons ──────────────────────────────── */}
      {(onDownloadRecap || onShareResults) && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 28, delay: 0.7 }}
          className="relative z-10 flex flex-col gap-3 pt-1"
        >
          {onShareResults && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={onShareResults}
              className={[
                'w-full flex items-center justify-center gap-2.5 px-6 py-4 rounded-2xl border font-semibold text-sm transition-all',
                isCopied
                  ? 'bg-green-500/15 border-green-500/40 text-green-400'
                  : 'bg-oscar-gold/15 border-oscar-gold/35 text-oscar-gold hover:bg-oscar-gold/22 active:bg-oscar-gold/28',
              ].join(' ')}
              style={
                !isCopied
                  ? { boxShadow: '0 0 20px 2px rgba(212,175,55,0.08)' }
                  : { boxShadow: '0 0 20px 2px rgba(34,197,94,0.10)' }
              }
            >
              {isCopied ? <Check size={16} /> : <Share2 size={16} />}
              {isCopied ? 'Copied to clipboard!' : 'Share Results'}
            </motion.button>
          )}
          {onDownloadRecap && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={onDownloadRecap}
              disabled={isGeneratingRecap}
              className={[
                'w-full flex items-center justify-center gap-2.5 px-6 py-4 rounded-2xl border font-semibold text-sm transition-colors',
                isGeneratingRecap
                  ? 'bg-white/3 border-white/8 text-white/25 cursor-not-allowed'
                  : 'bg-white/5 border-white/10 text-white/55 hover:bg-white/8 hover:text-white/70 active:bg-white/12',
              ].join(' ')}
            >
              {isGeneratingRecap ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Download size={16} />
              )}
              {isGeneratingRecap ? 'Generating PDF...' : "Download Night's Recap"}
            </motion.button>
          )}
        </motion.div>
      )}

    </motion.div>
  )
}
