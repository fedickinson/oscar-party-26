/**
 * Focused local proof for the atomic scheduled-winner command.
 *
 * This reads the published catalog, creates disposable rooms, exercises the
 * capability-gated anonymous RPC and blocked direct writes, then removes every room-owned
 * row. It never writes catalog tables and refuses a remote target.
 *
 *   npx tsx scripts/dogfood-scheduled-winner-command.mts
 */

import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { supabaseConfig } from './lib/env.mts'
import { bindResultsNightDogfoodPack } from './lib/results-night-dogfood-pack.mts'

const { target, url, anonKey, serviceKey } = supabaseConfig('local')
if (target !== 'local') throw new Error('scheduled-winner command dogfood is local-only')
if (!serviceKey) throw new Error('local Supabase did not report a service role key')

const anon = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const service = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

type Room = {
  id: string
  show_pack_id: string
  game_model: string
}

type Player = {
  id: string
}

type Category = {
  id: number
}

type Candidate = {
  nominee_id: string
}

const roomIds: string[] = []
const capabilityByRoomId = new Map<string, string>()
let checks = 0

function check(condition: unknown, message: string): asserts condition {
  checks += 1
  if (!condition) throw new Error(message)
  console.log(`PASS ${message}`)
}

function declaration(
  roomId: string,
  categoryId: number,
  winnerId: string,
  tieWinnerId: string | null,
  actorPlayerId: string,
) {
  return anon.rpc('declare_scheduled_winner_authorized', {
    p_room_id: roomId,
    p_category_id: categoryId,
    p_winner_id: winnerId,
    p_tie_winner_id: tieWinnerId,
    p_actor_player_id: actorPlayerId,
    p_operator_capability: capabilityByRoomId.get(roomId) ?? null,
  })
}

function undo(
  roomId: string,
  categoryId: number,
  expectedWinnerId: string,
  expectedTieWinnerId: string | null,
  actorPlayerId: string,
) {
  return anon.rpc('undo_scheduled_winner_authorized', {
    p_room_id: roomId,
    p_category_id: categoryId,
    p_expected_winner_id: expectedWinnerId,
    p_expected_tie_winner_id: expectedTieWinnerId,
    p_actor_player_id: actorPlayerId,
    p_operator_capability: capabilityByRoomId.get(roomId) ?? null,
  })
}

async function createRoom(label: string, resultsNight = false): Promise<{ room: Room; players: Player[] }> {
  const code = `${label}${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`
  const { data: room, error: roomError } = await service
    .from('rooms')
    .insert({ code, phase: 'lobby', host_id: null })
    .select('id,show_pack_id,game_model')
    .single()
  if (roomError) throw roomError
  roomIds.push(room.id)
  if (resultsNight) bindResultsNightDogfoodPack(code)

  const { data: players, error: playerError } = await service
    .from('players')
    .insert([
      { room_id: room.id, name: `${label} Host`, is_host: true },
      { room_id: room.id, name: `${label} Guest One`, is_host: false },
      { room_id: room.id, name: `${label} Guest Two`, is_host: false },
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
  const { data: boundRoom, error: boundRoomError } = await service
    .from('rooms')
    .select('id,show_pack_id,game_model')
    .eq('id', room.id)
    .single()
  if (boundRoomError) throw boundRoomError
  return { room: boundRoom, players }
}

async function outcomes(roomId: string, categoryId: number) {
  const { data, error } = await service
    .from('confidence_picks')
    .select('nominee_id,is_correct')
    .eq('room_id', roomId)
    .eq('category_id', categoryId)
    .order('confidence')
  if (error) throw error
  return data
}

async function winnerRows(roomId: string, categoryId: number) {
  const { data, error } = await service
    .from('room_winners')
    .select('winner_id,tie_winner_id')
    .eq('room_id', roomId)
    .eq('category_id', categoryId)
  if (error) throw error
  return data
}

try {
  const { room, players } = await createRoom('ASW', true)
  check(players.length === 3, 'created a three-player disposable room')

  const legacy = await anon.rpc('declare_scheduled_winner', {
    p_room_id: room.id,
    p_category_id: -1,
    p_winner_id: randomUUID(),
    p_tie_winner_id: null,
    p_actor_player_id: players[0].id,
  })
  check(legacy.error != null, 'the host-id-only scheduled winner primitive is not browser executable')

  check(room.game_model === 'legacy_ensemble',
    'explicit Results Night commitment selects the scheduled runtime')

  const { error: confidencePhaseError } = await service
    .from('rooms')
    .update({ phase: 'confidence' })
    .eq('id', room.id)
  if (confidencePhaseError) throw confidencePhaseError

  const { data: categories, error: categoryError } = await service
    .from('categories')
    .select('id')
    .eq('show_pack_id', room.show_pack_id)
    .is('room_id', null)
    .order('display_order')
    .limit(2)
  if (categoryError) throw categoryError
  check(categories.length >= 2, 'loaded two authored scheduled categories read-only')

  const category = categories[0] as Category
  const secondCategory = categories[1] as Category
  const { data: candidates, error: candidateError } = await service
    .from('category_nominees')
    .select('nominee_id')
    .eq('category_id', category.id)
    .limit(3)
  if (candidateError) throw candidateError
  check(candidates.length >= 3, 'loaded three authored candidates read-only')
  const [first, second, third] = candidates as Candidate[]
  const { data: secondCandidates, error: secondCandidateError } = await service
    .from('category_nominees')
    .select('nominee_id')
    .eq('category_id', secondCategory.id)
    .limit(1)
  if (secondCandidateError) throw secondCandidateError
  check(secondCandidates.length === 1, 'loaded a second-category candidate read-only')
  const secondCategoryCandidate = secondCandidates[0] as Candidate

  const { error: pickError } = await anon.from('confidence_picks').insert([
    {
      room_id: room.id,
      player_id: players[0].id,
      category_id: category.id,
      nominee_id: first.nominee_id,
      confidence: 1,
    },
    {
      room_id: room.id,
      player_id: players[1].id,
      category_id: category.id,
      nominee_id: second.nominee_id,
      confidence: 2,
    },
    {
      room_id: room.id,
      player_id: players[2].id,
      category_id: category.id,
      nominee_id: third.nominee_id,
      confidence: 3,
    },
  ])
  if (pickError) throw pickError

  const prefilledOutcome = await anon.from('confidence_picks').insert({
    room_id: room.id,
    player_id: players[0].id,
    category_id: secondCategory.id,
    nominee_id: secondCategoryCandidate.nominee_id,
    confidence: 4,
    is_correct: true,
  })
  check(
    prefilledOutcome.error?.message.includes('correctness is derived'),
    'a new browser confidence stake cannot arrive with a prefilled outcome',
  )

  const forgedEarlyOutcome = await anon
    .from('confidence_picks')
    .update({ is_correct: true })
    .eq('room_id', room.id)
    .eq('player_id', players[0].id)
    .eq('category_id', category.id)
  check(
    forgedEarlyOutcome.error?.message.includes('must match the scheduled winner projection'),
    'a browser cannot author correctness before a winner exists',
  )

  const rewrittenStake = await anon
    .from('confidence_picks')
    .update({ nominee_id: second.nominee_id })
    .eq('room_id', room.id)
    .eq('player_id', players[0].id)
    .eq('category_id', category.id)
  check(
    rewrittenStake.error?.message.includes('submitted confidence stake is immutable'),
    'a submitted confidence stake cannot be rewritten',
  )

  const early = await declaration(
    room.id,
    category.id,
    first.nominee_id,
    null,
    players[0].id,
  )
  check(
    early.error?.message.includes('only while the room is live'),
    'a scheduled winner is rejected before the live phase',
  )

  const { error: liveError } = await service
    .from('rooms')
    .update({ phase: 'live' })
    .eq('id', room.id)
  if (liveError) throw liveError

  const latePick = await anon.from('confidence_picks').insert({
    room_id: room.id,
    player_id: players[0].id,
    category_id: secondCategory.id,
    nominee_id: secondCategoryCandidate.nominee_id,
    confidence: 4,
  })
  check(
    latePick.error?.message.includes('require the scheduled confidence phase'),
    'a browser cannot add a confidence stake after the scheduled phase closes',
  )

  const nonHost = await declaration(
    room.id,
    category.id,
    first.nominee_id,
    null,
    players[1].id,
  )
  check(
    nonHost.error?.message.includes('current room host authority'),
    'a non-host declaration is rejected',
  )

  const wrongCategory = await declaration(
    room.id,
    -1,
    first.nominee_id,
    null,
    players[0].id,
  )
  check(
    wrongCategory.error?.message.includes('does not belong'),
    'a category outside the room slate is rejected',
  )

  const wrongCandidate = await declaration(
    room.id,
    category.id,
    randomUUID(),
    null,
    players[0].id,
  )
  check(
    wrongCandidate.error?.message.includes('not a candidate'),
    'a winner outside the category is rejected',
  )

  const duplicateTie = await declaration(
    room.id,
    category.id,
    first.nominee_id,
    first.nominee_id,
    players[0].id,
  )
  check(
    duplicateTie.error?.message.includes('must be distinct'),
    'the same candidate cannot occupy both tie positions',
  )

  const declared = await declaration(
    room.id,
    category.id,
    first.nominee_id,
    null,
    players[0].id,
  )
  if (declared.error) throw declared.error
  check(
    JSON.stringify(await outcomes(room.id, category.id)) === JSON.stringify([
      { nominee_id: first.nominee_id, is_correct: true },
      { nominee_id: second.nominee_id, is_correct: false },
      { nominee_id: third.nominee_id, is_correct: false },
    ]),
    'a declaration derives every confidence outcome in the same transaction',
  )

  const compatibleLegacyUpdate = await anon
    .from('confidence_picks')
    .update({ is_correct: true })
    .eq('room_id', room.id)
    .eq('player_id', players[0].id)
    .eq('category_id', category.id)
  if (compatibleLegacyUpdate.error) throw compatibleLegacyUpdate.error
  check(true, 'an older client may repeat the canonical derived outcome')

  const forgedOutcome = await anon
    .from('confidence_picks')
    .update({ is_correct: false })
    .eq('room_id', room.id)
    .eq('player_id', players[0].id)
    .eq('category_id', category.id)
  check(
    forgedOutcome.error?.message.includes('must match the scheduled winner projection'),
    'a browser cannot replace the canonical derived outcome',
  )

  const replay = await declaration(
    room.id,
    category.id,
    first.nominee_id,
    null,
    players[0].id,
  )
  if (replay.error) throw replay.error
  check(
    (await winnerRows(room.id, category.id)).length === 1,
    'an identical declaration replay is idempotent',
  )

  const conflict = await declaration(
    room.id,
    category.id,
    second.nominee_id,
    null,
    players[0].id,
  )
  check(
    conflict.error?.message.includes('undo it before declaring'),
    'a conflicting overwrite is rejected',
  )
  check(
    (await winnerRows(room.id, category.id))[0]?.winner_id === first.nominee_id,
    'a rejected overwrite preserves the original winner',
  )

  const staleUndo = await undo(
    room.id,
    category.id,
    second.nominee_id,
    null,
    players[0].id,
  )
  check(
    staleUndo.error?.message.includes('changed before it could be undone'),
    'a stale compare-and-delete is rejected',
  )
  check(
    (await winnerRows(room.id, category.id)).length === 1,
    'a stale undo leaves the canonical result intact',
  )

  const undone = await undo(
    room.id,
    category.id,
    first.nominee_id,
    null,
    players[0].id,
  )
  if (undone.error) throw undone.error
  check(
    (await winnerRows(room.id, category.id)).length === 0
      && (await outcomes(room.id, category.id)).every((pick) => pick.is_correct === null),
    'an exact undo removes the result and resets confidence atomically',
  )

  const tied = await declaration(
    room.id,
    category.id,
    first.nominee_id,
    second.nominee_id,
    players[0].id,
  )
  if (tied.error) throw tied.error
  const tieOutcomes = await outcomes(room.id, category.id)
  check(
    tieOutcomes[0]?.is_correct === true
      && tieOutcomes[1]?.is_correct === true
      && tieOutcomes[2]?.is_correct === false,
    'a tie marks both declared candidates correct and every other pick incorrect',
  )

  const tieUndo = await undo(
    room.id,
    category.id,
    first.nominee_id,
    second.nominee_id,
    players[0].id,
  )
  if (tieUndo.error) throw tieUndo.error
  check(
    (await outcomes(room.id, category.id)).every((pick) => pick.is_correct === null),
    'an exact tie undo resets every confidence outcome',
  )

  const directInsert = await anon.from('room_winners').insert({
    room_id: room.id,
    category_id: category.id,
    winner_id: second.nominee_id,
    tie_winner_id: null,
  })
  check(
    directInsert.error != null && (await winnerRows(room.id, category.id)).length === 0,
    'a browser cannot bypass the scheduled command with a direct winner insert',
  )
  const { error: serviceFixtureError } = await service.from('room_winners').insert({
    room_id: room.id,
    category_id: category.id,
    winner_id: second.nominee_id,
    tie_winner_id: null,
  })
  if (serviceFixtureError) throw serviceFixtureError
  const directUpdate = await anon
    .from('room_winners')
    .update({ winner_id: first.nominee_id })
    .eq('room_id', room.id)
    .eq('category_id', category.id)
  check(
    directUpdate.error != null
      && (await winnerRows(room.id, category.id))[0]?.winner_id === second.nominee_id,
    'a browser cannot bypass the scheduled command with a direct winner update',
  )
  const directDelete = await anon
    .from('room_winners')
    .delete()
    .eq('room_id', room.id)
    .eq('category_id', category.id)
  check(
    directDelete.error != null && (await winnerRows(room.id, category.id)).length === 1,
    'a browser cannot bypass the scheduled command with a direct winner delete',
  )
  const { error: clearServiceFixtureError } = await service
    .from('room_winners')
    .delete()
    .eq('room_id', room.id)
    .eq('category_id', category.id)
  if (clearServiceFixtureError) throw clearServiceFixtureError

  const concurrent = await Promise.all([
    declaration(
      room.id,
      category.id,
      first.nominee_id,
      null,
      players[0].id,
    ),
    declaration(
      room.id,
      category.id,
      second.nominee_id,
      null,
      players[0].id,
    ),
  ])
  check(
    concurrent.filter((result) => result.error == null).length === 1,
    'exactly one conflicting concurrent declaration commits',
  )
  check(
    (await winnerRows(room.id, category.id)).length === 1,
    'the concurrent loser leaves one canonical winner row',
  )

  const concurrentWinner = (await winnerRows(room.id, category.id))[0]
  const { error: finishError } = await service
    .from('rooms')
    .update({ phase: 'finished' })
    .eq('id', room.id)
  if (finishError) throw finishError
  const postShowDeclare = await declaration(
    room.id,
    secondCategory.id,
    first.nominee_id,
    null,
    players[0].id,
  )
  check(
    postShowDeclare.error?.message.includes('only while the room is live'),
    'new declarations are rejected after the live phase',
  )
  const postShowUndo = await undo(
    room.id,
    category.id,
    concurrentWinner.winner_id,
    concurrentWinner.tie_winner_id,
    players[0].id,
  )
  if (postShowUndo.error) throw postShowUndo.error
  check(
    (await winnerRows(room.id, category.id)).length === 0,
    'a provisional result can still be corrected during the finished phase',
  )

  const conviction = await createRoom('CVW')
  check(
    conviction.room.game_model === 'conviction_portfolio',
    'the published room default provides a non-scheduled model fixture',
  )
  const { error: convictionLiveError } = await service
    .from('rooms')
    .update({ phase: 'live' })
    .eq('id', conviction.room.id)
  if (convictionLiveError) throw convictionLiveError
  const wrongModel = await declaration(
    conviction.room.id,
    category.id,
    first.nominee_id,
    null,
    conviction.players[0].id,
  )
  check(
    wrongModel.error?.message.includes('does not use the scheduled winner model'),
    'a conviction room cannot invoke the scheduled-winner command',
  )

  console.log(`PASS ${checks} atomic scheduled-winner checks`)
} finally {
  for (const roomId of roomIds.reverse()) {
    await service.from('rooms').update({ host_id: null }).eq('id', roomId)
    await service.from('room_winners').delete().eq('room_id', roomId)
    await service.from('confidence_picks').delete().eq('room_id', roomId)
    await service.from('players').delete().eq('room_id', roomId)
    await service.from('rooms').delete().eq('id', roomId)
  }
  if (roomIds.length > 0) {
    const { count } = await service
      .from('rooms')
      .select('id', { count: 'exact', head: true })
      .in('id', roomIds)
    check(count === 0, 'removed every disposable room and room-owned row')
  }
}
