/**
 * SquareRule — the adjudication text for a bingo square, disclosed in layers.
 *
 * WHY IT IS LAYERED
 * A full win condition runs to 246 characters. Printing all of it costs a
 * player five seconds of reading with their eyes off the television, and costs
 * a host five seconds per claim with three more queued behind it.
 *
 * By the time anyone reads this they already believe the thing happened — the
 * title told them what the square is. The half that changes what they do next
 * is the fine print, so that is the half left visible. The rule sentence, which
 * mostly restates the title in formal language, sits one tap away for the
 * arguments that get that far.
 *
 * The odds live behind the same tap. Rarity is already said twice on screen —
 * by the tier name and by the points — and a third encoding at the moment of
 * decision is noise.
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { splitWinCondition } from '../../lib/bingo-utils'
import type { LikelihoodTier } from '../../types/database'

interface Props {
  winCondition: string
  tier?: LikelihoodTier | null
  probabilityPct?: number | null
  /** Start expanded — for the peek sheet, where reading is the whole point */
  defaultExpanded?: boolean
}

export default function SquareRule({
  winCondition,
  tier,
  probabilityPct,
  defaultExpanded = false,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const { rule, finePrint } = splitWinCondition(winCondition)

  // Single-sentence square: nothing to hold back, so show it and skip the toggle
  if (!finePrint) {
    return <p className="text-sm text-white/75 leading-snug">{rule}</p>
  }

  return (
    <div>
      <p className="text-sm text-white/75 leading-snug">{finePrint}</p>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="rule"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <p className="text-[13px] text-white/45 leading-snug pt-1.5">
              {rule}
              {typeof probabilityPct === 'number' && (
                <span className="text-white/30">
                  {' '}Roughly a {probabilityPct}% chance{tier ? '.' : ''}
                </span>
              )}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-white/35 mt-1.5 min-h-[24px]"
      >
        {expanded ? 'Less' : 'Full rule'}
        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.18 }}
          className="flex"
        >
          <ChevronDown size={12} />
        </motion.span>
      </button>
    </div>
  )
}
