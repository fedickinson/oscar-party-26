#!/usr/bin/env -S npx tsx

/**
 * Materializes a researched settlement manifest from one hash-bound receipt
 * prerequisite packet, its completed decisions, and the exact sealed snapshot.
 * Read-only unless --output is supplied. It never contacts Supabase.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SealedTextArtifact } from '../src/lib/settlement-drop-asset-semantics'
import { RECEIPT_PREREQUISITE_TABLES } from '../src/lib/settlement-drop-receipt-prerequisites'
import { composeSettlementDropSettlementManifest } from '../src/lib/settlement-drop-settlement-composer'
import { sha256Hex } from '../src/lib/sha256'
import { assertOutputDoesNotAliasSource, writeUtf8FileSafely } from './lib/safe-write.mts'

process.on('uncaughtException', (error) => {
  console.error(`[compose-settlement-drop-record] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
process.on('unhandledRejection', (error) => {
  console.error(`[compose-settlement-drop-record] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})

function arg(name: string): string | null {
  const index = process.argv.indexOf(name)
  const value = index >= 0 ? process.argv[index + 1] : undefined
  return value && !value.startsWith('--') ? value : null
}

function requiredArg(name: string): string {
  const value = arg(name)
  if (!value) throw new Error(`${name} is required`)
  return value
}

function existingFile(raw: string, label: string): string {
  const path = resolve(raw)
  if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`${label} is not a file: ${path}`)
  if (realpathSync(path) !== path) throw new Error(`${label} must not be a symlink`)
  return path
}

const repositoryRoot = resolve(fileURLToPath(new URL('../', import.meta.url)))
const privateSettlementRoot = resolve(repositoryRoot, '.private/settlements')
const packetPath = existingFile(requiredArg('--packet'), 'receipt prerequisites packet')
const decisionsPath = existingFile(requiredArg('--decisions'), 'receipt prerequisite decisions')
const snapshotDir = resolve(requiredArg('--snapshot-dir'))
if (!existsSync(snapshotDir) || !statSync(snapshotDir).isDirectory()) {
  throw new Error(`snapshot directory is not a directory: ${snapshotDir}`)
}
if (realpathSync(snapshotDir) !== snapshotDir) throw new Error('snapshot directory must not be a symlink')
const outputArg = arg('--output')
const force = process.argv.includes('--force')
if (force && !outputArg) throw new Error('--force requires --output PATH')
const outputPath = outputArg ? resolve(outputArg) : null
if (outputPath) mkdirSync(privateSettlementRoot, { recursive: true })
if (existsSync(privateSettlementRoot) && realpathSync(privateSettlementRoot) !== privateSettlementRoot) {
  throw new Error('private settlement lane must not be a symlink')
}
if (outputPath && dirname(outputPath) !== privateSettlementRoot) {
  throw new Error(`output must be a direct child of ${privateSettlementRoot}`)
}
if (outputPath) {
  assertOutputDoesNotAliasSource(outputPath, [
    { label: 'receipt prerequisites packet', path: packetPath },
    { label: 'receipt prerequisite decisions', path: decisionsPath },
  ])
  if (existsSync(outputPath) && !force) {
    throw new Error(`output already exists: ${outputPath}; pass --force to replace it`)
  }
}

const tables = Object.fromEntries(RECEIPT_PREREQUISITE_TABLES.map((table) => {
  const path = existingFile(resolve(snapshotDir, `${table}.json`), `snapshot ${table}`)
  const raw = readFileSync(path, 'utf8')
  return [table, {
    raw,
    seal: {
      name: basename(path),
      bytes: new TextEncoder().encode(raw).byteLength,
      sha256: sha256Hex(raw),
    },
  }]
})) as Record<typeof RECEIPT_PREREQUISITE_TABLES[number], SealedTextArtifact>

const result = composeSettlementDropSettlementManifest({
  packetRaw: readFileSync(packetPath, 'utf8'),
  decisionsRaw: readFileSync(decisionsPath, 'utf8'),
  tables,
})
console.log(`[compose-settlement-drop-record] packet_sha256=${result.packetSha256}`)
console.log(`[compose-settlement-drop-record] manifest_sha256=${sha256Hex(result.manifestBytes)}`)
console.log(`[compose-settlement-drop-record] entries=${result.manifest.entries.length} bingo_mode=${result.manifest.bingo.mode} bingo_marks=${result.preview.resolvedBingoMarks.length}`)
console.log(`[compose-settlement-drop-record] player_totals=${JSON.stringify(result.manifest.expected.player_totals)}`)
console.log(`[compose-settlement-drop-record] character_points=${JSON.stringify(result.manifest.expected.character_points)}`)
if (outputPath) {
  writeUtf8FileSafely(outputPath, result.manifestBytes, force)
  console.log(`[compose-settlement-drop-record] manifest=${outputPath}`)
} else {
  console.log('[compose-settlement-drop-record] dry_run=true; pass --output PATH to write')
}
