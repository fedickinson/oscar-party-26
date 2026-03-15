/**
 * TurningPoints — key moment cards with natural language descriptions.
 * Max 3-4 cards, stagger-animated on mount.
 */

import { motion } from 'framer-motion'
import { Zap, TrendingUp, ArrowUpRight, Clock } from 'lucide-react'
import type { TurningPoint } from '../../lib/timeline-utils'

interface Props {
  turningPoints: TurningPoint[]
}

// Pick an icon based on description content for variety
function getMomentIcon(description: string) {
  if (description.toLowerCase().includes('took the lead')) return TrendingUp
  if (description.toLowerCase().includes('tied') || description.toLowerCase().includes('separated')) return Clock
  if (description.toLowerCase().includes('biggest swing') || description.toLowerCase().includes('scored')) return ArrowUpRight
  return Zap
}

export default function TurningPoints({ turningPoints }: Props) {
  if (turningPoints.length === 0) return null

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-md bg-oscar-gold/10 border border-oscar-gold/20 flex items-center justify-center flex-shrink-0">
          <Zap size={11} className="text-oscar-gold/80" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wider text-white/40">Key Moments</p>
      </div>
      <div className="space-y-2">
        {turningPoints.map((tp, i) => {
          const Icon = getMomentIcon(tp.description)
          return (
            <motion.div
              key={tp.categoryIndex}
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28, delay: 0.3 + i * 0.09 }}
              className="backdrop-blur-lg border border-white/8 rounded-xl px-3.5 py-3 flex items-start gap-3"
              style={{ background: 'rgba(255,255,255,0.04)' }}
            >
              {/* Icon container with subtle color accent */}
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{
                  background: 'rgba(212,175,55,0.10)',
                  border: '1px solid rgba(212,175,55,0.22)',
                }}
              >
                <Icon size={13} className="text-oscar-gold/80" />
              </div>

              <div className="flex-1 min-w-0">
                {/* Category label */}
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[9px] font-bold text-oscar-gold/50 uppercase tracking-widest">
                    #{tp.categoryIndex}
                  </span>
                  <span className="text-[9px] text-white/25 uppercase tracking-wider truncate">
                    {tp.categoryName}
                  </span>
                </div>
                {/* Narrative */}
                <p className="text-sm text-white/75 leading-snug">{tp.description}</p>
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}
