/**
 * PicksReveal — shows all submitted picks after the player has submitted.
 *
 * Layout: grouped by tier (Major Awards → Short Films), categories sorted
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

interface Props {
  categories: CategoryWithNominees[]
  allSubmittedPicks: ConfidencePickRow[]
  submittedPlayerIds: Set<string>
  players: PlayerRow[]
  myPlayerId: string
}

const TIER_LABELS: Record<number, string> = {
  1: 'Major Awards',
  2: 'Prestige Craft',
  3: 'Technical & Performance',
  4: 'Specialty',
  5: 'Short Films',
}

const TIER_LABEL_COLORS: Record<number, string> = {
  1: 'text-oscar-gold',
  2: 'text-violet-400',
  3: 'text-sky-400',
  4: 'text-emerald-400',
  5: 'text-white/30',
}

export default function PicksReveal({
  categories,
  allSubmittedPicks,
  submittedPlayerIds,
  players,
  myPlayerId,
}: Props) {
  const submittedPlayers = players.filter((p) => submittedPlayerIds.has(p.id))

  if (submittedPlayers.length === 0) {
    return (
      <div className="text-center py-8 text-white/30 text-sm">
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
            'text-xs uppercase tracking-widest px-1 mt-4 mb-2',
            TIER_LABEL_COLORS[tier] ?? 'text-white/30',
          ].join(' ')}>
            {TIER_LABELS[tier] ?? `Tier ${tier}`}
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
                  ? { label: 'unanimous', className: 'text-emerald-400 bg-emerald-400/10' }
                  : uniqueNominees === totalPickers
                    ? { label: 'divided', className: 'text-white/30 bg-white/5' }
                    : { label: 'split', className: 'text-amber-400 bg-amber-400/10' }
                : null

              return (
                <div
                  key={category.id}
                  className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-xl p-3"
                >
                  {/* Category header */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-white/70 flex-1 mr-2">
                      {category.name}
                    </span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-white/30 font-mono">{category.points}pt</span>
                      {agreementBadge && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${agreementBadge.className}`}>
                          {agreementBadge.label}
                        </span>
                      )}
                      {/* My confidence badge — prominent */}
                      {myPick && (
                        <span className="text-xs font-bold text-oscar-gold bg-oscar-gold/15 px-2 py-0.5 rounded-full font-mono">
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
                              isMe ? 'text-white/80 font-medium' : 'text-white/40',
                            ].join(' ')}
                          >
                            {isMe ? 'You' : player.name}
                          </span>

                          {/* Nominee name */}
                          <span className={[
                            'text-xs flex-1 truncate',
                            isMe ? 'text-white/80' : 'text-white/50',
                          ].join(' ')}>
                            {nominee?.name ?? '—'}
                          </span>

                          {/* Confidence number — shown for other players */}
                          {!isMe && (
                            <span className="text-xs font-mono text-white/30 flex-shrink-0 w-5 text-right">
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
