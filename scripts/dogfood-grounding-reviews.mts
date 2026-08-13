/**
 * Focused local proof for blocked live-prose review evidence.
 *
 * Creates one disposable room, proves host-only queue access, exact residual
 * retention, duplicate idempotency, malformed-input refusal, dismissal and
 * revision invalidation, then removes the room and its cascading private rows.
 *
 *   npx tsx scripts/dogfood-grounding-reviews.mts
 */

import { createClient } from '@supabase/supabase-js'
import { supabaseConfig } from './lib/env.mts'

const { target, url, anonKey, serviceKey } = supabaseConfig('local')
if (target !== 'local') throw new Error('grounding review dogfood is local-only')
if (!serviceKey) throw new Error('local Supabase did not report a service role key')

const anon = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
const service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

let roomId: string | null = null
let hostId: string | null = null
let guestId: string | null = null
let operatorCapability: string | null = null
let checks = 0

function check(condition: unknown, message: string): asserts condition {
  checks++
  if (!condition) throw new Error(message)
  console.log(`PASS ${message}`)
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

interface ReviewEvidence {
  surface: string
  facts: string[]
  attemptedMessages: Array<{ companion_id: string; text: string; delay_seconds: number }>
  findings: Array<{ companion_id: string; text: string; violations: string[] }>
  attempts: number
  model: string
}

const eventEvidence: ReviewEvidence = {
  surface: 'event',
  facts: [
    'EVENT LOGGED BY THE GAME MASTER: "The queen orders an arrest" — The Queen.',
    'No weapon was used.',
  ],
  attemptedMessages: [
    { companion_id: 'cersei', text: 'Blades. Efficient.', delay_seconds: 3 },
  ],
  findings: [
    { companion_id: 'cersei', text: 'Blades. Efficient.', violations: ['The line invented blades.'] },
  ],
  attempts: 3,
  model: 'claude-sonnet-5',
}

const banterEvidence: ReviewEvidence = {
  surface: 'banter',
  facts: [
    'CHAT RECORD: "Tyrion" wrote "The dragon is dead.". This records only what the speaker said; it does not verify any claim about the broadcast.',
    'GAME RECORD: 3 events have been logged so far tonight.',
  ],
  attemptedMessages: [
    { companion_id: 'cersei', text: 'The dragon is dead, as you said.', delay_seconds: 0 },
  ],
  findings: [{
    companion_id: 'cersei',
    text: 'The dragon is dead, as you said.',
    violations: ['Promoted quoted chat content into broadcast truth.'],
  }],
  attempts: 2,
  model: 'claude-haiku-4-5',
}

const bingoEvidence: ReviewEvidence = {
  surface: 'bingo',
  facts: [
    'LIVE DECLARATION: the approved bingo mark declares that "A dragon lands." happened on screen.',
    'GAME RECORD: "Bingo Player" completed a bingo line; LIVE FACT 1 was the square that completed it.',
  ],
  attemptedMessages: [
    { companion_id: 'arya', text: 'The landing burned the field.', delay_seconds: 0 },
  ],
  findings: [{
    companion_id: 'arya',
    text: 'The landing burned the field.',
    violations: ['Invented fire beyond the approved bingo condition.'],
  }],
  attempts: 3,
  model: 'claude-sonnet-5',
}

const milestoneEvidence: ReviewEvidence = {
  surface: 'milestone',
  facts: [
    'GAME RECORD: 6 events have been logged so far tonight.',
    'GAME RECORD: the leaderboard is empty, so no current leader is known.',
  ],
  attemptedMessages: [
    { companion_id: 'ned', text: 'Six events, and three deaths already.', delay_seconds: 0 },
  ],
  findings: [{
    companion_id: 'ned',
    text: 'Six events, and three deaths already.',
    violations: ['Invented three deaths beyond the game record.'],
  }],
  attempts: 2,
  model: 'claude-sonnet-5',
}

const welcomeEvidence: ReviewEvidence = {
  surface: 'welcome',
  facts: [
    'ROOM RECORD: the welcome slot belongs to player "Welcome Player" in tonight\'s room.',
    'ROOM RECORD: that player has declared for Team Black (Rhaenyra\'s claim).',
    'ROOM RECORD: that player uses the "Stark" banner.',
    'GAME RECORD: that player\'s drafted roster contains exactly ["Aemond"].',
  ],
  attemptedMessages: [
    { companion_id: 'ned', text: 'A dragon burned the field for you.', delay_seconds: 0 },
  ],
  findings: [{
    companion_id: 'ned',
    text: 'A dragon burned the field for you.',
    violations: ['Invented a dragon burning the field.'],
  }],
  attempts: 2,
  model: 'claude-sonnet-5',
}

const teamChangeEvidence: ReviewEvidence = {
  surface: 'team_change',
  facts: [
    'ROOM RECORD: in team transition revision 3, player "Welcome Player" changed allegiance from Team Green (Aegon\'s claim) to Team Black (Rhaenyra\'s claim).',
    'GAME RECORD: that player\'s drafted roster contains exactly ["Aemond"].',
  ],
  attemptedMessages: [
    { companion_id: 'cersei', text: 'A dragon drove you back to the Blacks.', delay_seconds: 0 },
  ],
  findings: [{
    companion_id: 'cersei',
    text: 'A dragon drove you back to the Blacks.',
    violations: ['Invented a broadcast event and motive for the defection.'],
  }],
  attempts: 2,
  model: 'claude-sonnet-5',
}

const showStartEvidence: ReviewEvidence = {
  surface: 'show_start',
  facts: [
    'ROOM RECORD: the shared show_started phase has changed to true; this establishes only that the room began playback, not that any particular event, image, dialogue, character or location has appeared on screen.',
    'ROOM RECORD: the watching player roster contains exactly ["Grounding Host","Grounding Guest"].',
  ],
  attemptedMessages: [
    { companion_id: 'ned', text: 'The dragon has appeared on screen.', delay_seconds: 0 },
  ],
  findings: [{
    companion_id: 'ned',
    text: 'The dragon has appeared on screen.',
    violations: ['Invented a dragon appearing after the playback transition.'],
  }],
  attempts: 2,
  model: 'claude-sonnet-5',
}

const preShowEvidence: ReviewEvidence = {
  surface: 'pre_show',
  facts: [
    'ROOM RECORD: this pre-show arrival slot belongs exactly to companion "olenna"; the shared show_started value is false, so playback has not begun. This establishes no screen event, image, dialogue, character or location.',
    'ROOM RECORD: the player roster contains exactly [{"name":"Grounding Host","allegiance":"no declared side"}].',
    'GAME RECORD: drafted rosters contain exactly [{"player":"Grounding Host","draft":[]}].',
  ],
  attemptedMessages: [
    { companion_id: 'olenna', text: 'A dragon has appeared on screen.', delay_seconds: 0 },
  ],
  findings: [{
    companion_id: 'olenna',
    text: 'A dragon has appeared on screen.',
    violations: ['Invented a dragon appearing before playback began.'],
  }],
  attempts: 2,
  model: 'claude-sonnet-5',
}

const spotlightEvidence: ReviewEvidence = {
  surface: 'spotlight',
  facts: [
    'ROOM RECORD: spotlight revision 3 opened category 12 with label "A dragon falls". The label is the operator\'s active question; it does not establish that its wording happened on screen, that a nominee appeared, or that an outcome is known.',
    'CATALOG RECORD: the category\'s candidate roster contains exactly [{"name":"Aemond","film":null}].',
    'GAME RECORD: no player wager is attached to this category.',
  ],
  attemptedMessages: [
    { companion_id: 'ned', text: 'The dragon has fallen on screen.', delay_seconds: 0 },
  ],
  findings: [{
    companion_id: 'ned',
    text: 'The dragon has fallen on screen.',
    violations: ['Promoted the spotlight label into a screen event.'],
  }],
  attempts: 2,
  model: 'claude-sonnet-5',
}

const postShowEvidence: ReviewEvidence = {
  surface: 'post_show',
  facts: [
    'ROOM RECORD: the room entered its provisional finished phase. This closes the game ledger, but establishes no particular broadcast image, dialogue, character, event, or source-material outcome.',
    'ROOM RECORD: the complete player roster contains exactly ["Grounding Host","Grounding Guest"].',
    'GAME RECORD: the complete final leaderboard contains exactly [{"player":"Grounding Host","rank":1,"total":12,"predictions":5,"draft":7,"bingo":0,"correct_picks":1,"highest_correct_prestige":5}].',
    'GAME RECORD: the complete wager result ledger is empty.',
  ],
  attemptedMessages: ['ned', 'cersei', 'tyrion', 'joffrey', 'daenerys', 'olenna', 'arya']
    .map((companion_id, index) => ({
      companion_id,
      text: `A dragon died in farewell line ${index + 1}.`,
      delay_seconds: [0, 6, 16, 30, 38, 46, 54][index],
    })),
  findings: ['ned', 'cersei', 'tyrion', 'joffrey', 'daenerys', 'olenna', 'arya']
    .map((companion_id, index) => ({
      companion_id,
      text: `A dragon died in farewell line ${index + 1}.`,
      violations: ['Invented a source-material or screen outcome beyond the finished game ledger.'],
    })),
  attempts: 3,
  model: 'claude-sonnet-5',
}

const verdictEvidence: ReviewEvidence = {
  surface: 'verdict',
  facts: [
    'GAME RECORD: keepsake slot 1 belongs to Grounding Host, who finished first with twelve points.',
    'CHAT RECORD: message-1 contains a player prediction; it proves only what was written.',
    'ARTWORK CATALOG RECORD: character-aemond is available; catalog metadata does not prove a screen event.',
  ],
  attemptedMessages: [{
    companion_id: 'ned',
    text: 'TITLE: The Dragonfall\nVERDICT: You watched the dragon die.\nHIGHLIGHT NOTE: A death correctly called.\nIMAGERY NOTE: The killer.',
    delay_seconds: 0,
  }],
  findings: [{
    companion_id: 'ned',
    text: 'TITLE: The Dragonfall\nVERDICT: You watched the dragon die.\nHIGHLIGHT NOTE: A death correctly called.\nIMAGERY NOTE: The killer.',
    violations: ['Invented a screen death and killer beyond the game, chat and catalog records.'],
  }],
  attempts: 3,
  model: 'claude-sonnet-5',
}

const { facts, attemptedMessages, findings } = eventEvidence

async function record(
  actorId: string,
  reactionKey: string,
  evidence: ReviewEvidence = eventEvidence,
) {
  if (!operatorCapability) throw new Error('grounding review capability has not been issued')
  return anon.rpc('record_companion_grounding_review_authorized', {
    p_room_id: roomId,
    p_actor_player_id: actorId,
    p_reaction_key: reactionKey,
    p_surface: evidence.surface,
    p_engine: 'browser',
    p_facts: evidence.facts,
    p_attempted_messages: evidence.attemptedMessages,
    p_findings: evidence.findings,
    p_attempts: evidence.attempts,
    p_model: evidence.model,
    p_operator_capability: operatorCapability,
  })
}

async function list(actorId: string) {
  if (!operatorCapability) throw new Error('grounding review capability has not been issued')
  return anon.rpc('list_pending_companion_grounding_reviews_authorized', {
    p_room_id: roomId,
    p_actor_player_id: actorId,
    p_operator_capability: operatorCapability,
  })
}

async function dismiss(actorId: string, reviewId: string) {
  if (!operatorCapability) throw new Error('grounding review capability has not been issued')
  return anon.rpc('dismiss_companion_grounding_review_authorized', {
    p_room_id: roomId,
    p_review_id: reviewId,
    p_actor_player_id: actorId,
    p_operator_capability: operatorCapability,
  })
}

try {
  const { data: room, error: roomError } = await service.from('rooms').insert({
    code: `GRV${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
    phase: 'live',
    host_id: null,
  }).select('id,grounding_review_revision').single()
  if (roomError) throw roomError
  roomId = room.id

  const { data: players, error: playersError } = await service.from('players').insert([
    { room_id: roomId, name: 'Grounding Host', is_host: true },
    { room_id: roomId, name: 'Grounding Guest', is_host: false },
  ]).select('id,is_host')
  if (playersError) throw playersError
  hostId = players.find((player) => player.is_host)?.id ?? null
  guestId = players.find((player) => !player.is_host)?.id ?? null
  if (!hostId || !guestId) throw new Error('failed to create proof host and guest')
  const { error: hostError } = await service.from('rooms').update({ host_id: hostId }).eq('id', roomId)
  if (hostError) throw hostError
  const legacyList = await anon.rpc('list_pending_companion_grounding_reviews', {
    p_room_id: roomId,
    p_actor_player_id: hostId,
  })
  check(legacyList.error !== null,
    'public room and host IDs cannot call the legacy grounding queue')
  const { data: issued, error: issueError } = await service.rpc(
    'issue_room_operator_capability',
    { p_room_id: roomId },
  )
  if (issueError) throw issueError
  operatorCapability = String(issued.capability)

  const wrongCapabilityRecord = await anon.rpc('record_companion_grounding_review_authorized', {
    p_room_id: roomId,
    p_actor_player_id: hostId,
    p_reaction_key: `event:${Date.now()}:wrong-capability`,
    p_surface: eventEvidence.surface,
    p_engine: 'browser',
    p_facts: eventEvidence.facts,
    p_attempted_messages: eventEvidence.attemptedMessages,
    p_findings: eventEvidence.findings,
    p_attempts: eventEvidence.attempts,
    p_model: eventEvidence.model,
    p_operator_capability: '0'.repeat(64),
  })
  check(wrongCapabilityRecord.error?.message.includes('valid operator capability') === true,
    'a wrong capability cannot forge private grounding evidence')
  const forgedDaemonRecord = await anon.rpc('record_companion_grounding_review_authorized', {
    p_room_id: roomId,
    p_actor_player_id: hostId,
    p_reaction_key: `event:${Date.now()}:forged-daemon`,
    p_surface: eventEvidence.surface,
    p_engine: 'daemon',
    p_facts: eventEvidence.facts,
    p_attempted_messages: eventEvidence.attemptedMessages,
    p_findings: eventEvidence.findings,
    p_attempts: eventEvidence.attempts,
    p_model: eventEvidence.model,
    p_operator_capability: operatorCapability,
  })
  check(forgedDaemonRecord.error?.message.includes('browser grounding writer') === true,
    'the browser capability cannot impersonate daemon provenance')

  const reactionKey = `event:${Date.now()}:winner`
  const first = await record(hostId, reactionKey)
  if (first.error) throw first.error
  check(typeof first.data === 'string',
    'the room host can preserve a blocked grounding batch')

  const guestList = await list(guestId)
  check(guestList.error != null,
    'a non-host player cannot read the private grounding queue')

  const hostList = await list(hostId)
  if (hostList.error) throw hostList.error
  const firstRow = (hostList.data as Array<Record<string, unknown>>)[0]
  check(hostList.data?.length === 1 &&
      canonicalJson(firstRow.facts) === canonicalJson(facts) &&
      canonicalJson(firstRow.attempted_messages) === canonicalJson(attemptedMessages) &&
      canonicalJson(firstRow.findings) === canonicalJson(findings),
    'the host reads the exact facts, attempted prose and residual findings')

  const duplicate = await record(hostId, reactionKey, {
    ...eventEvidence,
    findings: [
      { companion_id: 'ned', text: 'Different.', violations: ['Different finding.'] },
    ],
  })
  if (duplicate.error) throw duplicate.error
  const afterDuplicate = await list(hostId)
  if (afterDuplicate.error) throw afterDuplicate.error
  check(duplicate.data === first.data && afterDuplicate.data?.length === 1 &&
      canonicalJson(afterDuplicate.data[0].findings) === canonicalJson(findings),
    'duplicate engines resolve to the first immutable pending review')

  const { data: revisionRoom, error: revisionError } = await anon.from('rooms')
    .select('grounding_review_revision').eq('id', roomId).single()
  if (revisionError) throw revisionError
  check(revisionRoom.grounding_review_revision === 1,
    'the first review advances the room invalidation revision exactly once')

  const malformed = await anon.rpc('record_companion_grounding_review_authorized', {
    p_room_id: roomId,
    p_actor_player_id: hostId,
    p_reaction_key: `${reactionKey}:malformed`,
    p_surface: 'event',
    p_engine: 'browser',
    p_facts: facts,
    p_attempted_messages: [{ companion_id: 'cersei', text: '', delay_seconds: 3 }],
    p_findings: findings,
    p_attempts: 3,
    p_model: 'claude-sonnet-5',
    p_operator_capability: operatorCapability,
  })
  check(malformed.error != null,
    'malformed attempted prose is rejected before it enters the private ledger')

  const guestDismiss = await dismiss(guestId, first.data)
  check(guestDismiss.error != null,
    'a non-host player cannot dismiss grounding evidence')

  const hostDismiss = await dismiss(hostId, first.data)
  if (hostDismiss.error) throw hostDismiss.error
  const afterDismiss = await list(hostId)
  if (afterDismiss.error) throw afterDismiss.error
  const { data: dismissedRoom, error: dismissedRevisionError } = await anon.from('rooms')
    .select('grounding_review_revision').eq('id', roomId).single()
  if (dismissedRevisionError) throw dismissedRevisionError
  check(hostDismiss.data === true && afterDismiss.data?.length === 0 &&
      dismissedRoom.grounding_review_revision === 2,
    'host dismissal empties the queue and advances the revision')

  const banterKey = `chat:${Date.now()}:banter:cersei`
  const banter = await record(hostId, banterKey, banterEvidence)
  if (banter.error) throw banter.error
  const banterList = await list(hostId)
  if (banterList.error) throw banterList.error
  check(banterList.data?.length === 1 &&
      banterList.data[0].surface === 'banter' &&
      canonicalJson(banterList.data[0].facts) === canonicalJson(banterEvidence.facts) &&
      canonicalJson(banterList.data[0].attempted_messages) === canonicalJson(banterEvidence.attemptedMessages) &&
      canonicalJson(banterList.data[0].findings) === canonicalJson(banterEvidence.findings),
    'a blocked banter reply preserves its exact qualified facts, attempted prose and finding')
  const banterDismiss = await dismiss(hostId, banter.data)
  if (banterDismiss.error) throw banterDismiss.error

  const bingoKey = `bingo:${Date.now()}:reaction`
  const bingo = await record(hostId, bingoKey, bingoEvidence)
  if (bingo.error) throw bingo.error
  const bingoList = await list(hostId)
  if (bingoList.error) throw bingoList.error
  check(bingoList.data?.length === 1 &&
      bingoList.data[0].surface === 'bingo' &&
      canonicalJson(bingoList.data[0].facts) === canonicalJson(bingoEvidence.facts) &&
      canonicalJson(bingoList.data[0].attempted_messages) === canonicalJson(bingoEvidence.attemptedMessages) &&
      canonicalJson(bingoList.data[0].findings) === canonicalJson(bingoEvidence.findings),
    'a blocked bingo reply preserves its exact live-declaration facts, attempted prose and finding')

  const bingoDismiss = await dismiss(hostId, bingo.data)
  if (bingoDismiss.error) throw bingoDismiss.error

  const milestoneKey = `milestone:halfway`
  const milestone = await record(hostId, milestoneKey, milestoneEvidence)
  if (milestone.error) throw milestone.error
  const milestoneList = await list(hostId)
  if (milestoneList.error) throw milestoneList.error
  check(milestoneList.data?.length === 1 &&
      milestoneList.data[0].surface === 'milestone' &&
      canonicalJson(milestoneList.data[0].facts) === canonicalJson(milestoneEvidence.facts) &&
      canonicalJson(milestoneList.data[0].attempted_messages) === canonicalJson(milestoneEvidence.attemptedMessages) &&
      canonicalJson(milestoneList.data[0].findings) === canonicalJson(milestoneEvidence.findings),
    'a blocked milestone preserves its exact game-record facts, attempted prose and finding')

  const milestoneDismiss = await dismiss(hostId, milestone.data)
  if (milestoneDismiss.error) throw milestoneDismiss.error

  const welcomeKey = `welcome:${hostId}`
  const welcome = await record(hostId, welcomeKey, welcomeEvidence)
  if (welcome.error) throw welcome.error
  const welcomeList = await list(hostId)
  if (welcomeList.error) throw welcomeList.error
  check(welcomeList.data?.length === 1 &&
      welcomeList.data[0].surface === 'welcome' &&
      canonicalJson(welcomeList.data[0].facts) === canonicalJson(welcomeEvidence.facts) &&
      canonicalJson(welcomeList.data[0].attempted_messages) === canonicalJson(welcomeEvidence.attemptedMessages) &&
      canonicalJson(welcomeList.data[0].findings) === canonicalJson(welcomeEvidence.findings),
    'a blocked welcome preserves its exact room facts, attempted prose and finding')

  const welcomeDismiss = await dismiss(hostId, welcome.data)
  if (welcomeDismiss.error) throw welcomeDismiss.error

  const teamChangeKey = `team:${hostId}:3:reaction`
  const teamChange = await record(hostId, teamChangeKey, teamChangeEvidence)
  if (teamChange.error) throw teamChange.error
  const teamChangeList = await list(hostId)
  if (teamChangeList.error) throw teamChangeList.error
  check(teamChangeList.data?.length === 1 &&
      teamChangeList.data[0].surface === 'team_change' &&
      canonicalJson(teamChangeList.data[0].facts) === canonicalJson(teamChangeEvidence.facts) &&
      canonicalJson(teamChangeList.data[0].attempted_messages) === canonicalJson(teamChangeEvidence.attemptedMessages) &&
      canonicalJson(teamChangeList.data[0].findings) === canonicalJson(teamChangeEvidence.findings),
    'a blocked team change preserves its exact revisioned facts, attempted prose and finding')

  const teamChangeDismiss = await dismiss(hostId, teamChange.data)
  if (teamChangeDismiss.error) throw teamChangeDismiss.error

  const showStartKey = 'ceremony:show_started:reaction'
  const preShowKey = 'ceremony:pre_show:olenna'
  const preShow = await record(hostId, preShowKey, preShowEvidence)
  if (preShow.error) throw preShow.error
  const preShowList = await list(hostId)
  if (preShowList.error) throw preShowList.error
  check(preShowList.data?.length === 1 &&
      preShowList.data[0].surface === 'pre_show' &&
      canonicalJson(preShowList.data[0].facts) === canonicalJson(preShowEvidence.facts) &&
      canonicalJson(preShowList.data[0].attempted_messages) === canonicalJson(preShowEvidence.attemptedMessages) &&
      canonicalJson(preShowList.data[0].findings) === canonicalJson(preShowEvidence.findings),
    'a blocked pre-show arrival preserves its exact room facts, attempted prose and finding')
  const preShowDismiss = await dismiss(hostId, preShow.data)
  if (preShowDismiss.error) throw preShowDismiss.error

  const spotlightKey = 'spotlight:3:reaction'
  const spotlight = await record(hostId, spotlightKey, spotlightEvidence)
  if (spotlight.error) throw spotlight.error
  const spotlightList = await list(hostId)
  if (spotlightList.error) throw spotlightList.error
  check(spotlightList.data?.length === 1 &&
      spotlightList.data[0].surface === 'spotlight' &&
      canonicalJson(spotlightList.data[0].facts) === canonicalJson(spotlightEvidence.facts) &&
      canonicalJson(spotlightList.data[0].attempted_messages) === canonicalJson(spotlightEvidence.attemptedMessages) &&
      canonicalJson(spotlightList.data[0].findings) === canonicalJson(spotlightEvidence.findings),
    'a blocked spotlight opening preserves its exact question facts, attempted prose and finding')
  const spotlightDismiss = await dismiss(hostId, spotlight.data)
  if (spotlightDismiss.error) throw spotlightDismiss.error

  const postShowKey = 'ceremony:post_show:reaction'
  const postShow = await record(hostId, postShowKey, postShowEvidence)
  if (postShow.error) throw postShow.error
  const postShowList = await list(hostId)
  if (postShowList.error) throw postShowList.error
  check(postShowList.data?.length === 1 &&
      postShowList.data[0].surface === 'post_show' &&
      canonicalJson(postShowList.data[0].facts) === canonicalJson(postShowEvidence.facts) &&
      canonicalJson(postShowList.data[0].attempted_messages) === canonicalJson(postShowEvidence.attemptedMessages) &&
      canonicalJson(postShowList.data[0].findings) === canonicalJson(postShowEvidence.findings),
    'a blocked full-cast farewell preserves all seven attempted lines and findings')
  const postShowDismiss = await dismiss(hostId, postShow.data)
  if (postShowDismiss.error) throw postShowDismiss.error

  const verdictKey = 'keepsake:verdicts:v1'
  const verdict = await record(hostId, verdictKey, verdictEvidence)
  if (verdict.error) throw verdict.error
  const verdictList = await list(hostId)
  if (verdictList.error) throw verdictList.error
  check(verdictList.data?.length === 1 &&
      verdictList.data[0].surface === 'verdict' &&
      canonicalJson(verdictList.data[0].facts) === canonicalJson(verdictEvidence.facts) &&
      canonicalJson(verdictList.data[0].attempted_messages) === canonicalJson(verdictEvidence.attemptedMessages) &&
      canonicalJson(verdictList.data[0].findings) === canonicalJson(verdictEvidence.findings),
    'a blocked keepsake preserves every audited prose field and its exact residual finding')
  const verdictDismiss = await dismiss(hostId, verdict.data)
  if (verdictDismiss.error) throw verdictDismiss.error

  const showStart = await record(hostId, showStartKey, showStartEvidence)
  if (showStart.error) throw showStart.error
  const showStartList = await list(hostId)
  if (showStartList.error) throw showStartList.error
  check(showStartList.data?.length === 1 &&
      showStartList.data[0].surface === 'show_start' &&
      canonicalJson(showStartList.data[0].facts) === canonicalJson(showStartEvidence.facts) &&
      canonicalJson(showStartList.data[0].attempted_messages) === canonicalJson(showStartEvidence.attemptedMessages) &&
      canonicalJson(showStartList.data[0].findings) === canonicalJson(showStartEvidence.findings),
    'a blocked show-start batch preserves its exact phase facts, attempted prose and finding')

  console.log(`PASS ${checks} grounding review checks`)
} finally {
  if (roomId) {
    await service.from('rooms').update({ host_id: null }).eq('id', roomId)
    await service.from('players').delete().eq('room_id', roomId)
    await service.from('rooms').delete().eq('id', roomId)
    const { count } = await service.from('rooms')
      .select('id', { count: 'exact', head: true }).eq('id', roomId)
    check(count === 0,
      'removed the proof room, players and cascading private grounding rows')
  }
}
