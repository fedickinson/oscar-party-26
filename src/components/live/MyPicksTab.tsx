/**
 * MyPicksTab — "My Picks" tab for the live dashboard.
 *
 * Section 0: Score Card
 *   Total score, rank among all players, and breakdown by game type
 *   (Fantasy Draft / Confidence / Bingo).
 *
 * Section 1: Confidence Picks
 *   All 24 picks sorted by confidence number descending. Each shows:
 *   category name, nominee chosen, confidence value, and is_correct status.
 *   Correct = green check + gold number. Wrong = red cross + strikethrough + 0.
 *   Pending = clock icon + muted number.
 *
 * Section 2: Draft Roster
 *   Each drafted entity with a status badge:
 *   "won"        — entity earned this player points in at least one announced category
 *   "in_play"    — at least one nominated category still unannounced
 *   "eliminated" — all nominated categories announced, entity won none
 *
 * "View Bingo Card" shortcut switches the parent to tab 0.
 */

import { useState } from 'react'
import { CheckCircle, XCircle, Clock, ChevronRight, ChevronDown } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { CategoryIcon } from '../../lib/category-icons'
import { findDraftPointsForWinner } from '../../lib/scoring'
import type { ScoredPlayer } from '../../lib/scoring'
import type {
  CategoryRow,
  NomineeRow,
  ConfidencePickRow,
  DraftPickRow,
  DraftEntityRow,
} from '../../types/database'

interface Props {
  currentPlayerId: string
  leaderboard: ScoredPlayer[]
  categories: CategoryRow[]
  nominees: NomineeRow[]
  confidencePicks: ConfidencePickRow[]
  draftPicks: DraftPickRow[]
  draftEntities: DraftEntityRow[]
  onSwitchToBingo: () => void
}

type EntityStatus = 'won' | 'in_play' | 'eliminated'

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

function getEntityStatus(
  entity: DraftEntityRow,
  playerId: string,
  categories: CategoryRow[],
  nominees: NomineeRow[],
  draftEntities: DraftEntityRow[],
  draftPicks: DraftPickRow[],
): EntityStatus {
  const noms = entity.nominations as Array<{ category_id?: number }>
  const nominatedCatIds: number[] = Array.isArray(noms)
    ? (noms.map((n) => n.category_id).filter((id): id is number => id != null))
    : []

  for (const catId of nominatedCatIds) {
    const cat = categories.find((c) => c.id === catId)
    if (!cat?.winner_id) continue
    const { playerId: winnerId } = findDraftPointsForWinner(
      catId,
      cat.winner_id,
      categories,
      nominees,
      draftEntities,
      draftPicks,
    )
    if (winnerId === playerId) return 'won'
  }

  const hasLive = nominatedCatIds.some((catId) => {
    const cat = categories.find((c) => c.id === catId)
    return cat && cat.winner_id === null
  })

  return hasLive ? 'in_play' : 'eliminated'
}

export default function MyPicksTab({
  currentPlayerId,
  leaderboard,
  categories,
  nominees,
  confidencePicks,
  draftPicks,
  draftEntities,
  onSwitchToBingo,
}: Props) {
  const myConfidencePicks = confidencePicks
    .filter((p) => p.player_id === currentPlayerId)
    .sort((a, b) => b.confidence - a.confidence)

  const myDraftEntityIds = draftPicks
    .filter((p) => p.player_id === currentPlayerId)
    .map((p) => p.entity_id)

  const myDraftEntities = draftEntities.filter((e) => myDraftEntityIds.includes(e.id))

  const [showConfidence, setShowConfidence] = useState(true)
  const [showDraft, setShowDraft] = useState(true)
  const [confidenceFilter, setConfidenceFilter] = useState<'all' | 'won' | 'lost' | 'waiting'>('all')
  const [draftFilter, setDraftFilter] = useState<'all' | 'won' | 'in_play' | 'eliminated'>('all')

  // Score card data
  const rank = leaderboard.findIndex((e) => e.player.id === currentPlayerId) + 1
  const myScore = leaderboard.find((e) => e.player.id === currentPlayerId)
  const totalPlayers = leaderboard.length
  const isFirst = rank === 1
  const isLast = rank === totalPlayers && totalPlayers > 1

  return (
    <div className="flex flex-col gap-5 py-2">

      {/* ── Score Card ───────────────────────────────────────────────────── */}
      {myScore && rank > 0 && (
        <div className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-4">

          {/* Rank + total */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[10px] text-white/35 uppercase tracking-widest mb-0.5">
                Your Score
              </p>
              <p className={[
                'text-3xl font-black tabular-nums leading-none',
                isFirst ? 'text-oscar-gold' : 'text-white',
              ].join(' ')}>
                {myScore.totalScore}
                <span className="text-base font-semibold ml-1 opacity-50">pts</span>
              </p>
            </div>

            <div className="text-right">
              <p className="text-[10px] text-white/35 uppercase tracking-widest mb-0.5">
                Rank
              </p>
              <div className={[
                'text-xl font-black leading-none',
                isFirst ? 'text-oscar-gold' : isLast ? 'text-white/35' : 'text-white',
              ].join(' ')}>
                {ordinal(rank)}
                <span className="text-xs font-medium text-white/25 ml-1">
                  of {totalPlayers}
                </span>
              </div>
            </div>
          </div>

          {/* Score breakdown */}
          <div className="grid grid-cols-3 gap-2">
            <ScoreBreakdownCell
              label="Ensemble"
              value={myScore.fantasyScore}
              dimmed={myScore.fantasyScore === 0}
            />
            <ScoreBreakdownCell
              label="Prestige"
              value={myScore.confidenceScore}
              dimmed={myScore.confidenceScore === 0}
            />
            <ScoreBreakdownCell
              label="Bingo"
              value={myScore.bingoScore}
              dimmed={myScore.bingoScore === 0}
            />
          </div>
        </div>
      )}

      {/* Bingo shortcut */}
      <button
        onClick={onSwitchToBingo}
        className="w-full flex items-center justify-between backdrop-blur-lg bg-oscar-gold/8 border border-oscar-gold/20 rounded-xl px-4 py-3"
      >
        <span className="text-sm font-medium text-oscar-gold">View Bingo Card</span>
        <ChevronRight size={16} className="text-oscar-gold/60" />
      </button>

      {/* ── Confidence picks ──────────────────────────────────────────────── */}
      <section>
        <button
          onClick={() => setShowConfidence((v) => !v)}
          className="w-full flex items-center justify-between py-1 mb-1"
        >
          <div className="flex items-center gap-2">
            <p className="text-xs text-white/35 uppercase tracking-widest">
              Prestige Picks
            </p>
            {myConfidencePicks.length > 0 && (
              <span className="text-[10px] text-white/25 bg-white/5 border border-white/8 rounded-full px-1.5 py-0.5 tabular-nums">
                {myConfidencePicks.length}
              </span>
            )}
          </div>
          <motion.div
            animate={{ rotate: showConfidence ? 0 : -90 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown size={14} className="text-white/30" />
          </motion.div>
        </button>

        <AnimatePresence initial={false}>
          {showConfidence && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
          {myConfidencePicks.length > 0 && (
            <div className="flex gap-1.5 mb-3 mt-1">
              {(['all', 'won', 'lost', 'waiting'] as const).map((f) => {
                const labels = { all: 'All', won: 'Correct', lost: 'Wrong', waiting: 'Waiting' }
                const active = confidenceFilter === f
                const count = f === 'all' ? myConfidencePicks.length
                  : f === 'won' ? myConfidencePicks.filter(p => p.is_correct === true).length
                  : f === 'lost' ? myConfidencePicks.filter(p => p.is_correct === false).length
                  : myConfidencePicks.filter(p => p.is_correct === null).length
                return (
                  <button
                    key={f}
                    onClick={() => setConfidenceFilter(f)}
                    className={[
                      'flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors',
                      active
                        ? f === 'won' ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                          : f === 'lost' ? 'bg-red-500/12 border-red-500/25 text-red-400/80'
                          : f === 'waiting' ? 'bg-white/10 border-white/20 text-white/60'
                          : 'bg-white/12 border-white/20 text-white'
                        : 'bg-white/4 border-white/8 text-white/30',
                    ].join(' ')}
                  >
                    {labels[f]}
                    <span className={['tabular-nums', active ? 'opacity-70' : 'opacity-40'].join(' ')}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        {myConfidencePicks.length === 0 ? (
          <p className="text-sm text-white/30 text-center py-6">No picks submitted</p>
        ) : (
          <div className="space-y-1.5">
            {myConfidencePicks
              .filter((p) =>
                confidenceFilter === 'all' ? true
                : confidenceFilter === 'won' ? p.is_correct === true
                : confidenceFilter === 'lost' ? p.is_correct === false
                : p.is_correct === null
              )
              .map((pick) => {
              const cat = categories.find((c) => c.id === pick.category_id)
              const nominee = nominees.find((n) => n.id === pick.nominee_id)
              return (
                <div
                  key={pick.id}
                  className="flex items-center gap-3 backdrop-blur-lg bg-white/5 border border-white/8 rounded-xl px-3 py-2.5"
                >
                  {/* Status icon */}
                  <div className="flex-shrink-0 w-4">
                    {pick.is_correct === true && (
                      <CheckCircle size={16} className="text-emerald-400" />
                    )}
                    {pick.is_correct === false && (
                      <XCircle size={16} className="text-red-400/60" />
                    )}
                    {pick.is_correct === null && (
                      <Clock size={16} className="text-white/20" />
                    )}
                  </div>

                  {/* Category + nominee */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 mb-0.5">
                      {cat && <CategoryIcon categoryName={cat.name} size={10} className="text-white/30 flex-shrink-0" />}
                      <p className="text-[10px] text-white/35 uppercase tracking-wider truncate">
                        {cat?.name ?? `Category ${pick.category_id}`}
                      </p>
                    </div>
                    <p
                      className={[
                        'text-sm truncate',
                        pick.is_correct === true
                          ? 'text-white font-semibold'
                          : pick.is_correct === false
                          ? 'text-white/35 line-through'
                          : 'text-white/70',
                      ].join(' ')}
                    >
                      {nominee?.name ?? 'Unknown'}
                    </p>
                  </div>

                  {/* Confidence number / points earned */}
                  <div className="flex-shrink-0 text-right">
                    <p
                      className={[
                        'text-sm font-bold tabular-nums',
                        pick.is_correct === true
                          ? 'text-oscar-gold'
                          : pick.is_correct === false
                          ? 'text-white/25'
                          : 'text-white/40',
                      ].join(' ')}
                    >
                      {pick.is_correct === false ? 0 : pick.confidence}
                    </p>
                    <p className="text-[9px] text-white/20">pt</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* ── Draft roster ──────────────────────────────────────────────────── */}
      <section className="pb-4">
        <button
          onClick={() => setShowDraft((v) => !v)}
          className="w-full flex items-center justify-between py-1 mb-1"
        >
          <div className="flex items-center gap-2">
            <p className="text-xs text-white/35 uppercase tracking-widest">
              My Ensemble
            </p>
            {myDraftEntities.length > 0 && (
              <span className="text-[10px] text-white/25 bg-white/5 border border-white/8 rounded-full px-1.5 py-0.5 tabular-nums">
                {myDraftEntities.length}
              </span>
            )}
          </div>
          <motion.div
            animate={{ rotate: showDraft ? 0 : -90 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown size={14} className="text-white/30" />
          </motion.div>
        </button>

        <AnimatePresence initial={false}>
          {showDraft && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
          {myDraftEntities.length > 0 && (() => {
            const statuses = myDraftEntities.map((e) =>
              getEntityStatus(e, currentPlayerId, categories, nominees, draftEntities, draftPicks)
            )
            const counts = {
              all: myDraftEntities.length,
              won: statuses.filter(s => s === 'won').length,
              in_play: statuses.filter(s => s === 'in_play').length,
              eliminated: statuses.filter(s => s === 'eliminated').length,
            }
            return (
              <div className="flex gap-1.5 mb-3 mt-1">
                {(['all', 'won', 'in_play', 'eliminated'] as const).map((f) => {
                  const labels = { all: 'All', won: 'Won', in_play: 'In Play', eliminated: 'Out' }
                  const active = draftFilter === f
                  return (
                    <button
                      key={f}
                      onClick={() => setDraftFilter(f)}
                      className={[
                        'flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors',
                        active
                          ? f === 'won' ? 'bg-oscar-gold/15 border-oscar-gold/30 text-oscar-gold'
                            : f === 'in_play' ? 'bg-white/10 border-white/20 text-white/60'
                            : f === 'eliminated' ? 'bg-red-500/10 border-red-500/20 text-red-400/70'
                            : 'bg-white/12 border-white/20 text-white'
                          : 'bg-white/4 border-white/8 text-white/30',
                      ].join(' ')}
                    >
                      {labels[f]}
                      <span className={['tabular-nums', active ? 'opacity-70' : 'opacity-40'].join(' ')}>
                        {counts[f]}
                      </span>
                    </button>
                  )
                })}
              </div>
            )
          })()}
        {myDraftEntities.length === 0 ? (
          <p className="text-sm text-white/30 text-center py-6">No ensemble picks</p>
        ) : (
          <div className="space-y-1.5">
            {myDraftEntities.map((entity) => {
              const status = getEntityStatus(
                entity,
                currentPlayerId,
                categories,
                nominees,
                draftEntities,
                draftPicks,
              )
              if (draftFilter !== 'all' && status !== draftFilter) return null
              return (
                <div
                  key={entity.id}
                  className={[
                    'flex items-center gap-3 backdrop-blur-lg rounded-xl px-3 py-2.5 border',
                    status === 'won'
                      ? 'bg-oscar-gold/8 border-oscar-gold/25'
                      : status === 'eliminated'
                      ? 'bg-white/3 border-white/6'
                      : 'bg-white/5 border-white/10',
                  ].join(' ')}
                >
                  <div className="flex-1 min-w-0">
                    <p
                      className={[
                        'text-sm font-medium truncate',
                        status === 'won'
                          ? 'text-white'
                          : status === 'eliminated'
                          ? 'text-white/35'
                          : 'text-white/80',
                      ].join(' ')}
                    >
                      {entity.name}
                    </p>
                    {entity.film_name && entity.type === 'person' && (
                      <p
                        className={[
                          'text-xs truncate',
                          status === 'eliminated' ? 'text-white/20' : 'text-white/35',
                        ].join(' ')}
                      >
                        {entity.film_name}
                      </p>
                    )}
                  </div>

                  <div className="flex-shrink-0">
                    {status === 'won' && (
                      <span className="text-[10px] font-bold text-oscar-gold bg-oscar-gold/15 border border-oscar-gold/30 rounded-full px-2 py-0.5 uppercase tracking-wider">
                        Won
                      </span>
                    )}
                    {status === 'in_play' && (
                      <span className="text-[10px] font-medium text-white/40 bg-white/5 border border-white/10 rounded-full px-2 py-0.5 uppercase tracking-wider">
                        In Play
                      </span>
                    )}
                    {status === 'eliminated' && (
                      <span className="text-[10px] font-medium text-white/20 bg-white/3 border border-white/8 rounded-full px-2 py-0.5 uppercase tracking-wider">
                        Out
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  )
}

// ─── ScoreBreakdownCell ───────────────────────────────────────────────────────

function ScoreBreakdownCell({
  label,
  value,
  dimmed,
}: {
  label: string
  value: number
  dimmed: boolean
}) {
  return (
    <div className={[
      'rounded-xl px-3 py-2.5 border text-center',
      dimmed
        ? 'bg-white/3 border-white/6'
        : 'bg-white/6 border-white/10',
    ].join(' ')}>
      <p className={[
        'text-base font-bold tabular-nums leading-none',
        dimmed ? 'text-white/25' : 'text-white',
      ].join(' ')}>
        {value}
      </p>
      <p className={[
        'text-[9px] uppercase tracking-wider mt-1',
        dimmed ? 'text-white/20' : 'text-white/35',
      ].join(' ')}>
        {label}
      </p>
    </div>
  )
}
