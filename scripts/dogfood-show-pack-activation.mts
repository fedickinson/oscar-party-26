#!/usr/bin/env -S node --import tsx

/**
 * Exercise the real show-pack activation command against the local stack.
 *
 * The activation catalog is immutable once published, so this dogfood retains
 * one deterministic local fixture. A final `supabase db reset --local` removes
 * it and proves that the authored seed remains the clean-install baseline.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { normalizeOperatorCapability } from '../src/lib/operator-capability'
import { compileShowPack, parseShowPack } from '../src/lib/show-pack'
import { buildShowPackActivationPlan } from '../src/lib/show-pack-activation'
import { supabaseConfig } from './lib/env.mts'

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const workspace = mkdtempSync('/private/tmp/show-pack-activation-')
const { target, url, anonKey, serviceKey } = supabaseConfig('local')
if (target !== 'local') throw new Error('show-pack activation dogfood is local-only')
if (!serviceKey) throw new Error('local Supabase did not report a service role key')

const browser = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const observer = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const service = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
let checks = 0
let roomId: string | null = null
let noIdentityRoomId: string | null = null

function check(condition: unknown, message: string): asserts condition {
  checks += 1
  if (!condition) throw new Error(message)
  console.log(`PASS ${message}`)
}

async function waitFor(predicate: () => boolean, timeoutMs = 4_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('timed out waiting for identity selection Realtime state')
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function runActivation(args: string[]): string {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', 'scripts/activate-show-pack.mts', ...args],
    { cwd: repoRoot, encoding: 'utf8', timeout: 30_000 },
  )
  if (result.error) throw result.error
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (output.trim()) console.log(output.trim())
  if (result.status !== 0) {
    throw new Error(`activation command exited ${result.status ?? 'without a status'}`)
  }
  return output
}

async function main(): Promise<void> {
  console.log('────────────────────────────────────────────────────────────')
  console.log(`  target: ${target}  ${url}`)
  console.log('────────────────────────────────────────────────────────────')
  try {
    const proof = compileShowPack(parseShowPack(readFileSync(
      join(repoRoot, 'show-packs/examples/hotd-s3e8-proof.json'),
      'utf8',
    )))
    proof.pack.id = 'show-pack-contract-activation-dogfood'
    proof.pack.title = 'Show Pack Contract Activation Dogfood'
    // Compatibility metadata deliberately disagrees with the explicit Story
    // Night contract. The room must follow commitment, not fact_source.
    proof.pack.fact_source = 'scheduled'
    proof.bingo_squares = Array.from({ length: 24 }, (_, index) => ({
      ...structuredClone(proof.bingo_squares[0]),
      id: `activation-square-${String(index + 1).padStart(2, '0')}`,
      title: `Activation square ${index + 1}`,
    }))
    proof.game_contract!.conviction_budget = 1
    proof.game_contract!.identity = { selection: 'chosen_faction', scoring: 'none' }
    proof.game_contract!.scarcity.identity = 'shared'
    proof.entities[1].group = 'The Blacks'
    const plan = await buildShowPackActivationPlan(proof)
    const inputPath = join(workspace, 'activation-pack.json')
    writeFileSync(inputPath, `${JSON.stringify(proof, null, 2)}\n`, 'utf8')

    const roomCode = `ACT${String(Math.floor(Math.random() * 10_000)).padStart(4, '0')}`
    const { data: session, error: createError } = await browser.rpc('create_room_with_host', {
      p_code: roomCode,
      p_name: 'Activation Host',
      p_avatar_id: 'targaryen',
      p_color: '#D4AF37',
    })
    if (createError) throw createError
    roomId = session.room.id as string
    const capability = normalizeOperatorCapability(session.operator_capability)
    if (!capability) throw new Error('activation room returned no operator capability')
    check(session.room.phase === 'lobby', 'disposable activation room begins in the lobby')

    const commandArgs = ['--input', inputPath, '--room', roomCode]
    const dryRun = runActivation(commandArgs)
    check(dryRun.includes('mode=dry-run'), 'activation command defaults to a dry run')
    check(dryRun.includes('activatable=true; no rows written'), 'dry run completes without catalog writes')

    const applied = runActivation([...commandArgs, '--apply', '--confirm-room', roomCode])
    check(applied.includes(`bound ${roomCode} to ${proof.pack.id}@${proof.pack.version}`),
      'confirmed command publishes and binds the compiled pack')

    const { data: registry, error: registryError } = await service
      .from('show_packs')
      .select('id,status,manifest_sha256')
      .eq('id', plan.showPackId)
      .single()
    if (registryError) throw registryError
    check(registry.status === 'published', 'activation publishes the registry only after catalog attestation')
    check(registry.manifest_sha256 === plan.manifestSha256, 'published registry retains the compiled manifest hash')

    const { data: boundRoom, error: roomError } = await service
      .from('rooms')
      .select('show_pack_id,game_model,game_contract')
      .eq('id', roomId)
      .single()
    if (roomError) throw roomError
    check(boundRoom.show_pack_id === plan.showPackId, 'room binding points at the exact published registry')
    check(boundRoom.game_model === 'conviction_portfolio',
      'explicit commitment selects conviction independently from scheduled fact metadata')
    check(canonicalJson(boundRoom.game_contract) === canonicalJson(plan.compiled.game_contract),
      'room binding copies the explicit pack contract')
    check(boundRoom.game_contract?.conviction_budget === 1,
      'room binding preserves the pack-owned conviction budget')
    check(boundRoom.game_contract?.identity.selection === 'chosen_faction',
      'room binding preserves the shared faction ceremony')

    const { data: options, error: optionsError } = await browser.rpc('show_pack_identity_choices', {
      p_show_pack_id: plan.showPackId,
    })
    if (optionsError) throw optionsError
    check(options.map((option: { choice_key: string }) => option.choice_key).join('|') === 'The Greens|The Blacks',
      'the published entity groups become ordered pack-owned identity choices')

    const directChoice = await browser.from('player_identity_selections').insert({
      room_id: roomId,
      player_id: session.player.id,
      show_pack_id: plan.showPackId,
      choice_key: 'The Greens',
    })
    check(directChoice.error?.message.includes('permission denied'),
      'ordinary browsers cannot bypass the identity choice command')

    const invalidChoice = await browser.rpc('set_player_identity_choice', {
      p_room_id: roomId,
      p_actor_player_id: session.player.id,
      p_choice_key: 'Not Authored',
    })
    check(invalidChoice.error?.message.includes('not authored'),
      'a seat cannot invent an identity outside its room show pack')

    let liveIdentityChoice: string | null = null
    const identityChannel = observer.channel(`activation-identity:${roomId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'player_identity_selections', filter: `room_id=eq.${roomId}`,
      }, (payload) => {
        if (payload.eventType !== 'DELETE') {
          liveIdentityChoice = (payload.new as { choice_key: string }).choice_key
        }
      })
    await new Promise<void>((resolve, reject) => {
      identityChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolve()
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          reject(new Error(`identity channel failed with ${status}`))
        }
      })
    })

    const hostChoice = await browser.rpc('set_player_identity_choice', {
      p_room_id: roomId,
      p_actor_player_id: session.player.id,
      p_choice_key: 'The Greens',
    })
    if (hostChoice.error) throw hostChoice.error
    let coldChoiceArrivedDirectly = true
    try {
      await waitFor(() => liveIdentityChoice === 'The Greens', 1_500)
    } catch {
      coldChoiceArrivedDirectly = false
    }
    if (!coldChoiceArrivedDirectly) {
      const { data: reconciled, error: reconcileError } = await observer
        .from('player_identity_selections')
        .select('choice_key')
        .eq('room_id', roomId)
        .eq('player_id', session.player.id)
        .single()
      if (reconcileError) throw reconcileError
      liveIdentityChoice = reconciled.choice_key
    }
    check(liveIdentityChoice === 'The Greens',
      'canonical hydration recovers a choice even if the cold Realtime event is missed')

    await new Promise((resolve) => setTimeout(resolve, 3_750))
    const warmChoice = await browser.rpc('set_player_identity_choice', {
      p_room_id: roomId,
      p_actor_player_id: session.player.id,
      p_choice_key: 'The Blacks',
    })
    if (warmChoice.error) throw warmChoice.error
    await waitFor(() => liveIdentityChoice === 'The Blacks')
    check(true, 'a warm identity update reaches another subscribed client')

    const onePlayerStart = await browser.rpc('begin_room_convictions_authorized', {
      p_room_id: roomId,
      p_actor_player_id: session.player.id,
      p_operator_capability: capability,
    })
    check(onePlayerStart.error?.message.includes('at least two players'),
      'a chosen-faction room still requires a multiplayer roster')

    const { data: guest, error: guestError } = await browser.from('players').insert({
      room_id: roomId,
      name: 'Activation Guest',
      avatar_id: 'stark',
      color: '#7C3AED',
      is_host: false,
    }).select().single()
    if (guestError) throw guestError

    const incompleteIdentity = await browser.rpc('begin_room_convictions_authorized', {
      p_room_id: roomId,
      p_actor_player_id: session.player.id,
      p_operator_capability: capability,
    })
    check(incompleteIdentity.error?.message.includes('every room player must choose'),
      'the host cannot open convictions while an occupied seat has no identity')

    const foreignActorChoice = await browser.rpc('set_player_identity_choice', {
      p_room_id: roomId,
      p_actor_player_id: crypto.randomUUID(),
      p_choice_key: 'The Greens',
    })
    check(foreignActorChoice.error?.message.includes('not seated'),
      'the identity command rejects a player outside the exact room')

    const guestChoice = await browser.rpc('set_player_identity_choice', {
      p_room_id: roomId,
      p_actor_player_id: guest.id,
      p_choice_key: 'The Greens',
    })
    if (guestChoice.error) throw guestChoice.error
    const changedHostChoice = await browser.rpc('set_player_identity_choice', {
      p_room_id: roomId,
      p_actor_player_id: session.player.id,
      p_choice_key: 'The Blacks',
    })
    if (changedHostChoice.error) throw changedHostChoice.error
    const { data: identityLedger, error: ledgerError } = await browser
      .from('player_identity_selections')
      .select('player_id,choice_key')
      .eq('room_id', roomId)
    if (ledgerError) throw ledgerError
    check(identityLedger.length === 2
      && identityLedger.some((entry) => entry.player_id === guest.id && entry.choice_key === 'The Greens')
      && identityLedger.some((entry) => entry.player_id === session.player.id && entry.choice_key === 'The Blacks'),
    'shared choices allow the same banner and remain changeable per seat in the lobby')

    const { data: beats, error: beatError } = await browser
      .from('signature_beats')
      .select('id')
      .eq('show_pack_id', plan.showPackId)
      .order('id')
    if (beatError) throw beatError
    check(beats.length >= 2, 'activated pack exposes enough beats to probe its budget')

    const wrongBearer = await browser.rpc('begin_room_convictions_authorized', {
      p_room_id: roomId,
      p_actor_player_id: session.player.id,
      p_operator_capability: '0'.repeat(64),
    })
    check(wrongBearer.error?.message.includes('valid operator capability'),
      'the host seat alone cannot skip the identity ceremony')

    const guestActor = await browser.rpc('begin_room_convictions_authorized', {
      p_room_id: roomId,
      p_actor_player_id: guest.id,
      p_operator_capability: capability,
    })
    check(guestActor.error?.message.includes('current room host authority'),
      'the bearer alone cannot let a guest open convictions')

    const staleDraftClient = await browser.rpc('begin_room_draft_authorized', {
      p_room_id: roomId,
      p_actor_player_id: session.player.id,
      p_operator_capability: capability,
      p_draft_order: [session.player.id, guest.id],
    })
    check(staleDraftClient.error?.message.includes('does not include an identity draft'),
      'a stale client cannot mistake shared faction choice for an exclusive draft')

    const opened = await browser.rpc('begin_room_convictions_authorized', {
      p_room_id: roomId,
      p_actor_player_id: session.player.id,
      p_operator_capability: capability,
    })
    if (opened.error) throw opened.error
    check(opened.data.phase === 'confidence'
      && opened.data.draft_order.length === 0
      && opened.data.ready_players.length === 0,
    'the authoritative command moves a complete faction roster into convictions')

    const frozenChoice = await browser.rpc('set_player_identity_choice', {
      p_room_id: roomId,
      p_actor_player_id: session.player.id,
      p_choice_key: 'The Greens',
    })
    check(frozenChoice.error?.message.includes('frozen after the lobby'),
      'identity choices freeze when the room leaves the lobby')

    const lateSeat = await browser.from('players').insert({
      room_id: roomId,
      name: 'Late Faction Seat',
      avatar_id: 'velaryon',
      color: '#059669',
      is_host: false,
    })
    check(lateSeat.error?.message.includes('cannot add an unselected seat'),
      'a chosen-faction room cannot acquire an unselected seat after lobby close')

    const { count: draftCount, error: draftCountError } = await browser
      .from('draft_picks')
      .select('id', { count: 'exact', head: true })
      .eq('room_id', roomId)
    if (draftCountError) throw draftCountError
    check(draftCount === 0, 'shared faction identity creates no draft ownership')
    const firstBelief = await browser.from('conviction_picks').insert({
      room_id: roomId,
      player_id: session.player.id,
      beat_id: beats[0].id,
    })
    if (firstBelief.error) throw firstBelief.error
    const overBudget = await browser.from('conviction_picks').insert({
      room_id: roomId,
      player_id: session.player.id,
      beat_id: beats[1].id,
    })
    check(overBudget.error?.message.includes('already uses all 1 slots'),
      'database writes enforce the room-bound one-slot budget')

    const live = await browser.rpc('open_room_live_authorized', {
      p_room_id: roomId,
      p_actor_player_id: session.player.id,
      p_operator_capability: capability,
    })
    if (live.error) throw live.error
    check(live.data.phase === 'live',
      'the chosen-faction room opens live play after convictions')

    const finished = await browser.rpc('close_live_floor_authorized', {
      p_room_id: roomId,
      p_actor_player_id: session.player.id,
      p_operator_capability: capability,
    })
    if (finished.error) throw finished.error
    check(finished.data.phase === 'finished',
      'the chosen-faction room finishes normally with no draft ownership')

    const { error: mutationError } = await service
      .from('rooms')
      .update({ game_contract: { ...plan.compiled.game_contract, conviction_budget: 11 } })
      .eq('id', roomId)
    check(mutationError !== null, 'room contract cannot change independently from its show pack')

    const repeated = runActivation([...commandArgs, '--apply', '--confirm-room', roomCode])
    check(repeated.includes('catalog=attested status=published'), 'repeat apply re-attests the immutable catalog')
    check(repeated.includes(`bound ${roomCode}`), 'repeat apply is idempotent at the binding boundary')
    await identityChannel.unsubscribe()

    const noIdentityProof = structuredClone(proof)
    noIdentityProof.pack.id = 'show-pack-no-identity-activation-dogfood'
    noIdentityProof.pack.title = 'No Identity Activation Dogfood'
    noIdentityProof.game_contract!.identity = { selection: 'none', scoring: 'none' }
    noIdentityProof.game_contract!.scarcity.identity = 'none'
    const noIdentityInputPath = join(workspace, 'no-identity-pack.json')
    writeFileSync(noIdentityInputPath, `${JSON.stringify(noIdentityProof, null, 2)}\n`, 'utf8')
    const noIdentityCode = `NID${String(Math.floor(Math.random() * 10_000)).padStart(4, '0')}`
    const { data: noIdentitySession, error: noIdentityCreateError } = await browser.rpc(
      'create_room_with_host',
      {
        p_code: noIdentityCode,
        p_name: 'No Identity Host',
        p_avatar_id: 'targaryen',
        p_color: '#D4AF37',
      },
    )
    if (noIdentityCreateError) throw noIdentityCreateError
    noIdentityRoomId = noIdentitySession.room.id as string
    const noIdentityCapability = normalizeOperatorCapability(noIdentitySession.operator_capability)
    if (!noIdentityCapability) throw new Error('no-identity room returned no operator capability')
    runActivation([
      '--input', noIdentityInputPath,
      '--room', noIdentityCode,
      '--apply',
      '--confirm-room', noIdentityCode,
    ])
    const noIdentityGuest = await browser.from('players').insert({
      room_id: noIdentityRoomId,
      name: 'No Identity Guest',
      avatar_id: 'stark',
      color: '#7C3AED',
      is_host: false,
    }).select().single()
    if (noIdentityGuest.error) throw noIdentityGuest.error
    const noIdentityDraft = await browser.rpc('begin_room_draft_authorized', {
      p_room_id: noIdentityRoomId,
      p_actor_player_id: noIdentitySession.player.id,
      p_operator_capability: noIdentityCapability,
      p_draft_order: [noIdentitySession.player.id, noIdentityGuest.data.id],
    })
    check(noIdentityDraft.error?.message.includes('does not include an identity draft'),
      'an explicit no-identity contract still rejects the stale draft path')
    const noIdentityOpened = await browser.rpc('begin_room_convictions_authorized', {
      p_room_id: noIdentityRoomId,
      p_actor_player_id: noIdentitySession.player.id,
      p_operator_capability: noIdentityCapability,
    })
    if (noIdentityOpened.error) throw noIdentityOpened.error
    check(noIdentityOpened.data.phase === 'confidence',
      'an explicit no-identity contract still opens convictions without a selection ledger')
    console.log(`\n${checks} show-pack activation checks passed.`)
  } finally {
    if (noIdentityRoomId) {
      const { error } = await service.from('rooms').delete().eq('id', noIdentityRoomId)
      if (error) console.error(`[show-pack-activation-dogfood] cleanup warning: ${error.message}`)
      else console.log('PASS removed the disposable no-identity room')
    }
    if (roomId) {
      const { error } = await service.from('rooms').delete().eq('id', roomId)
      if (error) console.error(`[show-pack-activation-dogfood] cleanup warning: ${error.message}`)
      else console.log('PASS removed the disposable activation room')
    }
    rmSync(workspace, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(`[show-pack-activation-dogfood] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
