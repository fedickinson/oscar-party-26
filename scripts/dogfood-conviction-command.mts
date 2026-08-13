/**
 * Focused local proof for conviction portfolios.
 *
 * This reads the published catalog, creates one disposable room, exercises
 * anonymous PostgREST writes, and removes every room-owned row. It never writes
 * categories or any other catalog table and refuses a remote target.
 *
 *   npx tsx scripts/dogfood-conviction-command.mts
 */

import { createClient } from '@supabase/supabase-js'
import { supabaseConfig } from './lib/env.mts'

const { target, url, anonKey, serviceKey } = supabaseConfig('local')
if (target !== 'local') throw new Error('conviction command dogfood is local-only')
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

let roomId: string | null = null
let checks = 0

function check(condition: unknown, message: string): asserts condition {
  checks += 1
  if (!condition) throw new Error(message)
  console.log(`PASS ${message}`)
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 5_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  return false
}

try {
  const code = `CVX${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`
  const { data: room, error: roomError } = await service
    .from('rooms')
    .insert({
      code,
      phase: 'lobby',
      host_id: null,
    })
    .select()
    .single()
  if (roomError) throw roomError
  roomId = room.id
  check(
    room.game_model === 'conviction_portfolio',
    'the room-declared show pack selects the conviction model automatically',
  )

  const { data: players, error: playerError } = await service
    .from('players')
    .insert([
      {
        room_id: room.id,
        name: 'Conviction One',
        avatar_id: 'targaryen',
        color: '#D4AF37',
        is_host: true,
      },
      {
        room_id: room.id,
        name: 'Conviction Two',
        avatar_id: 'hightower',
        color: '#4B7F52',
        is_host: false,
      },
    ])
    .select()
  if (playerError) throw playerError
  check(players.length === 2, 'created a two-player conviction room')

  const { error: startError } = await service
    .from('rooms')
    .update({
      host_id: players[0].id,
      phase: 'draft',
      draft_order: players.map((player) => player.id),
      current_pick: 0,
    })
    .eq('id', room.id)
    .select('id,phase,game_model')
    .single()
  if (startError) throw startError

  const modelRewrite = await service
    .from('rooms')
    .update({ game_model: 'legacy_ensemble' })
    .eq('id', room.id)
    .select('id')
  if (!modelRewrite.error) {
    throw new Error(`room game model rewrite was not rejected: ${JSON.stringify(modelRewrite.data)}`)
  }
  check(
    modelRewrite.error.code === '23514',
    `the scoring model freezes when play begins (${modelRewrite.error.code}: ${modelRewrite.error.message})`,
  )

  const { data: entities, error: entityError } = await anon
    .from('draft_entities')
    .select('id,type')
    .eq('show_pack_id', room.show_pack_id)
    .order('id')
  if (entityError) throw entityError
  const dragons = entities.filter((entity) => entity.type === 'film')
  const people = entities.filter((entity) => entity.type === 'person')
  check(dragons.length >= 2 && people.length >= 1, 'loaded identity dragons and people read-only')

  for (const [pickNumber, player] of players.entries()) {
    const result = await anon.from('draft_picks').insert({
      room_id: room.id,
      player_id: player.id,
      entity_id: dragons[pickNumber].id,
      round: 1,
      pick_number: pickNumber,
    }).select().single()
    if (result.error) throw result.error
  }
  const extraDraft = await anon.from('draft_picks').insert({
    room_id: room.id,
    player_id: players[0].id,
    entity_id: people[0].id,
    round: 1,
    pick_number: 2,
  })
  check(
    extraDraft.error?.message.includes('draft is complete'),
    'conviction draft ends after one dragon identity per player',
  )

  const { error: phaseError } = await service
    .from('rooms')
    .update({ phase: 'confidence' })
    .eq('id', room.id)
    .select('id,phase')
    .single()
  if (phaseError) throw phaseError

  const { data: beats, error: beatError } = await anon
    .from('signature_beats')
    .select('id')
    .eq('show_pack_id', room.show_pack_id)
    .order('id')
    .limit(14)
  if (beatError) throw beatError
  check(beats.length >= 13, 'loaded enough authored beats for a full portfolio')

  const observedConvictions = new Set<string>()
  const convictionChannel = observer
    .channel(`conviction-proof:${room.id}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'conviction_picks',
      filter: `room_id=eq.${room.id}`,
    }, (payload) => {
      const pick = payload.new as { player_id?: string; beat_id?: string }
      if (pick.player_id && pick.beat_id) {
        observedConvictions.add(`${pick.player_id}:${pick.beat_id}`)
      }
    })

  await Promise.race([
    new Promise<void>((resolve, reject) => {
      convictionChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve()
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          reject(new Error(`conviction channel failed with ${status}`))
        }
      })
    }),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('conviction channel did not subscribe')), 5_000)
    }),
  ])

  const shared = await anon.from('conviction_picks').insert([
    { room_id: room.id, player_id: players[0].id, beat_id: beats[0].id },
    { room_id: room.id, player_id: players[1].id, beat_id: beats[0].id },
  ])
  if (shared.error) throw shared.error
  check(true, 'two players may share the same belief')
  const observedSharedKey = `${players[1].id}:${beats[0].id}`
  const receivedColdInsert = await waitFor(() => observedConvictions.has(observedSharedKey))
  const { data: reconciledShared, error: reconcileError } = await observer
    .from('conviction_picks')
    .select('beat_id')
    .eq('room_id', room.id)
    .eq('player_id', players[1].id)
    .eq('beat_id', beats[0].id)
    .maybeSingle()
  if (reconcileError) throw reconcileError
  check(
    reconciledShared != null,
    'post-subscription reconciliation reads the canonical conviction ledger',
  )
  console.log(
    `INFO initial conviction broadcast ${receivedColdInsert ? 'arrived' : 'was missed'} during the cold-worker window`,
  )

  const realtimeProbe = await anon.from('conviction_picks').insert({
    room_id: room.id,
    player_id: players[1].id,
    beat_id: beats[1].id,
  })
  if (realtimeProbe.error) throw realtimeProbe.error
  const observedProbeKey = `${players[1].id}:${beats[1].id}`
  check(
    await waitFor(() => observedConvictions.has(observedProbeKey)),
    'a warmed second client receives conviction inserts through Realtime',
  )

  const rest = await anon.from('conviction_picks').insert(
    beats.slice(1, 12).map((beat) => ({
      room_id: room.id,
      player_id: players[0].id,
      beat_id: beat.id,
    })),
  )
  if (rest.error) throw rest.error
  const thirteenth = await anon.from('conviction_picks').insert({
    room_id: room.id,
    player_id: players[0].id,
    beat_id: beats[12].id,
  })
  check(
    thirteenth.error?.message.includes('already uses all 12 slots'),
    'the database rejects a thirteenth conviction slot',
  )

  const secondPortfolio = await anon.from('conviction_picks').insert(
    beats.slice(2, 11).map((beat) => ({
      room_id: room.id,
      player_id: players[1].id,
      beat_id: beat.id,
    })),
  )
  if (secondPortfolio.error) throw secondPortfolio.error
  const finalSlotRace = await Promise.all([
    anon.from('conviction_picks').insert({
      room_id: room.id,
      player_id: players[1].id,
      beat_id: beats[11].id,
    }),
    anon.from('conviction_picks').insert({
      room_id: room.id,
      player_id: players[1].id,
      beat_id: beats[12].id,
    }),
  ])
  check(
    finalSlotRace.filter((result) => result.error == null).length === 1
      && finalSlotRace.filter((result) =>
        result.error?.message.includes('already uses all 12 slots')).length === 1,
    'concurrent final-slot claims commit exactly one conviction',
  )

  const wrongPlayer = await anon.from('conviction_picks').insert({
    room_id: room.id,
    player_id: '00000000-0000-4000-8000-000000000001',
    beat_id: beats[1].id,
  })
  check(
    wrongPlayer.error?.message.includes('belongs to another room'),
    'a conviction cannot be assigned to a player outside the room',
  )

  const { data: visiblePicks, error: visibleError } = await anon
    .from('conviction_picks')
    .select('player_id,beat_id')
    .eq('room_id', room.id)
  if (visibleError) throw visibleError
  check(
    visiblePicks.length === 24,
    'the room can see the shared conviction ledger before the show',
  )

  const { data: snapshots, error: snapshotError } = await service
    .rpc('settlement_input_snapshot', { p_room_id: room.id })
  if (snapshotError) throw snapshotError
  check(
    Array.isArray(snapshots.conviction_picks) && snapshots.conviction_picks.length === 24,
    'settlement preflight seals every conviction row',
  )

  const { error: liveError } = await service
    .from('rooms')
    .update({ phase: 'live' })
    .eq('id', room.id)
    .select('id,phase')
    .single()
  if (liveError) throw liveError
  const lateInsert = await anon.from('conviction_picks').insert({
    room_id: room.id,
    player_id: players[1].id,
    beat_id: beats[1].id,
  })
  const lateDelete = await anon.from('conviction_picks').delete()
    .eq('room_id', room.id)
    .eq('player_id', players[1].id)
    .eq('beat_id', beats[0].id)
  check(
    lateInsert.error?.message.includes('require the conviction phase')
      && lateDelete.error?.message.includes('require the conviction phase'),
    'convictions freeze when the show goes live',
  )

  console.log(`PASS ${checks} conviction portfolio checks`)
} finally {
  await observer.removeAllChannels()
  if (roomId) {
    await service.from('rooms').update({ host_id: null }).eq('id', roomId)
    await service.from('rooms').delete().eq('id', roomId)
    const { count } = await service
      .from('rooms')
      .select('id', { count: 'exact', head: true })
      .eq('id', roomId)
    check(count === 0, 'removed the disposable room and all room-owned rows')
  }
}
