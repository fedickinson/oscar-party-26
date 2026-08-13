#!/usr/bin/env -S npx tsx

import { createHash, randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import {
  planSettlementDropAssetExtraction,
  serializeSettlementDropAssetExtractionManifest,
} from '../src/lib/settlement-drop-asset-extraction'

interface CliOptions {
  roomCode: string
  input: string
  outputDirectory?: string
}

function usage(): never {
  console.error('Usage: npx tsx scripts/extract-settlement-drop-assets.mts --room CODE --input assets.json [--output-dir DIRECTORY]')
  process.exit(1)
}

function parseArgs(argv: string[]): CliOptions {
  let roomCode = ''
  let input = ''
  let outputDirectory: string | undefined

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--room') roomCode = argv[++index] ?? ''
    else if (arg === '--input') input = argv[++index] ?? ''
    else if (arg === '--output-dir') outputDirectory = argv[++index] ?? ''
    else if (arg === '--help' || arg === '-h') usage()
    else throw new Error(`unknown argument ${arg}`)
  }

  if (!roomCode || !input) usage()
  if (outputDirectory !== undefined && !outputDirectory) throw new Error('--output-dir needs a path')
  return { roomCode, input, outputDirectory }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2))
  const requestedInputPath = resolve(options.input)
  if (!existsSync(requestedInputPath)) throw new Error(`input does not exist: ${requestedInputPath}`)
  const inputPath = realpathSync(requestedInputPath)
  if (!statSync(inputPath).isFile()) throw new Error(`input must be a file: ${inputPath}`)
  const raw = readFileSync(inputPath)
  let assets: unknown
  try {
    assets = JSON.parse(raw.toString('utf8'))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`input is not valid JSON: ${message}`)
  }

  const plan = planSettlementDropAssetExtraction({
    room_code: options.roomCode,
    source: {
      name: basename(inputPath),
      bytes: raw.byteLength,
      sha256: createHash('sha256').update(raw).digest('hex'),
    },
    assets,
  })
  const manifestBytes = serializeSettlementDropAssetExtractionManifest(plan.manifest)
  const manifestHash = createHash('sha256').update(manifestBytes).digest('hex')
  const outputPath = options.outputDirectory ? resolve(options.outputDirectory) : undefined

  console.log('[settlement-drop-assets] target=local-filesystem')
  console.log(`[settlement-drop-assets] mode=${outputPath ? 'write' : 'dry-run'}`)
  console.log(`[settlement-drop-assets] room=${plan.manifest.target.room_code}`)
  console.log(`[settlement-drop-assets] source=${inputPath} sha256=${plan.manifest.source.sha256}`)
  console.log(`[settlement-drop-assets] assets=${plan.manifest.assets.length} bytes=${plan.manifest.assets.reduce((sum, asset) => sum + asset.bytes, 0)}`)
  console.log(`[settlement-drop-assets] manifest_bytes=${Buffer.byteLength(manifestBytes)} sha256=${manifestHash}`)

  if (!outputPath) {
    console.log('[settlement-drop-assets] valid=true; no file written')
    return
  }
  if (existsSync(outputPath)) {
    throw new Error(`output directory already exists: ${outputPath}; choose a new directory`)
  }

  const parentPath = dirname(outputPath)
  mkdirSync(parentPath, { recursive: true })
  const parent = realpathSync(parentPath)
  const temporary = join(parent, `.${basename(outputPath)}.${process.pid}.${randomUUID()}.tmp`)
  try {
    mkdirSync(join(temporary, 'assets'), { recursive: true, mode: 0o700 })
    for (const file of plan.files) {
      writeFileSync(join(temporary, file.path), file.bytes, { flag: 'wx', mode: 0o600 })
    }
    writeFileSync(join(temporary, 'asset-extraction.json'), manifestBytes, {
      encoding: 'utf8', flag: 'wx', mode: 0o600,
    })
    renameSync(temporary, outputPath)
  } finally {
    if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: false })
  }
  console.log(`[settlement-drop-assets] wrote=${outputPath}`)
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[settlement-drop-assets] ERROR: ${message}`)
  process.exit(1)
}
