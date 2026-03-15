/**
 * PeekCardOverlay — read-only bottom-sheet view of another player's bingo card.
 *
 * Dismiss: swipe down > 100px OR tap the dark backdrop.
 * The 5×5 grid uses BingoSquare with readOnly=true — no interaction, just
 * their current mark state (approved → green, pending → amber, unmarked → dark).
 */

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import Avatar from '../Avatar'
import BingoSquare from './BingoSquare'
import { FREE_CENTER_INDEX, checkBingo, countBingos } from '../../lib/bingo-utils'
import type { BingoMarkRow, BingoSquareRow, PlayerRow } from '../../types/database'

interface Props {
  player: PlayerRow
  squares: (BingoSquareRow | null)[]
  marks: BingoMarkRow[]
  onDismiss: () => void
}

export default function PeekCardOverlay({ player, squares, marks, onDismiss }: Props) {
  const [showHint, setShowHint] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setShowHint(false), 2000)
    return () => clearTimeout(t)
  }, [])

  // ── Derived state ─────────────────────────────────────────────────────────────

  const markByIndex = new Map(marks.map((m) => [m.square_index, m]))

  const markedIndices = new Set<number>([FREE_CENTER_INDEX])
  marks.filter((m) => m.status === 'approved').forEach((m) => markedIndices.add(m.square_index))

  const { lines: bingoLines } = checkBingo(markedIndices, [])
  const lineIndices = new Set(bingoLines.flat())
  const bingoCount = countBingos(bingoLines)
  const approvedCount = marks.filter((m) => m.status === 'approved').length

  function getStatus(index: number): 'free' | 'approved' | 'pending' | 'denied' | 'unmarked' {
    if (index === FREE_CENTER_INDEX) return 'free'
    const mark = markByIndex.get(index)
    if (!mark) return 'unmarked'
    return mark.status as 'approved' | 'pending' | 'denied'
  }

  return (
    // Backdrop — tap to dismiss
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onDismiss}
    >
      {/* Bottom sheet — drag down to dismiss */}
      <motion.div
        className="w-full max-w-md bg-[#0A0E27] border border-white/10 rounded-t-3xl px-4 pb-10 pt-3"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        drag="y"
        dragConstraints={{ top: 0 }}
        dragElastic={0.2}
        onDragEnd={(_, info) => {
          if (info.offset.y > 100) onDismiss()
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle + hint */}
        <div className="flex flex-col items-center gap-1.5 mb-4">
          <div className="w-10 h-1 rounded-full bg-white/20" />
          <motion.p
            className="text-[10px] text-white/30"
            animate={{ opacity: showHint ? 1 : 0 }}
            transition={{ duration: 0.5 }}
          >
            Swipe down to close
          </motion.p>
        </div>

        {/* Header: avatar + name + stats */}
        <div className="flex items-center gap-3 mb-4">
          <Avatar avatarId={player.avatar_id} size="md" />
          <div>
            <p className="text-sm font-semibold text-white">{player.name}</p>
            <p className="text-xs text-white/40">
              {bingoCount > 0
                ? `${bingoCount} bingo${bingoCount !== 1 ? 's' : ''}`
                : 'No bingos'}{' '}
              · {approvedCount}/25 marked
            </p>
          </div>
        </div>

        {/* Read-only 5×5 grid */}
        <div
          className="backdrop-blur-lg bg-white/8 border border-white/12 rounded-2xl p-2.5 mx-auto"
          style={{ width: '100%', maxWidth: 340 }}
        >
          {/* Column header letters */}
          <div className="grid grid-cols-5 gap-1 mb-1">
            {['B', 'I', 'N', 'G', 'O'].map((letter) => (
              <div key={letter} className="flex items-center justify-center h-5">
                <span className="text-xs font-bold text-oscar-gold/70 tracking-widest">
                  {letter}
                </span>
              </div>
            ))}
          </div>

          {/* Grid */}
          <div className="grid grid-cols-5 gap-1">
            {squares.map((square, index) => (
              <BingoSquare
                key={index}
                index={index}
                shortText={square?.short_text ?? ''}
                status={getStatus(index)}
                isObjective={square?.is_objective ?? false}
                isInBingoLine={lineIndices.has(index)}
                isSelected={false}
                onTap={() => {}}
                readOnly
              />
            ))}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
