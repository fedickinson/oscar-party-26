/**
 * Focused local proof for cross-engine companion reaction idempotency.
 *
 * One disposable room exercises concurrent claim arbitration, atomic message
 * completion, completed-work refusal, stale takeover and explicit release.
 * The private claim rows cascade away with the room.
 *
 *   npx tsx scripts/dogfood-companion-claims.mts
 */

import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  buildBingoReactionKey,
  buildCompanionReactionKey,
  buildMilestoneReactionKey,
  buildPreShowArrivalReactionKey,
  buildPostShowReactionKey,
  buildShowStartedReactionKey,
  buildSpotlightReactionKey,
  buildTeamChangeReactionKey,
  buildVerdictReactionKey,
  buildWelcomeReactionKey,
  selectSpokenCompanionIds,
} from '../src/lib/companion-reaction.ts'
import {
  buildBanterPrompt,
  buildBingoReactionPrompt,
  buildChatReactivePrompt,
  buildMilestonePrompt,
  buildPlayerWelcomePrompt,
  buildPreCeremonyPrompt,
  buildPreCategoryPrompt,
  buildShowStartedPrompt,
  buildTeamChangePrompt,
} from '../src/lib/companion-prompts.ts'
import { groundedCompanionBatch } from '../api/_grounding.ts'
import { supabaseConfig } from './lib/env.mts'

const { target, url, anonKey, serviceKey } = supabaseConfig('local')
if (target !== 'local') throw new Error('companion claim dogfood is local-only')
if (!serviceKey) throw new Error('local Supabase did not report a service role key')

const browser = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const daemon = service

type ClaimResult = {
  claimed: boolean
  active_engine: string
  active_instance_id: string
  active_lease_expires_at: string
  active_completed_at: string | null
}

type CompleteResult = {
  completed: boolean
  output_message_ids: string[]
}

type ScheduleResult = {
  completed: boolean
  first_message_id: string | null
}

type DeliveryResult = {
  delivered_count: number
  message_ids: string[]
}

let roomId: string | null = null
let operatorCapability: string | null = null
let checks = 0
const engineByInstance = new Map<string, 'browser' | 'daemon'>()

function check(condition: unknown, message: string): asserts condition {
  checks++
  if (!condition) throw new Error(message)
  console.log(`PASS ${message}`)
}

async function claim(
  client: SupabaseClient,
  reactionKey: string,
  instanceId: string,
  engine: 'browser' | 'daemon',
  leaseSeconds = 60,
): Promise<ClaimResult> {
  engineByInstance.set(instanceId, engine)
  const rpcName = engine === 'browser'
    ? 'claim_browser_companion_reaction_authorized'
    : 'claim_companion_reaction'
  const parameters = {
    p_room_id: roomId,
    p_reaction_key: reactionKey,
    p_instance_id: instanceId,
    p_lease_seconds: leaseSeconds,
    ...(engine === 'browser'
      ? { p_operator_capability: operatorCapability }
      : { p_engine: 'daemon' }),
  }
  const { data, error } = await client.rpc(rpcName, parameters)
  if (error) throw error
  const result = (data as ClaimResult[] | null)?.[0]
  if (!result) throw new Error('claim RPC returned no row')
  return result
}

async function complete(
  client: SupabaseClient,
  reactionKey: string,
  instanceId: string,
  messages: Array<{ player_id: string; text: string }>,
): Promise<CompleteResult> {
  const engine = engineByInstance.get(instanceId)
  if (!engine) throw new Error('completion instance has no recorded engine')
  const rpcName = engine === 'browser'
    ? 'complete_browser_companion_reaction_authorized'
    : 'complete_companion_reaction'
  const { data, error } = await client.rpc(rpcName, {
    p_room_id: roomId,
    p_reaction_key: reactionKey,
    p_instance_id: instanceId,
    p_messages: messages,
    ...(engine === 'browser' ? { p_operator_capability: operatorCapability } : {}),
  })
  if (error) throw error
  const result = (data as CompleteResult[] | null)?.[0]
  if (!result) throw new Error('complete RPC returned no row')
  return result
}

async function release(
  client: SupabaseClient,
  reactionKey: string,
  instanceId: string,
): Promise<boolean> {
  const engine = engineByInstance.get(instanceId)
  if (!engine) throw new Error('release instance has no recorded engine')
  const rpcName = engine === 'browser'
    ? 'release_browser_companion_reaction_authorized'
    : 'release_companion_reaction'
  const { data, error } = await client.rpc(rpcName, {
    p_room_id: roomId,
    p_reaction_key: reactionKey,
    p_instance_id: instanceId,
    ...(engine === 'browser' ? { p_operator_capability: operatorCapability } : {}),
  })
  if (error) throw error
  return data === true
}

async function schedule(
  client: SupabaseClient,
  reactionKey: string,
  instanceId: string,
  messages: Array<{ player_id: string; text: string; delay_seconds: number }>,
): Promise<ScheduleResult> {
  const engine = engineByInstance.get(instanceId)
  if (!engine) throw new Error('schedule instance has no recorded engine')
  const rpcName = engine === 'browser'
    ? 'schedule_browser_companion_reaction_authorized'
    : 'schedule_staggered_companion_reaction'
  const { data, error } = await client.rpc(rpcName, {
    p_room_id: roomId,
    p_reaction_key: reactionKey,
    p_instance_id: instanceId,
    p_messages: messages,
    ...(engine === 'browser' ? { p_operator_capability: operatorCapability } : {}),
  })
  if (error) throw error
  const result = (data as ScheduleResult[] | null)?.[0]
  if (!result) throw new Error('staggered schedule RPC returned no row')
  return result
}

async function deliver(client: SupabaseClient): Promise<DeliveryResult> {
  const { data, error } = await client.rpc('deliver_due_companion_reactions', {
    p_room_id: roomId,
    p_limit: 20,
  })
  if (error) throw error
  const result = (data as DeliveryResult[] | null)?.[0]
  if (!result) throw new Error('due delivery RPC returned no row')
  return result
}

try {
  const { data: created, error: roomError } = await browser.rpc('create_room_with_host', {
    p_code: `CRX${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
    p_name: 'Welcome Player',
    p_avatar_id: 'stark',
    p_color: 'slate',
  })
  if (roomError) throw roomError
  const room = created.room
  const welcomePlayer = created.player
  roomId = room.id
  operatorCapability = String(created.operator_capability)
  const { error: liveError } = await service.from('rooms')
    .update({ phase: 'live' }).eq('id', roomId)
  if (liveError) throw liveError

  const { data: spotlightCategory, error: spotlightCategoryError } = await service
    .from('categories')
    .select('id,name,tier,points,display_order,winner_id,announced_at')
    .eq('show_pack_id', room.show_pack_id)
    .order('display_order')
    .limit(1)
    .single()
  if (spotlightCategoryError) throw spotlightCategoryError
  const spotlightCategoryRecord = { ...spotlightCategory, tie_winner_id: null }
  const { data: firstSpotlight, error: firstSpotlightError } = await service
    .from('rooms')
    .update({ active_spotlight_category_id: spotlightCategory.id })
    .eq('id', roomId)
    .select('active_spotlight_category_id,spotlight_revision,spotlight_opened_at')
    .single()
  if (firstSpotlightError) throw firstSpotlightError
  const { data: closedSpotlight, error: closedSpotlightError } = await service
    .from('rooms')
    .update({ active_spotlight_category_id: null })
    .eq('id', roomId)
    .select('active_spotlight_category_id,spotlight_revision,spotlight_opened_at')
    .single()
  if (closedSpotlightError) throw closedSpotlightError
  const { data: reopenedSpotlight, error: reopenedSpotlightError } = await service
    .from('rooms')
    .update({ active_spotlight_category_id: spotlightCategory.id })
    .eq('id', roomId)
    .select('active_spotlight_category_id,spotlight_revision,spotlight_opened_at')
    .single()
  if (reopenedSpotlightError) throw reopenedSpotlightError
  check((room.spotlight_revision ?? 0) === 0 && room.spotlight_opened_at == null &&
      firstSpotlight.spotlight_revision === 1 && firstSpotlight.spotlight_opened_at != null &&
      closedSpotlight.spotlight_revision === 1 &&
      closedSpotlight.spotlight_opened_at === firstSpotlight.spotlight_opened_at &&
      reopenedSpotlight.spotlight_revision === 2 && reopenedSpotlight.spotlight_opened_at != null &&
      reopenedSpotlight.spotlight_opened_at > firstSpotlight.spotlight_opened_at,
    'the database revisions every non-null spotlight opening while a close preserves its receipt')
  const spotlightTamper = await browser.from('rooms')
    .update({ spotlight_revision: 99 })
    .eq('id', roomId)
  check(spotlightTamper.error != null,
    'an ordinary client cannot author spotlight transition metadata directly')

  const browserId = randomUUID()
  const daemonId = randomUUID()
  const triggerId = randomUUID()
  const mentionKey = buildCompanionReactionKey(triggerId, 'mention', 'tyrion')

  const concurrent = await Promise.all([
    claim(browser, mentionKey, browserId, 'browser'),
    claim(daemon, mentionKey, daemonId, 'daemon'),
  ])
  check(concurrent.filter((result) => result.claimed).length === 1,
    'concurrent browser and daemon claims elect exactly one engine')
  const winnerId = concurrent[0].claimed ? browserId : daemonId
  const loserId = concurrent[0].claimed ? daemonId : browserId
  const winnerClient = concurrent[0].claimed ? browser : daemon
  const loserClient = concurrent[0].claimed ? daemon : browser

  const loserCompletion = await complete(loserClient, mentionKey, loserId, [
    { player_id: 'tyrion', text: 'The losing engine must not speak.' },
  ])
  check(!loserCompletion.completed && loserCompletion.output_message_ids.length === 0,
    'a losing engine cannot complete another engine’s claim')

  const winnerCompletion = await complete(winnerClient, mentionKey, winnerId, [
    { player_id: 'tyrion', text: 'First claimed answer.' },
    { player_id: 'olenna', text: 'Second message in the same atomic answer.' },
  ])
  check(winnerCompletion.completed && winnerCompletion.output_message_ids.length === 2,
    'the winning engine atomically inserts and receipts every output message')
  const { data: completedMessages, error: completedMessagesError } = await service
    .from('messages').select('id,text,player_id').in('id', winnerCompletion.output_message_ids)
  if (completedMessagesError) throw completedMessagesError
  check(completedMessages?.length === 2,
    'the completion receipt names the two durable chat rows')
  const enteredCompanions = new Set(selectSpokenCompanionIds(
    (completedMessages ?? []).map((message) => message.player_id),
  ))
  check(enteredCompanions.size === 2 &&
      enteredCompanions.has('tyrion') && enteredCompanions.has('olenna'),
    'durable chat authors expose only companions who have already entered')

  const rollbackKey = buildCompanionReactionKey(randomUUID(), 'mention', 'arya')
  const rollbackOwner = randomUUID()
  const rollbackText = `must roll back ${randomUUID()}`
  check((await claim(browser, rollbackKey, rollbackOwner, 'browser')).claimed,
    'an engine can claim work for malformed-batch rollback proof')
  let malformedRejected = false
  try {
    await complete(browser, rollbackKey, rollbackOwner, [
      { player_id: 'arya', text: rollbackText },
      { player_id: 'arya', text: '   ' },
    ])
  } catch {
    malformedRejected = true
  }
  check(malformedRejected,
    'completion rejects a malformed later message')
  const { count: rollbackMessageCount, error: rollbackMessageError } = await service
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('room_id', roomId)
    .eq('text', rollbackText)
  if (rollbackMessageError) throw rollbackMessageError
  check(rollbackMessageCount === 0,
    'a malformed later message rolls back every earlier insert in the batch')
  check(await release(browser, rollbackKey, rollbackOwner),
    'the owner can release a claim retained after rejected completion')

  const completedClaim = await claim(browser, mentionKey, randomUUID(), 'browser')
  check(!completedClaim.claimed && completedClaim.active_completed_at != null,
    'completed reaction work can never be reclaimed')

  const groundedChatKey = buildCompanionReactionKey(randomUUID(), 'mention', 'tyrion')
  const groundedChatOwner = randomUUID()
  const rejectedChatText = `The dragon died ${randomUUID()}`
  const correctedChatText = `You said it died. I would wait for the record. ${randomUUID()}`
  check((await claim(browser, groundedChatKey, groundedChatOwner, 'browser')).claimed,
    'a direct chat reply is claimed before grounded model work')
  const chatPrompt = buildChatReactivePrompt(
    'tyrion',
    { playerName: 'Grounding Player', text: 'The dragon definitely died.' },
    [],
    { leaderboard: [], announcedCount: 3 },
    'mention',
  )
  const groundedChat = await groundedCompanionBatch({
    system: chatPrompt.system,
    user: chatPrompt.user,
    facts: chatPrompt.groundingFacts,
    model: 'claude-haiku-4-5',
    maxTokens: 200,
    maxRetries: 1,
    expectedCompanionIds: ['tyrion'],
    allowEmptyBatch: true,
    caller: async (request) => {
      if (request.system.includes('strict factual auditor')) {
        return request.user.includes(rejectedChatText)
          ? '{"violations":["Promoted a player claim into a broadcast fact."]}'
          : '{"violations":[]}'
      }
      const text = request.user.includes('PREVIOUS BATCH REJECTED')
        ? correctedChatText
        : rejectedChatText
      return JSON.stringify({
        messages: [{ companion_id: 'tyrion', text, delay_seconds: 0 }],
      })
    },
  })
  check(groundedChat.attempts === 2 && groundedChat.findings.length === 0 &&
      groundedChat.messages[0]?.companion_id === 'tyrion',
    'a speculative direct reply retries and clears only as the requested speaker')
  check((await complete(browser, groundedChatKey, groundedChatOwner,
    groundedChat.messages.map((message) => ({
      player_id: message.companion_id,
      text: message.text,
    })))).completed,
  'the grounded direct reply completes through the atomic claim receipt')
  const { data: groundedChatRows, error: groundedChatRowsError } = await service
    .from('messages').select('text').eq('room_id', roomId)
    .in('text', [rejectedChatText, correctedChatText])
  if (groundedChatRowsError) throw groundedChatRowsError
  check(groundedChatRows?.length === 1 && groundedChatRows[0].text === correctedChatText,
    'only the audited direct reply enters durable chat')

  const banterTriggerId = randomUUID()
  const groundedBanterKey = buildCompanionReactionKey(banterTriggerId, 'banter', 'cersei')
  const groundedBanterOwner = randomUUID()
  const rejectedBanterText = `The dragon is dead, as Tyrion said. ${randomUUID()}`
  const correctedBanterText = `You said it was dead. Even your guesses arrive drunk. ${randomUUID()}`
  check((await claim(browser, groundedBanterKey, groundedBanterOwner, 'browser')).claimed,
    'a banter reply is claimed before grounded model work')
  const banterPrompt = buildBanterPrompt(
    'cersei',
    { messageId: banterTriggerId, companionId: 'tyrion', text: 'The dragon is dead.' },
    [{
      id: banterTriggerId,
      room_id: room.id,
      player_id: 'tyrion',
      text: 'The dragon is dead.',
      created_at: '2026-08-11T00:00:00Z',
    }],
    { leaderboard: [], announcedCount: 3 },
  )
  const groundedBanter = await groundedCompanionBatch({
    system: banterPrompt.system,
    user: banterPrompt.user,
    facts: banterPrompt.groundingFacts,
    model: 'claude-haiku-4-5',
    maxTokens: 200,
    maxRetries: 1,
    expectedCompanionIds: ['cersei'],
    allowEmptyBatch: true,
    caller: async (request) => {
      if (request.system.includes('strict factual auditor')) {
        return request.user.includes(rejectedBanterText)
          ? '{"violations":["Promoted another companion claim into a broadcast fact."]}'
          : '{"violations":[]}'
      }
      const text = request.user.includes('PREVIOUS BATCH REJECTED')
        ? correctedBanterText
        : rejectedBanterText
      return JSON.stringify({
        messages: [{ companion_id: 'cersei', text, delay_seconds: 0 }],
      })
    },
  })
  check(groundedBanter.attempts === 2 && groundedBanter.findings.length === 0 &&
      groundedBanter.messages[0]?.companion_id === 'cersei',
    'speculative banter retries and clears only as the selected responder')
  check((await complete(browser, groundedBanterKey, groundedBanterOwner,
    groundedBanter.messages.map((message) => ({
      player_id: message.companion_id,
      text: message.text,
    })))).completed,
  'the grounded banter reply completes through the atomic claim receipt')
  const { data: groundedBanterRows, error: groundedBanterRowsError } = await service
    .from('messages').select('text').eq('room_id', roomId)
    .in('text', [rejectedBanterText, correctedBanterText])
  if (groundedBanterRowsError) throw groundedBanterRowsError
  check(groundedBanterRows?.length === 1 && groundedBanterRows[0].text === correctedBanterText,
    'only the audited banter reply enters durable chat')

  const directWelcome = await browser.from('players')
    .update({ welcomed_at: new Date().toISOString() })
    .eq('id', welcomePlayer.id)
  check(directWelcome.error?.message.includes('authorized command') === true,
    'an ordinary browser cannot consume a player welcome slot directly')
  const welcomeClaims = await Promise.all([
    browser.rpc('claim_player_welcome_authorized_v2', {
      p_room_id: roomId,
      p_actor_player_id: welcomePlayer.id,
      p_target_player_id: welcomePlayer.id,
      p_operator_capability: operatorCapability,
    }),
    browser.rpc('claim_player_welcome_authorized_v2', {
      p_room_id: roomId,
      p_actor_player_id: welcomePlayer.id,
      p_target_player_id: welcomePlayer.id,
      p_operator_capability: operatorCapability,
    }),
  ])
  if (welcomeClaims.some((result) => result.error)) {
    throw welcomeClaims.find((result) => result.error)?.error
  }
  check(welcomeClaims.filter((result) => result.data != null).length === 1,
    'racing host tabs consume one conditional player welcome slot')
  const welcomeOwnerClient = welcomeClaims[0].data ? browser : daemon
  const welcomeOwnerId = randomUUID()
  const welcomeKey = buildWelcomeReactionKey(welcomePlayer.id)
  check((await claim(welcomeOwnerClient, welcomeKey, welcomeOwnerId, 'browser', 300)).claimed,
    'the welcome-slot owner claims the stable per-player output receipt before model work')
  const rejectedWelcomeText = `Welcome. A dragon burned the field for you. ${randomUUID()}`
  const correctedWelcomeText = `Welcome. Your Stark banner and Black allegiance are entered. ${randomUUID()}`
  const welcomePrompt = buildPlayerWelcomePrompt(
    'ned',
    'Welcome Player',
    'black',
    ['Aemond'],
    { name: 'Stark', hook: 'You know the weight of that Northern name.' },
  )
  const groundedWelcome = await groundedCompanionBatch({
    system: welcomePrompt.system,
    user: welcomePrompt.user,
    facts: welcomePrompt.groundingFacts,
    model: 'claude-sonnet-5',
    maxTokens: 400,
    maxRetries: 2,
    expectedCompanionIds: welcomePrompt.expectedCompanionIds,
    caller: async (request) => {
      if (request.system.includes('strict factual auditor')) {
        return request.user.includes(rejectedWelcomeText)
          ? '{"violations":["Invented a dragon burning the field."]}'
          : '{"violations":[]}'
      }
      const text = request.user.includes('PREVIOUS BATCH REJECTED')
        ? correctedWelcomeText
        : rejectedWelcomeText
      return JSON.stringify({
        messages: [{ companion_id: 'ned', text, delay_seconds: 0 }],
      })
    },
  })
  check(groundedWelcome.attempts === 2 && groundedWelcome.findings.length === 0 &&
      groundedWelcome.messages[0]?.companion_id === 'ned',
    'invented welcome screen detail retries and clears only as the selected greeter')
  check((await schedule(
    welcomeOwnerClient,
    welcomeKey,
    welcomeOwnerId,
    groundedWelcome.messages.map((message) => ({
      player_id: message.companion_id,
      text: message.text,
      delay_seconds: message.delay_seconds,
    })),
  )).completed, 'the grounded welcome atomically completes its durable output receipt')
  const { data: welcomeRows, error: welcomeRowsError } = await service
    .from('messages').select('text').eq('room_id', roomId)
    .in('text', [rejectedWelcomeText, correctedWelcomeText])
  if (welcomeRowsError) throw welcomeRowsError
  check(welcomeRows?.length === 1 && welcomeRows[0].text === correctedWelcomeText,
    'only the audited welcome enters durable chat')
  check(!(await claim(daemon, welcomeKey, randomUUID(), 'browser')).claimed,
    'a completed welcome cannot be regenerated by another host tab')

  const teamTransitions: Array<{
    team: 'black' | 'green'
    previous_team: 'black' | 'green' | null
    team_revision: number
  }> = []
  for (const team of ['black', 'green', 'black'] as const) {
    const { data, error } = await browser.rpc('set_player_allegiance', {
      p_room_id: roomId,
      p_actor_player_id: welcomePlayer.id,
      p_team: team,
    })
    if (error) throw error
    teamTransitions.push(data as typeof teamTransitions[number])
  }
  check(teamTransitions.length === 3 &&
      teamTransitions[0].team === 'black' &&
      teamTransitions[0].previous_team == null &&
      teamTransitions[0].team_revision === 1 &&
      teamTransitions[1].team === 'green' &&
      teamTransitions[1].previous_team === 'black' &&
      teamTransitions[1].team_revision === 2 &&
      teamTransitions[2].team === 'black' &&
      teamTransitions[2].previous_team === 'green' &&
      teamTransitions[2].team_revision === 3,
  'the database assigns a monotonic identity and prior side to every repeated transition')
  const directTeam = await browser.from('players')
    .update({ team: 'green' }).eq('id', welcomePlayer.id)
  check(directTeam.error?.message.includes('authorized command') === true,
    'an ordinary browser cannot forge another seat allegiance transition directly')
  const revisionTamper = await browser.from('players')
    .update({ team_revision: 99 })
    .eq('id', welcomePlayer.id)
  check(revisionTamper.error != null,
    'an ordinary client cannot author team transition metadata directly')

  const teamAnnouncementKey = buildTeamChangeReactionKey(
    welcomePlayer.id,
    3,
    'announcement',
  )
  const teamAnnouncementBrowser = randomUUID()
  const teamAnnouncementDaemon = randomUUID()
  const teamAnnouncementClaims = await Promise.all([
    claim(browser, teamAnnouncementKey, teamAnnouncementBrowser, 'browser'),
    claim(daemon, teamAnnouncementKey, teamAnnouncementDaemon, 'browser'),
  ])
  check(teamAnnouncementClaims.filter((result) => result.claimed).length === 1,
    'racing host tabs elect one owner for the revisioned team announcement')
  const teamAnnouncementOwner = teamAnnouncementClaims[0].claimed
    ? teamAnnouncementBrowser
    : teamAnnouncementDaemon
  const teamAnnouncementClient = teamAnnouncementClaims[0].claimed ? browser : daemon
  const teamAnnouncementText = `Welcome Player defects to Team Black ${randomUUID()}`
  check((await complete(
    teamAnnouncementClient,
    teamAnnouncementKey,
    teamAnnouncementOwner,
    [{ player_id: 'system', text: teamAnnouncementText }],
  )).completed, 'the winning host tab atomically publishes the team announcement')

  const teamReactionKey = buildTeamChangeReactionKey(welcomePlayer.id, 3, 'reaction')
  const teamReactionBrowser = randomUUID()
  const teamReactionDaemon = randomUUID()
  const teamReactionClaims = await Promise.all([
    claim(browser, teamReactionKey, teamReactionBrowser, 'browser', 300),
    claim(daemon, teamReactionKey, teamReactionDaemon, 'browser', 300),
  ])
  check(teamReactionClaims.filter((result) => result.claimed).length === 1,
    'racing host tabs elect one owner before grounded team-change model work')
  const teamReactionOwner = teamReactionClaims[0].claimed
    ? teamReactionBrowser
    : teamReactionDaemon
  const teamReactionClient = teamReactionClaims[0].claimed ? browser : daemon
  const rejectedTeamText = `You changed sides because a dragon burned the field. ${randomUUID()}`
  const correctedTeamText = `Your third allegiance revision returns you to the Blacks. ${randomUUID()}`
  const teamPrompt = buildTeamChangePrompt(
    'cersei',
    'Welcome Player',
    'green',
    'black',
    3,
    ['Aemond'],
  )
  const groundedTeam = await groundedCompanionBatch({
    system: teamPrompt.system,
    user: teamPrompt.user,
    facts: teamPrompt.groundingFacts,
    model: 'claude-sonnet-5',
    maxTokens: 400,
    maxRetries: 2,
    expectedCompanionIds: teamPrompt.expectedCompanionIds,
    caller: async (request) => {
      if (request.system.includes('strict factual auditor')) {
        return request.user.includes(rejectedTeamText)
          ? '{"violations":["Invented a broadcast event and motive for the defection."]}'
          : '{"violations":[]}'
      }
      const text = request.user.includes('PREVIOUS BATCH REJECTED')
        ? correctedTeamText
        : rejectedTeamText
      return JSON.stringify({
        messages: [{ companion_id: 'cersei', text, delay_seconds: 0 }],
      })
    },
  })
  check(groundedTeam.attempts === 2 && groundedTeam.findings.length === 0 &&
      groundedTeam.messages[0]?.companion_id === 'cersei',
    'invented team-change motive retries and clears only as the selected greeter')
  check((await schedule(
    teamReactionClient,
    teamReactionKey,
    teamReactionOwner,
    groundedTeam.messages.map((message) => ({
      player_id: message.companion_id,
      text: message.text,
      delay_seconds: message.delay_seconds,
    })),
  )).completed, 'the grounded team reaction atomically completes its durable output receipt')
  const { data: teamRows, error: teamRowsError } = await service
    .from('messages').select('text').eq('room_id', roomId)
    .in('text', [teamAnnouncementText, rejectedTeamText, correctedTeamText])
  if (teamRowsError) throw teamRowsError
  check(teamRows?.length === 2 &&
      teamRows.some((row) => row.text === teamAnnouncementText) &&
      teamRows.some((row) => row.text === correctedTeamText),
    'one announcement and only the audited team reaction enter durable chat')

  const preShowKey = buildPreShowArrivalReactionKey('olenna')
  const preShowBrowser = randomUUID()
  const preShowOtherTab = randomUUID()
  const preShowClaims = await Promise.all([
    claim(browser, preShowKey, preShowBrowser, 'browser', 300),
    claim(daemon, preShowKey, preShowOtherTab, 'browser', 300),
  ])
  check(preShowClaims.filter((result) => result.claimed).length === 1,
    'racing host tabs elect one owner before a grounded pre-show arrival')
  const preShowOwner = preShowClaims[0].claimed ? preShowBrowser : preShowOtherTab
  const preShowLoser = preShowClaims[0].claimed ? preShowOtherTab : preShowBrowser
  const preShowOwnerClient = preShowClaims[0].claimed ? browser : daemon
  const preShowLoserClient = preShowClaims[0].claimed ? daemon : browser
  const rejectedPreShowText = `A dragon has appeared on screen. ${randomUUID()}`
  const correctedPreShowText = `I am here to judge foolishness when the record supplies it. ${randomUUID()}`
  const preShowPrompt = buildPreCeremonyPrompt(
    'olenna',
    [{
      id: welcomePlayer.id, room_id: room.id, name: 'Welcome Player', avatar_id: 'stark',
      color: 'slate', is_host: false, created_at: new Date().toISOString(), team: 'black',
    }],
    [],
    [],
    [{ player_id: 'ned', text: 'The room is waiting.' }],
  )
  const groundedPreShow = await groundedCompanionBatch({
    system: preShowPrompt.system,
    user: preShowPrompt.user,
    facts: preShowPrompt.groundingFacts,
    model: 'claude-sonnet-5',
    maxTokens: 700,
    maxRetries: 2,
    expectedCompanionIds: preShowPrompt.expectedCompanionIds,
    expectedDelaySeconds: preShowPrompt.expectedDelaySeconds,
    caller: async (request) => {
      if (request.system.includes('strict factual auditor')) {
        return request.user.includes(rejectedPreShowText)
          ? '{"violations":["Invented a dragon appearing before playback began."]}'
          : '{"violations":[]}'
      }
      return JSON.stringify({
        messages: [{
          companion_id: 'olenna',
          text: request.user.includes('PREVIOUS BATCH REJECTED')
            ? correctedPreShowText
            : rejectedPreShowText,
          delay_seconds: 0,
        }],
      })
    },
  })
  check(groundedPreShow.attempts === 2 && groundedPreShow.findings.length === 0 &&
      groundedPreShow.messages[0]?.companion_id === 'olenna',
    'invented pre-show screen detail retries and clears only as the authored arrival')
  const preShowPlan = groundedPreShow.messages.map((message) => ({
    player_id: message.companion_id,
    text: message.text,
    delay_seconds: message.delay_seconds,
  }))
  check(!(await schedule(
    preShowLoserClient,
    preShowKey,
    preShowLoser,
    preShowPlan,
  )).completed, 'the losing host tab cannot publish the grounded pre-show arrival')
  check((await schedule(
    preShowOwnerClient,
    preShowKey,
    preShowOwner,
    preShowPlan,
  )).completed, 'the winning host tab atomically publishes the grounded pre-show arrival')
  const { data: preShowRows, error: preShowRowsError } = await service
    .from('messages').select('text').eq('room_id', roomId)
    .in('text', [rejectedPreShowText, correctedPreShowText])
  if (preShowRowsError) throw preShowRowsError
  check(preShowRows?.length === 1 && preShowRows[0].text === correctedPreShowText,
    'only the audited pre-show arrival enters durable chat')
  check(!(await claim(browser, preShowKey, randomUUID(), 'browser')).claimed,
    'a completed pre-show arrival cannot be regenerated after host reload')

  const spotlightRevision = reopenedSpotlight.spotlight_revision as number
  const spotlightAnnouncementKey = buildSpotlightReactionKey(spotlightRevision, 'announcement')
  const spotlightAnnouncementBrowser = randomUUID()
  const spotlightAnnouncementOtherTab = randomUUID()
  const spotlightAnnouncementClaims = await Promise.all([
    claim(browser, spotlightAnnouncementKey, spotlightAnnouncementBrowser, 'browser'),
    claim(daemon, spotlightAnnouncementKey, spotlightAnnouncementOtherTab, 'browser'),
  ])
  check(spotlightAnnouncementClaims.filter((result) => result.claimed).length === 1,
    'racing host tabs elect one owner for a revisioned spotlight divider')
  const spotlightAnnouncementOwner = spotlightAnnouncementClaims[0].claimed
    ? spotlightAnnouncementBrowser
    : spotlightAnnouncementOtherTab
  const spotlightAnnouncementClient = spotlightAnnouncementClaims[0].claimed ? browser : daemon
  const spotlightAnnouncementText = `Spotlight ${randomUUID()}`
  check((await complete(
    spotlightAnnouncementClient,
    spotlightAnnouncementKey,
    spotlightAnnouncementOwner,
    [{ player_id: 'system', text: spotlightAnnouncementText }],
  )).completed, 'the winning host tab atomically publishes the revisioned spotlight divider')

  const spotlightReactionKey = buildSpotlightReactionKey(spotlightRevision, 'reaction')
  const spotlightReactionBrowser = randomUUID()
  const spotlightReactionOtherTab = randomUUID()
  const spotlightReactionClaims = await Promise.all([
    claim(browser, spotlightReactionKey, spotlightReactionBrowser, 'browser', 300),
    claim(daemon, spotlightReactionKey, spotlightReactionOtherTab, 'browser', 300),
  ])
  check(spotlightReactionClaims.filter((result) => result.claimed).length === 1,
    'racing host tabs elect one owner before grounded spotlight model work')
  const spotlightReactionOwner = spotlightReactionClaims[0].claimed
    ? spotlightReactionBrowser
    : spotlightReactionOtherTab
  const spotlightReactionLoser = spotlightReactionClaims[0].claimed
    ? spotlightReactionOtherTab
    : spotlightReactionBrowser
  const spotlightReactionClient = spotlightReactionClaims[0].claimed ? browser : daemon
  const spotlightReactionLoserClient = spotlightReactionClaims[0].claimed ? daemon : browser
  const rejectedSpotlightText = `The dragon has fallen on screen. ${randomUUID()}`
  const correctedSpotlightTexts = [
    `The room's next question is open. ${randomUUID()}`,
    `A wager is not a verdict, however dearly bought. ${randomUUID()}`,
  ]
  const spotlightNominee = {
    id: 'spotlight-nominee',
    name: 'Aemond',
    type: 'person' as const,
    film_name: '',
    image_url: '',
  }
  const spotlightPrompt = buildPreCategoryPrompt(
    spotlightCategoryRecord,
    spotlightRevision,
    [spotlightNominee],
    [{
      id: 'spotlight-pick', room_id: room.id, player_id: welcomePlayer.id,
      category_id: spotlightCategory.id, nominee_id: spotlightNominee.id,
      confidence: 9, is_correct: null, created_at: new Date().toISOString(),
    }],
    [{
      id: welcomePlayer.id, room_id: room.id, name: 'Welcome Player', avatar_id: 'stark',
      color: 'slate', is_host: false, created_at: new Date().toISOString(),
    }],
  )
  const groundedSpotlight = await groundedCompanionBatch({
    system: spotlightPrompt.system,
    user: spotlightPrompt.user,
    facts: spotlightPrompt.groundingFacts,
    model: 'claude-sonnet-5',
    maxTokens: 700,
    maxRetries: 2,
    expectedCompanionIds: spotlightPrompt.expectedCompanionIds,
    expectedDelaySeconds: spotlightPrompt.expectedDelaySeconds,
    caller: async (request) => {
      if (request.system.includes('strict factual auditor')) {
        return request.user.includes(rejectedSpotlightText)
          ? '{"violations":["Promoted the spotlight label into a screen event."]}'
          : '{"violations":[]}'
      }
      const texts = request.user.includes('PREVIOUS BATCH REJECTED')
        ? correctedSpotlightTexts
        : [rejectedSpotlightText, correctedSpotlightTexts[1]]
      return JSON.stringify({
        messages: ['ned', 'cersei'].map((companion_id, index) => ({
          companion_id,
          text: texts[index],
          delay_seconds: spotlightPrompt.expectedDelaySeconds[index],
        })),
      })
    },
  })
  check(groundedSpotlight.attempts === 2 && groundedSpotlight.findings.length === 0 &&
      groundedSpotlight.messages.map((message) => message.companion_id).join(',') === 'ned,cersei',
    'a spotlight-label hallucination retries into the exact Ned and Cersei roster')
  const spotlightPlan = groundedSpotlight.messages.map((message, index) => ({
    player_id: message.companion_id,
    text: message.text,
    delay_seconds: index,
  }))
  check(!(await schedule(
    spotlightReactionLoserClient,
    spotlightReactionKey,
    spotlightReactionLoser,
    spotlightPlan,
  )).completed, 'the losing host tab cannot publish the grounded spotlight batch')
  check((await schedule(
    spotlightReactionClient,
    spotlightReactionKey,
    spotlightReactionOwner,
    spotlightPlan,
  )).completed, 'the winning host tab seals the grounded spotlight schedule')
  await new Promise((resolve) => setTimeout(resolve, 1_100))
  await deliver(browser)
  const { data: spotlightRows, error: spotlightRowsError } = await service
    .from('messages').select('text').eq('room_id', roomId)
    .in('text', [spotlightAnnouncementText, rejectedSpotlightText, ...correctedSpotlightTexts])
  if (spotlightRowsError) throw spotlightRowsError
  check(spotlightRows?.length === 3 &&
      spotlightRows.some((row) => row.text === spotlightAnnouncementText) &&
      correctedSpotlightTexts.every((text) => spotlightRows.some((row) => row.text === text)),
    'one divider and only the two audited spotlight lines enter durable chat')
  check(!(await claim(browser, spotlightReactionKey, randomUUID(), 'browser')).claimed,
    'a completed spotlight opening cannot regenerate after host reload')

  const showAnnouncementKey = buildShowStartedReactionKey('announcement')
  const showAnnouncementBrowser = randomUUID()
  const showAnnouncementOtherTab = randomUUID()
  const showAnnouncementClaims = await Promise.all([
    claim(browser, showAnnouncementKey, showAnnouncementBrowser, 'browser'),
    claim(daemon, showAnnouncementKey, showAnnouncementOtherTab, 'browser'),
  ])
  check(showAnnouncementClaims.filter((result) => result.claimed).length === 1,
    'racing host tabs elect one owner for the show-start divider')
  const showAnnouncementOwner = showAnnouncementClaims[0].claimed
    ? showAnnouncementBrowser
    : showAnnouncementOtherTab
  const showAnnouncementClient = showAnnouncementClaims[0].claimed ? browser : daemon
  const showAnnouncementText = `Show Started ${randomUUID()}`
  check((await complete(
    showAnnouncementClient,
    showAnnouncementKey,
    showAnnouncementOwner,
    [{ player_id: 'system', text: showAnnouncementText }],
  )).completed, 'the winning host tab atomically publishes the show-start divider')

  const showReactionKey = buildShowStartedReactionKey('reaction')
  const showReactionBrowser = randomUUID()
  const showReactionOtherTab = randomUUID()
  const showReactionClaims = await Promise.all([
    claim(browser, showReactionKey, showReactionBrowser, 'browser', 300),
    claim(daemon, showReactionKey, showReactionOtherTab, 'browser', 300),
  ])
  check(showReactionClaims.filter((result) => result.claimed).length === 1,
    'racing host tabs elect one owner before grounded show-start model work')
  const showReactionOwner = showReactionClaims[0].claimed
    ? showReactionBrowser
    : showReactionOtherTab
  const showReactionLoser = showReactionClaims[0].claimed
    ? showReactionOtherTab
    : showReactionBrowser
  const showReactionClient = showReactionClaims[0].claimed ? browser : daemon
  const showReactionLoserClient = showReactionClaims[0].claimed ? daemon : browser
  const rejectedShowText = `The dragon appears on screen. ${randomUUID()}`
  const correctedShowTexts = [
    `The watch has begun; the record is open. ${randomUUID()}`,
    `Ready. ${randomUUID()}`,
    `At last, you may all watch me choose a side. ${randomUUID()}`,
    `The watch began. His noise did not improve it. ${randomUUID()}`,
  ]
  const showPrompt = buildShowStartedPrompt([{
    id: welcomePlayer.id,
    room_id: room.id,
    name: 'Welcome Player',
    avatar_id: 'stark',
    color: 'slate',
    is_host: false,
    created_at: new Date().toISOString(),
  }])
  const groundedShow = await groundedCompanionBatch({
    system: showPrompt.system,
    user: showPrompt.user,
    facts: showPrompt.groundingFacts,
    model: 'claude-sonnet-5',
    maxTokens: 1000,
    maxRetries: 2,
    expectedCompanionIds: showPrompt.expectedCompanionIds,
    expectedDelaySeconds: showPrompt.expectedDelaySeconds,
    caller: async (request) => {
      if (request.system.includes('strict factual auditor')) {
        return request.user.includes(rejectedShowText)
          ? '{"violations":["Invented a dragon appearing after the playback transition."]}'
          : '{"violations":[]}'
      }
      const texts = request.user.includes('PREVIOUS BATCH REJECTED')
        ? correctedShowTexts
        : [rejectedShowText, ...correctedShowTexts.slice(1)]
      return JSON.stringify({
        messages: ['ned', 'arya', 'joffrey', 'olenna'].map((companion_id, index) => ({
          companion_id,
          text: texts[index],
          delay_seconds: showPrompt.expectedDelaySeconds[index],
        })),
      })
    },
  })
  check(groundedShow.attempts === 2 && groundedShow.findings.length === 0 &&
      groundedShow.messages.map((message) => message.companion_id).join(',') ===
        'ned,arya,joffrey,olenna',
  'invented show-start screen detail retries into the exact four-speaker roster')
  // The grounding check above proves the authored 0/9/26/36 cadence. Compress
  // only this disposable proof's database delivery so the dogfood stays fast;
  // the browser schedules the cleared messages without this test-only mapping.
  const showPlan = groundedShow.messages.map((message, index) => ({
    player_id: message.companion_id,
    text: message.text,
    delay_seconds: index,
  }))
  check(!(await schedule(
    showReactionLoserClient,
    showReactionKey,
    showReactionLoser,
    showPlan,
  )).completed, 'the losing host tab cannot publish the grounded show-start batch')
  check((await schedule(
    showReactionClient,
    showReactionKey,
    showReactionOwner,
    showPlan,
  )).completed, 'the winning host tab seals the grounded show-start schedule')
  await new Promise((resolve) => setTimeout(resolve, 3_100))
  await deliver(browser)
  const { data: showRows, error: showRowsError } = await service
    .from('messages').select('text').eq('room_id', roomId)
    .in('text', [showAnnouncementText, rejectedShowText, ...correctedShowTexts])
  if (showRowsError) throw showRowsError
  check(showRows?.length === 5 &&
      showRows.some((row) => row.text === showAnnouncementText) &&
      correctedShowTexts.every((text) => showRows.some((row) => row.text === text)),
  'one divider and only the four audited show-start lines enter durable chat')
  check(!(await claim(browser, showReactionKey, randomUUID(), 'browser')).claimed,
    'a completed show-start batch cannot be regenerated after host reload')

  const postShowKey = buildPostShowReactionKey('reaction')
  const postShowBrowser = randomUUID()
  const postShowOtherTab = randomUUID()
  const postShowClaims = await Promise.all([
    claim(browser, postShowKey, postShowBrowser, 'browser', 300),
    claim(daemon, postShowKey, postShowOtherTab, 'browser', 300),
  ])
  check(postShowClaims.filter((result) => result.claimed).length === 1,
    'racing host tabs elect one owner for a full-cast post-show ceremony')
  const postShowOwner = postShowClaims[0].claimed ? postShowBrowser : postShowOtherTab
  const postShowLoser = postShowClaims[0].claimed ? postShowOtherTab : postShowBrowser
  const postShowOwnerClient = postShowClaims[0].claimed ? browser : daemon
  const postShowLoserClient = postShowClaims[0].claimed ? daemon : browser
  const postShowCompanions = ['ned', 'cersei', 'tyrion', 'joffrey', 'daenerys', 'olenna', 'arya']
  const postShowTexts = postShowCompanions
    .map((companionId) => `Full cast ${companionId} ${randomUUID()}`)
  const postShowPlan = postShowTexts.map((text, index) => ({
    player_id: postShowCompanions[index],
    text,
    delay_seconds: index,
  }))
  check(!(await schedule(
    postShowLoserClient,
    postShowKey,
    postShowLoser,
    postShowPlan,
  )).completed, 'the losing host tab cannot seal the full-cast farewell')
  check((await schedule(
    postShowOwnerClient,
    postShowKey,
    postShowOwner,
    postShowPlan,
  )).completed, 'the winning host tab atomically seals all seven farewell lines')
  await new Promise((resolve) => setTimeout(resolve, 6_100))
  await deliver(browser)
  const { data: postShowRows, error: postShowRowsError } = await service
    .from('messages').select('text').eq('room_id', roomId).in('text', postShowTexts)
  if (postShowRowsError) throw postShowRowsError
  check(postShowRows?.length === 7 &&
      postShowTexts.every((text) => postShowRows.some((row) => row.text === text)),
    'the reusable staggered ceremony engine durably delivers the complete seven-line cast')
  check(!(await claim(browser, postShowKey, randomUUID(), 'browser')).claimed,
    'a completed full-cast farewell cannot regenerate after host reload')

  const bingoMarkId = randomUUID()
  const bingoAnnouncementKey = buildBingoReactionKey(bingoMarkId, 'announcement')
  const bingoBrowserOwner = randomUUID()
  const bingoDaemonOwner = randomUUID()
  const bingoAnnouncementClaims = await Promise.all([
    claim(browser, bingoAnnouncementKey, bingoBrowserOwner, 'browser'),
    claim(daemon, bingoAnnouncementKey, bingoDaemonOwner, 'daemon'),
  ])
  check(bingoAnnouncementClaims.filter((result) => result.claimed).length === 1,
    'browser and daemon elect one owner for a bingo announcement')
  const bingoAnnouncementWinnerId = bingoAnnouncementClaims[0].claimed
    ? bingoBrowserOwner
    : bingoDaemonOwner
  const bingoAnnouncementLoserId = bingoAnnouncementClaims[0].claimed
    ? bingoDaemonOwner
    : bingoBrowserOwner
  const bingoAnnouncementWinnerClient = bingoAnnouncementClaims[0].claimed ? browser : daemon
  const bingoAnnouncementLoserClient = bingoAnnouncementClaims[0].claimed ? daemon : browser
  const bingoAnnouncementText = `BINGO proof ${randomUUID()}`
  check(!(await complete(
    bingoAnnouncementLoserClient,
    bingoAnnouncementKey,
    bingoAnnouncementLoserId,
    [{ player_id: 'system', text: bingoAnnouncementText }],
  )).completed, 'the losing engine cannot insert the bingo announcement')
  check((await complete(
    bingoAnnouncementWinnerClient,
    bingoAnnouncementKey,
    bingoAnnouncementWinnerId,
    [{ player_id: 'system', text: bingoAnnouncementText }],
  )).completed, 'the winning engine atomically inserts the bingo announcement')
  const { count: bingoAnnouncementCount, error: bingoAnnouncementError } = await service
    .from('messages').select('id', { count: 'exact', head: true })
    .eq('room_id', roomId).eq('text', bingoAnnouncementText)
  if (bingoAnnouncementError) throw bingoAnnouncementError
  check(bingoAnnouncementCount === 1,
    'one durable bingo announcement survives competing engines')

  const bingoReactionKey = buildBingoReactionKey(bingoMarkId, 'reaction')
  const bingoReactionBrowserOwner = randomUUID()
  const bingoReactionDaemonOwner = randomUUID()
  const bingoReactionClaims = await Promise.all([
    claim(browser, bingoReactionKey, bingoReactionBrowserOwner, 'browser'),
    claim(daemon, bingoReactionKey, bingoReactionDaemonOwner, 'daemon'),
  ])
  check(bingoReactionClaims.filter((result) => result.claimed).length === 1,
    'browser and daemon elect one owner before bingo model work')
  const bingoReactionWinnerId = bingoReactionClaims[0].claimed
    ? bingoReactionBrowserOwner
    : bingoReactionDaemonOwner
  const bingoReactionWinnerClient = bingoReactionClaims[0].claimed ? browser : daemon
  const rejectedBingoText = `The landing burned the field. ${randomUUID()}`
  const correctedBingoText = `A landing, and a line completed. ${randomUUID()}`
  const bingoPrompt = buildBingoReactionPrompt(
    'arya',
    'Bingo Player',
    'A dragon lands.',
    'line',
  )
  const groundedBingo = await groundedCompanionBatch({
    system: bingoPrompt.system,
    user: bingoPrompt.user,
    facts: bingoPrompt.groundingFacts,
    model: 'claude-sonnet-5',
    maxTokens: 400,
    maxRetries: 2,
    expectedCompanionIds: bingoPrompt.expectedCompanionIds,
    allowEmptyBatch: true,
    caller: async (request) => {
      if (request.system.includes('strict factual auditor')) {
        return request.user.includes(rejectedBingoText)
          ? '{"violations":["Invented fire beyond the approved bingo condition."]}'
          : '{"violations":[]}'
      }
      const text = request.user.includes('PREVIOUS BATCH REJECTED')
        ? correctedBingoText
        : rejectedBingoText
      return JSON.stringify({
        messages: [{ companion_id: 'arya', text, delay_seconds: 0 }],
      })
    },
  })
  check(groundedBingo.attempts === 2 && groundedBingo.findings.length === 0 &&
      groundedBingo.messages[0]?.companion_id === 'arya',
    'a bingo reaction retries invented detail and clears only as the selected responder')
  check((await complete(
    bingoReactionWinnerClient,
    bingoReactionKey,
    bingoReactionWinnerId,
    groundedBingo.messages.map((message) => ({
      player_id: message.companion_id,
      text: message.text,
    })),
  )).completed, 'the grounded bingo reply completes through the atomic claim receipt')
  const { data: groundedBingoRows, error: groundedBingoRowsError } = await service
    .from('messages').select('text').eq('room_id', roomId)
    .in('text', [rejectedBingoText, correctedBingoText])
  if (groundedBingoRowsError) throw groundedBingoRowsError
  check(groundedBingoRows?.length === 1 && groundedBingoRows[0].text === correctedBingoText,
    'only the audited bingo reply enters durable chat')

  const milestoneKey = buildMilestoneReactionKey('halfway')
  const milestoneBrowserOne = randomUUID()
  const milestoneBrowserTwo = randomUUID()
  const milestoneClaims = await Promise.all([
    claim(browser, milestoneKey, milestoneBrowserOne, 'browser', 300),
    claim(daemon, milestoneKey, milestoneBrowserTwo, 'browser', 300),
  ])
  check(milestoneClaims.filter((result) => result.claimed).length === 1,
    'racing host tabs elect one owner for the declared-event milestone')
  const milestoneWinnerId = milestoneClaims[0].claimed
    ? milestoneBrowserOne
    : milestoneBrowserTwo
  const milestoneLoserId = milestoneClaims[0].claimed
    ? milestoneBrowserTwo
    : milestoneBrowserOne
  const milestoneWinnerClient = milestoneClaims[0].claimed ? browser : daemon
  const milestoneLoserClient = milestoneClaims[0].claimed ? daemon : browser
  const rejectedMilestoneText = `Six events, and three deaths already. ${randomUUID()}`
  const correctedMilestoneTexts = [
    `Six events are entered in the record. ${randomUUID()}`,
    `An empty board. Even incompetence has declined to lead. ${randomUUID()}`,
    `Six entries and no leader yet. The game is keeping its counsel. ${randomUUID()}`,
  ]
  const milestonePrompt = buildMilestonePrompt('halfway', 6, [])
  const groundedMilestone = await groundedCompanionBatch({
    system: milestonePrompt.system,
    user: milestonePrompt.user,
    facts: milestonePrompt.groundingFacts,
    model: 'claude-sonnet-5',
    maxTokens: 700,
    maxRetries: 2,
    expectedCompanionIds: milestonePrompt.expectedCompanionIds,
    caller: async (request) => {
      if (request.system.includes('strict factual auditor')) {
        return request.user.includes(rejectedMilestoneText)
          ? '{"violations":["Invented three deaths beyond the game record."]}'
          : '{"violations":[]}'
      }
      const texts = request.user.includes('PREVIOUS BATCH REJECTED')
        ? correctedMilestoneTexts
        : [rejectedMilestoneText, correctedMilestoneTexts[1], correctedMilestoneTexts[2]]
      return JSON.stringify({
        messages: ['ned', 'cersei', 'tyrion'].map((companion_id, index) => ({
          companion_id,
          text: texts[index],
          delay_seconds: index,
        })),
      })
    },
  })
  check(groundedMilestone.attempts === 2 && groundedMilestone.findings.length === 0 &&
      groundedMilestone.messages.map((message) => message.companion_id).join(',') ===
        'ned,cersei,tyrion',
    'invented milestone screen detail retries into the exact three-speaker roster')
  const milestonePlan = groundedMilestone.messages.map((message) => ({
    player_id: message.companion_id,
    text: message.text,
    delay_seconds: message.delay_seconds,
  }))
  check(!(await schedule(
    milestoneLoserClient,
    milestoneKey,
    milestoneLoserId,
    milestonePlan,
  )).completed, 'the losing host tab cannot publish the grounded milestone')
  check((await schedule(
    milestoneWinnerClient,
    milestoneKey,
    milestoneWinnerId,
    milestonePlan,
  )).completed, 'the winning host tab seals the grounded milestone schedule')
  await new Promise((resolve) => setTimeout(resolve, 2_100))
  await deliver(browser)
  const { data: milestoneRows, error: milestoneRowsError } = await service
    .from('messages').select('text').eq('room_id', roomId)
    .in('text', [rejectedMilestoneText, ...correctedMilestoneTexts])
  if (milestoneRowsError) throw milestoneRowsError
  check(milestoneRows?.length === 3 &&
      milestoneRows.every((row) => correctedMilestoneTexts.includes(row.text)),
    'only the three audited milestone lines enter durable chat')

  const eventKey = `event:${randomUUID()}:winner`
  const eventBrowserId = randomUUID()
  const eventDaemonId = randomUUID()
  const eventClaims = await Promise.all([
    claim(browser, eventKey, eventBrowserId, 'browser', 300),
    claim(daemon, eventKey, eventDaemonId, 'daemon', 300),
  ])
  check(eventClaims.filter((result) => result.claimed).length === 1,
    'a declared event elects one generation engine before model work')
  const eventWinnerId = eventClaims[0].claimed ? eventBrowserId : eventDaemonId
  const eventLoserId = eventClaims[0].claimed ? eventDaemonId : eventBrowserId
  const eventWinnerClient = eventClaims[0].claimed ? browser : daemon
  const eventLoserClient = eventClaims[0].claimed ? daemon : browser
  const firstEventText = `event first ${randomUUID()}`
  const laterEventText = `event later ${randomUUID()}`
  const eventPlan = [
    { player_id: 'ned', text: firstEventText, delay_seconds: 0 },
    { player_id: 'cersei', text: laterEventText, delay_seconds: 1 },
  ]
  const losingSchedule = await schedule(eventLoserClient, eventKey, eventLoserId, eventPlan)
  check(!losingSchedule.completed && losingSchedule.first_message_id == null,
    'the losing event engine cannot seal or publish the staggered batch')
  const winningSchedule = await schedule(eventWinnerClient, eventKey, eventWinnerId, eventPlan)
  check(winningSchedule.completed && typeof winningSchedule.first_message_id === 'string',
    'the winning event engine atomically seals the plan and inserts its first line')
  const { data: immediateEventRows, error: immediateEventError } = await service
    .from('messages').select('text').eq('room_id', roomId).in('text', [firstEventText, laterEventText])
  if (immediateEventError) throw immediateEventError
  check(immediateEventRows?.length === 1 && immediateEventRows[0].text === firstEventText,
    'a delayed event line is not visible before its due time')
  check((await deliver(browser)).delivered_count === 0,
    'the delivery RPC cannot accelerate a not-yet-due event line')
  await new Promise((resolve) => setTimeout(resolve, 1_100))
  const concurrentDeliveries = await Promise.all([deliver(browser), deliver(daemon)])
  check(concurrentDeliveries.reduce((sum, result) => sum + result.delivered_count, 0) === 1,
    'concurrent browser and daemon flushes insert one due line exactly once')
  const { data: deliveredEventRows, error: deliveredEventError } = await service
    .from('messages').select('text').eq('room_id', roomId).in('text', [firstEventText, laterEventText])
  if (deliveredEventError) throw deliveredEventError
  check(deliveredEventRows?.length === 2,
    'the durable schedule eventually publishes both event lines')
  check((await deliver(browser)).delivered_count === 0,
    'a delivered staggered line remains idempotent on later recovery polls')
  const invalidDeliveryLimit = await browser.rpc('deliver_due_companion_reactions', {
    p_room_id: roomId,
    p_limit: null,
  })
  check(invalidDeliveryLimit.error != null,
    'the public delivery RPC rejects a null limit instead of removing its bound')

  const malformedEventKey = `event:${randomUUID()}:winner`
  const malformedEventOwner = randomUUID()
  const malformedEventFirst = `stagger rollback ${randomUUID()}`
  check((await claim(browser, malformedEventKey, malformedEventOwner, 'browser', 300)).claimed,
    'an engine can claim a malformed stagger rollback proof')
  let malformedEventRejected = false
  try {
    await schedule(browser, malformedEventKey, malformedEventOwner, [
      { player_id: 'ned', text: malformedEventFirst, delay_seconds: 0 },
      { player_id: 'cersei', text: 'Must not persist.', delay_seconds: 0 },
    ])
  } catch {
    malformedEventRejected = true
  }
  check(malformedEventRejected,
    'the stagger scheduler rejects a non-increasing later delay')
  const { count: malformedEventCount, error: malformedEventError } = await service
    .from('messages').select('id', { count: 'exact', head: true })
    .eq('room_id', roomId).eq('text', malformedEventFirst)
  if (malformedEventError) throw malformedEventError
  check(malformedEventCount === 0,
    'a malformed later schedule row rolls back the zero-delay insert')
  check(await release(browser, malformedEventKey, malformedEventOwner),
    'the owner can release a claim retained after rejected stagger scheduling')

  const staleKey = buildCompanionReactionKey(randomUUID(), 'ambient')
  const staleOwner = randomUUID()
  const takeoverOwner = randomUUID()
  check((await claim(browser, staleKey, staleOwner, 'browser', 1)).claimed,
    'the first engine acquires a short fallback lease')
  await new Promise((resolve) => setTimeout(resolve, 1_100))
  check((await claim(daemon, staleKey, takeoverOwner, 'daemon')).claimed,
    'a second engine can take over genuinely stale unfinished work')
  check(!(await complete(browser, staleKey, staleOwner, [
    { player_id: 'cersei', text: 'The stale owner must not speak.' },
  ])).completed, 'the stale owner loses completion authority after takeover')
  check((await complete(daemon, staleKey, takeoverOwner, [
    { player_id: 'cersei', text: 'The takeover owner completes.' },
  ])).completed, 'the takeover owner can complete the recovered reaction')

  const releaseKey = buildCompanionReactionKey(randomUUID(), 'banter', 'olenna')
  const releasedOwner = randomUUID()
  check((await claim(browser, releaseKey, releasedOwner, 'browser')).claimed &&
    await release(browser, releaseKey, releasedOwner),
  'an unfinished engine can explicitly release its claim')
  check((await claim(daemon, releaseKey, daemonId, 'daemon')).claimed,
    'released work is immediately available to the fallback engine')

  const { data: verdictGuest, error: verdictGuestError } = await browser.from('players').insert({
    room_id: roomId,
    name: 'Verdict Guest',
    is_host: false,
  }).select('id').single()
  if (verdictGuestError) throw verdictGuestError
  const { error: legacyVerdictError } = await browser.from('player_verdicts').insert({
    room_id: roomId,
    player_id: welcomePlayer.id,
    companion_id: 'ned',
    title: 'Legacy Fragment',
    verdict: 'This one-row fragment must not become a room completion sentinel.',
  })
  if (legacyVerdictError) throw legacyVerdictError
  const { error: finishRoomError } = await service.from('rooms').update({
    host_id: welcomePlayer.id,
    phase: 'finished',
  }).eq('id', roomId)
  if (finishRoomError) throw finishRoomError
  const verdictKey = buildVerdictReactionKey()
  const verdictBrowserOwner = randomUUID()
  const verdictOtherOwner = randomUUID()
  const verdictClaims = await Promise.all([
    claim(browser, verdictKey, verdictBrowserOwner, 'browser', 300),
    claim(daemon, verdictKey, verdictOtherOwner, 'browser', 300),
  ])
  check(verdictClaims.filter((result) => result.claimed).length === 1,
    'racing host tabs elect one owner for the full-room keepsake packet')
  const verdictOwner = verdictClaims[0].claimed ? verdictBrowserOwner : verdictOtherOwner
  const verdictLoser = verdictClaims[0].claimed ? verdictOtherOwner : verdictBrowserOwner
  const verdictOwnerClient = verdictClaims[0].claimed ? browser : daemon
  const verdictLoserClient = verdictClaims[0].claimed ? daemon : browser
  const verdictRows = [{
    player_id: welcomePlayer.id,
    companion_id: 'ned',
    title: 'Held the Line',
    verdict: 'You held to the room record and left no unfinished claim behind.',
    highlights: [],
    imagery: [],
  }, {
    player_id: verdictGuest.id,
    companion_id: 'cersei',
    title: 'Kept the Record',
    verdict: 'You entered the room ledger and received the second required verdict.',
    highlights: [],
    imagery: [],
  }]
  const verdictFacts = [
    'GAME RECORD: Welcome Player and Verdict Guest are the exact two players in this room.',
  ]
  const losingVerdict = await verdictLoserClient.rpc('complete_grounded_player_verdicts_authorized', {
    p_room_id: roomId,
    p_actor_player_id: welcomePlayer.id,
    p_reaction_key: verdictKey,
    p_instance_id: verdictLoser,
    p_rows: verdictRows,
    p_facts: verdictFacts,
    p_attempts: 1,
    p_model: 'dogfood-grounded-model',
    p_operator_capability: operatorCapability,
  })
  if (losingVerdict.error) throw losingVerdict.error
  check(losingVerdict.data?.[0]?.completed === false,
    'a losing host tab cannot write any keepsake row')
  const incompleteVerdict = await verdictOwnerClient.rpc('complete_grounded_player_verdicts_authorized', {
    p_room_id: roomId,
    p_actor_player_id: welcomePlayer.id,
    p_reaction_key: verdictKey,
    p_instance_id: verdictOwner,
    p_rows: verdictRows.slice(0, 1),
    p_facts: verdictFacts,
    p_attempts: 1,
    p_model: 'dogfood-grounded-model',
    p_operator_capability: operatorCapability,
  })
  check(incompleteVerdict.error != null,
    'the claim owner cannot complete an incomplete room player set')
  const { data: legacyFragment, error: legacyFragmentError } = await service
    .from('player_verdicts').select('title').eq('room_id', roomId)
  if (legacyFragmentError) throw legacyFragmentError
  check(legacyFragment?.length === 1 && legacyFragment[0].title === 'Legacy Fragment',
    'rejected completion leaves the existing partial legacy packet untouched')
  const winningVerdict = await verdictOwnerClient.rpc('complete_grounded_player_verdicts_authorized', {
    p_room_id: roomId,
    p_actor_player_id: welcomePlayer.id,
    p_reaction_key: verdictKey,
    p_instance_id: verdictOwner,
    p_rows: verdictRows,
    p_facts: verdictFacts,
    p_attempts: 1,
    p_model: 'dogfood-grounded-model',
    p_operator_capability: operatorCapability,
  })
  if (winningVerdict.error) throw winningVerdict.error
  check(winningVerdict.data?.[0]?.completed === true &&
      winningVerdict.data?.[0]?.written_count === 2,
    'the winning host tab atomically writes the exact complete player set')
  const { data: verdictPacket, error: verdictPacketError } = await service
    .from('player_verdicts')
    .select('player_id,grounding_reaction_key,grounding_facts,grounding_attempts,grounding_model,grounded_at')
    .eq('room_id', roomId)
  if (verdictPacketError) throw verdictPacketError
  check(verdictPacket?.length === 2 &&
      verdictPacket.every((row) =>
        row.grounding_reaction_key === verdictKey &&
        JSON.stringify(row.grounding_facts) === JSON.stringify(verdictFacts) &&
        row.grounding_attempts === 1 &&
        row.grounding_model === 'dogfood-grounded-model' &&
        row.grounded_at != null),
    'every durable keepsake row carries the exact grounding provenance')
  const staleVerdictWrite = await browser.from('player_verdicts')
    .update({ verdict: 'A stale bundle must not revise this packet.' })
    .eq('room_id', roomId)
    .eq('player_id', welcomePlayer.id)
  check(staleVerdictWrite.error != null,
    'a completed grounded keepsake rejects later ordinary direct writes')
  check(!(await claim(browser, verdictKey, randomUUID(), 'browser')).claimed,
    'a completed keepsake packet cannot be reclaimed after host reload')

  console.log(`PASS ${checks} companion reaction claim checks`)
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
      'removed the claim proof messages, player, room and cascading private claims')
  }
}
