import { describe, expect, it } from 'vitest'
import {
  planSettlementDropAssetExtraction,
  serializeSettlementDropAssetExtractionManifest,
} from './settlement-drop-asset-extraction'
import {
  buildSettlementDropAssetSemanticsPacket,
  serializeSettlementDropAssetSemanticsDecisionTemplate,
  serializeSettlementDropAssetSemanticsPacket,
} from './settlement-drop-asset-semantics'
import {
  buildSettlementDropPresentationStructurePacket,
  serializeSettlementDropPresentationStructureDecisionTemplate,
  serializeSettlementDropPresentationStructurePacket,
} from './settlement-drop-presentation-structure'
import {
  buildSettlementDropQuoteMarkupPacket,
  serializeSettlementDropQuoteMarkupDecisionTemplate,
  serializeSettlementDropQuoteMarkupPacket,
} from './settlement-drop-quote-markup'
import {
  buildSettlementDropQuoteGroundingPacket,
  buildSettlementDropQuoteGroundingPlan,
  inspectSettlementDropQuoteGroundingDecisions,
  serializeSettlementDropQuoteGroundingDecisionTemplate,
  serializeSettlementDropQuoteGroundingPacket,
  serializeSettlementDropQuoteGroundingPlan,
} from './settlement-drop-quote-grounding'
import { assertSettlementDropQuoteGroundingPlanCurrent } from './settlement-drop-quote-publication'
import {
  buildSettlementDropReceiptBindingPacket,
  serializeSettlementDropReceiptBindingDecisionTemplate,
  serializeSettlementDropReceiptBindingPacket,
} from './settlement-drop-receipt-binding'
import { sha256Hex } from './sha256'

function artifact(name: string, raw: string) {
  return {
    raw,
    seal: { name, bytes: new TextEncoder().encode(raw).byteLength, sha256: sha256Hex(raw) },
  }
}

function jsonArtifact(name: string, value: unknown) {
  return artifact(name, `${JSON.stringify(value, null, 2)}\n`)
}

function fixture() {
  const jpeg = 'data:image/jpeg;base64,/9j/4A=='
  const assetsValue = { cast_ned: jpeg }
  const legacyAssets = jsonArtifact('assets.json', assetsValue)
  const extractionValue = planSettlementDropAssetExtraction({
    room_code: 'ROOM', source: legacyAssets.seal, assets: assetsValue,
  }).manifest
  const extraction = artifact(
    'asset-extraction.json',
    serializeSettlementDropAssetExtractionManifest(extractionValue),
  )
  const takes = jsonArtifact('takes.json', {
    2: [{ speaker: 'Ned', text: 'The <b>wolf</b> arrived.', refs: [{ name: 'Wolf' }] }],
  })
  const beatlines = jsonArtifact('beatlines.json', {
    B1: [{ kind: 'draft', char: 'Wolf', pts: '+4', text: 'Wolf arrives for Arya' }],
  })
  const ceremonyRaw = `<!doctype html>
    <img class="pic pic-round" src="${jpeg}" alt="Ned">
    <section class="slide scene-title"><h1>Night</h1></section>
    <section class="slide scene-hall actdiv"><h2>Act</h2><p>Subtitle.</p></section>
    <section class="slide scene-hall beat"><div class="kicker">Beat</div><h2>Wolf arrives</h2><p>The wolf arrives.</p><div class="ledger"><div class="bl">Wolf arrives for Arya +4</div></div></section>
    <section class="slide scene-table inter"><h2>Table</h2></section>
    <script>
      var CHARS={"Wolf":{"img":"${jpeg}"}};
      var PUNDITS={"2":{"img":"${jpeg}","name":"Ned"}};
      var PDATA={"Arya":{"sigil":"${jpeg}"}};
      function move(n){return PUNDITS[String(n)]}
    </script>`
  const ceremony = artifact('ceremony.html', ceremonyRaw)
  const presentationValue = buildSettlementDropPresentationStructurePacket({
    room_code: 'ROOM', ceremony, beatlines, takes,
  })
  const presentationPacket = artifact(
    'presentation.json', serializeSettlementDropPresentationStructurePacket(presentationValue),
  )
  const presentationDecisionValue = JSON.parse(
    serializeSettlementDropPresentationStructureDecisionTemplate(presentationValue),
  )
  Object.assign(presentationDecisionValue.show, {
    title: 'Night', subtitle: 'Sub', closing_title: 'Close', opening_eyebrow: 'Open',
    muster_title: 'Muster', begins_label: 'Begin',
  })
  Object.assign(presentationDecisionValue.acts[0], {
    include: true, id: 'act', title: 'Act', subtitle: 'Subtitle', scene: 'hall',
    interstitial_slide_index: 3, interstitial_portrait_asset: 'cast_ned',
  })
  Object.assign(presentationDecisionValue.beats[0], {
    include: true, id: 'wolf-arrives', kicker: 'Beat', title: 'Wolf arrives', summary: 'The wolf arrives.',
    weight: 'ordinary', portrait_asset: 'cast_ned', approve_beatline_group: true,
    approve_take_group: true,
  })
  const presentationDecisions = jsonArtifact('presentation-decisions.json', presentationDecisionValue)

  const assetValue = buildSettlementDropAssetSemanticsPacket({
    room_code: 'ROOM', ceremony, legacy_assets: legacyAssets, extraction,
  })
  const assetPacket = artifact('asset-semantics.json', serializeSettlementDropAssetSemanticsPacket(assetValue))
  const assetDecisionValue = JSON.parse(serializeSettlementDropAssetSemanticsDecisionTemplate(assetValue))
  assetDecisionValue.decisions[0] = {
    ...assetDecisionValue.decisions[0], approved_alt_text: 'Portrait of Ned',
    approve_structured_assignments: true,
  }
  const assetDecisions = jsonArtifact('asset-decisions.json', assetDecisionValue)

  const markupValue = buildSettlementDropQuoteMarkupPacket({ room_code: 'ROOM', takes })
  const quoteMarkupPacket = artifact('quote-markup.json', serializeSettlementDropQuoteMarkupPacket(markupValue))
  const markupDecisionValue = JSON.parse(serializeSettlementDropQuoteMarkupDecisionTemplate(markupValue))
  markupDecisionValue.decisions[0] = {
    ...markupDecisionValue.decisions[0], approved_plain_text: 'The wolf arrived.',
    emphasis_treatment: 'plain_text',
  }
  const quoteMarkupDecisions = jsonArtifact('quote-markup-decisions.json', markupDecisionValue)
  const receipt = jsonArtifact('receipt.json', {
    version: 1,
    source: 'synthetic-proof',
    room_code: 'ROOM',
    room_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    settlement_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    settlement_version: 1,
    manifest_hash: 'a'.repeat(64),
    settled_facts: [{
      id: 'wolf-arrived', sequence: 1, title: 'The wolf arrived', outcome: 'resolved',
      board_status: 'authored', winner: { id: 'wolf', name: 'Wolf' },
    }, {
      id: 'wolf-flies', sequence: 2, title: 'The wolf flies', outcome: 'void',
      board_status: 'authored',
    }],
    players: [{ id: 'arya', name: 'Arya' }],
    characters: [{ id: 'wolf', name: 'Wolf', player_id: 'arya' }],
    score_events: [{
      id: 'draft:wolf:1', kind: 'draft', player_id: 'arya', character_id: 'wolf',
      label: 'The wolf arrived', points: 4,
    }],
    personal_cards: [{
      player_id: 'arya',
      bingo: Array.from({ length: 25 }, (_, index) => ({
        label: index === 12 ? 'FREE' : `Square ${index}`,
        marked: index === 12,
        free: index === 12,
      })),
    }],
  })
  const receiptBindingValue = buildSettlementDropReceiptBindingPacket({
    receipt, presentationPacket, presentationDecisions, assetPacket, beatlines,
  })
  const receiptBindingPacket = artifact(
    'receipt-binding.json',
    serializeSettlementDropReceiptBindingPacket(receiptBindingValue),
  )
  const receiptBindingDecisionValue = JSON.parse(
    serializeSettlementDropReceiptBindingDecisionTemplate(receiptBindingValue),
  )
  receiptBindingDecisionValue.bindings[0].beat_id = 'wolf-arrives'
  Object.assign(receiptBindingDecisionValue.legacy_lines[0], {
    disposition: 'represented',
    receipt_target_kind: 'score_event',
    receipt_target_id: 'draft:wolf:1',
  })
  const receiptBindingDecisions = jsonArtifact(
    'receipt-binding-decisions.json',
    receiptBindingDecisionValue,
  )
  const input = {
    receipt, ceremony, beatlines, legacyAssets, extraction, takes,
    presentationPacket, presentationDecisions, assetPacket, assetDecisions,
    quoteMarkupPacket, quoteMarkupDecisions,
    receiptBindingPacket, receiptBindingDecisions,
  }
  return input
}

function complete() {
  const input = fixture()
  const packet = buildSettlementDropQuoteGroundingPacket(input)
  const decisions = JSON.parse(serializeSettlementDropQuoteGroundingDecisionTemplate(packet))
  Object.assign(decisions.decisions[0], {
    disposition: 'replace',
    speaker: 'Ned',
    portrait_asset_id: 'cast_ned',
    ref_character_ids: ['wolf'],
    voice_instruction: 'Judge duty with plain, restrained language.',
    screen_facts: [{
      text: 'The wolf arrived',
      sources: [{ kind: 'settlement_record', ref: 'score_event:draft:wolf:1' }],
    }],
    source_material_attitude: ['Ned values duty above spectacle.'],
    angle: 'Notice the duty fulfilled without inventing another event.',
  })
  return { input, packet, decisions }
}

describe('settlement-drop quote grounding', () => {
  it('rebuilds sealed upstream packets and leaves every quote disposition open', () => {
    const input = fixture()
    const packet = buildSettlementDropQuoteGroundingPacket(input)
    const decisions = JSON.parse(serializeSettlementDropQuoteGroundingDecisionTemplate(packet))

    expect(packet.coverage).toEqual({
      approved_take_groups: 1, quotes: 1, quotes_with_legacy_markup: 1,
      receipt_characters: 1, approved_pundit_assets: 1,
    })
    expect(packet.quotes[0]).toMatchObject({
      quote_key: '2:0', beat_id: 'wolf-arrives', legacy_speaker: 'Ned',
      markup_approved_plain_text: 'The wolf arrived.', candidate_pundit_asset_ids: ['cast_ned'],
      legacy_refs: [{ name: 'Wolf', candidate_character_id: 'wolf' }],
    })
    expect(packet.settlement_records.map((record) => record.record_key)).toEqual([
      'score_event:draft:wolf:1',
    ])
    expect(decisions.decisions[0]).toMatchObject({ disposition: null, speaker: null, screen_facts: null })
    expect(inspectSettlementDropQuoteGroundingDecisions(packet, decisions)).toMatchObject({
      required_values: 1, open_values: 1, status: 'open',
    })
  })

  it('builds an exact grounded-line plan and bounded budget only from complete reviewed decisions', () => {
    const { packet, decisions } = complete()
    const decisionsRaw = `${JSON.stringify(decisions, null, 2)}\n`
    const status = inspectSettlementDropQuoteGroundingDecisions(packet, decisions)
    const plan = buildSettlementDropQuoteGroundingPlan(packet, decisionsRaw)

    expect(status).toMatchObject({ required_values: 8, open_values: 0, status: 'complete' })
    expect(plan.decisions_sha256).toBe(sha256Hex(decisionsRaw))
    expect(plan.jobs[0]).toMatchObject({
      quote_key: '2:0', beat_id: 'wolf-arrives', speaker: 'Ned', portrait_asset_id: 'cast_ned',
      refs: [{ character_id: 'wolf', name: 'Wolf' }], facts: ['The wolf arrived'],
      fact_warrants: [{
        text: 'The wolf arrived',
        sources: [{ kind: 'settlement_record', ref: 'score_event:draft:wolf:1' }],
      }],
      prompt_contract: { pipeline: 'scripts/grounded-line.mts', max_retries: 2 },
    })
    expect(plan.jobs[0].voice).toContain('Source-material attitude: Ned values duty above spectacle.')
    expect(plan.budget).toMatchObject({
      first_pass: { total_calls_min: 1, total_calls_max: 2, max_output_tokens: 600 },
      worst_case: { total_calls_min: 3, total_calls_max: 6, max_output_tokens: 1800 },
    })
  })

  it('rebuilds the approved plan from current packet and decision bytes', () => {
    const { packet, decisions } = complete()
    const packetRaw = serializeSettlementDropQuoteGroundingPacket(packet)
    const decisionsRaw = `${JSON.stringify(decisions, null, 2)}\n`
    const planRaw = serializeSettlementDropQuoteGroundingPlan(
      buildSettlementDropQuoteGroundingPlan(packet, decisionsRaw),
    )

    expect(assertSettlementDropQuoteGroundingPlanCurrent(planRaw, packetRaw, decisionsRaw))
      .toMatchObject({ jobs: [{ quote_key: '2:0' }] })

    decisions.decisions[0].angle = 'A newly reviewed angle.'
    const changedDecisionsRaw = `${JSON.stringify(decisions, null, 2)}\n`
    expect(() => assertSettlementDropQuoteGroundingPlanCurrent(
      planRaw,
      packetRaw,
      changedDecisionsRaw,
    )).toThrow('approved quote grounding plan is stale')
  })

  it('permits explicit omission but rejects recap-only facts and source-record paraphrase', () => {
    const omitted = complete()
    Object.assign(omitted.decisions.decisions[0], {
      disposition: 'omit', speaker: null, portrait_asset_id: null, ref_character_ids: null,
      voice_instruction: null, screen_facts: null, source_material_attitude: null, angle: null,
      note: 'The legacy take does not survive screen-fact review.',
    })
    const omittedRaw = `${JSON.stringify(omitted.decisions, null, 2)}\n`
    expect(buildSettlementDropQuoteGroundingPlan(omitted.packet, omittedRaw)).toMatchObject({
      jobs: [], omissions: [{ quote_key: '2:0', beat_id: 'wolf-arrives' }],
      budget: { worst_case: { total_calls_max: 0 } },
    })

    const missingOmissionReason = complete()
    Object.assign(missingOmissionReason.decisions.decisions[0], {
      disposition: 'omit', speaker: null, portrait_asset_id: null, ref_character_ids: null,
      voice_instruction: null, screen_facts: null, source_material_attitude: null, angle: null,
      note: null,
    })
    expect(inspectSettlementDropQuoteGroundingDecisions(
      missingOmissionReason.packet,
      missingOmissionReason.decisions,
    )).toMatchObject({
      required_values: 2, open_values: 1,
      open_items: ['quotes[2:0].note'], status: 'open',
    })

    const recapOnly = complete()
    recapOnly.decisions.decisions[0].screen_facts[0].sources = [{ kind: 'recap', ref: 'recap-page-3' }]
    expect(() => inspectSettlementDropQuoteGroundingDecisions(recapOnly.packet, recapOnly.decisions))
      .toThrow('cannot rely on recap evidence alone')

    const paraphrase = complete()
    paraphrase.decisions.decisions[0].screen_facts[0].text = 'The wolf crossed the red gate.'
    expect(() => inspectSettlementDropQuoteGroundingDecisions(paraphrase.packet, paraphrase.decisions))
      .toThrow('must exactly quote a settlement record label unless independently warranted')
  })

  it('rejects stale upstream bytes, unapproved pundit identities, and undeclared decision fields', () => {
    const stale = fixture()
    const presentation = JSON.parse(stale.presentationPacket.raw)
    presentation.coverage.slides = 99
    stale.presentationPacket = jsonArtifact('presentation.json', presentation)
    const presentationDecisions = JSON.parse(stale.presentationDecisions.raw)
    presentationDecisions.expected_packet_sha256 = stale.presentationPacket.seal.sha256
    stale.presentationDecisions = jsonArtifact('presentation-decisions.json', presentationDecisions)
    expect(() => buildSettlementDropQuoteGroundingPacket(stale))
      .toThrow('presentation structure packet does not match the sealed legacy sources')

    const unknownPundit = complete()
    unknownPundit.decisions.decisions[0].speaker = 'Arya'
    expect(() => inspectSettlementDropQuoteGroundingDecisions(unknownPundit.packet, unknownPundit.decisions))
      .toThrow('references unknown approved pundit identity Arya:cast_ned')

    const hidden = complete()
    hidden.decisions.decisions[0].approved = true
    expect(() => inspectSettlementDropQuoteGroundingDecisions(hidden.packet, hidden.decisions))
      .toThrow('quote grounding 2:0 has unknown field approved')
  })

  it('rejects settlement-record evidence bound to another ceremony beat', () => {
    const value = complete()
    value.packet.settlement_records[0].beat_id = 'another-beat'
    value.decisions.expected_packet_sha256 = sha256Hex(
      serializeSettlementDropQuoteGroundingPacket(value.packet),
    )
    expect(() => inspectSettlementDropQuoteGroundingDecisions(value.packet, value.decisions))
      .toThrow('belongs to beat another-beat, not wolf-arrives')
  })

  it('rejects emoji in reviewed generation inputs', () => {
    const value = complete()
    value.decisions.decisions[0].angle = 'Judge it with a dragon symbol \u{1F409}.'
    expect(() => inspectSettlementDropQuoteGroundingDecisions(value.packet, value.decisions))
      .toThrow('quote 2:0.angle must not contain emoji')
  })

  it('projects accepted surrounding whitespace into canonical plan values', () => {
    const value = complete()
    value.decisions.decisions[0].ref_character_ids = [' wolf ']
    value.decisions.decisions[0].screen_facts[0].text = ' The wolf arrived '
    value.decisions.decisions[0].screen_facts[0].sources[0].ref = ' score_event:draft:wolf:1 '
    value.decisions.decisions[0].source_material_attitude = [' Ned values duty. ']
    value.decisions.decisions[0].voice_instruction = ' Judge duty plainly. '
    value.decisions.decisions[0].angle = ' Stay inside the fact. '
    const raw = `${JSON.stringify(value.decisions, null, 2)}\n`
    const plan = buildSettlementDropQuoteGroundingPlan(value.packet, raw)

    expect(plan.jobs[0]).toMatchObject({
      refs: [{ character_id: 'wolf', name: 'Wolf' }],
      facts: ['The wolf arrived'],
      fact_warrants: [{
        text: 'The wolf arrived',
        sources: [{ kind: 'settlement_record', ref: 'score_event:draft:wolf:1' }],
      }],
      angle: 'Stay inside the fact.',
    })
    expect(plan.jobs[0].voice).toContain('Expression instruction: Judge duty plainly.')
    expect(plan.jobs[0].voice).toContain('Source-material attitude: Ned values duty.')
  })

  it('serializes packet bytes deterministically', () => {
    const packet = complete().packet
    expect(serializeSettlementDropQuoteGroundingPacket(packet))
      .toBe(serializeSettlementDropQuoteGroundingPacket(packet))
  })
})
