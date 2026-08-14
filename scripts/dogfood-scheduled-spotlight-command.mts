/**
 * Focused local proof for scheduled spotlight open/close commands.
 *
 * This reads the published catalog, creates disposable rooms, exercises the
 * capability-gated anonymous RPCs and blocked direct writes, then removes every room-owned
 * row. It never writes catalog tables and refuses a remote target.
 *
 *   npx tsx scripts/dogfood-scheduled-spotlight-command.mts
 */

import { createClient } from '@supabase/supabase-js'
import { supabaseConfig } from './lib/env.mts'
import { bindResultsNightDogfoodPack } from './lib/results-night-dogfood-pack.mts'

const { target, url, anonKey, serviceKey } = supabaseConfig('local')
if (target !== 'local') throw new Error('scheduled spotlight dogfood is local-only')
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
  game_model: string
  active_spotlight_category_id: number | null
  spotlight_revision: number
  spotlight_opened_at: string | null
}

type Player = { id: string }
type Category = { id: number }
type Candidate = { nominee_id: string }

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

function openSpotlight(
  roomId: string,
  categoryId: number,
  expectedRevision: number | null,
  actorPlayerId: string,
) {
  return anon.rpc('open_scheduled_spotlight_authorized', {
    p_room_id: roomId,
    p_category_id: categoryId,
    p_expected_revision: expectedRevision,
    p_actor_player_id: actorPlayerId,
    p_operator_capability: capabilityByRoomId.get(roomId) ?? null,
  })
}

function closeSpotlight(
  roomId: string,
  expectedCategoryId: number | null,
  expectedRevision: number | null,
  actorPlayerId: string,
) {
  return anon.rpc('close_scheduled_spotlight_authorized', {
    p_room_id: roomId,
    p_expected_category_id: expectedCategoryId,
    p_expected_revision: expectedRevision,
    p_actor_player_id: actorPlayerId,
    p_operator_capability: capabilityByRoomId.get(roomId) ?? null,
  })
}

async function createRoom(label: string, resultsNight = false): Promise<{ room: Room; players: Player[] }> {
  const code = `${label}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`
  const { data: room, error: roomError } = await service
    .from('rooms')
    .insert({ code, phase: 'lobby', host_id: null })
    .select('id,show_pack_id,game_model,active_spotlight_category_id,spotlight_revision,spotlight_opened_at')
    .single()
  if (roomError) throw roomError
  roomIds.push(room.id)
  if (resultsNight) bindResultsNightDogfoodPack(code)

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
  const boundRoom = await readRoom(room.id)
  return { room: boundRoom, players }
}

async function readRoom(roomId: string): Promise<Room> {
  const { data, error } = await service
    .from('rooms')
    .select('id,show_pack_id,game_model,active_spotlight_category_id,spotlight_revision,spotlight_opened_at')
    .eq('id', roomId)
    .single()
  if (error) throw error
  return data as Room
}

try {
  const { room, players } = await createRoom('ASP', true)
  check(
    room.active_spotlight_category_id == null
      && room.spotlight_revision === 0
      && room.spotlight_opened_at == null,
    'a disposable room begins with no spotlight ceremony',
  )

  const legacy = await anon.rpc('open_scheduled_spotlight', {
    p_room_id: room.id,
    p_category_id: -1,
    p_expected_revision: 0,
    p_actor_player_id: players[0].id,
  })
  check(legacy.error != null, 'the host-id-only spotlight primitive is not browser executable')

  check(room.game_model === 'legacy_ensemble',
    'explicit Results Night commitment selects the scheduled runtime')

  const { data: categories, error: categoryError } = await service
    .from('categories')
    .select('id')
    .eq('show_pack_id', room.show_pack_id)
    .is('room_id', null)
    .order('display_order')
    .limit(3)
  if (categoryError) throw categoryError
  check(categories.length >= 3, 'loaded three authored scheduled categories read-only')
  const [first, second, resolved] = categories as Category[]

  const beforeLive = await openSpotlight(room.id, first.id, 0, players[0].id)
  check(
    beforeLive.error?.message.includes('only while the room is live'),
    'a spotlight cannot open before the live phase',
  )
  const closeBeforeLive = await closeSpotlight(room.id, first.id, 0, players[0].id)
  check(
    closeBeforeLive.error?.message.includes('only while the room is live'),
    'a spotlight cannot close before the live phase',
  )

  const { error: liveError } = await service
    .from('rooms')
    .update({ phase: 'live' })
    .eq('id', room.id)
  if (liveError) throw liveError

  const nonHost = await openSpotlight(room.id, first.id, 0, players[1].id)
  check(
    nonHost.error?.message.includes('current room host authority'),
    'a non-host cannot open a scheduled spotlight',
  )

  const wrongCategory = await openSpotlight(room.id, -1, 0, players[0].id)
  check(
    wrongCategory.error?.message.includes('does not belong'),
    'a category outside the scheduled slate is rejected',
  )

  const nullRevisionOpen = await openSpotlight(room.id, first.id, null, players[0].id)
  check(
    nullRevisionOpen.error?.message.includes('revision precondition is required'),
    'an opening cannot omit its revision precondition',
  )

  const observedRevisions = new Set<number>()
  const channel = observer
    .channel(`scheduled-spotlight-proof:${room.id}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'rooms',
      filter: `id=eq.${room.id}`,
    }, (payload) => {
      const updated = payload.new as { spotlight_revision?: number }
      if (updated.spotlight_revision != null) observedRevisions.add(updated.spotlight_revision)
    })

  await Promise.race([
    new Promise<void>((resolveSubscribe, rejectSubscribe) => {
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolveSubscribe()
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          rejectSubscribe(new Error(`scheduled spotlight channel failed with ${status}`))
        }
      })
    }),
    new Promise<never>((_, rejectSubscribe) => {
      setTimeout(() => rejectSubscribe(new Error('scheduled spotlight channel did not subscribe')), 5_000)
    }),
  ])

  const opened = await openSpotlight(room.id, first.id, 0, players[0].id)
  if (opened.error) throw opened.error
  let current = await readRoom(room.id)
  check(
    current.active_spotlight_category_id === first.id
      && current.spotlight_revision === 1
      && current.spotlight_opened_at != null,
    'opening writes the category and database-owned ceremony identity atomically',
  )
  check(
    await waitFor(() => observedRevisions.has(1)),
    'a second client receives the opening through room Realtime',
  )

  const nullRevisionClose = await closeSpotlight(room.id, first.id, null, players[0].id)
  check(
    nullRevisionClose.error?.message.includes('revision precondition is required'),
    'a close cannot omit its revision precondition',
  )
  const nullCategoryClose = await closeSpotlight(room.id, null, 1, players[0].id)
  check(
    nullCategoryClose.error?.message.includes('expected spotlight category is required'),
    'a close cannot omit its expected category',
  )
  const nonHostClose = await closeSpotlight(room.id, first.id, 1, players[1].id)
  check(
    nonHostClose.error?.message.includes('current room host authority'),
    'a non-host cannot close a scheduled spotlight',
  )

  const replay = await openSpotlight(room.id, first.id, 0, players[0].id)
  if (replay.error) throw replay.error
  current = await readRoom(room.id)
  check(current.spotlight_revision === 1, 'an identical pre-reconciliation replay is idempotent')

  const replacement = await openSpotlight(room.id, second.id, 1, players[0].id)
  check(
    replacement.error?.message.includes('close the active spotlight'),
    'a different category cannot replace an active spotlight',
  )

  const wrongClose = await closeSpotlight(room.id, second.id, 1, players[0].id)
  check(
    wrongClose.error?.message.includes('different spotlight'),
    'close compares the exact active category',
  )

  const staleClose = await closeSpotlight(room.id, first.id, 0, players[0].id)
  check(
    staleClose.error?.message.includes('changed before it could be closed'),
    'a stale close revision is rejected',
  )

  const closed = await closeSpotlight(room.id, first.id, 1, players[0].id)
  if (closed.error) throw closed.error
  current = await readRoom(room.id)
  check(
    current.active_spotlight_category_id == null && current.spotlight_revision === 1,
    'an exact close clears the category without inventing a new opening identity',
  )

  const closeReplay = await closeSpotlight(room.id, first.id, 1, players[0].id)
  if (closeReplay.error) throw closeReplay.error
  check((await readRoom(room.id)).spotlight_revision === 1, 'an identical close replay is idempotent')

  const race = await Promise.all([
    openSpotlight(room.id, first.id, 1, players[0].id),
    openSpotlight(room.id, second.id, 1, players[0].id),
  ])
  check(
    race.filter((result) => result.error == null).length === 1,
    'exactly one conflicting concurrent opening commits',
  )
  current = await readRoom(room.id)
  check(
    current.spotlight_revision === 2
      && (current.active_spotlight_category_id === first.id
        || current.active_spotlight_category_id === second.id),
    'the concurrent loser leaves one canonical second opening',
  )

  const staleSecondClose = await closeSpotlight(
    room.id,
    current.active_spotlight_category_id!,
    1,
    players[0].id,
  )
  check(
    staleSecondClose.error?.message.includes('changed before it could be closed'),
    'a prior ceremony revision cannot close the newer opening',
  )
  const exactSecondClose = await closeSpotlight(
    room.id,
    current.active_spotlight_category_id!,
    2,
    players[0].id,
  )
  if (exactSecondClose.error) throw exactSecondClose.error

  const { data: resolvedCandidates, error: resolvedCandidateError } = await service
    .from('category_nominees')
    .select('nominee_id')
    .eq('category_id', resolved.id)
    .limit(1)
  if (resolvedCandidateError) throw resolvedCandidateError
  check(resolvedCandidates.length === 1, 'loaded a resolved-category candidate read-only')
  const resolvedCandidate = resolvedCandidates[0] as Candidate
  const { error: resolvedWinnerError } = await service.from('room_winners').insert({
    room_id: room.id,
    category_id: resolved.id,
    winner_id: resolvedCandidate.nominee_id,
    tie_winner_id: null,
  })
  if (resolvedWinnerError) throw resolvedWinnerError
  const resolvedOpen = await openSpotlight(room.id, resolved.id, 2, players[0].id)
  check(
    resolvedOpen.error?.message.includes('resolved category'),
    'a resolved category cannot begin a new spotlight ceremony',
  )

  const { error: directOpenError } = await anon
    .from('rooms')
    .update({ active_spotlight_category_id: first.id })
    .eq('id', room.id)
  check(
    directOpenError?.message.includes('authorized referee command'),
    'a browser cannot bypass the spotlight command with a direct opening',
  )
  current = await readRoom(room.id)
  check(
    current.active_spotlight_category_id == null && current.spotlight_revision === 2,
    'a rejected direct opening leaves spotlight state untouched',
  )
  const { error: directCloseError } = await anon
    .from('rooms')
    .update({ active_spotlight_category_id: null })
    .eq('id', room.id)
  if (directCloseError) throw directCloseError
  current = await readRoom(room.id)
  check(
    current.spotlight_revision === 2,
    'a no-op direct write cannot invent spotlight ceremony metadata',
  )

  const { error: finishError } = await service
    .from('rooms')
    .update({ phase: 'finished' })
    .eq('id', room.id)
  if (finishError) throw finishError
  const afterLive = await openSpotlight(room.id, first.id, 2, players[0].id)
  check(
    afterLive.error?.message.includes('only while the room is live'),
    'a scheduled spotlight cannot open after the live floor closes',
  )

  await observer.removeChannel(channel)

  const conviction = await createRoom('CSV')
  check(
    conviction.room.game_model === 'conviction_portfolio',
    'the published default provides a non-scheduled model fixture',
  )
  const { error: convictionLiveError } = await service
    .from('rooms')
    .update({ phase: 'live' })
    .eq('id', conviction.room.id)
  if (convictionLiveError) throw convictionLiveError
  const wrongModel = await openSpotlight(
    conviction.room.id,
    first.id,
    0,
    conviction.players[0].id,
  )
  check(
    wrongModel.error?.message.includes('does not use scheduled spotlights'),
    'a conviction room cannot invoke the scheduled spotlight command',
  )
  const wrongModelClose = await closeSpotlight(
    conviction.room.id,
    first.id,
    0,
    conviction.players[0].id,
  )
  check(
    wrongModelClose.error?.message.includes('does not use scheduled spotlights'),
    'a conviction room cannot invoke the scheduled spotlight close command',
  )

  console.log(`PASS ${checks} atomic scheduled spotlight checks`)
} finally {
  for (const roomId of roomIds.reverse()) {
    await service.from('rooms').update({ host_id: null, active_spotlight_category_id: null }).eq('id', roomId)
    await service.from('room_winners').delete().eq('room_id', roomId)
    await service.from('players').delete().eq('room_id', roomId)
    await service.from('rooms').delete().eq('id', roomId)
  }
  if (roomIds.length > 0) {
    const { count } = await service
      .from('rooms')
      .select('id', { count: 'exact', head: true })
      .in('id', roomIds)
    check(count === 0, 'removed every disposable spotlight room and room-owned row')
  }
}
