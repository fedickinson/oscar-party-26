import { describe, expect, it } from 'vitest'
import type { LegacyGlobalReviewPacket } from './legacy-global-review'
import { serializeLegacyGlobalReviewPacket } from './legacy-global-review'
import { renderLegacyGlobalReviewHtml } from './legacy-global-review-html'
import { sha256Hex } from './sha256'

function input() {
  const packet: LegacyGlobalReviewPacket = {
    packet_version: 3,
    artifact: 'legacy-global-review-packet',
    target: { pack_id: 'show-next', pack_version: 1 },
    legacy_worksheet_sha256: 'a'.repeat(64),
    authoring_worksheet_sha256: 'b'.repeat(64),
    decision_template_sha256: null,
    collections: [
      {
        collection: 'sources', sha256: '1'.repeat(64), dependencies: [],
        current_review: 'open', current_review_reason: 'sources review is not approved',
        review_checks: ['Verify <source>.'], review_blockers: [],
        entries: [{ id: 'screen-record', kind: 'operator_record', title: 'Screen <record>', locator: 'repo:record' }],
      },
      {
        collection: 'claims', sha256: '2'.repeat(64),
        dependencies: [{ collection: 'sources', sha256: '1'.repeat(64) }],
        current_review: 'open', current_review_reason: 'claims review is not approved',
        review_checks: ['Keep canons separate.'], review_blockers: [],
        entries: [{ id: 'fact', canon: 'screen', status: 'verified', text: 'A <fact>.', source_ids: ['screen-record'] }],
      },
      {
        collection: 'commentary_voices', sha256: '3'.repeat(64),
        dependencies: [
          { collection: 'sources', sha256: '1'.repeat(64) },
          { collection: 'claims', sha256: '2'.repeat(64) },
        ],
        current_review: 'open', current_review_reason: 'commentary_voices review is not approved',
        review_checks: ['Voice introduces no facts.'], review_blockers: [],
        entries: [{ id: 'witness', name: 'Witness', instruction: 'Speak <plainly>.', attitude_claim_ids: [] }],
      },
      {
        collection: 'commentary_requests', sha256: '4'.repeat(64),
        dependencies: [
          { collection: 'sources', sha256: '1'.repeat(64) },
          { collection: 'claims', sha256: '2'.repeat(64) },
          { collection: 'commentary_voices', sha256: '3'.repeat(64) },
        ],
        current_review: 'open', current_review_reason: 'commentary_requests review is blocked',
        review_checks: ['Publication must be grounded.'],
        review_blockers: ['1 commentary publication remains pending grounded generation'],
        entries: [{ id: 'line', speaker: 'witness', fact_claim_ids: ['fact'], angle_claim_ids: [], angle: 'React.', publication: { status: 'pending' } }],
      },
    ],
    deferred_collections: [{
      collection: 'commentary_requests',
      blockers: ['1 commentary publication remains pending grounded generation'],
    }],
    decision_template: {
      manifest_version: 1, artifact: 'legacy-global-review-decisions',
      target: { pack_id: 'show-next', pack_version: 1 }, legacy_worksheet_sha256: 'a'.repeat(64),
      approvals: [
        { collection: 'sources', expected_sha256: '1'.repeat(64), note: null },
        { collection: 'claims', expected_sha256: '2'.repeat(64), note: null },
        { collection: 'commentary_voices', expected_sha256: '3'.repeat(64), note: null },
      ],
    },
  }
  const decisionRaw = `${JSON.stringify(packet.decision_template, null, 2)}\n`
  packet.decision_template_sha256 = sha256Hex(decisionRaw)
  const packetMarkdown = serializeLegacyGlobalReviewPacket(packet)
  return {
    packet,
    packet_markdown: packetMarkdown,
    packet_markdown_sha256: sha256Hex(packetMarkdown),
    decision_template_raw: decisionRaw,
  }
}

describe('renderLegacyGlobalReviewHtml', () => {
  it('renders the dependency ladder and deferred requests without editing controls', () => {
    const html = renderLegacyGlobalReviewHtml(input())
    const sources = html.indexOf('id="sources"')
    const claims = html.indexOf('id="claims"')
    const voices = html.indexOf('id="commentary-voices"')
    const deferred = html.indexOf('id="deferred"')
    expect(sources).toBeGreaterThan(-1)
    expect(sources).toBeLessThan(claims)
    expect(claims).toBeLessThan(voices)
    expect(voices).toBeLessThan(deferred)
    expect(html).toContain('Requests stay deferred')
    expect(html).toContain('1 commentary publication remains pending grounded generation')
    expect(html.match(/Canonical review · open/g)).toHaveLength(4)
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<form')
    expect(html).not.toContain('<input')
  })

  it('escapes evidence and keeps source/claim references explicit', () => {
    const html = renderLegacyGlobalReviewHtml(input())
    expect(html).toContain('Screen &lt;record&gt;')
    expect(html).toContain('A &lt;fact&gt;.')
    expect(html).toContain('Speak &lt;plainly&gt;.')
    expect(html).toContain('screen-record')
  })

  it('rejects a stale or broadened decision template', () => {
    const stale = input()
    stale.decision_template_raw = stale.decision_template_raw.replace('sources', 'changed')
    expect(() => renderLegacyGlobalReviewHtml(stale)).toThrow('decision template does not match the packet hash')

    const broadened = input()
    const value = JSON.parse(broadened.decision_template_raw)
    value.approvals.push({ collection: 'commentary_requests', expected_sha256: '4'.repeat(64), note: null })
    const raw = `${JSON.stringify(value, null, 2)}\n`
    broadened.packet.decision_template_sha256 = sha256Hex(raw)
    broadened.decision_template_raw = raw
    broadened.packet_markdown = serializeLegacyGlobalReviewPacket(broadened.packet)
    broadened.packet_markdown_sha256 = sha256Hex(broadened.packet_markdown)
    expect(() => renderLegacyGlobalReviewHtml(broadened))
      .toThrow('decision template approvals do not match the packet')
  })
})
