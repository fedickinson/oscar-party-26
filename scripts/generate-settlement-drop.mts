#!/usr/bin/env -S npx tsx

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path'
import {
  parseSettlementDropManifest,
  parseSettlementDropReceiptReference,
  renderSettlementDropHtml,
} from '../src/lib/settlement-drop'
import { parseSettlementReceipt, serializeSettlementReceipt } from '../src/lib/settlement-receipt'
import { assertOutputDoesNotAliasSource, writeUtf8FileSafely } from './lib/safe-write.mts'

interface CliOptions {
  input: string
  output?: string
  force: boolean
  allowProof: boolean
}

const MIME_BY_EXTENSION: Record<string, string> = {
  '.gif': 'image/gif',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

function usage(): never {
  console.error('Usage: npx tsx scripts/generate-settlement-drop.mts --input DROP.json [--output CEREMONY.html] [--force] [--allow-proof]')
  process.exit(1)
}

function parseArgs(argv: string[]): CliOptions {
  let input = ''
  let output: string | undefined
  let force = false
  let allowProof = false

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--input') input = argv[++index] ?? ''
    else if (arg === '--output') output = argv[++index] ?? ''
    else if (arg === '--force') force = true
    else if (arg === '--allow-proof') allowProof = true
    else if (arg === '--help' || arg === '-h') usage()
    else throw new Error(`unknown argument ${arg}`)
  }

  if (!input) usage()
  if (output !== undefined && !output) throw new Error('--output needs a path')
  return { input, output, force, allowProof }
}

function embedAssets(
  assets: Record<string, { path: string; alt: string }>,
  inputDirectory: string,
): { data: Record<string, string>; paths: Array<{ id: string; path: string }> } {
  const paths: Array<{ id: string; path: string }> = []
  const data = Object.fromEntries(Object.entries(assets).map(([id, asset]) => {
    const assetPath = resolveConfinedFile(inputDirectory, asset.path, `asset ${id}`)
    paths.push({ id, path: assetPath })
    const mime = MIME_BY_EXTENSION[extname(assetPath).toLowerCase()]
    if (!mime) throw new Error(`asset ${id} has an unsupported image extension`)
    return [id, `data:${mime};base64,${readFileSync(assetPath).toString('base64')}`]
  }))
  return { data, paths }
}

function resolveConfinedFile(root: string, path: string, label: string): string {
  const rootPath = realpathSync(root)
  const unresolvedPath = resolve(rootPath, path)
  if (!existsSync(unresolvedPath)) throw new Error(`${label} does not exist: ${unresolvedPath}`)
  const filePath = realpathSync(unresolvedPath)
  const fromRoot = relative(rootPath, filePath)
  if (!fromRoot || fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
    throw new Error(`${label} must resolve inside the drop directory`)
  }
  if (!statSync(filePath).isFile()) throw new Error(`${label} must be a file`)
  return filePath
}

function main(): void {
  const options = parseArgs(process.argv.slice(2))
  const inputPath = resolve(options.input)
  const outputPath = options.output ? resolve(options.output) : undefined
  if (!existsSync(inputPath)) throw new Error(`input does not exist: ${inputPath}`)

  const rawManifest = readFileSync(inputPath, 'utf8')
  const inputDirectory = dirname(inputPath)
  const receiptReference = parseSettlementDropReceiptReference(rawManifest)
  const receiptPath = resolveConfinedFile(inputDirectory, receiptReference.path, 'settlement receipt')
  const receipt = parseSettlementReceipt(readFileSync(receiptPath, 'utf8'))
  if (receipt.source === 'synthetic-proof' && !options.allowProof) {
    throw new Error('synthetic proof receipt requires --allow-proof')
  }
  const receiptBytes = serializeSettlementReceipt(receipt)
  const receiptSha256 = createHash('sha256').update(receiptBytes).digest('hex')
  const manifest = parseSettlementDropManifest(rawManifest, receipt, receiptSha256)
  const embedded = embedAssets(manifest.assets, inputDirectory)
  if (outputPath) {
    const protectedSources = [
      { label: 'authoring manifest', path: realpathSync(inputPath) },
      { label: 'settlement receipt', path: receiptPath },
      ...embedded.paths.map((asset) => ({ label: `asset ${asset.id}`, path: asset.path })),
    ]
    assertOutputDoesNotAliasSource(outputPath, protectedSources)
    if (existsSync(outputPath) && !options.force) {
      throw new Error(`output already exists: ${outputPath}; pass --force to replace it`)
    }
  }
  const assets = embedded.data
  const html = renderSettlementDropHtml(manifest, assets)
  const hash = createHash('sha256').update(html).digest('hex')
  const slideCount = (html.match(/class="slide /g) ?? []).length

  console.log('[settlement-drop] target=local-filesystem')
  console.log(`[settlement-drop] mode=${outputPath ? 'write' : 'dry-run'}`)
  console.log(`[settlement-drop] input=${inputPath}`)
  console.log(`[settlement-drop] settlement=${manifest.settlement.settlement_id}@${manifest.settlement.settlement_version}`)
  console.log(`[settlement-drop] receipt=${receiptPath} sha256=${receiptSha256}`)
  console.log(`[settlement-drop] players=${manifest.players.length} acts=${manifest.acts.length} slides=${slideCount}`)
  console.log(`[settlement-drop] assets=${Object.keys(assets).length} bytes=${Buffer.byteLength(html)} sha256=${hash}`)

  if (!outputPath) {
    console.log('[settlement-drop] valid=true; no file written')
    return
  }

  writeUtf8FileSafely(outputPath, html, options.force)
  console.log(`[settlement-drop] wrote=${outputPath}`)
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[settlement-drop] ERROR: ${message}`)
  process.exit(1)
}
