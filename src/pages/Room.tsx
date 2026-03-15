/**
 * Room — the lobby. Everyone waits here until the host starts the draft.
 *
 * REALTIME FLOW (how phase changes drive navigation):
 *
 *   1. Host taps "Start Draft"
 *   2. startDraft() calls supabase.update({ phase: 'pre_draft', draft_order: [...] })
 *   3. Supabase pushes an UPDATE event over WebSocket to every subscribed client
 *   4. Each client's useRoomSubscription callback fires → setRoom(payload.new)
 *   5. The useEffect watching room?.phase sees 'pre_draft' → show PhaseExplainer overlay
 *   6. Player taps "Got it" → their id is appended to ready_players in the room row
 *   7. ReadyUpScreen watches ready_players via Realtime → countdown when all ready
 *   8. Host writes phase='draft' after countdown → all clients navigate to /draft
 *
 * DRAFT ORDER:
 * We shuffle the player array when starting so the draft order is random.
 * The shuffled array of player UUIDs is stored in rooms.draft_order (jsonb),
 * so all clients read the same order from the DB — no client-side randomness.
 */

import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Clapperboard, Copy, Crown } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useGame } from '../context/GameContext'
import { useRoomSubscription, usePlayersSubscription } from '../hooks/useRoom'
import Avatar from '../components/Avatar'
import PhaseExplainer from '../components/PhaseExplainer'
import ReadyUpScreen from '../components/ReadyUpScreen'
import type { PlayerRow } from '../types/database'

export default function Room() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { room, player, players, loading } = useGame()

  const [copied, setCopied] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)

  // Activate realtime — these hooks subscribe to DB changes and update context.
  // They're called with room?.id (undefined-safe) so they no-op until the
  // session restore has populated room state.
  useRoomSubscription(room?.id)
  usePlayersSubscription(room?.id)

  // ── Phase-change navigation ────────────────────────────────────────────────
  // Every client (host and guests) navigates here when the room phase changes.
  // 'pre_draft' stays on this page (overlays handle it).
  useEffect(() => {
    if (!room || !code) return
    if (room.phase === 'draft') navigate(`/room/${code}/draft`)
    if (room.phase === 'confidence') navigate(`/room/${code}/confidence`)
    if (room.phase === 'live') navigate(`/room/${code}/live`)
  }, [room?.phase, code, navigate])

  // ── Guard: no session ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!loading && !player) navigate('/')
  }, [loading, player, navigate])

  // ─── Handlers ───────────────────────────────────────────────────────────────

  async function copyCode() {
    await navigator.clipboard.writeText(code ?? '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function startDraft() {
    if (!room || !player?.is_host || players.length < 2) return
    setIsStarting(true)
    setStartError(null)

    // Randomize draft order and store it now so it's stable for the whole draft.
    const shuffled = [...players]
      .sort(() => Math.random() - 0.5)
      .map((p) => p.id)

    const { error } = await supabase
      .from('rooms')
      .update({ phase: 'pre_draft', draft_order: shuffled, ready_players: [] })
      .eq('id', room.id)

    if (error) {
      setStartError(error.message)
      setIsStarting(false)
    }
    // On success: all clients see 'pre_draft' via Realtime → show PhaseExplainer overlay.
  }

  // Called when a player taps "Got it" on the draft explainer.
  // We re-fetch the current ready_players from Supabase right before appending
  // so that two players tapping simultaneously don't overwrite each other's entry
  // (a classic client-side read-modify-write race on a shared array).
  async function markReady() {
    if (!room || !player) return

    const { data: freshRoom } = await supabase
      .from('rooms')
      .select('ready_players')
      .eq('id', room.id)
      .single()

    const current = (freshRoom?.ready_players as string[] | null) ?? []
    if (current.includes(player.id)) return
    await supabase
      .from('rooms')
      .update({ ready_players: [...current, player.id] })
      .eq('id', room.id)
  }

  // Called by the host after the countdown completes — moves everyone to the draft.
  async function finalizeDraft() {
    if (!room || !player?.is_host) return
    await supabase
      .from('rooms')
      .update({ phase: 'draft' })
      .eq('id', room.id)
    // All clients navigate via their realtime subscription watching room.phase.
  }

  // ─── Derived state ───────────────────────────────────────────────────────────

  const readyPlayerIds = (room?.ready_players as string[] | null) ?? []
  const playerIsReady = player ? readyPlayerIds.includes(player.id) : false
  const isPreDraft = room?.phase === 'pre_draft'

  // Record the moment all players became ready so every client can compute
  // elapsed time and derive the correct countdown position locally.
  const countdownStartedAtRef = useRef<number | null>(null)
  const allReady = players.length > 0 && readyPlayerIds.length >= players.length
  if (isPreDraft && allReady && countdownStartedAtRef.current === null) {
    countdownStartedAtRef.current = Date.now()
  }
  if (!isPreDraft) {
    countdownStartedAtRef.current = null
  }

  // ─── Loading & null guards ───────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="w-8 h-8 border-2 border-oscar-gold border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!room || !player) return null // useEffect is navigating us away

  const isHost = player.is_host
  const canStart = players.length >= 2

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <motion.div
        className="flex flex-col gap-5 pb-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        {/* Header */}
        <div className="text-center pt-2">
          <p className="text-xs text-white/40 uppercase tracking-widest mb-1">Oscar Party</p>
          <h1 className="text-2xl font-bold text-white">Lobby</h1>
        </div>

        {/* Room code — tap to copy */}
        <motion.button
          onClick={copyCode}
          whileTap={{ scale: 0.97 }}
          className="backdrop-blur-lg bg-white/10 border border-white/15 rounded-2xl p-5 w-full text-center"
        >
          <p className="text-xs text-white/40 uppercase tracking-widest mb-3">Room Code</p>
          <div className="flex gap-3 justify-center mb-3">
            {(code ?? '').split('').map((letter, i) => (
              <span key={i} className="text-5xl font-bold text-oscar-gold leading-none">
                {letter}
              </span>
            ))}
          </div>
          <p className="text-xs text-white/40 flex items-center justify-center gap-1.5">
            {copied ? (
              <><Check size={11} className="text-emerald-400" /> Copied to clipboard</>
            ) : (
              <><Copy size={11} /> Tap to copy</>
            )}
          </p>
        </motion.button>

        {/* Player list */}
        <div className="backdrop-blur-lg bg-white/10 border border-white/15 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-white">Players</h2>
            <span className="text-xs text-white/40 bg-white/10 px-2 py-1 rounded-full">
              {players.length} joined
            </span>
          </div>

          <motion.ul className="space-y-3" layout>
            <AnimatePresence initial={false}>
              {players.map((p) => (
                <PlayerCard
                  key={p.id}
                  player={p}
                  isCurrentPlayer={p.id === player.id}
                />
              ))}
            </AnimatePresence>
          </motion.ul>

          {players.length === 0 && (
            <p className="text-white/30 text-sm text-center py-4">No players yet…</p>
          )}
        </div>

        {/* Host action / waiting state */}
        <div className="backdrop-blur-lg bg-white/10 border border-white/15 rounded-2xl p-5">
          {isHost ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-white/60 text-sm">
                <Crown size={14} className="text-oscar-gold flex-shrink-0" />
                <span>You're the host</span>
              </div>

              {!canStart && (
                <p className="text-white/40 text-sm">
                  Waiting for at least 2 players to join…
                </p>
              )}

              {startError && (
                <p className="text-red-400 text-sm">{startError}</p>
              )}

              <motion.button
                onClick={startDraft}
                disabled={!canStart || isStarting}
                whileTap={canStart ? { scale: 0.97 } : undefined}
                className={[
                  'w-full py-4 rounded-2xl font-bold text-lg transition-all',
                  canStart && !isStarting
                    ? 'bg-oscar-gold text-deep-navy hover:bg-oscar-gold-light'
                    : 'bg-white/10 text-white/30 cursor-not-allowed',
                ].join(' ')}
              >
                {isStarting ? (
                  'Starting…'
                ) : canStart ? (
                  <span className="flex items-center justify-center gap-2">
                    <Clapperboard size={18} /> Start Ensemble
                  </span>
                ) : (
                  `Need ${2 - players.length} more player${2 - players.length === 1 ? '' : 's'}`
                )}
              </motion.button>
            </div>
          ) : (
            <div className="text-center py-2 space-y-2">
              <div className="flex justify-center">
                <div className="w-6 h-6 border-2 border-oscar-gold/50 border-t-oscar-gold rounded-full animate-spin" />
              </div>
              <p className="text-white/60 text-sm">Waiting for the host to start…</p>
            </div>
          )}
        </div>
      </motion.div>

      {/* ── pre_draft overlays ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {isPreDraft && !playerIsReady && (
          <PhaseExplainer key="explainer" phase="draft" onContinue={markReady} />
        )}
        {isPreDraft && playerIsReady && (
          <ReadyUpScreen
            key="readyup"
            players={players}
            readyPlayerIds={readyPlayerIds}
            isHost={isHost}
            onCountdownComplete={finalizeDraft}
            countdownStartedAt={countdownStartedAtRef.current ?? Date.now()}
          />
        )}
      </AnimatePresence>
    </>
  )
}

// ─── PlayerCard (inline — only used in this file) ─────────────────────────────

function PlayerCard({
  player,
  isCurrentPlayer,
}: {
  player: PlayerRow
  isCurrentPlayer: boolean
}) {
  return (
    <motion.li
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
    >
      <div className="flex items-center gap-3 py-1.5">
        <Avatar
          avatarId={player.avatar_id}
          size="lg"
          emotion="neutral"
          highlighted={isCurrentPlayer}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold truncate">{player.name}</span>
            {player.is_host && (
              <Crown size={13} className="text-oscar-gold flex-shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {player.is_host && (
              <span className="text-[10px] text-oscar-gold/80 bg-oscar-gold/10 px-2 py-0.5 rounded-full uppercase tracking-wider font-medium">
                Host
              </span>
            )}
            {isCurrentPlayer && (
              <span className="text-[10px] text-white/40 bg-white/5 px-2 py-0.5 rounded-full uppercase tracking-wider">
                You
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.li>
  )
}
