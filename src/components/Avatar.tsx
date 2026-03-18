/**
 * Avatar — stylized gradient avatar with character initials and emotion state.
 *
 * VISUAL DESIGN:
 *   Each avatar is a circle filled with a linear gradient derived from the
 *   character's film palette. Bold white initials are centered over it.
 *   A small icon badge in the bottom-right corner indicates the current emotion.
 *
 * EMOTION SYSTEM:
 *   The gradient angle shifts per emotion to give a subtle mood signal:
 *     neutral  → 135° (diagonal, balanced)
 *     happy    →  45° (upward, bright)
 *     sad      → 225° (downward, heavy)
 *     shocked  →   0° (vertical, stark)
 *   AnimatePresence crossfades between gradient states when emotion changes.
 *   The whole avatar bounces (scale spring) on any emotion change.
 *
 * REAL IMAGE UPGRADE PATH:
 *   When image assets land, replace the gradient div + initials with:
 *     <img src={config.imageUrl[emotion]} className="w-full h-full object-cover" />
 *   No prop changes needed — the ring, emotion badge, and animation wrapper
 *   all remain valid.
 *
 * RING:
 *   highlighted=true switches from white/20 to oscar-gold (#D4AF37).
 *   Set by the parent when this avatar is selected (e.g. AvatarPicker).
 */

import { useEffect, useRef } from 'react'
import { motion, AnimatePresence, useAnimationControls } from 'framer-motion'
import { Smile, Frown, AlertCircle } from 'lucide-react'
import { getAvatarById } from '../lib/avatar-utils'
import type { AvatarEmotion } from '../lib/avatar-utils'

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl'

interface Props {
  avatarId: string
  size?: AvatarSize
  emotion?: AvatarEmotion
  showName?: boolean
  highlighted?: boolean
  className?: string
}

const SIZES: Record<AvatarSize, number> = {
  sm: 32,
  md: 40,
  lg: 80,
  xl: 120,
}

// Gradient flows from this angle when the avatar has this emotion
const GRADIENT_ANGLE: Record<AvatarEmotion, number> = {
  neutral: 135,
  happy: 45,
  sad: 225,
  shocked: 0,
}

export default function Avatar({
  avatarId,
  size = 'md',
  emotion = 'neutral',
  showName = false,
  highlighted = false,
  className,
}: Props) {
  const config = getAvatarById(avatarId)
  const px = SIZES[size]
  const controls = useAnimationControls()
  const prevEmotion = useRef<AvatarEmotion>(emotion)

  // Scale bounce whenever emotion changes
  useEffect(() => {
    if (prevEmotion.current !== emotion) {
      prevEmotion.current = emotion
      controls.start({
        scale: [1, 1.18, 0.94, 1],
        transition: { duration: 0.38, ease: 'easeOut' },
      })
    }
  }, [emotion, controls])

  const primary = config?.colorPrimary ?? '#374151'
  const secondary = config?.colorSecondary ?? '#6B7280'
  const initials = config?.initials ?? '??'
  const angle = GRADIENT_ANGLE[emotion]

  // Icon badge scales proportionally: ~28% of avatar diameter, min 9px
  const iconPx = Math.max(9, Math.round(px * 0.28))
  // Initials font: ~33% of avatar diameter
  const fontPx = Math.round(px * 0.33)

  const ringColor = highlighted ? '#D4AF37' : 'rgba(255,255,255,0.2)'

  return (
    <motion.div
      animate={controls}
      className={className}
      style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}
    >
      {/* Avatar square with rounded corners */}
      <div
        className="relative rounded-xl flex-shrink-0"
        style={{
          width: px,
          height: px,
          boxShadow: `0 0 0 2px ${ringColor}`,
          overflow: 'hidden',
        }}
      >
        {config?.imageUrl ? (
          /* Photo — fills the circle, cropped from top (faces) */
          <img
            src={config.imageUrl}
            alt={config.characterName}
            className="absolute inset-0 w-full h-full object-cover object-top"
          />
        ) : (
          <>
            {/* Gradient layer — crossfades on emotion change */}
            <AnimatePresence initial={false}>
              <motion.div
                key={`${avatarId}-${emotion}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.28 }}
                className="absolute inset-0"
                style={{
                  background: `linear-gradient(${angle}deg, ${primary} 0%, ${secondary} 100%)`,
                }}
              />
            </AnimatePresence>

            {/* Initials */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span
                style={{
                  fontSize: fontPx,
                  fontWeight: 700,
                  color: '#ffffff',
                  letterSpacing: '0.04em',
                  lineHeight: 1,
                  textShadow: '0 1px 4px rgba(0,0,0,0.45)',
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  userSelect: 'none',
                }}
              >
                {initials}
              </span>
            </div>
          </>
        )}

        {/* Emotion badge — bottom-right corner */}
        {emotion !== 'neutral' && (
          <div
            className="absolute bottom-0 right-0 bg-black/65 rounded-full flex items-center justify-center"
            style={{ width: iconPx + 4, height: iconPx + 4 }}
          >
            {emotion === 'happy' && (
              <Smile size={iconPx} className="text-emerald-400" />
            )}
            {emotion === 'sad' && (
              <Frown size={iconPx} className="text-blue-400" />
            )}
            {emotion === 'shocked' && (
              <AlertCircle size={iconPx} className="text-yellow-400" />
            )}
          </div>
        )}
      </div>

      {/* Optional character name label */}
      {showName && config && (
        <p
          className="text-xs text-white/65 text-center mt-1.5 leading-tight"
          style={{ maxWidth: px, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {config.characterName}
        </p>
      )}
    </motion.div>
  )
}
