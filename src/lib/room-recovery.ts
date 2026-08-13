import type {
  OperatorSnapshotPayload,
  OperatorSnapshotTableName,
} from './operator-snapshot'
import { canonicalizeJson } from './operator-snapshot'

export type OperatorSnapshotRows = OperatorSnapshotPayload

export const ROOM_RECOVERY_INSERT_ORDER = [
  'players',
  'categories',
  'category_nominees',
  'witness_proposals',
  'witness_supporting_observations',
  'draft_picks',
  'beat_activations',
  'conviction_picks',
  'confidence_picks',
  'bingo_cards',
  'bingo_marks',
  'messages',
  'room_winners',
  'player_verdicts',
  'room_settlements',
  'room_settlement_entries',
  'room_settlement_bingo_marks',
] as const satisfies readonly OperatorSnapshotTableName[]

export type RoomRecoveryTableName = typeof ROOM_RECOVERY_INSERT_ORDER[number]

export interface RoomRecoveryTablePlan {
  name: RoomRecoveryTableName
  missing: Array<Record<string, unknown>>
  unchanged: number
}

export interface RoomRecoveryPlan {
  room_id: string
  room_code: string
  room_drift_fields: string[]
  tables: RoomRecoveryTablePlan[]
  conflicts: string[]
}

function rowsEqual(left: Record<string, unknown>, right: Record<string, unknown>): boolean {
  return JSON.stringify(canonicalizeJson(left)) === JSON.stringify(canonicalizeJson(right))
}

function recoveryRowsEqual(
  table: OperatorSnapshotTableName,
  sealed: Record<string, unknown>,
  current: Record<string, unknown>,
): boolean {
  if (table !== 'witness_proposals') return rowsEqual(sealed, current)
  const normalizedSealed = 'reviewed_entity_id' in sealed
    ? sealed
    : { ...sealed, reviewed_entity_id: null }
  const normalizedCurrent = 'reviewed_entity_id' in current
    ? current
    : { ...current, reviewed_entity_id: null }
  return rowsEqual(normalizedSealed, normalizedCurrent)
}

function requiredString(row: Record<string, unknown>, field: string, label: string): string {
  const value = row[field]
  if (typeof value !== 'string' || !value) throw new Error(`${label} ${field} is required`)
  return value
}

function rowKey(table: OperatorSnapshotTableName, row: Record<string, unknown>): string {
  const required = (field: string) => {
    const value = row[field]
    if ((typeof value !== 'string' && typeof value !== 'number') || value === '') {
      throw new Error(`${table} recovery row ${field} is required`)
    }
    return String(value)
  }
  switch (table) {
    case 'category_nominees': return `${required('category_id')}:${required('nominee_id')}`
    case 'room_winners': return `${required('room_id')}:${required('category_id')}`
    case 'beat_activations': return `${required('room_id')}:${required('beat_id')}`
    case 'conviction_picks': return `${required('room_id')}:${required('player_id')}:${required('beat_id')}`
    case 'player_verdicts': return `${required('room_id')}:${required('player_id')}`
    case 'room_settlement_bingo_marks':
      return `${required('settlement_id')}:${required('card_id')}:${required('square_index')}`
    case 'operator_heartbeats': return `${required('room_id')}:${required('engine')}`
    default: return required('id')
  }
}

function roomRows(
  rows: OperatorSnapshotRows,
  roomId: string,
): Record<RoomRecoveryTableName, Array<Record<string, unknown>>> {
  const direct = (table: RoomRecoveryTableName) => rows[table].filter((row) => row.room_id === roomId)
  const categories = direct('categories')
  const categoryIds = new Set(categories.map((row) => row.id))
  const bingoCards = direct('bingo_cards')
  const cardIds = new Set(bingoCards.map((row) => row.id))
  const settlements = direct('room_settlements')
  const settlementIds = new Set(settlements.map((row) => row.id))

  return {
    players: direct('players'),
    categories,
    category_nominees: rows.category_nominees.filter((row) => categoryIds.has(row.category_id)),
    witness_proposals: direct('witness_proposals'),
    witness_supporting_observations: direct('witness_supporting_observations'),
    draft_picks: direct('draft_picks'),
    beat_activations: direct('beat_activations'),
    conviction_picks: direct('conviction_picks'),
    confidence_picks: direct('confidence_picks'),
    bingo_cards: bingoCards,
    bingo_marks: rows.bingo_marks.filter((row) => cardIds.has(row.card_id)),
    messages: direct('messages'),
    room_winners: direct('room_winners'),
    player_verdicts: direct('player_verdicts'),
    room_settlements: settlements,
    room_settlement_entries: rows.room_settlement_entries.filter(
      (row) => settlementIds.has(row.settlement_id),
    ),
    room_settlement_bingo_marks: rows.room_settlement_bingo_marks.filter(
      (row) => settlementIds.has(row.settlement_id),
    ),
  }
}

function findRoom(rows: OperatorSnapshotRows, code: string, label: string): Record<string, unknown> {
  const matches = rows.rooms.filter((row) => row.code === code)
  if (matches.length !== 1) {
    throw new Error(`${label} room ${code} ${matches.length === 0 ? 'is missing' : 'is duplicated'}`)
  }
  return matches[0]
}

function addRequirement(
  requirements: Map<OperatorSnapshotTableName, Set<string>>,
  table: OperatorSnapshotTableName,
  value: unknown,
): void {
  if ((typeof value !== 'string' && typeof value !== 'number') || value === '') return
  const keys = requirements.get(table) ?? new Set<string>()
  keys.add(String(value))
  requirements.set(table, keys)
}

function catalogConflicts(
  snapshot: OperatorSnapshotRows,
  current: OperatorSnapshotRows,
  selected: Record<RoomRecoveryTableName, Array<Record<string, unknown>>>,
  room: Record<string, unknown>,
): string[] {
  const requirements = new Map<OperatorSnapshotTableName, Set<string>>()
  addRequirement(requirements, 'show_packs', room.show_pack_id)

  const declarationIds = new Set(selected.categories.map((row) => row.id))
  for (const row of selected.categories) addRequirement(requirements, 'signature_beats', row.source_signature_beat_id)
  for (const row of selected.witness_proposals) {
    addRequirement(requirements, 'signature_beats', row.source_signature_beat_id)
    addRequirement(requirements, 'draft_entities', row.entity_id)
  }
  for (const row of selected.witness_supporting_observations) {
    addRequirement(requirements, 'draft_entities', row.entity_id)
  }
  for (const row of selected.draft_picks) addRequirement(requirements, 'draft_entities', row.entity_id)
  for (const row of selected.beat_activations) addRequirement(requirements, 'signature_beats', row.beat_id)
  for (const row of selected.conviction_picks) addRequirement(requirements, 'signature_beats', row.beat_id)
  for (const row of selected.confidence_picks) {
    if (!declarationIds.has(row.category_id)) addRequirement(requirements, 'categories', row.category_id)
    addRequirement(requirements, 'nominees', row.nominee_id)
  }
  for (const row of selected.room_winners) {
    if (!declarationIds.has(row.category_id)) addRequirement(requirements, 'categories', row.category_id)
    addRequirement(requirements, 'nominees', row.winner_id)
    addRequirement(requirements, 'nominees', row.tie_winner_id)
  }
  for (const row of selected.category_nominees) addRequirement(requirements, 'nominees', row.nominee_id)
  for (const row of selected.room_settlement_entries) {
    if (row.category_id != null && !declarationIds.has(row.category_id)) {
      addRequirement(requirements, 'categories', row.category_id)
    }
    addRequirement(requirements, 'nominees', row.winner_id)
    addRequirement(requirements, 'nominees', row.tie_winner_id)
  }
  for (const row of selected.bingo_cards) {
    if (!Array.isArray(row.squares)) throw new Error(`bingo_cards[${String(row.id)}] squares must be an array`)
    for (const squareId of row.squares) addRequirement(requirements, 'bingo_squares', squareId)
  }
  const authoredCategoryIds = requirements.get('categories') ?? new Set<string>()
  for (const row of snapshot.category_nominees) {
    if (authoredCategoryIds.has(String(row.category_id))) {
      addRequirement(requirements, 'category_nominees', rowKey('category_nominees', row))
    }
  }

  const conflicts: string[] = []
  for (const [table, keys] of requirements) {
    const snapshotByKey = new Map(snapshot[table].map((row) => [rowKey(table, row), row]))
    const currentByKey = new Map(current[table].map((row) => [rowKey(table, row), row]))
    for (const key of [...keys].sort()) {
      const expected = snapshotByKey.get(key)
      if (!expected) {
        conflicts.push(`${table}[${key}] catalog prerequisite is absent from the sealed snapshot`)
        continue
      }
      const actual = currentByKey.get(key)
      if (!actual) conflicts.push(`${table}[${key}] catalog prerequisite is missing`)
      else if (!rowsEqual(expected, actual)) {
        conflicts.push(`${table}[${key}] catalog prerequisite differs from the sealed snapshot`)
      }
    }
  }
  return conflicts
}

export function buildRoomRecoveryPlan(
  snapshot: OperatorSnapshotRows,
  current: OperatorSnapshotRows,
  requestedCode: string,
): RoomRecoveryPlan {
  const roomCode = requestedCode.trim().toUpperCase()
  if (!/^[A-Z0-9]{4,12}$/.test(roomCode)) throw new Error('room code must be 4 to 12 uppercase letters or numbers')
  const snapshotRoom = findRoom(snapshot, roomCode, 'sealed snapshot')
  let currentRoom: Record<string, unknown>
  try {
    currentRoom = findRoom(current, roomCode, 'current')
  } catch (error) {
    if (error instanceof Error && error.message === `current room ${roomCode} is missing`) {
      throw new Error(`current room ${roomCode} is missing; this command does not recreate rooms`)
    }
    throw error
  }
  const roomId = requiredString(snapshotRoom, 'id', 'sealed room')
  if (currentRoom.id !== roomId || currentRoom.show_pack_id !== snapshotRoom.show_pack_id) {
    throw new Error(`current room ${roomCode} does not match the sealed room identity`)
  }

  const selectedSnapshot = roomRows(snapshot, roomId)
  const selectedCurrent = roomRows(current, roomId)
  const conflicts = catalogConflicts(snapshot, current, selectedSnapshot, snapshotRoom)
  const tables = ROOM_RECOVERY_INSERT_ORDER.map((name): RoomRecoveryTablePlan => {
    const currentByKey = new Map(selectedCurrent[name].map((row) => [rowKey(name, row), row]))
    const seen = new Set<string>()
    const missing: Array<Record<string, unknown>> = []
    let unchanged = 0
    for (const row of selectedSnapshot[name]) {
      const key = rowKey(name, row)
      if (seen.has(key)) throw new Error(`${name}[${key}] is duplicated in the sealed snapshot`)
      seen.add(key)
      const actual = currentByKey.get(key)
      if (!actual) missing.push(row)
      else if (recoveryRowsEqual(name, row, actual)) unchanged += 1
      else conflicts.push(`${name}[${key}] differs from the sealed snapshot`)
    }
    missing.sort((left, right) => {
      if (name === 'room_settlements') {
        return Number(left.version) - Number(right.version)
      }
      if (name === 'witness_supporting_observations') {
        const byProposal = String(left.proposal_id).localeCompare(String(right.proposal_id))
        if (byProposal !== 0) return byProposal
        const byTime = String(left.observed_at).localeCompare(String(right.observed_at))
        if (byTime !== 0) return byTime
      }
      return rowKey(name, left).localeCompare(rowKey(name, right))
    })
    return { name, missing, unchanged }
  })

  const roomDriftFields = [...new Set([...Object.keys(snapshotRoom), ...Object.keys(currentRoom)])]
    .filter((field) => !rowsEqual(
      { value: snapshotRoom[field] },
      { value: currentRoom[field] },
    ))
    .sort()

  return {
    room_id: roomId,
    room_code: roomCode,
    room_drift_fields: roomDriftFields,
    tables,
    conflicts: [...new Set(conflicts)].sort(),
  }
}
