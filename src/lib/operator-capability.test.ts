import { describe, expect, it } from 'vitest'
import {
  buildOperatorCapabilityLink,
  normalizeOperatorCapability,
  operatorCapabilityStorageKey,
  parseOperatorCapabilityFragment,
} from './operator-capability'

const CAPABILITY = 'ab'.repeat(32)

describe('operator capability contract', () => {
  it('accepts exactly 256 bits of hexadecimal capability and normalizes case', () => {
    expect(normalizeOperatorCapability(`  ${CAPABILITY.toUpperCase()}  `)).toBe(CAPABILITY)
    expect(normalizeOperatorCapability('ab'.repeat(31))).toBeNull()
    expect(normalizeOperatorCapability(`${'ab'.repeat(31)}zz`)).toBeNull()
    expect(normalizeOperatorCapability(null)).toBeNull()
  })

  it('scopes browser persistence to one exact room identity', () => {
    expect(operatorCapabilityStorageKey('room-one'))
      .toBe('oscar_operator_capability_v1:room-one')
    expect(() => operatorCapabilityStorageKey('   ')).toThrow('room identity is required')
  })

  it('consumes only the private operator fragment and preserves unrelated fragment state', () => {
    expect(parseOperatorCapabilityFragment(`#panel=events&operator=${CAPABILITY}`)).toEqual({
      capability: CAPABILITY,
      remaining_hash: '#panel=events',
      had_operator_parameter: true,
    })
    expect(parseOperatorCapabilityFragment(`#operator=not-a-token&panel=events`)).toEqual({
      capability: null,
      remaining_hash: '#panel=events',
      had_operator_parameter: true,
    })
    expect(parseOperatorCapabilityFragment('#panel=events')).toEqual({
      capability: null,
      remaining_hash: '#panel=events',
      had_operator_parameter: false,
    })
  })

  it('builds a fragment-only credential link for HTTPS or loopback development', () => {
    expect(buildOperatorCapabilityLink(
      'https://watch-the-dance.vercel.app/',
      'wdkh',
      CAPABILITY,
    )).toBe(`https://watch-the-dance.vercel.app/room/WDKH/live#operator=${CAPABILITY}`)
    expect(buildOperatorCapabilityLink('http://localhost:5173', 'TEST', CAPABILITY))
      .toBe(`http://localhost:5173/room/TEST/live#operator=${CAPABILITY}`)
    expect(() => buildOperatorCapabilityLink('http://example.com', 'TEST', CAPABILITY))
      .toThrow('HTTPS')
  })
})
