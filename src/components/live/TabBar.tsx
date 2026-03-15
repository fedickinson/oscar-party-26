/**
 * TabBar — fixed-height bottom navigation for the live dashboard.
 *
 * Four tabs: Bingo · Scores · Winners · My Picks
 * Active tab renders in oscar-gold with a subtle scale bump.
 * Inactive tabs render at white/50.
 *
 * Glassmorphism background matches the rest of the app.
 * pb-safe uses env(safe-area-inset-bottom) for phones with home indicators.
 */

import { motion } from 'framer-motion'
import { BarChart3, Film, Grid3X3, House, Trophy, User } from 'lucide-react'

export const TABS = [
  { id: 0, label: 'Home',     Icon: House      },
  { id: 1, label: 'Bingo',    Icon: Grid3X3    },
  { id: 2, label: 'Scores',   Icon: BarChart3  },
  { id: 3, label: 'Winners',  Icon: Trophy     },
  { id: 4, label: 'My Picks', Icon: User       },
  { id: 5, label: 'Films',    Icon: Film       },
] as const

interface Props {
  activeTab: number
  onSelect: (tab: number) => void
  /** Tab IDs that should show a notification badge dot */
  badges?: Set<number>
}

export default function TabBar({ activeTab, onSelect, badges }: Props) {
  return (
    <div
      className="flex-shrink-0 bg-black/50 backdrop-blur-xl border-t border-white/10"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex h-[60px]">
        {TABS.map(({ id, label, Icon }) => {
          const isActive = activeTab === id
          const hasBadge = !isActive && badges?.has(id)
          return (
            <motion.button
              key={id}
              onClick={() => onSelect(id)}
              whileTap={{ scale: 0.92 }}
              className="flex-1 flex flex-col items-center justify-center gap-0.5"
            >
              <motion.div
                animate={{ scale: isActive ? 1.1 : 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className="relative"
              >
                <Icon
                  size={20}
                  className={isActive ? 'text-oscar-gold' : 'text-white/45'}
                />
                {hasBadge && (
                  <span
                    className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-oscar-gold"
                    aria-label="New activity"
                  />
                )}
              </motion.div>
              <span
                className={[
                  'text-[10px] font-medium leading-none',
                  isActive ? 'text-oscar-gold' : 'text-white/45',
                ].join(' ')}
              >
                {label}
              </span>

              {/* Active indicator dot */}
              {isActive && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+2px)] w-5 h-0.5 bg-oscar-gold rounded-full"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
