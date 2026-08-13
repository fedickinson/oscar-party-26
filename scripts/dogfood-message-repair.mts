#!/usr/bin/env -S npx tsx

/** Local-only end-to-end proof for the sealed-snapshot message repair command. */

import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { supabaseConfig } from './lib/env.mts'

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const config = supabaseConfig('local')
if (config.target !== 'local') throw new Error('message-repair dogfood is local-only')
if (!config.serviceKey) throw new Error('local Supabase did not report a service-role key')
const SERVICE_KEY = config.serviceKey
const workspace = mkdtempSync(join(tmpdir(), 'message-repair-dogfood-'))
let roomId: string | null = null
const checks: string[] = []
const cleanupErrors: string[] = []
let scenarioError: unknown

function requireCondition(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
  checks.push(message)
}

async function db(path: string, init: RequestInit = {}, key = SERVICE_KEY): Promise<any> {
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${response.status} ${text.slice(0, 500)}`)
  return text ? JSON.parse(text) : null
}

async function rejectedDb(path: string, init: RequestInit, key = SERVICE_KEY): Promise<string> {
  const response = await fetch(`${config.url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const text = await response.text()
  if (response.ok) throw new Error(`${init.method ?? 'GET'} ${path} unexpectedly succeeded`)
  return `${response.status} ${text}`
}

function invoke(script: string, args: string[]): { output: string; status: number | null } {
  const result = spawnSync('npx', ['tsx', script, ...args], {
    cwd: repoRoot,
    env: { ...process.env, SUPABASE_TARGET: 'local' },
    encoding: 'utf8',
    timeout: 60_000,
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (result.error) throw result.error
  return { output, status: result.status }
}

function run(script: string, args: string[]): string {
  const result = invoke(script, args)
  if (result.status !== 0) {
    if (result.output.trim()) console.error(result.output.trim())
    throw new Error(`${script} exited ${result.status ?? 'without status'}`)
  }
  return result.output
}

function reject(script: string, args: string[]): string {
  const result = invoke(script, args)
  if (result.status === 0) {
    if (result.output.trim()) console.error(result.output.trim())
    throw new Error(`${script} unexpectedly accepted a rejected scenario`)
  }
  return result.output
}

function repairArgs(snapshot: string, room: string, message: string): string[] {
  return ['--snapshot', snapshot, '--room', room, '--message', message]
}

try {
  console.log('[message-repair-dogfood] mode=local-scratch')
  const roomCode = `MRP${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`
  const [room] = await db('rooms', {
    method: 'POST',
    body: JSON.stringify({ code: roomCode, phase: 'lobby', host_id: null }),
  })
  requireCondition(room?.id, 'scratch room was created')
  roomId = room.id
  const [player] = await db('players', {
    method: 'POST',
    body: JSON.stringify({ room_id: room.id, name: 'Repair Harness', is_host: true }),
  })
  requireCondition(player?.id, 'scratch player was created')
  await db(`rooms?id=eq.${room.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ host_id: player.id }),
  })
  const [target] = await db('messages', {
    method: 'POST',
    body: JSON.stringify({ room_id: room.id, player_id: player.id, text: 'Sealed original' }),
  })
  requireCondition(target?.id, 'sealed target message was created')

  const snapshotRoot = join(workspace, 'snapshots')
  run('scripts/snapshot-game.mts', ['--output-root', snapshotRoot])
  const snapshots = readdirSync(snapshotRoot)
  requireCondition(snapshots.length === 1, 'one sealed snapshot was captured')
  const snapshot = join(snapshotRoot, snapshots[0])

  await db(`messages?id=eq.${target.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ text: 'Drifted transcription' }),
  })
  const replacePlan = join(workspace, 'replace-plan.json')
  const replaceBase = repairArgs(snapshot, roomCode, target.id)
  const dryOutput = run('scripts/repair-room-message.mts', [
    ...replaceBase,
    '--note', 'Correcting the transcript against the sealed record.',
    '--plan-output', replacePlan,
  ])
  requireCondition(dryOutput.includes('mode=dry-run'), 'replacement dry run wrote no database rows')

  await db(`messages?id=eq.${target.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ text: 'Concurrent third value' }),
  })
  const raceOutput = reject('scripts/repair-room-message.mts', [
    ...replaceBase,
    '--apply', '--approved-plan', replacePlan, '--confirm-room', roomCode,
  ])
  requireCondition(
    raceOutput.includes('matches neither the approved expectation nor result'),
    'replacement compare-and-swap rejected concurrent drift',
  )
  await db(`messages?id=eq.${target.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ text: 'Drifted transcription' }),
  })
  const applyOutput = run('scripts/repair-room-message.mts', [
    ...replaceBase,
    '--apply', '--approved-plan', replacePlan, '--confirm-room', roomCode,
  ])
  requireCondition(applyOutput.includes('applied=true replay=false verified=true'), 'replacement applied and verified')
  const replayOutput = run('scripts/repair-room-message.mts', [
    ...replaceBase,
    '--apply', '--approved-plan', replacePlan, '--confirm-room', roomCode,
  ])
  requireCondition(replayOutput.includes('applied=false replay=true verified=true'), 'replacement replay was idempotent')
  const repaired = await db(`messages?id=eq.${target.id}&select=text`)
  requireCondition(repaired[0]?.text === 'Sealed original', 'replacement restored the sealed text')
  const replaceCorrections = await db(
    `messages?room_id=eq.${room.id}&text=eq.${encodeURIComponent('Operator correction: a player chat message was restored to the sealed record. Correcting the transcript against the sealed record.')}&select=id`,
  )
  requireCondition(replaceCorrections.length === 1, 'replacement appended exactly one public correction')

  const [extra] = await db('messages', {
    method: 'POST',
    body: JSON.stringify({ room_id: room.id, player_id: player.id, text: 'Accidental duplicate' }),
  })
  const deletePlan = join(workspace, 'delete-plan.json')
  const deleteBase = repairArgs(snapshot, roomCode, extra.id)
  run('scripts/repair-room-message.mts', [
    ...deleteBase,
    '--note', 'Removing an accidental duplicate.',
    '--plan-output', deletePlan,
  ])
  run('scripts/repair-room-message.mts', [
    ...deleteBase,
    '--apply', '--approved-plan', deletePlan, '--confirm-room', roomCode,
  ])
  const deleted = await db(`messages?id=eq.${extra.id}&select=id`)
  requireCondition(deleted.length === 0, 'approved extra player message was deleted')
  const deleteCorrections = await db(
    `messages?room_id=eq.${room.id}&text=eq.${encodeURIComponent('Operator correction: an extra player chat message was removed. Removing an accidental duplicate.')}&select=id`,
  )
  requireCondition(deleteCorrections.length === 1, 'deletion appended exactly one public correction')

  const currentTarget = (await db(`messages?id=eq.${target.id}&select=*`))[0]
  const packRaceOutput = await rejectedDb('rpc/repair_room_message_from_snapshot', {
    method: 'POST',
    body: JSON.stringify({
      p_repair_key: 'd'.repeat(64),
      p_room_id: room.id,
      p_room_show_pack_id: randomUUID(),
      p_message_id: target.id,
      p_action: 'delete_extra',
      p_snapshot_manifest_sha256: 'e'.repeat(64),
      p_expected_row: currentTarget,
      p_desired_row: null,
      p_public_correction: 'Operator correction: an extra player chat message was removed. Rejecting changed room identity.',
    }),
  })
  requireCondition(
    packRaceOutput.includes('room show-pack identity changed after repair plan approval'),
    'transaction rechecked the approved room show-pack identity',
  )

  const [synthetic] = await db('messages', {
    method: 'POST',
    body: JSON.stringify({ room_id: room.id, player_id: 'system', text: 'Synthetic row' }),
  })
  const syntheticOutput = reject('scripts/repair-room-message.mts', [
    ...repairArgs(snapshot, roomCode, synthetic.id),
    '--note', 'This must be rejected.',
    '--plan-output', join(workspace, 'synthetic-plan.json'),
  ])
  requireCondition(
    syntheticOutput.includes('not authored by a current room player'),
    'synthetic transcript rows were rejected',
  )

  const instanceId = randomUUID()
  const reactionKey = `message-repair-dogfood:${randomUUID()}`
  const claim = await db('rpc/claim_companion_reaction', {
    method: 'POST',
    body: JSON.stringify({
      p_room_id: room.id,
      p_reaction_key: reactionKey,
      p_engine: 'daemon',
      p_instance_id: instanceId,
      p_lease_seconds: 60,
    }),
  })
  requireCondition(claim[0]?.claimed === true, 'companion provenance fixture was claimed')
  const completion = await db('rpc/complete_companion_reaction', {
    method: 'POST',
    body: JSON.stringify({
      p_room_id: room.id,
      p_reaction_key: reactionKey,
      p_instance_id: instanceId,
      p_messages: [{ player_id: player.id, text: 'Claim-owned output' }],
    }),
  })
  const companionMessageId = completion[0]?.output_message_ids?.[0]
  requireCondition(companionMessageId, 'companion provenance fixture produced a message')
  const companionPlan = join(workspace, 'companion-plan.json')
  const companionBase = repairArgs(snapshot, roomCode, companionMessageId)
  run('scripts/repair-room-message.mts', [
    ...companionBase,
    '--note', 'This claim-owned output must remain immutable.',
    '--plan-output', companionPlan,
  ])
  const companionOutput = reject('scripts/repair-room-message.mts', [
    ...companionBase,
    '--apply', '--approved-plan', companionPlan, '--confirm-room', roomCode,
  ])
  requireCondition(companionOutput.includes('companion output messages cannot be repaired'), 'companion output provenance blocked repair')

  const [reactionSource] = await db('messages', {
    method: 'POST',
    body: JSON.stringify({ room_id: room.id, player_id: player.id, text: 'Reaction source' }),
  })
  const sourceReactionKey = `chat:${reactionSource.id}:ambient`
  const sourceClaim = await db('rpc/claim_companion_reaction', {
    method: 'POST',
    body: JSON.stringify({
      p_room_id: room.id,
      p_reaction_key: sourceReactionKey,
      p_engine: 'daemon',
      p_instance_id: randomUUID(),
      p_lease_seconds: 60,
    }),
  })
  requireCondition(sourceClaim[0]?.claimed === true, 'source-reaction provenance fixture was claimed')
  const sourcePlan = join(workspace, 'source-plan.json')
  const sourceBase = repairArgs(snapshot, roomCode, reactionSource.id)
  run('scripts/repair-room-message.mts', [
    ...sourceBase,
    '--note', 'Reaction source evidence must remain immutable.',
    '--plan-output', sourcePlan,
  ])
  const sourceOutput = reject('scripts/repair-room-message.mts', [
    ...sourceBase,
    '--apply', '--approved-plan', sourcePlan, '--confirm-room', roomCode,
  ])
  requireCondition(
    sourceOutput.includes('chat messages with reaction provenance cannot be repaired'),
    'reaction source provenance blocked repair',
  )

  const [keepsakeSource] = await db('messages', {
    method: 'POST',
    body: JSON.stringify({ room_id: room.id, player_id: player.id, text: 'Keepsake source' }),
  })
  await db('player_verdicts', {
    method: 'POST',
    body: JSON.stringify({
      room_id: room.id,
      player_id: player.id,
      companion_id: 'ned',
      title: 'Repair Witness',
      verdict: 'The record remains intact.',
      highlights: [{ message_id: keepsakeSource.id, note: 'Retained in the keepsake.' }],
      imagery: [],
    }),
  })
  const keepsakePlan = join(workspace, 'keepsake-plan.json')
  const keepsakeBase = repairArgs(snapshot, roomCode, keepsakeSource.id)
  run('scripts/repair-room-message.mts', [
    ...keepsakeBase,
    '--note', 'Keepsake evidence must remain immutable.',
    '--plan-output', keepsakePlan,
  ])
  const keepsakeOutput = reject('scripts/repair-room-message.mts', [
    ...keepsakeBase,
    '--apply', '--approved-plan', keepsakePlan, '--confirm-room', roomCode,
  ])
  requireCondition(
    keepsakeOutput.includes('keepsake evidence messages cannot be repaired'),
    'keepsake evidence blocked repair',
  )

  const [closedCandidate] = await db('messages', {
    method: 'POST',
    body: JSON.stringify({ room_id: room.id, player_id: player.id, text: 'Closed candidate' }),
  })
  const closedPlan = join(workspace, 'closed-plan.json')
  const closedBase = repairArgs(snapshot, roomCode, closedCandidate.id)
  run('scripts/repair-room-message.mts', [
    ...closedBase,
    '--note', 'Closed rooms must reject repair.',
    '--plan-output', closedPlan,
  ])
  const [settlement] = await db('room_settlements', {
    method: 'POST',
    body: JSON.stringify({
      room_id: room.id,
      version: 1,
      manifest_hash: 'c'.repeat(64),
      title: 'Repair dogfood closed-room fixture',
      actor: 'Local harness',
      bingo_mode: 'replace',
    }),
  })
  requireCondition(settlement?.id, 'closed-room fixture has a valid settlement')
  await db(`rooms?id=eq.${room.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ phase: 'closed', active_settlement_id: settlement.id }),
  })
  const closedOutput = reject('scripts/repair-room-message.mts', [
    ...closedBase,
    '--apply', '--approved-plan', closedPlan, '--confirm-room', roomCode,
  ])
  requireCondition(closedOutput.includes('closed room chat cannot be repaired'), 'closed room rejected repair')
  await db(`rooms?id=eq.${room.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ phase: 'lobby', active_settlement_id: null }),
  })

  const anonOutput = await rejectedDb('rpc/repair_room_message_from_snapshot', {
    method: 'POST',
    body: JSON.stringify({
      p_repair_key: 'a'.repeat(64),
      p_room_id: room.id,
      p_room_show_pack_id: room.show_pack_id,
      p_message_id: target.id,
      p_action: 'delete_extra',
      p_snapshot_manifest_sha256: 'b'.repeat(64),
      p_expected_row: target,
      p_desired_row: null,
      p_public_correction: 'Operator correction: an extra player chat message was removed. Rejected anonymous call.',
    }),
  }, config.anonKey)
  requireCondition(/401|403|404/.test(anonOutput), 'anonymous callers cannot execute the repair RPC')
} catch (error) {
  scenarioError = error
} finally {
  if (roomId) {
    try {
      await db(`rooms?id=eq.${roomId}`, {
        method: 'PATCH',
        body: JSON.stringify({ phase: 'lobby', active_settlement_id: null, host_id: null }),
      })
      await db(`rooms?id=eq.${roomId}`, { method: 'DELETE' })
      const residue = await db(`rooms?id=eq.${roomId}&select=id`)
      if (residue.length) cleanupErrors.push(`scratch room ${roomId} still exists`)
    } catch (error) {
      cleanupErrors.push(`scratch room cleanup failed: ${String(error)}`)
    }
  }
  try {
    const allowedRoot = `${tmpdir()}${sep}`
    if (!workspace.startsWith(allowedRoot) || !workspace.includes('message-repair-dogfood-')) {
      cleanupErrors.push(`refusing unexpected temporary path ${workspace}`)
    } else {
      rmSync(workspace, { recursive: true, force: true })
    }
  } catch (error) {
    cleanupErrors.push(`temporary cleanup failed: ${String(error)}`)
  }
}

if (scenarioError || cleanupErrors.length) {
  console.error(`[message-repair-dogfood] ERROR: ${[
    ...(scenarioError ? [`scenario failed: ${String(scenarioError)}`] : []),
    ...cleanupErrors,
  ].join('; ')}`)
  process.exit(1)
}

console.log(`[message-repair-dogfood] checks=${checks.length} cleaned=true`)
