#!/usr/bin/env -S npx tsx

/**
 * simulate-results-night.mts — thin CLI over src/lib/results-night-simulation.ts.
 *
 * Filesystem only. No Supabase, no network, no model. The pack is compiled and
 * projected in process, so the simulation scores the same catalog rows an
 * activated room would hold, and every scoring decision runs through the real
 * pure functions rather than a restatement of them.
 *
 * Usage:
 *   npx tsx scripts/simulate-results-night.mts --pack PACK.json --odds ODDS.json
 *   npx tsx scripts/simulate-results-night.mts --pack PACK.json --odds uniform \
 *     --players 6 --nights 2000 --seed 1 --output table.json
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildSimulationCatalog,
  formatSimulationTable,
  parseOddsDocument,
  runSimulation,
  type OddsSource,
} from '../src/lib/results-night-simulation'
import { parseShowPack } from '../src/lib/show-pack'
import { buildShowPackActivationPlan } from '../src/lib/show-pack-activation'
import { assertOutputDoesNotAliasSource, writeUtf8FileSafely } from './lib/safe-write.mts'

interface CliOptions {
  pack: string
  odds: string
  players: number
  nights: number
  seed: number
  output?: string
  force: boolean
}

const DEFAULT_PLAYERS = 6
const DEFAULT_NIGHTS = 10000
const DEFAULT_SEED = 1
const PROGRESS_EVERY = 250

function usage(): never {
  console.error(
    'Usage: npx tsx scripts/simulate-results-night.mts --pack PACK.json --odds ODDS.json|uniform'
    + ' [--players 4-10] [--nights N] [--seed N] [--output TABLE.json] [--force]',
  )
  process.exit(1)
}

function parseInteger(label: string, raw: string): number {
  const value = Number(raw)
  if (!Number.isInteger(value)) throw new Error(`--${label} needs an integer, received "${raw}"`)
  return value
}

function parseArgs(argv: string[]): CliOptions {
  let pack = ''
  let odds = ''
  let players = DEFAULT_PLAYERS
  let nights = DEFAULT_NIGHTS
  let seed = DEFAULT_SEED
  let output: string | undefined
  let force = false

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--pack') pack = argv[++index] ?? ''
    else if (arg === '--odds') odds = argv[++index] ?? ''
    else if (arg === '--players') players = parseInteger('players', argv[++index] ?? '')
    else if (arg === '--nights') nights = parseInteger('nights', argv[++index] ?? '')
    else if (arg === '--seed') seed = parseInteger('seed', argv[++index] ?? '')
    else if (arg === '--output') output = argv[++index] ?? ''
    else if (arg === '--force') force = true
    else if (arg === '--help' || arg === '-h') usage()
    else throw new Error(`unknown argument ${arg}`)
  }

  if (!pack) usage()
  if (!odds) throw new Error('--odds needs a path or the literal value "uniform"')
  if (output !== undefined && !output) throw new Error('--output needs a path')
  return { pack, odds, players, nights, seed, output, force }
}

function loadOdds(option: string): { source: OddsSource; label: string } {
  if (option === 'uniform') return { source: 'uniform', label: 'uniform' }
  const path = resolve(option)
  if (!existsSync(path)) throw new Error(`odds file does not exist: ${path}`)
  return { source: parseOddsDocument(readFileSync(path, 'utf8')), label: path }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const packPath = resolve(options.pack)
  if (!existsSync(packPath)) throw new Error(`pack does not exist: ${packPath}`)

  const oddsPath = options.odds === 'uniform' ? undefined : resolve(options.odds)
  const outputPath = options.output ? resolve(options.output) : undefined
  if (outputPath) {
    assertOutputDoesNotAliasSource(outputPath, [
      { label: 'show-pack authoring input', path: packPath },
      ...(oddsPath ? [{ label: 'odds input', path: oddsPath }] : []),
    ])
    if (existsSync(outputPath) && !options.force) {
      throw new Error(`output already exists: ${outputPath}; pass --force to replace it`)
    }
  }

  const plan = await buildShowPackActivationPlan(parseShowPack(readFileSync(packPath, 'utf8')))
  const catalog = buildSimulationCatalog(plan)
  const odds = loadOdds(options.odds)

  console.log('[simulate] target=local-filesystem')
  console.log(`[simulate] pack=${plan.packRef} input=${packPath}`)
  console.log(`[simulate] odds=${odds.label}`)
  console.log(
    `[simulate] categories=${catalog.categories.length} draftable=${catalog.draftEntities.length}`
    + ` bingo=${catalog.bingoSquares.length}`,
  )
  console.log(
    `[simulate] players=${options.players} nights=${options.nights} seed=${options.seed}`,
  )

  const started = Date.now()
  const summary = runSimulation({
    catalog,
    odds: odds.source,
    playerCount: options.players,
    nights: options.nights,
    seed: options.seed,
    progressEvery: PROGRESS_EVERY,
    onProgress: (completed, total) => {
      process.stderr.write(`[simulate] nights ${completed}/${total}\n`)
    },
  })
  const elapsed = ((Date.now() - started) / 1000).toFixed(1)

  console.log(
    `[simulate] draft=${summary.draftRounds} rounds, ${summary.picksPerNight} picks per night;`
    + ` confidence range 1-${summary.categoryCount}; elapsed=${elapsed}s`,
  )
  console.log('')
  console.log(formatSimulationTable(summary))
  console.log('')
  console.log(summary.decisionRule)
  console.log(`Verdict: ${summary.verdict} — ${summary.verdictReason}.`)

  if (outputPath) {
    writeUtf8FileSafely(outputPath, `${JSON.stringify(summary, null, 2)}\n`, options.force)
    console.log('')
    console.log(`[simulate] wrote=${outputPath}`)
  }
}

try {
  await main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[simulate] ERROR: ${message}`)
  process.exit(1)
}
