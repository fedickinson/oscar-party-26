/**
 * BrowseSection — film encyclopedia, ceremony storylines, and biggest snubs.
 *
 * Film cards collapse by default; tap to expand full detail.
 * Storylines and snubs are compact cards below the film list.
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronUp, AlertTriangle, BookOpen } from 'lucide-react'
import {
  filmEncyclopedia,
  ceremonyStorylines,
  biggestSnubs,
  type FilmProfile,
} from '../../data/film-encyclopedia'
import { FilmIcon } from '../../lib/film-icons'

// Nomination-count → border accent: more noms = stronger gold
function nomAccentClass(nominations: number): string {
  if (nominations >= 12) return 'border-oscar-gold/70'
  if (nominations >= 8) return 'border-oscar-gold/40'
  if (nominations >= 5) return 'border-white/20'
  return 'border-white/10'
}

function FilmCard({ film }: { film: FilmProfile }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <motion.div
      layout
      className={['bg-white/5 backdrop-blur-lg border rounded-2xl overflow-hidden', nomAccentClass(film.nominations)].join(' ')}
    >
      {/* Collapsed header — always visible */}
      <motion.button
        layout="position"
        whileTap={{ scale: 0.98 }}
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left px-4 py-3"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <FilmIcon filmName={film.title} size={16} className="text-oscar-gold flex-shrink-0" />
              <span className="font-semibold text-white leading-tight">{film.title}</span>
              {film.nominations >= 10 && (
                <span className="text-[10px] font-bold text-oscar-gold bg-oscar-gold/15 border border-oscar-gold/30 px-1.5 py-0.5 rounded-full">
                  {film.nominations} noms
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <span className="text-xs text-white/50">{film.director}</span>
              <span className="text-xs text-white/35">{film.genre}</span>
            </div>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs font-medium text-emerald-400">RT {film.rtScore}%</span>
              <span className="text-xs text-white/40">MC {film.metacritic}</span>
              {film.nominations < 10 && (
                <span className="text-xs text-white/40">{film.nominations} noms</span>
              )}
            </div>
          </div>
          <div className="flex-shrink-0 mt-0.5">
            {expanded
              ? <ChevronUp size={16} className="text-white/40" />
              : <ChevronDown size={16} className="text-white/40" />
            }
          </div>
        </div>
      </motion.button>

      {/* Expanded detail */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="detail"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3 border-t border-white/8 pt-3">
              {/* Meta row */}
              <div className="flex items-center gap-3 flex-wrap text-xs text-white/50">
                <span>{film.runtime}</span>
                <span>{film.boxOffice}</span>
                <span>{film.year}</span>
              </div>

              {/* Cast */}
              <div>
                <p className="text-[11px] uppercase tracking-wider text-white/35 mb-1">Cast</p>
                <p className="text-sm text-white/75">{film.stars.join(', ')}</p>
              </div>

              {/* Synopsis */}
              <div>
                <p className="text-[11px] uppercase tracking-wider text-white/35 mb-1">Synopsis</p>
                <p className="text-sm text-white/80 leading-relaxed">{film.synopsis}</p>
              </div>

              {/* Why nominated */}
              <div>
                <p className="text-[11px] uppercase tracking-wider text-white/35 mb-1">Why nominated</p>
                <p className="text-sm text-white/75 leading-relaxed">{film.whyNominated}</p>
              </div>

              {/* Oscar storyline */}
              <div className="bg-oscar-gold/8 border border-oscar-gold/20 rounded-xl px-3 py-2.5">
                <p className="text-[11px] uppercase tracking-wider text-oscar-gold/70 mb-1">Oscar Storyline</p>
                <p className="text-sm text-white/85 leading-relaxed">{film.oscarStoryline}</p>
              </div>

              {/* Predicted wins */}
              <div>
                <p className="text-[11px] uppercase tracking-wider text-white/35 mb-1">Predicted wins</p>
                <p className="text-sm text-white/70 leading-relaxed">{film.predictedWins}</p>
              </div>

              {/* Controversy */}
              {film.controversy && (
                <div className="bg-red-500/8 border border-red-500/20 rounded-xl px-3 py-2.5">
                  <p className="text-[11px] uppercase tracking-wider text-red-400/70 mb-1">Controversy</p>
                  <p className="text-sm text-white/75 leading-relaxed">{film.controversy}</p>
                </div>
              )}

              {/* Key facts */}
              <div>
                <p className="text-[11px] uppercase tracking-wider text-white/35 mb-2">Key facts</p>
                <ul className="space-y-1.5">
                  {film.keyFacts.map((fact, i) => (
                    <li key={i} className="flex gap-2 text-sm text-white/70 leading-snug">
                      <span className="text-oscar-gold/60 flex-shrink-0 mt-0.5">•</span>
                      <span>{fact}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function BrowseSection() {
  const [showStorylines, setShowStorylines] = useState(false)
  const [showSnubs, setShowSnubs] = useState(false)

  // Sort: most nominated first
  const sortedFilms = [...filmEncyclopedia].sort((a, b) => b.nominations - a.nominations)

  return (
    <div className="space-y-3">
      {/* Films header */}
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-white/80">Films &amp; Nominees</h3>
      </div>

      {/* Film cards */}
      <div className="space-y-2">
        {sortedFilms.map((film) => (
          <FilmCard key={film.id} film={film} />
        ))}
      </div>

      {/* Storylines */}
      <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl overflow-hidden">
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => setShowStorylines((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3"
        >
          <div className="flex items-center gap-2">
            <BookOpen size={16} className="text-oscar-gold" />
            <span className="text-sm font-semibold text-white/80">Storylines</span>
            <span className="text-xs text-white/40">{ceremonyStorylines.length}</span>
          </div>
          {showStorylines
            ? <ChevronUp size={16} className="text-white/40" />
            : <ChevronDown size={16} className="text-white/40" />
          }
        </motion.button>

        <AnimatePresence initial={false}>
          {showStorylines && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-3 pt-1 space-y-2 border-t border-white/8">
                {ceremonyStorylines.map((s, i) => (
                  <div key={i} className="bg-white/5 rounded-xl px-3 py-2.5">
                    <p className="text-sm font-medium text-oscar-gold/90 mb-1">{s.title}</p>
                    <p className="text-xs text-white/65 leading-relaxed">{s.description}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Snubs */}
      <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl overflow-hidden">
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => setShowSnubs((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3"
        >
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-400" />
            <span className="text-sm font-semibold text-white/80">Biggest Snubs</span>
            <span className="text-xs text-white/40">{biggestSnubs.length}</span>
          </div>
          {showSnubs
            ? <ChevronUp size={16} className="text-white/40" />
            : <ChevronDown size={16} className="text-white/40" />
          }
        </motion.button>

        <AnimatePresence initial={false}>
          {showSnubs && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-3 pt-1 space-y-2 border-t border-white/8">
                {biggestSnubs.map((s, i) => (
                  <div key={i} className="bg-red-500/8 border border-red-500/20 rounded-xl px-3 py-2.5">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-white/90">{s.name}</span>
                      <span className="text-[10px] text-red-400 bg-red-500/15 px-1.5 py-0.5 rounded-full">
                        {s.category}
                      </span>
                    </div>
                    <p className="text-xs text-white/60 leading-relaxed">{s.description}</p>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
