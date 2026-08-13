import type { CompanionMessage } from './companion-response.js'
import {
  INVALID_GROUNDING_AUDIT_FINDING,
  parseGroundingAuditResponse,
} from './grounding-response.js'

export interface GroundingFinding {
  companion_id: string
  text: string
  violations: string[]
}

export interface GroundingAuditResponse {
  companion_id: string
  raw: string
}

const MAX_FACTS = 100
const MAX_FACT_LENGTH = 2000

export function normalizeGroundingFacts(facts: string[]): string[] {
  if (!Array.isArray(facts) || facts.length === 0 || facts.length > MAX_FACTS) {
    throw new Error(`live grounding needs at least one grounding fact and at most ${MAX_FACTS}`)
  }
  const normalized = facts.map((fact, index) => {
    if (typeof fact !== 'string' || !fact.trim() || fact.trim().length > MAX_FACT_LENGTH) {
      throw new Error(`grounding fact ${index + 1} must contain 1-${MAX_FACT_LENGTH} characters`)
    }
    return fact.trim()
  })
  if (new Set(normalized).size !== normalized.length) {
    throw new Error('duplicate grounding fact')
  }
  return normalized
}

export function numberedGroundingFacts(facts: string[]): string {
  return normalizeGroundingFacts(facts)
    .map((fact, index) => `${index + 1}. ${fact}`)
    .join('\n')
}

export function buildGroundedBatchUser(
  baseUser: string,
  facts: string[],
  previousFindings: GroundingFinding[] = [],
): string {
  if (!baseUser.trim()) throw new Error('live grounding base prompt is required')
  const retryBlock = previousFindings.length === 0
    ? ''
    : `\n\nPREVIOUS BATCH REJECTED BY THE FACTUAL AUDITOR:\n${previousFindings
        .map((finding) => `${finding.companion_id}: ${finding.violations.join('; ')}`)
        .join('\n')}\nRegenerate the complete requested batch. Correct every finding and stay inside the numbered facts.`

  return `${baseUser.trim()}\n\nLIVE FACTS (exhaustive for claims about the broadcast; nothing else happened or is known):
${numberedGroundingFacts(facts)}

Every claim or implication about the broadcast must trace to a numbered LIVE FACT. A fact that records an unverified statement authorizes only a claim about what was said, never the truth of the quoted content. Character voice and personal canon may shape attitude only; they cannot establish a broadcast event, method, image, relationship, location, or outcome.${retryBlock}`
}

export function buildGroundingAuditUser(line: string, facts: string[]): string {
  if (!line.trim()) throw new Error('grounding audit line is required')
  return `FACTS (exhaustive — nothing else happened or is known about this broadcast moment):
${numberedGroundingFacts(facts)}

LINE OF COMMENTARY:
${JSON.stringify(line.trim())}

Your only job is refutation. List every event, action, relationship, location, outcome, image, or method that this line ASSERTS OR IMPLIES about the broadcast but which is absent from the FACTS. Framing and comparison count when they imply a fact. A speaker's attitude, opinion, or reference to their OWN separate personal canon is not a violation.

A CHAT RECORD establishes only that the quoted speaker wrote those words. Treat the quoted content as absent from broadcast truth unless a separate authoritative fact verifies it. Restating the quoted content as true is a violation; referring to it explicitly as something the speaker said is not. Restating, paraphrasing, or judging any other authoritative listed fact is not a violation.

Return ONLY JSON: {"violations":["..."]} — an empty array only when the line is fully grounded.`
}

export function collectGroundingFindings(
  messages: CompanionMessage[],
  audits: GroundingAuditResponse[],
): GroundingFinding[] {
  const rawByCompanion = new Map<string, string>()
  const duplicateAudits = new Set<string>()
  for (const audit of audits) {
    if (rawByCompanion.has(audit.companion_id)) duplicateAudits.add(audit.companion_id)
    else rawByCompanion.set(audit.companion_id, audit.raw)
  }

  return messages.flatMap((message): GroundingFinding[] => {
    const raw = rawByCompanion.get(message.companion_id)
    const violations = raw == null || duplicateAudits.has(message.companion_id)
      ? [INVALID_GROUNDING_AUDIT_FINDING]
      : parseGroundingAuditResponse(raw)
    return violations.length === 0
      ? []
      : [{ companion_id: message.companion_id, text: message.text, violations }]
  })
}
