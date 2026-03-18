/**
 * ModeSelectPanel — host-only game depth controls shown in the lobby.
 *
 * Two dimensions:
 *   Ensemble Draft: 'full' | 'stars_and_films' | 'films_only'
 *   Prestige Picks: 'full' | 'main_stage' | 'big_night'
 *
 * HOST CAN: tap a pill to select a mode (writes to rooms table), tap the
 *   info icon to open a bottom-sheet explainer without changing the mode.
 * GUESTS SEE: the selected modes read-only. No interactive elements.
 * LOCKED: once phase moves past 'lobby', both selectors are frozen.
 *
 * REQUIRES: supabase migration add_game_modes.sql to be applied.
 * Without it, rooms won't have ensemble_mode / prestige_mode columns and
 * writes will fail silently. The UI defaults to 'full' for both.
 */

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Info, Lock, Sparkles, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  ENSEMBLE_MODES,
  PRESTIGE_MODES,
  ENSEMBLE_MODE_MAP,
  PRESTIGE_MODE_MAP,
  type ModeDetail,
} from '../lib/mode-utils'
import type { RoomRow, EnsembleMode, PrestigeMode } from '../types/database'

interface Props {
  room: RoomRow
  isHost: boolean
}

type ModalTarget = { dimension: 'ensemble' | 'prestige'; modeId: string } | null

export default function ModeSelectPanel({ room, isHost }: Props) {
  const [modalTarget, setModalTarget] = useState<ModalTarget>(null)

  const ensembleMode: EnsembleMode = room.ensemble_mode ?? 'full'
  const prestigeMode: PrestigeMode = room.prestige_mode ?? 'full'
  const isLocked = room.phase !== 'lobby'

  async function selectEnsembleMode(mode: EnsembleMode) {
    if (!isHost || isLocked || mode === ensembleMode) return
    await supabase.from('rooms').update({ ensemble_mode: mode }).eq('id', room.id)
  }

  async function selectPrestigeMode(mode: PrestigeMode) {
    if (!isHost || isLocked || mode === prestigeMode) return
    await supabase.from('rooms').update({ prestige_mode: mode }).eq('id', room.id)
  }

  function openModal(dimension: 'ensemble' | 'prestige', modeId: string) {
    setModalTarget({ dimension, modeId })
  }

  const activeDetail: ModeDetail | null = modalTarget
    ? modalTarget.dimension === 'ensemble'
      ? ENSEMBLE_MODE_MAP[modalTarget.modeId as EnsembleMode]
      : PRESTIGE_MODE_MAP[modalTarget.modeId as PrestigeMode]
    : null

  return (
    <>
      <div className="backdrop-blur-lg bg-white/10 border border-white/15 rounded-2xl p-5 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-white">Game Settings</h2>
          {isLocked && (
            <div className="flex items-center gap-1.5 text-white/40 text-xs">
              <Lock size={11} />
              <span>Locked</span>
            </div>
          )}
          {!isHost && !isLocked && (
            <span className="text-xs text-white/40">Host controls</span>
          )}
        </div>

        {/* ── Ensemble Draft ─────────────────────────────────────────────────── */}
        <div className="space-y-2.5">
          <p className="text-xs text-white/40 uppercase tracking-widest">Ensemble Draft</p>
          <div className="grid grid-cols-3 gap-2">
            {ENSEMBLE_MODES.map((mode) => {
              const selected = ensembleMode === mode.id
              const interactive = isHost && !isLocked
              return (
                <ModePill
                  key={mode.id}
                  mode={mode}
                  selected={selected}
                  interactive={interactive}
                  onSelect={() => selectEnsembleMode(mode.id as EnsembleMode)}
                  onInfo={(e) => {
                    e.stopPropagation()
                    openModal('ensemble', mode.id)
                  }}
                />
              )
            })}
          </div>
        </div>

        {/* ── Prestige Picks ────────────────────────────────────────────────── */}
        <div className="space-y-2.5">
          <p className="text-xs text-white/40 uppercase tracking-widest">Prestige Picks</p>
          <div className="grid grid-cols-3 gap-2">
            {PRESTIGE_MODES.map((mode) => {
              const selected = prestigeMode === mode.id
              const interactive = isHost && !isLocked
              return (
                <ModePill
                  key={mode.id}
                  mode={mode}
                  selected={selected}
                  interactive={interactive}
                  onSelect={() => selectPrestigeMode(mode.id as PrestigeMode)}
                  onInfo={(e) => {
                    e.stopPropagation()
                    openModal('prestige', mode.id)
                  }}
                />
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Mode info bottom sheet ─────────────────────────────────────────── */}
      <AnimatePresence>
        {activeDetail && modalTarget && (
          <ModeInfoSheet
            key={`${modalTarget.dimension}-${activeDetail.id}`}
            detail={activeDetail}
            onClose={() => setModalTarget(null)}
          />
        )}
      </AnimatePresence>
    </>
  )
}

// ─── ModePill ─────────────────────────────────────────────────────────────────

function ModePill({
  mode,
  selected,
  interactive,
  onSelect,
  onInfo,
}: {
  mode: ModeDetail
  selected: boolean
  interactive: boolean
  onSelect: () => void
  onInfo: (e: React.MouseEvent) => void
}) {
  return (
    <motion.div
      onClick={interactive ? onSelect : undefined}
      whileTap={interactive ? { scale: 0.96 } : undefined}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') onSelect() } : undefined}
      className={[
        'relative flex flex-col items-start p-2.5 rounded-xl border text-left transition-colors select-none',
        selected
          ? 'bg-oscar-gold/15 border-oscar-gold/60'
          : interactive
          ? 'bg-white/5 border-white/10 hover:bg-white/10 cursor-pointer'
          : 'bg-white/5 border-white/10 cursor-default',
      ].join(' ')}
    >
      {/* Selected checkmark */}
      {selected && (
        <div className="absolute top-1.5 left-1.5">
          <Check size={9} className="text-oscar-gold" />
        </div>
      )}

      {/* Info button — always tappable (guests can still read about modes) */}
      <button
        onClick={onInfo}
        className="absolute top-1 right-1 p-1 text-white/30 hover:text-white/60 transition-colors"
        aria-label={`Learn about ${mode.label}`}
      >
        <Info size={11} />
      </button>

      {/* Label */}
      <p
        className={[
          'text-xs font-semibold leading-tight mt-3',
          selected ? 'text-oscar-gold' : 'text-white/80',
        ].join(' ')}
      >
        {mode.label}
      </p>

      {/* Stat */}
      <p className="text-[10px] text-white/40 leading-tight mt-0.5 line-clamp-2">
        {mode.stat}
      </p>
    </motion.div>
  )
}

// ─── ModeInfoSheet ────────────────────────────────────────────────────────────

function ModeInfoSheet({
  detail,
  onClose,
}: {
  detail: ModeDetail
  onClose: () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 400 }}
        className="relative w-full max-w-md bg-midnight border border-white/15 rounded-t-3xl overflow-y-auto max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button — outside scroll area so it stays fixed at top-right */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 z-10 text-white/30 hover:text-white/60 transition-colors p-1"
        >
          <X size={18} />
        </button>

        <div className="p-6 pb-10">
        {/* Drag handle */}
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-5" />

        {/* Eyebrow */}
        <p className="text-xs text-oscar-gold/70 uppercase tracking-widest mb-1">
          {detail.eyebrow}
        </p>

        {/* Title */}
        <h2 className="text-2xl font-bold text-white mb-3">{detail.label}</h2>

        {/* Description */}
        <p className="text-white/70 text-sm leading-relaxed mb-5">
          {detail.description}
        </p>

        {/* Includes */}
        <div className="mb-4">
          <p className="text-xs text-white/40 uppercase tracking-widest mb-2.5">
            What's included
          </p>
          <ul className="space-y-2">
            {detail.includes.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <Check
                  size={13}
                  className="text-emerald-400 flex-shrink-0 mt-0.5"
                />
                <span className="text-sm text-white/75 leading-snug">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Excludes (optional) */}
        {detail.excludes && detail.excludes.length > 0 && (
          <div className="mb-4">
            <p className="text-xs text-white/40 uppercase tracking-widest mb-2.5">
              Not included
            </p>
            <ul className="space-y-2">
              {detail.excludes.map((item, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <X size={13} className="text-white/30 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-white/40 leading-snug">{item}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Best for callout */}
        <div className="border-l-2 border-oscar-gold/40 pl-4 bg-oscar-gold/5 rounded-r-xl py-3 pr-3 mb-5">
          <div className="flex items-start gap-2">
            <Sparkles size={13} className="text-oscar-gold/60 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-oscar-gold/60 uppercase tracking-widest mb-1">
                Best for
              </p>
              <p className="text-sm text-white/70 leading-relaxed italic">
                {detail.bestFor}
              </p>
            </div>
          </div>
        </div>

        {/* Key stat badge */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex items-center justify-between mb-5">
          <span className="text-xs text-white/40 uppercase tracking-widest">
            {detail.statLabel}
          </span>
          <span className="text-sm font-bold text-oscar-gold">{detail.stat}</span>
        </div>

        {/* Close CTA */}
        <motion.button
          onClick={onClose}
          whileTap={{ scale: 0.97 }}
          className="w-full py-3.5 rounded-2xl font-semibold text-base bg-white/10 border border-white/15 text-white"
        >
          Got it
        </motion.button>
        </div>
      </motion.div>
    </motion.div>
  )
}
