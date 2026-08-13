#!/usr/bin/env -S npx tsx

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path'
import {
  buildSettlementDropMigrationAudit,
  serializeSettlementDropMigrationAudit,
  type SettlementDropMigrationArtifact,
} from '../src/lib/settlement-drop-migration-audit'
import { parseSettlementReceipt } from '../src/lib/settlement-receipt'
import { parseSettlementDropAssetExtractionManifest } from '../src/lib/settlement-drop-asset-extraction'
import { assertRasterAssetMatchesPath } from '../src/lib/raster-asset'
import type { SettlementDropAssetExtractionManifest } from '../src/lib/settlement-drop-asset-extraction'
import type { SettlementDropPresentationStructurePacket } from '../src/lib/settlement-drop-presentation-structure'
import type { SettlementDropPlayerIdentityPacket } from '../src/lib/settlement-drop-player-identity'
import type { SettlementDropQuoteMarkupPacket } from '../src/lib/settlement-drop-quote-markup'
import {
  RECEIPT_PREREQUISITE_TABLES,
  type SettlementDropReceiptPrerequisitesPacket,
} from '../src/lib/settlement-drop-receipt-prerequisites'
import type { SettlementDropAssetSemanticsPacket } from '../src/lib/settlement-drop-asset-semantics'
import { assertOutputDoesNotAliasSource, writeUtf8FileSafely } from './lib/safe-write.mts'

interface CliOptions {
  roomCode: string
  sourceDirectory: string
  receipt?: string
  assetExtraction?: string
  presentationStructure?: string
  playerIdentity?: string
  snapshotRooms?: string
  snapshotPlayers?: string
  quoteMarkup?: string
  receiptPrerequisites?: string
  receiptSnapshotDirectory?: string
  assetSemantics?: string
  output?: string
  force: boolean
}

const SOURCE_NAMES = {
  ceremony: 'the-ceremony.html',
  tiers: 'tiers.json',
  takes: 'takes.json',
  beatlines: 'beatlines.json',
  personal: 'personal.json',
  assets: 'assets.json',
  board: 'board.json',
} as const

function usage(): never {
  console.error('Usage: npx tsx scripts/audit-settlement-drop-migration.mts --room CODE --source-dir DIR [--receipt RECEIPT.json] [--receipt-prerequisites packet.json --receipt-snapshot-dir DIR] [--asset-extraction asset-extraction.json] [--asset-semantics semantics.json] [--presentation-structure structure.json] [--player-identity identity.json --snapshot-rooms rooms.json --snapshot-players players.json] [--quote-markup markup.json] [--output AUDIT.json] [--force]')
  process.exit(1)
}

function parseArgs(argv: string[]): CliOptions {
  let roomCode = ''
  let sourceDirectory = ''
  let receipt: string | undefined
  let assetExtraction: string | undefined
  let presentationStructure: string | undefined
  let playerIdentity: string | undefined
  let snapshotRooms: string | undefined
  let snapshotPlayers: string | undefined
  let quoteMarkup: string | undefined
  let receiptPrerequisites: string | undefined
  let receiptSnapshotDirectory: string | undefined
  let assetSemantics: string | undefined
  let output: string | undefined
  let force = false

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--room') roomCode = argv[++index] ?? ''
    else if (arg === '--source-dir') sourceDirectory = argv[++index] ?? ''
    else if (arg === '--receipt') receipt = argv[++index] ?? ''
    else if (arg === '--asset-extraction') assetExtraction = argv[++index] ?? ''
    else if (arg === '--presentation-structure') presentationStructure = argv[++index] ?? ''
    else if (arg === '--player-identity') playerIdentity = argv[++index] ?? ''
    else if (arg === '--snapshot-rooms') snapshotRooms = argv[++index] ?? ''
    else if (arg === '--snapshot-players') snapshotPlayers = argv[++index] ?? ''
    else if (arg === '--quote-markup') quoteMarkup = argv[++index] ?? ''
    else if (arg === '--receipt-prerequisites') receiptPrerequisites = argv[++index] ?? ''
    else if (arg === '--receipt-snapshot-dir') receiptSnapshotDirectory = argv[++index] ?? ''
    else if (arg === '--asset-semantics') assetSemantics = argv[++index] ?? ''
    else if (arg === '--output') output = argv[++index] ?? ''
    else if (arg === '--force') force = true
    else if (arg === '--help' || arg === '-h') usage()
    else throw new Error(`unknown argument ${arg}`)
  }

  if (!roomCode || !sourceDirectory) usage()
  if (receipt !== undefined && !receipt) throw new Error('--receipt needs a path')
  if (assetExtraction !== undefined && !assetExtraction) throw new Error('--asset-extraction needs a path')
  if (presentationStructure !== undefined && !presentationStructure) throw new Error('--presentation-structure needs a path')
  if (playerIdentity !== undefined && !playerIdentity) throw new Error('--player-identity needs a path')
  if (snapshotRooms !== undefined && !snapshotRooms) throw new Error('--snapshot-rooms needs a path')
  if (snapshotPlayers !== undefined && !snapshotPlayers) throw new Error('--snapshot-players needs a path')
  if (quoteMarkup !== undefined && !quoteMarkup) throw new Error('--quote-markup needs a path')
  if (Boolean(receiptPrerequisites) !== Boolean(receiptSnapshotDirectory)) {
    throw new Error('--receipt-prerequisites and --receipt-snapshot-dir must be supplied together')
  }
  if (assetSemantics !== undefined && !assetSemantics) throw new Error('--asset-semantics needs a path')
  if ([playerIdentity, snapshotRooms, snapshotPlayers].filter(Boolean).length !== 0
    && [playerIdentity, snapshotRooms, snapshotPlayers].filter(Boolean).length !== 3) {
    throw new Error('--player-identity, --snapshot-rooms and --snapshot-players must be supplied together')
  }
  if (output !== undefined && !output) throw new Error('--output needs a path')
  return { roomCode, sourceDirectory, receipt, assetExtraction, presentationStructure, playerIdentity, snapshotRooms, snapshotPlayers, quoteMarkup, receiptPrerequisites, receiptSnapshotDirectory, assetSemantics, output, force }
}

function existingFile(path: string, label: string): string {
  if (!existsSync(path)) throw new Error(`${label} does not exist: ${path}`)
  const realPath = realpathSync(path)
  if (!statSync(realPath).isFile()) throw new Error(`${label} must be a file`)
  return realPath
}

function artifact(path: string): SettlementDropMigrationArtifact {
  const bytes = readFileSync(path)
  return {
    name: basename(path),
    bytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  }
}

function parseJson(path: string, label: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${label} is not valid JSON: ${message}`)
  }
}

function verifyAssetExtractionFiles(
  manifest: SettlementDropAssetExtractionManifest,
  manifestPath: string,
): Array<{ label: string; path: string }> {
  const root = realpathSync(dirname(manifestPath))
  return manifest.assets.map((asset) => {
    const requested = resolve(root, asset.path)
    const filePath = existingFile(requested, `extracted asset ${asset.id}`)
    const fromRoot = relative(root, filePath)
    if (!fromRoot || fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
      throw new Error(`extracted asset ${asset.id} must resolve inside the extraction directory`)
    }
    const bytes = readFileSync(filePath)
    if (bytes.byteLength !== asset.bytes) {
      throw new Error(`extracted asset ${asset.id} byte count mismatch: expected ${asset.bytes}, got ${bytes.byteLength}`)
    }
    assertRasterAssetMatchesPath(asset.path, bytes)
    const digest = createHash('sha256').update(bytes).digest('hex')
    if (digest !== asset.sha256) {
      throw new Error(`extracted asset ${asset.id} hash mismatch: expected ${asset.sha256}, got ${digest}`)
    }
    return { label: `extracted asset ${asset.id}`, path: filePath }
  })
}

function main(): void {
  const options = parseArgs(process.argv.slice(2))
  const sourceDirectory = realpathSync(resolve(options.sourceDirectory))
  if (!statSync(sourceDirectory).isDirectory()) throw new Error(`source directory must be a directory: ${sourceDirectory}`)

  const paths = Object.fromEntries(Object.entries(SOURCE_NAMES).map(([key, name]) => [
    key,
    existingFile(resolve(sourceDirectory, name), name),
  ])) as Record<keyof typeof SOURCE_NAMES, string>
  const receiptPath = options.receipt ? existingFile(resolve(options.receipt), 'settlement receipt') : undefined
  const assetExtractionPath = options.assetExtraction
    ? existingFile(resolve(options.assetExtraction), 'asset extraction')
    : undefined
  const assetExtractionRaw = assetExtractionPath ? readFileSync(assetExtractionPath, 'utf8') : undefined
  const assetExtraction = assetExtractionRaw
    ? parseSettlementDropAssetExtractionManifest(assetExtractionRaw)
    : undefined
  const extractedAssetPaths = assetExtraction && assetExtractionPath
    ? verifyAssetExtractionFiles(assetExtraction, assetExtractionPath)
    : []
  const presentationStructurePath = options.presentationStructure
    ? existingFile(resolve(options.presentationStructure), 'presentation structure')
    : undefined
  const presentationStructureRaw = presentationStructurePath
    ? readFileSync(presentationStructurePath, 'utf8')
    : undefined
  const presentationStructure = presentationStructureRaw
    ? JSON.parse(presentationStructureRaw) as SettlementDropPresentationStructurePacket
    : undefined
  const playerIdentityPath = options.playerIdentity
    ? existingFile(resolve(options.playerIdentity), 'player identity')
    : undefined
  const snapshotRoomsPath = options.snapshotRooms
    ? existingFile(resolve(options.snapshotRooms), 'snapshot rooms')
    : undefined
  const snapshotPlayersPath = options.snapshotPlayers
    ? existingFile(resolve(options.snapshotPlayers), 'snapshot players')
    : undefined
  const playerIdentity = playerIdentityPath
    ? parseJson(playerIdentityPath, 'player identity') as SettlementDropPlayerIdentityPacket
    : undefined
  const quoteMarkupPath = options.quoteMarkup
    ? existingFile(resolve(options.quoteMarkup), 'quote markup')
    : undefined
  const quoteMarkup = quoteMarkupPath
    ? parseJson(quoteMarkupPath, 'quote markup') as SettlementDropQuoteMarkupPacket
    : undefined
  const receiptPrerequisitesPath = options.receiptPrerequisites
    ? existingFile(resolve(options.receiptPrerequisites), 'receipt prerequisites')
    : undefined
  const receiptSnapshotDirectory = options.receiptSnapshotDirectory
    ? realpathSync(resolve(options.receiptSnapshotDirectory))
    : undefined
  if (receiptSnapshotDirectory && !statSync(receiptSnapshotDirectory).isDirectory()) {
    throw new Error('receipt snapshot directory must be a directory')
  }
  const receiptPrerequisites = receiptPrerequisitesPath
    ? parseJson(receiptPrerequisitesPath, 'receipt prerequisites') as SettlementDropReceiptPrerequisitesPacket
    : undefined
  const receiptPrerequisitePaths = receiptSnapshotDirectory
    ? Object.fromEntries(RECEIPT_PREREQUISITE_TABLES.map((table) => [
        table, existingFile(resolve(receiptSnapshotDirectory, `${table}.json`), `receipt snapshot table ${table}`),
      ])) as Record<typeof RECEIPT_PREREQUISITE_TABLES[number], string>
    : undefined
  const assetSemanticsPath = options.assetSemantics
    ? existingFile(resolve(options.assetSemantics), 'asset semantics')
    : undefined
  if (assetSemanticsPath && (!assetExtractionPath || !assetExtractionRaw)) {
    throw new Error('--asset-semantics requires --asset-extraction')
  }
  const assetSemantics = assetSemanticsPath
    ? parseJson(assetSemanticsPath, 'asset semantics') as SettlementDropAssetSemanticsPacket
    : undefined
  const outputPath = options.output ? resolve(options.output) : undefined
  const sources = [
    ...Object.entries(paths).map(([label, path]) => ({ label, path })),
    ...(receiptPath ? [{ label: 'settlement receipt', path: receiptPath }] : []),
    ...(assetExtractionPath ? [{ label: 'asset extraction', path: assetExtractionPath }] : []),
    ...extractedAssetPaths,
    ...(presentationStructurePath ? [{ label: 'presentation structure', path: presentationStructurePath }] : []),
    ...(playerIdentityPath ? [{ label: 'player identity', path: playerIdentityPath }] : []),
    ...(snapshotRoomsPath ? [{ label: 'snapshot rooms', path: snapshotRoomsPath }] : []),
    ...(snapshotPlayersPath ? [{ label: 'snapshot players', path: snapshotPlayersPath }] : []),
    ...(quoteMarkupPath ? [{ label: 'quote markup', path: quoteMarkupPath }] : []),
    ...(receiptPrerequisitesPath ? [{ label: 'receipt prerequisites', path: receiptPrerequisitesPath }] : []),
    ...Object.entries(receiptPrerequisitePaths ?? {}).map(([label, path]) => ({ label: `receipt ${label}`, path })),
    ...(assetSemanticsPath ? [{ label: 'asset semantics', path: assetSemanticsPath }] : []),
  ]

  if (outputPath) {
    assertOutputDoesNotAliasSource(outputPath, sources)
    if (existsSync(outputPath) && !options.force) {
      throw new Error(`output already exists: ${outputPath}; pass --force to replace it`)
    }
  }

  const receiptRaw = receiptPath ? readFileSync(receiptPath, 'utf8') : undefined
  const audit = buildSettlementDropMigrationAudit({
    room_code: options.roomCode,
    artifacts: {
      ceremony: artifact(paths.ceremony),
      tiers: artifact(paths.tiers),
      takes: artifact(paths.takes),
      beatlines: artifact(paths.beatlines),
      personal: artifact(paths.personal),
      assets: artifact(paths.assets),
      board: artifact(paths.board),
      ...(receiptPath ? { receipt: artifact(receiptPath) } : {}),
      ...(assetExtractionPath ? { asset_extraction: artifact(assetExtractionPath) } : {}),
      ...(presentationStructurePath ? { presentation_structure: artifact(presentationStructurePath) } : {}),
      ...(playerIdentityPath ? { player_identity: artifact(playerIdentityPath) } : {}),
      ...(snapshotRoomsPath ? { snapshot_rooms: artifact(snapshotRoomsPath) } : {}),
      ...(snapshotPlayersPath ? { snapshot_players: artifact(snapshotPlayersPath) } : {}),
      ...(quoteMarkupPath ? { quote_markup: artifact(quoteMarkupPath) } : {}),
      ...(receiptPrerequisitesPath ? { receipt_prerequisites: artifact(receiptPrerequisitesPath) } : {}),
      ...(assetSemanticsPath ? { asset_semantics: artifact(assetSemanticsPath) } : {}),
    },
    tiers: parseJson(paths.tiers, 'tiers'),
    takes: parseJson(paths.takes, 'takes'),
    beatlines: parseJson(paths.beatlines, 'beatlines'),
    personal: parseJson(paths.personal, 'personal'),
    assets: parseJson(paths.assets, 'assets'),
    board: parseJson(paths.board, 'board'),
    ...(receiptRaw ? { receipt: parseSettlementReceipt(receiptRaw) } : {}),
    ...(assetExtraction ? { asset_extraction: assetExtraction } : {}),
    ...(presentationStructure ? {
      presentation_structure: presentationStructure,
      presentation_sources: {
        ceremony_raw: readFileSync(paths.ceremony, 'utf8'),
        beatlines_raw: readFileSync(paths.beatlines, 'utf8'),
        takes_raw: readFileSync(paths.takes, 'utf8'),
      },
    } : {}),
    ...(playerIdentity && snapshotRoomsPath && snapshotPlayersPath ? {
      player_identity: playerIdentity,
      identity_sources: {
        ceremony_raw: readFileSync(paths.ceremony, 'utf8'),
        tiers_raw: readFileSync(paths.tiers, 'utf8'),
        personal_raw: readFileSync(paths.personal, 'utf8'),
        board_raw: readFileSync(paths.board, 'utf8'),
        rooms_raw: readFileSync(snapshotRoomsPath, 'utf8'),
        players_raw: readFileSync(snapshotPlayersPath, 'utf8'),
      },
    } : {}),
    ...(quoteMarkup ? {
      quote_markup: quoteMarkup,
      quote_markup_source: { takes_raw: readFileSync(paths.takes, 'utf8') },
    } : {}),
    ...(receiptPrerequisites && receiptPrerequisitePaths ? {
      receipt_prerequisites: receiptPrerequisites,
      receipt_prerequisite_sources: Object.fromEntries(RECEIPT_PREREQUISITE_TABLES.map((table) => [
        table, readFileSync(receiptPrerequisitePaths[table], 'utf8'),
      ])) as Record<typeof RECEIPT_PREREQUISITE_TABLES[number], string>,
    } : {}),
    ...(assetSemantics && assetExtractionRaw ? {
      asset_semantics: assetSemantics,
      asset_semantics_sources: {
        ceremony_raw: readFileSync(paths.ceremony, 'utf8'),
        assets_raw: readFileSync(paths.assets, 'utf8'),
        extraction_raw: assetExtractionRaw,
      },
    } : {}),
  })
  const serialized = serializeSettlementDropMigrationAudit(audit)
  const hash = createHash('sha256').update(serialized).digest('hex')

  console.log('[settlement-drop-migration-audit] target=local-filesystem')
  console.log(`[settlement-drop-migration-audit] mode=${outputPath ? 'write' : 'dry-run'}`)
  console.log(`[settlement-drop-migration-audit] room=${audit.target.room_code}`)
  console.log(`[settlement-drop-migration-audit] source=${sourceDirectory}`)
  console.log(`[settlement-drop-migration-audit] receipt=${receiptPath ?? 'missing'}`)
  console.log(`[settlement-drop-migration-audit] asset_extraction=${assetExtractionPath ?? 'missing'}`)
  console.log(`[settlement-drop-migration-audit] presentation_structure=${presentationStructurePath ?? 'missing'}`)
  console.log(`[settlement-drop-migration-audit] player_identity=${playerIdentityPath ?? 'missing'}`)
  console.log(`[settlement-drop-migration-audit] quote_markup=${quoteMarkupPath ?? 'missing'}`)
  console.log(`[settlement-drop-migration-audit] receipt_prerequisites=${receiptPrerequisitesPath ?? 'missing'}`)
  console.log(`[settlement-drop-migration-audit] asset_semantics=${assetSemanticsPath ?? 'missing'}`)
  console.log(`[settlement-drop-migration-audit] players=${audit.inventory.players.personal_editions} quotes=${audit.inventory.quotes.quotes} ledger_lines=${audit.inventory.ledger.presentation_lines} assets=${audit.inventory.assets.total}`)
  console.log(`[settlement-drop-migration-audit] recoverable=${audit.readiness.recoverable_lanes.join(',')}`)
  console.log(`[settlement-drop-migration-audit] blockers=${audit.blockers.map((blocker) => blocker.code).join(',')}`)
  console.log(`[settlement-drop-migration-audit] ready=${audit.readiness.ready_for_manifest} bytes=${Buffer.byteLength(serialized)} sha256=${hash}`)

  if (!outputPath) {
    console.log('[settlement-drop-migration-audit] valid=true; no file written')
    return
  }

  writeUtf8FileSafely(outputPath, serialized, options.force)
  console.log(`[settlement-drop-migration-audit] wrote=${outputPath}`)
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[settlement-drop-migration-audit] ERROR: ${message}`)
  process.exit(1)
}
