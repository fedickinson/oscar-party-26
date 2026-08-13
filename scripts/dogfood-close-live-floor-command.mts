/**
 * Focused local proof for the atomic live-floor close command.
 *
 * This reads one published category, creates disposable rooms, exercises the
 * capability-gated anonymous RPC and blocked direct phase writes, then removes every
 * room-owned row. It never writes catalog tables and refuses a remote target.
 *
 *   npx tsx scripts/dogfood-close-live-floor-command.mts
 */

import { createClient } from '@supabase/supabase-js'
import { supabaseConfig } from './lib/env.mts'

const { target, url, anonKey, serviceKey } = supabaseConfig('local')
if (target !== 'local') throw new Error('close live floor dogfood is local-only')
if (!serviceKey) throw new Error('local Supabase did not report a service role key')

const anon = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const observer = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const service = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

type Room = {
  id: string
  show_pack_id: string
  phase: string
  active_spotlight_category_id: number | null
  spotlight_revision: number
  spotlight_opened_at: string | null
}

type Player = { id: string }
type Category = { id: number }

const roomIds: string[] = []
const capabilityByRoomId = new Map<string, string>()
let checks = 0

function check(condition: unknown, message: string): asserts condition {
  checks += 1
  if (!condition) throw new Error(message)
  console.log(`PASS ${message}`)
}

async function waitFor(predicate: () => boolean, timeoutMs = 5_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  return false
}

function closeLiveFloor(roomId: string, actorPlayerId: string) {
  return anon.rpc('close_live_floor_authorized', {
    p_room_id: roomId,
    p_actor_player_id: actorPlayerId,
    p_operator_capability: capabilityByRoomId.get(roomId) ?? null,
  })
}

async function createRoom(label: string): Promise<{ room: Room; players: Player[] }> {
  const code = `${label}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`
  const { data: room, error: roomError } = await service
    .from('rooms')
    .insert({ code, phase: 'lobby', host_id: null })
    .select('id,show_pack_id,phase,active_spotlight_category_id,spotlight_revision,spotlight_opened_at')
    .single()
  if (roomError) throw roomError
  roomIds.push(room.id)

  const { data: players, error: playerError } = await service
    .from('players')
    .insert([
      { room_id: room.id, name: `${label} Host`, is_host: true },
      { room_id: room.id, name: `${label} Guest`, is_host: false },
    ])
    .select('id')
  if (playerError) throw playerError

  const { error: hostError } = await service
    .from('rooms')
    .update({ host_id: players[0].id })
    .eq('id', room.id)
  if (hostError) throw hostError
  const { data: issuance, error: issuanceError } = await service.rpc(
    'issue_room_operator_capability',
    { p_room_id: room.id },
  )
  if (issuanceError) throw issuanceError
  const capability = (issuance as { capability?: string } | null)?.capability
  if (!capability) throw new Error('operator capability issuance returned no token')
  capabilityByRoomId.set(room.id, capability)
  return { room: room as Room, players: players as Player[] }
}

async function readRoom(roomId: string): Promise<Room> {
  const { data, error } = await service
    .from('rooms')
    .select('id,show_pack_id,phase,active_spotlight_category_id,spotlight_revision,spotlight_opened_at')
    .eq('id', roomId)
    .single()
  if (error) throw error
  return data as Room
}

async function setLive(roomId: string) {
  const { error } = await service.from('rooms').update({ phase: 'live' }).eq('id', roomId)
  if (error) throw error
}

async function loadCategory(showPackId: string): Promise<Category> {
  const { data, error } = await service
    .from('categories')
    .select('id')
    .eq('show_pack_id', showPackId)
    .is('room_id', null)
    .order('display_order')
    .limit(1)
    .single()
  if (error) throw error
  return data as Category
}

try {
  const { room, players } = await createRoom('CLF')
  check(room.phase === 'lobby', 'a disposable room begins before live play')

  const beforeLive = await closeLiveFloor(room.id, players[0].id)
  check(
    beforeLive.error?.message.includes('only a live room'),
    'the host cannot close a room before live play',
  )

  const { error: modelError } = await service
    .from('rooms')
    .update({ game_model: 'legacy_ensemble' })
    .eq('id', room.id)
  if (modelError) throw modelError
  await setLive(room.id)

  const legacy = await anon.rpc('close_live_floor', {
    p_room_id: room.id,
    p_actor_player_id: players[0].id,
  })
  check(legacy.error != null, 'the host-id-only close primitive is not browser executable')

  const missingCapability = await anon.rpc('close_live_floor_authorized', {
    p_room_id: room.id,
    p_actor_player_id: players[0].id,
    p_operator_capability: null,
  })
  check(
    missingCapability.error?.message.includes('valid operator capability'),
    'the current host cannot close without the room capability',
  )

  const nonHost = await closeLiveFloor(room.id, players[1].id)
  check(
    nonHost.error?.message.includes('current room host authority'),
    'a non-host cannot close the live floor',
  )

  const { error: demoteError } = await service
    .from('players')
    .update({ is_host: false })
    .eq('id', players[0].id)
  if (demoteError) throw demoteError
  const demotedHost = await closeLiveFloor(room.id, players[0].id)
  check(
    demotedHost.error?.message.includes('current room host authority'),
    'a stale room host pointer is insufficient without the host player role',
  )
  const { error: restoreError } = await service
    .from('players')
    .update({ is_host: true })
    .eq('id', players[0].id)
  if (restoreError) throw restoreError

  const category = await loadCategory(room.show_pack_id)
  check(category.id > 0, 'loaded one authored category read-only')
  const { error: openError } = await anon.rpc('open_scheduled_spotlight_authorized', {
    p_room_id: room.id,
    p_category_id: category.id,
    p_expected_revision: 0,
    p_actor_player_id: players[0].id,
    p_operator_capability: capabilityByRoomId.get(room.id) ?? null,
  })
  if (openError) throw openError
  const opened = await readRoom(room.id)
  check(
    opened.active_spotlight_category_id === category.id
      && opened.spotlight_revision === 1
      && opened.spotlight_opened_at != null,
    'the fixture has an active spotlight before closure',
  )

  const observedFinished: Array<{ phase?: string; active_spotlight_category_id?: number | null }> = []
  const channel = observer
    .channel(`close-live-floor-proof:${room.id}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'rooms',
      filter: `id=eq.${room.id}`,
    }, (payload) => {
      const updated = payload.new as { phase?: string; active_spotlight_category_id?: number | null }
      if (updated.phase === 'finished') observedFinished.push(updated)
    })

  await Promise.race([
    new Promise<void>((resolveSubscribe, rejectSubscribe) => {
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolveSubscribe()
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          rejectSubscribe(new Error(`close live floor channel failed with ${status}`))
        }
      })
    }),
    new Promise<never>((_, rejectSubscribe) => {
      setTimeout(() => rejectSubscribe(new Error('close live floor channel did not subscribe')), 5_000)
    }),
  ])

  const concurrent = await Promise.all([
    closeLiveFloor(room.id, players[0].id),
    closeLiveFloor(room.id, players[0].id),
  ])
  check(
    concurrent.every((result) => result.error == null),
    'concurrent identical host closures both reconcile successfully',
  )

  const closed = await readRoom(room.id)
  check(
    closed.phase === 'finished' && closed.active_spotlight_category_id == null,
    'closure writes provisional results and clears the spotlight atomically',
  )
  check(
    closed.spotlight_revision === 1 && closed.spotlight_opened_at === opened.spotlight_opened_at,
    'closure preserves the latest spotlight ceremony identity',
  )
  check(
    await waitFor(() => observedFinished.length >= 1),
    'a second client receives the finished phase through room Realtime',
  )
  check(
    observedFinished.every((update) => update.active_spotlight_category_id == null),
    'Realtime never exposes a finished room with an active spotlight',
  )

  const replay = await closeLiveFloor(room.id, players[0].id)
  if (replay.error) throw replay.error
  await new Promise((resolve) => setTimeout(resolve, 150))
  check(observedFinished.length === 1, 'an exact replay performs no second room write')
  check((await readRoom(room.id)).phase === 'finished', 'an exact replay returns the canonical result')

  await observer.removeChannel(channel)

  const missing = await service.rpc('close_live_floor', {
    p_room_id: '00000000-0000-4000-8000-000000000000',
    p_actor_player_id: players[0].id,
  })
  check(missing.error?.message.includes('room not found'), 'a missing room is reported explicitly')

  const mixed = await createRoom('MIX')
  await setLive(mixed.room.id)
  const mixedCategory = await loadCategory(mixed.room.show_pack_id)
  const { error: mixedOpenError } = await service
    .from('rooms')
    .update({ active_spotlight_category_id: mixedCategory.id })
    .eq('id', mixed.room.id)
  if (mixedOpenError) throw mixedOpenError
  const { error: mixedCloseError } = await anon
    .from('rooms')
    .update({ phase: 'finished' })
    .eq('id', mixed.room.id)
  check(
    mixedCloseError?.message.includes('authorized referee command'),
    'a direct browser live-to-finished write is rejected',
  )
  const mixedClosed = await readRoom(mixed.room.id)
  check(
    mixedClosed.phase === 'live' && mixedClosed.active_spotlight_category_id === mixedCategory.id,
    'a rejected direct close leaves the canonical live ceremony untouched',
  )

  const { count: eventCount, error: eventCountError } = await service
    .from('room_winners')
    .select('category_id', { count: 'exact', head: true })
    .eq('room_id', room.id)
  if (eventCountError) throw eventCountError
  check(eventCount === 0, 'a zero-event room can close without synthetic declarations')

  console.log(`PASS ${checks} atomic close live floor checks`)
} finally {
  for (const roomId of roomIds.reverse()) {
    await service
      .from('rooms')
      .update({ host_id: null, active_spotlight_category_id: null })
      .eq('id', roomId)
    await service.from('players').delete().eq('room_id', roomId)
    await service.from('rooms').delete().eq('id', roomId)
  }
  if (roomIds.length > 0) {
    const { count } = await service
      .from('rooms')
      .select('id', { count: 'exact', head: true })
      .in('id', roomIds)
    check(count === 0, 'removed every disposable close-floor room and room-owned row')
  }
}
