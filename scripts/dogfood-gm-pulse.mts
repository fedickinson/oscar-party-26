/**
 * Focused local proof for the laptop operator lens.
 *
 * The scratch room crosses the former 200-message cutoff, while a second room
 * contributes more than 100 newer bingo marks. gm-pulse must still recover the
 * target room's old activity and its one mark without reading another room into
 * the report. The harness writes no catalog row and removes all scratch data.
 *
 *   npx tsx scripts/dogfood-gm-pulse.mts
 */
import { spawnSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { supabaseConfig } from './lib/env.mts'

const { target, url, serviceKey } = supabaseConfig('local')
if (target !== 'local') throw new Error('gm-pulse dogfood is local-only')
if (!serviceKey) throw new Error('local Supabase did not report a service role key')

const service = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

let targetRoomId: string | null = null
let foreignRoomId: string | null = null
let targetCardIds: string[] = []
let foreignCardIds: string[] = []
let checks = 0

function check(condition: unknown, message: string): asserts condition {
  checks++
  if (!condition) throw new Error(message)
  console.log(`PASS ${message}`)
}

function timestamp(offsetSeconds: number): string {
  return new Date(Date.parse('2026-08-11T12:00:00.000Z') + offsetSeconds * 1000).toISOString()
}

function runPulse(code: string, operatorCapability?: string) {
  const result = spawnSync(
    'node',
    ['--import', 'tsx', 'scripts/gm-pulse.mts', '--room', code],
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

const suffix = Math.floor(Math.random() * 10_000).toString().padStart(4, '0')
const targetCode = `PUL${suffix}`
const foreignCode = `PFX${suffix}`

async function roomCount(roomId: string, table: 'messages' | 'players' | 'bingo_cards') {
  const { count, error } = await service.from(table)
    .select('id', { count: 'exact', head: true })
    .eq('room_id', roomId)
  if (error) throw error
  return count ?? 0
}

try {
  const { data: targetRoom, error: targetRoomError } = await service.from('rooms').insert({
    code: targetCode,
    phase: 'lobby',
    host_id: null,
  }).select('id').single()
  if (targetRoomError) throw targetRoomError
  targetRoomId = targetRoom.id

  const { data: foreignRoom, error: foreignRoomError } = await service.from('rooms').insert({
    code: foreignCode,
    phase: 'lobby',
    host_id: null,
  }).select('id').single()
  if (foreignRoomError) throw foreignRoomError
  foreignRoomId = foreignRoom.id

  const hostless = runPulse(targetCode)
  check(hostless.status === 0, 'gm-pulse renders an empty hostless room without a card query')
  check(hostless.output.includes('room has no host identity'),
    'a missing host keeps both private review queues visibly unavailable')

  const { data: targetPlayers, error: targetPlayersError } = await service.from('players').insert([
    {
      room_id: targetRoom.id,
      name: 'Pulse Host',
      avatar_id: 'host',
      color: '#000000',
      is_host: true,
    },
    {
      room_id: targetRoom.id,
      name: 'Alex',
      avatar_id: 'alex-one',
      color: '#000000',
      is_host: false,
    },
    {
      room_id: targetRoom.id,
      name: 'Alex',
      avatar_id: 'alex-two',
      color: '#000000',
      is_host: false,
    },
  ]).select('id,name,is_host')
  if (targetPlayersError) throw targetPlayersError
  const host = targetPlayers.find((player) => player.is_host)
  const noisePlayer = targetPlayers.find((player) => player.name === 'Alex')
  if (!host || !noisePlayer) throw new Error('target scratch players were not created')
  const { error: hostError } = await service.from('rooms')
    .update({ host_id: host.id })
    .eq('id', targetRoom.id)
  if (hostError) throw hostError
  const { data: issuedCapability, error: capabilityError } = await service.rpc(
    'issue_room_operator_capability',
    { p_room_id: targetRoom.id },
  )
  if (capabilityError) throw capabilityError
  const operatorCapability = String(issuedCapability.capability)

  const foreignPlayersInput = Array.from({ length: 101 }, (_, index) => ({
    room_id: foreignRoom.id,
    name: `Foreign ${index.toString().padStart(3, '0')}`,
    avatar_id: 'foreign',
    color: '#000000',
    is_host: index === 0,
  }))
  const { data: foreignPlayers, error: foreignPlayersError } = await service.from('players')
    .insert(foreignPlayersInput)
    .select('id,is_host')
  if (foreignPlayersError) throw foreignPlayersError
  const foreignHost = foreignPlayers.find((player) => player.is_host)
  if (!foreignHost) throw new Error('foreign scratch host was not created')
  const { error: foreignHostError } = await service.from('rooms')
    .update({ host_id: foreignHost.id })
    .eq('id', foreignRoom.id)
  if (foreignHostError) throw foreignHostError

  const targetMessages = [
    {
      room_id: targetRoom.id,
      player_id: 'ned',
      text: 'The old cast line still matters.',
      created_at: timestamp(1),
    },
    {
      room_id: targetRoom.id,
      player_id: host.id,
      text: 'The old host chat still matters.',
      created_at: timestamp(2),
    },
    {
      room_id: targetRoom.id,
      player_id: 'winner-divider',
      text: 'The old operator fact — Vhagar · worth 5 · called by Pulse Host',
      created_at: timestamp(3),
    },
    ...Array.from({ length: 1005 }, (_, index) => ({
      room_id: targetRoom.id,
      player_id: noisePlayer.id,
      text: `Later chat ${index}`,
      created_at: timestamp(60 + index),
    })),
    {
      room_id: targetRoom.id,
      player_id: 'winner-divider',
      text: 'Duplicate-name declaration · worth 3 · called by Alex',
      created_at: timestamp(1200),
    },
  ]
  const { error: messagesError } = await service.from('messages').insert(targetMessages)
  if (messagesError) throw messagesError

  const { data: targetCards, error: targetCardsError } = await service.from('bingo_cards').insert({
    room_id: targetRoom.id,
    player_id: host.id,
    squares: [0],
  }).select('id')
  if (targetCardsError) throw targetCardsError
  targetCardIds = targetCards.map((card) => card.id)

  const { data: foreignCards, error: foreignCardsError } = await service.from('bingo_cards')
    .insert(foreignPlayers.map((player) => ({
      room_id: foreignRoom.id,
      player_id: player.id,
      squares: [0],
    })))
    .select('id')
  if (foreignCardsError) throw foreignCardsError
  foreignCardIds = foreignCards.map((card) => card.id)

  const { error: targetMarkError } = await service.from('bingo_marks').insert({
    card_id: targetCardIds[0],
    square_index: 0,
    status: 'approved',
    marked_at: timestamp(4),
  })
  if (targetMarkError) throw targetMarkError
  const { error: foreignMarksError } = await service.from('bingo_marks').insert(
    foreignCardIds.map((cardId, index) => ({
      card_id: cardId,
      square_index: 0,
      status: 'approved',
      marked_at: timestamp(2000 + index),
    })),
  )
  if (foreignMarksError) throw foreignMarksError

  const before = {
    messages: await roomCount(targetRoom.id, 'messages'),
    players: await roomCount(targetRoom.id, 'players'),
    cards: await roomCount(targetRoom.id, 'bingo_cards'),
  }
  const result = runPulse(targetCode, operatorCapability)
  const output = result.output
  check(result.status === 0, 'gm-pulse completed against the local scratch room')
  check(output.includes('[gm-pulse] mode=read-only'), 'gm-pulse announces its read-only mode')
  check(output.includes('The old operator fact'), 'a fact older than 1,000 later messages remains visible')
  check(output.includes('CAST SEQUENCE: last spoke') && !output.includes('CAST SEQUENCE: last spoke NEVER'),
    'a cast line older than 1,000 later messages remains visible')
  check(/Pulse Host\s+—\s+chat:.*declares:1\s+marks:1/.test(output),
    'complete target-room activity retains the old host chat, declaration and mark')
  check((output.match(/Alex\s+—\s+chat:.*declares:ambiguous/g) ?? []).length === 2,
    'duplicate display names refuse text-only declaration attribution')
  check(output.includes('grounding (room capability): CLEAR')
      && output.includes('witness (room capability):  CLEAR'),
    'the laptop lens reports both private review queues')
  check(!output.includes('Foreign 000'), 'the target report excludes the foreign room roster')

  const after = {
    messages: await roomCount(targetRoom.id, 'messages'),
    players: await roomCount(targetRoom.id, 'players'),
    cards: await roomCount(targetRoom.id, 'bingo_cards'),
  }
  check(JSON.stringify(after) === JSON.stringify(before), 'gm-pulse changed no room-owned row count')
  console.log(`PASS ${checks} gm-pulse checks`)
} finally {
  const allCardIds = [...targetCardIds, ...foreignCardIds]
  if (allCardIds.length > 0) {
    await service.from('bingo_marks').delete().in('card_id', allCardIds)
  }
  for (const roomId of [targetRoomId, foreignRoomId]) {
    if (!roomId) continue
    await service.from('rooms').update({ host_id: null }).eq('id', roomId)
    await service.from('bingo_cards').delete().eq('room_id', roomId)
    await service.from('messages').delete().eq('room_id', roomId)
    await service.from('players').delete().eq('room_id', roomId)
    await service.from('rooms').delete().eq('id', roomId)
  }
  const remainingRoomIds = [targetRoomId, foreignRoomId].filter((id): id is string => id !== null)
  if (remainingRoomIds.length > 0) {
    const { count, error } = await service.from('rooms')
      .select('id', { count: 'exact', head: true })
      .in('id', remainingRoomIds)
    if (error) throw error
    check(count === 0, 'removed both gm-pulse scratch rooms')
  }
}
