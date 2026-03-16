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

import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, Download, Loader2, Share2, Swords, Trophy, TrendingUp } from 'lucide-react'
import confetti from 'canvas-confetti'
import Avatar from '../Avatar'
import ScoreTimeline from './ScoreTimeline'
import TurningPoints from './TurningPoints'
import MiniTimelines from './MiniTimelines'
import type { PlayerRow } from '../../types/database'
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
}: Props) {
  const confettiFired = useRef(false)

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

  const winner = leaderboard[0]

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
      {winner && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.2 }}
          className="relative z-10 backdrop-blur-xl rounded-3xl overflow-hidden"
          style={{
            background: 'linear-gradient(150deg, rgba(25,20,5,0.98) 0%, rgba(18,14,4,0.98) 50%, rgba(10,14,39,0.98) 100%)',
            border: '1px solid rgba(212,175,55,0.5)',
            boxShadow: '0 0 80px 12px rgba(212,175,55,0.14), 0 0 40px 4px rgba(212,175,55,0.10), 0 8px 48px rgba(0,0,0,0.55)',
          }}
        >
          {/* Pulsing outer glow ring */}
          <motion.div
            className="absolute inset-0 rounded-3xl pointer-events-none"
            animate={{
              boxShadow: [
                '0 0 32px 4px rgba(212,175,55,0.10)',
                '0 0 56px 12px rgba(212,175,55,0.20)',
                '0 0 32px 4px rgba(212,175,55,0.10)',
              ],
            }}
            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
          />

          {/* Top accent bar */}
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.55, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="h-0.5 origin-left"
            style={{
              background: 'linear-gradient(90deg, transparent, #D4AF37 20%, #F5E6A3 50%, #D4AF37 80%, transparent)',
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
          {/* Slow repeating shimmer */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'linear-gradient(108deg, transparent 30%, rgba(212,175,55,0.06) 50%, transparent 70%)',
            }}
            animate={{ x: ['-140%', '240%'] }}
            transition={{ duration: 2.8, delay: 2.8, repeat: Infinity, repeatDelay: 4.5, ease: 'easeInOut' }}
          />

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
            </motion.div>

            {/* Avatar with bloom glow */}
            <motion.div
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 320, damping: 22, delay: 0.38 }}
              className="flex justify-center mb-4"
            >
              <div className="relative">
                {/* Outer bloom */}
                <motion.div
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    inset: '-14px',
                    background: `radial-gradient(circle, ${getPlayerColor(winner.player.avatar_id)}55 0%, transparent 72%)`,
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
                <Avatar avatarId={winner.player.avatar_id} size="xl" emotion="happy" />
              </div>
            </motion.div>

            {/* Winner name */}
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.5 }}
              className="text-2xl font-extrabold text-white leading-tight"
            >
              {winner.player.name}
            </motion.p>

            {/* Score */}
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 22, delay: 0.58 }}
              className="mt-2 mb-5"
            >
              <span
                className="text-5xl font-black tabular-nums text-oscar-gold"
                style={{ textShadow: '0 0 40px rgba(212,175,55,0.5), 0 0 80px rgba(212,175,55,0.2)' }}
              >
                {winner.totalScore}
              </span>
              <span className="text-lg font-semibold text-oscar-gold/45 ml-2">points</span>
            </motion.div>

            {/* Score breakdown chips */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.68 }}
              className="flex justify-center gap-2.5"
            >
              {[
                { label: 'Draft', value: winner.ensembleScore },
                { label: 'Picks', value: winner.confidenceScore },
                { label: 'Bingo', value: winner.bingoScore },
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
            const rank = i + 1
            const medalColor = rankColors[rank]
            return (
              <motion.div
                key={entry.player.id}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 28, delay: 0.32 + i * 0.07 }}
                className={[
                  'flex items-center gap-3 px-3.5 py-3 rounded-2xl border relative overflow-hidden',
                  i === 0
                    ? 'bg-oscar-gold/8 border-oscar-gold/25'
                    : 'bg-white/4 border-white/7',
                ].join(' ')}
                style={
                  i === 0
                    ? { boxShadow: '0 0 24px 2px rgba(212,175,55,0.07)' }
                    : undefined
                }
              >
                {/* Left accent bar for top 3 */}
                {rank <= 3 && (
                  <div
                    className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-2xl"
                    style={{
                      background: `linear-gradient(180deg, ${medalColor}88 0%, ${medalColor}33 100%)`,
                    }}
                  />
                )}

                {/* Rank badge */}
                <div className="w-6 flex items-center justify-center flex-shrink-0">
                  {medalColor ? (
                    <span
                      className="text-[11px] font-extrabold tabular-nums"
                      style={{ color: medalColor }}
                    >
                      {rank}
                    </span>
                  ) : (
                    <span className="text-[11px] text-white/25 font-bold tabular-nums">{rank}</span>
                  )}
                </div>

                <Avatar
                  avatarId={entry.player.avatar_id}
                  size="sm"
                  emotion={i === 0 ? 'happy' : 'neutral'}
                />

                <span className={[
                  'text-sm font-semibold flex-1 truncate',
                  i === 0 ? 'text-white' : 'text-white/65',
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
