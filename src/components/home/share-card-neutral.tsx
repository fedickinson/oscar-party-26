/**
 * share-card-neutral — the token layer, the ornament and the player mark that
 * the two share cards use when the room is bound to any pack but the legacy one.
 *
 * WHY LITERAL COLOR VALUES LIVE HERE AT ALL
 * The share cards are not screens. They are detached 1080x1350 nodes handed to
 * html-to-image, which clones the subtree and rasterises it through an SVG
 * foreignObject. A `var(--t-accent)` written into that clone has no guaranteed
 * cascade to resolve against, and an SVG presentation attribute carrying one is
 * not a CSS property the cloner copies at all. A token that fails to resolve
 * there does not fall back to something close — it paints black, or nothing.
 *
 * So these two surfaces resolve the token layer themselves, once per render,
 * with `getComputedStyle(document.documentElement)`: the live value of the
 * active theme, read off the same `:root` every screen reads. `TOKEN_FALLBACK`
 * below is the safety net for the one case where that read returns nothing (no
 * document, or the stylesheet not yet applied) and every entry mirrors the
 * `:root` declaration of the token that names it in `src/index.css`. The
 * stylesheet remains the source of truth; this is a copy that is only reached
 * when the stylesheet cannot be asked.
 *
 * Nothing else in the app may read from here. A component on a screen uses the
 * custom property directly, because a screen has a cascade.
 */

import AvatarMark from '../ui/AvatarMark'
import { getNeutralAvatarById } from '../../data/avatar-config'

/**
 * Literal mirrors of `:root` in `src/index.css`, keyed by the token they
 * mirror. Used only when `getComputedStyle` cannot answer. If a value here
 * disagrees with the stylesheet, the stylesheet wins and this is stale.
 */
const TOKEN_FALLBACK: Record<string, string> = {
  '--t-accent': '#8e3b2e',
  '--t-accent-light': '#c0614c',
  '--t-ground': '#1b191b',
  '--t-ground-deep': '#17161a',
  '--t-surface': 'rgba(255, 250, 238, .075)',
  '--t-text': '#eee7d8',
  '--t-text-muted': '#c8bead',
  '--t-text-dim': '#aaa08f',
  '--t-line': 'rgba(214, 205, 186, .24)',
  '--t-line-soft': 'rgba(214, 205, 186, .18)',
  '--t-line-strong': 'rgba(214, 205, 186, .48)',
  '--t-highlight': 'rgba(248, 239, 220, .22)',
  '--t-shadow': 'rgba(8, 8, 7, .60)',
  '--t-ashlar': '#a2988a',
  '--t-ashlar-deep': '#6e665b',
  '--t-basalt': '#3a3833',
  '--t-mortar': '#d6cdba',
  '--t-oak': '#5c4632',
  '--t-oak-deep': '#3e2f21',
  '--t-iron': '#4a4744',
  '--t-iron-dark': '#24231f',
  '--t-vellum': '#e2d5b9',
  '--t-vellum-light': '#f0e5cb',
  '--t-vellum-deep': '#bca982',
  '--t-ink': '#292219',
  '--t-jet': '#101014',
  '--t-jet-raised': '#1b1b20',
  '--t-madder-light': '#c0614c',
  '--t-bottle': '#2c4034',
  '--t-bottle-raised': '#3a5343',
  '--t-beacon': '#b9863f',
  '--t-beacon-light': '#d6a961',
  '--t-pending': '#c69a50',
  '--t-wax-light': '#a4513e',
}

/** The tokens the neutral cards compose with, resolved to literal values. */
export interface SharePalette {
  ground: string
  groundDeep: string
  surface: string
  text: string
  textMuted: string
  textDim: string
  accent: string
  accentLight: string
  line: string
  lineSoft: string
  lineStrong: string
  highlight: string
  shadow: string
  markFallbackField: string
  markFallbackDevice: string
  /** Resolve any other `--t-*` token; used for the neutral avatar marks. */
  token: (name: string) => string
}

/**
 * Read the live token layer. Called once per card render, in the browser, on
 * the same `document.documentElement` the app themes — so a card follows a
 * theme override rather than pinning one theme's colors.
 */
export function resolveSharePalette(): SharePalette {
  let computed: CSSStyleDeclaration | null = null
  try {
    if (typeof document !== 'undefined' && document.documentElement) {
      computed = getComputedStyle(document.documentElement)
    }
  } catch {
    computed = null
  }

  const token = (name: string): string => {
    const live = computed?.getPropertyValue(name).trim()
    if (live) return live
    return TOKEN_FALLBACK[name] ?? TOKEN_FALLBACK['--t-ashlar-deep']
  }

  return {
    ground: token('--t-ground'),
    groundDeep: token('--t-ground-deep'),
    surface: token('--t-surface'),
    text: token('--t-text'),
    textMuted: token('--t-text-muted'),
    textDim: token('--t-text-dim'),
    accent: token('--t-accent'),
    accentLight: token('--t-accent-light'),
    line: token('--t-line'),
    lineSoft: token('--t-line-soft'),
    lineStrong: token('--t-line-strong'),
    highlight: token('--t-highlight'),
    shadow: token('--t-shadow'),
    markFallbackField: token('--t-iron-dark'),
    markFallbackDevice: token('--t-ashlar'),
    token,
  }
}

/**
 * The restrained ornament: two hairlines meeting a single lozenge. It carries
 * no allegiance, names no house and belongs to no show — which is the whole
 * requirement. It replaces the heraldic motif band, the corner scrollwork, the
 * Dance mark and the wax signet on the neutral cards.
 */
export function ShareRule({
  palette,
  width = 420,
  tone,
}: {
  palette: SharePalette
  width?: number
  tone?: string
}) {
  const color = tone ?? palette.accentLight
  const half = (width - 34) / 2
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width, height: 18 }}>
      <div style={{ width: half, height: 1, background: palette.line }} />
      <div
        style={{
          width: 10,
          height: 10,
          margin: '0 12px',
          background: color,
          transform: 'rotate(45deg)',
        }}
      />
      <div style={{ width: half, height: 1, background: palette.line }} />
    </div>
  )
}

/**
 * A player's mark at share-card scale.
 *
 * The neutral marks are the canonical drawing in `AvatarMark`; the card only
 * supplies the resolved colors, because the rasteriser cannot resolve the
 * custom properties the component would otherwise emit. A player carrying an
 * id from either legacy set — a house sigil or an archived ceremony cast
 * member — gets an initial on a neutral ground rather than that set's artwork,
 * because this card is for a room that is not that show.
 */
export function SharePlayerMark({
  palette,
  avatarId,
  name,
  size,
}: {
  palette: SharePalette
  avatarId: string | null | undefined
  name: string
  size: number
}) {
  const mark = getNeutralAvatarById(avatarId)
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.22),
        overflow: 'hidden',
        background: palette.markFallbackField,
        boxShadow: `inset 0 0 0 1px ${palette.lineStrong}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {mark ? (
        <AvatarMark
          avatar={mark}
          size={size}
          colors={{
            field: palette.token(mark.fieldToken),
            device: palette.token(mark.deviceToken),
          }}
        />
      ) : (
        <span
          style={{
            fontSize: Math.round(size * 0.4),
            fontWeight: 800,
            color: palette.markFallbackDevice,
            lineHeight: 1,
          }}
        >
          {name.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  )
}
