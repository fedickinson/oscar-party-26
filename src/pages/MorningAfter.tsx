/**
 * MorningAfter — AI analysis results page (phase: morning_after).
 *
 * LOADING STATE:
 *   While room.ai_analysis is null (host hasn't finished running analysis,
 *   or Realtime hasn't delivered the update yet) we show a pulsing
 *   Sparkles icon with a loading message. This covers the brief window
 *   between phase changing to morning_after and the JSON arriving.
 *
 * DATA:
 *   room.ai_analysis (jsonb) is cast as AnalysisResult — the type matches
 *   exactly what buildAnalysisPrompt instructs Claude to return.
 *
 * SECTIONS:
 *   1. Media Narrative — critical consensus summary in a newspaper-style card
 *   2. Player Analyses — one card per player with alignment ring + insights
 *   3. Awards — four special awards with staggered reveal (0.5s between each)
 *
 * ALIGNMENT RING:
 *   SVG circle using framer-motion's pathLength (0 → score/100).
 *   pathLength is a framer-motion SVG convenience: it manages
 *   strokeDasharray/strokeDashoffset automatically.
 *   Ring rotated -90deg so fill starts from 12 o'clock.
 *
 * ANIMATIONS:
 *   - Player cards stagger in at 0.3s intervals
 *   - Award cards stagger in at 0.5s intervals
 *   - Ring fills over 1.2s with easeOut
 */

import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Check, Crown, Flame, Sparkles, Target, Pen, X } from 'lucide-react'
import { useGame } from '../context/GameContext'
import { useRoomSubscription } from '../hooks/useRoom'
import Avatar from '../components/Avatar'
import type { AnalysisResult, PlayerAnalysis } from '../lib/ai-prompts'

// ─── Alignment ring ───────────────────────────────────────────────────────────

interface RingProps {
  score: number
  delay?: number
}

function AlignmentRing({ score, delay = 0 }: RingProps) {
  const color =
    score > 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444'
  const label =
    score > 70 ? 'In sync' : score >= 40 ? 'Independent' : 'Contrarian'

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-16 h-16 flex items-center justify-center">
        {/* SVG ring — rotate -90deg so progress starts from top */}
        <svg className="absolute inset-0 -rotate-90" width="64" height="64">
          {/* Track */}
          <circle
            cx="32" cy="32" r="26"
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="4"
          />
          {/* Animated fill */}
          <motion.circle
            cx="32" cy="32" r="26"
            fill="none"
            stroke={color}
            strokeWidth="4"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: score / 100 }}
            transition={{ duration: 1.2, ease: 'easeOut', delay }}
          />
        </svg>
        {/* Score label */}
        <span className="text-sm font-bold tabular-nums" style={{ color }}>
          {score}
        </span>
      </div>
      <span className="text-[10px] font-medium" style={{ color }}>
        {label}
      </span>
    </div>
  )
}

// ─── Player analysis card ─────────────────────────────────────────────────────

interface PlayerCardProps {
  analysis: PlayerAnalysis
  players: ReturnType<typeof useGame>['players']
  index: number
}

function PlayerAnalysisCard({ analysis, players, index }: PlayerCardProps) {
  const player = players.find((p) => p.name === analysis.player_name)
  const emotion = analysis.alignment_score > 70 ? 'happy' : 'neutral'

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.3, duration: 0.4, ease: 'easeOut' }}
      className="backdrop-blur-lg bg-white/8 border border-white/12 rounded-2xl p-4 space-y-4"
    >
      {/* Player header */}
      <div className="flex items-center gap-3">
        {player && (
          <Avatar
            avatarId={player.avatar_id}
            size="md"
            emotion={emotion}
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-white truncate">{analysis.player_name}</p>
        </div>
        <AlignmentRing score={analysis.alignment_score} delay={index * 0.3 + 0.5} />
      </div>

      {/* Standout insight */}
      {analysis.standout_insight && (
        <div className="bg-oscar-gold/8 border-l-2 border-oscar-gold/40 pl-3 py-1.5 rounded-r-lg">
          <p className="text-xs text-oscar-gold/80 italic leading-relaxed">
            "{analysis.standout_insight}"
          </p>
        </div>
      )}

      {/* Agreements */}
      {analysis.key_agreements.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-white/30 uppercase tracking-wider">
            Agreed with critics
          </p>
          {analysis.key_agreements.map((a, i) => (
            <div key={i} className="flex items-start gap-2">
              <Check size={12} className="text-emerald-400 mt-0.5 flex-shrink-0" strokeWidth={3} />
              <p className="text-xs text-white/65 leading-snug">{a}</p>
            </div>
          ))}
        </div>
      )}

      {/* Disagreements */}
      {analysis.key_disagreements.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-white/30 uppercase tracking-wider">
            Diverged from critics
          </p>
          {analysis.key_disagreements.map((d, i) => (
            <div key={i} className="flex items-start gap-2">
              <X size={12} className="text-red-400/70 mt-0.5 flex-shrink-0" strokeWidth={3} />
              <p className="text-xs text-white/65 leading-snug">{d}</p>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  )
}

// ─── Award card ───────────────────────────────────────────────────────────────

interface AwardCardProps {
  icon: React.ReactNode
  title: string
  playerName: string
  subtitle: string
  accentColor: string
  players: ReturnType<typeof useGame>['players']
  index: number
}

function AwardCard({
  icon,
  title,
  playerName,
  subtitle,
  accentColor,
  players,
  index,
}: AwardCardProps) {
  const player = players.find((p) => p.name === playerName)

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.5, duration: 0.4, ease: 'easeOut' }}
      className="backdrop-blur-lg bg-white/6 border border-white/10 rounded-2xl p-4"
      style={{ borderLeftWidth: 3, borderLeftColor: accentColor }}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{ backgroundColor: `${accentColor}20` }}
        >
          <div style={{ color: accentColor }}>{icon}</div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: accentColor }}>
            {title}
          </p>
          <div className="flex items-center gap-2 mb-1.5">
            {player && (
              <Avatar avatarId={player.avatar_id} size="sm" emotion="happy" />
            )}
            <p className="text-sm font-bold text-white">{playerName}</p>
          </div>
          <p className="text-xs text-white/55 leading-snug">{subtitle}</p>
        </div>
      </div>
    </motion.div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MorningAfter() {
  useParams<{ code: string }>()
  const navigate = useNavigate()
  const { room, player, players, loading } = useGame()

  useRoomSubscription(room?.id)

  useEffect(() => {
    if (!loading && !player) navigate('/')
  }, [loading, player, navigate])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-oscar-gold border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!room || !player) return null

  const analysis = room.ai_analysis as AnalysisResult | null

  // Waiting for analysis to land via Realtime
  if (!analysis) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 px-4 text-center">
        <motion.div
          animate={{ opacity: [0.4, 1, 0.4], scale: [0.95, 1.05, 0.95] }}
          transition={{ duration: 2.5, repeat: Infinity }}
        >
          <Sparkles size={40} className="text-oscar-gold" />
        </motion.div>
        <div className="space-y-1.5">
          <p className="text-lg font-bold text-white">Analyzing…</p>
          <p className="text-sm text-white/45">
            Comparing your takes against media coverage. This takes a moment.
          </p>
        </div>
      </div>
    )
  }

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  const awards = analysis.awards

  return (
    <div className="flex flex-col gap-6 pb-12">

      {/* Header */}
      <div className="text-center pt-2">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Sparkles size={14} className="text-oscar-gold" />
          <p className="text-xs text-white/40 uppercase tracking-widest">AI Analysis</p>
          <Sparkles size={14} className="text-oscar-gold" />
        </div>
        <h1 className="text-2xl font-bold text-white">The Morning After</h1>
        <p className="text-xs text-white/30 mt-1">{today}</p>
      </div>

      {/* Section 1 — Media Narrative */}
      <section>
        <p className="text-xs text-white/30 uppercase tracking-widest mb-3">
          Critical Consensus
        </p>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="backdrop-blur-lg bg-white/8 border border-white/12 rounded-2xl p-5"
        >
          {/* Newspaper-style header */}
          <div className="flex items-center gap-2 mb-3 pb-3 border-b border-white/10">
            <div className="h-px flex-1 bg-white/15" />
            <p className="text-[10px] text-white/30 uppercase tracking-[0.2em] font-medium px-2">
              The Critics Say
            </p>
            <div className="h-px flex-1 bg-white/15" />
          </div>
          <p className="text-sm text-white/80 leading-relaxed">{analysis.media_narrative}</p>
          <p className="text-[10px] text-white/25 mt-3">
            Sourced from: NYT, Variety, The Hollywood Reporter, IndieWire
          </p>
        </motion.div>
      </section>

      {/* Section 2 — Player Analyses */}
      <section>
        <p className="text-xs text-white/30 uppercase tracking-widest mb-3">
          Player Breakdowns
        </p>
        <div className="space-y-3">
          {analysis.player_analyses.map((pa, i) => (
            <PlayerAnalysisCard
              key={pa.player_name}
              analysis={pa}
              players={players}
              index={i}
            />
          ))}
        </div>
      </section>

      {/* Section 3 — Awards */}
      <section>
        <p className="text-xs text-white/30 uppercase tracking-widest mb-3">Awards</p>
        <div className="space-y-3">
          {awards.most_prescient && (
            <AwardCard
              icon={<Crown size={15} />}
              title="Most Prescient"
              playerName={awards.most_prescient.player_name}
              subtitle={awards.most_prescient.reason}
              accentColor="#D4AF37"
              players={players}
              index={0}
            />
          )}
          {awards.most_contrarian && (
            <AwardCard
              icon={<Flame size={15} />}
              title="Most Contrarian"
              playerName={awards.most_contrarian.player_name}
              subtitle={awards.most_contrarian.reason}
              accentColor="#f97316"
              players={players}
              index={1}
            />
          )}
          {awards.called_it && (
            <AwardCard
              icon={<Target size={15} />}
              title="Called It"
              playerName={awards.called_it.player_name}
              subtitle={`Predicted: ${awards.called_it.prediction} — ${awards.called_it.evidence}`}
              accentColor="#10b981"
              players={players}
              index={2}
            />
          )}
          {awards.best_written && (
            <AwardCard
              icon={<Pen size={15} />}
              title="Best Written"
              playerName={awards.best_written.player_name}
              subtitle={awards.best_written.reason}
              accentColor="#a78bfa"
              players={players}
              index={3}
            />
          )}
        </div>
      </section>

      {/* Footer */}
      <p className="text-xs text-white/20 text-center pt-2">
        Analysis by Claude · 98th Academy Awards
      </p>
    </div>
  )
}
