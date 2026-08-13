#!/usr/bin/env -S npx tsx

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  assertShowPackFlywheelSeedMatchesReceipt,
  composeShowPackWithFlywheel,
  finalizeShowPackFlywheelComposition,
} from '../src/lib/show-pack-flywheel'
import { assertShowPackResearchIntakeResultCurrent } from '../src/lib/show-pack-research-intake'
import { parseSettlementReceipt, serializeSettlementReceipt } from '../src/lib/settlement-receipt'
import { assertOutputDoesNotAliasSource, writeUtf8FileSafely } from './lib/safe-write.mts'
import { verifyShowPackPortraitAssets } from './lib/show-pack-assets.mts'

interface CliOptions {
  input: string
  seed: string
  receipt: string
  research?: string
  researchCandidates?: string
  researchPacket?: string
  researchDecisions?: string
  output?: string
  force: boolean
  allowProof: boolean
  authoring: boolean
}

function usage(): never {
  console.error('Usage: npx tsx scripts/compose-show-pack-flywheel.mts --input NEXT-PACK.json --seed SEED.json --receipt RECEIPT.json [--research RESEARCH.json --research-candidates CANDIDATES.json --research-packet PACKET.json --research-decisions DECISIONS.json] [--authoring] [--output PACK.json] [--force] [--allow-proof]')
  process.exit(1)
}

function parseArgs(argv: string[]): CliOptions {
  let input = ''
  let seed = ''
  let receipt = ''
  let research: string | undefined
  let researchCandidates: string | undefined
  let researchPacket: string | undefined
  let researchDecisions: string | undefined
  let output: string | undefined
  let force = false
  let allowProof = false
  let authoring = false

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--input') input = argv[++index] ?? ''
    else if (arg === '--seed') seed = argv[++index] ?? ''
    else if (arg === '--receipt') receipt = argv[++index] ?? ''
    else if (arg === '--research') research = argv[++index] ?? ''
    else if (arg === '--research-candidates') researchCandidates = argv[++index] ?? ''
    else if (arg === '--research-packet') researchPacket = argv[++index] ?? ''
    else if (arg === '--research-decisions') researchDecisions = argv[++index] ?? ''
    else if (arg === '--output') output = argv[++index] ?? ''
    else if (arg === '--force') force = true
    else if (arg === '--allow-proof') allowProof = true
    else if (arg === '--authoring') authoring = true
    else if (arg === '--help' || arg === '-h') usage()
    else throw new Error(`unknown argument ${arg}`)
  }

  if (!input || !seed || !receipt) usage()
  const researchArgs = [research, researchCandidates, researchPacket, researchDecisions]
  if (researchArgs.some(Boolean) && !researchArgs.every(Boolean)) {
    throw new Error('--research, --research-candidates, --research-packet, and --research-decisions must be supplied together')
  }
  if (output !== undefined && !output) throw new Error('--output needs a path')
  return {
    input, seed, receipt, research, researchCandidates, researchPacket,
    researchDecisions, output, force, allowProof, authoring,
  }
}

function existingInput(path: string, label: string): string {
  const resolved = resolve(path)
  if (!existsSync(resolved)) throw new Error(`${label} does not exist: ${resolved}`)
  return resolved
}

function main(): void {
  const options = parseArgs(process.argv.slice(2))
  const inputPath = existingInput(options.input, 'authoring input')
  const seedPath = existingInput(options.seed, 'flywheel seed')
  const receiptPath = existingInput(options.receipt, 'settlement receipt')
  const researchPath = options.research
    ? existingInput(options.research, 'research intake')
    : undefined
  const researchCandidatesPath = options.researchCandidates
    ? existingInput(options.researchCandidates, 'research candidates')
    : undefined
  const researchPacketPath = options.researchPacket
    ? existingInput(options.researchPacket, 'research intake packet')
    : undefined
  const researchDecisionsPath = options.researchDecisions
    ? existingInput(options.researchDecisions, 'research intake decisions')
    : undefined
  const outputPath = options.output ? resolve(options.output) : undefined

  if (outputPath) {
    assertOutputDoesNotAliasSource(outputPath, [
      { label: 'show-pack authoring input', path: inputPath },
      { label: 'flywheel seed', path: seedPath },
      { label: 'settlement receipt', path: receiptPath },
      ...(researchPath ? [{ label: 'research intake', path: researchPath }] : []),
      ...(researchCandidatesPath ? [{ label: 'research candidates', path: researchCandidatesPath }] : []),
      ...(researchPacketPath ? [{ label: 'research intake packet', path: researchPacketPath }] : []),
      ...(researchDecisionsPath ? [{ label: 'research intake decisions', path: researchDecisionsPath }] : []),
    ])
    if (existsSync(outputPath) && !options.force) {
      throw new Error(`output already exists: ${outputPath}; pass --force to replace it`)
    }
  }

  const receipt = parseSettlementReceipt(readFileSync(receiptPath, 'utf8'))
  const canonicalReceipt = serializeSettlementReceipt(receipt)
  const receiptSha256 = createHash('sha256').update(canonicalReceipt).digest('hex')
  const seed = assertShowPackFlywheelSeedMatchesReceipt(
    readFileSync(seedPath, 'utf8'),
    receipt,
    receiptSha256,
    { allowProof: options.allowProof },
  )
  const seedRaw = readFileSync(seedPath, 'utf8')
  const research = researchPath && researchCandidatesPath && researchPacketPath && researchDecisionsPath
    ? assertShowPackResearchIntakeResultCurrent({
        flywheelSeedRaw: seedRaw,
        candidatesRaw: readFileSync(researchCandidatesPath, 'utf8'),
        packetRaw: readFileSync(researchPacketPath, 'utf8'),
        decisionsRaw: readFileSync(researchDecisionsPath, 'utf8'),
        resultRaw: readFileSync(researchPath, 'utf8'),
      })
    : undefined
  const composed = composeShowPackWithFlywheel(readFileSync(inputPath, 'utf8'), seed, research)
  const stage = options.authoring ? 'authoring' : 'compiled'
  const outputPack = finalizeShowPackFlywheelComposition(composed, stage)
  verifyShowPackPortraitAssets(outputPack)
  const bytes = `${JSON.stringify(outputPack, null, 2)}\n`
  const hash = createHash('sha256').update(bytes).digest('hex')

  console.log('[show-pack-compose] target=local-filesystem')
  console.log(`[show-pack-compose] mode=${outputPath ? 'write' : 'dry-run'}`)
  console.log(`[show-pack-compose] stage=${stage}`)
  console.log(`[show-pack-compose] input=${inputPath}`)
  console.log(`[show-pack-compose] seed=${seedPath}`)
  console.log(`[show-pack-compose] receipt=${receiptPath} sha256=${receiptSha256}`)
  console.log(`[show-pack-compose] research=${researchPath ?? 'none'}`)
  console.log(`[show-pack-compose] predecessor=${seed.predecessor.pack_id}`)
  console.log(`[show-pack-compose] settlement=${seed.predecessor.settlement_id}@${seed.predecessor.settlement_version}`)
  console.log(`[show-pack-compose] pack=${outputPack.pack.id}@${outputPack.pack.version}`)
  console.log(`[show-pack-compose] sources=${outputPack.sources.length} claims=${outputPack.claims.length} entities=${outputPack.entities.length}`)
  console.log(`[show-pack-compose] predictions=${outputPack.predictions.length} beats=${outputPack.signature_beats.length} bingo=${outputPack.bingo_squares.length}`)
  console.log(`[show-pack-compose] bytes=${Buffer.byteLength(bytes)} sha256=${hash}`)

  if (!outputPath) {
    console.log(options.authoring
      ? '[show-pack-compose] authoring_valid=true publishable=not-checked; no file written'
      : '[show-pack-compose] publishable=true; no file written')
    return
  }

  writeUtf8FileSafely(outputPath, bytes, options.force)
  console.log(`[show-pack-compose] wrote=${outputPath}`)
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[show-pack-compose] ERROR: ${message}`)
  process.exit(1)
}
