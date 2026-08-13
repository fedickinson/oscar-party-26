/**
 * ghost-screen — an automated SECOND ROOM to rehearse the watch-sync dance with.
 *
 * THE GAP THIS CLOSES
 * The e2e script proves the writes work; the SyncDevPanel lets you poke single
 * states. Neither rehearses the CHOREOGRAPHY — request, scene-break wait,
 * confirm, park, ready, countdown, simultaneous play — because every step needs
 * a counterparty, and until tonight the counterparty is five people in New York
 * who are not available for practice.
 *
 * This script IS the counterparty. It joins your room as a player on its own
 * screen, claims that screen's remote, and then behaves like a considerate
 * human in another apartment:
 *
 *   - starts its screen a few seconds after the show goes live
 *   - beacons its position (so your drift readout is live)
 *   - answers your pause request: waits ~10s "for a scene break", then confirms
 *   - parks at the canonical position and marks its screen ready
 *   - releases at GO if no browser got there first
 *   - with --restless, occasionally asks YOU for a pause, so you rehearse the
 *     confirming side too
 *
 * Every write is the exact shape the app sends. No app code is bypassed.
 *
 * USAGE
 *   1. Create a room in the browser, get through the draft to Live
 *      (or use any existing live room)
 *   2. npx tsx scripts/ghost-screen.mts --room NWMM
 *   3. Rehearse. Ctrl-C removes the ghost from the room.
 *
 * FLAGS
 *   --room CODE    (required) the room to haunt
 *   --ahead N      ghost starts N seconds ahead of you (default 0) — makes the
 *                  drift warning appear so you can rehearse realigning
 *   --restless     ghost requests a pause every ~3 minutes
 *   --name NAME    ghost's player name (default "Ghost (2nd room)")
 */

import { supabaseConfig } from './lib/env.mts'

// Defaults to the local stack: this joins a room as a real player and writes.
// SUPABASE_TARGET=remote to run it as a counterparty against production.
const { url: URL_, anonKey: KEY } = supabaseConfig('local')

const args = process.argv.slice(2)
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const ROOM_CODE = flag('room')
const AHEAD_MS = Number(flag('ahead') ?? 0) * 1000
const RESTLESS = args.includes('--restless')
const GHOST_NAME = flag('name') ?? 'Ghost (2nd room)'

if (!ROOM_CODE) {
  console.error('usage: npx tsx scripts/ghost-screen.mts --room CODE [--ahead 30] [--restless]')
  process.exit(1)
}

async function db(path: string, init: RequestInit = {}) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY, Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${res.status} ${text.slice(0, 200)}`)
  return text ? JSON.parse(text) : null
}
const rpc = (fn: string, body: object) => db(`rpc/${fn}`, { method: 'POST', body: JSON.stringify(body) })

const log = (msg: string) =>
  console.log(`\x1b[35m[ghost ${new Date().toLocaleTimeString()}]\x1b[0m ${msg}`)

// ── The ghost's own playback clock — same anchor model as useWatchSync ───────
let anchor: { pos: number; wall: number } | null = null
let frozen = false
const pos = () => (anchor ? (frozen ? anchor.pos : anchor.pos + (Date.now() - anchor.wall)) : 0)
const freezeAt = (ms: number) => { anchor = { pos: ms, wall: Date.now() }; frozen = true }
const playFrom = (ms: number) => { anchor = { pos: ms, wall: Date.now() }; frozen = false }
const fmt = (ms: number) => {
  const t = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
}

async function main() {
  const rooms = await db(`rooms?code=eq.${ROOM_CODE}&select=*`)
  if (!rooms?.length) { console.error(`room ${ROOM_CODE} not found`); process.exit(1) }
  let room = rooms[0]
  if (room.phase === 'draft') {
    log('WARNING: room is mid-draft. The ghost does not draft — join rooms after the draft.')
  }

  // Adopt an existing ghost row on rerun rather than multiplying spectres.
  const existing = await db(`players?room_id=eq.${room.id}&name=eq.${encodeURIComponent(GHOST_NAME)}&select=*`)
  let ghost = existing?.[0]
  if (!ghost) {
    ;[ghost] = await db('players', {
      method: 'POST',
      body: JSON.stringify({
        room_id: room.id, name: GHOST_NAME, avatar_id: 'stark',
        color: '#8B5CF6', is_host: false,
      }),
    })
    log(`joined room ${ROOM_CODE} as "${GHOST_NAME}"`)
  } else {
    log(`re-adopted existing ghost in ${ROOM_CODE}`)
  }
  if (room.show_started && ghost.watch_group !== 'Ghost apartment') {
    throw new Error('join the ghost before shared playback begins so its screen can be declared')
  }
  await rpc('set_player_watch_group_authorized', {
    p_room_id: room.id,
    p_actor_player_id: ghost.id,
    p_target_player_id: ghost.id,
    p_watch_group: 'Ghost apartment',
    p_operator_capability: null,
  })
  await rpc('claim_room_remote_authority', {
    p_room_id: room.id,
    p_actor_player_id: ghost.id,
  })
  log('claimed the remote in "Ghost apartment" — this is now a second screen')

  let screenStarted = false
  let wasPaused = false
  let parkTimer: ReturnType<typeof setTimeout> | null = null
  let confirmTimer: ReturnType<typeof setTimeout> | null = null
  let lastBeacon = 0
  let lastRestless = Date.now()

  // Refresh the ghost's own row too — a browser may have started its screen.
  const cleanup = async () => {
    log('leaving — removing ghost from the room')
    try {
      await db(`players?id=eq.${ghost.id}`, { method: 'DELETE' })
    } catch { /* best effort */ }
    process.exit(0)
  }
  process.on('SIGINT', cleanup)
  process.on('SIGTERM', cleanup)

  log(`haunting. ahead=${AHEAD_MS / 1000}s restless=${RESTLESS}. Ctrl-C to leave.`)

  // Poll rather than subscribe: a script does not need sub-second latency, and
  // polling every 2.5s keeps this dependency-free and unkillable by websocket
  // hiccups. Human-scale delays are the point — the ghost SIMULATES a person.
  while (true) {
    await new Promise((r) => setTimeout(r, 2500))
    try {
      room = (await db(`rooms?id=eq.${room.id}&select=*`))[0]
      if (!room) { log('room deleted — exiting'); process.exit(0) }

      // ── Start my screen shortly after the show goes live ─────────────────
      if (room.show_started && !screenStarted) {
        await new Promise((r) => setTimeout(r, 4000)) // fumbling for the remote
        await rpc('start_episode_for_screen_authorized', {
          p_room_id: room.id,
          p_actor_player_id: ghost.id,
          p_operator_capability: null,
        })
        // If the room already has a beacon (joined mid-episode), start near it
        // so the rehearsal begins in sync; otherwise start at 0 (+ any --ahead).
        const base = room.sync_position_ms != null
          ? room.sync_position_ms + (Date.now() - new Date(room.sync_posted_at).getTime())
          : 0
        playFrom(Math.max(0, base) + AHEAD_MS)
        screenStarted = true
        log(`pressed play — my playback is at ${fmt(pos())}${AHEAD_MS ? ` (${AHEAD_MS / 1000}s ahead on purpose)` : ''}`)
        lastBeacon = 0 // beacon immediately
      }
      if (!screenStarted) continue

      // ── Un-paused: press play from the park position ─────────────────────
      // Handled BEFORE beaconing so the first post-resume beacon reports the
      // park position, not a clock that kept running through the pause.
      if (!room.is_paused && wasPaused) {
        wasPaused = false
        if (parkTimer) { clearTimeout(parkTimer); parkTimer = null }
        playFrom(room.paused_at_ms ?? pos())
        log(`playing again from ${fmt(pos())}`)
        lastBeacon = 0
      }

      // ── Beacon while playing ─────────────────────────────────────────────
      if (!room.is_paused && Date.now() - lastBeacon > 45_000) {
        await rpc('post_room_playback_beacon', {
          p_room_id: room.id,
          p_actor_player_id: ghost.id,
          p_position_ms: Math.round(pos()),
        })
        lastBeacon = Date.now()
        log(`beacon: I am at ${fmt(pos())}`)
      }

      // ── Someone asked to pause ───────────────────────────────────────────
      if (room.pause_requested_by && !room.is_paused && !confirmTimer) {
        const requester = room.pause_requested_by === ghost.id ? 'me' : 'the other room'
        log(`pause requested by ${requester}${room.pause_reason ? ` (${room.pause_reason})` : ''} — waiting for a scene break…`)
        confirmTimer = setTimeout(async () => {
          confirmTimer = null
          const p = Math.round(pos())
          // Guarded exactly like the app: if the other screen confirmed first,
          // this matches zero rows and their park position stands.
          await rpc('confirm_room_playback_pause', {
            p_room_id: room.id,
            p_actor_player_id: ghost.id,
            p_position_ms: p,
          })
          log(`scene break — paused my screen at ${fmt(p)}`)
        }, 8000 + Math.random() * 6000)
      }

      // ── We are paused: park and report ready ─────────────────────────────
      if (room.is_paused && !wasPaused) {
        wasPaused = true
        const park = room.paused_at_ms ?? Math.round(pos())
        freezeAt(pos()) // my playback stops where it stopped…
        parkTimer = setTimeout(async () => {
          parkTimer = null
          freezeAt(park) // …then I scrub to the canonical spot
          await rpc('mark_room_playback_resume_ready', {
            p_room_id: room.id,
            p_actor_player_id: ghost.id,
          })
          log(`parked my screen at ${fmt(park)} — ready`)
        }, 5000 + Math.random() * 4000)
      }

      // ── Countdown hit zero: release if no browser beat me to it ──────────
      if (room.is_paused && room.resume_at && new Date(room.resume_at).getTime() <= Date.now() - 1500) {
        const at = room.paused_at_ms ?? 0
        await rpc('release_room_playback_resume', {
          p_room_id: room.id,
          p_actor_player_id: ghost.id,
          p_expected_resume_at: room.resume_at,
        })
        log('GO — released the room (no browser got there first)')
      }


      // ── Restless mode: make YOU rehearse the confirming side ─────────────
      if (
        RESTLESS && !room.is_paused && !room.pause_requested_by &&
        Date.now() - lastRestless > 3 * 60_000
      ) {
        lastRestless = Date.now()
        const reason = ['Bathroom', 'Refill', 'Need a minute'][Math.floor(Math.random() * 3)]
        await rpc('request_room_playback_pause', {
          p_room_id: room.id,
          p_actor_player_id: ghost.id,
          p_reason: reason,
        })
        log(`asked for a pause (${reason}) — your move: pause at a scene break and confirm`)
      }
    } catch (e) {
      log(`hiccup (retrying): ${String(e).slice(0, 120)}`)
    }
  }
}

void main()
