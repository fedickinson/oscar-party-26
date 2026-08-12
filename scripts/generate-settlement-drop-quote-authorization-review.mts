#!/usr/bin/env -S npx tsx

import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { renderSettlementDropQuoteAuthorizationReviewHtml } from '../src/lib/settlement-drop-quote-publication'
import { sha256Hex } from '../src/lib/sha256'
import { assertOutputDoesNotAliasSource, writeUtf8FileSafely } from './lib/safe-write.mts'

interface Options { plan: string; output?: string; force: boolean }

function usage(): never {
  console.error('Usage: npx tsx scripts/generate-settlement-drop-quote-authorization-review.mts --plan PLAN.json [--output REVIEW.html] [--force]')
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
  const planPath = file(options.plan, 'quote grounding plan')
  const planRaw = readFileSync(planPath, 'utf8')
  const html = renderSettlementDropQuoteAuthorizationReviewHtml(planRaw)
  const outputPath = options.output ? resolve(options.output) : null
  if (outputPath) {
    assertOutputDoesNotAliasSource(outputPath, [{ label: 'quote grounding plan', path: planPath }])
    if (existsSync(outputPath) && !options.force) {
      throw new Error(`output already exists: ${outputPath}; pass --force to replace it`)
    }
    if (realpathSync(dirname(outputPath)) !== dirname(outputPath)) {
      throw new Error('output parent must not be a symlink')
    }
  }
  console.log('[settlement-drop-quote-authorization-review] target=local-filesystem')
  console.log(`[settlement-drop-quote-authorization-review] mode=${outputPath ? 'write' : 'dry-run'}`)
  console.log(`[settlement-drop-quote-authorization-review] plan=${planPath} sha256=${sha256Hex(planRaw)}`)
  console.log(`[settlement-drop-quote-authorization-review] bytes=${Buffer.byteLength(html)} sha256=${sha256Hex(html)}`)
  if (!outputPath) {
    console.log('[settlement-drop-quote-authorization-review] valid=true; no file written; no model called')
    return
  }
  writeUtf8FileSafely(outputPath, html, options.force)
  console.log(`[settlement-drop-quote-authorization-review] wrote=${outputPath}`)
  console.log('[settlement-drop-quote-authorization-review] no model called')
}

try { main() } catch (error) {
  console.error(`[settlement-drop-quote-authorization-review] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
