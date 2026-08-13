import { describe, expect, it } from 'vitest'
import { sha256Hex } from './sha256'
import {
  buildSettlementDropQuoteMarkupPacket,
  serializeSettlementDropQuoteMarkupDecisionTemplate,
  serializeSettlementDropQuoteMarkupPacket,
} from './settlement-drop-quote-markup'

function input(text = 'Before <b>the point</b> after.') {
  const raw = JSON.stringify({
    4: [{ speaker: 'Tyrion', text, refs: ['A'] }],
    5: [{ speaker: 'Ned', text: 'Plain.', refs: ['B'] }],
  })
  return {
    room_code: 'WDKH',
    takes: {
      raw,
      seal: { name: 'takes.json', bytes: new TextEncoder().encode(raw).byteLength, sha256: sha256Hex(raw) },
    },
  }
}

describe('buildSettlementDropQuoteMarkupPacket', () => {
  it('records exact legacy emphasis and a mechanical plain-text candidate', () => {
    const packet = buildSettlementDropQuoteMarkupPacket(input())
    expect(packet.coverage).toEqual({
      quote_groups: 2, quotes: 2, quotes_with_markup: 1, emphasis_spans: 1, unsupported_tags: 0,
    })
    expect(packet.quotes[0]).toEqual({
      quote_key: '4:0', group: '4', quote_index: 0, speaker: 'Tyrion',
      source_text: 'Before <b>the point</b> after.',
      observed_markup: 'legacy-bold', renderer_effect: 'escaped-as-visible-text',
      plain_text_candidate: 'Before the point after.',
      emphasis_spans: [{ text: 'the point', plain_text_start: 7, plain_text_end: 16 }],
    })
  })

  it('leaves copy and emphasis decisions null and binds them to the packet', () => {
    const packet = buildSettlementDropQuoteMarkupPacket(input())
    const decisions = JSON.parse(serializeSettlementDropQuoteMarkupDecisionTemplate(packet))
    expect(decisions.expected_packet_sha256).toBe(sha256Hex(serializeSettlementDropQuoteMarkupPacket(packet)))
    expect(decisions.decisions).toEqual([{
      quote_key: '4:0', approved_plain_text: null, emphasis_treatment: null, note: null,
    }])
  })

  it('fails closed on unsupported, nested, empty or unbalanced markup', () => {
    expect(() => buildSettlementDropQuoteMarkupPacket(input('A <i>word</i>.')))
      .toThrow('contains unsupported markup <i>')
    expect(() => buildSettlementDropQuoteMarkupPacket(input('<b>one <b>two</b></b>')))
      .toThrow('contains nested legacy bold markup')
    expect(() => buildSettlementDropQuoteMarkupPacket(input('<b></b>')))
      .toThrow('contains an empty legacy bold span')
    expect(() => buildSettlementDropQuoteMarkupPacket(input('<b>open')))
      .toThrow('contains unterminated legacy bold markup')
  })

  it('rejects seal drift and serializes deterministically', () => {
    const value = input()
    value.takes.seal.sha256 = 'f'.repeat(64)
    expect(() => buildSettlementDropQuoteMarkupPacket(value)).toThrow('takes seal does not match its bytes')
    const packet = buildSettlementDropQuoteMarkupPacket(input())
    expect(serializeSettlementDropQuoteMarkupPacket(packet)).toBe(serializeSettlementDropQuoteMarkupPacket(packet))
  })
})
