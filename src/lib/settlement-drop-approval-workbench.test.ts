import { describe, expect, it } from 'vitest'
import {
  buildSettlementDropApprovalDecisions,
  renderSettlementDropApprovalWorkbench,
  type SettlementDropApprovalTranscript,
} from './settlement-drop-approval-workbench'
import type { SettlementDropApprovalLaneKind } from './settlement-drop-approval-docket'
import { sha256Hex } from './sha256'

const KINDS: SettlementDropApprovalLaneKind[] = [
  'receipt_prerequisites', 'player_identity', 'asset_semantics',
  'quote_markup', 'presentation_structure',
]

function fixture() {
  const envelope = (artifact: string, packetRaw: string) => ({
    decision_version: 1,
    artifact,
    target: { room_code: 'WDKH' },
    expected_packet_sha256: sha256Hex(packetRaw),
  })
  const packets = {
    receipt_prerequisites: {
      artifact: 'settlement-drop-receipt-prerequisites-review', target: { room_code: 'WDKH' },
      canonical_state: { snapshot_phase: 'finished', room_closed: false, active_settlement_id: null, settlement_rows_provided: false, canonical_receipt_recoverable: false },
      coverage: { candidate_entries: 1, players: 1, draft_picks: 1, approved_bingo_marks: 1 },
      schema_gaps: ['rooms.show_pack_id'],
      candidate_entries: [{ entry_key: 'category:1', category_id: 1, category_name: 'Winner', points: 5, winner_id: 'n1', winner_name: 'Alice', tie_winner_id: null, tie_winner_name: null, announced_at: null }],
    },
    player_identity: {
      artifact: 'settlement-drop-player-identity-review', target: { room_code: 'WDKH' },
      coverage: { exact_uuid_joins: 1, display_name_variants: 1 },
      players: [{ player_id: 'p1', snapshot_name: 'Alice and Bob', ceremony_name: 'Alice & Bob', exact_name_match: false, observed_names: { tiers: ['Alice & Bob'], personal: ['Alice & Bob'], board: ['Alice and Bob'] } }],
    },
    asset_semantics: {
      artifact: 'settlement-drop-asset-semantics-review', target: { room_code: 'WDKH' },
      coverage: { assets: 1, character_assignments: 1, pundit_assignments: 0, player_sigil_assignments: 0 },
      assets: [{ id: 'portrait', path: 'assets/portrait.webp', mime_type: 'image/webp', bytes: 12, sha256: 'b'.repeat(64), structured_assignments: [{ kind: 'character', consumer: 'Alice' }], candidate_alt_texts: ['Alice'], html_evidence: { image_uses: 1, empty_alt_uses: 1 } }],
    },
    quote_markup: {
      artifact: 'settlement-drop-quote-markup-review', target: { room_code: 'WDKH' },
      coverage: { quotes: 1, quotes_with_markup: 1, emphasis_spans: 1 },
      quotes: [{ quote_key: '4:0', speaker: 'Ned', source_text: 'A <b>point</b>.', plain_text_candidate: 'A point.', emphasis_spans: [{ text: 'point', plain_text_start: 2, plain_text_end: 7 }] }],
    },
    presentation_structure: {
      artifact: 'settlement-drop-presentation-structure-review', target: { room_code: 'WDKH' },
      coverage: { slides: 2, acts: 1, beats: 1, unresolved_beatline_groups: [] },
      acts: [{ observed_act_ordinal: 1, divider_slide_index: 1, title: 'Act', subtitle: 'Sub', interstitial_slide_indices: [7] }],
      slides: [{ observed_act_ordinal: 1, kind: 'beat', slide_index: 4, kicker: 'Beat', title: 'Title', beatline_group_candidate: 'B1', take_group: '4' }],
    },
  }
  const packetRaw = Object.fromEntries(Object.entries(packets).map(([kind, value]) => (
    [kind, `${JSON.stringify(value, null, 2)}\n`]
  ))) as Record<SettlementDropApprovalLaneKind, string>
  const decisions = {
    receipt_prerequisites: {
      ...envelope('settlement-drop-receipt-prerequisites-decisions', packetRaw.receipt_prerequisites),
      settlement: { title: null, actor: null, bingo_mode: null },
      entries: [{ entry_key: 'category:1', approved_outcome: null, warrant: null, occurred_at: null, note: null }],
      bingo: { preserve_snapshot_marks: null, warrant: null, note: null },
      additional_fact_review: null,
    },
    player_identity: {
      ...envelope('settlement-drop-player-identity-decisions', packetRaw.player_identity),
      decisions: [{ player_id: 'p1', canonical_name: null, note: null }],
    },
    asset_semantics: {
      ...envelope('settlement-drop-asset-semantics-decisions', packetRaw.asset_semantics),
      decisions: [{ asset_id: 'portrait', approved_alt_text: null, approve_structured_assignments: null, note: null }],
    },
    quote_markup: {
      ...envelope('settlement-drop-quote-markup-decisions', packetRaw.quote_markup),
      decisions: [{ quote_key: '4:0', approved_plain_text: null, emphasis_treatment: null, note: null }],
    },
    presentation_structure: {
      ...envelope('settlement-drop-presentation-structure-decisions', packetRaw.presentation_structure),
      show: { title: null, subtitle: null, closing_title: null, opening_eyebrow: null, muster_title: null, begins_label: null, note: null },
      acts: [{ observed_act_ordinal: 1, include: null, id: null, title: null, subtitle: null, scene: null, interstitial_slide_index: null, interstitial_portrait_asset: null, note: null }],
      beats: [{ slide_index: 4, include: null, id: null, kicker: null, title: null, summary: null, weight: null, portrait_asset: null, approve_beatline_group: null, approve_take_group: null, note: null }],
    },
  }
  const decisionRaw = Object.fromEntries(Object.entries(decisions).map(([kind, value]) => (
    [kind, `${JSON.stringify(value, null, 2)}\n`]
  ))) as Record<SettlementDropApprovalLaneKind, string>
  const lanes = KINDS.map((kind) => ({
    kind,
    blocker_code: `${kind}_blocker`, blocker_present: true,
    packet: { name: `${kind}.json`, bytes: new TextEncoder().encode(packetRaw[kind]).byteLength, sha256: sha256Hex(packetRaw[kind]) },
    decisions: { name: `${kind}-decisions.json`, bytes: new TextEncoder().encode(decisionRaw[kind]).byteLength, sha256: sha256Hex(decisionRaw[kind]) },
    decision_units: 1, required_values: 1, open_values: 1,
    open_items: [`${kind}.open`], decision_status: 'open',
  }))
  const docketRaw = `${JSON.stringify({
    docket_version: 2, artifact: 'settlement-drop-approval-docket', target: { room_code: 'WDKH' },
    audit: { name: 'audit.json', bytes: 10, sha256: 'a'.repeat(64) },
    blockers: [{ code: 'missing', detail: 'Missing truth.', required_action: 'Author it.' }],
    lanes,
  }, null, 2)}\n`
  return { docket_raw: docketRaw, packet_raw: packetRaw, decision_raw: decisionRaw, asset_data_urls: { portrait: 'data:image/webp;base64,UklGRg==' } }
}

function transcript(input: ReturnType<typeof fixture>, edits: SettlementDropApprovalTranscript['lanes'][number]['edits'][]): SettlementDropApprovalTranscript {
  return {
    transcript_version: 1,
    artifact: 'settlement-drop-approval-transcript',
    target: { room_code: 'WDKH' },
    docket_sha256: sha256Hex(input.docket_raw),
    lanes: KINDS.map((kind, index) => ({
      kind,
      packet_sha256: sha256Hex(input.packet_raw[kind]),
      baseline_decisions_sha256: sha256Hex(input.decision_raw[kind]),
      edits: edits[index] ?? [],
    })),
    note: 'Reviewed these exact source-bound changes; all remaining nulls stay open.',
  }
}

describe('settlement-drop approval workbench', () => {
  it('applies only named edits to cloned canonical templates and reports residual open work', () => {
    const input = fixture()
    const value = transcript(input, [
      [],
      [{ path: 'decisions[p1].canonical_name', value: 'Alice & Bob' }],
      [], [], [],
    ])
    const result = buildSettlementDropApprovalDecisions(input, value)
    const players = JSON.parse(result.decision_raw.player_identity)
    expect(players.decisions[0].canonical_name).toBe('Alice & Bob')
    expect(players.expected_packet_sha256).toBe(sha256Hex(input.packet_raw.player_identity))
    expect(result.status.player_identity).toMatchObject({ status: 'complete', open_values: 0 })
    expect(result.status.asset_semantics.status).toBe('open')
    expect(input.decision_raw.player_identity).toContain('"canonical_name": null')
  })

  it('rejects stale evidence, immutable paths, duplicate edits, no-op transcripts, and malformed values', () => {
    const input = fixture()
    const stale = transcript(input, [[], [{ path: 'decisions[p1].canonical_name', value: 'Alice' }], [], [], []])
    stale.docket_sha256 = 'f'.repeat(64)
    expect(() => buildSettlementDropApprovalDecisions(input, stale)).toThrow('transcript docket hash does not match')

    expect(() => buildSettlementDropApprovalDecisions(input, transcript(input, [
      [], [{ path: 'decisions[p1].player_id', value: 'p2' }], [], [], [],
    ]))).toThrow('is not an editable decision path')
    expect(() => buildSettlementDropApprovalDecisions(input, transcript(input, [
      [], [
        { path: 'decisions[p1].canonical_name', value: 'Alice' },
        { path: 'decisions[p1].canonical_name', value: 'Alice again' },
      ], [], [], [],
    ]))).toThrow('contains duplicate edit path')
    expect(() => buildSettlementDropApprovalDecisions(input, transcript(input, [[], [], [], [], []])))
      .toThrow('transcript must contain at least one decision edit')
    expect(() => buildSettlementDropApprovalDecisions(input, transcript(input, [
      [], [], [{ path: 'decisions[portrait].approve_structured_assignments', value: 'yes' }], [], [],
    ]))).toThrow('must be a boolean or null')
  })

  it('renders the sealed evidence with editable controls and a local transcript export only', () => {
    const input = fixture()
    const html = renderSettlementDropApprovalWorkbench(input)
    expect(html).toContain('Decision workbench')
    expect(html).toContain('data-path="decisions[p1].canonical_name"')
    expect(html).toContain('data-path="decisions[portrait].approve_structured_assignments"')
    expect(html).toContain('data-path="acts[1].scene"')
    expect(html).toContain('data-path="entries[category:1].warrant"')
    expect(html).toContain('Download decision transcript')
    expect(html).toContain('Clear local draft')
    expect(html).toContain('localStorage.setItem')
    expect(html).toContain("default-src 'none'")
    expect(html).not.toContain('fetch(')
    expect(html).not.toContain('http://')
    expect(html).not.toContain('https://')
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1]
    expect(script).toBeDefined()
    expect(() => new Function(script!)).not.toThrow()
  })
})
