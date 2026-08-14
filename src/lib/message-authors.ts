import { COMPANION_IDS } from '../data/ai-companions'

export const SYNTHETIC_MESSAGE_AUTHOR_IDS = new Set([
  'system',
  'winner-divider',
  'film-link',
])

/** Pack-owned voices may not reuse an identity owned by a synthetic message
 * surface. Legacy character ids remain available because the room-bound pack
 * projection takes presentation precedence in generic rooms. */
export const RESERVED_RUNTIME_VOICE_IDS = new Set([
  ...SYNTHETIC_MESSAGE_AUTHOR_IDS,
])

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i

export function isReservedRuntimeVoiceId(value: string): boolean {
  return RESERVED_RUNTIME_VOICE_IDS.has(value) || UUID.test(value)
}

export function isNonHumanMessageAuthor(
  authorId: string,
  runtimeCastIds: readonly string[] = [],
): boolean {
  return RESERVED_RUNTIME_VOICE_IDS.has(authorId) || COMPANION_IDS.has(authorId)
    || runtimeCastIds.includes(authorId)
}

export function normalizeRuntimeMentionTerm(value: string): string {
  return value.trim().toLocaleLowerCase('en-US')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function runtimeMentionTermMatches(text: string, term: string): boolean {
  const normalized = normalizeRuntimeMentionTerm(term)
  if (!normalized) return false
  return new RegExp(
    `(^|[^\\p{L}\\p{N}])${escapeRegExp(normalized)}(?=$|[^\\p{L}\\p{N}])`,
    'iu',
  ).test(text)
}

export function runtimeMentionTermsOverlap(left: string, right: string): boolean {
  return runtimeMentionTermMatches(left, right) || runtimeMentionTermMatches(right, left)
}
