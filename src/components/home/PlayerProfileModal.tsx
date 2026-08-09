/**
 * PlayerProfileModal — bottom sheet shown when a user taps another player's avatar in chat.
 *
 * Shows a large avatar, the character name, actor, film, and a note that
 * this is the avatar the player chose to play as.
 */

import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import Avatar from '../Avatar'
import { getAvatarById } from '../../lib/avatar-utils'

interface Props {
  playerName: string
  avatarId: string
  isSelf: boolean
  onClose: () => void
}

export default function PlayerProfileModal({ playerName, avatarId, isSelf, onClose }: Props) {
  const config = getAvatarById(avatarId)
  if (!config) return null

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40"
        onClick={onClose}
      />

      {/* Sheet */}
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 360, damping: 40 }}
        className="fixed bottom-0 left-0 right-0 z-50 max-w-md mx-auto"
      >
        <div className="backdrop-blur-xl bg-ground/97 border border-white/15 rounded-t-3xl overflow-hidden pb-10">

          {/* Large image / avatar with gradient fade */}
          <div className="relative h-52 w-full flex items-center justify-center overflow-hidden">
            {config.imageUrl ? (
              <>
                <img
                  src={config.imageUrl}
                  alt={config.characterName}
                  className="w-full h-full object-cover object-top"
                />
                <div
                  className="absolute inset-0"
                  style={{ background: 'linear-gradient(to top, #080C1F 0%, #080C1Faa 25%, transparent 60%)' }}
                />
              </>
            ) : (
              <>
                {/* Fallback gradient background */}
                <div
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(135deg, ${config.colorPrimary}55 0%, ${config.colorSecondary}33 100%)`,
                  }}
                />
                <div className="relative z-10">
                  <Avatar avatarId={avatarId} size="xl" />
                </div>
                <div
                  className="absolute inset-0"
                  style={{ background: 'linear-gradient(to top, #080C1F 0%, transparent 50%)' }}
                />
              </>
            )}

            <button
              onClick={onClose}
              className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 backdrop-blur flex items-center justify-center z-20"
            >
              <X size={14} className="text-white/80" />
            </button>
          </div>

          {/* Content */}
          <div className="px-5 pt-3">
            {/* Character name + film */}
            <div className="flex items-baseline gap-2.5 mb-1">
              <h2
                className="text-2xl font-bold leading-tight"
                style={{ color: config.colorPrimary }}
              >
                {config.characterName}
              </h2>
              <span className="text-sm text-white/35 font-medium">{config.filmName}</span>
            </div>

            {/* Actor name */}
            <p className="text-sm text-white/50 mb-3">played by {config.actorName}</p>

            {/* Player attribution */}
            <div
              className="px-3.5 py-2.5 rounded-xl text-sm"
              style={{
                background: `color-mix(in srgb, ${config.colorPrimary} 10%, rgba(255,255,255,0.04))`,
                border: `1px solid color-mix(in srgb, ${config.colorPrimary} 22%, rgba(255,255,255,0.08))`,
              }}
            >
              <span className="text-white/50">
                {isSelf ? 'You are' : <><span className="text-white/80 font-semibold">{playerName}</span> is</>}
                {' '}playing as{' '}
                <span className="font-semibold" style={{ color: config.colorPrimary }}>
                  {config.characterName}
                </span>
              </span>
            </div>
          </div>
        </div>
      </motion.div>
    </>
  )
}
