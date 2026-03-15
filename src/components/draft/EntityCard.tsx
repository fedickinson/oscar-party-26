/**
 * EntityCard — one row in the draft entity list.
 *
 * THREE STATES:
 *
 *  1. Available + my turn    → gold border on press, tappable
 *  2. Available + not my turn → read-only, no hover state
 *  3. Already drafted         → greyed, shows who drafted it
 *
 * NOMINATION DISPLAY:
 *  People: up to 3 category names listed as small badges
 *  Films: show "N nominations" prominently (e.g. "Sinners: 16 noms!")
 *
 * The `index` prop drives stagger delay for entrance animation.
 * Available entities stagger in; drafted entities come last in the list
 * and are already visible (no entrance animation needed, hence lower delay).
 */

import { motion } from 'framer-motion'
import { FilmIcon } from '../../lib/film-icons'
import type { PlayerRow } from '../../types/database'
import type { DraftEntityWithDetails } from '../../types/game'

interface Props {
  entity: DraftEntityWithDetails
  isAvailable: boolean
  isMyTurn: boolean
  draftedBy: PlayerRow | null
  onTap: () => void
  index: number
}

export default function EntityCard({
  entity,
  isAvailable,
  isMyTurn,
  draftedBy,
  onTap,
  index,
}: Props) {
  const isFilm = entity.type === 'film'
  const potentialPoints = entity.nominations.reduce((sum, n) => sum + (n.points ?? 0), 0)
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
        'backdrop-blur-lg border rounded-2xl p-4 transition-colors',
        isAvailable ? 'bg-white/10 border-white/15' : 'bg-white/5 border-white/8',
        isTappable ? 'cursor-pointer hover:bg-white/15 hover:border-oscar-gold/40 active:border-oscar-gold' : '',
        !isAvailable ? 'cursor-default' : '',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        {/* Left: type badge */}
        <div className="flex-shrink-0 mt-0.5">
          {isFilm ? (
            <div className={['p-1.5 rounded-lg', isAvailable ? 'bg-oscar-gold/15 text-oscar-gold' : 'bg-white/5 text-white/25'].join(' ')}>
              <FilmIcon filmName={entity.name} size={16} />
            </div>
          ) : (
            <span className="text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-300">
              Person
            </span>
          )}
        </div>

        {/* Center: name + details */}
        <div className="flex-1 min-w-0">
          <p
            className={[
              'font-semibold leading-tight truncate',
              isAvailable ? 'text-white' : 'text-white/50',
            ].join(' ')}
          >
            {entity.name}
          </p>

          {!isFilm && entity.film_name && (
            <div className="flex items-center gap-1 mt-0.5">
              <FilmIcon filmName={entity.film_name} size={10} className="text-white/40 flex-shrink-0" />
              <p className="text-xs text-white/60 truncate">{entity.film_name}</p>
            </div>
          )}

          {/* Nominations display */}
          <div className="mt-2">
            {isFilm ? (
              // Films: show total nom count prominently
              <span
                className={[
                  'text-sm font-bold',
                  isAvailable ? 'text-oscar-gold' : 'text-white/30',
                ].join(' ')}
              >
                {entity.nom_count} nomination{entity.nom_count !== 1 ? 's' : ''}
              </span>
            ) : (
              // People: show category badges (max 3, then "+N more")
              <div className="flex flex-wrap gap-1">
                {entity.nominations.slice(0, 3).map((nom) => (
                  <span
                    key={nom.category_id}
                    className="text-[10px] text-white/50 bg-white/8 px-1.5 py-0.5 rounded"
                  >
                    {nom.category_name}
                  </span>
                ))}
                {entity.nominations.length > 3 && (
                  <span className="text-[10px] text-white/30">
                    +{entity.nominations.length - 3} more
                  </span>
                )}
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
              <span className="text-xs text-white/35">In {draftedBy.name}'s ensemble</span>
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
                  potentialPoints > 0 ? 'text-oscar-gold' : 'text-white/30',
                ].join(' ')}
              >
                {potentialPoints}
              </p>
              <p className="text-[10px] text-white/30 mt-0.5">pts</p>
            </>
          ) : (
            <span className="text-xs text-white/20">claimed</span>
          )}
        </div>
      </div>
    </motion.div>
  )
}
