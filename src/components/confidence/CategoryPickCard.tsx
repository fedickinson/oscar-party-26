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
 *   Tier 1 (Major Awards)              → ochre
 *   Tier 2 (Prestige Craft)            → bone
 *   Tier 3 (Technical & Performance)   → ashlar
 *   Tier 4 (Specialty)                 → dim ash
 *   Tier 5 (Short Films)               → quiet ash
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
import { Hallmark } from '../ui/Hallmarks'

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
    border: 'border-l-[var(--t-pending)]',
    label: 'text-[var(--t-pending)]',
    labelBg: 'bg-[var(--t-pending-soft)] text-[var(--t-pending)]',
  },
  2: {
    border: 'border-l-[var(--t-text-muted)]',
    label: 'text-[var(--t-text-muted)]',
    labelBg: 'bg-[var(--t-surface)] text-[var(--t-text-muted)]',
  },
  3: {
    border: 'border-l-[var(--t-ashlar)]',
    label: 'text-[var(--t-ashlar)]',
    labelBg: 'bg-[var(--t-surface)] text-[var(--t-ashlar)]',
  },
  4: {
    border: 'border-l-[var(--t-text-dim)]',
    label: 'text-[var(--t-text-dim)]',
    labelBg: 'bg-[var(--t-surface)] text-[var(--t-text-dim)]',
  },
  5: {
    border: 'border-l-[var(--t-negative)]',
    label: 'text-[var(--t-negative)]',
    labelBg: 'bg-[var(--t-negative-soft)] text-[var(--t-negative)]',
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
        'relief-glass border rounded-xl',
        'border-l-4 p-3',
        style.border,
        isPickComplete ? 'opacity-100' : 'opacity-100',
      ].join(' ')}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-1.5 flex-1 mr-2 min-w-0">
          <CategoryIcon categoryName={category.name} size={14} className={style.label} />
          <span className="font-display text-sm font-bold text-[var(--t-text)] leading-tight truncate">
            {category.name}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Confidence badge — tap opens picker */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={onOpenPicker}
            className={[
              'min-w-[44px] h-11 px-1 rounded-lg flex items-center justify-center gap-0.5 relative',
              'border-2 transition-colors',
              pick.confidence != null
                ? 'material-vellum border-[var(--t-vellum-deep)] text-[var(--t-ink)]'
                : hasNominee
                  ? 'bg-[var(--t-pending-soft)] border-[var(--t-pending)] border-dashed'
                  : 'bg-[var(--t-negative-soft)] border-[var(--t-line)] border-dashed',
            ].join(' ')}
          >
            {pick.confidence != null ? (
              <>
                {pick.confidence === 24 && (
                  <Hallmark id="hallmark-signet" size={16} className="flex-shrink-0" />
                )}
                <span className="font-display text-sm font-bold leading-none tabular-nums">
                  {pick.confidence}
                </span>
              </>
            ) : hasNominee ? (
              <>
                <span className="font-display text-sm font-bold text-[var(--t-pending)] leading-none">?</span>
                {/* Pulsing ring */}
                <motion.span
                  animate={{ scale: [1, 1.5, 1], opacity: [0.6, 0, 0.6] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute inset-0 rounded-lg border-2 border-[var(--t-pending)]"
                />
              </>
            ) : (
              <Hash size={14} className="text-[var(--t-text-dim)]" />
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
          ? 'border-l-2 border-[var(--t-pending)] bg-[var(--t-pending-soft)] pl-2'
          : 'border-l-2 border-transparent',
        !isLast ? 'border-b border-[var(--t-line-soft)]' : '',
      ].join(' ')}
    >
      <span className={['text-sm leading-snug', isSelected ? 'text-[var(--t-text)] font-medium' : 'text-[var(--t-text-muted)] font-normal'].join(' ')}>
        {nominee.name}
      </span>
      {showFilm && (
        <span className="flex items-center gap-1 mt-0.5">
          <FilmIcon filmName={nominee.film_name!} size={9} className="text-[var(--t-text-dim)] flex-shrink-0" />
          <span className="text-xs text-[var(--t-text-dim)] leading-snug">{nominee.film_name}</span>
        </span>
      )}
    </motion.button>
  )
}
