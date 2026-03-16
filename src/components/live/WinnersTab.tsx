/**
 * WinnersTab — live category list with winner announcement controls.
 *
 * Visible to ALL players. Only the host can interact with winner selection.
 *
 * LAYOUT:
 *   - Progress bar: "12 / 24 Announced"
 *   - End Ceremony card (host only, when all categories have winners)
 *   - Category list sorted by display_order:
 *       ANNOUNCED: name + tier badge + winner name (oscar-gold) + film + check
 *                  Tap to expand → all nominees, winner highlighted
 *                  Undo button (host only, within 30s window)
 *       UNANNOUNCED (host): "Open Category" button → spotlight via openSpotlight()
 *       UNANNOUNCED (non-host): "Awaiting result..." italic
 */

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Check,
  ChevronDown,
  ChevronUp,
  Clapperboard,
  Clock,
  FastForward,
  RotateCcw,
  Trophy,
  User,
} from 'lucide-react'
import { useAdmin } from '../../hooks/useAdmin'
import { CategoryIcon } from '../../lib/category-icons'
import { FilmIcon } from '../../lib/film-icons'
import { supabase } from '../../lib/supabase'

const FREE_CENTER_INDEX = 12


const UNDO_WINDOW_MS = 30_000

const TIER_BADGE_COLORS: Record<number, string> = {
  1: 'bg-oscar-gold/20 text-oscar-gold',
  2: 'bg-purple-500/20 text-purple-300',
  3: 'bg-blue-500/20 text-blue-300',
  4: 'bg-emerald-500/20 text-emerald-300',
  5: 'bg-white/10 text-white/50',
}

interface Props {
  roomId: string
  isHost: boolean
  onEndCeremony: () => Promise<void>
  isEndingCeremony: boolean
  openSpotlight: (categoryId: number) => Promise<void>
  onDevAutoCompleteRunning?: (running: boolean) => void
}

export default function WinnersTab({ roomId, isHost, onEndCeremony, isEndingCeremony, openSpotlight, onDevAutoCompleteRunning }: Props) {
  const {
    categories,
    winnerSetAt,
    isLoading,
    undoWinner,
    setWinner,
  } = useAdmin(roomId)

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

      const now = new Date().toISOString()
      await supabase.from('bingo_marks').insert(
        toMark.map((index) => ({
          card_id: card.id,
          square_index: index,
          status: 'approved',
          marked_at: now,
        })),
      )
    }
  }

  async function handleDevAutoComplete() {
    if (!isHost || isAutoCompleting) return
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
      await onEndCeremony()
    } finally {
      setIsAutoCompleting(false)
      onDevAutoCompleteRunning?.(false)
    }
  }
  const [tick, setTick] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // 1Hz tick to keep undo countdowns accurate
  useEffect(() => {
    const hasRecent = Object.values(winnerSetAt).some(
      (t) => Date.now() - t < UNDO_WINDOW_MS,
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

  async function handleUndo(categoryId: number) {
    try {
      await undoWinner(categoryId)
    } catch {
      // silent — undo window likely expired
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-7 h-7 border-2 border-oscar-gold border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const announcedCount = categories.filter((c) => c.winner_id != null).length
  const totalCount = categories.length
  const allAnnounced = totalCount > 0 && announcedCount === totalCount

  return (
    <>
      <div className="space-y-3 pt-2">

        {/* Dev-only: auto-complete all categories and end ceremony */}
        {import.meta.env.DEV && isHost && (
          <motion.button
            onClick={handleDevAutoComplete}
            disabled={isAutoCompleting}
            whileTap={!isAutoCompleting ? { scale: 0.97 } : undefined}
            className={[
              'w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border transition-all',
              !isAutoCompleting
                ? 'bg-purple-500/15 border-purple-500/30 text-purple-300'
                : 'bg-white/5 border-white/10 text-white/30 cursor-not-allowed',
            ].join(' ')}
          >
            {isAutoCompleting ? (
              <div className="w-3.5 h-3.5 border-2 border-purple-300/40 border-t-purple-300 rounded-full animate-spin" />
            ) : (
              <FastForward size={12} />
            )}
            {isAutoCompleting ? 'Auto-completing...' : 'DEV: Auto-Complete All & End'}
          </motion.button>
        )}

        {/* Progress header */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-white/35 uppercase tracking-widest font-semibold">Winners</span>
            <div className="flex items-center gap-1.5">
              <Trophy size={11} className="text-oscar-gold" />
              <span className="text-xs font-extrabold text-oscar-gold tabular-nums">
                {announcedCount}
                <span className="text-white/30 font-normal mx-0.5">/</span>
                {totalCount}
              </span>
              <span className="text-[10px] text-white/35">Announced</span>
            </div>
          </div>
          {/* Progress track */}
          <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
            <motion.div
              className="h-full rounded-full"
              animate={{ width: `${totalCount > 0 ? (announcedCount / totalCount) * 100 : 0}%` }}
              transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
              style={{
                background: 'linear-gradient(90deg, #D4AF37, #F5E6A3)',
                boxShadow: announcedCount > 0 ? '0 0 8px 1px rgba(212,175,55,0.5)' : undefined,
              }}
            />
          </div>
        </div>

        {/* End Ceremony — host only, when all announced */}
        <AnimatePresence>
          {allAnnounced && isHost && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="backdrop-blur-lg bg-oscar-gold/10 border border-oscar-gold/30 rounded-2xl p-4 space-y-3"
            >
              <div className="flex items-center gap-2">
                <Trophy size={14} className="text-oscar-gold" />
                <p className="text-sm font-semibold text-white">
                  All {totalCount} categories announced
                </p>
              </div>
              <p className="text-xs text-white/50">
                End the ceremony to lock scores and show final standings.
              </p>
              <motion.button
                onClick={onEndCeremony}
                disabled={isEndingCeremony}
                whileTap={!isEndingCeremony ? { scale: 0.97 } : undefined}
                className={[
                  'w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all',
                  !isEndingCeremony
                    ? 'bg-oscar-gold text-deep-navy'
                    : 'bg-white/10 text-white/30 cursor-not-allowed',
                ].join(' ')}
              >
                {isEndingCeremony ? (
                  <div className="w-4 h-4 border-2 border-deep-navy/40 border-t-deep-navy rounded-full animate-spin" />
                ) : (
                  <>
                    <Clapperboard size={14} />
                    End Ceremony
                  </>
                )}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Category list */}
        <div className="space-y-2">
          {categories.map((category, i) => {
            const hasWinner = category.winner_id != null
            const isExpanded = expandedIds.has(category.id)
            const setAt = winnerSetAt[category.id]
            const canUndo = isHost && setAt != null && Date.now() - setAt < UNDO_WINDOW_MS
            const secondsLeft = canUndo
              ? Math.ceil((UNDO_WINDOW_MS - (Date.now() - setAt)) / 1000)
              : 0

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
                  'backdrop-blur-lg border rounded-xl overflow-hidden relative',
                  hasWinner
                    ? 'bg-oscar-gold/4 border-oscar-gold/14'
                    : 'bg-white/6 border-white/10',
                ].join(' ')}
              >
                {/* Gold left-edge accent for announced categories */}
                {hasWinner && (
                  <div
                    className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-xl"
                    style={{
                      background: 'linear-gradient(180deg, rgba(212,175,55,0.7) 0%, rgba(212,175,55,0.25) 100%)',
                    }}
                  />
                )}

                {/* Main row */}
                <button
                  onClick={hasWinner ? () => toggleExpand(category.id) : undefined}
                  className={[
                    'w-full px-3.5 py-3 flex items-center gap-3 text-left',
                    hasWinner ? 'cursor-pointer' : 'cursor-default',
                  ].join(' ')}
                >
                  {/* Status icon */}
                  <div
                    className={[
                      'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0',
                      hasWinner
                        ? 'bg-oscar-gold/16 border border-oscar-gold/30'
                        : 'bg-white/6 border border-white/8',
                    ].join(' ')}
                  >
                    {hasWinner ? (
                      <Trophy size={11} className="text-oscar-gold" />
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
                        <p className="text-[13px] font-bold text-oscar-gold leading-tight truncate"
                          style={{ textShadow: '0 0 16px rgba(212,175,55,0.28)' }}
                        >
                          {winnerNominee.name}
                          {hasTie && tieWinnerNominee && (
                            <>
                              <span className="text-white/28 mx-1 font-normal">&</span>
                              {tieWinnerNominee.name}
                            </>
                          )}
                        </p>
                        {hasTie && (
                          <span className="text-[9px] text-amber-400/60 uppercase tracking-wide font-semibold">Tie</span>
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
                        className="px-3 py-1.5 rounded-lg bg-oscar-gold/15 border border-oscar-gold/30 text-oscar-gold text-xs font-semibold"
                      >
                        Spotlight
                      </motion.button>
                    )}

                    {hasWinner && canUndo && (
                      <motion.button
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        whileTap={{ scale: 0.94 }}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleUndo(category.id)
                        }}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/10 border border-white/15 text-white/50 text-[11px]"
                      >
                        <RotateCcw size={10} />
                        {secondsLeft}s
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
                                  ? 'bg-oscar-gold/10 border border-oscar-gold/20'
                                  : 'bg-white/5',
                              ].join(' ')}
                            >
                              <div
                                className={[
                                  'w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0',
                                  isWinner ? 'bg-oscar-gold/20' : 'bg-white/8',
                                ].join(' ')}
                              >
                                {nominee.type === 'person' ? (
                                  <User size={12} className={isWinner ? 'text-oscar-gold' : 'text-white/30'} />
                                ) : (
                                  <FilmIcon filmName={nominee.film_name || nominee.name} size={12} className={isWinner ? 'text-oscar-gold' : 'text-white/30'} />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p
                                  className={[
                                    'text-xs font-medium leading-tight',
                                    isWinner ? 'text-oscar-gold' : 'text-white/50',
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
                                <Check size={12} className="text-oscar-gold flex-shrink-0" strokeWidth={3} />
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
              className="fixed bottom-20 left-4 right-4 max-w-md mx-auto bg-red-500/90 text-white text-sm font-medium px-4 py-3 rounded-xl text-center z-40"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

      </div>

    </>
  )
}
