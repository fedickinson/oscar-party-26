import { describe, expect, it, vi } from 'vitest'
import { buildGroundedLinePromptContract } from './grounded-line-contract'
import { buildShowPackCommentaryBudget } from './show-pack-commentary'
import type { SettlementDropQuoteGroundingPlan } from './settlement-drop-quote-grounding'
import {
  buildSettlementDropQuoteAuthorization,
  assertSettlementDropQuoteGroundingPlanCurrent,
  publishSettlementDropQuotes,
  renderSettlementDropQuoteAuthorizationReviewHtml,
  serializeSettlementDropQuoteAuthorization,
  type SettlementDropQuoteAuthorizationTranscript,
  type SettlementDropQuotePublicationCheckpoint,
} from './settlement-drop-quote-publication'
import { sha256Hex } from './sha256'

function fixture(): {
  plan: SettlementDropQuoteGroundingPlan
  planRaw: string
  transcript: SettlementDropQuoteAuthorizationTranscript
  authorizationRaw: string
} {
  const jobs: SettlementDropQuoteGroundingPlan['jobs'] = [
    {
      quote_key: 'opening::quote-1',
      beat_id: 'opening',
      speaker: 'The Reader',
      portrait_asset_id: 'reader',
      refs: [{ character_id: 'reader', name: 'The Reader' }],
      voice: 'Dry, exact, and observant.',
      facts: ['The room recorded one settled point.'],
      fact_warrants: [{
        text: 'The room recorded one settled point.',
        sources: [{ kind: 'settlement_record', ref: 'receipt.score_events[0]' }],
      }],
      angle: 'Name the consequence without adding an event.',
      prompt_contract: buildGroundedLinePromptContract({
        speaker: 'The Reader',
        voice: 'Dry, exact, and observant.',
        facts: ['The room recorded one settled point.'],
        angle: 'Name the consequence without adding an event.',
      }),
    },
    {
      quote_key: 'closing::quote-1',
      beat_id: 'closing',
      speaker: 'The Witness',
      portrait_asset_id: 'witness',
      refs: [{ character_id: 'witness', name: 'The Witness' }],
      voice: 'Plainspoken and restrained.',
      facts: ['The closing tally placed Asha first.'],
      fact_warrants: [{
        text: 'The closing tally placed Asha first.',
        sources: [{ kind: 'settlement_record', ref: 'receipt.standings[0]' }],
      }],
      angle: 'Close on the recorded order.',
      prompt_contract: buildGroundedLinePromptContract({
        speaker: 'The Witness',
        voice: 'Plainspoken and restrained.',
        facts: ['The closing tally placed Asha first.'],
        angle: 'Close on the recorded order.',
      }),
    },
  ]
  const plan: SettlementDropQuoteGroundingPlan = {
    plan_version: 1,
    artifact: 'settlement-drop-quote-grounding-plan',
    target: {
      room_code: 'TEST',
      settlement_id: '11111111-1111-4111-8111-111111111111',
      settlement_version: 1,
      manifest_hash: 'a'.repeat(64),
    },
    packet_sha256: 'b'.repeat(64),
    decisions_sha256: 'c'.repeat(64),
    budget: buildShowPackCommentaryBudget(jobs.map((job) => ({
      request_id: job.quote_key,
      publication_status: 'pending',
      speaker: job.speaker,
      voice: job.voice,
      facts: job.facts,
      angle: job.angle,
      prompt_contract: job.prompt_contract,
    }))),
    omissions: [{ quote_key: 'middle::quote-1', beat_id: 'middle', note: 'No factual warrant.' }],
    jobs,
  }
  const planRaw = `${JSON.stringify(plan, null, 2)}\n`
  const transcript: SettlementDropQuoteAuthorizationTranscript = {
    transcript_version: 1,
    artifact: 'settlement-drop-quote-authorization-transcript',
    target: structuredClone(plan.target),
    plan_sha256: sha256Hex(planRaw),
    acknowledged_job_ids: jobs.map((job) => job.quote_key),
    acknowledged_omission_ids: plan.omissions.map((row) => row.quote_key),
    acknowledged_budget: structuredClone(plan.budget),
    note: 'Authorize these exact two grounded jobs and the stated omission.',
  }
  const authorizationRaw = serializeSettlementDropQuoteAuthorization(
    buildSettlementDropQuoteAuthorization(planRaw, transcript),
  )
  return { plan, planRaw, transcript, authorizationRaw }
}

describe('settlement-drop quote authorization', () => {
  it('binds exact plan bytes, ordered jobs, omissions, and bounded spend', () => {
    const { plan, planRaw, transcript } = fixture()
    const authorization = buildSettlementDropQuoteAuthorization(planRaw, transcript)

    expect(authorization).toMatchObject({
      target: plan.target,
      plan_sha256: sha256Hex(planRaw),
      packet_sha256: plan.packet_sha256,
      decisions_sha256: plan.decisions_sha256,
      authorized_job_ids: plan.jobs.map((job) => job.quote_key),
      acknowledged_omission_ids: plan.omissions.map((row) => row.quote_key),
      authorized_budget: plan.budget,
    })
  })

  it('rejects a partial acknowledgement before any authority artifact exists', () => {
    const { planRaw, transcript } = fixture()
    transcript.acknowledged_job_ids = transcript.acknowledged_job_ids.slice(1)

    expect(() => buildSettlementDropQuoteAuthorization(planRaw, transcript))
      .toThrow(/job acknowledgements must exactly match source order/)
  })

  it('rejects an unvalidated object wearing a packet identity', () => {
    const { planRaw } = fixture()
    const packetRaw = `${JSON.stringify({
      packet_version: 1,
      artifact: 'settlement-drop-quote-grounding-review',
      target: {},
    }, null, 2)}\n`

    expect(() => assertSettlementDropQuoteGroundingPlanCurrent(planRaw, packetRaw, '{}\n'))
      .toThrow(/quote grounding packet/)
  })

  it('renders an offline, mobile-safe review that can only export a transcript', () => {
    const { planRaw } = fixture()
    const html = renderSettlementDropQuoteAuthorizationReviewHtml(planRaw)

    expect(html).toContain("default-src 'none'")
    expect(html).toContain('This page cannot call a model.')
    expect(html).toContain('min-height:48px')
    expect(html).toContain('font:16px/1.5')
    expect(html).toContain('padding:calc(env(safe-area-inset-top) + 36px) 18px calc(env(safe-area-inset-bottom) + 140px)')
    expect(html).toContain('receipt.score_events[0]')
    expect(html).toContain('acknowledged_omission_ids')
    expect(html).not.toMatch(/fetch\(|XMLHttpRequest|WebSocket/i)
  })

  it('authorizes and publishes an all-omitted plan without model spend', async () => {
    const value = fixture()
    value.plan.omissions = [
      ...value.plan.omissions,
      ...value.plan.jobs.map((job) => ({
        quote_key: job.quote_key,
        beat_id: job.beat_id,
        note: 'No factual warrant survives review.',
      })),
    ]
    value.plan.jobs = []
    value.plan.budget = buildShowPackCommentaryBudget([])
    const planRaw = `${JSON.stringify(value.plan, null, 2)}\n`
    const transcript: SettlementDropQuoteAuthorizationTranscript = {
      ...value.transcript,
      plan_sha256: sha256Hex(planRaw),
      acknowledged_job_ids: [],
      acknowledged_omission_ids: value.plan.omissions.map((row) => row.quote_key),
      acknowledged_budget: value.plan.budget,
      note: 'Authorize the exact zero-spend omission set.',
    }
    const authorizationRaw = serializeSettlementDropQuoteAuthorization(
      buildSettlementDropQuoteAuthorization(planRaw, transcript),
    )
    const generate = vi.fn()

    const result = await publishSettlementDropQuotes(planRaw, authorizationRaw, generate)

    expect(generate).not.toHaveBeenCalled()
    expect(result.publication).toMatchObject({ quotes: [], omissions: value.plan.omissions })
    expect(renderSettlementDropQuoteAuthorizationReviewHtml(planRaw)).toContain('var jobs=[]')
  })
})

describe('settlement-drop quote publication', () => {
  it('publishes compiler-ready quotes only when every grounding result is clean', async () => {
    const { plan, planRaw, authorizationRaw } = fixture()
    const generate = vi.fn()
      .mockResolvedValueOnce({ text: 'One point, entered and owned.', attempts: 1, lastViolations: [] })
      .mockResolvedValueOnce({ text: 'Asha leaves first in the only order that counts.', attempts: 2, lastViolations: [] })
    const progress = vi.fn()

    const result = await publishSettlementDropQuotes(planRaw, authorizationRaw, generate, {
      onProgress: progress,
    })

    expect(generate).toHaveBeenNthCalledWith(1, {
      speaker: plan.jobs[0].speaker,
      voice: plan.jobs[0].voice,
      facts: plan.jobs[0].facts,
      angle: plan.jobs[0].angle,
    })
    expect(progress).toHaveBeenCalledTimes(2)
    expect(result.checkpoint.jobs.map((row) => row.status)).toEqual(['ready', 'ready'])
    expect(result.publication?.quotes[0].manifest_quote).toEqual({
      speaker: 'The Reader',
      portrait_asset: 'reader',
      refs: ['The Reader'],
      text: 'One point, entered and owned.',
      grounding: {
        pipeline: 'scripts/grounded-line.mts',
        fact_block: ['The room recorded one settled point.'],
        attempts: 1,
        residual_findings: [],
      },
    })
    expect(result.publication?.quotes[0].provenance).toMatchObject({
      refs: plan.jobs[0].refs,
      fact_warrants: plan.jobs[0].fact_warrants,
    })
  })

  it('preserves residual findings as blocked output and refuses a complete publication', async () => {
    const { planRaw, authorizationRaw } = fixture()
    const result = await publishSettlementDropQuotes(
      planRaw,
      authorizationRaw,
      vi.fn()
        .mockResolvedValueOnce({ text: 'A claim needing review.', attempts: 3, lastViolations: ['Unsupported claim.'] })
        .mockResolvedValueOnce({ text: 'Asha finished first.', attempts: 1, lastViolations: [] }),
    )

    expect(result.publication).toBeNull()
    expect(result.checkpoint.jobs[0]).toMatchObject({
      status: 'blocked',
      publication: {
        manifest_quote: { grounding: { residual_findings: ['Unsupported claim.'] } },
      },
    })
  })

  it('resumes pending jobs after a crash without repeating completed model spend', async () => {
    const { planRaw, authorizationRaw } = fixture()
    let saved: SettlementDropQuotePublicationCheckpoint | undefined
    await expect(publishSettlementDropQuotes(
      planRaw,
      authorizationRaw,
      vi.fn()
        .mockResolvedValueOnce({ text: 'The first line is settled.', attempts: 1, lastViolations: [] })
        .mockRejectedValueOnce(new Error('network interrupted')),
      { onProgress: (checkpoint) => { saved = checkpoint } },
    )).rejects.toThrow('network interrupted')

    expect(saved?.jobs.map((row) => row.status)).toEqual(['ready', 'pending'])
    const resumedGenerate = vi.fn().mockResolvedValue({
      text: 'Asha finished first.', attempts: 1, lastViolations: [],
    })
    const resumed = await publishSettlementDropQuotes(planRaw, authorizationRaw, resumedGenerate, {
      checkpoint: saved,
    })

    expect(resumedGenerate).toHaveBeenCalledTimes(1)
    expect(resumedGenerate).toHaveBeenCalledWith(expect.objectContaining({ speaker: 'The Witness' }))
    expect(resumed.publication?.quotes.map((quote) => quote.manifest_quote.text)).toEqual([
      'The first line is settled.',
      'Asha finished first.',
    ])
  })

  it('rejects a tampered ready checkpoint before generation', async () => {
    const { planRaw, authorizationRaw } = fixture()
    const first = await publishSettlementDropQuotes(
      planRaw,
      authorizationRaw,
      vi.fn()
        .mockResolvedValueOnce({ text: 'One point is settled.', attempts: 1, lastViolations: [] })
        .mockResolvedValueOnce({ text: 'Asha finished first.', attempts: 1, lastViolations: [] }),
    )
    const checkpoint = structuredClone(first.checkpoint)
    checkpoint.jobs[0].publication!.manifest_quote.speaker = 'An Intruder'
    const generate = vi.fn()

    await expect(publishSettlementDropQuotes(planRaw, authorizationRaw, generate, { checkpoint }))
      .rejects.toThrow(/identity does not match the authorized job/)
    expect(generate).not.toHaveBeenCalled()
  })

  it('rejects stale or noncanonical authorization bytes before generation', async () => {
    const { planRaw, authorizationRaw } = fixture()
    const generate = vi.fn()

    await expect(publishSettlementDropQuotes(planRaw, ` ${authorizationRaw}`, generate))
      .rejects.toThrow(/authorization bytes are not canonical/)
    expect(generate).not.toHaveBeenCalled()
  })
})
