#!/usr/bin/env -S npx tsx

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { renderShowPackCommentaryPlanReviewHtml } from '../src/lib/show-pack-commentary-authorization'
import { sha256Hex } from '../src/lib/sha256'
import { assertOutputDoesNotAliasSource, writeUtf8FileSafely } from './lib/safe-write.mts'

interface Options {
  plan: string
  output?: string
  force: boolean
}

function usage(): never {
  console.error('Usage: npx tsx scripts/generate-show-pack-commentary-review.mts --plan PLAN.json [--output REVIEW.html] [--force]')
  process.exit(1)
}

function parse(argv: string[]): Options {
  const result: Partial<Options> & { force: boolean } = { force: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--force') result.force = true
    else if (arg === '--help' || arg === '-h') usage()
    else if (arg === '--plan' || arg === '--output') {
      const value = argv[++index]
      if (!value || value.startsWith('--')) throw new Error(`${arg} needs a value`)
      if (arg === '--plan') result.plan = value
      else result.output = value
    } else throw new Error(`unknown argument ${arg}`)
  }
  if (!result.plan) usage()
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

function main(): void {
  const options = parse(process.argv.slice(2))
  const planPath = file(options.plan, 'commentary plan')
  const planRaw = readFileSync(planPath, 'utf8')
  const html = renderShowPackCommentaryPlanReviewHtml(planRaw)
  const outputPath = options.output ? resolve(options.output) : null
  if (outputPath) {
    assertOutputDoesNotAliasSource(outputPath, [{ label: 'commentary plan', path: planPath }])
    if (existsSync(outputPath) && !options.force) {
      throw new Error(`output already exists: ${outputPath}; pass --force to replace it`)
    }
    if (realpathSync(dirname(outputPath)) !== dirname(outputPath)) {
      throw new Error('output parent must not be a symlink')
    }
  }
  console.log('[show-pack-commentary-review] target=local-filesystem')
  console.log(`[show-pack-commentary-review] mode=${outputPath ? 'write' : 'dry-run'}`)
  console.log(`[show-pack-commentary-review] plan=${planPath} sha256=${sha256Hex(planRaw)}`)
  console.log(`[show-pack-commentary-review] bytes=${Buffer.byteLength(html)} sha256=${sha256Hex(html)}`)
  if (!outputPath) {
    console.log('[show-pack-commentary-review] valid=true; no file written')
    return
  }
  writeUtf8FileSafely(outputPath, html, options.force)
  console.log(`[show-pack-commentary-review] wrote=${outputPath}`)
}

try { main() } catch (error) {
  console.error(`[show-pack-commentary-review] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
