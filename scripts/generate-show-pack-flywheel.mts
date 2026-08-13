#!/usr/bin/env -S npx tsx

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  createShowPackFlywheelSeed,
  serializeShowPackFlywheelSeed,
} from '../src/lib/show-pack-flywheel'
import { parseSettlementReceipt, serializeSettlementReceipt } from '../src/lib/settlement-receipt'
import { assertOutputDoesNotAliasSource, writeUtf8FileSafely } from './lib/safe-write.mts'

interface CliOptions {
  input: string
  output?: string
  force: boolean
  allowProof: boolean
}

function usage(): never {
  console.error('Usage: npx tsx scripts/generate-show-pack-flywheel.mts --input RECEIPT.json [--output SEED.json] [--force] [--allow-proof]')
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

function main(): void {
  const options = parseArgs(process.argv.slice(2))
  const inputPath = resolve(options.input)
  const outputPath = options.output ? resolve(options.output) : undefined
  if (!existsSync(inputPath)) throw new Error(`input does not exist: ${inputPath}`)

  if (outputPath) {
    assertOutputDoesNotAliasSource(outputPath, [
      { label: 'settlement receipt', path: inputPath },
    ])
    if (existsSync(outputPath) && !options.force) {
      throw new Error(`output already exists: ${outputPath}; pass --force to replace it`)
    }
  }

  const receipt = parseSettlementReceipt(readFileSync(inputPath, 'utf8'))
  const canonicalReceipt = serializeSettlementReceipt(receipt)
  const receiptSha256 = createHash('sha256').update(canonicalReceipt).digest('hex')
  const seed = createShowPackFlywheelSeed(
    receipt,
    receiptSha256,
    { allowProof: options.allowProof },
  )
  const bytes = serializeShowPackFlywheelSeed(seed)
  const seedSha256 = createHash('sha256').update(bytes).digest('hex')

  console.log('[show-pack-flywheel] target=local-filesystem')
  console.log(`[show-pack-flywheel] mode=${outputPath ? 'write' : 'dry-run'}`)
  console.log(`[show-pack-flywheel] input=${inputPath}`)
  console.log(`[show-pack-flywheel] predecessor=${seed.predecessor.pack_id}`)
  console.log(`[show-pack-flywheel] settlement=${seed.predecessor.settlement_id}@${seed.predecessor.settlement_version}`)
  console.log(`[show-pack-flywheel] receipt_sha256=${receiptSha256}`)
  console.log(`[show-pack-flywheel] facts=${seed.facts.length} events=${seed.events.length} screen_claims=${seed.screen_claims.length} entities=${seed.entities.length}`)
  console.log(`[show-pack-flywheel] bytes=${Buffer.byteLength(bytes)} sha256=${seedSha256}`)

  if (!outputPath) {
    console.log('[show-pack-flywheel] valid=true; no file written')
    return
  }

  writeUtf8FileSafely(outputPath, bytes, options.force)
  console.log(`[show-pack-flywheel] wrote=${outputPath}`)
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[show-pack-flywheel] ERROR: ${message}`)
  process.exit(1)
}
