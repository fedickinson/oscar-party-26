import { describe, expect, it } from 'vitest'
import { sha256Hex } from './sha256'
import {
  buildSettlementDropAssetSemanticsPacket,
  serializeSettlementDropAssetSemanticsDecisionTemplate,
  serializeSettlementDropAssetSemanticsPacket,
} from './settlement-drop-asset-semantics'
import {
  planSettlementDropAssetExtraction,
  serializeSettlementDropAssetExtractionManifest,
} from './settlement-drop-asset-extraction'

const jpeg = 'data:image/jpeg;base64,/9j/4A=='
const webp = 'data:image/webp;base64,UklGRgQAAABXRUJQ'

function sealed(name: string, raw: string) {
  return { name, bytes: new TextEncoder().encode(raw).byteLength, sha256: sha256Hex(raw) }
}

function input() {
  const assets = { cast_ned: jpeg, stark: webp }
  const assetsRaw = JSON.stringify(assets)
  const extraction = planSettlementDropAssetExtraction({
    room_code: 'WDKH',
    source: sealed('assets.json', assetsRaw),
    assets,
  }).manifest
  const extractionRaw = serializeSettlementDropAssetExtractionManifest(extraction)
  const ceremonyRaw = `<!doctype html>
    <img class="pic pic-round" src="${jpeg}" alt="Ned">
    <img class="lbsig" src="${webp}" alt="">
    <script>
      var CHARS={"Ned Stark":{"img":"${jpeg}"}};
      var PUNDITS={"1":{"img":"${jpeg}","name":"Ned"}};
      var PDATA={"Alice":{"sigil":"${webp}"}};
    </script>`
  return {
    room_code: 'WDKH',
    ceremony: { raw: ceremonyRaw, seal: sealed('the-ceremony.html', ceremonyRaw) },
    legacy_assets: { raw: assetsRaw, seal: sealed('assets.json', assetsRaw) },
    extraction: { raw: extractionRaw, seal: sealed('asset-extraction.json', extractionRaw) },
  }
}

describe('buildSettlementDropAssetSemanticsPacket', () => {
  it('maps only exact structured ceremony assignments and preserves HTML observations', () => {
    const packet = buildSettlementDropAssetSemanticsPacket(input())

    expect(packet.packet_version).toBe(1)
    expect(packet.coverage).toEqual({
      assets: 2,
      exact_ceremony_occurrences: 5,
      html_image_uses: 2,
      character_assignments: 1,
      pundit_assignments: 1,
      player_sigil_assignments: 1,
      assets_without_structured_assignment: 0,
    })
    expect(packet.assets).toEqual([
      expect.objectContaining({
        id: 'cast_ned',
        structured_assignments: [
          { kind: 'character', consumer: 'Ned Stark', source: 'ceremony.CHARS.img' },
          { kind: 'pundit', consumer: 'Ned', source: 'ceremony.PUNDITS.img' },
        ],
        html_evidence: {
          occurrences: 3,
          image_uses: 1,
          empty_alt_uses: 0,
          classes: ['pic pic-round'],
          nonempty_alt_texts: ['Ned'],
        },
        candidate_alt_texts: ['Ned', 'Ned Stark'],
      }),
      expect.objectContaining({
        id: 'stark',
        structured_assignments: [
          { kind: 'player_sigil', consumer: 'Alice', source: 'ceremony.PDATA.sigil' },
        ],
        html_evidence: {
          occurrences: 2,
          image_uses: 1,
          empty_alt_uses: 1,
          classes: ['lbsig'],
          nonempty_alt_texts: [],
        },
        candidate_alt_texts: ['Alice'],
      }),
    ])
  })

  it('emits a null decision template that grants no approval', () => {
    const packet = buildSettlementDropAssetSemanticsPacket(input())
    const template = JSON.parse(serializeSettlementDropAssetSemanticsDecisionTemplate(packet))

    expect(template).toEqual({
      decision_version: 1,
      artifact: 'settlement-drop-asset-semantics-decisions',
      target: { room_code: 'WDKH' },
      expected_packet_sha256: sha256Hex(serializeSettlementDropAssetSemanticsPacket(packet)),
      decisions: [
        { asset_id: 'cast_ned', approved_alt_text: null, approve_structured_assignments: null, note: null },
        { asset_id: 'stark', approved_alt_text: null, approve_structured_assignments: null, note: null },
      ],
    })
  })

  it('rejects source-seal drift and extraction substitution', () => {
    const drifted = input()
    drifted.ceremony.seal.sha256 = 'f'.repeat(64)
    expect(() => buildSettlementDropAssetSemanticsPacket(drifted))
      .toThrow('ceremony seal does not match its bytes')

    const substituted = input()
    const extraction = JSON.parse(substituted.extraction.raw)
    extraction.assets[0].sha256 = 'f'.repeat(64)
    substituted.extraction.raw = JSON.stringify(extraction)
    substituted.extraction.seal = sealed('asset-extraction.json', substituted.extraction.raw)
    expect(() => buildSettlementDropAssetSemanticsPacket(substituted))
      .toThrow('asset extraction does not match the sealed legacy assets')
  })

  it('rejects structured references to unknown image bytes and malformed variables', () => {
    const unknown = input()
    unknown.ceremony.raw = unknown.ceremony.raw.replace(
      `"img":"${jpeg}"`,
      '"img":"data:image/jpeg;base64,/9j/2A=="',
    )
    unknown.ceremony.seal = sealed('the-ceremony.html', unknown.ceremony.raw)
    expect(() => buildSettlementDropAssetSemanticsPacket(unknown))
      .toThrow('ceremony.CHARS Ned Stark references unknown asset bytes')

    const malformed = input()
    malformed.ceremony.raw = malformed.ceremony.raw.replace('var CHARS={', 'var CHARS=[')
    malformed.ceremony.seal = sealed('the-ceremony.html', malformed.ceremony.raw)
    expect(() => buildSettlementDropAssetSemanticsPacket(malformed))
      .toThrow('ceremony variable CHARS must start with an object')
  })

  it('serializes the packet deterministically', () => {
    const first = serializeSettlementDropAssetSemanticsPacket(
      buildSettlementDropAssetSemanticsPacket(input()),
    )
    const second = serializeSettlementDropAssetSemanticsPacket(
      buildSettlementDropAssetSemanticsPacket(input()),
    )
    expect(first).toBe(second)
    expect(first.endsWith('\n')).toBe(true)
  })
})
