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
import { motion } from 'framer-motion'
import { Crown, Download, Loader2, Swords, TrendingUp } from 'lucide-react'
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
}: Props) {
  const confettiFired = useRef(false)

  // Fire confetti once on mount
  useEffect(() => {
    if (confettiFired.current || leaderboard.length === 0) return
    confettiFired.current = true
    const defaults = {
      startVelocity: 40,
      spread: 55,
      ticks: 90,
      zIndex: 9999,
      colors: ['#D4AF37', '#FFD700', '#FFF8DC', '#ffffff', '#9333ea'],
    }
    setTimeout(() => {
      confetti({ ...defaults, origin: { x: 0.2, y: 0.7 }, angle: 70, particleCount: 50 })
      confetti({ ...defaults, origin: { x: 0.8, y: 0.7 }, angle: 110, particleCount: 50 })
    }, 400)
  }, [leaderboard])

  const winner = leaderboard[0]

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
      className="flex flex-col gap-6 pb-16 px-4 py-6 max-w-md mx-auto"
    >
      {/* ── 1. Header + Winner Celebration ──────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
        className="text-center"
      >
        <p className="text-[10px] text-oscar-gold/50 uppercase tracking-[0.25em] mb-1.5">
          98th Academy Awards
        </p>
        <h1 className="text-3xl font-extrabold text-white leading-tight">Final Standings</h1>
        <p className="text-xs text-white/30 mt-1.5 tracking-wide">The night is over</p>
      </motion.div>

      {winner && (
        <motion.div
          initial={{ opacity: 0, scale: 0.82, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 24, delay: 0.15 }}
          className="relative backdrop-blur-xl border border-oscar-gold/35 rounded-3xl p-6 text-center overflow-hidden"
          style={{
            background: 'linear-gradient(150deg, rgba(212,175,55,0.12) 0%, rgba(212,175,55,0.05) 60%, rgba(10,14,39,0.6) 100%)',
            boxShadow: '0 0 48px 6px rgba(212,175,55,0.10), 0 4px 32px rgba(0,0,0,0.35)',
          }}
        >
          {/* Gold shimmer sweep */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'linear-gradient(110deg, transparent 25%, rgba(212,175,55,0.09) 50%, transparent 75%)',
            }}
            animate={{ x: ['-140%', '240%'] }}
            transition={{ duration: 2.0, delay: 0.5, ease: 'easeOut' }}
          />
          <div className="relative z-10">
            <p className="text-[10px] text-oscar-gold/55 uppercase tracking-[0.2em] mb-4">
              Tonight's Champion
            </p>
            <div className="flex justify-center mb-3">
              <div className="relative">
                <div
                  className="absolute inset-0 rounded-full blur-xl opacity-50"
                  style={{ background: getPlayerColor(winner.player.avatar_id), transform: 'scale(1.3)' }}
                />
                <Avatar avatarId={winner.player.avatar_id} size="xl" emotion="happy" />
              </div>
            </div>
            <p className="text-2xl font-extrabold text-white mt-2 leading-tight">
              {winner.player.name}
            </p>
            <p className="text-4xl font-black text-oscar-gold tabular-nums mt-2 leading-none">
              {winner.totalScore}
              <span className="text-lg font-semibold text-oscar-gold/50 ml-1.5">points</span>
            </p>
            <div className="flex justify-center gap-3 mt-4">
              {[
                { label: 'Draft', value: winner.ensembleScore },
                { label: 'Picks', value: winner.confidenceScore },
                { label: 'Bingo', value: winner.bingoScore },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="flex flex-col items-center gap-0.5 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5"
                >
                  <span className="text-[10px] text-white/35 uppercase tracking-wide">{label}</span>
                  <span className="text-sm font-bold text-white/80 tabular-nums">{value}</span>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      )}

      {/* Full leaderboard */}
      <section>
        <p className="text-[10px] text-white/30 uppercase tracking-[0.15em] mb-3">Full Standings</p>
        <div className="space-y-2">
          {leaderboard.map((entry, i) => (
            <motion.div
              key={entry.player.id}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 28, delay: 0.28 + i * 0.07 }}
              className={[
                'flex items-center gap-3 px-3.5 py-3 rounded-2xl border',
                i === 0
                  ? 'bg-oscar-gold/10 border-oscar-gold/30'
                  : 'bg-white/5 border-white/8',
              ].join(' ')}
              style={
                i === 0
                  ? { boxShadow: '0 0 20px 2px rgba(212,175,55,0.08)' }
                  : undefined
              }
            >
              {/* Rank */}
              <div className="w-6 flex items-center justify-center flex-shrink-0">
                {i === 0 ? (
                  <Crown size={15} className="text-oscar-gold" />
                ) : (
                  <span className="text-xs text-white/30 font-bold tabular-nums">{i + 1}</span>
                )}
              </div>

              <Avatar avatarId={entry.player.avatar_id} size="sm" emotion={i === 0 ? 'happy' : 'neutral'} />

              <span className={[
                'text-sm font-semibold flex-1 truncate',
                i === 0 ? 'text-white' : 'text-white/70',
              ].join(' ')}>
                {entry.player.name}
              </span>

              {/* Breakdown chips — visible at all widths on mobile */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="flex flex-col items-end gap-0.5">
                  <p className="text-[9px] text-white/20 leading-none tracking-wide">D · C · B</p>
                  <p className="text-[10px] text-white/40 tabular-nums leading-none">
                    {entry.ensembleScore} · {entry.confidenceScore} · {entry.bingoScore}
                  </p>
                </div>
                <p className={[
                  'text-base font-extrabold tabular-nums leading-none',
                  i === 0 ? 'text-oscar-gold' : 'text-white/90',
                ].join(' ')}>
                  {entry.totalScore}
                  <span className="text-[10px] text-white/30 font-normal ml-0.5">pt</span>
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── 2. Score Timeline ──────────────────────────────────────────────── */}
      <ScoreTimeline timeline={timeline} players={players} />

      {/* ── 3. Turning Points ──────────────────────────────────────────────── */}
      <TurningPoints turningPoints={turningPoints} />

      {/* ── 4. Mini Timelines ──────────────────────────────────────────────── */}
      <MiniTimelines
        confidenceData={confidenceData}
        draftData={draftData}
        leaderboard={leaderboard}
        players={players}
      />

      {/* ── 5. Head-to-Head ────────────────────────────────────────────────── */}
      {headToHead && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 28, delay: 0.5 }}
          className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-4"
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
                      className="w-12 h-12 rounded-full mx-auto mb-1.5 border-2"
                      style={{
                        background: `linear-gradient(135deg, ${colorA}, ${colorA}88)`,
                        borderColor: colorA + '55',
                        boxShadow: `0 0 16px 2px ${colorA}30`,
                      }}
                    />
                    <p className="text-xs text-white/75 font-semibold truncate">
                      {playerA?.name ?? 'Unknown'}
                    </p>
                  </div>
                  <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                    <span className="text-xs font-extrabold text-white/25 tracking-widest">VS</span>
                  </div>
                  <div className="text-center flex-1">
                    <div
                      className="w-12 h-12 rounded-full mx-auto mb-1.5 border-2"
                      style={{
                        background: `linear-gradient(135deg, ${colorB}, ${colorB}88)`,
                        borderColor: colorB + '55',
                        boxShadow: `0 0 16px 2px ${colorB}30`,
                      }}
                    />
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
          className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-4"
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

      {/* ── 7. Download Recap Button ──────────────────────────────────── */}
      {onDownloadRecap && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 28, delay: 0.7 }}
          className="flex justify-center"
        >
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onDownloadRecap}
            disabled={isGeneratingRecap}
            className={[
              'flex items-center gap-2.5 px-6 py-3.5 rounded-2xl border font-semibold text-sm transition-colors',
              isGeneratingRecap
                ? 'bg-white/5 border-white/10 text-white/30 cursor-not-allowed'
                : 'bg-oscar-gold/12 border-oscar-gold/30 text-oscar-gold hover:bg-oscar-gold/18 active:bg-oscar-gold/25',
            ].join(' ')}
          >
            {isGeneratingRecap ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Download size={16} />
            )}
            {isGeneratingRecap ? 'Generating...' : 'Download Night\'s Recap'}
          </motion.button>
        </motion.div>
      )}

    </motion.div>
  )
}
