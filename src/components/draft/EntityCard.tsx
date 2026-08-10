/**
 * EntityCard — one row in the draft entity list.
 *
 * THREE STATES:
 *
 *  1. Available + my turn    → personal-device edge on press, tappable
 *  2. Available + not my turn → read-only, no hover state
 *  3. Already drafted         → greyed, shows who drafted it
 *
 * SIGNATURE BEAT DISPLAY:
 *  People: up to 3 beat names listed as small badges
 *  Dragons: show "N ways to score" prominently
 *
 * The `index` prop drives stagger delay for entrance animation.
 * Available entities stagger in; drafted entities come last in the list
 * and are already visible (no entrance animation needed, hence lower delay).
 */

import { motion } from 'framer-motion'
import { FilmIcon } from '../../lib/film-icons'
import type { PlayerRow, SignatureBeatRow } from '../../types/database'
import type { DraftEntityWithDetails } from '../../types/game'

interface Props {
  entity: DraftEntityWithDetails
  beats: SignatureBeatRow[]
  isAvailable: boolean
  isMyTurn: boolean
  draftedBy: PlayerRow | null
  onTap: () => void
  index: number
}

export default function EntityCard({
  entity,
  beats,
  isAvailable,
  isMyTurn,
  draftedBy,
  onTap,
  index,
}: Props) {
  // Dragons ride the 'film' slot of the entity schema — see the seed migration.
  const isDragon = entity.type === 'film'
  const potentialPoints = (isDragon ? beats : beats.slice(0, 3))
    .reduce((sum, beat) => sum + beat.points, 0)
  const isTappable = isAvailable && isMyTurn

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: isAvailable ? 1 : 0.45, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.2 }}
      whileTap={isTappable ? { scale: 0.98 } : undefined}
      onClick={isTappable ? onTap : undefined}
      className={[
        'relief-glass border rounded-2xl p-4 min-h-[44px] transition-colors',
        isAvailable ? '' : 'opacity-60',
        isTappable ? 'cursor-pointer border-l-4' : '',
        !isAvailable ? 'cursor-default' : '',
      ].join(' ')}
      style={{
        borderColor: isTappable ? 'var(--t-personal-device)' : 'var(--t-line-soft)',
        background: isAvailable ? 'var(--t-glass-fill)' : 'var(--t-negative-soft)',
      }}
    >
      <div className="flex items-start gap-3">
        {/* Left: type badge */}
        <div className="flex-shrink-0 mt-0.5">
          {isDragon ? (
            <div className="p-1.5 rounded-lg" style={{ backgroundColor: isAvailable ? 'var(--t-pending-soft)' : 'var(--t-negative-soft)', color: isAvailable ? 'var(--t-pending)' : 'var(--t-negative)' }}>
              <FilmIcon filmName={entity.name} size={16} />
            </div>
          ) : (
            <div className="p-1.5 rounded-lg" style={{ backgroundColor: isAvailable ? 'var(--t-surface)' : 'var(--t-negative-soft)', color: isAvailable ? 'var(--t-text-muted)' : 'var(--t-negative)' }}>
              <FilmIcon filmName={entity.film_name ?? ''} size={16} />
            </div>
          )}
        </div>

        {/* Center: name + details */}
        <div className="flex-1 min-w-0">
          <p
            className={[
              'font-semibold leading-tight truncate',
              isAvailable ? 'text-[var(--t-text)]' : 'text-[var(--t-negative)]',
            ].join(' ')}
          >
            {entity.name}
          </p>

          {!isDragon && entity.film_name && (
            <div className="flex items-center gap-1 mt-0.5">
              <FilmIcon filmName={entity.film_name} size={10} className="text-[var(--t-text-dim)] flex-shrink-0" />
              <p className="text-xs text-[var(--t-text-muted)] truncate">{entity.film_name}</p>
            </div>
          )}

          {/* Signature beats display */}
          <div className="mt-2">
            {isDragon ? (
              // Dragons: how many scoring events they appear in
              <span
                className={[
                  'text-sm font-bold',
                  isAvailable ? 'text-[var(--t-pending)]' : 'text-[var(--t-negative)]',
                ].join(' ')}
              >
                {beats.length} way{beats.length !== 1 ? 's' : ''} to score
              </span>
            ) : (
              // People: show beat badges (max 3, then "+N more")
              <div>
                <div className="flex flex-wrap gap-1">
                {beats.slice(0, 3).map((beat) => (
                  <span
                    key={beat.id}
                    className="text-xs text-[var(--t-text-muted)] px-2 py-1 rounded"
                    style={{ backgroundColor: 'var(--t-surface)' }}
                  >
                    {beat.name}
                  </span>
                ))}
                {beats.length > 3 && (
                  <span className="text-xs text-[var(--t-text-dim)]">
                    +{beats.length - 3} more
                  </span>
                )}
                </div>
                <p className="text-xs text-[var(--t-text-dim)] mt-1">choose 3 of {beats.length}</p>
              </div>
            )}
          </div>

          {/* Drafted by */}
          {!isAvailable && draftedBy && (
            <div className="flex items-center gap-1.5 mt-2">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: draftedBy.color }}
              />
              <span className="text-xs text-[var(--t-negative)]">Drafted by {draftedBy.name}</span>
            </div>
          )}
        </div>

        {/* Right: potential points */}
        <div className="flex-shrink-0 text-right">
          {isAvailable ? (
            <>
              <p
                className={[
                  'text-lg font-bold tabular-nums leading-none',
                  potentialPoints > 0 ? 'text-[var(--t-pending)]' : 'text-[var(--t-text-dim)]',
                ].join(' ')}
              >
                {isDragon ? potentialPoints : `up to ${potentialPoints}`}
              </p>
              <p className="text-xs text-[var(--t-text-dim)] mt-0.5">pts</p>
            </>
          ) : (
            <span className="text-xs text-[var(--t-negative)]">claimed</span>
          )}
        </div>
      </div>
    </motion.div>
  )
}
