#!/usr/bin/env -S npx tsx

/**
 * Plan or apply one sealed-snapshot repair to a human player chat message.
 * Dry run is the default. Apply requires the exact canonical plan emitted by
 * a prior dry run plus an explicit room-code confirmation.
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertMessageRepairPlanMatchesSnapshot,
  buildMessageRepairPreflight,
  classifyApprovedMessageRepairCurrent,
  parseMessageRepairPlan,
  serializeMessageRepairPlan,
  type MessageRepairPlan,
} from '../src/lib/message-repair'
import { supabaseConfig } from './lib/env.mts'
import { canonicalProspectivePath, writeUtf8FileSafely } from './lib/safe-write.mts'
import { loadSealedOperatorSnapshot } from './lib/sealed-operator-snapshot.mts'
import { captureStableOperatorSnapshot } from './lib/stable-operator-snapshot.mts'

interface Options {
  snapshot: string
  room: string
  message: string
  note?: string
  planOutput?: string
  approvedPlan?: string
  apply: boolean
  confirmRoom?: string
}

interface RepairRpcRow {
  repair_key: string
  action: string
  correction_message_id: string
  already_applied: boolean
  resulting_row: Record<string, unknown> | null
}

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const privateRepairRoot = resolve(repoRoot, '.private', 'repairs')

function resolvePrivatePlanPath(option: string, existing: boolean): string {
  mkdirSync(privateRepairRoot, { recursive: true, mode: 0o700 })
  const path = existing ? realpathSync(resolve(option)) : canonicalProspectivePath(option)
  const privateRelative = relative(privateRepairRoot, path)
  const temporaryRelative = relative(realpathSync(tmpdir()), path)
  const insidePrivate = privateRelative !== '' && !privateRelative.startsWith('..') && !isAbsolute(privateRelative)
  const insideTemporary = temporaryRelative !== '' && !temporaryRelative.startsWith('..') && !isAbsolute(temporaryRelative)
  if (!insidePrivate && !insideTemporary) {
    throw new Error('message repair plans must stay under .private/repairs or the system temporary directory')
  }
  return path
}

function usage(): never {
  console.error([
    'Usage: npx tsx scripts/repair-room-message.mts',
    '  --snapshot SNAPSHOT_DIR --room CODE --message UUID',
    '  --note "PUBLIC REASON" --plan-output PLAN.json',
    '  [--apply --approved-plan PLAN.json --confirm-room CODE]',
  ].join('\n'))
  process.exit(1)
}

function parseArgs(argv: string[]): Options {
  let snapshot = ''
  let room = ''
  let message = ''
  let note: string | undefined
  let planOutput: string | undefined
  let approvedPlan: string | undefined
  let apply = false
  let confirmRoom: string | undefined
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--snapshot') snapshot = argv[++index] ?? ''
    else if (arg === '--room') room = argv[++index] ?? ''
    else if (arg === '--message') message = argv[++index] ?? ''
    else if (arg === '--note') note = argv[++index] ?? ''
    else if (arg === '--plan-output') planOutput = argv[++index] ?? ''
    else if (arg === '--approved-plan') approvedPlan = argv[++index] ?? ''
    else if (arg === '--apply') apply = true
    else if (arg === '--confirm-room') confirmRoom = (argv[++index] ?? '').trim().toUpperCase()
    else if (arg === '--help' || arg === '-h') usage()
    else throw new Error(`unknown argument ${arg}`)
  }
  room = room.trim().toUpperCase()
  if (!snapshot || !room || !message) usage()
  if (apply) {
    if (!approvedPlan) throw new Error('--apply requires --approved-plan')
    if (planOutput) throw new Error('--plan-output is valid only in dry-run mode')
    if (note !== undefined) throw new Error('--note is sealed in the approved plan and cannot be supplied on apply')
    if (confirmRoom !== room) throw new Error(`--apply requires --confirm-room ${room}`)
  } else {
    if (!note) throw new Error('dry run requires --note')
    if (!planOutput) throw new Error('dry run requires --plan-output')
    if (approvedPlan || confirmRoom) throw new Error('apply authority flags are valid only with --apply')
  }
  return { snapshot, room, message: message.toLowerCase(), note, planOutput, approvedPlan, apply, confirmRoom }
}

function printPlan(plan: MessageRepairPlan, state: 'pending' | 'replay_candidate' = 'pending'): void {
  console.log(`[message-repair] room=${plan.room.code} id=${plan.room.id}`)
  console.log(`[message-repair] message=${plan.message_id}`)
  console.log(`[message-repair] action=${plan.action} current=${state}`)
  console.log(`[message-repair] repair_key=${plan.repair_key}`)
  console.log(`[message-repair] public_correction=${JSON.stringify(plan.public_correction)}`)
}

async function callRepair(
  url: string,
  serviceKey: string,
  plan: MessageRepairPlan,
): Promise<RepairRpcRow> {
  const response = await fetch(`${url}/rest/v1/rpc/repair_room_message_from_snapshot`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_repair_key: plan.repair_key,
      p_room_id: plan.room.id,
      p_room_show_pack_id: plan.room.show_pack_id,
      p_message_id: plan.message_id,
      p_action: plan.action,
      p_snapshot_manifest_sha256: plan.snapshot_manifest_sha256,
      p_expected_row: plan.expected_row,
      p_desired_row: plan.desired_row,
      p_public_correction: plan.public_correction,
    }),
  })
  const raw = await response.text()
  if (!response.ok) {
    throw new Error(`message repair RPC failed: ${response.status} ${raw.slice(0, 500)}`)
  }
  const value: unknown = JSON.parse(raw)
  if (!Array.isArray(value) || value.length !== 1 || value[0] === null || typeof value[0] !== 'object') {
    throw new Error('message repair RPC returned an invalid receipt')
  }
  const row = value[0] as RepairRpcRow
  if (row.repair_key !== plan.repair_key
      || row.action !== plan.action
      || typeof row.correction_message_id !== 'string'
      || typeof row.already_applied !== 'boolean') {
    throw new Error('message repair RPC receipt does not match the approved plan')
  }
  return row
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const sealed = loadSealedOperatorSnapshot(options.snapshot)
  console.log('[message-repair] snapshot_valid=true')
  console.log(`[message-repair] snapshot=${sealed.directory}`)
  console.log(`[message-repair] snapshot_manifest_sha256=${sealed.manifestSha256}`)

  const config = supabaseConfig('local')
  if (!config.serviceKey) throw new Error('message repair requires the selected target service-role key')
  if (sealed.manifest.target !== config.target) {
    throw new Error(`snapshot target ${sealed.manifest.target} does not match database target ${config.target}`)
  }
  const current = await captureStableOperatorSnapshot(config.url, config.serviceKey)
  const currentSchemaSha = createHash('sha256').update(current.schema).digest('hex')
  if (currentSchemaSha !== sealed.manifest.schema_sha256) {
    throw new Error(`database schema ${currentSchemaSha} does not match sealed schema ${sealed.manifest.schema_sha256}`)
  }

  if (!options.apply) {
    const result = buildMessageRepairPreflight({
      snapshot: sealed.rows,
      current: current.payload,
      roomCode: options.room,
      messageId: options.message,
      snapshotManifestSha256: sealed.manifestSha256,
      note: options.note ?? '',
    })
    if (result.status === 'unchanged') {
      console.log('[message-repair] status=unchanged; no plan written and no rows changed')
      return
    }
    if (result.status === 'restore_missing') {
      throw new Error('target message is missing from current data; use restore-room-snapshot.mts')
    }
    const output = resolvePrivatePlanPath(options.planOutput ?? '', false)
    writeUtf8FileSafely(output, serializeMessageRepairPlan(result.plan), false, 0o600)
    printPlan(result.plan)
    console.log(`[message-repair] mode=dry-run plan=${output}; no rows changed`)
    return
  }

  const planPath = resolvePrivatePlanPath(options.approvedPlan ?? '', true)
  if (!existsSync(planPath)) throw new Error(`approved plan does not exist: ${planPath}`)
  const plan = parseMessageRepairPlan(readFileSync(planPath, 'utf8'))
  if (plan.room.code !== options.room || plan.message_id !== options.message) {
    throw new Error('approved plan target does not match --room and --message')
  }
  if (plan.snapshot_manifest_sha256 !== sealed.manifestSha256) {
    throw new Error('approved plan does not match the supplied sealed snapshot manifest')
  }
  assertMessageRepairPlanMatchesSnapshot(plan, sealed.rows)
  const state = classifyApprovedMessageRepairCurrent(plan, current.payload)
  printPlan(plan, state)
  console.log(`[message-repair] authority=approved-plan path=${planPath}`)

  const receipt = await callRepair(config.url, config.serviceKey, plan)
  const postflight = await captureStableOperatorSnapshot(config.url, config.serviceKey)
  const postflightSchemaSha = createHash('sha256').update(postflight.schema).digest('hex')
  if (postflightSchemaSha !== sealed.manifest.schema_sha256) {
    throw new Error('database schema changed during message repair')
  }
  const resultState = classifyApprovedMessageRepairCurrent(plan, postflight.payload)
  if (resultState !== 'replay_candidate') throw new Error('message repair postflight did not reach approved result')
  const correction = postflight.payload.messages.find((row) => row.id === receipt.correction_message_id)
  if (!correction
      || correction.room_id !== plan.room.id
      || correction.player_id !== 'system'
      || correction.text !== plan.public_correction) {
    throw new Error('message repair public correction did not verify')
  }
  console.log(`[message-repair] correction_message_id=${receipt.correction_message_id}`)
  console.log(`[message-repair] applied=${!receipt.already_applied} replay=${receipt.already_applied} verified=true`)
}

main().catch((error) => {
  console.error(`[message-repair] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
