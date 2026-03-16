/**
 * ScoringExplainer — collapsible "How Scoring Works" quick-reference widget.
 *
 * Collapsed by default. Tap the header to expand/collapse.
 * Uses AnimatePresence for smooth height animation.
 * Placed at the top of ScoresTab, above the leaderboard.
 */

import type { ReactNode } from 'react'
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Film, Grid3x3, Target, Trophy, Users } from 'lucide-react'

interface ScoringSection {
  icon: ReactNode
  label: string
  description: string
  detail: string
}

const SECTIONS: ScoringSection[] = [
  {
    icon: <Users size={14} className="text-oscar-gold flex-shrink-0" />,
    label: 'Ensemble Draft',
    description: 'Drafted a person who wins? Earn 1.5× that category\'s points.',
    detail: 'Drafted a film? You earn face-value points for any technical category that film wins where no individual person was drafted (Makeup, Sound, Costume, etc.).',
  },
  {
    icon: <Target size={14} className="text-blue-400 flex-shrink-0" />,
    label: 'Prestige Picks',
    description: 'Correct pick = your confidence number as points (1–24).',
    detail: 'Each confidence number is used exactly once. Higher confidence on a correct pick = higher reward. Wrong pick = zero points, no penalty.',
  },
  {
    icon: <Grid3x3 size={14} className="text-purple-400 flex-shrink-0" />,
    label: 'Bingo',
    description: 'Approved bingo squares earn points per completed line.',
    detail: 'Complete a row, column, or diagonal on your 5×5 card. Each new bingo adds to your score. Squares need host approval unless they\'re objective.',
  },
  {
    icon: <Trophy size={14} className="text-oscar-gold flex-shrink-0" />,
    label: 'Total Score',
    description: 'Ensemble + Prestige + Bingo.',
    detail: 'All three games contribute to one unified leaderboard. Every category matters — even if you didn\'t draft anyone, a correct Prestige Pick still scores.',
  },
]

export default function ScoringExplainer() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl overflow-hidden">
      {/* Header / toggle button */}
      <motion.button
        onClick={() => setIsOpen((v) => !v)}
        whileTap={{ scale: 0.98 }}
        className="w-full flex items-center justify-between px-4 py-3.5 min-h-[44px] text-left"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2.5">
          <Film size={15} className="text-oscar-gold flex-shrink-0" />
          <span className="text-sm font-semibold text-white/80">How scoring works</span>
        </div>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
        >
          <ChevronDown size={16} className="text-white/40" />
        </motion.div>
      </motion.button>

      {/* Expandable body */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 space-y-3 border-t border-white/8">
              {SECTIONS.map((section, i) => (
                <motion.div
                  key={section.label}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.18 }}
                  className="flex gap-3"
                >
                  {/* Icon badge */}
                  <div className="w-7 h-7 rounded-lg bg-white/6 border border-white/8 flex items-center justify-center flex-shrink-0 mt-0.5">
                    {section.icon}
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-white leading-snug">
                      {section.label}
                    </p>
                    <p className="text-xs text-white/55 mt-0.5 leading-relaxed">
                      {section.description}
                    </p>
                    <p className="text-[11px] text-white/30 mt-1 leading-relaxed">
                      {section.detail}
                    </p>
                  </div>
                </motion.div>
              ))}

              {/* Divider + tagline */}
              <div className="pt-1 border-t border-white/6">
                <p className="text-[11px] text-white/25 text-center leading-relaxed">
                  Draft smart. Pick bold. Complete your card.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
