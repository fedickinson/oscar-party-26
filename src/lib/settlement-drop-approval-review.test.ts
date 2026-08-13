import { describe, expect, it } from 'vitest'
import { renderSettlementDropApprovalReview } from './settlement-drop-approval-review'
import { sha256Hex } from './sha256'

function input() {
  const decisionRaw = {
    receipt_prerequisites: '{"kind":"receipt"}',
    player_identity: '{"kind":"players"}',
    asset_semantics: '{"kind":"assets"}',
    quote_markup: '{"kind":"quotes"}',
    presentation_structure: '{"kind":"structure"}',
  }
  const packets = {
    receipt_prerequisites: JSON.stringify({
      artifact: 'settlement-drop-receipt-prerequisites-review', target: { room_code: 'WDKH' },
      canonical_state: { snapshot_phase: 'finished', room_closed: false, active_settlement_id: null, settlement_rows_provided: false, canonical_receipt_recoverable: false },
      coverage: { candidate_entries: 1, players: 1, draft_picks: 1, approved_bingo_marks: 1 },
      schema_gaps: ['rooms.show_pack_id'],
      candidate_entries: [{ entry_key: 'category:1', category_id: 1, category_name: 'A <fact>', points: 5, winner_id: 'n1', winner_name: 'Winner', tie_winner_id: null, tie_winner_name: null, announced_at: null }],
    }),
    player_identity: JSON.stringify({
      artifact: 'settlement-drop-player-identity-review', target: { room_code: 'WDKH' },
      coverage: { exact_uuid_joins: 1, display_name_variants: 1 },
      players: [{ player_id: 'p1', snapshot_name: 'Alice and Bob', ceremony_name: 'Alice & Bob', exact_name_match: false, observed_names: { tiers: ['Alice & Bob'], personal: ['Alice & Bob'], board: ['Alice and Bob'] } }],
    }),
    asset_semantics: JSON.stringify({
      artifact: 'settlement-drop-asset-semantics-review', target: { room_code: 'WDKH' },
      coverage: { assets: 1, character_assignments: 1, pundit_assignments: 0, player_sigil_assignments: 0 },
      assets: [{ id: 'alice', path: 'assets/alice.webp', mime_type: 'image/webp', structured_assignments: [{ kind: 'character', consumer: 'Alice <Hero>' }], candidate_alt_texts: ['Alice'], html_evidence: { image_uses: 1, empty_alt_uses: 1 } }],
    }),
    quote_markup: JSON.stringify({
      artifact: 'settlement-drop-quote-markup-review', target: { room_code: 'WDKH' },
      coverage: { quotes: 1, quotes_with_markup: 1, emphasis_spans: 1 },
      quotes: [{ quote_key: '1:0', speaker: 'Ned', source_text: 'A <b>point</b>.', plain_text_candidate: 'A point.', emphasis_spans: [{ text: 'point', plain_text_start: 2, plain_text_end: 7 }] }],
    }),
    presentation_structure: JSON.stringify({
      artifact: 'settlement-drop-presentation-structure-review', target: { room_code: 'WDKH' },
      coverage: { slides: 2, acts: 1, beats: 1, unresolved_beatline_groups: [] },
      acts: [{ observed_act_ordinal: 1, divider_slide_index: 0, title: 'Act', subtitle: 'Sub' }],
      slides: [{ observed_act_ordinal: 1, kind: 'beat', slide_index: 1, kicker: 'Beat', title: 'Title', beatline_group_candidate: 'B1', take_group: '1' }],
    }),
  }
  const lanes = Object.entries(packets).map(([kind, raw]) => ({
    kind,
    blocker_code: `${kind}_blocker`, blocker_present: true,
    packet: { name: `${kind}.json`, bytes: raw.length, sha256: sha256Hex(raw) },
    decisions: {
      name: `${kind}-decisions.json`,
      bytes: decisionRaw[kind as keyof typeof decisionRaw].length,
      sha256: sha256Hex(decisionRaw[kind as keyof typeof decisionRaw]),
    },
    decision_units: 1, required_values: 1, open_values: 1,
    open_items: [`${kind}.required`], decision_status: 'open',
  }))
  return {
    docket_raw: JSON.stringify({
      docket_version: 2, artifact: 'settlement-drop-approval-docket', target: { room_code: 'WDKH' },
      audit: { name: 'audit.json', bytes: 10, sha256: 'a'.repeat(64) },
      blockers: [{ code: 'missing', detail: 'Missing <truth>.', required_action: 'Author it.' }], lanes,
    }),
    packet_raw: packets,
    decision_raw: decisionRaw,
    asset_data_urls: { alice: 'data:image/webp;base64,UklGRg==' },
  }
}

describe('renderSettlementDropApprovalReview', () => {
  it('renders all five evidence lanes without editing controls', () => {
    const html = renderSettlementDropApprovalReview(input() as Parameters<typeof renderSettlementDropApprovalReview>[0])
    expect(html).toContain('id="player-identity"')
    expect(html).toContain('id="asset-semantics"')
    expect(html).toContain('id="quote-markup"')
    expect(html).toContain('id="presentation-structure"')
    expect(html).toContain('id="receipt-prerequisites"')
    expect(html).not.toContain('<input')
    expect(html).not.toContain('<form')
    expect(html).not.toContain('<script')
    expect(html).toContain('1 of 1 required values remain open.')
    expect(html).toContain('receipt_prerequisites.required')
  })

  it('escapes source copy while rendering observed emphasis structurally', () => {
    const html = renderSettlementDropApprovalReview(input() as Parameters<typeof renderSettlementDropApprovalReview>[0])
    expect(html).toContain('A &lt;b&gt;point&lt;/b&gt;.')
    expect(html).toContain('A <mark>point</mark>.')
    expect(html).toContain('Alice &lt;Hero&gt;')
    expect(html).toContain('Missing &lt;truth&gt;.')
  })

  it('rejects packet drift and missing embedded assets', () => {
    const drifted = input()
    drifted.packet_raw.player_identity = drifted.packet_raw.player_identity.replace('Alice', 'Alicia')
    expect(() => renderSettlementDropApprovalReview(drifted as Parameters<typeof renderSettlementDropApprovalReview>[0]))
      .toThrow('player_identity packet does not match the docket hash')
    const missing = input()
    missing.asset_data_urls = {} as Record<string, string> & { alice: string }
    expect(() => renderSettlementDropApprovalReview(missing as Parameters<typeof renderSettlementDropApprovalReview>[0]))
      .toThrow('approval review is missing embedded asset alice')
  })

  it('rejects decision drift after a docket was built', () => {
    const drifted = input()
    drifted.decision_raw.player_identity = '{"kind":"changed"}'
    expect(() => renderSettlementDropApprovalReview(drifted as Parameters<typeof renderSettlementDropApprovalReview>[0]))
      .toThrow('player_identity decisions do not match the docket hash')
  })
})
