import type { SealedTextArtifact } from './settlement-drop-asset-semantics'
import type { SettlementDropAssetSourceSeal } from './settlement-drop-asset-extraction'
import { sha256Hex } from './sha256'

type UnknownRecord = Record<string, unknown>

export interface SettlementDropQuoteMarkupPacket {
  packet_version: 1
  artifact: 'settlement-drop-quote-markup-review'
  target: { room_code: string }
  inputs: { takes: SettlementDropAssetSourceSeal }
  coverage: {
    quote_groups: number
    quotes: number
    quotes_with_markup: number
    emphasis_spans: number
    unsupported_tags: number
  }
  quotes: Array<{
    quote_key: string
    group: string
    quote_index: number
    speaker: string
    source_text: string
    observed_markup: 'legacy-bold'
    renderer_effect: 'escaped-as-visible-text'
    plain_text_candidate: string
    emphasis_spans: Array<{ text: string; plain_text_start: number; plain_text_end: number }>
  }>
}

export interface SettlementDropQuoteMarkupDecisionTemplate {
  decision_version: 1
  artifact: 'settlement-drop-quote-markup-decisions'
  target: { room_code: string }
  expected_packet_sha256: string
  decisions: Array<{
    quote_key: string
    approved_plain_text: null
    emphasis_treatment: null
    note: null
  }>
}

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value
}

function validateSeal(artifact: SealedTextArtifact): SettlementDropAssetSourceSeal {
  const bytes = new TextEncoder().encode(artifact.raw).byteLength
  const sha256 = sha256Hex(artifact.raw)
  if (artifact.seal.bytes !== bytes || artifact.seal.sha256 !== sha256) {
    throw new Error('takes seal does not match its bytes')
  }
  return { name: requiredString(artifact.seal.name, 'takes seal name'), bytes, sha256 }
}

function parseLegacyBold(text: string, label: string): {
  plainText: string
  spans: Array<{ text: string; plain_text_start: number; plain_text_end: number }>
} {
  const allTags = [...text.matchAll(/<[^>]+>/g)].map((match) => match[0])
  const unsupported = allTags.filter((tag) => tag !== '<b>' && tag !== '</b>')
  if (unsupported.length > 0) throw new Error(`${label} contains unsupported markup ${unsupported[0]}`)
  let plainText = ''
  let sourceIndex = 0
  let openStart: number | null = null
  const spans: Array<{ text: string; plain_text_start: number; plain_text_end: number }> = []
  for (const match of text.matchAll(/<\/?b>/g)) {
    const tag = match[0]
    const tagIndex = match.index
    plainText += text.slice(sourceIndex, tagIndex)
    if (tag === '<b>') {
      if (openStart !== null) throw new Error(`${label} contains nested legacy bold markup`)
      openStart = plainText.length
    } else {
      if (openStart === null) throw new Error(`${label} closes legacy bold markup before opening it`)
      if (plainText.length === openStart) throw new Error(`${label} contains an empty legacy bold span`)
      spans.push({
        text: plainText.slice(openStart),
        plain_text_start: openStart,
        plain_text_end: plainText.length,
      })
      openStart = null
    }
    sourceIndex = tagIndex + tag.length
  }
  plainText += text.slice(sourceIndex)
  if (openStart !== null) throw new Error(`${label} contains unterminated legacy bold markup`)
  if (spans.length === 0) throw new Error(`${label} has no legacy bold span`)
  return { plainText, spans }
}

export function buildSettlementDropQuoteMarkupPacket(input: {
  room_code: string
  takes: SealedTextArtifact
}): SettlementDropQuoteMarkupPacket {
  const roomCode = requiredString(input.room_code, 'room_code')
  const takesSeal = validateSeal(input.takes)
  const parsed: unknown = JSON.parse(input.takes.raw)
  if (!isRecord(parsed)) throw new Error('takes must be an object')
  let quoteCount = 0
  const quotes: SettlementDropQuoteMarkupPacket['quotes'] = []
  for (const group of Object.keys(parsed).sort((left, right) => left < right ? -1 : left > right ? 1 : 0)) {
    const groupQuotes = parsed[group]
    if (!Array.isArray(groupQuotes)) throw new Error(`takes.${group} must be an array`)
    for (const [quoteIndex, value] of groupQuotes.entries()) {
      if (!isRecord(value)) throw new Error(`takes.${group}[${quoteIndex}] must be an object`)
      const speaker = requiredString(value.speaker, `takes.${group}[${quoteIndex}].speaker`)
      const text = requiredString(value.text, `takes.${group}[${quoteIndex}].text`)
      quoteCount += 1
      if (!/<[^>]+>/.test(text)) continue
      const parsedMarkup = parseLegacyBold(text, `takes.${group}[${quoteIndex}].text`)
      quotes.push({
        quote_key: `${group}:${quoteIndex}`,
        group,
        quote_index: quoteIndex,
        speaker,
        source_text: text,
        observed_markup: 'legacy-bold',
        renderer_effect: 'escaped-as-visible-text',
        plain_text_candidate: parsedMarkup.plainText,
        emphasis_spans: parsedMarkup.spans,
      })
    }
  }
  return {
    packet_version: 1,
    artifact: 'settlement-drop-quote-markup-review',
    target: { room_code: roomCode },
    inputs: { takes: takesSeal },
    coverage: {
      quote_groups: Object.keys(parsed).length,
      quotes: quoteCount,
      quotes_with_markup: quotes.length,
      emphasis_spans: quotes.reduce((sum, quote) => sum + quote.emphasis_spans.length, 0),
      unsupported_tags: 0,
    },
    quotes,
  }
}

export function serializeSettlementDropQuoteMarkupPacket(packet: SettlementDropQuoteMarkupPacket): string {
  return `${JSON.stringify(packet, null, 2)}\n`
}

export function serializeSettlementDropQuoteMarkupDecisionTemplate(
  packet: SettlementDropQuoteMarkupPacket,
): string {
  const template: SettlementDropQuoteMarkupDecisionTemplate = {
    decision_version: 1,
    artifact: 'settlement-drop-quote-markup-decisions',
    target: packet.target,
    expected_packet_sha256: sha256Hex(serializeSettlementDropQuoteMarkupPacket(packet)),
    decisions: packet.quotes.map((quote) => ({
      quote_key: quote.quote_key,
      approved_plain_text: null,
      emphasis_treatment: null,
      note: null,
    })),
  }
  return `${JSON.stringify(template, null, 2)}\n`
}
