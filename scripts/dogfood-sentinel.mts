/**
 * Focused local proof for the read-only operator sentinel.
 *
 * The scratch room moves through missing identity, healthy operation, a fact
 * newer than cast activity, recovery, a stale daemon lease, and a private
 * grounding review. The harness writes no catalog row and removes all scratch
 * data when it finishes.
 *
 *   npx tsx scripts/dogfood-sentinel.mts
 */
import { spawn, spawnSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { supabaseConfig } from './lib/env.mts'

const { target, url, serviceKey } = supabaseConfig('local')
if (target !== 'local') throw new Error('sentinel dogfood is local-only')
if (!serviceKey) throw new Error('local Supabase did not report a service role key')

const service = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

let roomId: string | null = null
let checks = 0

function check(condition: unknown, message: string): asserts condition {
  checks += 1
  if (!condition) throw new Error(message)
  console.log(`PASS ${message}`)
}

function runSentinel(args: string[], operatorCapability?: string) {
  const result = spawnSync(
    'node',
    ['--import', 'tsx', 'scripts/sentinel.mts', ...args],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        SUPABASE_TARGET: 'local',
        ...(operatorCapability ? { ROOM_OPERATOR_CAPABILITY: operatorCapability } : {}),
      },
      encoding: 'utf8',
      timeout: 60_000,
    },
  )
  if (result.error) throw result.error
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  console.log(output.trim())
  return { output, status: result.status }
}

async function runQuietLoop(code: string, operatorCapability: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'node',
      ['--import', 'tsx', 'scripts/sentinel.mts', '--room', code, '--loop', '5'],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          SUPABASE_TARGET: 'local',
          ROOM_OPERATOR_CAPABILITY: operatorCapability,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
    let output = ''
    child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString() })
    child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString() })
    child.on('error', reject)
    const timer = setTimeout(() => child.kill('SIGTERM'), 5_800)
    child.on('close', () => {
      clearTimeout(timer)
      console.log(output.trim())
      resolve(output)
    })
  })
}

function iso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString()
}

const code = `SEN${Math.floor(Math.random() * 10_000).toString().padStart(4, '0')}`
const instanceId = crypto.randomUUID()

try {
  const invalid = runSentinel(['--room', code, '--loop', '4'])
  check(invalid.status === 1 && invalid.output.includes('--loop must be an integer'),
    'strict argument validation rejects an unsafe polling interval')
  check(!invalid.output.includes('target:'),
    'invalid arguments fail before any database target is resolved')

  const { data: room, error: roomError } = await service.from('rooms').insert({
    code,
    phase: 'live',
    host_id: null,
  }).select('id').single()
  if (roomError) throw roomError
  roomId = room.id

  const hostless = runSentinel(['--room', code])
  check(hostless.status === 2 && hostless.output.includes('status=ATTENTION'),
    'a live hostless room returns the operator-attention exit code')
  check(hostless.output.includes('HOST_IDENTITY:') && hostless.output.includes('ENGINE:'),
    'missing host identity and daemon lease remain separate alarm channels')

  const { data: host, error: hostError } = await service.from('players').insert({
    room_id: room.id,
    name: 'Sentinel Host',
    avatar_id: 'host',
    color: '#000000',
    is_host: true,
  }).select('id').single()
  if (hostError) throw hostError
  const { error: bindError } = await service.from('rooms')
    .update({ host_id: host.id })
    .eq('id', room.id)
  if (bindError) throw bindError
  const { error: heartbeatError } = await service.from('operator_heartbeats').insert({
    room_id: room.id,
    engine: 'companion_daemon',
    instance_id: instanceId,
    started_at: iso(-5_000),
    heartbeat_at: iso(0),
  })
  if (heartbeatError) throw heartbeatError

  const lockedReviews = runSentinel(['--room', code])
  check(lockedReviews.status === 2
      && lockedReviews.output.includes('GROUNDING_REVIEW:')
      && lockedReviews.output.includes('WITNESS_REVIEW:')
      && (lockedReviews.output.match(/operator capability unavailable/g) ?? []).length === 2,
    'a missing operator capability cannot produce a false clear private review channel')

  const { data: issuedCapability, error: capabilityError } = await service.rpc(
    'issue_room_operator_capability',
    { p_room_id: room.id },
  )
  if (capabilityError) throw capabilityError
  const operatorCapability = String(issuedCapability.capability)

  const healthy = runSentinel(['--room', code], operatorCapability)
  check(healthy.status === 0 && healthy.output.includes('status=CLEAR'),
    'a healthy live room exits clear')

  const quietLoop = await runQuietLoop(code, operatorCapability)
  check((quietLoop.match(/status=CLEAR/g) ?? []).length === 1,
    'loop mode suppresses an unchanged healthy signature across polls')

  const { error: quietMessagesError } = await service.from('messages').insert([
    {
      room_id: room.id,
      player_id: 'ned',
      text: 'The cast spoke before the next declaration.',
      created_at: iso(-2_000),
    },
    {
      room_id: room.id,
      player_id: 'winner-divider',
      text: 'A newly declared room fact.',
      created_at: iso(-1_000),
    },
  ])
  if (quietMessagesError) throw quietMessagesError
  const quietAfterFact = runSentinel(['--room', code], operatorCapability)
  check(quietAfterFact.status === 2 && quietAfterFact.output.includes('NARRATIVE_SEQUENCE:'),
    'a fact newer than cast activity raises the narrative-sequence channel')
  check(quietAfterFact.output.includes('sequence evidence only, not response proof'),
    'the narrative alarm carries its epistemic caveat at the source')

  const { error: recoveryMessageError } = await service.from('messages').insert({
    room_id: room.id,
    player_id: 'cersei',
    text: 'Cast activity resumed after the fact.',
    created_at: iso(0),
  })
  if (recoveryMessageError) throw recoveryMessageError
  const recovered = runSentinel(['--room', code], operatorCapability)
  check(recovered.status === 0 && recovered.output.includes('status=CLEAR'),
    'newer cast activity clears the sequence alarm')

  const { error: staleError } = await service.from('operator_heartbeats')
    .update({ heartbeat_at: iso(-120_000) })
    .eq('room_id', room.id)
    .eq('engine', 'companion_daemon')
  if (staleError) throw staleError
  const stale = runSentinel(['--room', code], operatorCapability)
  check(stale.status === 2 && stale.output.includes('ENGINE:') && stale.output.includes('stale'),
    'a stale daemon lease raises the engine channel')

  const { error: freshError } = await service.from('operator_heartbeats')
    .update({ heartbeat_at: iso(0) })
    .eq('room_id', room.id)
    .eq('engine', 'companion_daemon')
  if (freshError) throw freshError
  const { error: reviewError } = await service.rpc('record_companion_grounding_review', {
    p_room_id: room.id,
    p_actor_player_id: host.id,
    p_reaction_key: `sentinel:${Date.now()}:review`,
    p_surface: 'event',
    p_engine: 'daemon',
    p_facts: ['GAME RECORD: the sentinel dogfood preserved one declared fact.'],
    p_attempted_messages: [{
      companion_id: 'ned',
      text: 'An attempted line that requires human review.',
      delay_seconds: 0,
    }],
    p_findings: [{
      companion_id: 'ned',
      text: 'An attempted line that requires human review.',
      violations: ['The line asserted more than the provided game record established.'],
    }],
    p_attempts: 3,
    p_model: 'sentinel-dogfood',
  })
  if (reviewError) throw reviewError
  const review = runSentinel(['--room', code], operatorCapability)
  check(review.status === 2 && review.output.includes('GROUNDING_REVIEW:'),
    'a pending grounding batch raises its own review channel')
  check(!review.output.includes('WITNESS_REVIEW:'),
    'a clear witness queue does not inherit another queue meaning')

  const before = await service.from('rooms')
    .select('phase,host_id,active_settlement_id,grounding_review_revision')
    .eq('id', room.id)
    .single()
  if (before.error) throw before.error
  runSentinel(['--room', code], operatorCapability)
  const after = await service.from('rooms')
    .select('phase,host_id,active_settlement_id,grounding_review_revision')
    .eq('id', room.id)
    .single()
  if (after.error) throw after.error
  check(JSON.stringify(after.data) === JSON.stringify(before.data),
    'sentinel changes no room record or review revision')

  console.log(`PASS ${checks} sentinel checks`)
} finally {
  if (roomId) {
    await service.from('rooms').update({ host_id: null }).eq('id', roomId)
    await service.from('operator_heartbeats').delete().eq('room_id', roomId)
    await service.from('messages').delete().eq('room_id', roomId)
    await service.from('players').delete().eq('room_id', roomId)
    await service.from('rooms').delete().eq('id', roomId)
    const { count, error } = await service.from('rooms')
      .select('id', { count: 'exact', head: true })
      .eq('id', roomId)
    if (error) throw error
    check(count === 0, 'removed the sentinel scratch room and cascading private review')
  }
}
