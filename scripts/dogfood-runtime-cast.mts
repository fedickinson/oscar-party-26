/**
 * Focused local proof that a show-pack voice can cross the daemon's durable
 * claim and scheduling boundary without being one of the legacy cast ids.
 * The disposable room and its cascading private rows are removed afterward.
 *
 *   npx tsx scripts/dogfood-runtime-cast.mts
 */

import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { buildCompanionReactionKey } from '../src/lib/companion-reaction.ts'
import { supabaseConfig } from './lib/env.mts'

const { target, url, anonKey, serviceKey } = supabaseConfig('local')
if (target !== 'local') throw new Error('runtime cast dogfood is local-only')
if (!serviceKey) throw new Error('local Supabase did not report a service role key')

const browser = createClient(url, anonKey, {
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
  const { data: created, error: roomError } = await browser.rpc('create_room_with_host', {
    p_code: `RC${Math.floor(Math.random() * 100000).toString().padStart(5, '0')}`,
    p_name: 'Runtime Cast Proof',
    p_avatar_id: 'stark',
    p_color: 'slate',
  })
  if (roomError) throw roomError
  roomId = created.room.id
  const operatorCapability = created.operator_capability as string

  const postShowBundle = {
    commentary_voices: [{
      id: 'lantern-archivist',
      runtime: {
        post_show: {
          farewell: {
            order: 1,
            delay_seconds: 0,
            instruction: 'Close the record.',
          },
          keepsake: { instruction: 'Judge the player by the record.' },
        },
      },
    }],
  }
  const { data: validPostShow, error: validPostShowError } = await service.rpc(
    'show_pack_post_show_contract_is_valid',
    { p_bundle: postShowBundle },
  )
  if (validPostShowError) throw validPostShowError
  check(validPostShow === true,
    'the database accepts a complete pack-owned post-show voice contract')

  const partialPostShowBundle = structuredClone(postShowBundle)
  delete (partialPostShowBundle.commentary_voices[0].runtime.post_show as {
    keepsake?: unknown
  }).keepsake
  const { data: invalidPostShow, error: invalidPostShowError } = await service.rpc(
    'show_pack_post_show_contract_is_valid',
    { p_bundle: partialPostShowBundle },
  )
  if (invalidPostShowError) throw invalidPostShowError
  check(invalidPostShow === false,
    'the database rejects a partial pack-owned post-show voice contract')

  const delayedPostShowBundle = structuredClone(postShowBundle)
  delayedPostShowBundle.commentary_voices[0].runtime.post_show.farewell.delay_seconds = 4
  const { data: delayedPostShow, error: delayedPostShowError } = await service.rpc(
    'show_pack_post_show_contract_is_valid',
    { p_bundle: delayedPostShowBundle },
  )
  if (delayedPostShowError) throw delayedPostShowError
  check(delayedPostShow === false,
    'the database rejects a post-show cadence whose first farewell is delayed')

  const { error: phaseError } = await service.from('rooms')
    .update({ phase: 'live' })
    .eq('id', roomId)
  if (phaseError) throw phaseError

  const voiceId = 'lantern-archivist'
  const reactionKey = buildCompanionReactionKey(randomUUID(), 'mention', voiceId)
  const instanceId = randomUUID()
  const text = `A show-pack voice crossed the durable queue. ${randomUUID()}`
  const { data: claims, error: claimError } = await service.rpc('claim_companion_reaction', {
    p_room_id: roomId,
    p_reaction_key: reactionKey,
    p_instance_id: instanceId,
    p_engine: 'daemon',
    p_lease_seconds: 60,
  })
  if (claimError) throw claimError
  check(claims?.[0]?.claimed === true,
    'the daemon claims a reaction for a non-legacy show-pack voice id')

  const { data: schedules, error: scheduleError } = await service.rpc(
    'schedule_staggered_companion_reaction',
    {
      p_room_id: roomId,
      p_reaction_key: reactionKey,
      p_instance_id: instanceId,
      p_messages: [{ player_id: voiceId, text, delay_seconds: 0 }],
    },
  )
  if (scheduleError) throw scheduleError
  check(schedules?.[0]?.completed === true,
    'the durable scheduler accepts the show-pack voice id')

  const { data: messages, error: messageError } = await service.from('messages')
    .select('player_id,text')
    .eq('room_id', roomId)
    .eq('text', text)
  if (messageError) throw messageError
  check(messages?.length === 1 && messages[0].player_id === voiceId,
    'durable chat preserves the authored show-pack voice identity')

  const browserReactionKey = buildCompanionReactionKey(
    randomUUID(),
    'pre_show',
    voiceId,
  )
  const browserInstanceId = randomUUID()
  const browserText = `A show-pack voice crossed the authorized browser queue. ${randomUUID()}`
  const { data: browserClaims, error: browserClaimError } = await browser.rpc(
    'claim_browser_companion_reaction_authorized',
    {
      p_room_id: roomId,
      p_reaction_key: browserReactionKey,
      p_instance_id: browserInstanceId,
      p_lease_seconds: 60,
      p_operator_capability: operatorCapability,
    },
  )
  if (browserClaimError) throw browserClaimError
  check(browserClaims?.[0]?.claimed === true,
    'the authorized browser claims a ceremony reaction for the show-pack voice id')

  const { data: browserSchedules, error: browserScheduleError } = await browser.rpc(
    'schedule_browser_companion_reaction_authorized',
    {
      p_room_id: roomId,
      p_reaction_key: browserReactionKey,
      p_instance_id: browserInstanceId,
      p_messages: [{ player_id: voiceId, text: browserText, delay_seconds: 0 }],
      p_operator_capability: operatorCapability,
    },
  )
  if (browserScheduleError) throw browserScheduleError
  check(browserSchedules?.[0]?.completed === true,
    'the authorized browser schedules the show-pack ceremony voice id')

  const { data: browserMessages, error: browserMessageError } = await service.from('messages')
    .select('player_id,text')
    .eq('room_id', roomId)
    .eq('text', browserText)
  if (browserMessageError) throw browserMessageError
  check(browserMessages?.length === 1 && browserMessages[0].player_id === voiceId,
    'browser ceremony delivery preserves the authored show-pack voice identity')

  console.log(`PASS ${checks} runtime cast database checks`)
} finally {
  if (roomId) {
    await service.from('messages').delete().eq('room_id', roomId)
    await service.from('rooms').delete().eq('id', roomId)
    const [{ count: messages }, { count: players }, { count: rooms }] = await Promise.all([
      service.from('messages').select('id', { count: 'exact', head: true }).eq('room_id', roomId),
      service.from('players').select('id', { count: 'exact', head: true }).eq('room_id', roomId),
      service.from('rooms').select('id', { count: 'exact', head: true }).eq('id', roomId),
    ])
    check(messages === 0 && players === 0 && rooms === 0,
      'removed the runtime cast proof room and cascading rows')
  }
}
