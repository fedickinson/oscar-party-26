/**
 * TierChip — the likelihood badge for a bingo square.
 *
 * Every square in the master pool carries an estimated chance that its win
 * condition happens at least once in the finale. Showing it turns a card from
 * "wait and see" into something you can read: you know which two squares are
 * your long shots and which line is realistically closeable.
 *
 * The chip deliberately does NOT print the percentage. "Long shot", "30%" and
 * "3pt" are three encodings of one fact; a chip carrying all three is read as
 * three things and understood as none. The name is the glanceable form and the
 * points are the actionable one, so those two stay. The exact odds belong to
 * SquareRule, where someone has chosen to read.
 */

import type { LikelihoodTier } from '../../types/database'
import { TIER_LABEL, TIER_POINTS, TIER_STYLE } from '../../lib/bingo-utils'

interface Props {
  tier: LikelihoodTier
  /** Appends what the square pays, e.g. "Long shot · 3pt" */
  showPoints?: boolean
}

export default function TierChip({ tier, showPoints = false }: Props) {
  const style = TIER_STYLE[tier]
  if (!style) return null

  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border whitespace-nowrap"
      style={{ color: style.text, backgroundColor: style.bg, borderColor: style.border }}
    >
      {TIER_LABEL[tier]}
      {showPoints && (
        <>
          <span className="opacity-40">·</span>
          <span className="font-semibold">{TIER_POINTS[tier]}pt</span>
        </>
      )}
    </span>
  )
}
