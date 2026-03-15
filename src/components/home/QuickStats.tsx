/**
 * QuickStats — contextual game stats that shift based on ceremony phase.
 *
 * PRE-CEREMONY: draft breakdown, confidence consensus, bold picks
 * LIVE: categories remaining, biggest swing, draft efficiency, can you win?
 */

import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BarChart2, Zap, TrendingUp, CheckCircle, Info, Target } from 'lucide-react'
import { useGame } from '../../context/GameContext'
import type { CategoryRow, ConfidencePickRow, DraftPickRow, DraftEntityRow, NomineeRow } from '../../types/database'
import type { ScoredPlayer } from '../../lib/scoring'

interface Props {
  isPreCeremony: boolean
  categories: CategoryRow[]
  nominees: NomineeRow[]
  confidencePicks: ConfidencePickRow[]
  draftPicks: DraftPickRow[]
  draftEntities: DraftEntityRow[]
  leaderboard: ScoredPlayer[]
}

function StatCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={['bg-white/5 border border-white/10 rounded-xl p-3', className].join(' ')}>
      {children}
    </div>
  )
}

function SectionLabel({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <Icon size={14} className="text-oscar-gold" />
      <span className="text-[11px] uppercase tracking-wider text-white/50 font-medium">{label}</span>
    </div>
  )
}

// ─── Pre-ceremony stats ───────────────────────────────────────────────────────

function PreCeremonyStats({
  categories, nominees, confidencePicks, draftPicks, draftEntities,
}: Omit<Props, 'isPreCeremony' | 'leaderboard'>) {
  const { players } = useGame()

  // Draft Breakdown: count draft picks per player grouped by entity type
  const draftBreakdown = useMemo(() => {
    return players.map((p) => {
      const picks = draftPicks.filter((dp) => dp.player_id === p.id)
      const entities = picks
        .map((dp) => draftEntities.find((e) => e.id === dp.entity_id))
        .filter(Boolean) as typeof draftEntities
      const filmCount = entities.filter((e) => e.type === 'film').length
      const personCount = entities.filter((e) => e.type === 'person').length
      // Find most-picked film by nom_count
      const topEntity = entities.sort((a, b) => b.nom_count - a.nom_count)[0]
      return { player: p, filmCount, personCount, topEntity, total: picks.length }
    })
  }, [players, draftPicks, draftEntities])

  // Confidence Consensus: categories where all players agree
  const consensus = useMemo(() => {
    const playerCount = players.length
    if (playerCount < 2) return { agreed: [], disagreed: [] }

    const agreed: { name: string; pick: string }[] = []
    const disagreed: { name: string; split: number }[] = []

    categories.forEach((cat) => {
      const catPicks = confidencePicks.filter((cp) => cp.category_id === cat.id)
      if (catPicks.length < playerCount) return // not everyone picked

      const uniqueNomineeIds = new Set(catPicks.map((cp) => cp.nominee_id))
      if (uniqueNomineeIds.size === 1) {
        const nom = nominees.find((n) => n.id === catPicks[0].nominee_id)
        if (nom) agreed.push({ name: cat.name, pick: nom.name })
      } else if (uniqueNomineeIds.size === playerCount) {
        disagreed.push({ name: cat.name, split: uniqueNomineeIds.size })
      }
    })

    return {
      agreed: agreed.slice(0, 4),
      disagreed: disagreed.slice(0, 4),
    }
  }, [categories, confidencePicks, nominees, players])

  // Bold Picks: high-confidence picks against the majority
  const boldPicks = useMemo(() => {
    interface BoldPick { playerName: string; category: string; pickName: string; confidence: number }
    const result: BoldPick[] = []

    categories.forEach((cat) => {
      const catPicks = confidencePicks.filter((cp) => cp.category_id === cat.id)
      if (catPicks.length < 2) return

      // Find majority nominee
      const counts = new Map<string, number>()
      catPicks.forEach((cp) => counts.set(cp.nominee_id, (counts.get(cp.nominee_id) ?? 0) + 1))
      const majorityId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]

      // High-confidence picks that go against majority
      catPicks
        .filter((cp) => cp.nominee_id !== majorityId && cp.confidence >= 18)
        .forEach((cp) => {
          const p = players.find((pl) => pl.id === cp.player_id)
          const nom = nominees.find((n) => n.id === cp.nominee_id)
          if (p && nom) {
            result.push({
              playerName: p.name,
              category: cat.name,
              pickName: nom.name,
              confidence: cp.confidence,
            })
          }
        })
    })

    return result.sort((a, b) => b.confidence - a.confidence).slice(0, 4)
  }, [categories, confidencePicks, nominees, players])

  return (
    <div className="space-y-3">
      {/* Draft breakdown */}
      <StatCard>
        <SectionLabel icon={BarChart2} label="Draft breakdown" />
        <div className="space-y-2">
          {draftBreakdown.map(({ player, filmCount, personCount, topEntity, total }) => (
            <div key={player.id} className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-white/90">{player.name}</p>
                {topEntity && (
                  <p className="text-xs text-white/45 truncate">
                    Led by {topEntity.type === 'film' ? topEntity.film_name : topEntity.name}
                  </p>
                )}
              </div>
              <div className="flex gap-2 flex-shrink-0 text-xs text-right">
                <div className="text-white/50">
                  <span className="text-oscar-gold font-medium">{filmCount}</span> films
                </div>
                <div className="text-white/50">
                  <span className="text-white/80 font-medium">{personCount}</span> people
                </div>
              </div>
            </div>
          ))}
        </div>
      </StatCard>

      {/* Confidence consensus */}
      {(consensus.agreed.length > 0 || consensus.disagreed.length > 0) && (
        <StatCard>
          <SectionLabel icon={Target} label="Confidence consensus" />
          {consensus.agreed.length > 0 && (
            <div className="mb-2">
              <p className="text-[11px] text-emerald-400/70 mb-1.5">Everyone agrees</p>
              <div className="space-y-1">
                {consensus.agreed.map((a, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-white/55 truncate">{a.name}</span>
                    <span className="text-xs text-white/80 truncate max-w-[50%] text-right">{a.pick}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {consensus.disagreed.length > 0 && (
            <div>
              <p className="text-[11px] text-amber-400/70 mb-1.5">Everyone disagrees</p>
              <div className="space-y-1">
                {consensus.disagreed.map((d, i) => (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-white/55 truncate">{d.name}</span>
                    <span className="text-xs text-amber-400/80">{d.split} different picks</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </StatCard>
      )}

      {/* Bold picks */}
      {boldPicks.length > 0 && (
        <StatCard>
          <SectionLabel icon={Zap} label="Bold picks (confidence 18+, against the room)" />
          <div className="space-y-1.5">
            {boldPicks.map((bp, i) => (
              <div key={i} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-xs font-medium text-white/80">{bp.playerName}</span>
                  <span className="text-xs text-white/40 mx-1">on</span>
                  <span className="text-xs text-white/60">{bp.category}</span>
                  <p className="text-xs text-oscar-gold/80 truncate">{bp.pickName}</p>
                </div>
                <span className="text-sm font-bold text-oscar-gold flex-shrink-0">{bp.confidence}</span>
              </div>
            ))}
          </div>
        </StatCard>
      )}
    </div>
  )
}

// ─── InfoStatCard — glassmorphism stat card with collapsible info panel ───────

function InfoStatCard({
  icon: Icon,
  label,
  info,
  children,
}: {
  icon: React.ElementType
  label: string
  info: string
  children: React.ReactNode
}) {
  const [showInfo, setShowInfo] = useState(false)

  return (
    <StatCard>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Icon size={14} className="text-oscar-gold" />
          <span className="text-[11px] uppercase tracking-wider text-white/50 font-medium">{label}</span>
        </div>
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => setShowInfo((v) => !v)}
          className="p-1 -mr-1 rounded-lg text-white/30 hover:text-white/60 transition-colors"
          aria-label={`What is ${label}?`}
        >
          <Info size={13} />
        </motion.button>
      </div>

      <AnimatePresence initial={false}>
        {showInfo && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="mb-3 px-3 py-2.5 bg-white/5 border border-white/10 rounded-xl">
              <p className="text-xs text-white/60 leading-relaxed">{info}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {children}
    </StatCard>
  )
}

// ─── Draft hit rate card (with info modal) ────────────────────────────────────

interface DraftHitEntry {
  player: { id: string; name: string }
  pct: number
  won: number
  total: number
}

function DraftHitRateCard({ draftEfficiency }: { draftEfficiency: DraftHitEntry[] }) {
  return (
    <InfoStatCard
      icon={TrendingUp}
      label="Draft hit rate"
      info="Of all the entities you drafted (films and people), how many have won at least one category so far. Higher means your roster is producing winners. It doesn't count points — just whether your picks are hitting."
    >
      <div className="space-y-2">
        {draftEfficiency.map(({ player, pct, won, total }) => (
          <div key={player.id} className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-white/80 truncate">{player.name}</span>
                <span className="text-xs text-white/50 flex-shrink-0">{won}/{total}</span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-emerald-400 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ type: 'spring', stiffness: 80, damping: 20, delay: 0.1 }}
                />
              </div>
            </div>
            <span className="text-sm font-bold text-white/70 flex-shrink-0 w-10 text-right">
              {pct}%
            </span>
          </div>
        ))}
      </div>
    </InfoStatCard>
  )
}

// ─── Live stats ───────────────────────────────────────────────────────────────

function LiveStats({
  categories, nominees, confidencePicks, draftPicks, draftEntities, leaderboard,
}: Omit<Props, 'isPreCeremony'>) {
  const { players } = useGame()

  const announcedCategories = categories.filter((c) => c.winner_id != null)
  const remainingCategories = categories.filter((c) => c.winner_id == null)
  const progressPct = categories.length > 0 ? (announcedCategories.length / categories.length) * 100 : 0

  // Biggest swing: which announced category had the most total points awarded
  const biggestSwing = useMemo(() => {
    if (announcedCategories.length === 0) return null

    let best: { category: CategoryRow; totalPoints: number; winnerName: string } | null = null

    announcedCategories.forEach((cat) => {
      const winner = nominees.find((n) => n.id === cat.winner_id)
      if (!winner) return

      // Confidence points earned in this category
      const confPoints = confidencePicks
        .filter((cp) => cp.category_id === cat.id && cp.nominee_id === cat.winner_id)
        .reduce((sum, cp) => sum + cp.confidence, 0)

      // Draft points: just the category points (simplified)
      const draftWin = draftPicks.some((dp) => {
        const entity = draftEntities.find((e) => e.id === dp.entity_id)
        if (!entity) return false
        if (winner.type === 'film') return entity.type === 'film' && entity.film_name === winner.film_name
        return entity.type === 'person' && entity.name === winner.name
      })
      const draftPoints = draftWin ? cat.points : 0

      const total = confPoints + draftPoints
      if (!best || total > best.totalPoints) {
        best = { category: cat, totalPoints: total, winnerName: winner.name }
      }
    })

    return best as { category: CategoryRow; totalPoints: number; winnerName: string } | null
  }, [announcedCategories, nominees, confidencePicks, draftPicks, draftEntities])

  // Draft efficiency per player: % of their draft picks that have won
  const draftEfficiency = useMemo(() => {
    return players.map((p) => {
      const picks = draftPicks.filter((dp) => dp.player_id === p.id)
      if (picks.length === 0) return { player: p, pct: 0, won: 0, total: 0 }

      const won = picks.filter((dp) => {
        const entity = draftEntities.find((e) => e.id === dp.entity_id)
        if (!entity) return false
        return announcedCategories.some((cat) => {
          const winner = nominees.find((n) => n.id === cat.winner_id)
          if (!winner) return false
          if (entity.type === 'film') return winner.type === 'film' && winner.film_name === entity.film_name
          return winner.type === 'person' && winner.name === entity.name
        })
      }).length

      return { player: p, pct: Math.round((won / picks.length) * 100), won, total: picks.length }
    }).sort((a, b) => b.pct - a.pct)
  }, [players, draftPicks, draftEntities, announcedCategories, nominees])

  // Most controversial: announced category with most disagreement
  const mostControversial = useMemo(() => {
    let best: { category: CategoryRow; winner: NomineeRow; uniquePicks: number } | null = null

    announcedCategories.forEach((cat) => {
      const catPicks = confidencePicks.filter((cp) => cp.category_id === cat.id)
      const uniquePicks = new Set(catPicks.map((cp) => cp.nominee_id)).size
      const winner = nominees.find((n) => n.id === cat.winner_id)
      if (winner && (!best || uniquePicks > best.uniquePicks)) {
        best = { category: cat, winner, uniquePicks }
      }
    })

    return best as { category: CategoryRow; winner: NomineeRow; uniquePicks: number } | null
  }, [announcedCategories, confidencePicks, nominees])

  return (
    <div className="space-y-3">
      {/* Categories remaining */}
      <InfoStatCard
        icon={CheckCircle}
        label="Categories remaining"
        info="How many of the 24 Oscar categories are still to be announced tonight. The bar fills as winners are called — when it's full, the ceremony is over."
      >
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-oscar-gold rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                transition={{ type: 'spring', stiffness: 80, damping: 20 }}
              />
            </div>
          </div>
          <span className="text-sm font-bold text-white/80 flex-shrink-0">
            {remainingCategories.length}
            <span className="text-white/40 font-normal">/{categories.length}</span>
          </span>
        </div>
        <p className="text-xs text-white/40 mt-1">
          {announcedCategories.length} announced
        </p>
      </InfoStatCard>

      {/* Biggest swing */}
      {biggestSwing && (
        <InfoStatCard
          icon={Zap}
          label="Biggest swing"
          info="The announced category that moved the most total points across all players — adding up confidence points earned and draft points awarded. The higher the number, the more it shook up the leaderboard."
        >
          <p className="text-sm font-semibold text-white/90">{biggestSwing.winnerName}</p>
          <p className="text-xs text-white/50">{biggestSwing.category.name}</p>
          <p className="text-xs text-oscar-gold font-medium mt-1">
            {biggestSwing.totalPoints} total points moved
          </p>
        </InfoStatCard>
      )}

      {/* Draft hit rate */}
      <DraftHitRateCard draftEfficiency={draftEfficiency} />

      {/* Most controversial */}
      {mostControversial && (
        <InfoStatCard
          icon={BarChart2}
          label="Most split"
          info="The announced category where players disagreed the most on their confidence picks — the one where everyone went a different direction. More unique picks means more chaos."
        >
          <p className="text-sm font-semibold text-white/90">{mostControversial.category.name}</p>
          <p className="text-xs text-white/50">
            {mostControversial.uniquePicks} different picks · winner: {mostControversial.winner.name}
          </p>
        </InfoStatCard>
      )}
    </div>
  )
}

// ─── Public component ─────────────────────────────────────────────────────────

export default function QuickStats(props: Props) {
  const { isPreCeremony, ...rest } = props
  return isPreCeremony ? <PreCeremonyStats {...rest} /> : <LiveStats {...rest} />
}
