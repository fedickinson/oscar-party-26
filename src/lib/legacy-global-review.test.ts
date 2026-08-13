import { describe, expect, it } from 'vitest'
import type { LegacyShowPackAuthoringWorksheet } from './legacy-show-pack-authoring'
import { sha256Hex } from './sha256'
import {
  applyLegacyGlobalReviewDecisions,
  buildLegacyGlobalReviewPacket,
  invalidateStaleLegacyGlobalReviewSeals,
  legacyGlobalReviewCollectionSha256,
  legacyGlobalReviewSealIssue,
  serializeLegacyGlobalReviewPacket,
  serializeLegacyGlobalReviewDecisionTemplate,
  type LegacyGlobalReviewDecisionManifest,
} from './legacy-global-review'

const LEGACY_SHA = 'a'.repeat(64)

function authoring(): LegacyShowPackAuthoringWorksheet {
  return {
    worksheet_version: 2,
    artifact: 'legacy-show-pack-authoring',
    source: { worksheet_sha256: LEGACY_SHA },
    pack_draft: { id: 'target-pack', version: 1 },
    global_review: {
      sources: null,
      claims: null,
      commentary_voices: null,
      commentary_requests: null,
    },
    sources: [{ id: 'screen', kind: 'screen', title: 'Screen', locator: 'screen:record' }],
    claims: [{
      id: 'fact', canon: 'screen', status: 'verified', text: 'A fact.', source_ids: ['screen'],
    }],
    commentary_voices: [{
      id: 'witness', name: 'Witness', instruction: 'Speak plainly.', attitude_claim_ids: [],
    }],
    commentary_requests: [{
      id: 'record', speaker: 'witness', fact_claim_ids: ['fact'], angle_claim_ids: [],
      angle: 'State the consequence.',
      publication: {
        status: 'ready',
        text: 'The fact stands.',
        grounding: {
          pipeline: 'scripts/grounded-line.mts',
          speaker: 'witness',
          voice_block: ['Voice: Witness', 'Expression instruction: Speak plainly.'],
          fact_block: ['A fact.'],
          angle_block: ['State the consequence.'],
          attempts: 1,
          residual_findings: [],
        },
      },
    }],
  } as unknown as LegacyShowPackAuthoringWorksheet
}

function manifest(input: LegacyShowPackAuthoringWorksheet): LegacyGlobalReviewDecisionManifest {
  return {
    manifest_version: 1,
    artifact: 'legacy-global-review-decisions',
    target: { pack_id: 'target-pack', pack_version: 1 },
    legacy_worksheet_sha256: LEGACY_SHA,
    approvals: [{
      collection: 'sources',
      expected_sha256: legacyGlobalReviewCollectionSha256(input, 'sources'),
      note: 'Reviewed every source locator and source kind.',
    }, {
      collection: 'claims',
      expected_sha256: legacyGlobalReviewCollectionSha256(input, 'claims'),
      note: 'Reviewed every claim against its cited source and canon lane.',
    }, {
      collection: 'commentary_voices',
      expected_sha256: legacyGlobalReviewCollectionSha256(input, 'commentary_voices'),
      note: 'Reviewed every voice as expression-only instruction.',
    }, {
      collection: 'commentary_requests',
      expected_sha256: legacyGlobalReviewCollectionSha256(input, 'commentary_requests'),
      note: 'Reviewed every request fact, angle, speaker, and pending state.',
    }],
  }
}

describe('legacy global review seals', () => {
  it('builds a deterministic exhaustive review packet without granting approval', () => {
    const input = authoring()
    input.commentary_requests[0].publication = { status: 'pending' }
    const before = structuredClone(input)
    const packet = buildLegacyGlobalReviewPacket(input, 'b'.repeat(64))
    const markdown = serializeLegacyGlobalReviewPacket(packet)

    expect(packet).toMatchObject({
      packet_version: 3,
      artifact: 'legacy-global-review-packet',
      target: { pack_id: 'target-pack', pack_version: 1 },
      legacy_worksheet_sha256: LEGACY_SHA,
      authoring_worksheet_sha256: 'b'.repeat(64),
    })
    expect(packet.collections.map((section) => section.collection)).toEqual([
      'sources', 'claims', 'commentary_voices', 'commentary_requests',
    ])
    expect(packet.collections.map((section) => section.sha256)).toEqual([
      legacyGlobalReviewCollectionSha256(input, 'sources'),
      legacyGlobalReviewCollectionSha256(input, 'claims'),
      legacyGlobalReviewCollectionSha256(input, 'commentary_voices'),
      legacyGlobalReviewCollectionSha256(input, 'commentary_requests'),
    ])
    expect(packet.collections[1].dependencies).toEqual([{
      collection: 'sources',
      sha256: legacyGlobalReviewCollectionSha256(input, 'sources'),
    }])
    expect(packet.collections[1].review_checks).toContain(
      'Authoring claims describe reviewed game rules only and do not masquerade as forecasts or screen facts.',
    )
    expect(packet.collections[3].review_blockers)
      .toEqual(['1 commentary publication remains pending grounded generation'])
    expect(packet.decision_template.approvals.every((approval) => approval.note === null)).toBe(true)
    expect(packet.decision_template.approvals.map((approval) => approval.collection)).toEqual([
      'sources', 'claims', 'commentary_voices',
    ])
    expect(packet.deferred_collections).toEqual([{
      collection: 'commentary_requests',
      blockers: ['1 commentary publication remains pending grounded generation'],
    }])
    expect(markdown).toContain('This packet grants no approval')
    expect(markdown).toContain('Unblocked decision template')
    expect(markdown).toContain('Deferred collections')
    expect(markdown).toContain('commentary_requests: 1 commentary publication remains pending grounded generation')
    expect(markdown).toContain('"text": "A fact."')
    expect(markdown).toContain('"publication": {')
    expect(markdown).toContain('Review checklist:')
    expect(markdown).toContain('"status": "pending"')
    expect(markdown).toContain('"note": null')
    expect(serializeLegacyGlobalReviewPacket(packet)).toBe(markdown)
    expect(JSON.parse(serializeLegacyGlobalReviewDecisionTemplate(packet))).toEqual(
      packet.decision_template,
    )
    expect(packet.decision_template_sha256).toBe(
      sha256Hex(serializeLegacyGlobalReviewDecisionTemplate(packet)),
    )
    expect(markdown).toContain(`Decision template SHA-256: ${packet.decision_template_sha256}`)
    expect(serializeLegacyGlobalReviewDecisionTemplate(packet)).toBe(
      serializeLegacyGlobalReviewDecisionTemplate(packet),
    )
    expect(input).toEqual(before)
  })

  it('reports blocked commentary publications distinctly from pending work', () => {
    const input = authoring()
    input.commentary_requests[0].publication = {
      status: 'blocked',
      text: 'An unsupported consequence.',
      grounding: {
        pipeline: 'scripts/grounded-line.mts',
        speaker: 'witness',
        voice_block: ['Voice: Witness', 'Expression instruction: Speak plainly.'],
        fact_block: ['A fact.'],
        angle_block: ['State the consequence.'],
        attempts: 3,
        residual_findings: ['The consequence is not present in the fact block.'],
      },
    }

    expect(buildLegacyGlobalReviewPacket(input, 'b'.repeat(64)).collections[3].review_blockers)
      .toEqual(['1 commentary publication is blocked by residual grounding findings'])
  })

  it('includes unblocked commentary requests once publication is ready', () => {
    const input = authoring()
    const packet = buildLegacyGlobalReviewPacket(input, 'b'.repeat(64))

    expect(packet.deferred_collections).toEqual([])
    expect(packet.decision_template.approvals.map((approval) => approval.collection)).toEqual([
      'sources', 'claims', 'commentary_voices', 'commentary_requests',
    ])
  })

  it('omits already-current collections from the staged decision template', () => {
    const input = authoring()
    const sealed = applyLegacyGlobalReviewDecisions({ authoring: input, manifest: manifest(input) })
      .worksheet
    const packet = buildLegacyGlobalReviewPacket(sealed, 'b'.repeat(64))

    expect(packet.deferred_collections).toEqual([])
    expect(packet.decision_template.approvals).toEqual([])
    expect(() => serializeLegacyGlobalReviewDecisionTemplate(packet))
      .toThrow('no currently open, unblocked global review collections')
    expect(serializeLegacyGlobalReviewPacket(packet)).toContain(
      'No currently open, unblocked collections require a decision.',
    )
  })

  it('refuses to seal commentary requests while grounded publication is pending or blocked', () => {
    const pending = authoring()
    pending.commentary_requests[0].publication = { status: 'pending' }
    const pendingManifest = manifest(pending)
    pendingManifest.approvals = pendingManifest.approvals.filter((approval) => (
      approval.collection === 'commentary_requests'
    ))
    expect(() => applyLegacyGlobalReviewDecisions({
      authoring: pending,
      manifest: pendingManifest,
    })).toThrow('commentary_requests review cannot be approved: 1 commentary publication remains pending grounded generation')

    const sourcesManifest = manifest(pending)
    sourcesManifest.approvals = sourcesManifest.approvals.filter((approval) => (
      approval.collection === 'sources'
    ))
    expect(applyLegacyGlobalReviewDecisions({
      authoring: pending,
      manifest: sourcesManifest,
    }).worksheet.global_review.sources).not.toBeNull()

    const blocked = authoring()
    blocked.commentary_requests[0].publication = {
      status: 'blocked',
      text: 'An unsupported consequence.',
      grounding: {
        pipeline: 'scripts/grounded-line.mts',
        speaker: 'witness',
        voice_block: ['Voice: Witness', 'Expression instruction: Speak plainly.'],
        fact_block: ['A fact.'],
        angle_block: ['State the consequence.'],
        attempts: 3,
        residual_findings: ['The consequence is not present in the fact block.'],
      },
    }
    const blockedManifest = manifest(blocked)
    blockedManifest.approvals = blockedManifest.approvals.filter((approval) => (
      approval.collection === 'commentary_requests'
    ))
    expect(() => applyLegacyGlobalReviewDecisions({
      authoring: blocked,
      manifest: blockedManifest,
    })).toThrow('commentary_requests review cannot be approved: 1 commentary publication is blocked by residual grounding findings')
  })

  it('treats a legacy request seal as stale when its grounded publication is unfinished', () => {
    const input = authoring()
    input.commentary_requests[0].publication = { status: 'pending' }
    input.global_review.commentary_requests = {
      sha256: legacyGlobalReviewCollectionSha256(input, 'commentary_requests'),
      note: 'An older tool approved this pending request collection.',
    }

    expect(legacyGlobalReviewSealIssue(input, 'commentary_requests'))
      .toBe('commentary_requests review is blocked: 1 commentary publication remains pending grounded generation')
    expect(buildLegacyGlobalReviewPacket(input, 'b'.repeat(64)).collections[3].current_review)
      .toBe('open')

    invalidateStaleLegacyGlobalReviewSeals(input)
    expect(input.global_review.commentary_requests).toBeNull()
  })

  it('uses a longer Markdown fence when reviewed prose contains a code fence', () => {
    const input = authoring()
    input.claims[0].text = 'A fact containing ``` inside reviewed prose.'
    const markdown = serializeLegacyGlobalReviewPacket(
      buildLegacyGlobalReviewPacket(input, 'b'.repeat(64)),
    )

    expect(markdown).toContain('````json\n[')
    expect(markdown).toContain('A fact containing ``` inside reviewed prose.')
    expect(markdown).toContain('\n````\n')
  })

  it('seals exact dependent collection bytes without mutating authored collections', () => {
    const input = authoring()
    const result = applyLegacyGlobalReviewDecisions({ authoring: input, manifest: manifest(input) })

    expect(result.applied_collections).toEqual([
      'sources', 'claims', 'commentary_voices', 'commentary_requests',
    ])
    for (const approval of manifest(input).approvals) {
      expect(result.worksheet.global_review[approval.collection]).toEqual({
        sha256: approval.expected_sha256,
        note: approval.note,
      })
    }
    expect(result.worksheet.sources).toEqual(input.sources)
    expect(input.global_review.sources).toBeNull()
  })

  it('cascades dependency hashes so upstream changes invalidate downstream review', () => {
    const input = authoring()
    const before = {
      sources: legacyGlobalReviewCollectionSha256(input, 'sources'),
      claims: legacyGlobalReviewCollectionSha256(input, 'claims'),
      commentary_voices: legacyGlobalReviewCollectionSha256(input, 'commentary_voices'),
      commentary_requests: legacyGlobalReviewCollectionSha256(input, 'commentary_requests'),
    }
    input.sources[0].title = 'Changed source title'
    expect(legacyGlobalReviewCollectionSha256(input, 'sources')).not.toBe(before.sources)
    expect(legacyGlobalReviewCollectionSha256(input, 'claims')).not.toBe(before.claims)
    expect(legacyGlobalReviewCollectionSha256(input, 'commentary_voices')).not.toBe(before.commentary_voices)
    expect(legacyGlobalReviewCollectionSha256(input, 'commentary_requests')).not.toBe(before.commentary_requests)
  })

  it('clears every stale dependent seal after an authored collection changes', () => {
    const input = authoring()
    const sealed = applyLegacyGlobalReviewDecisions({ authoring: input, manifest: manifest(input) })
      .worksheet
    sealed.claims[0].text = 'A corrected fact.'

    invalidateStaleLegacyGlobalReviewSeals(sealed)

    expect(sealed.global_review.sources).not.toBeNull()
    expect(sealed.global_review.claims).toBeNull()
    expect(sealed.global_review.commentary_voices).toBeNull()
    expect(sealed.global_review.commentary_requests).toBeNull()
  })

  it('fails closed on drift, duplicate approvals, conflicts, and is idempotent', () => {
    const input = authoring()
    const drifted = manifest(input)
    drifted.approvals[0].expected_sha256 = 'b'.repeat(64)
    expect(() => applyLegacyGlobalReviewDecisions({ authoring: input, manifest: drifted }))
      .toThrow('sources review hash does not match')

    const duplicate = manifest(input)
    duplicate.approvals.push(structuredClone(duplicate.approvals[0]))
    expect(() => applyLegacyGlobalReviewDecisions({ authoring: input, manifest: duplicate }))
      .toThrow('global review collections must not contain duplicates')

    const first = applyLegacyGlobalReviewDecisions({ authoring: input, manifest: manifest(input) })
    const second = applyLegacyGlobalReviewDecisions({ authoring: first.worksheet, manifest: manifest(input) })
    expect(second.worksheet).toEqual(first.worksheet)

    const conflict = manifest(input)
    conflict.approvals[0].note = 'A different review attestation.'
    expect(() => applyLegacyGlobalReviewDecisions({ authoring: first.worksheet, manifest: conflict }))
      .toThrow('sources already has a conflicting review seal')
  })

  it('requires staged approvals to include or follow current upstream reviews', () => {
    const input = authoring()
    const claimsOnly = manifest(input)
    claimsOnly.approvals = claimsOnly.approvals.filter((approval) => (
      approval.collection === 'claims'
    ))
    expect(() => applyLegacyGlobalReviewDecisions({ authoring: input, manifest: claimsOnly }))
      .toThrow('claims review requires current sources review')

    const reversed = manifest(input)
    reversed.approvals = reversed.approvals.filter((approval) => (
      approval.collection === 'sources' || approval.collection === 'claims'
    )).reverse()
    expect(() => applyLegacyGlobalReviewDecisions({ authoring: input, manifest: reversed }))
      .toThrow('claims review requires sources earlier in the same manifest')

    const ordered = manifest(input)
    ordered.approvals = ordered.approvals.filter((approval) => (
      approval.collection === 'sources' || approval.collection === 'claims'
    ))
    expect(applyLegacyGlobalReviewDecisions({ authoring: input, manifest: ordered })
      .applied_collections).toEqual(['sources', 'claims'])
  })

  it('treats a downstream seal as non-current when an upstream seal is absent', () => {
    const input = authoring()
    input.global_review.claims = {
      sha256: legacyGlobalReviewCollectionSha256(input, 'claims'),
      note: 'A manually imported claim review without its source review.',
    }

    expect(legacyGlobalReviewSealIssue(input, 'claims'))
      .toBe('claims review requires current sources review')
    expect(buildLegacyGlobalReviewPacket(input, 'b'.repeat(64)).collections[1].current_review)
      .toBe('open')
    invalidateStaleLegacyGlobalReviewSeals(input)
    expect(input.global_review.claims).toBeNull()
  })
})
