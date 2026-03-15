/**
 * ActivityFeed — reverse-chronological scoring event log.
 *
 * Two event types:
 *   - winner: shows category, winner, per-player confidence + draft impacts
 *   - lead-change: gold highlighted card with Crown icon
 *
 * Each winner card is expandable:
 *   collapsed → only players who scored (non-zero impact)
 *   expanded  → all players, zero-impact ones shown muted
 *
 * Color conventions (consistent with Leaderboard badges):
 *   Confidence impacts: blue  (text-blue-400, border-l-blue-500)
 *   Draft impacts:      purple (text-purple-400, border-l-purple-500)
 */

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Award, ChevronDown, Crown } from 'lucide-react'
import Avatar from '../Avatar'
import { CategoryIcon } from '../../lib/category-icons'
import type { FeedEvent, PlayerImpact } from '../../hooks/useScores'

// ─── Tier badge ───────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: number }) {
  const label = tier === 1 ? 'Big 6' : tier === 2 ? 'Major' : tier === 3 ? 'Craft' : 'Short'
  const color =
    tier === 1
      ? 'bg-oscar-gold/20 text-oscar-gold border-oscar-gold/30'
      : tier === 2
        ? 'bg-white/10 text-white/70 border-white/20'
        : 'bg-white/5 text-white/40 border-white/10'
  return (
    <span className={`text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded border ${color}`}>
      {label}
    </span>
  )
}

// ─── PlayerImpactRow ──────────────────────────────────────────────────────────

function PlayerImpactRow({ impact, muted }: { impact: PlayerImpact; muted: boolean }) {
  const hasConfidence = impact.confidenceDelta > 0 || impact.confidencePickedName !== null
  const hasDraft = impact.draftDelta > 0

  return (
    <div className={`space-y-0.5 ${muted ? 'opacity-35' : ''}`}>
      {hasConfidence && (
        <div className="flex items-center gap-2 pl-2 border-l-2 border-blue-500/60">
          <Avatar avatarId={impact.avatarId} size="sm" emotion="neutral" />
          {impact.confidenceCorrect ? (
            <span className="text-xs text-blue-400">
              <span className="font-medium">{impact.playerName}</span>
              {': C+'}
              <span className="font-bold">{impact.confidenceDelta}</span>
              <span className="text-white/40"> (picked with {impact.confidenceDelta})</span>
            </span>
          ) : (
            <span className="text-xs text-white/40">
              <span className="font-medium text-white/55">{impact.playerName}</span>
              {impact.confidencePickedName
                ? `: picked ${impact.confidencePickedName} — 0`
                : ': no pick — 0'}
            </span>
          )}
        </div>
      )}
      {hasDraft && (
        <div className="flex items-center gap-2 pl-2 border-l-2 border-purple-500/60">
          <Avatar avatarId={impact.avatarId} size="sm" emotion="neutral" />
          <span className="text-xs text-purple-400">
            <span className="font-medium">{impact.playerName}</span>
            {': D+'}
            <span className="font-bold">{impact.draftDelta}</span>
            {impact.draftedEntityName && (
              <span className="text-white/40"> (drafted {impact.draftedEntityName})</span>
            )}
          </span>
        </div>
      )}
    </div>
  )
}

// ─── WinnerCard ───────────────────────────────────────────────────────────────

function WinnerCard({ entry }: { entry: Extract<FeedEvent, { kind: 'winner' }> }) {
  const [expanded, setExpanded] = useState(false)

  const scoringImpacts = entry.playerImpacts.filter(
    (p) => p.confidenceDelta > 0 || p.draftDelta > 0,
  )
  const hasBothForSomeone = entry.playerImpacts.some(
    (p) => p.confidenceDelta > 0 && p.draftDelta > 0,
  )

  const visibleScoringImpacts = expanded ? entry.playerImpacts : scoringImpacts

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={[
        'backdrop-blur-lg border rounded-xl overflow-hidden',
        hasBothForSomeone
          ? 'bg-oscar-gold/6 border-oscar-gold/20'
          : 'bg-white/6 border-white/10',
      ].join(' ')}
    >
      {/* Header */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <CategoryIcon categoryName={entry.categoryName} size={11} className="text-white/35 flex-shrink-0" />
            <span className="text-[10px] text-white/35 uppercase tracking-widest">
              {entry.categoryName}
            </span>
            <TierBadge tier={entry.categoryTier} />
          </div>
          <span className="text-xs text-white/30 flex-shrink-0">
            {entry.categoryPoints}pt cat
          </span>
        </div>
        <p className="text-sm font-semibold text-white">{entry.winnerName}</p>
        {entry.winnerFilm && (
          <p className="text-xs text-white/45">{entry.winnerFilm}</p>
        )}
      </div>

      {/* Impacts */}
      <div className="px-3 pb-2 space-y-2">
        <div className="h-px bg-white/8" />
        {visibleScoringImpacts.length === 0 && !expanded ? (
          <p className="text-xs text-white/30 italic">Nobody scored on this one</p>
        ) : (
          visibleScoringImpacts.map((impact) => (
            <PlayerImpactRow
              key={impact.playerId}
              impact={impact}
              muted={expanded && impact.confidenceDelta === 0 && impact.draftDelta === 0}
            />
          ))
        )}
      </div>

      {/* Expand/collapse toggle */}
      {entry.playerImpacts.length > 0 && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-center gap-1 py-2 text-white/25 hover:text-white/50 transition-colors"
        >
          <span className="text-[10px] uppercase tracking-wider">
            {expanded ? 'Collapse' : `${scoringImpacts.length} scored`}
          </span>
          <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown size={12} />
          </motion.div>
        </button>
      )}
    </motion.div>
  )
}

// ─── LeadChangeCard ───────────────────────────────────────────────────────────

function LeadChangeCard({ entry }: { entry: Extract<FeedEvent, { kind: 'lead-change' }> }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="backdrop-blur-lg bg-oscar-gold/10 border border-oscar-gold/30 rounded-xl px-3 py-3"
    >
      <div className="flex items-center gap-2.5">
        <Crown size={16} className="text-oscar-gold flex-shrink-0" />
        <Avatar avatarId={entry.leaderAvatarId} size="sm" emotion="happy" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-oscar-gold">
            {entry.leaderName} takes the lead
          </p>
          <p className="text-xs text-white/45">{entry.totalScore} pts</p>
        </div>
      </div>
    </motion.div>
  )
}

// ─── ActivityFeed ─────────────────────────────────────────────────────────────

interface Props {
  feed: FeedEvent[]
}

export default function ActivityFeed({ feed }: Props) {
  if (feed.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2">
        <Award size={28} className="text-white/15" />
        <p className="text-sm text-white/30">No winners announced yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <AnimatePresence initial={false}>
        {feed.map((event) =>
          event.kind === 'winner' ? (
            <WinnerCard key={`winner-${event.categoryId}`} entry={event} />
          ) : (
            <LeadChangeCard
              key={`lead-${event.leaderId}-${event.time.getTime()}`}
              entry={event}
            />
          ),
        )}
      </AnimatePresence>
    </div>
  )
}
