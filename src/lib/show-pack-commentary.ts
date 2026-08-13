import {
  buildShowPackCommentaryContext,
  type ShowPack,
} from './show-pack'
import {
  buildGroundedLinePromptContract,
  groundedLinePromptContractSha256,
  GROUNDED_LINE_PIPELINE,
  type GroundedLinePromptContract,
} from './grounded-line-contract'
import { sha256Hex } from './sha256'

const SHA256 = /^[a-f0-9]{64}$/

export interface GroundedLineResult {
  text: string
  attempts: number
  lastViolations: string[]
}

export type GroundedLineGenerator = (input: {
  speaker: string
  voice: string
  facts: string[]
  angle: string
}) => Promise<GroundedLineResult>

export interface CommentaryPublicationOptions {
  approvedPlan: ShowPackCommentaryPlan
  authorization: ShowPackCommentaryAuthorization
  onProgress?: (pack: ShowPack) => void
}

export interface ShowPackCommentaryPlan {
  plan_version: 5
  artifact: 'show-pack-commentary-plan'
  target: { pack_id: string; pack_version: number }
  source_sha256: string
  retry_blocked: boolean
  selected_request_ids: string[] | null
  budget: ShowPackCommentaryBudget
  jobs: Array<{
    request_id: string
    publication_status: 'pending' | 'blocked'
    speaker: string
    voice: string
    facts: string[]
    angle: string
    prompt_contract: GroundedLinePromptContract
  }>
}

interface ShowPackCommentaryCallBudget {
  generation_calls_max: number
  audit_calls_min: 0
  audit_calls_max: number
  total_calls_min: number
  total_calls_max: number
  max_output_tokens: number
}

export interface ShowPackCommentaryBudget {
  budget_version: 1
  input_token_estimate: null
  currency_estimate: null
  caveat: 'Token counts are configured output ceilings, not predicted usage or price.'
  first_pass: ShowPackCommentaryCallBudget
  worst_case: ShowPackCommentaryCallBudget
}

export interface ShowPackCommentaryAuthorization {
  authorization_version: 1
  artifact: 'show-pack-commentary-authorization'
  target: { pack_id: string; pack_version: number }
  plan_sha256: string
  source_sha256: string
  authorized_request_ids: string[]
  authorized_budget: ShowPackCommentaryBudget
  note: string
}

export function buildShowPackCommentaryBudget(
  jobs: ShowPackCommentaryPlan['jobs'],
): ShowPackCommentaryBudget {
  const firstPass = jobs.reduce<ShowPackCommentaryCallBudget>((budget, job) => {
    budget.generation_calls_max += 1
    budget.audit_calls_max += 1
    budget.total_calls_min += 1
    budget.total_calls_max += 2
    budget.max_output_tokens += job.prompt_contract.initial_model_request.maxTokens
      + job.prompt_contract.audit_model_request_template.maxTokens
    return budget
  }, {
    generation_calls_max: 0,
    audit_calls_min: 0,
    audit_calls_max: 0,
    total_calls_min: 0,
    total_calls_max: 0,
    max_output_tokens: 0,
  })
  const worstCase = jobs.reduce<ShowPackCommentaryCallBudget>((budget, job) => {
    const attempts = job.prompt_contract.max_retries + 1
    budget.generation_calls_max += attempts
    budget.audit_calls_max += attempts
    budget.total_calls_min += attempts
    budget.total_calls_max += attempts * 2
    budget.max_output_tokens += job.prompt_contract.initial_model_request.maxTokens
      + job.prompt_contract.retry_model_request_template.maxTokens
        * job.prompt_contract.max_retries
      + job.prompt_contract.audit_model_request_template.maxTokens * attempts
    return budget
  }, {
    generation_calls_max: 0,
    audit_calls_min: 0,
    audit_calls_max: 0,
    total_calls_min: 0,
    total_calls_max: 0,
    max_output_tokens: 0,
  })
  return {
    budget_version: 1,
    input_token_estimate: null,
    currency_estimate: null,
    caveat: 'Token counts are configured output ceilings, not predicted usage or price.',
    first_pass: firstPass,
    worst_case: worstCase,
  }
}

export function buildShowPackCommentaryPlan(
  pack: ShowPack,
  sourceSha256: string,
  options: {
    retryBlocked?: boolean
    requestIds?: string[]
    skipReadyRequestIds?: boolean
  } = {},
): ShowPackCommentaryPlan {
  if (!SHA256.test(sourceSha256)) {
    throw new Error('commentary plan source SHA-256 must be a lowercase SHA-256 digest')
  }
  const retryBlocked = options.retryBlocked === true
  const requestedIds = options.requestIds
  if (requestedIds && new Set(requestedIds).size !== requestedIds.length) {
    throw new Error('commentary request selection contains duplicate id')
  }
  const requestById = new Map(pack.commentary_requests.map((request) => [request.id, request]))
  for (const requestId of requestedIds ?? []) {
    const request = requestById.get(requestId)
    if (!request) throw new Error(`commentary request selection references unknown id ${requestId}`)
    if (options.skipReadyRequestIds && request.publication.status === 'ready') continue
    const eligible = request.publication.status === 'pending'
      || (retryBlocked && request.publication.status === 'blocked')
    if (!eligible) throw new Error(`commentary request selection is not eligible: ${requestId}`)
  }
  const requestedSet = requestedIds ? new Set(requestedIds) : null
  const selectedRequestIds = requestedSet
    ? pack.commentary_requests
      .filter((request) => requestedSet.has(request.id)
        && !(options.skipReadyRequestIds && request.publication.status === 'ready'))
      .map((request) => request.id)
    : null
  const jobs: ShowPackCommentaryPlan['jobs'] = []
  for (const request of pack.commentary_requests) {
    const eligible = request.publication.status === 'pending'
      || (retryBlocked && request.publication.status === 'blocked')
    if (!eligible || (requestedSet && !requestedSet.has(request.id))) continue
    const context = buildShowPackCommentaryContext(pack, request)
    const input = {
      speaker: context.speaker,
      voice: context.voice_block.join('\n'),
      facts: [...context.fact_block],
      angle: context.angle_block.join('\n'),
    }
    jobs.push({
      request_id: request.id,
      publication_status: request.publication.status as 'pending' | 'blocked',
      ...input,
      prompt_contract: buildGroundedLinePromptContract(input),
    })
  }
  return {
    plan_version: 5,
    artifact: 'show-pack-commentary-plan',
    target: { pack_id: pack.pack.id, pack_version: pack.pack.version },
    source_sha256: sourceSha256,
    retry_blocked: retryBlocked,
    selected_request_ids: selectedRequestIds,
    budget: buildShowPackCommentaryBudget(jobs),
    jobs,
  }
}

export function serializeShowPackCommentaryPlan(plan: ShowPackCommentaryPlan): string {
  return `${JSON.stringify(plan, null, 2)}\n`
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => (
      `${JSON.stringify(key)}:${canonical(record[key])}`
    )).join(',')}}`
  }
  return JSON.stringify(value)
}

export function assertShowPackCommentaryPlanCurrent(
  expected: ShowPackCommentaryPlan,
  approved: unknown,
): asserts approved is ShowPackCommentaryPlan {
  if (canonical(approved) !== canonical(expected)) {
    throw new Error('approved commentary plan does not match the current generation inputs')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value: object, expected: string[], label: string): void {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} fields are invalid`)
  }
}

export function assertShowPackCommentaryAuthorizationCurrent(
  planRaw: string,
  authorizationInput: unknown,
): asserts authorizationInput is ShowPackCommentaryAuthorization {
  let planInput: unknown
  try { planInput = JSON.parse(planRaw) } catch {
    throw new Error('commentary authorization plan is not valid JSON')
  }
  if (!isRecord(planInput)) throw new Error('commentary authorization plan must be an object')
  const plan = planInput as unknown as ShowPackCommentaryPlan
  if (!isRecord(authorizationInput)) throw new Error('commentary authorization must be an object')
  exactKeys(authorizationInput, [
    'authorization_version', 'artifact', 'target', 'plan_sha256', 'source_sha256',
    'authorized_request_ids', 'authorized_budget', 'note',
  ], 'commentary authorization')
  if (authorizationInput.authorization_version !== 1
    || authorizationInput.artifact !== 'show-pack-commentary-authorization') {
    throw new Error('commentary authorization identity is invalid')
  }
  if (!isRecord(authorizationInput.target)) throw new Error('commentary authorization target must be an object')
  exactKeys(authorizationInput.target, ['pack_id', 'pack_version'], 'commentary authorization target')
  const plannedIds = plan.jobs.map((job) => job.request_id)
  if (authorizationInput.target.pack_id !== plan.target.pack_id
    || authorizationInput.target.pack_version !== plan.target.pack_version
    || authorizationInput.plan_sha256 !== sha256Hex(planRaw)
    || authorizationInput.source_sha256 !== plan.source_sha256
    || !Array.isArray(authorizationInput.authorized_request_ids)
    || authorizationInput.authorized_request_ids.length !== plannedIds.length
    || authorizationInput.authorized_request_ids.some((id, index) => id !== plannedIds[index])
    || canonical(authorizationInput.authorized_budget) !== canonical(plan.budget)
    || typeof authorizationInput.note !== 'string'
    || authorizationInput.note.trim() === '') {
    throw new Error('commentary authorization does not match the current approved plan')
  }
}

/**
 * Publishes every eligible commentary request in source order. The input is
 * never mutated. A progress snapshot follows each completed request so a CLI
 * can checkpoint safely and resume after a later network or model failure.
 */
export async function publishShowPackCommentary(
  pack: ShowPack,
  generate: GroundedLineGenerator,
  options: CommentaryPublicationOptions,
): Promise<ShowPack> {
  const next = structuredClone(pack)
  const approvedPlan = options.approvedPlan
  const expected = buildShowPackCommentaryPlan(
    pack,
    approvedPlan.source_sha256,
    {
      retryBlocked: approvedPlan.retry_blocked,
      requestIds: approvedPlan.selected_request_ids ?? undefined,
      skipReadyRequestIds: true,
    },
  )
  assertShowPackCommentaryPlanCurrent(expected, approvedPlan)
  assertShowPackCommentaryAuthorizationCurrent(
    serializeShowPackCommentaryPlan(approvedPlan),
    options.authorization,
  )
  let jobIndex = 0

  for (const request of next.commentary_requests) {
    const selected = approvedPlan.selected_request_ids === null
      || approvedPlan.selected_request_ids.includes(request.id)
    const eligible = request.publication.status === 'pending'
      || (approvedPlan.retry_blocked && request.publication.status === 'blocked')
    if (!eligible || !selected) continue

    const context = buildShowPackCommentaryContext(next, request)
    const plannedJob = approvedPlan.jobs[jobIndex]
    jobIndex += 1
    const generationInput = {
      speaker: plannedJob.speaker,
      voice: plannedJob.voice,
      facts: [...plannedJob.facts],
      angle: plannedJob.angle,
    }
    const result = await generate({
      ...generationInput,
    })
    if (!result.text.trim()) throw new Error(`commentary ${request.id} generator returned no text`)
    if (!Number.isInteger(result.attempts) || result.attempts < 1) {
      throw new Error(`commentary ${request.id} generator returned an invalid attempt count`)
    }

    request.publication = {
      status: result.lastViolations.length === 0 ? 'ready' : 'blocked',
      text: result.text,
      grounding: {
        pipeline: GROUNDED_LINE_PIPELINE,
        prompt_contract_sha256: groundedLinePromptContractSha256(generationInput),
        speaker: context.speaker,
        voice_block: [...context.voice_block],
        fact_block: [...context.fact_block],
        angle_block: [...context.angle_block],
        attempts: result.attempts,
        residual_findings: [...result.lastViolations],
      },
    }
    options.onProgress?.(structuredClone(next))
  }

  return next
}
