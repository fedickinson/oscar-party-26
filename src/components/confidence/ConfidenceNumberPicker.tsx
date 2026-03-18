/**
 * ConfidenceNumberPicker — bottom sheet for assigning a confidence number.
 *
 * Shows numbers 1–24 in a 6×4 grid. States per cell:
 *   • selected (assigned to THIS category)   → gold filled
 *   • taken (assigned to another category)   → muted, shows category shortname
 *   • available                              → white/dim, tappable
 *
 * Tapping a taken number swaps it (handled by assignConfidence in the hook).
 * This component is wrapped in AnimatePresence by the parent for entrance/exit.
 */

import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import type { CategoryWithNominees } from '../../types/game'
import type { LocalPicksMap } from '../../hooks/useConfidence'

interface Props {
  category: CategoryWithNominees
  localPicks: LocalPicksMap
  categories: CategoryWithNominees[]
  maxConfidence: number
  onAssign: (confidence: number) => void
  onClose: () => void
}

export default function ConfidenceNumberPicker({
  category,
  localPicks,
  categories,
  maxConfidence,
  onAssign,
  onClose,
}: Props) {
  const currentConfidence = localPicks[category.id]?.confidence ?? null

  // Build a lookup: confidence number → category name (for taken cells)
  const takenMap: Record<number, string> = {}
  Object.entries(localPicks).forEach(([catIdStr, pick]) => {
    const catId = Number(catIdStr)
    if (pick.confidence != null && catId !== category.id) {
      const cat = categories.find((c) => c.id === catId)
      if (cat) takenMap[pick.confidence] = cat.name
    }
  })

  function handleTap(n: number) {
    onAssign(n)
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 bg-black/60 z-40"
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 360, damping: 40 }}
        className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto"
      >
        <div className="backdrop-blur-xl bg-deep-navy/95 border border-white/15 rounded-t-3xl p-5 pb-8">
          {/* Handle + header */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs text-white/40 uppercase tracking-widest mb-0.5">
                Prestige for
              </p>
              <p className="text-sm font-semibold text-white leading-tight">
                {category.name}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center"
            >
              <X size={14} className="text-white/60" />
            </button>
          </div>

          <p className="text-xs text-white/40 mb-3">
            Higher numbers = more prestige. Tap a taken number to swap it.
          </p>

          {/* Number grid — cols scale with range (6→6, 12→4, 6→3) */}
          <div className={[
            'grid gap-2',
            maxConfidence <= 6 ? 'grid-cols-3' : maxConfidence <= 12 ? 'grid-cols-4' : 'grid-cols-6',
          ].join(' ')}>
            {Array.from({ length: maxConfidence }, (_, i) => i + 1).map((n) => {
              const isSelected = currentConfidence === n
              const takenBy = takenMap[n]
              const isTaken = !!takenBy

              return (
                <motion.button
                  key={n}
                  whileTap={{ scale: 0.88 }}
                  onClick={() => handleTap(n)}
                  title={isTaken ? `Swap from: ${takenBy}` : undefined}
                  className={[
                    'h-10 rounded-lg text-sm font-bold transition-colors flex flex-col items-center justify-center',
                    isSelected
                      ? 'bg-oscar-gold text-deep-navy'
                      : isTaken
                        ? 'bg-white/8 text-white/30 border border-white/10'
                        : 'bg-white/10 text-white/80 hover:bg-white/15',
                  ].join(' ')}
                >
                  <span className="leading-none">{n}</span>
                  {isTaken && !isSelected && (
                    <span className="text-[8px] leading-none mt-0.5 text-white/25 truncate w-full text-center px-0.5">
                      swap
                    </span>
                  )}
                </motion.button>
              )
            })}
          </div>
        </div>
      </motion.div>
    </>
  )
}
