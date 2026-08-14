/**
 * Room — the lobby. Everyone waits here until the host starts the party.
 *
 * REALTIME FLOW (how phase changes drive navigation):
 *
 *   1. Host taps "Start the Party"
 *   2. startParty() calls the contract-selected capability-gated command
 *   3. Supabase pushes an UPDATE event over WebSocket to every subscribed client
 *   4. Each client's useRoomSubscription callback fires → setRoom(payload.new)
 *   5. Exclusive identity rooms enter pre-draft; shared/omitted identity rooms enter confidence
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
import { AlertTriangle, Check, Copy, Crown, Flame, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useGame } from '../context/GameContext'
import { useOperatorAuthority } from '../context/OperatorAuthorityContext'
import { useRoomSubscription, usePlayersSubscription } from '../hooks/useRoom'
import { useIdentityChoices } from '../hooks/useIdentityChoices'
import Avatar from '../components/Avatar'
import PhaseExplainer from '../components/PhaseExplainer'
import WatchGroupPanel from '../components/WatchGroupPanel'
import { namedLocationsWithoutRemote } from '../lib/watch-groups'
import { resolveLobbyStartMode } from '../lib/game-contract'
import ReadyUpScreen from '../components/ReadyUpScreen'
import type { PlayerRow } from '../types/database'

export default function Room() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { room, player, players, loading } = useGame()
  const { capability: operatorCapability, authority: operatorAuthority } = useOperatorAuthority()

  const [copied, setCopied] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)
  const [isStarting, setIsStarting] = useState(false)
  const [choiceError, setChoiceError] = useState<string | null>(null)
  const [isChoosing, setIsChoosing] = useState(false)

  // Activate realtime — these hooks subscribe to DB changes and update context.
  // They're called with room?.id (undefined-safe) so they no-op until the
  // session restore has populated room state.
  const roomSync = useRoomSubscription(room?.id)
  const rosterSync = usePlayersSubscription(room?.id)
  const lobbyStartMode = resolveLobbyStartMode(room?.game_contract)
  const identityChoices = useIdentityChoices(
    room?.id,
    room?.show_pack_id,
    lobbyStartMode === 'faction_choice',
  )

  // ── Phase-change navigation ────────────────────────────────────────────────
  // Every client (host and guests) navigates here when the room phase changes.
  // 'pre_draft' stays on this page (overlays handle it).
  useEffect(() => {
    if (!room || !code || roomSync.isLoading || roomSync.syncError != null) return
    if (room.phase === 'draft') navigate(`/room/${code}/draft`)
    if (room.phase === 'confidence') navigate(`/room/${code}/confidence`)
    if (room.phase === 'live') navigate(`/room/${code}/live`)
    if (room.phase === 'finished') navigate(`/room/${code}/results`)
    if (room.phase === 'closed') navigate(`/room/${code}/results`)
  }, [room?.phase, roomSync.isLoading, roomSync.syncError, code, navigate])

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

  async function startParty() {
    if (!room || !player?.is_host) return
    if (!operatorAuthority.enabled || !operatorCapability) {
      setStartError(operatorAuthority.message ?? 'Current operator authority is required.')
      return
    }
    if (roomSync.isLoading || roomSync.syncError != null ||
        rosterSync.isLoading || rosterSync.syncError != null ||
        (lobbyStartMode === 'faction_choice'
          && (identityChoices.isLoading || identityChoices.syncError != null))) {
      setStartError('The shared room and player roster must finish synchronizing before the party can start.')
      return
    }
    if (players.length < 2) return
    if (lobbyStartMode === 'faction_choice'
        && players.some((seat) => !identityChoices.selections.some(
          (selection) => selection.player_id === seat.id,
        ))) {
      setStartError('Every player must choose a banner before convictions open.')
      return
    }
    setIsStarting(true)
    setStartError(null)

    let error: { message: string } | null
    if (lobbyStartMode === 'convictions' || lobbyStartMode === 'faction_choice') {
      const result = await supabase.rpc('begin_room_convictions_authorized', {
        p_room_id: room.id,
        p_actor_player_id: player.id,
        p_operator_capability: operatorCapability,
      })
      error = result.error
    } else if (lobbyStartMode === 'identity_draft') {
      // Randomize draft order and store it now so it is stable for the ceremony.
      const shuffled = [...players]
        .sort(() => Math.random() - 0.5)
        .map((p) => p.id)
      const result = await supabase.rpc('begin_room_draft_authorized', {
        p_room_id: room.id,
        p_actor_player_id: player.id,
        p_operator_capability: operatorCapability,
        p_draft_order: shuffled,
      })
      error = result.error
    } else {
      error = { message: 'This room has no supported identity ceremony.' }
    }

    if (error) {
      setStartError(error.message)
      setIsStarting(false)
    }
    // On success every client follows the canonical phase through Realtime.
  }

  async function chooseIdentity(choiceKey: string) {
    if (!player || isChoosing) return
    setIsChoosing(true)
    setChoiceError(null)
    try {
      await identityChoices.choose(player.id, choiceKey)
    } catch (choiceFailure) {
      setChoiceError(choiceFailure instanceof Error
        ? choiceFailure.message
        : 'The shared identity choice could not be saved.')
    } finally {
      setIsChoosing(false)
    }
  }

  // Called when a player taps "Got it" on the draft explainer.
  // Uses an atomic DB function (mark_player_ready) to append the player_id
  // with a NOT-already-present guard, avoiding read-modify-write races when
  // multiple players tap simultaneously.
  async function markReady() {
    if (!room || !player) return
    if (roomSync.isLoading || roomSync.syncError != null ||
        rosterSync.isLoading || rosterSync.syncError != null) return
    await supabase.rpc('mark_player_ready', {
      p_room_id: room.id,
      p_player_id: player.id,
    })
  }

  // Called by the host after the countdown completes — moves everyone to the draft.
  async function finalizeDraft() {
    if (!room || !player?.is_host || !operatorAuthority.enabled || !operatorCapability) return
    if (roomSync.isLoading || roomSync.syncError != null ||
        rosterSync.isLoading || rosterSync.syncError != null) return
    const { error } = await supabase.rpc('open_room_draft_authorized', {
      p_room_id: room.id,
      p_actor_player_id: player.id,
      p_operator_capability: operatorCapability,
    })
    if (error) setStartError(error.message)
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
  const allReady = !roomSync.isLoading && roomSync.syncError == null &&
    !rosterSync.isLoading && rosterSync.syncError == null &&
    players.length > 0 && readyPlayerIds.length >= players.length

  // The host stamps the countdown start on the ROOM, so every client derives
  // the same 3-2-1 from one wall-clock instant. Previously each client kept its
  // own local ref and ran its own timer chain, which meant they could disagree
  // — and a client whose chain broke simply froze.
  useEffect(() => {
    if (!isPreDraft || !allReady || !player?.is_host
        || !operatorAuthority.enabled || !operatorCapability) return
    if (room?.countdown_started_at) return
    void supabase.rpc('begin_room_draft_countdown_authorized', {
      p_room_id: room!.id,
      p_actor_player_id: player.id,
      p_operator_capability: operatorCapability,
    }).then(({ error }) => {
      if (error) setStartError(error.message)
    })
  }, [
    isPreDraft,
    allReady,
    player?.id,
    player?.is_host,
    room?.countdown_started_at,
    room?.id,
    operatorAuthority.enabled,
    operatorCapability,
  ])

  const countdownStartedAt = room?.countdown_started_at
    ? new Date(room.countdown_started_at).getTime()
    : null

  // ─── Loading & null guards ───────────────────────────────────────────────────

  if (loading || roomSync.isLoading || rosterSync.isLoading
      || (lobbyStartMode === 'faction_choice' && identityChoices.isLoading)) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="w-8 h-8 border-2 border-[var(--t-pending)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!room || !player) return null // useEffect is navigating us away

  const isHost = player.is_host
  const hasEnoughPlayers = players.length >= 2
  const roomHealthy = roomSync.syncError == null
  const rosterHealthy = rosterSync.syncError == null
  const identityHealthy = lobbyStartMode !== 'faction_choice' || identityChoices.syncError == null
  const sharedStateHealthy = roomHealthy && rosterHealthy && identityHealthy
  const startMode = lobbyStartMode
  const everyPlayerChoseIdentity = startMode !== 'faction_choice' || players.every((seat) => (
    identityChoices.selections.some((selection) => selection.player_id === seat.id)
  ))
  const canStart = hasEnoughPlayers && sharedStateHealthy && operatorAuthority.enabled
    && startMode !== 'unsupported' && everyPlayerChoseIdentity
  const hasIdentityDraft = startMode === 'identity_draft'
  const hasFactionChoice = startMode === 'faction_choice'
  const currentIdentity = identityChoices.selections.find(
    (selection) => selection.player_id === player.id,
  )?.choice_key

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
          <p className="text-xs text-[var(--t-text-dim)] uppercase tracking-[0.18em] mb-1">Watch Party</p>
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
                  identityChoice={hasFactionChoice
                    ? identityChoices.selections.find((selection) => selection.player_id === p.id)?.choice_key
                    : undefined}
                />
              ))}
            </AnimatePresence>
          </motion.ul>

          {players.length === 0 && (
            <p className="text-[var(--t-text-dim)] text-sm text-center py-4">No players yet…</p>
          )}

          {rosterSync.syncError && (
            <div className="relief-inset mt-4 rounded-xl border border-[var(--t-pending)] bg-[var(--t-pending-soft)] p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-[var(--t-pending)]" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--t-text)]">Roster feed unavailable</p>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--t-text-muted)]">
                    The visible seats are cached. Shared start controls remain paused until the roster is current.
                  </p>
                  <button
                    type="button"
                    onClick={rosterSync.retrySync}
                    className="mt-2 inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-[var(--t-pending)]"
                  >
                    <RefreshCw size={14} />
                    Retry roster synchronization
                  </button>
                </div>
              </div>
            </div>
          )}

          {roomSync.syncError && (
            <div className="relief-inset mt-4 rounded-xl border border-[var(--t-pending)] bg-[var(--t-pending-soft)] p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-[var(--t-pending)]" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[var(--t-text)]">Room feed unavailable</p>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--t-text-muted)]">
                    Phase and countdown controls remain paused until the shared room record is current.
                  </p>
                  <button
                    type="button"
                    onClick={roomSync.retrySync}
                    className="mt-2 inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-[var(--t-pending)]"
                  >
                    <RefreshCw size={14} />
                    Retry room synchronization
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* People assume a lobby means "everyone has to be here right now" and
              try to coordinate a simultaneous join. They do not: the room and the
              code persist, and identity is kept in localStorage, so anyone can
              join hours early, close the tab and come back. */}
          <div className="relief-glass mt-4 p-4 rounded-xl">
            <p className="text-xs text-[var(--t-text-dim)] leading-relaxed">
              Send the code whenever — people can join now and come back later, and the
              room keeps their spot. {hasIdentityDraft
                ? <>Everyone only needs to be here together for the <span className="text-[var(--t-text-muted)]">identity draft</span>, since it goes in turns.</>
                : hasFactionChoice
                  ? <>Choose any banner before the show starts. Choices are shared, so friends may stand together.</>
                : <>This room opens directly into the shared conviction board, with no identity draft.</>}
            </p>
          </div>
        </section>

        {hasFactionChoice && (
          <section className="relief-glass rounded-2xl p-5 min-w-0">
            <p className="text-xs text-[var(--t-text-dim)] uppercase tracking-[0.16em]">Your banner</p>
            <h2 className="mt-1 font-display text-xl font-semibold text-[var(--t-text)]">
              Where do you stand?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--t-text-muted)]">
              This is allegiance, not ownership. More than one player may make the same choice,
              and it does not change scoring.
            </p>
            <div className="mt-4 grid gap-2">
              {identityChoices.options.map((option) => {
                const selected = option === currentIdentity
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => void chooseIdentity(option)}
                    disabled={isChoosing}
                    className={[
                      'min-h-[48px] rounded-xl border px-4 py-3 text-left font-semibold transition-colors',
                      selected
                        ? 'relief-raised border-[var(--t-ornament)] bg-[var(--t-pending-soft)] text-[var(--t-text)]'
                        : 'border-[var(--t-line-soft)] bg-[var(--t-surface)] text-[var(--t-text-muted)]',
                    ].join(' ')}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span>{option}</span>
                      {selected && <Check size={17} className="flex-shrink-0 text-[var(--t-ornament)]" />}
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="mt-3 text-xs text-[var(--t-text-dim)]">
              {identityChoices.selections.filter((selection) => (
                players.some((seat) => seat.id === selection.player_id)
              )).length} of {players.length} players have chosen
            </p>
            {choiceError && <p className="mt-2 text-sm text-[var(--t-negative)]">{choiceError}</p>}
            {identityChoices.syncError && (
              <div className="mt-3 rounded-xl border border-[var(--t-pending)] bg-[var(--t-pending-soft)] p-3">
                <p className="text-sm text-[var(--t-pending)]">{identityChoices.syncError}</p>
                <button
                  type="button"
                  onClick={identityChoices.retrySync}
                  className="mt-2 inline-flex min-h-11 items-center gap-2 text-xs font-semibold text-[var(--t-pending)]"
                >
                  <RefreshCw size={14} />
                  Retry identity synchronization
                </button>
              </div>
            )}
          </section>
        )}

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

              {!hasEnoughPlayers && sharedStateHealthy && (
                <p className="text-[var(--t-text-dim)] text-sm">
                  The hall needs at least 2 players…
                </p>
              )}

              {startError && (
                <p className="text-[var(--t-negative)] text-sm">{startError}</p>
              )}

              {!operatorAuthority.enabled && operatorAuthority.message && (
                <p className="text-[var(--t-pending)] text-sm">{operatorAuthority.message}</p>
              )}

              {startMode === 'unsupported' && (
                <p className="text-[var(--t-negative)] text-sm">
                  This room's game contract has no supported opening ceremony.
                </p>
              )}

              {hasFactionChoice && sharedStateHealthy && !everyPlayerChoseIdentity && (
                <p className="text-[var(--t-text-dim)] text-sm">
                  Waiting for every player to choose a banner.
                </p>
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
                onClick={startParty}
                disabled={!canStart || isStarting || (watchSetupIncomplete && !overrodeWatchSetup)}
                whileTap={canStart ? { scale: 0.97 } : undefined}
                className={[
                  'w-full min-h-[52px] py-3 rounded-2xl border font-bold text-lg transition-all',
                  canStart && !isStarting && (!watchSetupIncomplete || overrodeWatchSetup)
                    ? 'relief-raised bg-[var(--t-personal-device)] text-[var(--t-vellum-light)] border-[var(--t-line-strong)]'
                    : 'text-[var(--t-negative)] border-[var(--t-line-soft)] cursor-not-allowed',
                ].join(' ')}
                style={canStart && !isStarting && (!watchSetupIncomplete || overrodeWatchSetup)
                  ? undefined
                  : { backgroundColor: 'var(--t-negative-soft)' }}
              >
                {isStarting ? (
                  'Starting…'
                ) : !sharedStateHealthy ? (
                  'Room synchronization unavailable'
                ) : !operatorAuthority.enabled ? (
                  operatorAuthority.status === 'loading' ? 'Verifying operator authority' : 'Private operator link required'
                ) : canStart && watchSetupIncomplete && !overrodeWatchSetup ? (
                  'Waiting on screens and remotes'
                ) : canStart ? (
                  <span className="flex items-center justify-center gap-2">
                    <Flame size={18} /> Start the Party
                  </span>
                ) : startMode === 'unsupported' ? (
                  'Unsupported opening ceremony'
                ) : hasFactionChoice && !everyPlayerChoseIdentity ? (
                  'Waiting on banner choices'
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
        {isPreDraft && !playerIsReady && sharedStateHealthy && (
          <PhaseExplainer key="explainer" phase="draft" onContinue={markReady} />
        )}
        {/* Keep ReadyUpScreen mounted through the 'draft' phase too so the
            overlay stays up while navigate() runs. Without this, isPreDraft
            flips false the instant the phase update arrives, briefly exposing
            the lobby before navigation completes. Degraded shared state unmounts
            the one-shot countdown so its rejected completion can be retried
            from the shared timestamp after synchronization recovers. */}
        {(isPreDraft || room?.phase === 'draft') && playerIsReady && sharedStateHealthy && (
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
  identityChoice,
}: {
  player: PlayerRow
  isCurrentPlayer: boolean
  identityChoice?: string
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
            {identityChoice && (
              <span className="truncate text-xs text-[var(--t-text-muted)]">
                {identityChoice}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.li>
  )
}
