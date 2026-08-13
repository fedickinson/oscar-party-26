/**
 * snapshot-game — rolling JSON backups of the live database.
 *
 * WHY: every piece of game state lives in Supabase, and Supabase's free-tier
 * backup is daily. A bad mid-game migration or a fat-fingered DELETE during
 * the episode would otherwise be unrecoverable until tomorrow — which is to
 * say, unrecoverable. This dumps every table to timestamped JSON so the worst
 * case becomes "restore from a snapshot a few minutes old" via plain REST
 * inserts (the same pattern that archived and reseeded the Oscars data this
 * morning).
 *
 * One service-only SQL function materializes all tables under one PostgreSQL
 * statement snapshot. This closes both the old 1,000-row PostgREST truncation
 * and the cross-table race window from sequential REST reads. Canonical schema
 * reads bracket that RPC so a concurrent migration invalidates the capture.
 *
 *   one-shot:  npx tsx scripts/snapshot-game.mts
 *   rolling:   npx tsx scripts/snapshot-game.mts --loop 300   (every 5 min)
 *
 * Snapshots land in .private/snapshots/<ISO-stamp>/ (gitignored, local disk —
 * a different failure domain from the hosted DB, which is the point).
 */

import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'
import {
  OPERATOR_SNAPSHOT_TABLES,
  serializeOperatorSnapshotManifest,
  type OperatorSnapshotTableSeal,
} from '../src/lib/operator-snapshot'
import { supabaseConfig } from './lib/env.mts'
import { captureStableOperatorSnapshot } from './lib/stable-operator-snapshot.mts'

interface Options {
  intervalS: number
  outputRoot?: string
}

function usage(): never {
  console.error('Usage: npx tsx scripts/snapshot-game.mts [--loop SECONDS] [--output-root DIRECTORY]')
  process.exit(1)
}

function parseArgs(argv: string[]): Options {
  let intervalS = 0
  let outputRoot: string | undefined
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--loop') intervalS = Number(argv[++index] ?? '')
    else if (arg === '--output-root') outputRoot = argv[++index] ?? ''
    else if (arg === '--help' || arg === '-h') usage()
    else throw new Error(`unknown argument ${arg}`)
  }
  if (!Number.isFinite(intervalS) || intervalS < 0) {
    throw new Error('--loop must be followed by a non-negative number of seconds')
  }
  if (outputRoot !== undefined && !outputRoot) throw new Error('--output-root needs a directory')
  return { intervalS, outputRoot }
}

const options = parseArgs(process.argv.slice(2))
const config = supabaseConfig('remote')
const URL_ = config.url
if (!config.serviceKey) {
  throw new Error('complete snapshot capture requires SUPABASE_SERVICE_ROLE_KEY for the selected target')
}
const KEY = config.serviceKey

async function snapshot() {
  const createdAt = new Date().toISOString()
  const stamp = createdAt.replace(/[:.]/g, '-').slice(0, 19)
  const root = options.outputRoot
    ? resolve(options.outputRoot)
    : fileURLToPath(new URL('../.private/snapshots/', import.meta.url))
  const finalDirectory = join(root, stamp)
  const partialDirectory = join(root, `.${stamp}.${process.pid}.${randomUUID()}.partial`)
  mkdirSync(root, { recursive: true })
  if (existsSync(finalDirectory)) throw new Error(`snapshot already exists: ${finalDirectory}`)
  mkdirSync(partialDirectory)

  let total = 0
  const tables: OperatorSnapshotTableSeal[] = []
  try {
    const captured = await captureStableOperatorSnapshot(URL_, KEY)
    const schema = captured.schema
    writeFileSync(join(partialDirectory, 'schema.json'), schema, { encoding: 'utf8', flag: 'wx' })
    const schemaSha256 = createHash('sha256').update(schema).digest('hex')
    for (const table of OPERATOR_SNAPSHOT_TABLES) {
      const rows = captured.payload[table]
      const bytes = `${JSON.stringify(rows)}\n`
      writeFileSync(join(partialDirectory, `${table}.json`), bytes, { encoding: 'utf8', flag: 'wx' })
      total += rows.length
      tables.push({
        name: table,
        row_count: rows.length,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      })
    }

    const manifest = serializeOperatorSnapshotManifest({
      version: 2,
      source: 'scripts/snapshot-game.mts',
      complete: true,
      created_at: createdAt,
      target: config.target,
      schema_sha256: schemaSha256,
      tables,
    })
    writeFileSync(join(partialDirectory, 'manifest.json'), manifest, { encoding: 'utf8', flag: 'wx' })
    renameSync(partialDirectory, finalDirectory)
    const manifestHash = createHash('sha256').update(manifest).digest('hex')
    console.log(
      `[${new Date().toLocaleTimeString()}] snapshot ${stamp}: ${total} rows across ` +
      `${tables.length} tables; manifest sha256=${manifestHash}`,
    )
  } catch (error) {
    console.error(`[snapshot] incomplete=${partialDirectory}`)
    throw error
  }
}

if (options.intervalS > 0) {
  console.log(`rolling snapshots every ${options.intervalS}s — Ctrl-C to stop`)
  // Sequential loop, not setInterval: a slow dump must never overlap the next.
  for (;;) {
    try {
      await snapshot()
    } catch (error) {
      console.error(`[snapshot] FAILED ${error instanceof Error ? error.message : String(error)}`)
    }
    await new Promise((r) => setTimeout(r, options.intervalS * 1000))
  }
} else {
  try {
    await snapshot()
  } catch (error) {
    console.error(`[snapshot] FAILED ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}
