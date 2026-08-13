/**
 * Local-only proof for the database-owned watch-sync command family.
 * Creates one disposable room, never writes catalog tables, and removes all
 * room-owned state on exit.
 *
 *   npx tsx scripts/dogfood-playback-sync-authority.mts
 */
import { createClient } from '@supabase/supabase-js'
import { supabaseConfig } from './lib/env.mts'

const { target, url, anonKey, serviceKey } = supabaseConfig('local')
if (target !== 'local') throw new Error('playback sync authority dogfood is local-only')
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
  checks += 1
  if (!condition) throw new Error(message)
  console.log(`PASS ${message}`)
}

try {
  const code = `PSA${Math.floor(Math.random() * 10_000).toString().padStart(4, '0')}`
  const { data: created, error: createError } = await anon.rpc('create_room_with_host', {
    p_code: code,
    p_name: 'Playback Host',
    p_avatar_id: 'targaryen',
    p_color: '#D4AF37',
  })
  if (createError) throw createError
  const room = created.room
  const host = created.player
  const capability = created.operator_capability as string
  roomId = room.id

  const { data: guests, error: guestError } = await anon.from('players').insert([
    {
      room_id: room.id,
      name: 'Playback Holder',
      avatar_id: 'stark',
      color: '#999999',
      is_host: false,
    },
    {
      room_id: room.id,
      name: 'Playback Passenger',
      avatar_id: 'velaryon',
      color: '#777777',
      is_host: false,
    },
  ]).select()
  if (guestError) throw guestError
  const [holder, passenger] = guests

  const { data: bingoSquares, error: bingoSquaresError } = await service
    .from('bingo_squares')
    .select('id')
    .eq('show_pack_id', room.show_pack_id)
    .order('id')
    .limit(24)
  if (bingoSquaresError) throw bingoSquaresError
  check(bingoSquares.length === 24,
    'the room pack exposes enough authored squares for the bingo authority proof')
  const cardSquares = bingoSquares.map((square) => square.id)
  cardSquares.splice(12, 0, 0)

  const directCard = await anon.from('bingo_cards').insert({
    room_id: room.id,
    player_id: holder.id,
    squares: cardSquares,
  })
  check(directCard.error != null,
    'a browser cannot directly deal a bingo card')

  await service.from('rooms').update({ phase: 'live' }).eq('id', room.id)
  const { data: holderCard, error: holderCardError } = await anon.rpc('deal_player_bingo_card', {
    p_room_id: room.id,
    p_actor_player_id: holder.id,
    p_squares: cardSquares,
  })
  if (holderCardError) throw holderCardError
  const { data: replayedCard, error: replayedCardError } = await anon.rpc('deal_player_bingo_card', {
    p_room_id: room.id,
    p_actor_player_id: holder.id,
    p_squares: [],
  })
  if (replayedCardError) throw replayedCardError
  check(holderCard.id === replayedCard.id,
    'replayed bingo dealing returns the one existing player card')

  const directMark = await anon.from('bingo_marks').insert({
    card_id: holderCard.id,
    square_index: 0,
    status: 'approved',
  })
  check(directMark.error != null,
    'a browser cannot directly forge a bingo mark')
  const foreignMark = await anon.rpc('set_player_bingo_mark', {
    p_room_id: room.id,
    p_actor_player_id: passenger.id,
    p_card_id: holderCard.id,
    p_square_index: 0,
    p_marked: true,
  })
  check(foreignMark.error?.message.includes('does not own') === true,
    'a public seat handle cannot mark another seat bingo card')
  const { data: marked, error: markError } = await anon.rpc('set_player_bingo_mark', {
    p_room_id: room.id,
    p_actor_player_id: holder.id,
    p_card_id: holderCard.id,
    p_square_index: 0,
    p_marked: true,
  })
  if (markError) throw markError
  const { data: replayedMark, error: replayedMarkError } = await anon.rpc('set_player_bingo_mark', {
    p_room_id: room.id,
    p_actor_player_id: holder.id,
    p_card_id: holderCard.id,
    p_square_index: 0,
    p_marked: true,
  })
  if (replayedMarkError) throw replayedMarkError
  check(marked.id === replayedMark.id,
    'replayed bingo marking returns the existing approved mark')
  const { data: cleared, error: clearError } = await anon.rpc('set_player_bingo_mark', {
    p_room_id: room.id,
    p_actor_player_id: holder.id,
    p_card_id: holderCard.id,
    p_square_index: 0,
    p_marked: false,
  })
  if (clearError) throw clearError
  const { data: clearReplay, error: clearReplayError } = await anon.rpc('set_player_bingo_mark', {
    p_room_id: room.id,
    p_actor_player_id: holder.id,
    p_card_id: holderCard.id,
    p_square_index: 0,
    p_marked: false,
  })
  if (clearReplayError) throw clearReplayError
  const { count: remainingMarkCount, error: remainingMarkError } = await service
    .from('bingo_marks')
    .select('id', { count: 'exact', head: true })
    .eq('card_id', holderCard.id)
    .eq('square_index', 0)
  if (remainingMarkError) throw remainingMarkError
  check(cleared?.id === marked.id && clearReplay?.id == null && remainingMarkCount === 0,
    'bingo unmark removes the exact mark and replays as a no-op')

  await service.from('rooms').update({ phase: 'lobby' }).eq('id', room.id)

  const forgedSeat = await anon.from('players').insert({
    room_id: room.id,
    name: 'Forged Holder',
    avatar_id: 'arryn',
    color: '#666666',
    is_host: false,
    watch_group: 'New York',
    is_remote_holder: true,
  })
  check(forgedSeat.error?.message.includes('begin without playback authority') === true,
    'a new browser seat cannot arrive with playback authority')

  const directGroup = await anon.from('players')
    .update({ watch_group: 'New York' }).eq('id', holder.id)
  check(directGroup.error?.message.includes('authorized playback command') === true,
    'a browser cannot directly mutate a player playback role')

  for (const player of [holder, passenger]) {
    const { error } = await anon.rpc('set_player_watch_group_authorized', {
      p_room_id: room.id,
      p_actor_player_id: player.id,
      p_target_player_id: player.id,
      p_watch_group: 'New York',
      p_operator_capability: null,
    })
    if (error) throw error
  }
  const { error: claimError } = await anon.rpc('claim_room_remote_authority', {
    p_room_id: room.id,
    p_actor_player_id: holder.id,
  })
  if (claimError) throw claimError
  const { data: groupedPlayers, error: groupedError } = await service.from('players')
    .select('id,is_remote_holder').eq('room_id', room.id).eq('watch_group', 'New York')
  if (groupedError) throw groupedError
  check(groupedPlayers.filter((player) => player.is_remote_holder).map((player) => player.id)
    .join(',') === holder.id,
  'one atomic claim leaves exactly one database-derived holder for the screen')

  const directTeam = await anon.from('players').update({ team: 'black' }).eq('id', holder.id)
  check(directTeam.error?.message.includes('authorized command') === true,
    'a browser cannot directly forge a seat allegiance transition')
  const foreignTeam = await anon.rpc('set_player_allegiance', {
    p_room_id: crypto.randomUUID(),
    p_actor_player_id: holder.id,
    p_team: 'black',
  })
  check(foreignTeam.error != null,
    'an allegiance command cannot move a seat across rooms')
  const { data: firstTeam, error: firstTeamError } = await anon.rpc('set_player_allegiance', {
    p_room_id: room.id,
    p_actor_player_id: holder.id,
    p_team: 'black',
  })
  if (firstTeamError) throw firstTeamError
  const { data: secondTeam, error: secondTeamError } = await anon.rpc('set_player_allegiance', {
    p_room_id: room.id,
    p_actor_player_id: holder.id,
    p_team: 'green',
  })
  if (secondTeamError) throw secondTeamError
  check(firstTeam.team_revision === 1 && firstTeam.previous_team == null &&
      secondTeam.team_revision === 2 && secondTeam.previous_team === 'black',
    'player-owned allegiance commands preserve database-owned revision history')

  const directWelcome = await anon.from('players')
    .update({ welcomed_at: new Date().toISOString() }).eq('id', passenger.id)
  check(directWelcome.error?.message.includes('authorized command') === true,
    'a browser cannot consume another seat welcome slot directly')
  const missingWelcomeBearer = await anon.rpc('claim_player_welcome_authorized_v2', {
    p_room_id: room.id,
    p_actor_player_id: host.id,
    p_target_player_id: passenger.id,
    p_operator_capability: null,
  })
  check(missingWelcomeBearer.error?.message.includes('valid operator capability') === true,
    'the public host seat cannot claim a welcome without the room bearer')
  const { data: welcome, error: welcomeError } = await anon.rpc(
    'claim_player_welcome_authorized_v2', {
      p_room_id: room.id,
      p_actor_player_id: host.id,
      p_target_player_id: passenger.id,
      p_operator_capability: capability,
    },
  )
  if (welcomeError) throw welcomeError
  const repeatedWelcome = await anon.rpc('claim_player_welcome_authorized_v2', {
    p_room_id: room.id,
    p_actor_player_id: host.id,
    p_target_player_id: passenger.id,
    p_operator_capability: capability,
  })
  check(welcome?.welcomed_at != null && repeatedWelcome.error === null && repeatedWelcome.data == null,
    'the capability-bearing host claims one database-timestamped welcome exactly once')
  const legacyReplay = await anon.rpc('claim_player_welcome_authorized', {
    p_room_id: room.id,
    p_actor_player_id: host.id,
    p_target_player_id: passenger.id,
    p_operator_capability: capability,
  })
  check(legacyReplay.error?.message.includes('already claimed') === true,
    'an older open client fails closed after losing the same welcome claim')

  const foreignRoom = crypto.randomUUID()
  const foreignClaim = await anon.rpc('claim_room_remote_authority', {
    p_room_id: foreignRoom,
    p_actor_player_id: holder.id,
  })
  check(foreignClaim.error?.message.includes('does not belong') === true,
    'a seat cannot claim playback authority across rooms')

  await service.from('rooms').update({ phase: 'live' }).eq('id', room.id)
  const directStart = await anon.from('rooms').update({ show_started: true }).eq('id', room.id)
  check(directStart.error?.message.includes('authorized playback command') === true,
    'a browser cannot directly start the shared playback record')
  const nonHolderStart = await anon.rpc('start_episode_for_screen_authorized', {
    p_room_id: room.id,
    p_actor_player_id: passenger.id,
    p_operator_capability: null,
  })
  check(nonHolderStart.error?.message.includes('valid operator capability') === true,
    'a named-screen passenger cannot start playback without holder or host authority')

  for (const player of [host, holder]) {
    const { error } = await anon.rpc('start_episode_for_screen_authorized', {
      p_room_id: room.id,
      p_actor_player_id: player.id,
      p_operator_capability: player.id === host.id ? capability : null,
    })
    if (error) throw error
  }
  const { data: startedPlayers, error: startedError } = await service.from('players')
    .select('id,episode_started_at').eq('room_id', room.id)
  if (startedError) throw startedError
  check(startedPlayers.every((player) => player.episode_started_at != null),
    'starting each screen records one shared origin for every seat on that screen')

  const directBeacon = await anon.from('rooms').update({ sync_position_ms: 12_000 })
    .eq('id', room.id)
  check(directBeacon.error?.message.includes('authorized playback command') === true,
    'a browser cannot directly replace the canonical playback beacon')
  const passengerBeacon = await anon.rpc('post_room_playback_beacon', {
    p_room_id: room.id,
    p_actor_player_id: passenger.id,
    p_position_ms: 12_000,
  })
  check(passengerBeacon.error?.message.includes('current screen holder') === true,
    'a named-screen passenger cannot publish the holder beacon')
  const { data: beacon, error: beaconError } = await anon.rpc('post_room_playback_beacon', {
    p_room_id: room.id,
    p_actor_player_id: holder.id,
    p_position_ms: 12_000,
  })
  if (beaconError) throw beaconError
  check(beacon.sync_position_ms === 12_000 && beacon.sync_posted_by === holder.id,
    'the holder command publishes the position with a database timestamp')

  const { error: requestError } = await anon.rpc('request_room_playback_pause', {
    p_room_id: room.id,
    p_actor_player_id: passenger.id,
    p_reason: 'doorbell',
  })
  if (requestError) throw requestError
  const wrongCancel = await anon.rpc('cancel_room_playback_pause_request', {
    p_room_id: room.id,
    p_actor_player_id: host.id,
  })
  check(wrongCancel.error?.message.includes('only the requesting seat') === true,
    'one seat cannot cancel another seat pause request')
  const nonHolderPause = await anon.rpc('confirm_room_playback_pause', {
    p_room_id: room.id,
    p_actor_player_id: passenger.id,
    p_position_ms: 13_000,
  })
  check(nonHolderPause.error?.message.includes('current screen holder') === true,
    'a named-screen passenger cannot park every playback')
  const { data: paused, error: pauseError } = await anon.rpc('confirm_room_playback_pause', {
    p_room_id: room.id,
    p_actor_player_id: holder.id,
    p_position_ms: 13_000,
  })
  if (pauseError) throw pauseError
  check(paused.is_paused && paused.paused_at_ms === 13_000 && paused.pause_requested_by == null,
    'the first holder confirmation atomically parks and clears the request')
  const repeatedPause = await anon.rpc('confirm_room_playback_pause', {
    p_room_id: room.id,
    p_actor_player_id: host.id,
    p_position_ms: 14_000,
  })
  check(repeatedPause.error === null && repeatedPause.data.paused_at_ms === 13_000,
    'a racing second holder cannot move the canonical park position')

  const directReady = await anon.from('rooms').update({ resume_ready: [passenger.id] })
    .eq('id', room.id)
  check(directReady.error?.message.includes('authorized playback command') === true,
    'a browser cannot directly replace the ready-screen ledger')
  const passengerReady = await anon.rpc('mark_room_playback_resume_ready', {
    p_room_id: room.id,
    p_actor_player_id: passenger.id,
  })
  check(passengerReady.error?.message.includes('current screen holder') === true,
    'only the current holder may answer ready for a named screen')
  for (const player of [host, holder]) {
    const { error } = await anon.rpc('mark_room_playback_resume_ready', {
      p_room_id: room.id,
      p_actor_player_id: player.id,
    })
    if (error) throw error
  }
  const { data: scheduled, error: scheduleError } = await anon.rpc(
    'schedule_room_playback_resume', {
      p_room_id: room.id,
      p_actor_player_id: holder.id,
      p_countdown_seconds: 3,
    },
  )
  if (scheduleError) throw scheduleError
  check(scheduled.resume_at != null,
    'a parked holder schedules one database-authored resume timestamp')

  const staleRelease = await anon.rpc('release_room_playback_resume', {
    p_room_id: room.id,
    p_actor_player_id: holder.id,
    p_expected_resume_at: new Date(Date.parse(scheduled.resume_at) - 1_000).toISOString(),
  })
  check(staleRelease.error?.message.includes('countdown is stale') === true,
    'a stale tab cannot release a replacement countdown')
  const maturedResumeAt = new Date(Date.now() - 1_000).toISOString()
  await service.from('rooms').update({ resume_at: maturedResumeAt }).eq('id', room.id)
  const { data: released, error: releaseError } = await anon.rpc('release_room_playback_resume', {
    p_room_id: room.id,
    p_actor_player_id: host.id,
    p_expected_resume_at: maturedResumeAt,
  })
  if (releaseError) throw releaseError
  check(!released.is_paused && released.resume_at == null && released.resume_ready.length === 0,
    'a holder releases the exact mature countdown once and clears its ready state')

  console.log(`PASS ${checks} playback sync authority checks`)
} finally {
  if (roomId) {
    await service.from('rooms').update({ host_id: null, phase: 'lobby' }).eq('id', roomId)
    await service.from('players').delete().eq('room_id', roomId)
    await service.from('rooms').delete().eq('id', roomId)
    const { count } = await service.from('rooms')
      .select('id', { count: 'exact', head: true }).eq('id', roomId)
    check(count === 0, 'removed the disposable playback authority room')
  }
}
