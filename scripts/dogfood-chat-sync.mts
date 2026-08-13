/**
 * Focused local proof for the room-chat synchronization contract.
 *
 * One disposable room exercises ready-before-hydrate, ordered INSERT delivery,
 * stale snapshot rejection and bounded missed-event reconciliation, then
 * removes every row it created.
 *
 *   npx tsx scripts/dogfood-chat-sync.mts
 */

import { createClient } from '@supabase/supabase-js'
import { supabaseConfig } from './lib/env.mts'
import {
  planInitialReactiveTranscript,
  planReactiveTranscriptReconciliation,
} from '../src/lib/reactive-transcript.ts'

const { target, url, anonKey, serviceKey } = supabaseConfig('local')
if (target !== 'local') throw new Error('chat sync dogfood is local-only')
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

type ChatMessage = {
  id: string
  room_id: string
  player_id: string
  text: string
  created_at: string
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
    if (Date.now() >= deadline) throw new Error('timed out waiting for chat Realtime state')
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

try {
  const { data: room, error: roomError } = await service.from('rooms').insert({
    code: `CHT${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
    phase: 'lobby',
    host_id: null,
  }).select('id').single()
  if (roomError) throw roomError
  if (!room) throw new Error('chat proof room was not returned')
  roomId = room.id
  const proofRoomId = room.id

  const { error: initialError } = await actor.from('messages').insert({
    room_id: room.id,
    player_id: 'system',
    text: 'Chat proof initial',
  })
  if (initialError) throw initialError

  let messages: ChatMessage[] = []
  let revision = 0
  let suppressEvents = false

  const compareMessages = (left: ChatMessage, right: ChatMessage) => (
    left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id)
  )
  const upsert = (message: ChatMessage) => {
    const index = messages.findIndex((candidate) => candidate.id === message.id)
    messages = (index === -1
      ? [...messages, message]
      : messages.map((candidate, candidateIndex) => (
        candidateIndex === index ? message : candidate
      ))).sort(compareMessages)
  }

  async function hydrate() {
    while (true) {
      const revisionAtStart = revision
      const { data, error } = await watcher.from('messages')
        .select('id,room_id,player_id,text,created_at')
        .eq('room_id', proofRoomId)
        .order('created_at')
        .order('id')
      if (error) throw error
      if (revision !== revisionAtStart) continue
      messages = data.sort(compareMessages)
      return
    }
  }

  const channel = watcher.channel(`chat-proof:${room.id}`)
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${room.id}`,
    }, (payload) => {
      if (suppressEvents) return
      revision++
      upsert(payload.new as ChatMessage)
    })

  await new Promise<void>((resolve, reject) => {
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve()
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        reject(new Error(`chat channel failed with ${status}`))
      }
    })
  })
  await hydrate()
  check(messages.map((message) => message.text).join(',') === 'Chat proof initial',
    'ready-before-hydrate publishes the complete initial transcript')

  const revisionBeforeStaleSnapshot = revision
  const { data: staleSnapshot, error: staleError } = await watcher.from('messages')
    .select('id,room_id,player_id,text,created_at')
    .eq('room_id', room.id)
    .order('created_at')
    .order('id')
  if (staleError) throw staleError

  const { data: overlapping, error: overlappingError } = await actor.from('messages').insert({
    room_id: room.id,
    player_id: 'system',
    text: 'Chat proof overlapping',
  }).select('id').single()
  if (overlappingError) throw overlappingError
  await waitFor(() => revision > revisionBeforeStaleSnapshot &&
    messages.some((message) => message.id === overlapping.id))
  const staleSnapshotWouldPublish = revision === revisionBeforeStaleSnapshot
  if (staleSnapshotWouldPublish) messages = staleSnapshot
  check(!staleSnapshotWouldPublish && messages.some((message) => message.id === overlapping.id),
    'an INSERT revision rejects an overlapping stale transcript snapshot')
  const overlappingRow = messages.find((message) => message.id === overlapping.id)
  if (!overlappingRow) throw new Error('overlapping message did not reach the proof transcript')
  const reactiveInitialPlan = planInitialReactiveTranscript(messages, [overlappingRow])
  check(reactiveInitialPlan.toProcess.map((message) => message.id).join(',') === overlapping.id,
    'a live callback remains trigger work when hydration contains the same row')

  const { data: warm, error: warmError } = await actor.from('messages').insert({
    room_id: room.id,
    player_id: 'system',
    text: 'Chat proof warm',
  }).select('id').single()
  if (warmError) throw warmError
  await waitFor(() => messages.some((message) => message.id === warm.id))
  check(messages.at(-1)?.id === warm.id, 'a warm message arrives directly in canonical order')

  suppressEvents = true
  const { data: missed, error: missedError } = await actor.from('messages').insert({
    room_id: room.id,
    player_id: 'system',
    text: 'Chat proof missed',
  }).select('id').single()
  if (missedError) throw missedError
  await new Promise((resolve) => setTimeout(resolve, 250))
  check(!messages.some((message) => message.id === missed.id),
    'the proof deliberately suppresses one committed chat event')
  const seenBeforeRepair = new Set(messages.map((message) => message.id))
  await new Promise((resolve) => setTimeout(resolve, 4_750))
  await hydrate()
  check(messages.some((message) => message.id === missed.id),
    'bounded canonical reconciliation repairs the missed chat event')
  const reactiveRepairPlan = planReactiveTranscriptReconciliation(messages, seenBeforeRepair)
  check(reactiveRepairPlan.toProcess.map((message) => message.id).join(',') === missed.id,
    'reactive reconciliation identifies the cold-missed row exactly once')

  await channel.unsubscribe()
  console.log(`PASS ${checks} chat synchronization checks`)
} finally {
  if (roomId) {
    await service.from('messages').delete().eq('room_id', roomId)
    await service.from('rooms').delete().eq('id', roomId)
    const [{ count: messageCount }, { count: roomCount }] = await Promise.all([
      service.from('messages').select('id', { count: 'exact', head: true }).eq('room_id', roomId),
      service.from('rooms').select('id', { count: 'exact', head: true }).eq('id', roomId),
    ])
    check(messageCount === 0 && roomCount === 0,
      'removed the chat proof transcript and room')
  }
}
