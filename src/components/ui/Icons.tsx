/**
 * Icons.tsx — custom SVG components for app-specific symbols.
 *
 * These are the icons lucide-react doesn't cover. Every icon:
 *   - 24×24 viewBox (matches lucide sizing)
 *   - stroke="currentColor" by default (inherits text color)
 *   - strokeWidth 1.5 (matches lucide's default weight)
 *   - fill="none" unless a filled variant is semantically appropriate
 *   - Accepts size and className props
 *
 * For lucide icons, import directly:
 *   import { Trophy, Crown, Clapperboard } from 'lucide-react'
 */

interface IconProps {
  size?: number
  className?: string
}

// ─── OscarTrophy ──────────────────────────────────────────────────────────────
// Stylized Oscar statuette: round head, narrow body, wide skirt, column, base.

export function OscarTrophy({ size = 24, className = '' }: IconProps) {
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
      {/* Head */}
      <circle cx="12" cy="3.75" r="2" />
      {/* Neck + upper torso */}
      <path d="M10.5 5.75 C10.5 5.75 9.5 6.5 9.5 8 L14.5 8 C14.5 6.5 13.5 5.75 13.5 5.75" />
      {/* Outstretched arms */}
      <path d="M7 7.5 C8 7 9 7.5 9.5 8" />
      <path d="M16.5 8 C17 7.5 17.5 7 18 7.5" />
      {/* Lower body / skirt widening to base */}
      <path d="M9.5 8 L8.5 12.5 L15.5 12.5 L14.5 8 Z" />
      {/* Pedestal column */}
      <rect x="11" y="12.5" width="2" height="3" />
      {/* Plinth base */}
      <rect x="7.5" y="15.5" width="9" height="2.5" rx="1" />
    </svg>
  )
}

// ─── FilmReel ─────────────────────────────────────────────────────────────────
// Classic film reel with outer ring, center hub, and three sprocket holes.

export function FilmReel({ size = 24, className = '' }: IconProps) {
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
      {/* Outer ring */}
      <circle cx="12" cy="12" r="9" />
      {/* Center hub */}
      <circle cx="12" cy="12" r="2.5" />
      {/* Three sprocket holes at 30°, 150°, 270° */}
      <circle cx="12" cy="6.5" r="1.25" />
      <circle cx="17.3" cy="14.75" r="1.25" />
      <circle cx="6.7" cy="14.75" r="1.25" />
      {/* Spoke lines from hub to holes */}
      <line x1="12" y1="9.5" x2="12" y2="7.75" />
      <line x1="14.17" y1="13.33" x2="15.62" y2="14.15" />
      <line x1="9.83" y1="13.33" x2="8.38" y2="14.15" />
    </svg>
  )
}

// ─── PersonStar ───────────────────────────────────────────────────────────────
// Person silhouette with a small star badge — indicates a nominated individual.

export function PersonStar({ size = 24, className = '' }: IconProps) {
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
      {/* Head */}
      <circle cx="9" cy="6" r="3" />
      {/* Body / shoulders */}
      <path d="M3 20 C3 16 5.5 13.5 9 13.5 C10.5 13.5 11.8 14 12.8 14.9" />
      {/* Star badge (top-right corner) */}
      <path
        d="M18 9 L18.9 12 L22 12 L19.6 13.8 L20.5 16.8 L18 15 L15.5 16.8 L16.4 13.8 L14 12 L17.1 12 Z"
        strokeWidth="1.25"
      />
    </svg>
  )
}

// ─── BingoStar ────────────────────────────────────────────────────────────────
// Five-pointed star, filled — awarded when bingo squares are confirmed.

export function BingoStar({ size = 24, className = '' }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      className={className}
    >
      <path d="M12 2 L14.4 9.3 L22 9.3 L16 13.9 L18.2 21.2 L12 16.6 L5.8 21.2 L8 13.9 L2 9.3 L9.6 9.3 Z" />
    </svg>
  )
}

// ─── CrownIcon ────────────────────────────────────────────────────────────────
// Three-pointed crown — for leaderboard #1 and host indicators.
// (A custom version distinct from lucide's Crown for this app's aesthetic.)

export function CrownIcon({ size = 24, className = '' }: IconProps) {
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
      {/* Crown outline: left base → left spike → center tall spike → right spike → right base */}
      <path d="M4 17 L4 9 L8.5 13 L12 5 L15.5 13 L20 9 L20 17 Z" />
      {/* Base band */}
      <line x1="4" y1="20" x2="20" y2="20" />
      {/* Three gem dots at tips */}
      <circle cx="4" cy="9" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="5" r="1" fill="currentColor" stroke="none" />
      <circle cx="20" cy="9" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}


// ─── DraftPick ────────────────────────────────────────────────────────────────
// An index-finger cursor pointing at a card — draft selection gesture.

export function DraftPick({ size = 24, className = '' }: IconProps) {
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
      {/* Card being selected */}
      <rect x="3" y="4" width="9" height="12" rx="1.5" />
      {/* Pointing hand */}
      {/* Index finger extended up */}
      <path d="M18 14 L18 9 C18 8.4 17.6 8 17 8 C16.4 8 16 8.4 16 9 L16 12" />
      {/* Palm + curled fingers */}
      <path d="M16 12 C16 12 14 12 14 14 L14 17 C14 18.7 15.3 20 17 20 C18.7 20 20 18.7 20 17 L20 13.5 C20 12.7 19.3 12 18.5 12 C18.2 12 18 12 18 14" />
    </svg>
  )
}
