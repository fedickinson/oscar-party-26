/**
 * PipLegend — decodes the corner dots on the card.
 *
 * The dots used to be explained in a sentence of grey 12px prose, which asks
 * someone to hold "a dot means long shot" in their head and map it back to a
 * 6px mark. Showing the actual dot next to its name and payout removes that
 * step: the legend and the thing it explains are the same object.
 *
 * Reads PIP_TIERS / PIP_OPACITY / TIER_STYLE, the same source BingoSquare
 * paints from, so the two cannot drift.
 */

import { PIP_OPACITY, PIP_TIERS, TIER_LABEL, TIER_POINTS, TIER_STYLE } from '../../lib/bingo-utils'

export default function PipLegend() {
  return (
    <div className="flex items-center justify-center gap-4">
      {PIP_TIERS.map((tier) => (
        <span key={tier} className="flex items-center gap-1.5">
          <span
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{
              backgroundColor: TIER_STYLE[tier].text,
              opacity: PIP_OPACITY[tier as 'long_shot' | 'chaos'],
            }}
          />
          <span className="text-[11px] text-white/40">
            {TIER_LABEL[tier]}
            <span className="text-white/25"> · {TIER_POINTS[tier]}pt</span>
          </span>
        </span>
      ))}
    </div>
  )
}
