const TIER_LABEL: Record<number, string> = {
  1: 'Major Award',
  2: 'Prestige Craft',
  3: 'Technical',
  4: 'Specialty',
  5: 'Short Film',
}

const TIER_COLOR: Record<number, string> = {
  1: 'bg-oscar-gold/20 text-oscar-gold',
  2: 'bg-purple-500/20 text-purple-300',
  3: 'bg-blue-500/20 text-blue-300',
  4: 'bg-emerald-500/20 text-emerald-300',
  5: 'bg-white/10 text-white/50',
}

interface Props {
  categoryName: string
  tier: number
  points: number
  state: 'suspense' | 'reveal'
}

export default function SpotlightHeader({ categoryName, tier, points, state }: Props) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-1">
        <span
          className={[
            'text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide',
            TIER_COLOR[tier] ?? 'bg-white/10 text-white/50',
          ].join(' ')}
        >
          {TIER_LABEL[tier] ?? `Tier ${tier}`}
        </span>
        <span className="text-[10px] text-oscar-gold/60">{points} pts</span>
      </div>
      <h1 className="text-xl font-bold text-white leading-tight truncate">{categoryName}</h1>
      {state === 'reveal' && (
        <p className="text-xs text-emerald-400 mt-0.5 font-medium">Winner Announced</p>
      )}
    </div>
  )
}
