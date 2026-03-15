/**
 * NomineeDetailSheet — full encyclopedia entry for a nominee.
 *
 * Slides up over the CategoryInfoModal when a nominee card is tapped.
 * Film nominees show the full FilmProfile. Person nominees show their
 * name/role heading then the associated film's entry below.
 *
 * Data source: src/data/film-encyclopedia.ts (static, no fetch needed).
 */

import { motion } from 'framer-motion'
import { X, Star, DollarSign, Clock, Film } from 'lucide-react'
import { filmEncyclopedia } from '../../data/film-encyclopedia'
import type { NomineeRow } from '../../types/database'

interface Props {
  nominee: NomineeRow
  categoryName: string
  onClose: () => void
}

function ScorePill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col items-center px-3 py-2 bg-white/5 border border-white/8 rounded-xl">
      <span className={['text-base font-bold', color].join(' ')}>{value}%</span>
      <span className="text-[10px] text-white/40 mt-0.5">{label}</span>
    </div>
  )
}

function SectionHeading({ label }: { label: string }) {
  return (
    <p className="text-[11px] uppercase tracking-wider text-oscar-gold/60 mb-2">{label}</p>
  )
}

export default function NomineeDetailSheet({ nominee, categoryName, onClose }: Props) {
  const isFilm = nominee.type === 'film'
  const lookupTitle = isFilm ? nominee.film_name : nominee.film_name

  // Case-insensitive match on title
  const film = filmEncyclopedia.find(
    (f) => f.title.toLowerCase() === lookupTitle.toLowerCase(),
  )

  return (
    <>
      {/* Backdrop — clicking closes this sheet only (category modal stays) */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/50"
        onClick={onClose}
      />

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 300, damping: 32 }}
        className="fixed bottom-0 left-0 right-0 z-[60] bg-[#0c1028] border-t border-white/10 rounded-t-3xl max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-2 pb-4 flex-shrink-0">
          <div className="min-w-0 pr-3">
            {isFilm ? (
              <>
                <p className="text-[11px] uppercase tracking-wider text-oscar-gold/70 mb-0.5">{categoryName}</p>
                <h2 className="text-xl font-bold text-white leading-tight">{nominee.film_name}</h2>
              </>
            ) : (
              <>
                <p className="text-[11px] uppercase tracking-wider text-oscar-gold/70 mb-0.5">{categoryName}</p>
                <h2 className="text-xl font-bold text-white leading-tight">{nominee.name}</h2>
                <p className="text-sm text-white/50 mt-0.5">{nominee.film_name}</p>
              </>
            )}
          </div>
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/8 border border-white/10 flex items-center justify-center flex-shrink-0 mt-1"
          >
            <X size={16} className="text-white/60" />
          </motion.button>
        </div>

        <div className="h-px bg-white/8 flex-shrink-0" />

        {/* Scrollable content */}
        <div className="overflow-y-auto flex-1 px-5 py-5 space-y-6">

          {!film && (
            <p className="text-sm text-white/40 text-center py-8">
              No encyclopedia entry found for this film.
            </p>
          )}

          {film && (
            <>
              {/* Film meta row */}
              <div className="flex flex-wrap gap-3 text-xs text-white/50">
                {film.director && (
                  <span className="flex items-center gap-1">
                    <Film size={11} className="text-white/30" />
                    {film.director}
                  </span>
                )}
                {film.runtime && (
                  <span className="flex items-center gap-1">
                    <Clock size={11} className="text-white/30" />
                    {film.runtime}
                  </span>
                )}
                {film.boxOffice && (
                  <span className="flex items-center gap-1">
                    <DollarSign size={11} className="text-white/30" />
                    {film.boxOffice}
                  </span>
                )}
              </div>

              {/* Scores */}
              {(film.rtScore || film.metacritic) && (
                <div className="flex gap-2">
                  {film.rtScore > 0 && (
                    <ScorePill label="Rotten Tomatoes" value={film.rtScore} color="text-red-400" />
                  )}
                  {film.metacritic > 0 && (
                    <ScorePill label="Metacritic" value={film.metacritic} color="text-yellow-400" />
                  )}
                  <div className="flex flex-col items-center px-3 py-2 bg-white/5 border border-white/8 rounded-xl">
                    <span className="text-base font-bold text-oscar-gold">{film.nominations}</span>
                    <span className="text-[10px] text-white/40 mt-0.5">Nominations</span>
                  </div>
                </div>
              )}

              {/* Synopsis */}
              <div>
                <SectionHeading label="Synopsis" />
                <p className="text-sm text-white/75 leading-relaxed">{film.synopsis}</p>
              </div>

              {/* Why nominated */}
              <div>
                <SectionHeading label="Why it's nominated" />
                <p className="text-sm text-white/75 leading-relaxed">{film.whyNominated}</p>
              </div>

              {/* Oscar storyline */}
              <div>
                <SectionHeading label="Oscar storyline" />
                <p className="text-sm text-white/75 leading-relaxed">{film.oscarStoryline}</p>
              </div>

              {/* Predicted wins */}
              {film.predictedWins && (
                <div className="bg-oscar-gold/8 border border-oscar-gold/20 rounded-2xl p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Star size={13} className="text-oscar-gold" />
                    <SectionHeading label="Predicted wins" />
                  </div>
                  <p className="text-sm text-white/80 leading-relaxed">{film.predictedWins}</p>
                </div>
              )}

              {/* Key facts */}
              {film.keyFacts.length > 0 && (
                <div>
                  <SectionHeading label="Key facts" />
                  <div className="space-y-2">
                    {film.keyFacts.map((fact, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-oscar-gold/50 flex-shrink-0 mt-1.5" />
                        <p className="text-sm text-white/70 leading-relaxed">{fact}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Controversy */}
              {film.controversy && (
                <div className="bg-red-500/8 border border-red-500/20 rounded-2xl p-4">
                  <SectionHeading label="Controversy" />
                  <p className="text-sm text-white/70 leading-relaxed">{film.controversy}</p>
                </div>
              )}

              {/* Stars */}
              {film.stars.length > 0 && (
                <div>
                  <SectionHeading label="Cast" />
                  <div className="flex flex-wrap gap-1.5">
                    {film.stars.map((star, i) => (
                      <span
                        key={i}
                        className={[
                          'text-xs px-2.5 py-1 rounded-full border',
                          star === nominee.name
                            ? 'bg-oscar-gold/15 border-oscar-gold/30 text-oscar-gold'
                            : 'bg-white/5 border-white/10 text-white/60',
                        ].join(' ')}
                      >
                        {star}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="h-6" />
            </>
          )}
        </div>
      </motion.div>
    </>
  )
}
