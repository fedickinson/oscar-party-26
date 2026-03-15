/**
 * SpotlightStakes — compact game stakes summary for a category.
 * Shows: highest confidence pick, pick distribution, draft stakes.
 */

import type { PlayerPickInfo } from './SpotlightNomineeCard'

interface DraftStake {
  playerName: string
  entityName: string
  points: number
}

interface Props {
  allPicks: PlayerPickInfo[]
  draftStakes: DraftStake[]
}

export default function SpotlightStakes({ allPicks, draftStakes }: Props) {
  if (allPicks.length === 0 && draftStakes.length === 0) return null

  const highestStake = allPicks.reduce<PlayerPickInfo | null>(
    (max, p) => (!max || p.confidence > max.confidence ? p : max),
    null,
  )

  // Count picks per nominee name
  const nomineeCounts = new Map<string, number>()
  allPicks.forEach((p) =>
    nomineeCounts.set(p.nomineeName, (nomineeCounts.get(p.nomineeName) ?? 0) + 1),
  )
  const sorted = Array.from(nomineeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }))

  return (
    <div className="px-3 py-2.5 rounded-xl bg-white/4 border border-white/8">
      <p className="text-[10px] uppercase tracking-wider text-white/30 mb-1.5">Stakes</p>
      <div className="space-y-0.5">
        {highestStake && (
          <p className="text-xs text-white/55">
            Highest stake:{' '}
            <span className="text-white/80 font-medium">{highestStake.playerName}</span>
            {' '}· C{highestStake.confidence}
          </p>
        )}
        {sorted.length > 0 && (
          <p className="text-xs text-white/45">
            {sorted.map((n, i) => (
              <span key={n.name}>
                {i > 0 && ', '}
                {n.count} for {n.name}
              </span>
            ))}
          </p>
        )}
        {draftStakes.map((ds, i) => (
          <p key={i} className="text-xs text-white/45">
            {ds.playerName} claimed {ds.entityName} — D+{ds.points} if wins
          </p>
        ))}
      </div>
    </div>
  )
}
