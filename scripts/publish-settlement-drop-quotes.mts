#!/usr/bin/env -S npx tsx

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  assertSettlementDropQuoteGroundingPlanCurrent,
  publishSettlementDropQuotes,
  serializeSettlementDropQuotePublication,
  serializeSettlementDropQuotePublicationCheckpoint,
  validateSettlementDropQuotePublicationInputs,
  type SettlementDropQuotePublicationCheckpoint,
} from '../src/lib/settlement-drop-quote-publication'
import { sha256Hex } from '../src/lib/sha256'
import { assertOutputDoesNotAliasSource, writeUtf8FileSafely } from './lib/safe-write.mts'

interface Options {
  packet: string
  decisions: string
  approvedPlan: string
  authorization: string
  checkpoint: string
  output: string
  generate: boolean
}

function usage(): never {
  console.error('Usage: npx tsx scripts/publish-settlement-drop-quotes.mts --packet PACKET.json --decisions DECISIONS.json --approved-plan PLAN.json --authorization AUTHORIZATION.json --checkpoint CHECKPOINT.json --output PUBLICATION.json [--generate]')
  process.exit(1)
}

function parse(argv: string[]): Options {
  const values = new Map<string, string>()
  let generate = false
  const names = new Set([
    '--packet', '--decisions', '--approved-plan', '--authorization', '--checkpoint', '--output',
  ])
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--generate') generate = true
    else if (arg === '--help' || arg === '-h') usage()
    else if (names.has(arg)) {
      const value = argv[++index]
      if (!value || value.startsWith('--')) throw new Error(`${arg} needs a value`)
      if (values.has(arg)) throw new Error(`${arg} may be supplied only once`)
      values.set(arg, value)
    } else throw new Error(`unknown argument ${arg}`)
  }
  const required = (name: string): string => values.get(name) ?? usage()
  return {
    packet: required('--packet'),
    decisions: required('--decisions'),
    approvedPlan: required('--approved-plan'),
    authorization: required('--authorization'),
    checkpoint: required('--checkpoint'),
    output: required('--output'),
    generate,
  }
}

function file(raw: string, label: string): string {
  const path = resolve(raw)
  if (!existsSync(path)) throw new Error(`${label} does not exist: ${path}`)
  const realPath = realpathSync(path)
  if (!statSync(realPath).isFile()) throw new Error(`${label} must be a file`)
  return realPath
}

function checkpoint(raw: string): SettlementDropQuotePublicationCheckpoint {
  try { return JSON.parse(raw) as SettlementDropQuotePublicationCheckpoint } catch (error) {
    throw new Error(`quote publication checkpoint is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

async function main(): Promise<void> {
  const options = parse(process.argv.slice(2))
  const paths = {
    packet: file(options.packet, 'quote grounding packet'),
    decisions: file(options.decisions, 'quote grounding decisions'),
    approvedPlan: file(options.approvedPlan, 'approved quote grounding plan'),
    authorization: file(options.authorization, 'quote authorization'),
    checkpoint: resolve(options.checkpoint),
    output: resolve(options.output),
  }
  if (paths.checkpoint === paths.output) throw new Error('checkpoint and publication output must use different paths')
  const sources = [
    { label: 'quote grounding packet', path: paths.packet },
    { label: 'quote grounding decisions', path: paths.decisions },
    { label: 'approved quote grounding plan', path: paths.approvedPlan },
    { label: 'quote authorization', path: paths.authorization },
  ]
  assertOutputDoesNotAliasSource(paths.checkpoint, [
    ...sources,
    { label: 'quote publication output', path: paths.output },
  ])
  assertOutputDoesNotAliasSource(paths.output, [
    ...sources,
    { label: 'quote publication checkpoint', path: paths.checkpoint },
  ])
  if (realpathSync(dirname(paths.checkpoint)) !== dirname(paths.checkpoint)
    || realpathSync(dirname(paths.output)) !== dirname(paths.output)) {
    throw new Error('output parents must not be symlinks')
  }
  if (options.generate && existsSync(paths.output)) {
    throw new Error(`publication output already exists: ${paths.output}; choose a new output path`)
  }
  const packetRaw = readFileSync(paths.packet, 'utf8')
  const decisionsRaw = readFileSync(paths.decisions, 'utf8')
  const planRaw = readFileSync(paths.approvedPlan, 'utf8')
  const authorizationRaw = readFileSync(paths.authorization, 'utf8')
  const plan = assertSettlementDropQuoteGroundingPlanCurrent(planRaw, packetRaw, decisionsRaw)
  const savedCheckpoint = existsSync(paths.checkpoint)
    ? checkpoint(readFileSync(paths.checkpoint, 'utf8'))
    : undefined
  validateSettlementDropQuotePublicationInputs(planRaw, authorizationRaw, savedCheckpoint)

  console.log(`[settlement-drop-quote-publication] target=${options.generate ? 'local-filesystem + Anthropic' : 'local-filesystem'}`)
  console.log(`[settlement-drop-quote-publication] mode=${options.generate ? 'generate' : 'validate'}`)
  console.log(`[settlement-drop-quote-publication] room=${plan.target.room_code} settlement=${plan.target.settlement_id}@${plan.target.settlement_version}`)
  console.log(`[settlement-drop-quote-publication] plan_sha256=${sha256Hex(planRaw)} jobs=${plan.jobs.length} omissions=${plan.omissions.length}`)
  console.log(`[settlement-drop-quote-publication] checkpoint=${savedCheckpoint ? 'resume' : 'new'}`)
  if (!options.generate) {
    console.log('[settlement-drop-quote-publication] current=true; no file written; no model called')
    return
  }

  const { groundedLine } = await import('./grounded-line.mts')
  const result = await publishSettlementDropQuotes(planRaw, authorizationRaw, groundedLine, {
    checkpoint: savedCheckpoint,
    onProgress: (next) => {
      writeUtf8FileSafely(
        paths.checkpoint,
        serializeSettlementDropQuotePublicationCheckpoint(next),
        true,
      )
      const ready = next.jobs.filter((row) => row.status === 'ready').length
      const blocked = next.jobs.filter((row) => row.status === 'blocked').length
      const pending = next.jobs.filter((row) => row.status === 'pending').length
      console.log(`[settlement-drop-quote-publication] checkpoint ready=${ready} blocked=${blocked} pending=${pending}`)
    },
  })
  writeUtf8FileSafely(
    paths.checkpoint,
    serializeSettlementDropQuotePublicationCheckpoint(result.checkpoint),
    true,
  )
  if (!result.publication) {
    console.log('[settlement-drop-quote-publication] publishable=false; residual findings remain in checkpoint')
    process.exitCode = 2
    return
  }
  const publicationRaw = serializeSettlementDropQuotePublication(result.publication)
  writeUtf8FileSafely(paths.output, publicationRaw, false)
  console.log(`[settlement-drop-quote-publication] publishable=true bytes=${Buffer.byteLength(publicationRaw)} sha256=${sha256Hex(publicationRaw)}`)
  console.log(`[settlement-drop-quote-publication] wrote=${paths.output}`)
}

main().catch((error) => {
  console.error(`[settlement-drop-quote-publication] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
