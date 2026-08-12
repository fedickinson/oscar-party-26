import { containsDisallowedEmoji } from './generated-prose.js'

export interface CompanionVerdict {
  slot: number
  text: string
  title: string
  highlights: Array<{ messageId: string; note: string }>
  imagery: Array<{ slot: string; slug: string; note: string }>
}

export interface VerdictSlotContract {
  slot: number
  playerId: string
  companionId: string
  allowedMessageIds: string[]
  allowedImageSlugs: string[]
}

/** Lenient projection; the canonical grounding adapter applies strict shape checks first. */
export function parseVerdictResponse(raw: string): CompanionVerdict[] {
  try {
    if (containsDisallowedEmoji(raw)) return []
    const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed.verdicts)) return []
    return parsed.verdicts
      .filter(
        (value: unknown) =>
          typeof (value as { slot?: unknown }).slot === 'number' &&
          typeof (value as { text?: unknown }).text === 'string' &&
          (value as { text: string }).text.trim().length > 0,
      )
      .map((value: Record<string, unknown>) => ({
        slot: value.slot as number,
        text: (value.text as string).trim(),
        title: typeof value.title === 'string' ? value.title.trim() : '',
        highlights: Array.isArray(value.highlights)
          ? (value.highlights as Array<Record<string, unknown>>)
              .filter((highlight) => typeof highlight?.message_id === 'string')
              .map((highlight) => ({
                messageId: highlight.message_id as string,
                note: typeof highlight.note === 'string' ? highlight.note.trim() : '',
              }))
          : [],
        imagery: Array.isArray(value.imagery)
          ? (value.imagery as Array<Record<string, unknown>>)
              .filter((image) => typeof image?.slot === 'string' && typeof image?.slug === 'string')
              .map((image) => ({
                slot: (image.slot as string).trim(),
                slug: (image.slug as string).trim(),
                note: typeof image.note === 'string' ? image.note.trim() : '',
              }))
          : [],
      }))
  } catch {
    return []
  }
}
