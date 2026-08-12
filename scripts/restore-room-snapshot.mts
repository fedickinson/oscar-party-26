#!/usr/bin/env -S npx tsx

/**
 * Restore rows missing from one existing room using a sealed operator snapshot.
 *
 * This command is intentionally not a point-in-time replacement engine. It
 * never deletes, updates, recreates a room, or restores an engine heartbeat.
 * Existing divergent rows and catalog drift are blockers. An interrupted apply
 * is safe to rerun because exact rows become no-ops on the next preflight.
 */

import {
  assertOperatorSnapshotSchemaCompatible,
} from '../src/lib/operator-snapshot'
import {
  buildRoomRecoveryPlan,
} from '../src/lib/room-recovery'
import { supabaseConfig } from './lib/env.mts'
import { loadSealedOperatorSnapshot } from './lib/sealed-operator-snapshot.mts'
import {
  captureStableOperatorSnapshot,
  fetchCanonicalOperatorSchema,
} from './lib/stable-operator-snapshot.mts'

interface Options {
  snapshot: string
  room: string
  apply: boolean
  confirmRoom?: string
  validateOnly: boolean
}

function usage(): never {
  console.error([
    'Usage: npx tsx scripts/restore-room-snapshot.mts',
    '  --snapshot SNAPSHOT_DIR --room CODE [--validate-only]',
    '  [--apply --confirm-room CODE]',
  ].join('\n'))
  process.exit(1)
}

function parseArgs(argv: string[]): Options {
  let snapshot = ''
  let room = ''
  let apply = false
  let confirmRoom: string | undefined
  let validateOnly = false
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--snapshot') snapshot = argv[++index] ?? ''
    else if (arg === '--room') room = argv[++index] ?? ''
    else if (arg === '--apply') apply = true
    else if (arg === '--confirm-room') confirmRoom = (argv[++index] ?? '').trim().toUpperCase()
    else if (arg === '--validate-only') validateOnly = true
    else if (arg === '--help' || arg === '-h') usage()
    else throw new Error(`unknown argument ${arg}`)
  }
  room = room.trim().toUpperCase()
  if (!snapshot || !room) usage()
  if (!/^[A-Z0-9]{4,12}$/.test(room)) throw new Error('room code must be 4 to 12 uppercase letters or numbers')
  if (validateOnly && (apply || confirmRoom)) throw new Error('--validate-only cannot be combined with apply flags')
  if (apply && confirmRoom !== room) throw new Error(`--apply requires --confirm-room ${room}`)
  if (!apply && confirmRoom) throw new Error('--confirm-room is valid only with --apply')
  return { snapshot, room, apply, confirmRoom, validateOnly }
}

function printPlan(plan: ReturnType<typeof buildRoomRecoveryPlan>): void {
  console.log(`[restore] room=${plan.room_code} id=${plan.room_id}`)
  console.log(`[restore] room_drift=${plan.room_drift_fields.length ? plan.room_drift_fields.join(',') : 'none'}`)
  for (const table of plan.tables) {
    console.log(`[restore] ${table.name}: missing=${table.missing.length} unchanged=${table.unchanged}`)
  }
  if (plan.conflicts.length) {
    for (const conflict of plan.conflicts) console.error(`[restore] CONFLICT ${conflict}`)
  }
}

async function insertRows(
  url: string,
  key: string,
  table: string,
  rows: Array<Record<string, unknown>>,
): Promise<void> {
  if (!rows.length) return
  const response = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  })
  const body = await response.text()
  if (!response.ok) throw new Error(`${table} restore failed: ${response.status} ${body.slice(0, 300)}`)
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const sealed = loadSealedOperatorSnapshot(options.snapshot)
  console.log('[restore] snapshot_valid=true')
  console.log(`[restore] snapshot=${sealed.directory}`)
  console.log(`[restore] snapshot_created_at=${sealed.manifest.created_at}`)
  console.log(`[restore] snapshot_target=${sealed.manifest.target}`)

  if (options.validateOnly) {
    console.log('[restore] mode=validate-only; no database read or write')
    return
  }

  const config = supabaseConfig('local')
  if (!config.serviceKey) {
    throw new Error('database-backed restore preflight requires SUPABASE_SERVICE_ROLE_KEY for the selected target')
  }
  const readKey = config.serviceKey
  console.log(`[restore] mode=${options.apply ? 'apply-missing' : 'dry-run'}`)
  const preflight = await captureStableOperatorSnapshot(config.url, readKey)
  assertOperatorSnapshotSchemaCompatible(sealed.schema, preflight.schema, sealed.manifest.version)
  const plan = buildRoomRecoveryPlan(sealed.rows, preflight.payload, options.room)
  printPlan(plan)
  if (plan.conflicts.length) throw new Error(`restore blocked by ${plan.conflicts.length} conflict(s)`)

  const missingCount = plan.tables.reduce((sum, table) => sum + table.missing.length, 0)
  if (!options.apply) {
    console.log(`[restore] valid=true missing=${missingCount}; no rows written`)
    return
  }
  if (sealed.manifest.target !== config.target) {
    throw new Error(
      `snapshot target ${sealed.manifest.target} does not match write target ${config.target}`,
    )
  }
  const beforeApplySchema = await fetchCanonicalOperatorSchema(config.url, readKey)
  assertOperatorSnapshotSchemaCompatible(sealed.schema, beforeApplySchema, sealed.manifest.version)
  if (beforeApplySchema !== preflight.schema) throw new Error('database schema changed after restore preflight')
  for (const table of plan.tables) {
    await insertRows(config.url, readKey, table.name, table.missing)
  }

  const postflight = await captureStableOperatorSnapshot(config.url, readKey)
  assertOperatorSnapshotSchemaCompatible(sealed.schema, postflight.schema, sealed.manifest.version)
  if (postflight.schema !== beforeApplySchema) throw new Error('database schema changed during restore apply')
  const verified = buildRoomRecoveryPlan(sealed.rows, postflight.payload, options.room)
  printPlan(verified)
  const remaining = verified.tables.reduce((sum, table) => sum + table.missing.length, 0)
  if (verified.conflicts.length || remaining > 0) {
    throw new Error(
      `restore verification failed: conflicts=${verified.conflicts.length} missing=${remaining}; rerun safely`,
    )
  }
  console.log(`[restore] applied=${missingCount} verified=true`)
}

main().catch((error) => {
  console.error(`[restore] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
