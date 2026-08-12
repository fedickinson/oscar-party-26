/**
 * SyncDevPanel — dogfood the watch-sync flow with one person and two tabs.
 *
 * THE PROBLEM THIS SOLVES
 * Every other feature can be exercised solo: you can draft against yourself,
 * log an event, mark a bingo square. Watch-sync cannot, because it is defined
 * by TWO playbacks drifting apart, and one person with two browser tabs has
 * zero playbacks. So the one feature that most needs rehearsing — the one that
 * runs during the episode, in the dark, with five people waiting — was the only
 * one nobody could rehearse.
 *
 * WHAT IT DOES
 * Fakes the parts of the world the app cannot see: where a playback actually is,
 * and someone else asking for a pause. Everything downstream of those — the
 * drift maths, the beacon ageing, the pause handshake, the resume countdown —
 * is the real code path, unmodified. This panel never bypasses logic; it only
 * supplies inputs a television would otherwise supply.
 *
 * DEV ONLY. Gated on import.meta.env.DEV so it cannot ship into the live room.
 */

import { useState } from 'react'
import { ChevronDown, FlaskConical } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useWatchSync, formatEpisodeTime, describeDrift } from '../../hooks/useWatchSync'
import type { PlayerRow, RoomRow } from '../../types/database'
import { remoteHolderIds } from '../../lib/watch-groups'

interface Props {
  room: RoomRow
  players: PlayerRow[]
  currentPlayerId: string
}

export default function SyncDevPanel({ room, players, currentPlayerId }: Props) {
  const s = useWatchSync(room, currentPlayerId, players)
  const [open, setOpen] = useState(false)

  if (!import.meta.env.DEV) return null

  const others = players.filter((p) => p.id !== currentPlayerId)

  /** Post a beacon AS someone else, at my position plus an offset. */
  async function fakeTheirBeacon(offsetMs: number) {
    const holderIds = remoteHolderIds(players)
    const asPlayer = others.find((player) =>
      holderIds.includes(player.id) && player.episode_started_at != null
    )?.id
    if (!asPlayer) throw new Error('Start another holder screen before faking its beacon.')
    const { error } = await supabase.rpc('post_room_playback_beacon', {
      p_room_id: room.id,
      p_actor_player_id: asPlayer,
      p_position_ms: Math.round(s.myPositionMs + offsetMs),
    })
    if (error) throw new Error(error.message)
  }

  /** Someone else asks to pause, so this tab sees the request side. */
  async function fakePauseRequest() {
    const { error } = await supabase.rpc('request_room_playback_pause', {
      p_room_id: room.id,
      p_actor_player_id: others[0]?.id ?? 'ghost',
      p_reason: 'dogfood — someone needs the bathroom',
    })
    if (error) throw new Error(error.message)
  }

  const Btn = ({ onClick, children }: { onClick: () => void; children: React.ReactNode }) => (
    <button
      onClick={onClick}
      className="px-2.5 py-1.5 rounded-lg bg-white/8 border border-white/12
                 text-[11px] text-white/70 hover:bg-white/15 hover:text-white"
    >
      {children}
    </button>
  )

  return (
    <div className="rounded-2xl border border-fuchsia-500/25 bg-fuchsia-500/5 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2"
      >
        <FlaskConical className="w-3.5 h-3.5 text-fuchsia-300/70" />
        <span className="text-[11px] font-medium text-fuchsia-200/80">Sync dogfood</span>
        <ChevronDown
          className={`w-3 h-3 text-fuchsia-300/50 ml-auto transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2.5">
          {/* Raw state — what the sync bar is deciding from */}
          <div className="rounded-lg bg-black/25 px-2.5 py-2 font-mono text-[10px] text-white/55 leading-relaxed">
            <div>me {s.screenStarted ? formatEpisodeTime(s.myPositionMs) : 'not started'}</div>
            <div>them {s.theirPositionMs != null ? formatEpisodeTime(s.theirPositionMs) : '—'}</div>
            <div>drift {describeDrift(s.driftMs)}</div>
            <div>
              paused {String(s.isPaused)} · holders {s.pointPersonIds.length} · ready{' '}
              {s.resumeReady.length}
            </div>
          </div>

          {/* The television: the one input the app genuinely cannot observe */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-fuchsia-200/45 mb-1">
              Move my playback
            </p>
            <div className="flex flex-wrap gap-1.5">
              <Btn onClick={() => s.nudge(-30_000)}>-30s</Btn>
              <Btn onClick={() => s.nudge(-10_000)}>-10s</Btn>
              <Btn onClick={() => s.nudge(10_000)}>+10s</Btn>
              <Btn onClick={() => s.nudge(60_000)}>+1m</Btn>
              <Btn onClick={() => void s.postBeacon()}>beacon now</Btn>
            </div>
          </div>

          {/* Stand in for the other screen when there is only one of you */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-fuchsia-200/45 mb-1">
              Fake the other screen
            </p>
            <div className="flex flex-wrap gap-1.5">
              <Btn onClick={() => void fakeTheirBeacon(45_000)}>them +45s ahead</Btn>
              <Btn onClick={() => void fakeTheirBeacon(-45_000)}>them 45s behind</Btn>
              <Btn onClick={() => void fakeTheirBeacon(0)}>them in sync</Btn>
              <Btn onClick={() => void fakePauseRequest()}>they ask to pause</Btn>
            </div>
          </div>

          <p className="text-[10px] text-white/30 leading-relaxed">
            Two tabs, both solo watchers, both hold their own remote. Start each
            screen, then use -30s on one — drift and the advice banner should
            appear on both within a beacon interval.
          </p>
        </div>
      )}
    </div>
  )
}
