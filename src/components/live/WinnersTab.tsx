/**
 * WinnersTab — live category list with winner announcement controls.
 *
 * Visible to ALL players. Only the host can interact with winner selection.
 *
 * LAYOUT:
 *   - Progress bar: "12 / 24 Announced"
 *   - Close-the-live-floor card (host only, permanent, two-step). Results Night
 *     resolves half its slate on social media after the broadcast, so the close
 *     is never gated on a full slate; the card names the unresolved count and
 *     what staying unresolved costs before the second confirmation.
 *   - Category list sorted by display_order:
 *       ANNOUNCED: name + tier badge + winner name (accent) + film + check
 *                  Tap to expand → all nominees, winner highlighted
 *                  Two-tap undo (host with authority, while the room is live,
 *                  for any declared category however it was declared)
 *       UNANNOUNCED (host): "Open Category" button → spotlight via openSpotlight()
 *       UNANNOUNCED (non-host): "Awaiting result..." italic
 */

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Check,
  ChevronDown,
  ChevronUp,
  Flame,
  Clock,
  FastForward,
  RotateCcw,
  AlertTriangle,
  Loader2,
  RefreshCw,
  Trophy,
  User,
} from 'lucide-react'
import { useAdmin } from '../../hooks/useAdmin'
import { CategoryIcon } from '../../lib/category-icons'
import { FilmIcon } from '../../lib/film-icons'
import {
  SCHEDULED_UNDO_HINT_WINDOW_MS,
  deriveLiveFloorCloseCard,
  deriveScheduledUndoAffordance,
} from '../../lib/live-floor'
import { supabase } from '../../lib/supabase'

const FREE_CENTER_INDEX = 12

/** How long an armed undo stays armed before it disarms itself. */
const UNDO_ARM_MS = 15_000

const TIER_BADGE_COLORS: Record<number, string> = {
  1: 'bg-accent/20 text-accent',
  2: 'bg-[var(--t-personal-field)] text-[var(--t-personal-text)]',
  3: 'bg-[var(--t-pending-soft)] text-[var(--t-pending)]',
  4: 'bg-positive/20 text-positive',
  5: 'bg-white/10 text-white/50',
}

interface Props {
  roomId: string
  isHost: boolean
  onCloseNight: () => Promise<void>
  isClosingNight: boolean
  closeNightError: string | null
  refereeEnabled: boolean
  refereeAuthorityMessage: string | null
  operatorCapability: string | null
  openSpotlight: (categoryId: number) => Promise<void>
  onDevAutoCompleteRunning?: (running: boolean) => void
}

export default function WinnersTab({
  roomId,
  isHost,
  onCloseNight,
  isClosingNight,
  closeNightError,
  refereeEnabled,
  refereeAuthorityMessage,
  operatorCapability,
  openSpotlight,
  onDevAutoCompleteRunning,
}: Props) {
  const {
    categories,
    winnerSetAt,
    roomPhase,
    isLoading,
    syncError,
    retrySync,
    undoWinner,
    setWinner,
  } = useAdmin(roomId, operatorCapability)

  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set())
  const [isAutoCompleting, setIsAutoCompleting] = useState(false)

  async function devFillBingoCards() {
    const { data: cards } = await supabase
      .from('bingo_cards')
      .select()
      .eq('room_id', roomId)
    if (!cards?.length) return

    // Brief pause so objective auto-approvals have time to insert first
    await new Promise((r) => setTimeout(r, 300))

    for (const card of cards) {
      const { data: existingMarks } = await supabase
        .from('bingo_marks')
        .select('square_index')
        .eq('card_id', card.id)

      const markedSet = new Set((existingMarks ?? []).map((m) => m.square_index as number))
      markedSet.add(FREE_CENTER_INDEX)

      // Randomly approve ~50% of the remaining unmarked squares
      const toMark = Array.from({ length: 25 }, (_, i) => i)
        .filter((i) => !markedSet.has(i) && Math.random() < 0.5)

      if (!toMark.length) continue

      for (const index of toMark) {
        await supabase.rpc('set_player_bingo_mark', {
          p_room_id: roomId,
          p_actor_player_id: card.player_id,
          p_card_id: card.id,
          p_square_index: index,
          p_marked: true,
        })
      }
    }
  }

  async function handleDevAutoComplete() {
    if (!isHost || !refereeEnabled || isAutoCompleting) return
    setIsAutoCompleting(true)
    onDevAutoCompleteRunning?.(true)
    try {
      const unannounced = categories.filter((c) => c.winner_id == null)
      for (const category of unannounced) {
        if (category.nominees.length > 0) {
          await setWinner(category.id, category.nominees[0].id)
          await new Promise((r) => setTimeout(r, 80))
        }
      }
      await devFillBingoCards()
      await onCloseNight()
    } finally {
      setIsAutoCompleting(false)
      onDevAutoCompleteRunning?.(false)
    }
  }
  const [tick, setTick] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [confirmingClose, setConfirmingClose] = useState(false)
  const [armedUndoId, setArmedUndoId] = useState<number | null>(null)

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // An armed undo disarms itself, so a stray tap never sits waiting to fire.
  useEffect(() => {
    if (armedUndoId == null) return
    const timer = setTimeout(() => setArmedUndoId(null), UNDO_ARM_MS)
    return () => clearTimeout(timer)
  }, [armedUndoId])

  // Clear a stale failure rather than leaving it over the live category list.
  useEffect(() => {
    if (error == null) return
    const timer = setTimeout(() => setError(null), 6000)
    return () => clearTimeout(timer)
  }, [error])

  // 1Hz tick to keep the undo freshness countdown accurate
  useEffect(() => {
    const hasRecent = Object.values(winnerSetAt).some(
      (t) => Date.now() - t < SCHEDULED_UNDO_HINT_WINDOW_MS,
    )
    if (hasRecent) {
      if (!tickRef.current) {
        tickRef.current = setInterval(() => setTick((n) => n + 1), 1000)
      }
    } else {
      if (tickRef.current) {
        clearInterval(tickRef.current)
        tickRef.current = null
      }
    }
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [winnerSetAt, tick])

  // Two-tap undo. The first tap arms one category; the second fires the
  // capability-gated compare-and-delete command. There is no timer to beat.
  async function handleUndo(categoryId: number) {
    if (armedUndoId !== categoryId) {
      setError(null)
      setArmedUndoId(categoryId)
      return
    }
    setArmedUndoId(null)
    try {
      await undoWinner(categoryId)
      setError(null)
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'That declaration could not be undone.',
      )
    }
  }

  function toggleExpand(id: number) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (syncError) {
    return (
      <div className="material-stone relief-inset mt-2 space-y-3 rounded-2xl p-4" role="alert">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-[var(--t-pending)] text-[var(--t-pending)]">
            <AlertTriangle size={16} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-[var(--t-text)]">Winner feed unavailable</p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--t-text-muted)]">
              {syncError} Results and operator actions are paused on this phone.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={retrySync}
          className="relief-raised flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--t-pending)] bg-[var(--t-pending-soft)] px-4 text-sm font-semibold text-[var(--t-pending)]"
        >
          <RefreshCw size={15} aria-hidden />
          Retry winner feed
        </button>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const announcedCount = categories.filter((c) => c.winner_id != null).length
  const totalCount = categories.length
  const closeCard = deriveLiveFloorCloseCard({ announcedCount, totalCount })

  return (
    <>
      <div className="space-y-3 pt-2">

        {isHost && refereeAuthorityMessage && (
          <p
            role="status"
            className="rounded-xl border border-[var(--t-pending)] bg-[var(--t-pending-soft)] p-3 text-sm text-[var(--t-text-muted)]"
          >
            {refereeAuthorityMessage}
          </p>
        )}

        {/* Dev-only: auto-complete all categories and end ceremony */}
        {import.meta.env.DEV && isHost && (
          <motion.button
            onClick={handleDevAutoComplete}
            disabled={isAutoCompleting || !refereeEnabled}
            whileTap={!isAutoCompleting ? { scale: 0.97 } : undefined}
            className={[
              'min-h-11 w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border transition-all',
              !isAutoCompleting
                ? 'border-[var(--t-personal-device)] bg-[var(--t-personal-field)] text-[var(--t-personal-text)]'
                : 'bg-white/5 border-white/10 text-white/30 cursor-not-allowed',
            ].join(' ')}
          >
            {isAutoCompleting ? (
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--t-personal-field)] border-t-[var(--t-personal-text)]" />
            ) : (
              <FastForward size={12} />
            )}
            {isAutoCompleting ? 'Auto-completing...' : 'DEV: Auto-Complete All & Close'}
          </motion.button>
        )}

        {/* Progress header */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-white/35 uppercase tracking-widest font-semibold">Winners</span>
            <div className="flex items-center gap-1.5">
              <Trophy size={11} className="text-accent" />
              <span className="text-xs font-extrabold text-accent tabular-nums">
                {announcedCount}
                <span className="text-white/30 font-normal mx-0.5">/</span>
                {totalCount}
              </span>
              <span className="text-[10px] text-white/35">Announced</span>
            </div>
          </div>
          {/* Progress track */}
          <div className="relief-inset h-1.5 bg-[var(--t-iron-dark)] rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-[var(--t-personal-device)]"
              animate={{ width: `${totalCount > 0 ? (announcedCount / totalCount) * 100 : 0}%` }}
              transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
            />
          </div>
        </div>

        {/* Close the live floor — host only, permanent, two-step. Unresolved
            categories do not block the close; the database command accepts
            them and the settlement pass is where they become true. */}
        {isHost && (
          <div className="material-stone relief-inset space-y-3 rounded-2xl p-4">
            <div className="flex items-center gap-2">
              {closeCard.unresolvedCount > 0 ? (
                <AlertTriangle size={14} style={{ color: 'var(--t-pending)' }} aria-hidden />
              ) : (
                <Trophy size={14} style={{ color: 'var(--t-accent)' }} aria-hidden />
              )}
              <p className="text-sm font-semibold text-[color:var(--t-text)]">
                {closeCard.headline}
              </p>
            </div>
            <p className="text-xs leading-relaxed text-[color:var(--t-text-muted)]">
              {closeCard.detail}
            </p>
            {closeCard.emptyLedgerWarning && (
              <p className="rounded-xl border border-[color:var(--t-pending)] bg-[var(--t-pending-soft)] p-3 text-xs leading-relaxed text-[color:var(--t-text-muted)]">
                {closeCard.emptyLedgerWarning}
              </p>
            )}

            {confirmingClose ? (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmingClose(false)}
                  disabled={isClosingNight}
                  className="min-h-11 rounded-xl border border-[color:var(--t-line)] px-3 py-2 text-sm font-medium text-[color:var(--t-text-muted)] disabled:opacity-40"
                >
                  Keep the floor live
                </button>
                <motion.button
                  type="button"
                  onClick={onCloseNight}
                  disabled={isClosingNight || !refereeEnabled}
                  whileTap={!isClosingNight && refereeEnabled ? { scale: 0.97 } : undefined}
                  className="min-h-11 rounded-xl bg-[var(--t-personal-device)] px-3 py-2 text-sm font-bold text-[color:var(--t-ground)] disabled:opacity-40"
                >
                  <span className="flex items-center justify-center gap-2">
                    {isClosingNight ? (
                      <Loader2 size={14} className="animate-spin" aria-hidden />
                    ) : (
                      <Flame size={14} aria-hidden />
                    )}
                    {isClosingNight ? 'Closing' : closeCard.confirmLabel}
                  </span>
                </motion.button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingClose(true)}
                disabled={isClosingNight || !refereeEnabled}
                className="min-h-11 w-full rounded-xl border border-[color:var(--t-line)] px-4 py-2 text-sm font-bold text-[color:var(--t-text)] disabled:opacity-40"
              >
                <span className="flex items-center justify-center gap-2">
                  <Flame size={14} aria-hidden />
                  Close the Live Floor
                </span>
              </button>
            )}

            {closeNightError && (
              <p className="text-xs text-[color:var(--t-pending)]" role="alert">
                {closeNightError}
              </p>
            )}
          </div>
        )}

        {/* Category list */}
        <div className="material-oak relief-carved rounded-2xl space-y-2">
          {categories.map((category, i) => {
            const hasWinner = category.winner_id != null
            const isExpanded = expandedIds.has(category.id)
            const undo = deriveScheduledUndoAffordance({
              isHost,
              refereeEnabled,
              roomPhase,
              hasWinner,
              declaredAtMs: winnerSetAt[category.id] ?? null,
              nowMs: Date.now(),
            })
            const isUndoArmed = armedUndoId === category.id

            const winnerNominee = hasWinner
              ? category.nominees.find((n) => n.id === category.winner_id)
              : null
            const tieWinnerNominee = hasWinner && category.tie_winner_id
              ? category.nominees.find((n) => n.id === category.tie_winner_id)
              : null
            const hasTie = tieWinnerNominee != null

            return (
              <motion.div
                key={category.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.015, 0.3), duration: 0.22 }}
                className={[
                  'relief-glass overflow-hidden relative',
                  hasWinner
                    ? 'text-[color:var(--t-text)]'
                    : 'text-[color:var(--t-text-muted)]',
                ].join(' ')}
              >
                {/* Main row */}
                <button
                  onClick={hasWinner ? () => toggleExpand(category.id) : undefined}
                  className={[
                    'min-h-11 w-full px-3.5 py-3 flex items-center gap-3 text-left',
                    hasWinner ? 'cursor-pointer' : 'cursor-default',
                  ].join(' ')}
                >
                  {/* Status icon */}
                  <div
                    className={[
                      'relative w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0',
                      hasWinner
                        ? 'bg-accent/16 border border-accent/30'
                        : 'bg-white/6 border border-white/8',
                    ].join(' ')}
                  >
                    {hasWinner ? (
                      <>
                        <Trophy size={11} className="text-accent" />
                        <span
                          aria-hidden="true"
                          className="absolute -right-1 -top-1 w-2.5 h-2.5 rounded-full bg-[var(--t-wax)] relief-seal"
                        />
                      </>
                    ) : (
                      <Clock size={12} className="text-white/22" />
                    )}
                  </div>

                  {/* Category info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                      <CategoryIcon
                        categoryName={category.name}
                        size={13}
                        className={hasWinner ? 'text-white/30 flex-shrink-0' : 'text-white/60 flex-shrink-0'}
                      />
                      <p
                        className={[
                          'text-sm font-medium leading-tight',
                          hasWinner ? 'text-white/60' : 'text-white',
                        ].join(' ')}
                      >
                        {category.name}
                      </p>
                      <span
                        className={[
                          'text-[9px] font-semibold px-1.5 py-0.5 rounded-full uppercase tracking-wide flex-shrink-0',
                          TIER_BADGE_COLORS[category.tier] ?? 'bg-white/10 text-white/40',
                        ].join(' ')}
                      >
                        {category.points}pt
                      </span>
                    </div>

                    {hasWinner && winnerNominee ? (
                      <div>
                        <p className="text-[13px] font-bold text-accent leading-tight truncate">
                          {winnerNominee.name}
                          {hasTie && tieWinnerNominee && (
                            <>
                              <span className="text-white/28 mx-1 font-normal">&</span>
                              {tieWinnerNominee.name}
                            </>
                          )}
                        </p>
                        {hasTie && (
                          <span className="text-[9px] font-semibold uppercase tracking-wide text-[var(--t-pending)]">Tie</span>
                        )}
                        {winnerNominee.film_name && !hasTie && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <FilmIcon filmName={winnerNominee.film_name} size={10} className="text-white/30 flex-shrink-0" />
                            <p className="text-[11px] text-white/40 truncate">
                              {winnerNominee.film_name}
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className={['text-xs', !isHost && 'italic'].join(' ')}>
                        <span className="text-white/30">
                          {isHost
                            ? `${category.nominees.length} nominees`
                            : 'Awaiting result...'}
                        </span>
                      </p>
                    )}
                  </div>

                  {/* Right-side actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!hasWinner && isHost && (
                      <motion.button
                        whileTap={{ scale: 0.94 }}
                        onClick={(e) => {
                          e.stopPropagation()
                          openSpotlight(category.id)
                        }}
                        disabled={!refereeEnabled}
                        className="relief-raised min-h-11 px-3 py-1.5 rounded-lg bg-accent/15 border border-accent/30 text-accent text-xs font-semibold"
                      >
                        Spotlight
                      </motion.button>
                    )}

                    {undo.enabled && (
                      <motion.button
                        type="button"
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        whileTap={{ scale: 0.94 }}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleUndo(category.id)
                        }}
                        aria-label={isUndoArmed
                          ? `Confirm undo of ${category.name}`
                          : `Undo ${category.name}`}
                        className={[
                          'relief-raised min-h-11 flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px]',
                          isUndoArmed
                            ? 'border-[color:var(--t-pending)] bg-[var(--t-pending-soft)] font-semibold text-[color:var(--t-pending)]'
                            : 'border-[color:var(--t-line)] text-[color:var(--t-text-dim)]',
                        ].join(' ')}
                      >
                        <RotateCcw size={10} aria-hidden />
                        {isUndoArmed
                          ? 'Confirm'
                          : undo.countdownSeconds != null
                            ? `Undo ${undo.countdownSeconds}s`
                            : 'Undo'}
                      </motion.button>
                    )}

                    {hasWinner && (
                      isExpanded
                        ? <ChevronUp size={14} className="text-white/30" />
                        : <ChevronDown size={14} className="text-white/30" />
                    )}
                  </div>
                </button>

                {/* Expanded: all nominees */}
                <AnimatePresence initial={false}>
                  {isExpanded && hasWinner && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-3.5 pb-3 pt-2 space-y-1.5 border-t border-white/8">
                        {category.nominees.map((nominee) => {
                          const isWinner = nominee.id === category.winner_id || nominee.id === category.tie_winner_id
                          return (
                            <div
                              key={nominee.id}
                              className={[
                                'flex items-center gap-2.5 px-2.5 py-2 rounded-lg',
                                isWinner
                                  ? 'bg-accent/10 border border-accent/20'
                                  : 'bg-white/5',
                              ].join(' ')}
                            >
                              <div
                                className={[
                                  'w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0',
                                  isWinner ? 'bg-accent/20' : 'bg-white/8',
                                ].join(' ')}
                              >
                                {nominee.type === 'person' ? (
                                  <User size={12} className={isWinner ? 'text-accent' : 'text-white/30'} />
                                ) : (
                                  <FilmIcon filmName={nominee.film_name || nominee.name} size={12} className={isWinner ? 'text-accent' : 'text-white/30'} />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p
                                  className={[
                                    'text-xs font-medium leading-tight',
                                    isWinner ? 'text-accent' : 'text-white/50',
                                  ].join(' ')}
                                >
                                  {nominee.name}
                                </p>
                                {nominee.film_name && (
                                  <div className="flex items-center gap-1 mt-0.5">
                                    <FilmIcon filmName={nominee.film_name} size={9} className="text-white/25 flex-shrink-0" />
                                    <p className="text-[10px] text-white/30 truncate">{nominee.film_name}</p>
                                  </div>
                                )}
                              </div>
                              {isWinner && (
                                <Check size={12} className="text-accent flex-shrink-0" strokeWidth={3} />
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              role="alert"
              className="fixed bottom-20 left-4 right-4 max-w-md mx-auto border border-[color:var(--t-pending)] bg-[var(--t-pending-soft)] text-[color:var(--t-text)] text-sm font-medium px-4 py-3 rounded-xl text-center z-40 backdrop-blur-lg"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

      </div>

    </>
  )
}
