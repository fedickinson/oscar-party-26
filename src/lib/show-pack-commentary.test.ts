import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { compileShowPack, parseShowPack, type ShowPack } from './show-pack'
import {
  buildShowPackCommentaryPlan,
  assertShowPackCommentaryPlanCurrent,
  publishShowPackCommentary,
  serializeShowPackCommentaryPlan,
} from './show-pack-commentary'
import { sha256Hex } from './sha256'

function packWithRequests(count = 1): ShowPack {
  const raw = JSON.parse(
    readFileSync(new URL('../../show-packs/examples/hotd-s3e8-proof.json', import.meta.url), 'utf8'),
  )
  raw.commentary_voices = [{
    id: 'cersei',
    name: 'Cersei',
    instruction: 'Judge power with clipped contempt and political precision.',
    attitude_claim_ids: ['source-chronicle-dragon-bonds'],
  }]
  raw.commentary_requests = Array.from({ length: count }, (_, index) => ({
    id: `aegon-commentary-${index + 1}`,
    speaker: 'cersei',
    fact_claim_ids: ['aegon-alive-after-episode-seven'],
    angle_claim_ids: ['sunfyre-reunion-audience-favorite'],
    angle: 'Judge the political use of the bond without inventing a new scene event.',
    publication: { status: 'pending' },
  }))
  return parseShowPack(JSON.stringify(raw))
}

function planFor(pack: ShowPack, retryBlocked = false) {
  return buildShowPackCommentaryPlan(pack, 'a'.repeat(64), { retryBlocked })
}

function authorizationFor(plan: ReturnType<typeof planFor>) {
  return {
    authorization_version: 1 as const,
    artifact: 'show-pack-commentary-authorization' as const,
    target: { ...plan.target },
    plan_sha256: sha256Hex(serializeShowPackCommentaryPlan(plan)),
    source_sha256: plan.source_sha256,
    authorized_request_ids: plan.jobs.map((job) => job.request_id),
    authorized_budget: structuredClone(plan.budget),
    note: 'Test authorization for the exact planned jobs and spend envelope.',
  }
}

function publicationOptions(plan: ReturnType<typeof planFor>) {
  return { approvedPlan: plan, authorization: authorizationFor(plan) }
}

describe('show-pack commentary publication', () => {
  it('builds a deterministic hash-bound plan from the exact generator inputs', () => {
    const pack = packWithRequests(2)
    const plan = buildShowPackCommentaryPlan(pack, 'a'.repeat(64))

    expect(plan).toMatchObject({
      plan_version: 5,
      artifact: 'show-pack-commentary-plan',
      target: { pack_id: pack.pack.id, pack_version: pack.pack.version },
      source_sha256: 'a'.repeat(64),
      retry_blocked: false,
      selected_request_ids: null,
      budget: {
        budget_version: 1,
        input_token_estimate: null,
        currency_estimate: null,
        caveat: 'Token counts are configured output ceilings, not predicted usage or price.',
        first_pass: {
          generation_calls_max: 2,
          audit_calls_min: 0,
          audit_calls_max: 2,
          total_calls_min: 2,
          total_calls_max: 4,
          max_output_tokens: 1200,
        },
        worst_case: {
          generation_calls_max: 6,
          audit_calls_min: 0,
          audit_calls_max: 6,
          total_calls_min: 6,
          total_calls_max: 12,
          max_output_tokens: 3600,
        },
      },
    })
    expect(plan.jobs).toHaveLength(2)
    expect(plan.jobs[0]).toEqual({
      request_id: 'aegon-commentary-1',
      publication_status: 'pending',
      speaker: 'cersei',
      voice: [
        'Voice: Cersei',
        'Expression instruction: Judge power with clipped contempt and political precision.',
        'Source-material attitude: The source chronicle treats dragon bonds as politically consequential.',
      ].join('\n'),
      facts: ['Aegon was alive at the end of Episode 7 and had reunited with Sunfyre.'],
      angle: [
        'Judge the political use of the bond without inventing a new scene event.',
        'Audience discourse: The Aegon and Sunfyre reunion was one of the season\'s strongest audience-approval moments.',
      ].join('\n'),
      prompt_contract: expect.objectContaining({
        contract_version: 1,
        pipeline: 'scripts/grounded-line.mts',
        length_hint: 'One or two short sentences.',
        max_retries: 2,
        transport: expect.objectContaining({
          provider: 'anthropic',
          api_version: '2023-06-01',
        }),
      }),
    })
    expect(plan.jobs[0].prompt_contract.initial_model_request).toMatchObject({
      model: 'claude-sonnet-5',
      maxTokens: 300,
    })
    expect(plan.jobs[0].prompt_contract.initial_model_request.user).toContain(
      'SCENE FACTS (exhaustive — the scene contains these events and NO others):\n1. Aegon was alive',
    )
    expect(plan.jobs[0].prompt_contract.audit_model_request_template.user).toContain(
      'LINE OF COMMENTARY:\n"{{GENERATED_LINE}}"',
    )
    expect(plan.jobs[0].prompt_contract.retry_model_request_template.user).toContain(
      'PREVIOUS ATTEMPT WAS REJECTED for implying events not in the facts: {{AUDIT_FINDINGS}}.',
    )
    const serialized = serializeShowPackCommentaryPlan(plan)
    expect(serialized).toContain('"artifact": "show-pack-commentary-plan"')
    expect(serialized).toContain('"request_id": "aegon-commentary-2"')
    expect(serializeShowPackCommentaryPlan(plan)).toBe(serialized)
  })

  it('plans blocked requests only when retry is explicitly selected', () => {
    const pack = packWithRequests(2)
    pack.commentary_requests[0].publication = {
      status: 'ready', text: 'Ready.', grounding: {
        pipeline: 'scripts/grounded-line.mts', speaker: 'cersei',
        voice_block: [], fact_block: [], angle_block: [], attempts: 1, residual_findings: [],
      },
    }
    pack.commentary_requests[1].publication = {
      status: 'blocked', text: 'Blocked.', grounding: {
        pipeline: 'scripts/grounded-line.mts', speaker: 'cersei',
        voice_block: [], fact_block: [], angle_block: [], attempts: 3,
        residual_findings: ['Unsupported implication.'],
      },
    }

    const withoutRetry = buildShowPackCommentaryPlan(pack, 'a'.repeat(64))
    expect(withoutRetry.jobs).toEqual([])
    expect(withoutRetry.budget.worst_case.total_calls_max).toBe(0)
    const withRetry = buildShowPackCommentaryPlan(pack, 'a'.repeat(64), { retryBlocked: true })
    expect(withRetry.jobs).toHaveLength(1)
    expect(withRetry.budget).toMatchObject({
      first_pass: { total_calls_min: 1, total_calls_max: 2, max_output_tokens: 600 },
      worst_case: { total_calls_min: 3, total_calls_max: 6, max_output_tokens: 1800 },
    })
  })

  it('plans an explicit request subset in source order and budgets only that subset', () => {
    const pack = packWithRequests(3)
    const plan = buildShowPackCommentaryPlan(pack, 'a'.repeat(64), {
      requestIds: ['aegon-commentary-3', 'aegon-commentary-1'],
    })

    expect(plan.selected_request_ids).toEqual([
      'aegon-commentary-1',
      'aegon-commentary-3',
    ])
    expect(plan.jobs.map((job) => job.request_id)).toEqual([
      'aegon-commentary-1',
      'aegon-commentary-3',
    ])
    expect(plan.budget.first_pass).toMatchObject({
      total_calls_min: 2,
      total_calls_max: 4,
      max_output_tokens: 1200,
    })
  })

  it('rejects duplicate, unknown, and ineligible explicit request selections', () => {
    const pack = packWithRequests(2)
    expect(() => buildShowPackCommentaryPlan(pack, 'a'.repeat(64), {
      requestIds: ['aegon-commentary-1', 'aegon-commentary-1'],
    })).toThrow('commentary request selection contains duplicate id')
    expect(() => buildShowPackCommentaryPlan(pack, 'a'.repeat(64), {
      requestIds: ['missing'],
    })).toThrow('commentary request selection references unknown id missing')

    pack.commentary_requests[0].publication = {
      status: 'ready', text: 'Ready.', grounding: {
        pipeline: 'scripts/grounded-line.mts', speaker: 'cersei',
        voice_block: [], fact_block: [], angle_block: [], attempts: 1, residual_findings: [],
      },
    }
    expect(() => buildShowPackCommentaryPlan(pack, 'a'.repeat(64), {
      requestIds: ['aegon-commentary-1'],
    })).toThrow('commentary request selection is not eligible: aegon-commentary-1')

    const resumePlan = buildShowPackCommentaryPlan(pack, 'a'.repeat(64), {
      requestIds: ['aegon-commentary-1', 'aegon-commentary-2'],
      skipReadyRequestIds: true,
    })
    expect(resumePlan.selected_request_ids).toEqual(['aegon-commentary-2'])
    expect(resumePlan.jobs.map((job) => job.request_id)).toEqual(['aegon-commentary-2'])
    const generate = vi.fn(async () => ({
      text: 'Only the remaining line.', attempts: 1, lastViolations: [],
    }))
    expect(publishShowPackCommentary(pack, generate, publicationOptions(resumePlan)))
      .resolves.toMatchObject({
        commentary_requests: [
          { publication: { status: 'ready' } },
          { publication: { status: 'ready' } },
        ],
      })
  })

  it('publishes only the explicitly approved request subset', async () => {
    const pack = packWithRequests(3)
    const plan = buildShowPackCommentaryPlan(pack, 'a'.repeat(64), {
      requestIds: ['aegon-commentary-3', 'aegon-commentary-1'],
    })
    const generate = vi.fn(async ({ speaker }: { speaker: string }) => ({
      text: `${speaker} stays inside the record.`,
      attempts: 1,
      lastViolations: [],
    }))

    const published = await publishShowPackCommentary(pack, generate, publicationOptions(plan))

    expect(generate).toHaveBeenCalledTimes(2)
    expect(published.commentary_requests.map((request) => request.publication.status)).toEqual([
      'ready',
      'pending',
      'ready',
    ])
    expect(published.commentary_requests[1]).toEqual(pack.commentary_requests[1])
  })

  it('rejects an invalid source digest for a commentary plan', () => {
    expect(() => buildShowPackCommentaryPlan(packWithRequests(), 'not-a-digest'))
      .toThrow('commentary plan source SHA-256')
  })

  it('binds generation to the exact inspected plan regardless of JSON key order', () => {
    const pack = packWithRequests()
    const expected = buildShowPackCommentaryPlan(pack, 'a'.repeat(64))
    const reordered = {
      jobs: structuredClone(expected.jobs),
      retry_blocked: expected.retry_blocked,
      source_sha256: expected.source_sha256,
      target: structuredClone(expected.target),
      budget: structuredClone(expected.budget),
      selected_request_ids: expected.selected_request_ids,
      artifact: expected.artifact,
      plan_version: expected.plan_version,
    }

    expect(() => assertShowPackCommentaryPlanCurrent(expected, reordered)).not.toThrow()

    const drifted = structuredClone(expected)
    drifted.jobs[0].angle = 'A changed angle.'
    expect(() => assertShowPackCommentaryPlanCurrent(expected, drifted))
      .toThrow('approved commentary plan does not match the current generation inputs')

    expect(() => assertShowPackCommentaryPlanCurrent(expected, {
      ...reordered,
      unreviewed_extra: true,
    })).toThrow('approved commentary plan does not match the current generation inputs')
  })

  it('executes the exact validated plan job and rejects drift before generation', async () => {
    const pack = packWithRequests()
    const plan = buildShowPackCommentaryPlan(pack, 'a'.repeat(64))
    const inspected = JSON.parse(serializeShowPackCommentaryPlan(plan)) as typeof plan
    const generate = vi.fn(async () => ({
      text: 'A living king remains a political fact.',
      attempts: 1,
      lastViolations: [],
    }))

    await publishShowPackCommentary(pack, generate, publicationOptions(inspected))
    expect(generate).toHaveBeenCalledWith({
      speaker: inspected.jobs[0].speaker,
      voice: inspected.jobs[0].voice,
      facts: inspected.jobs[0].facts,
      angle: inspected.jobs[0].angle,
    })

    const drifted = structuredClone(inspected)
    drifted.jobs[0].prompt_contract.initial_model_request.system = 'Changed after review.'
    await expect(publishShowPackCommentary(pack, generate, publicationOptions(drifted)))
      .rejects.toThrow('approved commentary plan does not match')
    expect(generate).toHaveBeenCalledTimes(1)
  })

  it('rejects missing or stale authorization before invoking the generator', async () => {
    const pack = packWithRequests()
    const plan = planFor(pack)
    const generate = vi.fn(async () => ({
      text: 'This must not run.', attempts: 1, lastViolations: [],
    }))

    await expect(publishShowPackCommentary(pack, generate, {
      approvedPlan: plan,
      authorization: undefined as never,
    })).rejects.toThrow('commentary authorization must be an object')
    expect(generate).not.toHaveBeenCalled()

    const stale = authorizationFor(plan)
    stale.authorized_request_ids = []
    await expect(publishShowPackCommentary(pack, generate, {
      approvedPlan: plan,
      authorization: stale,
    })).rejects.toThrow('commentary authorization does not match the current approved plan')
    expect(generate).not.toHaveBeenCalled()
  })

  it('turns pending prose into an exactly stamped ready publication', async () => {
    const pack = packWithRequests()
    const approvedPlan = planFor(pack)
    const generate = vi.fn(async () => ({
      text: 'A living king and a loyal dragon remain a political fact.',
      attempts: 2,
      lastViolations: [],
    }))
    const progress = vi.fn()

    const published = await publishShowPackCommentary(pack, generate, {
      approvedPlan,
      authorization: authorizationFor(approvedPlan),
      onProgress: progress,
    })

    expect(generate).toHaveBeenCalledWith({
      speaker: 'cersei',
      voice: [
        'Voice: Cersei',
        'Expression instruction: Judge power with clipped contempt and political precision.',
        'Source-material attitude: The source chronicle treats dragon bonds as politically consequential.',
      ].join('\n'),
      facts: ['Aegon was alive at the end of Episode 7 and had reunited with Sunfyre.'],
      angle: [
        'Judge the political use of the bond without inventing a new scene event.',
        'Audience discourse: The Aegon and Sunfyre reunion was one of the season\'s strongest audience-approval moments.',
      ].join('\n'),
    })
    expect(published.commentary_requests[0].publication).toEqual({
      status: 'ready',
      text: 'A living king and a loyal dragon remain a political fact.',
      grounding: {
        pipeline: 'scripts/grounded-line.mts',
        prompt_contract_sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        speaker: 'cersei',
        voice_block: [
          'Voice: Cersei',
          'Expression instruction: Judge power with clipped contempt and political precision.',
          'Source-material attitude: The source chronicle treats dragon bonds as politically consequential.',
        ],
        fact_block: ['Aegon was alive at the end of Episode 7 and had reunited with Sunfyre.'],
        angle_block: [
          'Judge the political use of the bond without inventing a new scene event.',
          'Audience discourse: The Aegon and Sunfyre reunion was one of the season\'s strongest audience-approval moments.',
        ],
        attempts: 2,
        residual_findings: [],
      },
    })
    expect(pack.commentary_requests[0].publication.status).toBe('pending')
    expect(progress).toHaveBeenCalledTimes(1)
    expect(() => compileShowPack(published)).not.toThrow()

    published.commentary_requests[0].publication.grounding!.prompt_contract_sha256 = '0'.repeat(64)
    expect(() => compileShowPack(published)).toThrow(
      'grounding prompt_contract_sha256 does not match its grounded-line contract',
    )
  })

  it('records residual findings as blocked instead of blessing the line', async () => {
    const pack = packWithRequests()
    const published = await publishShowPackCommentary(pack, async () => ({
      text: 'The dragon burned the court.',
      attempts: 3,
      lastViolations: ['No burning is present in the fact block.'],
    }), publicationOptions(planFor(pack)))

    expect(published.commentary_requests[0].publication.status).toBe('blocked')
    expect(() => compileShowPack(published)).toThrow('blocked by residual grounding findings')
  })

  it('checkpoints completed requests before a later generator failure', async () => {
    const progress = vi.fn()
    let call = 0
    const pack = packWithRequests(2)
    await expect(publishShowPackCommentary(pack, async () => {
      call += 1
      if (call === 2) throw new Error('network unavailable')
      return { text: 'Grounded first line.', attempts: 1, lastViolations: [] }
    }, {
      approvedPlan: planFor(pack),
      authorization: authorizationFor(planFor(pack)),
      onProgress: progress,
    })).rejects.toThrow('network unavailable')

    expect(progress).toHaveBeenCalledTimes(1)
    const checkpoint = progress.mock.calls[0][0] as ShowPack
    expect(checkpoint.commentary_requests[0].publication.status).toBe('ready')
    expect(checkpoint.commentary_requests[1].publication.status).toBe('pending')
  })
})
