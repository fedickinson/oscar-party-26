#!/usr/bin/env -S npx tsx

/**
 * Reconstructs the canonical portable receipt for an already-closed room.
 * This is a read-only recovery/export path: it never calls a write RPC and it
 * never needs the original settlement manifest.
 */
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildCanonicalRoomRecord } from '../src/lib/room-record'
import {
  buildPostCloseSettlementReceipt,
  buildSettlementReceiptEvidence,
  buildSettlementReceiptFacts,
} from '../src/lib/settlement-evidence'
import { serializeSettlementReceipt } from '../src/lib/settlement-receipt'
import { fetchAllRows } from '../src/hooks/fetch-all-rows'
import { supabaseConfig } from './lib/env.mts'
import { writeUtf8FileSafely } from './lib/safe-write.mts'
import type {
  BingoCardRow,
  BingoSquareRow,
  CategoryRow,
  ConfidencePickRow,
  ConvictionPickRow,
  DraftEntityRow,
  DraftPickRow,
  NomineeRow,
  PlayerRow,
  RoomRow,
  RoomSettlementBingoMarkRow,
  RoomSettlementEntryRow,
  RoomSettlementRow,
  ShowPackRow,
} from '../src/types/database'

interface Options {
  roomCode: string
  outputPath: string
  force: boolean
  confirmedRoom: string | null
}

function usage(): never {
  throw new Error(
    'Usage: npx tsx scripts/export-settlement-receipt.mts ' +
    '--room CODE --output RECEIPT.json [--force] [--confirm-room CODE]',
  )
}

function parseArgs(argv: string[]): Options {
  let roomCode = ''
  let outputPath = ''
  let force = false
  let confirmedRoom: string | null = null
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--room') roomCode = argv[++index] ?? ''
    else if (argument === '--output') outputPath = argv[++index] ?? ''
    else if (argument === '--confirm-room') confirmedRoom = (argv[++index] ?? '').toUpperCase()
    else if (argument === '--force') force = true
    else if (argument === '--help' || argument === '-h') usage()
    else throw new Error(`unknown argument ${argument}`)
  }
  roomCode = roomCode.trim().toUpperCase()
  if (!roomCode || !outputPath) usage()
  return {
    roomCode,
    outputPath: resolve(outputPath),
    force,
    confirmedRoom: confirmedRoom?.trim() || null,
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  if (existsSync(options.outputPath) && !options.force) {
    throw new Error(`output already exists: ${options.outputPath}; pass --force to replace it`)
  }

  const { target, url, serviceKey } = supabaseConfig('local')
  if (target === 'remote' && options.confirmedRoom !== options.roomCode) {
    throw new Error(`production receipt export requires --confirm-room ${options.roomCode}`)
  }
  if (!serviceKey) {
    const location = target === 'remote' ? '.env.local' : 'the local Supabase status output'
    throw new Error(`service role key missing from ${location}`)
  }

  async function request(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await fetch(`${url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    })
    const body = await response.text()
    if (!response.ok) {
      throw new Error(`${init.method ?? 'GET'} ${path} -> ${response.status} ${body.slice(0, 500)}`)
    }
    return body ? JSON.parse(body) : null
  }

  async function rows<Row>(path: string): Promise<Row[]> {
    const result = await fetchAllRows<Row, unknown>(async (from, to) => {
      try {
        return {
          data: await request(path, {
            headers: { Range: `${from}-${to}`, 'Range-Unit': 'items' },
          }) as Row[],
          error: null,
        }
      } catch (error) {
        return { data: null, error }
      }
    })
    if (result.error) throw result.error
    return result.data ?? []
  }

  type ReceiptRoom = Pick<RoomRow, 'id' | 'code' | 'phase' | 'show_pack_id' | 'game_model'> & {
    active_settlement_id: string | null
  }
  const roomRows = await rows<ReceiptRoom>(
    `rooms?code=eq.${encodeURIComponent(options.roomCode)}` +
    '&select=id,code,phase,show_pack_id,active_settlement_id,game_model',
  )
  if (roomRows.length !== 1) {
    throw new Error(`expected one room ${options.roomCode}, found ${roomRows.length}`)
  }
  const room = roomRows[0]
  if (room.phase !== 'closed' || room.active_settlement_id === null) {
    throw new Error(`room ${options.roomCode} must be closed with one active settlement`)
  }

  const settlementId = room.active_settlement_id
  const scope = `or=(show_pack_id.eq.${room.show_pack_id},room_id.eq.${room.id})`
  const [
    showPacks, players, categories, nominees, confidencePicks, convictionPicks, draftPicks,
    draftEntities, bingoCards, bingoSquares, settlements, settlementEntries,
    settlementMarks,
  ] = await Promise.all([
    rows<Pick<ShowPackRow, 'id' | 'pack_key' | 'version'>>(
      `show_packs?id=eq.${room.show_pack_id}&select=id,pack_key,version`,
    ),
    rows<PlayerRow>(`players?room_id=eq.${room.id}&select=*&order=created_at.asc,id.asc`),
    rows<CategoryRow>(`categories?${scope}&select=*&order=display_order.asc,id.asc`),
    rows<NomineeRow>(`nominees?show_pack_id=eq.${room.show_pack_id}&select=*&order=id.asc`),
    rows<ConfidencePickRow>(`confidence_picks?room_id=eq.${room.id}&select=*&order=id.asc`),
    rows<ConvictionPickRow>(`conviction_picks?room_id=eq.${room.id}&select=*&order=player_id.asc,beat_id.asc`),
    rows<DraftPickRow>(`draft_picks?room_id=eq.${room.id}&select=*&order=id.asc`),
    rows<DraftEntityRow>(`draft_entities?show_pack_id=eq.${room.show_pack_id}&select=*&order=id.asc`),
    rows<BingoCardRow>(`bingo_cards?room_id=eq.${room.id}&select=*&order=id.asc`),
    rows<BingoSquareRow>(`bingo_squares?show_pack_id=eq.${room.show_pack_id}&select=*&order=id.asc`),
    rows<RoomSettlementRow>(`room_settlements?id=eq.${settlementId}&select=*`),
    rows<RoomSettlementEntryRow>(
      `room_settlement_entries?settlement_id=eq.${settlementId}&select=*&order=display_order.asc,id.asc`,
    ),
    rows<RoomSettlementBingoMarkRow>(
      `room_settlement_bingo_marks?settlement_id=eq.${settlementId}&select=*&order=card_id.asc,square_index.asc`,
    ),
  ])
  if (showPacks.length !== 1) {
    throw new Error(`expected one bound show pack ${room.show_pack_id}, found ${showPacks.length}`)
  }
  if (settlements.length !== 1) {
    throw new Error(`expected one active settlement ${settlementId}, found ${settlements.length}`)
  }

  const record = buildCanonicalRoomRecord({
    activeSettlementId: settlementId,
    categories,
    roomWinners: [],
    confidencePicks,
    bingoMarks: [],
    settlements,
    settlementEntries,
    settlementBingoMarks: settlementMarks,
  })
  if (record.source !== 'settled') {
    throw new Error(`room ${options.roomCode} did not resolve to its settled record`)
  }
  const evidence = buildSettlementReceiptEvidence({
    players,
    categories: record.categories,
    nominees,
    draftEntities,
    draftPicks,
    confidencePicks: record.confidencePicks,
    convictionPicks,
    gameModel: room.game_model ?? 'legacy_ensemble',
    bingoCards,
    bingoSquares,
    bingoMarks: record.bingoMarks,
  })
  const facts = buildSettlementReceiptFacts(settlementEntries, nominees)

  // Closed rows reject ordinary writes, but an operator can still append an
  // amendment. Bracket the multi-page read so an active-version change cannot
  // produce a receipt assembled across two canonical settlements.
  const finalRoomRows = await rows<ReceiptRoom>(
    `rooms?id=eq.${room.id}&select=id,code,phase,show_pack_id,active_settlement_id,game_model`,
  )
  const finalRoom = finalRoomRows[0]
  if (finalRoomRows.length !== 1 ||
      finalRoom.id !== room.id ||
      finalRoom.code !== room.code ||
      finalRoom.phase !== room.phase ||
      finalRoom.show_pack_id !== room.show_pack_id ||
      finalRoom.game_model !== room.game_model ||
      finalRoom.active_settlement_id !== room.active_settlement_id) {
    throw new Error('active settlement changed during receipt export; rerun against the new record')
  }

  const receipt = buildPostCloseSettlementReceipt({
    room,
    settlement: settlements[0],
    showPack: showPacks[0],
    facts,
    evidence,
  })
  const bytes = serializeSettlementReceipt(receipt)
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  writeUtf8FileSafely(options.outputPath, bytes, options.force)

  console.log('[settlement-receipt] mode=read-only')
  console.log(`[settlement-receipt] room=${room.code} settlement=${receipt.settlement_id}@${receipt.settlement_version}`)
  console.log(`[settlement-receipt] players=${receipt.players.length} characters=${receipt.characters.length}`)
  console.log(`[settlement-receipt] score_events=${receipt.score_events.length} facts=${receipt.settled_facts?.length ?? 0}`)
  console.log(`[settlement-receipt] output=${options.outputPath}`)
  console.log(`[settlement-receipt] sha256=${sha256}`)
}

main().catch((error) => {
  console.error(`[settlement-receipt] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
