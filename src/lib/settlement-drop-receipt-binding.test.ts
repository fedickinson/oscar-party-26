import { describe, expect, it } from 'vitest'
import { sha256Hex } from './sha256'
import type { SealedTextArtifact } from './settlement-drop-asset-semantics'
import {
  buildSettlementDropReceiptBindingPacket,
  inspectSettlementDropReceiptBindingDecisions,
  serializeSettlementDropReceiptBindingDecisionTemplate,
  serializeSettlementDropReceiptBindingPacket,
} from './settlement-drop-receipt-binding'

function sealed(name: string, value: unknown): SealedTextArtifact {
  const raw = typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`
  return {
    raw,
    seal: { name, bytes: new TextEncoder().encode(raw).byteLength, sha256: sha256Hex(raw) },
  }
}

function fixture() {
  const receipt = sealed('receipt.json', {
    version: 1,
    source: 'synthetic-proof',
    room_code: 'ROOM',
    room_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    settlement_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    settlement_version: 1,
    manifest_hash: 'a'.repeat(64),
    players: [{ id: 'p1', name: 'Arya' }],
    characters: [{ id: 'wolf', name: 'Wolf', player_id: 'p1' }],
    score_events: [
      { id: 'draft:wolf:1', kind: 'draft', player_id: 'p1', character_id: 'wolf', label: 'Wolf finds the path', points: 4 },
      { id: 'bingo-square:card:0', kind: 'bingo', player_id: 'p1', label: 'A promise breaks', points: 3 },
    ],
    settled_facts: [
      { id: 'wolf-finds-path', sequence: 1, title: 'Wolf finds the path', outcome: 'resolved', board_status: 'authored', winner: { id: 'wolf', name: 'Wolf' } },
      { id: 'door-opens', sequence: 2, title: 'The sealed door opens', outcome: 'resolved', board_status: 'unscored', winner: { id: 'wolf', name: 'Wolf' } },
    ],
    personal_cards: [{ player_id: 'p1', bingo: Array.from({ length: 25 }, (_, index) => ({ label: index === 12 ? 'FREE' : `Square ${index}`, marked: index === 12, free: index === 12 })) }],
  })
  const beatlines = sealed('beatlines.json', {
    B1: [
      { kind: 'draft', char: 'Wolf', text: 'Finds the path to Arya', pts: '+4' },
      { kind: 'bingo', player: 'Arya', square: 'A promise breaks', pts: '+3' },
    ],
    B2: [{ kind: 'nocard', text: 'The sealed door opens' }],
  })
  const presentationPacketValue = {
    packet_version: 1,
    artifact: 'settlement-drop-presentation-structure-review',
    target: { room_code: 'ROOM' },
    inputs: {
      ceremony: { name: 'ceremony.html', bytes: 1, sha256: 'b'.repeat(64) },
      beatlines: beatlines.seal,
      takes: { name: 'takes.json', bytes: 2, sha256: 'c'.repeat(64) },
    },
    coverage: { slides: 5, acts: 1, beats: 2, interstitials: 1, beatline_groups: 2, beatline_group_candidates: 2, take_groups: 0, take_groups_mapped: 0, unresolved_beatline_groups: [] },
    acts: [{ observed_act_ordinal: 1, divider_slide_index: 1, scene_class: 'scene-hall', title: 'Act', subtitle: 'Sub', beat_slide_indices: [2, 3], interstitial_slide_indices: [4] }],
    slides: [
      { slide_index: 2, ordinal: 3, classes: ['beat'], scene_class: null, kind: 'beat', observed_act_ordinal: 1, kicker: 'One', title: 'Path', summary: 'Summary', ledger_rows: 2, beatline_group_candidate: 'B1', beatline_match_evidence: { shared_tokens: 3, runner_up_shared_tokens: 0 }, take_group: null, observed_weight_evidence: null },
      { slide_index: 3, ordinal: 4, classes: ['beat'], scene_class: null, kind: 'beat', observed_act_ordinal: 1, kicker: 'Two', title: 'Door', summary: 'Summary', ledger_rows: 1, beatline_group_candidate: 'B2', beatline_match_evidence: { shared_tokens: 2, runner_up_shared_tokens: 0 }, take_group: null, observed_weight_evidence: null },
    ],
  }
  const presentationPacket = sealed('presentation.json', presentationPacketValue)
  const presentationDecisions = sealed('presentation-decisions.json', {
    decision_version: 1,
    artifact: 'settlement-drop-presentation-structure-decisions',
    target: { room_code: 'ROOM' },
    expected_packet_sha256: presentationPacket.seal.sha256,
    show: { title: 'Night', subtitle: 'Sub', closing_title: 'Close', opening_eyebrow: 'Open', muster_title: 'Muster', begins_label: 'Begin', note: null },
    acts: [{ observed_act_ordinal: 1, include: true, id: 'act-one', title: 'Act', subtitle: 'Sub', scene: 'hall', interstitial_slide_index: 4, interstitial_portrait_asset: 'wolf-portrait', note: null }],
    beats: [
      { slide_index: 2, include: true, id: 'path', kicker: 'One', title: 'Path', summary: 'Summary', weight: 'ordinary', portrait_asset: 'wolf-portrait', approve_beatline_group: true, approve_take_group: null, note: null },
      { slide_index: 3, include: true, id: 'door', kicker: 'Two', title: 'Door', summary: 'Summary', weight: 'ordinary', portrait_asset: null, approve_beatline_group: true, approve_take_group: null, note: null },
    ],
  })
  const assetPacket = sealed('assets.json', {
    packet_version: 1,
    artifact: 'settlement-drop-asset-semantics-review',
    target: { room_code: 'ROOM' },
    assets: [{ id: 'wolf-portrait' }],
  })
  return { receipt, beatlines, presentationPacket, presentationDecisions, assetPacket }
}

function completeDecisions() {
  const value = fixture()
  const packet = buildSettlementDropReceiptBindingPacket(value)
  const decisions = JSON.parse(serializeSettlementDropReceiptBindingDecisionTemplate(packet))
  decisions.bindings[0].beat_id = 'path'
  decisions.bindings[1].beat_id = 'path'
  decisions.bindings[2].beat_id = 'door'
  decisions.legacy_lines[0] = { ...decisions.legacy_lines[0], disposition: 'represented', receipt_target_kind: 'score_event', receipt_target_id: 'draft:wolf:1' }
  decisions.legacy_lines[1] = { ...decisions.legacy_lines[1], disposition: 'represented', receipt_target_kind: 'score_event', receipt_target_id: 'bingo-square:card:0' }
  decisions.legacy_lines[2] = { ...decisions.legacy_lines[2], disposition: 'represented', receipt_target_kind: 'unscored_fact', receipt_target_id: 'door-opens' }
  return { value, packet, decisions }
}

describe('settlement-drop receipt binding', () => {
  it('builds a receipt-owned target inventory while leaving every binding decision open', () => {
    const value = fixture()
    const packet = buildSettlementDropReceiptBindingPacket(value)
    const decisions = JSON.parse(serializeSettlementDropReceiptBindingDecisionTemplate(packet))
    expect(packet.coverage).toMatchObject({ included_beats: 2, score_events: 2, unscored_facts: 1, legacy_lines: 3 })
    expect(packet.targets.map((target) => target.target_id)).toEqual([
      'bingo-square:card:0', 'draft:wolf:1', 'door-opens',
    ])
    expect(packet.legacy_lines.map((line) => line.candidate_beat_id)).toEqual(['path', 'path', 'door'])
    expect(decisions.expected_packet_sha256).toBe(sha256Hex(serializeSettlementDropReceiptBindingPacket(packet)))
    expect(decisions.bindings.every((binding: { beat_id: unknown }) => binding.beat_id === null)).toBe(true)
    expect(decisions.legacy_lines.every((line: { disposition: unknown }) => line.disposition === null)).toBe(true)
    expect(inspectSettlementDropReceiptBindingDecisions(packet, decisions)).toMatchObject({
      required_values: 6, open_values: 6, status: 'open',
    })
  })

  it('accepts complete target placement and explicit legacy representation rulings', () => {
    const { packet, decisions } = completeDecisions()
    expect(inspectSettlementDropReceiptBindingDecisions(packet, decisions)).toMatchObject({
      required_values: 6, open_values: 0, status: 'complete',
    })
  })

  it('rejects unknown beats, incompatible or duplicate legacy targets, and a completed empty beat', () => {
    const unknown = completeDecisions()
    unknown.decisions.bindings[0].beat_id = 'missing'
    expect(() => inspectSettlementDropReceiptBindingDecisions(unknown.packet, unknown.decisions))
      .toThrow('references unknown included beat missing')

    const incompatible = completeDecisions()
    incompatible.decisions.legacy_lines[1].receipt_target_id = 'draft:wolf:1'
    expect(() => inspectSettlementDropReceiptBindingDecisions(incompatible.packet, incompatible.decisions))
      .toThrow('bingo legacy line must reference a bingo score event')

    const duplicate = completeDecisions()
    duplicate.packet.legacy_lines[1] = {
      ...duplicate.packet.legacy_lines[1], kind: 'draft', label: 'Duplicate draft account', points: 4,
    }
    duplicate.decisions.expected_packet_sha256 = sha256Hex(serializeSettlementDropReceiptBindingPacket(duplicate.packet))
    duplicate.decisions.legacy_lines[1] = {
      ...duplicate.decisions.legacy_lines[1],
      disposition: 'represented', receipt_target_kind: 'score_event', receipt_target_id: 'draft:wolf:1',
    }
    expect(() => inspectSettlementDropReceiptBindingDecisions(duplicate.packet, duplicate.decisions))
      .toThrow('represents more than one legacy line')

    const empty = completeDecisions()
    empty.decisions.bindings[2].beat_id = 'path'
    empty.decisions.legacy_lines[2] = {
      ...empty.decisions.legacy_lines[2],
      disposition: 'superseded', receipt_target_kind: null, receipt_target_id: null,
      note: 'The canonical record places this fact with the prior beat.',
    }
    expect(() => inspectSettlementDropReceiptBindingDecisions(empty.packet, empty.decisions))
      .toThrow('included beat door must receive at least one receipt target')
  })

  it('rejects undeclared fields in the decision target and binding rows', () => {
    const targetField = completeDecisions()
    targetField.decisions.target.extra = true
    expect(() => inspectSettlementDropReceiptBindingDecisions(targetField.packet, targetField.decisions))
      .toThrow('receipt binding decisions target has unknown field extra')

    const bindingField = completeDecisions()
    bindingField.decisions.bindings[0].key = 'not-part-of-the-contract'
    expect(() => inspectSettlementDropReceiptBindingDecisions(bindingField.packet, bindingField.decisions))
      .toThrow('receipt target binding has unknown field key')
  })

  it('fails when the receipt, presentation decision hash, or sealed beatlines drift', () => {
    const wrongRoom = fixture()
    const receiptValue = JSON.parse(wrongRoom.receipt.raw)
    receiptValue.room_code = 'OTHER'
    wrongRoom.receipt = sealed('receipt.json', receiptValue)
    expect(() => buildSettlementDropReceiptBindingPacket(wrongRoom)).toThrow('receipt room does not match')

    const staleDecision = fixture()
    const decisionValue = JSON.parse(staleDecision.presentationDecisions.raw)
    decisionValue.expected_packet_sha256 = 'f'.repeat(64)
    staleDecision.presentationDecisions = sealed('presentation-decisions.json', decisionValue)
    expect(() => buildSettlementDropReceiptBindingPacket(staleDecision)).toThrow('do not target the supplied presentation packet')

    const changedBeatlines = fixture()
    changedBeatlines.beatlines = sealed('beatlines.json', { B1: [], B2: [] })
    expect(() => buildSettlementDropReceiptBindingPacket(changedBeatlines)).toThrow('beatlines do not match the presentation packet seal')
  })
})
