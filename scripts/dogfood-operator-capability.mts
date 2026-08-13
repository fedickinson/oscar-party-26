/**
 * Focused local proof for the room operator capability boundary.
 *
 * Uses one disposable room, never writes the global catalog, and removes its
 * private token/link files plus all room rows on exit.
 *
 *   npx tsx scripts/dogfood-operator-capability.mts
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import {
  normalizeOperatorCapability,
  parseOperatorCapabilityFragment,
} from '../src/lib/operator-capability'
import { supabaseConfig } from './lib/env.mts'

const { target, url, anonKey, serviceKey } = supabaseConfig('local')
if (target !== 'local') throw new Error('operator capability dogfood is local-only')
if (!serviceKey) throw new Error('local Supabase did not report a service role key')

const anon = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const service = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

let roomId: string | null = null
let checks = 0
const code = `CAP${Math.floor(Math.random() * 10_000).toString().padStart(4, '0')}`
const directory = resolve('.private', 'operator-capabilities')
const tokenPath = resolve(directory, `${code}.token`)
const linkPath = resolve(directory, `${code}.url`)

function check(condition: unknown, message: string): asserts condition {
  checks += 1
  if (!condition) throw new Error(message)
  console.log(`PASS ${message}`)
}

async function list(actorId: string, capability: string) {
  return anon.rpc('list_pending_witness_proposals_authorized_v2', {
    p_room_id: roomId!,
    p_actor_player_id: actorId,
    p_operator_capability: capability,
  })
}

async function listGrounding(actorId: string, capability: string) {
  return anon.rpc('list_pending_companion_grounding_reviews_authorized', {
    p_room_id: roomId!,
    p_actor_player_id: actorId,
    p_operator_capability: capability,
  })
}

try {
  const { data: room, error: roomError } = await service.from('rooms').insert({
    code,
    phase: 'live',
    host_id: null,
  }).select('id').single()
  if (roomError) throw roomError
  roomId = room.id

  const { data: players, error: playersError } = await service.from('players').insert([
    {
      room_id: room.id,
      name: 'Capability Host',
      avatar_id: 'host',
      color: '#000000',
      is_host: true,
    },
    {
      room_id: room.id,
      name: 'Capability Guest',
      avatar_id: 'guest',
      color: '#000000',
      is_host: false,
    },
  ]).select('id,is_host')
  if (playersError) throw playersError
  const host = players.find((player) => player.is_host)
  const guest = players.find((player) => !player.is_host)
  if (!host || !guest) throw new Error('capability proof players were not created')
  const { error: hostError } = await service.from('rooms')
    .update({ host_id: host.id })
    .eq('id', room.id)
  if (hostError) throw hostError

  const invalidIssuer = spawnSync(
    'node',
    ['--import', 'tsx', 'scripts/issue-operator-capability.mts', '--room', 'bad!'],
    {
      cwd: process.cwd(),
      env: { ...process.env, SUPABASE_TARGET: 'local' },
      encoding: 'utf8',
      timeout: 60_000,
    },
  )
  const invalidOutput = `${invalidIssuer.stdout ?? ''}${invalidIssuer.stderr ?? ''}`
  check(invalidIssuer.status === 1 && !invalidOutput.includes('target:'),
    'invalid issuance arguments fail before any database target is resolved')

  const dryRunIssuer = spawnSync(
    'node',
    ['--import', 'tsx', 'scripts/issue-operator-capability.mts', '--room', code],
    {
      cwd: process.cwd(),
      env: { ...process.env, SUPABASE_TARGET: 'local' },
      encoding: 'utf8',
      timeout: 60_000,
    },
  )
  if (dryRunIssuer.error) throw dryRunIssuer.error
  const dryRunOutput = `${dryRunIssuer.stdout ?? ''}${dryRunIssuer.stderr ?? ''}`
  const { data: dryRunStatus, error: dryRunStatusError } = await service.rpc(
    'room_operator_capability_status',
    { p_room_id: room.id },
  )
  if (dryRunStatusError) throw dryRunStatusError
  check(dryRunIssuer.status === 0
      && dryRunOutput.includes('mode=dry-run')
      && dryRunStatus.issued === false
      && !existsSync(tokenPath)
      && !existsSync(linkPath),
    'default issuance mode reads status without a database or file write')

  const legacy = await anon.rpc('list_pending_witness_proposals', {
    p_room_id: room.id,
    p_actor_player_id: host.id,
  })
  check(legacy.error !== null,
    'public room and host IDs cannot call the legacy witness queue')
  const legacyGrounding = await anon.rpc('list_pending_companion_grounding_reviews', {
    p_room_id: room.id,
    p_actor_player_id: host.id,
  })
  check(legacyGrounding.error !== null,
    'public room and host IDs cannot call the legacy grounding queue')
  const legacyGroundingDismiss = await anon.rpc('dismiss_companion_grounding_review', {
    p_room_id: room.id,
    p_review_id: crypto.randomUUID(),
    p_actor_player_id: host.id,
  })
  check(legacyGroundingDismiss.error !== null,
    'public room and host IDs cannot call the legacy grounding dismissal')
  const legacyGroundingRecord = await anon.rpc('record_companion_grounding_review', {
    p_room_id: room.id,
    p_actor_player_id: host.id,
    p_reaction_key: `capability:${Date.now()}:legacy-record`,
    p_surface: 'event',
    p_engine: 'browser',
    p_facts: ['GAME RECORD: the capability proof supplied one bounded fact.'],
    p_attempted_messages: [{
      companion_id: 'ned',
      text: 'A blocked proof line.',
      delay_seconds: 0,
    }],
    p_findings: [{
      companion_id: 'ned',
      text: 'A blocked proof line.',
      violations: ['The proof line exceeded its supplied fact.'],
    }],
    p_attempts: 1,
    p_model: 'capability-proof',
  })
  check(legacyGroundingRecord.error !== null,
    'public room and host IDs cannot forge the legacy grounding evidence record')

  const legacyBrowserClaim = await anon.rpc('claim_companion_reaction', {
    p_room_id: room.id,
    p_reaction_key: `capability:${Date.now()}:legacy-browser-claim`,
    p_engine: 'browser',
    p_instance_id: crypto.randomUUID(),
    p_lease_seconds: 60,
  })
  check(legacyBrowserClaim.error !== null,
    'ordinary clients cannot claim browser model work without a room capability')

  const anonIssue = await anon.rpc('issue_room_operator_capability', { p_room_id: room.id })
  check(anonIssue.error !== null,
    'ordinary clients cannot issue or rotate a room capability')
  const anonStatus = await anon.rpc('room_operator_capability_status', { p_room_id: room.id })
  check(anonStatus.error !== null,
    'ordinary clients cannot inspect capability issuance metadata')

  const { data: issued, error: issueError } = await service.rpc(
    'issue_room_operator_capability',
    { p_room_id: room.id },
  )
  if (issueError) throw issueError
  const firstCapability = normalizeOperatorCapability(issued.capability)
  check(firstCapability !== null && issued.generation === 1 && issued.rotated === false,
    'service issuance returns one 256-bit first-generation bearer')

  const { data: firstRevisionRoom, error: firstRevisionError } = await anon.from('rooms')
    .select('operator_capability_revision')
    .eq('id', room.id)
    .single()
  if (firstRevisionError) throw firstRevisionError
  check(firstRevisionRoom.operator_capability_revision === 1,
    'first issuance advances the public Realtime invalidation revision')

  const wrongValidation = await anon.rpc('validate_room_operator_capability', {
    p_room_id: room.id,
    p_operator_capability: '0'.repeat(64),
  })
  check(wrongValidation.error?.message.includes('valid operator capability') === true,
    'browser validation rejects a token-shaped value that is not the current bearer')
  const validValidation = await anon.rpc('validate_room_operator_capability', {
    p_room_id: room.id,
    p_operator_capability: firstCapability,
  })
  check(validValidation.error === null && validValidation.data === true,
    'browser validation confirms only the current room bearer')

  const legacyRefereeClose = await anon.rpc('close_live_floor', {
    p_room_id: room.id,
    p_actor_player_id: host.id,
  })
  check(legacyRefereeClose.error !== null,
    'public room and host IDs cannot call the legacy live-floor close')
  const wrongRefereeClose = await anon.rpc('close_live_floor_authorized', {
    p_room_id: room.id,
    p_actor_player_id: host.id,
    p_operator_capability: '0'.repeat(64),
  })
  check(wrongRefereeClose.error?.message.includes('valid operator capability') === true,
    'a wrong bearer cannot close the live floor')
  const guestRefereeClose = await anon.rpc('close_live_floor_authorized', {
    p_room_id: room.id,
    p_actor_player_id: guest.id,
    p_operator_capability: firstCapability,
  })
  check(guestRefereeClose.error?.message.includes('current room host authority') === true,
    'capability possession does not replace the current referee host role')

  const directWinner = await anon.from('room_winners').insert({
    room_id: room.id,
    category_id: -1,
    winner_id: crypto.randomUUID(),
    tie_winner_id: null,
  })
  check(directWinner.error !== null,
    'ordinary clients cannot bypass referee commands with a direct ledger insert')
  const directClose = await anon.from('rooms')
    .update({ phase: 'finished' })
    .eq('id', room.id)
  check(directClose.error?.message.includes('authorized referee command') === true,
    'ordinary clients cannot bypass referee authority with a direct live-floor close')

  const daemonClaimKey = `capability:${Date.now()}:daemon-owned-claim`
  const daemonClaimOwner = crypto.randomUUID()
  const { data: daemonClaimData, error: daemonClaimError } = await service.rpc(
    'claim_companion_reaction',
    {
      p_room_id: room.id,
      p_reaction_key: daemonClaimKey,
      p_engine: 'daemon',
      p_instance_id: daemonClaimOwner,
      p_lease_seconds: 60,
    },
  )
  if (daemonClaimError) throw daemonClaimError
  check(daemonClaimData?.[0]?.claimed === true,
    'the service daemon acquires its legacy reaction lease')
  const losingBrowserClaim = await anon.rpc('claim_browser_companion_reaction_authorized', {
    p_room_id: room.id,
    p_reaction_key: daemonClaimKey,
    p_instance_id: crypto.randomUUID(),
    p_lease_seconds: 60,
    p_operator_capability: firstCapability,
  })
  check(losingBrowserClaim.error === null
      && losingBrowserClaim.data?.[0]?.claimed === false
      && losingBrowserClaim.data?.[0]?.active_engine === 'daemon'
      && losingBrowserClaim.data?.[0]?.active_instance_id === daemonClaimOwner,
    'an authorized browser observes but does not acquire the active daemon lease')
  const browserReleaseDaemon = await anon.rpc(
    'release_browser_companion_reaction_authorized',
    {
      p_room_id: room.id,
      p_reaction_key: daemonClaimKey,
      p_instance_id: daemonClaimOwner,
      p_operator_capability: firstCapability,
    },
  )
  check(browserReleaseDaemon.error === null && browserReleaseDaemon.data === false,
    'a browser bearer cannot release a daemon-owned lease')
  const browserCompleteDaemon = await anon.rpc(
    'complete_browser_companion_reaction_authorized',
    {
      p_room_id: room.id,
      p_reaction_key: daemonClaimKey,
      p_instance_id: daemonClaimOwner,
      p_messages: [{ player_id: 'ned', text: 'Browser completion must not cross daemon ownership.' }],
      p_operator_capability: firstCapability,
    },
  )
  check(browserCompleteDaemon.error === null
      && browserCompleteDaemon.data?.[0]?.completed === false,
    'a browser bearer cannot complete a daemon-owned direct reaction')
  const browserScheduleDaemon = await anon.rpc(
    'schedule_browser_companion_reaction_authorized',
    {
      p_room_id: room.id,
      p_reaction_key: daemonClaimKey,
      p_instance_id: daemonClaimOwner,
      p_messages: [{
        player_id: 'ned',
        text: 'Browser scheduling must not cross daemon ownership.',
        delay_seconds: 0,
      }],
      p_operator_capability: firstCapability,
    },
  )
  check(browserScheduleDaemon.error === null
      && browserScheduleDaemon.data?.[0]?.completed === false,
    'a browser bearer cannot schedule a daemon-owned staggered reaction')
  const { data: daemonCompletion, error: daemonCompletionError } = await service.rpc(
    'complete_companion_reaction',
    {
      p_room_id: room.id,
      p_reaction_key: daemonClaimKey,
      p_instance_id: daemonClaimOwner,
      p_messages: [{ player_id: 'ned', text: 'The daemon retained its exact claim.' }],
    },
  )
  if (daemonCompletionError) throw daemonCompletionError
  check(daemonCompletion?.[0]?.completed === true,
    'the daemon retains completion authority after browser denial')

  const browserClaimKey = `capability:${Date.now()}:authorized-browser-claim`
  const browserClaimOwner = crypto.randomUUID()
  const wrongBrowserClaim = await anon.rpc('claim_browser_companion_reaction_authorized', {
    p_room_id: room.id,
    p_reaction_key: browserClaimKey,
    p_instance_id: browserClaimOwner,
    p_lease_seconds: 60,
    p_operator_capability: '0'.repeat(64),
  })
  check(wrongBrowserClaim.error?.message.includes('valid operator capability') === true,
    'a wrong bearer is rejected before browser model-work ownership')
  const validBrowserClaim = await anon.rpc('claim_browser_companion_reaction_authorized', {
    p_room_id: room.id,
    p_reaction_key: browserClaimKey,
    p_instance_id: browserClaimOwner,
    p_lease_seconds: 60,
    p_operator_capability: firstCapability,
  })
  check(validBrowserClaim.error === null && validBrowserClaim.data?.[0]?.claimed === true,
    'the current bearer acquires browser model-work ownership')

  const legacyBrowserCompletion = await anon.rpc('complete_companion_reaction', {
    p_room_id: room.id,
    p_reaction_key: browserClaimKey,
    p_instance_id: browserClaimOwner,
    p_messages: [{ player_id: 'ned', text: 'Legacy publication must be denied.' }],
  })
  check(legacyBrowserCompletion.error?.message.includes('permission denied') === true,
    'ordinary clients cannot publish through the legacy companion completion')

  const wrong = await list(host.id, '0'.repeat(64))
  check(wrong.error?.message.includes('valid operator capability') === true,
    'a wrong capability cannot read the private witness queue')

  const guestRead = await list(guest.id, firstCapability)
  check(guestRead.error !== null,
    'capability possession does not replace current host-role validation')

  const hostRead = await list(host.id, firstCapability)
  check(hostRead.error === null && hostRead.data?.length === 0,
    'the current host plus valid capability reads the exact empty queue')

  const wrongGrounding = await listGrounding(host.id, '0'.repeat(64))
  check(wrongGrounding.error?.message.includes('valid operator capability') === true,
    'a wrong capability cannot read the private grounding queue')
  const guestGrounding = await listGrounding(guest.id, firstCapability)
  check(guestGrounding.error !== null,
    'grounding capability possession does not replace current host-role validation')
  const hostGrounding = await listGrounding(host.id, firstCapability)
  check(hostGrounding.error === null && hostGrounding.data?.length === 0,
    'the current host plus valid capability reads the exact empty grounding queue')

  const nonexistentProposal = crypto.randomUUID()
  const wrongReview = await anon.rpc('review_witness_proposal_authorized_v2', {
    p_room_id: room.id,
    p_proposal_id: nonexistentProposal,
    p_actor_player_id: host.id,
    p_action: 'dismiss',
    p_selected_entity_id: null,
    p_expected_observation_count: null,
    p_operator_capability: '0'.repeat(64),
  })
  check(wrongReview.error?.message.includes('valid operator capability') === true,
    'the review path rejects a wrong capability before proposal lookup')
  const authorizedReview = await anon.rpc('review_witness_proposal_authorized_v2', {
    p_room_id: room.id,
    p_proposal_id: nonexistentProposal,
    p_actor_player_id: host.id,
    p_action: 'dismiss',
    p_selected_entity_id: null,
    p_expected_observation_count: null,
    p_operator_capability: firstCapability,
  })
  check(authorizedReview.error?.message.includes('pending witness proposal not found') === true,
    'a valid capability reaches the existing atomic witness review contract')

  const nonexistentGroundingReview = crypto.randomUUID()
  const wrongGroundingDismiss = await anon.rpc(
    'dismiss_companion_grounding_review_authorized',
    {
      p_room_id: room.id,
      p_review_id: nonexistentGroundingReview,
      p_actor_player_id: host.id,
      p_operator_capability: '0'.repeat(64),
    },
  )
  check(wrongGroundingDismiss.error?.message.includes('valid operator capability') === true,
    'the grounding dismissal path rejects a wrong capability before review lookup')
  const authorizedGroundingDismiss = await anon.rpc(
    'dismiss_companion_grounding_review_authorized',
    {
      p_room_id: room.id,
      p_review_id: nonexistentGroundingReview,
      p_actor_player_id: host.id,
      p_operator_capability: firstCapability,
    },
  )
  check(authorizedGroundingDismiss.error === null && authorizedGroundingDismiss.data === false,
    'a valid capability reaches the existing atomic grounding dismissal contract')

  const issuer = spawnSync(
    'node',
    [
      '--import', 'tsx', 'scripts/issue-operator-capability.mts',
      '--room', code,
      '--apply',
      '--confirm-room', code,
      '--origin', 'http://localhost:5173',
      '--rotate',
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, SUPABASE_TARGET: 'local' },
      encoding: 'utf8',
      timeout: 60_000,
    },
  )
  if (issuer.error) throw issuer.error
  const issuerOutput = `${issuer.stdout ?? ''}${issuer.stderr ?? ''}`
  console.log(issuerOutput.trim())
  check(issuer.status === 0 && existsSync(tokenPath) && existsSync(linkPath),
    'the guarded operator CLI rotates and writes both private handoff files')

  const rotatedCapability = normalizeOperatorCapability(readFileSync(tokenPath, 'utf8'))
  if (!rotatedCapability) throw new Error('operator CLI wrote an invalid capability file')
  const link = new URL(readFileSync(linkPath, 'utf8').trim())
  const parsedLink = parseOperatorCapabilityFragment(link.hash)
  check(parsedLink.capability === rotatedCapability
      && link.origin === 'http://localhost:5173'
      && link.pathname === `/room/${code}/live`,
    'the phone link carries the rotated bearer only in its URL fragment')
  check((statSync(tokenPath).mode & 0o777) === 0o600
      && (statSync(linkPath).mode & 0o777) === 0o600,
    'both local secret files are owner-readable only')
  check(!issuerOutput.includes(rotatedCapability),
    'the operator CLI never prints the raw capability or private link')

  const staleRead = await list(host.id, firstCapability)
  check(staleRead.error !== null,
    'rotation immediately invalidates the previous bearer')
  const rotatedRead = await list(host.id, rotatedCapability)
  check(rotatedRead.error === null,
    'the rotated bearer becomes the only valid room capability')

  const staleCompletion = await anon.rpc('complete_browser_companion_reaction_authorized', {
    p_room_id: room.id,
    p_reaction_key: browserClaimKey,
    p_instance_id: browserClaimOwner,
    p_messages: [{ player_id: 'ned', text: 'A stale bearer must not publish this line.' }],
    p_operator_capability: firstCapability,
  })
  check(staleCompletion.error?.message.includes('valid operator capability') === true,
    'rotation invalidates an in-flight bearer again at publication time')
  const rotatedCompletion = await anon.rpc('complete_browser_companion_reaction_authorized', {
    p_room_id: room.id,
    p_reaction_key: browserClaimKey,
    p_instance_id: browserClaimOwner,
    p_messages: [{ player_id: 'ned', text: 'The current bearer completed this proof.' }],
    p_operator_capability: rotatedCapability,
  })
  check(rotatedCompletion.error === null && rotatedCompletion.data?.[0]?.completed === true,
    'the rotated bearer can complete work claimed before rotation')

  const scheduledKey = `capability:${Date.now()}:authorized-browser-schedule`
  const scheduledOwner = crypto.randomUUID()
  const scheduledClaim = await anon.rpc('claim_browser_companion_reaction_authorized', {
    p_room_id: room.id,
    p_reaction_key: scheduledKey,
    p_instance_id: scheduledOwner,
    p_lease_seconds: 60,
    p_operator_capability: rotatedCapability,
  })
  if (scheduledClaim.error) throw scheduledClaim.error
  const legacySchedule = await anon.rpc('schedule_staggered_companion_reaction', {
    p_room_id: room.id,
    p_reaction_key: scheduledKey,
    p_instance_id: scheduledOwner,
    p_messages: [{ player_id: 'ned', text: 'Legacy schedule denied.', delay_seconds: 0 }],
  })
  check(legacySchedule.error?.message.includes('permission denied') === true,
    'ordinary clients cannot publish through the legacy staggered scheduler')
  const rotatedSchedule = await anon.rpc('schedule_browser_companion_reaction_authorized', {
    p_room_id: room.id,
    p_reaction_key: scheduledKey,
    p_instance_id: scheduledOwner,
    p_messages: [{ player_id: 'ned', text: 'Authorized staggered proof.', delay_seconds: 0 }],
    p_operator_capability: rotatedCapability,
  })
  check(rotatedSchedule.error === null && rotatedSchedule.data?.[0]?.completed === true,
    'the current bearer atomically publishes a staggered browser plan')

  const releaseKey = `capability:${Date.now()}:authorized-browser-release`
  const releaseOwner = crypto.randomUUID()
  const releaseClaim = await anon.rpc('claim_browser_companion_reaction_authorized', {
    p_room_id: room.id,
    p_reaction_key: releaseKey,
    p_instance_id: releaseOwner,
    p_lease_seconds: 60,
    p_operator_capability: rotatedCapability,
  })
  if (releaseClaim.error) throw releaseClaim.error
  const legacyRelease = await anon.rpc('release_companion_reaction', {
    p_room_id: room.id,
    p_reaction_key: releaseKey,
    p_instance_id: releaseOwner,
  })
  check(legacyRelease.error?.message.includes('permission denied') === true,
    'ordinary clients cannot mutate ownership through the legacy release path')
  const authorizedRelease = await anon.rpc('release_browser_companion_reaction_authorized', {
    p_room_id: room.id,
    p_reaction_key: releaseKey,
    p_instance_id: releaseOwner,
    p_operator_capability: rotatedCapability,
  })
  check(authorizedRelease.error === null && authorizedRelease.data === true,
    'the current bearer can release its unfinished browser claim')

  const legacyVerdictCompletion = await anon.rpc('complete_grounded_player_verdicts', {
    p_room_id: room.id,
    p_actor_player_id: host.id,
    p_reaction_key: 'keepsake:verdicts:v1',
    p_instance_id: crypto.randomUUID(),
    p_rows: [],
    p_facts: [],
    p_attempts: 1,
    p_model: 'capability-proof',
  })
  check(legacyVerdictCompletion.error?.message.includes('permission denied') === true,
    'ordinary clients cannot publish keepsakes through the legacy verdict completion')

  const revisionTamper = await anon.from('rooms')
    .update({ operator_capability_revision: 99 })
    .eq('id', room.id)
    .select('operator_capability_revision')
    .single()
  check(revisionTamper.error !== null,
    'ordinary clients cannot forge the capability invalidation revision')

  const { data: status, error: statusError } = await service.rpc(
    'room_operator_capability_status',
    { p_room_id: room.id },
  )
  if (statusError) throw statusError
  check(status.issued === true && status.generation === 2,
    'the service-only status exposes generation without exposing the bearer')
  const { data: rotatedRevisionRoom, error: rotatedRevisionError } = await anon.from('rooms')
    .select('operator_capability_revision')
    .eq('id', room.id)
    .single()
  if (rotatedRevisionError) throw rotatedRevisionError
  check(rotatedRevisionRoom.operator_capability_revision === 2,
    'rotation advances the room revision to the current private generation')

  console.log(`PASS ${checks} operator capability checks`)
} finally {
  if (existsSync(tokenPath)) unlinkSync(tokenPath)
  if (existsSync(linkPath)) unlinkSync(linkPath)
  if (roomId) {
    await service.from('rooms').update({ host_id: null }).eq('id', roomId)
    await service.from('players').delete().eq('room_id', roomId)
    await service.from('rooms').delete().eq('id', roomId)
    const { data: status } = await service.rpc('room_operator_capability_status', {
      p_room_id: roomId,
    })
    check(status?.issued === false,
      'room cleanup cascades the private capability hash')
  }
}
