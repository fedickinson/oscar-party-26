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
import { Check, Copy, Crown, Flame } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useGame } from '../context/GameContext'
import { useRoomSubscription, usePlayersSubscription } from '../hooks/useRoom'
import Avatar from '../components/Avatar'
import PhaseExplainer from '../components/PhaseExplainer'
import WatchGroupPanel from '../components/WatchGroupPanel'
import { namedLocationsWithoutRemote } from '../lib/watch-groups'
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
      .update({ phase: 'pre_draft', draft_order: shuffled, ready_players: [], countdown_started_at: null })
      .eq('id', room.id)

    if (error) {
      setStartError(error.message)
      setIsStarting(false)
    }
    // On success: all clients see 'pre_draft' via Realtime → show PhaseExplainer overlay.
  }

  // Called when a player taps "Got it" on the draft explainer.
  // Uses an atomic DB function (mark_player_ready) to append the player_id
  // with a NOT-already-present guard, avoiding read-modify-write races when
  // multiple players tap simultaneously.
  async function markReady() {
    if (!room || !player) return
    await supabase.rpc('mark_player_ready', {
      p_room_id: room.id,
      p_player_id: player.id,
    })
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
  // ── Watch-group readiness ──────────────────────────────────────────────────
  //
  // Nobody is ever blocked for not stating a location: no location means "on my
  // own screen", which is a complete answer and makes that player their own
  // remote-holder by definition (see lib/watch-groups). Grouping someone with
  // strangers by accident is far worse than leaving them solo.
  //
  // The only thing worth warning about is a NAMED location where several people
  // share a screen and none of them has claimed the remote — there, nobody can
  // pause and it is not self-evident.
  const locationsWithoutRemote = namedLocationsWithoutRemote(players)
  const watchSetupIncomplete = locationsWithoutRemote.length > 0
  const [overrodeWatchSetup, setOverrodeWatchSetup] = useState(false)

  const isPreDraft = room?.phase === 'pre_draft'

  // Record the moment all players became ready so every client can compute
  // elapsed time and derive the correct countdown position locally.
  const allReady = players.length > 0 && readyPlayerIds.length >= players.length

  // The host stamps the countdown start on the ROOM, so every client derives
  // the same 3-2-1 from one wall-clock instant. Previously each client kept its
  // own local ref and ran its own timer chain, which meant they could disagree
  // — and a client whose chain broke simply froze.
  useEffect(() => {
    if (!isPreDraft || !allReady || !player?.is_host) return
    if (room?.countdown_started_at) return
    void supabase
      .from('rooms')
      .update({ countdown_started_at: new Date().toISOString() })
      .eq('id', room!.id)
  }, [isPreDraft, allReady, player?.is_host, room?.countdown_started_at, room?.id])

  const countdownStartedAt = room?.countdown_started_at
    ? new Date(room.countdown_started_at).getTime()
    : Date.now()

  // ─── Loading & null guards ───────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="w-8 h-8 border-2 border-[var(--t-pending)] border-t-transparent rounded-full animate-spin" />
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
        className="flex flex-col gap-5 pb-8 min-w-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        {/* Header */}
        <div className="text-center pt-2">
          <p className="text-xs text-[var(--t-text-dim)] uppercase tracking-[0.18em] mb-1">Party Night</p>
          <h1 className="font-display text-2xl font-bold text-[var(--t-text)] tracking-wide">Lobby</h1>
        </div>

        {/* Room code — tap to copy */}
        <motion.button
          onClick={copyCode}
          whileTap={{ scale: 0.97 }}
          className="material-vellum relief-raised deckled border rounded-2xl p-5 min-h-[44px] w-full text-center overflow-hidden"
          style={{ borderColor: 'var(--t-vellum-deep)', color: 'var(--t-ink)' }}
        >
          <p className="text-xs text-[var(--t-ink-muted)] uppercase tracking-[0.2em] mb-3">Room Code</p>
          <div className="flex gap-2 sm:gap-3 justify-center mb-3 min-w-0">
            {(code ?? '').split('').map((letter, i) => (
              <span key={i} className="font-display text-5xl font-bold text-[var(--t-ink)] leading-none tabular-nums">
                {letter}
              </span>
            ))}
          </div>
          <p className="text-xs text-[var(--t-ink-muted)] flex items-center justify-center gap-1.5">
            {copied ? (
              <><Check size={12} className="text-[var(--t-ink)]" /> Copied to clipboard</>
            ) : (
              <><Copy size={11} /> Tap to copy</>
            )}
          </p>
        </motion.button>

        {/* Player list */}
        <section className="min-w-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold text-[var(--t-text)] tracking-wide">Players</h2>
            <span className="text-xs text-[var(--t-text-dim)] px-2 py-1 rounded-full border" style={{ backgroundColor: 'var(--t-surface)', borderColor: 'var(--t-line-soft)' }}>
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
            <p className="text-[var(--t-text-dim)] text-sm text-center py-4">No players yet…</p>
          )}

          {/* People assume a lobby means "everyone has to be here right now" and
              try to coordinate a simultaneous join. They do not: the room and the
              code persist, and identity is kept in localStorage, so anyone can
              join hours early, close the tab and come back. Only the draft needs
              everybody present, because it is turn-based with a 45s auto-skip. */}
          <div className="relief-glass mt-4 p-4 rounded-xl">
            <p className="text-xs text-[var(--t-text-dim)] leading-relaxed">
              Send the code whenever — people can join now and come back later, and the
              room keeps their spot. Everyone only needs to be here at the same time for
              the <span className="text-[var(--t-text-muted)]">draft</span>, since it goes in turns.
            </p>
          </div>
        </section>

        {/* Game Settings — mode selection (host interactive, guests read-only) */}
        {/* ModeSelectPanel removed. Its two controls were Oscars-only: prestige_mode
            scoped the confidence-picks game (cut entirely for an episode) and
            ensemble_mode filtered the draft to films-only (meaningless now the pool
            is characters and dragons). Both columns still exist on rooms and default
            to 'full', which is the behaviour we want. */}

        {/* Host action / waiting state */}
        <div className="relief-glass rounded-2xl p-5">
          {isHost ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-[var(--t-text-muted)] text-sm">
                <Crown size={14} className="text-[var(--t-ornament)] flex-shrink-0" />
                <span>You're the host</span>
              </div>

              {!canStart && (
                <p className="text-[var(--t-text-dim)] text-sm">
                  The hall needs at least 2 players…
                </p>
              )}

              {startError && (
                <p className="text-[var(--t-negative)] text-sm">{startError}</p>
              )}

              {canStart && watchSetupIncomplete && !overrodeWatchSetup && (
                <div className="rounded-xl border px-3 py-2.5" style={{ backgroundColor: 'var(--t-pending-soft)', borderColor: 'var(--t-pending)' }}>
                  {locationsWithoutRemote.length > 0 && (
                    <p className="text-xs text-[var(--t-pending)] leading-relaxed mt-1">
                      Nobody in {locationsWithoutRemote.join(' or ')} can pause the episode.
                    </p>
                  )}
                  <p className="text-xs text-[var(--t-text-muted)] mt-1.5">
                    You can still start — but pausing and staying in sync will not work for them.
                  </p>
                  <button
                    onClick={() => setOverrodeWatchSetup(true)}
                    className="min-h-[44px] text-xs text-[var(--t-pending)] underline underline-offset-4 mt-1.5"
                  >
                    Start anyway
                  </button>
                </div>
              )}

              <motion.button
                onClick={startDraft}
                disabled={!canStart || isStarting || (watchSetupIncomplete && !overrodeWatchSetup)}
                whileTap={canStart ? { scale: 0.97 } : undefined}
                className={[
                  'w-full min-h-[52px] py-3 rounded-2xl border font-bold text-lg transition-all',
                  canStart && !isStarting && (!watchSetupIncomplete || overrodeWatchSetup)
                    ? 'material-enamel relief-raised text-[var(--t-personal-text)] border-[var(--t-personal-device)]'
                    : 'text-[var(--t-negative)] border-[var(--t-line-soft)] cursor-not-allowed',
                ].join(' ')}
                style={canStart && !isStarting && (!watchSetupIncomplete || overrodeWatchSetup)
                  ? undefined
                  : { backgroundColor: 'var(--t-negative-soft)' }}
              >
                {isStarting ? (
                  'Starting…'
                ) : canStart && watchSetupIncomplete && !overrodeWatchSetup ? (
                  'Waiting on screens and remotes'
                ) : canStart ? (
                  <span className="flex items-center justify-center gap-2">
                    <Flame size={18} /> Start the Party
                  </span>
                ) : (
                  `Need ${2 - players.length} more player${2 - players.length === 1 ? '' : 's'}`
                )}
              </motion.button>
            </div>
          ) : (
            <div className="text-center py-2 space-y-2">
              <div className="flex justify-center">
                <div className="w-6 h-6 border-2 border-[var(--t-line)] border-t-[var(--t-pending)] rounded-full animate-spin" />
              </div>
              <p className="text-[var(--t-text-muted)] text-sm">Waiting for the host to start…</p>
            </div>
          )}
        </div>
      </motion.div>

      {/* Playback controllers — assigned in the lobby, used all night by the
          sync bar. Two playbacks, so two people who actually touch pause. */}
      {room && room.phase === 'lobby' && players.length > 0 && (
        <div className="px-4 pb-4">
          <WatchGroupPanel room={room} players={players} isHost={isHost} currentPlayerId={player.id} />
        </div>
      )}

      {/* ── pre_draft overlays ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {isPreDraft && !playerIsReady && (
          <PhaseExplainer key="explainer" phase="draft" onContinue={markReady} />
        )}
        {/* Keep ReadyUpScreen mounted through the 'draft' phase too so the
            overlay stays up while navigate() runs. Without this, isPreDraft
            flips false the instant the phase update arrives, briefly exposing
            the lobby before navigation completes. */}
        {(isPreDraft || room?.phase === 'draft') && playerIsReady && (
          <ReadyUpScreen
            key="readyup"
            players={players}
            readyPlayerIds={readyPlayerIds}
            isHost={isHost}
            onCountdownComplete={finalizeDraft}
            countdownStartedAt={countdownStartedAt}
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
      <div className="relief-glass flex items-center gap-3 min-h-[56px] px-3 py-2 rounded-xl">
        <Avatar
          avatarId={player.avatar_id}
          size="md"
          emotion="neutral"
          highlighted={isCurrentPlayer}
        />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold truncate">{player.name}</span>
            {player.is_host && (
              <Crown size={13} className="text-[var(--t-ornament)] flex-shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {player.is_host && (
              <span className="text-xs text-[var(--t-ornament)] px-2 py-0.5 rounded-full uppercase tracking-wider font-medium" style={{ backgroundColor: 'var(--t-pending-soft)' }}>
                Host
              </span>
            )}
            {isCurrentPlayer && (
              <span className="text-xs text-[var(--t-text-dim)] px-2 py-0.5 rounded-full uppercase tracking-wider" style={{ backgroundColor: 'var(--t-surface)' }}>
                You
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.li>
  )
}
