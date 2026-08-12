import { describe, expect, it } from 'vitest'
import type { LegacyShowPackAuthoringWorksheet } from './legacy-show-pack-authoring'
import {
  buildLegacyGlobalReviewPacket,
  serializeLegacyGlobalReviewDecisionTemplate,
  serializeLegacyGlobalReviewPacket,
} from './legacy-global-review'
import {
  buildLegacyGlobalReviewDecisionDraftFromAttestations,
  renderLegacyGlobalReviewAttestationHtml,
} from './legacy-global-review-attestation'
import { sha256Hex } from './sha256'

function authoring(status: 'pending' | 'ready' = 'pending'): LegacyShowPackAuthoringWorksheet {
  return {
    worksheet_version: 2,
    artifact: 'legacy-show-pack-authoring',
    source: { worksheet_sha256: 'a'.repeat(64) },
    pack_draft: { id: 'show-next', version: 1 },
    global_review: {
      sources: null,
      claims: null,
      commentary_voices: null,
      commentary_requests: null,
    },
    sources: [{ id: 'screen', kind: 'screen', title: 'Screen record', locator: 'screen:record' }],
    claims: [{
      id: 'fact', canon: 'screen', status: 'verified', text: 'A fact.', source_ids: ['screen'],
    }],
    commentary_voices: [{
      id: 'witness', name: 'Witness', instruction: 'Speak plainly.', attitude_claim_ids: [],
    }],
    commentary_requests: [{
      id: 'line', speaker: 'witness', fact_claim_ids: ['fact'], angle_claim_ids: [],
      angle: 'State the consequence.',
      publication: status === 'pending' ? { status: 'pending' } : {
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

function transcript(
  input: ReturnType<typeof reviewInput>,
  attestations: Array<{ collection: string; note: string; acknowledged_checks: string[] }>,
) {
  return {
    manifest_version: 1,
    artifact: 'legacy-global-review-attestations',
    target: input.packet.target,
    packet_markdown_sha256: input.packet_markdown_sha256,
    decision_template_sha256: input.packet.decision_template_sha256,
    attestations,
  }
}

function reviewInput(status: 'pending' | 'ready' = 'pending') {
  const packet = buildLegacyGlobalReviewPacket(authoring(status), 'b'.repeat(64))
  const packetMarkdown = serializeLegacyGlobalReviewPacket(packet)
  const decisionTemplateRaw = serializeLegacyGlobalReviewDecisionTemplate(packet)
  return {
    packet,
    packet_markdown: packetMarkdown,
    packet_markdown_sha256: sha256Hex(packetMarkdown),
    decision_template_raw: decisionTemplateRaw,
  }
}

describe('legacy global review attestation desk', () => {
  it('renders only open, unblocked approvals and keeps application out of the browser', () => {
    const html = renderLegacyGlobalReviewAttestationHtml(reviewInput())

    expect(html.match(/class="attestation"/g)).toHaveLength(3)
    expect(html).toContain('sources review attestation')
    expect(html).toContain('claims review attestation')
    expect(html).toContain('commentary voices review attestation')
    expect(html).toContain('commentary requests remain deferred')
    expect(html).toContain('Download attestations')
    expect(html).not.toContain('--in-place')
    expect(html).not.toContain('applyLegacyGlobalReviewDecisions')
    expect(html).not.toContain('fetch(')
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1]
    expect(script).toBeDefined()
    expect(script).toContain("artifact:'legacy-global-review-attestations'")
    expect(script).not.toContain("artifact:'legacy-global-review-decisions'")
    expect(() => new Function(script!)).not.toThrow()
  })

  it('admits commentary-request attestation only after grounded publication is ready', () => {
    const html = renderLegacyGlobalReviewAttestationHtml(reviewInput('ready'))

    expect(html.match(/class="attestation"/g)).toHaveLength(4)
    expect(html).toContain('commentary requests review attestation')
    expect(html).not.toContain('commentary requests remain deferred')
  })

  it('builds a canonical partial manifest only after explicit checklist acknowledgement', () => {
    const input = reviewInput()
    const { packet } = input
    const source = packet.collections.find((value) => value.collection === 'sources')!
    const result = buildLegacyGlobalReviewDecisionDraftFromAttestations(input, transcript(input, [{
      collection: 'sources',
      note: '  Reviewed every source title, kind, locator, and warrant boundary.  ',
      acknowledged_checks: [...source.review_checks],
    }]))

    expect(result.approvals).toEqual([{
      collection: 'sources',
      expected_sha256: source.sha256,
      note: 'Reviewed every source title, kind, locator, and warrant boundary.',
    }])
  })

  it('binds a downloaded attestation transcript to both sealed review artifacts', () => {
    const input = reviewInput()
    const sources = input.packet.collections.find((value) => value.collection === 'sources')!
    const decision = buildLegacyGlobalReviewDecisionDraftFromAttestations(input, transcript(input, [{
        collection: 'sources', note: 'Reviewed every source boundary.',
        acknowledged_checks: [...sources.review_checks],
      }]))

    expect(decision.approvals).toEqual([{
      collection: 'sources', expected_sha256: sources.sha256,
      note: 'Reviewed every source boundary.',
    }])

    const stale = {
      manifest_version: 1,
      artifact: 'legacy-global-review-attestations',
      target: input.packet.target,
      packet_markdown_sha256: 'c'.repeat(64),
      decision_template_sha256: input.packet.decision_template_sha256,
      attestations: [],
    }
    expect(() => buildLegacyGlobalReviewDecisionDraftFromAttestations(input, stale))
      .toThrow('global review attestation packet hash does not match')
  })

  it('rejects dependency skips, incomplete checklists, and deferred collections', () => {
    const input = reviewInput()
    const { packet } = input
    const claims = packet.collections.find((value) => value.collection === 'claims')!
    expect(() => buildLegacyGlobalReviewDecisionDraftFromAttestations(input, transcript(input, [{
      collection: 'claims', note: 'Reviewed claims.', acknowledged_checks: [...claims.review_checks],
    }]))).toThrow('claims review requires sources in the same decision draft')

    const sources = packet.collections.find((value) => value.collection === 'sources')!
    expect(() => buildLegacyGlobalReviewDecisionDraftFromAttestations(input, transcript(input, [{
      collection: 'sources', note: 'Reviewed sources.', acknowledged_checks: [],
    }]))).toThrow('sources review checklist is incomplete')

    expect(() => buildLegacyGlobalReviewDecisionDraftFromAttestations(input, transcript(input, [{
      collection: 'commentary_requests', note: 'Reviewed requests.', acknowledged_checks: [],
    }]))).toThrow('commentary_requests is not open and unblocked in this review packet')
  })

  it('refuses a stale packet or decision sidecar', () => {
    const stalePacket = reviewInput()
    stalePacket.packet_markdown = stalePacket.packet_markdown.replace('Screen record', 'Changed record')
    expect(() => renderLegacyGlobalReviewAttestationHtml(stalePacket))
      .toThrow('global review Markdown does not match the packet')

    const staleDecisions = reviewInput()
    staleDecisions.decision_template_raw = staleDecisions.decision_template_raw.replace('sources', 'changed')
    expect(() => renderLegacyGlobalReviewAttestationHtml(staleDecisions))
      .toThrow('decision template does not match the packet hash')
  })
})
