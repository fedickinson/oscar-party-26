#!/usr/bin/env -S npx tsx

/**
 * Local-only end-to-end proof for the operator settlement command.
 *
 * The fixture reuses the immutable published seed catalog. It creates only one
 * scratch room, one player, one confidence pick and one bingo card; it never
 * writes categories or any other catalog table. Every operator invocation runs
 * through the real preparation and settlement CLIs, including an amendment and
 * idempotent replay of each active version.
 */
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fetchAllRows } from '../src/hooks/fetch-all-rows'
import { parseSettlementManifest } from '../src/lib/settlement-manifest'
import { parseSettlementReceipt } from '../src/lib/settlement-receipt'
import { supabaseConfig } from './lib/env.mts'

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const { target, url, serviceKey } = supabaseConfig('local')
if (target !== 'local') {
  throw new Error('settlement-command dogfood is local-only and refuses every remote target')
}
if (!serviceKey) throw new Error('local Supabase did not report a service role key')
const SERVICE_KEY = serviceKey

async function db(path: string, init: RequestInit = {}): Promise<any> {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path} -> ${response.status} ${text.slice(0, 500)}`)
  }
  return text ? JSON.parse(text) : null
}

async function allRows<T>(path: string): Promise<T[]> {
  const result = await fetchAllRows<T, unknown>(async (from, to) => {
    try {
      const data = await db(path, {
        headers: {
          Range: `${from}-${to}`,
          'Range-Unit': 'items',
        },
      }) as T[]
      return { data, error: null }
    } catch (error) {
      return { data: null, error }
    }
  })
  if (result.error) throw result.error
  return result.data ?? []
}

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function invokeSettlement(args: string[]): { output: string; status: number | null } {
  const result = spawnSync('npx', ['tsx', 'scripts/settle-room.mts', ...args], {
    cwd: repoRoot,
    env: { ...process.env, SUPABASE_TARGET: 'local' },
    encoding: 'utf8',
    timeout: 60_000,
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (output.trim()) console.log(output.trim())
  if (result.error) throw result.error
  return { output, status: result.status }
}

function runSettlement(args: string[]): string {
  const { output, status } = invokeSettlement(args)
  if (status !== 0) throw new Error(`settle-room exited ${status ?? 'without status'}`)
  return output
}

function runRejectedSettlement(args: string[]): string {
  const { output, status } = invokeSettlement(args)
  if (status === 0) throw new Error('settle-room unexpectedly accepted a rejected scenario')
  return output
}

function invokePreparation(args: string[]): { output: string; status: number | null } {
  const result = spawnSync('npx', ['tsx', 'scripts/prepare-settlement.mts', ...args], {
    cwd: repoRoot,
    env: { ...process.env, SUPABASE_TARGET: 'local' },
    encoding: 'utf8',
    timeout: 60_000,
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (output.trim()) console.log(output.trim())
  if (result.error) throw result.error
  return { output, status: result.status }
}

function runPreparation(args: string[]): string {
  const { output, status } = invokePreparation(args)
  if (status !== 0) throw new Error(`prepare-settlement exited ${status ?? 'without status'}`)
  return output
}

function runRejectedPreparation(args: string[]): string {
  const { output, status } = invokePreparation(args)
  if (status === 0) throw new Error('prepare-settlement unexpectedly accepted a rejected scenario')
  return output
}

function invokeReceiptExport(args: string[]): { output: string; status: number | null } {
  const result = spawnSync('npx', ['tsx', 'scripts/export-settlement-receipt.mts', ...args], {
    cwd: repoRoot,
    env: { ...process.env, SUPABASE_TARGET: 'local' },
    encoding: 'utf8',
    timeout: 60_000,
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (output.trim()) console.log(output.trim())
  if (result.error) throw result.error
  return { output, status: result.status }
}

function runReceiptExport(args: string[]): string {
  const { output, status } = invokeReceiptExport(args)
  if (status !== 0) throw new Error(`export-settlement-receipt exited ${status ?? 'without status'}`)
  return output
}

function runRejectedReceiptExport(args: string[]): string {
  const { output, status } = invokeReceiptExport(args)
  if (status === 0) throw new Error('export-settlement-receipt unexpectedly accepted a rejected scenario')
  return output
}

async function catalogSnapshot(): Promise<string> {
  const rows = await allRows(
    'categories?room_id=is.null&select=id,name,tier,points,display_order,winner_id,announced_at,show_pack_id,room_id,pack_key,trigger_contract&order=id.asc',
  )
  return JSON.stringify(rows)
}

let roomId: string | null = null
let roomCode: string | null = null
let workspace: string | null = null
let catalogBefore: string | null = null
const privatePreparationPaths: string[] = []
let scenarioError: unknown
const cleanupErrors: string[] = []

try {
  console.log('[settlement-command-dogfood] mode=local-scratch')
  catalogBefore = await catalogSnapshot()
  workspace = mkdtempSync(join(tmpdir(), 'settlement-command-dogfood-'))

  roomCode = `STL${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`
  const [room] = await db('rooms', {
    method: 'POST',
    body: JSON.stringify({ code: roomCode, phase: 'lobby', host_id: null }),
  })
  requireCondition(room?.id && room?.show_pack_id, 'scratch room did not bind a show pack')
  roomId = room.id

  const [showPack] = await db(
    `show_packs?id=eq.${room.show_pack_id}&status=eq.published&select=id,pack_key,version,status`,
  )
  requireCondition(showPack?.id === room.show_pack_id, 'scratch room is not bound to a published show pack')

  const [categories, draftEntities, bingoSquares] = await Promise.all([
    db(`categories?show_pack_id=eq.${showPack.id}&select=id,name,points&order=display_order.asc,id.asc&limit=1`),
    allRows(`draft_entities?show_pack_id=eq.${showPack.id}&select=id&order=id.asc`),
    db(`bingo_squares?show_pack_id=eq.${showPack.id}&select=id&order=id.asc&limit=24`),
  ])
  requireCondition(categories.length > 0, 'published fixture has no authored category')
  requireCondition(draftEntities.length > 0, 'published fixture has no draft entities')
  requireCondition(bingoSquares.length === 24, 'published fixture needs at least 24 bingo squares')
  const [candidateLink] = await db(
    `category_nominees?category_id=eq.${categories[0].id}&select=nominee_id&order=nominee_id.asc&limit=1`,
  )
  requireCondition(candidateLink?.nominee_id, 'published fixture category has no candidate nominee')
  const [nominee] = await db(
    `nominees?id=eq.${candidateLink.nominee_id}&show_pack_id=eq.${showPack.id}&select=id,name`,
  )
  requireCondition(nominee?.id, 'published fixture has no nominee for the selected candidate')

  const [player] = await db('players', {
    method: 'POST',
    body: JSON.stringify({
      room_id: room.id,
      name: 'Settlement Harness',
      avatar_id: 'targaryen',
      color: '#D4AF37',
      is_host: true,
    }),
  })
  requireCondition(player?.id, 'scratch player was not created')

  const squareIds = bingoSquares.map((square: { id: number }) => square.id)
  const cardSquares = [...squareIds.slice(0, 12), 0, ...squareIds.slice(12)]
  const [card] = await db('bingo_cards', {
    method: 'POST',
    body: JSON.stringify({ room_id: room.id, player_id: player.id, squares: cardSquares }),
  })
  requireCondition(card?.id, 'scratch bingo card was not created')

  const [confidencePick] = await db('confidence_picks', {
    method: 'POST',
    body: JSON.stringify({
      room_id: room.id,
      player_id: player.id,
      category_id: categories[0].id,
      nominee_id: nominee.id,
      confidence: 1,
    }),
  })
  requireCondition(confidencePick?.id, 'scratch confidence pick was not created')

  await db(`rooms?id=eq.${room.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ host_id: player.id, phase: 'finished' }),
  })

  const category = categories[0]
  const privateSettlementRoot = join(repoRoot, '.private', 'settlements')
  const worksheetPath = join(privateSettlementRoot, `dogfood-${roomCode}-worksheet.json`)
  const manifestPath = join(privateSettlementRoot, `dogfood-${roomCode}-manifest-one.json`)
  const amendmentPath = join(privateSettlementRoot, `dogfood-${roomCode}-manifest-two.json`)
  privatePreparationPaths.push(worksheetPath, manifestPath, amendmentPath)
  const receiptOnePath = join(workspace, 'receipt-one.json')
  const receiptTwoPath = join(workspace, 'receipt-two.json')
  const wrongConfirmationReceiptPath = join(workspace, 'receipt-wrong-confirmation.json')
  const occupiedReceiptPath = join(workspace, 'receipt-occupied.json')
  const prematureExportPath = join(workspace, 'receipt-premature.json')
  const expected = {
    player_totals: { [player.id]: 0 },
    character_points: {},
  }
  const preparationOutput = runPreparation([
    '--room', roomCode,
    '--output', worksheetPath,
  ])
  requireCondition(preparationOutput.includes('source=live'), 'preparation did not read the live record')
  requireCondition(preparationOutput.includes('unresolved_stakes=1'), 'preparation missed the unresolved stake')
  const initialWorksheetBytes = readFileSync(worksheetPath, 'utf8')
  const occupiedWorksheetOutput = runRejectedPreparation([
    '--room', roomCode,
    '--output', worksheetPath,
  ])
  requireCondition(
    occupiedWorksheetOutput.includes('worksheet output already exists:'),
    'preparation did not reject an occupied worksheet path',
  )
  requireCondition(
    readFileSync(worksheetPath, 'utf8') === initialWorksheetBytes,
    'occupied worksheet path was overwritten without --force',
  )
  const worksheet = JSON.parse(initialWorksheetBytes)
  requireCondition(worksheet.manifest_draft.entries.length === 1, 'preparation did not create one entry decision')
  requireCondition(
    worksheet.manifest_draft.entries[0].outcome === null
      && worksheet.manifest_draft.entries[0].warrant === null
      && !Object.prototype.hasOwnProperty.call(worksheet.manifest_draft.entries[0], 'winner'),
    'preparation invented a settlement verdict, warrant or winner',
  )
  worksheet.manifest_draft.title = 'Settlement command local proof'
  worksheet.manifest_draft.actor = 'settlement-command dogfood'
  worksheet.manifest_draft.entries[0].outcome = 'void'
  worksheet.manifest_draft.entries[0].warrant = {
    verdict: 'true',
    sources: [{ kind: 'fixture', ref: 'local published seed catalog' }],
  }
  worksheet.manifest_draft.bingo = { mode: 'replace', marks: [] }
  worksheet.manifest_draft.expected = expected
  writeFileSync(worksheetPath, `${JSON.stringify(worksheet, null, 2)}\n`)
  const authoredWorksheetBytes = readFileSync(worksheetPath, 'utf8')
  const aliasOutput = runRejectedPreparation([
    '--worksheet', worksheetPath,
    '--manifest-output', worksheetPath,
    '--force',
  ])
  requireCondition(
    aliasOutput.includes('refusing to overwrite the settlement authoring worksheet'),
    'preparation did not reject a manifest alias of its worksheet',
  )
  requireCondition(
    readFileSync(worksheetPath, 'utf8') === authoredWorksheetBytes,
    'manifest alias rejection changed the worksheet',
  )
  const finalizedOutput = runPreparation([
    '--worksheet', worksheetPath,
    '--manifest-output', manifestPath,
  ])
  requireCondition(finalizedOutput.includes('entries=1 bingo_mode=replace'), 'preparation did not finalize the manifest')
  const initialManifestBytes = readFileSync(manifestPath, 'utf8')
  const occupiedManifestOutput = runRejectedPreparation([
    '--worksheet', worksheetPath,
    '--manifest-output', manifestPath,
  ])
  requireCondition(
    occupiedManifestOutput.includes('manifest output already exists:'),
    'preparation did not reject an occupied manifest path',
  )
  requireCondition(
    readFileSync(manifestPath, 'utf8') === initialManifestBytes,
    'occupied manifest path was overwritten without --force',
  )
  parseSettlementManifest(initialManifestBytes)

  const dryRun = runSettlement(['--room', roomCode, '--manifest', manifestPath])
  requireCondition(dryRun.includes('preflight: passed'), 'dry run did not pass preflight')
  requireCondition(dryRun.includes('dry run only; no rows were written'), 'dry run did not remain read-only')

  const wrongConfirmationOutput = runRejectedSettlement([
    '--room', roomCode,
    '--manifest', manifestPath,
    '--apply',
    '--confirm-room', 'NOTROOM',
    '--receipt', wrongConfirmationReceiptPath,
  ])
  requireCondition(
    wrongConfirmationOutput.includes(`--confirm-room ${roomCode} is required to apply`),
    'wrong room confirmation did not fail through the explicit confirmation guard',
  )
  requireCondition(
    !existsSync(wrongConfirmationReceiptPath),
    'wrong room confirmation emitted a receipt',
  )

  const occupiedReceiptBytes = 'operator-owned existing receipt\n'
  writeFileSync(occupiedReceiptPath, occupiedReceiptBytes)
  const occupiedReceiptOutput = runRejectedSettlement([
    '--room', roomCode,
    '--manifest', manifestPath,
    '--apply',
    '--confirm-room', roomCode,
    '--receipt', occupiedReceiptPath,
  ])
  requireCondition(
    occupiedReceiptOutput.includes('receipt already exists:'),
    'occupied receipt path did not fail closed',
  )
  requireCondition(
    readFileSync(occupiedReceiptPath, 'utf8') === occupiedReceiptBytes,
    'occupied receipt path was overwritten without --force-receipt',
  )

  const beforeApply = await db(`room_settlements?room_id=eq.${room.id}&select=id`)
  const [roomBeforeApply] = await db(`rooms?id=eq.${room.id}&select=phase,active_settlement_id`)
  requireCondition(beforeApply.length === 0, 'pre-apply safety checks created a settlement row')
  requireCondition(
    roomBeforeApply?.phase === 'finished' && roomBeforeApply.active_settlement_id === null,
    'pre-apply safety checks changed the room phase or active settlement',
  )
  const prematureExport = runRejectedReceiptExport([
    '--room', roomCode,
    '--output', prematureExportPath,
  ])
  requireCondition(
    prematureExport.includes(`room ${roomCode} must be closed with one active settlement`),
    'receipt export did not reject a provisional room',
  )
  requireCondition(!existsSync(prematureExportPath), 'rejected provisional export wrote a receipt')

  const appliedOutput = runSettlement([
    '--room', roomCode,
    '--manifest', manifestPath,
    '--apply',
    '--confirm-room', roomCode,
    '--receipt', receiptOnePath,
  ])
  requireCondition(appliedOutput.includes('applied settlement v1'), 'apply did not create settlement version 1')

  const firstBytes = readFileSync(receiptOnePath, 'utf8')
  const firstReceipt = parseSettlementReceipt(firstBytes)
  requireCondition(firstReceipt.room_code === roomCode, 'receipt names the wrong room code')
  requireCondition(firstReceipt.room_id === room.id, 'receipt names the wrong room ID')
  requireCondition(firstReceipt.settlement_version === 1, 'receipt does not name settlement version 1')
  requireCondition(firstReceipt.revision?.supersedes_id === null, 'initial receipt must not supersede a settlement')
  requireCondition(firstReceipt.show_pack?.registry_id === showPack.id, 'receipt names the wrong show pack')
  requireCondition(firstReceipt.players.length === 1, 'receipt does not carry the scratch player')
  requireCondition(firstReceipt.characters.length === draftEntities.length, 'receipt does not carry the complete roster')
  requireCondition(firstReceipt.score_events.length === 0, 'void-only settlement must not score an event')
  requireCondition(firstReceipt.personal_cards.length === 1, 'receipt does not carry the scratch card')
  requireCondition(
    firstReceipt.settled_facts?.length === 1 && firstReceipt.settled_facts[0].outcome === 'void',
    'receipt does not carry the void settlement fact',
  )
  const exportedOnePath = join(workspace, 'receipt-exported-one.json')
  const rowsBeforeExport = await db(`room_settlements?room_id=eq.${room.id}&select=id,version`)
  const exportOneOutput = runReceiptExport([
    '--room', roomCode,
    '--output', exportedOnePath,
  ])
  requireCondition(exportOneOutput.includes('mode=read-only'), 'active receipt export did not announce read-only mode')
  requireCondition(readFileSync(exportedOnePath, 'utf8') === firstBytes,
    'active settlement export did not reproduce canonical version 1 receipt bytes')
  requireCondition(
    JSON.stringify(await db(`room_settlements?room_id=eq.${room.id}&select=id,version`)) === JSON.stringify(rowsBeforeExport),
    'active receipt export changed settlement rows',
  )
  writeFileSync(exportedOnePath, 'replace this export atomically\n')
  runReceiptExport(['--room', roomCode, '--output', exportedOnePath, '--force'])
  requireCondition(readFileSync(exportedOnePath, 'utf8') === firstBytes,
    'forced active receipt export did not atomically restore canonical bytes')
  const exportOccupiedBytes = 'operator-owned export target\n'
  const exportOccupiedPath = join(workspace, 'receipt-export-occupied.json')
  writeFileSync(exportOccupiedPath, exportOccupiedBytes)
  const exportOccupied = runRejectedReceiptExport([
    '--room', roomCode,
    '--output', exportOccupiedPath,
  ])
  requireCondition(exportOccupied.includes('output already exists:'),
    'active receipt export did not reject an occupied output path')
  requireCondition(readFileSync(exportOccupiedPath, 'utf8') === exportOccupiedBytes,
    'active receipt export clobbered an occupied output path')

  const replayOutput = runSettlement([
    '--room', roomCode,
    '--manifest', manifestPath,
    '--apply',
    '--confirm-room', roomCode,
    '--receipt', receiptTwoPath,
  ])
  requireCondition(replayOutput.includes('was already active; no rows changed'), 'replay was not idempotent')
  const secondBytes = readFileSync(receiptTwoPath, 'utf8')
  requireCondition(secondBytes === firstBytes, 'idempotent receipt re-emission changed canonical bytes')

  const amendmentPreparationOutput = runPreparation([
    '--room', roomCode,
    '--output', worksheetPath,
    '--force',
  ])
  requireCondition(
    amendmentPreparationOutput.includes('source=settled'),
    'amendment preparation did not begin from the active settlement',
  )
  const amendmentWorksheet = JSON.parse(readFileSync(worksheetPath, 'utf8'))
  requireCondition(
    amendmentWorksheet.current_record.entries.length === 1
      && amendmentWorksheet.current_record.entries[0].status === 'settled'
      && amendmentWorksheet.manifest_draft.entries[0].outcome === 'void'
      && amendmentWorksheet.manifest_draft.entries[0].warrant?.verdict === 'true',
    'amendment preparation did not preserve the active researched entry',
  )
  requireCondition(
    amendmentWorksheet.manifest_draft.bingo.mode === null,
    'amendment preparation silently reused the prior bingo policy',
  )
  amendmentWorksheet.manifest_draft.title = 'Settlement command local proof amendment'
  amendmentWorksheet.manifest_draft.actor = 'settlement-command dogfood'
  amendmentWorksheet.manifest_draft.entries.push({
    key: 'unscored-amendment-proof',
    name: 'Unscored amendment proof',
    outcome: 'resolved',
    points: 1,
    winner: nominee.id,
    warrant: {
      verdict: 'true',
      sources: [{ kind: 'fixture', ref: 'local amendment proof' }],
    },
  })
  amendmentWorksheet.manifest_draft.bingo = { mode: 'replace', marks: [] }
  amendmentWorksheet.manifest_draft.expected = expected
  writeFileSync(worksheetPath, `${JSON.stringify(amendmentWorksheet, null, 2)}\n`)
  const amendmentFinalizationOutput = runPreparation([
    '--worksheet', worksheetPath,
    '--manifest-output', amendmentPath,
  ])
  requireCondition(
    amendmentFinalizationOutput.includes('entries=2 bingo_mode=replace'),
    'amendment preparation did not finalize both researched entries',
  )

  const receiptThreePath = join(workspace, 'receipt-three.json')
  const receiptFourPath = join(workspace, 'receipt-four.json')
  const amendmentOutput = runSettlement([
    '--room', roomCode,
    '--manifest', amendmentPath,
    '--apply',
    '--confirm-room', roomCode,
    '--receipt', receiptThreePath,
  ])
  requireCondition(amendmentOutput.includes('settlement delta (before=settled)'), 'amendment did not compare against the active settlement')
  requireCondition(amendmentOutput.includes('facts: confirmed=1 changed=0 added=1 voided=0 struck=0'), 'amendment delta did not confirm one fact and add one fact')
  requireCondition(amendmentOutput.includes('applied settlement v2'), 'amendment did not create settlement version 2')

  const thirdBytes = readFileSync(receiptThreePath, 'utf8')
  const amendmentReceipt = parseSettlementReceipt(thirdBytes)
  requireCondition(amendmentReceipt.settlement_version === 2, 'amendment receipt does not name settlement version 2')
  requireCondition(amendmentReceipt.settlement_id !== firstReceipt.settlement_id, 'amendment reused the initial settlement ID')
  requireCondition(amendmentReceipt.revision?.supersedes_id === firstReceipt.settlement_id, 'amendment receipt does not supersede version 1')
  requireCondition(amendmentReceipt.score_events.length === 0, 'unscored amendment must not create a score event')
  requireCondition(amendmentReceipt.settled_facts?.length === 2, 'amendment receipt does not preserve one fact and add one fact')
  const addedFact = amendmentReceipt.settled_facts.find((fact) => fact.id === 'unscored-amendment-proof')
  requireCondition(addedFact?.outcome === 'resolved', 'amendment receipt does not resolve the added fact')
  requireCondition(addedFact.board_status === 'unscored', 'amendment receipt does not identify the added fact as unscored')
  requireCondition(addedFact.winner?.id === nominee.id, 'amendment receipt attributes the added fact to the wrong nominee')

  const amendmentReplayOutput = runSettlement([
    '--room', roomCode,
    '--manifest', amendmentPath,
    '--apply',
    '--confirm-room', roomCode,
    '--receipt', receiptFourPath,
  ])
  requireCondition(amendmentReplayOutput.includes('was already active; no rows changed'), 'amendment replay was not idempotent')
  const fourthBytes = readFileSync(receiptFourPath, 'utf8')
  requireCondition(fourthBytes === thirdBytes, 'amendment receipt re-emission changed canonical bytes')
  const exportedAmendmentPath = join(workspace, 'receipt-exported-amendment.json')
  runReceiptExport(['--room', roomCode, '--output', exportedAmendmentPath])
  requireCondition(readFileSync(exportedAmendmentPath, 'utf8') === thirdBytes,
    'active settlement export did not follow the room to canonical version 2')

  const staleReceiptPath = join(workspace, 'receipt-stale.json')
  const staleReplayOutput = runRejectedSettlement([
    '--room', roomCode,
    '--manifest', manifestPath,
    '--apply',
    '--confirm-room', roomCode,
    '--receipt', staleReceiptPath,
  ])
  requireCondition(
    staleReplayOutput.includes('belongs to superseded settlement version 1'),
    'stale version 1 replay did not fail through the superseded-manifest guard',
  )
  requireCondition(!existsSync(staleReceiptPath), 'rejected stale replay emitted a receipt')

  const [closedRoom] = await db(
    `rooms?id=eq.${room.id}&select=phase,active_settlement_id`,
  )
  const settlements = await db(
    `room_settlements?room_id=eq.${room.id}&select=id,version,manifest_hash,supersedes_id&order=version.asc`,
  )
  requireCondition(
    closedRoom?.phase === 'closed' && closedRoom.active_settlement_id === amendmentReceipt.settlement_id,
    'amendment did not leave the room closed on settlement version 2',
  )
  requireCondition(
    settlements.length === 2
      && settlements[0].id === firstReceipt.settlement_id
      && settlements[0].version === 1
      && settlements[0].supersedes_id === null
      && settlements[1].id === amendmentReceipt.settlement_id
      && settlements[1].version === 2
      && settlements[1].supersedes_id === firstReceipt.settlement_id,
    'amendment chain did not preserve version 1 and link version 2 to it',
  )
  requireCondition(await catalogSnapshot() === catalogBefore, 'settlement dogfood changed the global catalog')

  console.log('[settlement-command-dogfood] dry_run=true')
  console.log('[settlement-command-dogfood] preparation_no_clobber=true')
  console.log('[settlement-command-dogfood] preparation_alias_rejected=true')
  console.log('[settlement-command-dogfood] wrong_confirmation_rejected=true')
  console.log('[settlement-command-dogfood] occupied_receipt_preserved=true')
  console.log('[settlement-command-dogfood] applied=true')
  console.log('[settlement-command-dogfood] idempotent=true')
  console.log('[settlement-command-dogfood] amended=true')
  console.log('[settlement-command-dogfood] amendment_idempotent=true')
  console.log('[settlement-command-dogfood] superseded_replay_rejected=true')
  console.log('[settlement-command-dogfood] active_receipt_export=true')
  console.log('[settlement-command-dogfood] active_receipt_force=true')
  console.log('[settlement-command-dogfood] catalog_unchanged=true')
} catch (error) {
  scenarioError = error
} finally {
  if (roomId) {
    try {
      await db(`rooms?id=eq.${roomId}`, {
        method: 'PATCH',
        body: JSON.stringify({ active_settlement_id: null, phase: 'lobby', host_id: null }),
      })
      await db(`rooms?id=eq.${roomId}`, { method: 'DELETE' })
      const residue = await db(`rooms?id=eq.${roomId}&select=id`)
      if (residue.length !== 0) cleanupErrors.push(`scratch room ${roomId} still exists`)
    } catch (error) {
      cleanupErrors.push(`scratch room cleanup failed: ${String(error)}`)
    }
  }
  if (workspace) {
    try {
      const allowedRoot = `${tmpdir()}${sep}`
      if (!workspace.startsWith(allowedRoot) || !workspace.includes('settlement-command-dogfood-')) {
        cleanupErrors.push(`refusing unexpected temporary path ${workspace}`)
      } else {
        rmSync(workspace, { recursive: true, force: true })
      }
    } catch (error) {
      cleanupErrors.push(`temporary-file cleanup failed: ${String(error)}`)
    }
  }
  for (const path of privatePreparationPaths) {
    try {
      const expectedParent = join(repoRoot, '.private', 'settlements')
      if (dirname(path) !== expectedParent || !path.includes(`dogfood-${roomCode ?? ''}-`)) {
        cleanupErrors.push(`refusing unexpected private preparation path ${path}`)
      } else if (existsSync(path)) {
        unlinkSync(path)
      }
    } catch (error) {
      cleanupErrors.push(`private preparation cleanup failed for ${path}: ${String(error)}`)
    }
  }
  if (catalogBefore) {
    try {
      if (await catalogSnapshot() !== catalogBefore) {
        cleanupErrors.push('global catalog changed during settlement dogfood')
      }
    } catch (error) {
      cleanupErrors.push(`catalog verification failed: ${String(error)}`)
    }
  }
}

if (scenarioError || cleanupErrors.length > 0) {
  const details = [
    ...(scenarioError ? [`scenario failed: ${String(scenarioError)}`] : []),
    ...cleanupErrors,
  ]
  console.error(`[settlement-command-dogfood] ERROR: ${details.join('; ')}`)
  process.exit(1)
}

console.log(`[settlement-command-dogfood] room=${roomCode} cleaned=true`)
