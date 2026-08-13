/**
 * Headless end-to-end dogfood of the backend.
 *
 * WHY THIS EXISTS
 * The UI can only be exercised by a human with two browsers, and the one thing
 * that most needs rehearsing — the full chain from join to final score — takes
 * twenty minutes of clicking to reach. This walks the same chain in a few
 * seconds, against the real database, using the same write shapes the client
 * uses and the real scoring functions from lib/.
 *
 * It is NOT a mock. Every write here is byte-identical to what the app sends;
 * the assertions read the rows back out. If this passes, the backend chain
 * works. What it does not cover is React state, Realtime delivery and layout —
 * those still need the two-browser run.
 *
 * IT CLEANS UP TRANSIENT STATE. Published catalogs are immutable, so the local
 * stack retains one deterministic authored dogfood fixture across runs; every
 * disposable draft row and room-scoped declaration is removed even on failure.
 *
 *   npx tsx scripts/dogfood-e2e.mts
 */

import { createClient } from '@supabase/supabase-js'
import { computeLeaderboard, findDraftPointsForWinner, compareForRank } from '../src/lib/scoring'
import { resolveNomineeForDraftEntity } from '../src/lib/draft-identity'
import { computeNightAwards, tallyEntityPoints } from '../src/lib/night-awards'
import { computeScoreTimeline } from '../src/lib/timeline-utils'
import { assignVerdictAuthors } from '../src/lib/companion-prompts'
import { remoteHolderIds, screenKey, isSoloWatcher } from '../src/lib/watch-groups'
import {
  computePlayerBingoScores,
  generateBingoCard,
  checkBingo,
  FREE_CENTER_INDEX,
} from '../src/lib/bingo-utils'
import { buildCanonicalRoomRecord } from '../src/lib/room-record'
import { buildSettlementReceiptEvidence } from '../src/lib/settlement-evidence'
import { buildSettlementInputSnapshot } from '../src/lib/settlement-input'
import { settlementCharacterPoints, settlementPlayerTotals } from '../src/lib/settlement-receipt'
import { fetchAllRows } from '../src/hooks/fetch-all-rows'
import { supabaseConfig } from './lib/env.mts'

// This script writes test facts and retains one immutable fixture, so it is
// restricted to the local stack and refuses every remote target.
const {
  target: SUPABASE_TARGET,
  url: URL_,
  anonKey: KEY,
  serviceKey: SERVICE_KEY,
} = supabaseConfig('local')
if (SUPABASE_TARGET !== 'local') {
  throw new Error('dogfood-e2e is local-only because its reusable authored fixture must never enter production')
}
if (!SERVICE_KEY) throw new Error('local Supabase did not report a service role key')
const dogfoodSupabase = createClient(URL_, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const LEGACY_PREDICTION_COUNT = 20
const DOGFOOD_PACK_ID = 'd06f0000-0000-4000-8000-000000000001'
const DOGFOOD_ENTITY_ID = 'd06f0000-0000-4000-8000-000000000002'
const DOGFOOD_RIVAL_ENTITY_ID = 'd06f0000-0000-4000-8000-000000000007'
const DOGFOOD_NOMINEE_IDS = [
  'd06f0000-0000-4000-8000-000000000003',
  'd06f0000-0000-4000-8000-000000000004',
] as const
const DOGFOOD_WITNESS_NOMINEE_ID = 'd06f0000-0000-4000-8000-000000000005'
const DOGFOOD_WITNESS_DECOY_NOMINEE_ID = 'd06f0000-0000-4000-8000-000000000006'
const DOGFOOD_SQUARE_BASE = 1_900_000_000

let failures = 0
let checks = 0
function check(label: string, cond: boolean, detail = '') {
  checks++
  if (cond) console.log(`  \x1b[32mPASS\x1b[0m ${label}`)
  else { failures++; console.log(`  \x1b[31mFAIL ${label}\x1b[0m ${detail}`) }
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    )
  }
  return value
}

async function db(path: string, init: RequestInit = {}, key = KEY) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key, Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status} ${text.slice(0, 300)}`)
  return text ? JSON.parse(text) : null
}
const rpc = (fn: string, args: object) =>
  db(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) })
const serviceRpc = (fn: string, args: object) =>
  db(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) }, SERVICE_KEY)

async function readShowPackCatalogManifest(showPack: Record<string, unknown>) {
  const showPackId = String(showPack.id)
  const [nominees, categories, draftEntities, signatureBeats, bingoSquares] = await Promise.all([
    db(`nominees?show_pack_id=eq.${showPackId}&select=id,name,type,film_name,image_url,show_pack_id,pack_key`, {}, SERVICE_KEY),
    db(`categories?show_pack_id=eq.${showPackId}&select=id,name,tier,points,display_order,winner_id,announced_at,show_pack_id,room_id,pack_key,trigger_contract`, {}, SERVICE_KEY),
    db(`draft_entities?show_pack_id=eq.${showPackId}&select=id,name,type,nominations,film_name,nom_count,show_pack_id,pack_key`, {}, SERVICE_KEY),
    db(`signature_beats?show_pack_id=eq.${showPackId}&select=id,entity_id,partner_entity_id,name,trigger_text,odds,points,pitch,show_pack_id,pack_key,trigger_contract`, {}, SERVICE_KEY),
    db(`bingo_squares?show_pack_id=eq.${showPackId}&select=id,text,short_text,is_objective,slug,title,category,probability_pct,likelihood_tier,win_condition,why_it_is_fun,storyline_tags,fun_type,show_pack_id,pack_key,trigger_contract`, {}, SERVICE_KEY),
  ])
  const categoryIds = categories.map((category: any) => category.id)
  const categoryNominees = categoryIds.length === 0
    ? []
    : await db(
      `category_nominees?category_id=in.(${categoryIds.join(',')})&select=category_id,nominee_id`,
      {},
      SERVICE_KEY,
    )
  return {
    showPack,
    nominees,
    categories,
    categoryNominees,
    draftEntities,
    signatureBeats,
    bingoSquares,
  }
}

async function removeDraftShowPack(showPackId: string) {
  const rows: any[] = await db(
    `show_packs?id=eq.${showPackId}&select=id,status`,
    {},
    SERVICE_KEY,
  )
  if (rows.length === 0) return
  if (rows[0].status !== 'draft') {
    throw new Error(`refusing to remove non-draft show pack ${showPackId}`)
  }
  const categories: any[] = await db(
    `categories?show_pack_id=eq.${showPackId}&select=id`,
    {},
    SERVICE_KEY,
  )
  if (categories.length > 0) {
    await db(
      `category_nominees?category_id=in.(${categories.map((category) => category.id).join(',')})`,
      { method: 'DELETE' },
      SERVICE_KEY,
    )
  }
  await db(`signature_beats?show_pack_id=eq.${showPackId}`, { method: 'DELETE' }, SERVICE_KEY)
  await db(`categories?show_pack_id=eq.${showPackId}`, { method: 'DELETE' }, SERVICE_KEY)
  await db(`bingo_squares?show_pack_id=eq.${showPackId}`, { method: 'DELETE' }, SERVICE_KEY)
  await db(`draft_entities?show_pack_id=eq.${showPackId}`, { method: 'DELETE' }, SERVICE_KEY)
  await db(`nominees?show_pack_id=eq.${showPackId}`, { method: 'DELETE' }, SERVICE_KEY)
  await db(`show_packs?id=eq.${showPackId}`, { method: 'DELETE' }, SERVICE_KEY)
}

const created = {
  roomId: null as string | null,
  raceRoomId: null as string | null,
  auxiliaryRoomId: null as string | null,
  categoryIds: [] as number[],
  draftShowPackId: null as string | null,
}

async function main() {
  console.log('\n\x1b[1m═══ Headless end-to-end dogfood ═══\x1b[0m\n')

  // ── 1. Room + players ─────────────────────────────────────────────────────
  console.log('\x1b[1m1. Room and join\x1b[0m')
  // Four random digits, not one. 'DOG' + 0-9 gave ten possible codes, so a run
  // that died before cleanup poisoned that code and the next run hit a 23505 on
  // rooms_code_key before doing anything at all.
  const code = 'DOG' + String(Math.floor(Math.random() * 10000)).padStart(4, '0')
  const createdHostSession = await rpc('create_room_with_host', {
    p_code: code,
    p_name: 'Franky',
    p_avatar_id: 'targaryen',
    p_color: '#D4AF37',
  })
  const room = createdHostSession.room
  const refereeCapability = createdHostSession.operator_capability as string
  created.roomId = room.id
  check('room and host created atomically', room.host_id === createdHostSession.player.id)
  check('new room is bound to the published show pack', typeof room.show_pack_id === 'string')
  check('the room-declared show pack selects the conviction model by default',
    room.game_model === 'conviction_portfolio')

  const names = ['Franky', 'AP', 'Alec']
  const players: any[] = [createdHostSession.player]
  for (const name of names.slice(1)) {
    const [p] = await db('players', {
      method: 'POST',
      body: JSON.stringify({
        room_id: room.id, name, avatar_id: 'targaryen',
        color: '#D4AF37', is_host: false,
      }),
    })
    players.push(p)
  }
  check('3 players joined around the atomic host session', players.length === 3)
  check('creator received the private referee capability', refereeCapability.length === 64)

  // ── 2. Watch groups ───────────────────────────────────────────────────────
  console.log('\n\x1b[1m2. Watch groups and remotes\x1b[0m')
  // Franky solo in Tulum-equivalent (no group); AP + Alec share one screen.
  for (const player of players.slice(1)) {
    await rpc('set_player_watch_group_authorized', {
      p_room_id: room.id,
      p_actor_player_id: player.id,
      p_target_player_id: player.id,
      p_watch_group: 'New York',
      p_operator_capability: null,
    })
  }
  await rpc('claim_room_remote_authority', {
    p_room_id: room.id,
    p_actor_player_id: players[1].id,
  })

  let roster: any[] = await db(`players?room_id=eq.${room.id}&select=*&order=created_at`)
  const holders = remoteHolderIds(roster)
  check('two screens derived from groups', new Set(roster.map(screenKey)).size === 2)
  check('solo watcher holds their own remote', isSoloWatcher(roster.find((p) => p.name === 'Franky')))
  check('exactly 2 remote-holders (1 per screen)', holders.length === 2, `got ${holders.length}`)

  // Claiming the remote must clear the previous holder in the SAME group only.
  await rpc('claim_room_remote_authority', {
    p_room_id: room.id,
    p_actor_player_id: players[2].id,
  })
  roster = await db(`players?room_id=eq.${room.id}&select=*&order=created_at`)
  const nyHolders = roster.filter((p: any) => p.watch_group === 'New York' && p.is_remote_holder)
  const currentHolders = remoteHolderIds(roster)
  check('handover leaves exactly one holder on that screen', nyHolders.length === 1, `got ${nyHolders.length}`)
  check('the other screen was not touched', remoteHolderIds(roster).length === 2)

  // Team allegiance — a plain column, but the CHECK constraint is load-bearing:
  // it is the only thing stopping a typo'd team value from silently breaking
  // the defection watcher's black/green comparison.
  await rpc('set_player_allegiance', {
    p_room_id: room.id,
    p_actor_player_id: players[0].id,
    p_team: 'black',
  })
  check('team allegiance persists',
    (await db(`players?id=eq.${players[0].id}&select=team`))[0].team === 'black')
  let rejected = false
  try {
    await rpc('set_player_allegiance', {
      p_room_id: room.id,
      p_actor_player_id: players[0].id,
      p_team: 'dorne',
    })
  } catch { rejected = true }
  check('invalid team rejected by CHECK constraint', rejected)

  // ── 3. Draft ──────────────────────────────────────────────────────────────
  console.log('\n\x1b[1m3. Draft\x1b[0m')
  const entities: any[] = await db(`draft_entities?show_pack_id=eq.${room.show_pack_id}&select=*`)
  const dragons = entities.filter((e) => e.type === 'film')
  const chars = entities.filter((e) => e.type === 'person')
  check('draft pool seeded', dragons.length === 11 && chars.length === 27, `${dragons.length} dragons / ${chars.length} characters`)

  const draftOrder = players.map((candidate) => candidate.id)
  // This broad harness begins at the draft ledger; the focused phase-authority
  // dogfood exercises the lobby/countdown commands themselves.
  await db(`rooms?id=eq.${room.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      // The broad harness proves the older confidence-and-ensemble scoring
      // chain. The focused conviction dogfood proves the current Story Night
      // model, so opt this disposable room into legacy while it is still in
      // the lobby and the game-model guard permits that choice.
      game_model: 'legacy_ensemble',
      phase: 'draft',
      draft_order: draftOrder,
      current_pick: 0,
    }),
  }, SERVICE_KEY)

  const picks: any[] = []
  const draftClaims = [
    ...players.map((candidate, index) => ({ player: candidate, entity: dragons[index], round: 1 })),
    ...players.map((candidate, index) => ({ player: candidate, entity: chars[index], round: 99 })),
    ...[...players].reverse().map((candidate, index) => ({ player: candidate, entity: chars[index + 3], round: 99 })),
  ]
  for (const [pickNumber, claim] of draftClaims.entries()) {
    const [row] = await db('draft_picks', {
      method: 'POST',
      body: JSON.stringify({
        room_id: room.id,
        player_id: claim.player.id,
        entity_id: claim.entity.id,
        round: claim.round,
        pick_number: pickNumber,
      }),
    })
    picks.push(row)
  }
  const [draftedRoom] = await db(`rooms?id=eq.${room.id}&select=current_pick`)
  const normalizedRounds = picks.map((pick) => pick.round)
  check('9 atomic picks advance exactly 9 turns with normalized sub-draft rounds',
    picks.length === 9 && draftedRoom.current_pick === 9 &&
      JSON.stringify(normalizedRounds) === JSON.stringify([1, 1, 1, 1, 1, 1, 2, 2, 2]),
    `picks=${picks.length} current_pick=${draftedRoom.current_pick} rounds=${normalizedRounds.join(',')}`)
  check('no entity is taken twice', new Set(picks.map((pick) => pick.entity_id)).size === 9)

  // ── 4. Episode clock ──────────────────────────────────────────────────────
  console.log('\n\x1b[1m4. Episode clock (per screen)\x1b[0m')
  await db(`rooms?id=eq.${room.id}`, {
    method: 'PATCH', body: JSON.stringify({ phase: 'live' }),
  }, SERVICE_KEY)
  await rpc('start_episode_for_screen', { p_room_id: room.id, p_player_id: players[0].id })
  roster = await db(`players?room_id=eq.${room.id}&select=*&order=created_at`)
  const started1 = roster.filter((p: any) => p.episode_started_at)
  check('solo start stamps only that player', started1.length === 1 && started1[0].name === 'Franky',
    `stamped: ${started1.map((p: any) => p.name).join(',')}`)
  let r = (await db(`rooms?id=eq.${room.id}&select=show_started`))[0]
  check('first start flips the game live for everyone', r.show_started === true)

  await rpc('start_episode_for_screen', { p_room_id: room.id, p_player_id: players[2].id })
  roster = await db(`players?room_id=eq.${room.id}&select=*&order=created_at`)
  const ny = roster.filter((p: any) => p.watch_group === 'New York')
  check('shared screen stamps BOTH people on it', ny.every((p: any) => p.episode_started_at))
  check('the two screens have independent origins',
    new Date(ny[0].episode_started_at).getTime() !==
    new Date(roster.find((p: any) => p.name === 'Franky').episode_started_at).getTime())

  const before = roster.find((p: any) => p.name === 'Franky').episode_started_at
  await rpc('start_episode_for_screen', { p_room_id: room.id, p_player_id: players[0].id })
  roster = await db(`players?room_id=eq.${room.id}&select=*&order=created_at`)
  check('re-pressing start does NOT move a running clock',
    roster.find((p: any) => p.name === 'Franky').episode_started_at === before)

  // ── 5. Drift maths on a real beacon ───────────────────────────────────────
  console.log('\n\x1b[1m5. Beacon and drift\x1b[0m')
  await rpc('post_room_playback_beacon', {
    p_room_id: room.id,
    p_actor_player_id: players[2].id,
    p_position_ms: 34 * 60_000 + 12_000,
  })
  await new Promise((resolve) => setTimeout(resolve, 100))
  r = (await db(`rooms?id=eq.${room.id}&select=*`))[0]
  const aged = r.sync_position_ms + (Date.now() - new Date(r.sync_posted_at).getTime())
  check('beacon is aged for transit, not read raw',
    aged - r.sync_position_ms >= 75 && aged - r.sync_position_ms <= 2_000,
    `aged by ${Math.round(aged - r.sync_position_ms)}ms`)

  // ── 6. Pause handshake ────────────────────────────────────────────────────
  console.log('\n\x1b[1m6. Pause handshake\x1b[0m')
  await rpc('request_room_playback_pause', {
    p_room_id: room.id,
    p_actor_player_id: players[2].id,
    p_reason: 'bathroom',
  })
  await rpc('confirm_room_playback_pause', {
    p_room_id: room.id,
    p_actor_player_id: players[2].id,
    p_position_ms: 41 * 60_000,
  })
  r = (await db(`rooms?id=eq.${room.id}&select=*`))[0]
  check('confirming a pause clears the request', r.is_paused && r.pause_requested_by === null)

  // Both screens' holders legitimately tap confirm (each pauses their own TV).
  // The guard on is_paused means the SECOND tap must not move the canonical
  // park position the first screen already parked at.
  await rpc('confirm_room_playback_pause', {
    p_room_id: room.id,
    p_actor_player_id: players[0].id,
    p_position_ms: 99_000,
  })
  r = (await db(`rooms?id=eq.${room.id}&select=paused_at_ms`))[0]
  check('a second confirm cannot move the park position',
    r.paused_at_ms === 41 * 60_000, `paused_at_ms=${r.paused_at_ms}`)

  // Two holders tap ready at once — the RPC must not lose one.
  await Promise.all(currentHolders.map((id) =>
    rpc('mark_resume_ready', { p_room_id: room.id, p_player_id: id })))
  r = (await db(`rooms?id=eq.${room.id}&select=resume_ready`))[0]
  check('concurrent ready-taps do not overwrite each other',
    r.resume_ready.length === 2, `resume_ready=${JSON.stringify(r.resume_ready)}`)

  await rpc('schedule_room_playback_resume', {
    p_room_id: room.id,
    p_actor_player_id: players[0].id,
    p_countdown_seconds: 5,
  })
  r = (await db(`rooms?id=eq.${room.id}&select=resume_at,is_paused`))[0]
  const secs = Math.ceil((new Date(r.resume_at).getTime() - Date.now()) / 1000)
  check('resume countdown is a shared wall-clock target', secs >= 3 && secs <= 5, `${secs}s`)

  // ── 7. Bingo ──────────────────────────────────────────────────────────────
  console.log('\n\x1b[1m7. Bingo\x1b[0m')
  const squares: any[] = await db(`bingo_squares?show_pack_id=eq.${room.show_pack_id}&select=*`)
  // Deliberately a floor, not an exact count: the bingo pool is owned by another
  // workstream and grew from 50 to 75 mid-session. A card only needs 24.
  check('enough squares to deal distinct cards', squares.length >= 25, `got ${squares.length}`)
  const cardA = generateBingoCard(squares, [])
  const cardB = generateBingoCard(squares, [cardA])
  const cardC = generateBingoCard(squares, [cardA, cardB])
  check('card is 25 cells with a free centre',
    cardA.length === 25 && cardA[FREE_CENTER_INDEX] === 0)
  check('24 distinct real squares per card',
    new Set(cardA.filter((_, i) => i !== FREE_CENTER_INDEX)).size === 24)
  check('two cards are not identical', JSON.stringify(cardA) !== JSON.stringify(cardB))
  const topRow = new Set([0, 1, 2, 3, 4, FREE_CENTER_INDEX])
  check('a completed line is detected', checkBingo(topRow, []).lines.length >= 1)
  const settlementCards = []
  for (const [index, player] of players.entries()) {
    const card = await rpc('deal_player_bingo_card', {
      p_room_id: room.id,
      p_actor_player_id: player.id,
      p_squares: [cardA, cardB, cardC][index],
    })
    settlementCards.push(card)
  }
  check('each player deals exactly one validated room card through the command',
    settlementCards.length === players.length &&
      settlementCards.every((card, index) => card.player_id === players[index].id))
  const settlementCard = settlementCards[0]
  const liveMarkToPreserve = await rpc('set_player_bingo_mark', {
    p_room_id: room.id,
    p_actor_player_id: players[0].id,
    p_card_id: settlementCard.id,
    p_square_index: 1,
    p_marked: true,
  })
  check('player-owned bingo mark command returns the approved live row',
    liveMarkToPreserve.card_id === settlementCard.id &&
      liveMarkToPreserve.square_index === 1 &&
      liveMarkToPreserve.status === 'approved')

  // ── 8. Log events the way the Game Master does ────────────────────────────
  console.log('\n\x1b[1m8. Game Master events\x1b[0m')
  const nominees: any[] = await db(`nominees?show_pack_id=eq.${room.show_pack_id}&select=*`)
  const myCharPick = picks.find((pick) =>
    pick.player_id === players[0].id && chars.some((entity) => entity.id === pick.entity_id))
  const myDragonPick = picks.find((pick) =>
    pick.player_id === players[0].id && dragons.some((entity) => entity.id === pick.entity_id))
  const myChar = entities.find((e) => e.id === myCharPick?.entity_id)
  const myDragon = entities.find((e) => e.id === myDragonPick?.entity_id)
  const charNom = resolveNomineeForDraftEntity(myChar, nominees)
  const dragonNom = resolveNomineeForDraftEntity(myDragon, nominees)
  check('drafted entities resolve to nominees', !!charNom && !!dragonNom,
    `char=${myChar?.name} dragon=${myDragon?.name}`)

  for (const [nom, pts, label] of [[charNom, 10, 'A huge moment'], [dragonNom, 6, 'A solid moment']] as const) {
    const declared = await rpc('declare_room_event_authorized', {
      p_room_id: room.id,
      p_name: `${label} (dogfood)`,
      p_points: pts,
      p_nominee_id: nom.id,
      p_actor_player_id: players[0].id,
      p_operator_capability: refereeCapability,
      p_source_signature_beat_id: null,
      p_source_trigger_contract: null,
    })
    created.categoryIds.push(declared.category.id)
    check(`${label} commits its complete declaration transaction`,
      declared.category.room_id === room.id &&
        declared.winner.category_id === declared.category.id &&
        declared.winner.winner_id === nom.id &&
        typeof declared.announcement === 'string')
  }
  const declarationAnnouncements: any[] = await db(
    `messages?room_id=eq.${room.id}&player_id=eq.winner-divider&select=text`,
  )
  check('2 events logged atomically with public announcements',
    created.categoryIds.length === 2 && declarationAnnouncements.length === 2)

  // ── 9. Scoring, through the real leaderboard function ─────────────────────
  console.log('\n\x1b[1m9. Scoring\x1b[0m')
  const allCats: any[] = await db(
    `categories?or=(show_pack_id.eq.${room.show_pack_id},room_id.eq.${room.id})&select=*&order=display_order`,
  )
  const winners: any[] = await db(`room_winners?room_id=eq.${room.id}&select=*`)
  const winnerMap = new Map(winners.map((w) => [w.category_id, w]))
  const merged = allCats.map((c) => ({
    ...c,
    winner_id: winnerMap.get(c.id)?.winner_id ?? null,
    tie_winner_id: winnerMap.get(c.id)?.tie_winner_id ?? null,
  }))
  const allPicks: any[] = await db(`draft_picks?room_id=eq.${room.id}&select=*`)
  const board = computeLeaderboard(roster, [], allPicks, entities, merged, nominees, new Map())

  const franky = board.find((b) => b.player.name === 'Franky')!
  check('the drafter of the scored character is top', board[0].player.name === 'Franky',
    board.map((b) => `${b.player.name}:${b.totalScore}`).join(' '))
  check('their score is non-zero', franky.totalScore > 0, `${franky.totalScore}`)
  check('nobody who drafted nothing relevant scored',
    board.filter((b) => b.totalScore > 0).length === 1,
    board.map((b) => `${b.player.name}:${b.totalScore}`).join(' '))

  const attribution = findDraftPointsForWinner(
    created.categoryIds[0], charNom.id, merged, nominees, entities, allPicks,
  )
  check('the scored character is attributed to the right drafter',
    attribution.playerId === players[0].id && attribution.points > 0,
    JSON.stringify(attribution))

  // ── 10. The ending ────────────────────────────────────────────────────────
  console.log('\n\x1b[1m10. The ending\x1b[0m')

  // The prediction slate. `categories` is now an append-only GM log, so the
  // sheet is defined by "has something to choose between" rather than by id —
  // a GM event carries exactly one nominee, a real prediction event carries the
  // field. This is the guard useConfidence applies before building the sheet.
  const catNoms: any[] = await db('category_nominees?select=category_id,nominee_id')
  const nomsByCat = new Map<number, string[]>()
  for (const cn of catNoms) {
    if (!nomsByCat.has(cn.category_id)) nomsByCat.set(cn.category_id, [])
    nomsByCat.get(cn.category_id)!.push(cn.nominee_id)
  }
  const predictable = allCats.filter((c) => (nomsByCat.get(c.id) ?? []).length >= 2)
  check('prediction slate excludes GM-authored events',
    predictable.length === LEGACY_PREDICTION_COUNT &&
      created.categoryIds.every((id) => (nomsByCat.get(id) ?? []).length === 1),
    `${predictable.length} predictable, GM events carry 1 nominee each`)

  // Every player stakes the SAME fixed budget, 1..N, each value exactly once.
  // Confidence stakes belong to the scheduled model's confidence phase. This
  // broad harness has already exercised the live event path, so restore the
  // disposable legacy room to that write phase for the stake contract and
  // reopen live immediately after the last player submits.
  await db(`rooms?id=eq.${room.id}`, {
    method: 'PATCH', body: JSON.stringify({ phase: 'confidence' }),
  }, SERVICE_KEY)
  const budget = predictable.length
  const staked = new Map<string, number>()
  for (const [pi, p] of roster.entries()) {
    const rows = predictable.map((cat: any, i: number) => {
      const options = nomsByCat.get(cat.id)!
      return {
        room_id: room.id, player_id: p.id, category_id: cat.id,
        // Rotate both the pick and the stake per player so scores diverge.
        nominee_id: options[(i + pi) % options.length],
        confidence: ((i + pi) % budget) + 1,
      }
    })
    await db('confidence_picks', { method: 'POST', body: JSON.stringify(rows) })
    staked.set(p.id, rows.reduce((sum, r) => sum + r.confidence, 0))
  }
  await db(`rooms?id=eq.${room.id}`, {
    method: 'PATCH', body: JSON.stringify({ phase: 'live' }),
  }, SERVICE_KEY)
  const expectedBudget = (budget * (budget + 1)) / 2
  check('every player staked the identical fixed budget',
    [...staked.values()].every((v) => v === expectedBudget),
    `expected ${expectedBudget} each, got ${[...staked.values()].join('/')}`)

  // THE TWO HOST WORKFLOWS, which resolve events differently.
  //
  // (a) GM console  — logEvent() appends a category + room_winners row. It never
  //     touches confidence_picks.is_correct, because a GM event is brand new and
  //     nobody predicted it.
  // (b) Spotlight   — confirmSpotlightWinner() resolves a SEEDED event and does
  //     update is_correct, which is what makes prediction points pay out.
  //
  // Only (b) moves the confidence channel. Verify both, because a host who only
  // ever uses the console leaves every prediction unscored.
  const gmPicks: any[] = await db(
    `confidence_picks?room_id=eq.${room.id}&category_id=in.(${created.categoryIds.join(',')})&select=id`)
  check('GM events attract no predictions (nobody could have picked them)',
    gmPicks.length === 0, `${gmPicks.length} picks found`)

  const target = predictable[0]
  const winningNom = nomsByCat.get(target.id)![0]
  await rpc('declare_scheduled_winner_authorized', {
    p_room_id: room.id,
    p_category_id: target.id,
    p_winner_id: winningNom,
    p_tie_winner_id: null,
    p_actor_player_id: players[0].id,
    p_operator_capability: refereeCapability,
  })
  // Older phones repeat these derived updates after the command; the
  // projection guard accepts the identical values as harmless no-ops.
  await db(`confidence_picks?room_id=eq.${room.id}&category_id=eq.${target.id}&nominee_id=eq.${winningNom}`,
    { method: 'PATCH', body: JSON.stringify({ is_correct: true }) })
  await db(`confidence_picks?room_id=eq.${room.id}&category_id=eq.${target.id}&nominee_id=neq.${winningNom}`,
    { method: 'PATCH', body: JSON.stringify({ is_correct: false }) })

  const scoredPicks: any[] = await db(`confidence_picks?room_id=eq.${room.id}&select=*`)
  const settled = scoredPicks.filter((p) => p.is_correct !== null)
  check('resolving a prediction event settles exactly that event',
    settled.length === roster.length && settled.every((p) => p.category_id === target.id),
    `${settled.length} settled`)
  check('the rest stay unsettled and therefore score nothing',
    scoredPicks.filter((p) => p.is_correct === null).length === roster.length * (budget - 1))

  // ── Leaderboard with all three channels live ──────────────────────────────
  const winners2: any[] = await db(`room_winners?room_id=eq.${room.id}&select=*`)
  const winnerMap2 = new Map(winners2.map((w) => [w.category_id, w]))
  const merged2 = allCats.map((c: any) => ({
    ...c,
    winner_id: winnerMap2.get(c.id)?.winner_id ?? null,
    tie_winner_id: winnerMap2.get(c.id)?.tie_winner_id ?? null,
  }))
  const bingoStub = new Map(roster.map((p: any, i: number) => [p.id, i * 15]))
  const finalBoard = computeLeaderboard(
    roster, scoredPicks, allPicks, entities, merged2, nominees, bingoStub)

  check('confidence now contributes to the total',
    finalBoard.some((e) => e.confidenceScore > 0),
    finalBoard.map((e) => `${e.player.name}:${e.confidenceScore}`).join(' '))
  check('totals equal the sum of their three channels',
    finalBoard.every((e) => e.totalScore === e.confidenceScore + e.ensembleScore + e.bingoScore))
  check('ranks are ordered and share only on a true dead heat',
    finalBoard.every((e, i) =>
      i === 0 || compareForRank(finalBoard[i - 1], e) <= 0) &&
    finalBoard.every((e, i) =>
      i === 0 || (e.rank === finalBoard[i - 1].rank) === (compareForRank(finalBoard[i - 1], e) === 0)))

  // ── The Reckoning ─────────────────────────────────────────────────────────
  const timeline = computeScoreTimeline(merged2, scoredPicks, allPicks, entities, nominees, roster)
  const awards = computeNightAwards(
    finalBoard, roster, merged2, nominees, entities, allPicks, scoredPicks, timeline)

  check('every player gets a title', awards.playerAwards.length === roster.length)
  check('titles are distinct',
    new Set(awards.playerAwards.map((a) => a.title)).size === awards.playerAwards.length,
    awards.playerAwards.map((a) => a.title).join(' / '))
  check('character awards resolved', awards.characterAwards.length > 0,
    awards.characterAwards.map((c) => `${c.label}=${c.entityName}`).join(' '))

  // ── Verdict persistence, against the RLS just deployed ────────────────────
  const authors = assignVerdictAuthors(awards.playerAwards.map((a) => a.playerId))
  check('verdict authors are deterministic and distinct',
    new Set([...authors.values()]).size === roster.length &&
      [...authors.keys()].every((k) =>
        authors.get(k) === assignVerdictAuthors(awards.playerAwards.map((a) => a.playerId)).get(k)))

  const verdictRows = awards.playerAwards.map((a) => ({
    room_id: room.id, player_id: a.playerId,
    companion_id: authors.get(a.playerId), title: a.title,
    verdict: `A dogfood verdict concerning ${a.playerName}.`,
  }))
  await db('player_verdicts', { method: 'POST', body: JSON.stringify(verdictRows) })
  let stored: any[] = await db(`player_verdicts?room_id=eq.${room.id}&select=*`)
  check('verdicts insert under the new policy', stored.length === roster.length, `${stored.length} rows`)

  // The upsert path — a host reload or a race must overwrite, not 409 or 42501.
  // This is the exact failure that silently broke GM logging before.
  await db('player_verdicts', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(verdictRows.map((r) => ({ ...r, verdict: 'Overwritten on re-run.' }))),
  })
  stored = await db(`player_verdicts?room_id=eq.${room.id}&select=*`)
  check('re-running overwrites rather than duplicating',
    stored.length === roster.length && stored.every((r) => r.verdict === 'Overwritten on re-run.'),
    `${stored.length} rows`)

  // ── The public recap read path (no player session) ────────────────────────
  const [publicRoom] = await db(`rooms?code=eq.${code}&select=id`)
  check('public recap can find the room by code alone', publicRoom?.id === room.id)
  const publicVerdicts: any[] = await db(`player_verdicts?room_id=eq.${room.id}&select=*`)
  const publicPlayers: any[] = await db(`players?room_id=eq.${room.id}&select=*`)
  check('public recap reads verdicts and players without a session',
    publicVerdicts.length === roster.length && publicPlayers.length === roster.length)

  // ── 11. Settlement and the real close-room transition ─────────────────────
  console.log('\n\x1b[1m11. Settlement\x1b[0m')
  await db(`rooms?id=eq.${room.id}`, {
    method: 'PATCH', body: JSON.stringify({ phase: 'finished' }),
  }, SERVICE_KEY)

  const warrant = {
    verdict: 'true',
    sources: [{ kind: 'screen', ref: 'dogfood fixture' }],
  }
  const settlementEntries = [
    ...predictable.map((category: any, index: number) => ({
      entry_key: `prediction-${category.id}`,
      name: category.name,
      category_id: category.id,
      outcome: index === 0 ? 'resolved' : 'void',
      points: category.points,
      winner_id: index === 0 ? winningNom : null,
      tie_winner_id: null,
      display_order: index + 1,
      occurred_at: null,
      warrant,
    })),
    {
      entry_key: 'researched-character-event',
      name: 'The researched character event',
      category_id: created.categoryIds[0],
      outcome: 'resolved',
      points: 10,
      winner_id: charNom.id,
      tie_winner_id: null,
      display_order: predictable.length + 1,
      occurred_at: new Date().toISOString(),
      warrant,
    },
  ]
  const [
    preflightPlayers, preflightConfidence, preflightDraft, preflightCards, preflightMarks,
  ] = await Promise.all([
    db(`players?room_id=eq.${room.id}&select=*&order=id.asc`),
    db(`confidence_picks?room_id=eq.${room.id}&select=*&order=id.asc`),
    db(`draft_picks?room_id=eq.${room.id}&select=*&order=id.asc`),
    db(`bingo_cards?room_id=eq.${room.id}&select=*&order=id.asc`),
    db(`bingo_marks?card_id=eq.${settlementCard.id}&select=*&order=card_id.asc,square_index.asc`),
  ])
  const preflightSnapshot = buildSettlementInputSnapshot({
    players: preflightPlayers,
    confidencePicks: preflightConfidence,
    draftPicks: preflightDraft,
    bingoCards: preflightCards,
    bingoMarks: preflightMarks,
  })
  const databaseSnapshot = await serviceRpc('settlement_input_snapshot', { p_room_id: room.id })
  check('TypeScript and database settlement-input snapshots are identical',
    JSON.stringify(canonicalize(preflightSnapshot)) === JSON.stringify(canonicalize(databaseSnapshot)))

  let settlementArgs = {
    p_room_code: code,
    p_manifest_hash: 'a'.repeat(64),
    p_title: 'Dogfood researched record',
    p_actor: 'dogfood operator',
    p_bingo_mode: 'replace',
    p_entries: settlementEntries,
    p_bingo_marks: [{
      card_id: settlementCard.id,
      square_index: 0,
      marked_at: new Date().toISOString(),
      warrant,
    }],
    p_input_snapshot: preflightSnapshot,
  }

  let anonSettlementDenied = false
  try { await rpc('settle_room_checked', settlementArgs) } catch { anonSettlementDenied = true }
  check('anon cannot invoke the settlement command', anonSettlementDenied)

  const { p_input_snapshot: _uncheckedSnapshot, ...uncheckedArgs } = settlementArgs
  let legacyUncheckedDenied = false
  try {
    await serviceRpc('settle_room', { ...uncheckedArgs, p_room_code: 'NOPE000' })
  } catch (error) {
    const message = String(error)
    legacyUncheckedDenied = message.includes('permission denied') ||
      message.includes('Could not find the function public.settle_room')
  }
  check('service operator cannot bypass the checked settlement RPC', legacyUncheckedDenied)

  let missingPreflightDenied = false
  try {
    await serviceRpc('settle_room_checked', { ...settlementArgs, p_input_snapshot: null })
  } catch { missingPreflightDenied = true }
  const [roomAfterMissingPreflight] = await db(
    `rooms?id=eq.${room.id}&select=phase,active_settlement_id`,
  )
  check('missing preflight snapshot is rejected before the room closes',
    missingPreflightDenied &&
      roomAfterMissingPreflight.phase === 'finished' &&
      roomAfterMissingPreflight.active_settlement_id === null,
    JSON.stringify(roomAfterMissingPreflight))

  await db(`players?id=eq.${players[0].id}`, {
    method: 'PATCH', body: JSON.stringify({ name: 'Changed during preflight' }),
  })
  let stalePreflightDenied = false
  try { await serviceRpc('settle_room_checked', settlementArgs) } catch { stalePreflightDenied = true }
  const [roomAfterStalePreflight] = await db(
    `rooms?id=eq.${room.id}&select=phase,active_settlement_id`,
  )
  check('stale preflight is rejected before the room closes',
    stalePreflightDenied &&
      roomAfterStalePreflight.phase === 'finished' &&
      roomAfterStalePreflight.active_settlement_id === null,
    JSON.stringify(roomAfterStalePreflight))
  await db(`players?id=eq.${players[0].id}`, {
    method: 'PATCH', body: JSON.stringify({ name: players[0].name }),
  })

  const correctedMarkTime = new Date(Date.parse(liveMarkToPreserve.marked_at) + 1000).toISOString()
  await db(`bingo_marks?id=eq.${liveMarkToPreserve.id}`, {
    method: 'PATCH', body: JSON.stringify({ marked_at: correctedMarkTime }),
  }, SERVICE_KEY)
  let staleMarkTimeDenied = false
  try { await serviceRpc('settle_room_checked', settlementArgs) } catch { staleMarkTimeDenied = true }
  const [roomAfterStaleMarkTime] = await db(
    `rooms?id=eq.${room.id}&select=phase,active_settlement_id`,
  )
  check('stale approved-mark timestamp is rejected before the room closes',
    staleMarkTimeDenied &&
      roomAfterStaleMarkTime.phase === 'finished' &&
      roomAfterStaleMarkTime.active_settlement_id === null,
    JSON.stringify(roomAfterStaleMarkTime))
  await db(`bingo_marks?id=eq.${liveMarkToPreserve.id}`, {
    method: 'PATCH', body: JSON.stringify({ marked_at: liveMarkToPreserve.marked_at }),
  }, SERVICE_KEY)

  const [
    currentPlayers, currentConfidence, currentDraft, currentCards, currentMarks,
  ] = await Promise.all([
    db(`players?room_id=eq.${room.id}&select=*&order=id.asc`),
    db(`confidence_picks?room_id=eq.${room.id}&select=*&order=id.asc`),
    db(`draft_picks?room_id=eq.${room.id}&select=*&order=id.asc`),
    db(`bingo_cards?room_id=eq.${room.id}&select=*&order=id.asc`),
    db(`bingo_marks?card_id=eq.${settlementCard.id}&select=*&order=card_id.asc,square_index.asc`),
  ])
  settlementArgs = {
    ...settlementArgs,
    p_input_snapshot: buildSettlementInputSnapshot({
      players: currentPlayers,
      confidencePicks: currentConfidence,
      draftPicks: currentDraft,
      bingoCards: currentCards,
      bingoMarks: currentMarks,
    }),
  }
  const [applied] = await serviceRpc('settle_room_checked', settlementArgs)
  check('service operator applies settlement version 1 once',
    applied.applied === true && applied.settlement_version === 1, JSON.stringify(applied))
  const [again] = await serviceRpc('settle_room_checked', settlementArgs)
  check('same manifest is idempotent', again.applied === false && again.settlement_id === applied.settlement_id)

  const [closedRoom] = await db(`rooms?id=eq.${room.id}&select=phase,active_settlement_id`)
  check('settlement closes the room through shared phase state',
    closedRoom.phase === 'closed' && closedRoom.active_settlement_id === applied.settlement_id,
    JSON.stringify(closedRoom))

  const raceCode = 'RCE' + String(Math.floor(Math.random() * 10000)).padStart(4, '0')
  const [raceRoom] = await db('rooms', {
    method: 'POST', body: JSON.stringify({ code: raceCode, phase: 'lobby', host_id: null }),
  }, SERVICE_KEY)
  created.raceRoomId = raceRoom.id
  const [racePlayer] = await db('players', {
    method: 'POST',
    body: JSON.stringify({
      room_id: raceRoom.id, name: 'Race Witness', avatar_id: 'targaryen',
      color: '#D4AF37', is_host: true,
    }),
  }, SERVICE_KEY)
    await db(`rooms?id=eq.${raceRoom.id}`, {
      method: 'PATCH', body: JSON.stringify({ host_id: racePlayer.id, phase: 'finished' }),
    }, SERVICE_KEY)
  const raceSnapshot = buildSettlementInputSnapshot({
    players: [racePlayer], confidencePicks: [], draftPicks: [], bingoCards: [], bingoMarks: [],
  })
  const raceArgs = {
    p_room_code: raceCode,
    p_manifest_hash: 'c'.repeat(64),
    p_title: 'Concurrent settlement proof',
    p_actor: 'dogfood operator',
    p_bingo_mode: 'replace',
    p_entries: [],
    p_bingo_marks: [],
    p_input_snapshot: raceSnapshot,
  }
  const [racedSettlement, racedWrite] = await Promise.allSettled([
    serviceRpc('settle_room_checked', raceArgs),
    db(`players?id=eq.${racePlayer.id}`, {
      method: 'PATCH', body: JSON.stringify({ name: 'Raced after preflight' }),
    }),
  ])
  const [roomAfterRace] = await db(`rooms?id=eq.${raceRoom.id}&select=phase,active_settlement_id`)
  const raceSettlements: any[] = await db(`room_settlements?room_id=eq.${raceRoom.id}&select=id`)
  const settlementWon = racedSettlement.status === 'fulfilled' && racedWrite.status === 'rejected'
  const writeWon = racedSettlement.status === 'rejected' && racedWrite.status === 'fulfilled'
  check('settlement and a concurrent room-input write cannot both commit',
    (settlementWon && roomAfterRace.phase === 'closed' && raceSettlements.length === 1) ||
      (writeWon && roomAfterRace.phase === 'finished' &&
        roomAfterRace.active_settlement_id === null && raceSettlements.length === 0),
    `settlement=${racedSettlement.status} write=${racedWrite.status} room=${JSON.stringify(roomAfterRace)} versions=${raceSettlements.length}`)

  let anonPointerDenied = false
  try {
    await db(`rooms?id=eq.${room.id}`, {
      method: 'PATCH', body: JSON.stringify({ active_settlement_id: null }),
    })
  } catch { anonPointerDenied = true }
  check('anon cannot select a different canonical record', anonPointerDenied)

  let anonReopenDenied = false
  try {
    await db(`rooms?id=eq.${room.id}`, {
      method: 'PATCH', body: JSON.stringify({ phase: 'finished' }),
    })
  } catch { anonReopenDenied = true }
  check('anon cannot reopen a closed room', anonReopenDenied)

  const settlementRows: any[] = await db(`room_settlements?id=eq.${applied.settlement_id}&select=*`)
  const entryRows: any[] = await db(`room_settlement_entries?settlement_id=eq.${applied.settlement_id}&select=*&order=display_order`)
  const settlementMarkRows: any[] = await db(`room_settlement_bingo_marks?settlement_id=eq.${applied.settlement_id}&select=*`)
  const canonical = buildCanonicalRoomRecord({
    activeSettlementId: applied.settlement_id,
    categories: allCats,
    roomWinners: winners2,
    confidencePicks: scoredPicks,
    bingoMarks: [],
    settlements: settlementRows,
    settlementEntries: entryRows,
    settlementBingoMarks: settlementMarkRows,
  })
  check('settled record replaces rather than stacks the provisional GM ledger',
    canonical.source === 'settled' &&
      canonical.categories.some((category) => category.name === 'The researched character event') &&
      canonical.categories.every((category) => category.id !== created.categoryIds[1]))
  check('settlement explicitly resolves every staked prediction',
    canonical.confidencePicks.every((pick) => pick.is_correct !== null) &&
      canonical.confidencePicks.filter((pick) => pick.category_id !== target.id).every((pick) => pick.is_correct === false))
  check('replacement bingo record supersedes live marks',
    canonical.bingoMarks.length === 1 &&
      canonical.bingoMarks[0].card_id === settlementCard.id &&
      canonical.bingoMarks[0].square_index === 0)

  const preserveArgs = {
    ...settlementArgs,
    p_manifest_hash: 'b'.repeat(64),
    p_title: 'Dogfood preserved bingo snapshot',
    p_bingo_mode: 'preserve_live',
    p_bingo_marks: [{
      card_id: settlementCard.id,
      square_index: 1,
      marked_at: liveMarkToPreserve.marked_at,
      warrant,
    }],
  }
  let incompleteSnapshotDenied = false
  try {
    await serviceRpc('settle_room_checked', { ...preserveArgs, p_bingo_marks: [] })
  } catch { incompleteSnapshotDenied = true }
  check('preserve_live refuses an incomplete snapshot of approved live marks',
    incompleteSnapshotDenied)

  let rewrittenPreservedTimestampDenied = false
  try {
    await serviceRpc('settle_room_checked', {
      ...preserveArgs,
      p_bingo_marks: preserveArgs.p_bingo_marks.map((mark) => ({
        ...mark,
        marked_at: new Date(Date.parse(mark.marked_at) + 1000).toISOString(),
      })),
    })
  } catch { rewrittenPreservedTimestampDenied = true }
  check('preserve_live refuses a rewritten timestamp for an approved mark',
    rewrittenPreservedTimestampDenied)

  const [preserved] = await serviceRpc('settle_room_checked', preserveArgs)
  const [preservedRow] = await db(
    `room_settlements?id=eq.${preserved.settlement_id}&select=id,version,supersedes_id`,
  )
  check('preserved bingo appends settlement version 2',
    preserved.applied === true &&
      preservedRow.version === 2 &&
      preservedRow.supersedes_id === applied.settlement_id,
    JSON.stringify(preservedRow))

  let closedMarkWriteDenied = false
  try {
    await db(`bingo_marks?id=eq.${liveMarkToPreserve.id}`, {
      method: 'PATCH', body: JSON.stringify({ status: 'denied' }),
    })
  } catch { closedMarkWriteDenied = true }
  check('closed rooms reject anonymous live-mark changes', closedMarkWriteDenied)

  let closedPlayerWriteDenied = false
  try {
    await db(`players?id=eq.${players[0].id}`, {
      method: 'PATCH', body: JSON.stringify({ name: 'Changed after close' }),
    })
  } catch { closedPlayerWriteDenied = true }
  check('closed rooms reject anonymous player changes', closedPlayerWriteDenied)

  let closedConfidenceWriteDenied = false
  try {
    const pick = scoredPicks[0]
    await db(`confidence_picks?id=eq.${pick.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ confidence: pick.confidence === 1 ? 2 : 1 }),
    })
  } catch { closedConfidenceWriteDenied = true }
  check('closed rooms reject anonymous confidence changes', closedConfidenceWriteDenied)

  let closedDraftWriteDenied = false
  try {
    const unpicked = entities.find((entity) => !picks.some((pick) => pick.entity_id === entity.id))
    await db('draft_picks', {
      method: 'POST',
      body: JSON.stringify({
        room_id: room.id,
        player_id: players[0].id,
        entity_id: unpicked.id,
        round: 99,
        pick_number: 99,
      }),
    })
  } catch { closedDraftWriteDenied = true }
  check('closed rooms reject anonymous draft changes', closedDraftWriteDenied)

  let closedCardWriteDenied = false
  try {
    const changedCards: any[] = await db(`bingo_cards?id=eq.${settlementCards[1].id}`, {
      method: 'PATCH',
      body: JSON.stringify({ squares: [...cardB].reverse() }),
    })
    closedCardWriteDenied = changedCards.length === 0
  } catch { closedCardWriteDenied = true }
  check('closed rooms reject anonymous bingo-card changes', closedCardWriteDenied)

  let closedCategoryValueWriteDenied = false
  try {
    await db(`categories?id=eq.${created.categoryIds[0]}`, {
      method: 'PATCH', body: JSON.stringify({ points: 11, tier: 1 }),
    })
  } catch { closedCategoryValueWriteDenied = true }
  check('active settlements protect referenced category points and tiers',
    closedCategoryValueWriteDenied)

  const closureMessages: any[] = await db(
    `messages?room_id=eq.${room.id}&player_id=eq.system&select=text`,
  )
  check('service settlement writes the closure line before the record freezes',
    closureMessages.some((message) => message.text.includes('Dogfood preserved bingo snapshot')))

  let closedMessageWriteDenied = false
  try {
    await db('messages', {
      method: 'POST',
      body: JSON.stringify({
        room_id: room.id,
        player_id: players[0].id,
        text: 'Injected after the record closed.',
      }),
    })
  } catch { closedMessageWriteDenied = true }
  check('closed rooms reject anonymous chat additions', closedMessageWriteDenied)

  let closedVerdictWriteDenied = false
  try {
    await db(`player_verdicts?room_id=eq.${room.id}&player_id=eq.${players[0].id}`, {
      method: 'PATCH', body: JSON.stringify({ verdict: 'Rewritten after close.' }),
    })
  } catch { closedVerdictWriteDenied = true }
  check('closed rooms reject anonymous verdict revisions', closedVerdictWriteDenied)

  let closedBeatWriteDenied = false
  try {
    const [beat] = await db(`signature_beats?show_pack_id=eq.${room.show_pack_id}&select=id&limit=1`)
    await db('beat_activations', {
      method: 'POST',
      body: JSON.stringify({
        room_id: room.id,
        player_id: players[0].id,
        beat_id: beat.id,
      }),
    })
  } catch { closedBeatWriteDenied = true }
  check('closed rooms reject anonymous beat activations', closedBeatWriteDenied)

  let closedWinnerWriteDenied = false
  try {
    await db(`room_winners?room_id=eq.${room.id}&category_id=eq.${created.categoryIds[1]}`, {
      method: 'PATCH', body: JSON.stringify({ winner_id: charNom.id }),
    })
  } catch { closedWinnerWriteDenied = true }
  check('closed rooms reject anonymous provisional-winner revisions',
    closedWinnerWriteDenied)

  // Service-role repair remains possible, but the versioned snapshot must not
  // change even if that authority deliberately revises the old live row.
  await db(`bingo_marks?id=eq.${liveMarkToPreserve.id}`, {
    method: 'PATCH', body: JSON.stringify({ status: 'denied' }),
  }, SERVICE_KEY)
  const preservedSettlementRows: any[] = await db(
    `room_settlements?id=eq.${preserved.settlement_id}&select=*`,
  )
  const preservedEntryRows: any[] = await db(
    `room_settlement_entries?settlement_id=eq.${preserved.settlement_id}&select=*`,
  )
  const preservedMarkRows: any[] = await db(
    `room_settlement_bingo_marks?settlement_id=eq.${preserved.settlement_id}&select=*`,
  )
  const preservedCanonical = buildCanonicalRoomRecord({
    activeSettlementId: preserved.settlement_id,
    categories: allCats,
    roomWinners: winners2,
    confidencePicks: scoredPicks,
    bingoMarks: [{ ...liveMarkToPreserve, status: 'denied' }],
    settlements: preservedSettlementRows,
    settlementEntries: preservedEntryRows,
    settlementBingoMarks: preservedMarkRows,
  })
  check('closed scoring keeps the preserved snapshot after the live mark changes',
    preservedCanonical.bingoMarks.length === 1 &&
      preservedCanonical.bingoMarks[0].square_index === 1 &&
      preservedCanonical.bingoMarks[0].status === 'approved')

  const squareIndex = new Map(squares.map((square) => [square.id, square]))
  const preservedBingo = computePlayerBingoScores(
    roster,
    settlementCards,
    preservedCanonical.bingoMarks,
    squareIndex,
  )
  const preservedBoard = computeLeaderboard(
    roster,
    preservedCanonical.confidencePicks,
    allPicks,
    entities,
    preservedCanonical.categories,
    nominees,
    preservedBingo.scores,
  )
  const receiptEvidence = buildSettlementReceiptEvidence({
    players: roster,
    categories: preservedCanonical.categories,
    nominees,
    draftEntities: entities,
    draftPicks: allPicks,
    confidencePicks: preservedCanonical.confidencePicks,
    bingoCards: settlementCards,
    bingoSquares: squares,
    bingoMarks: preservedCanonical.bingoMarks,
  })
  const expectedPlayerTotals = Object.fromEntries(
    preservedBoard.map((row) => [row.player.id, row.totalScore]),
  )
  check('settlement receipt events reconstruct real closed-room player totals',
    JSON.stringify(settlementPlayerTotals(receiptEvidence)) === JSON.stringify(
      Object.fromEntries(Object.entries(expectedPlayerTotals).sort(([left], [right]) => left.localeCompare(right))),
    ))
  const expectedCharacterPoints = Object.fromEntries(
    [...tallyEntityPoints(
      preservedCanonical.categories,
      nominees,
      entities,
      allPicks,
      roster,
    ).values()]
      .filter((tally) => tally.points !== 0)
      .sort((left, right) => left.entity.id.localeCompare(right.entity.id))
      .map((tally) => [tally.entity.id, tally.points]),
  )
  check('settlement receipt events reconstruct real closed-room character totals',
    JSON.stringify(settlementCharacterPoints(receiptEvidence)) === JSON.stringify(expectedCharacterPoints))

  const [auxiliaryRoom] = await db('rooms', {
    method: 'POST',
    body: JSON.stringify({
      code: 'AUX' + String(Math.floor(Math.random() * 100000)).padStart(5, '0'),
      phase: 'lobby',
      host_id: null,
    }),
  }, SERVICE_KEY)
  created.auxiliaryRoomId = auxiliaryRoom.id
  let crossRoomPointerDenied = false
  try {
    await db(`rooms?id=eq.${auxiliaryRoom.id}`, {
      method: 'PATCH', body: JSON.stringify({ active_settlement_id: preserved.settlement_id }),
    }, SERVICE_KEY)
  } catch { crossRoomPointerDenied = true }
  check('a room cannot select another room\'s settlement even through the service role',
    crossRoomPointerDenied)

  // ── 12. Canonical read pagination ─────────────────────────────────────────
  console.log('\n\x1b[1m12. Canonical read pagination\x1b[0m')
  const paginationPrefix = `pagination-${room.id}-`
  const paginationRows = Array.from({ length: 1001 }, (_, index) => ({
    room_id: room.id,
    player_id: 'system',
    text: `${paginationPrefix}${String(index).padStart(4, '0')}`,
  }))
  await db('messages', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(paginationRows),
  }, SERVICE_KEY)
  const paginatedMessages = await fetchAllRows<{ id: string; text: string }>((from, to) => dogfoodSupabase
    .from('messages').select('id,text')
    .eq('room_id', room.id)
    .like('text', `${paginationPrefix}%`)
    .order('id')
    .range(from, to))
  if (paginatedMessages.error) throw paginatedMessages.error
  check('the canonical client reader crosses the 1,000-row PostgREST boundary',
    paginatedMessages.data?.length === 1001 &&
      paginatedMessages.data.some((message) => message.text === `${paginationPrefix}1000`),
    `${paginatedMessages.data?.length ?? 0} rows loaded`)

  // ── 13. Room-bound show catalogs ──────────────────────────────────────────
  console.log('\n\x1b[1m13. Room-bound show catalogs\x1b[0m')
  const triggerContract = (title: string, condition: string) => ({
    title,
    condition,
    exclusions: ['A dialogue-only reference does not count.'],
    adjudication: {
      proxies: 'do_not_count',
      offscreen: 'do_not_count',
      mentions: 'do_not_count',
    },
    title_review: {
      status: 'approved',
      note: 'The title promises the same visible event as the condition.',
    },
    basis_claim_ids: ['dogfood-screen-claim'],
  })
  const auxiliaryPortraits = [
    {
      id: 'auxiliary-nominee-1',
      portrait: {
        path: '/show-packs/dogfood/auxiliary-nominee-1.webp',
        sha256: '1'.repeat(64),
      },
    },
    {
      id: 'auxiliary-nominee-2',
      portrait: {
        path: '/show-packs/dogfood/auxiliary-nominee-2.webp',
        sha256: '2'.repeat(64),
      },
    },
    {
      id: 'auxiliary-fighter',
      portrait: {
        path: '/show-packs/dogfood/auxiliary-fighter.webp',
        sha256: '3'.repeat(64),
      },
    },
    {
      id: 'auxiliary-fighter-decoy',
      portrait: {
        path: '/show-packs/dogfood/auxiliary-fighter-decoy.webp',
        sha256: '4'.repeat(64),
      },
    },
  ]
  const auxiliaryPackId = DOGFOOD_PACK_ID
  const auxiliaryNomineeIds = [...DOGFOOD_NOMINEE_IDS]
  const witnessNomineeId = DOGFOOD_WITNESS_NOMINEE_ID
  const witnessDecoyNomineeId = DOGFOOD_WITNESS_DECOY_NOMINEE_ID
  const auxiliaryEntityId = DOGFOOD_ENTITY_ID
  const witnessRivalEntityId = DOGFOOD_RIVAL_ENTITY_ID
  const witnessBeatContract = triggerContract(
    'Witness-only beat',
    'The auxiliary fighter completes the visible witness test on screen.',
  )
  const auxiliaryShowPack = {
    id: auxiliaryPackId,
    pack_key: 'dogfood-isolation-fixture',
    version: 1,
    title: 'Dogfood isolated pack',
    property: 'Dogfood',
    installment: 'Isolation proof',
    fact_source: 'room_declared',
    manifest_sha256: 'c'.repeat(64),
    compiled_bundle: { schema_version: 3, entities: auxiliaryPortraits },
    status: 'draft',
    published_at: null,
  }

  // Rejection tests use a disposable draft registry. It can be deleted during
  // cleanup because it never crosses the publication boundary.
  const draftShowPackId = crypto.randomUUID()
  const draftEntityId = crypto.randomUUID()
  created.draftShowPackId = draftShowPackId
  const draftShowPack = {
    ...auxiliaryShowPack,
    id: draftShowPackId,
    pack_key: `dogfood-draft-${draftShowPackId.slice(0, 8)}`,
    title: 'Dogfood disposable draft',
    compiled_bundle: {
      schema_version: 3,
      entities: [{
        id: 'doctrine-probe',
        portrait: {
          path: '/show-packs/dogfood/doctrine-probe.webp',
          sha256: '5'.repeat(64),
        },
      }],
    },
  }
  await db('show_packs', {
    method: 'POST',
    body: JSON.stringify(draftShowPack),
  }, SERVICE_KEY)
  let incompletePackBindingDenied = false
  try {
    await serviceRpc('publish_and_bind_show_pack', {
      p_room_code: auxiliaryRoom.code,
      p_catalog: await readShowPackCatalogManifest(draftShowPack),
    })
  } catch { incompletePackBindingDenied = true }
  check('atomic publication refuses an incomplete show pack', incompletePackBindingDenied)
  const [stillDraft] = await db(
    `show_packs?id=eq.${draftShowPackId}&select=status,published_at`,
    {},
    SERVICE_KEY,
  )
  check('failed atomic publication leaves the registry in draft',
    stillDraft.status === 'draft' && stillDraft.published_at === null)

  await db('draft_entities', {
    method: 'POST',
    body: JSON.stringify({
      id: draftEntityId,
      name: 'Doctrine probe',
      type: 'person',
      nominations: [],
      film_name: 'Isolation proof',
      nom_count: 1,
      show_pack_id: draftShowPackId,
      pack_key: 'doctrine-probe',
    }),
  }, SERVICE_KEY)
  let doctrineFreeCategoryDenied = false
  try {
    await db('categories', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Unsafe auxiliary prediction', tier: 1, points: 10,
        display_order: 1, show_pack_id: draftShowPackId, room_id: null,
        pack_key: 'unsafe-category',
      }),
    }, SERVICE_KEY)
  } catch { doctrineFreeCategoryDenied = true }
  check('database rejects a new-pack prediction without trigger doctrine', doctrineFreeCategoryDenied)
  let doctrineFreeBeatDenied = false
  try {
    await db('signature_beats', {
      method: 'POST',
      body: JSON.stringify({
        entity_id: draftEntityId,
        name: 'Unsafe auxiliary beat',
        trigger_text: 'A bare sentence.',
        odds: 'likely',
        points: 4,
        pitch: 'Doctrine rejection proof.',
        partner_entity_id: null,
        show_pack_id: draftShowPackId,
        pack_key: 'unsafe-beat',
        trigger_contract: {
          ...triggerContract('Unsafe auxiliary beat', 'A bare sentence.'),
          adjudication: {
            ...triggerContract('Unsafe auxiliary beat', 'A bare sentence.').adjudication,
            proxies: 'unspecified',
          },
        },
      }),
    }, SERVICE_KEY)
  } catch { doctrineFreeBeatDenied = true }
  check('database rejects a new-pack beat with implicit proxy doctrine', doctrineFreeBeatDenied)
  let doctrineFreeSquareDenied = false
  try {
    await db('bingo_squares', {
      method: 'POST',
      body: JSON.stringify({
        id: 1_800_000_000 + Math.floor(Math.random() * 10_000_000),
        text: 'A bare sentence.',
        short_text: 'Unsafe square',
        is_objective: false,
        slug: `dogfood-${draftShowPackId}-unsafe`,
        title: 'Unsafe square',
        category: 'isolation',
        probability_pct: 70,
        likelihood_tier: 'likely',
        win_condition: 'A bare sentence.',
        why_it_is_fun: 'Doctrine rejection proof.',
        storyline_tags: ['isolation'],
        fun_type: null,
        show_pack_id: draftShowPackId,
        pack_key: 'unsafe-square',
        trigger_contract: {
          ...triggerContract('Unsafe square', 'A bare sentence.'),
          title_review: { status: 'needs_revision', note: 'The title overpromises.' },
        },
      }),
    }, SERVICE_KEY)
  } catch { doctrineFreeSquareDenied = true }
  check('database rejects a new-pack bingo square without title approval', doctrineFreeSquareDenied)

  // The published fixture is deterministic and retained between local runs.
  // Publication makes its catalog undeletable to ordinary service clients, so
  // one known fixture replaces the old stream of random leaked packs.
  let existingFixture: any[] = await db(
    `show_packs?id=eq.${auxiliaryPackId}&select=id,status`,
    {},
    SERVICE_KEY,
  )
  if (existingFixture[0]?.status === 'draft') {
    await removeDraftShowPack(auxiliaryPackId)
    existingFixture = []
  }
  if (existingFixture.length === 0) {
    await db('show_packs', {
      method: 'POST',
      body: JSON.stringify(auxiliaryShowPack),
    }, SERVICE_KEY)
    await db('nominees', {
      method: 'POST',
      body: JSON.stringify([
        ...auxiliaryNomineeIds.map((id, index) => ({
          id,
          name: `Auxiliary nominee ${index + 1}`,
          type: 'person',
          film_name: 'Isolation proof',
          image_url: auxiliaryPortraits[index].portrait.path,
          show_pack_id: auxiliaryPackId,
          pack_key: `auxiliary-nominee-${index + 1}`,
        })),
        {
          id: witnessNomineeId,
          name: 'Auxiliary fighter',
          type: 'person',
          film_name: 'Isolation proof',
          image_url: auxiliaryPortraits[2].portrait.path,
          show_pack_id: auxiliaryPackId,
          pack_key: 'auxiliary-fighter',
        },
        {
          id: witnessDecoyNomineeId,
          name: 'Rival fighter',
          type: 'person',
          film_name: 'Isolation proof',
          image_url: auxiliaryPortraits[3].portrait.path,
          show_pack_id: auxiliaryPackId,
          pack_key: 'auxiliary-fighter-decoy',
        },
      ]),
    }, SERVICE_KEY)
    await db('draft_entities', {
      method: 'POST',
      body: JSON.stringify([
        {
          id: auxiliaryEntityId,
          name: 'Auxiliary fighter',
          type: 'person',
          nominations: [],
          film_name: 'Isolation proof',
          nom_count: 1,
          show_pack_id: auxiliaryPackId,
          pack_key: 'auxiliary-fighter',
        },
        {
          id: witnessRivalEntityId,
          name: 'Rival fighter',
          type: 'person',
          nominations: [],
          film_name: 'Isolation proof',
          nom_count: 1,
          show_pack_id: auxiliaryPackId,
          pack_key: 'auxiliary-fighter-decoy',
        },
      ]),
    }, SERVICE_KEY)
    const [installedCategory] = await db('categories', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Only the auxiliary room can see this', tier: 1, points: 10,
        display_order: 1, show_pack_id: auxiliaryPackId, room_id: null,
        pack_key: 'isolated-category',
        trigger_contract: triggerContract(
          'Only the auxiliary room can see this',
          'The authored event happens visibly on screen.',
        ),
      }),
    }, SERVICE_KEY)
    await db('category_nominees', {
      method: 'POST',
      body: JSON.stringify(auxiliaryNomineeIds.map((nomineeId) => ({
        category_id: installedCategory.id,
        nominee_id: nomineeId,
      }))),
    }, SERVICE_KEY)
    await db('signature_beats', {
      method: 'POST',
      body: JSON.stringify([
        {
          entity_id: auxiliaryEntityId,
          name: 'Auxiliary beat',
          trigger_text: 'The auxiliary fighter completes the isolated beat on screen.',
          odds: 'likely',
          points: 4,
          pitch: 'Isolation proof.',
          partner_entity_id: null,
          show_pack_id: auxiliaryPackId,
          pack_key: 'auxiliary-beat',
          trigger_contract: triggerContract(
            'Auxiliary beat',
            'The auxiliary fighter completes the isolated beat on screen.',
          ),
        },
        {
          entity_id: auxiliaryEntityId,
          name: 'Witness-only beat',
          trigger_text: 'The auxiliary fighter completes the visible witness test on screen.',
          odds: 'likely',
          points: 6,
          pitch: 'Atomic witness proof.',
          partner_entity_id: witnessRivalEntityId,
          show_pack_id: auxiliaryPackId,
          pack_key: 'witness-only-beat',
          trigger_contract: witnessBeatContract,
        },
      ]),
    }, SERVICE_KEY)
    await db('bingo_squares', {
      method: 'POST',
      body: JSON.stringify(Array.from({ length: 24 }, (_, index) => ({
        id: DOGFOOD_SQUARE_BASE + index,
        text: `Auxiliary condition ${index + 1}`,
        short_text: `Auxiliary ${index + 1}`,
        is_objective: false,
        slug: `dogfood-isolation-${index + 1}`,
        title: `Auxiliary ${index + 1}`,
        category: 'isolation',
        probability_pct: 70,
        likelihood_tier: 'likely',
        win_condition: `Auxiliary condition ${index + 1}`,
        why_it_is_fun: 'It proves a room-bound pool.',
        storyline_tags: ['isolation'],
        fun_type: null,
        show_pack_id: auxiliaryPackId,
        pack_key: `auxiliary-square-${index + 1}`,
        trigger_contract: triggerContract(
          `Auxiliary ${index + 1}`,
          `Auxiliary condition ${index + 1}`,
        ),
      }))),
    }, SERVICE_KEY)
  }

  await serviceRpc('publish_and_bind_show_pack', {
    p_room_code: auxiliaryRoom.code,
    p_catalog: await readShowPackCatalogManifest(auxiliaryShowPack),
  })
  const [publishedPack] = await db(
    `show_packs?id=eq.${auxiliaryPackId}&select=status,published_at`,
    {},
    SERVICE_KEY,
  )
  check('exact catalog attestation and room binding commit together',
    publishedPack.status === 'published' && publishedPack.published_at !== null &&
      (await db(`rooms?id=eq.${auxiliaryRoom.id}&select=show_pack_id`, {}, SERVICE_KEY))[0].show_pack_id === auxiliaryPackId)

  const [auxiliaryCategory] = await db(
    `categories?show_pack_id=eq.${auxiliaryPackId}&pack_key=eq.isolated-category&select=*`,
    {},
    SERVICE_KEY,
  )
  const [auxiliaryBeat] = await db(
    `signature_beats?show_pack_id=eq.${auxiliaryPackId}&pack_key=eq.auxiliary-beat&select=*`,
    {},
    SERVICE_KEY,
  )
  const [witnessBeat] = await db(
    `signature_beats?show_pack_id=eq.${auxiliaryPackId}&pack_key=eq.witness-only-beat&select=*`,
    {},
    SERVICE_KEY,
  )
  if (witnessBeat.partner_entity_id !== witnessRivalEntityId) {
    throw new Error(
      'the retained local dogfood pack predates paired witness review; run `supabase db reset` once',
    )
  }
  const witnessSourceCandidate = {
    beat_id: witnessBeat.id,
    beat_key: witnessBeat.pack_key,
    title: witnessBeat.name,
    condition: witnessBeatContract.condition.trim(),
    exclusions: witnessBeatContract.exclusions,
    adjudication: witnessBeatContract.adjudication,
    points: witnessBeat.points,
    entities: [
      {
        entity_id: auxiliaryEntityId,
        entity_key: 'auxiliary-fighter',
        name: 'Auxiliary fighter',
      },
      {
        entity_id: witnessRivalEntityId,
        entity_key: 'auxiliary-fighter-decoy',
        name: 'Rival fighter',
      },
    ],
  }

  let directPublicationDenied = false
  try {
    await db(`show_packs?id=eq.${auxiliaryPackId}`, {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Unauthorized service mutation' }),
    }, SERVICE_KEY)
  } catch { directPublicationDenied = true }
  check('service clients cannot update a registry around atomic publication', directPublicationDenied)

  try {
    await db(`categories?id=eq.${auxiliaryCategory.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Anonymous catalog mutation' }),
    })
  } catch { /* an explicit denial and a zero-row RLS result are both safe */ }
  const [protectedCategory] = await db(
    `categories?id=eq.${auxiliaryCategory.id}&select=name`,
    {},
    SERVICE_KEY,
  )
  check('anonymous clients cannot mutate an authored prediction',
    protectedCategory.name === 'Only the auxiliary room can see this')

  try {
    await db(
      `category_nominees?category_id=eq.${auxiliaryCategory.id}&nominee_id=eq.${auxiliaryNomineeIds[0]}`,
      { method: 'DELETE' },
    )
  } catch { /* an explicit denial and a zero-row RLS result are both safe */ }
  const protectedLinks: any[] = await db(
    `category_nominees?category_id=eq.${auxiliaryCategory.id}&nominee_id=eq.${auxiliaryNomineeIds[0]}&select=category_id`,
    {},
    SERVICE_KEY,
  )
  check('anonymous clients cannot unlink an authored prediction candidate', protectedLinks.length === 1)

  try {
    await db(`signature_beats?id=eq.${auxiliaryBeat.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Anonymous beat mutation' }),
    })
  } catch { /* the write privilege is intentionally absent */ }
  const [protectedBeat] = await db(
    `signature_beats?id=eq.${auxiliaryBeat.id}&select=name`,
    {},
    SERVICE_KEY,
  )
  check('anonymous clients cannot mutate an authored signature beat',
    protectedBeat.name === 'Auxiliary beat')

  let publishedCatalogMutationDenied = false
  try {
    await db(`signature_beats?id=eq.${witnessBeat.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ points: witnessBeat.points + 1 }),
    }, SERVICE_KEY)
  } catch { publishedCatalogMutationDenied = true }
  const [immutableWitnessBeat] = await db(
    `signature_beats?id=eq.${witnessBeat.id}&select=points`,
    {},
    SERVICE_KEY,
  )
  check('published show-pack catalogs reject ordinary service mutations',
    publishedCatalogMutationDenied && immutableWitnessBeat.points === witnessBeat.points)

  const auxiliaryBeatContract = triggerContract(
    'Auxiliary beat',
    'The auxiliary fighter completes the isolated beat on screen.',
  )
  let halfProvenanceDenied = false
  try {
    await db('categories', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Half-provenance declaration', tier: 3, points: 4,
        display_order: 1000000, show_pack_id: null, room_id: auxiliaryRoom.id,
        source_signature_beat_id: auxiliaryBeat.id,
      }),
    }, SERVICE_KEY)
  } catch { halfProvenanceDenied = true }
  check('database rejects a declaration with only half of its source provenance', halfProvenanceDenied)

  let copiedContractDenied = false
  try {
    await db('categories', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Copied-rule declaration', tier: 3, points: 4,
        display_order: 1000000, show_pack_id: null, room_id: auxiliaryRoom.id,
        source_signature_beat_id: auxiliaryBeat.id,
        source_trigger_contract: {
          ...auxiliaryBeatContract,
          exclusions: ['A different exclusion does not count.'],
        },
      }),
    }, SERVICE_KEY)
  } catch { copiedContractDenied = true }
  check('database rejects a declaration whose frozen rule differs from its source beat', copiedContractDenied)

  let mismatchedSourceFactDenied = false
  try {
    await db('categories', {
      method: 'POST',
      body: JSON.stringify({
        name: 'A different declared fact', tier: 3, points: 4,
        display_order: 1000000, show_pack_id: null, room_id: auxiliaryRoom.id,
        source_signature_beat_id: auxiliaryBeat.id,
        source_trigger_contract: auxiliaryBeatContract,
      }),
    }, SERVICE_KEY)
  } catch { mismatchedSourceFactDenied = true }
  check('database binds a sourced declaration fact to its signature beat', mismatchedSourceFactDenied)

  let mismatchedSourcePointsDenied = false
  try {
    await db('categories', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Auxiliary beat', tier: 3, points: 99,
        display_order: 1000000, show_pack_id: null, room_id: auxiliaryRoom.id,
        source_signature_beat_id: auxiliaryBeat.id,
        source_trigger_contract: auxiliaryBeatContract,
      }),
    }, SERVICE_KEY)
  } catch { mismatchedSourcePointsDenied = true }
  check('database binds sourced declaration points to its signature beat', mismatchedSourcePointsDenied)

  const [sourcedDeclaration] = await db('categories', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Auxiliary beat', tier: 3, points: 4,
      display_order: 1000000, show_pack_id: null, room_id: auxiliaryRoom.id,
      source_signature_beat_id: auxiliaryBeat.id,
      source_trigger_contract: auxiliaryBeatContract,
    }),
  }, SERVICE_KEY)
  check('database freezes the exact reviewed source rule on a room declaration',
    sourcedDeclaration.source_signature_beat_id === auxiliaryBeat.id &&
      JSON.stringify(canonicalize(sourcedDeclaration.source_trigger_contract)) ===
        JSON.stringify(canonicalize(auxiliaryBeatContract)))

  let provenanceMutationDenied = false
  try {
    await db(`categories?id=eq.${sourcedDeclaration.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ source_signature_beat_id: null, source_trigger_contract: null }),
    }, SERVICE_KEY)
  } catch { provenanceMutationDenied = true }
  check('database makes declaration source provenance immutable', provenanceMutationDenied)

  let sourcedFactMutationDenied = false
  try {
    await db(`categories?id=eq.${sourcedDeclaration.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'A later different fact', points: 99 }),
    }, SERVICE_KEY)
  } catch { sourcedFactMutationDenied = true }
  check('database keeps a sourced declaration fact and points bound after insertion', sourcedFactMutationDenied)

  const mainVisible: any[] = await db(
    `categories?or=(show_pack_id.eq.${room.show_pack_id},room_id.eq.${room.id})&select=id`,
  )
  const auxiliaryVisible: any[] = await db(
    `categories?or=(show_pack_id.eq.${auxiliaryPackId},room_id.eq.${auxiliaryRoom.id})&select=id`,
  )
  check('a room sees its authored pack and its own declarations only',
    created.categoryIds.every((id) => mainVisible.some((category) => category.id === id)) &&
      !mainVisible.some((category) => category.id === auxiliaryCategory.id))
  check('a second pack sees its authored catalog and its own declaration only',
    auxiliaryVisible.length === 2 &&
      auxiliaryVisible.some((category) => category.id === auxiliaryCategory.id) &&
      auxiliaryVisible.some((category) => category.id === sourcedDeclaration.id),
    JSON.stringify(auxiliaryVisible))

  const [auxiliaryPlayer] = await db('players', {
    method: 'POST',
    body: JSON.stringify({
      room_id: auxiliaryRoom.id, name: 'Pack Guard', avatar_id: 'targaryen',
      color: '#D4AF37', is_host: true,
    }),
  }, SERVICE_KEY)
  await db(`rooms?id=eq.${auxiliaryRoom.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      host_id: auxiliaryPlayer.id,
      // Reach the person segment so this assertion exercises pack isolation,
      // not conviction mode's intentional end after the identity-film round.
      game_model: 'legacy_ensemble',
      phase: 'draft',
      draft_order: [auxiliaryPlayer.id],
      current_pick: 0,
    }),
  }, SERVICE_KEY)
  let crossPackDraftDenied = false
  try {
    await db('draft_picks', {
      method: 'POST',
      body: JSON.stringify({
        room_id: auxiliaryRoom.id,
        player_id: auxiliaryPlayer.id,
        entity_id: entities[0].id,
        round: 1,
        pick_number: 0,
      }),
    })
  } catch (error) {
    crossPackDraftDenied = error instanceof Error &&
      error.message.includes('draft entity is not eligible for this turn')
  }
  const [roomAfterCrossPackDraft] = await db(
    `rooms?id=eq.${auxiliaryRoom.id}&select=current_pick`,
    {},
    SERVICE_KEY,
  )
  const crossPackDraftRows: any[] = await db(
    `draft_picks?room_id=eq.${auxiliaryRoom.id}&select=id`,
    {},
    SERVICE_KEY,
  )
  check('database rejects a draft entity from another show pack without advancing the turn',
    crossPackDraftDenied && roomAfterCrossPackDraft.current_pick === 0 && crossPackDraftRows.length === 0)

  const [auxiliaryNonHost] = await db('players', {
    method: 'POST',
    body: JSON.stringify({
      room_id: auxiliaryRoom.id, name: 'Not Referee', avatar_id: 'stark',
      color: '#999999', is_host: false,
    }),
  })
  await db(`rooms?id=eq.${auxiliaryRoom.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ phase: 'live' }),
  }, SERVICE_KEY)

  let directWitnessReadDenied = false
  try {
    await db(`witness_proposals?room_id=eq.${auxiliaryRoom.id}&select=id`)
  } catch { directWitnessReadDenied = true }
  check('witness proposal rows are private from ordinary clients', directWitnessReadDenied)
  let directWitnessSupportReadDenied = false
  try {
    await db(`witness_supporting_observations?room_id=eq.${auxiliaryRoom.id}&select=id`)
  } catch { directWitnessSupportReadDenied = true }
  check('witness supporting observations are private from ordinary clients', directWitnessSupportReadDenied)

  const [revisionBeforeWitness] = await db(
    `rooms?id=eq.${auxiliaryRoom.id}&select=witness_revision`,
    {},
    SERVICE_KEY,
  )
  let directWitnessRevisionDenied = false
  try {
    await db(`rooms?id=eq.${auxiliaryRoom.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ witness_revision: revisionBeforeWitness.witness_revision + 1 }),
    })
  } catch { directWitnessRevisionDenied = true }
  check('database owns the witness Realtime revision counter', directWitnessRevisionDenied)
  const witnessObservedAt = new Date().toISOString()
  const witnessEvidence = {
    p_room_id: auxiliaryRoom.id,
    p_source_signature_beat_id: witnessBeat.id,
    p_entity_id: auxiliaryEntityId,
    p_confidence: 88,
    p_observed_at: witnessObservedAt,
    p_frame_sha256: 'a'.repeat(64),
    p_reference_manifest_sha256: 'b'.repeat(64),
    p_reference_images_sha256: '9'.repeat(64),
    p_model_output_sha256: 'c'.repeat(64),
    p_model: 'dogfood-vision',
    p_source_candidate: witnessSourceCandidate,
  }
  const createdWitnessObservation = await serviceRpc('record_witness_observation_v2', witnessEvidence)
  const [witnessProposal] = await db(
    `witness_proposals?id=eq.${createdWitnessObservation.proposal_id}&select=*`,
    {},
    SERVICE_KEY,
  )
  check('the room-locked witness command creates the first pending review unit',
    createdWitnessObservation.disposition === 'created' &&
      createdWitnessObservation.observation_count === 1 &&
      witnessProposal.id === createdWitnessObservation.proposal_id)
  const duplicateWitnessObservation = await serviceRpc('record_witness_observation_v2', witnessEvidence)
  check('an exact repeated frame is an idempotent no-op',
    duplicateWitnessObservation.disposition === 'duplicate' &&
      duplicateWitnessObservation.observation_count === 1)
  let mismatchedDuplicateWitnessDenied = false
  try {
    await serviceRpc('record_witness_observation_v2', {
      ...witnessEvidence,
      p_confidence: 89,
    })
  } catch { mismatchedDuplicateWitnessDenied = true }
  check('the same frame hash cannot carry different witness evidence', mismatchedDuplicateWitnessDenied)
  const supportingWitnessObservation = await serviceRpc('record_witness_observation_v2', {
    ...witnessEvidence,
    p_entity_id: witnessRivalEntityId,
    p_confidence: 93,
    p_observed_at: new Date(Date.parse(witnessObservedAt) + 1_000).toISOString(),
    p_frame_sha256: 'd'.repeat(64),
    p_reference_images_sha256: '0'.repeat(64),
    p_model_output_sha256: 'e'.repeat(64),
  })
  check('a later distinct frame appends support when unrelated board references have changed',
    supportingWitnessObservation.disposition === 'supported' &&
      supportingWitnessObservation.observation_count === 2)
  for (const [index, digestCharacter] of ['2', '3', '4', '5', '6', '7'].entries()) {
    const boundedSupport = await serviceRpc('record_witness_observation_v2', {
      ...witnessEvidence,
      p_confidence: 89 + index,
      p_observed_at: new Date(Date.parse(witnessObservedAt) + (index + 2) * 1_000).toISOString(),
      p_frame_sha256: digestCharacter.repeat(64),
      p_model_output_sha256: digestCharacter.repeat(64),
    })
    check(`distinct positive frame ${index + 3} stays inside the bounded review unit`,
      boundedSupport.disposition === 'supported' &&
        boundedSupport.observation_count === index + 3)
  }
  const saturatedWitnessObservation = await serviceRpc('record_witness_observation_v2', {
    ...witnessEvidence,
    p_confidence: 95,
    p_observed_at: new Date(Date.parse(witnessObservedAt) + 8_000).toISOString(),
    p_frame_sha256: '8'.repeat(64),
    p_model_output_sha256: '8'.repeat(64),
  })
  check('a ninth positive frame is acknowledged without growing the sealed review unit',
    saturatedWitnessObservation.disposition === 'saturated' &&
      saturatedWitnessObservation.observation_count === 8)
  const [revisionAfterWitness] = await db(
    `rooms?id=eq.${auxiliaryRoom.id}&select=witness_revision`,
    {},
    SERVICE_KEY,
  )
  check('root and retained supporting witness evidence each advance the room Realtime revision',
    revisionAfterWitness.witness_revision === revisionBeforeWitness.witness_revision + 8)

  let publicIdsOnlyWitnessReadDenied = false
  try {
    await rpc('list_pending_witness_proposals', {
      p_room_id: auxiliaryRoom.id,
      p_actor_player_id: auxiliaryPlayer.id,
    })
  } catch { publicIdsOnlyWitnessReadDenied = true }
  check('public room and host IDs cannot read the witness queue', publicIdsOnlyWitnessReadDenied)

  const issuedWitnessCapability = await serviceRpc('issue_room_operator_capability', {
    p_room_id: auxiliaryRoom.id,
  })
  let witnessCapability = issuedWitnessCapability.capability as string
  check('service operator issues one unguessable room capability without storing it publicly',
    typeof witnessCapability === 'string' && /^[a-f0-9]{64}$/.test(witnessCapability))

  let wrongWitnessCapabilityDenied = false
  try {
    await rpc('list_pending_witness_proposals_authorized_v2', {
      p_room_id: auxiliaryRoom.id,
      p_actor_player_id: auxiliaryPlayer.id,
      p_operator_capability: '0'.repeat(64),
    })
  } catch { wrongWitnessCapabilityDenied = true }
  check('a wrong room capability cannot read the witness queue', wrongWitnessCapabilityDenied)

  let nonHostWitnessReadDenied = false
  try {
    await rpc('list_pending_witness_proposals_authorized_v2', {
      p_room_id: auxiliaryRoom.id,
      p_actor_player_id: auxiliaryNonHost.id,
      p_operator_capability: witnessCapability,
    })
  } catch { nonHostWitnessReadDenied = true }
  check('a valid capability does not replace current host-role validation', nonHostWitnessReadDenied)
  const pendingWitness = await rpc('list_pending_witness_proposals_authorized_v2', {
    p_room_id: auxiliaryRoom.id,
    p_actor_player_id: auxiliaryPlayer.id,
    p_operator_capability: witnessCapability,
  })
  check('host reads canonical authored fields beside structured witness evidence',
    pendingWitness.length === 1 &&
      pendingWitness[0].id === witnessProposal.id &&
      pendingWitness[0].beat_name === witnessBeat.name &&
      JSON.stringify(canonicalize(pendingWitness[0].adjudication)) ===
        JSON.stringify(canonicalize(witnessBeatContract.adjudication)) &&
      JSON.stringify(pendingWitness[0].exclusions) ===
        JSON.stringify(witnessBeatContract.exclusions) &&
      pendingWitness[0].observation_count === 8 &&
      pendingWitness[0].matching_entity_count === 7 &&
      pendingWitness[0].conflicting_entity_count === 1 &&
      pendingWitness[0].conflicting_entity_name === 'Rival fighter' &&
      JSON.stringify(pendingWitness[0].ruling_options) === JSON.stringify([
        { entity_id: auxiliaryEntityId, entity_name: 'Auxiliary fighter', positive_count: 7 },
        { entity_id: witnessRivalEntityId, entity_name: 'Rival fighter', positive_count: 1 },
      ]) &&
      pendingWitness[0].minimum_confidence === 88 &&
      pendingWitness[0].maximum_confidence === 94 &&
      pendingWitness[0].entity_name === 'Auxiliary fighter' &&
      pendingWitness[0].points === witnessBeat.points)

  let nonHostWitnessReviewDenied = false
  try {
    await rpc('review_witness_proposal_authorized_v2', {
      p_room_id: auxiliaryRoom.id,
      p_proposal_id: witnessProposal.id,
      p_actor_player_id: auxiliaryNonHost.id,
      p_action: 'accept',
      p_selected_entity_id: witnessRivalEntityId,
      p_expected_observation_count: 8,
      p_operator_capability: witnessCapability,
    })
  } catch { nonHostWitnessReviewDenied = true }
  check('database restricts witness review to the room host', nonHostWitnessReviewDenied)

  let implicitDisputedRulingDenied = false
  try {
    await rpc('review_witness_proposal_authorized_v2', {
      p_room_id: auxiliaryRoom.id,
      p_proposal_id: witnessProposal.id,
      p_actor_player_id: auxiliaryPlayer.id,
      p_action: 'accept',
      p_selected_entity_id: null,
      p_expected_observation_count: 8,
      p_operator_capability: witnessCapability,
    })
  } catch { implicitDisputedRulingDenied = true }
  check('disputed witness evidence cannot silently default to the first frame', implicitDisputedRulingDenied)
  let staleWitnessCountDenied = false
  try {
    await rpc('review_witness_proposal_authorized_v2', {
      p_room_id: auxiliaryRoom.id,
      p_proposal_id: witnessProposal.id,
      p_actor_player_id: auxiliaryPlayer.id,
      p_action: 'accept',
      p_selected_entity_id: witnessRivalEntityId,
      p_expected_observation_count: 7,
      p_operator_capability: witnessCapability,
    })
  } catch { staleWitnessCountDenied = true }
  check('acceptance fails when retained evidence changed after the host loaded review', staleWitnessCountDenied)
  let unevidencedRulingDenied = false
  try {
    await rpc('review_witness_proposal_authorized_v2', {
      p_room_id: auxiliaryRoom.id,
      p_proposal_id: witnessProposal.id,
      p_actor_player_id: auxiliaryPlayer.id,
      p_action: 'accept',
      p_selected_entity_id: crypto.randomUUID(),
      p_expected_observation_count: 8,
      p_operator_capability: witnessCapability,
    })
  } catch { unevidencedRulingDenied = true }
  check('the host cannot select an entity absent from retained positive evidence', unevidencedRulingDenied)

  const acceptedWitness = await rpc('review_witness_proposal_authorized_v2', {
    p_room_id: auxiliaryRoom.id,
    p_proposal_id: witnessProposal.id,
    p_actor_player_id: auxiliaryPlayer.id,
    p_action: 'accept',
    p_selected_entity_id: witnessRivalEntityId,
    p_expected_observation_count: 8,
    p_operator_capability: witnessCapability,
  })
  const [acceptedProposalRow] = await db(
    `witness_proposals?id=eq.${witnessProposal.id}&select=*`,
    {},
    SERVICE_KEY,
  )
  const [witnessDeclaration] = await db(
    `categories?id=eq.${acceptedWitness.declaration_category_id}&select=*`,
    {},
    SERVICE_KEY,
  )
  const witnessWinner = await db(
    `room_winners?room_id=eq.${auxiliaryRoom.id}&category_id=eq.${witnessDeclaration.id}&select=*`,
    {},
    SERVICE_KEY,
  )
  check('host acceptance atomically writes one canonical sourced declaration and resolves the proposal',
      acceptedWitness.status === 'accepted' &&
      acceptedProposalRow.status === 'accepted' &&
      acceptedProposalRow.entity_id === auxiliaryEntityId &&
      acceptedProposalRow.reviewed_entity_id === witnessRivalEntityId &&
      (await db(
        `witness_supporting_observations?proposal_id=eq.${witnessProposal.id}&select=id`,
        {},
        SERVICE_KEY,
      )).length === 7 &&
      witnessDeclaration.name === `${witnessBeat.name} — Rival` &&
      witnessDeclaration.points === witnessBeat.points &&
      witnessDeclaration.source_signature_beat_id === witnessBeat.id &&
      JSON.stringify(canonicalize(witnessDeclaration.source_trigger_contract)) ===
        JSON.stringify(canonicalize(witnessBeatContract)) &&
      witnessWinner.length === 1 &&
      witnessWinner[0].winner_id === witnessDecoyNomineeId &&
      witnessWinner[0].winner_id !== witnessNomineeId)

  await rpc('undo_room_declaration_authorized', {
    p_room_id: auxiliaryRoom.id,
    p_category_id: witnessDeclaration.id,
    p_actor_player_id: auxiliaryPlayer.id,
    p_operator_capability: witnessCapability,
  })
  const dismissibleRecorded = await serviceRpc('record_witness_observation_v2', {
    ...witnessEvidence,
    p_confidence: 61,
    p_observed_at: new Date(Date.parse(witnessObservedAt) + 2_000).toISOString(),
    p_frame_sha256: 'f'.repeat(64),
    p_model_output_sha256: '1'.repeat(64),
  })
  const [dismissibleProposal] = await db(
    `witness_proposals?id=eq.${dismissibleRecorded.proposal_id}&select=*`,
    {},
    SERVICE_KEY,
  )
  const rotatedWitnessCapability = await serviceRpc('issue_room_operator_capability', {
    p_room_id: auxiliaryRoom.id,
  })
  let rotatedCapabilityRequired = false
  try {
    await rpc('list_pending_witness_proposals_authorized_v2', {
      p_room_id: auxiliaryRoom.id,
      p_actor_player_id: auxiliaryPlayer.id,
      p_operator_capability: witnessCapability,
    })
  } catch { rotatedCapabilityRequired = true }
  check('capability rotation immediately invalidates the previous bearer', rotatedCapabilityRequired)
  witnessCapability = rotatedWitnessCapability.capability as string
  const afterCapabilityRotation = await rpc('list_pending_witness_proposals_authorized_v2', {
    p_room_id: auxiliaryRoom.id,
    p_actor_player_id: auxiliaryPlayer.id,
    p_operator_capability: witnessCapability,
  })
  check('the newly rotated bearer reads the still-pending canonical proposal',
    afterCapabilityRotation.length === 1 && afterCapabilityRotation[0].id === dismissibleProposal.id)
  await rpc('review_witness_proposal_authorized_v2', {
    p_room_id: auxiliaryRoom.id,
    p_proposal_id: dismissibleProposal.id,
    p_actor_player_id: auxiliaryPlayer.id,
    p_action: 'dismiss',
    p_selected_entity_id: null,
    p_expected_observation_count: null,
    p_operator_capability: witnessCapability,
  })
  const [dismissedProposalRow] = await db(
    `witness_proposals?id=eq.${dismissibleProposal.id}&select=status,declaration_category_id`,
    {},
    SERVICE_KEY,
  )
  check('dismissal resolves a pending proposal without writing a declaration',
    dismissedProposalRow.status === 'dismissed' &&
      dismissedProposalRow.declaration_category_id === null &&
      (await db(
        `categories?room_id=eq.${auxiliaryRoom.id}&source_signature_beat_id=eq.${witnessBeat.id}&select=id`,
        {},
        SERVICE_KEY,
      )).length === 0)

  await db('category_nominees', {
    method: 'POST',
    body: JSON.stringify({ category_id: sourcedDeclaration.id, nominee_id: auxiliaryNomineeIds[0] }),
  }, SERVICE_KEY)
  await db('room_winners', {
    method: 'POST',
    body: JSON.stringify({
      room_id: auxiliaryRoom.id,
      category_id: sourcedDeclaration.id,
      winner_id: auxiliaryNomineeIds[0],
      tie_winner_id: null,
    }),
  }, SERVICE_KEY)

  let nonHostUndoDenied = false
  try {
    await rpc('undo_room_declaration_authorized', {
      p_room_id: auxiliaryRoom.id,
      p_category_id: sourcedDeclaration.id,
      p_actor_player_id: auxiliaryNonHost.id,
      p_operator_capability: witnessCapability,
    })
  } catch { nonHostUndoDenied = true }
  check('database restricts referee declaration undo to the room host', nonHostUndoDenied)

  const correction = await rpc('undo_room_declaration_authorized', {
    p_room_id: auxiliaryRoom.id,
    p_category_id: sourcedDeclaration.id,
    p_actor_player_id: auxiliaryPlayer.id,
    p_operator_capability: witnessCapability,
  })
  const struckDeclaration: any[] = await db(`categories?id=eq.${sourcedDeclaration.id}&select=id`)
  const correctionMessages: any[] = await db(
    `messages?room_id=eq.${auxiliaryRoom.id}&player_id=eq.system&select=text`,
  )
  check('referee undo atomically strikes the declaration and writes its public correction',
    correction === 'Correction: Auxiliary beat for Auxiliary nominee 1 (+4) was struck by Pack Guard.' &&
      struckDeclaration.length === 0 &&
      correctionMessages.some((message) => message.text === correction),
    JSON.stringify({ correction, struckDeclaration, correctionMessages }))
}

/** Clears every transient row this harness created inside one room. */
async function resetRoomContents(rid: string) {
  await db(`rooms?id=eq.${rid}`, {
    method: 'PATCH', body: JSON.stringify({ active_settlement_id: null, phase: 'lobby' }),
  }, SERVICE_KEY)
  await db(`room_settlements?room_id=eq.${rid}`, { method: 'DELETE' }, SERVICE_KEY)
  const cards: any[] = await db(`bingo_cards?room_id=eq.${rid}&select=id`)
  for (const c of cards) await db(`bingo_marks?card_id=eq.${c.id}`, { method: 'DELETE' }, SERVICE_KEY)
  await db(`bingo_cards?room_id=eq.${rid}`, { method: 'DELETE' }, SERVICE_KEY)
  await db(`beat_activations?room_id=eq.${rid}`, { method: 'DELETE' }, SERVICE_KEY)
  await db(`player_verdicts?room_id=eq.${rid}`, { method: 'DELETE' }, SERVICE_KEY)
  await db(`witness_supporting_observations?room_id=eq.${rid}`, { method: 'DELETE' }, SERVICE_KEY)
  await db(`witness_proposals?room_id=eq.${rid}`, { method: 'DELETE' }, SERVICE_KEY)
  await db(`messages?room_id=eq.${rid}`, { method: 'DELETE' }, SERVICE_KEY)
  await db(`draft_picks?room_id=eq.${rid}`, { method: 'DELETE' }, SERVICE_KEY)
  await db(`confidence_picks?room_id=eq.${rid}`, { method: 'DELETE' }, SERVICE_KEY)
  await db(`room_winners?room_id=eq.${rid}`, { method: 'DELETE' }, SERVICE_KEY)
}

async function cleanup() {
  console.log('\n\x1b[1mCleanup\x1b[0m')
  try {
    if (created.roomId) {
      await resetRoomContents(created.roomId)
      await db(`rooms?id=eq.${created.roomId}`, { method: 'DELETE' }, SERVICE_KEY)
    }
    if (created.raceRoomId) {
      await resetRoomContents(created.raceRoomId)
      await db(`rooms?id=eq.${created.raceRoomId}`, {
        method: 'PATCH', body: JSON.stringify({ host_id: null }),
      }, SERVICE_KEY)
      await db(`players?room_id=eq.${created.raceRoomId}`, { method: 'DELETE' }, SERVICE_KEY)
      await db(`rooms?id=eq.${created.raceRoomId}`, { method: 'DELETE' }, SERVICE_KEY)
    }
    for (const id of created.categoryIds) {
      await db(`room_winners?category_id=eq.${id}`, { method: 'DELETE' }, SERVICE_KEY)
      await db(`category_nominees?category_id=eq.${id}`, { method: 'DELETE' }, SERVICE_KEY)
      await db(`categories?id=eq.${id}`, { method: 'DELETE' }, SERVICE_KEY)
    }
    if (created.auxiliaryRoomId) {
      await db(`rooms?id=eq.${created.auxiliaryRoomId}`, { method: 'DELETE' }, SERVICE_KEY)
    }

    if (created.draftShowPackId) {
      await removeDraftShowPack(created.draftShowPackId)
    }
    const fixtureRows: any[] = await db(
      `show_packs?id=eq.${DOGFOOD_PACK_ID}&select=id,status`,
      {},
      SERVICE_KEY,
    )
    if (fixtureRows[0]?.status === 'draft') {
      await removeDraftShowPack(DOGFOOD_PACK_ID)
    }

    const left: any[] = await db('categories?select=id&room_id=not.is.null')
    check('no room-scoped dogfood declarations remain', left.length === 0, `${left.length} stray declarations`)

    const rooms: any[] = await db('rooms?code=like.DOG*&select=id')
    check('no disposable backend harness rooms remain', rooms.length === 0, `${rooms.length} stray rooms`)
  } catch (e) {
    console.log(`  \x1b[31mFAIL cleanup:\x1b[0m ${e}`)
    failures++
  }
}

try {
  await main()
} catch (e) {
  failures++
  console.log(`\n\x1b[31mFATAL\x1b[0m ${e}`)
} finally {
  await cleanup()
  console.log(
    failures === 0
      ? `\n\x1b[32m${checks}/${checks} checks passed\x1b[0m\n`
      : `\n\x1b[31m${failures} of ${checks} checks FAILED\x1b[0m\n`,
  )
  process.exit(failures === 0 ? 0 : 1)
}
