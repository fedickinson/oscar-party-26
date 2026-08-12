import { describe, expect, it } from 'vitest'
import type { ShowPackCommentaryPlan } from './show-pack-commentary'
import {
  buildShowPackCommentaryAuthorization,
  renderShowPackCommentaryPlanReviewHtml,
  serializeShowPackCommentaryAuthorization,
  type ShowPackCommentaryAuthorizationTranscript,
} from './show-pack-commentary-authorization'
import { sha256Hex } from './sha256'
import { buildGroundedLinePromptContract } from './grounded-line-contract'

function plan(): ShowPackCommentaryPlan {
  const prompt = {
    speaker: 'witness',
    voice: 'Voice: Witness\nExpression instruction: Speak plainly.',
    facts: ['A fact happened.'],
    angle: 'State only its consequence.',
  }
  const contract = buildGroundedLinePromptContract(prompt)
  const jobs = ['line-one', 'line-two'].map((requestId) => ({
    request_id: requestId,
    publication_status: 'pending' as const,
    speaker: prompt.speaker,
    voice: prompt.voice,
    facts: [...prompt.facts],
    angle: prompt.angle,
    prompt_contract: structuredClone(contract),
  }))
  return {
    plan_version: 5,
    artifact: 'show-pack-commentary-plan',
    target: { pack_id: 'show-next', pack_version: 1 },
    source_sha256: 'a'.repeat(64),
    retry_blocked: false,
    selected_request_ids: null,
    budget: {
      budget_version: 1,
      input_token_estimate: null,
      currency_estimate: null,
      caveat: 'Token counts are configured output ceilings, not predicted usage or price.',
      first_pass: {
        generation_calls_max: 2, audit_calls_min: 0, audit_calls_max: 2,
        total_calls_min: 2, total_calls_max: 4, max_output_tokens: 1200,
      },
      worst_case: {
        generation_calls_max: 6, audit_calls_min: 0, audit_calls_max: 6,
        total_calls_min: 6, total_calls_max: 12, max_output_tokens: 3600,
      },
    },
    jobs,
  }
}

function transcript(
  value: ShowPackCommentaryPlan,
  selected = value.jobs.map((job) => job.request_id),
): ShowPackCommentaryAuthorizationTranscript {
  const planRaw = `${JSON.stringify(value, null, 2)}\n`
  return {
    transcript_version: 1,
    artifact: 'show-pack-commentary-authorization-transcript',
    target: { ...value.target },
    plan_sha256: sha256Hex(planRaw),
    acknowledged_request_ids: selected,
    acknowledged_budget: structuredClone(value.budget),
    note: 'Reviewed every selected prompt block, transport setting, retry bound, and spend ceiling.',
  }
}

describe('show-pack commentary authorization', () => {
  it('builds a deterministic authorization bound to the exact inspected plan', () => {
    const value = plan()
    const raw = `${JSON.stringify(value, null, 2)}\n`
    const authorization = buildShowPackCommentaryAuthorization(raw, transcript(value))

    expect(authorization).toEqual({
      authorization_version: 1,
      artifact: 'show-pack-commentary-authorization',
      target: value.target,
      plan_sha256: sha256Hex(raw),
      source_sha256: value.source_sha256,
      authorized_request_ids: ['line-one', 'line-two'],
      authorized_budget: value.budget,
      note: 'Reviewed every selected prompt block, transport setting, retry bound, and spend ceiling.',
    })
    expect(serializeShowPackCommentaryAuthorization(authorization)).toBe(
      serializeShowPackCommentaryAuthorization(authorization),
    )
  })

  it('rejects partial, reordered, stale, or broadened acknowledgements', () => {
    const value = plan()
    const raw = `${JSON.stringify(value, null, 2)}\n`
    expect(() => buildShowPackCommentaryAuthorization(raw, transcript(value, ['line-one'])))
      .toThrow('authorization must acknowledge every planned request in source order')
    expect(() => buildShowPackCommentaryAuthorization(raw, transcript(value, ['line-two', 'line-one'])))
      .toThrow('authorization must acknowledge every planned request in source order')

    const stale = transcript(value)
    stale.plan_sha256 = 'b'.repeat(64)
    expect(() => buildShowPackCommentaryAuthorization(raw, stale))
      .toThrow('authorization transcript plan hash does not match')

    const budget = transcript(value)
    budget.acknowledged_budget.worst_case.max_output_tokens += 1
    expect(() => buildShowPackCommentaryAuthorization(raw, budget))
      .toThrow('authorization transcript budget does not match the plan')
  })

  it('rejects empty work and blank human attestations', () => {
    const value = plan()
    value.jobs = []
    value.budget.first_pass = {
      generation_calls_max: 0, audit_calls_min: 0, audit_calls_max: 0,
      total_calls_min: 0, total_calls_max: 0, max_output_tokens: 0,
    }
    value.budget.worst_case = structuredClone(value.budget.first_pass)
    const raw = `${JSON.stringify(value, null, 2)}\n`
    expect(() => buildShowPackCommentaryAuthorization(raw, transcript(value)))
      .toThrow('commentary authorization requires at least one planned request')

    const nonempty = plan()
    const blank = transcript(nonempty)
    blank.note = '  '
    expect(() => buildShowPackCommentaryAuthorization(
      `${JSON.stringify(nonempty, null, 2)}\n`, blank,
    )).toThrow('commentary authorization note must be text')
  })

  it('rejects plans whose prompt contract or derived budget has drifted', () => {
    const contractDrift = plan()
    contractDrift.jobs[0].prompt_contract.max_retries += 1
    expect(() => buildShowPackCommentaryAuthorization(
      `${JSON.stringify(contractDrift, null, 2)}\n`, transcript(contractDrift),
    )).toThrow('commentary plan job 1 prompt contract is not canonical')

    const budgetDrift = plan()
    budgetDrift.budget.first_pass.max_output_tokens += 1
    expect(() => buildShowPackCommentaryAuthorization(
      `${JSON.stringify(budgetDrift, null, 2)}\n`, transcript(budgetDrift),
    )).toThrow('commentary plan budget is not canonical')
  })

  it('renders a standalone plan review desk without a model or network path', () => {
    const value = plan()
    const raw = `${JSON.stringify(value, null, 2)}\n`
    const html = renderShowPackCommentaryPlanReviewHtml(raw)

    expect(html.match(/class="job"/g)).toHaveLength(2)
    expect(html).toContain('2–4 calls')
    expect(html).toContain('6–12 calls')
    expect(html).toContain('3,600 output-token ceiling')
    expect(html).toContain('Download authorization transcript')
    expect(html).toContain('https://api.anthropic.com/v1/messages')
    expect(html).toContain('Initial generation request')
    expect(html).toContain('Audit request template')
    expect(html).toContain('Retry request template')
    expect(html).toContain('System prompt')
    expect(html).toContain('{{GENERATED_LINE}}')
    expect(html).toContain('{{AUDIT_FINDINGS}}')
    expect(html).toContain('&quot;thinking&quot;')
    expect(html).toContain('&quot;system_cache_control&quot;')
    expect(html).toContain("default-src 'none'")
    expect(html).not.toContain('fetch(')
    expect(html).not.toContain('--generate')
    expect(html).not.toContain(' src=')
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1]
    expect(script).toBeDefined()
    expect(() => new Function(script!)).not.toThrow()
  })
})
