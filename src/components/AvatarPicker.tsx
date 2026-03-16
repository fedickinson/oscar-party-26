/**
 * AvatarPicker — grid of selectable avatar cards fetched from Supabase.
 *
 * Each card shows the stylized Avatar SVG (lg size), the character name,
 * actor name, and film. Taken avatars are dimmed and non-interactive.
 *
 * SELECTION ANIMATION:
 *   When a card becomes selected, a gold ring expands from the avatar center
 *   via a motion.div keyed to the selected state. The card border also
 *   switches to oscar-gold.
 *
 * TAKEN AVATARS:
 *   Red glassmorphism tint (bg-red-500/15, border-red-500/30) + subtle
 *   grayscale/opacity. Layout top-to-bottom: "TAKEN BY / Name" label, then
 *   avatar circle with lock overlay, then character + film details (muted).
 *
 * UPGRADE PATH:
 *   When image assets exist, Avatar.tsx handles the swap internally.
 *   No changes needed here.
 */

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import Avatar from './Avatar'
import type { AvatarRow } from '../types/database'

interface Props {
  onSelect: (avatarId: string) => void
  selectedId: string | null
  takenIds: string[]
  /** avatarId → player name for taken avatars */
  takenBy?: Record<string, string>
}

export default function AvatarPicker({ onSelect, selectedId, takenIds, takenBy = {} }: Props) {
  const [avatars, setAvatars] = useState<AvatarRow[]>([])
  const [fetching, setFetching] = useState(true)

  useEffect(() => {
    supabase
      .from('avatars')
      .select()
      .order('character_name')
      .then(({ data }) => {
        setAvatars(data ?? [])
        setFetching(false)
      })
  }, [])

  if (fetching) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-36 rounded-xl bg-white/5 border border-white/10 animate-pulse"
          />
        ))}
      </div>
    )
  }

  if (avatars.length === 0) {
    return (
      <p className="text-white/40 text-sm text-center py-4">
        No avatars found — check that the avatars table has data.
      </p>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {avatars.map((avatar, i) => {
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
              'p-4 rounded-xl border-2 text-left transition-colors w-full relative overflow-hidden',
              isSelected
                ? 'border-oscar-gold bg-oscar-gold/8'
                : isTaken
                  ? 'border-red-500/30 bg-red-500/15 pointer-events-none cursor-not-allowed'
                  : 'border-white/15 bg-white/5 hover:bg-white/10 cursor-pointer',
            ].join(' ')}
            style={isTaken ? { opacity: 0.85, filter: 'grayscale(0.3)' } : undefined}
          >
            {/* Gold ring expands from center on selection */}
            <AnimatePresence>
              {isSelected && (
                <motion.div
                  key="ring"
                  initial={{ opacity: 0, scale: 0.4 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.4 }}
                  transition={{ type: 'spring', stiffness: 360, damping: 28 }}
                  className="absolute inset-0 rounded-[10px] border-2 border-oscar-gold pointer-events-none"
                />
              )}
            </AnimatePresence>

            {/* Taken-by label sits at the TOP, only rendered for taken cards */}
            {isTaken && (
              <div className="text-center mb-2">
                <p className="text-[10px] uppercase tracking-wider text-red-300/80 leading-none mb-0.5">
                  Taken by
                </p>
                <p className="text-sm font-bold leading-tight text-white truncate">
                  {claimedBy ?? 'Someone'}
                </p>
              </div>
            )}

            {/* Avatar visual */}
            <div className="flex justify-center mb-3 relative">
              <Avatar
                avatarId={avatar.id}
                size="lg"
                emotion="neutral"
                highlighted={isSelected}
              />
              {/* Lock overlay for taken avatars */}
              {isTaken && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-8 h-8 rounded-full bg-black/60 flex items-center justify-center">
                    <Lock size={16} className="text-white/80" />
                  </div>
                </div>
              )}
            </div>

            {/* Character details — always shown, muted red-tint for taken cards */}
            {isTaken ? (
              <>
                <p className="text-sm font-semibold leading-tight truncate text-white/50">
                  {avatar.character_name}
                </p>
                <p className="text-xs text-red-300/40 italic mt-0.5 truncate">{avatar.film_name}</p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold leading-tight truncate text-white">
                  {avatar.character_name}
                </p>
                <p className="text-xs text-white/55 mt-0.5 truncate">{avatar.actor_name}</p>
                <p className="text-xs text-white/35 italic truncate">{avatar.film_name}</p>
              </>
            )}
          </motion.button>
        )
      })}
    </div>
  )
}
