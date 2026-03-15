/**
 * film-icons.tsx — maps nominated film titles to thematic SVG icons.
 *
 * Usage:
 *   <FilmIcon filmName="Sinners" size={16} className="text-oscar-gold" />
 *
 * Pattern-matched on lowercased title. Falls back to a generic Clapperboard
 * for unknown titles.
 *
 * Films covered (98th Academy Awards nominees):
 *   Sinners · One Battle After Another · Marty Supreme · Hamnet
 *   Frankenstein · Sentimental Value · Bugonia · F1
 *   Train Dreams · The Secret Agent · KPop Demon Hunters
 */

import type { ReactNode } from 'react'
import { Clapperboard } from 'lucide-react'

interface FilmIconProps {
  filmName: string
  size?: number
  className?: string
}

// ─── Shared SVG wrapper ────────────────────────────────────────────────────────

function Svg({
  size = 24,
  className = '',
  children,
}: {
  size?: number
  className?: string
  children: ReactNode
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {children}
    </svg>
  )
}

// ─── Film icons ────────────────────────────────────────────────────────────────

// Sinners — electric guitar: neck, headstock, body, sound hole
function Guitar({ size, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      {/* Neck */}
      <line x1="12" y1="2" x2="12" y2="13" />
      {/* Headstock */}
      <line x1="10" y1="2" x2="14" y2="2" />
      {/* Tuning pegs */}
      <circle cx="9.5" cy="2" r="0.75" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="2" r="0.75" fill="currentColor" stroke="none" />
      {/* Body */}
      <ellipse cx="12" cy="18" rx="5" ry="4" />
      {/* Sound hole */}
      <circle cx="12" cy="18" r="1.5" />
    </Svg>
  )
}

// One Battle After Another — shield with X (revolutionary conflict)
function ShieldBattle({ size, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      {/* Shield */}
      <path d="M12 3 L20 6.5 L20 14 C20 18.5 16.5 21.5 12 22.5 C7.5 21.5 4 18.5 4 14 L4 6.5 Z" />
      {/* Crossed lines inside */}
      <line x1="9" y1="10" x2="15" y2="16" />
      <line x1="15" y1="10" x2="9" y2="16" />
    </Svg>
  )
}

// Marty Supreme — ping pong paddle with center line and ball
function PingPong({ size, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      {/* Paddle face */}
      <circle cx="11" cy="10" r="6" />
      {/* Center line dividing rubber */}
      <line x1="11" y1="4" x2="11" y2="16" />
      {/* Handle (thicker) */}
      <path d="M14.5 14 L19 20" strokeWidth="2.5" />
      {/* Ball */}
      <circle cx="20" cy="5" r="2" />
    </Svg>
  )
}

// Hamnet — feather quill pen (vanes + shaft + split nib)
function Quill({ size, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      {/* Right vane */}
      <path d="M18 2 C20.5 7 16 12 7 21" />
      {/* Left vane */}
      <path d="M18 2 C14 5 10 10 7 21" />
      {/* Center shaft */}
      <line x1="18" y1="2" x2="7" y2="21" />
      {/* Split nib */}
      <path d="M7 21 L5 23" />
      <path d="M7 21 L9.5 22" />
    </Svg>
  )
}

// Frankenstein — flat-top monster head with slit eyes and neck bolts
function MonsterHead({ size, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      {/* Flat-top head, rounded chin */}
      <path d="M6 2 L18 2 L18 14 Q18 20 12 20 Q6 20 6 14 Z" />
      {/* Slit eyes */}
      <line x1="8" y1="9" x2="10.5" y2="9" />
      <line x1="13.5" y1="9" x2="16" y2="9" />
      {/* Neck bolts */}
      <line x1="3" y1="13" x2="6" y2="13" />
      <line x1="18" y1="13" x2="21" y2="13" />
      {/* Forehead scar */}
      <line x1="10" y1="3.5" x2="14" y2="3.5" />
    </Svg>
  )
}

// Sentimental Value — picture frame with heart inside
function FrameHeart({ size, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      {/* Outer frame */}
      <rect x="3" y="3" width="18" height="18" rx="2" />
      {/* Inner frame */}
      <rect x="6.5" y="6.5" width="11" height="11" rx="1" />
      {/* Heart */}
      <path d="M12 16 C9 14 7.5 12 7.5 10.5 C7.5 9 8.5 8 10 8.5 C11 8.8 12 9.5 12 9.5 C12 9.5 13 8.8 14 8.5 C15.5 8 16.5 9 16.5 10.5 C16.5 12 15 14 12 16 Z" />
    </Svg>
  )
}

// Bugonia — flying saucer with dome, porthole windows, and tractor beam
function Saucer({ size, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      {/* Dome */}
      <path d="M9 12 C9 9 10.3 8 12 8 C13.7 8 15 9 15 12" />
      {/* Saucer disc */}
      <ellipse cx="12" cy="13" rx="8" ry="2.5" />
      {/* Tractor beam */}
      <line x1="9" y1="15.5" x2="7" y2="20" />
      <line x1="12" y1="15.5" x2="12" y2="20" />
      <line x1="15" y1="15.5" x2="17" y2="20" />
      {/* Porthole windows */}
      <circle cx="9.5" cy="13" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="13" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="13" r="1" fill="currentColor" stroke="none" />
    </Svg>
  )
}

// F1 — three-spoke steering wheel
function SteeringWheel({ size, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      {/* Outer ring */}
      <circle cx="12" cy="12" r="9" />
      {/* Center hub */}
      <circle cx="12" cy="12" r="2" />
      {/* Spokes at 0°, 120°, 240° (measured clockwise from top) */}
      <line x1="12" y1="10" x2="12" y2="3" />
      <line x1="13.7" y1="13" x2="19.8" y2="16.5" />
      <line x1="10.3" y1="13" x2="4.2" y2="16.5" />
    </Svg>
  )
}

// Train Dreams — steam locomotive side view: body, chimney, cab, wheels, rail
function Locomotive({ size, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      {/* Rail */}
      <line x1="2" y1="21" x2="22" y2="21" />
      {/* Boiler / body */}
      <rect x="3" y="12" width="12" height="5" rx="1" />
      {/* Chimney stack */}
      <rect x="5" y="8" width="3" height="4" rx="1" />
      {/* Cab */}
      <rect x="15" y="9" width="5" height="8" rx="0.5" />
      {/* Drive wheels */}
      <circle cx="8" cy="18.5" r="2.5" />
      <circle cx="13" cy="18.5" r="2.5" />
      {/* Front pony wheel */}
      <circle cx="4" cy="19.5" r="1.5" />
    </Svg>
  )
}

// The Secret Agent — magnifying glass with eye inside (surveillance)
function SpyGlass({ size, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      {/* Lens */}
      <circle cx="10" cy="10" r="6" />
      {/* Handle */}
      <line x1="14.2" y1="14.2" x2="20" y2="20" />
      {/* Eye shape inside lens */}
      <path d="M7 10 C8 7.5 12 7.5 13 10 C12 12.5 8 12.5 7 10 Z" />
      {/* Pupil */}
      <circle cx="10" cy="10" r="1.5" fill="currentColor" stroke="none" />
    </Svg>
  )
}

// KPop Demon Hunters — microphone with curled demon horns
function DemonMic({ size, className }: { size?: number; className?: string }) {
  return (
    <Svg size={size} className={className}>
      {/* Mic capsule (pill shape) */}
      <rect x="9" y="5" width="6" height="8" rx="3" />
      {/* Handle */}
      <line x1="12" y1="13" x2="12" y2="19" />
      {/* Stand base */}
      <line x1="9" y1="19" x2="15" y2="19" />
      {/* Left horn */}
      <path d="M9.5 6 C8 3.5 5.5 3.5 5.5 5.5" />
      {/* Right horn */}
      <path d="M14.5 6 C16 3.5 18.5 3.5 18.5 5.5" />
    </Svg>
  )
}

// ─── Resolver ──────────────────────────────────────────────────────────────────

type FilmIconComponent = (props: { size?: number; className?: string }) => JSX.Element

function resolveFilmIcon(name: string): FilmIconComponent {
  const n = name.toLowerCase().trim()

  if (n.includes('sinners')) return Guitar
  if (n.includes('one battle')) return ShieldBattle
  if (n.includes('marty')) return PingPong
  if (n.includes('hamnet')) return Quill
  if (n.includes('frankenstein')) return MonsterHead
  if (n.includes('sentimental')) return FrameHeart
  if (n.includes('bugonia')) return Saucer
  if (n === 'f1' || n.startsWith('f1 ')) return SteeringWheel
  if (n.includes('train dream')) return Locomotive
  if (n.includes('secret agent')) return SpyGlass
  if (n.includes('kpop') || n.includes('k-pop') || n.includes('demon hunter')) return DemonMic

  return ({ size, className }) => <Clapperboard size={size} className={className} />
}

export function FilmIcon({ filmName, size = 16, className = '' }: FilmIconProps) {
  const Icon = resolveFilmIcon(filmName)
  return <Icon size={size} className={className} />
}
