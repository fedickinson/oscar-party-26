import type { SealedTextArtifact } from './settlement-drop-asset-semantics'
import type { SettlementDropAssetSourceSeal } from './settlement-drop-asset-extraction'
import { sha256Hex } from './sha256'

type UnknownRecord = Record<string, unknown>

export const RECEIPT_PREREQUISITE_TABLES = [
  'rooms', 'players', 'categories', 'nominees', 'room_winners', 'confidence_picks',
  'draft_entities', 'draft_picks', 'bingo_cards', 'bingo_squares', 'bingo_marks',
  'beat_activations', 'signature_beats',
] as const

type PrerequisiteTable = typeof RECEIPT_PREREQUISITE_TABLES[number]

export interface SettlementDropReceiptPrerequisitesPacket {
  packet_version: 1
  artifact: 'settlement-drop-receipt-prerequisites-review'
  target: { room_code: string; room_id: string }
  inputs: Record<PrerequisiteTable, SettlementDropAssetSourceSeal>
  canonical_state: {
    snapshot_phase: string
    room_closed: false
    active_settlement_id: null
    settlement_rows_provided: false
    canonical_receipt_recoverable: false
  }
  coverage: {
    players: number
    room_winners: number
    confidence_picks: number
    draft_picks: number
    bingo_cards: number
    bingo_marks: number
    approved_bingo_marks: number
    beat_activations: number
    candidate_entries: number
  }
  schema_gaps: string[]
  candidate_entries: Array<{
    entry_key: string
    category_id: number
    category_name: string
    points: number
    winner_id: string
    winner_name: string
    tie_winner_id: string | null
    tie_winner_name: string | null
    announced_at: string | null
  }>
}

export interface SettlementDropReceiptPrerequisitesDecisionTemplate {
  decision_version: 1
  artifact: 'settlement-drop-receipt-prerequisites-decisions'
  target: SettlementDropReceiptPrerequisitesPacket['target']
  expected_packet_sha256: string
  settlement: { title: null; actor: null; bingo_mode: null }
  entries: Array<{
    entry_key: string
    approved_outcome: null
    warrant: null
    occurred_at: null
    note: null
  }>
  bingo: { preserve_snapshot_marks: null; warrant: null; note: null }
  additional_fact_review: null
}

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value
}

function integer(value: unknown, label: string): number {
  if (!Number.isInteger(value)) throw new Error(`${label} must be an integer`)
  return value as number
}

function validateTable(artifact: SealedTextArtifact, label: string): {
  seal: SettlementDropAssetSourceSeal
  rows: UnknownRecord[]
} {
  const bytes = new TextEncoder().encode(artifact.raw).byteLength
  const sha256 = sha256Hex(artifact.raw)
  if (artifact.seal.bytes !== bytes || artifact.seal.sha256 !== sha256) {
    throw new Error(`${label} seal does not match its bytes`)
  }
  const parsed: unknown = JSON.parse(artifact.raw)
  if (!Array.isArray(parsed) || parsed.some((row) => !isRecord(row))) {
    throw new Error(`${label} must be an array of objects`)
  }
  return {
    seal: { name: requiredString(artifact.seal.name, `${label} seal name`), bytes, sha256 },
    rows: parsed as UnknownRecord[],
  }
}

function uniqueBy(rows: UnknownRecord[], key: string, label: string): Map<string, UnknownRecord> {
  const result = new Map<string, UnknownRecord>()
  for (const [index, row] of rows.entries()) {
    const value = String(row[key] ?? '')
    if (!value) throw new Error(`${label}[${index}].${key} is required`)
    if (result.has(value)) throw new Error(`${label} contains duplicate ${key} ${value}`)
    result.set(value, row)
  }
  return result
}

export function buildSettlementDropReceiptPrerequisitesPacket(input: {
  room_code: string
  tables: Record<PrerequisiteTable, SealedTextArtifact>
}): SettlementDropReceiptPrerequisitesPacket {
  const roomCode = requiredString(input.room_code, 'room_code')
  const parsed = Object.fromEntries(RECEIPT_PREREQUISITE_TABLES.map((table) => {
    const artifact = input.tables[table]
    if (!artifact) throw new Error(`snapshot table ${table} is required`)
    return [table, validateTable(artifact, table)]
  })) as Record<PrerequisiteTable, ReturnType<typeof validateTable>>
  const rooms = parsed.rooms.rows.filter((room) => room.code === roomCode)
  if (rooms.length !== 1) throw new Error(`room code ${roomCode} must resolve to exactly one snapshot room`)
  const room = rooms[0]
  const roomId = requiredString(room.id, 'snapshot room id')
  if (room.phase !== 'finished' || room.active_settlement_id) {
    throw new Error('receipt prerequisites packet is only for a pre-settlement finished snapshot')
  }
  const roomRows = (table: PrerequisiteTable) => parsed[table].rows.filter((row) => row.room_id === roomId)
  const players = roomRows('players')
  const winners = roomRows('room_winners')
  const confidencePicks = roomRows('confidence_picks')
  const draftPicks = roomRows('draft_picks')
  const bingoCards = roomRows('bingo_cards')
  const beatActivations = roomRows('beat_activations')
  const playerById = uniqueBy(players, 'id', 'room players')
  const categoryById = uniqueBy(parsed.categories.rows, 'id', 'categories')
  const nomineeById = uniqueBy(parsed.nominees.rows, 'id', 'nominees')
  const draftEntityById = uniqueBy(parsed.draft_entities.rows, 'id', 'draft entities')
  const cardById = uniqueBy(bingoCards, 'id', 'room bingo cards')
  uniqueBy(parsed.bingo_squares.rows, 'id', 'bingo squares')

  for (const [index, pick] of confidencePicks.entries()) {
    if (!playerById.has(String(pick.player_id))) throw new Error(`confidence pick ${index} references unknown player`)
    if (!categoryById.has(String(pick.category_id))) throw new Error(`confidence pick ${index} references unknown category`)
    if (!nomineeById.has(String(pick.nominee_id))) throw new Error(`confidence pick ${index} references unknown nominee`)
  }
  for (const [index, pick] of draftPicks.entries()) {
    if (!playerById.has(String(pick.player_id))) throw new Error(`draft pick ${index} references unknown player`)
    if (!draftEntityById.has(String(pick.entity_id))) throw new Error(`draft pick ${index} references unknown entity`)
  }
  for (const [index, card] of bingoCards.entries()) {
    if (!playerById.has(String(card.player_id))) throw new Error(`bingo card ${index} references unknown player`)
    if (!Array.isArray(card.squares)) throw new Error(`bingo card ${index}.squares must be an array`)
  }
  const bingoMarks = parsed.bingo_marks.rows.filter((mark) => cardById.has(String(mark.card_id)))
  for (const [index, mark] of bingoMarks.entries()) {
    const card = cardById.get(String(mark.card_id)) as UnknownRecord
    const squareIndex = integer(mark.square_index, `bingo mark ${index}.square_index`)
    if (!Array.isArray(card.squares) || squareIndex < 0 || squareIndex >= card.squares.length) {
      throw new Error(`bingo mark ${index} square index is outside its card`)
    }
  }

  const winnerCategoryIds = new Set<string>()
  const candidateEntries = winners.map((winner, index) => {
    const categoryId = integer(winner.category_id, `room winner ${index}.category_id`)
    if (winnerCategoryIds.has(String(categoryId))) throw new Error(`room winners contain duplicate category ${categoryId}`)
    winnerCategoryIds.add(String(categoryId))
    const category = categoryById.get(String(categoryId))
    if (!category) throw new Error(`room winner ${index} references unknown category ${categoryId}`)
    const winnerId = requiredString(winner.winner_id, `room winner ${index}.winner_id`)
    const winnerRow = nomineeById.get(winnerId)
    if (!winnerRow) throw new Error(`room winner ${index} references unknown nominee ${winnerId}`)
    const tieId = winner.tie_winner_id === null ? null : requiredString(winner.tie_winner_id, `room winner ${index}.tie_winner_id`)
    const tieRow = tieId ? nomineeById.get(tieId) : null
    if (tieId && !tieRow) throw new Error(`room winner ${index} references unknown tie nominee ${tieId}`)
    return {
      entry_key: `category:${categoryId}`,
      category_id: categoryId,
      category_name: requiredString(category.name, `category ${categoryId}.name`),
      points: integer(category.points, `category ${categoryId}.points`),
      winner_id: winnerId,
      winner_name: requiredString(winnerRow.name, `nominee ${winnerId}.name`),
      tie_winner_id: tieId,
      tie_winner_name: tieRow ? requiredString(tieRow.name, `nominee ${tieId}.name`) : null,
      announced_at: typeof category.announced_at === 'string' ? category.announced_at : null,
    }
  }).sort((left, right) => left.category_id - right.category_id)

  const schemaGaps = [
    ...(!Object.prototype.hasOwnProperty.call(room, 'show_pack_id') ? ['rooms.show_pack_id'] : []),
    ...(!Object.prototype.hasOwnProperty.call(room, 'active_settlement_id') ? ['rooms.active_settlement_id'] : []),
    ...(!Object.prototype.hasOwnProperty.call(room, 'game_model') ? ['rooms.game_model'] : []),
    ...(!parsed.categories.rows.every((row) => Object.prototype.hasOwnProperty.call(row, 'show_pack_id')) ? ['categories.show_pack_id'] : []),
    ...(!parsed.bingo_squares.rows.every((row) => Object.prototype.hasOwnProperty.call(row, 'show_pack_id')) ? ['bingo_squares.show_pack_id'] : []),
  ]
  return {
    packet_version: 1,
    artifact: 'settlement-drop-receipt-prerequisites-review',
    target: { room_code: roomCode, room_id: roomId },
    inputs: Object.fromEntries(RECEIPT_PREREQUISITE_TABLES.map((table) => [table, parsed[table].seal])) as Record<PrerequisiteTable, SettlementDropAssetSourceSeal>,
    canonical_state: {
      snapshot_phase: requiredString(room.phase, 'snapshot room phase'),
      room_closed: false,
      active_settlement_id: null,
      settlement_rows_provided: false,
      canonical_receipt_recoverable: false,
    },
    coverage: {
      players: players.length,
      room_winners: winners.length,
      confidence_picks: confidencePicks.length,
      draft_picks: draftPicks.length,
      bingo_cards: bingoCards.length,
      bingo_marks: bingoMarks.length,
      approved_bingo_marks: bingoMarks.filter((mark) => mark.status === 'approved').length,
      beat_activations: beatActivations.length,
      candidate_entries: candidateEntries.length,
    },
    schema_gaps: schemaGaps,
    candidate_entries: candidateEntries,
  }
}

export function serializeSettlementDropReceiptPrerequisitesPacket(
  packet: SettlementDropReceiptPrerequisitesPacket,
): string {
  return `${JSON.stringify(packet, null, 2)}\n`
}

export function serializeSettlementDropReceiptPrerequisitesDecisionTemplate(
  packet: SettlementDropReceiptPrerequisitesPacket,
): string {
  const template: SettlementDropReceiptPrerequisitesDecisionTemplate = {
    decision_version: 1,
    artifact: 'settlement-drop-receipt-prerequisites-decisions',
    target: packet.target,
    expected_packet_sha256: sha256Hex(serializeSettlementDropReceiptPrerequisitesPacket(packet)),
    settlement: { title: null, actor: null, bingo_mode: null },
    entries: packet.candidate_entries.map((entry) => ({
      entry_key: entry.entry_key, approved_outcome: null, warrant: null, occurred_at: null, note: null,
    })),
    bingo: { preserve_snapshot_marks: null, warrant: null, note: null },
    additional_fact_review: null,
  }
  return `${JSON.stringify(template, null, 2)}\n`
}
