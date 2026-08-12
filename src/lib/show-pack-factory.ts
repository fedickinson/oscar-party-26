import {
  compileShowPack,
  parseShowPack,
  type CommentaryPublication,
  type ShowPack,
} from './show-pack'
import {
  assertShowPackCommentaryAuthorizationCurrent,
  assertShowPackCommentaryPlanCurrent,
  buildShowPackCommentaryPlan,
  serializeShowPackCommentaryPlan,
  type ShowPackCommentaryAuthorization,
  type ShowPackCommentaryPlan,
} from './show-pack-commentary'
import { serializeShowPackCommentaryAuthorization } from './show-pack-commentary-authorization'
import { sha256Hex } from './sha256'

export type ShowPackFactoryStage =
  | 'awaiting_commentary_authorization'
  | 'blocked_grounding'
  | 'publishable'

export interface ShowPackFactoryStatus {
  factory_version: 1
  artifact: 'show-pack-factory-status'
  target: { pack_id: string; pack_version: number }
  stage: ShowPackFactoryStage
  retry_blocked: boolean
  working_sha256: string
  commentary: { pending: number; ready: number; blocked: number }
  commentary_plan_sha256: string | null
  compiled_sha256: string | null
}

export interface ShowPackFactoryRun {
  working: ShowPack
  working_raw: string
  plan: ShowPackCommentaryPlan | null
  compiled: ShowPack | null
  compiled_raw: string | null
  status: ShowPackFactoryStatus
}

export interface ShowPackFactoryContinuationAuthority {
  plan_raw: string
  authorization_raw: string
}

export interface ShowPackFactoryContinuationStep extends ShowPackFactoryContinuationAuthority {
  continuation_raw: string
}

function serializePack(pack: ShowPack): string {
  return `${JSON.stringify(pack, null, 2)}\n`
}

function publicationOnlyProjection(pack: ShowPack): unknown {
  return {
    ...pack,
    commentary_requests: pack.commentary_requests.map(({ publication: _publication, ...request }) => request),
  }
}

function samePublication(left: CommentaryPublication, right: CommentaryPublication): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function canonicalPack(raw: string, label: string): ShowPack {
  const pack = parseShowPack(raw)
  if (serializePack(pack) !== raw) throw new Error(`${label} bytes are not canonical`)
  return pack
}

function assertPublicationOnlyEvolution(base: ShowPack, continuation: ShowPack): void {
  if (JSON.stringify(publicationOnlyProjection(base))
    !== JSON.stringify(publicationOnlyProjection(continuation))) {
    throw new Error('factory continuation changed content outside commentary publications')
  }
  for (let index = 0; index < base.commentary_requests.length; index += 1) {
    const before = base.commentary_requests[index]
    const after = continuation.commentary_requests[index]
    if (before.publication.status === 'ready'
      && !samePublication(before.publication, after.publication)) {
      throw new Error(`factory continuation cannot replace ready commentary ${before.id}`)
    }
    if (before.publication.status === 'blocked' && after.publication.status === 'pending') {
      throw new Error(`factory continuation cannot discard blocked grounding evidence for ${before.id}`)
    }
  }
}

function parseJson(raw: string, label: string): unknown {
  try { return JSON.parse(raw) } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function acceptContinuation(
  base: ShowPack,
  steps: ShowPackFactoryContinuationStep[],
): ShowPack {
  if (steps.length === 0) throw new Error('factory continuation requires its exact commentary authority')
  let authoritySource = base
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]
    const label = `factory continuation step ${index + 1}`
    const authoritySourceRaw = serializePack(authoritySource)
    const continuation = canonicalPack(step.continuation_raw, label)
    assertPublicationOnlyEvolution(authoritySource, continuation)
    const planInput = parseJson(step.plan_raw, `${label} approved plan`)
    if (serializeShowPackCommentaryPlan(planInput as ShowPackCommentaryPlan) !== step.plan_raw) {
      throw new Error(`${label} approved plan bytes are not canonical`)
    }
    const plan = planInput as ShowPackCommentaryPlan
    const expectedPlan = buildShowPackCommentaryPlan(
      authoritySource,
      sha256Hex(authoritySourceRaw),
      {
        retryBlocked: plan.retry_blocked,
        requestIds: plan.selected_request_ids ?? undefined,
      },
    )
    assertShowPackCommentaryPlanCurrent(expectedPlan, planInput)
    const authorizationInput = parseJson(step.authorization_raw, `${label} authorization`)
    assertShowPackCommentaryAuthorizationCurrent(step.plan_raw, authorizationInput)
    if (serializeShowPackCommentaryAuthorization(
      authorizationInput as ShowPackCommentaryAuthorization,
    ) !== step.authorization_raw) {
      throw new Error(`${label} authorization bytes are not canonical`)
    }
    const changedIds = authoritySource.commentary_requests
      .filter((request, requestIndex) => !samePublication(
        request.publication,
        continuation.commentary_requests[requestIndex].publication,
      ))
      .map((request) => request.id)
    const plannedIds = plan.jobs.map((job) => job.request_id)
    if (changedIds.length === 0
      || changedIds.some((id, changedIndex) => id !== plannedIds[changedIndex])) {
      throw new Error(`${label} publication changes are not an authorized source-order prefix`)
    }
    authoritySource = continuation
  }
  return authoritySource
}

function commentaryCounts(pack: ShowPack): ShowPackFactoryStatus['commentary'] {
  const result = { pending: 0, ready: 0, blocked: 0 }
  for (const request of pack.commentary_requests) result[request.publication.status] += 1
  return result
}

export function runShowPackFactory(
  baseInput: ShowPack,
  options: {
    retryBlocked?: boolean
    continuationSteps?: ShowPackFactoryContinuationStep[]
  } = {},
): ShowPackFactoryRun {
  const base = parseShowPack(JSON.stringify(baseInput))
  const working = options.continuationSteps === undefined
    ? base
    : acceptContinuation(base, options.continuationSteps)
  const workingRaw = serializePack(working)
  const workingSha256 = sha256Hex(workingRaw)
  const commentary = commentaryCounts(working)
  const retryBlocked = options.retryBlocked === true
  const needsPlan = commentary.pending > 0 || (retryBlocked && commentary.blocked > 0)
  const plan = needsPlan
    ? buildShowPackCommentaryPlan(working, workingSha256, { retryBlocked })
    : null
  let stage: ShowPackFactoryStage
  let compiled: ShowPack | null = null
  let compiledRaw: string | null = null
  if (plan && plan.jobs.length > 0) {
    stage = 'awaiting_commentary_authorization'
  } else if (commentary.blocked > 0) {
    stage = 'blocked_grounding'
  } else {
    stage = 'publishable'
    compiled = compileShowPack(working)
    compiledRaw = serializePack(compiled)
  }
  const planRaw = plan ? serializeShowPackCommentaryPlan(plan) : null
  return {
    working,
    working_raw: workingRaw,
    plan,
    compiled,
    compiled_raw: compiledRaw,
    status: {
      factory_version: 1,
      artifact: 'show-pack-factory-status',
      target: { pack_id: working.pack.id, pack_version: working.pack.version },
      stage,
      retry_blocked: retryBlocked,
      working_sha256: workingSha256,
      commentary,
      commentary_plan_sha256: planRaw ? sha256Hex(planRaw) : null,
      compiled_sha256: compiledRaw ? sha256Hex(compiledRaw) : null,
    },
  }
}

export function serializeShowPackFactoryStatus(status: ShowPackFactoryStatus): string {
  return `${JSON.stringify(status, null, 2)}\n`
}
