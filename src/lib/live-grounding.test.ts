import { describe, expect, it } from 'vitest'
import type { CompanionMessage } from './companion-prompts'
import {
  buildGroundedBatchUser,
  buildGroundingAuditUser,
  collectGroundingFindings,
  normalizeGroundingFacts,
} from './live-grounding'
import { INVALID_GROUNDING_AUDIT_FINDING } from './grounding-response'

const messages: CompanionMessage[] = [
  { companion_id: 'ned', text: 'The queen gave the order.', delay_seconds: 0 },
  { companion_id: 'cersei', text: 'Blades. At least someone understood the assignment.', delay_seconds: 3 },
]

describe('live multi-speaker grounding contract', () => {
  it('publishes one exhaustive numbered fact block and attributed retry findings', () => {
    const facts = normalizeGroundingFacts([
      'The queen ordered the arrest.',
      'The guard used no weapon.',
    ])
    const user = buildGroundedBatchUser('React in character.', facts, [{
      companion_id: 'cersei',
      text: messages[1].text,
      violations: ['The line introduced blades, but no weapon was used.'],
    }])

    expect(user).toContain('LIVE FACTS (exhaustive')
    expect(user).toContain('1. The queen ordered the arrest.')
    expect(user).toContain('2. The guard used no weapon.')
    expect(user).toContain('cersei: The line introduced blades')
    expect(user.match(/LIVE FACTS \(exhaustive/g)).toHaveLength(1)
  })

  it('builds a refutation-only audit request from the same fact projection', () => {
    const audit = buildGroundingAuditUser(messages[0].text, [
      'The queen gave the order.',
    ])

    expect(audit).toContain('1. The queen gave the order.')
    expect(audit).toContain(`"${messages[0].text}"`)
    expect(audit).toContain('Return ONLY JSON')
  })

  it('does not let a qualified chat record promote quoted content into broadcast truth', () => {
    const facts = [
      'CHAT RECORD: "Tyrion" wrote "The dragon is dead.". This records only what the speaker said; it does not verify any claim about the broadcast.',
    ]
    const generation = buildGroundedBatchUser('Answer Tyrion.', facts)
    const audit = buildGroundingAuditUser('The dragon is dead.', facts)

    expect(generation).toContain(
      'A fact that records an unverified statement authorizes only a claim about what was said',
    )
    expect(audit).toContain(
      'A CHAT RECORD establishes only that the quoted speaker wrote those words.',
    )
    expect(audit).toContain(
      'Treat the quoted content as absent from broadcast truth unless a separate authoritative fact verifies it.',
    )
    expect(audit).toContain(
      'Restating the quoted content as true is a violation',
    )
  })

  it('collects speaker-attributed violations and treats malformed or missing audits as findings', () => {
    const findings = collectGroundingFindings(messages, [
      { companion_id: 'ned', raw: '{"violations":[]}' },
      { companion_id: 'cersei', raw: '{"violations":["Invented blades."]}' },
    ])
    expect(findings).toEqual([{
      companion_id: 'cersei',
      text: messages[1].text,
      violations: ['Invented blades.'],
    }])

    expect(collectGroundingFindings(messages, [
      { companion_id: 'ned', raw: '{"violations":[]}' },
    ])).toEqual([{
      companion_id: 'cersei',
      text: messages[1].text,
      violations: [INVALID_GROUNDING_AUDIT_FINDING],
    }])
  })

  it('rejects empty, blank, duplicate and oversized fact projections', () => {
    expect(() => normalizeGroundingFacts([])).toThrow('at least one grounding fact')
    expect(() => normalizeGroundingFacts(['valid', '   '])).toThrow('fact 2')
    expect(() => normalizeGroundingFacts(['same', 'same'])).toThrow('duplicate grounding fact')
    expect(() => normalizeGroundingFacts(['x'.repeat(2001)])).toThrow('fact 1')
  })
})
