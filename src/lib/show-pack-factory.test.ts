import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseShowPack, type ShowPack } from './show-pack'
import {
  buildShowPackCommentaryPlan,
  publishShowPackCommentary,
  serializeShowPackCommentaryPlan,
} from './show-pack-commentary'
import {
  runShowPackFactory,
  serializeShowPackFactoryStatus,
} from './show-pack-factory'
import { sha256Hex } from './sha256'

function authoringPack(): ShowPack {
  const raw = JSON.parse(readFileSync(
    new URL('../../show-packs/examples/hotd-s3e8-proof.json', import.meta.url),
    'utf8',
  ))
  raw.commentary_requests = [{
    id: 'aegon-commentary',
    speaker: 'cersei',
    fact_claim_ids: ['aegon-alive-after-episode-seven'],
    angle_claim_ids: ['sunfyre-reunion-audience-favorite'],
    angle: 'Judge the political use of the bond without inventing a new scene event.',
    publication: { status: 'pending' },
  }]
  return parseShowPack(JSON.stringify(raw))
}

function canonical(pack: ShowPack): string {
  return `${JSON.stringify(pack, null, 2)}\n`
}

function authorization(plan: ReturnType<typeof buildShowPackCommentaryPlan>) {
  return {
    authorization_version: 1 as const,
    artifact: 'show-pack-commentary-authorization' as const,
    target: { ...plan.target },
    plan_sha256: sha256Hex(serializeShowPackCommentaryPlan(plan)),
    source_sha256: plan.source_sha256,
    authorized_request_ids: plan.jobs.map((job) => job.request_id),
    authorized_budget: structuredClone(plan.budget),
    note: 'Test authority for the exact plan and bounded spend envelope.',
  }
}

function continuationAuthority(
  plan: ReturnType<typeof buildShowPackCommentaryPlan>,
) {
  return {
    plan_raw: serializeShowPackCommentaryPlan(plan),
    authorization_raw: `${JSON.stringify(authorization(plan), null, 2)}\n`,
  }
}

function continuationStep(
  continuation: ShowPack,
  plan: ReturnType<typeof buildShowPackCommentaryPlan>,
) {
  return { continuation_raw: canonical(continuation), ...continuationAuthority(plan) }
}

describe('show-pack factory', () => {
  it('compiles immediately when the pack has no commentary work', () => {
    const pack = authoringPack()
    pack.commentary_requests = []

    const run = runShowPackFactory(pack)

    expect(run.status.stage).toBe('publishable')
    expect(run.status.commentary).toEqual({ pending: 0, ready: 0, blocked: 0 })
    expect(run.plan).toBeNull()
    expect(run.compiled).not.toBeNull()
  })

  it('emits one deterministic authorization doorway for pending commentary', () => {
    const pack = authoringPack()
    const run = runShowPackFactory(pack)

    expect(run.status.stage).toBe('awaiting_commentary_authorization')
    expect(run.status.commentary).toEqual({ pending: 1, ready: 0, blocked: 0 })
    expect(run.plan?.jobs.map((job) => job.request_id)).toEqual(['aegon-commentary'])
    expect(run.compiled).toBeNull()
    expect(run.status.working_sha256).toBe(sha256Hex(run.working_raw))
    expect(run.status.commentary_plan_sha256).toBe(
      sha256Hex(serializeShowPackCommentaryPlan(run.plan!)),
    )
    expect(serializeShowPackFactoryStatus(run.status)).toBe(
      serializeShowPackFactoryStatus(run.status),
    )
  })

  it('accepts a publication-only continuation and compiles when every line is ready', async () => {
    const pack = authoringPack()
    const first = runShowPackFactory(pack)
    const published = await publishShowPackCommentary(pack, async () => ({
      text: 'A living king remains inside the settled record.',
      attempts: 1,
      lastViolations: [],
    }), {
      approvedPlan: first.plan!,
      authorization: authorization(first.plan!),
    })

    const resumed = runShowPackFactory(pack, {
      continuationSteps: [continuationStep(published, first.plan!)],
    })

    expect(resumed.status.stage).toBe('publishable')
    expect(resumed.status.commentary).toEqual({ pending: 0, ready: 1, blocked: 0 })
    expect(resumed.plan).toBeNull()
    expect(resumed.compiled).not.toBeNull()
    expect(resumed.status.compiled_sha256).toBe(sha256Hex(resumed.compiled_raw!))
  })

  it('rejects continuation edits outside commentary publication records', () => {
    const pack = authoringPack()
    const edited = structuredClone(pack)
    edited.claims[0].text = 'An edited fact.'

    expect(() => runShowPackFactory(pack, {
      continuationSteps: [{
        continuation_raw: canonical(edited),
        plan_raw: '',
        authorization_raw: '',
      }],
    }))
      .toThrow('factory continuation changed content outside commentary publications')
  })

  it('rejects fabricated publication records that do not match the canonical grounding context', () => {
    const pack = authoringPack()
    const fabricated = structuredClone(pack)
    fabricated.commentary_requests[0].publication = {
      status: 'ready',
      text: 'A fabricated line.',
      grounding: {
        pipeline: 'scripts/grounded-line.mts',
        prompt_contract_sha256: 'a'.repeat(64),
        speaker: 'cersei',
        voice_block: [],
        fact_block: [],
        angle_block: [],
        attempts: 1,
        residual_findings: [],
      },
    }

    expect(() => runShowPackFactory(pack, {
      continuationSteps: [{
        continuation_raw: canonical(fabricated),
        plan_raw: '',
        authorization_raw: '',
      }],
    }))
      .toThrow()
  })

  it('requires the exact reviewed plan and authorization for publication changes', async () => {
    const pack = authoringPack()
    const first = runShowPackFactory(pack)
    const published = await publishShowPackCommentary(pack, async () => ({
      text: 'A grounded line.', attempts: 1, lastViolations: [],
    }), {
      approvedPlan: first.plan!, authorization: authorization(first.plan!),
    })

    expect(() => runShowPackFactory(pack, { continuationSteps: [] }))
      .toThrow('factory continuation requires its exact commentary authority')

    const stalePlan = structuredClone(first.plan!)
    stalePlan.jobs[0].angle = 'A changed angle.'
    expect(() => runShowPackFactory(pack, {
      continuationSteps: [{
        continuation_raw: canonical(published),
        plan_raw: serializeShowPackCommentaryPlan(stalePlan),
        authorization_raw: `${JSON.stringify(authorization(stalePlan), null, 2)}\n`,
      }],
    })).toThrow('approved commentary plan does not match the current generation inputs')
  })

  it('stops on residual findings and opens a bounded retry only when requested', async () => {
    const pack = authoringPack()
    const first = runShowPackFactory(pack)
    const blocked = await publishShowPackCommentary(pack, async () => ({
      text: 'An unsupported event happened.',
      attempts: 3,
      lastViolations: ['The event is absent from the exhaustive fact block.'],
    }), {
      approvedPlan: first.plan!,
      authorization: authorization(first.plan!),
    })

    const stopped = runShowPackFactory(pack, {
      continuationSteps: [continuationStep(blocked, first.plan!)],
    })
    expect(stopped.status.stage).toBe('blocked_grounding')
    expect(stopped.plan).toBeNull()
    expect(stopped.compiled).toBeNull()

    const retry = runShowPackFactory(pack, {
      retryBlocked: true,
      continuationSteps: [continuationStep(blocked, first.plan!)],
    })
    expect(retry.status.stage).toBe('awaiting_commentary_authorization')
    expect(retry.plan?.jobs).toEqual(expect.arrayContaining([
      expect.objectContaining({ request_id: 'aegon-commentary', publication_status: 'blocked' }),
    ]))
    expect(retry.compiled).toBeNull()
  })

  it('plans remaining pending lines without silently retrying a blocked line', async () => {
    const pack = authoringPack()
    pack.commentary_requests.push({
      ...structuredClone(pack.commentary_requests[0]),
      id: 'second-commentary',
    })
    const first = runShowPackFactory(pack)
    const partialPlan = buildShowPackCommentaryPlan(pack, first.status.working_sha256, {
      requestIds: ['aegon-commentary'],
    })
    const partial = await publishShowPackCommentary(pack, async () => ({
      text: 'An unsupported event happened.',
      attempts: 3,
      lastViolations: ['The event is absent from the exhaustive fact block.'],
    }), {
      approvedPlan: partialPlan,
      authorization: authorization(partialPlan),
    })

    const resumed = runShowPackFactory(pack, {
      continuationSteps: [continuationStep(partial, partialPlan)],
    })

    expect(resumed.status.commentary).toEqual({ pending: 1, ready: 0, blocked: 1 })
    expect(resumed.status.stage).toBe('awaiting_commentary_authorization')
    expect(resumed.plan?.jobs.map((job) => job.request_id)).toEqual(['second-commentary'])
  })

  it('accepts an interrupted publisher checkpoint only as an authorized source-order prefix', async () => {
    const pack = authoringPack()
    pack.commentary_requests.push({
      ...structuredClone(pack.commentary_requests[0]),
      id: 'second-commentary',
    })
    const first = runShowPackFactory(pack)
    const checkpoint = await publishShowPackCommentary(pack, async () => ({
      text: 'First grounded line.', attempts: 1, lastViolations: [],
    }), {
      approvedPlan: buildShowPackCommentaryPlan(pack, first.status.working_sha256, {
        requestIds: ['aegon-commentary'],
      }),
      authorization: authorization(buildShowPackCommentaryPlan(pack, first.status.working_sha256, {
        requestIds: ['aegon-commentary'],
      })),
    })

    expect(() => runShowPackFactory(pack, {
      continuationSteps: [continuationStep(checkpoint, first.plan!)],
    })).not.toThrow()

    const secondOnly = structuredClone(checkpoint)
    secondOnly.commentary_requests[0].publication = { status: 'pending' }
    secondOnly.commentary_requests[1].publication = checkpoint.commentary_requests[0].publication
    expect(() => runShowPackFactory(pack, {
      continuationSteps: [continuationStep(secondOnly, first.plan!)],
    })).toThrow('publication changes are not an authorized source-order prefix')
  })

  it('replays every authority step across multiple grounded checkpoints', async () => {
    const pack = authoringPack()
    pack.commentary_requests.push({
      ...structuredClone(pack.commentary_requests[0]),
      id: 'second-commentary',
    })
    const baseRun = runShowPackFactory(pack)
    const firstPlan = buildShowPackCommentaryPlan(pack, baseRun.status.working_sha256, {
      requestIds: ['aegon-commentary'],
    })
    const firstCheckpoint = await publishShowPackCommentary(pack, async () => ({
      text: 'First grounded line.', attempts: 1, lastViolations: [],
    }), { approvedPlan: firstPlan, authorization: authorization(firstPlan) })
    const firstRun = runShowPackFactory(pack, {
      continuationSteps: [continuationStep(firstCheckpoint, firstPlan)],
    })
    const secondPlan = firstRun.plan!
    const secondCheckpoint = await publishShowPackCommentary(firstCheckpoint, async () => ({
      text: 'Second grounded line.', attempts: 1, lastViolations: [],
    }), { approvedPlan: secondPlan, authorization: authorization(secondPlan) })

    const complete = runShowPackFactory(pack, {
      continuationSteps: [
        continuationStep(firstCheckpoint, firstPlan),
        continuationStep(secondCheckpoint, secondPlan),
      ],
    })
    expect(complete.status.stage).toBe('publishable')
    expect(complete.status.commentary).toEqual({ pending: 0, ready: 2, blocked: 0 })

    expect(() => runShowPackFactory(pack, {
      continuationSteps: [continuationStep(secondCheckpoint, secondPlan)],
    })).toThrow('approved commentary plan does not match the current generation inputs')
  })

  it('rejects noncanonical continuation bytes and ready-publication rollback', async () => {
    const pack = authoringPack()
    expect(() => runShowPackFactory(pack, {
      continuationSteps: [{
        continuation_raw: JSON.stringify(pack),
        plan_raw: '',
        authorization_raw: '',
      }],
    })).toThrow('factory continuation step 1 bytes are not canonical')

    const first = runShowPackFactory(pack)
    const published = await publishShowPackCommentary(pack, async () => ({
      text: 'A grounded line.', attempts: 1, lastViolations: [],
    }), {
      approvedPlan: first.plan!, authorization: authorization(first.plan!),
    })
    const readyBase = structuredClone(published)
    const rolledBack = structuredClone(published)
    rolledBack.commentary_requests[0].publication = { status: 'pending' }

    expect(() => runShowPackFactory(readyBase, {
      continuationSteps: [continuationStep(rolledBack, first.plan!)],
    }))
      .toThrow('factory continuation cannot replace ready commentary aegon-commentary')
  })
})
