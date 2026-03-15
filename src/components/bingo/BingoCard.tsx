/**
 * BingoCard — the 5×5 bingo grid with a two-step select-then-confirm flow.
 *
 * Square interaction:
 *   1. Tapping an unmarked/denied square selects it (local only, no DB write).
 *   2. Tapping a selected square deselects it.
 *   3. Tapping a different unmarked square while one is selected switches selection.
 *   4. A slim confirmation bar slides up inside the card when a square is selected.
 *      - Confirm (Check): writes to DB as pending, clears selection.
 *      - Cancel (X): deselects, dismisses bar.
 *   5. Approved/pending/free squares are not tappable for selection.
 *
 * Card width targets ~320px on mobile with equal square sizing.
 * Each cell is square (aspect-ratio handled by min-h in BingoSquare).
 */

import { AnimatePresence, motion } from 'framer-motion'
import { Check, X } from 'lucide-react'
import type { BingoMarkRow, BingoSquareRow } from '../../types/database'
import { FREE_CENTER_INDEX } from '../../lib/bingo-utils'
import BingoSquare from './BingoSquare'

type SquareStatus = 'free' | 'approved' | 'pending' | 'denied' | 'unmarked'

interface Props {
  /** 25-element array; null at position 12 (free center) */
  squares: (BingoSquareRow | null)[]
  marks: BingoMarkRow[]
  bingoLines: number[][]
  disabled?: boolean
  selectedIndex: number | null
  onSelect: (index: number) => void
  onDeselect: () => void
  onConfirm: (index: number) => Promise<void>
}

export default function BingoCard({
  squares,
  marks,
  bingoLines,
  disabled = false,
  selectedIndex,
  onSelect,
  onDeselect,
  onConfirm,
}: Props) {
  if (squares.length === 0) return null

  // Build a set of all indices in completed lines for glow highlighting
  const lineIndices = new Set(bingoLines.flat())

  // Build a mark status lookup by square index
  const markByIndex = new Map<number, BingoMarkRow>()
  marks.forEach((m) => markByIndex.set(m.square_index, m))

  function getStatus(index: number): SquareStatus {
    if (index === FREE_CENTER_INDEX) return 'free'
    const mark = markByIndex.get(index)
    if (!mark) return 'unmarked'
    return mark.status as SquareStatus
  }

  function handleTap(index: number) {
    if (disabled) return
    const status = getStatus(index)
    if (status === 'free' || status === 'approved' || status === 'pending') return
    // Toggle or switch selection
    if (selectedIndex === index) {
      onDeselect()
    } else {
      onSelect(index)
    }
  }

  async function handleConfirm() {
    if (selectedIndex === null) return
    await onConfirm(selectedIndex)
    onDeselect()
  }

  const selectedSquare = selectedIndex !== null ? squares[selectedIndex] : null

  return (
    <div
      className="backdrop-blur-lg bg-white/8 border border-white/12 rounded-2xl p-2.5"
      style={{ width: '100%', maxWidth: 340 }}
    >
      {/* Column header letters */}
      <div className="grid grid-cols-5 gap-1 mb-1">
        {['B', 'I', 'N', 'G', 'O'].map((letter) => (
          <div
            key={letter}
            className="flex items-center justify-center h-5"
          >
            <span className="text-xs font-bold text-oscar-gold/70 tracking-widest">
              {letter}
            </span>
          </div>
        ))}
      </div>

      {/* 5×5 grid */}
      <div className="grid grid-cols-5 gap-1">
        {squares.map((square, index) => (
          <BingoSquare
            key={index}
            index={index}
            shortText={square?.short_text ?? ''}
            status={getStatus(index)}
            isObjective={square?.is_objective ?? false}
            isInBingoLine={lineIndices.has(index)}
            isSelected={selectedIndex === index}
            onTap={() => handleTap(index)}
          />
        ))}
      </div>

      {/* Confirmation bar — slides up from inside the card */}
      <AnimatePresence>
        {selectedIndex !== null && selectedSquare && (
          <motion.div
            key="confirm-bar"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="mt-2 flex items-center gap-2 bg-white/8 backdrop-blur border border-white/12 rounded-xl px-3"
            style={{ height: 48 }}
          >
            <p className="flex-1 text-[11px] font-medium text-white/80 truncate">
              {selectedSquare.short_text}
            </p>
            <motion.button
              whileTap={{ scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              onClick={onDeselect}
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/8 border border-white/15 text-white/60 flex-shrink-0"
              aria-label="Cancel"
            >
              <X size={15} />
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.9 }}
              transition={{ type: 'spring', stiffness: 400, damping: 20 }}
              onClick={handleConfirm}
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-400 flex-shrink-0"
              aria-label="Confirm"
            >
              <Check size={15} strokeWidth={2.5} />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
