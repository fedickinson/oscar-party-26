import { normalizeOperatorCapability } from './operator-capability'

export type RefereeAuthorityStatus = 'ready' | 'loading' | 'missing' | 'not_host'

export interface RefereeAuthority {
  enabled: boolean
  status: RefereeAuthorityStatus
  message: string | null
}

interface RefereeAuthorityInput {
  isHost: boolean
  capability: string | null
  capabilityLoading: boolean
}

/**
 * One pure fail-closed contract for every browser command that can change the
 * room's declared record. The database remains the authority; this prevents a
 * loading or de-authorized operator surface from presenting writable controls.
 */
export function deriveRefereeAuthority(input: RefereeAuthorityInput): RefereeAuthority {
  if (!input.isHost) {
    return { enabled: false, status: 'not_host', message: null }
  }
  if (input.capabilityLoading) {
    return {
      enabled: false,
      status: 'loading',
      message: 'Operator authority is still being verified.',
    }
  }
  if (input.capability === null) {
    return {
      enabled: false,
      status: 'missing',
      message: 'This phone needs the current private operator link before it can change the room record.',
    }
  }
  if (normalizeOperatorCapability(input.capability) !== input.capability) {
    throw new Error('referee authority requires a normalized operator capability')
  }
  return { enabled: true, status: 'ready', message: null }
}
