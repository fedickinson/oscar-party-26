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
import { Award, Trophy } from 'lucide-react'
import { FilmIcon } from '../../lib/film-icons'
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

// High-value categories (tier 1 = 10pt, use points >= 8 for "big win")
function isBigWin(points: number): boolean {
  return points >= 8
}

export default function ResultsFeed({ results }: Props) {
  if (results.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 gap-2.5">
        <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/8 flex items-center justify-center">
          <Award size={20} className="text-white/15" />
        </div>
        <p className="text-sm text-white/30 font-medium">No winners announced yet</p>
        <p className="text-xs text-white/20">Waiting for the ceremony to begin</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <AnimatePresence initial={false}>
        {results.map((result, index) => {
          const big = isBigWin(result.categoryPoints)
          const isNewest = index === 0

          return (
            <motion.div
              key={`${result.categoryId}-${result.announcedAt.getTime()}`}
              layout
              initial={
                isNewest
                  ? { opacity: 0, y: -24, scale: 0.95 }
                  : { opacity: 0, y: -12, scale: 0.97 }
              }
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.15 } }}
              transition={{
                type: 'spring',
                stiffness: isNewest ? 340 : 380,
                damping: isNewest ? 24 : 30,
              }}
              className={[
                'backdrop-blur-lg border rounded-xl px-3.5 py-3 relative overflow-hidden',
                big
                  ? 'border-oscar-gold/28 bg-oscar-gold/8'
                  : 'border-white/8 bg-white/5',
              ].join(' ')}
            >
              {/* Left-edge accent stripe for big wins */}
              {big && (
                <motion.div
                  initial={isNewest ? { scaleY: 0 } : { scaleY: 1 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: 0.3, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-xl origin-top"
                  style={{
                    background: 'linear-gradient(180deg, rgba(212,175,55,0.8) 0%, rgba(212,175,55,0.3) 100%)',
                  }}
                />
              )}

              {/* Gold shimmer sweep on newest big-win */}
              {isNewest && big && (
                <motion.div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: 'linear-gradient(105deg, transparent 15%, rgba(212,175,55,0.10) 48%, rgba(245,230,163,0.06) 52%, transparent 82%)',
                  }}
                  initial={{ x: '-130%' }}
                  animate={{ x: '230%' }}
                  transition={{ duration: 0.95, delay: 0.12, ease: 'easeOut' }}
                />
              )}

              {/* Newest non-big shimmer */}
              {isNewest && !big && (
                <motion.div
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background: 'linear-gradient(105deg, transparent 20%, rgba(255,255,255,0.04) 50%, transparent 80%)',
                  }}
                  initial={{ x: '-130%' }}
                  animate={{ x: '230%' }}
                  transition={{ duration: 0.8, delay: 0.1, ease: 'easeOut' }}
                />
              )}

              <div className="flex items-start justify-between gap-2 relative z-10">
                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                  {/* Icon */}
                  <div
                    className={[
                      'w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5',
                      big
                        ? 'bg-oscar-gold/16 border border-oscar-gold/28'
                        : 'bg-white/6 border border-white/8',
                    ].join(' ')}
                  >
                    {big ? (
                      <Trophy size={12} className="text-oscar-gold" />
                    ) : (
                      <Award size={12} className="text-white/35" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-white/30 uppercase tracking-widest mb-0.5 font-medium">
                      {result.categoryName}
                    </p>
                    <p className={[
                      'text-sm font-bold truncate leading-tight',
                      big ? 'text-oscar-gold' : 'text-white/90',
                    ].join(' ')}>
                      {result.winnerName}
                      {result.tieWinnerName && (
                        <>
                          <span className="text-white/28 mx-1 font-normal">&</span>
                          {result.tieWinnerName}
                        </>
                      )}
                    </p>
                    {result.tieWinnerName && (
                      <span className="text-[9px] text-amber-400/65 uppercase tracking-wide font-bold">Tie</span>
                    )}
                    {result.winnerFilm && !result.tieWinnerName && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <FilmIcon filmName={result.winnerFilm} size={9} className="text-white/22 flex-shrink-0" />
                        <p className="text-[11px] text-white/38 truncate">{result.winnerFilm}</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className={[
                    'text-xs font-extrabold tabular-nums',
                    big ? 'text-oscar-gold' : 'text-white/55',
                  ].join(' ')}>
                    +{result.categoryPoints}pt
                  </span>
                  <span className="text-[10px] text-white/20">
                    {timeAgo(result.announcedAt)}
                  </span>
                </div>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
