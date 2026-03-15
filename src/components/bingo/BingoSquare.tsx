/**
 * BingoSquare — a single cell in the bingo grid.
 *
 * Visual states:
 *   free     (index 12) — oscar-gold bg, Star icon, "FREE" text, always marked
 *   approved            — emerald bg, Check icon, slightly faded text
 *   pending             — amber border pulse, Clock icon, dim text (not tappable)
 *   denied              — brief red flash, then visually reverts to unmarked
 *                         (handled via internal `visualDenied` state + timeout)
 *   selected            — pulsing white glow, dashed border (local-only, no DB write)
 *   unmarked            — dark glass bg, full-opacity text, tappable
 *
 * Tap behavior:
 *   free     → no-op
 *   approved → no-op (immutable)
 *   pending  → no-op (cannot be undone by player)
 *   selected → deselects (handled in BingoCard)
 *   denied   → selectable (treated like unmarked)
 *   unmarked → select (local only)
 */

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Check, Clock, Star } from 'lucide-react'

type MarkStatus = 'unmarked' | 'pending' | 'approved' | 'denied' | 'free'

interface Props {
  index: number
  shortText: string
  status: MarkStatus
  isObjective: boolean
  isInBingoLine: boolean
  isSelected: boolean
  onTap: () => void
  /** When true: no tap interaction, no press animation, no denied flash */
  readOnly?: boolean
}

export default function BingoSquare({
  index,
  shortText,
  status,
  isObjective,
  isInBingoLine,
  isSelected,
  onTap,
  readOnly = false,
}: Props) {
  // Internal state drives the brief red flash for denied marks
  const [visualDenied, setVisualDenied] = useState(false)

  useEffect(() => {
    if (readOnly) return
    if (status === 'denied') {
      setVisualDenied(true)
      const t = setTimeout(() => setVisualDenied(false), 1600)
      return () => clearTimeout(t)
    }
  }, [status, readOnly])

  const isFree = index === 12
  const isApproved = status === 'approved'
  const isPending = status === 'pending'
  // In readOnly mode show denied as a static red state; interactive mode uses the flash
  const effectiveDenied = readOnly ? status === 'denied' : visualDenied
  const isUnmarked = !isFree && !isApproved && !isPending && !effectiveDenied && !isSelected
  const canTap = !readOnly && !isFree && !isApproved && !isPending

  function handleTap() {
    if (!canTap) return
    onTap()
  }

  // ── Appearance classes ─────────────────────────────────────────────────────

  const baseClasses = [
    'relative flex flex-col items-center justify-center',
    'min-h-[60px] rounded-lg p-1 cursor-pointer select-none',
    'transition-colors duration-200 overflow-hidden',
  ]

  let bgClass = ''
  let borderClass = ''
  let textClass = ''

  if (isFree) {
    bgClass = 'bg-oscar-gold/20'
    borderClass = 'border border-oscar-gold/60'
    textClass = 'text-oscar-gold'
  } else if (isApproved) {
    bgClass = 'bg-emerald-500/20'
    borderClass = isInBingoLine ? 'border-2 border-emerald-400' : 'border border-emerald-500/40'
    textClass = 'text-emerald-300/70'
  } else if (isPending) {
    bgClass = 'bg-amber-500/10'
    borderClass = 'border border-amber-400/60'
    textClass = 'text-white/50'
  } else if (effectiveDenied) {
    bgClass = 'bg-red-500/20'
    borderClass = 'border border-red-400/60'
    textClass = 'text-red-300/70'
  } else if (isSelected) {
    bgClass = isInBingoLine ? 'bg-white/16' : 'bg-white/10'
    borderClass = 'border border-dashed border-white/60'
    textClass = 'text-white'
  } else {
    bgClass = isInBingoLine ? 'bg-white/12' : 'bg-white/6'
    borderClass = isObjective
      ? 'border border-oscar-gold/25'
      : 'border border-white/10'
    textClass = 'text-white/85'
  }

  return (
    <motion.button
      whileTap={canTap ? { scale: 0.88 } : undefined}
      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
      onClick={handleTap}
      className={[
        ...baseClasses,
        bgClass,
        borderClass,
        !canTap ? 'cursor-default' : '',
        readOnly ? 'pointer-events-none' : '',
      ].join(' ')}
    >
      {/* Bingo line highlight sweep */}
      {isInBingoLine && isApproved && (
        <motion.div
          className="absolute inset-0 bg-emerald-400/10 rounded-lg pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.4, 0.15] }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      )}

      {/* Pending pulse ring */}
      {isPending && (
        <motion.div
          className="absolute inset-0 rounded-lg border border-amber-400/50 pointer-events-none"
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      {/* Selected pulse glow */}
      {isSelected && (
        <motion.div
          className="absolute inset-0 rounded-lg bg-white/8 pointer-events-none"
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      {/* FREE CENTER */}
      {isFree && (
        <>
          <Star size={14} className="text-oscar-gold fill-current mb-0.5 flex-shrink-0" />
          <span className="text-[9px] font-bold text-oscar-gold uppercase tracking-widest leading-none">
            Free
          </span>
        </>
      )}

      {/* Status icon overlay */}
      {isApproved && !isFree && (
        <Check
          size={12}
          className="text-emerald-400 absolute top-1 right-1 flex-shrink-0"
          strokeWidth={3}
        />
      )}
      {isPending && (
        <Clock
          size={11}
          className="text-amber-400 absolute top-1 right-1 flex-shrink-0"
        />
      )}
      {effectiveDenied && (
        <motion.span
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-[8px] font-bold text-red-400 absolute top-1 right-1"
        >
          No
        </motion.span>
      )}

      {/* Square text */}
      {!isFree && (
        <p
          className={[
            'text-[10px] leading-tight text-center font-medium line-clamp-3 overflow-hidden w-full',
            textClass,
            isObjective && isUnmarked ? 'italic' : '',
          ].join(' ')}
        >
          {shortText}
        </p>
      )}
    </motion.button>
  )
}
