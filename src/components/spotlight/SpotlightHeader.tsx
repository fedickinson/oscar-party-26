/**
 * SpotlightHeader — the category being presented, above the nominee list.
 *
 * The tier name is show copy, not platform copy. It used to be four hard-coded
 * awards-ceremony words ("Huge Moment", "Flavour"), so a pack that numbers its
 * prediction tiers had another show's vocabulary read back at it. It now asks
 * `confidenceTierLabel` — the same answer the Confidence ladder gives, and the
 * one place the legacy pack's authored strings are pinned.
 *
 * The tier badge mirrors that ladder's colours: ochre at the top, then muted,
 * ashlar, dim and ash. All of them come from the token contract, so the theme
 * seam still moves them.
 */

import { confidenceTierLabel } from '../../lib/show-identity'
import { useShowIdentity } from '../../hooks/useShowIdentity'

const TIER_BADGE: Record<number, string> = {
  1: 'bg-[var(--t-pending-soft)] text-[var(--t-pending)]',
  2: 'bg-[var(--t-surface)] text-[var(--t-text-muted)]',
  3: 'bg-[var(--t-surface)] text-[var(--t-ashlar)]',
  4: 'bg-[var(--t-surface)] text-[var(--t-text-dim)]',
  5: 'bg-[var(--t-negative-soft)] text-[var(--t-negative)]',
}

const TIER_BADGE_FALLBACK = 'bg-[var(--t-surface)] text-[var(--t-text-dim)]'

interface Props {
  categoryName: string
  tier: number
  points: number
  state: 'suspense' | 'reveal'
}

export default function SpotlightHeader({ categoryName, tier, points, state }: Props) {
  const { identity: showIdentity } = useShowIdentity()

  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-1">
        <span
          className={[
            'text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide',
            TIER_BADGE[tier] ?? TIER_BADGE_FALLBACK,
          ].join(' ')}
        >
          {confidenceTierLabel(tier, showIdentity)}
        </span>
        <span className="text-[10px] text-accent/60">{points} pts</span>
      </div>
      <h1 className="text-xl font-bold text-white leading-tight truncate">{categoryName}</h1>
      {state === 'reveal' && (
        <p className="text-xs text-[var(--t-positive)] mt-0.5 font-medium">Scored</p>
      )}
    </div>
  )
}
