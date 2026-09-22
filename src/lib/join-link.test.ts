import { describe, expect, it } from 'vitest'
import { normalizeJoinLinkCode, parseJoinLinkCode } from './join-link'

describe('parseJoinLinkCode', () => {
  it('accepts a four-letter code exactly as generated', () => {
    expect(parseJoinLinkCode('BQRT')).toBe('BQRT')
  })

  it('uppercases and trims before judging', () => {
    expect(parseJoinLinkCode('  bqrt \n')).toBe('BQRT')
  })

  it('refuses a code that is not four letters', () => {
    expect(parseJoinLinkCode('BQR')).toBeNull()
    expect(parseJoinLinkCode('BQRTX')).toBeNull()
    expect(parseJoinLinkCode('')).toBeNull()
  })

  it('refuses anything that is not letters rather than repairing it', () => {
    expect(parseJoinLinkCode('BQ-T')).toBeNull()
    expect(parseJoinLinkCode('BQ7T')).toBeNull()
    expect(parseJoinLinkCode('BQ T')).toBeNull()
    expect(parseJoinLinkCode('BQRT/live')).toBeNull()
  })

  it('refuses a missing link value', () => {
    expect(parseJoinLinkCode(null)).toBeNull()
    expect(parseJoinLinkCode(undefined)).toBeNull()
  })
})

describe('normalizeJoinLinkCode', () => {
  it('keeps only letters, uppercased, to at most four', () => {
    expect(normalizeJoinLinkCode('bq-7t')).toBe('BQT')
    expect(normalizeJoinLinkCode('BQRTXY')).toBe('BQRT')
    expect(normalizeJoinLinkCode(' bqrt ')).toBe('BQRT')
  })

  it('returns an empty field for a link with nothing usable', () => {
    expect(normalizeJoinLinkCode(null)).toBe('')
    expect(normalizeJoinLinkCode(undefined)).toBe('')
    expect(normalizeJoinLinkCode('1234')).toBe('')
  })
})
