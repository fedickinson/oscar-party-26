/**
 * SpotlightNotification — "lights dimming" banner that appears on any tab
 * when the host opens a category spotlight.
 *
 * Fixed at the top of the screen (z-40), slides in with spring,
 * auto-dismisses after 2.5s and calls onComplete (which switches to Home tab).
 */

import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'

const TIER_LABEL: Record<number, string> = {
  1: 'Major Award',
  2: 'Prestige Craft',
  3: 'Technical',
  4: 'Specialty',
  5: 'Short Film',
}

interface Props {
  categoryName: string
  tier: number
  onComplete: () => void
}

export default function SpotlightNotification({ categoryName, tier, onComplete }: Props) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 2500)
    return () => clearTimeout(timer)
  }, [onComplete])

  return (
    <motion.div
      initial={{ y: -80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: -80, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="fixed top-0 left-0 right-0 z-40 px-4 pt-2"
    >
      <div className="max-w-md mx-auto bg-deep-navy/95 backdrop-blur-xl border border-oscar-gold/30 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-lg shadow-oscar-gold/10">
        <div className="w-8 h-8 rounded-full bg-oscar-gold/15 flex items-center justify-center flex-shrink-0">
          <Sparkles size={15} className="text-oscar-gold" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-white/50 mb-0.5">Now Presenting</p>
          <p className="text-sm font-bold text-oscar-gold truncate">{categoryName}</p>
        </div>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-oscar-gold/15 text-oscar-gold/80 flex-shrink-0">
          {TIER_LABEL[tier] ?? `Tier ${tier}`}
        </span>
      </div>
    </motion.div>
  )
}
