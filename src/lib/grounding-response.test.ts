import { describe, expect, it } from 'vitest'
import {
  INVALID_GROUNDING_AUDIT_FINDING,
  parseGroundedLineResponse,
  parseGroundingAuditResponse,
} from './grounding-response'

describe('grounded line response', () => {
  it('accepts only the direct and shared-system response envelopes', () => {
    expect(parseGroundedLineResponse('{"text":"  Kept to the facts.  "}', 'future-pundit')).toBe(
      'Kept to the facts.',
    )
    expect(parseGroundedLineResponse(
      'preface {"messages":[{"companion_id":"cersei","text":"  Also grounded.  ","delay_seconds":0}]}',
      'Cersei',
    )).toBe('Also grounded.')
  })

  it('selects the requested companion instead of trusting message position', () => {
    const response = '{"messages":[' +
      '{"companion_id":"ned","text":"The wrong voice.","delay_seconds":0},' +
      '{"companion_id":"cersei","text":"The requested voice.","delay_seconds":3}' +
      ']}'

    expect(parseGroundedLineResponse(response, 'cersei')).toBe('The requested voice.')
  })

  it('rejects a shared response without one unambiguous requested companion', () => {
    expect(parseGroundedLineResponse(
      '{"messages":[{"companion_id":"ned","text":"The wrong voice.","delay_seconds":0}]}',
      'cersei',
    )).toBeNull()
    expect(parseGroundedLineResponse(
      '{"messages":[' +
        '{"companion_id":"cersei","text":"First.","delay_seconds":0},' +
        '{"companion_id":"cersei","text":"Second.","delay_seconds":1}' +
      ']}',
      'cersei',
    )).toBeNull()
  })

  it('rejects malformed, ambiguous, and non-string generated text', () => {
    const malformed = [
      '{"text":"   "}',
      '{"text":[]}',
      '{"text":{}}',
      '{"text":12}',
      '{"text":null}',
      '{"text":"grounded","messages":[]}',
      '{"messages":[]}',
      '{"messages":[{"companion_id":"cersei","text":[],"delay_seconds":0}]}',
      '{"messages":[{"companion_id":"cersei","text":"grounded","delay_seconds":"0"}]}',
      '{"messages":[{"companion_id":"cersei","text":"grounded","delay_seconds":0,"extra":true}]}',
      '{"result":"grounded"}',
      '{not json}',
      'no json object',
      JSON.stringify({ violations: ['x'.repeat(2001)] }),
      JSON.stringify({ violations: Array.from({ length: 21 }, () => 'finding') }),
    ]

    expect(malformed.map((raw) => parseGroundedLineResponse(raw, 'cersei'))).toEqual(
      malformed.map(() => null),
    )
  })

  it('rejects generated text containing emoji', () => {
    const disallowed = String.fromCodePoint(0x1f525)
    expect(parseGroundedLineResponse(JSON.stringify({ text: `No ${disallowed}` }), 'cersei'))
      .toBeNull()
  })
})

describe('grounding auditor response', () => {
  it('clears a line only for an exact violations string array', () => {
    expect(parseGroundingAuditResponse('{"violations":[]}')).toEqual([])
    expect(parseGroundingAuditResponse(
      'preface {"violations":[" Unsupported fire implication. ","Invented messenger."]}',
    )).toEqual(['Unsupported fire implication.', 'Invented messenger.'])
  })

  it('turns every malformed auditor shape into a residual finding', () => {
    const malformed = [
      '{"violations":""}',
      '{"violations":"none"}',
      '{"violations":null}',
      '{"violations":{"length":0}}',
      '{"violations":[""]}',
      '{"violations":[],"explanation":"clear"}',
      '{"result":[]}',
      '{not json}',
      'no json object',
    ]

    expect(malformed.map(parseGroundingAuditResponse)).toEqual(
      malformed.map(() => [INVALID_GROUNDING_AUDIT_FINDING]),
    )
  })
})
