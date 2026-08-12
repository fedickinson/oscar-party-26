/**
 * TabBar — fixed-height bottom navigation for the live dashboard.
 *
 * Four tabs: Bingo · Scores · Winners · My Picks
 * Active tab renders in accent with a subtle scale bump.
 * Inactive tabs render at white/50.
 *
 * Glassmorphism background matches the rest of the app.
 * pb-safe uses env(safe-area-inset-bottom) for phones with home indicators.
 */

import { motion } from 'framer-motion'
import { BarChart3, Grid3X3, House, Swords, User } from 'lucide-react'

export const TABS = [
  { id: 0, label: 'Home',     Icon: House      },
  { id: 1, label: 'Bingo',    Icon: Grid3X3    },
  { id: 2, label: 'Scores',   Icon: BarChart3  },
  // Tab 3 is the GM console for episode properties — the host authors events
  // here instead of announcing pre-known winners.
  { id: 3, label: 'Events',   Icon: Swords     },
  { id: 4, label: 'My Picks', Icon: User       },
] as const

interface Props {
  activeTab: number
  onSelect: (tab: number) => void
  /** Tab IDs that should show a notification badge dot */
  badges?: Set<number>
  /** GM console tab renders only for the host. */
  isHost?: boolean
}

export default function TabBar({ activeTab, onSelect, badges, isHost = true }: Props) {
  // The Events tab is the declare console, open to every player — anyone who
  // sees a beat happen can call it (honor system, same as bingo; undo exists).
  const tabs = TABS.filter(() => true)
  return (
    <div
      className="flex-shrink-0 relief-glass"
      style={{
        // Glass chrome, but a bar: square corners, top edge only
        borderRadius: 0,
        borderLeft: 'none',
        borderRight: 'none',
        borderBottom: 'none',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="flex h-[60px]">
        {tabs.map(({ id, label, Icon }) => {
          const isActive = activeTab === id
          const needsAttention = badges?.has(id) === true
          const hasBadge = !isActive && needsAttention
          return (
            <motion.button
              key={id}
              onClick={() => onSelect(id)}
              aria-label={needsAttention ? `${label}, needs attention` : label}
              whileTap={{ scale: 0.92 }}
              className="flex-1 flex flex-col items-center justify-center gap-0.5"
              // Active tab takes the viewer's allegiance color (personal layer),
              // not the shared event accent — matches v7.
              style={{ color: isActive ? 'var(--t-personal-text)' : undefined }}
            >
              <motion.div
                animate={{ scale: isActive ? 1.1 : 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className="relative"
              >
                <Icon
                  size={20}
                  className={isActive ? '' : 'text-white/45'}
                />
                {hasBadge && (
                  <span
                    className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-accent"
                    aria-label="New activity"
                  />
                )}
              </motion.div>
              <span
                className={[
                  'text-[10px] font-medium leading-none',
                  isActive ? '' : 'text-white/45',
                ].join(' ')}
              >
                {label}
              </span>

              {/* Active indicator dot */}
              {isActive && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+2px)] w-5 h-0.5 rounded-full"
                  style={{ background: 'var(--t-personal-device)' }}
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
