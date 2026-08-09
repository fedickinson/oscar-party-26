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
import { BINGO_LINE_PALETTE, BINGO_LINES, FREE_CENTER_INDEX, TIER_POINTS } from '../../lib/bingo-utils'
import BingoSquare from './BingoSquare'
import TierChip from './TierChip'
import SquareRule from './SquareRule'

// Determine if a BINGO_LINES line is a row, column, or diagonal
function getLineType(line: number[]): 'row' | 'col' | 'diag-tl' | 'diag-tr' {
  // Rows: all indices in same group of 5
  const row0 = Math.floor(line[0] / 5)
  if (line.every((i) => Math.floor(i / 5) === row0)) return 'row'
  // Cols: all indices differ by 5
  const col0 = line[0] % 5
  if (line.every((i) => i % 5 === col0)) return 'col'
  // Diag TL-BR: [0,6,12,18,24]
  if (line[0] === 0) return 'diag-tl'
  return 'diag-tr'
}

function getRowIndex(line: number[]): number { return Math.floor(line[0] / 5) }
function getColIndex(line: number[]): number { return line[0] % 5 }

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

  // Build a map from square index → BINGO_LINES index for per-line coloring.
  // When a square is in multiple completed lines, the first (lowest index) wins.
  const squareLineColorMap = new Map<number, number>()
  bingoLines.forEach((completedLine) => {
    const lineIdx = BINGO_LINES.findIndex(
      (l) => l.length === completedLine.length && l.every((v, i) => v === completedLine[i]),
    )
    if (lineIdx >= 0) {
      completedLine.forEach((squareIdx) => {
        if (!squareLineColorMap.has(squareIdx)) squareLineColorMap.set(squareIdx, lineIdx)
      })
    }
  })

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
            <span className="text-xs font-bold text-accent/70 tracking-widest">
              {letter}
            </span>
          </div>
        ))}
      </div>

      {/* 5×5 grid with band overlays */}
      <div className="relative grid grid-cols-5 gap-1">
        {squares.map((square, index) => (
          <BingoSquare
            key={index}
            index={index}
            shortText={square?.short_text ?? ''}
            status={getStatus(index)}
            isObjective={square?.is_objective ?? false}
            tier={square?.likelihood_tier}
            bingoLineColorIndex={squareLineColorMap.get(index) ?? null}
            isSelected={selectedIndex === index}
            onTap={() => handleTap(index)}
          />
        ))}

        {/* Bingo band overlays — SVG spanning the full grid for reliable % positioning */}
        {bingoLines.length > 0 && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              zIndex: 10,
            }}
          >
            <svg
              width="100%"
              height="100%"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              style={{ position: 'absolute', inset: 0, overflow: 'visible' }}
            >
              <defs>
                {bingoLines.map((_, bandIdx) => (
                  <filter key={bandIdx} id={`bingo-glow-${bandIdx}`} x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
                    <feMerge>
                      <feMergeNode in="coloredBlur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                ))}
              </defs>
              {bingoLines.map((completedLine, bandIdx) => {
                const lineType = getLineType(completedLine)
                const lineIdx = BINGO_LINES.findIndex(
                  (l) => l.length === completedLine.length && l.every((v, i) => v === completedLine[i]),
                )
                const palette = lineIdx >= 0 ? BINGO_LINE_PALETTE[lineIdx] : BINGO_LINE_PALETTE[0]
                const color = palette.bg
                const key = `band-svg-${completedLine.join('-')}`

                // Cell size in % (5 cells = 100%, ignoring gap for overlay purposes)
                const cellPct = 100 / 5  // 20%
                const halfCell = cellPct / 2  // 10%

                if (lineType === 'row') {
                  const r = getRowIndex(completedLine)
                  const y = r * cellPct
                  return (
                    <rect
                      key={key}
                      x="0"
                      y={y}
                      width="100"
                      height={cellPct}
                      fill={color}
                      filter={`url(#bingo-glow-${bandIdx})`}
                      rx="1"
                    />
                  )
                } else if (lineType === 'col') {
                  const c = getColIndex(completedLine)
                  const x = c * cellPct
                  return (
                    <rect
                      key={key}
                      x={x}
                      y="0"
                      width={cellPct}
                      height="100"
                      fill={color}
                      filter={`url(#bingo-glow-${bandIdx})`}
                      rx="1"
                    />
                  )
                } else {
                  // Diagonal — thick SVG line
                  const x1 = lineType === 'diag-tl' ? halfCell : 100 - halfCell
                  const x2 = lineType === 'diag-tl' ? 100 - halfCell : halfCell
                  return (
                    <line
                      key={key}
                      x1={x1}
                      y1={halfCell}
                      x2={x2}
                      y2={100 - halfCell}
                      stroke={color}
                      strokeWidth="20"
                      strokeLinecap="round"
                      filter={`url(#bingo-glow-${bandIdx})`}
                    />
                  )
                }
              })}
            </svg>
          </div>
        )}
      </div>

      {/* Confirmation panel — slides up from inside the card.
          Answers "does this count?" before the claim goes to the host, which is
          the argument worth preventing. Leads with the fine print rather than
          the whole rule; see SquareRule for why that half. */}
      <AnimatePresence>
        {selectedIndex !== null && selectedSquare && (
          <motion.div
            key="confirm-bar"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            className="mt-2 bg-white/8 backdrop-blur border border-white/12 rounded-xl px-3 py-2.5"
          >
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <p className="text-[15px] font-semibold text-white leading-snug">
                {selectedSquare.title ?? selectedSquare.short_text}
              </p>
              {/* No points on the chip here — the confirm button below already
                  says "+3", and the same number twice reads as two numbers. */}
              {selectedSquare.likelihood_tier && (
                <div className="flex-shrink-0 mt-0.5">
                  <TierChip tier={selectedSquare.likelihood_tier} />
                </div>
              )}
            </div>

            {/* Keyed by square so the disclosure resets when you switch
                squares — otherwise the panel silently changes height. */}
            <SquareRule
              key={selectedSquare.id}
              winCondition={selectedSquare.win_condition ?? selectedSquare.text}
              probabilityPct={selectedSquare.probability_pct}
            />

            <div className="flex items-center gap-2 mt-2.5">
              <motion.button
                whileTap={{ scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                onClick={onDeselect}
                className="flex-1 h-11 flex items-center justify-center gap-1.5 rounded-lg bg-white/8 border border-white/15 text-white/60 text-xs font-semibold"
              >
                <X size={14} />
                Cancel
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                onClick={handleConfirm}
                className="flex-[1.4] h-11 flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-emerald-400 text-xs font-bold"
              >
                <Check size={14} strokeWidth={2.5} />
                {/* What the claim is worth, at the moment you make it */}
                It happened
                {selectedSquare.likelihood_tier && (
                  <span className="opacity-70">
                    +{TIER_POINTS[selectedSquare.likelihood_tier]}
                  </span>
                )}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
