import { containsDisallowedEmoji } from './generated-prose.js'

export const INVALID_GROUNDING_AUDIT_FINDING = 'Auditor response was not a valid violations array.'
const MAX_AUDIT_FINDINGS = 20
const MAX_AUDIT_FINDING_LENGTH = 2000

function invalidAudit(): string[] {
  return [INVALID_GROUNDING_AUDIT_FINDING]
}

function parseResponseObject(raw: string): Record<string, unknown> | null {
  const objectStart = raw.indexOf('{')
  if (objectStart < 0) return null

  try {
    const value: unknown = JSON.parse(raw.slice(objectStart))
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
    return value as Record<string, unknown>
  } catch {
    return null
  }
}

function hasExactKeys(record: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(record)
  return actual.length === keys.length && keys.every((key) => actual.includes(key))
}

/**
 * The generation call inherits a shared system prompt whose messages envelope
 * can override the direct text envelope requested by grounded-line. Accept only
 * those two documented shapes. A shared response must contain exactly one
 * message for the requested companion; position never grants speaker identity.
 * No malformed or misattributed value reaches the auditor or checkpoint writer.
 */
export function parseGroundedLineResponse(raw: string, expectedSpeaker: string): string | null {
  if (containsDisallowedEmoji(raw)) return null
  const response = parseResponseObject(raw)
  if (response === null) return null

  if (hasExactKeys(response, ['text'])) {
    if (typeof response.text !== 'string' || !response.text.trim()) return null
    return response.text.trim()
  }

  if (!hasExactKeys(response, ['messages']) || !Array.isArray(response.messages)) return null
  if (response.messages.length === 0) return null

  const requestedId = expectedSpeaker.trim().toLowerCase()
  if (!requestedId) return null
  const seen = new Set<string>()
  let selectedText: string | null = null
  for (const message of response.messages) {
    if (message === null || typeof message !== 'object' || Array.isArray(message)) return null
    const record = message as Record<string, unknown>
    if (!hasExactKeys(record, ['companion_id', 'text', 'delay_seconds']) ||
      typeof record.companion_id !== 'string' || !record.companion_id.trim() ||
      typeof record.text !== 'string' || !record.text.trim() ||
      typeof record.delay_seconds !== 'number') return null

    const companionId = record.companion_id.trim().toLowerCase()
    if (seen.has(companionId)) return null
    seen.add(companionId)
    if (companionId === requestedId) selectedText = record.text.trim()
  }

  return selectedText
}

/**
 * The refutation pass clears a line only when the auditor returns the exact
 * documented shape and every finding is non-empty text. Malformed model output
 * is itself a finding; it can never mean that a line is grounded.
 */
export function parseGroundingAuditResponse(raw: string): string[] {
  if (containsDisallowedEmoji(raw)) return invalidAudit()
  const record = parseResponseObject(raw)
  if (record === null) return invalidAudit()
  if (Object.keys(record).length !== 1 || !Array.isArray(record.violations)) return invalidAudit()
  if (record.violations.length > MAX_AUDIT_FINDINGS ||
      !record.violations.every((finding) =>
        typeof finding === 'string' &&
        finding.trim().length >= 1 &&
        finding.trim().length <= MAX_AUDIT_FINDING_LENGTH,
      )) {
    return invalidAudit()
  }
  return record.violations.map((finding) => (finding as string).trim())
}
