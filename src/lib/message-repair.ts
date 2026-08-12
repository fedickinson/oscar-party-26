import { containsDisallowedEmoji } from './generated-prose'
import {
  canonicalizeJson,
  type OperatorSnapshotPayload,
} from './operator-snapshot'
import { sha256Hex } from './sha256'

export type MessageRepairAction = 'replace_text' | 'delete_extra'

export interface MessageRepairRow {
  id: string
  room_id: string
  player_id: string
  text: string
  created_at: string
}

export interface MessageRepairPlan {
  version: 1
  artifact: 'operator-message-repair-plan'
  snapshot_manifest_sha256: string
  repair_key: string
  action: MessageRepairAction
  room: {
    id: string
    code: string
    show_pack_id: string
  }
  message_id: string
  expected_row: MessageRepairRow
  desired_row: MessageRepairRow | null
  public_correction: string
}

export type MessageRepairPreflight =
  | { status: 'actionable'; plan: MessageRepairPlan }
  | {
    status: 'unchanged' | 'restore_missing'
    room_id: string
    room_code: string
    message_id: string
  }

interface BuildMessageRepairInput {
  snapshot: OperatorSnapshotPayload
  current: OperatorSnapshotPayload
  roomCode: string
  messageId: string
  snapshotManifestSha256: string
  note: string
}

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const SHA256 = /^[a-f0-9]{64}$/
const MESSAGE_KEYS = ['id', 'room_id', 'player_id', 'text', 'created_at'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const allowed = new Set(keys)
  const unknown = Object.keys(value).find((key) => !allowed.has(key))
  if (unknown) throw new Error(`${label} has unknown field ${unknown}`)
  const missing = keys.find((key) => !(key in value))
  if (missing) throw new Error(`${label} is missing field ${missing}`)
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} is required`)
  return value
}

function parseUuid(value: unknown, label: string): string {
  const parsed = requiredString(value, label)
  if (!UUID.test(parsed)) throw new Error(`${label} must be a UUID`)
  return parsed.toLowerCase()
}

function parseMessageRow(value: unknown, label: string): MessageRepairRow {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  assertExactKeys(value, MESSAGE_KEYS, label)
  const row = {
    id: parseUuid(value.id, `${label}.id`),
    room_id: parseUuid(value.room_id, `${label}.room_id`),
    player_id: requiredString(value.player_id, `${label}.player_id`),
    text: requiredString(value.text, `${label}.text`),
    created_at: requiredString(value.created_at, `${label}.created_at`),
  }
  if (Number.isNaN(Date.parse(row.created_at))) {
    throw new Error(`${label}.created_at must be a timestamp`)
  }
  return row
}

function rowsEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(canonicalizeJson(left)) === JSON.stringify(canonicalizeJson(right))
}

function withoutText(row: MessageRepairRow): Omit<MessageRepairRow, 'text'> {
  const { text: _text, ...identity } = row
  return identity
}

function oneByField(
  rows: Array<Record<string, unknown>>,
  field: string,
  expected: string,
  label: string,
): Record<string, unknown> | undefined {
  const matches = rows.filter((row) => row[field] === expected)
  if (matches.length > 1) throw new Error(`${label} is duplicated`)
  return matches[0]
}

function findRoom(rows: OperatorSnapshotPayload, code: string, label: string): Record<string, unknown> {
  const room = oneByField(rows.rooms, 'code', code, `${label} room ${code}`)
  if (!room) throw new Error(`${label} room ${code} is missing`)
  return room
}

function validateNote(value: string): string {
  const note = value.trim()
  if (!note) throw new Error('operator note is required')
  if (note.length > 240) throw new Error('operator note must be 240 characters or fewer')
  if (/\p{Cc}/u.test(note)) throw new Error('operator note must be one printable line')
  if (containsDisallowedEmoji(note)) throw new Error('operator note must not contain emoji')
  return note
}

function planCore(plan: Omit<MessageRepairPlan, 'repair_key'>): Omit<MessageRepairPlan, 'repair_key'> {
  return plan
}

function repairKey(core: Omit<MessageRepairPlan, 'repair_key'>): string {
  return sha256Hex(JSON.stringify(canonicalizeJson(core)))
}

function serializeUnchecked(plan: MessageRepairPlan): string {
  return `${JSON.stringify(plan, null, 2)}\n`
}

export function buildMessageRepairPreflight(input: BuildMessageRepairInput): MessageRepairPreflight {
  const roomCode = input.roomCode.trim().toUpperCase()
  if (!/^[A-Z0-9]{4,12}$/.test(roomCode)) {
    throw new Error('room code must be 4 to 12 uppercase letters or numbers')
  }
  const messageId = parseUuid(input.messageId, 'message id')
  if (!SHA256.test(input.snapshotManifestSha256)) {
    throw new Error('snapshot manifest SHA-256 must be a lowercase digest')
  }
  const note = validateNote(input.note)
  const snapshotRoom = findRoom(input.snapshot, roomCode, 'sealed snapshot')
  const currentRoom = findRoom(input.current, roomCode, 'current')
  const roomId = parseUuid(snapshotRoom.id, 'sealed room id')
  const showPackId = parseUuid(snapshotRoom.show_pack_id, 'sealed room show_pack_id')
  if (parseUuid(currentRoom.id, 'current room id') !== roomId
      || parseUuid(currentRoom.show_pack_id, 'current room show_pack_id') !== showPackId) {
    throw new Error(`current room ${roomCode} does not match the sealed room identity`)
  }
  if (currentRoom.phase === 'closed') throw new Error('closed room chat cannot be repaired')

  const snapshotRaw = oneByField(input.snapshot.messages, 'id', messageId, 'sealed target message')
  const currentRaw = oneByField(input.current.messages, 'id', messageId, 'current target message')
  const snapshotMessage = snapshotRaw ? parseMessageRow(snapshotRaw, 'sealed target message') : null
  const currentMessage = currentRaw ? parseMessageRow(currentRaw, 'current target message') : null
  for (const row of [snapshotMessage, currentMessage]) {
    if (row && row.room_id !== roomId) throw new Error('target message does not belong to the requested room')
  }

  if (!snapshotMessage && !currentMessage) throw new Error('target message is absent from both records')
  if (snapshotMessage && !currentMessage) {
    return { status: 'restore_missing', room_id: roomId, room_code: roomCode, message_id: messageId }
  }
  if (!currentMessage) throw new Error('current target message is required')
  if (snapshotMessage && rowsEqual(snapshotMessage, currentMessage)) {
    return { status: 'unchanged', room_id: roomId, room_code: roomCode, message_id: messageId }
  }

  const currentPlayer = oneByField(input.current.players, 'id', currentMessage.player_id, 'current target player')
  if (!currentPlayer || currentPlayer.room_id !== roomId) {
    throw new Error('target message is not authored by a current room player')
  }

  let action: MessageRepairAction
  let desiredRow: MessageRepairRow | null
  let publicCorrection: string
  if (snapshotMessage) {
    if (!rowsEqual(withoutText(snapshotMessage), withoutText(currentMessage))) {
      throw new Error('target message differs beyond its text')
    }
    action = 'replace_text'
    desiredRow = snapshotMessage
    publicCorrection = `Operator correction: a player chat message was restored to the sealed record. ${note}`
  } else {
    action = 'delete_extra'
    desiredRow = null
    publicCorrection = `Operator correction: an extra player chat message was removed. ${note}`
  }

  const core = planCore({
    version: 1,
    artifact: 'operator-message-repair-plan',
    snapshot_manifest_sha256: input.snapshotManifestSha256,
    action,
    room: { id: roomId, code: roomCode, show_pack_id: showPackId },
    message_id: messageId,
    expected_row: currentMessage,
    desired_row: desiredRow,
    public_correction: publicCorrection,
  })
  return { status: 'actionable', plan: { ...core, repair_key: repairKey(core) } }
}

export function parseMessageRepairPlan(raw: string): MessageRepairPlan {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('approved message repair plan must be JSON')
  }
  if (!isRecord(value)) throw new Error('message repair plan must be an object')
  assertExactKeys(value, [
    'version', 'artifact', 'snapshot_manifest_sha256', 'repair_key', 'action', 'room',
    'message_id', 'expected_row', 'desired_row', 'public_correction',
  ], 'message repair plan')
  if (value.version !== 1 || value.artifact !== 'operator-message-repair-plan') {
    throw new Error('message repair plan identity is invalid')
  }
  if (!SHA256.test(String(value.snapshot_manifest_sha256))) {
    throw new Error('message repair plan snapshot digest is invalid')
  }
  if (!SHA256.test(String(value.repair_key))) throw new Error('message repair plan repair_key is invalid')
  if (value.action !== 'replace_text' && value.action !== 'delete_extra') {
    throw new Error('message repair plan action is invalid')
  }
  if (!isRecord(value.room)) throw new Error('message repair plan room must be an object')
  assertExactKeys(value.room, ['id', 'code', 'show_pack_id'], 'message repair plan room')
  const room = {
    id: parseUuid(value.room.id, 'message repair plan room.id'),
    code: requiredString(value.room.code, 'message repair plan room.code'),
    show_pack_id: parseUuid(value.room.show_pack_id, 'message repair plan room.show_pack_id'),
  }
  if (!/^[A-Z0-9]{4,12}$/.test(room.code)) throw new Error('message repair plan room.code is invalid')
  const messageId = parseUuid(value.message_id, 'message repair plan message_id')
  const expectedRow = parseMessageRow(value.expected_row, 'message repair plan expected_row')
  const desiredRow = value.desired_row === null
    ? null
    : parseMessageRow(value.desired_row, 'message repair plan desired_row')
  if (expectedRow.id !== messageId || expectedRow.room_id !== room.id) {
    throw new Error('message repair plan expected row identity is invalid')
  }
  if (value.action === 'replace_text') {
    if (!desiredRow || desiredRow.id !== messageId || desiredRow.room_id !== room.id) {
      throw new Error('replacement plan requires the same desired row identity')
    }
    if (!rowsEqual(withoutText(expectedRow), withoutText(desiredRow))
        || expectedRow.text === desiredRow.text) {
      throw new Error('replacement plan may change only message text')
    }
  } else if (desiredRow !== null) {
    throw new Error('deletion plan desired_row must be null')
  }
  const publicCorrection = requiredString(value.public_correction, 'message repair plan public_correction')
  const prefix = value.action === 'replace_text'
    ? 'Operator correction: a player chat message was restored to the sealed record. '
    : 'Operator correction: an extra player chat message was removed. '
  if (!publicCorrection.startsWith(prefix)
      || publicCorrection.length <= prefix.length
      || publicCorrection.length > prefix.length + 240
      || /\p{Cc}/u.test(publicCorrection)
      || containsDisallowedEmoji(publicCorrection)) {
    throw new Error('message repair plan public correction is invalid')
  }
  const core = planCore({
    version: 1,
    artifact: 'operator-message-repair-plan',
    snapshot_manifest_sha256: value.snapshot_manifest_sha256 as string,
    action: value.action,
    room,
    message_id: messageId,
    expected_row: expectedRow,
    desired_row: desiredRow,
    public_correction: publicCorrection,
  })
  const plan: MessageRepairPlan = { ...core, repair_key: value.repair_key as string }
  if (repairKey(core) !== plan.repair_key) {
    throw new Error('message repair plan repair_key does not match its contents')
  }
  if (raw !== serializeUnchecked(plan)) {
    throw new Error('approved message repair plan is not in canonical form')
  }
  return plan
}

export function serializeMessageRepairPlan(plan: MessageRepairPlan): string {
  return serializeUnchecked(parseMessageRepairPlan(serializeUnchecked(plan)))
}

export function assertMessageRepairPlanMatchesSnapshot(
  plan: MessageRepairPlan,
  snapshot: OperatorSnapshotPayload,
): void {
  const room = findRoom(snapshot, plan.room.code, 'sealed snapshot')
  if (parseUuid(room.id, 'sealed room id') !== plan.room.id
      || parseUuid(room.show_pack_id, 'sealed room show_pack_id') !== plan.room.show_pack_id) {
    throw new Error('approved message repair plan does not match the sealed room identity')
  }
  const target = oneByField(snapshot.messages, 'id', plan.message_id, 'sealed target message')
  if (plan.action === 'replace_text') {
    if (!target || !plan.desired_row || !rowsEqual(parseMessageRow(target, 'sealed target message'), plan.desired_row)) {
      throw new Error('replacement plan desired row does not match the sealed snapshot')
    }
  } else if (target) {
    throw new Error('deletion target is present in the sealed snapshot')
  }
  const player = oneByField(snapshot.players, 'id', plan.expected_row.player_id, 'sealed target player')
  if (!player || player.room_id !== plan.room.id) {
    throw new Error('approved repair target is not a player in the sealed room')
  }
}

export function classifyApprovedMessageRepairCurrent(
  plan: MessageRepairPlan,
  current: OperatorSnapshotPayload,
): 'pending' | 'replay_candidate' {
  const room = findRoom(current, plan.room.code, 'current')
  if (parseUuid(room.id, 'current room id') !== plan.room.id
      || parseUuid(room.show_pack_id, 'current room show_pack_id') !== plan.room.show_pack_id) {
    throw new Error('approved message repair plan does not match the current room identity')
  }
  if (room.phase === 'closed') throw new Error('closed room chat cannot be repaired')
  const target = oneByField(current.messages, 'id', plan.message_id, 'current target message')
  if (target) {
    const row = parseMessageRow(target, 'current target message')
    if (rowsEqual(row, plan.expected_row)) return 'pending'
    if (plan.desired_row && rowsEqual(row, plan.desired_row)) return 'replay_candidate'
  } else if (plan.action === 'delete_extra') {
    return 'replay_candidate'
  }
  throw new Error('current target message matches neither the approved expectation nor result')
}
