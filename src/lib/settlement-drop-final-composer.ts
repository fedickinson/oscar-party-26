import {
  inspectSettlementDropAssetSemanticsDecisions,
  inspectSettlementDropPlayerIdentityDecisions,
  inspectSettlementDropPresentationStructureDecisions,
} from './settlement-drop-approval-decisions'
import {
  parseSettlementDropManifest,
  type CompiledSettlementDrop,
  type SettlementDropAccent,
  type SettlementDropManifest,
  type SettlementDropMusterTier,
} from './settlement-drop'
import {
  serializeSettlementDropAssetSemanticsPacket,
  type SettlementDropAssetSemanticsPacket,
} from './settlement-drop-asset-semantics'
import {
  serializeSettlementDropPlayerIdentityPacket,
  type SettlementDropPlayerIdentityPacket,
} from './settlement-drop-player-identity'
import {
  serializeSettlementDropPresentationStructurePacket,
  type SettlementDropPresentationStructurePacket,
} from './settlement-drop-presentation-structure'
import {
  buildSettlementDropReceiptBindingPacket,
  inspectSettlementDropReceiptBindingDecisions,
  serializeSettlementDropReceiptBindingPacket,
} from './settlement-drop-receipt-binding'
import {
  assertSettlementDropQuoteGroundingPlanCurrent,
  parseSettlementDropQuotePublication,
} from './settlement-drop-quote-publication'
import { parseSettlementDropQuoteGroundingPacket } from './settlement-drop-quote-grounding'
import { containsDisallowedEmoji } from './generated-prose'
import { parseSettlementReceipt, type SettlementReceipt } from './settlement-receipt'
import { sha256Hex } from './sha256'

type UnknownRecord = Record<string, unknown>
type CharacterKind = 'character' | 'creature' | 'organization' | 'other'

export interface SettlementDropFinalAuthoringPacket {
  packet_version: 1
  artifact: 'settlement-drop-final-authoring-review'
  target: {
    room_code: string
    settlement_id: string
    settlement_version: number
    manifest_hash: string
  }
  inputs: {
    receipt_sha256: string
    presentation_packet_sha256: string
    presentation_decisions_sha256: string
    asset_packet_sha256: string
    asset_decisions_sha256: string
    player_identity_packet_sha256: string
    player_identity_decisions_sha256: string
  }
  players: Array<{
    player_id: string
    canonical_name: string
    candidate_sigil_asset_ids: string[]
  }>
  characters: Array<{
    character_id: string
    name: string
    player_id: string | null
    candidate_portrait_asset_ids: string[]
    settled_points: number
  }>
}

export function parseSettlementDropFinalAuthoringPacket(
  raw: string,
): SettlementDropFinalAuthoringPacket {
  const value = object(raw, 'final authoring packet')
  exactKeys(value, ['packet_version', 'artifact', 'target', 'inputs', 'players', 'characters'], 'final authoring packet')
  if (value.packet_version !== 1 || value.artifact !== 'settlement-drop-final-authoring-review') {
    throw new Error('final authoring packet identity is invalid')
  }
  const target = record(value.target, 'final authoring packet target')
  exactKeys(target, ['room_code', 'settlement_id', 'settlement_version', 'manifest_hash'], 'final authoring packet target')
  text(target.room_code, 'final authoring packet room_code')
  text(target.settlement_id, 'final authoring packet settlement_id')
  if (!Number.isInteger(target.settlement_version) || Number(target.settlement_version) < 1
    || typeof target.manifest_hash !== 'string' || !/^[a-f0-9]{64}$/.test(target.manifest_hash)) {
    throw new Error('final authoring packet target is invalid')
  }
  const inputs = record(value.inputs, 'final authoring packet inputs')
  exactKeys(inputs, [
    'receipt_sha256', 'presentation_packet_sha256', 'presentation_decisions_sha256',
    'asset_packet_sha256', 'asset_decisions_sha256', 'player_identity_packet_sha256',
    'player_identity_decisions_sha256',
  ], 'final authoring packet inputs')
  for (const [key, digest] of Object.entries(inputs)) {
    if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) {
      throw new Error(`final authoring packet input ${key} is not a SHA-256 digest`)
    }
  }
  records(value.players, 'final authoring packet players').forEach((player, index) => {
    exactKeys(player, ['player_id', 'canonical_name', 'candidate_sigil_asset_ids'], `final authoring packet player ${index + 1}`)
    text(player.player_id, `final authoring packet player ${index + 1}.player_id`)
    text(player.canonical_name, `final authoring packet player ${index + 1}.canonical_name`)
    if (!Array.isArray(player.candidate_sigil_asset_ids)) throw new Error('final authoring packet player candidates must be an array')
  })
  records(value.characters, 'final authoring packet characters').forEach((character, index) => {
    exactKeys(character, [
      'character_id', 'name', 'player_id', 'candidate_portrait_asset_ids', 'settled_points',
    ], `final authoring packet character ${index + 1}`)
    text(character.character_id, `final authoring packet character ${index + 1}.character_id`)
    text(character.name, `final authoring packet character ${index + 1}.name`)
    if (character.player_id !== null) text(character.player_id, `final authoring packet character ${index + 1}.player_id`)
    if (!Array.isArray(character.candidate_portrait_asset_ids)
      || !Number.isInteger(character.settled_points)) {
      throw new Error(`final authoring packet character ${index + 1} is invalid`)
    }
  })
  if (serializeSettlementDropFinalAuthoringPacket(value as unknown as SettlementDropFinalAuthoringPacket) !== raw) {
    throw new Error('final authoring packet bytes are not canonical')
  }
  return value as unknown as SettlementDropFinalAuthoringPacket
}

export interface SettlementDropFinalAuthoringDecisionTemplate {
  decision_version: 1
  artifact: 'settlement-drop-final-authoring-decisions'
  target: SettlementDropFinalAuthoringPacket['target']
  expected_packet_sha256: string
  show: { return_path: null; note: null }
  players: Array<{
    player_id: string
    house: null
    accent: null
    portrait_asset_id: null
    note: null
  }>
  characters: Array<{
    character_id: string
    kind: null
    muster_tier: null
    portrait_asset_id: null
    quiet_drawer_rows: null
    drawer_note: null
    note: null
  }>
}

export interface SettlementDropFinalAuthoringDecisionStatus {
  required_values: number
  open_values: number
  open_items: string[]
  status: 'open' | 'complete'
}

export interface SettlementDropFinalAuthoringInput {
  receiptRaw: string
  presentationPacketRaw: string
  presentationDecisionsRaw: string
  assetPacketRaw: string
  assetDecisionsRaw: string
  playerIdentityPacketRaw: string
  playerIdentityDecisionsRaw: string
}

export interface SettlementDropFinalCompositionInput extends SettlementDropFinalAuthoringInput {
  finalAuthoringPacketRaw: string
  finalAuthoringDecisionsRaw: string
  receiptBindingPacketRaw: string
  receiptBindingDecisionsRaw: string
  quoteGroundingPacketRaw: string
  quoteGroundingDecisionsRaw: string
  quoteGroundingPlanRaw: string
  quoteAuthorizationRaw: string
  quotePublicationRaw: string
  beatlinesRaw: string
  receiptPath: string
}

const ACCENTS: SettlementDropAccent[] = ['ash', 'blue', 'gold', 'madder', 'violet']
const MUSTER_TIERS: SettlementDropMusterTier[] = ['lead', 'support', 'present', 'absent']
const CHARACTER_KINDS: CharacterKind[] = ['character', 'creature', 'organization', 'other']

function record(value: unknown, label: string): UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as UnknownRecord
}

function records(value: unknown, label: string): UnknownRecord[] {
  if (!Array.isArray(value) || value.some((row) => row === null || typeof row !== 'object' || Array.isArray(row))) {
    throw new Error(`${label} must be an array of objects`)
  }
  return value as UnknownRecord[]
}

function object(raw: string, label: string): UnknownRecord {
  try { return record(JSON.parse(raw), label) } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`${label} is not valid JSON: ${error.message}`)
    throw error
  }
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

function nullableText(value: unknown, label: string): string | null {
  if (value === null) return null
  return text(value, label)
}

function parseCurrentPacket<Packet>(
  raw: string,
  label: string,
  serialize: (packet: Packet) => string,
): Packet {
  const value = object(raw, label) as unknown as Packet
  if (serialize(value) !== raw) throw new Error(`${label} bytes are not canonical`)
  return value
}

function requireCompleteUpstream(input: SettlementDropFinalAuthoringInput): {
  receipt: SettlementReceipt
  presentation: SettlementDropPresentationStructurePacket
  presentationDecisions: UnknownRecord
  assets: SettlementDropAssetSemanticsPacket
  assetDecisions: UnknownRecord
  identity: SettlementDropPlayerIdentityPacket
  identityDecisions: UnknownRecord
} {
  const receipt = parseSettlementReceipt(input.receiptRaw)
  const presentation = parseCurrentPacket(
    input.presentationPacketRaw,
    'presentation structure packet',
    serializeSettlementDropPresentationStructurePacket,
  )
  const assets = parseCurrentPacket(
    input.assetPacketRaw,
    'asset semantics packet',
    serializeSettlementDropAssetSemanticsPacket,
  )
  const identity = parseCurrentPacket(
    input.playerIdentityPacketRaw,
    'player identity packet',
    serializeSettlementDropPlayerIdentityPacket,
  )
  const presentationDecisions = object(input.presentationDecisionsRaw, 'presentation structure decisions')
  const assetDecisions = object(input.assetDecisionsRaw, 'asset semantics decisions')
  const identityDecisions = object(input.playerIdentityDecisionsRaw, 'player identity decisions')
  const expectedHashes = [
    [presentationDecisions, sha256Hex(input.presentationPacketRaw), 'presentation_structure'],
    [assetDecisions, sha256Hex(input.assetPacketRaw), 'asset_semantics'],
    [identityDecisions, sha256Hex(input.playerIdentityPacketRaw), 'player_identity'],
  ] as const
  for (const [decisions, expected, label] of expectedHashes) {
    if (decisions.expected_packet_sha256 !== expected) {
      throw new Error(`${label} decisions do not target the exact packet bytes`)
    }
  }
  const statuses = {
    player_identity: inspectSettlementDropPlayerIdentityDecisions(
      identity as unknown as UnknownRecord,
      identityDecisions,
    ),
    asset_semantics: inspectSettlementDropAssetSemanticsDecisions(
      assets as unknown as UnknownRecord,
      assetDecisions,
    ),
    presentation_structure: inspectSettlementDropPresentationStructureDecisions(
      presentation as unknown as UnknownRecord,
      presentationDecisions,
      assets as unknown as UnknownRecord,
    ),
  }
  for (const [lane, status] of Object.entries(statuses)) {
    if (status.status !== 'complete') {
      throw new Error(`${lane} decisions are incomplete: ${status.open_items.join(', ')}`)
    }
  }
  if (presentation.target.room_code !== receipt.room_code
    || assets.target.room_code !== receipt.room_code
    || identity.target.room_code !== receipt.room_code
    || identity.target.snapshot_room_id !== receipt.room_id) {
    throw new Error('final authoring inputs do not target the exact settlement room')
  }
  return { receipt, presentation, presentationDecisions, assets, assetDecisions, identity, identityDecisions }
}

export function serializeSettlementDropFinalAuthoringPacket(
  packet: SettlementDropFinalAuthoringPacket,
): string {
  return `${JSON.stringify(packet, null, 2)}\n`
}

export function buildSettlementDropFinalAuthoringPacket(
  input: SettlementDropFinalAuthoringInput,
): SettlementDropFinalAuthoringPacket {
  const current = requireCompleteUpstream(input)
  const canonicalNameByPlayer = new Map(records(
    current.identityDecisions.decisions,
    'player identity decisions',
  ).map((row) => [text(row.player_id, 'player identity player_id'), text(row.canonical_name, 'canonical_name')]))
  const approvedAssets = new Set(records(current.assetDecisions.decisions, 'asset decisions')
    .filter((row) => row.approve_structured_assignments === true)
    .map((row) => text(row.asset_id, 'asset decision asset_id')))
  const assignments = current.assets.assets.flatMap((asset) => (
    approvedAssets.has(asset.id) ? asset.structured_assignments.map((assignment) => ({
      asset_id: asset.id,
      ...assignment,
    })) : []
  ))
  const candidateAssets = (kind: 'character' | 'player_sigil', consumers: string[]): string[] => (
    [...new Set(assignments
      .filter((assignment) => assignment.kind === kind && consumers.includes(assignment.consumer))
      .map((assignment) => assignment.asset_id))]
  )
  const identityById = new Map(current.identity.players.map((player) => [player.player_id, player]))
  const players = current.receipt.players.map((player) => {
    const identity = identityById.get(player.id)
    if (!identity) throw new Error(`player identity packet is missing receipt player ${player.id}`)
    const canonicalName = canonicalNameByPlayer.get(player.id)
    if (!canonicalName || canonicalName !== player.name) {
      throw new Error(`canonical player name for ${player.id} must match the settlement receipt`)
    }
    const consumers = [...new Set([
      canonicalName, identity.snapshot_name, identity.ceremony_name,
      ...identity.observed_names.tiers, ...identity.observed_names.personal, ...identity.observed_names.board,
    ])]
    return {
      player_id: player.id,
      canonical_name: canonicalName,
      candidate_sigil_asset_ids: candidateAssets('player_sigil', consumers),
    }
  })
  const receiptPlayerIds = new Set(current.receipt.players.map((player) => player.id))
  for (const playerId of identityById.keys()) {
    if (!receiptPlayerIds.has(playerId)) throw new Error(`player identity packet contains non-receipt player ${playerId}`)
  }
  const points = new Map<string, number>()
  for (const event of current.receipt.score_events) {
    if (event.character_id) points.set(event.character_id, (points.get(event.character_id) ?? 0) + event.points)
  }
  const characters = current.receipt.characters.map((character) => ({
    character_id: character.id,
    name: character.name,
    player_id: character.player_id ?? null,
    candidate_portrait_asset_ids: candidateAssets('character', [character.name]),
    settled_points: points.get(character.id) ?? 0,
  }))
  const packet: SettlementDropFinalAuthoringPacket = {
    packet_version: 1,
    artifact: 'settlement-drop-final-authoring-review',
    target: {
      room_code: current.receipt.room_code,
      settlement_id: current.receipt.settlement_id,
      settlement_version: current.receipt.settlement_version,
      manifest_hash: current.receipt.manifest_hash,
    },
    inputs: {
      receipt_sha256: sha256Hex(input.receiptRaw),
      presentation_packet_sha256: sha256Hex(input.presentationPacketRaw),
      presentation_decisions_sha256: sha256Hex(input.presentationDecisionsRaw),
      asset_packet_sha256: sha256Hex(input.assetPacketRaw),
      asset_decisions_sha256: sha256Hex(input.assetDecisionsRaw),
      player_identity_packet_sha256: sha256Hex(input.playerIdentityPacketRaw),
      player_identity_decisions_sha256: sha256Hex(input.playerIdentityDecisionsRaw),
    },
    players,
    characters,
  }
  return packet
}

export function serializeSettlementDropFinalAuthoringDecisionTemplate(
  packet: SettlementDropFinalAuthoringPacket,
): string {
  const template: SettlementDropFinalAuthoringDecisionTemplate = {
    decision_version: 1,
    artifact: 'settlement-drop-final-authoring-decisions',
    target: packet.target,
    expected_packet_sha256: sha256Hex(serializeSettlementDropFinalAuthoringPacket(packet)),
    show: { return_path: null, note: null },
    players: packet.players.map((player) => ({
      player_id: player.player_id, house: null, accent: null, portrait_asset_id: null, note: null,
    })),
    characters: packet.characters.map((character) => ({
      character_id: character.character_id, kind: null, muster_tier: null,
      portrait_asset_id: null, quiet_drawer_rows: null, drawer_note: null, note: null,
    })),
  }
  return `${JSON.stringify(template, null, 2)}\n`
}

export function inspectSettlementDropFinalAuthoringDecisions(
  packet: SettlementDropFinalAuthoringPacket,
  value: unknown,
): SettlementDropFinalAuthoringDecisionStatus {
  const decisions = record(value, 'final authoring decisions')
  exactKeys(decisions, [
    'decision_version', 'artifact', 'target', 'expected_packet_sha256', 'show', 'players', 'characters',
  ], 'final authoring decisions')
  if (decisions.decision_version !== 1 || decisions.artifact !== 'settlement-drop-final-authoring-decisions') {
    throw new Error('final authoring decision identity is invalid')
  }
  if (JSON.stringify(decisions.target) !== JSON.stringify(packet.target)
    || decisions.expected_packet_sha256 !== sha256Hex(serializeSettlementDropFinalAuthoringPacket(packet))) {
    throw new Error('final authoring decisions do not target the exact packet bytes')
  }
  const open: string[] = []
  let required = 0
  const requireValue = (path: string, candidate: unknown, validate: () => void): void => {
    required += 1
    if (candidate === null) open.push(path)
    else validate()
  }
  const show = record(decisions.show, 'final authoring show')
  exactKeys(show, ['return_path', 'note'], 'final authoring show')
  nullableText(show.return_path, 'final authoring return_path')
  nullableText(show.note, 'final authoring show note')
  const playerRows = records(decisions.players, 'final authoring players')
  const players = new Map(playerRows.map((row) => [text(row.player_id, 'final authoring player_id'), row]))
  if (players.size !== packet.players.length) throw new Error('final authoring player decisions do not match packet players')
  for (const player of packet.players) {
    const row = players.get(player.player_id)
    if (!row) throw new Error(`final authoring decisions are missing player ${player.player_id}`)
    exactKeys(row, ['player_id', 'house', 'accent', 'portrait_asset_id', 'note'], `final authoring player ${player.player_id}`)
    requireValue(`players[${player.player_id}].house`, row.house, () => { text(row.house, 'player house') })
    requireValue(`players[${player.player_id}].accent`, row.accent, () => {
      if (!ACCENTS.includes(row.accent as SettlementDropAccent)) throw new Error(`player ${player.player_id} accent is invalid`)
    })
    requireValue(`players[${player.player_id}].portrait_asset_id`, row.portrait_asset_id, () => {
      if (!player.candidate_sigil_asset_ids.includes(text(row.portrait_asset_id, 'player portrait asset'))) {
        throw new Error(`player ${player.player_id} portrait is not an approved assigned asset`)
      }
    })
    nullableText(row.note, `player ${player.player_id} note`)
  }
  const characterRows = records(decisions.characters, 'final authoring characters')
  const characters = new Map(characterRows.map((row) => [text(row.character_id, 'final authoring character_id'), row]))
  if (characters.size !== packet.characters.length) throw new Error('final authoring character decisions do not match packet characters')
  for (const character of packet.characters) {
    const row = characters.get(character.character_id)
    if (!row) throw new Error(`final authoring decisions are missing character ${character.character_id}`)
    exactKeys(row, [
      'character_id', 'kind', 'muster_tier', 'portrait_asset_id',
      'quiet_drawer_rows', 'drawer_note', 'note',
    ], `final authoring character ${character.character_id}`)
    requireValue(`characters[${character.character_id}].kind`, row.kind, () => {
      if (!CHARACTER_KINDS.includes(row.kind as CharacterKind)) throw new Error(`character ${character.character_id} kind is invalid`)
    })
    requireValue(`characters[${character.character_id}].muster_tier`, row.muster_tier, () => {
      if (!MUSTER_TIERS.includes(row.muster_tier as SettlementDropMusterTier)) throw new Error(`character ${character.character_id} muster_tier is invalid`)
    })
    requireValue(`characters[${character.character_id}].portrait_asset_id`, row.portrait_asset_id, () => {
      if (!character.candidate_portrait_asset_ids.includes(text(row.portrait_asset_id, 'character portrait asset'))) {
        throw new Error(`character ${character.character_id} portrait is not an approved assigned asset`)
      }
    })
    requireValue(`characters[${character.character_id}].quiet_drawer_rows`, row.quiet_drawer_rows, () => {
      const quietRows = records(row.quiet_drawer_rows, `character ${character.character_id} quiet_drawer_rows`)
      quietRows.forEach((quiet, index) => {
        exactKeys(quiet, ['label', 'points'], `character ${character.character_id} quiet row ${index + 1}`)
        text(quiet.label, `character ${character.character_id} quiet row ${index + 1}.label`)
        if (!Number.isInteger(quiet.points) || quiet.points === 0) {
          throw new Error(`character ${character.character_id} quiet row ${index + 1}.points must be non-zero`)
        }
      })
    })
    nullableText(row.drawer_note, `character ${character.character_id} drawer_note`)
    nullableText(row.note, `character ${character.character_id} note`)
  }
  return { required_values: required, open_values: open.length, open_items: open, status: open.length ? 'open' : 'complete' }
}

export function composeSettlementDropFinalManifest(
  input: SettlementDropFinalCompositionInput,
): { manifest: SettlementDropManifest; compiled: CompiledSettlementDrop; manifestRaw: string } {
  const current = requireCompleteUpstream(input)
  const suppliedFinalPacket = parseSettlementDropFinalAuthoringPacket(input.finalAuthoringPacketRaw)
  const expectedPacket = buildSettlementDropFinalAuthoringPacket(input)
  if (serializeSettlementDropFinalAuthoringPacket(expectedPacket)
    !== serializeSettlementDropFinalAuthoringPacket(suppliedFinalPacket)) {
    throw new Error('final authoring packet does not match the exact current upstream artifacts')
  }
  const decisions = object(input.finalAuthoringDecisionsRaw, 'final authoring decisions')
  const finalStatus = inspectSettlementDropFinalAuthoringDecisions(expectedPacket, decisions)
  if (finalStatus.status !== 'complete') {
    throw new Error(`final authoring decisions are incomplete: ${finalStatus.open_items.join(', ')}`)
  }

  const suppliedBindingValue = object(input.receiptBindingPacketRaw, 'receipt binding packet')
  const suppliedBindingInputs = record(suppliedBindingValue.inputs, 'receipt binding packet inputs')
  const bindingInputName = (key: string): string => {
    const seal = record(suppliedBindingInputs[key], `receipt binding packet input ${key}`)
    return text(seal.name, `receipt binding packet input ${key}.name`)
  }
  const artifact = (name: string, raw: string) => ({
    raw,
    seal: { name, bytes: new TextEncoder().encode(raw).byteLength, sha256: sha256Hex(raw) },
  })
  const receiptArtifact = artifact(bindingInputName('receipt'), input.receiptRaw)
  const presentationArtifact = artifact(bindingInputName('presentation_structure'), input.presentationPacketRaw)
  const presentationDecisionsArtifact = artifact(bindingInputName('presentation_decisions'), input.presentationDecisionsRaw)
  const assetArtifact = artifact(bindingInputName('asset_semantics'), input.assetPacketRaw)
  const beatlinesArtifact = artifact(bindingInputName('beatlines'), input.beatlinesRaw)
  const rebuiltBinding = buildSettlementDropReceiptBindingPacket({
    receipt: receiptArtifact,
    presentationPacket: presentationArtifact,
    presentationDecisions: presentationDecisionsArtifact,
    assetPacket: assetArtifact,
    beatlines: beatlinesArtifact,
  })
  if (serializeSettlementDropReceiptBindingPacket(rebuiltBinding) !== input.receiptBindingPacketRaw) {
    throw new Error('receipt binding packet does not match the exact current settlement and presentation sources')
  }
  const suppliedBinding = rebuiltBinding
  const bindingDecisions = object(input.receiptBindingDecisionsRaw, 'receipt binding decisions')
  const bindingStatus = inspectSettlementDropReceiptBindingDecisions(suppliedBinding, bindingDecisions)
  if (bindingStatus.status !== 'complete') {
    throw new Error(`receipt binding decisions are incomplete: ${bindingStatus.open_items.join(', ')}`)
  }
  assertSettlementDropQuoteGroundingPlanCurrent(
    input.quoteGroundingPlanRaw,
    input.quoteGroundingPacketRaw,
    input.quoteGroundingDecisionsRaw,
  )
  const quotePacket = parseSettlementDropQuoteGroundingPacket(input.quoteGroundingPacketRaw)
  const currentQuoteInputs = {
    receipt: input.receiptRaw,
    beatlines: input.beatlinesRaw,
    presentation_structure: input.presentationPacketRaw,
    presentation_decisions: input.presentationDecisionsRaw,
    asset_semantics: input.assetPacketRaw,
    asset_decisions: input.assetDecisionsRaw,
    receipt_binding: input.receiptBindingPacketRaw,
    receipt_binding_decisions: input.receiptBindingDecisionsRaw,
  }
  for (const [key, raw] of Object.entries(currentQuoteInputs)) {
    const sealed = quotePacket.inputs[key as keyof typeof currentQuoteInputs]
    if (sealed.bytes !== new TextEncoder().encode(raw).byteLength || sealed.sha256 !== sha256Hex(raw)) {
      throw new Error(`quote grounding packet ${key} seal does not match the composed artifact`)
    }
  }
  const quoteBindingBeatByTarget = new Map(records(bindingDecisions.bindings, 'receipt binding decisions.bindings')
    .map((row) => [`${String(row.target_kind)}:${String(row.target_id)}`, text(row.beat_id, 'receipt binding beat_id')]))
  const expectedQuoteCharacters = current.receipt.characters.map((character) => ({
    id: character.id,
    name: character.name,
  }))
  const expectedSettlementRecords = [
    ...current.receipt.score_events.map((event) => ({
      record_key: `score_event:${event.id}`,
      id: event.id,
      kind: 'score_event' as const,
      label: event.label,
      beat_id: quoteBindingBeatByTarget.get(`score_event:${event.id}`),
    })),
    ...(current.receipt.settled_facts ?? []).filter((fact) => (
      fact.outcome === 'resolved' && fact.board_status === 'unscored'
    )).map((fact) => ({
      record_key: `settled_fact:${fact.id}`,
      id: fact.id,
      kind: 'settled_fact' as const,
      label: fact.title,
      beat_id: quoteBindingBeatByTarget.get(`unscored_fact:${fact.id}`),
    })),
  ].sort((left, right) => left.kind.localeCompare(right.kind) || left.id.localeCompare(right.id))
  const quoteAssetDecisions = new Map(records(current.assetDecisions.decisions, 'asset decisions')
    .map((row) => [text(row.asset_id, 'asset decision asset_id'), row]))
  const expectedPunditAssets = current.assets.assets.flatMap((asset) => {
    const decision = quoteAssetDecisions.get(asset.id)
    if (decision?.approve_structured_assignments !== true) return []
    const speakers = [...new Set(asset.structured_assignments
      .filter((assignment) => assignment.kind === 'pundit')
      .map((assignment) => assignment.consumer))]
    return speakers.map((speaker) => ({
      asset_id: asset.id,
      speaker,
      approved_alt_text: text(decision.approved_alt_text, `asset ${asset.id} approved alt text`),
    }))
  }).sort((left, right) => left.speaker.localeCompare(right.speaker) || left.asset_id.localeCompare(right.asset_id))
  if (JSON.stringify(quotePacket.receipt_characters) !== JSON.stringify(expectedQuoteCharacters)
    || JSON.stringify(quotePacket.settlement_records) !== JSON.stringify(expectedSettlementRecords)
    || JSON.stringify(quotePacket.pundit_assets) !== JSON.stringify(expectedPunditAssets)) {
    throw new Error('quote grounding packet canonical records do not match the receipt, binding, and asset decisions')
  }
  const publication = parseSettlementDropQuotePublication(
    input.quoteGroundingPlanRaw,
    input.quoteAuthorizationRaw,
    input.quotePublicationRaw,
  )
  if (JSON.stringify(publication.target) !== JSON.stringify(expectedPacket.target)) {
    throw new Error('quote publication does not target the final authoring settlement')
  }

  const assetDecisions = new Map(records(current.assetDecisions.decisions, 'asset decisions')
    .map((row) => [text(row.asset_id, 'asset decision asset_id'), row]))
  const assets = Object.fromEntries(current.assets.assets.map((asset) => {
    const decision = assetDecisions.get(asset.id)
    if (!decision) throw new Error(`asset decisions are missing ${asset.id}`)
    return [asset.id, { path: asset.path, alt: text(decision.approved_alt_text, `asset ${asset.id} alt text`) }]
  }))
  const finalPlayers = new Map(records(decisions.players, 'final authoring players')
    .map((row) => [text(row.player_id, 'final player_id'), row]))
  const players = current.receipt.players.map((player) => {
    const row = finalPlayers.get(player.id) as UnknownRecord
    return {
      id: player.id,
      name: player.name,
      house: text(row.house, `player ${player.id} house`),
      accent: row.accent as SettlementDropAccent,
      portrait_asset: text(row.portrait_asset_id, `player ${player.id} portrait`),
    }
  })
  const finalCharacters = new Map(records(decisions.characters, 'final authoring characters')
    .map((row) => [text(row.character_id, 'final character_id'), row]))
  const characterEvents = new Map<string, string[]>()
  for (const event of current.receipt.score_events) {
    if (!event.character_id) continue
    characterEvents.set(event.character_id, [...(characterEvents.get(event.character_id) ?? []), event.id])
  }
  const characters = current.receipt.characters.map((character) => {
    const row = finalCharacters.get(character.id) as UnknownRecord
    const quietRows = records(row.quiet_drawer_rows, `character ${character.id} quiet drawer rows`)
    return {
      id: character.id,
      name: character.name,
      kind: row.kind as CharacterKind,
      ...(character.player_id ? { player_id: character.player_id } : {}),
      portrait_asset: text(row.portrait_asset_id, `character ${character.id} portrait`),
      muster_tier: row.muster_tier as SettlementDropMusterTier,
      drawer: {
        ...(row.drawer_note === null ? {} : { note: text(row.drawer_note, `character ${character.id} drawer note`) }),
        beats: [
          ...(characterEvents.get(character.id) ?? []).map((evidence_id) => ({ evidence_id })),
          ...quietRows.map((quiet) => ({
            label: text(quiet.label, `character ${character.id} quiet drawer label`),
            points: Number(quiet.points),
            fired: false as const,
          })),
        ],
      },
    }
  })
  const bindingBeatByTarget = new Map(records(bindingDecisions.bindings, 'receipt binding decisions.bindings')
    .map((row) => [`${String(row.target_kind)}:${String(row.target_id)}`, text(row.beat_id, 'receipt binding beat_id')]))
  const ledgerByBeat = new Map<string, Array<{ evidence_id: string } | { kind: 'no_card'; fact_id: string }>>()
  for (const event of current.receipt.score_events) {
    const beatId = bindingBeatByTarget.get(`score_event:${event.id}`)
    if (!beatId) throw new Error(`receipt binding is missing score event ${event.id}`)
    ledgerByBeat.set(beatId, [...(ledgerByBeat.get(beatId) ?? []), { evidence_id: event.id }])
  }
  for (const fact of current.receipt.settled_facts ?? []) {
    if (fact.outcome !== 'resolved' || fact.board_status !== 'unscored') continue
    const beatId = bindingBeatByTarget.get(`unscored_fact:${fact.id}`)
    if (!beatId) throw new Error(`receipt binding is missing unscored fact ${fact.id}`)
    ledgerByBeat.set(beatId, [...(ledgerByBeat.get(beatId) ?? []), { kind: 'no_card', fact_id: fact.id }])
  }
  const quotesByBeat = new Map<string, typeof publication.quotes>()
  for (const quote of publication.quotes) {
    quotesByBeat.set(quote.beat_id, [...(quotesByBeat.get(quote.beat_id) ?? []), quote])
  }
  const presentationBeats = new Map(records(current.presentationDecisions.beats, 'presentation decisions beats')
    .filter((row) => row.include === true)
    .map((row) => [String(row.slide_index), row]))
  const acts = records(current.presentationDecisions.acts, 'presentation decisions acts')
    .filter((row) => row.include === true)
    .map((act) => {
      const ordinal = String(act.observed_act_ordinal)
      const packetAct = current.presentation.acts.find((candidate) => String(candidate.observed_act_ordinal) === ordinal)
      if (!packetAct) throw new Error(`presentation packet is missing included act ${ordinal}`)
      const beats = packetAct.beat_slide_indices.flatMap((slideIndex) => {
        const beat = presentationBeats.get(String(slideIndex))
        if (!beat) return []
        const beatId = text(beat.id, `presentation beat ${slideIndex} id`)
        return [{
          id: beatId,
          kicker: text(beat.kicker, `presentation beat ${beatId} kicker`),
          title: text(beat.title, `presentation beat ${beatId} title`),
          summary: text(beat.summary, `presentation beat ${beatId} summary`),
          weight: beat.weight as 'ordinary' | 'death' | 'betrayal',
          ...(beat.portrait_asset === null ? {} : { portrait_asset: text(beat.portrait_asset, `beat ${beatId} portrait`) }),
          ledger: ledgerByBeat.get(beatId) ?? [],
          quotes: (quotesByBeat.get(beatId) ?? []).map((quote) => structuredClone(quote.manifest_quote)),
        }]
      })
      return {
        id: text(act.id, `presentation act ${ordinal} id`),
        title: text(act.title, `presentation act ${ordinal} title`),
        subtitle: text(act.subtitle, `presentation act ${ordinal} subtitle`),
        scene: act.scene as 'title' | 'keep' | 'hall' | 'field' | 'table',
        interstitial: { portrait_asset: text(act.interstitial_portrait_asset, `presentation act ${ordinal} interstitial portrait`) },
        beats,
      }
    })
  const knownBeats = new Set(acts.flatMap((act) => act.beats.map((beat) => beat.id)))
  const unknownLedgerBeat = [...ledgerByBeat.keys()].find((beatId) => !knownBeats.has(beatId))
  if (unknownLedgerBeat) throw new Error(`receipt binding references uncomposed beat ${unknownLedgerBeat}`)
  const unknownQuoteBeat = [...quotesByBeat.keys()].find((beatId) => !knownBeats.has(beatId))
  if (unknownQuoteBeat) throw new Error(`quote publication references uncomposed beat ${unknownQuoteBeat}`)
  const show = record(current.presentationDecisions.show, 'presentation decisions show')
  const finalShow = record(decisions.show, 'final authoring show')
  const receiptPath = text(input.receiptPath, 'receipt path')
  const manifest: SettlementDropManifest = {
    version: 1,
    settlement_receipt: { path: receiptPath, sha256: sha256Hex(input.receiptRaw) },
    show: {
      title: text(show.title, 'show title'),
      subtitle: text(show.subtitle, 'show subtitle'),
      closing_title: text(show.closing_title, 'show closing_title'),
      ...(finalShow.return_path === null ? {} : { return_path: text(finalShow.return_path, 'show return_path') }),
    },
    assets,
    players,
    characters,
    opening: {
      eyebrow: text(show.opening_eyebrow, 'show opening_eyebrow'),
      muster_title: text(show.muster_title, 'show muster_title'),
      begins_label: text(show.begins_label, 'show begins_label'),
    },
    acts,
  }
  const manifestRaw = `${JSON.stringify(manifest, null, 2)}\n`
  const compiled = parseSettlementDropManifest(manifestRaw, current.receipt, sha256Hex(input.receiptRaw))
  return { manifest, compiled, manifestRaw }
}
