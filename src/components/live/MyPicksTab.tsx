/**
 * MyPicksTab — "My Picks" tab for the live dashboard.
 *
 * Section 0: Score Card
 *   Total score, rank among all players, and breakdown by game type
 *   (Ensemble Draft / Confidence / Bingo).
 *
 * Section 1: Confidence Picks
 *   All 24 picks sorted by confidence number descending. Each shows:
 *   category name, nominee chosen, confidence value, and is_correct status.
 *   Correct = green check + gold number. Wrong = red cross + strikethrough + 0.
 *   Pending = clock icon + muted number.
 *
 * Section 2: Roster browser
 *   Browse any player and compare their live signature beats with the ones
 *   they passed on before the episode.
 *
 * "View Bingo Card" shortcut switches the parent to tab 0.
 */

import { useState } from 'react'
import { CheckCircle, XCircle, Clock, ChevronRight, ChevronDown } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { CategoryIcon } from '../../lib/category-icons'
import { FilmIcon } from '../../lib/film-icons'
import Avatar from '../Avatar'
import TeamPicker from '../TeamPicker'
import type { ScoredPlayer } from '../../lib/scoring'
import type {
  BeatActivationRow,
  CategoryRow,
  NomineeRow,
  ConfidencePickRow,
  DraftPickRow,
  DraftEntityRow,
  PlayerRow,
  SignatureBeatRow,
} from '../../types/database'

interface Props {
  currentPlayerId: string
  leaderboard: ScoredPlayer[]
  categories: CategoryRow[]
  nominees: NomineeRow[]
  confidencePicks: ConfidencePickRow[]
  draftPicks: DraftPickRow[]
  draftEntities: DraftEntityRow[]
  players: PlayerRow[]
  signatureBeats: SignatureBeatRow[]
  beatActivations: BeatActivationRow[]
  onSwitchToBingo: () => void
}

type EntityStatus = 'won' | 'in_play'

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0])
}

function getEntityStatus(
  entity: DraftEntityRow,
  categories: CategoryRow[],
  nominees: NomineeRow[],
  beats: SignatureBeatRow[],
): EntityStatus {
  const nominee = nominees.find((candidate) => candidate.name === entity.name)
  if (!nominee) return 'in_play'
  const entityBeats = beats.filter((beat) => beat.entity_id === entity.id || beat.partner_entity_id === entity.id)
  const scored = categories.some((category) => {
    if (category.winner_id !== nominee.id && category.tie_winner_id !== nominee.id) return false
    return entityBeats.some((beat) =>
      category.name === beat.name || category.name.startsWith(`${beat.name} — `),
    )
  })
  return scored ? 'won' : 'in_play'
}

function oddsLabel(odds: string): string {
  const labels: Record<string, string> = {
    likely: 'Likely',
    coin_flip: 'Coin flip',
    'coin flip': 'Coin flip',
    long_shot: 'Long shot',
    'long shot': 'Long shot',
    wild: 'Wild',
    chaos: 'Wild',
  }
  return labels[odds.toLowerCase()] ?? odds
}

function beatWasHit(
  beat: SignatureBeatRow,
  entity: DraftEntityRow,
  categories: CategoryRow[],
  nominees: NomineeRow[],
): boolean {
  const nominee = nominees.find((candidate) => candidate.name === entity.name)
  if (!nominee) return false
  return categories.some((category) =>
    (category.winner_id === nominee.id || category.tie_winner_id === nominee.id)
    && (category.name === beat.name || category.name.startsWith(`${beat.name} — `)),
  )
}

export default function MyPicksTab({
  currentPlayerId,
  leaderboard,
  categories,
  nominees,
  confidencePicks,
  draftPicks,
  draftEntities,
  players,
  signatureBeats,
  beatActivations,
  onSwitchToBingo,
}: Props) {
  const myConfidencePicks = confidencePicks
    .filter((p) => p.player_id === currentPlayerId)
    .sort((a, b) => b.confidence - a.confidence)

  const [selectedPlayerId, setSelectedPlayerId] = useState(currentPlayerId)
  const rosterPlayerId = selectedPlayerId || currentPlayerId
  const selectedDraftEntityIds = draftPicks
    .filter((p) => p.player_id === rosterPlayerId)
    .map((p) => p.entity_id)

  const selectedDraftEntities = draftEntities.filter((e) => selectedDraftEntityIds.includes(e.id))

  const [showConfidence, setShowConfidence] = useState(true)
  const [showDraft, setShowDraft] = useState(true)
  const [confidenceFilter, setConfidenceFilter] = useState<'all' | 'won' | 'lost' | 'waiting'>('all')
  const [draftFilter, setDraftFilter] = useState<'all' | 'won' | 'in_play'>('all')

  // Score card data
  const rank = leaderboard.findIndex((e) => e.player.id === currentPlayerId) + 1
  const myScore = leaderboard.find((e) => e.player.id === currentPlayerId)
  const totalPlayers = leaderboard.length
  const isFirst = rank === 1
  const isLast = rank === totalPlayers && totalPlayers > 1

  return (
    <div className="flex flex-col gap-5 py-2">

      {/* Allegiance — always reachable so a mid-episode defection is one tap.
          The host client turns the change into a chat event. */}
      <TeamPicker compact />

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
                isFirst ? 'text-accent' : 'text-white',
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
                isFirst ? 'text-accent' : isLast ? 'text-white/35' : 'text-white',
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
              value={myScore.ensembleScore}
              dimmed={myScore.ensembleScore === 0}
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
        className="w-full flex items-center justify-between backdrop-blur-lg bg-accent/8 border border-accent/20 rounded-xl px-4 py-3"
      >
        <span className="text-sm font-medium text-accent">View Bingo Card</span>
        <ChevronRight size={16} className="text-accent/60" />
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
                          ? 'text-accent'
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

      {/* ── Player roster browser ─────────────────────────────────────────── */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {players.map((roomPlayer) => {
          const selected = roomPlayer.id === rosterPlayerId
          return (
            <motion.button
              key={roomPlayer.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                setSelectedPlayerId(roomPlayer.id)
                setDraftFilter('all')
              }}
              className={[
                'min-h-11 flex-shrink-0 flex items-center gap-2 rounded-xl border px-2.5 transition-colors',
                selected ? 'bg-accent/10 border-accent/60' : 'bg-white/5 border-white/10',
              ].join(' ')}
            >
              <Avatar avatarId={roomPlayer.avatar_id} size="sm" highlighted={selected} />
              <span className={selected ? 'text-sm font-semibold text-accent' : 'text-sm text-white/60'}>
                {roomPlayer.name.split(' ')[0]}
              </span>
            </motion.button>
          )
        })}
      </div>

      {/* ── Draft roster ──────────────────────────────────────────────────── */}
      <section className="pb-4">
        <button
          onClick={() => setShowDraft((v) => !v)}
          className="w-full flex items-center justify-between py-1 mb-1"
        >
          <div className="flex items-center gap-2">
            <p className="text-xs text-white/35 uppercase tracking-widest">
              {rosterPlayerId === currentPlayerId
                ? 'My Ensemble'
                : `${players.find((roomPlayer) => roomPlayer.id === rosterPlayerId)?.name.split(' ')[0] ?? 'Player'}'s Ensemble`}
            </p>
            {selectedDraftEntities.length > 0 && (
              <span className="text-[10px] text-white/25 bg-white/5 border border-white/8 rounded-full px-1.5 py-0.5 tabular-nums">
                {selectedDraftEntities.length}
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
          {selectedDraftEntities.length > 0 && (() => {
            const statuses = selectedDraftEntities.map((entity) =>
              getEntityStatus(entity, categories, nominees, signatureBeats)
            )
            const counts = {
              all: selectedDraftEntities.length,
              won: statuses.filter(s => s === 'won').length,
              in_play: statuses.filter(s => s === 'in_play').length,
            }
            return (
              <div className="flex gap-1.5 mb-3 mt-1">
                {(['all', 'won', 'in_play'] as const).map((f) => {
                  const labels = { all: 'All', won: 'Scored', in_play: 'Yet to score' }
                  const active = draftFilter === f
                  return (
                    <button
                      key={f}
                      onClick={() => setDraftFilter(f)}
                      className={[
                        'flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors',
                        active
                          ? f === 'won' ? 'bg-accent/15 border-accent/30 text-accent'
                            : f === 'in_play' ? 'bg-white/10 border-white/20 text-white/60'
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
        {selectedDraftEntities.length === 0 ? (
          <p className="text-sm text-white/30 text-center py-6">No ensemble picks</p>
        ) : (
          <div className="space-y-3">
            {selectedDraftEntities.map((entity) => {
              const status = getEntityStatus(entity, categories, nominees, signatureBeats)
              if (draftFilter !== 'all' && status !== draftFilter) return null
              const entityBeats = signatureBeats.filter((beat) =>
                beat.entity_id === entity.id || beat.partner_entity_id === entity.id,
              )
              const activatedIds = new Set(
                beatActivations
                  .filter((activation) => activation.player_id === rosterPlayerId)
                  .map((activation) => activation.beat_id),
              )
              const liveBeats = entityBeats.filter((beat) =>
                entity.type === 'film' || beat.partner_entity_id != null || activatedIds.has(beat.id),
              )
              const passedBeats = entity.type === 'person'
                ? entityBeats.filter((beat) => beat.partner_entity_id == null && !activatedIds.has(beat.id))
                : []
              return (
                <div
                  key={entity.id}
                  className={[
                    'backdrop-blur-lg rounded-2xl p-4 border',
                    status === 'won'
                      ? 'bg-accent/8 border-accent/25'
                      : 'bg-white/5 border-white/10',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{entity.name}</p>
                    {entity.film_name && entity.type === 'person' && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <FilmIcon filmName={entity.film_name} size={10} className="text-white/30 flex-shrink-0" />
                        <p className="text-xs text-white/35 truncate">{entity.film_name}</p>
                      </div>
                    )}
                    </div>
                    <span className={[
                      'text-[10px] uppercase tracking-wider rounded-full border px-2 py-0.5 whitespace-nowrap',
                      status === 'won'
                        ? 'font-bold text-accent bg-accent/15 border-accent/30'
                        : 'font-medium text-white/40 bg-white/5 border-white/10',
                    ].join(' ')}>
                      {status === 'won' ? 'Scored' : 'In play'}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {liveBeats.map((beat) => {
                      const hit = beatWasHit(beat, entity, categories, nominees)
                      return (
                        <div key={beat.id} className="min-h-11 flex items-center gap-2 rounded-xl bg-white/5 border border-white/8 px-3 py-2">
                          {hit
                            ? <CheckCircle size={15} className="text-emerald-400 flex-shrink-0" />
                            : <Clock size={15} className="text-white/20 flex-shrink-0" />}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-white/80">{beat.name}</p>
                            <p className="text-[10px] text-white/35">{oddsLabel(beat.odds)}{entity.type === 'film' ? ' · always live' : ''}</p>
                          </div>
                          <span className={hit ? 'text-sm font-bold text-accent' : 'text-sm font-bold text-white/45'}>
                            {beat.points} pts
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  {passedBeats.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-white/8">
                      <p className="text-[10px] uppercase tracking-widest text-white/25 mb-1.5">Passed on</p>
                      <div className="space-y-1">
                        {passedBeats.map((beat) => (
                          <div key={beat.id} className="flex items-center justify-between gap-3 px-2 py-1.5 text-white/25">
                            <div className="min-w-0">
                              <p className="text-xs truncate">{beat.name}</p>
                              <p className="text-[9px]">{oddsLabel(beat.odds)}</p>
                            </div>
                            <span className="text-xs font-medium whitespace-nowrap">{beat.points} pts</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
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
