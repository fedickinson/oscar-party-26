import { describe, expect, it } from 'vitest'
import {
  inspectSettlementDropApprovalDecisions,
} from './settlement-drop-approval-decisions'

function fixture() {
  const envelope = (artifact: string) => ({
    decision_version: 1,
    artifact,
    target: { room_code: 'WDKH' },
    expected_packet_sha256: 'a'.repeat(64),
  })
  return {
    room_code: 'WDKH',
    lanes: {
      player_identity: {
        packet: {
          artifact: 'settlement-drop-player-identity-review', target: { room_code: 'WDKH' },
          players: [{ player_id: 'p1' }, { player_id: 'p2' }],
        },
        decisions: {
          ...envelope('settlement-drop-player-identity-decisions'),
          decisions: [
            { player_id: 'p1', canonical_name: null, note: null },
            { player_id: 'p2', canonical_name: 'Bob', note: null },
          ],
        },
      },
      asset_semantics: {
        packet: {
          artifact: 'settlement-drop-asset-semantics-review', target: { room_code: 'WDKH' },
          assets: [
            { id: 'portrait', structured_assignments: [{ kind: 'character', consumer: 'A' }] },
            { id: 'unused', structured_assignments: [] },
          ],
        },
        decisions: {
          ...envelope('settlement-drop-asset-semantics-decisions'),
          decisions: [
            { asset_id: 'portrait', approved_alt_text: 'A portrait', approve_structured_assignments: true, note: null },
            { asset_id: 'unused', approved_alt_text: null, approve_structured_assignments: null, note: null },
          ],
        },
      },
      quote_markup: {
        packet: {
          artifact: 'settlement-drop-quote-markup-review', target: { room_code: 'WDKH' },
          quotes: [{ quote_key: '4:0' }],
        },
        decisions: {
          ...envelope('settlement-drop-quote-markup-decisions'),
          decisions: [{ quote_key: '4:0', approved_plain_text: null as string | null, emphasis_treatment: null, note: null }],
        },
      },
      presentation_structure: {
        packet: {
          artifact: 'settlement-drop-presentation-structure-review', target: { room_code: 'WDKH' },
          acts: [{ observed_act_ordinal: 1, interstitial_slide_indices: [7] }],
          slides: [{ slide_index: 4, kind: 'beat', observed_act_ordinal: 1, beatline_group_candidate: 'B1', take_group: '4' }],
        },
        decisions: {
          ...envelope('settlement-drop-presentation-structure-decisions'),
          show: {
            title: 'Show', subtitle: 'Sub', closing_title: 'Close', opening_eyebrow: 'Open',
            muster_title: 'Muster', begins_label: 'Begin', note: null,
          },
          acts: [{
            observed_act_ordinal: 1, include: true, id: 'act-1', title: 'Act', subtitle: 'Sub',
            scene: 'hall', interstitial_slide_index: 7, interstitial_portrait_asset: 'portrait', note: null,
          }],
          beats: [{
            slide_index: 4, include: true, id: 'beat-1', kicker: 'Beat', title: 'Title', summary: 'Summary',
            weight: 'ordinary', portrait_asset: null, approve_beatline_group: true, approve_take_group: true, note: null,
          }],
        },
      },
      receipt_prerequisites: {
        packet: {
          artifact: 'settlement-drop-receipt-prerequisites-review', target: { room_code: 'WDKH' },
          candidate_entries: [{ entry_key: 'category:1' }],
        },
        decisions: {
          ...envelope('settlement-drop-receipt-prerequisites-decisions'),
          settlement: { title: 'Night', actor: 'Host', bingo_mode: 'preserve_live' },
          entries: [{ entry_key: 'category:1', approved_outcome: null as string | null, warrant: null, occurred_at: null, note: null }],
          bingo: { preserve_snapshot_marks: true, warrant: null, note: null },
          additional_fact_review: false,
        },
      },
    },
  }
}

describe('inspectSettlementDropApprovalDecisions', () => {
  it('counts only truth-bearing open requirements and expands conditional requirements', () => {
    const result = inspectSettlementDropApprovalDecisions(fixture())
    expect(result.player_identity).toMatchObject({ required_values: 2, open_values: 1, status: 'open' })
    expect(result.asset_semantics).toMatchObject({ required_values: 4, open_values: 2, status: 'open' })
    expect(result.quote_markup).toMatchObject({ required_values: 2, open_values: 2, status: 'open' })
    expect(result.presentation_structure).toMatchObject({ required_values: 21, open_values: 0, status: 'complete' })
    expect(result.receipt_prerequisites).toMatchObject({ required_values: 7, open_values: 2, status: 'open' })
    expect(result.receipt_prerequisites.open_items).toEqual([
      'entries[category:1].approved_outcome',
      'bingo.warrant',
    ])
  })

  it('requires the exact packet identity set once each', () => {
    const missing = fixture()
    missing.lanes.player_identity.decisions.decisions.pop()
    expect(() => inspectSettlementDropApprovalDecisions(missing))
      .toThrow('player_identity decisions are missing packet key p2')

    const duplicate = fixture()
    duplicate.lanes.quote_markup.decisions.decisions.push({
      quote_key: '4:0', approved_plain_text: null, emphasis_treatment: null, note: null,
    })
    expect(() => inspectSettlementDropApprovalDecisions(duplicate))
      .toThrow('quote_markup decisions contain duplicate packet key 4:0')
  })

  it('rejects unknown envelope fields and target drift', () => {
    const hidden = fixture()
    Object.assign(hidden.lanes.asset_semantics.decisions, { approved: true })
    expect(() => inspectSettlementDropApprovalDecisions(hidden))
      .toThrow('asset_semantics decisions has unknown field approved')

    const drifted = fixture()
    Object.assign(drifted.lanes.receipt_prerequisites.decisions.target, { room_id: 'other' })
    expect(() => inspectSettlementDropApprovalDecisions(drifted))
      .toThrow('receipt_prerequisites decision target does not exactly match the packet target')
  })

  it('rejects invalid completed values and cross-lane asset references', () => {
    const invalidName = fixture()
    invalidName.lanes.player_identity.decisions.decisions[0].canonical_name = '   '
    expect(() => inspectSettlementDropApprovalDecisions(invalidName))
      .toThrow('player_identity p1 canonical_name must be a non-empty string or null')

    const unknownPortrait = fixture()
    unknownPortrait.lanes.presentation_structure.decisions.acts[0].interstitial_portrait_asset = 'missing'
    expect(() => inspectSettlementDropApprovalDecisions(unknownPortrait))
      .toThrow('presentation_structure act 1 interstitial_portrait_asset references unknown asset missing')

    const duplicateNames = fixture()
    duplicateNames.lanes.player_identity.decisions.decisions[0].canonical_name = 'Bob'
    expect(() => inspectSettlementDropApprovalDecisions(duplicateNames))
      .toThrow('player_identity canonical_name Bob is assigned to more than one player')

    const markup = fixture()
    markup.lanes.quote_markup.decisions.decisions[0].approved_plain_text = 'A <b>point</b>.'
    expect(() => inspectSettlementDropApprovalDecisions(markup))
      .toThrow('quote_markup 4:0 approved_plain_text must not contain HTML tags')
  })

  it('requires included structure choices and outcome warrants, but not excluded details', () => {
    const value = fixture()
    Object.assign(value.lanes.presentation_structure.decisions.beats[0], {
      include: true, id: null, kicker: null, title: null, summary: null, weight: null,
      approve_beatline_group: null, approve_take_group: null,
    })
    value.lanes.receipt_prerequisites.decisions.entries[0].approved_outcome = 'resolved'
    const result = inspectSettlementDropApprovalDecisions(value)
    expect(result.presentation_structure.open_items).toEqual([
      'beats[4].id', 'beats[4].kicker', 'beats[4].title', 'beats[4].summary',
      'beats[4].weight', 'beats[4].approve_beatline_group', 'beats[4].approve_take_group',
    ])
    expect(result.receipt_prerequisites.open_items).toContain('entries[category:1].warrant')
  })

  it('rejects duplicate ceremony IDs and beats included beneath excluded acts', () => {
    const duplicateIds = fixture()
    duplicateIds.lanes.presentation_structure.packet.acts.push({
      observed_act_ordinal: 2, interstitial_slide_indices: [8],
    })
    duplicateIds.lanes.presentation_structure.decisions.acts.push({
      observed_act_ordinal: 2, include: true, id: 'act-1', title: 'Act 2', subtitle: 'Sub',
      scene: 'hall', interstitial_slide_index: 8, interstitial_portrait_asset: 'portrait', note: null,
    })
    expect(() => inspectSettlementDropApprovalDecisions(duplicateIds))
      .toThrow('presentation_structure act id act-1 is used more than once')

    const orphanedBeat = fixture()
    orphanedBeat.lanes.presentation_structure.decisions.acts[0].include = false
    Object.assign(orphanedBeat.lanes.presentation_structure.decisions.acts[0], {
      id: null, title: null, subtitle: null, scene: null,
      interstitial_slide_index: null, interstitial_portrait_asset: null,
    })
    Object.assign(orphanedBeat.lanes.presentation_structure.decisions.beats[0], {
      include: true, id: 'beat-1', kicker: 'Beat', title: 'Title', summary: 'Summary',
      weight: 'ordinary', approve_beatline_group: true, approve_take_group: true,
    })
    expect(() => inspectSettlementDropApprovalDecisions(orphanedBeat))
      .toThrow('presentation_structure beat 4 cannot be included under excluded act 1')
  })
})
