/**
 * house-devices.ts — the seven heraldic devices, as raw SVG path data.
 *
 * WHY THIS IS A SHARED MODULE
 * The devices are drawn twice: once by PlayerShareCard (a React component
 * rasterised by html-to-image) and once by the standalone recap HTML (a plain
 * string with no React at all). Those two runtimes cannot share a component, so
 * the only thing they CAN share is the path data itself.
 *
 * Paths are copied verbatim from the drawings in PlayerShareCard.tsx. If a
 * device is redrawn, change it here and both surfaces follow.
 *
 * Faction assignment is presentation only — it is derived from the player's
 * chosen avatar and never touches scoring or card data, per
 * docs/design/share-cards-notes.md.
 */

export type HouseKey =
  | 'targaryen'
  | 'hightower'
  | 'stark'
  | 'lannister'
  | 'velaryon'
  | 'baratheon'
  | 'blackwood'

/** viewBox every device path is drawn against. */
export const HOUSE_DEVICE_VIEWBOX = '0 0 100 100'

export const HOUSE_DEVICE_PATHS: Record<HouseKey, string> = {
  targaryen:
    'M50 48C39 33 25 29 10 37c9 3 14 8 18 15-9-3-16 0-20 6 13 1 19 10 28 17 6 4 12 5 18 3-8-7-11-14-8-23 3-8 6-13 4-24-1-10-7-20-17-25 4 8 4 14 1 19-5-7-11-9-18-4 9 4 12 11 13 19 8-2 14 1 21 8Zm0 0c11-15 25-19 40-11-9 3-14 8-18 15 9-3 16 0 20 6-13 1-19 10-28 17-6 4-12 5-18 3 8-7 11-14 8-23-3-8-6-13-4-24 1-10 7-20 17-25-4 8-4 14-1 19 5-7 11-9 18-4-9 4-12 11-13 19-8-2-14 1-21 8Zm0 8c-12 5-18 13-16 23 2 11 12 17 22 14 10-2 15-11 12-19-2-6-7-10-13-11 4 5 4 10 0 13-5 4-11 1-11-5 0-5 3-9 6-11Z',
  hightower:
    'M24 88h52v9H24zm6-14h40l4 14H26zm6-18h28l4 18H32zm5-19h18l3 19H38zM36 29h28v10H36zm7-9h14v9H43zM50 2c3 8 11 11 8 19-2 5-6 7-8 11-2-4-8-6-8-11 0-7 5-11 8-19Z',
  stark:
    'm15 15 24 14 18-10L84 8l-7 23 12 19-16 7-7 24-17 14-19-14-9-24-12-9 13-19Zm18 31 13 5 8-4 14 5-10 7-9 14-10-14-12-6Zm2-8 9-3-5 9Zm29-3 9 5-11 3Z',
  lannister:
    'M61 8c-11 0-20 8-19 19l-13-6 3 13-13 5 15 8-10 14 15-2-3 21 13-11 8 23 7-21 17 9-7-20 16 1-13-15 12-11-18-2 5-15-15 7C76 15 70 8 61 8Zm-3 15 9 6-9 8-9-8Zm-9 26 10-7 8 9-6 11-12-2Zm6 17 8 2-4 12-8-8Z',
  velaryon:
    'M58 7c-16 3-26 16-23 31 2 9 9 14 17 17-11 2-20 11-20 22 0 9 7 16 16 16 13 0 22-11 20-23-2-9-10-15-18-15 8-4 14-11 14-20 0-7-3-12-8-16l13-3-7-5 8-6ZM36 38c-12-8-22-6-29 2 8 0 13 4 16 10-7-1-12 2-14 7 13-1 19 7 29 9l8-13c-5-3-8-8-10-15Z',
  baratheon:
    'M47 24 35 8l-4 18-17-9 8 20-15 4 20 12-7 27 21-9 9 24 9-24 21 9-7-27 20-12-15-4 8-20-17 9-4-18-12 16ZM30 45c8-12 32-16 43-1-9 0-15 3-20 10v28H43V54c-4-7-8-9-13-9Z',
  blackwood:
    'M45 93V60L31 71l5-19-22 5 16-16-20-8 25-3-8-18 20 14L50 4l4 22 19-14-8 18 25 3-20 8 16 16-22-5 5 19-14-11v33ZM17 18c5-7 12-9 20-7-5 4-7 8-7 13-5-4-9-5-13-6Zm66 0c-5-7-12-9-20-7 5 4 7 8 7 13 5-4 9-5 13-6Z',
}

/**
 * Resolves a house from an avatar id.
 *
 * Defensive by design: avatar ids are player data and an unknown or missing one
 * must still render something rather than throwing. Targaryen is the documented
 * fallback.
 */
export function houseForAvatar(avatarId: string | null | undefined): HouseKey {
  const normalized = (avatarId ?? '').toLowerCase()
  if (normalized.includes('hightower')) return 'hightower'
  if (normalized.includes('stark')) return 'stark'
  if (normalized.includes('lannister')) return 'lannister'
  if (normalized.includes('velaryon')) return 'velaryon'
  if (normalized.includes('baratheon')) return 'baratheon'
  if (normalized.includes('blackwood')) return 'blackwood'
  return 'targaryen'
}

/**
 * Which side of the Dance a house reads as.
 *
 * Hightower, Lannister and Baratheon take the Green edge; the rest take Black.
 * Mirrors the mapping documented for the share cards so a player's keepsake and
 * their share image cannot disagree about their own allegiance.
 */
export function isGreenHouse(house: HouseKey): boolean {
  return house === 'hightower' || house === 'lannister' || house === 'baratheon'
}
