/**
 * Focused local proof for the atomic draft command.
 *
 * This uses the published seed catalog read-only, creates one disposable room,
 * exercises real anonymous PostgREST writes, and removes every room-owned row.
 * It never writes catalog tables and refuses a remote target.
 *
 *   npx tsx scripts/dogfood-draft-command.mts
 */

import { createClient } from '@supabase/supabase-js'
import { supabaseConfig } from './lib/env.mts'

const { target, url, anonKey, serviceKey } = supabaseConfig('local')
if (target !== 'local') throw new Error('draft command dogfood is local-only')
if (!serviceKey) throw new Error('local Supabase did not report a service role key')

const anon = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const service = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

let roomId: string | null = null
let checks = 0

function check(condition: unknown, message: string): asserts condition {
  checks++
  if (!condition) throw new Error(message)
  console.log(`PASS ${message}`)
}

try {
  const code = `ADT${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`
  const { data: room, error: roomError } = await service
    .from('rooms')
    .insert({ code, phase: 'lobby', host_id: null })
    .select()
    .single()
  if (roomError) throw roomError
  roomId = room.id

  const { data: players, error: playerError } = await service
    .from('players')
    .insert([
      {
        room_id: room.id,
        name: 'Atomic One',
        avatar_id: 'targaryen',
        color: '#D4AF37',
        is_host: true,
      },
      {
        room_id: room.id,
        name: 'Atomic Two',
        avatar_id: 'targaryen',
        color: '#D4AF37',
        is_host: false,
      },
    ])
    .select()
  if (playerError) throw playerError
  check(players.length === 2, 'created a two-player disposable room')

  const { error: startError } = await service
    .from('rooms')
    .update({
      host_id: players[0].id,
      // This script proves the legacy scarcity draft. The seeded finale pack
      // correctly defaults to conviction, so opt this disposable fixture into
      // the older model while it is still in the lobby.
      game_model: 'legacy_ensemble',
      phase: 'draft',
      draft_order: players.map((player) => player.id),
      current_pick: 0,
    })
    .eq('id', room.id)
  if (startError) throw startError

  const { data: entities, error: entityError } = await anon
    .from('draft_entities')
    .select('id,type')
    .eq('show_pack_id', room.show_pack_id)
    .order('id')
  if (entityError) throw entityError
  const films = entities.filter((entity) => entity.type === 'film')
  const people = entities.filter((entity) => entity.type === 'person')
  check(films.length >= 3 && people.length >= 3, 'loaded the published draft pools read-only')

  const race = await Promise.all([
    anon.from('draft_picks').insert({
      room_id: room.id,
      player_id: players[0].id,
      entity_id: films[0].id,
      round: 1,
      pick_number: 0,
    }).select().single(),
    anon.from('draft_picks').insert({
      room_id: room.id,
      player_id: players[0].id,
      entity_id: films[1].id,
      round: 1,
      pick_number: 0,
    }).select().single(),
  ])
  check(
    race.filter((result) => result.error == null).length === 1,
    'exactly one concurrent claim commits',
  )

  let { data: picks } = await service
    .from('draft_picks')
    .select('*')
    .eq('room_id', room.id)
  let { data: currentRoom } = await service
    .from('rooms')
    .select('current_pick')
    .eq('id', room.id)
    .single()
  check(
    picks?.length === 1 && currentRoom?.current_pick === 1,
    'the concurrent loser leaves no orphan and no second advance',
  )

  const { data: legacyAdvance, error: legacyAdvanceError } = await anon
    .from('rooms')
    .update({ current_pick: 1 })
    .eq('id', room.id)
    .eq('current_pick', 0)
    .select('id')
  if (legacyAdvanceError) throw legacyAdvanceError
  check(legacyAdvance.length === 0, 'an older client follow-up advance is a harmless no-op')

  const winner = race.find((result) => result.error == null)?.data
  const unusedFilm = films.find((entity) => entity.id !== winner?.entity_id)
  check(unusedFilm, 'retained an unclaimed film for turn two')

  const wrongPlayer = await anon.from('draft_picks').insert({
    room_id: room.id,
    player_id: players[0].id,
    entity_id: unusedFilm.id,
    round: 1,
    pick_number: 1,
  })
  check(
    wrongPlayer.error?.message.includes('draft pick belongs to another turn'),
    'a non-current player is rejected by the turn contract',
  )

  const wrongPool = await anon.from('draft_picks').insert({
    room_id: room.id,
    player_id: players[1].id,
    entity_id: people[0].id,
    round: 1,
    pick_number: 1,
  })
  check(
    wrongPool.error?.message.includes('draft entity is not eligible for this turn'),
    'a person cannot be claimed during the film sub-draft',
  )

  currentRoom = (await service
    .from('rooms')
    .select('current_pick')
    .eq('id', room.id)
    .single()).data
  check(currentRoom?.current_pick === 1, 'rejected claims do not advance the room')

  const secondClaim = await anon.from('draft_picks').insert({
    room_id: room.id,
    player_id: players[1].id,
    entity_id: unusedFilm.id,
    round: 99,
    pick_number: 1,
  }).select().single()
  if (secondClaim.error) throw secondClaim.error
  check(secondClaim.data.round === 1, 'the database normalizes an older client round value')

  const personClaim = await anon.from('draft_picks').insert({
    room_id: room.id,
    player_id: players[0].id,
    entity_id: people[0].id,
    round: 99,
    pick_number: 2,
  }).select().single()
  if (personClaim.error) throw personClaim.error
  check(personClaim.data.round === 1, 'the people sub-draft restarts at round one')

  const duplicate = await anon.from('draft_picks').insert({
    room_id: room.id,
    player_id: players[1].id,
    entity_id: people[0].id,
    round: 1,
    pick_number: 3,
  })
  check(
    duplicate.error?.message.includes('draft pick is already claimed'),
    'an entity cannot be claimed twice',
  )

  currentRoom = (await service
    .from('rooms')
    .select('current_pick')
    .eq('id', room.id)
    .single()).data
  picks = (await service
    .from('draft_picks')
    .select('*')
    .eq('room_id', room.id)).data
  check(
    currentRoom?.current_pick === 3 && picks?.length === 3,
    'three valid claims produce exactly three picks and advances',
  )

  const repair = await service.from('draft_picks').insert({
    room_id: room.id,
    player_id: players[0].id,
    entity_id: people[1].id,
    round: 77,
    pick_number: 77,
  })
  if (repair.error) throw repair.error
  currentRoom = (await service
    .from('rooms')
    .select('current_pick')
    .eq('id', room.id)
    .single()).data
  check(
    currentRoom?.current_pick === 3,
    'service-role recovery preserves history without replaying turns',
  )

  console.log(`PASS ${checks} atomic draft checks`)
} finally {
  if (roomId) {
    await service.from('rooms').update({ host_id: null, phase: 'lobby' }).eq('id', roomId)
    await service.from('draft_picks').delete().eq('room_id', roomId)
    await service.from('players').delete().eq('room_id', roomId)
    await service.from('rooms').delete().eq('id', roomId)
    const { count } = await service
      .from('rooms')
      .select('id', { count: 'exact', head: true })
      .eq('id', roomId)
    check(count === 0, 'removed the disposable room and all room-owned rows')
  }
}
