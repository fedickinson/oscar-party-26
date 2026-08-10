/**
 * ConfirmPickModal — slides up from the bottom when a player taps an entity.
 *
 * WHY A CONFIRMATION STEP?
 * In a draft under time pressure, accidental taps are common. The confirm
 * step prevents a misclick from ruining your strategy. It also shows full
 * signature beat details so you can make an informed pick.
 *
 * DOUBLE-TAP PREVENTION:
 * Once "Draft [Name]" is tapped, `isSubmitting` goes true and the button
 * is disabled. The parent (Draft.tsx) sets this while the Supabase writes
 * are in flight. After the writes complete (or fail), the modal closes
 * because the entity disappears from availableEntities.
 *
 * ANIMATION:
 * The backdrop fades in (opacity 0→1). The sheet slides up from below
 * (y: 100%→0) with a spring transition — this mimics native iOS sheet behavior.
 * Tapping the backdrop calls onCancel.
 */

import { motion } from 'framer-motion'
import { FilmIcon } from '../../lib/film-icons'
import { Hallmark } from '../ui/Hallmarks'
import type { SignatureBeatRow } from '../../types/database'
import type { DraftEntityWithDetails } from '../../types/game'

// Returns a display-friendly short label for the Claim button.
// Prefers the full name if it fits; otherwise truncates to the longest
// run of words that stays within maxChars, so we never end on a stop-word.
function claimLabel(name: string, maxChars = 14): string {
  if (name.length <= maxChars) return name
  const words = name.split(' ')
  let label = ''
  for (const word of words) {
    const next = label ? `${label} ${word}` : word
    if (next.length > maxChars) break
    label = next
  }
  return label ? `${label}…` : `${name.slice(0, maxChars)}…`
}

interface Props {
  entity: DraftEntityWithDetails
  beats: SignatureBeatRow[]
  onConfirm: () => void
  onCancel: () => void
  isSubmitting: boolean
}

export default function ConfirmPickModal({
  entity,
  beats,
  onConfirm,
  onCancel,
  isSubmitting,
}: Props) {
  const isFilm = entity.type === 'film'
  const scoringBeats = isFilm ? beats : beats.slice(0, 3)
  const totalPoints = scoringBeats.reduce((sum, beat) => sum + beat.points, 0)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-end justify-center backdrop-blur-sm"
      style={{ backgroundColor: 'var(--t-overlay)' }}
      onClick={onCancel}
    >
      {/* Sheet — stops click propagation so tapping inside doesn't close */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 400 }}
        className="relief-glass w-full max-w-md rounded-t-3xl p-6 pb-8"
        style={{ borderColor: 'var(--t-line-strong)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle hint */}
        <div className="w-10 h-1 rounded-full mx-auto mb-5" style={{ backgroundColor: 'var(--t-line-strong)' }} />

        {/* Entity header */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-xs font-bold uppercase tracking-widest px-2 py-1 rounded"
              style={{
                backgroundColor: 'var(--t-pending-soft)',
                color: 'var(--t-pending)',
              }}
            >
              {isFilm ? 'Dragon' : 'Character'}
            </span>
          </div>

          <h2 className="font-display text-2xl font-bold leading-tight tracking-wide text-[var(--t-text)]">
            {entity.name}
          </h2>

          {!isFilm && entity.film_name && (
            <div className="flex items-center gap-1.5 mt-0.5">
              <FilmIcon filmName={entity.film_name} size={12} className="text-[var(--t-text-dim)] flex-shrink-0" />
              <p className="text-[var(--t-text-muted)] italic">{entity.film_name}</p>
            </div>
          )}
        </div>

        {/* Signature beats list */}
        {beats.length > 0 ? (
          <div className="relief-glass rounded-xl p-4 mb-5 space-y-2" style={{ borderColor: 'var(--t-line-soft)' }}>
            <p className="text-xs text-[var(--t-text-dim)] uppercase tracking-widest mb-3">Signature beats</p>
            {beats.map((beat) => (
              <div key={beat.id} className="flex justify-between items-center">
                <span className="text-sm text-[var(--t-text-muted)] flex-1 mr-3">{beat.name}</span>
                <span className="text-sm font-bold text-[var(--t-pending)] flex-shrink-0 tabular-nums">
                  +{beat.points} pts
                </span>
              </div>
            ))}
            <div className="border-t pt-2 mt-2 flex justify-between" style={{ borderColor: 'var(--t-line-soft)' }}>
              <span className="text-sm text-[var(--t-text-dim)]">{isFilm ? 'All beats live' : 'Best 3 total'}</span>
              <span className="text-sm font-bold text-[var(--t-pending)] tabular-nums">{totalPoints} pts</span>
            </div>
          </div>
        ) : (
          <div className="relief-glass rounded-xl p-4 mb-5" style={{ borderColor: 'var(--t-line-soft)' }}>
            <p className="text-[var(--t-text-dim)] text-sm text-center">
              Signature beats loading
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="relief-glass flex-1 min-h-12 py-3 rounded-2xl border text-[var(--t-text)] font-semibold disabled:opacity-50 transition-colors"
            style={{ borderColor: 'var(--t-line)' }}
          >
            Cancel
          </button>

          <button
            onClick={onConfirm}
            disabled={isSubmitting}
            className="relief-raised flex-[2] min-h-12 py-3 rounded-2xl border font-bold text-lg disabled:opacity-60 transition-colors"
            style={{
              backgroundColor: 'var(--t-personal-device)',
              borderColor: 'var(--t-personal-text)',
              color: 'var(--t-vellum-light)',
            }}
          >
            <span className="flex items-center justify-center gap-2">
              <Hallmark id="hallmark-claim" size={18} className="flex-shrink-0" />
              {isSubmitting ? 'Claiming…' : `Claim ${claimLabel(entity.name)}`}
            </span>
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
