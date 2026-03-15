/**
 * MyRoster — expandable bottom sheet showing the current player's picks.
 *
 * COLLAPSED (default):
 *   Single row: "My Roster  4/10 picks  ↑"
 *
 * EXPANDED:
 *   Slides up to reveal the full list of drafted entities with name,
 *   film, and potential points (sum of all nomination point values).
 *
 * We use framer-motion's AnimatePresence + height animation to slide the
 * content in and out. The handle bar at the top is always visible.
 *
 * This component is "sticky" at the bottom of the flex column in Draft.tsx
 * — it doesn't use position:fixed, which avoids iOS safe-area issues.
 */

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FilmIcon } from '../../lib/film-icons'
import type { DraftEntityWithDetails } from '../../types/game'

interface Props {
  roster: DraftEntityWithDetails[]
  totalPickSlots: number
  playerColor: string
}

export default function MyRoster({ roster, totalPickSlots: _totalPickSlots, playerColor }: Props) {
  const [expanded, setExpanded] = useState(false)

  const peoplePicks = roster.filter((e) => e.type === 'person')
  const filmPicks = roster.filter((e) => e.type === 'film')

  const totalPotentialPoints = roster.reduce(
    (sum, e) => sum + e.nominations.reduce((s, n) => s + (n.points ?? 0), 0),
    0,
  )

  return (
    <div className="flex-shrink-0">
      {/* Handle / summary row — always visible, tappable to toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full backdrop-blur-lg bg-midnight/90 border border-white/15 rounded-t-2xl px-4 py-3 flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ backgroundColor: playerColor }}
          />
          <span className="font-semibold text-sm">My Roster</span>
        </div>

        <div className="flex items-center gap-3">
          {roster.length === 0 ? (
            <span className="text-xs text-white/30">No picks yet</span>
          ) : (
            <span className="text-xs text-white/50">
              {peoplePicks.length > 0 && `${peoplePicks.length} ${peoplePicks.length === 1 ? 'person' : 'people'}`}
              {peoplePicks.length > 0 && filmPicks.length > 0 && ' · '}
              {filmPicks.length > 0 && `${filmPicks.length} ${filmPicks.length === 1 ? 'film' : 'films'}`}
            </span>
          )}
          {totalPotentialPoints > 0 && (
            <span className="text-xs text-oscar-gold font-bold">
              {totalPotentialPoints} pts potential
            </span>
          )}
          <motion.span
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="text-white/40 text-xs"
          >
            ↑
          </motion.span>
        </div>
      </button>

      {/* Expanded content — slides up */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="roster-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden backdrop-blur-lg bg-midnight/95 border-x border-white/15"
          >
            <div className="px-4 pb-4 pt-2 max-h-64 overflow-y-auto">
              {roster.length === 0 ? (
                <p className="text-white/30 text-sm text-center py-4">
                  No picks yet — make your first selection!
                </p>
              ) : (
                <>
                  {peoplePicks.length > 0 && (
                    <RosterSection label="People" entities={peoplePicks} />
                  )}
                  {filmPicks.length > 0 && (
                    <RosterSection label="Films" entities={filmPicks} />
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── RosterSection ────────────────────────────────────────────────────────────

function RosterSection({
  label,
  entities,
}: {
  label: string
  entities: import('../../types/game').DraftEntityWithDetails[]
}) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="text-[10px] text-white/30 uppercase tracking-widest mb-1.5">{label}</p>
      <div className="space-y-0">
        {entities.map((entity) => {
          const pts = entity.nominations.reduce((s, n) => s + (n.points ?? 0), 0)
          return (
            <div
              key={entity.id}
              className="flex items-center justify-between gap-3 py-2 border-b border-white/5 last:border-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{entity.name}</p>
                {entity.film_name && entity.type === 'person' && (
                  <div className="flex items-center gap-1 mt-0.5">
                    <FilmIcon filmName={entity.film_name} size={10} className="text-white/30 flex-shrink-0" />
                    <p className="text-xs text-white/40 italic truncate">{entity.film_name}</p>
                  </div>
                )}
                <p className="text-xs text-white/30 mt-0.5">
                  {entity.nom_count} nom{entity.nom_count !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold text-oscar-gold">{pts}</p>
                <p className="text-[10px] text-white/30">max pts</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
