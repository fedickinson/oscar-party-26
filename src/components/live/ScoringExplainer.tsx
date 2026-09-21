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
import { ChevronDown, Grid3x3, Swords, Target, Trophy, Users } from 'lucide-react'
import type { GameModel } from '../../types/database'
import { useShowIdentity } from '../../hooks/useShowIdentity'

interface ScoringSection {
  icon: ReactNode
  label: string
  description: string
  detail: string
}

const SECTIONS: ScoringSection[] = [
  {
    icon: <Users size={14} className="text-accent flex-shrink-0" />,
    label: 'Signature Beats',
    description: 'Your characters score when their activated beats happen — at 1.5×.',
    detail: 'You activated 3 beats per character before the episode; only those can score. Beats are priced by odds (20, 25, 35 or 45 base), so a 35-point long shot pays 53 on the board. Your dragon\'s beats are always live and pay face value. The host can also call classic events — deaths, betrayals, the throne — worth 10, 8, 6 or 4.',
  },
  {
    icon: <Target size={14} className="text-blue-400 flex-shrink-0" />,
    label: 'Collision Beats',
    description: 'Eight two-character moments that pay BOTH drafters.',
    detail: 'When a collision beat hits, each named character\'s drafter scores it — no activation needed, and it stacks on top of signature beats. Two people at the party cheering for the same shot, for different reasons.',
  },
  {
    icon: <Grid3x3 size={14} className="text-purple-400 flex-shrink-0" />,
    label: 'Bingo',
    description: 'Every marked square scores. Rarer squares score more.',
    detail: 'A square pays 1, 2, 3 or 5 points depending on how likely it was — a chaos square is worth five of a likely one. Complete a row, column or diagonal on top of that for 15, then 10, then 5 each. Marking is on your honor — tap a marked square to undo it.',
  },
  {
    icon: <Trophy size={14} className="text-accent flex-shrink-0" />,
    label: 'Total Score',
    description: 'Beats + Bingo, one leaderboard.',
    detail: 'Both games feed the same standings. A quiet draft can still win the night on a hot bingo card — and one wild beat can swing everything.',
  },
]

const CONVICTION_SECTIONS: ScoringSection[] = [
  {
    icon: <Target size={14} className="flex-shrink-0 text-[var(--t-personal-text)]" />,
    label: 'Conviction',
    description: 'Your twelve belief slots can back any authored beat on the board.',
    detail: 'A true beat pays its authored pot. One believer receives the full amount; a crowd splits it equally, with any indivisible remainder left unawarded. Your dragon is identity, not passive score.',
  },
  {
    icon: <Grid3x3 size={14} className="flex-shrink-0 text-[var(--t-text-muted)]" />,
    label: 'Bingo',
    description: 'Every approved square scores. Rarer squares score more.',
    detail: 'A square pays 1, 2, 3 or 5 points by likelihood. Completed rows, columns and diagonals add line bonuses.',
  },
  {
    icon: <Trophy size={14} className="flex-shrink-0 text-[var(--t-personal-text)]" />,
    label: 'Total Score',
    description: 'Conviction and Bingo share one leaderboard.',
    detail: 'Ties break on conviction score, then correct beliefs, then the largest belief payout that landed.',
  },
]

/**
 * Results Night on any pack but the legacy one.
 *
 * The legacy list above is a beats game: activation, collision beats, odds
 * pricing. A Results Night pack room runs none of it — its beats are inert and
 * unscored — so patching that list one sentence at a time left a player reading
 * the rules of a game they are not playing. This is the game they are playing,
 * and every number here is the one `src/lib/scoring.ts` and
 * `src/lib/bingo-utils.ts` actually apply.
 */
const PACK_ENSEMBLE_SECTIONS: ScoringSection[] = [
  {
    icon: <Target size={14} className="flex-shrink-0 text-[var(--t-personal-text)]" />,
    label: 'Confidence Picks',
    description: 'Rank every category. A call that lands pays the number you put on it.',
    detail: 'Before the show locks you spend each number from 1 up to the number of categories exactly once. A category you called right pays that number; a category you called wrong pays nothing. Where the big numbers go is the whole decision.',
  },
  {
    icon: <Users size={14} className="flex-shrink-0 text-[var(--t-accent-light)]" />,
    label: 'Draft',
    description: 'Whoever drafted the winner takes that category\'s points.',
    detail: 'Each category carries its own point value, and it goes to the player holding the winner. A winner drafted as a person pays one and a half times that value, rounded. There is nothing to activate and nothing to spend — holding them is the bet.',
  },
  {
    icon: <Grid3x3 size={14} className="flex-shrink-0 text-[var(--t-text-muted)]" />,
    label: 'Bingo',
    description: 'Every marked square scores. Rarer squares score more.',
    detail: 'A square pays 1, 2, 3 or 5 points depending on how likely it was. Your first line pays 15, your second 10, every line after that 5, and a full card 25. Marking is on your honor — tap a marked square to undo it.',
  },
  {
    icon: <Trophy size={14} className="flex-shrink-0 text-[var(--t-personal-text)]" />,
    label: 'Total Score',
    description: 'Picks + Draft + Bingo, one leaderboard.',
    detail: 'Level totals break on confidence score first, then how many calls you got right, then the biggest number you landed. Bingo is dealt rather than decided, so it never breaks a tie.',
  },
]

/**
 * The conviction detail above names the legacy pack's own pools. Only that pack
 * drafts a dragon, so every other pack gets the same rule stated in pool-neutral
 * terms rather than a sentence about content it does not have.
 */
const PACK_DETAIL_OVERRIDES: Record<string, string> = {
  'Conviction': 'A true beat pays its authored pot. One believer receives the full amount; a crowd splits it equally, with any indivisible remainder left unawarded. What you drafted is identity, not passive score.',
}

export default function ScoringExplainer({ gameModel = 'legacy_ensemble' }: { gameModel?: GameModel }) {
  const [isOpen, setIsOpen] = useState(false)
  const { identity: showIdentity } = useShowIdentity()
  const baseSections = gameModel === 'conviction_portfolio'
    ? CONVICTION_SECTIONS
    : showIdentity.isLegacy ? SECTIONS : PACK_ENSEMBLE_SECTIONS
  const sections = showIdentity.isLegacy
    ? baseSections
    : baseSections.map((section) => {
      const override = PACK_DETAIL_OVERRIDES[section.label]
      return override ? { ...section, detail: override } : section
    })

  return (
    <div className="relief-glass overflow-hidden">
      {/* Header / toggle button */}
      <motion.button
        onClick={() => setIsOpen((v) => !v)}
        whileTap={{ scale: 0.98 }}
        className="w-full flex items-center justify-between px-4 py-3.5 min-h-[44px] text-left"
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2.5">
          <Swords size={15} className="text-accent flex-shrink-0" />
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
              {sections.map((section, i) => (
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
                  Draft smart. Bet bold. Complete your card.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
