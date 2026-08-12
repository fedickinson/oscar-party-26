import { describe, expect, it } from 'vitest'
import { deriveRefereeAuthority } from './referee-authority'

const CAPABILITY = 'ab'.repeat(32)

describe('room referee authority', () => {
  it('enables commands only for a current host with a loaded room capability', () => {
    expect(deriveRefereeAuthority({
      isHost: true,
      capability: CAPABILITY,
      capabilityLoading: false,
    })).toEqual({
      enabled: true,
      status: 'ready',
      message: null,
    })

    expect(deriveRefereeAuthority({
      isHost: false,
      capability: CAPABILITY,
      capabilityLoading: false,
    }).status).toBe('not_host')
  })

  it('fails closed while authority is loading or absent', () => {
    expect(deriveRefereeAuthority({
      isHost: true,
      capability: CAPABILITY,
      capabilityLoading: true,
    })).toEqual({
      enabled: false,
      status: 'loading',
      message: 'Operator authority is still being verified.',
    })
    expect(deriveRefereeAuthority({
      isHost: true,
      capability: null,
      capabilityLoading: false,
    })).toEqual({
      enabled: false,
      status: 'missing',
      message: 'This phone needs the current private operator link before it can change the room record.',
    })
  })

  it('rejects token-shaped values that have not crossed capability normalization', () => {
    expect(() => deriveRefereeAuthority({
      isHost: true,
      capability: 'not-authority',
      capabilityLoading: false,
    })).toThrow('referee authority requires a normalized operator capability')
  })
})
