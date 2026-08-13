import { inspectSettlementDropPresentationStructureDecisions } from './settlement-drop-approval-decisions'
import type { SealedTextArtifact } from './settlement-drop-asset-semantics'
import { parseSettlementReceipt, type SettlementReceipt } from './settlement-receipt'
import { sha256Hex } from './sha256'

type UnknownRecord = Record<string, unknown>

export type SettlementDropReceiptBindingTargetKind = 'score_event' | 'unscored_fact'
export type SettlementDropLegacyLineKind = 'draft' | 'bingo' | 'nocard'

export interface SettlementDropReceiptBindingPacket {
  packet_version: 1
  artifact: 'settlement-drop-receipt-binding-review'
  target: {
    room_code: string
    settlement_id: string
    settlement_version: number
    manifest_hash: string
  }
  inputs: {
    receipt: SealedTextArtifact['seal']
    presentation_structure: SealedTextArtifact['seal']
    presentation_decisions: SealedTextArtifact['seal']
    asset_semantics: SealedTextArtifact['seal']
    beatlines: SealedTextArtifact['seal']
  }
  coverage: {
    included_beats: number
    score_events: number
    unscored_facts: number
    legacy_lines: number
    legacy_lines_with_candidate_beat: number
  }
  included_beats: Array<{
    beat_id: string
    slide_index: number
    title: string
    approved_beatline_group: string | null
  }>
  targets: Array<{
    target_kind: SettlementDropReceiptBindingTargetKind
    target_id: string
    kind: string
    label: string
    points: number | null
    player_id: string | null
    character_id: string | null
  }>
  legacy_lines: Array<{
    line_key: string
    group: string
    line_index: number
    kind: SettlementDropLegacyLineKind
    label: string
    points: number | null
    candidate_beat_id: string | null
  }>
}

export interface SettlementDropReceiptBindingDecisionTemplate {
  decision_version: 1
  artifact: 'settlement-drop-receipt-binding-decisions'
  target: SettlementDropReceiptBindingPacket['target']
  expected_packet_sha256: string
  bindings: Array<{
    target_kind: SettlementDropReceiptBindingTargetKind
    target_id: string
    beat_id: null
    note: null
  }>
  legacy_lines: Array<{
    line_key: string
    disposition: null
    receipt_target_kind: null
    receipt_target_id: null
    note: null
  }>
}

export interface SettlementDropReceiptBindingDecisionStatus {
  required_values: number
  open_values: number
  open_items: string[]
  status: 'open' | 'complete'
}

export interface SettlementDropReceiptBindingInput {
  receipt: SealedTextArtifact
  presentationPacket: SealedTextArtifact
  presentationDecisions: SealedTextArtifact
  assetPacket: SealedTextArtifact
  beatlines: SealedTextArtifact
}

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function object(raw: string, label: string): UnknownRecord {
  const value: unknown = JSON.parse(raw)
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  return value
}

function exactKeys(value: UnknownRecord, keys: string[], label: string): void {
  const expected = new Set(keys)
  const unknown = Object.keys(value).find((key) => !expected.has(key))
  if (unknown) throw new Error(`${label} has unknown field ${unknown}`)
  const missing = keys.find((key) => !Object.prototype.hasOwnProperty.call(value, key))
  if (missing) throw new Error(`${label} is missing field ${missing}`)
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value
}

function identifier(value: unknown, label: string): string {
  const result = stringValue(value, label)
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(result)) {
    throw new Error(`${label} must contain only letters, numbers, underscores, or hyphens`)
  }
  return result
}

function artifact(input: SealedTextArtifact, label: string): SealedTextArtifact['seal'] {
  const bytes = new TextEncoder().encode(input.raw).byteLength
  const sha256 = sha256Hex(input.raw)
  if (input.seal.bytes !== bytes || input.seal.sha256 !== sha256) {
    throw new Error(`${label} seal does not match its bytes`)
  }
  return { name: stringValue(input.seal.name, `${label} seal name`), bytes, sha256 }
}

function records(value: unknown, label: string): UnknownRecord[] {
  if (!Array.isArray(value) || value.some((row) => !isRecord(row))) {
    throw new Error(`${label} must be an array of objects`)
  }
  return value as UnknownRecord[]
}

function sameTarget(
  left: SettlementDropReceiptBindingPacket['target'],
  right: UnknownRecord,
  label: string,
): void {
  exactKeys(right, ['room_code', 'settlement_id', 'settlement_version', 'manifest_hash'], `${label} target`)
  if (right.room_code !== left.room_code || right.settlement_id !== left.settlement_id
    || right.settlement_version !== left.settlement_version || right.manifest_hash !== left.manifest_hash) {
    throw new Error(`${label} target does not exactly match the packet target`)
  }
}

function signedPoints(value: unknown, label: string): number | null {
  if (value === undefined || value === null || value === '') return null
  if (Number.isInteger(value)) return value as number
  if (typeof value === 'string' && /^[+-]?\d+$/.test(value.trim())) return Number(value)
  throw new Error(`${label} points must be an integer when present`)
}

function legacyLine(
  row: UnknownRecord,
  group: string,
  lineIndex: number,
  candidateBeatId: string | null,
): SettlementDropReceiptBindingPacket['legacy_lines'][number] {
  const prefix = `beatlines.${group}[${lineIndex}]`
  const kind = row.kind
  if (kind === 'draft') {
    const character = stringValue(row.char, `${prefix}.char`)
    const text = stringValue(row.text, `${prefix}.text`)
    return {
      line_key: `${group}:${lineIndex}`, group, line_index: lineIndex, kind,
      label: `${character}: ${text}`, points: signedPoints(row.pts, prefix), candidate_beat_id: candidateBeatId,
    }
  }
  if (kind === 'bingo') {
    const player = stringValue(row.player, `${prefix}.player`)
    const square = stringValue(row.square, `${prefix}.square`)
    return {
      line_key: `${group}:${lineIndex}`, group, line_index: lineIndex, kind,
      label: `${player}: ${square}`, points: signedPoints(row.pts, prefix), candidate_beat_id: candidateBeatId,
    }
  }
  if (kind === 'nocard') {
    return {
      line_key: `${group}:${lineIndex}`, group, line_index: lineIndex, kind,
      label: stringValue(row.text, `${prefix}.text`), points: null, candidate_beat_id: candidateBeatId,
    }
  }
  throw new Error(`${prefix}.kind must be draft, bingo, or nocard`)
}

function receiptTargets(receipt: SettlementReceipt): SettlementDropReceiptBindingPacket['targets'] {
  const scoreEvents = receipt.score_events.map((event) => ({
    target_kind: 'score_event' as const,
    target_id: event.id,
    kind: event.kind,
    label: event.label,
    points: event.points,
    player_id: event.player_id,
    character_id: event.character_id ?? null,
  }))
  const unscoredFacts = (receipt.settled_facts ?? []).filter((fact) => (
    fact.outcome === 'resolved' && fact.board_status === 'unscored'
  )).map((fact) => ({
    target_kind: 'unscored_fact' as const,
    target_id: fact.id,
    kind: 'no_card',
    label: fact.title,
    points: null,
    player_id: null,
    character_id: fact.winner?.id ?? null,
  }))
  return [...scoreEvents, ...unscoredFacts].sort((left, right) => (
    left.target_kind.localeCompare(right.target_kind) || left.target_id.localeCompare(right.target_id)
  ))
}

export function buildSettlementDropReceiptBindingPacket(
  input: SettlementDropReceiptBindingInput,
): SettlementDropReceiptBindingPacket {
  const seals = {
    receipt: artifact(input.receipt, 'receipt'),
    presentation_structure: artifact(input.presentationPacket, 'presentation structure packet'),
    presentation_decisions: artifact(input.presentationDecisions, 'presentation structure decisions'),
    asset_semantics: artifact(input.assetPacket, 'asset semantics packet'),
    beatlines: artifact(input.beatlines, 'beatlines'),
  }
  const receipt = parseSettlementReceipt(input.receipt.raw)
  const presentation = object(input.presentationPacket.raw, 'presentation structure packet')
  const decisions = object(input.presentationDecisions.raw, 'presentation structure decisions')
  const assets = object(input.assetPacket.raw, 'asset semantics packet')
  const presentationTarget = isRecord(presentation.target) ? presentation.target : {}
  if (presentationTarget.room_code !== receipt.room_code) {
    throw new Error('receipt room does not match the presentation structure packet')
  }
  if (decisions.expected_packet_sha256 !== seals.presentation_structure.sha256) {
    throw new Error('presentation decisions do not target the supplied presentation packet')
  }
  const inputs = isRecord(presentation.inputs) ? presentation.inputs : {}
  const beatlinesSeal = isRecord(inputs.beatlines) ? inputs.beatlines : {}
  if (beatlinesSeal.bytes !== seals.beatlines.bytes || beatlinesSeal.sha256 !== seals.beatlines.sha256) {
    throw new Error('beatlines do not match the presentation packet seal')
  }
  const status = inspectSettlementDropPresentationStructureDecisions(presentation, decisions, assets)
  if (status.status !== 'complete') {
    throw new Error(`presentation structure decisions are incomplete: ${status.open_items.join(', ')}`)
  }

  const packetSlides = new Map(records(presentation.slides, 'presentation structure slides')
    .map((slide) => [String(slide.slide_index), slide]))
  const approvedGroupToBeat = new Map<string, string>()
  const includedBeats = records(decisions.beats, 'presentation structure decision beats')
    .filter((beat) => beat.include === true)
    .map((beat) => {
      const slideIndex = beat.slide_index as number
      const observed = packetSlides.get(String(slideIndex))
      if (!observed) throw new Error(`included beat slide ${slideIndex} is missing from the presentation packet`)
      const beatId = identifier(beat.id, `included beat ${slideIndex}.id`)
      const group = beat.approve_beatline_group === true
        ? stringValue(observed.beatline_group_candidate, `included beat ${slideIndex} beatline group`)
        : null
      if (group) {
        if (approvedGroupToBeat.has(group)) throw new Error(`beatline group ${group} is approved for more than one beat`)
        approvedGroupToBeat.set(group, beatId)
      }
      return {
        beat_id: beatId,
        slide_index: slideIndex,
        title: stringValue(beat.title, `included beat ${slideIndex}.title`),
        approved_beatline_group: group,
      }
    })
  const beatlines = object(input.beatlines.raw, 'beatlines')
  const legacyLines = Object.entries(beatlines)
    .sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
    .flatMap(([group, value]) => records(value, `beatlines.${group}`)
      .map((row, index) => legacyLine(row, group, index, approvedGroupToBeat.get(group) ?? null)))
  const targets = receiptTargets(receipt)
  return {
    packet_version: 1,
    artifact: 'settlement-drop-receipt-binding-review',
    target: {
      room_code: receipt.room_code,
      settlement_id: receipt.settlement_id,
      settlement_version: receipt.settlement_version,
      manifest_hash: receipt.manifest_hash,
    },
    inputs: seals,
    coverage: {
      included_beats: includedBeats.length,
      score_events: receipt.score_events.length,
      unscored_facts: targets.filter((target) => target.target_kind === 'unscored_fact').length,
      legacy_lines: legacyLines.length,
      legacy_lines_with_candidate_beat: legacyLines.filter((line) => line.candidate_beat_id !== null).length,
    },
    included_beats: includedBeats,
    targets,
    legacy_lines: legacyLines,
  }
}

export function serializeSettlementDropReceiptBindingPacket(
  packet: SettlementDropReceiptBindingPacket,
): string {
  return `${JSON.stringify(packet, null, 2)}\n`
}

export function serializeSettlementDropReceiptBindingDecisionTemplate(
  packet: SettlementDropReceiptBindingPacket,
): string {
  const decisions: SettlementDropReceiptBindingDecisionTemplate = {
    decision_version: 1,
    artifact: 'settlement-drop-receipt-binding-decisions',
    target: packet.target,
    expected_packet_sha256: sha256Hex(serializeSettlementDropReceiptBindingPacket(packet)),
    bindings: packet.targets.map((target) => ({
      target_kind: target.target_kind,
      target_id: target.target_id,
      beat_id: null,
      note: null,
    })),
    legacy_lines: packet.legacy_lines.map((line) => ({
      line_key: line.line_key,
      disposition: null,
      receipt_target_kind: null,
      receipt_target_id: null,
      note: null,
    })),
  }
  return `${JSON.stringify(decisions, null, 2)}\n`
}

function exactRows(
  expected: Array<{ [key: string]: unknown }>,
  actual: UnknownRecord[],
  expectedKey: string,
  actualKey: string,
  label: string,
): Map<string, UnknownRecord> {
  const keys = new Set(expected.map((row) => String(row[expectedKey])))
  const result = new Map<string, UnknownRecord>()
  for (const row of actual) {
    const key = stringValue(row[actualKey], `${label} key`)
    if (!keys.has(key)) throw new Error(`${label} contains unknown key ${key}`)
    if (result.has(key)) throw new Error(`${label} contains duplicate key ${key}`)
    result.set(key, row)
  }
  const missing = [...keys].find((key) => !result.has(key))
  if (missing) throw new Error(`${label} is missing key ${missing}`)
  return result
}

function targetKey(kind: unknown, id: unknown): string {
  return `${String(kind)}:${String(id)}`
}

function exactTargetBindingRows(
  packet: SettlementDropReceiptBindingPacket,
  actual: UnknownRecord[],
): Map<string, UnknownRecord> {
  const expected = new Set(packet.targets.map((target) => targetKey(target.target_kind, target.target_id)))
  const result = new Map<string, UnknownRecord>()
  for (const row of actual) {
    exactKeys(row, ['target_kind', 'target_id', 'beat_id', 'note'], 'receipt target binding')
    const key = targetKey(row.target_kind, row.target_id)
    if (!expected.has(key)) throw new Error(`receipt target bindings contains unknown key ${key}`)
    if (result.has(key)) throw new Error(`receipt target bindings contains duplicate key ${key}`)
    result.set(key, row)
  }
  const missing = [...expected].find((key) => !result.has(key))
  if (missing) throw new Error(`receipt target bindings is missing key ${missing}`)
  return result
}

export function inspectSettlementDropReceiptBindingDecisions(
  packet: SettlementDropReceiptBindingPacket,
  decisionsValue: unknown,
): SettlementDropReceiptBindingDecisionStatus {
  if (!isRecord(decisionsValue)) throw new Error('receipt binding decisions must be an object')
  const decisions = decisionsValue
  exactKeys(decisions, [
    'decision_version', 'artifact', 'target', 'expected_packet_sha256', 'bindings', 'legacy_lines',
  ], 'receipt binding decisions')
  if (decisions.decision_version !== 1) throw new Error('receipt binding decision_version must be 1')
  if (decisions.artifact !== 'settlement-drop-receipt-binding-decisions') {
    throw new Error('receipt binding decision artifact is invalid')
  }
  if (!isRecord(decisions.target)) throw new Error('receipt binding decisions target must be an object')
  sameTarget(packet.target, decisions.target, 'receipt binding decisions')
  const expectedPacketHash = sha256Hex(serializeSettlementDropReceiptBindingPacket(packet))
  if (decisions.expected_packet_sha256 !== expectedPacketHash) {
    throw new Error('receipt binding decisions do not target the exact packet bytes')
  }
  const targetByKey = new Map(packet.targets.map((target) => [targetKey(target.target_kind, target.target_id), target]))
  const bindingRows = records(decisions.bindings, 'receipt binding decisions.bindings')
  const bindings = exactTargetBindingRows(packet, bindingRows)
  const legacyRows = exactRows(
    packet.legacy_lines, records(decisions.legacy_lines, 'receipt binding decisions.legacy_lines'),
    'line_key', 'line_key', 'legacy line decisions',
  )
  const includedBeatIds = new Set(packet.included_beats.map((beat) => beat.beat_id))
  const targetBeat = new Map<string, string>()
  const representedTargets = new Set<string>()
  const openItems: string[] = []
  let requiredValues = 0
  for (const [key, row] of bindings) {
    requiredValues += 1
    if (row.beat_id === null) openItems.push(`bindings[${key}].beat_id`)
    else {
      const beatId = identifier(row.beat_id, `bindings[${key}].beat_id`)
      if (!includedBeatIds.has(beatId)) throw new Error(`binding ${key} references unknown included beat ${beatId}`)
      targetBeat.set(key, beatId)
    }
    if (row.note !== null) stringValue(row.note, `bindings[${key}].note`)
  }
  for (const line of packet.legacy_lines) {
    const row = legacyRows.get(line.line_key) as UnknownRecord
    exactKeys(row, [
      'line_key', 'disposition', 'receipt_target_kind', 'receipt_target_id', 'note',
    ], `legacy line ${line.line_key}`)
    requiredValues += 1
    if (row.disposition === null) {
      openItems.push(`legacy_lines[${line.line_key}].disposition`)
      continue
    }
    if (row.disposition !== 'represented' && row.disposition !== 'superseded') {
      throw new Error(`legacy line ${line.line_key} disposition must be represented, superseded, or null`)
    }
    if (row.disposition === 'superseded') {
      if (row.receipt_target_kind !== null || row.receipt_target_id !== null) {
        throw new Error(`superseded legacy line ${line.line_key} cannot reference a receipt target`)
      }
      stringValue(row.note, `superseded legacy line ${line.line_key}.note`)
      continue
    }
    if (line.candidate_beat_id === null) {
      throw new Error(`represented legacy line ${line.line_key} has no approved candidate beat`)
    }
    const key = targetKey(row.receipt_target_kind, row.receipt_target_id)
    const target = targetByKey.get(key)
    if (!target) throw new Error(`represented legacy line ${line.line_key} references unknown receipt target ${key}`)
    if (targetBeat.get(key) !== line.candidate_beat_id) {
      throw new Error(`represented legacy line ${line.line_key} target must be bound to candidate beat ${line.candidate_beat_id}`)
    }
    if (line.kind === 'draft' && (target.target_kind !== 'score_event'
      || !['draft', 'adjustment'].includes(target.kind))) {
      throw new Error(`draft legacy line must reference a draft or adjustment score event`)
    }
    if (line.kind === 'bingo' && (target.target_kind !== 'score_event' || target.kind !== 'bingo')) {
      throw new Error('bingo legacy line must reference a bingo score event')
    }
    if (line.kind === 'nocard' && target.target_kind !== 'unscored_fact') {
      throw new Error('nocard legacy line must reference an unscored fact')
    }
    if (line.points !== null && target.points !== line.points) {
      throw new Error(`legacy line ${line.line_key} has ${line.points} points but target ${key} has ${target.points}`)
    }
    if (representedTargets.has(key)) {
      throw new Error(`receipt target ${key} represents more than one legacy line`)
    }
    representedTargets.add(key)
    if (row.note !== null) stringValue(row.note, `legacy line ${line.line_key}.note`)
  }
  if (openItems.length === 0) {
    for (const beatId of includedBeatIds) {
      if (![...targetBeat.values()].includes(beatId)) {
        throw new Error(`included beat ${beatId} must receive at least one receipt target`)
      }
    }
  }
  return {
    required_values: requiredValues,
    open_values: openItems.length,
    open_items: openItems,
    status: openItems.length === 0 ? 'complete' : 'open',
  }
}
