import { computePlayerBingoScores } from './bingo-utils'
import { tallyEntityPoints } from './night-awards'
import { buildCanonicalRoomRecord } from './room-record'
import { computeLeaderboard } from './scoring'
import {
  buildReferenceIndex,
  normalizeExpectedLedger,
  resolveReference,
} from './settlement-ledger'
import {
  assertResolvedSettlementReferences,
  settlementIdentityPayload,
  type SettlementManifest,
} from './settlement-manifest'
import {
  buildSettlementReceiptEvidence,
  type SettlementReceiptEvidence,
} from './settlement-evidence'
import { settlementCharacterPoints, settlementPlayerTotals } from './settlement-receipt'
import { buildSettlementInputSnapshot, type SettlementInputSnapshot } from './settlement-input'
import { sha256Hex } from './sha256'
import type {
  BingoCardRow,
  BingoMarkRow,
  BingoSquareRow,
  CategoryRow,
  ConfidencePickRow,
  ConvictionPickRow,
  DraftEntityRow,
  DraftPickRow,
  GameModel,
  NomineeRow,
  PlayerRow,
  RoomSettlementBingoMarkRow,
  RoomSettlementEntryRow,
  RoomSettlementRow,
  RoomWinnerRow,
} from '../types/database'

export interface SettlementPreviewInput {
  manifest: SettlementManifest
  room: {
    id: string
    active_settlement_id: string | null
    game_model: GameModel | null
  }
  players: PlayerRow[]
  categories: CategoryRow[]
  nominees: NomineeRow[]
  confidencePicks: ConfidencePickRow[]
  convictionPicks: ConvictionPickRow[]
  draftPicks: DraftPickRow[]
  draftEntities: DraftEntityRow[]
  bingoCards: BingoCardRow[]
  bingoSquares: BingoSquareRow[]
  liveMarks: BingoMarkRow[]
  roomWinners: RoomWinnerRow[]
  activeSettlements: RoomSettlementRow[]
  activeSettlementEntries: RoomSettlementEntryRow[]
  activeSettlementMarks: RoomSettlementBingoMarkRow[]
}

export interface SettlementPreview {
  beforeRecord: ReturnType<typeof buildCanonicalRoomRecord>
  resolvedEntries: RoomSettlementEntryRow[]
  resolvedBingoMarks: RoomSettlementBingoMarkRow[]
  manifestHash: string
  previewSettlement: RoomSettlementRow
  playerTotals: Record<string, number>
  characterPoints: Record<string, number>
  beforePlayerTotals: Record<string, number>
  beforeCharacterPoints: Record<string, number>
  receiptEvidence: SettlementReceiptEvidence
  inputSnapshot: SettlementInputSnapshot
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    )
  }
  return value
}

function sameLedger(
  expected: Record<string, number>,
  actual: Record<string, number>,
  label: string,
): void {
  const expectedKeys = Object.keys(expected).sort()
  const actualKeys = Object.keys(actual).sort()
  if (JSON.stringify(expectedKeys) !== JSON.stringify(actualKeys)) {
    throw new Error(`${label} keys differ: expected [${expectedKeys.join(', ')}], got [${actualKeys.join(', ')}]`)
  }
  const mismatch = expectedKeys.find((key) => expected[key] !== actual[key])
  if (mismatch) {
    throw new Error(`${label} mismatch for ${mismatch}: expected ${expected[mismatch]}, got ${actual[mismatch]}`)
  }
}

export function buildSettlementPreview(
  input: SettlementPreviewInput,
  options: { verifyExpected?: boolean; nowIso?: string } = {},
): SettlementPreview {
  const { manifest, room } = input
  const gameModel = room.game_model ?? 'legacy_ensemble'
  const beforeRecord = buildCanonicalRoomRecord({
    activeSettlementId: room.active_settlement_id,
    categories: input.categories,
    roomWinners: input.roomWinners,
    confidencePicks: input.confidencePicks,
    bingoMarks: input.liveMarks,
    settlements: input.activeSettlements,
    settlementEntries: input.activeSettlementEntries,
    settlementBingoMarks: input.activeSettlementMarks,
  })
  const bingoById = new Map(input.bingoSquares.map((square) => [square.id, square]))
  const { scores: beforeBingoScores } = computePlayerBingoScores(
    input.players, input.bingoCards, beforeRecord.bingoMarks, bingoById,
  )
  const beforeLeaderboard = computeLeaderboard(
    input.players, beforeRecord.confidencePicks, input.draftPicks, input.draftEntities,
    beforeRecord.categories, input.nominees, beforeBingoScores,
    input.convictionPicks, gameModel,
  )
  const beforeEntityTallies = gameModel === 'conviction_portfolio'
    ? new Map()
    : tallyEntityPoints(
      beforeRecord.categories, input.nominees, input.draftEntities,
      input.draftPicks, input.players,
    )

  const nomineeIndex = buildReferenceIndex(input.nominees)
  const authoredById = new Map(input.categories.map((category) => [category.id, category]))
  const resolvedEntries: RoomSettlementEntryRow[] = manifest.entries.map((entry, index) => {
    const winner = entry.winner
      ? resolveReference(entry.winner, nomineeIndex, `entry ${entry.key}: winner`)
      : null
    const tieWinner = entry.tie_winner
      ? resolveReference(entry.tie_winner, nomineeIndex, `entry ${entry.key}: tie winner`)
      : null
    const authored = entry.category_id == null ? null : authoredById.get(entry.category_id)
    if (entry.category_id != null && !authored) {
      throw new Error(`entry ${entry.key}: category ${entry.category_id} not found`)
    }
    if (authored && authored.points !== entry.points) {
      throw new Error(`entry ${entry.key}: category ${entry.category_id} is worth ${authored.points}, not ${entry.points}`)
    }
    return {
      id: index + 1,
      settlement_id: 'preview',
      entry_key: entry.key,
      name: entry.name,
      category_id: entry.category_id ?? null,
      outcome: entry.outcome,
      points: entry.points,
      winner_id: winner?.id ?? null,
      tie_winner_id: tieWinner?.id ?? null,
      display_order: index + 1,
      occurred_at: entry.occurred_at ?? null,
      warrant: structuredClone(entry.warrant),
    }
  })

  const playerIndex = buildReferenceIndex(input.players)
  const cardByPlayer = new Map(input.bingoCards.map((card) => [card.player_id, card]))
  const squareBySlug = new Map(input.bingoSquares.map((square) => [square.slug, square]))
  const resolvedBingoMarks: RoomSettlementBingoMarkRow[] = manifest.bingo.mode === 'preserve_live'
    ? input.liveMarks
      .filter((mark) => mark.status === 'approved')
      .map((mark) => ({
        settlement_id: 'preview',
        card_id: mark.card_id,
        square_index: mark.square_index,
        marked_at: mark.marked_at,
        warrant: structuredClone(manifest.bingo.warrant!),
      }))
    : (manifest.bingo.marks ?? []).map((mark) => {
        const player = resolveReference(mark.player, playerIndex, 'bingo player')
        const card = cardByPlayer.get(player.id)
        if (!card) throw new Error(`bingo player ${player.name} has no card`)
        const square = squareBySlug.get(mark.square_slug)
        if (!square) throw new Error(`bingo square ${mark.square_slug} not found`)
        const squareIndex = card.squares.indexOf(square.id)
        if (squareIndex < 0) throw new Error(`${player.name}'s card does not contain ${mark.square_slug}`)
        return {
          settlement_id: 'preview',
          card_id: card.id,
          square_index: squareIndex,
          marked_at: mark.marked_at ?? options.nowIso ?? new Date().toISOString(),
          warrant: structuredClone(mark.warrant),
        }
      })
  assertResolvedSettlementReferences(resolvedEntries, resolvedBingoMarks)

  const manifestHash = sha256Hex(JSON.stringify(canonicalize(settlementIdentityPayload(
    manifest,
    resolvedEntries,
    resolvedBingoMarks,
  ))))
  const previewSettlement: RoomSettlementRow = {
    id: 'preview',
    room_id: room.id,
    version: 1,
    manifest_hash: manifestHash,
    title: manifest.title,
    actor: manifest.actor,
    bingo_mode: manifest.bingo.mode,
    supersedes_id: null,
    created_at: options.nowIso ?? new Date().toISOString(),
  }
  const record = buildCanonicalRoomRecord({
    activeSettlementId: previewSettlement.id,
    categories: input.categories,
    roomWinners: input.roomWinners,
    confidencePicks: input.confidencePicks,
    bingoMarks: input.liveMarks,
    settlements: [previewSettlement],
    settlementEntries: resolvedEntries,
    settlementBingoMarks: resolvedBingoMarks,
  })
  const { scores: bingoScores } = computePlayerBingoScores(
    input.players, input.bingoCards, record.bingoMarks, bingoById,
  )
  const leaderboard = computeLeaderboard(
    input.players, record.confidencePicks, input.draftPicks, input.draftEntities,
    record.categories, input.nominees, bingoScores, input.convictionPicks, gameModel,
  )
  const entityTallies = gameModel === 'conviction_portfolio'
    ? new Map()
    : tallyEntityPoints(
      record.categories, input.nominees, input.draftEntities,
      input.draftPicks, input.players,
    )
  const playerTotals = Object.fromEntries(
    leaderboard.map((row) => [row.player.id, row.totalScore]),
  )
  const characterPoints = Object.fromEntries(
    [...entityTallies.values()]
      .filter((tally) => tally.points !== 0)
      .sort((left, right) => left.entity.id.localeCompare(right.entity.id))
      .map((tally) => [tally.entity.id, tally.points]),
  )
  const beforePlayerTotals = Object.fromEntries(
    beforeLeaderboard.map((row) => [row.player.id, row.totalScore]),
  )
  const beforeCharacterPoints = Object.fromEntries(
    [...beforeEntityTallies.values()]
      .filter((tally) => tally.points !== 0)
      .sort((left, right) => left.entity.id.localeCompare(right.entity.id))
      .map((tally) => [tally.entity.id, tally.points]),
  )
  const receiptEvidence = buildSettlementReceiptEvidence({
    players: input.players,
    categories: record.categories,
    nominees: input.nominees,
    draftEntities: input.draftEntities,
    draftPicks: input.draftPicks,
    confidencePicks: record.confidencePicks,
    convictionPicks: input.convictionPicks,
    gameModel,
    bingoCards: input.bingoCards,
    bingoSquares: input.bingoSquares,
    bingoMarks: record.bingoMarks,
  })
  const inputSnapshot = buildSettlementInputSnapshot({
    players: input.players,
    confidencePicks: input.confidencePicks,
    convictionPicks: input.convictionPicks,
    draftPicks: input.draftPicks,
    bingoCards: input.bingoCards,
    bingoMarks: input.liveMarks,
  })

  if (options.verifyExpected !== false) {
    sameLedger(
      normalizeExpectedLedger(manifest.expected.player_totals, input.players, 'player totals'),
      playerTotals,
      'player totals',
    )
    sameLedger(
      normalizeExpectedLedger(manifest.expected.character_points, input.draftEntities, 'character points'),
      characterPoints,
      'character points',
    )
  }
  sameLedger(settlementPlayerTotals(receiptEvidence), playerTotals, 'receipt player evidence')
  sameLedger(settlementCharacterPoints(receiptEvidence), characterPoints, 'receipt character evidence')

  return {
    beforeRecord,
    resolvedEntries,
    resolvedBingoMarks,
    manifestHash,
    previewSettlement,
    playerTotals,
    characterPoints,
    beforePlayerTotals,
    beforeCharacterPoints,
    receiptEvidence,
    inputSnapshot,
  }
}
