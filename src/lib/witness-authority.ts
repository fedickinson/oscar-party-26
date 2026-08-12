export interface WitnessAuthorityInput {
  minimumConfidence: number
  maximumConfidence: number
  frameSha256: string
  modelOutputSha256: string
  exclusions: string[]
  adjudication: {
    proxies: string
    offscreen: string
    mentions: string
  }
  observationCount: number
  matchingEntityCount: number
  conflictingEntityCount: number
  conflictingEntityName: string | null
}

export interface WitnessAuthorityVerdict {
  status: 'human_review_required'
  confidence_label: string
  observation_label: string
  reasons: string[]
}

export interface WitnessRulingOption {
  entity_id: string
  entity_name: string
  positive_count: number
}

export function deriveWitnessRulingOptions(input: {
  rootEntityId: string
  observationCount: number
  options: WitnessRulingOption[]
}): WitnessRulingOption[] {
  if (!input.rootEntityId.trim()) throw new Error('witness ruling requires a root entity')
  if (!Number.isInteger(input.observationCount) || input.observationCount < 1 || input.observationCount > 8) {
    throw new Error('witness ruling observation count is invalid')
  }
  if (input.options.length < 1 || input.options.length > 2) {
    throw new Error('witness ruling requires one or two sealed entity options')
  }
  const ids = new Set<string>()
  let total = 0
  for (const option of input.options) {
    if (!option.entity_id.trim() || !option.entity_name.trim()) {
      throw new Error('witness ruling options require sealed entity identity')
    }
    if (ids.has(option.entity_id)) throw new Error('witness ruling options must be unique')
    ids.add(option.entity_id)
    if (!Number.isInteger(option.positive_count) || option.positive_count < 1) {
      throw new Error('witness ruling options require positive evidence')
    }
    total += option.positive_count
  }
  if (!ids.has(input.rootEntityId)) throw new Error('witness ruling options must include the root entity')
  if (total !== input.observationCount) {
    throw new Error('witness ruling option counts must match retained observations')
  }
  return input.options.map((option) => ({ ...option }))
}

function assertSha256(value: string, label: string): void {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`witness ${label} hash must be a lowercase SHA-256`)
  }
}

/**
 * Describes current witness authority without turning a model score into a fact.
 * The review unit may retain several positive frame judgments from one model,
 * so every current proposal remains a host ruling regardless of confidence.
 */
export function deriveWitnessAuthority(input: WitnessAuthorityInput): WitnessAuthorityVerdict {
  if (!Number.isInteger(input.minimumConfidence) || input.minimumConfidence < 0
    || !Number.isInteger(input.maximumConfidence) || input.maximumConfidence > 100
    || input.minimumConfidence > input.maximumConfidence) {
    throw new Error('witness confidence range must contain integers from 0 through 100')
  }
  assertSha256(input.frameSha256, 'frame')
  assertSha256(input.modelOutputSha256, 'model output')
  if (input.exclusions.length === 0 || input.exclusions.some((value) => !value.trim())) {
    throw new Error('witness authority requires the sealed non-empty exclusions')
  }
  if (input.adjudication === null || typeof input.adjudication !== 'object') {
    throw new Error('witness authority requires sealed adjudication')
  }
  const allowed = new Set(['count', 'do_not_count', 'explicit_only', 'principal_accepts_if_unrefused'])
  for (const dimension of ['proxies', 'offscreen', 'mentions'] as const) {
    if (!allowed.has(input.adjudication[dimension])) {
      throw new Error(`witness authority requires sealed ${dimension} adjudication`)
    }
  }
  for (const [label, value] of [
    ['observation', input.observationCount],
    ['matching entity', input.matchingEntityCount],
    ['conflicting entity', input.conflictingEntityCount],
  ] as const) {
    if (!Number.isInteger(value) || value < (label === 'observation' || label === 'matching entity' ? 1 : 0)) {
      throw new Error(`witness ${label} count is invalid`)
    }
  }
  if (input.observationCount > 8) {
    throw new Error('witness observation count exceeds the sealed evidence bound')
  }
  if (input.matchingEntityCount + input.conflictingEntityCount !== input.observationCount) {
    throw new Error('witness observation counts must reconcile')
  }
  if ((input.conflictingEntityCount > 0) !== Boolean(input.conflictingEntityName?.trim())) {
    throw new Error('witness conflicting entity identity must match the conflict count')
  }
  const observationWord = input.observationCount === 3 ? 'three' : String(input.observationCount)
  const firstReason = input.conflictingEntityCount > 0
    ? `${input.conflictingEntityCount === 1 ? 'One' : String(input.conflictingEntityCount)} of ${observationWord} retained positive frame judgments selected ${input.conflictingEntityName}; the conflict requires a host ruling.`
    : input.observationCount > 1
      ? `${input.observationCount === 3 ? 'Three' : String(input.observationCount)} retained positive frame judgments repeat the same selection; that is temporal support, not independent corroboration.`
      : 'One frame and one model output are a proposal, not independent corroboration.'
  return {
    status: 'human_review_required',
    confidence_label: input.minimumConfidence === input.maximumConfidence
      ? `Model confidence: ${input.minimumConfidence}%`
      : `Model confidence range: ${input.minimumConfidence}–${input.maximumConfidence}%`,
    observation_label: input.conflictingEntityCount > 0
      ? `${input.observationCount} positive frames · ${input.matchingEntityCount} agree · ${input.conflictingEntityCount} conflict`
      : `${input.observationCount} positive ${input.observationCount === 1 ? 'frame' : 'frames'} · ${input.matchingEntityCount} agree`,
    reasons: [
      firstReason,
      'The confidence value is self-reported and has not been calibrated into declaration authority.',
      'Only the host can apply the trigger contract, exclusions, and edge-case judgment.',
    ],
  }
}
