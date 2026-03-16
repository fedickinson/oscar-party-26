/**
 * WinnerSelector — bottom sheet for picking the winner of a category.
 *
 * States:
 *   browsing   -> nominee cards with selection toggles, tap to select/deselect
 *   confirming -> 1 or 2 nominees selected, pick context breakdown,
 *                 "Confirm" / "Cancel" buttons
 *
 * TIE SUPPORT:
 *   Select 1 nominee -> standard single-winner confirmation (unchanged flow).
 *   Select 2 nominees -> tie confirmation with warning:
 *     "Are you sure there was a tie? This is unusual."
 *   Maximum 2 selections allowed (further taps ignored if 2 already selected).
 *
 * PICK CONTEXT (shown in confirming state):
 *   When the host selects a nominee, we immediately fetch and display:
 *   - Ensemble Draft: which player drafted this entity and their points gain
 *   - Confidence: each player's pick for this category with their confidence
 *     value — clearly showing who scores and who doesn't
 *   For ties, confidence picks matching EITHER nominee are shown as correct.
 *
 * Double-tap guard: `onConfirm` / `onConfirmTie` is disabled after first call
 * until parent closes the sheet. The `isSubmitting` prop drives the disabled state.
 *
 * This component is wrapped in AnimatePresence by WinnersTab.
 */

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Check, User, X } from 'lucide-react'
import { FilmIcon } from '../../lib/film-icons'
import { supabase } from '../../lib/supabase'
import { useGame } from '../../context/GameContext'
import Avatar from '../Avatar'
import type { NomineeRow, PlayerRow } from '../../types/database'
import type { CategoryWithNominees } from '../../types/game'
import { CategoryIcon } from '../../lib/category-icons'

const TIER_LABELS: Record<number, string> = {
  1: 'Major Awards',
  2: 'Prestige Craft',
  3: 'Technical & Performance',
  4: 'Specialty',
  5: 'Short Films',
}

// ─── Pick context types ───────────────────────────────────────────────────────

interface ConfidencePickInfo {
  player: PlayerRow
  nomineeId: string
  nomineeName: string
  confidence: number
  /** true = this player picked one of the selected (winning) nominees */
  pickedThis: boolean
}

interface PickContext {
  draftPlayer: PlayerRow | null
  /** Second draft player when two nominees are selected (tie) */
  draftPlayer2: PlayerRow | null
  allConfidencePicks: ConfidencePickInfo[]
  isLoaded: boolean
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  category: CategoryWithNominees
  roomId: string
  onConfirm: (nomineeId: string) => Promise<void>
  onConfirmTie: (nomineeId1: string, nomineeId2: string) => Promise<void>
  onClose: () => void
  isSubmitting: boolean
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WinnerSelector({
  category,
  roomId,
  onConfirm,
  onConfirmTie,
  onClose,
  isSubmitting,
}: Props) {
  const { players } = useGame()
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [pickContext, setPickContext] = useState<PickContext>({
    draftPlayer: null,
    draftPlayer2: null,
    allConfidencePicks: [],
    isLoaded: false,
  })

  const isTie = selectedIds.length === 2
  const hasSelection = selectedIds.length > 0
  const selectedNominees = selectedIds
    .map((id) => category.nominees.find((n) => n.id === id))
    .filter((n): n is NomineeRow => n != null)

  // Fetch draft + confidence context whenever selection changes
  useEffect(() => {
    if (selectedIds.length === 0) {
      setPickContext({ draftPlayer: null, draftPlayer2: null, allConfidencePicks: [], isLoaded: false })
      return
    }

    let cancelled = false

    async function fetchContext() {
      // ── Draft: find which player drafted the winning entities ───────────────
      const [{ data: entities }, { data: draftPicks }] = await Promise.all([
        supabase.from('draft_entities').select(),
        supabase.from('draft_picks').select().eq('room_id', roomId),
      ])

      function findDraftPlayer(nominee: NomineeRow): PlayerRow | null {
        if (!entities || !draftPicks) return null
        const filmTitle = nominee.film_name || nominee.name
        const matchingEntity = entities.find((e) =>
          nominee.type === 'person'
            ? e.type === 'person' && e.name === nominee.name
            : e.type === 'film' && e.film_name === filmTitle,
        )
        if (!matchingEntity) return null
        const pick = draftPicks.find((p) => p.entity_id === matchingEntity.id)
        if (!pick) return null
        return players.find((p) => p.id === pick.player_id) ?? null
      }

      const nominee1 = category.nominees.find((n) => n.id === selectedIds[0])
      const nominee2 = selectedIds.length > 1
        ? category.nominees.find((n) => n.id === selectedIds[1])
        : null

      const draftPlayer = nominee1 ? findDraftPlayer(nominee1) : null
      const draftPlayer2 = nominee2 ? findDraftPlayer(nominee2) : null

      // ── Confidence: all picks for this category in this room ─────────────
      const { data: confPicks } = await supabase
        .from('confidence_picks')
        .select()
        .eq('room_id', roomId)
        .eq('category_id', category.id)
        .order('confidence', { ascending: false })

      const selectedIdSet = new Set(selectedIds)

      const allConfidencePicks: ConfidencePickInfo[] = (confPicks ?? [])
        .map((cp) => {
          const player = players.find((p) => p.id === cp.player_id)
          if (!player) return null
          const nomineeName =
            category.nominees.find((n) => n.id === cp.nominee_id)?.name ?? 'Unknown'
          return {
            player,
            nomineeId: cp.nominee_id,
            nomineeName,
            confidence: cp.confidence,
            pickedThis: selectedIdSet.has(cp.nominee_id),
          }
        })
        .filter((x): x is ConfidencePickInfo => x !== null)

      if (!cancelled) {
        setPickContext({ draftPlayer, draftPlayer2, allConfidencePicks, isLoaded: true })
      }
    }

    fetchContext()
    return () => { cancelled = true }
  }, [selectedIds.join(','), roomId, category.id, players])

  function handleNomineeTap(nominee: NomineeRow) {
    if (isSubmitting) return

    setSelectedIds((prev) => {
      // If already selected, deselect
      if (prev.includes(nominee.id)) {
        return prev.filter((id) => id !== nominee.id)
      }
      // Max 2 selections
      if (prev.length >= 2) return prev
      return [...prev, nominee.id]
    })
  }

  async function handleConfirm() {
    if (isSubmitting) return
    if (selectedIds.length === 1) {
      await onConfirm(selectedIds[0])
    } else if (selectedIds.length === 2) {
      await onConfirmTie(selectedIds[0], selectedIds[1])
    }
  }

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 bg-black/70 z-40"
        onClick={() => {
          if (!isSubmitting) onClose()
        }}
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 42 }}
        className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto"
      >
        <div className="backdrop-blur-xl bg-deep-navy/96 border border-white/15 rounded-t-3xl p-5 pb-8 max-h-[85vh] overflow-y-auto">

          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1 mr-3">
              <p className="text-xs text-white/40 uppercase tracking-widest mb-1">
                {TIER_LABELS[category.tier] ?? `Tier ${category.tier}`}
              </p>
              <h2 className="text-lg font-bold text-white leading-tight flex items-center gap-2">
                <CategoryIcon categoryName={category.name} size={18} className="text-white/50 flex-shrink-0" />
                {category.name}
              </h2>
              <p className="text-sm text-oscar-gold mt-0.5">
                {category.points} pts
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0 mt-1"
            >
              <X size={14} className="text-white/60" />
            </button>
          </div>

          {/* Selection hint */}
          {!hasSelection && (
            <p className="text-xs text-white/30 mb-3 px-1">
              Tap a nominee to select. Tap two for a tie.
            </p>
          )}

          {/* Nominee list — always visible, with selection state */}
          <div className="space-y-2.5">
            {category.nominees.map((nominee, i) => {
              const isSelected = selectedIds.includes(nominee.id)
              return (
                <motion.button
                  key={nominee.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.18 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleNomineeTap(nominee)}
                  disabled={isSubmitting || (selectedIds.length >= 2 && !isSelected)}
                  className={[
                    'w-full backdrop-blur-lg border rounded-2xl p-4 flex items-center gap-3 text-left transition-colors',
                    isSelected
                      ? 'bg-oscar-gold/10 border-2 border-oscar-gold/50'
                      : 'bg-white/8 border-white/12 hover:bg-white/12',
                    isSubmitting || (selectedIds.length >= 2 && !isSelected)
                      ? 'opacity-40'
                      : '',
                  ].join(' ')}
                >
                  <div className={[
                    'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                    isSelected ? 'bg-oscar-gold/20' : 'bg-white/10',
                  ].join(' ')}>
                    {isSelected ? (
                      <Check size={18} className="text-oscar-gold" strokeWidth={3} />
                    ) : nominee.type === 'person' ? (
                      <User size={18} className="text-white/50" />
                    ) : (
                      <FilmIcon filmName={nominee.film_name || nominee.name} size={18} className="text-white/50" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={[
                      'font-semibold leading-tight',
                      isSelected ? 'text-oscar-gold' : 'text-white',
                    ].join(' ')}>
                      {nominee.name}
                    </p>
                    {nominee.film_name && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <FilmIcon filmName={nominee.film_name} size={10} className={isSelected ? 'text-white/40 flex-shrink-0' : 'text-white/35 flex-shrink-0'} />
                        <p className={['text-xs truncate', isSelected ? 'text-white/50' : 'text-white/45'].join(' ')}>
                          {nominee.film_name}
                        </p>
                      </div>
                    )}
                  </div>
                  {isSelected && (
                    <span className="text-[10px] text-oscar-gold/60 flex-shrink-0 uppercase tracking-wide font-semibold">
                      {isTie ? 'Tied' : 'Winner'}
                    </span>
                  )}
                </motion.button>
              )
            })}
          </div>

          {/* Pick context + confirmation (shown when at least one selected) */}
          {hasSelection && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4 mt-4"
            >
              {/* Tie warning */}
              {isTie && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-3 px-3.5 py-3 bg-amber-500/10 border border-amber-500/25 rounded-xl"
                >
                  <AlertTriangle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-300 leading-tight">
                      Are you sure there was a tie?
                    </p>
                    <p className="text-xs text-white/40 mt-0.5">
                      This is unusual. Both nominees will be marked as winners and confidence
                      picks matching either will earn full points.
                    </p>
                  </div>
                </motion.div>
              )}

              {/* Pick context */}
              {!pickContext.isLoaded ? (
                <div className="flex justify-center py-4">
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                </div>
              ) : (
                <div className="space-y-3">

                  {/* ── Ensemble Draft ────────────────────────────────────── */}
                  <div>
                    <p className="text-[10px] text-white/35 uppercase tracking-widest mb-1.5">
                      Ensemble · {category.points} pts
                    </p>
                    {pickContext.draftPlayer ? (
                      <div className="flex items-center gap-2.5 px-3 py-2.5 bg-oscar-gold/8 border border-oscar-gold/20 rounded-xl mb-1.5">
                        <Avatar avatarId={pickContext.draftPlayer.avatar_id} size="sm" />
                        <span className="text-sm text-white flex-1 truncate">
                          {pickContext.draftPlayer.name}
                          {selectedNominees[0] && (
                            <span className="text-white/30 text-xs ml-1">
                              ({selectedNominees[0].name})
                            </span>
                          )}
                        </span>
                        <span className="text-xs font-bold text-oscar-gold flex-shrink-0">
                          +{category.points} pts
                        </span>
                      </div>
                    ) : (
                      <p className="text-xs text-white/30 italic px-1 mb-1.5">
                        Nobody claimed {selectedNominees[0]?.name ?? 'this nominee'} — no ensemble points
                      </p>
                    )}
                    {isTie && (
                      pickContext.draftPlayer2 ? (
                        <div className="flex items-center gap-2.5 px-3 py-2.5 bg-oscar-gold/8 border border-oscar-gold/20 rounded-xl">
                          <Avatar avatarId={pickContext.draftPlayer2.avatar_id} size="sm" />
                          <span className="text-sm text-white flex-1 truncate">
                            {pickContext.draftPlayer2.name}
                            {selectedNominees[1] && (
                              <span className="text-white/30 text-xs ml-1">
                                ({selectedNominees[1].name})
                              </span>
                            )}
                          </span>
                          <span className="text-xs font-bold text-oscar-gold flex-shrink-0">
                            +{category.points} pts
                          </span>
                        </div>
                      ) : (
                        <p className="text-xs text-white/30 italic px-1">
                          Nobody claimed {selectedNominees[1]?.name ?? 'the second nominee'} — no ensemble points
                        </p>
                      )
                    )}
                  </div>

                  {/* ── Confidence Picks ──────────────────────────────────── */}
                  {pickContext.allConfidencePicks.length > 0 && (
                    <div>
                      <p className="text-[10px] text-white/35 uppercase tracking-widest mb-1.5">
                        Confidence Picks · {category.name}
                      </p>
                      <div className="space-y-1.5">
                        {pickContext.allConfidencePicks.map(({
                          player,
                          nomineeName,
                          confidence,
                          pickedThis,
                        }) => (
                          <div
                            key={player.id}
                            className={[
                              'flex items-center gap-2.5 px-3 py-2.5 rounded-xl border',
                              pickedThis
                                ? 'bg-emerald-500/8 border-emerald-500/20'
                                : 'bg-white/4 border-white/8',
                            ].join(' ')}
                          >
                            <Avatar avatarId={player.avatar_id} size="sm" />
                            <div className="flex-1 min-w-0">
                              <p className={[
                                'text-sm leading-tight truncate',
                                pickedThis ? 'text-white' : 'text-white/45',
                              ].join(' ')}>
                                {player.name}
                              </p>
                              {!pickedThis && (
                                <p className="text-[10px] text-white/28 truncate">
                                  picked {nomineeName}
                                </p>
                              )}
                            </div>
                            <span className={[
                              'text-xs font-bold flex-shrink-0',
                              pickedThis ? 'text-emerald-400' : 'text-white/22',
                            ].join(' ')}>
                              {pickedThis ? `+${confidence} pts` : '0 pts'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              )}

              {/* Confirm / Cancel */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => setSelectedIds([])}
                  disabled={isSubmitting}
                  className="flex-1 py-3.5 rounded-2xl bg-white/10 text-white font-semibold text-sm disabled:opacity-40"
                >
                  Cancel
                </button>
                <motion.button
                  onClick={handleConfirm}
                  disabled={isSubmitting}
                  whileTap={!isSubmitting ? { scale: 0.97 } : undefined}
                  className={[
                    'flex-1 py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition-all',
                    !isSubmitting
                      ? isTie
                        ? 'bg-amber-500 text-deep-navy'
                        : 'bg-oscar-gold text-deep-navy'
                      : 'bg-white/10 text-white/30 cursor-not-allowed',
                  ].join(' ')}
                >
                  {isSubmitting ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : isTie ? (
                    <>
                      <AlertTriangle size={15} strokeWidth={2.5} /> Confirm Tie
                    </>
                  ) : (
                    <>
                      <Check size={15} strokeWidth={3} /> Confirm Winner
                    </>
                  )}
                </motion.button>
              </div>
            </motion.div>
          )}
        </div>
      </motion.div>
    </>
  )
}
