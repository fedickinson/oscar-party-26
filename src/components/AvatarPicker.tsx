/**
 * AvatarPicker — grid of selectable avatar cards from static PLAYER_AVATARS config.
 *
 * Each card shows the square character image with rounded corners, the character
 * name (e.g. "The Director"), and the object name smaller (e.g. "Clapperboard").
 * Selected avatar gets a 2px oscar-gold border. Character accent color appears as a small dot next to the name.
 * Taken avatars are greyed out (opacity-50) and non-interactive.
 */

import { motion } from 'framer-motion'
import { Lock } from 'lucide-react'
import { PLAYER_AVATARS } from '../data/avatar-config'

interface Props {
  onSelect: (avatarId: string) => void
  selectedId: string | null
  takenIds: string[]
  /** avatarId → player name for taken avatars */
  takenBy?: Record<string, string>
}

export default function AvatarPicker({ onSelect, selectedId, takenIds, takenBy = {} }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {PLAYER_AVATARS.map((avatar, i) => {
        const isTaken = takenIds.includes(avatar.id) && avatar.id !== selectedId
        const isSelected = avatar.id === selectedId
        const claimedBy = takenBy[avatar.id]

        return (
          <motion.button
            key={avatar.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.04, duration: 0.18, ease: 'easeOut' }}
            whileTap={!isTaken ? { scale: 0.96 } : undefined}
            onClick={() => !isTaken && onSelect(avatar.id)}
            disabled={isTaken}
            className={[
              'p-3 rounded-xl border-2 text-left transition-colors w-full relative overflow-hidden flex flex-col items-center gap-2',
              isTaken
                ? 'border-white/10 bg-white/5 pointer-events-none cursor-not-allowed'
                : 'bg-white/5 hover:bg-white/8 cursor-pointer',
            ].join(' ')}
            style={{
              borderColor: isSelected ? '#D4AF37' : isTaken ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.15)',
              opacity: isTaken ? 0.5 : 1,
            }}
          >

            {/* Avatar image — 80x80 square with rounded corners */}
            <div className="relative">
              <div
                className="rounded-xl overflow-hidden flex-shrink-0"
                style={{ width: 80, height: 80, background: `${avatar.color}22` }}
              >
                <img
                  src={avatar.image}
                  alt={avatar.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    // Fallback to color block if image missing
                    e.currentTarget.style.display = 'none'
                  }}
                />
              </div>
              {/* Lock overlay for taken avatars */}
              {isTaken && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center">
                    <Lock size={16} className="text-white/80" />
                  </div>
                </div>
              )}
            </div>

            {/* Taken-by label */}
            {isTaken && claimedBy && (
              <div className="text-center">
                <p className="text-[10px] uppercase tracking-wider text-white/40 leading-none mb-0.5">
                  Taken by
                </p>
                <p className="text-sm font-bold leading-tight text-white/50 truncate w-full">
                  {claimedBy}
                </p>
              </div>
            )}

            {/* Character details */}
            {!isTaken && (
              <div className="text-center w-full">
                <div className="flex items-center justify-center gap-1.5">
                  <span
                    className="rounded-full flex-shrink-0"
                    style={{ width: 8, height: 8, background: avatar.color }}
                  />
                  <p className="text-sm font-bold leading-tight truncate text-white">
                    {avatar.name}
                  </p>
                </div>
                <p className="text-xs text-white/45 mt-0.5 truncate">{avatar.object}</p>
              </div>
            )}

            {isTaken && !claimedBy && (
              <div className="text-center w-full">
                <p className="text-sm font-semibold leading-tight truncate text-white/50">
                  {avatar.name}
                </p>
                <p className="text-xs text-white/30 mt-0.5 truncate">{avatar.object}</p>
              </div>
            )}
          </motion.button>
        )
      })}
    </div>
  )
}
