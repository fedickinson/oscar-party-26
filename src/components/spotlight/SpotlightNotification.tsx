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
import { confidenceTierLabel } from '../../lib/show-identity'
import { useShowIdentity } from '../../hooks/useShowIdentity'

interface Props {
  categoryName: string
  tier: number
  onComplete: () => void
}

export default function SpotlightNotification({ categoryName, tier, onComplete }: Props) {
  // Tier names are show copy: the legacy pack keeps its authored strings and
  // every other pack gets numbered tiers, exactly as the Confidence ladder and
  // the spotlight header resolve them.
  const { identity: showIdentity } = useShowIdentity()

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
      <div className="max-w-md mx-auto bg-ground/95 backdrop-blur-xl border border-accent/30 rounded-2xl px-4 py-3 flex items-center gap-3 shadow-lg shadow-accent/10">
        <div className="w-8 h-8 rounded-full bg-accent/15 flex items-center justify-center flex-shrink-0">
          <Sparkles size={15} className="text-accent" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-white/50 mb-0.5">Now Presenting</p>
          <p className="text-sm font-bold text-accent truncate">{categoryName}</p>
        </div>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-accent/15 text-accent/80 flex-shrink-0">
          {confidenceTierLabel(tier, showIdentity)}
        </span>
      </div>
    </motion.div>
  )
}
