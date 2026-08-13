/** Canonical evidence emitted only after settle-room confirms an applied record. */
import type { TriggerContractRow } from '../types/database'

export type SettlementReceiptScoreKind = 'draft' | 'prediction' | 'bingo' | 'adjustment'

export interface SettlementReceiptTrigger {
  source_signature_beat_id: number
  contract: TriggerContractRow
}

export interface SettlementReceiptScoreEvent {
  id: string
  kind: SettlementReceiptScoreKind
  player_id: string
  character_id?: string
  label: string
  points: number
  trigger?: SettlementReceiptTrigger
}

export interface SettlementReceiptPersonalCard {
  player_id: string
  bingo: Array<{ label: string; marked: boolean; free: boolean }>
}

export interface SettlementReceiptPlayer {
  id: string
  name: string
}

export interface SettlementReceiptCharacter {
  id: string
  name: string
  player_id?: string
}

export interface SettlementReceiptShowPack {
  registry_id: string
  pack_id: string
  version: number
}

export interface SettlementReceiptRevision {
  settled_at: string
  supersedes_id: string | null
}

export interface SettlementReceiptFactParty {
  id: string
  name: string
}

export interface SettlementReceiptFact {
  id: string
  sequence: number
  title: string
  outcome: 'resolved' | 'void'
  board_status: 'authored' | 'unscored'
  occurred_at?: string
  winner?: SettlementReceiptFactParty
  tie_winner?: SettlementReceiptFactParty
}

export interface SettlementReceiptStanding {
  player_id: string
  total: number
  confidence_score: number
  correct_pick_count: number
  top_correct_pick: number
  rank: number
}

export interface SettlementReceipt {
  version: 1
  source: 'scripts/settle-room.mts' | 'synthetic-proof'
  room_code: string
  room_id: string
  settlement_id: string
  settlement_version: number
  manifest_hash: string
  revision?: SettlementReceiptRevision
  show_pack?: SettlementReceiptShowPack
  settled_facts?: SettlementReceiptFact[]
  players: SettlementReceiptPlayer[]
  characters: SettlementReceiptCharacter[]
  score_events: SettlementReceiptScoreEvent[]
  personal_cards: SettlementReceiptPersonalCard[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertKeys(
  value: Record<string, unknown>,
  required: string[],
  optional: string[],
  label: string,
): void {
  const allowed = new Set([...required, ...optional])
  const unknown = Object.keys(value).find((key) => !allowed.has(key))
  if (unknown) throw new Error(`${label} has unknown field ${unknown}`)
  const missing = required.find((key) => !(key in value))
  if (missing) throw new Error(`${label} is missing field ${missing}`)
}

function assertUuid(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`${label} must be a UUID`)
  }
}

function identifier(value: unknown, label: string, evidence = false): string {
  const pattern = evidence ? /^[a-z0-9][a-z0-9:_-]*$/i : /^[a-z0-9][a-z0-9_-]*$/i
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error(`${label} is invalid`)
  return value
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value
}

const TRIGGER_DECISIONS = [
  'count',
  'do_not_count',
  'explicit_only',
  'principal_accepts_if_unrefused',
] as const

function parseStringList(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array`)
  }
  return value.map((item, index) => requiredString(item, `${label} item ${index + 1}`))
}

function parseTriggerContract(value: unknown, label: string): TriggerContractRow {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  assertKeys(value, [
    'title',
    'condition',
    'exclusions',
    'adjudication',
    'title_review',
    'basis_claim_ids',
  ], [], label)
  if (!isRecord(value.adjudication)) throw new Error(`${label} adjudication must be an object`)
  const adjudicationValue = value.adjudication
  assertKeys(adjudicationValue, ['proxies', 'offscreen', 'mentions'], [], `${label} adjudication`)
  const adjudication = Object.fromEntries(['proxies', 'offscreen', 'mentions'].map((dimension) => {
    const decision = adjudicationValue[dimension]
    if (typeof decision !== 'string' || !TRIGGER_DECISIONS.includes(decision as typeof TRIGGER_DECISIONS[number])) {
      throw new Error(`${label} adjudication.${dimension} must be an explicit trigger decision`)
    }
    return [dimension, decision]
  })) as TriggerContractRow['adjudication']
  if (!isRecord(value.title_review)) throw new Error(`${label} title_review must be an object`)
  assertKeys(value.title_review, ['status', 'note'], [], `${label} title_review`)
  if (value.title_review.status !== 'approved') {
    throw new Error(`${label} title_review.status must be approved`)
  }
  return {
    title: requiredString(value.title, `${label} title`),
    condition: requiredString(value.condition, `${label} condition`),
    exclusions: parseStringList(value.exclusions, `${label} exclusions`),
    adjudication,
    title_review: {
      status: 'approved',
      note: requiredString(value.title_review.note, `${label} title_review.note`),
    },
    basis_claim_ids: parseStringList(value.basis_claim_ids, `${label} basis_claim_ids`),
  }
}

function parseTrigger(value: unknown, label: string): SettlementReceiptTrigger {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  assertKeys(value, ['source_signature_beat_id', 'contract'], [], label)
  if (!Number.isInteger(value.source_signature_beat_id)
    || (value.source_signature_beat_id as number) < 1) {
    throw new Error(`${label} source_signature_beat_id must be a positive integer`)
  }
  return {
    source_signature_beat_id: value.source_signature_beat_id as number,
    contract: parseTriggerContract(value.contract, `${label} contract`),
  }
}

function parsePlayers(value: unknown): SettlementReceiptPlayer[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('players must be a non-empty array')
  const ids = new Set<string>()
  const players = value.map((candidate, index) => {
    const label = `receipt player ${index + 1}`
    if (!isRecord(candidate)) throw new Error(`${label} must be an object`)
    assertKeys(candidate, ['id', 'name'], [], label)
    const id = identifier(candidate.id, `${label} id`)
    if (ids.has(id)) throw new Error(`duplicate receipt player ${id}`)
    ids.add(id)
    return { id, name: requiredString(candidate.name, `${label} name`) }
  })
  return players.sort((left, right) => left.id.localeCompare(right.id))
}

function parseShowPack(value: unknown): SettlementReceiptShowPack {
  const label = 'settlement receipt show_pack'
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  assertKeys(value, ['registry_id', 'pack_id', 'version'], [], label)
  assertUuid(value.registry_id, `${label} registry_id`)
  if (typeof value.pack_id !== 'string'
    || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.pack_id)) {
    throw new Error(`${label} pack_id must be a kebab-case slug`)
  }
  if (!Number.isInteger(value.version) || (value.version as number) < 1) {
    throw new Error(`${label} version must be a positive integer`)
  }
  return {
    registry_id: value.registry_id,
    pack_id: value.pack_id,
    version: value.version as number,
  }
}

function parseRevision(
  value: unknown,
  settlementId: string,
): SettlementReceiptRevision {
  const label = 'settlement receipt revision'
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  assertKeys(value, ['settled_at', 'supersedes_id'], [], label)
  const settledAt = requiredString(value.settled_at, 'revision settled_at')
  if (Number.isNaN(Date.parse(settledAt))) {
    throw new Error('revision settled_at must be an ISO timestamp')
  }
  const supersedesId = value.supersedes_id
  let parsedSupersedesId: string | null = null
  if (supersedesId !== null) {
    assertUuid(supersedesId, 'revision supersedes_id')
    if (supersedesId === settlementId) {
      throw new Error('revision supersedes_id cannot equal settlement_id')
    }
    parsedSupersedesId = supersedesId
  }
  return {
    settled_at: settledAt,
    supersedes_id: parsedSupersedesId,
  }
}

function parseFactParty(value: unknown, label: string): SettlementReceiptFactParty {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  assertKeys(value, ['id', 'name'], [], label)
  return {
    id: requiredString(value.id, `${label} id`),
    name: requiredString(value.name, `${label} name`),
  }
}

function parseSettledFacts(value: unknown): SettlementReceiptFact[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('settled_facts must be a non-empty array')
  }
  const ids = new Set<string>()
  const sequences = new Set<number>()
  const facts = value.map((candidate, index) => {
    const label = `settled fact ${index + 1}`
    if (!isRecord(candidate)) throw new Error(`${label} must be an object`)
    assertKeys(candidate, [
      'id',
      'sequence',
      'title',
      'outcome',
      'board_status',
    ], ['occurred_at', 'winner', 'tie_winner'], label)
    const id = requiredString(candidate.id, `${label} id`)
    if (ids.has(id)) throw new Error(`duplicate settled fact ${id}`)
    ids.add(id)
    if (!Number.isInteger(candidate.sequence) || (candidate.sequence as number) < 1) {
      throw new Error(`${label} sequence must be a positive integer`)
    }
    const sequence = candidate.sequence as number
    if (sequences.has(sequence)) throw new Error(`duplicate settled fact sequence ${sequence}`)
    sequences.add(sequence)
    if (candidate.outcome !== 'resolved' && candidate.outcome !== 'void') {
      throw new Error(`${label} outcome must be resolved or void`)
    }
    if (candidate.board_status !== 'authored' && candidate.board_status !== 'unscored') {
      throw new Error(`${label} board_status must be authored or unscored`)
    }
    const winner = candidate.winner === undefined
      ? undefined
      : parseFactParty(candidate.winner, `${label} winner`)
    const tieWinner = candidate.tie_winner === undefined
      ? undefined
      : parseFactParty(candidate.tie_winner, `${label} tie_winner`)
    if (candidate.outcome === 'resolved' && winner === undefined) {
      throw new Error(`${label} resolved outcome requires a winner`)
    }
    if (candidate.outcome === 'void' && (winner !== undefined || tieWinner !== undefined)) {
      throw new Error(`${label} void settled fact cannot have a winner`)
    }
    if (candidate.outcome === 'void' && candidate.board_status !== 'authored') {
      throw new Error(`${label} void settled fact must be authored`)
    }
    if (winner !== undefined && tieWinner !== undefined && winner.id === tieWinner.id) {
      throw new Error(`${label} winner and tie_winner must be different`)
    }
    const occurredAt = candidate.occurred_at === undefined
      ? undefined
      : requiredString(candidate.occurred_at, `${label} occurred_at`)
    if (occurredAt !== undefined && Number.isNaN(Date.parse(occurredAt))) {
      throw new Error(`${label} occurred_at must be an ISO timestamp`)
    }
    return {
      id,
      sequence,
      title: requiredString(candidate.title, `${label} title`),
      outcome: candidate.outcome,
      board_status: candidate.board_status,
      ...(occurredAt === undefined ? {} : { occurred_at: occurredAt }),
      ...(winner === undefined ? {} : { winner }),
      ...(tieWinner === undefined ? {} : { tie_winner: tieWinner }),
    } satisfies SettlementReceiptFact
  })
  return facts.sort((left, right) => left.sequence - right.sequence || left.id.localeCompare(right.id))
}

function parseCharacters(
  value: unknown,
  playerIds: Set<string>,
): SettlementReceiptCharacter[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error('characters must be a non-empty array')
  const ids = new Set<string>()
  const characters = value.map((candidate, index) => {
    const label = `receipt character ${index + 1}`
    if (!isRecord(candidate)) throw new Error(`${label} must be an object`)
    assertKeys(candidate, ['id', 'name'], ['player_id'], label)
    const id = identifier(candidate.id, `${label} id`)
    if (ids.has(id)) throw new Error(`duplicate receipt character ${id}`)
    ids.add(id)
    const playerId = candidate.player_id === undefined
      ? undefined
      : identifier(candidate.player_id, `${label} player_id`)
    if (playerId !== undefined && !playerIds.has(playerId)) {
      throw new Error(`${label} references unknown player ${playerId}`)
    }
    return {
      id,
      name: requiredString(candidate.name, `${label} name`),
      ...(playerId === undefined ? {} : { player_id: playerId }),
    }
  })
  return characters.sort((left, right) => left.id.localeCompare(right.id))
}

function parsePersonalCards(
  value: unknown,
  playerIds: Set<string>,
): SettlementReceiptPersonalCard[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('personal_cards must be a non-empty array')
  }
  const players = new Set<string>()
  const cards = value.map((candidate, cardIndex) => {
    const label = `personal card ${cardIndex + 1}`
    if (!isRecord(candidate)) throw new Error(`${label} must be an object`)
    assertKeys(candidate, ['player_id', 'bingo'], [], label)
    const playerId = identifier(candidate.player_id, `${label} player_id`)
    if (!playerIds.has(playerId)) throw new Error(`${label} references unknown player ${playerId}`)
    if (players.has(playerId)) throw new Error(`duplicate personal card for player ${playerId}`)
    players.add(playerId)
    if (!Array.isArray(candidate.bingo) || candidate.bingo.length !== 25) {
      throw new Error(`${label} must have exactly 25 bingo cells`)
    }
    const bingo = candidate.bingo.map((cell, cellIndex) => {
      const cellLabel = `${label} bingo cell ${cellIndex + 1}`
      if (!isRecord(cell)) throw new Error(`${cellLabel} must be an object`)
      assertKeys(cell, ['label', 'marked', 'free'], [], cellLabel)
      const text = requiredString(cell.label, `${cellLabel} label`)
      if (typeof cell.marked !== 'boolean' || typeof cell.free !== 'boolean') {
        throw new Error(`${cellLabel} marked and free must be boolean`)
      }
      return { label: text, marked: cell.marked, free: cell.free }
    })
    const freeCells = bingo.flatMap((cell, index) => cell.free ? [index] : [])
    if (freeCells.length !== 1 || freeCells[0] !== 12 || !bingo[12].marked) {
      throw new Error(`${label} must have one marked free cell at index 12`)
    }
    return { player_id: playerId, bingo }
  })
  const missingPlayer = [...playerIds].find((playerId) => !players.has(playerId))
  if (missingPlayer) throw new Error(`personal card is missing player ${missingPlayer}`)
  return cards.sort((left, right) => left.player_id.localeCompare(right.player_id))
}

function parseScoreEvents(
  value: unknown,
  playerIds: Set<string>,
  characters: Map<string, SettlementReceiptCharacter>,
): SettlementReceiptScoreEvent[] {
  if (!Array.isArray(value)) throw new Error('score_events must be an array')
  const ids = new Set<string>()
  const events = value.map((candidate, eventIndex) => {
    const label = `score event ${eventIndex + 1}`
    if (!isRecord(candidate)) throw new Error(`${label} must be an object`)
    assertKeys(candidate, ['id', 'kind', 'player_id', 'label', 'points'], ['character_id', 'trigger'], label)
    const id = identifier(candidate.id, `${label} id`, true)
    if (ids.has(id)) throw new Error(`duplicate score event ${id}`)
    ids.add(id)
    if (!['draft', 'prediction', 'bingo', 'adjustment'].includes(candidate.kind as string)) {
      throw new Error(`${label} kind must be draft, prediction, bingo, or adjustment`)
    }
    const playerId = identifier(candidate.player_id, `${label} player_id`)
    if (!playerIds.has(playerId)) throw new Error(`${label} references unknown player ${playerId}`)
    const characterId = candidate.character_id === undefined
      ? undefined
      : identifier(candidate.character_id, `${label} character_id`)
    if (characterId !== undefined && candidate.kind !== 'draft' && candidate.kind !== 'adjustment') {
      throw new Error(`${label} only draft or adjustment events may reference a character`)
    }
    if (characterId !== undefined) {
      const character = characters.get(characterId)
      if (!character) throw new Error(`score event ${id} references unknown character ${characterId}`)
      if (character.player_id !== playerId) {
        throw new Error(`score event ${id} awards ${characterId} to the wrong player`)
      }
    }
    const text = requiredString(candidate.label, `${label} label`)
    const trigger = candidate.trigger === undefined
      ? undefined
      : parseTrigger(candidate.trigger, `${label} trigger`)
    const triggerOwnerIsValid = (candidate.kind === 'draft' && characterId !== undefined)
      || (candidate.kind === 'prediction' && characterId === undefined)
    if (trigger !== undefined && !triggerOwnerIsValid) {
      throw new Error(`${label} trigger requires a character draft or conviction prediction event`)
    }
    if (!Number.isInteger(candidate.points) || candidate.points === 0) {
      throw new Error(`${label} points must be a non-zero integer`)
    }
    if (candidate.kind !== 'adjustment' && (candidate.points as number) < 0) {
      throw new Error(`${label} ${candidate.kind as string} points must be a positive integer`)
    }
    return {
      id,
      kind: candidate.kind as SettlementReceiptScoreKind,
      player_id: playerId,
      ...(characterId === undefined ? {} : { character_id: characterId }),
      label: text,
      points: candidate.points as number,
      ...(trigger === undefined ? {} : { trigger }),
    }
  })
  return events.sort((left, right) => left.id.localeCompare(right.id))
}

export function parseSettlementReceipt(raw: string): SettlementReceipt {
  const value: unknown = JSON.parse(raw)
  if (!isRecord(value)) throw new Error('settlement receipt must be an object')
  assertKeys(value, [
    'version',
    'source',
    'room_code',
    'room_id',
    'settlement_id',
    'settlement_version',
    'manifest_hash',
    'players',
    'characters',
    'score_events',
    'personal_cards',
  ], ['revision', 'show_pack', 'settled_facts'], 'settlement receipt')
  if (value.version !== 1) throw new Error('settlement receipt version must be 1')
  if (value.source !== 'scripts/settle-room.mts' && value.source !== 'synthetic-proof') {
    throw new Error('settlement receipt source must be scripts/settle-room.mts or synthetic-proof')
  }
  if (typeof value.room_code !== 'string' || !/^[A-Z0-9]{4,12}$/.test(value.room_code)) {
    throw new Error('settlement receipt room_code must be 4 to 12 uppercase letters or numbers')
  }
  assertUuid(value.room_id, 'settlement receipt room_id')
  assertUuid(value.settlement_id, 'settlement receipt settlement_id')
  if (!Number.isInteger(value.settlement_version) || (value.settlement_version as number) < 1) {
    throw new Error('settlement receipt settlement_version must be a positive integer')
  }
  if (typeof value.manifest_hash !== 'string' || !/^[a-f0-9]{64}$/.test(value.manifest_hash)) {
    throw new Error('settlement receipt manifest_hash must be a lowercase SHA-256 digest')
  }

  const players = parsePlayers(value.players)
  const playerIds = new Set(players.map((player) => player.id))
  const characters = parseCharacters(value.characters, playerIds)
  const personalCards = parsePersonalCards(value.personal_cards, playerIds)
  const scoreEvents = parseScoreEvents(
    value.score_events,
    playerIds,
    new Map(characters.map((character) => [character.id, character])),
  )
  return {
    version: 1,
    source: value.source,
    room_code: value.room_code,
    room_id: value.room_id,
    settlement_id: value.settlement_id,
    settlement_version: value.settlement_version as number,
    manifest_hash: value.manifest_hash,
    ...(value.revision === undefined ? {} : {
      revision: parseRevision(value.revision, value.settlement_id),
    }),
    ...(value.show_pack === undefined ? {} : { show_pack: parseShowPack(value.show_pack) }),
    ...(value.settled_facts === undefined ? {} : { settled_facts: parseSettledFacts(value.settled_facts) }),
    players,
    characters,
    score_events: scoreEvents,
    personal_cards: personalCards,
  }
}

export function settlementPlayerTotals(
  receipt: Pick<SettlementReceipt, 'players' | 'score_events'>,
): Record<string, number> {
  const totals = new Map(receipt.players.map((player) => [player.id, 0]))
  for (const event of receipt.score_events) {
    totals.set(event.player_id, (totals.get(event.player_id) ?? 0) + event.points)
  }
  return Object.fromEntries([...totals].sort(([left], [right]) => left.localeCompare(right)))
}

function compareStanding(
  left: Omit<SettlementReceiptStanding, 'rank'>,
  right: Omit<SettlementReceiptStanding, 'rank'>,
): number {
  if (right.total !== left.total) return right.total - left.total
  if (right.confidence_score !== left.confidence_score) {
    return right.confidence_score - left.confidence_score
  }
  if (right.correct_pick_count !== left.correct_pick_count) {
    return right.correct_pick_count - left.correct_pick_count
  }
  return right.top_correct_pick - left.top_correct_pick
}

export function settlementStandings(
  receipt: Pick<SettlementReceipt, 'players' | 'score_events'>,
  events: SettlementReceiptScoreEvent[] = receipt.score_events,
): SettlementReceiptStanding[] {
  const rows = receipt.players.map((player) => {
    const playerEvents = events.filter((event) => event.player_id === player.id)
    const predictions = playerEvents.filter((event) => event.kind === 'prediction')
    return {
      player_id: player.id,
      total: playerEvents.reduce((sum, event) => sum + event.points, 0),
      confidence_score: predictions.reduce((sum, event) => sum + event.points, 0),
      correct_pick_count: predictions.length,
      top_correct_pick: predictions.reduce((highest, event) => Math.max(highest, event.points), 0),
    }
  }).sort((left, right) => compareStanding(left, right) || left.player_id.localeCompare(right.player_id))

  const ranked: SettlementReceiptStanding[] = []
  rows.forEach((row, index) => {
    ranked.push({
      ...row,
      rank: index > 0 && compareStanding(rows[index - 1], row) === 0
        ? ranked[index - 1].rank
        : index + 1,
    })
  })
  return ranked
}

export function settlementCharacterPoints(
  receipt: Pick<SettlementReceipt, 'score_events'>,
): Record<string, number> {
  const totals = new Map<string, number>()
  for (const event of receipt.score_events) {
    if (!event.character_id) continue
    totals.set(event.character_id, (totals.get(event.character_id) ?? 0) + event.points)
  }
  return Object.fromEntries(
    [...totals].filter(([, points]) => points !== 0).sort(([left], [right]) => left.localeCompare(right)),
  )
}

export function createSettlementReceipt(input: SettlementReceipt): SettlementReceipt {
  return parseSettlementReceipt(JSON.stringify(input))
}

export function serializeSettlementReceipt(receipt: SettlementReceipt): string {
  const canonical = createSettlementReceipt(receipt)
  return `${JSON.stringify(canonical, null, 2)}\n`
}
