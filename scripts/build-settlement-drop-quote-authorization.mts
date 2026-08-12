#!/usr/bin/env -S npx tsx

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  buildSettlementDropQuoteAuthorization,
  serializeSettlementDropQuoteAuthorization,
} from '../src/lib/settlement-drop-quote-publication'
import { sha256Hex } from '../src/lib/sha256'
import { assertOutputDoesNotAliasSource, writeUtf8FileSafely } from './lib/safe-write.mts'

interface Options { plan: string; transcript: string; output?: string; force: boolean }

function usage(): never {
  console.error('Usage: npx tsx scripts/build-settlement-drop-quote-authorization.mts --plan PLAN.json --transcript TRANSCRIPT.json [--output AUTHORIZATION.json] [--force]')
  process.exit(1)
}

function parse(argv: string[]): Options {
  const result: Partial<Options> & { force: boolean } = { force: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--force') result.force = true
    else if (arg === '--help' || arg === '-h') usage()
    else if (arg === '--plan' || arg === '--transcript' || arg === '--output') {
      const value = argv[++index]
      if (!value || value.startsWith('--')) throw new Error(`${arg} needs a value`)
      if (arg === '--plan') result.plan = value
      else if (arg === '--transcript') result.transcript = value
      else result.output = value
    } else throw new Error(`unknown argument ${arg}`)
  }
  if (!result.plan || !result.transcript) usage()
  if (result.force && !result.output) throw new Error('--force requires --output')
  return result as Options
}

function file(raw: string, label: string): string {
  const path = resolve(raw)
  if (!existsSync(path)) throw new Error(`${label} does not exist: ${path}`)
  const realPath = realpathSync(path)
  if (!statSync(realPath).isFile()) throw new Error(`${label} must be a file`)
  return realPath
}

function json(raw: string, label: string): unknown {
  try { return JSON.parse(raw) } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function main(): void {
  const options = parse(process.argv.slice(2))
  const planPath = file(options.plan, 'quote grounding plan')
  const transcriptPath = file(options.transcript, 'quote authorization transcript')
  const planRaw = readFileSync(planPath, 'utf8')
  const authorization = buildSettlementDropQuoteAuthorization(
    planRaw,
    json(readFileSync(transcriptPath, 'utf8'), 'quote authorization transcript'),
  )
  const bytes = serializeSettlementDropQuoteAuthorization(authorization)
  const outputPath = options.output ? resolve(options.output) : null
  if (outputPath) {
    assertOutputDoesNotAliasSource(outputPath, [
      { label: 'quote grounding plan', path: planPath },
      { label: 'quote authorization transcript', path: transcriptPath },
    ])
    if (existsSync(outputPath) && !options.force) {
      throw new Error(`output already exists: ${outputPath}; pass --force to replace it`)
    }
    if (realpathSync(dirname(outputPath)) !== dirname(outputPath)) {
      throw new Error('output parent must not be a symlink')
    }
  }
  console.log('[settlement-drop-quote-authorization] target=local-filesystem')
  console.log(`[settlement-drop-quote-authorization] mode=${outputPath ? 'write' : 'dry-run'}`)
  console.log(`[settlement-drop-quote-authorization] room=${authorization.target.room_code} settlement=${authorization.target.settlement_id}@${authorization.target.settlement_version}`)
  console.log(`[settlement-drop-quote-authorization] plan_sha256=${authorization.plan_sha256}`)
  console.log(`[settlement-drop-quote-authorization] jobs=${authorization.authorized_job_ids.length} omissions=${authorization.acknowledged_omission_ids.length}`)
  console.log(`[settlement-drop-quote-authorization] bytes=${Buffer.byteLength(bytes)} sha256=${sha256Hex(bytes)}`)
  if (!outputPath) {
    console.log('[settlement-drop-quote-authorization] valid=true; no file written; no model called')
    return
  }
  writeUtf8FileSafely(outputPath, bytes, options.force)
  console.log(`[settlement-drop-quote-authorization] wrote=${outputPath}`)
  console.log('[settlement-drop-quote-authorization] no model called')
}

try { main() } catch (error) {
  console.error(`[settlement-drop-quote-authorization] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
