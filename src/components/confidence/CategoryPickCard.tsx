/**
 * CategoryPickCard — one row in the confidence picks list.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────┐
 *   │ [tier accent border] Category Name          [pts] [conf badge] │
 *   │ Nominee Name (full-width row)                       │
 *   │   Film Name (if different from nominee name)        │
 *   │ Nominee Name                                        │
 *   │   Film Name                                         │
 *   └─────────────────────────────────────────────────────┘
 *
 * Left border color indicates tier:
 *   Tier 1 (Major Awards)              → gold
 *   Tier 2 (Prestige Craft)            → violet
 *   Tier 3 (Technical & Performance)   → sky
 *   Tier 4 (Specialty)                 → emerald
 *   Tier 5 (Short Films)               → white/muted
 *
 * Tapping a nominee row selects it (toggles off if already selected).
 * Tapping the confidence badge opens the number picker in the parent.
 */

import { motion } from 'framer-motion'
import { Hash } from 'lucide-react'
import type { NomineeRow } from '../../types/database'
import type { CategoryWithNominees } from '../../types/game'
import type { LocalPick } from '../../hooks/useConfidence'
import { CategoryIcon } from '../../lib/category-icons'
import { FilmIcon } from '../../lib/film-icons'

interface Props {
  category: CategoryWithNominees
  pick: LocalPick
  onSelectNominee: (nomineeId: string) => void
  onOpenPicker: () => void
  index: number
}

const TIER_STYLES: Record<
  number,
  { border: string; label: string; labelBg: string }
> = {
  1: {
    border: 'border-l-oscar-gold',
    label: 'text-oscar-gold',
    labelBg: 'bg-oscar-gold/10 text-oscar-gold',
  },
  2: {
    border: 'border-l-violet-400',
    label: 'text-violet-400',
    labelBg: 'bg-violet-400/10 text-violet-400',
  },
  3: {
    border: 'border-l-sky-400',
    label: 'text-sky-400',
    labelBg: 'bg-sky-400/10 text-sky-400',
  },
  4: {
    border: 'border-l-emerald-400',
    label: 'text-emerald-400',
    labelBg: 'bg-emerald-400/10 text-emerald-400',
  },
  5: {
    border: 'border-l-white/20',
    label: 'text-white/40',
    labelBg: 'bg-white/5 text-white/40',
  },
}

function tierStyle(tier: number) {
  return TIER_STYLES[tier] ?? TIER_STYLES[5]
}

export default function CategoryPickCard({
  category,
  pick,
  onSelectNominee,
  onOpenPicker,
  index,
}: Props) {
  const style = tierStyle(category.tier)
  const isPickComplete = pick.nominee_id != null && pick.confidence != null
  const hasNominee = pick.nominee_id != null

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.025, duration: 0.2 }}
      className={[
        'backdrop-blur-lg bg-white/8 border border-white/12 rounded-xl',
        'border-l-4 p-3',
        style.border,
        isPickComplete ? 'opacity-100' : 'opacity-100',
      ].join(' ')}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5 flex-1 mr-2 min-w-0">
          <CategoryIcon categoryName={category.name} size={13} className={style.label} />
          <span className="text-xs font-semibold text-white/80 leading-tight truncate">
            {category.name}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Confidence badge — tap opens picker */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={onOpenPicker}
            className={[
              'w-9 h-9 rounded-lg flex flex-col items-center justify-center relative',
              'border transition-colors',
              pick.confidence != null
                ? 'bg-oscar-gold/15 border-oscar-gold/50'
                : hasNominee
                  ? 'bg-amber-500/15 border-amber-400/60'
                  : 'bg-white/5 border-white/15 border-dashed',
            ].join(' ')}
          >
            {pick.confidence != null ? (
              <span className="text-sm font-bold text-oscar-gold leading-none">
                {pick.confidence}
              </span>
            ) : hasNominee ? (
              <>
                <Hash size={13} className="text-amber-400" />
                {/* Attention dot */}
                <span className="absolute -top-1 -right-1 w-2 h-2 bg-amber-400 rounded-full" />
              </>
            ) : (
              <Hash size={13} className="text-white/30" />
            )}
          </motion.button>
        </div>
      </div>

      {/* Vertical nominee list */}
      <div className="flex flex-col">
        {category.nominees.map((nominee, i) => (
          <NomineeRow
            key={nominee.id}
            nominee={nominee}
            isSelected={pick.nominee_id === nominee.id}
            isLast={i === category.nominees.length - 1}
            onTap={() => onSelectNominee(nominee.id)}
          />
        ))}
      </div>
    </motion.div>
  )
}

// ─── NomineeRow ──────────────────────────────────────────────────────────────

function NomineeRow({
  nominee,
  isSelected,
  isLast,
  onTap,
}: {
  nominee: NomineeRow
  isSelected: boolean
  isLast: boolean
  onTap: () => void
}) {
  const showFilm = nominee.film_name && nominee.film_name !== nominee.name

  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onTap}
      className={[
        'w-full text-left px-2 transition-colors',
        'min-h-[44px] flex flex-col justify-center',
        isSelected
          ? 'border-l-2 border-oscar-gold bg-oscar-gold/10 pl-2'
          : 'border-l-2 border-transparent',
        !isLast ? 'border-b border-white/5' : '',
      ].join(' ')}
    >
      <span className={['text-sm font-medium leading-snug', isSelected ? 'text-oscar-gold' : 'text-white'].join(' ')}>
        {nominee.name}
      </span>
      {showFilm && (
        <span className="flex items-center gap-1 mt-0.5">
          <FilmIcon filmName={nominee.film_name!} size={9} className="text-white/40 flex-shrink-0" />
          <span className="text-xs text-white/60 leading-snug">{nominee.film_name}</span>
        </span>
      )}
    </motion.button>
  )
}
