import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  composeSettlementDropFinalManifest,
  inspectSettlementDropFinalAuthoringDecisions,
  buildSettlementDropFinalAuthoringPacket,
  serializeSettlementDropFinalAuthoringDecisionTemplate,
  serializeSettlementDropFinalAuthoringPacket,
} from './settlement-drop-final-composer'
import {
  buildSettlementDropQuoteGroundingPlan,
  serializeSettlementDropQuoteGroundingPacket,
  serializeSettlementDropQuoteGroundingPlan,
  type SettlementDropQuoteGroundingPacket,
} from './settlement-drop-quote-grounding'
import {
  buildSettlementDropQuoteAuthorization,
  publishSettlementDropQuotes,
  serializeSettlementDropQuoteAuthorization,
  serializeSettlementDropQuotePublication,
} from './settlement-drop-quote-publication'
import {
  buildSettlementDropReceiptBindingPacket,
  serializeSettlementDropReceiptBindingPacket,
} from './settlement-drop-receipt-binding'
import { serializeSettlementDropAssetSemanticsPacket } from './settlement-drop-asset-semantics'
import { serializeSettlementDropPlayerIdentityPacket } from './settlement-drop-player-identity'
import { serializeSettlementDropPresentationStructurePacket } from './settlement-drop-presentation-structure'
import { sha256Hex } from './sha256'

function fixture() {
  const roomId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const playerId = '11111111-1111-4111-8111-111111111111'
  const receipt = {
    version: 1,
    source: 'synthetic-proof',
    room_code: 'ROOM',
    room_id: roomId,
    settlement_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    settlement_version: 1,
    manifest_hash: 'a'.repeat(64),
    players: [{ id: playerId, name: 'Arya' }],
    characters: [{ id: 'wolf', name: 'Wolf', player_id: playerId }],
    score_events: [{
      id: 'draft:wolf:1', kind: 'draft', player_id: playerId,
      character_id: 'wolf', label: 'The wolf arrived', points: 4,
    }],
    personal_cards: [{
      player_id: playerId,
      bingo: Array.from({ length: 25 }, (_, index) => ({
        label: index === 12 ? 'FREE' : `Square ${index}`,
        marked: index === 12,
        free: index === 12,
      })),
    }],
  }
  const receiptRaw = `${JSON.stringify(receipt, null, 2)}\n`
  const seal = { name: 'source.json', bytes: 2, sha256: 'b'.repeat(64) }
  const beatlinesRaw = `${JSON.stringify({
    B1: [{ kind: 'draft', char: 'Wolf', pts: '+4', text: 'The wolf arrived' }],
  }, null, 2)}\n`
  const beatlinesSeal = {
    name: 'beatlines.json',
    bytes: new TextEncoder().encode(beatlinesRaw).byteLength,
    sha256: sha256Hex(beatlinesRaw),
  }
  const assetPacket = {
    packet_version: 1,
    artifact: 'settlement-drop-asset-semantics-review',
    target: { room_code: 'ROOM' },
    inputs: { ceremony: seal, legacy_assets: seal, extraction: seal },
    coverage: {
      assets: 2, exact_ceremony_occurrences: 2, html_image_uses: 2,
      character_assignments: 1, pundit_assignments: 0, player_sigil_assignments: 1,
      assets_without_structured_assignment: 0,
    },
    assets: [{
      id: 'wolf_portrait', path: 'assets/wolf.jpeg', mime_type: 'image/jpeg', bytes: 4,
      sha256: 'c'.repeat(64),
      structured_assignments: [{
        kind: 'character', consumer: 'Wolf', source: 'ceremony.CHARS.img',
      }],
      html_evidence: {
        occurrences: 1, image_uses: 1, empty_alt_uses: 0,
        classes: ['portrait'], nonempty_alt_texts: ['Wolf'],
      },
      candidate_alt_texts: ['Wolf'],
    }, {
      id: 'arya_sigil', path: 'assets/arya.webp', mime_type: 'image/webp', bytes: 4,
      sha256: 'd'.repeat(64),
      structured_assignments: [{
        kind: 'player_sigil', consumer: 'Arya', source: 'ceremony.PDATA.sigil',
      }],
      html_evidence: {
        occurrences: 1, image_uses: 1, empty_alt_uses: 0,
        classes: ['sigil'], nonempty_alt_texts: ['Arya'],
      },
      candidate_alt_texts: ['Arya'],
    }],
  }
  const assetPacketRaw = serializeSettlementDropAssetSemanticsPacket(assetPacket as never)
  const assetDecisions = {
    decision_version: 1,
    artifact: 'settlement-drop-asset-semantics-decisions',
    target: { room_code: 'ROOM' },
    expected_packet_sha256: sha256Hex(assetPacketRaw),
    decisions: [
      { asset_id: 'wolf_portrait', approved_alt_text: 'Portrait of Wolf', approve_structured_assignments: true, note: null },
      { asset_id: 'arya_sigil', approved_alt_text: 'Arya sigil', approve_structured_assignments: true, note: null },
    ],
  }
  const presentationPacket = {
    packet_version: 1,
    artifact: 'settlement-drop-presentation-structure-review',
    target: { room_code: 'ROOM' },
    inputs: { ceremony: seal, beatlines: beatlinesSeal, takes: seal },
    coverage: {
      slides: 3, acts: 1, beats: 1, interstitials: 1, beatline_groups: 1,
      beatline_group_candidates: 1, take_groups: 1, take_groups_mapped: 1,
      unresolved_beatline_groups: [],
    },
    acts: [{
      observed_act_ordinal: 1, divider_slide_index: 0, scene_class: 'scene-hall',
      title: 'Act', subtitle: 'Subtitle', beat_slide_indices: [1], interstitial_slide_indices: [2],
    }],
    slides: [{
      slide_index: 0, ordinal: 1, classes: ['actdiv'], scene_class: 'scene-hall',
      kind: 'act_divider', observed_act_ordinal: 1, kicker: null, title: 'Act', summary: 'Subtitle',
      ledger_rows: 0, beatline_group_candidate: null, beatline_match_evidence: null,
      take_group: null, observed_weight_evidence: null,
    }, {
      slide_index: 1, ordinal: 2, classes: ['beat'], scene_class: 'scene-hall',
      kind: 'beat', observed_act_ordinal: 1, kicker: 'Beat', title: 'Arrival', summary: 'The wolf arrived.',
      ledger_rows: 1, beatline_group_candidate: 'B1',
      beatline_match_evidence: { shared_tokens: 2, runner_up_shared_tokens: 0 },
      take_group: '1', observed_weight_evidence: null,
    }, {
      slide_index: 2, ordinal: 3, classes: ['inter'], scene_class: 'scene-table',
      kind: 'interstitial', observed_act_ordinal: 1, kicker: null, title: 'Table', summary: null,
      ledger_rows: 0, beatline_group_candidate: null, beatline_match_evidence: null,
      take_group: null, observed_weight_evidence: null,
    }],
  }
  const presentationPacketRaw = serializeSettlementDropPresentationStructurePacket(presentationPacket as never)
  const presentationDecisions = {
    decision_version: 1,
    artifact: 'settlement-drop-presentation-structure-decisions',
    target: { room_code: 'ROOM' },
    expected_packet_sha256: sha256Hex(presentationPacketRaw),
    show: {
      title: 'Night', subtitle: 'The record', closing_title: 'Close',
      opening_eyebrow: 'Open', muster_title: 'Muster', begins_label: 'Begin', note: null,
    },
    acts: [{
      observed_act_ordinal: 1, include: true, id: 'act', title: 'Act', subtitle: 'Subtitle',
      scene: 'hall', interstitial_slide_index: 2, interstitial_portrait_asset: 'wolf_portrait', note: null,
    }],
    beats: [{
      slide_index: 1, include: true, id: 'arrival', kicker: 'Beat', title: 'Arrival',
      summary: 'The wolf arrived.', weight: 'ordinary', portrait_asset: 'wolf_portrait',
      approve_beatline_group: true, approve_take_group: true, note: null,
    }],
  }
  const identityPacket = {
    packet_version: 1,
    artifact: 'settlement-drop-player-identity-review',
    target: { room_code: 'ROOM', snapshot_room_id: roomId },
    inputs: { ceremony: seal, tiers: seal, personal: seal, board: seal, rooms: seal, players: seal },
    coverage: {
      snapshot_players: 1, ceremony_player_ids: 1, exact_uuid_joins: 1,
      display_name_variants: 0, missing_from_tiers: [], missing_from_personal: [], missing_from_board: [],
    },
    players: [{
      player_id: playerId, snapshot_name: 'Arya', ceremony_name: 'Arya', exact_name_match: true,
      observed_names: { tiers: ['Arya'], personal: ['Arya'], board: ['Arya'] },
    }],
  }
  const identityPacketRaw = serializeSettlementDropPlayerIdentityPacket(identityPacket as never)
  const identityDecisions = {
    decision_version: 1,
    artifact: 'settlement-drop-player-identity-decisions',
    target: identityPacket.target,
    expected_packet_sha256: sha256Hex(identityPacketRaw),
    decisions: [{ player_id: playerId, canonical_name: 'Arya', note: null }],
  }
  const input = {
    receiptRaw,
    presentationPacketRaw,
    presentationDecisionsRaw: `${JSON.stringify(presentationDecisions, null, 2)}\n`,
    assetPacketRaw,
    assetDecisionsRaw: `${JSON.stringify(assetDecisions, null, 2)}\n`,
    playerIdentityPacketRaw: identityPacketRaw,
    playerIdentityDecisionsRaw: `${JSON.stringify(identityDecisions, null, 2)}\n`,
  }
  return {
    input, receipt, receiptRaw, assetPacket, assetPacketRaw, assetDecisions,
    presentationPacket, presentationPacketRaw, presentationDecisions,
    identityPacket, identityPacketRaw, identityDecisions, beatlinesRaw,
  }
}

async function compositionFixture() {
  const value = fixture()
  const sealed = (name: string, raw: string) => ({
    raw,
    seal: { name, bytes: new TextEncoder().encode(raw).byteLength, sha256: sha256Hex(raw) },
  })
  const bindingPacket = buildSettlementDropReceiptBindingPacket({
    receipt: sealed('receipt.json', value.receiptRaw),
    presentationPacket: sealed('presentation.json', value.presentationPacketRaw),
    presentationDecisions: sealed('presentation-decisions.json', value.input.presentationDecisionsRaw),
    assetPacket: sealed('assets.json', value.assetPacketRaw),
    beatlines: sealed('beatlines.json', value.beatlinesRaw),
  })
  const bindingPacketRaw = serializeSettlementDropReceiptBindingPacket(bindingPacket)
  const bindingDecisions = {
    decision_version: 1,
    artifact: 'settlement-drop-receipt-binding-decisions',
    target: bindingPacket.target,
    expected_packet_sha256: sha256Hex(bindingPacketRaw),
    bindings: [{
      target_kind: 'score_event', target_id: 'draft:wolf:1', beat_id: 'arrival', note: null,
    }],
    legacy_lines: [{
      line_key: 'B1:0', disposition: 'represented', receipt_target_kind: 'score_event',
      receipt_target_id: 'draft:wolf:1', note: null,
    }],
  }
  const bindingDecisionsRaw = `${JSON.stringify(bindingDecisions, null, 2)}\n`
  const seal = { name: 'review.json', bytes: 2, sha256: 'e'.repeat(64) }
  const sealOf = (name: string, raw: string) => ({
    name, bytes: new TextEncoder().encode(raw).byteLength, sha256: sha256Hex(raw),
  })
  const quotePacket: SettlementDropQuoteGroundingPacket = {
    packet_version: 1,
    artifact: 'settlement-drop-quote-grounding-review',
    target: bindingPacket.target,
    inputs: {
      receipt: sealOf('receipt.json', value.receiptRaw), ceremony: seal,
      beatlines: sealOf('beatlines.json', value.beatlinesRaw), legacy_assets: seal, extraction: seal,
      takes: seal,
      asset_semantics: sealOf('assets.json', value.assetPacketRaw),
      asset_decisions: sealOf('asset-decisions.json', value.input.assetDecisionsRaw),
      quote_markup: seal, quote_markup_decisions: seal,
      receipt_binding: sealOf('binding.json', bindingPacketRaw),
      receipt_binding_decisions: sealOf('binding-decisions.json', bindingDecisionsRaw),
      presentation_structure: sealOf('presentation.json', value.presentationPacketRaw),
      presentation_decisions: sealOf('presentation-decisions.json', value.input.presentationDecisionsRaw),
    },
    doctrine: {
      pipeline: 'scripts/grounded-line.mts',
      fact_source_kinds: ['screen_capture', 'table_testimony', 'operator_record', 'settlement_record', 'recap'],
      independent_screen_warrants: ['screen_capture', 'table_testimony', 'operator_record', 'settlement_record'],
      source_material_role: 'attitude_only', recap_role: 'corroboration_only',
    },
    coverage: {
      approved_take_groups: 0, quotes: 0, quotes_with_legacy_markup: 0,
      receipt_characters: 1, approved_pundit_assets: 0,
    },
    receipt_characters: [{ id: 'wolf', name: 'Wolf' }],
    settlement_records: [{
      record_key: 'score_event:draft:wolf:1', id: 'draft:wolf:1', kind: 'score_event',
      label: 'The wolf arrived', beat_id: 'arrival',
    }],
    pundit_assets: [],
    quotes: [],
  }
  const quotePacketRaw = serializeSettlementDropQuoteGroundingPacket(quotePacket)
  const quoteDecisions = {
    decision_version: 1,
    artifact: 'settlement-drop-quote-grounding-decisions',
    target: quotePacket.target,
    expected_packet_sha256: sha256Hex(quotePacketRaw),
    decisions: [],
  }
  const quoteDecisionsRaw = `${JSON.stringify(quoteDecisions, null, 2)}\n`
  const quotePlan = buildSettlementDropQuoteGroundingPlan(quotePacket, quoteDecisionsRaw)
  const quotePlanRaw = serializeSettlementDropQuoteGroundingPlan(quotePlan)
  const quoteAuthorization = buildSettlementDropQuoteAuthorization(quotePlanRaw, {
    transcript_version: 1,
    artifact: 'settlement-drop-quote-authorization-transcript',
    target: quotePlan.target,
    plan_sha256: sha256Hex(quotePlanRaw),
    acknowledged_job_ids: [],
    acknowledged_omission_ids: [],
    acknowledged_budget: quotePlan.budget,
    note: 'Authorize the exact zero-spend quote plan.',
  })
  const quoteAuthorizationRaw = serializeSettlementDropQuoteAuthorization(quoteAuthorization)
  const quotePublication = (await publishSettlementDropQuotes(
    quotePlanRaw,
    quoteAuthorizationRaw,
    async () => { throw new Error('zero-job plan called generator') },
  )).publication
  if (!quotePublication) throw new Error('zero-job quote publication was unexpectedly blocked')
  const finalPacket = buildSettlementDropFinalAuthoringPacket(value.input)
  const finalPacketRaw = serializeSettlementDropFinalAuthoringPacket(finalPacket)
  const finalDecisions = JSON.parse(serializeSettlementDropFinalAuthoringDecisionTemplate(finalPacket))
  Object.assign(finalDecisions.players[0], {
    house: 'House Stark', accent: 'ash', portrait_asset_id: 'arya_sigil',
  })
  Object.assign(finalDecisions.characters[0], {
    kind: 'creature', muster_tier: 'lead', portrait_asset_id: 'wolf_portrait',
    quiet_drawer_rows: [{ label: 'Howls at the moon', points: 2 }],
  })
  return {
    ...value.input,
    finalAuthoringPacketRaw: finalPacketRaw,
    finalAuthoringDecisionsRaw: `${JSON.stringify(finalDecisions, null, 2)}\n`,
    receiptBindingPacketRaw: bindingPacketRaw,
    receiptBindingDecisionsRaw: bindingDecisionsRaw,
    quoteGroundingPacketRaw: quotePacketRaw,
    quoteGroundingDecisionsRaw: quoteDecisionsRaw,
    quoteGroundingPlanRaw: quotePlanRaw,
    quoteAuthorizationRaw,
    quotePublicationRaw: serializeSettlementDropQuotePublication(quotePublication),
    beatlinesRaw: value.beatlinesRaw,
    receiptPath: 'receipt.json',
  }
}

describe('settlement-drop final composer', () => {
  it('derives only receipt-owned identities and approved structured asset candidates', () => {
    const { input } = fixture()
    const packet = buildSettlementDropFinalAuthoringPacket(input)

    expect(packet.players).toEqual([{
      player_id: '11111111-1111-4111-8111-111111111111',
      canonical_name: 'Arya', candidate_sigil_asset_ids: ['arya_sigil'],
    }])
    expect(packet.characters).toEqual([{
      character_id: 'wolf', name: 'Wolf',
      player_id: '11111111-1111-4111-8111-111111111111',
      candidate_portrait_asset_ids: ['wolf_portrait'], settled_points: 4,
    }])
    expect(packet.inputs.receipt_sha256).toBe(sha256Hex(input.receiptRaw))
  })

  it('deduplicates repeated approved assignment evidence into one portrait choice', () => {
    const value = fixture()
    value.assetPacket.assets[0].structured_assignments.push({
      kind: 'character', consumer: 'Wolf', source: 'ceremony.CHARS.img',
    })
    value.input.assetPacketRaw = serializeSettlementDropAssetSemanticsPacket(value.assetPacket as never)
    value.assetDecisions.expected_packet_sha256 = sha256Hex(value.input.assetPacketRaw)
    value.input.assetDecisionsRaw = `${JSON.stringify(value.assetDecisions, null, 2)}\n`

    expect(buildSettlementDropFinalAuthoringPacket(value.input).characters[0].candidate_portrait_asset_ids)
      .toEqual(['wolf_portrait'])
  })

  it('leaves every remaining ontological and presentation choice open', () => {
    const { input } = fixture()
    const packet = buildSettlementDropFinalAuthoringPacket(input)
    const template = JSON.parse(serializeSettlementDropFinalAuthoringDecisionTemplate(packet))
    const status = inspectSettlementDropFinalAuthoringDecisions(packet, template)

    expect(template.players[0]).toMatchObject({
      house: null, accent: null, portrait_asset_id: null,
    })
    expect(template.characters[0]).toMatchObject({
      kind: null, muster_tier: null, portrait_asset_id: null, quiet_drawer_rows: null,
    })
    expect(status).toMatchObject({ required_values: 7, open_values: 7, status: 'open' })
  })

  it('accepts explicit final choices and rejects portraits outside approved assignments', () => {
    const { input } = fixture()
    const packet = buildSettlementDropFinalAuthoringPacket(input)
    const decisions = JSON.parse(serializeSettlementDropFinalAuthoringDecisionTemplate(packet))
    Object.assign(decisions.players[0], {
      house: 'House Stark', accent: 'ash', portrait_asset_id: 'arya_sigil',
    })
    Object.assign(decisions.characters[0], {
      kind: 'creature', muster_tier: 'lead', portrait_asset_id: 'wolf_portrait',
      quiet_drawer_rows: [{ label: 'Howls at the moon', points: 2 }],
    })
    expect(inspectSettlementDropFinalAuthoringDecisions(packet, decisions)).toMatchObject({
      required_values: 7, open_values: 0, status: 'complete',
    })

    decisions.characters[0].portrait_asset_id = 'arya_sigil'
    expect(() => inspectSettlementDropFinalAuthoringDecisions(packet, decisions))
      .toThrow('portrait is not an approved assigned asset')
  })

  it('rejects emoji in final authored copy', () => {
    const packet = buildSettlementDropFinalAuthoringPacket(fixture().input)
    const decisions = JSON.parse(serializeSettlementDropFinalAuthoringDecisionTemplate(packet))
    decisions.players[0].house = 'House Wolf \u{1F43A}'
    decisions.players[0].accent = 'ash'
    decisions.players[0].portrait_asset_id = 'arya_sigil'
    Object.assign(decisions.characters[0], {
      kind: 'creature', muster_tier: 'lead', portrait_asset_id: 'wolf_portrait',
      quiet_drawer_rows: [],
    })

    expect(() => inspectSettlementDropFinalAuthoringDecisions(packet, decisions))
      .toThrow('player house must not contain emoji')
  })

  it('rejects stale upstream decisions and canonical names that differ from the receipt', () => {
    const stale = fixture()
    stale.assetDecisions.expected_packet_sha256 = 'f'.repeat(64)
    stale.input.assetDecisionsRaw = `${JSON.stringify(stale.assetDecisions, null, 2)}\n`
    expect(() => buildSettlementDropFinalAuthoringPacket(stale.input))
      .toThrow('asset_semantics decisions do not target the exact packet bytes')

    const renamed = fixture()
    renamed.identityDecisions.decisions[0].canonical_name = 'Arya the Edited'
    renamed.input.playerIdentityDecisionsRaw = `${JSON.stringify(renamed.identityDecisions, null, 2)}\n`
    expect(() => buildSettlementDropFinalAuthoringPacket(renamed.input))
      .toThrow('must match the settlement receipt')
  })

  it('serializes packet bytes deterministically', () => {
    const packet = buildSettlementDropFinalAuthoringPacket(fixture().input)
    expect(serializeSettlementDropFinalAuthoringPacket(packet))
      .toBe(serializeSettlementDropFinalAuthoringPacket(packet))
  })

  it('composes reviewed structure, receipt bindings, and publication through the real compiler', async () => {
    const input = await compositionFixture()
    const result = composeSettlementDropFinalManifest(input)

    expect(result.compiled.settlement.settlement_id).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
    expect(result.manifest.players[0]).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111', name: 'Arya', portrait_asset: 'arya_sigil',
    })
    expect(result.manifest.characters[0].drawer.beats).toEqual([
      { evidence_id: 'draft:wolf:1' },
      { label: 'Howls at the moon', points: 2, fired: false },
    ])
    expect(result.manifest.acts[0].beats[0]).toMatchObject({
      id: 'arrival', ledger: [{ evidence_id: 'draft:wolf:1' }], quotes: [],
    })
    expect(result.manifestRaw.endsWith('\n')).toBe(true)
  })

  it('rejects stale final packets and receipt bindings before compiler composition', async () => {
    const stalePacket = await compositionFixture()
    const packet = JSON.parse(stalePacket.finalAuthoringPacketRaw)
    packet.players[0].canonical_name = 'Forged'
    stalePacket.finalAuthoringPacketRaw = `${JSON.stringify(packet, null, 2)}\n`
    expect(() => composeSettlementDropFinalManifest(stalePacket))
      .toThrow('does not match the exact current upstream artifacts')

    const staleBinding = await compositionFixture()
    const binding = JSON.parse(staleBinding.receiptBindingPacketRaw)
    binding.targets[0].label = 'Changed'
    staleBinding.receiptBindingPacketRaw = `${JSON.stringify(binding, null, 2)}\n`
    expect(() => composeSettlementDropFinalManifest(staleBinding))
      .toThrow('receipt binding packet does not match the exact current')

    const staleQuoteJoin = await compositionFixture()
    const quotePacket = JSON.parse(staleQuoteJoin.quoteGroundingPacketRaw)
    quotePacket.inputs.asset_decisions.sha256 = 'f'.repeat(64)
    staleQuoteJoin.quoteGroundingPacketRaw = serializeSettlementDropQuoteGroundingPacket(quotePacket)
    const quoteDecisions = JSON.parse(staleQuoteJoin.quoteGroundingDecisionsRaw)
    quoteDecisions.expected_packet_sha256 = sha256Hex(staleQuoteJoin.quoteGroundingPacketRaw)
    staleQuoteJoin.quoteGroundingDecisionsRaw = `${JSON.stringify(quoteDecisions, null, 2)}\n`
    const plan = buildSettlementDropQuoteGroundingPlan(quotePacket, staleQuoteJoin.quoteGroundingDecisionsRaw)
    staleQuoteJoin.quoteGroundingPlanRaw = serializeSettlementDropQuoteGroundingPlan(plan)
    const authorization = buildSettlementDropQuoteAuthorization(staleQuoteJoin.quoteGroundingPlanRaw, {
      transcript_version: 1,
      artifact: 'settlement-drop-quote-authorization-transcript',
      target: plan.target,
      plan_sha256: sha256Hex(staleQuoteJoin.quoteGroundingPlanRaw),
      acknowledged_job_ids: [],
      acknowledged_omission_ids: [],
      acknowledged_budget: plan.budget,
      note: 'Authorize the tampered zero-spend plan for rejection proof.',
    })
    staleQuoteJoin.quoteAuthorizationRaw = serializeSettlementDropQuoteAuthorization(authorization)
    const publication = (await publishSettlementDropQuotes(
      staleQuoteJoin.quoteGroundingPlanRaw,
      staleQuoteJoin.quoteAuthorizationRaw,
      async () => { throw new Error('zero-job plan called generator') },
    )).publication
    if (!publication) throw new Error('tampered zero-job fixture unexpectedly blocked')
    staleQuoteJoin.quotePublicationRaw = serializeSettlementDropQuotePublication(publication)
    expect(() => composeSettlementDropFinalManifest(staleQuoteJoin))
      .toThrow('quote grounding packet asset_decisions seal does not match the composed artifact')
  })

  it('runs the local composition command through a real file boundary', async () => {
    const input = await compositionFixture()
    const directory = mkdtempSync(join(tmpdir(), 'settlement-drop-final-composer-'))
    try {
      const files = {
        receipt: input.receiptRaw,
        presentation: input.presentationPacketRaw,
        presentationDecisions: input.presentationDecisionsRaw,
        assets: input.assetPacketRaw,
        assetDecisions: input.assetDecisionsRaw,
        identity: input.playerIdentityPacketRaw,
        identityDecisions: input.playerIdentityDecisionsRaw,
        final: input.finalAuthoringPacketRaw,
        finalDecisions: input.finalAuthoringDecisionsRaw,
        binding: input.receiptBindingPacketRaw,
        bindingDecisions: input.receiptBindingDecisionsRaw,
        quotePacket: input.quoteGroundingPacketRaw,
        quoteDecisions: input.quoteGroundingDecisionsRaw,
        quotePlan: input.quoteGroundingPlanRaw,
        quoteAuthorization: input.quoteAuthorizationRaw,
        quotePublication: input.quotePublicationRaw,
        beatlines: input.beatlinesRaw,
      }
      const paths = Object.fromEntries(Object.entries(files).map(([name, raw]) => {
        const path = join(directory, `${name}.json`)
        writeFileSync(path, raw, 'utf8')
        return [name, path]
      }))
      const reviewedPacket = join(directory, 'reviewed-final.json')
      const reviewedTemplate = join(directory, 'reviewed-final-template.json')
      const review = spawnSync(process.execPath, [
        '--import', 'tsx', 'scripts/review-settlement-drop-final-authoring.mts',
        '--receipt', paths.receipt,
        '--presentation-structure', paths.presentation, '--presentation-decisions', paths.presentationDecisions,
        '--asset-semantics', paths.assets, '--asset-decisions', paths.assetDecisions,
        '--player-identity', paths.identity, '--player-identity-decisions', paths.identityDecisions,
        '--packet', reviewedPacket, '--decision-template', reviewedTemplate,
      ], { cwd: process.cwd(), encoding: 'utf8', timeout: 30_000 })
      expect(review.stderr).toBe('')
      expect(review.status).toBe(0)
      expect(readFileSync(reviewedPacket, 'utf8')).toBe(input.finalAuthoringPacketRaw)
      expect(JSON.parse(readFileSync(reviewedTemplate, 'utf8')).players[0].house).toBeNull()
      const output = join(directory, 'drop.json')
      const result = spawnSync(process.execPath, [
        '--import', 'tsx', 'scripts/compose-settlement-drop-manifest.mts',
        '--receipt', paths.receipt, '--receipt-reference', 'receipt.json',
        '--presentation-structure', paths.presentation, '--presentation-decisions', paths.presentationDecisions,
        '--asset-semantics', paths.assets, '--asset-decisions', paths.assetDecisions,
        '--player-identity', paths.identity, '--player-identity-decisions', paths.identityDecisions,
        '--final-authoring', reviewedPacket, '--final-decisions', paths.finalDecisions,
        '--receipt-binding', paths.binding, '--receipt-binding-decisions', paths.bindingDecisions,
        '--quote-packet', paths.quotePacket, '--quote-decisions', paths.quoteDecisions,
        '--quote-plan', paths.quotePlan, '--quote-authorization', paths.quoteAuthorization,
        '--quote-publication', paths.quotePublication, '--beatlines', paths.beatlines,
        '--output', output,
      ], { cwd: process.cwd(), encoding: 'utf8', timeout: 30_000 })

      expect(result.stderr).toBe('')
      expect(result.status).toBe(0)
      expect(result.stdout).toContain(`[settlement-drop-final-manifest] wrote=${output}`)
      expect(JSON.parse(readFileSync(output, 'utf8')).settlement_receipt.path).toBe('receipt.json')
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
