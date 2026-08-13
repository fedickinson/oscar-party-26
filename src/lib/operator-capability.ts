export const OPERATOR_CAPABILITY_HEX_LENGTH = 64
const STORAGE_PREFIX = 'oscar_operator_capability_v1:'

export function normalizeOperatorCapability(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return new RegExp(`^[a-f0-9]{${OPERATOR_CAPABILITY_HEX_LENGTH}}$`).test(normalized)
    ? normalized
    : null
}

export function operatorCapabilityStorageKey(roomId: string): string {
  const normalized = roomId.trim()
  if (!normalized) throw new Error('room identity is required for operator capability storage')
  return `${STORAGE_PREFIX}${normalized}`
}

export interface ParsedOperatorCapabilityFragment {
  capability: string | null
  remaining_hash: string
  had_operator_parameter: boolean
}

/**
 * URL fragments never cross the HTTP boundary. Consume the bearer value once,
 * leave unrelated fragment state intact, and remove malformed values too so a
 * credential-shaped string does not linger in copied URLs or screenshots.
 */
export function parseOperatorCapabilityFragment(
  fragment: string,
): ParsedOperatorCapabilityFragment {
  const raw = fragment.startsWith('#') ? fragment.slice(1) : fragment
  const parameters = new URLSearchParams(raw)
  const hadOperatorParameter = parameters.has('operator')
  const capability = hadOperatorParameter
    ? normalizeOperatorCapability(parameters.get('operator'))
    : null
  if (hadOperatorParameter) parameters.delete('operator')
  const remaining = parameters.toString()
  return {
    capability,
    remaining_hash: remaining ? `#${remaining}` : '',
    had_operator_parameter: hadOperatorParameter,
  }
}

function isLoopbackHostname(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]'
}

export function buildOperatorCapabilityLink(
  origin: string,
  roomCode: string,
  capabilityValue: string,
): string {
  const capability = normalizeOperatorCapability(capabilityValue)
  if (!capability) throw new Error('operator capability must be 256-bit hexadecimal text')
  const code = roomCode.trim().toUpperCase()
  if (!/^[A-Z0-9]{4,12}$/.test(code)) {
    throw new Error('room code must be 4 to 12 uppercase letters or numbers')
  }

  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    throw new Error('operator link origin must be an absolute URL')
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
    throw new Error('operator link origin must contain only scheme and host')
  }
  if (parsed.protocol !== 'https:'
    && !(parsed.protocol === 'http:' && isLoopbackHostname(parsed.hostname))) {
    throw new Error('operator links require HTTPS except on a loopback development host')
  }
  return `${parsed.origin}/room/${code}/live#operator=${capability}`
}
