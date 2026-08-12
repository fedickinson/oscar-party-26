/**
 * useDraft — all state and logic for the ensemble draft phase.
 *
 * ═══════════════════════════════════════════════════════════════
 *  A COMPLETE PICK CYCLE (the multiplayer state machine)
 * ═══════════════════════════════════════════════════════════════
 *
 *  1. Player A taps an EntityCard on their device
 *  2. ConfirmPickModal appears, showing entity details
 *  3. Player A taps "Draft [Name]" — makePick(entityId) is called
 *  4. makePick() inserts into draft_picks. Database triggers lock the room,
 *     validate the exact turn and eligible pool, then advance current_pick in
 *     the same transaction.
 *  5. Supabase WAL emits both committed rows and broadcasts over WebSocket
 *  6. Every client's subscription callbacks fire:
 *       - draft_picks INSERT → setPicks(prev => [...prev, newPick])
 *       - rooms UPDATE → setRoom(payload.new) — this is handled by useRoomSubscription
 *         which is called from Draft.tsx, not from useDraft
 *  7. React re-renders every client:
 *       - pickedEntityIds now includes the new entity → it disappears from availableEntities
 *       - room.current_pick is now N+1 → getCurrentDrafter returns Player B
 *       - isMyTurn flips to true on Player B's device, false on everyone else
 *  8. Timer reset useEffect fires (room.current_pick changed) → all clients reset to 45s
 *
 * ═══════════════════════════════════════════════════════════════
 *  RACE CONDITION PREVENTION
 * ═══════════════════════════════════════════════════════════════
 *
 *  Could two clients pick simultaneously? Two defenses:
 *
 *  Defense 1 — UI gate: Only the current drafter sees tappable entities
 *    (isMyTurn gate in EntityCard). In normal operation, only one client
 *    can even reach the confirm modal.
 *
 *  Defense 2 — Database transaction: The INSERT trigger locks the room row and
 *    validates current_pick, player, entity type and availability. If two
 *    clients submit the same turn, only one transaction can commit. The loser
 *    leaves neither an orphan pick nor a second turn advance.
 *
 *  For the host auto-skip (timer expiry), the same lock pattern applies —
 *  the skip only fires if current_pick still matches what we expected.
 *
 * ═══════════════════════════════════════════════════════════════
 *  TIMER SYNCHRONIZATION (without a server)
 * ═══════════════════════════════════════════════════════════════
 *
 *  Every client runs its own setInterval. Each client resets their local
 *  timer to 45 seconds when room.current_pick changes — detected via the
 *  Realtime subscription on the rooms table (in useRoomSubscription).
 *
 *  Clock drift: clients reset their timer when they receive the Realtime
 *  event. On the same WiFi network, this arrives within ~50ms for all
 *  clients — close enough for a party game. There's no authoritative
 *  timestamp stored in the DB (that would require a schema change).
 *
 *  Only the host actually triggers the auto-skip action. Other clients'
 *  timers hit zero and display "0s" but don't write to Supabase.
 *  The host's auto-skip increments current_pick via the same Supabase
 *  write, which fires a Realtime event and resets everyone's timer.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useGame } from '../context/GameContext'
import { useOperatorAuthority } from '../context/OperatorAuthorityContext'
import {
  generateSnakeOrder,
  getCurrentDrafter,
  getRoundAndPick,
} from '../lib/draft-utils'
import { resolveDraftEntityPortrait } from '../lib/draft-portrait'
import { filterEnsembleEntities } from '../lib/mode-utils'
import { fetchAllRows } from './fetch-all-rows'
import type {
  DraftEntityRow,
  DraftPickRow,
  NomineeRow,
  RoomRow,
  SignatureBeatRow,
} from '../types/database'
import type { DraftEntityWithDetails } from '../types/game'

const TURN_DURATION = 45 // seconds per pick
const REALTIME_STABILIZATION_MS = 5_000

// ─── Entity parsing ───────────────────────────────────────────────────────────

/**
 * Draft displays are driven by signature beats. Keep the legacy nominations
 * field empty here so no Oscars-era category data leaks into this flow.
 */
function parseEntity(
  raw: DraftEntityRow,
  nominees: readonly NomineeRow[],
): DraftEntityWithDetails {
  return {
    ...raw,
    nominations: [],
    portraitUrl: resolveDraftEntityPortrait(raw, nominees),
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface DraftState {
  entities: DraftEntityWithDetails[]
  availableEntities: DraftEntityWithDetails[]
  myRoster: DraftEntityWithDetails[]
  picks: DraftPickRow[]
  /** Non-collision signature beats keyed by draft entity id. */
  beatsByEntityId: Map<string, SignatureBeatRow[]>
  /** entityId → playerId for every drafted entity */
  picksMap: Map<string, string>
  isMyTurn: boolean
  isDraftComplete: boolean
  currentDrafter: import('../types/database').PlayerRow | null
  roundInfo: { round: number; pickInRound: number }
  /** Seconds remaining this turn (0–45), resets when current_pick advances */
  timeRemaining: number
  isLoading: boolean
  syncError: string | null
  snakeOrder: string[]
  /** Total pick slots this player will have in the draft */
  myTotalPickSlots: number
  /** Which sub-draft we are currently in */
  draftSubPhase: 'films' | 'people' | 'complete'
  makePick: (entityId: string) => Promise<void>
  retrySync: () => void
  /** DEV ONLY — auto-picks randomly for all remaining turns */
  devAutoPickAll?: () => Promise<void>
}

export function useDraft(roomId: string | undefined): DraftState {
  const { room, player, players, setRoom } = useGame()
  const { capability: operatorCapability, authority: operatorAuthority } = useOperatorAuthority()

  const [entities, setEntities] = useState<DraftEntityWithDetails[]>([])
  const [picks, setPicks] = useState<DraftPickRow[]>([])
  const [beatsByEntityId, setBeatsByEntityId] = useState<Map<string, SignatureBeatRow[]>>(new Map())
  const [timeRemaining, setTimeRemaining] = useState(TURN_DURATION)
  const [loadingState, setLoadingState] = useState(true)
  const [syncErrorState, setSyncErrorState] = useState<string | null>(null)
  const [retryVersion, setRetryVersion] = useState(0)

  // Refs that don't trigger re-renders but are readable in callbacks/intervals
  const pickStartTimeRef = useRef(Date.now())
  const isPickingRef = useRef(false) // double-tap guard
  const roomRef = useRef(room)
  const totalDraftPicksRef = useRef(0)
  const skippingPickRef = useRef<number | null>(null)
  const activeScopeRef = useRef<string | null>(null)
  useEffect(() => {
    roomRef.current = room
  })

  const requestedScope = roomId && room?.id === roomId
    ? `${roomId}:${room.show_pack_id}`
    : null
  const isLoading = loadingState || (
    requestedScope != null && requestedScope !== activeScopeRef.current
  )
  const syncError = requestedScope != null && requestedScope === activeScopeRef.current
    ? syncErrorState
    : null

  // ─── Subscribe + initial data load ─────────────────────────────────────────
  //
  // Hydration starts only after Realtime reports SUBSCRIBED. Every live event
  // advances a revision; a fetch overlapping one retries before publishing.
  // One bounded reconciliation covers a cold worker that acknowledges the
  // channel before its Postgres Changes stream is fully ready.

  useEffect(() => {
    if (!roomId || !room || room.id !== roomId) {
      activeScopeRef.current = null
      setEntities([])
      setPicks([])
      setBeatsByEntityId(new Map())
      setLoadingState(false)
      setSyncErrorState(null)
      return
    }

    const currentRoom = room
    activeScopeRef.current = `${roomId}:${currentRoom.show_pack_id}`
    let disposed = false
    let subscribed = false
    let liveRevision = 0
    let hydrationRun = 0
    let stabilizationTimer: ReturnType<typeof setTimeout> | null = null

    setEntities([])
    setPicks([])
    setBeatsByEntityId(new Map())
    setLoadingState(true)
    setSyncErrorState(null)

    const upsertPick = (newPick: DraftPickRow) => {
      setPicks((current) => {
        const existingIndex = current.findIndex((pick) => pick.id === newPick.id)
        const next = existingIndex === -1
          ? [...current, newPick]
          : current.map((pick, index) => index === existingIndex ? newPick : pick)
        return next.sort((left, right) => left.pick_number - right.pick_number)
      })
    }

    const hydrateDraftLedger = async (showLoading = true) => {
      const run = ++hydrationRun
      if (showLoading) {
        setLoadingState(true)
        setSyncErrorState(null)
      }

      try {
        while (!disposed && run === hydrationRun) {
          const revisionAtStart = liveRevision
          const [entityResult, pickResult, beatResult, nomineeResult, roomResult] = await Promise.all([
            fetchAllRows<DraftEntityRow>((from, to) => supabase
              .from('draft_entities')
              .select()
              .eq('show_pack_id', currentRoom.show_pack_id)
              .order('nom_count', { ascending: false })
              .order('id')
              .range(from, to)),
            fetchAllRows<DraftPickRow>((from, to) => supabase
              .from('draft_picks')
              .select()
              .eq('room_id', roomId)
              .order('pick_number')
              .order('id')
              .range(from, to)),
            fetchAllRows<SignatureBeatRow>((from, to) => supabase
              .from('signature_beats')
              .select()
              .eq('show_pack_id', currentRoom.show_pack_id)
              .order('points', { ascending: false })
              .order('id')
              .range(from, to)),
            fetchAllRows<NomineeRow>((from, to) => supabase
              .from('nominees')
              .select()
              .eq('show_pack_id', currentRoom.show_pack_id)
              .order('id')
              .range(from, to)),
            supabase.from('rooms').select().eq('id', roomId).maybeSingle(),
          ])
          const firstError = [
            entityResult.error,
            pickResult.error,
            beatResult.error,
            nomineeResult.error,
            roomResult.error,
          ].find(Boolean)
          if (firstError) throw firstError
          if (!roomResult.data) throw new Error('The room no longer exists.')
          if (disposed || run !== hydrationRun) return
          if (liveRevision !== revisionAtStart) continue

          const filteredEntities = filterEnsembleEntities(
            entityResult.data ?? [],
            roomResult.data.ensemble_mode,
          )
          const nominees = nomineeResult.data ?? []
          const nextBeats = new Map<string, SignatureBeatRow[]>()
          for (const beat of beatResult.data ?? []) {
            if (beat.partner_entity_id != null) continue
            nextBeats.set(beat.entity_id, [...(nextBeats.get(beat.entity_id) ?? []), beat])
          }

          setEntities(filteredEntities.map((row) => parseEntity(row, nominees)))
          setPicks(pickResult.data ?? [])
          setBeatsByEntityId(nextBeats)
          setRoom(roomResult.data as RoomRow)
          setSyncErrorState(null)
          setLoadingState(false)
          return
        }
      } catch (loadError) {
        if (disposed || run !== hydrationRun) return
        console.error('Draft ledger load failed:', loadError)
        setSyncErrorState('The draft ledger could not be synchronized.')
        setLoadingState(false)
      }
    }

    const channel = supabase
      .channel(`draft-ledger:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'draft_picks',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          if (disposed) return
          liveRevision += 1
          upsertPick(payload.new as DraftPickRow)
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          if (disposed) return
          liveRevision += 1
          setRoom(payload.new as RoomRow)
        },
      )
      .subscribe((status) => {
        if (disposed) return
        if (status === 'SUBSCRIBED') {
          subscribed = true
          void hydrateDraftLedger()
          if (stabilizationTimer) clearTimeout(stabilizationTimer)
          stabilizationTimer = setTimeout(() => {
            if (!disposed && subscribed) void hydrateDraftLedger(false)
          }, REALTIME_STABILIZATION_MS)
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          subscribed = false
          hydrationRun += 1
          setSyncErrorState('The draft feed could not connect to Realtime.')
          setLoadingState(false)
        }
      })

    return () => {
      disposed = true
      subscribed = false
      hydrationRun += 1
      if (stabilizationTimer) clearTimeout(stabilizationTimer)
      supabase.removeChannel(channel)
    }
  }, [roomId, room?.id, room?.show_pack_id, retryVersion, setRoom])

  const retrySync = useCallback(() => {
    setLoadingState(true)
    setSyncErrorState(null)
    setRetryVersion((current) => current + 1)
  }, [])

  // ─── Derived state ──────────────────────────────────────────────────────────

  // Parse draft_order from room (stored as jsonb, typed as unknown)
  const playerOrder: string[] = Array.isArray(room?.draft_order)
    ? (room!.draft_order as string[])
    : []

  const N = Math.max(1, playerOrder.length)

  // Round caps, one per pool. Without them the snake order is sized to exhaust
  // the pool, so the last picks are forced choices between entities nobody
  // wants — the "lost in the sauce" problem from the Oscars build, where
  // someone burned a pick on a hair designer and watched it do nothing all
  // night. Capping below the pool size means the weakest entities go undrafted
  // instead, and every pick made is one somebody actually wanted.
  //
  // The split is deliberate: exactly ONE dragon each, then four characters.
  // Eleven dragons against six players makes the good ones genuinely contested
  // — somebody is not getting Vhagar — and it opens the draft with the most
  // enjoyable decision rather than burying dragons in the late rounds.
  const MAX_ROUNDS_DRAGONS = 1
  const MAX_ROUNDS_CHARACTERS = room?.game_model === 'conviction_portfolio' ? 0 : 4

  // Split entities into two typed pools
  const filmEntities = entities.filter((e) => e.type === 'film')
  const personEntities = entities.filter((e) => e.type === 'person')

  // Build two independent snake orders — one per pool — then concatenate.
  // currentPick 0…totalFilmPicks-1  → film sub-draft
  // currentPick totalFilmPicks…end  → people sub-draft
  const filmsSnakeOrder =
    playerOrder.length > 0
      ? generateSnakeOrder(playerOrder, Math.min(MAX_ROUNDS_DRAGONS, Math.ceil(Math.max(filmEntities.length, 1) / N)))
      : []
  const peopleSnakeOrder =
    playerOrder.length > 0 && MAX_ROUNDS_CHARACTERS > 0
      ? generateSnakeOrder(playerOrder, Math.min(MAX_ROUNDS_CHARACTERS, Math.ceil(Math.max(personEntities.length, 1) / N)))
      : []

  const totalFilmPicks = Math.min(filmEntities.length, filmsSnakeOrder.length)
  const totalPersonPicks = Math.min(personEntities.length, peopleSnakeOrder.length)
  const totalDraftPicks = totalFilmPicks + totalPersonPicks

  // Full snake order is the two segments concatenated
  const snakeOrder = [
    ...filmsSnakeOrder.slice(0, totalFilmPicks),
    ...peopleSnakeOrder.slice(0, totalPersonPicks),
  ]

  const pickedEntityIds = new Set(picks.map((p) => p.entity_id))
  const picksMap = new Map(picks.map((p) => [p.entity_id, p.player_id]))

  const availableEntities = entities.filter((e) => !pickedEntityIds.has(e.id))
  const myRoster = entities.filter((e) => picksMap.get(e.id) === player?.id)

  const currentPick = room?.current_pick ?? 0
  const isDraftComplete =
    room != null && entities.length > 0 && currentPick >= totalDraftPicks

  // Keep ref in sync so the timer callback can read it without a stale closure
  totalDraftPicksRef.current = totalDraftPicks

  // Which sub-draft are we currently in?
  const draftSubPhase: 'films' | 'people' | 'complete' =
    currentPick >= totalDraftPicks
      ? 'complete'
      : currentPick < totalFilmPicks
        ? 'films'
        : 'people'

  const currentDrafterId = getCurrentDrafter(snakeOrder, currentPick)
  const currentDrafter = players.find((p) => p.id === currentDrafterId) ?? null
  const isMyTurn = !isLoading && syncError == null && !isDraftComplete && currentDrafterId === player?.id

  // Round/pick numbers are relative to the current sub-draft, not the full pick counter
  const subPhaseOffset = draftSubPhase === 'people' ? totalFilmPicks : 0
  const roundInfo = getRoundAndPick(snakeOrder, currentPick - subPhaseOffset, N)

  // How many pick slots does the current player have in this draft?
  const myTotalPickSlots = snakeOrder
    .slice(0, totalDraftPicks)
    .filter((id) => id === player?.id).length

  // ─── Timer: reset when pick advances ────────────────────────────────────────
  //
  // We track the previous current_pick in a ref so we only reset when it
  // actually changes, not on every render that happens to have the same value.

  const prevPickRef = useRef(-1)
  useEffect(() => {
    if (room == null) return
    if (room.current_pick !== prevPickRef.current) {
      prevPickRef.current = room.current_pick
      skippingPickRef.current = null
      pickStartTimeRef.current = Date.now()
      setTimeRemaining(TURN_DURATION)
    }
  }, [room?.current_pick])

  // ─── Timer: tick + host auto-skip ───────────────────────────────────────────
  //
  // We run the interval on all clients but only the host writes to Supabase
  // when it hits zero. The .eq('current_pick', currentPick) optimistic lock
  // ensures only one write succeeds even if somehow multiple clients fire.

  useEffect(() => {
    if (isDraftComplete || isLoading || syncError != null) return

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - pickStartTimeRef.current) / 1000)
      const remaining = Math.max(0, TURN_DURATION - elapsed)
      setTimeRemaining(remaining)

      if (remaining === 0 && player?.is_host && operatorAuthority.enabled
          && operatorCapability && roomRef.current) {
        const currentRoom = roomRef.current
        const pick = currentRoom.current_pick

        // Never auto-skip the last pick — let the player claim it themselves.
        const isLastPick = pick >= totalDraftPicksRef.current - 1
        if (isLastPick) return
        if (skippingPickRef.current === pick) return
        skippingPickRef.current = pick

        // Advance current_pick — only succeeds if nobody else already did
        supabase.rpc('skip_room_draft_turn_authorized', {
          p_room_id: currentRoom.id,
          p_actor_player_id: player.id,
          p_operator_capability: operatorCapability,
          p_expected_pick: pick,
        })
          .then(({ error }) => {
            if (error) {
              skippingPickRef.current = null
              console.error('Auto-skip failed:', error)
            }
          })
      }
    }, 250) // 4Hz for smooth visual countdown

    return () => clearInterval(interval)
  }, [
    isDraftComplete,
    isLoading,
    syncError,
    player?.id,
    player?.is_host,
    operatorAuthority.enabled,
    operatorCapability,
  ])

  // ─── Draft complete → trigger beat activation phase ────────────────────────
  //
  // Only the host writes the phase change. This fires as a side effect, not
  // from a button press. The Realtime subscription (in useRoomSubscription,
  // called from Draft.tsx) broadcasts the phase change to all clients, and
  // Draft.tsx's useEffect on room.phase navigates everyone.
  //
  // The existing 'confidence' state-machine slot is the synchronized beat-
  // activation step for this property. Draft.tsx observes that phase and sends
  // every client to the activation route.

  useEffect(() => {
    if (isLoading || syncError != null) return
    if (!isDraftComplete) return
    if (!player?.is_host) return
    if (!room || room.phase !== 'draft') return
    if (!operatorAuthority.enabled || !operatorCapability) return

    supabase.rpc('complete_room_draft_authorized', {
      p_room_id: room.id,
      p_actor_player_id: player.id,
      p_operator_capability: operatorCapability,
    })
      .then(({ error }) => {
        if (error) console.error('Draft phase transition failed:', error)
      })
  }, [
    isDraftComplete,
    isLoading,
    syncError,
    player?.id,
    player?.is_host,
    room?.phase,
    room?.id,
    operatorAuthority.enabled,
    operatorCapability,
  ])

  // ─── makePick ────────────────────────────────────────────────────────────────

  async function makePick(entityId: string): Promise<void> {
    if (isLoading) throw new Error('The draft ledger is still synchronizing.')
    if (syncError != null) throw new Error('The draft ledger is unavailable. Retry synchronization.')
    // Guards: must be our turn, room must exist, no double-tap in flight
    if (!isMyTurn || !room || !player || isPickingRef.current) return
    isPickingRef.current = true

    try {
      const pick = room.current_pick
      const subOffset = pick < totalFilmPicks ? 0 : totalFilmPicks
      const { round } = getRoundAndPick(
        snakeOrder,
        pick - subOffset,
        playerOrder.length,
      )

      // The database owns the atomic claim + turn advance. Older clients still
      // issue a second conditional room update; it harmlessly matches no row.
      const { error: pickError } = await supabase.from('draft_picks').insert({
        room_id: room.id,
        player_id: player.id,
        entity_id: entityId,
        round,
        pick_number: pick,
      })

      if (pickError) throw new Error(pickError.message)
    } finally {
      isPickingRef.current = false
    }
  }

  // ─── DEV: auto-pick all remaining turns ────────────────────────────────────
  //
  // Bypasses isMyTurn — picks randomly for every player until draft is done.
  // Tracks picked IDs locally so we don't rely on async state updates between
  // sequential Supabase writes.

  async function devAutoPickAll(): Promise<void> {
    if (!room || !roomId || isLoading || syncError != null) return

    const localPickedIds = new Set(picks.map((p) => p.entity_id))
    let pickNum = room.current_pick

    const filmEnts = entities.filter((e) => e.type === 'film')
    const personEnts = entities.filter((e) => e.type === 'person')

    while (pickNum < totalDraftPicks) {
      const playerId = snakeOrder[pickNum]
      const isFilmTurn = pickNum < totalFilmPicks
      const pool = isFilmTurn ? filmEnts : personEnts
      const available = pool.filter((e) => !localPickedIds.has(e.id))
      if (available.length === 0) break

      const entity = available[Math.floor(Math.random() * available.length)]
      const subOffset = isFilmTurn ? 0 : totalFilmPicks
      const { round } = getRoundAndPick(snakeOrder, pickNum - subOffset, playerOrder.length)

      const { error } = await supabase.from('draft_picks').insert({
        room_id: roomId,
        player_id: playerId,
        entity_id: entity.id,
        round,
        pick_number: pickNum,
      })
      if (error) break

      localPickedIds.add(entity.id)
      pickNum++

      // Brief pause so Supabase isn't hammered and Realtime can breathe
      await new Promise((r) => setTimeout(r, 80))
    }
  }

  return {
    entities,
    availableEntities,
    myRoster,
    picks,
    beatsByEntityId,
    picksMap,
    isMyTurn,
    isDraftComplete,
    currentDrafter,
    roundInfo,
    timeRemaining,
    isLoading,
    syncError,
    snakeOrder,
    myTotalPickSlots,
    draftSubPhase,
    makePick,
    retrySync,
    ...(import.meta.env.DEV ? { devAutoPickAll } : {}),
  }
}
