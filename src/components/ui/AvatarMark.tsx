/**
 * AvatarMark — the neutral player marks, drawn inline.
 *
 * Twelve two-tone geometric devices for rooms bound to any pack but the legacy
 * one. There is no artwork: a mark is a filled ground plus one figure, both
 * resolved from the token layer, so it recolors with the theme and costs no
 * request. The legacy house sigils stay what they are — raster portraits under
 * public/avatars/player/ — and are rendered by Avatar/AvatarPicker as before.
 *
 * Squares, not circles: the parent clips to its own radius, exactly the way the
 * sigil images are clipped, so a mark drops into every existing avatar slot.
 */

import type { NeutralAvatar, NeutralAvatarShape } from '../../data/avatar-config'

interface Props {
  avatar: NeutralAvatar
  size?: number
  className?: string
  /**
   * Literal colors in place of the mark's two custom properties. Only the
   * rasterised share cards pass this: html-to-image clones the node out of the
   * document, where a `var(--t-…)` in a presentation attribute has no cascade
   * to resolve against. Every on-screen caller omits it and gets the token
   * layer, so the mark still recolors with the theme everywhere it is a screen.
   */
  colors?: { field: string; device: string }
}

function figure(shape: NeutralAvatarShape) {
  switch (shape) {
    case 'spark':
      return <path d="M12 2.5 13.9 10.1 21.5 12 13.9 13.9 12 21.5 10.1 13.9 2.5 12 10.1 10.1Z" />
    case 'waves':
      return (
        <>
          <path d="M2 9q2.5-3 5 0t5 0 5 0 5 0" fill="none" strokeWidth="1.9" />
          <path d="M2 15q2.5-3 5 0t5 0 5 0 5 0" fill="none" strokeWidth="1.9" />
        </>
      )
    case 'bars':
      return (
        <>
          <rect x="4" y="13" width="3.6" height="7.5" rx="0.6" />
          <rect x="10.2" y="7.5" width="3.6" height="13" rx="0.6" />
          <rect x="16.4" y="3.5" width="3.6" height="17" rx="0.6" />
        </>
      )
    case 'triangle':
      return <path d="M12 3.5 20.5 19.5H3.5Z" />
    case 'ring':
      return (
        <>
          <circle cx="12" cy="12" r="7.4" fill="none" strokeWidth="2.4" />
          <circle cx="12" cy="12" r="2.2" />
        </>
      )
    case 'chevron':
      return (
        <>
          <path d="M4 13.5 12 6l8 7.5" fill="none" strokeWidth="2.4" />
          <path d="M4 19.5 12 12l8 7.5" fill="none" strokeWidth="2.4" />
        </>
      )
    case 'pulse':
      return (
        <path
          d="M2 12h4.4l2.6-7 4 14 2.6-7H22"
          fill="none"
          strokeWidth="2.1"
          strokeLinejoin="round"
        />
      )
    case 'diamond':
      return <path d="M12 2.5 21.5 12 12 21.5 2.5 12Z" />
    case 'grid':
      return (
        <>
          <rect x="4" y="4" width="7" height="7" rx="1" />
          <rect x="13" y="13" width="7" height="7" rx="1" />
          <rect x="13" y="4" width="7" height="7" rx="1" fill="none" strokeWidth="1.8" />
          <rect x="4" y="13" width="7" height="7" rx="1" fill="none" strokeWidth="1.8" />
        </>
      )
    case 'arc':
      return (
        <>
          <path d="M3.5 18.5a8.5 8.5 0 0 1 17 0" fill="none" strokeWidth="2.4" />
          <path d="M3.5 18.5h17" fill="none" strokeWidth="2.4" />
        </>
      )
    case 'burst':
      return (
        <>
          <circle cx="12" cy="12" r="3" />
          <path
            d="M12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5M4.6 4.6l3.5 3.5M15.9 15.9l3.5 3.5M19.4 4.6l-3.5 3.5M8.1 15.9l-3.5 3.5"
            fill="none"
            strokeWidth="2"
          />
        </>
      )
    case 'split':
      return (
        <>
          <path d="M3.5 3.5h8.5v17H3.5Z" />
          <path d="M12 3.5h8.5v17H12Z" fill="none" strokeWidth="1.9" />
        </>
      )
  }
}

export default function AvatarMark({ avatar, size = 40, className = '', colors }: Props) {
  const field = colors?.field ?? `var(${avatar.fieldToken})`
  const device = colors?.device ?? `var(${avatar.deviceToken})`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      role="img"
      aria-label={avatar.name}
    >
      <rect width="24" height="24" fill={field} />
      <g
        fill={device}
        stroke={device}
        strokeWidth="0"
        strokeLinecap="round"
      >
        {figure(avatar.shape)}
      </g>
    </svg>
  )
}
