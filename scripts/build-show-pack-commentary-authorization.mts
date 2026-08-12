#!/usr/bin/env -S npx tsx

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  buildShowPackCommentaryAuthorization,
  serializeShowPackCommentaryAuthorization,
} from '../src/lib/show-pack-commentary-authorization'
import { sha256Hex } from '../src/lib/sha256'
import { assertOutputDoesNotAliasSource, writeUtf8FileSafely } from './lib/safe-write.mts'

interface Options {
  plan: string
  transcript: string
  output?: string
  force: boolean
}

function usage(): never {
  console.error('Usage: npx tsx scripts/build-show-pack-commentary-authorization.mts --plan PLAN.json --transcript TRANSCRIPT.json [--output AUTHORIZATION.json] [--force]')
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
  const planPath = file(options.plan, 'commentary plan')
  const transcriptPath = file(options.transcript, 'commentary authorization transcript')
  const planRaw = readFileSync(planPath, 'utf8')
  const transcriptRaw = readFileSync(transcriptPath, 'utf8')
  const authorization = buildShowPackCommentaryAuthorization(
    planRaw,
    json(transcriptRaw, 'commentary authorization transcript'),
  )
  const bytes = serializeShowPackCommentaryAuthorization(authorization)
  const outputPath = options.output ? resolve(options.output) : null
  const sources = [
    { label: 'commentary plan', path: planPath },
    { label: 'commentary authorization transcript', path: transcriptPath },
  ]
  if (outputPath) {
    assertOutputDoesNotAliasSource(outputPath, sources)
    if (existsSync(outputPath) && !options.force) {
      throw new Error(`output already exists: ${outputPath}; pass --force to replace it`)
    }
    if (realpathSync(dirname(outputPath)) !== dirname(outputPath)) {
      throw new Error('output parent must not be a symlink')
    }
  }
  console.log('[show-pack-commentary-authorization] target=local-filesystem')
  console.log(`[show-pack-commentary-authorization] mode=${outputPath ? 'write' : 'dry-run'}`)
  console.log(`[show-pack-commentary-authorization] pack=${authorization.target.pack_id}@${authorization.target.pack_version}`)
  console.log(`[show-pack-commentary-authorization] plan_sha256=${authorization.plan_sha256}`)
  console.log(`[show-pack-commentary-authorization] requests=${authorization.authorized_request_ids.join(',')}`)
  console.log(`[show-pack-commentary-authorization] bytes=${Buffer.byteLength(bytes)} sha256=${sha256Hex(bytes)}`)
  if (!outputPath) {
    console.log('[show-pack-commentary-authorization] valid=true; no file written')
    return
  }
  writeUtf8FileSafely(outputPath, bytes, options.force)
  console.log(`[show-pack-commentary-authorization] wrote=${outputPath}`)
}

try { main() } catch (error) {
  console.error(`[show-pack-commentary-authorization] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
