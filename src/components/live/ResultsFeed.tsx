/**
 * ResultsFeed — recently announced Oscar winners, newest-first.
 *
 * Each entry shows category name, winner name + film, and the point
 * value for that category. AnimatePresence + layout animation slides
 * new cards in from the top and shifts existing ones down.
 *
 * Capped at 10 entries by useScores.
 */

import { AnimatePresence, motion } from 'framer-motion'
import { Award } from 'lucide-react'
import type { RecentResult } from '../../hooks/useScores'

interface Props {
  results: RecentResult[]
}

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ago`
}

export default function ResultsFeed({ results }: Props) {
  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-2">
        <Award size={28} className="text-white/15" />
        <p className="text-sm text-white/30">No winners announced yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <AnimatePresence initial={false}>
        {results.map((result) => (
          <motion.div
            key={`${result.categoryId}-${result.announcedAt.getTime()}`}
            layout
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="backdrop-blur-lg bg-white/6 border border-white/10 rounded-xl px-3 py-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-white/35 uppercase tracking-widest mb-0.5">
                  {result.categoryName}
                </p>
                <p className="text-sm font-semibold text-white truncate">
                  {result.winnerName}
                </p>
                {result.winnerFilm && (
                  <p className="text-xs text-white/45 truncate">{result.winnerFilm}</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className="text-xs font-bold text-oscar-gold">
                  +{result.categoryPoints}pt
                </span>
                <span className="text-[10px] text-white/25">
                  {timeAgo(result.announcedAt)}
                </span>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
