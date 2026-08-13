/**
 * Local-only proof for room creation and the capability-gated pre-live phase
 * machine. Uses published catalog rows read-only and deletes all disposable
 * room-owned state on exit.
 *
 *   npx tsx scripts/dogfood-room-phase-authority.mts
 */
import { createClient } from '@supabase/supabase-js'
import { normalizeOperatorCapability } from '../src/lib/operator-capability'
import { supabaseConfig } from './lib/env.mts'

const { target, url, anonKey, serviceKey } = supabaseConfig('local')
if (target !== 'local') throw new Error('room phase authority dogfood is local-only')
if (!serviceKey) throw new Error('local Supabase did not report a service role key')

const anon = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const service = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

let roomId: string | null = null
let legacyRoomId: string | null = null
let checks = 0

function check(condition: unknown, message: string): asserts condition {
  checks += 1
  if (!condition) throw new Error(message)
  console.log(`PASS ${message}`)
}

async function roomCommand(name: string, args: Record<string, unknown>) {
  return anon.rpc(name, args)
}

try {
  const code = `RPA${Math.floor(Math.random() * 10_000).toString().padStart(4, '0')}`
  const directCreate = await anon.from('rooms').insert({ code: `${code}X`, host_id: null })
  check(directCreate.error !== null,
    'ordinary browsers cannot create a capability-less room row')

  const { data: created, error: createError } = await roomCommand('create_room_with_host', {
    p_code: code,
    p_name: 'Authority Host',
    p_avatar_id: 'targaryen',
    p_color: '#D4AF37',
  })
  if (createError) throw createError
  const room = created.room
  const host = created.player
  const capability = normalizeOperatorCapability(created.operator_capability)
  check(room?.id && host?.id && room.host_id === host.id && host.is_host && capability,
    'one anonymous command atomically creates the room, host seat, and bearer')
  roomId = room.id
  check(room.operator_capability_revision === 1,
    'new room publishes first-generation capability invalidation state')

  const { data: guest, error: guestError } = await anon.from('players').insert({
    room_id: room.id,
    name: 'Authority Guest',
    avatar_id: 'stark',
    color: '#7C3AED',
    is_host: false,
  }).select().single()
  if (guestError) throw guestError

  const spoofHost = await anon.from('players').insert({
    room_id: room.id,
    name: 'Spoof Host',
    avatar_id: 'velaryon',
    color: '#059669',
    is_host: true,
  })
  check(spoofHost.error?.message.includes('host seat changes require') === true,
    'a joined browser cannot mint another host seat')

  const order = [host.id, guest.id]
  const wrongBearer = await roomCommand('begin_room_draft_authorized', {
    p_room_id: room.id,
    p_actor_player_id: host.id,
    p_operator_capability: '0'.repeat(64),
    p_draft_order: order,
  })
  check(wrongBearer.error?.message.includes('valid operator capability') === true,
    'the host row alone cannot begin the party')

  const guestActor = await roomCommand('begin_room_draft_authorized', {
    p_room_id: room.id,
    p_actor_player_id: guest.id,
    p_operator_capability: capability,
    p_draft_order: order,
  })
  check(guestActor.error?.message.includes('current room host authority') === true,
    'the bearer alone cannot turn a guest seat into the operator')

  const malformedOrder = await roomCommand('begin_room_draft_authorized', {
    p_room_id: room.id,
    p_actor_player_id: host.id,
    p_operator_capability: capability,
    p_draft_order: [host.id, host.id],
  })
  check(malformedOrder.error?.message.includes('every room player exactly once') === true,
    'the database rejects a duplicate or incomplete draft order')

  const wronglySkippedIdentity = await roomCommand('begin_room_convictions_authorized', {
    p_room_id: room.id,
    p_actor_player_id: host.id,
    p_operator_capability: capability,
  })
  check(wronglySkippedIdentity.error?.message.includes('requires an identity ceremony') === true,
    'an identity-draft room cannot skip directly into convictions')

  const begun = await roomCommand('begin_room_draft_authorized', {
    p_room_id: room.id,
    p_actor_player_id: host.id,
    p_operator_capability: capability,
    p_draft_order: order,
  })
  if (begun.error) throw begun.error
  check(begun.data.phase === 'pre_draft' && begun.data.draft_order.length === 2,
    'authorized begin writes one canonical pre-draft state')

  const directDraft = await anon.from('rooms').update({ phase: 'draft' }).eq('id', room.id)
  check(directDraft.error?.message.includes('authorized operator command') === true,
    'direct browser phase mutation is rejected for a capability-backed room')

  const earlyCountdown = await roomCommand('begin_room_draft_countdown_authorized', {
    p_room_id: room.id,
    p_actor_player_id: host.id,
    p_operator_capability: capability,
  })
  check(earlyCountdown.error?.message.includes('every player must be ready') === true,
    'the operator cannot start the shared countdown before every seat is ready')

  const forgedReady = await anon.from('rooms').update({ ready_players: order }).eq('id', room.id)
  check(forgedReady.error?.message.includes('player-ready command') === true,
    'an ordinary browser cannot replace the shared ready roster')
  const foreignReady = await anon.rpc('mark_player_ready', {
    p_room_id: room.id,
    p_player_id: crypto.randomUUID(),
  })
  check(foreignReady.error?.message.includes('does not belong') === true,
    'the anonymous ready command accepts only a seat in the exact room')

  for (const player of [host, guest]) {
    const ready = await anon.rpc('mark_player_ready', {
      p_room_id: room.id,
      p_player_id: player.id,
    })
    if (ready.error) throw ready.error
  }
  const countdown = await roomCommand('begin_room_draft_countdown_authorized', {
    p_room_id: room.id,
    p_actor_player_id: host.id,
    p_operator_capability: capability,
  })
  if (countdown.error) throw countdown.error
  check(countdown.data.countdown_started_at !== null,
    'all-ready command records one database-owned countdown origin')

  const tooSoon = await roomCommand('open_room_draft_authorized', {
    p_room_id: room.id,
    p_actor_player_id: host.id,
    p_operator_capability: capability,
  })
  check(tooSoon.error?.message.includes('countdown has not completed') === true,
    'the draft cannot open before the shared countdown elapses')

  await service.from('rooms').update({
    countdown_started_at: new Date(Date.now() - 4_000).toISOString(),
  }).eq('id', room.id)
  const opened = await roomCommand('open_room_draft_authorized', {
    p_room_id: room.id,
    p_actor_player_id: host.id,
    p_operator_capability: capability,
  })
  if (opened.error) throw opened.error
  check(opened.data.phase === 'draft',
    'authorized command opens the draft after the shared countdown')

  const directSkip = await anon.from('rooms').update({ current_pick: 1 }).eq('id', room.id)
  check(directSkip.error?.message.includes('authorized command or atomic pick') === true,
    'direct timer skips cannot mutate a capability-backed draft')

  const skipped = await roomCommand('skip_room_draft_turn_authorized', {
    p_room_id: room.id,
    p_actor_player_id: host.id,
    p_operator_capability: capability,
    p_expected_pick: 0,
  })
  if (skipped.error) throw skipped.error
  check(skipped.data.current_pick === 1,
    'authorized optimistic skip advances exactly one non-final turn')
  const repeatedSkip = await roomCommand('skip_room_draft_turn_authorized', {
    p_room_id: room.id,
    p_actor_player_id: host.id,
    p_operator_capability: capability,
    p_expected_pick: 0,
  })
  check(repeatedSkip.error === null && repeatedSkip.data.current_pick === 1,
    'a repeated skip response is idempotent after the first commit')
  const finalSkip = await roomCommand('skip_room_draft_turn_authorized', {
    p_room_id: room.id,
    p_actor_player_id: host.id,
    p_operator_capability: capability,
    p_expected_pick: 1,
  })
  check(finalSkip.error?.message.includes('final draft turn cannot be skipped') === true,
    'the final player-owned draft turn remains unskippable')

  const prematureComplete = await roomCommand('complete_room_draft_authorized', {
    p_room_id: room.id,
    p_actor_player_id: host.id,
    p_operator_capability: capability,
  })
  check(prematureComplete.error?.message.includes('draft ledger is not complete') === true,
    'the operator cannot close an incomplete draft ledger')

  await service.from('rooms').update({ current_pick: 2 }).eq('id', room.id)
  const completed = await roomCommand('complete_room_draft_authorized', {
    p_room_id: room.id,
    p_actor_player_id: host.id,
    p_operator_capability: capability,
  })
  if (completed.error) throw completed.error
  check(completed.data.phase === 'confidence',
    'complete draft command opens the show-neutral prediction floor')

  const directLive = await anon.from('rooms').update({ phase: 'live' }).eq('id', room.id)
  check(directLive.error?.message.includes('authorized operator command') === true,
    'direct browser writes cannot open live play')
  const live = await roomCommand('open_room_live_authorized', {
    p_room_id: room.id,
    p_actor_player_id: host.id,
    p_operator_capability: capability,
  })
  if (live.error) throw live.error
  check(live.data.phase === 'live',
    'the capability-gated command opens live play')

  const legacyCode = `LRP${Math.floor(Math.random() * 10_000).toString().padStart(4, '0')}`
  const { data: legacyRoom, error: legacyCreateError } = await service.from('rooms').insert({
    code: legacyCode,
    phase: 'lobby',
    host_id: null,
  }).select().single()
  if (legacyCreateError) throw legacyCreateError
  legacyRoomId = legacyRoom.id
  const legacyUpdate = await anon.from('rooms').update({ phase: 'pre_draft' })
    .eq('id', legacyRoom.id)
  check(legacyUpdate.error?.message.includes('authorized operator command') === true,
    'capability-less legacy rows fail closed until an operator bearer is issued')

  console.log(`PASS ${checks} room phase authority checks`)
} finally {
  for (const disposableRoomId of [roomId, legacyRoomId]) {
    if (!disposableRoomId) continue
    await service.from('rooms').update({ host_id: null, phase: 'lobby' }).eq('id', disposableRoomId)
    await service.from('players').delete().eq('room_id', disposableRoomId)
    await service.from('rooms').delete().eq('id', disposableRoomId)
    const { count } = await service.from('rooms')
      .select('id', { count: 'exact', head: true }).eq('id', disposableRoomId)
    check(count === 0, 'removed one disposable authority room')
  }
}
