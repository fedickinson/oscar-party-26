/**
 * BrowseSection — film encyclopedia, ceremony storylines, and biggest snubs.
 *
 * Film cards collapse by default; tap to expand full detail.
 * Storylines and snubs are compact cards below the film list.
 */

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronUp, AlertTriangle, BookOpen, Clapperboard } from 'lucide-react'
import {
  filmEncyclopedia,
  ceremonyStorylines,
  biggestSnubs,
  type FilmProfile,
  type FilmCategory,
} from '../../data/film-encyclopedia'
import { FilmIcon } from '../../lib/film-icons'

// ─── Category display config ─────────────────────────────────────────────────

const SPECIALTY_SECTIONS: { category: FilmCategory; label: string }[] = [
  { category: 'live-action-short', label: 'Live Action Shorts' },
  { category: 'animated-short', label: 'Animated Shorts' },
  { category: 'documentary-short', label: 'Documentary Shorts' },
  { category: 'animated-feature', label: 'Animated Features' },
  { category: 'documentary-feature', label: 'Documentary Features' },
  { category: 'international-feature', label: 'International Features' },
]

function categoryBadgeLabel(cat: FilmCategory): string {
  switch (cat) {
    case 'live-action-short': return 'Live Action Short'
    case 'animated-short': return 'Animated Short'
    case 'documentary-short': return 'Doc Short'
    case 'animated-feature': return 'Animated Feature'
    case 'documentary-feature': return 'Doc Feature'
    case 'international-feature': return 'International'
    default: return 'Best Picture'
  }
}

// Nomination-count → border accent: more noms = stronger gold
function nomAccentClass(nominations: number): string {
  if (nominations >= 12) return 'border-oscar-gold/70'
  if (nominations >= 8) return 'border-oscar-gold/40'
  if (nominations >= 5) return 'border-white/20'
  return 'border-white/10'
}

interface FilmCardProps {
  film: FilmProfile
  highlighted?: boolean
  forceExpanded?: boolean
  cardRef?: React.Ref<HTMLDivElement>
}

function FilmCard({ film, highlighted = false, forceExpanded = false, cardRef }: FilmCardProps) {
  const [expanded, setExpanded] = useState(false)

  // Force-expand when highlighted
  useEffect(() => {
    if (forceExpanded) setExpanded(true)
  }, [forceExpanded])

  return (
    <motion.div
      ref={cardRef}
      layout
      className={[
        'bg-white/5 backdrop-blur-lg border rounded-2xl overflow-hidden transition-shadow duration-700',
        highlighted ? 'border-oscar-gold/60 shadow-[0_0_20px_3px_rgba(212,175,55,0.3)]' : nomAccentClass(film.nominations),
      ].join(' ')}
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
              {film.rtScore != null ? (
                <span className="text-xs font-medium text-emerald-400">RT {film.rtScore}%</span>
              ) : (
                <span className="text-xs text-white/30">RT N/A</span>
              )}
              {film.metacritic != null && (
                <span className="text-xs text-white/40">MC {film.metacritic}</span>
              )}
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
                {film.boxOffice && <span>{film.boxOffice}</span>}
                <span>{film.year}</span>
              </div>

              {/* Cast */}
              {film.stars.length > 0 && (
              <div>
                <p className="text-[11px] uppercase tracking-wider text-white/35 mb-1">Cast</p>
                <p className="text-sm text-white/75">{film.stars.join(', ')}</p>
              </div>
              )}

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

interface BrowseSectionProps {
  /** When set, the matching film card auto-expands and scrolls into view with a gold highlight. */
  highlightFilmTitle?: string | null
  /** Called after the highlight animation finishes so the parent can clear state. */
  onHighlightComplete?: () => void
}

export default function BrowseSection({ highlightFilmTitle, onHighlightComplete }: BrowseSectionProps = {}) {
  const [showStorylines, setShowStorylines] = useState(false)
  const [showSnubs, setShowSnubs] = useState(false)
  const [showSpecialty, setShowSpecialty] = useState(false)

  // Sort: most nominated first — main grid shows only best-picture entries
  const sortedFilms = [...filmEncyclopedia]
    .filter((f) => (f.category ?? 'best-picture') === 'best-picture')
    .sort((a, b) => b.nominations - a.nominations)

  // Specialty films: everything that is NOT best-picture
  const specialtyFilms = filmEncyclopedia.filter(
    (f) => f.category != null && f.category !== 'best-picture',
  )

  // All films combined for highlight search
  const allFilms = [...filmEncyclopedia]

  // Highlight: find the matching film by title (case-insensitive, partial match)
  const [activeHighlight, setActiveHighlight] = useState<string | null>(null)
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  useEffect(() => {
    if (!highlightFilmTitle) {
      setActiveHighlight(null)
      return
    }

    const target = highlightFilmTitle.toLowerCase()
    const match = allFilms.find(
      (f) => f.title.toLowerCase() === target || f.title.toLowerCase().includes(target) || target.includes(f.title.toLowerCase()),
    )

    // If the match is a specialty film, auto-expand the specialty section so the card is visible
    if (match && match.category && match.category !== 'best-picture') {
      setShowSpecialty(true)
    }

    if (match) {
      setActiveHighlight(match.id)

      // Scroll to the card after a brief delay so the tab switch + expand can complete
      requestAnimationFrame(() => {
        setTimeout(() => {
          const el = cardRefs.current.get(match.id)
          el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }, 150)
      })

      // Clear highlight after 3 seconds
      const timer = setTimeout(() => {
        setActiveHighlight(null)
        onHighlightComplete?.()
      }, 3000)
      return () => clearTimeout(timer)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightFilmTitle])

  return (
    <div className="space-y-3">
      {/* Films header */}
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-white/80">Films &amp; Nominees</h3>
      </div>

      {/* Film cards */}
      <div className="space-y-2">
        {sortedFilms.map((film) => (
          <FilmCard
            key={film.id}
            film={film}
            highlighted={activeHighlight === film.id}
            forceExpanded={activeHighlight === film.id}
            cardRef={(el: HTMLDivElement | null) => {
              if (el) cardRefs.current.set(film.id, el)
              else cardRefs.current.delete(film.id)
            }}
          />
        ))}
      </div>

      {/* Shorts & Specialty */}
      <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl overflow-hidden">
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => setShowSpecialty((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3"
        >
          <div className="flex items-center gap-2">
            <Clapperboard size={16} className="text-oscar-gold" />
            <span className="text-sm font-semibold text-white/80">Shorts &amp; Specialty</span>
            <span className="text-xs text-white/40">{specialtyFilms.length}</span>
          </div>
          {showSpecialty
            ? <ChevronUp size={16} className="text-white/40" />
            : <ChevronDown size={16} className="text-white/40" />
          }
        </motion.button>

        <AnimatePresence initial={false}>
          {showSpecialty && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-3 pt-1 space-y-4 border-t border-white/8">
                {SPECIALTY_SECTIONS.map(({ category, label }) => {
                  const films = specialtyFilms.filter((f) => f.category === category)
                  if (films.length === 0) return null
                  return (
                    <div key={category}>
                      <p className="text-[11px] uppercase tracking-wider text-oscar-gold/60 mb-2 mt-2">{label}</p>
                      <div className="space-y-1.5">
                        {films.map((film) => (
                          <FilmCard
                            key={film.id}
                            film={film}
                            highlighted={activeHighlight === film.id}
                            forceExpanded={activeHighlight === film.id}
                            cardRef={(el: HTMLDivElement | null) => {
                              if (el) cardRefs.current.set(film.id, el)
                              else cardRefs.current.delete(film.id)
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
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
