import { describe, expect, it } from 'vitest'
import {
  MAX_TOKENS_CEILING,
  RATE_CAPACITY,
  clientKey,
  isAllowedOrigin,
  parseAllowedOrigins,
  pruneBuckets,
  takeToken,
  validateBody,
  type Bucket,
} from './_guards'

/** The shape the companion hooks actually send. */
const realBody = {
  model: 'claude-sonnet-5',
  max_tokens: 600,
  thinking: { type: 'disabled' },
  output_config: { effort: 'low' },
  system: [{ type: 'text', text: 'you are the cast', cache_control: { type: 'ephemeral' } }],
  messages: [{ role: 'user', content: 'react to this' }],
}

describe('isAllowedOrigin', () => {
  it('allows a page served from the same host', () => {
    expect(isAllowedOrigin('https://party.example.com', 'party.example.com')).toBe(true)
  })

  it('rejects another site calling in', () => {
    expect(isAllowedOrigin('https://evil.example.com', 'party.example.com')).toBe(false)
  })

  it('rejects a request with no Origin at all', () => {
    // Browsers send Origin on every POST, so a missing one is not a page.
    expect(isAllowedOrigin(undefined, 'party.example.com')).toBe(false)
  })

  it('allows localhost for development', () => {
    expect(isAllowedOrigin('http://localhost:5173', 'party.example.com')).toBe(true)
    expect(isAllowedOrigin('http://127.0.0.1:4173', 'party.example.com')).toBe(true)
  })

  it('allows an explicitly configured extra origin', () => {
    expect(isAllowedOrigin('https://staging.example.com', 'party.example.com', [
      'https://staging.example.com',
    ])).toBe(true)
  })

  it('rejects an unparseable Origin instead of throwing', () => {
    expect(isAllowedOrigin('not a url', 'party.example.com')).toBe(false)
  })

  it('distinguishes hosts that differ only by port', () => {
    expect(isAllowedOrigin('https://party.example.com:8443', 'party.example.com')).toBe(false)
  })
})

describe('parseAllowedOrigins', () => {
  it('splits and trims a comma-separated list', () => {
    expect(parseAllowedOrigins('https://a.com, https://b.com')).toEqual([
      'https://a.com',
      'https://b.com',
    ])
  })

  it('returns nothing when unset', () => {
    expect(parseAllowedOrigins(undefined)).toEqual([])
    expect(parseAllowedOrigins('')).toEqual([])
  })
})

describe('validateBody', () => {
  it('accepts the body the app actually sends', () => {
    expect(validateBody(realBody)).toEqual({ ok: true })
  })

  it('accepts the haiku chat path too', () => {
    expect(validateBody({ ...realBody, model: 'claude-haiku-4-5', max_tokens: 200 }))
      .toEqual({ ok: true })
  })

  it('rejects a model the app never calls', () => {
    const result = validateBody({ ...realBody, model: 'claude-opus-4-1' })
    expect(result).toMatchObject({ ok: false, status: 400 })
  })

  it('rejects a token budget above the ceiling', () => {
    const result = validateBody({ ...realBody, max_tokens: MAX_TOKENS_CEILING + 1 })
    expect(result).toMatchObject({ ok: false, status: 400 })
  })

  it('allows the largest real call, the verdicts batch', () => {
    expect(validateBody({ ...realBody, max_tokens: 3000 })).toEqual({ ok: true })
  })

  it('rejects a non-integer or absent token budget', () => {
    expect(validateBody({ ...realBody, max_tokens: 1.5 })).toMatchObject({ ok: false })
    expect(validateBody({ ...realBody, max_tokens: 0 })).toMatchObject({ ok: false })
    const { max_tokens: _dropped, ...withoutTokens } = realBody
    expect(validateBody(withoutTokens)).toMatchObject({ ok: false })
  })

  it('rejects an unexpected top-level field', () => {
    // Notably `stream`, which would change the response contract entirely.
    expect(validateBody({ ...realBody, stream: true })).toMatchObject({
      ok: false,
      status: 400,
    })
  })

  it('rejects an empty or missing message list', () => {
    expect(validateBody({ ...realBody, messages: [] })).toMatchObject({ ok: false })
    expect(validateBody({ ...realBody, messages: 'hello' })).toMatchObject({ ok: false })
  })

  it('rejects anything that is not a JSON object', () => {
    expect(validateBody(null)).toMatchObject({ ok: false, status: 400 })
    expect(validateBody([realBody])).toMatchObject({ ok: false, status: 400 })
    expect(validateBody('a string')).toMatchObject({ ok: false, status: 400 })
  })

  it('rejects an oversized body with 413', () => {
    const huge = { ...realBody, system: [{ type: 'text', text: 'x'.repeat(300 * 1024) }] }
    expect(validateBody(huge)).toMatchObject({ ok: false, status: 413 })
  })
})

describe('takeToken', () => {
  it('allows a burst up to capacity, then refuses', () => {
    const buckets = new Map<string, Bucket>()
    for (let n = 0; n < RATE_CAPACITY; n++) {
      expect(takeToken(buckets, 'ip', 1000)).toBe(true)
    }
    expect(takeToken(buckets, 'ip', 1000)).toBe(false)
  })

  it('refills over time', () => {
    const buckets = new Map<string, Bucket>()
    for (let n = 0; n < RATE_CAPACITY; n++) takeToken(buckets, 'ip', 1000)
    expect(takeToken(buckets, 'ip', 1000)).toBe(false)
    // One token per second.
    expect(takeToken(buckets, 'ip', 2000)).toBe(true)
  })

  it('never refills past capacity', () => {
    const buckets = new Map<string, Bucket>()
    takeToken(buckets, 'ip', 0)
    for (let n = 0; n < RATE_CAPACITY; n++) {
      expect(takeToken(buckets, 'ip', 10_000_000)).toBe(true)
    }
    expect(takeToken(buckets, 'ip', 10_000_000)).toBe(false)
  })

  it('budgets each caller separately', () => {
    const buckets = new Map<string, Bucket>()
    for (let n = 0; n < RATE_CAPACITY; n++) takeToken(buckets, 'house-a', 1000)
    expect(takeToken(buckets, 'house-a', 1000)).toBe(false)
    expect(takeToken(buckets, 'house-b', 1000)).toBe(true)
  })

  it('gives a whole room enough burst for one loud moment', () => {
    // Every phone in the house shares a NAT address, so capacity is per room.
    const buckets = new Map<string, Bucket>()
    const roomBurst = 12
    for (let n = 0; n < roomBurst; n++) {
      expect(takeToken(buckets, 'house', 1000)).toBe(true)
    }
  })
})

describe('pruneBuckets', () => {
  it('drops buckets nobody has touched recently', () => {
    const buckets = new Map<string, Bucket>([
      ['stale', { tokens: 5, updatedAt: 0 }],
      ['fresh', { tokens: 5, updatedAt: 600_000 }],
    ])
    pruneBuckets(buckets, 601_000)
    expect([...buckets.keys()]).toEqual(['fresh'])
  })
})

describe('clientKey', () => {
  it('takes the client hop from x-forwarded-for', () => {
    expect(clientKey('203.0.113.9, 70.41.3.18')).toBe('203.0.113.9')
    expect(clientKey(['203.0.113.9'])).toBe('203.0.113.9')
  })

  it('falls back to a shared key when the header is absent', () => {
    expect(clientKey(undefined)).toBe('unknown')
  })
})
