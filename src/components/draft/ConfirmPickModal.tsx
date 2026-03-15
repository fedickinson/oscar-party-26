/**
 * ConfirmPickModal — slides up from the bottom when a player taps an entity.
 *
 * WHY A CONFIRMATION STEP?
 * In a draft under time pressure, accidental taps are common. The confirm
 * step prevents a misclick from ruining your strategy. It also shows full
 * nomination details (categories + points) so you can make an informed pick.
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
import type { DraftEntityWithDetails } from '../../types/game'

interface Props {
  entity: DraftEntityWithDetails
  onConfirm: () => void
  onCancel: () => void
  isSubmitting: boolean
}

export default function ConfirmPickModal({
  entity,
  onConfirm,
  onCancel,
  isSubmitting,
}: Props) {
  const isFilm = entity.type === 'film'
  const totalPoints = entity.nominations.reduce((sum, n) => sum + (n.points ?? 0), 0)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm"
      onClick={onCancel}
    >
      {/* Sheet — stops click propagation so tapping inside doesn't close */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 32, stiffness: 400 }}
        className="w-full max-w-md bg-midnight border border-white/15 rounded-t-3xl p-6 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle hint */}
        <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-5" />

        {/* Entity header */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={[
                'text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded',
                isFilm
                  ? 'bg-oscar-gold/20 text-oscar-gold'
                  : 'bg-violet-500/20 text-violet-300',
              ].join(' ')}
            >
              {isFilm ? 'Film' : 'Person'}
            </span>
          </div>

          <h2 className="text-2xl font-bold leading-tight">{entity.name}</h2>

          {!isFilm && entity.film_name && (
            <p className="text-white/50 italic mt-0.5">{entity.film_name}</p>
          )}
        </div>

        {/* Nominations list */}
        {entity.nominations.length > 0 ? (
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-5 space-y-2">
            <p className="text-xs text-white/40 uppercase tracking-widest mb-3">Nominations</p>
            {entity.nominations.map((nom) => (
              <div key={nom.category_id} className="flex justify-between items-center">
                <span className="text-sm text-white/80 flex-1 mr-3">{nom.category_name}</span>
                <span className="text-sm font-bold text-oscar-gold flex-shrink-0">
                  +{nom.points} pts
                </span>
              </div>
            ))}
            <div className="border-t border-white/10 pt-2 mt-2 flex justify-between">
              <span className="text-sm text-white/50">Max potential</span>
              <span className="text-sm font-bold text-oscar-gold">{totalPoints} pts</span>
            </div>
          </div>
        ) : (
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-5">
            <p className="text-white/30 text-sm text-center">
              {entity.nom_count} nomination{entity.nom_count !== 1 ? 's' : ''} — details loading
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={isSubmitting}
            className="flex-1 py-4 rounded-2xl bg-white/10 border border-white/15 text-white font-semibold disabled:opacity-50 hover:bg-white/15 transition-colors"
          >
            Cancel
          </button>

          <button
            onClick={onConfirm}
            disabled={isSubmitting}
            className="flex-[2] py-4 rounded-2xl bg-oscar-gold text-deep-navy font-bold text-lg disabled:opacity-60 hover:bg-oscar-gold-light transition-colors"
          >
            {isSubmitting ? 'Drafting…' : `Draft ${entity.name.split(' ')[0]}`}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
