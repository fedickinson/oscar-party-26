#!/usr/bin/env -S npx tsx

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import {
  renderSettlementDropApprovalReview,
} from '../src/lib/settlement-drop-approval-review'
import type { SettlementDropApprovalDocket, SettlementDropApprovalLaneKind } from '../src/lib/settlement-drop-approval-docket'
import type { SettlementDropAssetSemanticsPacket } from '../src/lib/settlement-drop-asset-semantics'
import { assertRasterAssetMatchesPath } from '../src/lib/raster-asset'
import { assertOutputDoesNotAliasSource, writeUtf8FileSafely } from './lib/safe-write.mts'

const LANE_ARGS: Array<{ kind: SettlementDropApprovalLaneKind; option: string }> = [
  { kind: 'receipt_prerequisites', option: 'receipt-prerequisites' },
  { kind: 'player_identity', option: 'player-identity' },
  { kind: 'asset_semantics', option: 'asset-semantics' },
  { kind: 'quote_markup', option: 'quote-markup' },
  { kind: 'presentation_structure', option: 'presentation-structure' },
]

function usage(): never {
  console.error('Usage: npx tsx scripts/generate-settlement-drop-approval-review.mts --docket DOCKET.json --asset-root DIR --receipt-prerequisites PACKET.json --receipt-prerequisites-decisions DECISIONS.json --player-identity PACKET.json --player-identity-decisions DECISIONS.json --asset-semantics PACKET.json --asset-semantics-decisions DECISIONS.json --quote-markup PACKET.json --quote-markup-decisions DECISIONS.json --presentation-structure PACKET.json --presentation-structure-decisions DECISIONS.json [--output REVIEW.html] [--force]')
  process.exit(1)
}

function parseArgs(argv: string[]): Map<string, string | true> {
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

function existingFile(path: string, label: string): string {
  if (!existsSync(path)) throw new Error(`${label} does not exist: ${path}`)
  const realPath = realpathSync(path)
  if (!statSync(realPath).isFile()) throw new Error(`${label} must be a file`)
  return realPath
}

function main(): void {
  const options = parseArgs(process.argv.slice(2))
  const docketOption = options.get('docket')
  const assetRootOption = options.get('asset-root')
  if (typeof docketOption !== 'string' || typeof assetRootOption !== 'string') usage()
  const docketPath = existingFile(resolve(docketOption), 'approval docket')
  const assetRoot = realpathSync(resolve(assetRootOption))
  if (!statSync(assetRoot).isDirectory()) throw new Error('asset root must be a directory')
  const packetPaths = Object.fromEntries(LANE_ARGS.map(({ kind, option }) => {
    const value = options.get(option)
    if (typeof value !== 'string') usage()
    return [kind, existingFile(resolve(value), `${kind} packet`)]
  })) as Record<SettlementDropApprovalLaneKind, string>
  const decisionPaths = Object.fromEntries(LANE_ARGS.map(({ kind, option }) => {
    const value = options.get(`${option}-decisions`)
    if (typeof value !== 'string') usage()
    return [kind, existingFile(resolve(value), `${kind} decisions`)]
  })) as Record<SettlementDropApprovalLaneKind, string>
  const docketRaw = readFileSync(docketPath, 'utf8')
  const docket = JSON.parse(docketRaw) as SettlementDropApprovalDocket
  const semanticsRaw = readFileSync(packetPaths.asset_semantics, 'utf8')
  const semantics = JSON.parse(semanticsRaw) as SettlementDropAssetSemanticsPacket
  const assetDataUrls = Object.fromEntries(semantics.assets.map((asset) => {
    const requested = resolve(assetRoot, asset.path)
    const path = existingFile(requested, `asset ${asset.id}`)
    const fromRoot = relative(assetRoot, path)
    if (!fromRoot || fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
      throw new Error(`asset ${asset.id} must resolve inside asset root`)
    }
    const bytes = readFileSync(path)
    if (bytes.byteLength !== asset.bytes) throw new Error(`asset ${asset.id} byte count does not match packet`)
    assertRasterAssetMatchesPath(asset.path, bytes)
    const digest = createHash('sha256').update(bytes).digest('hex')
    if (digest !== asset.sha256) throw new Error(`asset ${asset.id} hash does not match packet`)
    return [asset.id, `data:${asset.mime_type};base64,${bytes.toString('base64')}`]
  }))
  const html = renderSettlementDropApprovalReview({
    docket_raw: docketRaw,
    packet_raw: Object.fromEntries(Object.entries(packetPaths).map(([kind, path]) => [kind, readFileSync(path, 'utf8')])) as Record<SettlementDropApprovalLaneKind, string>,
    decision_raw: Object.fromEntries(Object.entries(decisionPaths).map(([kind, path]) => [kind, readFileSync(path, 'utf8')])) as Record<SettlementDropApprovalLaneKind, string>,
    asset_data_urls: assetDataUrls,
  })
  const outputOption = options.get('output')
  const outputPath = typeof outputOption === 'string' ? resolve(outputOption) : undefined
  const sources = [
    { label: 'approval docket', path: docketPath },
    ...Object.entries(packetPaths).map(([label, path]) => ({ label, path })),
    ...Object.entries(decisionPaths).map(([label, path]) => ({ label: `${label} decisions`, path })),
    ...semantics.assets.map((asset) => ({ label: `asset ${asset.id}`, path: existingFile(resolve(assetRoot, asset.path), `asset ${asset.id}`) })),
  ]
  if (outputPath) {
    assertOutputDoesNotAliasSource(outputPath, sources)
    if (existsSync(outputPath) && options.get('force') !== true) {
      throw new Error(`output already exists: ${outputPath}; pass --force to replace it`)
    }
    if (realpathSync(dirname(outputPath)) !== dirname(outputPath)) throw new Error('output parent must not be a symlink')
  }
  console.log('[settlement-drop-approval-review] target=local-filesystem')
  console.log(`[settlement-drop-approval-review] mode=${outputPath ? 'write' : 'dry-run'}`)
  console.log(`[settlement-drop-approval-review] room=${docket.target.room_code} lanes=${docket.lanes.length} assets=${semantics.assets.length}`)
  console.log(`[settlement-drop-approval-review] bytes=${Buffer.byteLength(html)} sha256=${createHash('sha256').update(html).digest('hex')}`)
  if (!outputPath) {
    console.log('[settlement-drop-approval-review] valid=true; no file written')
    return
  }
  writeUtf8FileSafely(outputPath, html, options.get('force') === true)
  console.log(`[settlement-drop-approval-review] wrote=${outputPath}`)
}

try {
  main()
} catch (error) {
  console.error(`[settlement-drop-approval-review] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
