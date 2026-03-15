/**
 * Leaderboard — animated rank list for the live scoring panel.
 *
 * ANIMATIONS:
 *   - layout + layoutId on each row: when scores change and the leaderboard
 *     array re-sorts, rows smoothly slide to their new vertical position.
 *     layout="position" ensures only the y-coordinate animates — size/opacity
 *     are not affected by the layout engine.
 *   - AnimatedNumber: uses framer-motion's `animate()` fn with an `onUpdate`
 *     callback that directly writes to the span's textContent. This avoids
 *     React state updates during the animation (60fps, no re-renders).
 *   - Expand/collapse per row: AnimatePresence with height animation reveals
 *     Ensemble | Confidence | Bingo score breakdown.
 *
 * Current player's row gets a left gold border and "You" badge.
 * Rank badges: 1 → Crown(gold), 2 → silver dot, 3 → bronze dot, 4+ → number.
 */

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, animate } from 'framer-motion'
import { ChevronDown, Crown } from 'lucide-react'
import Avatar from '../Avatar'
import type { ScoredPlayer } from '../../lib/scoring'
import type { AvatarEmotion } from '../../lib/avatar-utils'

// ─── ScoreDeltaBadge ──────────────────────────────────────────────────────────

interface ActiveBadge {
  id: number
  playerId: string
  confidence: number // delta in confidence score
  draft: number      // delta in ensemble score
}

// Manages score-change badges: appears with spring animation, fades after 3s.
// Tracks previous scores to compute deltas; initializes silently on first render.
function useDeltaBadges(leaderboard: ScoredPlayer[]) {
  const [badges, setBadges] = useState<ActiveBadge[]>([])
  const prevRef = useRef<Map<string, { c: number; f: number }>>(new Map())
  const badgeIdRef = useRef(0)
  const initializedRef = useRef(false)

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true
      leaderboard.forEach((e) =>
        prevRef.current.set(e.player.id, {
          c: e.confidenceScore,
          f: e.ensembleScore,
        }),
      )
      return
    }

    const newBadges: ActiveBadge[] = []
    leaderboard.forEach((e) => {
      const prev = prevRef.current.get(e.player.id)
      if (prev) {
        const cDelta = e.confidenceScore - prev.c
        const fDelta = e.ensembleScore - prev.f
        if (cDelta !== 0 || fDelta !== 0) {
          newBadges.push({
            id: ++badgeIdRef.current,
            playerId: e.player.id,
            confidence: cDelta,
            draft: fDelta,
          })
        }
      }
      prevRef.current.set(e.player.id, { c: e.confidenceScore, f: e.ensembleScore })
    })

    if (newBadges.length > 0) {
      setBadges((prev) => [...prev, ...newBadges])
      newBadges.forEach((badge) => {
        setTimeout(() => {
          setBadges((prev) => prev.filter((b) => b.id !== badge.id))
        }, 3000)
      })
    }
  }, [leaderboard]) // eslint-disable-line react-hooks/exhaustive-deps

  return badges
}

function DeltaBadges({ badges }: { badges: ActiveBadge[] }) {
  return (
    <AnimatePresence>
      {badges.map((badge) => (
        <motion.span
          key={badge.id}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ type: 'spring', stiffness: 500, damping: 28 }}
          className="flex items-center gap-0.5"
        >
          {badge.confidence !== 0 && (
            <span className="text-[10px] font-bold text-blue-400 bg-blue-500/15 rounded px-1 py-0.5 leading-none">
              C{badge.confidence > 0 ? '+' : ''}
              {badge.confidence}
            </span>
          )}
          {badge.draft !== 0 && (
            <span className="text-[10px] font-bold text-purple-400 bg-purple-500/15 rounded px-1 py-0.5 leading-none">
              E{badge.draft > 0 ? '+' : ''}
              {badge.draft}
            </span>
          )}
        </motion.span>
      ))}
    </AnimatePresence>
  )
}

// ─── AnimatedNumber ───────────────────────────────────────────────────────────

function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const prevRef = useRef(value)

  useEffect(() => {
    const from = prevRef.current
    prevRef.current = value
    if (from === value || !ref.current) return

    const node = ref.current
    const controls = animate(from, value, {
      duration: 0.55,
      ease: 'easeOut',
      onUpdate(latest) {
        if (node) node.textContent = String(Math.round(latest))
      },
    })
    return () => controls.stop()
  }, [value])

  return (
    <span ref={ref} className={className}>
      {value}
    </span>
  )
}

// ─── RankBadge ────────────────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return <Crown size={16} className="text-oscar-gold flex-shrink-0" />
  }
  if (rank === 2) {
    return (
      <span className="w-4 h-4 rounded-full bg-gray-400/60 flex-shrink-0 inline-block" />
    )
  }
  if (rank === 3) {
    return (
      <span className="w-4 h-4 rounded-full bg-amber-700/60 flex-shrink-0 inline-block" />
    )
  }
  return (
    <span className="text-xs text-white/30 font-mono w-4 text-center flex-shrink-0">
      {rank}
    </span>
  )
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

interface Props {
  leaderboard: ScoredPlayer[]
  currentPlayerId: string
  /** Optional per-player emotion derived from recent game events. */
  playerEmotions?: Record<string, AvatarEmotion>
}

export default function Leaderboard({ leaderboard, currentPlayerId, playerEmotions }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const allBadges = useDeltaBadges(leaderboard)

  return (
    <div className="space-y-2">
      {leaderboard.map((entry, index) => {
        const isMe = entry.player.id === currentPlayerId
        const isExpanded = expanded === entry.player.id
        const rank = index + 1
        const playerBadges = allBadges.filter((b) => b.playerId === entry.player.id)

        return (
          <motion.div
            key={entry.player.id}
            layoutId={`lb-row-${entry.player.id}`}
            layout="position"
            transition={{ type: 'spring', stiffness: 300, damping: 32 }}
            className={[
              'backdrop-blur-lg rounded-xl overflow-hidden',
              isMe
                ? 'bg-oscar-gold/8 border border-oscar-gold/25 border-l-2 border-l-oscar-gold'
                : 'bg-white/6 border border-white/10',
            ].join(' ')}
          >
            {/* Main row */}
            <button
              onClick={() => setExpanded(isExpanded ? null : entry.player.id)}
              className="w-full flex items-center gap-3 px-3 py-3 text-left"
            >
              {/* Rank */}
              <div className="w-5 flex items-center justify-center flex-shrink-0">
                <RankBadge rank={rank} />
              </div>

              {/* Avatar + name */}
              <div className="flex items-center gap-2.5 flex-1 min-w-0">
                <Avatar
                  avatarId={entry.player.avatar_id}
                  size="sm"
                  emotion={playerEmotions?.[entry.player.id] ?? 'neutral'}
                />
                <span
                  className={[
                    'text-sm font-medium truncate',
                    isMe ? 'text-white' : 'text-white/80',
                  ].join(' ')}
                >
                  {isMe ? `${entry.player.name} (you)` : entry.player.name}
                </span>
              </div>

              {/* Total score + delta badges */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {playerBadges.length > 0 && <DeltaBadges badges={playerBadges} />}
                <AnimatedNumber
                  value={entry.totalScore}
                  className={[
                    'text-base font-bold tabular-nums',
                    rank === 1 ? 'text-oscar-gold' : 'text-white',
                  ].join(' ')}
                />
                <span className="text-xs text-white/30">pt</span>
                <motion.div
                  animate={{ rotate: isExpanded ? 180 : 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <ChevronDown size={14} className="text-white/30" />
                </motion.div>
              </div>
            </button>

            {/* Score breakdown */}
            <AnimatePresence initial={false}>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-3 pb-3 grid grid-cols-3 gap-2">
                    {[
                      { label: 'Ensemble', value: entry.ensembleScore },
                      { label: 'Confidence', value: entry.confidenceScore },
                      { label: 'Bingo', value: entry.bingoScore },
                    ].map(({ label, value }) => (
                      <div
                        key={label}
                        className="bg-white/5 rounded-lg px-2 py-2 text-center"
                      >
                        <p className="text-[10px] text-white/40 uppercase tracking-wider mb-1">
                          {label}
                        </p>
                        <AnimatedNumber
                          value={value}
                          className="text-sm font-bold text-white tabular-nums"
                        />
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )
      })}
    </div>
  )
}
