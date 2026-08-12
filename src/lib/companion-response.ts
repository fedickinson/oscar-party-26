import { AI_COMPANIONS } from '../data/ai-companions.js'
import { containsDisallowedEmoji } from './generated-prose.js'

export interface CompanionMessage {
  companion_id: string
  text: string
  delay_seconds: number
}

const COMPANION_ID_ALIASES: Record<string, string> = Object.fromEntries(
  AI_COMPANIONS.flatMap((companion) => [
    [companion.name.toLowerCase(), companion.id],
    ...companion.aliases.map((alias) => [alias, companion.id] as const),
  ]),
)

export function companionResponseMessageCount(raw: string): number | null {
  try {
    const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    const parsed = JSON.parse(cleaned)
    return Array.isArray(parsed.messages) ? parsed.messages.length : null
  } catch {
    return null
  }
}

export function isExactEmptyCompanionResponse(raw: string): boolean {
  try {
    if (containsDisallowedEmoji(raw)) return false
    const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    const parsed: unknown = JSON.parse(cleaned)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return false
    const record = parsed as Record<string, unknown>
    return Object.keys(record).length === 1 &&
      Array.isArray(record.messages) &&
      record.messages.length === 0
  } catch {
    return false
  }
}

export function parseCompanionResponse(raw: string): CompanionMessage[] {
  try {
    if (containsDisallowedEmoji(raw)) return []
    const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    const parsed = JSON.parse(cleaned)
    if (!Array.isArray(parsed.messages)) return []
    const seen = new Set<string>()
    return parsed.messages
      .filter(
        (message: unknown) =>
          typeof (message as CompanionMessage).companion_id === 'string' &&
          typeof (message as CompanionMessage).text === 'string' &&
          typeof (message as CompanionMessage).delay_seconds === 'number',
      )
      .map((message: CompanionMessage) => {
        const normalized = COMPANION_ID_ALIASES[message.companion_id.toLowerCase()]
        return normalized ? { ...message, companion_id: normalized } : message
      })
      .filter((message: CompanionMessage) => {
        if (seen.has(message.companion_id)) return false
        seen.add(message.companion_id)
        return true
      })
  } catch {
    return []
  }
}
