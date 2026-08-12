/**
 * WatchSyncBar — keeps the room in New York and the remote viewer together.
 *
 * Sits at the top of the live dashboard, always visible. Three jobs:
 *   1. Show where each side is, and whether that is a problem
 *   2. Let anyone ask for a pause; let the point person actually call it
 *   3. Get everyone agreed before resuming
 *
 * DESIGN CONSTRAINT: this is used in a dark room with a television on. It has to
 * be readable at a glance and silent when nothing is wrong. Green means stop
 * looking at your phone.
 */

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Pause, Play, RefreshCw, Radio, TriangleAlert } from 'lucide-react'
import {
  useWatchSync,
  formatEpisodeTime,
  describeDrift,
  driftAdvice,
  DRIFT_TOLERANCE_MS,
} from '../../hooks/useWatchSync'
import type { RoomRow, PlayerRow } from '../../types/database'
import { supabase } from '../../lib/supabase'
import { useOperatorAuthority } from '../../context/OperatorAuthorityContext'

interface Props {
  room: RoomRow
  players: PlayerRow[]
  currentPlayerId: string
}

export default function WatchSyncBar({ room, players, currentPlayerId }: Props) {
  const { capability: operatorCapability } = useOperatorAuthority()
  const s = useWatchSync(room, currentPlayerId, players)
  const [entry, setEntry] = useState('')
  const [showEntry, setShowEntry] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function runAction(action: () => Promise<void>) {
    setActionError(null)
    try {
      await action()
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The shared playback command was rejected.')
    }
  }

  const me = players.find((p) => p.id === currentPlayerId)
  const isPointPerson = s.amPointPerson
  const nameOf = (id: string | null) =>
    players.find((p) => p.id === id)?.name ?? 'Someone'

  const drifted = s.driftMs != null && Math.abs(s.driftMs) >= DRIFT_TOLERANCE_MS
  const advice = driftAdvice(s.driftMs)

  // "34:12" or "3412" both work — nobody types a colon in a dark room.
  function commitEntry() {
    const raw = entry.trim().replace(/[^\d:]/g, '')
    if (!raw) return
    let ms: number
    if (raw.includes(':')) {
      const [m, sec] = raw.split(':')
      ms = (Number(m) * 60 + Number(sec || 0)) * 1000
    } else if (raw.length > 2) {
      const m = raw.slice(0, -2)
      const sec = raw.slice(-2)
      ms = (Number(m) * 60 + Number(sec)) * 1000
    } else {
      ms = Number(raw) * 60 * 1000
    }
    if (!Number.isFinite(ms)) return
    s.setMyPosition(ms)
    setEntry('')
    setShowEntry(false)
    void runAction(s.postBeacon)
  }

  // Ready-up counts SCREENS, not people. Five friends on one sofa are not going
  // to pass a phone around so each of them can tap "I'm ready" — the person
  // holding the remote speaks for that screen. Counting heads meant the resume
  // button never lit up and whoever had the remote had to override it every time.
  const screenHolders = s.pointPersonIds
  const readyHolders = screenHolders.filter((id) => s.resumeReady.includes(id))
  const readyCount = readyHolders.length
  const everyoneReady = screenHolders.length > 0 && readyCount >= screenHolders.length
  const iAmReady = s.resumeReady.includes(currentPlayerId)

  // My screen has no clock yet. Until it does there is nothing to compare, so
  // this replaces the whole status row rather than sitting under it.
  const myHolder = players.find(
    (p) => screenHolders.includes(p.id) &&
      (me?.watch_group ? p.watch_group === me.watch_group : p.id === currentPlayerId),
  )

  // Optimistic: the tap must respond INSTANTLY. The authoritative flip rides
  // the players-UPDATE realtime echo, but on a phone that echo can lag or (in
  // the worst case, mid-suspend) be missed entirely — in the live dogfood the
  // button appeared dead. Local state flips the UI now and starts the clock at
  // 0:00; the DB row catches up and agrees.
  const [startedLocal, setStartedLocal] = useState(false)
  async function startMyScreen() {
    setStartedLocal(true)
    s.setMyPosition(0)
    const { error } = await supabase.rpc('start_episode_for_screen_authorized', {
      p_room_id: room.id,
      p_actor_player_id: currentPlayerId,
      p_operator_capability: operatorCapability,
    })
    if (error) throw new Error(error.message)
  }

  // Start-my-screen gate DISABLED mid-party (user call): the room isn't using
  // episode-clock sync tonight and the big button sat over everything. The bar
  // renders its quiet status row and keeps the ask-everyone-to-pause flow.

  return (
    <div className="material-iron relief-inset rounded-2xl overflow-hidden border border-[color:var(--t-line)]">
      {/* ── Status row ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-shrink-0">
          {s.isPaused ? (
            <Pause className="w-5 h-5 text-[color:var(--t-pending)]" />
          ) : drifted ? (
            <TriangleAlert className="w-5 h-5 text-[color:var(--t-negative)]" />
          ) : (
            <Radio className="w-5 h-5 text-[color:var(--t-positive)]" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-white tabular-nums">
              {s.hasPosition ? formatEpisodeTime(s.myPositionMs) : '--:--'}
            </span>
            {s.theirPositionMs != null && (
              <span className="text-xs text-white/40 tabular-nums">
                them {formatEpisodeTime(s.theirPositionMs)}
              </span>
            )}
          </div>
          <p
            className={`text-xs mt-0.5 ${
              s.isPaused ? 'text-[color:var(--t-pending)]'
                : drifted ? 'text-[color:var(--t-negative)]'
                : s.driftMs != null ? 'text-[color:var(--t-positive)]'
                : 'text-white/40'
            }`}
          >
            {s.isPaused
              ? `Paused at ${formatEpisodeTime(s.pausedAtMs ?? 0)}`
              : describeDrift(s.driftMs)}
          </p>
        </div>

        <button
          onClick={() => setShowEntry((v) => !v)}
          aria-label="Set my position"
          className="flex-shrink-0 w-11 h-11 flex items-center justify-center
                     text-white/50 hover:text-white transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {actionError && (
        <p className="border-t border-[color:var(--t-line)] px-4 py-2 text-xs text-[var(--t-negative)]" role="alert">
          Playback did not change: {actionError}
        </p>
      )}

      {/* ── Drift advice ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {advice && !s.isPaused && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-4 pb-3"
          >
            <div className="bg-[var(--t-negative-soft)] border border-[color:var(--t-negative)] rounded-xl px-3 py-2">
              <p className="text-xs text-[color:var(--t-text-muted)] leading-relaxed">{advice}</p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => s.nudge(s.driftMs ?? 0)}
                  className="relief-raised min-h-11 text-[11px] px-2.5 py-1.5 rounded-lg bg-[var(--t-negative-soft)] border border-[color:var(--t-negative)] text-[color:var(--t-text)]"
                >
                  I skipped — realign
                </button>
                <button
                  onClick={() => void runAction(s.postBeacon)}
                  className="material-iron relief-raised min-h-11 text-[11px] px-2.5 py-1.5 rounded-lg border border-[color:var(--t-line)] text-[color:var(--t-text-muted)]"
                >
                  Re-send mine
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Position entry ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {showEntry && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-4 pb-3"
          >
            <p className="text-[11px] text-white/40 mb-2">
              Read the time off your player and type it in.
            </p>
            <div className="flex gap-2">
              <input
                value={entry}
                onChange={(e) => setEntry(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && commitEntry()}
                inputMode="numeric"
                placeholder="34:12"
                /* 16px: stops iOS zooming the viewport mid-episode */
                className="relief-inset min-h-11 flex-1 bg-[var(--t-input-bg)] border border-[color:var(--t-line)] rounded-xl px-3 py-2.5
                           text-[16px] text-[color:var(--t-text)] placeholder:text-[color:var(--t-text-dim)] tabular-nums
                           focus:outline-none focus:border-[color:var(--t-personal-text)]"
              />
              <button
                onClick={commitEntry}
                className="relief-raised min-h-11 px-4 rounded-xl bg-[var(--t-personal-device)] border border-[color:var(--t-personal-text)]
                           text-sm font-medium text-[color:var(--t-text)]"
              >
                Set
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Pause requested, not yet actioned ────────────────────────────── */}
      <AnimatePresence>
        {s.pauseRequestedBy && !s.isPaused && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-[color:var(--t-line)] bg-[var(--t-pending-soft)]"
          >
            <div className="px-4 py-3">
              <p className="text-sm text-[color:var(--t-pending)]">
                <span className="font-semibold">{nameOf(s.pauseRequestedBy)}</span>{' '}
                asked to pause
                {s.pauseReason ? ` — ${s.pauseReason}` : ''}
              </p>
              {isPointPerson ? (
                <>
                  <p className="text-[11px] text-[color:var(--t-text-muted)] mt-1">
                    Pause your TV at the next scene break, then tap below. The
                    first screen to pause sets the spot everyone parks at.
                  </p>
                  <button
                    onClick={() => void runAction(() => s.confirmPause(s.myPositionMs))}
                    className="relief-raised min-h-11 mt-2 w-full py-2.5 rounded-xl bg-[var(--t-pending-soft)]
                               border border-[color:var(--t-pending)] text-sm font-semibold text-[color:var(--t-text)]"
                  >
                    Paused now — at {formatEpisodeTime(s.myPositionMs)}
                  </button>
                </>
              ) : (
                <p className="text-[11px] text-[color:var(--t-text-muted)] mt-1">
                  {myHolder
                    ? `${myHolder.name} will pause your screen at a scene break.`
                    : 'Waiting for a scene break.'}
                </p>
              )}
              {s.pauseRequestedBy === currentPlayerId && (
                <button
                  onClick={() => void runAction(s.cancelPauseRequest)}
                  className="min-h-11 mt-1.5 text-[11px] text-[color:var(--t-text-muted)] underline"
                >
                  never mind — keep playing
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Paused: ready-up ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {s.isPaused && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-[color:var(--t-line)] bg-[var(--t-pending-soft)]"
          >
            <div className="px-4 py-3">
              {/* The pause is the realignment tool: both screens park at ONE
                  position, so pressing play together erases whatever drift had
                  accumulated. Without this instruction the second screen paused
                  wherever it happened to stop and resumed still offset. */}
              <div className="relief-inset rounded-xl bg-[var(--t-input-bg)] border border-[color:var(--t-line)] px-3 py-2 mb-2.5 text-center">
                <p className="text-[10px] uppercase tracking-wider text-white/35">
                  Park every screen at
                </p>
                <p className="text-2xl font-bold text-white tabular-nums leading-tight">
                  {formatEpisodeTime(s.pausedAtMs ?? 0)}
                </p>
                {s.pausedAtMs != null && s.hasPosition &&
                  Math.abs(s.myPositionMs - s.pausedAtMs) >= DRIFT_TOLERANCE_MS && (
                  <p className="text-[11px] text-[color:var(--t-pending)] mt-0.5">
                    your clock stopped {Math.round(Math.abs(s.myPositionMs - s.pausedAtMs) / 1000)}s{' '}
                    {s.myPositionMs > s.pausedAtMs ? 'past' : 'short of'} that — scrub to match
                  </p>
                )}
              </div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-white/60">
                  {readyCount} of {screenHolders.length} screen{screenHolders.length === 1 ? '' : 's'} ready
                </p>
                <div className="flex -space-x-1">
                  {players.filter((p) => screenHolders.includes(p.id)).map((p) => (
                    <div
                      key={p.id}
                      title={p.name}
                      className={`w-5 h-5 rounded-full border-2 ${
                        s.resumeReady.includes(p.id)
                          ? 'bg-[var(--t-positive)] border-[color:var(--t-positive)]'
                          : 'bg-[var(--t-negative-soft)] border-[color:var(--t-line)]'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {isPointPerson && !iAmReady ? (
                <button
                  onClick={() => void runAction(s.markReady)}
                  className="relief-raised min-h-11 w-full py-2.5 rounded-xl bg-[var(--t-positive-soft)] border
                             border-[color:var(--t-positive)] text-sm font-semibold text-[color:var(--t-positive)]
                             flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  My screen is parked at {formatEpisodeTime(s.pausedAtMs ?? 0)}
                </button>
              ) : isPointPerson ? (
                <button
                  onClick={() => void runAction(() => s.startResumeCountdown(5))}
                  className={`relief-raised min-h-11 w-full py-2.5 rounded-xl text-sm font-semibold
                              flex items-center justify-center gap-2 ${
                    everyoneReady
                      ? 'bg-[var(--t-positive-soft)] border border-[color:var(--t-positive)] text-[color:var(--t-positive)]'
                      : 'bg-[var(--t-negative-soft)] border border-[color:var(--t-line)] text-[color:var(--t-text-muted)]'
                  }`}
                >
                  <Play className="w-4 h-4" />
                  {everyoneReady
                    ? 'Start countdown — everyone ready'
                    : `Start countdown anyway (${readyCount}/${screenHolders.length})`}
                </button>
              ) : (
                <p className="text-xs text-center text-white/40 py-1.5">
                  {myHolder ? `${myHolder.name} answers for your screen.` : 'The remote-holders answer for each screen.'}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Resume countdown ─────────────────────────────────────────────── */}
      {/* Both playbacks press play on the same beat. One person pressing and the
          other following would recreate the drift the pause just fixed. */}
      <AnimatePresence>
        {s.resumeCountdown != null && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-[color:var(--t-positive)] bg-[var(--t-positive-soft)]"
          >
            <div className="px-4 py-4 text-center">
              <p className="text-[11px] uppercase tracking-wide text-[color:var(--t-positive)]">
                Press play on
              </p>
              <motion.p
                key={s.resumeCountdown}
                initial={{ scale: 1.35, opacity: 0.4 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                className="text-5xl font-bold text-[color:var(--t-positive)] tabular-nums leading-none my-1"
              >
                {s.resumeCountdown === 0 ? 'GO' : s.resumeCountdown}
              </motion.p>
              {isPointPerson && s.resumeCountdown > 0 && (
                <button
                  onClick={() => void runAction(s.cancelResume)}
                  className="min-h-11 text-[11px] text-[color:var(--t-text-muted)] underline mt-1"
                >
                  cancel
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Request pause ────────────────────────────────────────────────── */}
      {/* ONE tap. An earlier version asked "why?" with reason chips — in the
          live dogfood that read as a form blocking an urgent action. The reason
          was decoration; the request is the point. */}
      {!s.isPaused && !s.pauseRequestedBy && (
        <button
          onClick={() => void runAction(s.requestPause)}
          className="w-full py-2.5 border-t border-white/10 text-xs font-medium
                     text-white/45 hover:text-white/80 hover:bg-white/5
                     transition-colors flex items-center justify-center gap-1.5"
        >
          <Pause className="w-3.5 h-3.5" />
          Ask everyone to pause
        </button>
      )}
    </div>
  )
}
