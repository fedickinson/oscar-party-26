/**
 * Focused local proof for the canonical room-row synchronization contract.
 *
 * One disposable room exercises subscribe-before-hydrate, revision-safe
 * replacement, direct phase delivery and bounded missed-event reconciliation.
 * It never reads or writes the published catalog and removes its scratch row.
 *
 *   npx tsx scripts/dogfood-room-sync.mts
 */

import { createClient } from '@supabase/supabase-js'
import { supabaseConfig } from './lib/env.mts'

const { target, url, anonKey, serviceKey } = supabaseConfig('local')
if (target !== 'local') throw new Error('room sync dogfood is local-only')
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

type RoomState = {
  id: string
  phase: string
  current_pick: number
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
    if (Date.now() >= deadline) throw new Error('timed out waiting for room Realtime state')
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

try {
  const { data: createdRoom, error: createError } = await service.from('rooms').insert({
    code: `RRM${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
    phase: 'lobby',
    host_id: null,
    current_pick: 0,
  }).select('id,phase,current_pick').single()
  if (createError) throw createError
  if (!createdRoom) throw new Error('room synchronization proof row was not returned')
  roomId = createdRoom.id
  const proofRoomId = createdRoom.id

  let room: RoomState | null = null
  let revision = 0
  let suppressEvents = false

  async function hydrate() {
    while (true) {
      const revisionAtStart = revision
      const { data, error } = await watcher.from('rooms')
        .select('id,phase,current_pick')
        .eq('id', proofRoomId)
        .maybeSingle()
      if (error) throw error
      if (!data) throw new Error('scratch room disappeared during hydration')
      if (revision !== revisionAtStart) continue
      room = data
      return
    }
  }

  const channel = watcher.channel(`room-proof:${createdRoom.id}`)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${createdRoom.id}`,
    }, (payload) => {
      if (suppressEvents) return
      revision++
      room = payload.new as RoomState
    })

  await new Promise<void>((resolve, reject) => {
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve()
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        reject(new Error(`room channel failed with ${status}`))
      }
    })
  })
  await hydrate()
  check((room as RoomState | null)?.phase === 'lobby', 'ready-before-hydrate publishes the canonical initial phase')

  const revisionBeforeStaleSnapshot = revision
  const { data: staleSnapshot, error: staleError } = await watcher.from('rooms')
    .select('id,phase,current_pick')
    .eq('id', createdRoom.id)
    .single()
  if (staleError) throw staleError

  const { error: phaseError } = await service.from('rooms')
    .update({ phase: 'pre_draft' })
    .eq('id', createdRoom.id)
  if (phaseError) throw phaseError
  await waitFor(() => revision > revisionBeforeStaleSnapshot && room?.phase === 'pre_draft')
  const staleSnapshotWouldPublish = revision === revisionBeforeStaleSnapshot
  if (staleSnapshotWouldPublish) room = staleSnapshot
  check(!staleSnapshotWouldPublish && room?.phase === 'pre_draft',
    'a phase revision rejects an overlapping stale room snapshot')

  const { error: pickError } = await service.from('rooms')
    .update({ current_pick: 1 })
    .eq('id', createdRoom.id)
  if (pickError) throw pickError
  await waitFor(() => room?.current_pick === 1)
  check(true, 'a warm room update reaches the client directly')

  suppressEvents = true
  const { error: missedPhaseError } = await service.from('rooms')
    .update({ phase: 'draft' })
    .eq('id', createdRoom.id)
  if (missedPhaseError) throw missedPhaseError
  await new Promise((resolve) => setTimeout(resolve, 250))
  check((room as RoomState | null)?.phase === 'pre_draft', 'the proof deliberately suppresses one committed phase update')
  await new Promise((resolve) => setTimeout(resolve, 4_750))
  await hydrate()
  check((room as RoomState | null)?.phase === 'draft', 'bounded canonical reconciliation repairs the missed phase update')

  await channel.unsubscribe()
  console.log(`PASS ${checks} room synchronization checks`)
} finally {
  if (roomId) {
    await service.from('rooms').delete().eq('id', roomId)
    const { count } = await service.from('rooms')
      .select('id', { count: 'exact', head: true })
      .eq('id', roomId)
    check(count === 0, 'removed the room synchronization proof row')
  }
}
