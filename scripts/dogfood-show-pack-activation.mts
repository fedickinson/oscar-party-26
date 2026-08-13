#!/usr/bin/env -S node --import tsx

/**
 * Exercise the real show-pack activation command against the local stack.
 *
 * The activation catalog is immutable once published, so this dogfood retains
 * one deterministic local fixture. A final `supabase db reset --local` removes
 * it and proves that the authored seed remains the clean-install baseline.
 * Pass `--second-property` only with protected local-catalog authorization to
 * add the complete Lantern Watch room, settlement and ceremony rehearsal.
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { normalizeOperatorCapability } from '../src/lib/operator-capability'
import { compileShowPack, parseShowPack } from '../src/lib/show-pack'
import { buildShowPackActivationPlan } from '../src/lib/show-pack-activation'
import {
  parseSettlementReceipt,
  type SettlementReceipt,
} from '../src/lib/settlement-receipt'
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
let secondPropertyRoomId: string | null = null
const secondProperty = process.argv.includes('--second-property')

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

function runLocalCommand(script: string, args: string[], timeout = 120_000): string {
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', script, ...args],
    {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout,
      env: { ...process.env, SUPABASE_TARGET: 'local' },
    },
  )
  if (result.error) throw result.error
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  if (output.trim()) console.log(output.trim())
  if (result.status !== 0) {
    throw new Error(`${script} exited ${result.status ?? 'without a status'}`)
  }
  return output
}

function buildLanternWatchProof() {
  const authored = parseShowPack(readFileSync(
    join(repoRoot, 'show-packs/examples/hotd-s3e8-proof.json'),
    'utf8',
  ))
  authored.pack = {
    id: 'lantern-watch-story-night-dogfood-v3',
    version: 1,
    title: 'Lantern Watch Story Night Dogfood',
    property: 'The Lantern Watch',
    installment: 'The Bell at Midnight',
    fact_source: 'room_declared',
    canon_cutoff: 'The keeper and moth have reached the city gate.',
  }
  authored.sources = [{
    id: 'lantern-watch-screen-record',
    kind: 'screen',
    title: 'Lantern Watch witnessed screen record',
    locator: 'screen:lantern-watch:before-midnight',
  }, {
    id: 'lantern-watch-chronicle',
    kind: 'source_material',
    title: 'The Lantern Chronicle',
    locator: 'book:lantern-chronicle',
  }]
  authored.claims = [{
    id: 'keeper-reached-gate',
    canon: 'screen',
    status: 'verified',
    text: 'The Lantern Keeper had reached the city gate before midnight.',
    source_ids: ['lantern-watch-screen-record'],
  }, {
    id: 'moth-reached-gate',
    canon: 'screen',
    status: 'verified',
    text: 'The Ash Moth had followed the Lantern Keeper to the city gate.',
    source_ids: ['lantern-watch-screen-record'],
  }, {
    id: 'chronicle-treats-signals-seriously',
    canon: 'source_material',
    status: 'attitude_only',
    text: 'The source chronicle treats public signals as political commitments.',
    source_ids: ['lantern-watch-chronicle'],
  }]
  authored.entities = [{
    id: 'lantern-keeper',
    name: 'The Lantern Keeper',
    kind: 'person',
    group: 'Lantern Court',
    draftable: true,
    portrait: {
      path: '/avatars/v0/the-academy.png',
      sha256: '76a66e644e88e48d4e60b75112f4f2b785d093f2df239967615cac601da76116',
    },
    dossier: {
      fact_claim_ids: ['keeper-reached-gate'],
      discourse_claim_ids: [],
    },
  }, {
    id: 'ash-moth',
    name: 'The Ash Moth',
    kind: 'creature',
    group: 'Ash Court',
    draftable: true,
    portrait: {
      path: '/avatars/v0/will.png',
      sha256: 'eef4a1acd26d4302ab65704fce002a4cf870001a8017283ad1d32c74d10350e7',
    },
    dossier: {
      fact_claim_ids: ['moth-reached-gate'],
      discourse_claim_ids: [],
    },
  }]
  authored.predictions = [{
    id: 'midnight-signal-belongs-to',
    title: 'The Midnight Signal Belongs To',
    condition: 'The winning entity visibly controls the final public signal before midnight.',
    exclusions: ['A private plan or an unshown signal does not count.'],
    adjudication: { proxies: 'do_not_count', offscreen: 'do_not_count', mentions: 'do_not_count' },
    title_review: {
      status: 'approved',
      note: 'The title and condition name the same final public signal.',
    },
    basis_claim_ids: ['keeper-reached-gate', 'moth-reached-gate'],
    points: 10,
    tier: 1,
    candidate_entity_ids: ['lantern-keeper', 'ash-moth'],
  }]
  authored.signature_beats = [{
    id: 'keeper-lights-the-gate',
    entity_ids: ['lantern-keeper'],
    title: 'Lights the Gate',
    condition: 'The Lantern Keeper visibly lights the city gate signal on screen.',
    exclusions: ['Carrying an unlit lantern or discussing the signal does not count.'],
    adjudication: { proxies: 'do_not_count', offscreen: 'do_not_count', mentions: 'do_not_count' },
    title_review: {
      status: 'approved',
      note: 'The title names the exact visible action required by the condition.',
    },
    probability_pct: 70,
    likelihood_tier: 'likely',
    points: 20,
    pitch: 'The keeper has reached the gate with the signal still unresolved.',
    basis_claim_ids: ['keeper-reached-gate'],
  }, {
    id: 'moth-crosses-the-flame',
    entity_ids: ['ash-moth'],
    title: 'Crosses the Flame',
    condition: 'The Ash Moth visibly crosses through the lit gate signal on screen.',
    exclusions: ['Circling nearby or crossing an unlit gate does not count.'],
    adjudication: { proxies: 'do_not_count', offscreen: 'do_not_count', mentions: 'do_not_count' },
    title_review: {
      status: 'approved',
      note: 'The title and condition both require the same visible crossing.',
    },
    probability_pct: 40,
    likelihood_tier: 'toss_up',
    points: 25,
    pitch: 'The moth followed the keeper this far; the flame is the open question.',
    basis_claim_ids: ['moth-reached-gate'],
  }]
  authored.bingo_squares = [{
    id: 'bell-rings-before-midnight',
    title: 'Bell Before Midnight',
    condition: 'The city gate bell audibly rings before midnight on screen.',
    exclusions: ['A spoken plan to ring it or an inaudible bell does not count.'],
    adjudication: { proxies: 'do_not_count', offscreen: 'do_not_count', mentions: 'do_not_count' },
    title_review: {
      status: 'approved',
      note: 'The title and condition require the same audible bell before midnight.',
    },
    probability_pct: 50,
    likelihood_tier: 'toss_up',
    why_it_is_fun: 'The room can listen for one exact turning point.',
    storyline_tags: ['bell', 'gate', 'signal'],
    basis_claim_ids: ['keeper-reached-gate'],
  }]
  authored.commentary_voices = [{
    id: 'archivist',
    name: 'The Archivist',
    instruction: 'Judge public promises with calm precision.',
    attitude_claim_ids: ['chronicle-treats-signals-seriously'],
  }]
  authored.commentary_requests = []
  const compiled = compileShowPack(authored)
  compiled.game_contract!.conviction_budget = 2
  compiled.game_contract!.identity = { selection: 'none', scoring: 'none' }
  compiled.game_contract!.scarcity.identity = 'none'
  compiled.bingo_squares = Array.from({ length: 24 }, (_, index) => ({
    ...structuredClone(compiled.bingo_squares[0]),
    id: `lantern-watch-square-${String(index + 1).padStart(2, '0')}`,
    title: `Lantern Watch square ${index + 1}`,
  }))
  return compiled
}

function buildSettlementDrop(
  receipt: SettlementReceipt,
  receiptPath: string,
  receiptSha256: string,
  proof: ReturnType<typeof buildLanternWatchProof>,
) {
  const assetsDirectory = join(workspace, 'assets')
  mkdirSync(assetsDirectory)
  copyFileSync(join(repoRoot, 'public', proof.entities[0].portrait.path), join(assetsDirectory, 'keeper.png'))
  copyFileSync(join(repoRoot, 'public', proof.entities[1].portrait.path), join(assetsDirectory, 'moth.png'))
  const characterAsset = new Map(proof.entities.map((entity, index) => [
    entity.name,
    index === 0 ? 'keeper' : 'moth',
  ]))
  const characterEvents = new Map<string, string[]>()
  for (const event of receipt.score_events) {
    if (!event.character_id) continue
    characterEvents.set(event.character_id, [...(characterEvents.get(event.character_id) ?? []), event.id])
  }
  return {
    version: 1,
    settlement_receipt: {
      path: `./${receiptPath.split('/').at(-1)}`,
      sha256: receiptSha256,
    },
    show: {
      title: proof.pack.property,
      subtitle: proof.pack.installment,
      closing_title: 'The lantern goes dark',
      return_path: `/room/${receipt.room_code}/results`,
    },
    assets: {
      keeper: { path: './assets/keeper.png', alt: 'Portrait for the Lantern Keeper' },
      moth: { path: './assets/moth.png', alt: 'Portrait for the Ash Moth' },
    },
    players: receipt.players.map((player, index) => ({
      id: player.id,
      name: player.name,
      house: index === 0 ? 'Lantern Court' : 'Ash Court',
      accent: index === 0 ? 'gold' : 'violet',
      portrait_asset: index === 0 ? 'keeper' : 'moth',
    })),
    characters: receipt.characters.map((character) => ({
      id: character.id,
      name: character.name,
      kind: characterAsset.get(character.name) === 'moth' ? 'creature' : 'character',
      ...(character.player_id ? { player_id: character.player_id } : {}),
      portrait_asset: characterAsset.get(character.name) ?? 'keeper',
      muster_tier: (characterEvents.get(character.id)?.length ?? 0) > 0 ? 'lead' : 'present',
      drawer: {
        note: 'The closed settlement owns this character record.',
        beats: (characterEvents.get(character.id) ?? []).map((evidence_id) => ({ evidence_id })),
      },
    })),
    opening: {
      eyebrow: 'After the room closed',
      muster_title: 'Two courts took the field',
      begins_label: 'The record opens',
    },
    acts: [{
      id: 'the-signal',
      title: 'The Signal',
      subtitle: 'What the room declared and settlement closed',
      scene: 'keep',
      interstitial: { portrait_asset: 'keeper' },
      beats: [{
        id: 'gate-light',
        kicker: 'The declared turn',
        title: 'The gate was lit',
        summary: 'One authored proposition resolved and the conviction ledger followed it.',
        weight: 'ordinary',
        portrait_asset: 'keeper',
        ledger: receipt.score_events.map((event) => ({ evidence_id: event.id })),
        quotes: [],
      }],
    }],
  }
}

async function runSecondPropertyLoop(): Promise<void> {
  const proof = buildLanternWatchProof()
  const packPlan = await buildShowPackActivationPlan(proof)
  const inputPath = join(workspace, 'lantern-watch-pack.json')
  writeFileSync(inputPath, `${JSON.stringify(proof, null, 2)}\n`, 'utf8')

  const code = `LNT${String(Math.floor(Math.random() * 10_000)).padStart(4, '0')}`
  const { data: session, error: createError } = await browser.rpc('create_room_with_host', {
    p_code: code,
    p_name: 'Lantern Host',
    p_avatar_id: 'targaryen',
    p_color: '#D4AF37',
  })
  if (createError) throw createError
  secondPropertyRoomId = session.room.id as string
  const capability = normalizeOperatorCapability(session.operator_capability)
  if (!capability) throw new Error('second-property room returned no operator capability')

  const activation = runActivation([
    '--input', inputPath,
    '--room', code,
    '--apply',
    '--confirm-room', code,
  ])
  check(activation.includes(`bound ${code} to ${proof.pack.id}@${proof.pack.version}`),
    'a different property activates through the ordinary room-bound command')

  const { data: boundRoom, error: boundError } = await service.from('rooms')
    .select('id,show_pack_id,game_model,game_contract')
    .eq('id', secondPropertyRoomId)
    .single()
  if (boundError) throw boundError
  check(boundRoom.show_pack_id === packPlan.showPackId
    && boundRoom.game_model === 'conviction_portfolio'
    && boundRoom.game_contract?.identity.selection === 'none',
  'the new room consumes its pinned Story contract rather than the legacy property')

  const { data: registry, error: registryError } = await service.from('show_packs')
    .select('property,installment,compiled_bundle')
    .eq('id', packPlan.showPackId)
    .single()
  if (registryError) throw registryError
  const registryBytes = JSON.stringify(registry).toLowerCase()
  check(registry.property === 'The Lantern Watch'
    && registry.installment === 'The Bell at Midnight'
    && !registryBytes.includes('house of the dragon')
    && !registryBytes.includes('aegon')
    && !registryBytes.includes('sunfyre'),
  'the activated catalog is a complete non-legacy property record')

  const { data: guest, error: guestError } = await browser.from('players').insert({
    room_id: secondPropertyRoomId,
    name: 'Lantern Guest',
    avatar_id: 'stark',
    color: '#7C3AED',
    is_host: false,
  }).select().single()
  if (guestError) throw guestError
  const opened = await browser.rpc('begin_room_convictions_authorized', {
    p_room_id: secondPropertyRoomId,
    p_actor_player_id: session.player.id,
    p_operator_capability: capability,
  })
  if (opened.error) throw opened.error
  check(opened.data.phase === 'confidence',
    'the second property opens directly into whole-board convictions with no identity draft')

  const { data: beats, error: beatError } = await browser.from('signature_beats')
    .select('id,name,points,entity_id,trigger_contract')
    .eq('show_pack_id', packPlan.showPackId)
    .order('id')
  if (beatError) throw beatError
  check(beats.length === 2, 'the room reads exactly the new pack\'s authored proposition board')
  const convictionWrite = await browser.from('conviction_picks').insert([
    { room_id: secondPropertyRoomId, player_id: session.player.id, beat_id: beats[0].id },
    { room_id: secondPropertyRoomId, player_id: guest.id, beat_id: beats[0].id },
    { room_id: secondPropertyRoomId, player_id: guest.id, beat_id: beats[1].id },
  ])
  if (convictionWrite.error) throw convictionWrite.error
  check(true, 'both players can commit across the new property\'s complete character board')

  const { data: squares, error: squareError } = await browser.from('bingo_squares')
    .select('id')
    .eq('show_pack_id', packPlan.showPackId)
    .order('id')
  if (squareError) throw squareError
  check(squares.length === 24, 'the new property owns one complete bingo pool')
  const cardSquares = [
    ...squares.slice(0, 12).map((square) => square.id),
    0,
    ...squares.slice(12).map((square) => square.id),
  ]
  for (const player of [session.player, guest]) {
    const dealt = await browser.rpc('deal_player_bingo_card', {
      p_room_id: secondPropertyRoomId,
      p_actor_player_id: player.id,
      p_squares: cardSquares,
    })
    if (dealt.error) throw dealt.error
  }
  check(true, 'both players receive cards only from the pinned new pack')

  const live = await browser.rpc('open_room_live_authorized', {
    p_room_id: secondPropertyRoomId,
    p_actor_player_id: session.player.id,
    p_operator_capability: capability,
  })
  if (live.error) throw live.error
  check(live.data.phase === 'live', 'the second property enters the shared live floor')

  const declarations: Array<{
    category: { id: number; name: string; points: number }
    winnerName: string
  }> = []
  for (const beat of beats) {
    const { data: entity, error: entityError } = await browser.from('draft_entities')
      .select('name')
      .eq('id', beat.entity_id)
      .eq('show_pack_id', packPlan.showPackId)
      .single()
    if (entityError) throw entityError
    const { data: nominee, error: nomineeError } = await browser.from('nominees')
      .select('id')
      .eq('show_pack_id', packPlan.showPackId)
      .eq('name', entity.name)
      .single()
    if (nomineeError) throw nomineeError
    const declared = await browser.rpc('declare_room_event_authorized', {
      p_room_id: secondPropertyRoomId,
      p_name: beat.name,
      p_points: beat.points,
      p_nominee_id: nominee.id,
      p_actor_player_id: session.player.id,
      p_operator_capability: capability,
      p_source_signature_beat_id: beat.id,
      p_source_trigger_contract: beat.trigger_contract,
    })
    if (declared.error) throw declared.error
    declarations.push({
      category: declared.data.category,
      winnerName: entity.name,
    })
  }
  check(declarations.every((entry) => (
    entry.category.name.includes('Gate') || entry.category.name.includes('Flame')
  )), 'operator declarations resolve only authored propositions from the pinned new pack')

  const finished = await browser.rpc('close_live_floor_authorized', {
    p_room_id: secondPropertyRoomId,
    p_actor_player_id: session.player.id,
    p_operator_capability: capability,
  })
  if (finished.error) throw finished.error
  check(finished.data.phase === 'finished',
    'one operator action moves the new property into provisional results')

  const manifestPath = join(workspace, 'lantern-watch-settlement.json')
  const receiptPath = join(workspace, 'lantern-watch-receipt.json')
  const hostTotal = Math.floor(beats[0].points / 2)
  const guestTotal = hostTotal + beats[1].points
  writeFileSync(manifestPath, `${JSON.stringify({
    version: 1,
    title: 'Lantern Watch researched record',
    actor: 'Second-property Story Night dogfood',
    entries: declarations.map((declaration, index) => ({
      key: `lantern-watch-beat-${beats[index].id}`,
      name: declaration.category.name,
      category_id: declaration.category.id,
      outcome: 'resolved',
      points: declaration.category.points,
      winner: declaration.winnerName,
      warrant: {
        verdict: 'true',
        sources: [{ kind: 'fixture', ref: `Lantern Watch screen fact ${index + 1}` }],
      },
    })),
    bingo: { mode: 'replace', marks: [] },
    expected: {
      player_totals: {
        [session.player.id]: hostTotal,
        [guest.id]: guestTotal,
      },
      character_points: {},
    },
  }, null, 2)}\n`, 'utf8')
  const settlement = runLocalCommand('scripts/settle-room.mts', [
    '--room', code,
    '--manifest', manifestPath,
    '--apply',
    '--confirm-room', code,
    '--receipt', receiptPath,
  ])
  check(settlement.includes('applied settlement v1'),
    'the ordinary researched settlement command closes the second property')

  const receiptBytes = readFileSync(receiptPath, 'utf8')
  const receipt = parseSettlementReceipt(receiptBytes)
  check(receipt.show_pack?.registry_id === packPlan.showPackId
    && receipt.show_pack.pack_id === proof.pack.id
    && receipt.settled_facts?.length === 2
    && receipt.score_events.length === 3
    && receipt.score_events.every((event) => (
      event.trigger?.contract.truth_authority === 'operator_declaration'
    )),
  'the canonical receipt attests the new pack, facts, and all conviction payouts')

  const dropPath = join(workspace, 'lantern-watch-drop.json')
  const ceremonyPath = join(workspace, 'lantern-watch-ceremony.html')
  const receiptSha256 = createHash('sha256').update(receiptBytes).digest('hex')
  const drop = buildSettlementDrop(receipt, receiptPath, receiptSha256, proof)
  writeFileSync(dropPath, `${JSON.stringify(drop, null, 2)}\n`, 'utf8')
  const ceremony = runLocalCommand('scripts/generate-settlement-drop.mts', [
    '--input', dropPath,
    '--output', ceremonyPath,
  ])
  const ceremonyHtml = readFileSync(ceremonyPath, 'utf8')
  check(ceremony.includes('wrote=')
    && ceremonyHtml.includes('The Lantern Watch')
    && ceremonyHtml.includes('The Lantern Keeper')
    && !ceremonyHtml.includes('House of the Dragon')
    && !ceremonyHtml.includes('Aegon')
    && !ceremonyHtml.includes('Sunfyre'),
  'the receipt compiles a complete second-property ceremony with no hand-patched legacy content')
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
    if (secondProperty) await runSecondPropertyLoop()
    console.log(`\n${checks} show-pack activation checks passed.`)
  } finally {
    if (secondPropertyRoomId) {
      const repair = await service.from('rooms').update({
        active_settlement_id: null,
        phase: 'lobby',
        host_id: null,
      }).eq('id', secondPropertyRoomId)
      if (repair.error) console.error(`[show-pack-activation-dogfood] cleanup warning: ${repair.error.message}`)
      const { error } = await service.from('rooms').delete().eq('id', secondPropertyRoomId)
      if (error) console.error(`[show-pack-activation-dogfood] cleanup warning: ${error.message}`)
      else console.log('PASS removed the disposable second-property room')
    }
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
