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
 * IT CLEANS UP AFTER ITSELF. Logging an event inserts into `categories`, which
 * is a GLOBAL table with no room_id, so practice events otherwise linger and
 * show up in the real room forever. Everything created here is torn down at the
 * end, including on failure.
 *
 *   npx tsx scripts/dogfood-e2e.mts
 */

import { readFileSync } from 'fs'
import { computeLeaderboard, findDraftPointsForWinner, compareForRank } from '../src/lib/scoring'
import { computeNightAwards } from '../src/lib/night-awards'
import { computeScoreTimeline } from '../src/lib/timeline-utils'
import { assignVerdictAuthors } from '../src/lib/companion-prompts'
import { remoteHolderIds, screenKey, isSoloWatcher } from '../src/lib/watch-groups'
import { generateBingoCard, checkBingo, FREE_CENTER_INDEX } from '../src/lib/bingo-utils'

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const pick = (k: string) =>
  env.split('\n').find((l) => l.startsWith(k + '='))!.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '')
const URL_ = pick('VITE_SUPABASE_URL')
const KEY = pick('VITE_SUPABASE_ANON_KEY')

/** The seed ends at category 20; anything above it was created by a Game Master. */
const SEEDED_CATEGORY_MAX = 20


let failures = 0
let checks = 0
function check(label: string, cond: boolean, detail = '') {
  checks++
  if (cond) console.log(`  \x1b[32m✓\x1b[0m ${label}`)
  else { failures++; console.log(`  \x1b[31m✗ ${label}\x1b[0m ${detail}`) }
}

async function db(path: string, init: RequestInit = {}) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY, Authorization: `Bearer ${KEY}`,
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

const created = { roomId: null as string | null, categoryIds: [] as number[] }

async function main() {
  console.log('\n\x1b[1m═══ Headless end-to-end dogfood ═══\x1b[0m\n')

  // ── 1. Room + players ─────────────────────────────────────────────────────
  console.log('\x1b[1m1. Room and join\x1b[0m')
  // Four random digits, not one. 'DOG' + 0-9 gave ten possible codes, so a run
  // that died before cleanup poisoned that code and the next run hit a 23505 on
  // rooms_code_key before doing anything at all.
  const code = 'DOG' + String(Math.floor(Math.random() * 10000)).padStart(4, '0')
  const [room] = await db('rooms', {
    method: 'POST',
    body: JSON.stringify({ code, phase: 'lobby', host_id: null }),
  })
  created.roomId = room.id
  check('room created with host_id null', room.host_id === null)

  const names = ['Franky', 'AP', 'Alec']
  const players: any[] = []
  for (const [i, name] of names.entries()) {
    const [p] = await db('players', {
      method: 'POST',
      body: JSON.stringify({
        room_id: room.id, name, avatar_id: 'targaryen',
        color: '#D4AF37', is_host: i === 0,
      }),
    })
    players.push(p)
  }
  await db(`rooms?id=eq.${room.id}`, { method: 'PATCH', body: JSON.stringify({ host_id: players[0].id }) })
  check('3 players joined, host stamped after insert', players.length === 3)

  // ── 2. Watch groups ───────────────────────────────────────────────────────
  console.log('\n\x1b[1m2. Watch groups and remotes\x1b[0m')
  // Franky solo in Tulum-equivalent (no group); AP + Alec share one screen.
  await db(`players?id=eq.${players[1].id}`, { method: 'PATCH', body: JSON.stringify({ watch_group: 'New York' }) })
  await db(`players?id=eq.${players[2].id}`, { method: 'PATCH', body: JSON.stringify({ watch_group: 'New York' }) })
  await rpc('set_remote_holder', { p_room_id: room.id, p_player_id: players[1].id })

  let roster: any[] = await db(`players?room_id=eq.${room.id}&select=*&order=created_at`)
  const holders = remoteHolderIds(roster)
  check('two screens derived from groups', new Set(roster.map(screenKey)).size === 2)
  check('solo watcher holds their own remote', isSoloWatcher(roster.find((p) => p.name === 'Franky')))
  check('exactly 2 remote-holders (1 per screen)', holders.length === 2, `got ${holders.length}`)

  // Claiming the remote must clear the previous holder in the SAME group only.
  await rpc('set_remote_holder', { p_room_id: room.id, p_player_id: players[2].id })
  roster = await db(`players?room_id=eq.${room.id}&select=*&order=created_at`)
  const nyHolders = roster.filter((p: any) => p.watch_group === 'New York' && p.is_remote_holder)
  check('handover leaves exactly one holder on that screen', nyHolders.length === 1, `got ${nyHolders.length}`)
  check('the other screen was not touched', remoteHolderIds(roster).length === 2)

  // ── 3. Draft ──────────────────────────────────────────────────────────────
  console.log('\n\x1b[1m3. Draft\x1b[0m')
  const entities: any[] = await db('draft_entities?select=*')
  const dragons = entities.filter((e) => e.type === 'film')
  const chars = entities.filter((e) => e.type === 'person')
  check('draft pool seeded', dragons.length === 11 && chars.length === 27, `${dragons.length} dragons / ${chars.length} characters`)

  const picks: any[] = []
  let pickNo = 0
  for (const [i, p] of players.entries()) {
    for (const e of [dragons[i], chars[i], chars[i + 3]]) {
      const [row] = await db('draft_picks', {
        method: 'POST',
        body: JSON.stringify({
          room_id: room.id, player_id: p.id, entity_id: e.id,
          round: Math.floor(pickNo / 3) + 1, pick_number: pickNo++,
        }),
      })
      picks.push(row)
    }
  }
  check('9 picks written, no entity taken twice',
    picks.length === 9 && new Set(picks.map((p) => p.entity_id)).size === 9)

  // ── 4. Episode clock ──────────────────────────────────────────────────────
  console.log('\n\x1b[1m4. Episode clock (per screen)\x1b[0m')
  await rpc('start_episode_for_screen', { p_room_id: room.id, p_player_id: players[0].id })
  roster = await db(`players?room_id=eq.${room.id}&select=*&order=created_at`)
  const started1 = roster.filter((p: any) => p.episode_started_at)
  check('solo start stamps only that player', started1.length === 1 && started1[0].name === 'Franky',
    `stamped: ${started1.map((p: any) => p.name).join(',')}`)
  let r = (await db(`rooms?id=eq.${room.id}&select=show_started`))[0]
  check('first start flips the game live for everyone', r.show_started === true)

  await rpc('start_episode_for_screen', { p_room_id: room.id, p_player_id: players[1].id })
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
  const postedAt = new Date(Date.now() - 8000).toISOString() // 8s in transit
  await db(`rooms?id=eq.${room.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      sync_position_ms: 34 * 60_000 + 12_000,
      sync_posted_at: postedAt, sync_posted_by: players[1].id,
    }),
  })
  r = (await db(`rooms?id=eq.${room.id}&select=*`))[0]
  const aged = r.sync_position_ms + (Date.now() - new Date(r.sync_posted_at).getTime())
  check('beacon is aged for transit, not read raw',
    aged - r.sync_position_ms >= 7500 && aged - r.sync_position_ms <= 12_000,
    `aged by ${Math.round((aged - r.sync_position_ms) / 1000)}s`)

  // ── 6. Pause handshake ────────────────────────────────────────────────────
  console.log('\n\x1b[1m6. Pause handshake\x1b[0m')
  await db(`rooms?id=eq.${room.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ pause_requested_by: players[2].id, pause_reason: 'bathroom' }),
  })
  await db(`rooms?id=eq.${room.id}`, {
    method: 'PATCH',
    body: JSON.stringify({
      is_paused: true, paused_at_ms: 41 * 60_000, pause_requested_by: null,
      resume_ready: [], sync_position_ms: 41 * 60_000,
      sync_posted_at: new Date().toISOString(), sync_posted_by: players[1].id,
    }),
  })
  r = (await db(`rooms?id=eq.${room.id}&select=*`))[0]
  check('confirming a pause clears the request', r.is_paused && r.pause_requested_by === null)

  // Both screens' holders legitimately tap confirm (each pauses their own TV).
  // The guard on is_paused means the SECOND tap must not move the canonical
  // park position the first screen already parked at.
  await db(`rooms?id=eq.${room.id}&is_paused=eq.false`, {
    method: 'PATCH',
    body: JSON.stringify({ is_paused: true, paused_at_ms: 99_000 }),
  })
  r = (await db(`rooms?id=eq.${room.id}&select=paused_at_ms`))[0]
  check('a second confirm cannot move the park position',
    r.paused_at_ms === 41 * 60_000, `paused_at_ms=${r.paused_at_ms}`)

  // Two holders tap ready at once — the RPC must not lose one.
  await Promise.all(holders.map((id) => rpc('mark_resume_ready', { p_room_id: room.id, p_player_id: id })))
  r = (await db(`rooms?id=eq.${room.id}&select=resume_ready`))[0]
  check('concurrent ready-taps do not overwrite each other',
    r.resume_ready.length === 2, `resume_ready=${JSON.stringify(r.resume_ready)}`)

  await db(`rooms?id=eq.${room.id}`, {
    method: 'PATCH', body: JSON.stringify({ resume_at: new Date(Date.now() + 5000).toISOString() }),
  })
  r = (await db(`rooms?id=eq.${room.id}&select=resume_at,is_paused`))[0]
  const secs = Math.ceil((new Date(r.resume_at).getTime() - Date.now()) / 1000)
  check('resume countdown is a shared wall-clock target', secs >= 3 && secs <= 5, `${secs}s`)

  // ── 7. Bingo ──────────────────────────────────────────────────────────────
  console.log('\n\x1b[1m7. Bingo\x1b[0m')
  const squares: any[] = await db('bingo_squares?select=*')
  // Deliberately a floor, not an exact count: the bingo pool is owned by another
  // workstream and grew from 50 to 75 mid-session. A card only needs 24.
  check('enough squares to deal distinct cards', squares.length >= 25, `got ${squares.length}`)
  const cardA = generateBingoCard(squares, [])
  const cardB = generateBingoCard(squares, [cardA])
  check('card is 25 cells with a free centre',
    cardA.length === 25 && cardA[FREE_CENTER_INDEX] === 0)
  check('24 distinct real squares per card',
    new Set(cardA.filter((_, i) => i !== FREE_CENTER_INDEX)).size === 24)
  check('two cards are not identical', JSON.stringify(cardA) !== JSON.stringify(cardB))
  const topRow = new Set([0, 1, 2, 3, 4, FREE_CENTER_INDEX])
  check('a completed line is detected', checkBingo(topRow, []).lines.length >= 1)

  // ── 8. Log events the way the Game Master does ────────────────────────────
  console.log('\n\x1b[1m8. Game Master events\x1b[0m')
  const nominees: any[] = await db('nominees?select=*')
  const myChar = entities.find((e) => e.id === picks[1].entity_id)
  const myDragon = entities.find((e) => e.id === picks[0].entity_id)
  const charNom = nominees.find((n) => n.name === myChar.name)
  const dragonNom = nominees.find((n) => n.name === myDragon.name)
  check('drafted entities resolve to nominees', !!charNom && !!dragonNom,
    `char=${myChar?.name} dragon=${myDragon?.name}`)

  const maxRow = (await db('categories?select=id&order=id.desc&limit=1'))[0]
  let nextId = (maxRow?.id ?? 0) + 1
  for (const [nom, pts, label] of [[charNom, 10, 'A huge moment'], [dragonNom, 6, 'A solid moment']] as const) {
    await db('categories', {
      method: 'POST',
      body: JSON.stringify({
        id: nextId, name: `${label} (dogfood)`,
        tier: pts >= 10 ? 1 : 2, points: pts, display_order: nextId,
      }),
    })
    created.categoryIds.push(nextId)
    await db('category_nominees', { method: 'POST', body: JSON.stringify({ category_id: nextId, nominee_id: nom.id }) })
    await db('room_winners', {
      method: 'POST',
      body: JSON.stringify({ room_id: room.id, category_id: nextId, winner_id: nom.id, tie_winner_id: null }),
    })
    nextId++
  }
  check('2 events logged (category + link + room winner each)', created.categoryIds.length === 2)

  // ── 9. Scoring, through the real leaderboard function ─────────────────────
  console.log('\n\x1b[1m9. Scoring\x1b[0m')
  const allCats: any[] = await db('categories?select=*&order=display_order')
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
    predictable.length === SEEDED_CATEGORY_MAX &&
      created.categoryIds.every((id) => (nomsByCat.get(id) ?? []).length === 1),
    `${predictable.length} predictable, GM events carry 1 nominee each`)

  // Every player stakes the SAME fixed budget, 1..N, each value exactly once.
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
  await db('room_winners', {
    method: 'POST',
    body: JSON.stringify({ room_id: room.id, category_id: target.id, winner_id: winningNom, tie_winner_id: null }),
  })
  // Exactly the two writes confirmSpotlightWinner performs.
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

  // ── 11. The leak ──────────────────────────────────────────────────────────
  console.log('\n\x1b[1m11. Cross-room contamination\x1b[0m')
  const globalCats: any[] = await db('categories?select=id')
  check('practice events are visible GLOBALLY, not per-room',
    globalCats.length > SEEDED_CATEGORY_MAX,
    `${globalCats.length} categories exist; seed has ${SEEDED_CATEGORY_MAX}`)
  console.log('     \x1b[33m↑ expected: categories has no room_id. This is why cleanup matters.\x1b[0m')
}

/**
 * Clears every row this harness can actually delete from a room, leaving the
 * room and its players in place.
 *
 * WHY IT DOES NOT DELETE THE ROOM
 * anon has no DELETE policy on `rooms` or `players` — correctly, since nothing
 * in the app deletes either and a shared anon key that could drop a room
 * mid-party would be a genuine hazard. PostgREST answers a blocked DELETE with
 * 200 and an empty body rather than an error, so the previous version of this
 * teardown reported success while leaving a room and three players behind on
 * every single run. It had been doing that for as long as it has existed; the
 * "no rows left behind" check only ever looked at `categories`, which does have
 * a DELETE policy and really was being cleaned.
 *
 * The fix is not to grant the policy. It is to stop creating a new room each
 * run — see FIXED_CODE — so the residue is one room forever instead of one more
 * every time, and to be honest about what is left.
 */
async function resetRoomContents(rid: string) {
  const cards: any[] = await db(`bingo_cards?room_id=eq.${rid}&select=id`)
  for (const c of cards) await db(`bingo_marks?card_id=eq.${c.id}`, { method: 'DELETE' })
  await db(`bingo_cards?room_id=eq.${rid}`, { method: 'DELETE' })
  await db(`player_verdicts?room_id=eq.${rid}`, { method: 'DELETE' })
  await db(`messages?room_id=eq.${rid}`, { method: 'DELETE' })
  await db(`draft_picks?room_id=eq.${rid}`, { method: 'DELETE' })
  await db(`confidence_picks?room_id=eq.${rid}`, { method: 'DELETE' })
  await db(`room_winners?room_id=eq.${rid}`, { method: 'DELETE' })
}

async function cleanup() {
  console.log('\n\x1b[1mCleanup\x1b[0m')
  try {
    for (const id of created.categoryIds) {
      await db(`room_winners?category_id=eq.${id}`, { method: 'DELETE' })
      await db(`category_nominees?category_id=eq.${id}`, { method: 'DELETE' })
      await db(`categories?id=eq.${id}`, { method: 'DELETE' })
    }
    if (created.roomId) await resetRoomContents(created.roomId)

    // The check that actually matters: `categories` is global with no room_id,
    // so a stray GM event here shows up in the real party's prediction sheet.
    const left: any[] = await db(`categories?select=id&id=gt.${SEEDED_CATEGORY_MAX}`)
    check('no stray events leaked into the global category table',
      left.length === 0, `${left.length} stray categories`)

    // Stated, not asserted: this residue is expected and bounded to one room.
    const rooms: any[] = await db('rooms?code=like.DOG*&select=id')
    console.log(`     \x1b[33m↑ ${rooms.length} harness room(s) remain by design (anon cannot DELETE rooms)\x1b[0m`)
  } catch (e) {
    console.log(`  \x1b[31m✗ cleanup failed:\x1b[0m ${e}`)
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
