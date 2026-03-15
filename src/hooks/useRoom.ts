/**
 * useRoom — actions and realtime subscriptions for the room system.
 *
 * THREE EXPORTS:
 *   useRoom()               — createRoom() and joinRoom() actions
 *   useRoomSubscription()   — subscribes to changes on a single rooms row
 *   usePlayersSubscription()— subscribes to all players rows for a room
 *
 * WHY HOOKS INSTEAD OF STANDALONE FUNCTIONS?
 * The create/join functions need to write to both Supabase AND update the
 * React context (setRoom, setPlayer, setPlayers). Hooks let us call useGame()
 * inside and access those setters without passing them as arguments to every
 * function call.
 *
 * HOW SUPABASE REALTIME WORKS:
 * Supabase Realtime piggybacks on Postgres logical replication. When a row
 * changes, Postgres emits a WAL event; Supabase captures it and pushes it over
 * a WebSocket to any subscribed clients.
 *
 *   const channel = supabase
 *     .channel('unique-channel-name')
 *     .on('postgres_changes', {
 *       event: 'UPDATE',        // INSERT | UPDATE | DELETE | *
 *       schema: 'public',
 *       table: 'rooms',
 *       filter: `id=eq.${roomId}`,  // server-side filter — only our row
 *     }, (payload) => {
 *       setRoom(payload.new as RoomRow)
 *     })
 *     .subscribe()
 *
 * The filter runs on the Supabase side — other rooms' changes never reach
 * this client. The cleanup function removes the channel on unmount, closing
 * the WebSocket subscription and preventing memory leaks.
 *
 * PHASE-CHANGE NAVIGATION (the key pattern for multiplayer sync):
 * When the host sets rooms.phase = 'draft', Supabase pushes an UPDATE event
 * to every subscribed client. Each client's subscription callback fires,
 * updating room state in context. Room.tsx has a useEffect watching room.phase,
 * so when it changes to 'draft' everyone navigates to the draft page
 * simultaneously — no polling, no broadcast needed, just a DB write.
 */

import { useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { PLAYER_ID_KEY, useGame } from '../context/GameContext'
import type { PlayerRow, RoomRow } from '../types/database'

// One color per player slot. First player (host) gets oscar-gold.
const PLAYER_COLORS = [
  '#D4AF37', // oscar-gold
  '#7C3AED', // violet
  '#059669', // emerald
  '#DC2626', // red
  '#0284C7', // sky
  '#EA580C', // orange
]

// ─── Room actions ─────────────────────────────────────────────────────────────

export function useRoom() {
  const { setRoom, setPlayer, setPlayers } = useGame()

  /**
   * Creates a new room + the host player in a safe 3-step sequence.
   *
   * THE CHICKEN-AND-EGG PROBLEM:
   * rooms.host_id FK references players.id, but players.room_id FK references
   * rooms.id. We can't insert either row first while enforcing both FKs.
   *
   * SOLUTION: host_id is nullable. Insert the room first with host_id = null,
   * then insert the player (room already exists, room_id FK is satisfied), then
   * update the room's host_id to point at the new player.
   *
   * crypto.randomUUID() produces spec-compliant v4 UUIDs — safe to use as PK.
   */
  async function createRoom(
    code: string,
    name: string,
    avatarId: string,
  ): Promise<void> {
    const playerId = crypto.randomUUID()

    // Step 1: Insert room with host_id = null (nullable after schema migration)
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .insert({ code, host_id: null, phase: 'lobby', current_pick: 0 })
      .select()
      .single()

    if (roomError) throw new Error(`Could not create room: ${roomError.message}`)

    // Step 2: Insert the host player — room row exists so room_id FK is satisfied
    const { data: playerData, error: playerError } = await supabase
      .from('players')
      .insert({
        id: playerId,
        room_id: roomData.id,
        name: name.trim(),
        avatar_id: avatarId,
        color: PLAYER_COLORS[0],
        is_host: true,
      })
      .select()
      .single()

    if (playerError) throw new Error(`Could not create player: ${playerError.message}`)

    // Step 3: Update room to point host_id at the now-existing player
    const { data: updatedRoom, error: updateError } = await supabase
      .from('rooms')
      .update({ host_id: playerId })
      .eq('id', roomData.id)
      .select()
      .single()

    if (updateError) throw new Error(`Could not set room host: ${updateError.message}`)

    // Persist to localStorage so the session survives page refreshes
    localStorage.setItem(PLAYER_ID_KEY, playerData.id)

    setRoom(updatedRoom)
    setPlayer(playerData)
    setPlayers([playerData])
  }

  /**
   * Joins an existing room by its 4-letter code.
   * Picks the first available color from the palette.
   */
  async function joinRoom(
    code: string,
    name: string,
    avatarId: string,
  ): Promise<void> {
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .select()
      .eq('code', code.toUpperCase())
      .single()

    if (roomError || !roomData) throw new Error('Room not found. Check the code and try again.')
    if (roomData.phase !== 'lobby') throw new Error('This game has already started.')

    // Fetch current players to pick an unused color
    const { data: existingPlayers } = await supabase
      .from('players')
      .select()
      .eq('room_id', roomData.id)

    const usedColors = (existingPlayers ?? []).map((p) => p.color)
    const color = PLAYER_COLORS.find((c) => !usedColors.includes(c)) ?? PLAYER_COLORS[0]

    const { data: playerData, error: playerError } = await supabase
      .from('players')
      .insert({
        room_id: roomData.id,
        name: name.trim(),
        avatar_id: avatarId,
        color,
        is_host: false,
      })
      .select()
      .single()

    if (playerError) throw new Error(`Could not join room: ${playerError.message}`)

    localStorage.setItem(PLAYER_ID_KEY, playerData.id)

    setRoom(roomData)
    setPlayer(playerData)
    setPlayers([...(existingPlayers ?? []), playerData])
  }

  return { createRoom, joinRoom }
}

// ─── Realtime: single room row ────────────────────────────────────────────────

/**
 * Subscribes to UPDATE events on the specific rooms row. Returns room from
 * context so callers have a single source of truth.
 *
 * We only listen for UPDATE (not INSERT/DELETE) because:
 *   - INSERT: we just created the room, we already have it in state
 *   - DELETE: out of scope for now (we'd redirect to home)
 *   - UPDATE: this is what carries phase changes, draft_order, etc.
 */
export function useRoomSubscription(roomId: string | undefined) {
  const { room, setRoom } = useGame()

  useEffect(() => {
    if (!roomId) return

    const channel = supabase
      .channel(`room-row:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${roomId}`,
        },
        (payload) => {
          setRoom(payload.new as RoomRow)
        },
      )
      .subscribe()

    // Cleanup: removes the WebSocket subscription when the component unmounts.
    // Without this, navigating away from Room.tsx would leave a dangling channel
    // that continues receiving events and calling setState on an unmounted component.
    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId, setRoom])

  return room
}

// ─── Realtime: all players in a room ─────────────────────────────────────────

/**
 * Subscribes to INSERT/UPDATE/DELETE on the players table for this room.
 * Also does an initial fetch to catch anyone who joined before we subscribed.
 *
 * WHY THE INITIAL FETCH?
 * Supabase Realtime doesn't replay past events — subscribing only gets you
 * changes from that moment forward. If someone joined during the brief window
 * between component mount and the WebSocket connecting, we'd miss their INSERT.
 * The initial fetch closes that gap.
 *
 * WHY SUBSCRIBE BEFORE FETCHING?
 * We set up the channel first, then do the fetch. This means the subscription
 * is listening by the time the fetch completes. Any INSERT that races between
 * "subscribe" and "fetch response arriving" will be caught by both — the dedup
 * guard (prev.some(p => p.id === newId)) prevents duplicate entries.
 *
 * DELETE NOTE: payload.old.id is only populated if the table has
 * REPLICA IDENTITY FULL set in Postgres. Otherwise payload.old.id is null
 * and we can't remove the row. This is a Postgres config concern, not a
 * code problem.
 */
export function usePlayersSubscription(roomId: string | undefined) {
  const { players, setPlayers } = useGame()

  useEffect(() => {
    if (!roomId) return

    const channel = supabase
      .channel(`players:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'players',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          setPlayers((prev) => {
            // Dedup: if the initial fetch and INSERT event arrive close together,
            // we might have the same player row from both paths
            if (prev.some((p) => p.id === (payload.new as PlayerRow).id)) return prev
            return [...prev, payload.new as PlayerRow]
          })
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'players',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          setPlayers((prev) =>
            prev.map((p) =>
              p.id === (payload.new as PlayerRow).id ? (payload.new as PlayerRow) : p,
            ),
          )
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'players',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const deletedId = (payload.old as Partial<PlayerRow>).id
          if (deletedId) {
            setPlayers((prev) => prev.filter((p) => p.id !== deletedId))
          }
        },
      )
      .subscribe()

    // Initial fetch runs AFTER the channel is set up so we don't miss any
    // events that fire between mounting and the channel going live
    supabase
      .from('players')
      .select()
      .eq('room_id', roomId)
      .then(({ data }) => {
        if (data) setPlayers(data)
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId, setPlayers])

  return players
}
