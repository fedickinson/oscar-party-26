/**
 * Focused local proof for the player-roster synchronization contract.
 *
 * The published catalog is untouched. One disposable room exercises the real
 * players INSERT/UPDATE/DELETE stream, revision-safe snapshot replacement and
 * cold-worker reconciliation, then removes every row it created.
 *
 *   npx tsx scripts/dogfood-roster-sync.mts
 */

import { createClient } from '@supabase/supabase-js'
import { supabaseConfig } from './lib/env.mts'

const { target, url, anonKey, serviceKey } = supabaseConfig('local')
if (target !== 'local') throw new Error('roster sync dogfood is local-only')
if (!serviceKey) throw new Error('local Supabase did not report a service role key')

const watcher = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const actor = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const service = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

type RosterPlayer = {
  id: string
  name: string
  watch_group: string | null
}

let roomId: string | null = null
let checks = 0

function check(condition: unknown, message: string): asserts condition {
  checks++
  if (!condition) throw new Error(message)
  console.log(`PASS ${message}`)
}

async function waitFor(predicate: () => boolean, timeoutMs = 4_000) {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('timed out waiting for roster Realtime state')
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

try {
  const { data: room, error: roomError } = await service.from('rooms').insert({
    code: `RST${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
    phase: 'lobby',
    host_id: null,
  }).select().single()
  if (roomError) throw roomError
  roomId = room.id

  const { data: initialPlayers, error: initialError } = await service.from('players').insert([
    { room_id: room.id, name: 'Roster One', avatar_id: 'targaryen', color: '#D4AF37', is_host: true },
    { room_id: room.id, name: 'Roster Two', avatar_id: 'stark', color: '#999999', is_host: false },
  ]).select()
  if (initialError) throw initialError
  const { error: hostError } = await service.from('rooms')
    .update({ host_id: initialPlayers[0].id }).eq('id', room.id)
  if (hostError) throw hostError

  let roster: RosterPlayer[] = []
  let revision = 0
  let suppressEvents = false

  const upsert = (row: RosterPlayer) => {
    const index = roster.findIndex((player) => player.id === row.id)
    roster = index === -1
      ? [...roster, row]
      : roster.map((player, candidateIndex) => candidateIndex === index ? row : player)
  }

  async function hydrate() {
    while (true) {
      const revisionAtStart = revision
      const { data, error } = await watcher.from('players')
        .select('id,name,watch_group')
        .eq('room_id', room.id)
        .order('created_at')
        .order('id')
      if (error) throw error
      if (revision !== revisionAtStart) continue
      roster = data
      return
    }
  }

  const channel = watcher.channel(`roster-proof:${room.id}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'players', filter: `room_id=eq.${room.id}`,
    }, (payload) => {
      if (suppressEvents) return
      revision++
      upsert(payload.new as RosterPlayer)
    })
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'players', filter: `room_id=eq.${room.id}`,
    }, (payload) => {
      if (suppressEvents) return
      revision++
      upsert(payload.new as RosterPlayer)
    })
    .on('postgres_changes', {
      event: 'DELETE', schema: 'public', table: 'players',
    }, (payload) => {
      if (suppressEvents) return
      revision++
      const deletedId = (payload.old as { id?: string }).id
      if (deletedId) roster = roster.filter((player) => player.id !== deletedId)
    })

  await new Promise<void>((resolve, reject) => {
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve()
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        reject(new Error(`roster channel failed with ${status}`))
      }
    })
  })
  await hydrate()
  check(roster.length === 2, 'ready-before-hydrate publishes the complete initial roster')

  const { data: latePlayer, error: lateError } = await actor.from('players').insert({
    room_id: room.id,
    name: 'Roster Three',
    avatar_id: 'velaryon',
    color: '#7C3AED',
    is_host: false,
  }).select().single()
  if (lateError) throw lateError

  let lateArrivedDirectly = true
  try {
    await waitFor(() => roster.some((player) => player.id === latePlayer.id), 1_500)
  } catch {
    lateArrivedDirectly = false
  }
  if (!lateArrivedDirectly) {
    await new Promise((resolve) => setTimeout(resolve, 3_750))
    await hydrate()
  }
  check(roster.some((player) => player.id === latePlayer.id),
    'cold-window reconciliation includes a late joiner')

  const revisionBeforeStaleSnapshot = revision
  const { data: staleSnapshot, error: staleError } = await watcher.from('players')
    .select('id,name,watch_group')
    .eq('room_id', room.id)
    .order('created_at')
    .order('id')
  if (staleError) throw staleError
  check(staleSnapshot.some((player) => player.id === latePlayer.id),
    'captured the pre-delete snapshot used by the resurrection regression')

  const { error: deleteError } = await service.from('players').delete().eq('id', latePlayer.id)
  if (deleteError) throw deleteError
  await waitFor(() => revision > revisionBeforeStaleSnapshot &&
    !roster.some((player) => player.id === latePlayer.id))
  const staleSnapshotWouldPublish = revision === revisionBeforeStaleSnapshot
  if (staleSnapshotWouldPublish) roster = staleSnapshot
  check(!staleSnapshotWouldPublish && !roster.some((player) => player.id === latePlayer.id),
    'a delete revision rejects the stale snapshot instead of resurrecting its seat')

  const { error: renameError } = await actor.from('players')
    .update({ name: 'Roster One Revised' })
    .eq('id', initialPlayers[0].id)
  if (renameError) throw renameError
  await waitFor(() => roster.some((player) =>
    player.id === initialPlayers[0].id && player.name === 'Roster One Revised'))
  check(true, 'a warm player update reaches the roster directly')

  suppressEvents = true
  const { error: groupError } = await actor.rpc('set_player_watch_group_authorized', {
    p_room_id: room.id,
    p_actor_player_id: initialPlayers[1].id,
    p_target_player_id: initialPlayers[1].id,
    p_watch_group: 'Remote Room',
    p_operator_capability: null,
  })
  if (groupError) throw groupError
  await new Promise((resolve) => setTimeout(resolve, 250))
  check(roster.find((player) => player.id === initialPlayers[1].id)?.watch_group !== 'Remote Room',
    'the proof deliberately suppresses one committed player update')
  await hydrate()
  check(roster.find((player) => player.id === initialPlayers[1].id)?.watch_group === 'Remote Room',
    'canonical hydration repairs the missed player update')

  await channel.unsubscribe()
  console.log(`PASS ${checks} roster synchronization checks`)
} finally {
  if (roomId) {
    await service.from('rooms').update({ host_id: null, phase: 'lobby' }).eq('id', roomId)
    await service.from('players').delete().eq('room_id', roomId)
    await service.from('rooms').delete().eq('id', roomId)
    const { count } = await service.from('rooms')
      .select('id', { count: 'exact', head: true })
      .eq('id', roomId)
    check(count === 0, 'removed the roster proof room and all room-owned rows')
  }
}
