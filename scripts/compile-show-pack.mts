#!/usr/bin/env -S npx tsx

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileShowPack, parseShowPack } from '../src/lib/show-pack'
import { assertOutputDoesNotAliasSource, writeUtf8FileSafely } from './lib/safe-write.mts'
import { verifyShowPackPortraitAssets } from './lib/show-pack-assets.mts'

interface CliOptions {
  input: string
  output?: string
  force: boolean
}

function usage(): never {
  console.error('Usage: npx tsx scripts/compile-show-pack.mts --input PACK.json [--output BUNDLE.json] [--force]')
  process.exit(1)
}

function parseArgs(argv: string[]): CliOptions {
  let input = ''
  let output: string | undefined
  let force = false

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--input') input = argv[++index] ?? ''
    else if (arg === '--output') output = argv[++index] ?? ''
    else if (arg === '--force') force = true
    else if (arg === '--help' || arg === '-h') usage()
    else throw new Error(`unknown argument ${arg}`)
  }

  if (!input) usage()
  if (output !== undefined && !output) throw new Error('--output needs a path')
  return { input, output, force }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2))
  const inputPath = resolve(options.input)
  const outputPath = options.output ? resolve(options.output) : undefined

  if (!existsSync(inputPath)) throw new Error(`input does not exist: ${inputPath}`)
  if (outputPath === inputPath) throw new Error('refusing to overwrite the authoring input')
  if (outputPath) {
    assertOutputDoesNotAliasSource(outputPath, [
      { label: 'show-pack authoring input', path: inputPath },
    ])
  }
  if (outputPath && existsSync(outputPath) && !options.force) {
    throw new Error(`output already exists: ${outputPath}; pass --force to replace it`)
  }

  const pack = parseShowPack(readFileSync(inputPath, 'utf8'))
  const compiled = compileShowPack(pack)
  verifyShowPackPortraitAssets(compiled)
  const bytes = `${JSON.stringify(compiled, null, 2)}\n`
  const hash = createHash('sha256').update(bytes).digest('hex')

  console.log('[show-pack] target=local-filesystem')
  console.log(`[show-pack] mode=${outputPath ? 'write' : 'dry-run'}`)
  console.log(`[show-pack] input=${inputPath}`)
  console.log(`[show-pack] pack=${compiled.pack.id}@${compiled.pack.version}`)
  console.log(`[show-pack] sources=${compiled.sources.length} claims=${compiled.claims.length} entities=${compiled.entities.length}`)
  console.log(`[show-pack] portraits=${compiled.entities.length} verified=true`)
  console.log(`[show-pack] predictions=${compiled.predictions.length} beats=${compiled.signature_beats.length} bingo=${compiled.bingo_squares.length}`)
  console.log(`[show-pack] voices=${compiled.commentary_voices.length} commentary=${compiled.commentary_requests.length} sha256=${hash}`)

  if (!outputPath) {
    console.log('[show-pack] publishable=true; no file written')
    return
  }

  writeUtf8FileSafely(outputPath, bytes, options.force)
  console.log(`[show-pack] wrote=${outputPath}`)
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[show-pack] ERROR: ${message}`)
  process.exit(1)
}
