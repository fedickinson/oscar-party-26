/**
 * Results — final standings page (phase: finished).
 *
 * Reached when Admin sets room phase to 'finished' (all 24 categories
 * announced). All players navigate here simultaneously via Realtime.
 *
 * SECTIONS:
 *   1. Winner celebration — #1 player's avatar (xl, happy) with confetti
 *   2. Full leaderboard — all players with score breakdown
 *   3. Fun stats — four derived statistics from the scoring data
 *   4. Host CTA — "Continue to Hot Takes" advances phase to hot_takes
 *
 * FUN STATS:
 *   Biggest Whiff  — highest-confidence pick that was wrong (brutal)
 *   Bold Call      — correct pick that nobody else in the room made
 *   Bingo Champion — player with the highest bingo score
 *   Top Drafter    — player with the highest fantasy draft score
 *
 * PHASE NAVIGATION:
 *   useRoomSubscription keeps room fresh. When host triggers hot_takes,
 *   all clients see room.phase change and navigate to /hot-take.
 *
 * CONFETTI:
 *   canvas-confetti fires once when leaderboard data first loads.
 *   A ref guards against re-fires on re-renders.
 */

import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Crown, MessageSquare } from 'lucide-react'
import confetti from 'canvas-confetti'
import { useGame } from '../context/GameContext'
import { useRoomSubscription } from '../hooks/useRoom'
import { useScores } from '../hooks/useScores'
import { supabase } from '../lib/supabase'
import Avatar from '../components/Avatar'
import type { ScoredPlayer } from '../lib/scoring'

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  playerName,
  avatarId,
  detail,
  index,
}: {
  label: string
  playerName: string
  avatarId: string
  detail: string
  index: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 + index * 0.12, duration: 0.3 }}
      className="backdrop-blur-lg bg-white/6 border border-white/10 rounded-xl px-3.5 py-3"
    >
      <p className="text-[10px] text-white/30 uppercase tracking-wider mb-2">{label}</p>
      <div className="flex items-center gap-2.5">
        <Avatar avatarId={avatarId} size="sm" emotion="neutral" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white truncate">{playerName}</p>
          <p className="text-xs text-white/45 leading-tight">{detail}</p>
        </div>
      </div>
    </motion.div>
  )
}

// ─── Leaderboard row ──────────────────────────────────────────────────────────

function LeaderboardRow({
  entry,
  rank,
  index,
}: {
  entry: ScoredPlayer
  rank: number
  index: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.3 + index * 0.08, duration: 0.25 }}
      className={[
        'flex items-center gap-3 px-3.5 py-3 rounded-xl border',
        rank === 1
          ? 'bg-oscar-gold/10 border-oscar-gold/30'
          : 'bg-white/5 border-white/8',
      ].join(' ')}
    >
      {/* Rank */}
      <div className="w-5 flex items-center justify-center flex-shrink-0">
        {rank === 1 ? (
          <Crown size={15} className="text-oscar-gold" />
        ) : (
          <span className="text-xs text-white/30 font-mono">{rank}</span>
        )}
      </div>

      <Avatar avatarId={entry.player.avatar_id} size="sm" emotion={rank === 1 ? 'happy' : 'neutral'} />

      <span className={[
        'text-sm font-medium flex-1 truncate',
        rank === 1 ? 'text-white' : 'text-white/75',
      ].join(' ')}>
        {entry.player.name}
      </span>

      <div className="flex items-center gap-3 flex-shrink-0 text-right">
        <div className="hidden sm:block space-y-0">
          <p className="text-[10px] text-white/25 leading-none">F·C·B</p>
          <p className="text-xs text-white/45 tabular-nums">
            {entry.fantasyScore}·{entry.confidenceScore}·{entry.bingoScore}
          </p>
        </div>
        <p className={[
          'text-base font-bold tabular-nums',
          rank === 1 ? 'text-oscar-gold' : 'text-white',
        ].join(' ')}>
          {entry.totalScore}
          <span className="text-xs text-white/30 font-normal ml-0.5">pt</span>
        </p>
      </div>
    </motion.div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Results() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { room, player, loading } = useGame()
  const confettiFired = useRef(false)
  const [isAdvancing, setIsAdvancing] = useState(false)

  useRoomSubscription(room?.id)

  const { leaderboard, categories, nominees, confidencePicks, isLoading } = useScores(room?.id)

  // Phase navigation
  useEffect(() => {
    if (!room || !code) return
    if (room.phase === 'hot_takes') navigate(`/room/${code}/hot-take`)
    if (room.phase === 'morning_after') navigate(`/room/${code}/morning-after`)
  }, [room?.phase, code, navigate])

  useEffect(() => {
    if (!loading && !player) navigate('/')
  }, [loading, player, navigate])

  // Winner confetti — fires once when leaderboard loads
  useEffect(() => {
    if (!isLoading && leaderboard.length > 0 && !confettiFired.current) {
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
    }
  }, [isLoading, leaderboard])

  if (loading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-oscar-gold border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!room || !player) return null

  const winner = leaderboard[0]
  const isHost = player.is_host

  // ── Fun stats ────────────────────────────────────────────────────────────────

  // Biggest Whiff: highest confidence pick that was wrong
  const biggestWhiff = [...confidencePicks]
    .filter((p) => p.is_correct === false)
    .sort((a, b) => b.confidence - a.confidence)[0]

  const whiffPlayer = biggestWhiff
    ? leaderboard.find((e) => e.player.id === biggestWhiff.player_id)
    : undefined
  const whiffCategory = biggestWhiff
    ? categories.find((c) => c.id === biggestWhiff.category_id)
    : undefined

  // Bold Call: correct pick where this player was the only one correct in that category
  const correctCountByCategory = new Map<number, number>()
  confidencePicks
    .filter((p) => p.is_correct === true)
    .forEach((p) => {
      correctCountByCategory.set(p.category_id, (correctCountByCategory.get(p.category_id) ?? 0) + 1)
    })

  const boldCall = [...confidencePicks]
    .filter((p) => p.is_correct === true && (correctCountByCategory.get(p.category_id) ?? 0) === 1)
    .sort((a, b) => b.confidence - a.confidence)[0]

  const boldCallPlayer = boldCall
    ? leaderboard.find((e) => e.player.id === boldCall.player_id)
    : undefined
  const boldCallCategory = boldCall
    ? categories.find((c) => c.id === boldCall.category_id)
    : undefined
  const boldCallWinner = boldCall
    ? nominees.find((n) => n.id === categories.find((c) => c.id === boldCall.category_id)?.winner_id)
    : undefined

  // Bingo Champion: highest bingo score
  const bingoChamp = [...leaderboard].sort((a, b) => b.bingoScore - a.bingoScore)[0]

  // Top Drafter: highest fantasy score
  const topDrafter = [...leaderboard].sort((a, b) => b.fantasyScore - a.fantasyScore)[0]

  // ── Host action ───────────────────────────────────────────────────────────────

  async function continueToHotTakes() {
    if (!room || !isHost) return
    setIsAdvancing(true)
    await supabase.from('rooms').update({ phase: 'hot_takes' }).eq('id', room.id)
    // Navigation happens via Realtime subscription above
    setIsAdvancing(false)
  }

  return (
    <div className="flex flex-col gap-6 pb-12">

      {/* Header */}
      <div className="text-center pt-2">
        <p className="text-xs text-white/40 uppercase tracking-widest mb-1">Final Standings</p>
        <h1 className="text-2xl font-bold text-white">Gold Standard</h1>
        <p className="text-xs text-white/30 mt-1">98th Academy Awards</p>
      </div>

      {/* Winner celebration */}
      {winner && (
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 24, delay: 0.15 }}
          className="backdrop-blur-lg bg-oscar-gold/10 border border-oscar-gold/30 rounded-2xl p-6 text-center"
        >
          <p className="text-xs text-oscar-gold/60 uppercase tracking-widest mb-4">
            Winner
          </p>
          <div className="flex justify-center mb-3">
            <Avatar
              avatarId={winner.player.avatar_id}
              size="xl"
              emotion="happy"
            />
          </div>
          <p className="text-xl font-bold text-white mt-2">{winner.player.name}</p>
          <p className="text-3xl font-black text-oscar-gold tabular-nums mt-1">
            {winner.totalScore}
            <span className="text-base font-medium text-oscar-gold/60 ml-1">points</span>
          </p>
          <div className="flex justify-center gap-4 mt-3 text-xs text-white/40">
            <span>Fantasy {winner.fantasyScore}pt</span>
            <span>·</span>
            <span>Confidence {winner.confidenceScore}pt</span>
            <span>·</span>
            <span>Bingo {winner.bingoScore}pt</span>
          </div>
        </motion.div>
      )}

      {/* Full leaderboard */}
      <section>
        <p className="text-xs text-white/30 uppercase tracking-widest mb-3">
          Full Standings
        </p>
        <div className="space-y-2">
          {leaderboard.map((entry, i) => (
            <LeaderboardRow key={entry.player.id} entry={entry} rank={i + 1} index={i} />
          ))}
        </div>
        <p className="text-[10px] text-white/20 text-center mt-2">
          F = Fantasy · C = Confidence · B = Bingo
        </p>
      </section>

      {/* Fun stats */}
      <section>
        <p className="text-xs text-white/30 uppercase tracking-widest mb-3">
          Stats of the Night
        </p>
        <div className="grid grid-cols-1 gap-2">
          {whiffPlayer && whiffCategory && (
            <StatCard
              label="Biggest Whiff"
              playerName={whiffPlayer.player.name}
              avatarId={whiffPlayer.player.avatar_id}
              detail={`Confidence ${biggestWhiff.confidence} on ${whiffCategory.name} — wrong`}
              index={0}
            />
          )}
          {boldCallPlayer && boldCallCategory && (
            <StatCard
              label="Bold Call"
              playerName={boldCallPlayer.player.name}
              avatarId={boldCallPlayer.player.avatar_id}
              detail={`Only one to call ${boldCallWinner?.name ?? boldCallCategory.name}`}
              index={1}
            />
          )}
          {bingoChamp && bingoChamp.bingoScore > 0 && (
            <StatCard
              label="Bingo Champion"
              playerName={bingoChamp.player.name}
              avatarId={bingoChamp.player.avatar_id}
              detail={`${bingoChamp.bingoScore} bingo points`}
              index={2}
            />
          )}
          {topDrafter && topDrafter.fantasyScore > 0 && (
            <StatCard
              label="Top Drafter"
              playerName={topDrafter.player.name}
              avatarId={topDrafter.player.avatar_id}
              detail={`${topDrafter.fantasyScore} fantasy points`}
              index={3}
            />
          )}
        </div>
      </section>

      {/* Host CTA */}
      {isHost && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="space-y-3"
        >
          <div className="backdrop-blur-lg bg-white/6 border border-white/10 rounded-2xl p-4 text-center">
            <p className="text-sm text-white/60">
              Ready to share hot takes and get AI analysis?
            </p>
          </div>
          <motion.button
            onClick={continueToHotTakes}
            disabled={isAdvancing}
            whileTap={!isAdvancing ? { scale: 0.97 } : undefined}
            className={[
              'w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2.5',
              !isAdvancing
                ? 'bg-oscar-gold text-deep-navy'
                : 'bg-white/10 text-white/30 cursor-not-allowed',
            ].join(' ')}
          >
            {isAdvancing ? (
              <div className="w-5 h-5 border-2 border-deep-navy/40 border-t-deep-navy rounded-full animate-spin" />
            ) : (
              <>
                <MessageSquare size={16} />
                Continue to Hot Takes
              </>
            )}
          </motion.button>
        </motion.div>
      )}

      {!isHost && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="flex items-center justify-center gap-2 py-4"
        >
          <div className="w-5 h-5 border-2 border-oscar-gold/40 border-t-oscar-gold rounded-full animate-spin" />
          <p className="text-sm text-white/40">Waiting for host to continue…</p>
        </motion.div>
      )}
    </div>
  )
}
