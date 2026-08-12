/**
 * WatchGroupPanel — where each person is watching, and who holds the remote there.
 *
 * THE MODEL
 *   a location = one screen = one playback
 *   everyone in a location shares that screen, however many phones they hold
 *   each location needs exactly one person who touches the remote
 *
 * TWO THINGS LEARNED THE HARD WAY
 *
 * 1. Locations must be REAL PLACES — "Tulum", "Alec's place" — not relationship
 *    labels. An earlier version offered "Together" and "Watching alone" as the
 *    defaults, and two people in different countries both picked "Watching
 *    alone" and were silently grouped onto one screen. A place name cannot be
 *    ambiguous in that way; a relationship label always can.
 *
 * 2. People declare their OWN location. The host assigning everybody is both
 *    tedious and unreliable — the host does not know where people are, and
 *    players trickle in over hours. Everyone knows where they are sitting, and
 *    whether they are the one holding the remote. Host override exists, but it
 *    is tucked away, because it is the exception rather than the flow.
 */

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronDown, MapPin, MonitorPlay, Plus, Tv } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { PlayerRow, RoomRow } from '../types/database'
import { isSoloWatcher } from '../lib/watch-groups'
import { useOperatorAuthority } from '../context/OperatorAuthorityContext'

interface Props {
  room: RoomRow
  players: PlayerRow[]
  isHost: boolean
  currentPlayerId: string
}

export default function WatchGroupPanel({ room, players, isHost, currentPlayerId }: Props) {
  const { capability: operatorCapability } = useOperatorAuthority()
  const [newPlace, setNewPlace] = useState('')
  const [adding, setAdding] = useState(false)
  const [showManage, setShowManage] = useState(false)
  const [authorityError, setAuthorityError] = useState<string | null>(null)

  const me = players.find((p) => p.id === currentPlayerId)
  const myPlace = me?.watch_group ?? null

  const places = Array.from(
    new Set(players.map((p) => p.watch_group).filter((g): g is string => !!g)),
  )

  async function setPlace(playerId: string, place: string | null) {
    setAuthorityError(null)
    try {
      const { error } = await supabase.rpc('set_player_watch_group_authorized', {
        p_room_id: room.id,
        p_actor_player_id: currentPlayerId,
        p_target_player_id: playerId,
        p_watch_group: place,
        p_operator_capability: playerId === currentPlayerId ? null : operatorCapability,
      })
      if (error) throw new Error(error.message)
    } catch (error) {
      setAuthorityError(error instanceof Error ? error.message : 'The location change was rejected.')
    }
  }

  async function claimRemote(playerId: string) {
    // Atomic: clears whoever previously held it in the same location and sets
    // the new holder in one transaction. Two client writes would leave a window
    // with two holders or none, and the sync bar reads that state live.
    setAuthorityError(null)
    try {
      const { error } = await supabase.rpc('claim_room_remote_authority', {
        p_room_id: room.id,
        p_actor_player_id: playerId,
      })
      if (error) throw new Error(error.message)
    } catch (error) {
      setAuthorityError(error instanceof Error ? error.message : 'The remote handoff was rejected.')
    }
  }

  const myGroupMembers = myPlace ? players.filter((p) => p.watch_group === myPlace) : []
  const iHoldRemote = me?.is_remote_holder ?? false
  const holderHere = myGroupMembers.find((p) => p.is_remote_holder)

  return (
    <div className="backdrop-blur-lg bg-white/10 border border-white/15 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <MonitorPlay className="w-4 h-4 text-accent" />
        <h3 className="text-sm font-semibold text-white">Where you're watching</h3>
      </div>

      {authorityError && (
        <p className="text-xs text-[var(--t-negative)]" role="alert">
          Playback setup did not change: {authorityError}
        </p>
      )}

      {/* ── Your own location ─────────────────────────────────────────────── */}
      <div>
        <p className="text-xs text-white/50 leading-relaxed mb-2.5">
          Everyone on the same screen shares one playback. Only say where you are if
          somebody else is watching with you — use a real place, so nobody gets grouped
          with you by accident.
        </p>

        {!myPlace && (
          <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 mb-2.5">
            <p className="text-xs text-white/70">You're on your own screen.</p>
            <p className="text-[11px] text-white/40 mt-0.5">
              That's fine — you hold your own remote. Scenes play through, and everyone
              stops together at the break. Only pick a place if you're sharing a screen
              with someone.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-1.5">
          {places.map((place) => (
            <motion.button
              key={place}
              whileTap={{ scale: 0.97 }}
              onClick={() => void setPlace(currentPlayerId, place)}
              className={`px-3 py-2 rounded-xl text-xs font-medium border transition-colors
                ${place === myPlace
                  ? 'bg-accent/20 border-accent/60 text-accent'
                  : 'bg-white/5 border-white/12 text-white/70'}`}
            >
              <MapPin className="w-3 h-3 inline mr-1 -mt-0.5" />
              {place}
            </motion.button>
          ))}

          {!adding && (
            <button
              onClick={() => setAdding(true)}
              className="px-3 py-2 rounded-xl text-xs border border-dashed border-white/20
                         text-white/45 hover:text-white/70 hover:border-white/35"
            >
              <Plus className="w-3 h-3 inline mr-1 -mt-0.5" />
              {places.length ? 'somewhere else' : 'add your place'}
            </button>
          )}
        </div>

        <AnimatePresence>
          {adding && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex gap-2 mt-2"
            >
              <input
                autoFocus
                value={newPlace}
                onChange={(e) => setNewPlace(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newPlace.trim()) {
                    void setPlace(currentPlayerId, newPlace.trim())
                    setNewPlace(''); setAdding(false)
                  }
                }}
                placeholder="Tulum, Alec's place, NYC…"
                /* 16px stops iOS zooming the viewport */
                className="flex-1 bg-white/5 border border-white/12 rounded-xl px-3 py-2
                           text-[16px] text-white placeholder:text-white/25
                           focus:outline-none focus:border-accent/50"
              />
              <button
                onClick={() => {
                  if (!newPlace.trim()) { setAdding(false); return }
                  void setPlace(currentPlayerId, newPlace.trim())
                  setNewPlace(''); setAdding(false)
                }}
                className="px-3 rounded-xl bg-accent/20 border border-accent/50
                           text-xs font-medium text-accent"
              >
                Set
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Remote claim, only once you have said where you are ───────────── */}
      <AnimatePresence>
        {myPlace && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="h-px bg-white/10 mb-3" />
            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => void claimRemote(currentPlayerId)}
              disabled={iHoldRemote}
              className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl border transition-colors
                ${iHoldRemote
                  ? 'bg-accent/15 border-accent/50'
                  : 'bg-white/5 border-white/12'}`}
            >
              <span
                className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${
                  iHoldRemote ? 'bg-accent' : 'bg-white/10'
                }`}
              >
                {iHoldRemote && <Check className="w-3.5 h-3.5 text-ground" strokeWidth={3} />}
              </span>
              <span className={`text-sm ${iHoldRemote ? 'text-accent font-medium' : 'text-white/70'}`}>
                {iHoldRemote ? `You have the remote in ${myPlace}` : 'I have the remote here'}
              </span>
            </motion.button>
            {!iHoldRemote && holderHere && (
              <p className="text-[11px] text-white/35 mt-1.5">
                {holderHere.name} has it right now — tapping takes over.
              </p>
            )}
            {!holderHere && (
              <p className="text-[11px] text-amber-300/70 mt-1.5">
                Nobody in {myPlace} can pause yet.
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Everyone, grouped by screen ───────────────────────────────────── */}
      {(places.length > 0 || players.some(isSoloWatcher)) && (
        <div className="space-y-2">
          <div className="h-px bg-white/10" />
          {places.map((place) => {
            const members = players.filter((p) => p.watch_group === place)
            const holder = members.find((p) => p.is_remote_holder)
            return (
              <div key={place} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
                <div className="flex items-center gap-1.5">
                  <Tv className="w-3.5 h-3.5 text-white/35" />
                  <p className="text-xs font-semibold text-white/80">{place}</p>
                  <span className="text-[10px] text-white/30 ml-auto">
                    {members.length} · 1 screen
                  </span>
                </div>
                <p className="text-[11px] text-white/45 mt-1">
                  {members.map((m) => (
                    <span key={m.id}>
                      {m.name}
                      {m.is_remote_holder && (
                        <span className="text-accent/80"> (remote)</span>
                      )}
                      {m !== members[members.length - 1] ? ', ' : ''}
                    </span>
                  ))}
                </p>
                {!holder && (
                  <p className="text-[11px] text-amber-300/60 mt-1">No remote-holder here.</p>
                )}
              </div>
            )
          })}

          {/* Solo watchers each get their own line. They are their own
              remote-holder by definition — nobody else is on that screen. */}
          {players.filter(isSoloWatcher).map((p) => (
            <div key={p.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
              <div className="flex items-center gap-1.5">
                <Tv className="w-3.5 h-3.5 text-white/35" />
                <p className="text-xs font-semibold text-white/80">{p.name}</p>
                <span className="text-[10px] text-white/30 ml-auto">on their own · 1 screen</span>
              </div>
              <p className="text-[11px] text-white/45 mt-1">
                {p.name}<span className="text-accent/80"> (remote)</span>
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ── Host override — deliberately out of the way ────────────────────── */}
      {isHost && players.length > 0 && (
        <div>
          <button
            onClick={() => setShowManage((v) => !v)}
            className="flex items-center gap-1 text-[11px] text-white/25 hover:text-white/50"
          >
            <ChevronDown
              className={`w-3 h-3 transition-transform ${showManage ? 'rotate-180' : ''}`}
            />
            Fix someone else's place
          </button>
          <AnimatePresence>
            {showManage && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-2 space-y-2"
              >
                <p className="text-[11px] text-white/35">
                  Only needed if somebody picked the wrong place or cannot get to their phone.
                </p>
                {players.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] text-white/60 w-16 truncate">{p.name}</span>
                    {places.map((place) => (
                      <button
                        key={place}
                        onClick={() => void setPlace(p.id, place)}
                        className={`px-2 py-1 rounded-lg text-[10px] border ${
                          p.watch_group === place
                            ? 'bg-accent/15 border-accent/40 text-accent'
                            : 'bg-white/5 border-white/10 text-white/50'
                        }`}
                      >
                        {place}
                      </button>
                    ))}
                    {p.watch_group && (
                      <button
                        onClick={() => void setPlace(p.id, null)}
                        className="text-[10px] text-white/25 hover:text-white/50"
                      >
                        clear
                      </button>
                    )}
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
