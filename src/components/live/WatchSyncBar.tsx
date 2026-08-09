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
import { Check, Pause, Play, RefreshCw, Radio, TriangleAlert, X } from 'lucide-react'
import {
  useWatchSync,
  formatEpisodeTime,
  describeDrift,
  driftAdvice,
  DRIFT_TOLERANCE_MS,
} from '../../hooks/useWatchSync'
import type { RoomRow, PlayerRow } from '../../types/database'
import { supabase } from '../../lib/supabase'

interface Props {
  room: RoomRow
  players: PlayerRow[]
  currentPlayerId: string
}

export default function WatchSyncBar({ room, players, currentPlayerId }: Props) {
  const s = useWatchSync(room, currentPlayerId, players)
  const [entry, setEntry] = useState('')
  const [showEntry, setShowEntry] = useState(false)
  const [askOpen, setAskOpen] = useState(false)

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
    void s.postBeacon()
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

  async function startMyScreen() {
    await supabase.rpc('start_episode_for_screen', {
      p_room_id: room.id,
      p_player_id: currentPlayerId,
    })
  }

  if (!s.screenStarted) {
    return (
      <div className="relief-glass px-4 py-3">
        {isPointPerson ? (
          <>
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => void startMyScreen()}
              className="w-full py-3.5 rounded-xl bg-accent font-bold text-ground-deep
                         text-base flex items-center justify-center gap-2"
              style={{ boxShadow: '0 0 22px rgba(212,175,55,0.3)' }}
            >
              <Play className="w-5 h-5" fill="currentColor" />
              Start my screen
            </motion.button>
            <p className="text-[11px] text-white/40 text-center mt-2 leading-relaxed">
              Tap the moment the episode starts playing on your TV. That sets your
              clock — you never have to type a timestamp.
            </p>
          </>
        ) : (
          <div className="flex items-center gap-2.5">
            <Radio className="w-4 h-4 text-white/30 flex-shrink-0" />
            <p className="text-xs text-white/45">
              Waiting for {myHolder ? myHolder.name : 'whoever has the remote'} to
              start your screen.
            </p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="relief-glass overflow-hidden">
      {/* ── Status row ───────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-shrink-0">
          {s.isPaused ? (
            <Pause className="w-5 h-5 text-amber-400" />
          ) : drifted ? (
            <TriangleAlert className="w-5 h-5 text-red-400" />
          ) : (
            <Radio className="w-5 h-5 text-emerald-400" />
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
              s.isPaused ? 'text-amber-300'
                : drifted ? 'text-red-300'
                : s.driftMs != null ? 'text-emerald-300'
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

      {/* ── Drift advice ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {advice && !s.isPaused && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="px-4 pb-3"
          >
            <div className="bg-red-500/10 border border-red-500/25 rounded-xl px-3 py-2">
              <p className="text-xs text-red-200 leading-relaxed">{advice}</p>
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => s.nudge(s.driftMs ?? 0)}
                  className="text-[11px] px-2.5 py-1.5 rounded-lg bg-white/10 text-white/80"
                >
                  I skipped — realign
                </button>
                <button
                  onClick={() => void s.postBeacon()}
                  className="text-[11px] px-2.5 py-1.5 rounded-lg bg-white/5 text-white/60"
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
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5
                           text-[16px] text-white placeholder:text-white/25 tabular-nums
                           focus:outline-none focus:border-accent/50"
              />
              <button
                onClick={commitEntry}
                className="px-4 rounded-xl bg-accent/20 border border-accent/50
                           text-sm font-medium text-accent"
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
            className="border-t border-white/10 bg-amber-500/10"
          >
            <div className="px-4 py-3">
              <p className="text-sm text-amber-200">
                <span className="font-semibold">{nameOf(s.pauseRequestedBy)}</span>{' '}
                asked to pause
                {s.pauseReason ? ` — ${s.pauseReason}` : ''}
              </p>
              {isPointPerson ? (
                <>
                  <p className="text-[11px] text-amber-200/60 mt-1">
                    Pause your TV at the next scene break, then tap below. The
                    first screen to pause sets the spot everyone parks at.
                  </p>
                  <button
                    onClick={() => void s.confirmPause(s.myPositionMs)}
                    className="mt-2 w-full py-2.5 rounded-xl bg-amber-500/20
                               border border-amber-400/50 text-sm font-semibold text-amber-100"
                  >
                    Paused now — at {formatEpisodeTime(s.myPositionMs)}
                  </button>
                </>
              ) : (
                <p className="text-[11px] text-amber-200/60 mt-1">
                  {myHolder
                    ? `${myHolder.name} will pause your screen at a scene break.`
                    : 'Waiting for a scene break.'}
                </p>
              )}
              {s.pauseRequestedBy === currentPlayerId && (
                <button
                  onClick={() => void s.cancelPauseRequest()}
                  className="mt-1.5 text-[11px] text-amber-200/50 underline"
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
            className="border-t border-white/10 bg-amber-500/5"
          >
            <div className="px-4 py-3">
              {/* The pause is the realignment tool: both screens park at ONE
                  position, so pressing play together erases whatever drift had
                  accumulated. Without this instruction the second screen paused
                  wherever it happened to stop and resumed still offset. */}
              <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 mb-2.5 text-center">
                <p className="text-[10px] uppercase tracking-wider text-white/35">
                  Park every screen at
                </p>
                <p className="text-2xl font-bold text-white tabular-nums leading-tight">
                  {formatEpisodeTime(s.pausedAtMs ?? 0)}
                </p>
                {s.pausedAtMs != null && s.hasPosition &&
                  Math.abs(s.myPositionMs - s.pausedAtMs) >= DRIFT_TOLERANCE_MS && (
                  <p className="text-[11px] text-amber-300/80 mt-0.5">
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
                          ? 'bg-emerald-500 border-emerald-300'
                          : 'bg-white/10 border-white/20'
                      }`}
                    />
                  ))}
                </div>
              </div>

              {isPointPerson && !iAmReady ? (
                <button
                  onClick={() => void s.markReady()}
                  className="w-full py-2.5 rounded-xl bg-emerald-500/20 border
                             border-emerald-400/50 text-sm font-semibold text-emerald-100
                             flex items-center justify-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  My screen is parked at {formatEpisodeTime(s.pausedAtMs ?? 0)}
                </button>
              ) : isPointPerson ? (
                <button
                  onClick={() => void s.startResumeCountdown(5)}
                  className={`w-full py-2.5 rounded-xl text-sm font-semibold
                              flex items-center justify-center gap-2 ${
                    everyoneReady
                      ? 'bg-emerald-500/25 border border-emerald-400/60 text-emerald-100'
                      : 'bg-white/5 border border-white/15 text-white/50'
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
            className="border-t border-emerald-400/30 bg-emerald-500/15"
          >
            <div className="px-4 py-4 text-center">
              <p className="text-[11px] uppercase tracking-wide text-emerald-300/70">
                Press play on
              </p>
              <motion.p
                key={s.resumeCountdown}
                initial={{ scale: 1.35, opacity: 0.4 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                className="text-5xl font-bold text-emerald-100 tabular-nums leading-none my-1"
              >
                {s.resumeCountdown === 0 ? 'GO' : s.resumeCountdown}
              </motion.p>
              {isPointPerson && s.resumeCountdown > 0 && (
                <button
                  onClick={() => void s.cancelResume()}
                  className="text-[11px] text-emerald-200/50 underline mt-1"
                >
                  cancel
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Request pause ────────────────────────────────────────────────── */}
      {/* A reason travels with the request because the two rooms cannot hear
          each other. "Franky asked to pause — bathroom" reads instantly on a
          phone across an ocean; a bare request invites a "why?" into the chat
          at exactly the moment someone is walking away from their seat. */}
      {!s.isPaused && !s.pauseRequestedBy && (
        askOpen ? (
          <div className="border-t border-white/10 px-3 py-2.5">
            <p className="text-[11px] text-white/40 mb-1.5">
              Every screen pauses at the next scene break. Why?
            </p>
            <div className="flex gap-1.5">
              {['Bathroom', 'Refill', 'Need a minute'].map((r) => (
                <button
                  key={r}
                  onClick={() => { void s.requestPause(r); setAskOpen(false) }}
                  className="flex-1 py-2 rounded-lg bg-amber-500/15 border border-amber-400/30
                             text-xs font-medium text-amber-100"
                >
                  {r}
                </button>
              ))}
              <button
                onClick={() => setAskOpen(false)}
                aria-label="Cancel"
                className="px-2.5 rounded-lg bg-white/5 text-white/40"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAskOpen(true)}
            className="w-full py-2.5 border-t border-white/10 text-xs font-medium
                       text-white/45 hover:text-white/80 hover:bg-white/5
                       transition-colors flex items-center justify-center gap-1.5"
          >
            <Pause className="w-3.5 h-3.5" />
            Ask everyone to pause
          </button>
        )
      )}
    </div>
  )
}
