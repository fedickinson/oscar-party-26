/**
 * PicksReveal — shows all submitted picks after the player has submitted.
 *
 * Layout: grouped by tier (labelled per show identity), categories sorted
 * within each tier by the current player's confidence number descending —
 * so your biggest bets appear at the top of each section.
 *
 * Each category card shows:
 *   • Each submitted player's nominee + confidence number
 *   • One agreement badge on the category header:
 *     - "unanimous" if all players picked the same nominee
 *     - "split" if some overlap but not all the same
 *     - "divided" if every player picked a different nominee
 */

import type { PlayerRow, ConfidencePickRow } from '../../types/database'
import type { CategoryWithNominees } from '../../types/game'
import { CategoryIcon } from '../ui/CategoryIcon'
import { confidenceTierLabel } from '../../lib/show-identity'
import { useShowIdentity } from '../../hooks/useShowIdentity'

interface Props {
  categories: CategoryWithNominees[]
  allSubmittedPicks: ConfidencePickRow[]
  submittedPlayerIds: Set<string>
  players: PlayerRow[]
  myPlayerId: string
}

// Same tier palette as the picking list in Confidence.tsx, so the reveal reads
// as the same ladder the player just filled in.
const TIER_LABEL_COLORS: Record<number, string> = {
  1: 'text-[var(--t-pending)]',
  2: 'text-[var(--t-text-muted)]',
  3: 'text-[var(--t-ashlar)]',
  4: 'text-[var(--t-text-dim)]',
  5: 'text-[var(--t-negative)]',
}

export default function PicksReveal({
  categories,
  allSubmittedPicks,
  submittedPlayerIds,
  players,
  myPlayerId,
}: Props) {
  const { identity: showIdentity } = useShowIdentity()
  const submittedPlayers = players.filter((p) => submittedPlayerIds.has(p.id))

  if (submittedPlayers.length === 0) {
    return (
      <div className="text-center py-8 text-[var(--t-text-dim)] text-sm">
        No picks submitted yet.
      </div>
    )
  }

  // Helper: my confidence for a given category (0 if not found, sorts last)
  function myConfidence(categoryId: number): number {
    return allSubmittedPicks.find(
      (p) => p.player_id === myPlayerId && p.category_id === categoryId,
    )?.confidence ?? 0
  }

  // Group categories by tier, sort each tier's categories by my confidence desc
  const tiers = [...new Set(categories.map((c) => c.tier))].sort()
  const categoriesByTier: Record<number, CategoryWithNominees[]> = {}
  tiers.forEach((tier) => {
    categoriesByTier[tier] = categories
      .filter((c) => c.tier === tier)
      .sort((a, b) => myConfidence(b.id) - myConfidence(a.id))
  })

  return (
    <div className="space-y-1">
      {tiers.map((tier) => (
        <div key={tier}>
          {/* Tier section header */}
          <p className={[
            'font-display text-xs uppercase tracking-widest px-1 mt-4 mb-2',
            TIER_LABEL_COLORS[tier] ?? 'text-[var(--t-text-dim)]',
          ].join(' ')}>
            {confidenceTierLabel(tier, showIdentity)}
          </p>

          <div className="space-y-2">
            {categoriesByTier[tier].map((category) => {
              const picksForCategory = allSubmittedPicks.filter(
                (p) => p.category_id === category.id && submittedPlayerIds.has(p.player_id),
              )

              const nomineeCounts: Record<string, number> = {}
              picksForCategory.forEach((p) => {
                nomineeCounts[p.nominee_id] = (nomineeCounts[p.nominee_id] ?? 0) + 1
              })

              const myPick = picksForCategory.find((p) => p.player_id === myPlayerId)

              const uniqueNominees = Object.keys(nomineeCounts).length
              const totalPickers = picksForCategory.length
              const agreementBadge = totalPickers >= 2
                ? uniqueNominees === 1
                  ? { label: 'unanimous', className: 'text-[var(--t-positive)] bg-[var(--t-positive-soft)]' }
                  : uniqueNominees === totalPickers
                    ? { label: 'divided', className: 'text-[var(--t-text-dim)] bg-[var(--t-surface)]' }
                    : { label: 'split', className: 'text-[var(--t-pending)] bg-[var(--t-pending-soft)]' }
                : null

              return (
                <div
                  key={category.id}
                  className="relief-glass border rounded-xl p-3"
                >
                  {/* Category header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5 flex-1 mr-2 min-w-0">
                      <CategoryIcon categoryName={category.name} size={12} className="text-[var(--t-text-dim)] flex-shrink-0" />
                      <span className="text-xs font-semibold text-[var(--t-text)] truncate">
                        {category.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-[var(--t-text-dim)] font-mono">{category.points}pt</span>
                      {agreementBadge && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${agreementBadge.className}`}>
                          {agreementBadge.label}
                        </span>
                      )}
                      {/* My confidence badge — prominent */}
                      {myPick && (
                        <span className="text-xs font-bold text-[var(--t-pending)] bg-[var(--t-pending-soft)] px-2 py-0.5 rounded-full font-mono">
                          {myPick.confidence}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Per-player pick rows */}
                  <div className="space-y-1.5">
                    {submittedPlayers.map((player) => {
                      const pick = picksForCategory.find((p) => p.player_id === player.id)
                      if (!pick) return null

                      const nominee = category.nominees.find((n) => n.id === pick.nominee_id)
                      const isMe = player.id === myPlayerId

                      return (
                        <div key={player.id} className="flex items-center gap-2">
                          {/* Player color dot */}
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: player.color }}
                          />

                          {/* Player name */}
                          <span
                            className={[
                              'text-xs flex-shrink-0 w-14 truncate',
                              isMe ? 'text-[var(--t-text)] font-medium' : 'text-[var(--t-text-dim)]',
                            ].join(' ')}
                          >
                            {isMe ? 'You' : player.name}
                          </span>

                          {/* Nominee name */}
                          <span className={[
                            'text-xs flex-1 truncate',
                            isMe ? 'text-[var(--t-text)]' : 'text-[var(--t-text-muted)]',
                          ].join(' ')}>
                            {nominee?.name ?? '—'}
                          </span>

                          {/* Confidence number — shown for other players */}
                          {!isMe && (
                            <span className="text-xs font-mono text-[var(--t-text-dim)] flex-shrink-0 w-5 text-right">
                              {pick.confidence}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
