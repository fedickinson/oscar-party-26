/**
 * category-icon-map — which icon an award category asks for, as a key.
 *
 * Pure: no React, no icon imports, nothing to render. `category-icons.tsx`
 * owns the key → component table and the identity read; this file owns the
 * decision, so the ordering hazards in both maps are unit-testable without
 * loading React, Supabase or the token layer.
 *
 * TWO MAPS
 * `legacy` is the 98th Academy Awards wording, unchanged, falling back to a
 * film strip. Every other pack resolves through `music`, which falls back to a
 * plain award rather than to a film. A legacy name keeps resolving to the icon
 * it always resolved to, because the legacy chain is never consulted for a
 * non-legacy room and vice versa.
 */

export type CategoryIconKey =
  // Legacy (Academy Awards)
  | 'oscar-trophy'
  | 'swords'
  | 'user'
  | 'book-open'
  | 'pen-line'
  | 'wand'
  | 'sparkles'
  | 'video'
  | 'globe'
  | 'scissors'
  | 'aperture'
  | 'music'
  | 'mic'
  | 'palette'
  | 'shirt'
  | 'volume'
  | 'film'
  // Music
  | 'trophy'
  | 'star'
  | 'sun'
  | 'disc3'
  | 'users'
  | 'clapperboard'
  | 'footprints'
  | 'audio-lines'
  | 'headphones'
  | 'drum'
  | 'guitar'
  | 'music4'
  | 'disc'
  | 'music2'
  | 'music3'
  | 'award'

/** The 98th Academy Awards chain. Order and wording are unchanged. */
function legacyKey(n: string): CategoryIconKey {
  if (n.includes('picture')) return 'oscar-trophy'
  if (n.includes('director')) return 'swords'

  // Acting — check supporting before lead
  if (n.includes('supporting') && (n.includes('actress') || n.includes('actor'))) return 'user'
  if (n.includes('actress') || n.includes('actor')) return 'user'

  // Screenplay — adapted before original to avoid substring collision
  if (n.includes('adapted')) return 'book-open'
  if (n.includes('screenplay')) return 'pen-line'

  // Animated — feature before short
  if (n.includes('animated') && n.includes('feature')) return 'wand'
  if (n.includes('animated') && n.includes('short')) return 'sparkles'
  if (n.includes('animated')) return 'wand'

  if (n.includes('documentary')) return 'video'
  if (n.includes('international')) return 'globe'

  // Technical craft
  if (n.includes('editing')) return 'scissors'
  if (n.includes('cinematography')) return 'aperture'
  if (n.includes('score')) return 'music'
  if (n.includes('song')) return 'mic'
  if (n.includes('production design')) return 'palette'
  if (n.includes('costume')) return 'shirt'
  if (n.includes('makeup') || n.includes('hairstyling')) return 'sparkles'
  if (n.includes('sound')) return 'volume'
  if (n.includes('visual effects')) return 'wand'

  // Short films — live action fallback
  if (n.includes('short')) return 'swords'

  return 'film'
}

/**
 * The music chain. Ordered so the specific wording wins: `art direction`
 * before `direction`, `new artist` before `artist of the year`, and the two
 * named song categories before the bare word.
 */
function musicKey(n: string): CategoryIconKey {
  // Top of the card
  if (n.includes('video of the year')) return 'trophy'
  if (n.includes('new artist')) return 'sparkles'
  if (n.includes('artist of the year')) return 'star'
  if (n.includes('song of summer') || n.includes('song of the summer')) return 'sun'
  if (n.includes('song of the year')) return 'music'
  if (n.includes('album')) return 'disc3'
  if (n.includes('collaboration')) return 'users'
  if (n.includes('group')) return 'users'
  if (n.includes('long form')) return 'video'

  // Craft — `art direction` must be tested before `direction`
  if (n.includes('art direction')) return 'palette'
  if (n.includes('direction')) return 'clapperboard'
  if (n.includes('choreograph')) return 'footprints'
  if (n.includes('cinematograph')) return 'aperture'
  if (n.includes('editing')) return 'scissors'
  if (n.includes('visual effects')) return 'wand'

  // Genre
  if (n.includes('k-pop') || n.includes('kpop')) return 'audio-lines'
  if (n.includes('hip-hop') || n.includes('hip hop') || n.includes('rap')) return 'mic'
  if (n.includes('r&b') || n.includes('rnb')) return 'headphones'
  if (n.includes('alternative')) return 'drum'
  if (n.includes('rock')) return 'guitar'
  if (n.includes('country')) return 'guitar'
  if (n.includes('latin')) return 'music4'
  if (n.includes('dance') || n.includes('electronic')) return 'disc'
  if (n.includes('pop')) return 'music2'
  if (n.includes('afrobeat')) return 'drum'

  // Anything else that still names a song or a video
  if (n.includes('song')) return 'music3'
  if (n.includes('video')) return 'video'

  return 'award'
}

export function categoryIconKey(name: string, isLegacy: boolean): CategoryIconKey {
  const n = name.toLowerCase()
  return isLegacy ? legacyKey(n) : musicKey(n)
}
