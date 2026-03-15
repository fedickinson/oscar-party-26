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
 *   20% opacity + grayscale filter + pointer-events-none. A centered overlay
 *   shows the claiming player's first name so it's immediately clear who has
 *   the avatar. Character/actor/film text is hidden for taken cards.
 *
 * UPGRADE PATH:
 *   When image assets exist, Avatar.tsx handles the swap internally.
 *   No changes needed here.
 */

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
                  ? 'border-white/5 bg-white/5 pointer-events-none'
                  : 'border-white/15 bg-white/5 hover:bg-white/10 cursor-pointer',
            ].join(' ')}
            style={isTaken ? { opacity: 0.2, filter: 'grayscale(1)' } : undefined}
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

            {/* Avatar visual */}
            <div className="flex justify-center mb-3">
              <Avatar
                avatarId={avatar.id}
                size="lg"
                emotion="neutral"
                highlighted={isSelected}
              />
            </div>

            {isTaken ? (
              /* Taken: show only who claimed it */
              <p className="text-sm font-bold leading-tight text-white/70 text-center">
                {claimedBy ?? 'Taken'}
              </p>
            ) : (
              /* Available: show full character details */
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
