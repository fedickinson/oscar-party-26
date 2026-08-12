/**
 * MyRoster — expandable bottom sheet showing the current player's picks.
 *
 * COLLAPSED (default):
 *   Single row: "My Roster  4/10 picks  ↑"
 *
 * EXPANDED:
 *   Slides up to reveal the full list of drafted entities with name,
 *   house, and potential points (sum of all event point values).
 *
 * We use framer-motion's AnimatePresence + height animation to slide the
 * content in and out. The handle bar at the top is always visible.
 *
 * This component is "sticky" at the bottom of the flex column in Draft.tsx
 * — it doesn't use position:fixed, which avoids iOS safe-area issues.
 */

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronUp } from 'lucide-react'
import { FilmIcon } from '../../lib/film-icons'
import { Hallmark } from '../ui/Hallmarks'
import StoryPortrait from '../ui/StoryPortrait'
import type { SignatureBeatRow } from '../../types/database'
import type { DraftEntityWithDetails } from '../../types/game'

interface Props {
  roster: DraftEntityWithDetails[]
  totalPickSlots: number
  playerColor: string
  beatsByEntityId: Map<string, SignatureBeatRow[]>
}

export default function MyRoster({ roster, totalPickSlots: _totalPickSlots, playerColor, beatsByEntityId }: Props) {
  const [expanded, setExpanded] = useState(false)

  const peoplePicks = roster.filter((e) => e.type === 'person')
  const dragonPicks = roster.filter((e) => e.type === 'film')

  const totalPotentialPoints = roster.reduce(
    (sum, e) => {
      const beats = beatsByEntityId.get(e.id) ?? []
      const scoringBeats = e.type === 'film' ? beats : beats.slice(0, 3)
      return sum + scoringBeats.reduce((beatSum, beat) => beatSum + beat.points, 0)
    },
    0,
  )

  return (
    <div className="material-oak relief-carved flex-shrink-0 overflow-hidden rounded-t-2xl border border-[var(--t-line)]">
      {/* Handle / summary row — always visible, tappable to toggle */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex min-h-11 w-full items-center justify-between px-4 py-3"
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
            <span className="text-xs text-[var(--t-text-dim)]">No picks yet</span>
          ) : (
            <span className="text-xs text-[var(--t-text-muted)]">
              {peoplePicks.length > 0 && `${peoplePicks.length} ${peoplePicks.length === 1 ? 'person' : 'people'}`}
              {peoplePicks.length > 0 && dragonPicks.length > 0 && ' · '}
              {dragonPicks.length > 0 && `${dragonPicks.length} ${dragonPicks.length === 1 ? 'dragon' : 'dragons'}`}
            </span>
          )}
          {totalPotentialPoints > 0 && (
            <span className="text-xs font-bold text-[var(--t-personal-text)]">
              {totalPotentialPoints} pts potential
            </span>
          )}
          <motion.span
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="grid h-6 w-6 place-items-center text-[var(--t-text-dim)]"
          >
            <ChevronUp aria-hidden="true" size={16} />
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
            className="overflow-hidden border-t border-[var(--t-line)]"
          >
            <div className="px-4 pb-4 pt-2 max-h-64 overflow-y-auto">
              {roster.length === 0 ? (
                <p className="py-4 text-center text-sm text-[var(--t-text-dim)]">
                  No picks yet — make your first selection!
                </p>
              ) : (
                <>
                  {peoplePicks.length > 0 && (
                    <RosterSection label="People" entities={peoplePicks} beatsByEntityId={beatsByEntityId} />
                  )}
                  {dragonPicks.length > 0 && (
                    <RosterSection label="Dragons" entities={dragonPicks} beatsByEntityId={beatsByEntityId} />
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
  beatsByEntityId,
}: {
  label: string
  entities: import('../../types/game').DraftEntityWithDetails[]
  beatsByEntityId: Map<string, SignatureBeatRow[]>
}) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-[var(--t-ornament)]">{label}</p>
      <div className="space-y-2">
        {entities.map((entity) => {
          const beats = beatsByEntityId.get(entity.id) ?? []
          const scoringBeats = entity.type === 'film' ? beats : beats.slice(0, 3)
          const pts = scoringBeats.reduce((sum, beat) => sum + beat.points, 0)
          return (
            <div
              key={entity.id}
              className="relief-glass flex min-h-11 items-center justify-between gap-3 px-3 py-2.5"
            >
              <div className="flex min-w-0 items-start gap-2">
                <StoryPortrait
                  name={entity.name}
                  src={entity.portraitUrl}
                  className="h-10 w-10"
                  fallback={<FilmIcon filmName={entity.type === 'film' ? entity.name : entity.film_name} size={16} className="text-[var(--t-text-muted)]" />}
                />
                {entity.type === 'film' && (
                  <span className="mt-0.5 flex-shrink-0 text-[var(--t-personal-text)]" aria-label="Claimed dragon">
                    <Hallmark id="hallmark-claim" size={14} />
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--t-text)]">{entity.name}</p>
                  {entity.film_name && entity.type === 'person' && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <FilmIcon filmName={entity.film_name} size={10} className="flex-shrink-0 text-[var(--t-text-dim)]" />
                      <p className="truncate text-xs italic text-[var(--t-text-muted)]">{entity.film_name}</p>
                    </div>
                  )}
                  <p className="mt-0.5 text-xs text-[var(--t-text-dim)]">
                    {entity.type === 'film'
                      ? `${beats.length} live beat${beats.length !== 1 ? 's' : ''}`
                      : `choose 3 of ${beats.length} beats`}
                  </p>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-bold tabular-nums text-[var(--t-personal-text)]">{pts}</p>
                <p className="text-xs text-[var(--t-text-dim)]">max pts</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
