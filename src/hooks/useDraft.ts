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
 *  4. makePick() does two Supabase writes in sequence:
 *       a. INSERT into draft_picks: { room_id, player_id, entity_id, round, pick_number }
 *       b. UPDATE rooms SET current_pick = N+1 WHERE id = room.id AND current_pick = N
 *          ↑ The WHERE current_pick = N is an optimistic lock (see "RACE CONDITION" below)
 *  5. Supabase WAL emits events for both writes and broadcasts over WebSocket
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
 *  Defense 2 — Optimistic lock: The current_pick increment uses:
 *    UPDATE rooms SET current_pick = N+1
 *    WHERE id = roomId AND current_pick = N   ← this is the lock
 *
 *    If two clients somehow both call makePick with the same N, the first
 *    UPDATE matches and succeeds (current_pick was N). The second UPDATE
 *    finds current_pick is now N+1, the WHERE clause doesn't match, and
 *    zero rows are updated. The second client's pick insert also ends up
 *    orphaned. Both subscriptions fire, UI corrects itself on the next render.
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

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useGame } from '../context/GameContext'
import {
  generateSnakeOrder,
  getCurrentDrafter,
  getRoundAndPick,
} from '../lib/draft-utils'
import type { CategoryRow, DraftPickRow } from '../types/database'
import type { DraftEntityWithDetails, DraftNomination } from '../types/game'

const TURN_DURATION = 45 // seconds per pick

// ─── Entity parsing ───────────────────────────────────────────────────────────

/**
 * Parses the raw DB row into a typed entity. The nominations jsonb field
 * contains { category_id, nominee_id } entries — no category_name or points.
 * We enrich each entry from the categoryMap so the modal can display them.
 * Falls back to an empty array if the shape is wrong or missing.
 */
function parseEntity(
  raw: {
    id: string
    name: string
    type: 'person' | 'film'
    nominations: unknown
    film_name: string
    nom_count: number
  },
  categoryMap: Map<number, CategoryRow>,
): DraftEntityWithDetails {
  const rawNoms = Array.isArray(raw.nominations)
    ? (raw.nominations as { category_id: number; nominee_id?: string }[])
    : []
  const nominations: DraftNomination[] = rawNoms.flatMap((n) => {
    const cat = categoryMap.get(n.category_id)
    if (!cat) return []
    return [{ category_id: n.category_id, category_name: cat.name, points: cat.points }]
  })
  return { ...raw, nominations }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export interface DraftState {
  entities: DraftEntityWithDetails[]
  availableEntities: DraftEntityWithDetails[]
  myRoster: DraftEntityWithDetails[]
  picks: DraftPickRow[]
  /** entityId → playerId for every drafted entity */
  picksMap: Map<string, string>
  isMyTurn: boolean
  isDraftComplete: boolean
  currentDrafter: import('../types/database').PlayerRow | null
  roundInfo: { round: number; pickInRound: number }
  /** Seconds remaining this turn (0–45), resets when current_pick advances */
  timeRemaining: number
  isLoading: boolean
  snakeOrder: string[]
  /** Total pick slots this player will have in the draft */
  myTotalPickSlots: number
  /** Which sub-draft we are currently in */
  draftSubPhase: 'films' | 'people' | 'complete'
  makePick: (entityId: string) => Promise<void>
  /** DEV ONLY — auto-picks randomly for all remaining turns */
  devAutoPickAll?: () => Promise<void>
}

export function useDraft(roomId: string | undefined): DraftState {
  const { room, player, players } = useGame()

  const [entities, setEntities] = useState<DraftEntityWithDetails[]>([])
  const [picks, setPicks] = useState<DraftPickRow[]>([])
  const [timeRemaining, setTimeRemaining] = useState(TURN_DURATION)
  const [isLoading, setIsLoading] = useState(true)

  // Refs that don't trigger re-renders but are readable in callbacks/intervals
  const pickStartTimeRef = useRef(Date.now())
  const isPickingRef = useRef(false) // double-tap guard
  const roomRef = useRef(room)
  useEffect(() => {
    roomRef.current = room
  })

  // ─── Subscribe + initial data load ─────────────────────────────────────────
  //
  // IMPORTANT: The subscription is set up BEFORE the initial fetch so that any
  // INSERT that fires during the network round-trip is caught by the channel.
  // The dedup guard in the callback handles the case where both the subscription
  // and the fetch deliver the same row.
  //
  // Previously the load and subscription were in two separate useEffects.
  // React runs effects in order, so the subscription was registered AFTER
  // load() had already started — creating a window where an INSERT could be
  // missed. Merging them into one effect closes that race window.

  useEffect(() => {
    if (!roomId) return

    // Register the real-time subscription first
    const channel = supabase
      .channel(`draft-picks:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'draft_picks',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const newPick = payload.new as DraftPickRow
          setPicks((prev) => {
            // Dedup guard: subscription and initial fetch could both deliver
            // the same row if they race
            if (prev.some((p) => p.id === newPick.id)) return prev
            return [...prev, newPick]
          })
        },
      )
      .subscribe()

    // Initial fetch runs after subscription is live to close the race window
    async function load() {
      const [{ data: entityRows }, { data: pickRows }, { data: categoryRows }] = await Promise.all([
        supabase.from('draft_entities').select().order('nom_count', { ascending: false }),
        supabase.from('draft_picks').select().eq('room_id', roomId!),
        supabase.from('categories').select(),
      ])
      const categoryMap = new Map((categoryRows ?? []).map((c) => [c.id, c]))
      setEntities((entityRows ?? []).map((row) => parseEntity(row, categoryMap)))
      setPicks(pickRows ?? [])
      setIsLoading(false)
    }

    load()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId])

  // ─── Derived state ──────────────────────────────────────────────────────────

  // Parse draft_order from room (stored as jsonb, typed as unknown)
  const playerOrder: string[] = Array.isArray(room?.draft_order)
    ? (room!.draft_order as string[])
    : []

  const N = Math.max(1, playerOrder.length)

  // Split entities into two typed pools
  const filmEntities = entities.filter((e) => e.type === 'film')
  const personEntities = entities.filter((e) => e.type === 'person')

  // Build two independent snake orders — one per pool — then concatenate.
  // currentPick 0…totalFilmPicks-1  → film sub-draft
  // currentPick totalFilmPicks…end  → people sub-draft
  const filmsSnakeOrder =
    playerOrder.length > 0
      ? generateSnakeOrder(playerOrder, Math.ceil(Math.max(filmEntities.length, 1) / N))
      : []
  const peopleSnakeOrder =
    playerOrder.length > 0
      ? generateSnakeOrder(playerOrder, Math.ceil(Math.max(personEntities.length, 1) / N))
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

  // Which sub-draft are we currently in?
  const draftSubPhase: 'films' | 'people' | 'complete' =
    currentPick >= totalDraftPicks
      ? 'complete'
      : currentPick < totalFilmPicks
        ? 'films'
        : 'people'

  const currentDrafterId = getCurrentDrafter(snakeOrder, currentPick)
  const currentDrafter = players.find((p) => p.id === currentDrafterId) ?? null
  const isMyTurn = !isDraftComplete && currentDrafterId === player?.id

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
    if (isDraftComplete) return

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - pickStartTimeRef.current) / 1000)
      const remaining = Math.max(0, TURN_DURATION - elapsed)
      setTimeRemaining(remaining)

      if (remaining === 0 && player?.is_host && roomRef.current) {
        const currentRoom = roomRef.current
        const pick = currentRoom.current_pick
        // Advance current_pick — only succeeds if nobody else already did
        supabase
          .from('rooms')
          .update({ current_pick: pick + 1 })
          .eq('id', currentRoom.id)
          .eq('current_pick', pick)
          .then()
      }
    }, 250) // 4Hz for smooth visual countdown

    return () => clearInterval(interval)
  }, [isDraftComplete, player?.is_host])

  // ─── Draft complete → trigger confidence phase ───────────────────────────────
  //
  // Only the host writes the phase change. This fires as a side effect, not
  // from a button press. The Realtime subscription (in useRoomSubscription,
  // called from Draft.tsx) broadcasts the phase change to all clients, and
  // Draft.tsx's useEffect on room.phase navigates everyone.

  useEffect(() => {
    if (!isDraftComplete) return
    if (!player?.is_host) return
    if (!room || room.phase !== 'draft') return

    supabase.from('rooms').update({ phase: 'confidence' }).eq('id', room.id).then()
  }, [isDraftComplete, player?.is_host, room?.phase, room?.id])

  // ─── makePick ────────────────────────────────────────────────────────────────

  async function makePick(entityId: string): Promise<void> {
    // Guards: must be our turn, room must exist, no double-tap in flight
    if (!isMyTurn || !room || !player || isPickingRef.current) return
    isPickingRef.current = true

    try {
      const pick = room.current_pick
      const { round, pickInRound: _p } = getRoundAndPick(
        snakeOrder,
        pick,
        playerOrder.length,
      )

      // Step 1: Insert the pick row
      const { error: pickError } = await supabase.from('draft_picks').insert({
        room_id: room.id,
        player_id: player.id,
        entity_id: entityId,
        round,
        pick_number: pick,
      })

      if (pickError) throw new Error(pickError.message)

      // Step 2: Advance current_pick — with optimistic lock.
      // If two clients somehow both reach this line with the same `pick` value,
      // only the first UPDATE matches (current_pick is still N). The second
      // UPDATE sees current_pick = N+1, doesn't match, zero rows updated.
      // The Realtime event from the successful write resets everyone's UI.
      const { error: advanceError } = await supabase
        .from('rooms')
        .update({ current_pick: pick + 1 })
        .eq('id', room.id)
        .eq('current_pick', pick)

      if (advanceError) throw new Error(advanceError.message)
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
    if (!room || !roomId) return

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

      await supabase
        .from('rooms')
        .update({ current_pick: pickNum + 1 })
        .eq('id', roomId)
        .eq('current_pick', pickNum)

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
    picksMap,
    isMyTurn,
    isDraftComplete,
    currentDrafter,
    roundInfo,
    timeRemaining,
    isLoading,
    snakeOrder,
    myTotalPickSlots,
    draftSubPhase,
    makePick,
    ...(import.meta.env.DEV ? { devAutoPickAll } : {}),
  }
}
