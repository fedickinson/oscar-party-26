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
 *   Correct = bone check + full points. Wrong = ash cross + strikethrough + 0.
 *   Pending = ochre clock + muted number.
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
import { resolveDraftEntityPortrait } from '../../lib/draft-portrait'
import { FilmIcon } from '../../lib/film-icons'
import {
  draftEntityHasHitSignatureBeat,
  signatureBeatWasHit,
} from '../../lib/signature-beat-status'
import Avatar from '../Avatar'
import PackIdentityPicker from '../PackIdentityPicker'
import TeamPicker from '../TeamPicker'
import StoryPortrait from '../ui/StoryPortrait'
import type { ScoredPlayer } from '../../lib/scoring'
import type { IdentityChoicesState } from '../../hooks/useIdentityChoices'
import type {
  BeatActivationRow,
  CategoryRow,
  NomineeRow,
  ConfidencePickRow,
  ConvictionPickRow,
  DraftPickRow,
  DraftEntityRow,
  PlayerRow,
  SignatureBeatRow,
  GameModel,
} from '../../types/database'

interface Props {
  currentPlayerId: string
  leaderboard: ScoredPlayer[]
  categories: CategoryRow[]
  nominees: NomineeRow[]
  confidencePicks: ConfidencePickRow[]
  convictionPicks: ConvictionPickRow[]
  gameModel: GameModel
  draftPicks: DraftPickRow[]
  draftEntities: DraftEntityRow[]
  players: PlayerRow[]
  signatureBeats: SignatureBeatRow[]
  beatActivations: BeatActivationRow[]
  identityChoices?: IdentityChoicesState
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
  return draftEntityHasHitSignatureBeat(entity, categories, nominees, beats)
    ? 'won'
    : 'in_play'
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
  return signatureBeatWasHit(beat, entity, categories, nominees)
}

export default function MyPicksTab({
  currentPlayerId,
  leaderboard,
  categories,
  nominees,
  confidencePicks,
  convictionPicks,
  gameModel,
  draftPicks,
  draftEntities,
  players,
  signatureBeats,
  beatActivations,
  identityChoices,
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

  if (gameModel === 'conviction_portfolio') {
    const beatById = new Map(signatureBeats.map((beat) => [beat.id, beat]))
    const selectedBeliefs = convictionPicks
      .filter((pick) => pick.player_id === rosterPlayerId)
      .flatMap((pick) => {
        const beat = beatById.get(pick.beat_id)
        if (!beat) return []
        const believers = convictionPicks.filter((candidate) => candidate.beat_id === beat.id).length
        const hit = categories.some((category) => (
          category.winner_id != null && category.source_signature_beat_id === beat.id
        ))
        return [{ beat, believers, hit, payout: Math.floor(beat.points / Math.max(1, believers)) }]
      })
      .sort((left, right) => Number(right.hit) - Number(left.hit) || right.payout - left.payout)
    const draftedIdentity = selectedDraftEntities.find((entity) => entity.type === 'film')
    const selectedIdentity = identityChoices?.selections
      .find((selection) => selection.player_id === rosterPlayerId)?.choice_key

    return (
      <div className="flex flex-col gap-5 py-2">
        {identityChoices ? (
          identityChoices.isLoading
            ? <p className="py-3 text-center text-sm text-[var(--t-text-dim)]">Loading the authored banners…</p>
            : identityChoices.syncError
              ? (
                  <button
                    type="button"
                    onClick={identityChoices.retrySync}
                    className="min-h-11 rounded-xl border border-[var(--t-pending)] px-3 text-sm font-semibold text-[var(--t-pending)]"
                  >
                    Retry banner synchronization
                  </button>
                )
              : (
                  <PackIdentityPicker
                    compact
                    options={identityChoices.options}
                    currentChoice={identityChoices.selections.find(
                      (selection) => selection.player_id === currentPlayerId,
                    )?.choice_key ?? null}
                    onChoose={(choice) => identityChoices.choose(currentPlayerId, choice)}
                  />
                )
        ) : <TeamPicker compact />}
        {myScore && rank > 0 && (
          <section className="relief-glass rounded-2xl border-l-4! border-l-[var(--t-personal-device)]! p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-widest text-[var(--t-text-dim)]">Your score</p>
                <p className="text-3xl font-black tabular-nums text-[var(--t-text)]">{myScore.totalScore}<span className="ml-1 text-base font-semibold opacity-50">pts</span></p>
              </div>
              <div className="text-right">
                <p className="text-xs uppercase tracking-widest text-[var(--t-text-dim)]">Rank</p>
                <p className="text-xl font-black text-[var(--t-text)]">{ordinal(rank)}<span className="ml-1 text-xs font-medium text-[var(--t-text-dim)]">of {totalPlayers}</span></p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ScoreBreakdownCell label="Conviction" value={myScore.confidenceScore} dimmed={myScore.confidenceScore === 0} />
              <ScoreBreakdownCell label="Bingo" value={myScore.bingoScore} dimmed={myScore.bingoScore === 0} />
            </div>
          </section>
        )}
        <button onClick={onSwitchToBingo} className="relief-glass flex min-h-11 w-full items-center justify-between rounded-xl border-l-4! border-l-[var(--t-personal-device)]! px-4 py-3">
          <span className="text-sm font-medium text-[var(--t-personal-text)]">View Bingo Card</span>
          <ChevronRight size={16} className="text-[var(--t-personal-text)]" />
        </button>
        <section>
          <p className="mb-2 text-xs uppercase tracking-widest text-[var(--t-text-muted)]">Belief ledgers</p>
          <div className="mb-3 flex flex-wrap gap-2">
            {players.map((roomPlayer) => (
              <button key={roomPlayer.id} type="button" onClick={() => setSelectedPlayerId(roomPlayer.id)} className={[
                'relief-glass flex min-h-11 items-center gap-2 rounded-xl border px-3',
                rosterPlayerId === roomPlayer.id ? 'border-[var(--t-personal-device)] text-[var(--t-personal-text)]' : 'border-[var(--t-line)] text-[var(--t-text-muted)]',
              ].join(' ')}>
                <Avatar avatarId={roomPlayer.avatar_id} size="sm" />
                <span className="text-xs font-semibold">{roomPlayer.id === currentPlayerId ? 'You' : roomPlayer.name.split(' ')[0]}</span>
              </button>
            ))}
          </div>
          {(selectedIdentity || draftedIdentity) && (
            <p className="mb-3 text-sm text-[var(--t-text-muted)]">
              Banner: <span className="font-semibold text-[var(--t-text)]">
                {selectedIdentity ?? draftedIdentity?.name}
              </span>
            </p>
          )}
          <div className="space-y-2">
            {selectedBeliefs.map(({ beat, believers, hit, payout }) => (
              <article key={beat.id} className="relief-glass flex min-h-11 items-center gap-3 rounded-xl px-3 py-3">
                {hit ? <CheckCircle className="h-4 w-4 flex-shrink-0 text-[var(--t-positive)]" /> : <Clock className="h-4 w-4 flex-shrink-0 text-[var(--t-pending)]" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--t-text)]">{beat.name}</p>
                  <p className="text-xs text-[var(--t-text-dim)]">{believers === 1 ? 'Alone' : `${believers} believers`} · {payout} points if true</p>
                </div>
                <span className="font-display text-sm font-bold text-[var(--t-personal-text)]">{hit ? `+${payout}` : payout}</span>
              </article>
            ))}
            {selectedBeliefs.length === 0 && <p className="py-6 text-center text-sm text-[var(--t-text-dim)]">No beliefs recorded</p>}
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 py-2">

      {/* Allegiance — always reachable so a mid-episode defection is one tap.
          The host client turns the change into a chat event. */}
      <TeamPicker compact />

      {/* ── Score Card ───────────────────────────────────────────────────── */}
      {myScore && rank > 0 && (
        <div className="relief-glass rounded-2xl border-l-4! border-l-[var(--t-personal-device)]! p-4">

          {/* Rank + total */}
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="mb-0.5 text-xs uppercase tracking-widest text-[var(--t-text-dim)]">
                Your Score
              </p>
              <p className={[
                'text-3xl font-black tabular-nums leading-none',
                isFirst ? 'text-[var(--t-personal-text)]' : 'text-[var(--t-text)]',
              ].join(' ')}>
                {myScore.totalScore}
                <span className="text-base font-semibold ml-1 opacity-50">pts</span>
              </p>
            </div>

            <div className="text-right">
              <p className="mb-0.5 text-xs uppercase tracking-widest text-[var(--t-text-dim)]">
                Rank
              </p>
              <div className={[
                'text-xl font-black leading-none',
                isFirst
                  ? 'text-[var(--t-personal-text)]'
                  : isLast ? 'text-[var(--t-text-dim)]' : 'text-[var(--t-text)]',
              ].join(' ')}>
                {ordinal(rank)}
                <span className="ml-1 text-xs font-medium text-[var(--t-text-dim)]">
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
        className="relief-glass flex min-h-11 w-full items-center justify-between rounded-xl border-l-4! border-l-[var(--t-personal-device)]! px-4 py-3"
      >
        <span className="text-sm font-medium text-[var(--t-personal-text)]">View Bingo Card</span>
        <ChevronRight size={16} className="text-[var(--t-personal-text)]" />
      </button>

      {/* ── Confidence picks ──────────────────────────────────────────────── */}
      <section>
        <div className="relief-glass mb-2 overflow-hidden rounded-xl">
          <div className="motif-band narrow" aria-hidden="true" />
        <button
          onClick={() => setShowConfidence((v) => !v)}
          className="flex min-h-11 w-full items-center justify-between px-3 py-2"
        >
          <div className="flex items-center gap-2">
            <p className="text-xs uppercase tracking-widest text-[var(--t-text-muted)]">
              Prestige Picks
            </p>
            {myConfidencePicks.length > 0 && (
              <span className="rounded-full border border-[var(--t-line)] px-1.5 py-0.5 text-xs text-[var(--t-text-dim)] tabular-nums">
                {myConfidencePicks.length}
              </span>
            )}
          </div>
          <motion.div
            animate={{ rotate: showConfidence ? 0 : -90 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown size={14} className="text-[var(--t-text-dim)]" />
          </motion.div>
        </button>
        </div>

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
                      'flex min-h-11 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                      active
                        ? f === 'won' ? 'border-[var(--t-positive)] bg-[var(--t-positive-soft)] text-[var(--t-positive)]'
                          : f === 'lost' ? 'border-[var(--t-negative)] bg-[var(--t-negative-soft)] text-[var(--t-negative)]'
                          : f === 'waiting' ? 'border-[var(--t-pending)] bg-[var(--t-pending-soft)] text-[var(--t-pending)]'
                          : 'border-[var(--t-personal-text)] bg-[var(--t-personal-raised)] text-[var(--t-personal-text)]'
                        : 'border-[var(--t-line-soft)] bg-[var(--t-clear)] text-[var(--t-text-dim)]',
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
          <p className="py-6 text-center text-sm text-[var(--t-text-dim)]">No picks submitted</p>
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
                  className={[
                    'relief-glass flex min-h-11 items-center gap-3 rounded-xl border-l-4! px-3 py-2.5',
                    pick.is_correct === true
                      ? 'border-l-[var(--t-positive)]!'
                      : pick.is_correct === false
                        ? 'border-l-[var(--t-negative)]!'
                        : 'border-l-[var(--t-pending)]!',
                  ].join(' ')}
                >
                  {/* Status icon */}
                  <div className="flex-shrink-0 w-4">
                    {pick.is_correct === true && (
                      <CheckCircle size={16} className="text-[var(--t-positive)]" />
                    )}
                    {pick.is_correct === false && (
                      <XCircle size={16} className="text-[var(--t-negative)]" />
                    )}
                    {pick.is_correct === null && (
                      <Clock size={16} className="text-[var(--t-pending)]" />
                    )}
                  </div>

                  {/* Category + nominee */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 mb-0.5">
                      {cat && <CategoryIcon categoryName={cat.name} size={10} className="flex-shrink-0 text-[var(--t-text-dim)]" />}
                      <p className="truncate text-xs uppercase tracking-wider text-[var(--t-text-dim)]">
                        {cat?.name ?? `Category ${pick.category_id}`}
                      </p>
                    </div>
                    <p
                      className={[
                        'text-sm truncate',
                        pick.is_correct === true
                          ? 'font-semibold text-[var(--t-positive)]'
                          : pick.is_correct === false
                          ? 'text-[var(--t-negative)] line-through'
                          : 'text-[var(--t-text-muted)]',
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
                          ? 'text-[var(--t-positive)]'
                          : pick.is_correct === false
                          ? 'text-[var(--t-negative)]'
                          : 'text-[var(--t-pending)]',
                      ].join(' ')}
                    >
                      {pick.is_correct === false ? 0 : pick.confidence}
                    </p>
                    <p className="text-xs text-[var(--t-text-dim)]">pt</p>
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
                'relief-glass min-h-11 flex-shrink-0 flex items-center gap-2 rounded-xl border px-2.5 transition-colors',
                selected
                  ? 'border-[var(--t-personal-text)]! bg-[var(--t-personal-raised)]!'
                  : 'border-[var(--t-line)]!',
              ].join(' ')}
            >
              <Avatar avatarId={roomPlayer.avatar_id} size="sm" highlighted={selected} />
              <span className={selected ? 'text-sm font-semibold text-[var(--t-personal-text)]' : 'text-sm text-[var(--t-text-muted)]'}>
                {roomPlayer.name.split(' ')[0]}
              </span>
            </motion.button>
          )
        })}
      </div>

      {/* ── Draft roster ──────────────────────────────────────────────────── */}
      <section className="pb-4">
        <div className="relief-glass mb-2 overflow-hidden rounded-xl">
          <div className="motif-band narrow" aria-hidden="true" />
        <button
          onClick={() => setShowDraft((v) => !v)}
          className="flex min-h-11 w-full items-center justify-between px-3 py-2"
        >
          <div className="flex items-center gap-2">
            <p className="text-xs uppercase tracking-widest text-[var(--t-text-muted)]">
              {rosterPlayerId === currentPlayerId
                ? 'My Ensemble'
                : `${players.find((roomPlayer) => roomPlayer.id === rosterPlayerId)?.name.split(' ')[0] ?? 'Player'}'s Ensemble`}
            </p>
            {selectedDraftEntities.length > 0 && (
              <span className="rounded-full border border-[var(--t-line)] px-1.5 py-0.5 text-xs text-[var(--t-text-dim)] tabular-nums">
                {selectedDraftEntities.length}
              </span>
            )}
          </div>
          <motion.div
            animate={{ rotate: showDraft ? 0 : -90 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown size={14} className="text-[var(--t-text-dim)]" />
          </motion.div>
        </button>
        </div>

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
                        'flex min-h-11 items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                        active
                          ? f === 'won' ? 'border-[var(--t-positive)] bg-[var(--t-positive-soft)] text-[var(--t-positive)]'
                            : f === 'in_play' ? 'border-[var(--t-pending)] bg-[var(--t-pending-soft)] text-[var(--t-pending)]'
                            : 'border-[var(--t-personal-text)] bg-[var(--t-personal-raised)] text-[var(--t-personal-text)]'
                          : 'border-[var(--t-line-soft)] bg-[var(--t-clear)] text-[var(--t-text-dim)]',
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
          <p className="py-6 text-center text-sm text-[var(--t-text-dim)]">No ensemble picks</p>
        ) : (
          <div className="space-y-3">
            {selectedDraftEntities.map((entity) => {
              const status = getEntityStatus(entity, categories, nominees, signatureBeats)
              if (draftFilter !== 'all' && status !== draftFilter) return null
              const portraitUrl = resolveDraftEntityPortrait(entity, nominees)
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
                    'relief-glass rounded-2xl border-l-4! p-4',
                    status === 'won'
                      ? 'border-l-[var(--t-positive)]!'
                      : 'border-l-[var(--t-pending)]!',
                  ].join(' ')}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <StoryPortrait
                        name={entity.name}
                        src={portraitUrl}
                        className="h-12 w-12"
                        fallback={<FilmIcon filmName={entity.type === 'film' ? entity.name : entity.film_name} size={18} className="text-[var(--t-text-muted)]" />}
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--t-text)]">{entity.name}</p>
                      {entity.film_name && entity.type === 'person' && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <FilmIcon filmName={entity.film_name} size={10} className="flex-shrink-0 text-[var(--t-text-dim)]" />
                          <p className="truncate text-xs text-[var(--t-text-dim)]">{entity.film_name}</p>
                        </div>
                      )}
                      </div>
                    </div>
                    <span className={[
                      'whitespace-nowrap rounded-full border px-2 py-0.5 text-xs uppercase tracking-wider',
                      status === 'won'
                        ? 'border-[var(--t-positive)] bg-[var(--t-positive-soft)] font-bold text-[var(--t-positive)]'
                        : 'border-[var(--t-pending)] bg-[var(--t-pending-soft)] font-medium text-[var(--t-pending)]',
                    ].join(' ')}>
                      {status === 'won' ? 'Scored' : 'In play'}
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {liveBeats.map((beat) => {
                      const hit = beatWasHit(beat, entity, categories, nominees)
                      return (
                        <div key={beat.id} className="relief-glass flex min-h-11 items-center gap-2 rounded-xl px-3 py-2">
                          {hit
                            ? <CheckCircle size={15} className="flex-shrink-0 text-[var(--t-positive)]" />
                            : <Clock size={15} className="flex-shrink-0 text-[var(--t-pending)]" />}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-[var(--t-text)]">{beat.name}</p>
                            <p className="text-xs text-[var(--t-text-dim)]">{oddsLabel(beat.odds)}{entity.type === 'film' ? ' · always live' : ''}</p>
                          </div>
                          <span className={hit ? 'text-sm font-bold text-[var(--t-positive)]' : 'text-sm font-bold text-[var(--t-pending)]'}>
                            {beat.points} pts
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  {passedBeats.length > 0 && (
                    <div className="mt-3 border-t border-[var(--t-line-soft)] pt-3">
                      <p className="mb-1.5 text-xs uppercase tracking-widest text-[var(--t-text-dim)]">Passed on</p>
                      <div className="space-y-1">
                        {passedBeats.map((beat) => (
                          <div key={beat.id} className="flex min-h-11 items-center justify-between gap-3 px-2 py-1.5 text-[var(--t-negative)]">
                            <div className="min-w-0">
                              <p className="text-xs truncate">{beat.name}</p>
                              <p className="text-xs">{oddsLabel(beat.odds)}</p>
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
      'relief-glass rounded-xl border px-3 py-2.5 text-center',
      dimmed
        ? 'border-[var(--t-line-soft)]! opacity-60'
        : 'border-[var(--t-line)]!',
    ].join(' ')}>
      <p className={[
        'text-base font-bold tabular-nums leading-none',
        dimmed ? 'text-[var(--t-text-dim)]' : 'text-[var(--t-text)]',
      ].join(' ')}>
        {value}
      </p>
      <p className={[
        'mt-1 text-xs uppercase tracking-wider',
        dimmed ? 'text-[var(--t-text-dim)]' : 'text-[var(--t-text-muted)]',
      ].join(' ')}>
        {label}
      </p>
    </div>
  )
}
