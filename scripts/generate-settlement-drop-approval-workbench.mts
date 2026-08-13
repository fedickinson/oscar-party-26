#!/usr/bin/env -S npx tsx

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import type {
  SettlementDropApprovalDocket,
  SettlementDropApprovalLaneKind,
} from '../src/lib/settlement-drop-approval-docket'
import type { SettlementDropAssetSemanticsPacket } from '../src/lib/settlement-drop-asset-semantics'
import { renderSettlementDropApprovalWorkbench } from '../src/lib/settlement-drop-approval-workbench'
import { assertRasterAssetMatchesPath } from '../src/lib/raster-asset'
import { assertOutputDoesNotAliasSource, writeUtf8FileSafely } from './lib/safe-write.mts'

const LANES: Array<{ kind: SettlementDropApprovalLaneKind; option: string }> = [
  { kind: 'receipt_prerequisites', option: 'receipt-prerequisites' },
  { kind: 'player_identity', option: 'player-identity' },
  { kind: 'asset_semantics', option: 'asset-semantics' },
  { kind: 'quote_markup', option: 'quote-markup' },
  { kind: 'presentation_structure', option: 'presentation-structure' },
]

function usage(): never {
  console.error('Usage: npx tsx scripts/generate-settlement-drop-approval-workbench.mts --docket DOCKET.json --asset-root DIR --receipt-prerequisites PACKET.json --receipt-prerequisites-decisions DECISIONS.json --player-identity PACKET.json --player-identity-decisions DECISIONS.json --asset-semantics PACKET.json --asset-semantics-decisions DECISIONS.json --quote-markup PACKET.json --quote-markup-decisions DECISIONS.json --presentation-structure PACKET.json --presentation-structure-decisions DECISIONS.json [--output WORKBENCH.html] [--force]')
  process.exit(1)
}

function parse(argv: string[]): Map<string, string | true> {
  const result = new Map<string, string | true>()
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--force') result.set('force', true)
    else if (arg === '--help' || arg === '-h') usage()
    else if (arg.startsWith('--')) {
      const value = argv[++index]
      if (!value || value.startsWith('--')) throw new Error(`${arg} needs a value`)
      result.set(arg.slice(2), value)
    } else throw new Error(`unknown argument ${arg}`)
  }
  return result
}

function file(raw: string, label: string): string {
  const path = resolve(raw)
  if (!existsSync(path)) throw new Error(`${label} does not exist: ${path}`)
  const real = realpathSync(path)
  if (!statSync(real).isFile()) throw new Error(`${label} must be a file`)
  return real
}

function main(): void {
  const options = parse(process.argv.slice(2))
  const docketArg = options.get('docket')
  const assetRootArg = options.get('asset-root')
  if (typeof docketArg !== 'string' || typeof assetRootArg !== 'string') usage()
  const docketPath = file(docketArg, 'approval docket')
  const assetRoot = realpathSync(resolve(assetRootArg))
  if (!statSync(assetRoot).isDirectory()) throw new Error('asset root must be a directory')
  const packetPaths = Object.fromEntries(LANES.map(({ kind, option }) => {
    const value = options.get(option)
    if (typeof value !== 'string') usage()
    return [kind, file(value, `${kind} packet`)]
  })) as Record<SettlementDropApprovalLaneKind, string>
  const decisionPaths = Object.fromEntries(LANES.map(({ kind, option }) => {
    const value = options.get(`${option}-decisions`)
    if (typeof value !== 'string') usage()
    return [kind, file(value, `${kind} decisions`)]
  })) as Record<SettlementDropApprovalLaneKind, string>
  const docketRaw = readFileSync(docketPath, 'utf8')
  const docket = JSON.parse(docketRaw) as SettlementDropApprovalDocket
  const packetRaw = Object.fromEntries(LANES.map(({ kind }) => (
    [kind, readFileSync(packetPaths[kind], 'utf8')]
  ))) as Record<SettlementDropApprovalLaneKind, string>
  const decisionRaw = Object.fromEntries(LANES.map(({ kind }) => (
    [kind, readFileSync(decisionPaths[kind], 'utf8')]
  ))) as Record<SettlementDropApprovalLaneKind, string>
  const semantics = JSON.parse(packetRaw.asset_semantics) as SettlementDropAssetSemanticsPacket
  const assetPaths: Array<{ label: string; path: string }> = []
  const assetDataUrls = Object.fromEntries(semantics.assets.map((asset) => {
    const path = file(resolve(assetRoot, asset.path), `asset ${asset.id}`)
    const fromRoot = relative(assetRoot, path)
    if (!fromRoot || fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
      throw new Error(`asset ${asset.id} must resolve inside asset root`)
    }
    const bytes = readFileSync(path)
    if (bytes.byteLength !== asset.bytes) throw new Error(`asset ${asset.id} byte count does not match packet`)
    assertRasterAssetMatchesPath(asset.path, bytes)
    if (createHash('sha256').update(bytes).digest('hex') !== asset.sha256) {
      throw new Error(`asset ${asset.id} hash does not match packet`)
    }
    assetPaths.push({ label: `asset ${asset.id}`, path })
    return [asset.id, `data:${asset.mime_type};base64,${bytes.toString('base64')}`]
  }))
  const html = renderSettlementDropApprovalWorkbench({
    docket_raw: docketRaw,
    packet_raw: packetRaw,
    decision_raw: decisionRaw,
    asset_data_urls: assetDataUrls,
  })
  const outputArg = options.get('output')
  const outputPath = typeof outputArg === 'string' ? resolve(outputArg) : null
  const sources = [
    { label: 'approval docket', path: docketPath },
    ...LANES.flatMap(({ kind }) => [
      { label: `${kind} packet`, path: packetPaths[kind] },
      { label: `${kind} decisions`, path: decisionPaths[kind] },
    ]),
    ...assetPaths,
  ]
  if (outputPath) {
    assertOutputDoesNotAliasSource(outputPath, sources)
    if (existsSync(outputPath) && options.get('force') !== true) {
      throw new Error(`output already exists: ${outputPath}; pass --force to replace it`)
    }
    if (realpathSync(dirname(outputPath)) !== dirname(outputPath)) throw new Error('output parent must not be a symlink')
  }
  const digest = createHash('sha256').update(html).digest('hex')
  console.log('[settlement-drop-approval-workbench] target=local-filesystem')
  console.log(`[settlement-drop-approval-workbench] mode=${outputPath ? 'write' : 'dry-run'}`)
  console.log(`[settlement-drop-approval-workbench] room=${docket.target.room_code} lanes=${docket.lanes.length} assets=${semantics.assets.length}`)
  console.log(`[settlement-drop-approval-workbench] bytes=${Buffer.byteLength(html)} sha256=${digest}`)
  if (!outputPath) {
    console.log('[settlement-drop-approval-workbench] valid=true; no file written')
    return
  }
  writeUtf8FileSafely(outputPath, html, options.get('force') === true)
  console.log(`[settlement-drop-approval-workbench] wrote=${outputPath}`)
}

try { main() } catch (error) {
  console.error(`[settlement-drop-approval-workbench] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
