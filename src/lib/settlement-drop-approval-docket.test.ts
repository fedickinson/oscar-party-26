import { describe, expect, it } from 'vitest'
import { sha256Hex } from './sha256'
import {
  buildSettlementDropApprovalDocket,
  serializeSettlementDropApprovalDocket,
  type SettlementDropApprovalLaneKind,
} from './settlement-drop-approval-docket'

function sealed(name: string, value: unknown) {
  const raw = JSON.stringify(value)
  return { raw, seal: { name, bytes: new TextEncoder().encode(raw).byteLength, sha256: sha256Hex(raw) } }
}

function lane(
  kind: SettlementDropApprovalLaneKind,
  packetArtifact: string,
  decisionArtifact: string,
  packetBody: Record<string, unknown>,
  decisionBody: Record<string, unknown>,
) {
  const packet = sealed(`${kind}.json`, {
    artifact: packetArtifact, target: { room_code: 'WDKH' }, ...packetBody,
  })
  const decisions = sealed(`${kind}-decisions.json`, {
    decision_version: 1, artifact: decisionArtifact, target: { room_code: 'WDKH' },
    expected_packet_sha256: packet.seal.sha256, ...decisionBody,
  })
  return { kind, packet, decisions }
}

function input() {
  const blockers = [
    { code: 'missing_settlement_receipt', detail: 'Missing.', required_action: 'Author it.' },
    { code: 'player_identity_requires_approval', count: 1, detail: 'Open.', required_action: 'Approve.' },
  ]
  return {
    room_code: 'WDKH',
    audit: sealed('audit.json', {
      artifact: 'settlement-drop-migration-audit', target: { room_code: 'WDKH' }, blockers,
    }),
    lanes: [
      lane('receipt_prerequisites', 'settlement-drop-receipt-prerequisites-review', 'settlement-drop-receipt-prerequisites-decisions', {
        candidate_entries: [{ entry_key: 'category:1' }],
      }, {
        settlement: { title: null, actor: null, bingo_mode: null },
        entries: [{ entry_key: 'category:1', approved_outcome: null, warrant: null, occurred_at: null, note: null }],
        bingo: { preserve_snapshot_marks: null, warrant: null, note: null }, additional_fact_review: null,
      }),
      lane('player_identity', 'settlement-drop-player-identity-review', 'settlement-drop-player-identity-decisions', {
        players: [{ player_id: 'p1' }],
      }, {
        decisions: [{ player_id: 'p1', canonical_name: null, note: null }],
      }),
      lane('asset_semantics', 'settlement-drop-asset-semantics-review', 'settlement-drop-asset-semantics-decisions', {
        assets: [{ id: 'asset', structured_assignments: [] }],
      }, {
        decisions: [{ asset_id: 'asset', approved_alt_text: null, approve_structured_assignments: null, note: null }],
      }),
      lane('quote_markup', 'settlement-drop-quote-markup-review', 'settlement-drop-quote-markup-decisions', {
        quotes: [{ quote_key: '4:0' }],
      }, {
        decisions: [{ quote_key: '4:0', approved_plain_text: null, emphasis_treatment: null, note: null }],
      }),
      lane('presentation_structure', 'settlement-drop-presentation-structure-review', 'settlement-drop-presentation-structure-decisions', {
        acts: [{ observed_act_ordinal: 1, interstitial_slide_indices: [7] }],
        slides: [{ slide_index: 4, kind: 'beat', beatline_group_candidate: 'B1', take_group: '4' }],
      }, {
        show: {
          title: null, subtitle: null, closing_title: null, opening_eyebrow: null,
          muster_title: null, begins_label: null, note: null,
        },
        acts: [{
          observed_act_ordinal: 1, include: null, id: null, title: null, subtitle: null,
          scene: null, interstitial_slide_index: null, interstitial_portrait_asset: null, note: null,
        }],
        beats: [{
          slide_index: 4, include: null, id: null, kicker: null, title: null, summary: null,
          weight: null, portrait_asset: null, approve_beatline_group: null, approve_take_group: null, note: null,
        }],
      }),
    ],
  }
}

describe('buildSettlementDropApprovalDocket', () => {
  it('indexes exact packet and decision hashes without owning decisions', () => {
    const docket = buildSettlementDropApprovalDocket(input())
    expect(docket.lanes.map((laneRow) => laneRow.kind)).toEqual([
      'asset_semantics', 'player_identity', 'presentation_structure', 'quote_markup', 'receipt_prerequisites',
    ])
    expect(docket.lanes.find((row) => row.kind === 'player_identity')).toMatchObject({
      blocker_present: true, decision_units: 1, required_values: 1,
      open_values: 1, decision_status: 'open',
    })
    expect(docket.lanes.find((row) => row.kind === 'presentation_structure')).toMatchObject({
      decision_units: 3, required_values: 8, open_values: 8, decision_status: 'open',
    })
    expect(docket).not.toHaveProperty('decisions')
  })

  it('rejects stale decision-to-packet bindings and room drift', () => {
    const stale = input()
    stale.lanes[0].decisions.raw = stale.lanes[0].decisions.raw.replace(
      stale.lanes[0].packet.seal.sha256, 'f'.repeat(64),
    )
    stale.lanes[0].decisions.seal = sealed('receipt_prerequisites-decisions.json', JSON.parse(stale.lanes[0].decisions.raw)).seal
    expect(() => buildSettlementDropApprovalDocket(stale))
      .toThrow('receipt_prerequisites decisions do not target the supplied packet hash')

    const drifted = input()
    drifted.lanes[1].packet = sealed('player_identity.json', {
      artifact: 'settlement-drop-player-identity-review', target: { room_code: 'OTHER' },
    })
    expect(() => buildSettlementDropApprovalDocket(drifted)).toThrow('player_identity room does not match room_code')
  })

  it('requires every canonical lane exactly once and validates seals', () => {
    const missing = input()
    missing.lanes.pop()
    expect(() => buildSettlementDropApprovalDocket(missing))
      .toThrow('missing approval lanes: presentation_structure')
    const duplicate = input()
    duplicate.lanes.push(duplicate.lanes[0])
    expect(() => buildSettlementDropApprovalDocket(duplicate))
      .toThrow('duplicate approval lane receipt_prerequisites')
    const drifted = input()
    drifted.audit.seal.sha256 = 'f'.repeat(64)
    expect(() => buildSettlementDropApprovalDocket(drifted)).toThrow('audit seal does not match its bytes')
  })

  it('serializes deterministically', () => {
    const docket = buildSettlementDropApprovalDocket(input())
    expect(serializeSettlementDropApprovalDocket(docket)).toBe(serializeSettlementDropApprovalDocket(docket))
  })
})
