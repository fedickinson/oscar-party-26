import {
  inspectSettlementDropAssetSemanticsDecisions,
  inspectSettlementDropPresentationStructureDecisions,
  inspectSettlementDropQuoteMarkupDecisions,
} from './settlement-drop-approval-decisions'
import {
  buildSettlementDropAssetSemanticsPacket,
  serializeSettlementDropAssetSemanticsPacket,
  type SealedTextArtifact,
} from './settlement-drop-asset-semantics'
import {
  buildSettlementDropPresentationStructurePacket,
  serializeSettlementDropPresentationStructurePacket,
} from './settlement-drop-presentation-structure'
import {
  buildSettlementDropQuoteMarkupPacket,
  serializeSettlementDropQuoteMarkupPacket,
} from './settlement-drop-quote-markup'
import {
  buildSettlementDropReceiptBindingPacket,
  inspectSettlementDropReceiptBindingDecisions,
  serializeSettlementDropReceiptBindingPacket,
} from './settlement-drop-receipt-binding'
import { containsDisallowedEmoji } from './generated-prose'
import { buildGroundedLinePromptContract, type GroundedLinePromptContract } from './grounded-line-contract'
import { parseSettlementReceipt } from './settlement-receipt'
import {
  buildShowPackCommentaryBudget,
  type ShowPackCommentaryBudget,
} from './show-pack-commentary'
import { sha256Hex } from './sha256'

type UnknownRecord = Record<string, unknown>

export type SettlementDropQuoteFactSourceKind =
  | 'screen_capture'
  | 'table_testimony'
  | 'operator_record'
  | 'settlement_record'
  | 'recap'

export interface SettlementDropQuoteGroundingPacket {
  packet_version: 1
  artifact: 'settlement-drop-quote-grounding-review'
  target: {
    room_code: string
    settlement_id: string
    settlement_version: number
    manifest_hash: string
  }
  inputs: {
    receipt: SealedTextArtifact['seal']
    ceremony: SealedTextArtifact['seal']
    beatlines: SealedTextArtifact['seal']
    legacy_assets: SealedTextArtifact['seal']
    extraction: SealedTextArtifact['seal']
    takes: SealedTextArtifact['seal']
    presentation_structure: SealedTextArtifact['seal']
    presentation_decisions: SealedTextArtifact['seal']
    asset_semantics: SealedTextArtifact['seal']
    asset_decisions: SealedTextArtifact['seal']
    quote_markup: SealedTextArtifact['seal']
    quote_markup_decisions: SealedTextArtifact['seal']
    receipt_binding: SealedTextArtifact['seal']
    receipt_binding_decisions: SealedTextArtifact['seal']
  }
  doctrine: {
    pipeline: 'scripts/grounded-line.mts'
    fact_source_kinds: SettlementDropQuoteFactSourceKind[]
    independent_screen_warrants: Array<Exclude<SettlementDropQuoteFactSourceKind, 'recap'>>
    source_material_role: 'attitude_only'
    recap_role: 'corroboration_only'
  }
  coverage: {
    approved_take_groups: number
    quotes: number
    quotes_with_legacy_markup: number
    receipt_characters: number
    approved_pundit_assets: number
  }
  receipt_characters: Array<{ id: string; name: string }>
  settlement_records: Array<{
    record_key: string
    id: string
    kind: 'score_event' | 'settled_fact'
    label: string
    beat_id: string
  }>
  pundit_assets: Array<{ asset_id: string; speaker: string; approved_alt_text: string }>
  quotes: Array<{
    quote_key: string
    group: string
    quote_index: number
    beat_id: string
    slide_index: number
    legacy_speaker: string
    legacy_text: string
    markup_approved_plain_text: string
    legacy_had_markup: boolean
    candidate_pundit_asset_ids: string[]
    legacy_refs: Array<{ name: string; candidate_character_id: string | null }>
  }>
}

export interface SettlementDropQuoteGroundingDecisionTemplate {
  decision_version: 1
  artifact: 'settlement-drop-quote-grounding-decisions'
  target: SettlementDropQuoteGroundingPacket['target']
  expected_packet_sha256: string
  decisions: Array<{
    quote_key: string
    disposition: null
    speaker: null
    portrait_asset_id: null
    ref_character_ids: null
    voice_instruction: null
    screen_facts: null
    source_material_attitude: null
    angle: null
    note: null
  }>
}

export interface SettlementDropQuoteGroundingDecisionStatus {
  required_values: number
  open_values: number
  open_items: string[]
  status: 'open' | 'complete'
}

export interface SettlementDropQuoteGroundingPlan {
  plan_version: 1
  artifact: 'settlement-drop-quote-grounding-plan'
  target: SettlementDropQuoteGroundingPacket['target']
  packet_sha256: string
  decisions_sha256: string
  budget: ShowPackCommentaryBudget
  omissions: Array<{ quote_key: string; beat_id: string; note: string }>
  jobs: Array<{
    quote_key: string
    beat_id: string
    speaker: string
    portrait_asset_id: string
    refs: Array<{ character_id: string; name: string }>
    voice: string
    facts: string[]
    fact_warrants: Array<{
      text: string
      sources: Array<{ kind: SettlementDropQuoteFactSourceKind; ref: string }>
    }>
    angle: string
    prompt_contract: GroundedLinePromptContract
  }>
}

export interface SettlementDropQuoteGroundingInput {
  receipt: SealedTextArtifact
  ceremony: SealedTextArtifact
  beatlines: SealedTextArtifact
  legacyAssets: SealedTextArtifact
  extraction: SealedTextArtifact
  takes: SealedTextArtifact
  presentationPacket: SealedTextArtifact
  presentationDecisions: SealedTextArtifact
  assetPacket: SealedTextArtifact
  assetDecisions: SealedTextArtifact
  quoteMarkupPacket: SealedTextArtifact
  quoteMarkupDecisions: SealedTextArtifact
  receiptBindingPacket: SealedTextArtifact
  receiptBindingDecisions: SealedTextArtifact
}

const FACT_SOURCE_KINDS: SettlementDropQuoteFactSourceKind[] = [
  'screen_capture', 'table_testimony', 'operator_record', 'settlement_record', 'recap',
]
const STRONG_FACT_SOURCE_KINDS = [
  'screen_capture', 'table_testimony', 'operator_record', 'settlement_record',
] as const

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function object(raw: string, label: string): UnknownRecord {
  let value: unknown
  try { value = JSON.parse(raw) } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  return value
}

function record(value: unknown, label: string): UnknownRecord {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  return value
}

function records(value: unknown, label: string): UnknownRecord[] {
  if (!Array.isArray(value) || value.some((row) => !isRecord(row))) {
    throw new Error(`${label} must be an array of objects`)
  }
  return value as UnknownRecord[]
}

function exactKeys(value: UnknownRecord, keys: string[], label: string): void {
  const expected = new Set(keys)
  const unknown = Object.keys(value).find((key) => !expected.has(key))
  if (unknown) throw new Error(`${label} has unknown field ${unknown}`)
  const missing = keys.find((key) => !Object.prototype.hasOwnProperty.call(value, key))
  if (missing) throw new Error(`${label} is missing field ${missing}`)
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  const result = value.trim()
  if (containsDisallowedEmoji(result)) throw new Error(`${label} must not contain emoji`)
  return result
}

function identifier(value: unknown, label: string): string {
  const result = text(value, label)
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(result)) {
    throw new Error(`${label} must contain only letters, numbers, underscores, or hyphens`)
  }
  return result
}

function seal(input: SealedTextArtifact, label: string): SealedTextArtifact['seal'] {
  const bytes = new TextEncoder().encode(input.raw).byteLength
  const sha256 = sha256Hex(input.raw)
  if (input.seal.bytes !== bytes || input.seal.sha256 !== sha256) {
    throw new Error(`${label} seal does not match its bytes`)
  }
  return { name: text(input.seal.name, `${label} seal name`), bytes, sha256 }
}

function exactDecisionPacket(
  decisions: UnknownRecord,
  packetSeal: SealedTextArtifact['seal'],
  label: string,
): void {
  if (decisions.expected_packet_sha256 !== packetSeal.sha256) {
    throw new Error(`${label} decisions do not target the exact supplied packet`)
  }
}

function sameTarget(
  target: SettlementDropQuoteGroundingPacket['target'],
  candidate: UnknownRecord,
  label: string,
): void {
  exactKeys(candidate, ['room_code', 'settlement_id', 'settlement_version', 'manifest_hash'], label)
  if (candidate.room_code !== target.room_code || candidate.settlement_id !== target.settlement_id
    || candidate.settlement_version !== target.settlement_version
    || candidate.manifest_hash !== target.manifest_hash) {
    throw new Error(`${label} does not exactly match the packet target`)
  }
}

function identityRows(
  expectedKeys: string[],
  actual: UnknownRecord[],
  keyName: string,
  label: string,
): Map<string, UnknownRecord> {
  const expected = new Set(expectedKeys)
  if (expected.size !== expectedKeys.length) throw new Error(`${label} expected keys contain duplicates`)
  const result = new Map<string, UnknownRecord>()
  for (const row of actual) {
    const key = text(row[keyName], `${label} ${keyName}`)
    if (!expected.has(key)) throw new Error(`${label} contains unknown key ${key}`)
    if (result.has(key)) throw new Error(`${label} contains duplicate key ${key}`)
    result.set(key, row)
  }
  const missing = expectedKeys.find((key) => !result.has(key))
  if (missing) throw new Error(`${label} is missing key ${missing}`)
  return result
}

function takeRows(takes: UnknownRecord, group: string): UnknownRecord[] {
  const value = takes[group]
  if (!Array.isArray(value) || value.some((row) => !isRecord(row)) || value.length === 0) {
    throw new Error(`takes.${group} must be a non-empty array of objects`)
  }
  return value as UnknownRecord[]
}

function legacyPlainText(
  quoteKey: string,
  sourceText: string,
  markupPacket: UnknownRecord,
  markupDecisions: UnknownRecord,
): { text: string; hadMarkup: boolean } {
  const packetQuote = records(markupPacket.quotes, 'quote markup packet quotes')
    .find((row) => row.quote_key === quoteKey)
  if (!packetQuote) {
    if (/<[^>]+>/.test(sourceText)) {
      throw new Error(`legacy quote ${quoteKey} contains markup missing from the quote-markup packet`)
    }
    return { text: sourceText, hadMarkup: false }
  }
  if (packetQuote.source_text !== sourceText) {
    throw new Error(`quote-markup packet text for ${quoteKey} does not match takes`)
  }
  const decision = records(markupDecisions.decisions, 'quote markup decisions')
    .find((row) => row.quote_key === quoteKey)
  return {
    text: text(decision?.approved_plain_text, `quote markup decision ${quoteKey} approved_plain_text`),
    hadMarkup: true,
  }
}

function exactCharacterCandidate(
  name: string,
  characters: Array<{ id: string; name: string }>,
): string | null {
  const normalized = name.trim().toLocaleLowerCase('en-US')
  const matches = characters.filter((character) => character.name.toLocaleLowerCase('en-US') === normalized)
  if (matches.length > 1) throw new Error(`legacy reference ${name} matches more than one receipt character`)
  return matches[0]?.id ?? null
}

export function buildSettlementDropQuoteGroundingPacket(
  input: SettlementDropQuoteGroundingInput,
): SettlementDropQuoteGroundingPacket {
  const inputs = {
    receipt: seal(input.receipt, 'settlement receipt'),
    ceremony: seal(input.ceremony, 'legacy ceremony'),
    beatlines: seal(input.beatlines, 'legacy beatlines'),
    legacy_assets: seal(input.legacyAssets, 'legacy asset collection'),
    extraction: seal(input.extraction, 'asset extraction manifest'),
    takes: seal(input.takes, 'takes'),
    presentation_structure: seal(input.presentationPacket, 'presentation structure packet'),
    presentation_decisions: seal(input.presentationDecisions, 'presentation structure decisions'),
    asset_semantics: seal(input.assetPacket, 'asset semantics packet'),
    asset_decisions: seal(input.assetDecisions, 'asset semantics decisions'),
    quote_markup: seal(input.quoteMarkupPacket, 'quote markup packet'),
    quote_markup_decisions: seal(input.quoteMarkupDecisions, 'quote markup decisions'),
    receipt_binding: seal(input.receiptBindingPacket, 'receipt binding packet'),
    receipt_binding_decisions: seal(input.receiptBindingDecisions, 'receipt binding decisions'),
  }
  const receipt = parseSettlementReceipt(input.receipt.raw)
  const presentation = object(input.presentationPacket.raw, 'presentation structure packet')
  const presentationDecisions = object(input.presentationDecisions.raw, 'presentation structure decisions')
  const assets = object(input.assetPacket.raw, 'asset semantics packet')
  const assetDecisions = object(input.assetDecisions.raw, 'asset semantics decisions')
  const markup = object(input.quoteMarkupPacket.raw, 'quote markup packet')
  const markupDecisions = object(input.quoteMarkupDecisions.raw, 'quote markup decisions')
  const receiptBinding = object(input.receiptBindingPacket.raw, 'receipt binding packet')
  const receiptBindingDecisions = object(input.receiptBindingDecisions.raw, 'receipt binding decisions')
  const takes = object(input.takes.raw, 'takes')

  const presentationTarget = record(presentation.target, 'presentation structure target')
  if (presentationTarget.room_code !== receipt.room_code) {
    throw new Error('settlement receipt room does not match presentation structure')
  }
  const rebuiltPresentation = buildSettlementDropPresentationStructurePacket({
    room_code: receipt.room_code,
    ceremony: input.ceremony,
    beatlines: input.beatlines,
    takes: input.takes,
  })
  if (serializeSettlementDropPresentationStructurePacket(rebuiltPresentation) !== input.presentationPacket.raw) {
    throw new Error('presentation structure packet does not match the sealed legacy sources')
  }
  const rebuiltAssets = buildSettlementDropAssetSemanticsPacket({
    room_code: receipt.room_code,
    ceremony: input.ceremony,
    legacy_assets: input.legacyAssets,
    extraction: input.extraction,
  })
  if (serializeSettlementDropAssetSemanticsPacket(rebuiltAssets) !== input.assetPacket.raw) {
    throw new Error('asset semantics packet does not match the sealed legacy sources')
  }
  const rebuiltMarkup = buildSettlementDropQuoteMarkupPacket({
    room_code: receipt.room_code,
    takes: input.takes,
  })
  if (serializeSettlementDropQuoteMarkupPacket(rebuiltMarkup) !== input.quoteMarkupPacket.raw) {
    throw new Error('quote markup packet does not match the sealed legacy takes')
  }
  const rebuiltReceiptBinding = buildSettlementDropReceiptBindingPacket({
    receipt: input.receipt,
    presentationPacket: input.presentationPacket,
    presentationDecisions: input.presentationDecisions,
    assetPacket: input.assetPacket,
    beatlines: input.beatlines,
  })
  if (serializeSettlementDropReceiptBindingPacket(rebuiltReceiptBinding)
    !== input.receiptBindingPacket.raw) {
    throw new Error('receipt binding packet does not match the sealed settlement and presentation sources')
  }
  exactDecisionPacket(presentationDecisions, inputs.presentation_structure, 'presentation structure')
  exactDecisionPacket(assetDecisions, inputs.asset_semantics, 'asset semantics')
  exactDecisionPacket(markupDecisions, inputs.quote_markup, 'quote markup')
  const presentationInputs = record(presentation.inputs, 'presentation structure inputs')
  const takesSeal = record(presentationInputs.takes, 'presentation structure takes seal')
  if (takesSeal.bytes !== inputs.takes.bytes || takesSeal.sha256 !== inputs.takes.sha256) {
    throw new Error('takes do not match the presentation structure packet seal')
  }
  const markupInputs = record(markup.inputs, 'quote markup inputs')
  const markupTakesSeal = record(markupInputs.takes, 'quote markup takes seal')
  if (markupTakesSeal.bytes !== inputs.takes.bytes || markupTakesSeal.sha256 !== inputs.takes.sha256) {
    throw new Error('takes do not match the quote-markup packet seal')
  }

  const structureStatus = inspectSettlementDropPresentationStructureDecisions(
    presentation, presentationDecisions, assets,
  )
  if (structureStatus.status !== 'complete') {
    throw new Error(`presentation structure decisions are incomplete: ${structureStatus.open_items.join(', ')}`)
  }
  const assetStatus = inspectSettlementDropAssetSemanticsDecisions(assets, assetDecisions)
  if (assetStatus.status !== 'complete') {
    throw new Error(`asset semantics decisions are incomplete: ${assetStatus.open_items.join(', ')}`)
  }
  const markupStatus = inspectSettlementDropQuoteMarkupDecisions(markup, markupDecisions)
  if (markupStatus.status !== 'complete') {
    throw new Error(`quote markup decisions are incomplete: ${markupStatus.open_items.join(', ')}`)
  }
  const receiptBindingStatus = inspectSettlementDropReceiptBindingDecisions(
    rebuiltReceiptBinding,
    receiptBindingDecisions,
  )
  if (receiptBindingStatus.status !== 'complete') {
    throw new Error(`receipt binding decisions are incomplete: ${receiptBindingStatus.open_items.join(', ')}`)
  }

  const approvedAssetDecisions = new Map(records(assetDecisions.decisions, 'asset semantics decisions')
    .map((decision) => [String(decision.asset_id), decision]))
  const punditAssets = records(assets.assets, 'asset semantics assets').flatMap((asset) => {
    const decision = approvedAssetDecisions.get(String(asset.id))
    if (decision?.approve_structured_assignments !== true) return []
    const speakers = [...new Set(records(asset.structured_assignments, `asset ${String(asset.id)} assignments`)
      .filter((assignment) => assignment.kind === 'pundit')
      .map((assignment) => text(assignment.consumer, `asset ${String(asset.id)} pundit consumer`)))]
    return speakers.map((speaker) => ({
      asset_id: identifier(asset.id, 'pundit asset id'),
      speaker,
      approved_alt_text: text(decision.approved_alt_text, `asset ${String(asset.id)} approved alt text`),
    }))
  }).sort((left, right) => left.speaker.localeCompare(right.speaker) || left.asset_id.localeCompare(right.asset_id))
  const receiptCharacters = receipt.characters.map((character) => ({ id: character.id, name: character.name }))
  const boundBeatByRecordKey = new Map(records(
    receiptBindingDecisions.bindings,
    'receipt binding decisions.bindings',
  ).map((binding) => [
    `${String(binding.target_kind)}:${String(binding.target_id)}`,
    String(binding.beat_id),
  ]))
  const settlementRecords: SettlementDropQuoteGroundingPacket['settlement_records'] = [
    ...receipt.score_events.map((event) => ({
      record_key: `score_event:${event.id}`,
      id: event.id,
      kind: 'score_event' as const,
      label: event.label,
      beat_id: boundBeatByRecordKey.get(`score_event:${event.id}`) as string,
    })),
    ...(receipt.settled_facts ?? []).filter((fact) => (
      fact.outcome === 'resolved' && fact.board_status === 'unscored'
    )).map((fact) => ({
      record_key: `settled_fact:${fact.id}`,
      id: fact.id,
      kind: 'settled_fact' as const,
      label: fact.title,
      beat_id: boundBeatByRecordKey.get(`unscored_fact:${fact.id}`) as string,
    })),
  ].sort((left, right) => left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id))
  const presentationSlides = new Map(records(presentation.slides, 'presentation structure slides')
    .map((slide) => [String(slide.slide_index), slide]))
  const quotes: SettlementDropQuoteGroundingPacket['quotes'] = []
  let approvedTakeGroups = 0
  for (const decision of records(presentationDecisions.beats, 'presentation structure decision beats')) {
    if (decision.include !== true || decision.approve_take_group !== true) continue
    const slideIndex = decision.slide_index
    if (!Number.isInteger(slideIndex)) throw new Error('included presentation beat slide_index must be an integer')
    const slide = presentationSlides.get(String(slideIndex))
    if (!slide) throw new Error(`included presentation beat ${String(slideIndex)} is missing from packet`)
    const group = text(slide.take_group, `included presentation beat ${String(slideIndex)} take_group`)
    const beatId = identifier(decision.id, `included presentation beat ${String(slideIndex)} id`)
    approvedTakeGroups += 1
    for (const [quoteIndex, take] of takeRows(takes, group).entries()) {
      exactKeys(take, ['speaker', 'text', 'refs'], `takes.${group}[${quoteIndex}]`)
      const quoteKey = `${group}:${quoteIndex}`
      const speaker = text(take.speaker, `takes.${group}[${quoteIndex}].speaker`)
      const sourceText = text(take.text, `takes.${group}[${quoteIndex}].text`)
      const plain = legacyPlainText(quoteKey, sourceText, markup, markupDecisions)
      if (!Array.isArray(take.refs) || take.refs.some((ref) => !isRecord(ref))) {
        throw new Error(`takes.${group}[${quoteIndex}].refs must be an array of objects`)
      }
      const legacyRefs = (take.refs as UnknownRecord[]).map((ref, refIndex) => {
        exactKeys(ref, ['name'], `takes.${group}[${quoteIndex}].refs[${refIndex}]`)
        const name = text(ref.name, `takes.${group}[${quoteIndex}].refs[${refIndex}].name`)
        return { name, candidate_character_id: exactCharacterCandidate(name, receiptCharacters) }
      })
      quotes.push({
        quote_key: quoteKey,
        group,
        quote_index: quoteIndex,
        beat_id: beatId,
        slide_index: slideIndex as number,
        legacy_speaker: speaker,
        legacy_text: sourceText,
        markup_approved_plain_text: plain.text,
        legacy_had_markup: plain.hadMarkup,
        candidate_pundit_asset_ids: punditAssets
          .filter((asset) => asset.speaker === speaker)
          .map((asset) => asset.asset_id),
        legacy_refs: legacyRefs,
      })
    }
  }
  quotes.sort((left, right) => left.slide_index - right.slide_index || left.quote_index - right.quote_index)
  const quoteKeys = quotes.map((quote) => quote.quote_key)
  if (new Set(quoteKeys).size !== quoteKeys.length) throw new Error('approved take groups contain duplicate quote keys')
  return {
    packet_version: 1,
    artifact: 'settlement-drop-quote-grounding-review',
    target: {
      room_code: receipt.room_code,
      settlement_id: receipt.settlement_id,
      settlement_version: receipt.settlement_version,
      manifest_hash: receipt.manifest_hash,
    },
    inputs,
    doctrine: {
      pipeline: 'scripts/grounded-line.mts',
      fact_source_kinds: [...FACT_SOURCE_KINDS],
      independent_screen_warrants: [...STRONG_FACT_SOURCE_KINDS],
      source_material_role: 'attitude_only',
      recap_role: 'corroboration_only',
    },
    coverage: {
      approved_take_groups: approvedTakeGroups,
      quotes: quotes.length,
      quotes_with_legacy_markup: quotes.filter((quote) => quote.legacy_had_markup).length,
      receipt_characters: receiptCharacters.length,
      approved_pundit_assets: punditAssets.length,
    },
    receipt_characters: receiptCharacters,
    settlement_records: settlementRecords,
    pundit_assets: punditAssets,
    quotes,
  }
}

export function serializeSettlementDropQuoteGroundingPacket(
  packet: SettlementDropQuoteGroundingPacket,
): string {
  return `${JSON.stringify(packet, null, 2)}\n`
}

/** Strictly parses the review packet before it can shape an executable plan. */
export function parseSettlementDropQuoteGroundingPacket(
  raw: string,
): SettlementDropQuoteGroundingPacket {
  const value = object(raw, 'quote grounding packet')
  exactKeys(value, [
    'packet_version', 'artifact', 'target', 'inputs', 'doctrine', 'coverage',
    'receipt_characters', 'settlement_records', 'pundit_assets', 'quotes',
  ], 'quote grounding packet')
  if (value.packet_version !== 1 || value.artifact !== 'settlement-drop-quote-grounding-review') {
    throw new Error('quote grounding packet identity is invalid')
  }
  const target = record(value.target, 'quote grounding packet target')
  exactKeys(target, ['room_code', 'settlement_id', 'settlement_version', 'manifest_hash'], 'quote grounding packet target')
  text(target.room_code, 'quote grounding packet target room_code')
  text(target.settlement_id, 'quote grounding packet target settlement_id')
  if (!Number.isInteger(target.settlement_version) || Number(target.settlement_version) < 1) {
    throw new Error('quote grounding packet settlement_version must be a positive integer')
  }
  if (typeof target.manifest_hash !== 'string' || !/^[a-f0-9]{64}$/.test(target.manifest_hash)) {
    throw new Error('quote grounding packet manifest_hash must be a lowercase SHA-256 digest')
  }

  const inputs = record(value.inputs, 'quote grounding packet inputs')
  const inputKeys = [
    'receipt', 'ceremony', 'beatlines', 'legacy_assets', 'extraction', 'takes',
    'presentation_structure', 'presentation_decisions', 'asset_semantics', 'asset_decisions',
    'quote_markup', 'quote_markup_decisions', 'receipt_binding', 'receipt_binding_decisions',
  ]
  exactKeys(inputs, inputKeys, 'quote grounding packet inputs')
  for (const key of inputKeys) {
    const inputSeal = record(inputs[key], `quote grounding packet input ${key}`)
    exactKeys(inputSeal, ['name', 'bytes', 'sha256'], `quote grounding packet input ${key}`)
    text(inputSeal.name, `quote grounding packet input ${key}.name`)
    if (!Number.isInteger(inputSeal.bytes) || Number(inputSeal.bytes) < 0) {
      throw new Error(`quote grounding packet input ${key}.bytes must be a non-negative integer`)
    }
    if (typeof inputSeal.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(inputSeal.sha256)) {
      throw new Error(`quote grounding packet input ${key}.sha256 must be a lowercase SHA-256 digest`)
    }
  }

  const doctrine = record(value.doctrine, 'quote grounding packet doctrine')
  exactKeys(doctrine, [
    'pipeline', 'fact_source_kinds', 'independent_screen_warrants',
    'source_material_role', 'recap_role',
  ], 'quote grounding packet doctrine')
  if (doctrine.pipeline !== 'scripts/grounded-line.mts'
    || JSON.stringify(doctrine.fact_source_kinds) !== JSON.stringify(FACT_SOURCE_KINDS)
    || JSON.stringify(doctrine.independent_screen_warrants) !== JSON.stringify(STRONG_FACT_SOURCE_KINDS)
    || doctrine.source_material_role !== 'attitude_only'
    || doctrine.recap_role !== 'corroboration_only') {
    throw new Error('quote grounding packet doctrine is not canonical')
  }

  const coverage = record(value.coverage, 'quote grounding packet coverage')
  exactKeys(coverage, [
    'approved_take_groups', 'quotes', 'quotes_with_legacy_markup',
    'receipt_characters', 'approved_pundit_assets',
  ], 'quote grounding packet coverage')
  for (const key of Object.keys(coverage)) {
    if (!Number.isInteger(coverage[key]) || Number(coverage[key]) < 0) {
      throw new Error(`quote grounding packet coverage ${key} must be a non-negative integer`)
    }
  }

  const receiptCharacters = records(value.receipt_characters, 'quote grounding packet receipt_characters')
  const characterIds = new Set<string>()
  receiptCharacters.forEach((character, index) => {
    exactKeys(character, ['id', 'name'], `quote grounding packet receipt_character ${index + 1}`)
    const id = text(character.id, `quote grounding packet receipt_character ${index + 1}.id`)
    text(character.name, `quote grounding packet receipt_character ${index + 1}.name`)
    if (characterIds.has(id)) throw new Error(`quote grounding packet has duplicate receipt character ${id}`)
    characterIds.add(id)
  })

  const settlementRecords = records(value.settlement_records, 'quote grounding packet settlement_records')
  const settlementKeys = new Set<string>()
  settlementRecords.forEach((entry, index) => {
    exactKeys(entry, ['record_key', 'id', 'kind', 'label', 'beat_id'], `quote grounding packet settlement_record ${index + 1}`)
    const id = text(entry.id, `quote grounding packet settlement_record ${index + 1}.id`)
    if (entry.kind !== 'score_event' && entry.kind !== 'settled_fact') {
      throw new Error(`quote grounding packet settlement_record ${index + 1}.kind is invalid`)
    }
    const expectedKey = `${entry.kind}:${id}`
    if (entry.record_key !== expectedKey) {
      throw new Error(`quote grounding packet settlement_record ${index + 1}.record_key is not canonical`)
    }
    text(entry.label, `quote grounding packet settlement_record ${index + 1}.label`)
    text(entry.beat_id, `quote grounding packet settlement_record ${index + 1}.beat_id`)
    if (settlementKeys.has(expectedKey)) throw new Error(`quote grounding packet has duplicate settlement record ${expectedKey}`)
    settlementKeys.add(expectedKey)
  })

  const punditAssets = records(value.pundit_assets, 'quote grounding packet pundit_assets')
  const punditKeys = new Set<string>()
  punditAssets.forEach((asset, index) => {
    exactKeys(asset, ['asset_id', 'speaker', 'approved_alt_text'], `quote grounding packet pundit_asset ${index + 1}`)
    const assetId = identifier(asset.asset_id, `quote grounding packet pundit_asset ${index + 1}.asset_id`)
    const speaker = text(asset.speaker, `quote grounding packet pundit_asset ${index + 1}.speaker`)
    text(asset.approved_alt_text, `quote grounding packet pundit_asset ${index + 1}.approved_alt_text`)
    const key = `${speaker}:${assetId}`
    if (punditKeys.has(key)) throw new Error(`quote grounding packet has duplicate pundit identity ${key}`)
    punditKeys.add(key)
  })

  const quotes = records(value.quotes, 'quote grounding packet quotes')
  const quoteKeys = new Set<string>()
  quotes.forEach((quote, index) => {
    const label = `quote grounding packet quote ${index + 1}`
    exactKeys(quote, [
      'quote_key', 'group', 'quote_index', 'beat_id', 'slide_index', 'legacy_speaker',
      'legacy_text', 'markup_approved_plain_text', 'legacy_had_markup',
      'candidate_pundit_asset_ids', 'legacy_refs',
    ], label)
    const group = text(quote.group, `${label}.group`)
    if (!Number.isInteger(quote.quote_index) || Number(quote.quote_index) < 0
      || !Number.isInteger(quote.slide_index) || Number(quote.slide_index) < 0) {
      throw new Error(`${label} indices must be non-negative integers`)
    }
    const expectedKey = `${group}:${quote.quote_index}`
    if (quote.quote_key !== expectedKey) throw new Error(`${label}.quote_key is not canonical`)
    if (quoteKeys.has(expectedKey)) throw new Error(`quote grounding packet has duplicate quote ${expectedKey}`)
    quoteKeys.add(expectedKey)
    text(quote.beat_id, `${label}.beat_id`)
    const speaker = text(quote.legacy_speaker, `${label}.legacy_speaker`)
    text(quote.legacy_text, `${label}.legacy_text`)
    text(quote.markup_approved_plain_text, `${label}.markup_approved_plain_text`)
    if (typeof quote.legacy_had_markup !== 'boolean') throw new Error(`${label}.legacy_had_markup must be boolean`)
    const candidateIds = Array.isArray(quote.candidate_pundit_asset_ids)
      ? quote.candidate_pundit_asset_ids.map((id, assetIndex) => identifier(id, `${label}.candidate_pundit_asset_ids[${assetIndex}]`))
      : (() => { throw new Error(`${label}.candidate_pundit_asset_ids must be an array`) })()
    if (new Set(candidateIds).size !== candidateIds.length) throw new Error(`${label}.candidate_pundit_asset_ids contains duplicates`)
    for (const assetId of candidateIds) {
      if (!punditKeys.has(`${speaker}:${assetId}`)) throw new Error(`${label} references unknown pundit identity ${speaker}:${assetId}`)
    }
    records(quote.legacy_refs, `${label}.legacy_refs`).forEach((ref, refIndex) => {
      exactKeys(ref, ['name', 'candidate_character_id'], `${label}.legacy_refs[${refIndex}]`)
      text(ref.name, `${label}.legacy_refs[${refIndex}].name`)
      if (ref.candidate_character_id !== null) {
        const id = text(ref.candidate_character_id, `${label}.legacy_refs[${refIndex}].candidate_character_id`)
        if (!characterIds.has(id)) throw new Error(`${label}.legacy_refs[${refIndex}] references unknown character ${id}`)
      }
    })
  })
  const distinctGroups = new Set(quotes.map((quote) => String(quote.group))).size
  const markedUp = quotes.filter((quote) => quote.legacy_had_markup === true).length
  if (coverage.approved_take_groups !== distinctGroups
    || coverage.quotes !== quotes.length
    || coverage.quotes_with_legacy_markup !== markedUp
    || coverage.receipt_characters !== receiptCharacters.length
    || coverage.approved_pundit_assets !== punditAssets.length) {
    throw new Error('quote grounding packet coverage does not match its inventories')
  }
  const noncanonicalText = (candidate: unknown): boolean => {
    if (typeof candidate === 'string') return candidate !== candidate.trim()
    if (Array.isArray(candidate)) return candidate.some(noncanonicalText)
    return isRecord(candidate) && Object.values(candidate).some(noncanonicalText)
  }
  if (noncanonicalText(value)) throw new Error('quote grounding packet contains noncanonical text')
  if (serializeSettlementDropQuoteGroundingPacket(value as unknown as SettlementDropQuoteGroundingPacket) !== raw) {
    throw new Error('quote grounding packet bytes are not canonical')
  }
  return value as unknown as SettlementDropQuoteGroundingPacket
}

export function serializeSettlementDropQuoteGroundingDecisionTemplate(
  packet: SettlementDropQuoteGroundingPacket,
): string {
  const value: SettlementDropQuoteGroundingDecisionTemplate = {
    decision_version: 1,
    artifact: 'settlement-drop-quote-grounding-decisions',
    target: packet.target,
    expected_packet_sha256: sha256Hex(serializeSettlementDropQuoteGroundingPacket(packet)),
    decisions: packet.quotes.map((quote) => ({
      quote_key: quote.quote_key,
      disposition: null,
      speaker: null,
      portrait_asset_id: null,
      ref_character_ids: null,
      voice_instruction: null,
      screen_facts: null,
      source_material_attitude: null,
      angle: null,
      note: null,
    })),
  }
  return `${JSON.stringify(value, null, 2)}\n`
}

function nullableText(value: unknown, label: string): void {
  if (value !== null) text(value, label)
}

function assertNull(value: unknown, label: string): void {
  if (value !== null) throw new Error(`${label} must stay null for an omitted quote`)
}

function textArray(value: unknown, label: string, allowEmpty: boolean): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new Error(`${label} must be ${allowEmpty ? 'an' : 'a non-empty'} array`)
  }
  const values = value.map((item, index) => text(item, `${label}[${index}]`))
  if (new Set(values).size !== values.length) throw new Error(`${label} must not contain duplicates`)
  return values
}

function validateFactSources(
  value: unknown,
  packet: SettlementDropQuoteGroundingPacket,
  beatId: string,
  label: string,
): void {
  const facts = records(value, label)
  if (facts.length === 0) throw new Error(`${label} must contain at least one screen fact`)
  const settlementRecords = new Map(packet.settlement_records.map((entry) => [entry.record_key, entry]))
  const factTexts = new Set<string>()
  for (const [factIndex, fact] of facts.entries()) {
    const factLabel = `${label}[${factIndex}]`
    exactKeys(fact, ['text', 'sources'], factLabel)
    const factText = text(fact.text, `${factLabel}.text`)
    if (factTexts.has(factText)) throw new Error(`${label} contains duplicate fact text`)
    factTexts.add(factText)
    const sources = records(fact.sources, `${factLabel}.sources`)
    if (sources.length === 0) throw new Error(`${factLabel}.sources must not be empty`)
    let strong = false
    let independentScreenSource = false
    const referencedSettlementRecords: SettlementDropQuoteGroundingPacket['settlement_records'] = []
    const sourceKeys = new Set<string>()
    for (const [sourceIndex, source] of sources.entries()) {
      const sourceLabel = `${factLabel}.sources[${sourceIndex}]`
      exactKeys(source, ['kind', 'ref'], sourceLabel)
      if (!FACT_SOURCE_KINDS.includes(source.kind as SettlementDropQuoteFactSourceKind)) {
        throw new Error(`${sourceLabel}.kind is not an allowed screen-fact warrant`)
      }
      const kind = source.kind as SettlementDropQuoteFactSourceKind
      const ref = text(source.ref, `${sourceLabel}.ref`)
      const key = `${kind}:${ref}`
      if (sourceKeys.has(key)) throw new Error(`${factLabel}.sources contains duplicate warrant ${key}`)
      sourceKeys.add(key)
      if (kind !== 'recap') strong = true
      if (kind !== 'recap' && kind !== 'settlement_record') independentScreenSource = true
      if (kind === 'settlement_record') {
        const settlementRecord = settlementRecords.get(ref)
        if (!settlementRecord) {
          throw new Error(`${sourceLabel}.ref references unknown settlement record ${ref}`)
        }
        if (settlementRecord.beat_id !== beatId) {
          throw new Error(`${sourceLabel}.ref belongs to beat ${settlementRecord.beat_id}, not ${beatId}`)
        }
        referencedSettlementRecords.push(settlementRecord)
      }
    }
    if (!strong) throw new Error(`${factLabel} cannot rely on recap evidence alone`)
    if (!independentScreenSource && referencedSettlementRecords.length > 0
      && !referencedSettlementRecords.some((entry) => entry.label === factText)) {
      throw new Error(`${factLabel} must exactly quote a settlement record label unless independently warranted`)
    }
  }
}

export function inspectSettlementDropQuoteGroundingDecisions(
  packet: SettlementDropQuoteGroundingPacket,
  decisionsValue: unknown,
): SettlementDropQuoteGroundingDecisionStatus {
  if (!isRecord(decisionsValue)) throw new Error('quote grounding decisions must be an object')
  const decisions = decisionsValue
  exactKeys(decisions, [
    'decision_version', 'artifact', 'target', 'expected_packet_sha256', 'decisions',
  ], 'quote grounding decisions')
  if (decisions.decision_version !== 1
    || decisions.artifact !== 'settlement-drop-quote-grounding-decisions') {
    throw new Error('quote grounding decision identity is invalid')
  }
  sameTarget(packet.target, record(decisions.target, 'quote grounding decisions target'), 'quote grounding decisions target')
  if (decisions.expected_packet_sha256 !== sha256Hex(serializeSettlementDropQuoteGroundingPacket(packet))) {
    throw new Error('quote grounding decisions do not target the exact packet bytes')
  }
  const rows = identityRows(
    packet.quotes.map((quote) => quote.quote_key),
    records(decisions.decisions, 'quote grounding decision rows'),
    'quote_key',
    'quote grounding decisions',
  )
  const characterIds = new Set(packet.receipt_characters.map((character) => character.id))
  const punditAssets = new Map(packet.pundit_assets.map((asset) => [`${asset.speaker}:${asset.asset_id}`, asset]))
  const openItems: string[] = []
  let requiredValues = 0
  for (const quote of packet.quotes) {
    const row = rows.get(quote.quote_key) as UnknownRecord
    exactKeys(row, [
      'quote_key', 'disposition', 'speaker', 'portrait_asset_id', 'ref_character_ids',
      'voice_instruction', 'screen_facts', 'source_material_attitude', 'angle', 'note',
    ], `quote grounding ${quote.quote_key}`)
    requiredValues += 1
    if (row.disposition === null) {
      openItems.push(`quotes[${quote.quote_key}].disposition`)
      for (const field of [
        'speaker', 'portrait_asset_id', 'ref_character_ids', 'voice_instruction', 'screen_facts',
        'source_material_attitude', 'angle',
      ]) {
        if (row[field] !== null) throw new Error(`quote ${quote.quote_key} ${field} must stay null until disposition is chosen`)
      }
      nullableText(row.note, `quote ${quote.quote_key}.note`)
      continue
    }
    if (row.disposition !== 'replace' && row.disposition !== 'omit') {
      throw new Error(`quote ${quote.quote_key} disposition must be replace, omit, or null`)
    }
    if (row.disposition === 'omit') {
      for (const field of [
        'speaker', 'portrait_asset_id', 'ref_character_ids', 'voice_instruction', 'screen_facts',
        'source_material_attitude', 'angle',
      ]) assertNull(row[field], `quote ${quote.quote_key} ${field}`)
      requiredValues += 1
      if (row.note === null) openItems.push(`quotes[${quote.quote_key}].note`)
      else text(row.note, `omitted quote ${quote.quote_key}.note`)
      continue
    }
    const required = [
      'speaker', 'portrait_asset_id', 'ref_character_ids', 'voice_instruction',
      'screen_facts', 'source_material_attitude', 'angle',
    ]
    for (const field of required) {
      requiredValues += 1
      if (row[field] === null) openItems.push(`quotes[${quote.quote_key}].${field}`)
    }
    if (row.speaker !== null) text(row.speaker, `quote ${quote.quote_key}.speaker`)
    if (row.portrait_asset_id !== null && row.speaker !== null) {
      const assetId = identifier(row.portrait_asset_id, `quote ${quote.quote_key}.portrait_asset_id`)
      const speaker = row.speaker as string
      const asset = punditAssets.get(`${speaker}:${assetId}`)
      if (!asset) {
        throw new Error(`quote ${quote.quote_key} references unknown approved pundit identity ${speaker}:${assetId}`)
      }
    }
    if (row.ref_character_ids !== null) {
      for (const characterId of textArray(row.ref_character_ids, `quote ${quote.quote_key}.ref_character_ids`, false)) {
        if (!characterIds.has(characterId)) {
          throw new Error(`quote ${quote.quote_key} references unknown receipt character ${characterId}`)
        }
      }
    }
    if (row.voice_instruction !== null) text(row.voice_instruction, `quote ${quote.quote_key}.voice_instruction`)
    if (row.screen_facts !== null) {
      validateFactSources(
        row.screen_facts,
        packet,
        quote.beat_id,
        `quote ${quote.quote_key}.screen_facts`,
      )
    }
    if (row.source_material_attitude !== null) {
      textArray(row.source_material_attitude, `quote ${quote.quote_key}.source_material_attitude`, true)
    }
    if (row.angle !== null) text(row.angle, `quote ${quote.quote_key}.angle`)
    nullableText(row.note, `quote ${quote.quote_key}.note`)
  }
  return {
    required_values: requiredValues,
    open_values: openItems.length,
    open_items: openItems,
    status: openItems.length === 0 ? 'complete' : 'open',
  }
}

export function buildSettlementDropQuoteGroundingPlan(
  packet: SettlementDropQuoteGroundingPacket,
  decisionsRaw: string,
): SettlementDropQuoteGroundingPlan {
  const decisionsValue = object(decisionsRaw, 'quote grounding decisions')
  const status = inspectSettlementDropQuoteGroundingDecisions(packet, decisionsValue)
  if (status.status !== 'complete') {
    throw new Error(`quote grounding decisions are incomplete: ${status.open_items.join(', ')}`)
  }
  const decisions = decisionsValue as UnknownRecord
  const rows = new Map(records(decisions.decisions, 'quote grounding decisions')
    .map((row) => [String(row.quote_key), row]))
  const assetById = new Map(packet.pundit_assets.map((asset) => [`${asset.speaker}:${asset.asset_id}`, asset]))
  const characterById = new Map(packet.receipt_characters.map((character) => [character.id, character]))
  const omissions: SettlementDropQuoteGroundingPlan['omissions'] = []
  const jobs: SettlementDropQuoteGroundingPlan['jobs'] = []
  for (const quote of packet.quotes) {
    const row = rows.get(quote.quote_key) as UnknownRecord
    if (row.disposition === 'omit') {
      omissions.push({ quote_key: quote.quote_key, beat_id: quote.beat_id, note: text(row.note, 'omission note') })
      continue
    }
    const assetId = row.portrait_asset_id as string
    const speaker = row.speaker as string
    const asset = assetById.get(`${speaker}:${assetId}`)!
    const refCharacterIds = textArray(
      row.ref_character_ids,
      `quote ${quote.quote_key}.ref_character_ids`,
      false,
    )
    const refs = refCharacterIds.map((characterId) => ({
      character_id: characterId,
      name: characterById.get(characterId)!.name,
    }))
    const factRows = records(row.screen_facts, `quote ${quote.quote_key}.screen_facts`)
    const facts = factRows.map((fact, index) => text(
      fact.text,
      `quote ${quote.quote_key}.screen_facts[${index}].text`,
    ))
    const factWarrants = factRows.map((fact, factIndex) => ({
      text: text(fact.text, `quote ${quote.quote_key}.screen_facts[${factIndex}].text`),
      sources: (fact.sources as UnknownRecord[]).map((source) => ({
        kind: source.kind as SettlementDropQuoteFactSourceKind,
        ref: text(source.ref, `quote ${quote.quote_key}.screen_facts[${factIndex}].source.ref`),
      })),
    }))
    const attitudes = textArray(
      row.source_material_attitude,
      `quote ${quote.quote_key}.source_material_attitude`,
      true,
    )
    const voice = [
      `Voice: ${asset.speaker}`,
      `Expression instruction: ${text(row.voice_instruction, `quote ${quote.quote_key}.voice_instruction`)}`,
      ...attitudes.map((value) => `Source-material attitude: ${value}`),
    ].join('\n')
    const angle = text(row.angle, `quote ${quote.quote_key}.angle`)
    const promptContract = buildGroundedLinePromptContract({
      speaker: asset.speaker, voice, facts, angle,
    })
    jobs.push({
      quote_key: quote.quote_key,
      beat_id: quote.beat_id,
      speaker: asset.speaker,
      portrait_asset_id: assetId,
      refs,
      voice,
      facts,
      fact_warrants: factWarrants,
      angle,
      prompt_contract: promptContract,
    })
  }
  const budgetJobs = jobs.map((job) => ({
    request_id: job.quote_key,
    publication_status: 'pending' as const,
    speaker: job.speaker,
    voice: job.voice,
    facts: job.facts,
    angle: job.angle,
    prompt_contract: job.prompt_contract,
  }))
  return {
    plan_version: 1,
    artifact: 'settlement-drop-quote-grounding-plan',
    target: packet.target,
    packet_sha256: sha256Hex(serializeSettlementDropQuoteGroundingPacket(packet)),
    decisions_sha256: sha256Hex(decisionsRaw),
    budget: buildShowPackCommentaryBudget(budgetJobs),
    omissions,
    jobs,
  }
}

export function serializeSettlementDropQuoteGroundingPlan(
  plan: SettlementDropQuoteGroundingPlan,
): string {
  return `${JSON.stringify(plan, null, 2)}\n`
}
