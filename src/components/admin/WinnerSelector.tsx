/**
 * WinnerSelector — bottom sheet for picking the winner of a category.
 *
 * States:
 *   browsing   → large nominee cards, tap to enter confirming state
 *   confirming → selected nominee highlighted, pick context breakdown,
 *                "Confirm" + "Cancel" buttons
 *
 * PICK CONTEXT (shown in confirming state):
 *   When the host selects a nominee, we immediately fetch and display:
 *   - Fantasy Draft: which player drafted this entity and their points gain
 *   - Confidence: each player's pick for this category with their confidence
 *     value — clearly showing who scores and who doesn't
 *   This eliminates ambiguity between "someone drafted it" vs "someone
 *   confidence-picked it" before the host commits.
 *
 * Double-tap guard: `onConfirm` is disabled after first call until parent
 * closes the sheet. The `isSubmitting` prop drives the disabled state.
 *
 * This component is wrapped in AnimatePresence by WinnersTab.
 */

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Film, User, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useGame } from '../../context/GameContext'
import Avatar from '../Avatar'
import type { NomineeRow, PlayerRow } from '../../types/database'
import type { CategoryWithNominees } from '../../types/game'

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
  /** true = this player picked the current confirming nominee */
  pickedThis: boolean
}

interface PickContext {
  draftPlayer: PlayerRow | null
  allConfidencePicks: ConfidencePickInfo[]
  isLoaded: boolean
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  category: CategoryWithNominees
  roomId: string
  onConfirm: (nomineeId: string) => Promise<void>
  onClose: () => void
  isSubmitting: boolean
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function WinnerSelector({
  category,
  roomId,
  onConfirm,
  onClose,
  isSubmitting,
}: Props) {
  const { players } = useGame()
  const [confirming, setConfirming] = useState<NomineeRow | null>(null)
  const [pickContext, setPickContext] = useState<PickContext>({
    draftPlayer: null,
    allConfidencePicks: [],
    isLoaded: false,
  })

  // Fetch draft + confidence context as soon as a nominee is selected
  useEffect(() => {
    if (!confirming) {
      setPickContext({ draftPlayer: null, allConfidencePicks: [], isLoaded: false })
      return
    }

    let cancelled = false

    async function fetchContext() {
      // ── Draft: find which player drafted the winning entity ───────────────
      const [{ data: entities }, { data: draftPicks }] = await Promise.all([
        supabase.from('draft_entities').select(),
        supabase.from('draft_picks').select().eq('room_id', roomId),
      ])

      let draftPlayer: PlayerRow | null = null
      if (entities && draftPicks && confirming) {
        // Person entity: match by name. Film entity: match by film_name.
        const matchingEntity = entities.find((e) =>
          confirming.type === 'person'
            ? e.type === 'person' && e.name === confirming.name
            : e.type === 'film' && e.film_name === confirming.film_name,
        )
        if (matchingEntity) {
          const pick = draftPicks.find((p) => p.entity_id === matchingEntity.id)
          if (pick) {
            draftPlayer = players.find((p) => p.id === pick.player_id) ?? null
          }
        }
      }

      // ── Confidence: all picks for this category in this room ─────────────
      const { data: confPicks } = await supabase
        .from('confidence_picks')
        .select()
        .eq('room_id', roomId)
        .eq('category_id', category.id)
        .order('confidence', { ascending: false })

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
            pickedThis: cp.nominee_id === confirming?.id,
          }
        })
        .filter((x): x is ConfidencePickInfo => x !== null)

      if (!cancelled) {
        setPickContext({ draftPlayer, allConfidencePicks, isLoaded: true })
      }
    }

    fetchContext()
    return () => { cancelled = true }
  }, [confirming?.id, roomId, category.id, players])

  function handleNomineeTap(nominee: NomineeRow) {
    if (isSubmitting) return
    setConfirming(nominee)
  }

  async function handleConfirm() {
    if (!confirming || isSubmitting) return
    await onConfirm(confirming.id)
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
              <h2 className="text-lg font-bold text-white leading-tight">
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

          {confirming ? (
            // ── Confirm state ───────────────────────────────────────────────
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {/* Selected nominee */}
              <div className="backdrop-blur-lg bg-oscar-gold/10 border-2 border-oscar-gold/50 rounded-2xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-oscar-gold/20 flex items-center justify-center flex-shrink-0">
                  {confirming.type === 'person' ? (
                    <User size={18} className="text-oscar-gold" />
                  ) : (
                    <Film size={18} className="text-oscar-gold" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white leading-tight">{confirming.name}</p>
                  {confirming.film_name && (
                    <p className="text-xs text-white/50 mt-0.5 truncate">
                      {confirming.film_name}
                    </p>
                  )}
                </div>
                <p className="text-xs text-white/35 flex-shrink-0">winner?</p>
              </div>

              {/* Pick context */}
              {!pickContext.isLoaded ? (
                <div className="flex justify-center py-4">
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                </div>
              ) : (
                <div className="space-y-3">

                  {/* ── Fantasy Draft ─────────────────────────────────────── */}
                  <div>
                    <p className="text-[10px] text-white/35 uppercase tracking-widest mb-1.5">
                      Fantasy Draft · {category.points} pts
                    </p>
                    {pickContext.draftPlayer ? (
                      <div className="flex items-center gap-2.5 px-3 py-2.5 bg-oscar-gold/8 border border-oscar-gold/20 rounded-xl">
                        <Avatar avatarId={pickContext.draftPlayer.avatar_id} size="sm" />
                        <span className="text-sm text-white flex-1 truncate">
                          {pickContext.draftPlayer.name}
                        </span>
                        <span className="text-xs font-bold text-oscar-gold flex-shrink-0">
                          +{category.points} pts
                        </span>
                      </div>
                    ) : (
                      <p className="text-xs text-white/30 italic px-1">
                        Nobody drafted {confirming.name} — no fantasy points
                      </p>
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
                  onClick={() => setConfirming(null)}
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
                      ? 'bg-oscar-gold text-deep-navy'
                      : 'bg-white/10 text-white/30 cursor-not-allowed',
                  ].join(' ')}
                >
                  {isSubmitting ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Check size={15} strokeWidth={3} /> Confirm Winner
                    </>
                  )}
                </motion.button>
              </div>
            </motion.div>
          ) : (
            // ── Browse nominees ─────────────────────────────────────────────
            <div className="space-y-2.5">
              {category.nominees.map((nominee, i) => (
                <motion.button
                  key={nominee.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.18 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleNomineeTap(nominee)}
                  className="w-full backdrop-blur-lg bg-white/8 border border-white/12 rounded-2xl p-4 flex items-center gap-3 text-left hover:bg-white/12 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                    {nominee.type === 'person' ? (
                      <User size={18} className="text-white/50" />
                    ) : (
                      <Film size={18} className="text-white/50" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-white leading-tight">{nominee.name}</p>
                    {nominee.film_name && (
                      <p className="text-xs text-white/45 mt-0.5 truncate">
                        {nominee.film_name}
                      </p>
                    )}
                  </div>
                </motion.button>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </>
  )
}
