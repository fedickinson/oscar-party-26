#!/usr/bin/env -S npx tsx

/**
 * Complete local-only two-player Story Night proof.
 *
 * The default run creates a room through the browser command surface, walks
 * both seats through identity draft and convictions, declares two sourced
 * screen facts, closes the live floor, settles the researched record through
 * the operator CLI, verifies the second-client phase updates, then removes the
 * disposable room. The published catalog is read-only.
 *
 * Use --retain-provisional to stop at results and write a 0600 fixture file.
 * Then use --settle-retained and --cleanup-retained around mobile inspection.
 *
 *   npx tsx scripts/dogfood-story-night.mts
 *   npx tsx scripts/dogfood-story-night.mts --retain-provisional --fixture /private/tmp/story-night.json
 *   npx tsx scripts/dogfood-story-night.mts --settle-retained --fixture /private/tmp/story-night.json
 *   npx tsx scripts/dogfood-story-night.mts --cleanup-retained --fixture /private/tmp/story-night.json
 */

import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { parseSettlementReceipt } from '../src/lib/settlement-receipt'
import { supabaseConfig } from './lib/env.mts'

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const { target, url, anonKey, serviceKey } = supabaseConfig('local')
if (target !== 'local') throw new Error('Story Night dogfood is local-only')
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

type Fixture = {
  code: string
  roomId: string
  hostId: string
  guestId: string
  capability: string
  manifestPath: string
  receiptPath: string
  settlementId?: string
}

type Beat = {
  id: number
  name: string
  points: number
  entity_id: string
  trigger_contract: Record<string, unknown>
}

type Declaration = {
  category: { id: number; name: string; points: number }
  winnerName: string
}

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(name)
  return index >= 0 ? resolve(process.argv[index + 1] ?? fallback) : fallback
}

const fixturePath = option('--fixture', '/private/tmp/oscar-story-night-fixture.json')
const retainProvisional = process.argv.includes('--retain-provisional')
const settleRetained = process.argv.includes('--settle-retained')
const cleanupRetained = process.argv.includes('--cleanup-retained')
if ([retainProvisional, settleRetained, cleanupRetained].filter(Boolean).length > 1) {
  throw new Error('choose only one retained-fixture action')
}

let checks = 0
let activeRoomId: string | null = null
function check(condition: unknown, message: string): asserts condition {
  checks += 1
  if (!condition) throw new Error(message)
  console.log(`PASS ${message}`)
}

async function waitFor(predicate: () => boolean, timeoutMs = 8_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (predicate()) return true
    await new Promise((resolveWait) => setTimeout(resolveWait, 25))
  }
  return false
}

function readFixture(): Fixture {
  if (!existsSync(fixturePath)) throw new Error(`fixture not found: ${fixturePath}`)
  return JSON.parse(readFileSync(fixturePath, 'utf8')) as Fixture
}

function writeFixture(fixture: Fixture): void {
  writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`, { flag: 'wx' })
  chmodSync(fixturePath, 0o600)
}

async function cleanup(fixture: Fixture, removeFile: boolean): Promise<void> {
  const roomResult = await service.from('rooms')
    .select('id,phase,active_settlement_id')
    .eq('id', fixture.roomId)
    .maybeSingle()
  if (roomResult.error) throw roomResult.error
  if (roomResult.data) {
    const repair = await service.from('rooms').update({
      active_settlement_id: null,
      phase: 'lobby',
      host_id: null,
    }).eq('id', fixture.roomId)
    if (repair.error) throw repair.error
    const deletion = await service.from('rooms').delete().eq('id', fixture.roomId)
    if (deletion.error) throw deletion.error
  }
  const remaining = await service.from('rooms')
    .select('id', { count: 'exact', head: true })
    .eq('id', fixture.roomId)
  if (remaining.error) throw remaining.error
  check(remaining.count === 0, 'removed the disposable Story Night room and all room-owned rows')
  for (const path of [fixture.manifestPath, fixture.receiptPath]) {
    if (existsSync(path)) unlinkSync(path)
  }
  if (removeFile && existsSync(fixturePath)) unlinkSync(fixturePath)
}

function runSettlement(fixture: Fixture): string {
  const result = spawnSync('npx', [
    'tsx', 'scripts/settle-room.mts',
    '--room', fixture.code,
    '--manifest', fixture.manifestPath,
    '--apply',
    '--confirm-room', fixture.code,
    '--receipt', fixture.receiptPath,
  ], {
    cwd: repoRoot,
    env: { ...process.env, SUPABASE_TARGET: 'local' },
    encoding: 'utf8',
    timeout: 120_000,
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (output.trim()) console.log(output.trim())
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`settle-room exited ${result.status ?? 'without status'}`)
  return output
}

async function settle(fixture: Fixture, expectRealtime: boolean): Promise<void> {
  const phases: string[] = []
  const channel = observer.channel(`story-night-settlement:${fixture.roomId}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'rooms',
      filter: `id=eq.${fixture.roomId}`,
    }, (payload) => {
      const phase = (payload.new as { phase?: string }).phase
      if (phase) phases.push(phase)
    })
  if (expectRealtime) {
    const subscribed = await Promise.race([
      new Promise<boolean>((resolveSubscribe, rejectSubscribe) => {
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') resolveSubscribe(true)
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            rejectSubscribe(new Error(`settlement channel failed with ${status}`))
          }
        })
      }),
      new Promise<false>((resolveSubscribe) => {
        setTimeout(() => resolveSubscribe(false), 8_000)
      }),
    ])
    if (!subscribed) console.log('INFO settlement channel remained cold; canonical reconciliation will decide')
  }

  const output = runSettlement(fixture)
  check(output.includes('applied settlement v1'), 'the operator command writes settlement version 1')
  const roomResult = await service.from('rooms')
    .select('phase,active_settlement_id')
    .eq('id', fixture.roomId)
    .single()
  if (roomResult.error) throw roomResult.error
  check(
    roomResult.data.phase === 'closed' && roomResult.data.active_settlement_id != null,
    'settlement writes back one canonical record and closes the room',
  )
  if (expectRealtime) {
    const receivedClosed = await waitFor(() => phases.includes('closed'))
    const reconciledClosed = await observer.from('rooms')
      .select('phase,active_settlement_id')
      .eq('id', fixture.roomId)
      .single()
    if (reconciledClosed.error) throw reconciledClosed.error
    check(
      reconciledClosed.data.phase === 'closed'
        && reconciledClosed.data.active_settlement_id === roomResult.data.active_settlement_id,
      'the subscribed second client reconciles the canonical closed record',
    )
    console.log(
      `INFO closed phase broadcast ${receivedClosed ? 'arrived' : 'was missed'} during the cold-worker window`,
    )
  }
  const receipt = parseSettlementReceipt(readFileSync(fixture.receiptPath, 'utf8'))
  check(
    receipt.room_id === fixture.roomId
      && receipt.players.length === 2
      && receipt.settled_facts?.length === 2
      && receipt.score_events.length === 3,
    'the receipt carries both players, both facts, and all conviction payouts',
  )
  fixture.settlementId = roomResult.data.active_settlement_id
  writeFileSync(fixturePath, `${JSON.stringify(fixture, null, 2)}\n`)
  chmodSync(fixturePath, 0o600)
  await observer.removeChannel(channel)
}

async function createStoryNight(): Promise<Fixture> {
  if (existsSync(fixturePath)) throw new Error(`fixture already exists: ${fixturePath}`)
  const code = `STY${Math.floor(Math.random() * 10_000).toString().padStart(4, '0')}`
  const created = await anon.rpc('create_room_with_host', {
    p_code: code,
    p_name: 'Story Host',
    p_avatar_id: 'targaryen',
    p_color: '#D4AF37',
  })
  if (created.error) throw created.error
  const room = created.data.room
  activeRoomId = room.id
  const host = created.data.player
  const capability = String(created.data.operator_capability)
  const guestResult = await anon.from('players').insert({
    room_id: room.id,
    name: 'Story Guest',
    avatar_id: 'stark',
    color: '#7C3AED',
    is_host: false,
  }).select().single()
  if (guestResult.error) throw guestResult.error
  const guest = guestResult.data
  check(room.game_model === 'conviction_portfolio' && room.host_id === host.id,
    'the browser command creates a conviction room with one current host')
  check(guest.id !== host.id, 'a second player joins the same Story Night room')

  const provisionalPhases: string[] = []
  const phaseChannel = observer.channel(`story-night-phases:${room.id}`)
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${room.id}`,
    }, (payload) => {
      const phase = (payload.new as { phase?: string }).phase
      if (phase) provisionalPhases.push(phase)
    })
  await Promise.race([
    new Promise<void>((resolveSubscribe, rejectSubscribe) => {
      phaseChannel.subscribe((status) => {
        if (status === 'SUBSCRIBED') resolveSubscribe()
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          rejectSubscribe(new Error(`phase channel failed with ${status}`))
        }
      })
    }),
    new Promise<never>((_, rejectSubscribe) => {
      setTimeout(() => rejectSubscribe(new Error('phase channel did not subscribe')), 8_000)
    }),
  ])

  const order = [host.id, guest.id]
  const begun = await anon.rpc('begin_room_draft_authorized', {
    p_room_id: room.id,
    p_actor_player_id: host.id,
    p_operator_capability: capability,
    p_draft_order: order,
  })
  if (begun.error) throw begun.error
  for (const player of [host, guest]) {
    const ready = await anon.rpc('mark_player_ready', {
      p_room_id: room.id,
      p_player_id: player.id,
    })
    if (ready.error) throw ready.error
  }
  const countdown = await anon.rpc('begin_room_draft_countdown_authorized', {
    p_room_id: room.id,
    p_actor_player_id: host.id,
    p_operator_capability: capability,
  })
  if (countdown.error) throw countdown.error
  const ageCountdown = await service.from('rooms').update({
    countdown_started_at: new Date(Date.now() - 4_000).toISOString(),
  }).eq('id', room.id)
  if (ageCountdown.error) throw ageCountdown.error
  const opened = await anon.rpc('open_room_draft_authorized', {
    p_room_id: room.id,
    p_actor_player_id: host.id,
    p_operator_capability: capability,
  })
  if (opened.error) throw opened.error
  check(opened.data.phase === 'draft', 'both ready seats enter the shared identity draft')

  const entities = await anon.from('draft_entities').select('id,type')
    .eq('show_pack_id', room.show_pack_id).eq('type', 'film').order('id').limit(2)
  if (entities.error) throw entities.error
  check(entities.data.length === 2, 'the room has two identity-draft choices')
  for (const [pickNumber, player] of [host, guest].entries()) {
    const pick = await anon.from('draft_picks').insert({
      room_id: room.id,
      player_id: player.id,
      entity_id: entities.data[pickNumber].id,
      round: 1,
      pick_number: pickNumber,
    })
    if (pick.error) throw pick.error
  }
  const complete = await anon.rpc('complete_room_draft_authorized', {
    p_room_id: room.id,
    p_actor_player_id: host.id,
    p_operator_capability: capability,
  })
  if (complete.error) throw complete.error
  check(complete.data.phase === 'confidence', 'the completed identity draft opens convictions')

  const beatsResult = await anon.from('signature_beats')
    .select('id,name,points,entity_id,trigger_contract')
    .eq('show_pack_id', room.show_pack_id)
    .order('id')
    .limit(2)
  if (beatsResult.error) throw beatsResult.error
  const beats = beatsResult.data as Beat[]
  check(beats.length === 2, 'two authored conviction triggers are available')
  const convictions = await anon.from('conviction_picks').insert([
    { room_id: room.id, player_id: host.id, beat_id: beats[0].id },
    { room_id: room.id, player_id: guest.id, beat_id: beats[0].id },
    { room_id: room.id, player_id: guest.id, beat_id: beats[1].id },
  ])
  if (convictions.error) throw convictions.error
  check(true, 'both players commit to one shared belief and one guest-only belief')

  const squaresResult = await anon.from('bingo_squares')
    .select('id')
    .eq('show_pack_id', room.show_pack_id)
    .order('id')
    .limit(48)
  if (squaresResult.error) throw squaresResult.error
  check(squaresResult.data.length >= 24, 'the room has enough authored squares for both cards')
  const squareIds = squaresResult.data.map((square) => square.id)
  const cards = [host, guest].map((player, index) => {
    const offset = index * 7
    const pool = [...squareIds.slice(offset), ...squareIds.slice(0, offset)].slice(0, 24)
    return {
      player,
      squares: [...pool.slice(0, 12), 0, ...pool.slice(12)],
    }
  })
  for (const card of cards) {
    const dealt = await anon.rpc('deal_player_bingo_card', {
      p_room_id: room.id,
      p_actor_player_id: card.player.id,
      p_squares: card.squares,
    })
    if (dealt.error) throw dealt.error
  }
  check(true, 'both players own validated room-pack bingo cards')

  const live = await anon.rpc('open_room_live_authorized', {
    p_room_id: room.id,
    p_actor_player_id: host.id,
    p_operator_capability: capability,
  })
  if (live.error) throw live.error
  check(live.data.phase === 'live', 'the operator opens live play for both clients')

  const declarations: Declaration[] = []
  for (const beat of beats) {
    const entityResult = await anon.from('draft_entities').select('name')
      .eq('id', beat.entity_id).single()
    if (entityResult.error) throw entityResult.error
    const nomineeResult = await anon.from('nominees').select('id')
      .eq('show_pack_id', room.show_pack_id)
      .eq('name', entityResult.data.name)
      .single()
    if (nomineeResult.error) throw nomineeResult.error
    const declared = await anon.rpc('declare_room_event_authorized', {
      p_room_id: room.id,
      p_name: beat.name,
      p_points: beat.points,
      p_nominee_id: nomineeResult.data.id,
      p_actor_player_id: host.id,
      p_operator_capability: capability,
      p_source_signature_beat_id: beat.id,
      p_source_trigger_contract: beat.trigger_contract,
    })
    if (declared.error) throw declared.error
    declarations.push({
      ...(declared.data as Omit<Declaration, 'winnerName'>),
      winnerName: entityResult.data.name,
    })
  }
  check(declarations.length === 2, 'the operator declares two grounded authored facts')

  const closedFloor = await anon.rpc('close_live_floor_authorized', {
    p_room_id: room.id,
    p_actor_player_id: host.id,
    p_operator_capability: capability,
  })
  if (closedFloor.error) throw closedFloor.error
  check(closedFloor.data.phase === 'finished', 'one operator action closes live play into provisional results')
  const receivedFinished = await waitFor(() => provisionalPhases.includes('finished'))
  const reconciledFinished = await observer.from('rooms')
    .select('phase')
    .eq('id', room.id)
    .single()
  if (reconciledFinished.error) throw reconciledFinished.error
  check(reconciledFinished.data.phase === 'finished',
    'the subscribed second client reconciles the canonical provisional phase')
  console.log(
    `INFO provisional phase broadcast ${receivedFinished ? 'arrived' : 'was missed'} during the cold-worker window`,
  )

  const hostTotal = Math.floor(beats[0].points / 2)
  const guestTotal = hostTotal + beats[1].points
  const manifestPath = `/private/tmp/${code}-story-night-manifest.json`
  const receiptPath = `/private/tmp/${code}-story-night-receipt.json`
  const manifest = {
    version: 1,
    title: 'Two-player Story Night proof',
    actor: 'Story Night dogfood',
    entries: declarations.map((declaration, index) => ({
      key: `story-beat-${beats[index].id}`,
      name: declaration.category.name,
      category_id: declaration.category.id,
      outcome: 'resolved',
      points: declaration.category.points,
      winner: declaration.winnerName,
      warrant: {
        verdict: 'true',
        sources: [{ kind: 'fixture', ref: `local Story Night beat ${beats[index].id}` }],
      },
    })),
    bingo: { mode: 'replace', marks: [] },
    expected: {
      player_totals: { [host.id]: hostTotal, [guest.id]: guestTotal },
      character_points: {},
    },
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' })
  const fixture: Fixture = {
    code,
    roomId: room.id,
    hostId: host.id,
    guestId: guest.id,
    capability,
    manifestPath,
    receiptPath,
  }
  writeFixture(fixture)
  await observer.removeChannel(phaseChannel)
  return fixture
}

if (cleanupRetained) {
  await cleanup(readFixture(), true)
  process.exit(0)
}

if (settleRetained) {
  const fixture = readFixture()
  await settle(fixture, true)
  console.log(`PASS ${checks} retained Story Night settlement checks`)
  process.exit(0)
}

let fixture: Fixture | null = null
try {
  fixture = await createStoryNight()
  if (retainProvisional) {
    console.log(`PASS retained provisional Story Night ${fixture.code} at ${fixturePath}`)
  } else {
    await settle(fixture, true)
    console.log(`PASS ${checks} complete two-player Story Night checks`)
  }
} finally {
  await observer.removeAllChannels()
  if (fixture && !retainProvisional) await cleanup(fixture, true)
  if (!fixture && activeRoomId) {
    const repair = await service.from('rooms').update({
      active_settlement_id: null,
      phase: 'lobby',
      host_id: null,
    }).eq('id', activeRoomId)
    if (repair.error) throw repair.error
    const deletion = await service.from('rooms').delete().eq('id', activeRoomId)
    if (deletion.error) throw deletion.error
  }
}
