/**
 * useWatchSync — keeps two separate playbacks of the same episode together.
 *
 * THE SETUP THIS EXISTS FOR
 * Five people share one screen in New York; one person watches separately in
 * Mexico. Six phones, but only TWO playbacks. One designated point person in
 * the room owns the remote — everyone else asks them to pause.
 *
 * THE PROBLEM IS NOT PAUSING, IT IS DRIFT
 * Nothing about the game mechanically requires a pause: logging an event is
 * three taps, bingo marks are instant, and the draft happens before the episode.
 * Pauses are social. What actually breaks a remote watch-along is the two
 * playbacks sliding apart, because then the room reacts to something the remote
 * viewer has not seen yet.
 *
 * HOW POSITION IS TRACKED
 * A local clock, not constant manual input. You tell the app once where you are;
 * from then on it advances in real time and stops when you pause. Manual sync
 * checks correct the accumulated error. This means the app always has a usable
 * position without anyone typing during a scene.
 *
 * THE ONE PIECE OF MATHS THAT MATTERS
 * A beacon says "I was at 34:12". If you read it eight seconds later, they are
 * NOT at 34:12 any more — they are at 34:20, because their playback kept
 * running. Comparing raw positions understates the drift by however long the
 * message took to arrive and be read. Every comparison below therefore ages the
 * beacon by the wall-clock time since it was posted.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { PlayerRow, RoomRow } from '../types/database'
import { remoteHolderIds } from '../lib/watch-groups'

export interface SyncState {
  /** Our own position in the episode, ms. Advances in real time while playing. */
  myPositionMs: number
  /** True once this screen has a clock — either started, or manually set. */
  hasPosition: boolean
  /** True once THIS screen pressed play. Distinguishes "waiting" from "running". */
  screenStarted: boolean
  /** The other side's position right now, aged for transit. Null if no beacon. */
  theirPositionMs: number | null
  /** Positive = they are AHEAD of us (spoiler risk). Negative = we are ahead. */
  driftMs: number | null
  /** Who posted the beacon we are comparing against. */
  beaconFrom: string | null
  isPaused: boolean
  pauseRequestedBy: string | null
  pauseReason: string | null
  pausedAtMs: number | null
  resumeReady: string[]
  /** Two playbacks, two controllers. Either may confirm a pause or start resume. */
  pointPersonIds: string[]
  amPointPerson: boolean
  /** Seconds until both playbacks press play, or null if no countdown running. */
  resumeCountdown: number | null

  setMyPosition: (ms: number) => void
  postBeacon: () => Promise<void>
  requestPause: (reason?: string) => Promise<void>
  cancelPauseRequest: () => Promise<void>
  confirmPause: (atMs: number) => Promise<void>
  markReady: () => Promise<void>
  startResumeCountdown: (seconds?: number) => Promise<void>
  cancelResume: () => Promise<void>
  nudge: (ms: number) => void
}

/** Drift under this is not worth acting on — it is within human reaction time. */
export const DRIFT_TOLERANCE_MS = 3_000

/**
 * How often each screen publishes where it is. Frequent enough that drift is
 * caught within a scene, cheap enough to be invisible: one small UPDATE per
 * screen per interval, and the beacon is aged on read anyway, so a stale one is
 * still accurate as long as the playback did not stop.
 */
export const BEACON_INTERVAL_MS = 45_000

export function useWatchSync(
  room: RoomRow | null | undefined,
  playerId: string | null | undefined,
  /** Needed to derive remote-holders from watch groups. */
  players: PlayerRow[] = [],
): SyncState {
  // ── Local episode clock ────────────────────────────────────────────────────
  // Stored as an anchor rather than a ticking number: `anchorPos` is where we
  // were at `anchorWall`. Position is derived on read. This survives re-renders,
  // tab backgrounding and slow timers without accumulating error, which a
  // setInterval counter would not.
  const anchorRef = useRef<{ pos: number; wall: number } | null>(null)
  const [, forceTick] = useState(0)

  const isPaused = room?.is_paused ?? false
  const pausedAtMsRef = useRef<number | null>(null)
  pausedAtMsRef.current = room?.paused_at_ms ?? null

  // The clock's ORIGIN, set when this player's screen pressed play. Everything
  // else in this hook used to depend on somebody typing a timestamp into their
  // phone, which meant that in practice the position stayed at zero and no drift
  // was ever reported. With an origin, 0:00 is simply "when we started" and the
  // position is real from the first second without anyone touching anything.
  //
  // A manual entry still wins: it becomes an explicit anchor, which is how you
  // correct for a late start, a rewind, or an ad break the app cannot see.
  const me = players.find((p) => p.id === playerId)
  const startedAt = me?.episode_started_at ? new Date(me.episode_started_at).getTime() : null

  const readPosition = useCallback((): number => {
    const a = anchorRef.current
    if (!a) {
      if (startedAt == null) return 0
      // Derived from the origin. Frozen at the pause point while paused, so the
      // derived clock behaves exactly like an anchored one.
      if (isPaused) return Math.max(0, (pausedAtMsRef.current ?? Date.now() - startedAt))
      return Math.max(0, Date.now() - startedAt)
    }
    if (isPaused) return a.pos
    return a.pos + (Date.now() - a.wall)
  }, [isPaused, startedAt])

  // Re-render once a second so the displayed clock moves. Cheap: one setState.
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  // Freeze/unfreeze the local clock with the shared pause state, so a pause in
  // New York stops the remote viewer's clock too and neither has to remember.
  const wasPausedRef = useRef(isPaused)
  useEffect(() => {
    if (wasPausedRef.current === isPaused) return
    const a = anchorRef.current
    if (a) {
      // Re-anchor at the current derived position before switching mode.
      const pos = wasPausedRef.current ? a.pos : a.pos + (Date.now() - a.wall)
      anchorRef.current = { pos, wall: Date.now() }
    }
    wasPausedRef.current = isPaused
  }, [isPaused])

  const setMyPosition = useCallback((ms: number) => {
    anchorRef.current = { pos: Math.max(0, ms), wall: Date.now() }
    forceTick((n) => n + 1)
  }, [])

  // Nudge used to bail out when there was no manual anchor, which after the
  // derived clock landed meant the "I skipped — realign" button silently did
  // nothing in the common case: nobody types a position any more, so nobody has
  // an anchor. Reading through readPosition covers both — a nudge on a derived
  // clock simply promotes it to an anchored one at the corrected offset.
  const nudge = useCallback((ms: number) => {
    const pos = readPosition()
    anchorRef.current = { pos: Math.max(0, pos + ms), wall: Date.now() }
    forceTick((n) => n + 1)
  }, [readPosition])

  // ── The other side's position ──────────────────────────────────────────────
  const myPositionMs = readPosition()
  const hasPosition = anchorRef.current !== null || startedAt != null

  const beaconFrom = room?.sync_posted_by ?? null
  const beaconIsMine = beaconFrom != null && beaconFrom === playerId

  let theirPositionMs: number | null = null
  if (
    !beaconIsMine &&
    room?.sync_position_ms != null &&
    room?.sync_posted_at != null
  ) {
    const postedAt = new Date(room.sync_posted_at).getTime()
    // Age the beacon: their playback did not stop while the message travelled.
    // Frozen while paused, because then it genuinely did stop.
    const elapsed = isPaused ? 0 : Math.max(0, Date.now() - postedAt)
    theirPositionMs = room.sync_position_ms + elapsed
  }

  const driftMs =
    theirPositionMs != null && hasPosition ? theirPositionMs - myPositionMs : null

  // ── Writes ─────────────────────────────────────────────────────────────────

  const postBeacon = useCallback(async () => {
    if (!room || !playerId || !hasPosition) return
    const { error } = await supabase.rpc('post_room_playback_beacon', {
      p_room_id: room.id,
      p_actor_player_id: playerId,
      p_position_ms: Math.round(readPosition()),
    })
    if (error) throw new Error(error.message)
  }, [room, playerId, hasPosition, readPosition])

  const requestPause = useCallback(
    async (reason?: string) => {
      if (!room || !playerId) return
      const { error } = await supabase.rpc('request_room_playback_pause', {
        p_room_id: room.id,
        p_actor_player_id: playerId,
        p_reason: reason ?? null,
      })
      if (error) throw new Error(error.message)
    },
    [room, playerId],
  )

  // Called by the point person once they have actually hit pause — deliberately
  // separate from requesting, because they wait for a scene break rather than
  // stopping mid-shot.
  const confirmPause = useCallback(
    async (atMs: number) => {
      if (!room || !playerId) return
      // Guarded on is_paused: BOTH screens' holders see the confirm button and
      // both will legitimately tap it (each pauses their own TV). The first tap
      // establishes the canonical park position; a second tap must not move it,
      // because the other screen may already be parked there.
      const { error } = await supabase.rpc('confirm_room_playback_pause', {
        p_room_id: room.id,
        p_actor_player_id: playerId,
        p_position_ms: Math.round(atMs),
      })
      if (error) throw new Error(error.message)
    },
    [room, playerId],
  )

  // A pause request the requester thought better of. Without this the amber
  // banner sits on every phone until somebody actually pauses a playback.
  const cancelPauseRequest = useCallback(async () => {
    if (!room || !playerId) return
    const { error } = await supabase.rpc('cancel_room_playback_pause_request', {
      p_room_id: room.id,
      p_actor_player_id: playerId,
    })
    if (error) throw new Error(error.message)
  }, [room, playerId])

  const markReady = useCallback(async () => {
    if (!room || !playerId) return
    // RPC rather than read-modify-write: two people tapping at once would
    // otherwise overwrite each other.
    const { error } = await supabase.rpc('mark_room_playback_resume_ready', {
      p_room_id: room.id,
      p_actor_player_id: playerId,
    })
    if (error) throw new Error(error.message)
  }, [room, playerId])

  // Both playbacks must press play at the SAME instant. One person pressing and
  // the other following by a second or two would manufacture fresh drift at
  // exactly the moment the pause finished fixing it — so instead we publish a
  // target wall clock and both sides count down to it.
  const startResumeCountdown = useCallback(
    async (seconds = 5) => {
      if (!room || !playerId) return
      const { error } = await supabase.rpc('schedule_room_playback_resume', {
        p_room_id: room.id,
        p_actor_player_id: playerId,
        p_countdown_seconds: seconds,
      })
      if (error) throw new Error(error.message)
    },
    [room, playerId],
  )

  const cancelResume = useCallback(async () => {
    if (!room || !playerId) return
    const { error } = await supabase.rpc('cancel_room_playback_resume', {
      p_room_id: room.id,
      p_actor_player_id: playerId,
    })
    if (error) throw new Error(error.message)
  }, [room, playerId])

  // ── Automatic beacons ──────────────────────────────────────────────────────
  // Drift is only visible if somebody publishes their position, and until now
  // the only things that did were the manual entry box and a "re-send" button.
  // In practice that meant no beacon was ever posted and driftMs stayed null all
  // night — the detection worked perfectly on data that never arrived.
  //
  // Only screen-holders beacon, because only they represent a playback. There is
  // one beacon slot on the room and two screens tonight, so they overwrite each
  // other — which is exactly right: each client ignores its own beacon and reads
  // the other's, so both sides always see the opposite screen.
  const amHolder = playerId != null && remoteHolderIds(players).includes(playerId)
  useEffect(() => {
    if (!room || !amHolder || startedAt == null || isPaused) return
    void postBeacon().catch(() => {})
    const t = setInterval(() => void postBeacon().catch(() => {}), BEACON_INTERVAL_MS)
    return () => clearInterval(t)
  }, [room?.id, amHolder, startedAt, isPaused, postBeacon])

  // ── Resume countdown ───────────────────────────────────────────────────────
  const resumeAt = room?.resume_at ? new Date(room.resume_at).getTime() : null
  const resumeCountdown =
    resumeAt != null && isPaused
      ? Math.max(0, Math.ceil((resumeAt - Date.now()) / 1000))
      : null

  // When the countdown hits zero every client releases its own clock at the
  // agreed position. Only one client writes the room back to playing; the guard
  // is the point-person check plus is_paused, so six clients do not race.
  const releasedRef = useRef(false)
  useEffect(() => {
    if (resumeAt == null || !isPaused) { releasedRef.current = false; return }
    const delay = resumeAt - Date.now()
    let cancelled = false
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let releaseAttempts = 0
    const release = async () => {
      if (cancelled || releasedRef.current) return
      releasedRef.current = true
      releaseAttempts += 1
      const at = room?.paused_at_ms ?? 0
      setMyPosition(at)
      const holders = remoteHolderIds(players)
      if (!room || !playerId || !holders.includes(playerId)) return
      const { error } = await supabase.rpc('release_room_playback_resume', {
        p_room_id: room.id,
        p_actor_player_id: playerId,
        p_expected_resume_at: room.resume_at,
      })
      if (error && !cancelled && releaseAttempts < 5) {
        releasedRef.current = false
        retryTimer = setTimeout(() => void release(), 1_000)
      }
    }
    const t = setTimeout(() => {
      if (releasedRef.current) return
      // EVERY holder attempts the release write, guarded on is_paused so the
      // first one through wins and the rest match zero rows. The previous
      // version elected holders[0] by sorted id — which quietly assumed that
      // one specific phone was awake at GO. Phones lock during a pause; if the
      // elected one was asleep, nobody ever wrote the room back to playing and
      // the whole party stayed frozen. All writers send identical payloads, so
      // the race is harmless.
      void release()
    }, Math.max(0, delay))
    return () => {
      cancelled = true
      clearTimeout(t)
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [resumeAt, isPaused, room, playerId, players, setMyPosition])

  // Derived from watch groups, not a flat list on the room. Includes solo
  // watchers, who hold their own remote by definition — see lib/watch-groups.
  const pointPersonIds = remoteHolderIds(players)

  return {
    myPositionMs,
    hasPosition,
    screenStarted: startedAt != null,
    theirPositionMs,
    driftMs,
    beaconFrom,
    isPaused,
    pauseRequestedBy: room?.pause_requested_by ?? null,
    pauseReason: room?.pause_reason ?? null,
    pausedAtMs: room?.paused_at_ms ?? null,
    resumeReady: (room?.resume_ready as string[] | undefined) ?? [],
    pointPersonIds,
    amPointPerson: playerId != null && pointPersonIds.includes(playerId),
    resumeCountdown,
    setMyPosition,
    postBeacon,
    requestPause,
    cancelPauseRequest,
    confirmPause,
    markReady,
    startResumeCountdown,
    cancelResume,
    nudge,
  }
}

// ─── Formatting ───────────────────────────────────────────────────────────────

export function formatEpisodeTime(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** "22s ahead" / "8s behind" / "in sync" — phrased from the reader's side. */
export function describeDrift(driftMs: number | null): string {
  if (driftMs == null) return 'no sync yet'
  const abs = Math.abs(driftMs)
  if (abs < DRIFT_TOLERANCE_MS) return 'in sync'
  const secs = Math.round(abs / 1000)
  const label = secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`
  return driftMs > 0 ? `they are ${label} ahead` : `they are ${label} behind`
}

/** What to actually do about it, in plain words. */
export function driftAdvice(driftMs: number | null): string | null {
  if (driftMs == null || Math.abs(driftMs) < DRIFT_TOLERANCE_MS) return null
  const secs = Math.round(Math.abs(driftMs) / 1000)
  return driftMs > 0
    ? `Skip forward ${secs}s to catch up — until you do, they may react to things you have not seen.`
    : `You are ahead. Pause for ${secs}s and let them catch up.`
}
