#!/usr/bin/env -S npx tsx

/**
 * Prepares the private research boundary for one room settlement.
 *
 * Room mode is read-only and defaults to local. It copies provisional or
 * settled evidence into a deliberately invalid worksheet whose truth-bearing
 * fields remain null until a researcher decides them. Finalize mode extracts
 * only the closed settlement manifest contract and never contacts Supabase.
 */
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchAllRows } from '../src/hooks/fetch-all-rows'
import {
  buildSettlementAuthoringWorksheet,
  finalizeSettlementAuthoringWorksheet,
  serializeSettlementAuthoringWorksheet,
  type SettlementAuthoringInput,
} from '../src/lib/settlement-authoring'
import { supabaseConfig } from './lib/env.mts'
import {
  assertOutputDoesNotAliasSource,
  writeUtf8FileSafely,
} from './lib/safe-write.mts'

process.on('uncaughtException', (error) => {
  console.error(`[prepare-settlement] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
process.on('unhandledRejection', (error) => {
  console.error(`[prepare-settlement] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})

function arg(name: string): string | null {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : undefined
  return value && !value.startsWith('--') ? value : null
}

const roomArg = arg('--room')
const worksheetArg = arg('--worksheet')
const outputArg = arg('--output')
const manifestOutputArg = arg('--manifest-output')
const confirmedRoom = arg('--confirm-room')?.toUpperCase() ?? null
const force = process.argv.includes('--force')
if (Boolean(roomArg) === Boolean(worksheetArg)) {
  throw new Error('choose exactly one mode: --room CODE or --worksheet FILE')
}
if (roomArg && manifestOutputArg) throw new Error('--manifest-output belongs to --worksheet mode')
if (worksheetArg && outputArg) throw new Error('--output belongs to --room mode')
if (force && !outputArg && !manifestOutputArg) throw new Error('--force requires an output path')

const repositoryRoot = resolve(fileURLToPath(new URL('../', import.meta.url)))
const privateSettlementRoot = resolve(repositoryRoot, '.private/settlements')
mkdirSync(privateSettlementRoot, { recursive: true })
if (realpathSync(privateSettlementRoot) !== privateSettlementRoot) {
  throw new Error('private settlement lane must not be a symlink')
}

function privateSettlementPath(raw: string, label: string): string {
  const path = resolve(raw)
  if (dirname(path) !== privateSettlementRoot) {
    throw new Error(`${label} must be a direct child of ${privateSettlementRoot}`)
  }
  return path
}

function availableOutput(raw: string | null, label: string): string | null {
  if (!raw) return null
  const path = privateSettlementPath(raw, label)
  if (existsSync(path) && !force) {
    throw new Error(`${label} already exists: ${path}; pass --force to replace it`)
  }
  return path
}

const outputPath = availableOutput(outputArg, 'worksheet output')
const manifestOutputPath = availableOutput(manifestOutputArg, 'manifest output')

function digest(bytes: string): string {
  return createHash('sha256').update(bytes).digest('hex')
}

if (worksheetArg) {
  const worksheetPath = privateSettlementPath(worksheetArg, 'worksheet')
  if (!existsSync(worksheetPath)) throw new Error(`worksheet not found: ${worksheetPath}`)
  if (realpathSync(worksheetPath) !== worksheetPath) throw new Error('worksheet must not be a symlink')
  if (manifestOutputPath) {
    assertOutputDoesNotAliasSource(manifestOutputPath, [{
      label: 'the settlement authoring worksheet',
      path: worksheetPath,
    }])
  }
  const manifest = finalizeSettlementAuthoringWorksheet(readFileSync(worksheetPath, 'utf8'))
  const bytes = `${JSON.stringify(manifest, null, 2)}\n`
  console.log(`[prepare-settlement] manifest_sha256=${digest(bytes)}`)
  console.log(`[prepare-settlement] entries=${manifest.entries.length} bingo_mode=${manifest.bingo.mode}`)
  if (manifestOutputPath) {
    writeUtf8FileSafely(manifestOutputPath, bytes, force)
    console.log(`[prepare-settlement] manifest=${manifestOutputPath}`)
  } else {
    console.log('[prepare-settlement] manifest_dry_run=true; pass --manifest-output PATH to write')
  }
  process.exit(0)
}

const roomCode = (roomArg as string).toUpperCase()
const { target, url, anonKey } = supabaseConfig('local')
if (target === 'remote' && confirmedRoom !== roomCode) {
  throw new Error(`production preparation requires --confirm-room ${roomCode}`)
}

async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
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

type Input = SettlementAuthoringInput
const roomRows = await rows<Input['room']>(
  `rooms?code=eq.${encodeURIComponent(roomCode)}&select=id,code,phase,show_pack_id,active_settlement_id,game_model`,
)
if (roomRows.length !== 1) throw new Error(`expected one room ${roomCode}, found ${roomRows.length}`)
const room = roomRows[0]
if (room.phase !== 'finished' && room.phase !== 'closed') {
  throw new Error(`room ${roomCode} must be finished or closed; phase is ${room.phase}`)
}

const scope = `or=(show_pack_id.eq.${room.show_pack_id},room_id.eq.${room.id})`
const [showPacks, players, categories, nominees, roomWinners, confidencePicks,
  convictionPicks, signatureBeats, draftEntities, draftPicks, bingoCards, bingoSquares] = await Promise.all([
  rows<Input['showPack']>(
    `show_packs?id=eq.${room.show_pack_id}&select=id,pack_key,version,title,status`,
  ),
  rows<Input['players'][number]>(
    `players?room_id=eq.${room.id}&select=id,name,is_host&order=created_at.asc,id.asc`,
  ),
  rows<Input['categories'][number]>(
    `categories?${scope}&select=id,name,points,display_order,announced_at,show_pack_id,room_id,source_signature_beat_id&order=display_order.asc,id.asc`,
  ),
  rows<Input['nominees'][number]>(
    `nominees?show_pack_id=eq.${room.show_pack_id}&select=id,name,type,film_name&order=id.asc`,
  ),
  rows<Input['roomWinners'][number]>(
    `room_winners?room_id=eq.${room.id}&select=category_id,winner_id,tie_winner_id&order=category_id.asc`,
  ),
  rows<Input['confidencePicks'][number]>(
    `confidence_picks?room_id=eq.${room.id}&select=id,player_id,category_id,nominee_id,confidence&order=id.asc`,
  ),
  rows<NonNullable<Input['convictionPicks']>[number]>(
    `conviction_picks?room_id=eq.${room.id}&select=player_id,beat_id&order=beat_id.asc,player_id.asc`,
  ),
  rows<NonNullable<Input['signatureBeats']>[number]>(
    `signature_beats?show_pack_id=eq.${room.show_pack_id}&select=id,name,points,entity_id&order=id.asc`,
  ),
  rows<Input['draftEntities'][number]>(
    `draft_entities?show_pack_id=eq.${room.show_pack_id}&select=id,name,type,film_name&order=id.asc`,
  ),
  rows<Input['draftPicks'][number]>(
    `draft_picks?room_id=eq.${room.id}&select=id,player_id,entity_id&order=id.asc`,
  ),
  rows<Input['bingoCards'][number]>(
    `bingo_cards?room_id=eq.${room.id}&select=id,player_id,squares&order=id.asc`,
  ),
  rows<Input['bingoSquares'][number]>(
    `bingo_squares?show_pack_id=eq.${room.show_pack_id}&select=id,slug,title&order=id.asc`,
  ),
])
if (showPacks.length !== 1) {
  throw new Error(`expected one show pack ${room.show_pack_id}, found ${showPacks.length}`)
}

const bingoMarks = bingoCards.length === 0
  ? []
  : await rows<Input['bingoMarks'][number]>(
      `bingo_marks?card_id=in.(${bingoCards.map((card) => card.id).join(',')})&select=id,card_id,square_index,status,marked_at&order=id.asc`,
    )
const [activeSettlements, activeSettlementEntries, activeSettlementMarks] = room.active_settlement_id === null
  ? [[], [], []] as [
      Input['activeSettlement'][],
      Input['activeSettlementEntries'],
      Input['activeSettlementMarks'],
    ]
  : await Promise.all([
      rows<NonNullable<Input['activeSettlement']>>(
        `room_settlements?id=eq.${room.active_settlement_id}&select=id,room_id,version,title,actor,bingo_mode,created_at`,
      ),
      rows<Input['activeSettlementEntries'][number]>(
        `room_settlement_entries?settlement_id=eq.${room.active_settlement_id}&select=settlement_id,entry_key,name,category_id,outcome,points,winner_id,tie_winner_id,display_order,occurred_at,warrant&order=display_order.asc,entry_key.asc`,
      ),
      rows<Input['activeSettlementMarks'][number]>(
        `room_settlement_bingo_marks?settlement_id=eq.${room.active_settlement_id}&select=settlement_id,card_id,square_index,marked_at,warrant&order=card_id.asc,square_index.asc`,
      ),
    ])
if (room.active_settlement_id !== null && activeSettlements.length !== 1) {
  throw new Error(`expected one active settlement ${room.active_settlement_id}, found ${activeSettlements.length}`)
}

const worksheet = buildSettlementAuthoringWorksheet({
  room,
  showPack: showPacks[0],
  activeSettlement: activeSettlements[0] ?? null,
  activeSettlementEntries,
  activeSettlementMarks,
  players,
  categories,
  nominees,
  roomWinners,
  confidencePicks,
  convictionPicks,
  signatureBeats,
  draftEntities,
  draftPicks,
  bingoCards,
  bingoSquares,
  bingoMarks,
})
if (worksheet.issues.length > 0) {
  throw new Error(`settlement preparation integrity failed:\n${worksheet.issues.join('\n')}`)
}
const bytes = serializeSettlementAuthoringWorksheet(worksheet)
console.log(`[prepare-settlement] room=${room.code} phase=${room.phase} source=${worksheet.current_record.source}`)
console.log(`[prepare-settlement] entries=${worksheet.counts.current_entries} unresolved_stakes=${worksheet.counts.unresolved_staked_entries}`)
console.log(`[prepare-settlement] approved_bingo_marks=${worksheet.counts.approved_bingo_marks}`)
if (worksheet.counts.conviction_picks !== undefined) {
  console.log(`[prepare-settlement] conviction_picks=${worksheet.counts.conviction_picks} struck_beats=${worksheet.counts.resolved_conviction_beats}`)
}
console.log(`[prepare-settlement] worksheet_sha256=${digest(bytes)}`)
if (outputPath) {
  writeUtf8FileSafely(outputPath, bytes, force)
  console.log(`[prepare-settlement] worksheet=${outputPath}`)
} else {
  console.log('[prepare-settlement] dry_run=true; pass --output PATH inside .private/settlements')
}
