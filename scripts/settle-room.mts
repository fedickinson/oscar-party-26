/**
 * settle-room — promote a researched record and close one room atomically.
 *
 * The default is a read-only local dry run. Applying requires both --apply and
 * --confirm-room CODE. Production additionally requires SUPABASE_TARGET=remote
 * and a non-Vite SUPABASE_SERVICE_ROLE_KEY in .env.local.
 *
 *   npx tsx scripts/settle-room.mts --room CODE --manifest record.json
 *   npx tsx scripts/settle-room.mts --room CODE --manifest record.json --apply --confirm-room CODE --receipt receipt.json
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { computePlayerBingoScores } from '../src/lib/bingo-utils'
import { buildCanonicalRoomRecord } from '../src/lib/room-record'
import { computeLeaderboard } from '../src/lib/scoring'
import { tallyEntityPoints } from '../src/lib/night-awards'
import { normalizeExpectedLedger } from '../src/lib/settlement-ledger'
import { parseSettlementManifest } from '../src/lib/settlement-manifest'
import {
  settlementCharacterPoints,
  settlementPlayerTotals,
  serializeSettlementReceipt,
} from '../src/lib/settlement-receipt'
import {
  buildPostCloseSettlementReceipt,
  buildSettlementReceiptEvidence,
  buildSettlementReceiptFacts,
} from '../src/lib/settlement-evidence'
import { buildSettlementPreview } from '../src/lib/settlement-preview'
import {
  buildSettlementDeltaReport,
  formatSettlementDeltaReport,
} from '../src/lib/settlement-delta'
import { supabaseConfig } from './lib/env.mts'
import { assertOutputDoesNotAliasSource, writeUtf8FileSafely } from './lib/safe-write.mts'
import type {
  BingoCardRow,
  BingoMarkRow,
  BingoSquareRow,
  CategoryRow,
  ConfidencePickRow,
  ConvictionPickRow,
  DraftEntityRow,
  DraftPickRow,
  NomineeRow,
  PlayerRow,
  RoomSettlementBingoMarkRow,
  RoomSettlementEntryRow,
  RoomSettlementRow,
  RoomWinnerRow,
  RoomRow,
  ShowPackRow,
} from '../src/types/database'

function arg(name: string): string | null {
  const index = process.argv.indexOf(name)
  return index >= 0 ? (process.argv[index + 1] ?? null) : null
}

function requiredArg(name: string): string {
  const value = arg(name)
  if (!value) throw new Error(`${name} is required`)
  return value
}

const roomCode = requiredArg('--room').toUpperCase()
const manifestPath = resolve(requiredArg('--manifest'))
const shouldApply = process.argv.includes('--apply')
const confirmedRoom = arg('--confirm-room')?.toUpperCase() ?? null
const receiptPath = arg('--receipt') ? resolve(arg('--receipt') as string) : null
const forceReceipt = process.argv.includes('--force-receipt')
if (receiptPath && !shouldApply) throw new Error('--receipt requires --apply so the receipt can name an actual settlement')
if (forceReceipt && !receiptPath) throw new Error('--force-receipt requires --receipt PATH')
if (receiptPath) {
  assertOutputDoesNotAliasSource(receiptPath, [
    { label: 'settlement manifest with a receipt', path: manifestPath },
  ])
}
if (receiptPath && existsSync(receiptPath) && !forceReceipt) {
  throw new Error(`receipt already exists: ${receiptPath}; pass --force-receipt to replace it`)
}
const rawManifest = readFileSync(manifestPath, 'utf8')
const manifest = parseSettlementManifest(rawManifest)
const { target, url, anonKey, serviceKey } = supabaseConfig('local')
const readKey = anonKey

async function request(path: string, key = readKey, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${response.status} ${text.slice(0, 500)}`)
  return text ? JSON.parse(text) : null
}

async function rows<T>(path: string): Promise<T[]> {
  const pageSize = 1000
  const allRows: T[] = []

  for (let from = 0; ; from += pageSize) {
    const page = await request(path, readKey, {
      headers: {
        'Range-Unit': 'items',
        Range: `${from}-${from + pageSize - 1}`,
      },
    }) as T[]
    allRows.push(...page)
    if (page.length < pageSize) return allRows
  }
}

const [room] = await rows<{
  id: string
  code: string
  phase: string
  show_pack_id: string
  active_settlement_id: string | null
  game_model: RoomRow['game_model']
}>(
  `rooms?code=eq.${encodeURIComponent(roomCode)}&select=id,code,phase,show_pack_id,active_settlement_id,game_model`,
)
if (!room) throw new Error(`room ${roomCode} not found`)
if (!['finished', 'closed'].includes(room.phase)) {
  throw new Error(`room ${roomCode} must be finished before settlement; phase is ${room.phase}`)
}

const [
  players, categories, nominees, confidencePicks, convictionPicks, draftPicks, draftEntities,
  bingoCards, bingoSquares, roomWinners,
] = await Promise.all([
  rows<PlayerRow>(`players?room_id=eq.${room.id}&select=*&order=created_at.asc,id.asc`),
  rows<CategoryRow>(`categories?or=(show_pack_id.eq.${room.show_pack_id},room_id.eq.${room.id})&select=*&order=display_order.asc,id.asc`),
  rows<NomineeRow>(`nominees?show_pack_id=eq.${room.show_pack_id}&select=*&order=id.asc`),
  rows<ConfidencePickRow>(`confidence_picks?room_id=eq.${room.id}&select=*&order=id.asc`),
  rows<ConvictionPickRow>(`conviction_picks?room_id=eq.${room.id}&select=*&order=player_id.asc,beat_id.asc`),
  rows<DraftPickRow>(`draft_picks?room_id=eq.${room.id}&select=*&order=id.asc`),
  rows<DraftEntityRow>(`draft_entities?show_pack_id=eq.${room.show_pack_id}&select=*&order=id.asc`),
  rows<BingoCardRow>(`bingo_cards?room_id=eq.${room.id}&select=*&order=id.asc`),
  rows<BingoSquareRow>(`bingo_squares?show_pack_id=eq.${room.show_pack_id}&select=*&order=id.asc`),
  rows<RoomWinnerRow>(`room_winners?room_id=eq.${room.id}&select=*&order=category_id.asc`),
])
const liveMarks = bingoCards.length === 0
  ? []
  : await rows<BingoMarkRow>(`bingo_marks?card_id=in.(${bingoCards.map((card) => card.id).join(',')})&select=*&order=id.asc`)
const [activeSettlementRows, activeSettlementEntries, activeSettlementMarks] = room.active_settlement_id === null
  ? [[], [], []] as [RoomSettlementRow[], RoomSettlementEntryRow[], RoomSettlementBingoMarkRow[]]
  : await Promise.all([
      rows<RoomSettlementRow>(`room_settlements?id=eq.${room.active_settlement_id}&select=*`),
      rows<RoomSettlementEntryRow>(`room_settlement_entries?settlement_id=eq.${room.active_settlement_id}&select=*&order=display_order.asc,id.asc`),
      rows<RoomSettlementBingoMarkRow>(`room_settlement_bingo_marks?settlement_id=eq.${room.active_settlement_id}&select=*&order=card_id.asc,square_index.asc`),
    ])
if (room.phase === 'closed' && activeSettlementRows.length !== 1) {
  throw new Error(`closed room ${roomCode} must have one active settlement`)
}

const preview = buildSettlementPreview({
  manifest,
  room,
  players,
  categories,
  nominees,
  confidencePicks,
  convictionPicks,
  draftPicks,
  draftEntities,
  bingoCards,
  bingoSquares,
  liveMarks,
  roomWinners,
  activeSettlements: activeSettlementRows,
  activeSettlementEntries,
  activeSettlementMarks,
})
const {
  beforeRecord,
  resolvedEntries,
  resolvedBingoMarks,
  manifestHash,
  playerTotals: actualPlayerTotals,
  characterPoints: actualCharacterPoints,
  beforePlayerTotals,
  beforeCharacterPoints,
  inputSnapshot,
} = preview

function sameLedger(expected: Record<string, number>, actual: Record<string, number>, label: string): void {
  const expectedKeys = Object.keys(expected).sort()
  const actualKeys = Object.keys(actual).sort()
  if (JSON.stringify(expectedKeys) !== JSON.stringify(actualKeys)) {
    throw new Error(`${label} keys differ: expected [${expectedKeys.join(', ')}], got [${actualKeys.join(', ')}]`)
  }
  const mismatch = expectedKeys.find((key) => expected[key] !== actual[key])
  if (mismatch) throw new Error(`${label} mismatch for ${mismatch}: expected ${expected[mismatch]}, got ${actual[mismatch]}`)
}

const deltaReport = buildSettlementDeltaReport({
  before: beforeRecord.source === 'live'
    ? { source: 'live', categories: beforeRecord.categories }
    : { source: 'settled', entries: activeSettlementEntries },
  after_entries: resolvedEntries,
  nominees,
  players: players.map((player) => ({ id: player.id, name: player.name })),
  characters: draftEntities.map((entity) => ({ id: entity.id, name: entity.name })),
  before_player_totals: beforePlayerTotals,
  after_player_totals: actualPlayerTotals,
  before_character_points: beforeCharacterPoints,
  after_character_points: actualCharacterPoints,
  before_bingo_marks: beforeRecord.bingoMarks
    .filter((mark) => mark.status === 'approved')
    .map((mark) => ({ card_id: mark.card_id, square_index: mark.square_index })),
  after_bingo_marks: resolvedBingoMarks.map((mark) => ({
    card_id: mark.card_id,
    square_index: mark.square_index,
  })),
})

console.log(`room: ${room.code} (${room.phase})`)
console.log(`manifest: ${manifestHash}`)
console.log(`record entries: ${resolvedEntries.length}`)
console.log(`bingo: ${manifest.bingo.mode} (${resolvedBingoMarks.length} marks)`)
for (const line of formatSettlementDeltaReport(deltaReport)) console.log(line)
console.log('preflight: passed')

if (!shouldApply) {
  console.log('dry run only; no rows were written and the room was not closed')
  process.exit(0)
}
if (confirmedRoom !== roomCode) {
  throw new Error(`--confirm-room ${roomCode} is required to apply`)
}
if (!serviceKey) {
  const location = target === 'remote' ? '.env.local' : 'the local Supabase status output'
  throw new Error(`service role key missing from ${location}`)
}

const rpcEntries = resolvedEntries.map(({ id: _id, settlement_id: _settlementId, ...entry }) => entry)
const rpcMarks = resolvedBingoMarks.map(({ settlement_id: _settlementId, ...mark }) => mark)
const result = await request('rpc/settle_room_checked', serviceKey, {
  method: 'POST',
  body: JSON.stringify({
    p_room_code: roomCode,
    p_manifest_hash: manifestHash,
    p_title: manifest.title,
    p_actor: manifest.actor,
    p_bingo_mode: manifest.bingo.mode,
    p_entries: rpcEntries,
    p_bingo_marks: rpcMarks,
    p_input_snapshot: inputSnapshot,
  }),
}) as Array<{ settlement_id: string; settlement_version: number; applied: boolean }>
const applied = result[0]
if (!applied) throw new Error('settle_room_checked returned no result')
console.log(
  applied.applied
    ? `applied settlement v${applied.settlement_version}; room ${roomCode} is closed`
    : `settlement v${applied.settlement_version} was already active; no rows changed`,
)

// The preflight above is deliberately provisional: players can still write
// until settle_room_checked takes its room lock and proves the exact input
// snapshot. Re-read every
// scoring input after closure and build the receipt only from that frozen
// state, so a legal last-moment write cannot leave a stale evidence file.
const [closedRoom] = await rows<
  Pick<RoomRow, 'id' | 'code' | 'phase' | 'show_pack_id' | 'game_model'>
  & { active_settlement_id: string | null }
>(`rooms?id=eq.${room.id}&select=id,code,phase,show_pack_id,active_settlement_id,game_model`)
if (!closedRoom || closedRoom.phase !== 'closed') {
  throw new Error(`post-close verification expected room ${roomCode} to be closed`)
}
if (closedRoom.active_settlement_id !== applied.settlement_id) {
  throw new Error(
    `post-close verification expected active settlement ${applied.settlement_id}; got ${closedRoom.active_settlement_id ?? 'none'}`,
  )
}
const [closedShowPack] = await rows<Pick<ShowPackRow, 'id' | 'pack_key' | 'version'>>(
  `show_packs?id=eq.${closedRoom.show_pack_id}&select=id,pack_key,version`,
)
if (!closedShowPack || closedShowPack.id !== closedRoom.show_pack_id) {
  throw new Error(`post-close verification could not attest show pack ${closedRoom.show_pack_id}`)
}

const [
  closedPlayers, closedCategories, closedNominees, closedConfidencePicks, closedConvictionPicks,
  closedDraftPicks, closedDraftEntities, closedBingoCards, closedBingoSquares,
  closedSettlementRows, closedEntryRows, closedMarkRows,
] = await Promise.all([
  rows<PlayerRow>(`players?room_id=eq.${closedRoom.id}&select=*&order=created_at.asc,id.asc`),
  rows<CategoryRow>(`categories?or=(show_pack_id.eq.${closedRoom.show_pack_id},room_id.eq.${closedRoom.id})&select=*&order=display_order.asc,id.asc`),
  rows<NomineeRow>(`nominees?show_pack_id=eq.${closedRoom.show_pack_id}&select=*&order=id.asc`),
  rows<ConfidencePickRow>(`confidence_picks?room_id=eq.${closedRoom.id}&select=*&order=id.asc`),
  rows<ConvictionPickRow>(`conviction_picks?room_id=eq.${closedRoom.id}&select=*&order=player_id.asc,beat_id.asc`),
  rows<DraftPickRow>(`draft_picks?room_id=eq.${closedRoom.id}&select=*&order=id.asc`),
  rows<DraftEntityRow>(`draft_entities?show_pack_id=eq.${closedRoom.show_pack_id}&select=*&order=id.asc`),
  rows<BingoCardRow>(`bingo_cards?room_id=eq.${closedRoom.id}&select=*&order=id.asc`),
  rows<BingoSquareRow>(`bingo_squares?show_pack_id=eq.${closedRoom.show_pack_id}&select=*&order=id.asc`),
  rows<RoomSettlementRow>(`room_settlements?id=eq.${applied.settlement_id}&select=*`),
  rows<RoomSettlementEntryRow>(`room_settlement_entries?settlement_id=eq.${applied.settlement_id}&select=*&order=display_order.asc,id.asc`),
  rows<RoomSettlementBingoMarkRow>(`room_settlement_bingo_marks?settlement_id=eq.${applied.settlement_id}&select=*&order=card_id.asc,square_index.asc`),
])
const closedSettlement = closedSettlementRows[0]
if (!closedSettlement
  || closedSettlement.version !== applied.settlement_version
  || closedSettlement.manifest_hash !== manifestHash) {
  throw new Error('post-close verification loaded the wrong settlement version or manifest')
}

const closedRecord = buildCanonicalRoomRecord({
  activeSettlementId: closedRoom.active_settlement_id,
  categories: closedCategories,
  roomWinners: [],
  confidencePicks: closedConfidencePicks,
  bingoMarks: [],
  settlements: closedSettlementRows,
  settlementEntries: closedEntryRows,
  settlementBingoMarks: closedMarkRows,
})
if (closedRecord.source !== 'settled') {
  throw new Error('post-close verification did not resolve the settled record')
}
const closedBingoById = new Map(closedBingoSquares.map((square) => [square.id, square]))
const { scores: closedBingoScores } = computePlayerBingoScores(
  closedPlayers, closedBingoCards, closedRecord.bingoMarks, closedBingoById,
)
const closedLeaderboard = computeLeaderboard(
  closedPlayers, closedRecord.confidencePicks, closedDraftPicks, closedDraftEntities,
  closedRecord.categories, closedNominees, closedBingoScores,
  closedConvictionPicks, closedRoom.game_model ?? 'legacy_ensemble',
)
const closedEntityTallies = closedRoom.game_model === 'conviction_portfolio'
  ? new Map()
  : tallyEntityPoints(
      closedRecord.categories, closedNominees, closedDraftEntities, closedDraftPicks, closedPlayers,
    )
const closedPlayerTotals = Object.fromEntries(
  closedLeaderboard.map((row) => [row.player.id, row.totalScore]),
)
const closedCharacterPoints = Object.fromEntries(
  [...closedEntityTallies.values()]
    .filter((tally) => tally.points !== 0)
    .sort((left, right) => left.entity.id.localeCompare(right.entity.id))
    .map((tally) => [tally.entity.id, tally.points]),
)
const closedReceiptEvidence = buildSettlementReceiptEvidence({
  players: closedPlayers,
  categories: closedRecord.categories,
  nominees: closedNominees,
  draftEntities: closedDraftEntities,
  draftPicks: closedDraftPicks,
  confidencePicks: closedRecord.confidencePicks,
  convictionPicks: closedConvictionPicks,
  gameModel: closedRoom.game_model ?? 'legacy_ensemble',
  bingoCards: closedBingoCards,
  bingoSquares: closedBingoSquares,
  bingoMarks: closedRecord.bingoMarks,
})
const closedReceiptFacts = buildSettlementReceiptFacts(closedEntryRows, closedNominees)

sameLedger(
  normalizeExpectedLedger(manifest.expected.player_totals, closedPlayers, 'player totals'),
  closedPlayerTotals,
  'post-close player totals',
)
sameLedger(
  normalizeExpectedLedger(manifest.expected.character_points, closedDraftEntities, 'character points'),
  closedCharacterPoints,
  'post-close character points',
)
sameLedger(
  settlementPlayerTotals(closedReceiptEvidence),
  closedPlayerTotals,
  'post-close receipt player evidence',
)
sameLedger(
  settlementCharacterPoints(closedReceiptEvidence),
  closedCharacterPoints,
  'post-close receipt character evidence',
)
console.log('post-close record: frozen reread verified')

if (receiptPath) {
  const receipt = buildPostCloseSettlementReceipt({
    room: closedRoom,
    settlement: closedSettlement,
    showPack: closedShowPack,
    facts: closedReceiptFacts,
    evidence: closedReceiptEvidence,
  })
  const receiptBytes = serializeSettlementReceipt(receipt)
  const receiptHash = createHash('sha256').update(receiptBytes).digest('hex')
  writeUtf8FileSafely(receiptPath, receiptBytes, forceReceipt)
  console.log(`receipt: ${receiptPath}`)
  console.log(`receipt sha256: ${receiptHash}`)
}
