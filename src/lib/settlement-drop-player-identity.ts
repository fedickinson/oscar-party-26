import type { SealedTextArtifact } from './settlement-drop-asset-semantics'
import type { SettlementDropAssetSourceSeal } from './settlement-drop-asset-extraction'
import { sha256Hex } from './sha256'

type UnknownRecord = Record<string, unknown>

export interface SettlementDropPlayerIdentityPacket {
  packet_version: 1
  artifact: 'settlement-drop-player-identity-review'
  target: { room_code: string; snapshot_room_id: string }
  inputs: {
    ceremony: SettlementDropAssetSourceSeal
    tiers: SettlementDropAssetSourceSeal
    personal: SettlementDropAssetSourceSeal
    board: SettlementDropAssetSourceSeal
    rooms: SettlementDropAssetSourceSeal
    players: SettlementDropAssetSourceSeal
  }
  coverage: {
    snapshot_players: number
    ceremony_player_ids: number
    exact_uuid_joins: number
    display_name_variants: number
    missing_from_tiers: string[]
    missing_from_personal: string[]
    missing_from_board: string[]
  }
  players: Array<{
    player_id: string
    snapshot_name: string
    ceremony_name: string
    exact_name_match: boolean
    observed_names: {
      tiers: string[]
      personal: string[]
      board: string[]
    }
  }>
}

export interface SettlementDropPlayerIdentityDecisionTemplate {
  decision_version: 1
  artifact: 'settlement-drop-player-identity-decisions'
  target: SettlementDropPlayerIdentityPacket['target']
  expected_packet_sha256: string
  decisions: Array<{
    player_id: string
    canonical_name: null
    note: null
  }>
}

export interface SettlementDropPlayerIdentityInput {
  room_code: string
  ceremony: SealedTextArtifact
  tiers: SealedTextArtifact
  personal: SealedTextArtifact
  board: SealedTextArtifact
  rooms: SealedTextArtifact
  players: SealedTextArtifact
}

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value
}

function requiredUuid(value: unknown, label: string): string {
  const result = requiredString(value, label)
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(result)) {
    throw new Error(`${label} must be a UUID`)
  }
  return result
}

function validateSeal(artifact: SealedTextArtifact, label: string): SettlementDropAssetSourceSeal {
  const bytes = new TextEncoder().encode(artifact.raw).byteLength
  const digest = sha256Hex(artifact.raw)
  if (artifact.seal.bytes !== bytes || artifact.seal.sha256 !== digest) {
    throw new Error(`${label} seal does not match its bytes`)
  }
  return {
    name: requiredString(artifact.seal.name, `${label} seal name`),
    bytes,
    sha256: digest,
  }
}

function parseObject(raw: string, label: string): UnknownRecord {
  const parsed: unknown = JSON.parse(raw)
  if (!isRecord(parsed)) throw new Error(`${label} must be an object`)
  return parsed
}

function parseArray(raw: string, label: string): unknown[] {
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed)) throw new Error(`${label} must be an array`)
  return parsed
}

function extractJsonObject(raw: string, variable: string): UnknownRecord {
  const marker = new RegExp(`\\bvar\\s+${variable}\\s*=\\s*`)
  const match = marker.exec(raw)
  if (!match) throw new Error(`ceremony variable ${variable} is missing`)
  const start = match.index + match[0].length
  if (raw[start] !== '{') throw new Error(`ceremony variable ${variable} must start with an object`)
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < raw.length; index += 1) {
    const character = raw[index]
    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') inString = true
    else if (character === '{') depth += 1
    else if (character === '}') {
      depth -= 1
      if (depth === 0) {
        const parsed: unknown = JSON.parse(raw.slice(start, index + 1))
        if (!isRecord(parsed)) throw new Error(`ceremony variable ${variable} must be an object`)
        return parsed
      }
    }
  }
  throw new Error(`ceremony variable ${variable} is unterminated`)
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
}

function boardNames(board: UnknownRecord): string[] {
  if (!Array.isArray(board.cards)) throw new Error('board.cards must be an array')
  if (!isRecord(board.owners)) throw new Error('board.owners must be an object')
  if (!Array.isArray(board.beats)) throw new Error('board.beats must be an array')
  const cards = board.cards.map((value, index) => {
    if (!isRecord(value)) throw new Error(`board.cards[${index}] must be an object`)
    return requiredString(value.player, `board.cards[${index}].player`)
  })
  const owners = Object.entries(board.owners).map(([key, value]) =>
    requiredString(value, `board.owners.${key}`))
  const drafters = board.beats.flatMap((value, index) => {
    if (!isRecord(value)) throw new Error(`board.beats[${index}] must be an object`)
    if (value.drafter === null || value.drafter === undefined) return []
    return [requiredString(value.drafter, `board.beats[${index}].drafter`)]
  })
  return uniqueSorted([...cards, ...owners, ...drafters])
}

export function buildSettlementDropPlayerIdentityPacket(
  input: SettlementDropPlayerIdentityInput,
): SettlementDropPlayerIdentityPacket {
  const roomCode = requiredString(input.room_code, 'room_code')
  const seals = {
    ceremony: validateSeal(input.ceremony, 'ceremony'),
    tiers: validateSeal(input.tiers, 'tiers'),
    personal: validateSeal(input.personal, 'personal'),
    board: validateSeal(input.board, 'board'),
    rooms: validateSeal(input.rooms, 'rooms'),
    players: validateSeal(input.players, 'players'),
  }
  const rooms = parseArray(input.rooms.raw, 'rooms')
  const matchingRooms = rooms.map((value, index) => {
    if (!isRecord(value)) throw new Error(`rooms[${index}] must be an object`)
    return value
  }).filter((value) => value.code === roomCode)
  if (matchingRooms.length !== 1) {
    throw new Error(`room code ${roomCode} must resolve to exactly one snapshot room`)
  }
  const roomId = requiredUuid(matchingRooms[0].id, 'snapshot room id')

  const playerRows = parseArray(input.players.raw, 'players')
  const snapshotById = new Map<string, string>()
  const snapshotNameOwner = new Map<string, string>()
  for (const [index, value] of playerRows.entries()) {
    if (!isRecord(value)) throw new Error(`players[${index}] must be an object`)
    if (value.room_id !== roomId) continue
    const id = requiredUuid(value.id, `players[${index}].id`)
    const name = requiredString(value.name, `players[${index}].name`)
    if (snapshotById.has(id)) throw new Error(`snapshot room contains duplicate player ID ${id}`)
    const nameOwner = snapshotNameOwner.get(name)
    if (nameOwner && nameOwner !== id) {
      throw new Error(`snapshot display name ${name} belongs to multiple player IDs`)
    }
    snapshotById.set(id, name)
    snapshotNameOwner.set(name, id)
  }
  if (snapshotById.size === 0) throw new Error(`snapshot room ${roomId} has no players`)

  const rawPids = extractJsonObject(input.ceremony.raw, 'PIDS')
  const ceremonyById = new Map<string, string>()
  const ceremonyNameOwner = new Map<string, string>()
  for (const [id, rawName] of Object.entries(rawPids)) {
    requiredUuid(id, 'ceremony player ID')
    const name = requiredString(rawName, `ceremony PIDS.${id}`)
    const nameOwner = ceremonyNameOwner.get(name)
    if (nameOwner && nameOwner !== id) {
      throw new Error(`ceremony display name ${name} belongs to multiple player IDs`)
    }
    ceremonyById.set(id, name)
    ceremonyNameOwner.set(name, id)
  }
  for (const id of ceremonyById.keys()) {
    if (!snapshotById.has(id)) throw new Error(`ceremony player ${id} is missing from snapshot room`)
  }
  for (const id of snapshotById.keys()) {
    if (!ceremonyById.has(id)) throw new Error(`snapshot player ${id} is missing from ceremony PIDS`)
  }

  const exactNameOwner = new Map<string, string>()
  for (const [id, names] of [...snapshotById.keys()].map((id) =>
    [id, [snapshotById.get(id) as string, ceremonyById.get(id) as string]] as const)) {
    for (const name of names) {
      const owner = exactNameOwner.get(name)
      if (owner && owner !== id) throw new Error(`display name ${name} is ambiguous across player IDs`)
      exactNameOwner.set(name, id)
    }
  }

  const tiers = parseObject(input.tiers.raw, 'tiers')
  const personal = parseObject(input.personal.raw, 'personal')
  const board = parseObject(input.board.raw, 'board')
  const namesBySurface = {
    tiers: uniqueSorted(Object.keys(tiers).filter((name) => !name.startsWith('_'))),
    personal: uniqueSorted(Object.keys(personal)),
    board: boardNames(board),
  }
  const observed = new Map<string, { tiers: string[]; personal: string[]; board: string[] }>(
    [...snapshotById.keys()].map((id) => [id, { tiers: [], personal: [], board: [] }]),
  )
  for (const [surface, names] of Object.entries(namesBySurface) as Array<
    [keyof typeof namesBySurface, string[]]
  >) {
    for (const name of names) {
      const id = exactNameOwner.get(name)
      if (!id) throw new Error(`${surface} references name ${name} not owned by a snapshot or ceremony player`)
      observed.get(id)?.[surface].push(name)
    }
  }

  const players = [...snapshotById.keys()].sort((left, right) => left < right ? -1 : left > right ? 1 : 0).map((id) => ({
    player_id: id,
    snapshot_name: snapshotById.get(id) as string,
    ceremony_name: ceremonyById.get(id) as string,
    exact_name_match: snapshotById.get(id) === ceremonyById.get(id),
    observed_names: observed.get(id) as { tiers: string[]; personal: string[]; board: string[] },
  }))
  const missing = (surface: keyof typeof namesBySurface) => players
    .filter((player) => player.observed_names[surface].length === 0)
    .map((player) => player.player_id)

  return {
    packet_version: 1,
    artifact: 'settlement-drop-player-identity-review',
    target: { room_code: roomCode, snapshot_room_id: roomId },
    inputs: seals,
    coverage: {
      snapshot_players: snapshotById.size,
      ceremony_player_ids: ceremonyById.size,
      exact_uuid_joins: snapshotById.size,
      display_name_variants: players.filter((player) => !player.exact_name_match).length,
      missing_from_tiers: missing('tiers'),
      missing_from_personal: missing('personal'),
      missing_from_board: missing('board'),
    },
    players,
  }
}

export function serializeSettlementDropPlayerIdentityPacket(
  packet: SettlementDropPlayerIdentityPacket,
): string {
  return `${JSON.stringify(packet, null, 2)}\n`
}

export function serializeSettlementDropPlayerIdentityDecisionTemplate(
  packet: SettlementDropPlayerIdentityPacket,
): string {
  const template: SettlementDropPlayerIdentityDecisionTemplate = {
    decision_version: 1,
    artifact: 'settlement-drop-player-identity-decisions',
    target: packet.target,
    expected_packet_sha256: sha256Hex(serializeSettlementDropPlayerIdentityPacket(packet)),
    decisions: packet.players.map((player) => ({
      player_id: player.player_id,
      canonical_name: null,
      note: null,
    })),
  }
  return `${JSON.stringify(template, null, 2)}\n`
}
