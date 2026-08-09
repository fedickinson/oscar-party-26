/**
 * CompanionAvatar — gradient tile with the companion's monogram.
 *
 * SIZES:
 *   sm → 32px  (chat messages)
 *   md → 40px  (companion selector, tooltips)
 *   lg → 48px  (companion header, large displays)
 *
 * DESIGN:
 *   Each companion gets a rounded tile filled with a 135° linear gradient in
 *   their own colours, with their initial centred inside. A subtle outer glow
 *   ring matches the primary colour so they pop against the dark chat panel.
 *
 *   Unknown IDs fall back to a plain tile with a question mark.
 *
 * Colours and the cast list come from data/ai-companions.ts — do not hardcode
 * companion ids or brand colours in this file.
 */

import { AI_COMPANIONS, isCompanionId } from '../../data/ai-companions'
type CompanionSize = 'sm' | 'md' | 'lg' | 'xl'

interface Props {
  companionId: string
  size?: CompanionSize
}

// ─── Size map ─────────────────────────────────────────────────────────────────

const SIZE_PX: Record<CompanionSize, number> = {
  sm: 32,
  md: 40,
  lg: 48,
  xl: 56,
}

// ─── Companion brand colors ───────────────────────────────────────────────────

interface CompanionBrand {
  gradientFrom: string
  gradientTo: string
  /** Optional photo. Place file at public/companions/<id>.jpg and set this path. */
  imageUrl?: string
  /** CSS objectPosition for cropping the photo toward the subject's face. */
  imagePosition?: string
}

// Gradients are derived from the cast config so the avatar, the chat bubble and
// the profile modal can never drift apart. Portraits are face-centered square
// crops cut from the source screenshots (see .private/source-screenshots) —
// centering is baked into the ASSET, not nudged per-consumer with CSS, so the
// default objectPosition of 'center' is already right everywhere they render.
const BRANDS: Record<string, CompanionBrand> = Object.fromEntries(
  AI_COMPANIONS.map((c) => [
    c.id,
    {
      gradientFrom: c.colorPrimary,
      gradientTo: c.colorSecondary,
      imageUrl: `/avatars/companions/${c.id}.webp`,
    },
  ]),
)

// A monogram stands in for per-character art. Seven bespoke SVGs would be seven
// things to redraw the next time the cast changes; the initial plus the
// character's own gradient is already unambiguous at every size we render.

function Monogram({ id, px }: { id: string; px: number }) {
  const letter = (AI_COMPANIONS.find((c) => c.id === id)?.name ?? '?').charAt(0)
  return <Glyph char={letter} px={px} />
}

/** Shown for a player_id that isn't a known companion. */
function FallbackIcon({ px }: { px: number }) {
  return <Glyph char="?" px={px} />
}

function Glyph({ char, px }: { char: string; px: number }) {
  return (
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
        fontSize: Math.round(px * 0.42),
        fontWeight: 700,
        color: 'rgba(255,255,255,0.92)',
        lineHeight: 1,
        letterSpacing: '0.02em',
      }}
    >
      {char}
    </span>
  )
}

export default function CompanionAvatar({ companionId, size = 'md' }: Props) {
  const px = SIZE_PX[size]
  // Icon container is 60% of circle diameter, centered
  const iconPx = Math.round(px * 0.6)

  const isKnown = isCompanionId(companionId)
  const brand = isKnown ? BRANDS[companionId] : { gradientFrom: '#374151', gradientTo: '#1F2937' }
  const icon = isKnown ? <Monogram id={companionId} px={px} /> : <FallbackIcon px={px} />

  // Unique gradient ID per companion + size to avoid SVG defs collisions when
  // multiple CompanionAvatars render simultaneously on the same page.
  const gradientId = `companion-grad-${companionId}-${size}`

  return (
    <div
      style={{
        width: px,
        height: px,
        borderRadius: '12px',
        flexShrink: 0,
        position: 'relative',
        boxShadow: `0 0 0 1.5px ${brand.gradientFrom}33, 0 2px 8px ${brand.gradientFrom}22`,
        overflow: 'hidden',
      }}
    >
      {brand.imageUrl ? (
        /* Photo — fills the circle, cropped from top (faces) */
        <img
          src={brand.imageUrl}
          alt={companionId}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: brand.imagePosition ?? 'center' }}
        />
      ) : (
        <>
          {/* Gradient background via inline SVG to avoid global CSS defs pollution */}
          <svg
            width={px}
            height={px}
            viewBox={`0 0 ${px} ${px}`}
            style={{ position: 'absolute', inset: 0 }}
            aria-hidden="true"
          >
            <defs>
              <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor={brand.gradientFrom} />
                <stop offset="100%" stopColor={brand.gradientTo} />
              </linearGradient>
            </defs>
            <rect width={px} height={px} fill={`url(#${gradientId})`} />
          </svg>

          {/* Icon — centered inside the circle */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div style={{ width: iconPx, height: iconPx }}>
              {icon}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
