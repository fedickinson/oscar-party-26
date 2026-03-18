/**
 * CompanionAvatar — circular gradient avatar with a custom SVG icon for each AI companion.
 *
 * SIZES:
 *   sm → 32px  (chat messages)
 *   md → 40px  (companion selector, tooltips)
 *   lg → 48px  (companion header, large displays)
 *
 * DESIGN:
 *   Each companion gets a circular container filled with a 135° linear gradient
 *   using their brand colors. A custom SVG icon sits centered inside at ~60% of
 *   the circle diameter. A subtle outer glow ring matches the companion's primary
 *   color at 20% opacity so they pop against the dark chat background.
 *
 *   Unknown IDs fall back to a plain circle with a question mark glyph.
 *
 * SVG CONVENTIONS:
 *   - All icons use viewBox="0 0 24 24" with no fixed width/height
 *   - White (#FFFFFF) fill or stroke against the colored background
 *   - Stroke icons use strokeWidth 1.5-2, fill="none"
 *   - Fill icons use fill="#FFFFFF", stroke="none"
 *   - Max ~6 path elements — detail is invisible at 32px
 */

import type { ReactNode } from 'react'

type CompanionId = 'meryl' | 'nikki' | 'will' | 'the-academy'
type CompanionSize = 'sm' | 'md' | 'lg'

interface Props {
  companionId: string
  size?: CompanionSize
}

// ─── Size map ─────────────────────────────────────────────────────────────────

const SIZE_PX: Record<CompanionSize, number> = {
  sm: 32,
  md: 40,
  lg: 48,
}

// ─── Companion brand colors ───────────────────────────────────────────────────

interface CompanionBrand {
  gradientFrom: string
  gradientTo: string
  /** Optional photo. Place file at public/companions/<id>.jpg and set this path. */
  imageUrl?: string
}

const BRANDS: Record<CompanionId, CompanionBrand> = {
  meryl: { gradientFrom: '#C9A84C', gradientTo: '#A68B3A', imageUrl: '/avatars/companions/gloria-perfume.png' },
  nikki: { gradientFrom: '#EC4899', gradientTo: '#DB2777', imageUrl: '/avatars/companions/razor-spotlight.png' },
  will: { gradientFrom: '#EAB308', gradientTo: '#CA8A04', imageUrl: '/avatars/companions/buddy-microphone.png' },
  'the-academy': { gradientFrom: '#D4AF37', gradientTo: '#B8960C', imageUrl: '/avatars/companions/academy-statuette.png' },
}

// ─── Gloria icon ─────────────────────────────────────────────────────────────
// Classic Hollywood glamour silhouette: elegant upswept hair, graceful neck,
// one confident shoulder. Profile facing right. Fully filled white shape.

function MerylIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Head */}
      <ellipse cx="13" cy="6.5" rx="2.8" ry="3" fill="#FFFFFF" />
      {/* Upswept hair — sweeping arc behind/above the head */}
      <path
        d="M10.5 5 C9 2.5 11 1 13.5 1.5 C16 2 17 4 15.5 5.5 C17 3.5 16.5 1.5 14 1 C11.5 0.5 9.5 2.5 10.5 5 Z"
        fill="#FFFFFF"
      />
      {/* Neck */}
      <rect x="12" y="9.2" width="2" height="2.2" rx="0.8" fill="#FFFFFF" />
      {/* Elegant bare shoulder / décolletage — single flowing shape */}
      <path
        d="M8.5 22 C8.5 22 8 18 9 15.5 C9.5 14 11 13 13 12.5 C15 12 16.5 12.5 17.5 14 C18.5 15.5 18 18 17.5 22 Z"
        fill="#FFFFFF"
      />
      {/* Graceful neck-to-shoulder line (left side) */}
      <path
        d="M12 11.4 C10.5 11.8 9.2 12.8 8.5 14.5"
        stroke="#FFFFFF"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}

// ─── Razor icon ───────────────────────────────────────────────────────────────
// Handheld microphone tilted ~15° right as if mid-gesture, with three small
// energy arcs radiating from the capsule top. Sharp white fill + stroke combo.

function NikkiIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Mic capsule — slightly tilted, centered slightly left */}
      <ellipse
        cx="11"
        cy="8"
        rx="3"
        ry="4"
        fill="#FFFFFF"
        transform="rotate(12, 11, 8)"
      />
      {/* Mic body / handle */}
      <path
        d="M10 12.5 L9 19 L13 19 L12 12.5"
        fill="#FFFFFF"
        stroke="none"
      />
      {/* Mic stand base */}
      <path
        d="M7.5 19 L14.5 19"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Energy arc 1 — close */}
      <path
        d="M15 5 C16 4 16 6 15 7"
        stroke="#FFFFFF"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.9"
      />
      {/* Energy arc 2 — medium */}
      <path
        d="M16.5 3.5 C18.2 2.5 18.2 7 16.5 8"
        stroke="#FFFFFF"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.65"
      />
      {/* Energy arc 3 — far, faint */}
      <path
        d="M18 2 C20.5 1 20.5 8.5 18 9.5"
        stroke="#FFFFFF"
        strokeWidth="1.5"
        strokeLinecap="round"
        fill="none"
        opacity="0.35"
      />
    </svg>
  )
}

// ─── Buddy icon ───────────────────────────────────────────────────────────────
// Hand-drawn doodle: round head, dot eyes (slightly mismatched heights for
// that confused goofy look), wavy grin, and a few messy hair spikes on top.
// White stroke only — no fill — to preserve the sketchy feel.

function WillIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Head */}
      <circle
        cx="12"
        cy="13"
        r="6.5"
        stroke="#FFFFFF"
        strokeWidth="1.8"
        fill="none"
      />
      {/* Left eye — sits slightly lower for the confused look */}
      <circle cx="9.5" cy="12.5" r="0.9" fill="#FFFFFF" />
      {/* Right eye — sits a touch higher */}
      <circle cx="14.5" cy="11.8" r="0.9" fill="#FFFFFF" />
      {/* Wavy grin */}
      <path
        d="M9 15.5 C9.8 16.8 10.8 17.2 12 16.8 C13.2 16.4 14.2 15.5 15 15.5"
        stroke="#FFFFFF"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
      {/* Messy hair spikes — three uneven lines */}
      <path
        d="M9.5 6.8 C9 5 10 4 10.5 3.5"
        stroke="#FFFFFF"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M12 6.5 C12 4.5 12.5 3.5 12.5 3"
        stroke="#FFFFFF"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M14.5 7 C15 5.2 15.8 4.5 16 3.8"
        stroke="#FFFFFF"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}

// ─── The Academy icon ─────────────────────────────────────────────────────────
// Simplified Oscar statuette silhouette — the most iconic shape, reduced to
// its essential outline: round head, angular torso/arms, flaring skirt,
// pillar, stepped base. Fully filled white shape.

function AcademyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Head */}
      <circle cx="12" cy="3.5" r="2.2" fill="#FFFFFF" />
      {/* Upper torso with outstretched arms */}
      <path
        d="M7 8.5 C8.2 7.5 10 7 12 7 C14 7 15.8 7.5 17 8.5 L15 10 L9 10 Z"
        fill="#FFFFFF"
      />
      {/* Neck connector */}
      <rect x="11" y="5.6" width="2" height="1.6" rx="0.5" fill="#FFFFFF" />
      {/* Body flaring to skirt */}
      <path
        d="M9 10 L7.5 15 L16.5 15 L15 10 Z"
        fill="#FFFFFF"
      />
      {/* Pedestal column */}
      <rect x="10.5" y="15" width="3" height="3" fill="#FFFFFF" />
      {/* Base — two stepped tiers */}
      <rect x="8" y="18" width="8" height="1.8" rx="0.5" fill="#FFFFFF" />
      <rect x="9.5" y="19.8" width="5" height="1.5" rx="0.4" fill="#FFFFFF" />
    </svg>
  )
}

// ─── Fallback icon ─────────────────────────────────────────────────────────────

function FallbackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <text
        x="12"
        y="16.5"
        textAnchor="middle"
        fontSize="14"
        fontWeight="700"
        fill="#FFFFFF"
        fontFamily="system-ui, -apple-system, sans-serif"
      >
        ?
      </text>
    </svg>
  )
}

// ─── CompanionAvatar ──────────────────────────────────────────────────────────

const ICONS: Record<CompanionId, ReactNode> = {
  meryl: <MerylIcon />,
  nikki: <NikkiIcon />,
  will: <WillIcon />,
  'the-academy': <AcademyIcon />,
}

function isCompanionId(id: string): id is CompanionId {
  return id === 'meryl' || id === 'nikki' || id === 'will' || id === 'the-academy'
}

export default function CompanionAvatar({ companionId, size = 'md' }: Props) {
  const px = SIZE_PX[size]
  // Icon container is 60% of circle diameter, centered
  const iconPx = Math.round(px * 0.6)

  const isKnown = isCompanionId(companionId)
  const brand = isKnown ? BRANDS[companionId] : { gradientFrom: '#374151', gradientTo: '#1F2937' }
  const icon = isKnown ? ICONS[companionId] : <FallbackIcon />

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
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }}
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
