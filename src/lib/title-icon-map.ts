/**
 * title-icon-map — which device a title asks for, as a key.
 *
 * Pure: no React, no SVG. `film-icons.tsx` owns the key → component table and
 * the identity read; this file owns the decision.
 *
 * THE HERALDRY IS LEGACY-ONLY
 * Every legacy key below is either Westerosi or a 98th Academy Awards nominee,
 * and so is the old fallback — a heraldic shield, which is why a VMA nominee
 * rendered behind one. A room bound to any other pack short-circuits to one
 * quiet music mark before a single substring is tested, so no artist can be
 * handed a dragon by an accidental match.
 */

export type TitleIconKey =
  | 'neutral'
  | 'dragon-head'
  | 'green-crown'
  | 'melted-tower'
  | 'dragon-egg'
  | 'device-targaryen'
  | 'device-hightower'
  | 'device-velaryon'
  | 'device-stark'
  | 'device-lannister'
  | 'device-baratheon'
  | 'device-blackwood'
  | 'guitar'
  | 'shield-battle'
  | 'ping-pong'
  | 'quill'
  | 'monster-head'
  | 'frame-heart'
  | 'saucer'
  | 'steering-wheel'
  | 'locomotive'
  | 'spy-glass'
  | 'demon-mic'
  | 'heraldic-shield'

const DRAGON_NAMES = new Set([
  'caraxes', 'vermithor', 'vhagar', 'tessarion', 'sunfyre', 'seasmoke',
  'silverwing', 'dreamfyre', 'sheepstealer', 'moondancer', 'syrax',
])

export function titleIconKey(name: string, isLegacy: boolean): TitleIconKey {
  if (!isLegacy) return 'neutral'

  const n = name.toLowerCase().trim()

  // Dragons by name
  if (DRAGON_NAMES.has(n)) return 'dragon-head'

  // Houses and faction groups (nominees.film_name)
  if (n === 'the blacks') return 'device-targaryen'
  if (n === 'the greens') return 'green-crown'
  if (n.includes('hightower')) return 'device-hightower'
  if (n.includes('velaryon')) return 'device-velaryon'
  if (n === 'harrenhal') return 'melted-tower'
  if (n.includes('dragonseed')) return 'dragon-egg'
  if (n.includes('north') || n.includes('riverland')) return 'device-stark'
  if (n.includes('stark')) return 'device-stark'
  if (n.includes('lannister')) return 'device-lannister'
  if (n.includes('baratheon')) return 'device-baratheon'
  if (n.includes('blackwood')) return 'device-blackwood'
  if (n.includes('targaryen')) return 'device-targaryen'

  if (n.includes('sinners')) return 'guitar'
  if (n.includes('one battle')) return 'shield-battle'
  if (n.includes('marty')) return 'ping-pong'
  if (n.includes('hamnet')) return 'quill'
  if (n.includes('frankenstein')) return 'monster-head'
  if (n.includes('sentimental')) return 'frame-heart'
  if (n.includes('bugonia')) return 'saucer'
  if (n === 'f1' || n.startsWith('f1 ')) return 'steering-wheel'
  if (n.includes('train dream')) return 'locomotive'
  if (n.includes('secret agent')) return 'spy-glass'
  if (n.includes('kpop') || n.includes('k-pop') || n.includes('demon hunter')) return 'demon-mic'

  return 'heraldic-shield'
}
