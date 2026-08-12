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
 * When an authorized room command sets rooms.phase = 'draft', Supabase pushes an UPDATE event
 * to every subscribed client. Each client's subscription callback fires,
 * updating room state in context. Room.tsx has a useEffect watching room.phase,
 * so when it changes to 'draft' everyone navigates to the draft page
 * simultaneously — no polling, no broadcast needed, just a DB write.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { resolvePlayerReclaim } from '../lib/player-reclaim'
import {
  normalizeOperatorCapability,
  operatorCapabilityStorageKey,
} from '../lib/operator-capability'
import { PLAYER_ID_KEY, useGame } from '../context/GameContext'
import { fetchAllRows } from './fetch-all-rows'
import type { PlayerRow, RoomRow } from '../types/database'

// One color per player slot. First player (host) gets accent.
const PLAYER_COLORS = [
  '#D4AF37', // accent
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
   * Creates the room, host seat and private operator bearer atomically. The
   * database resolves the circular room/player foreign keys inside one
   * transaction and returns the bearer only to this creating call.
   */
  async function createRoom(
    code: string,
    name: string,
    avatarId: string,
  ): Promise<string> {
    const { data, error } = await supabase.rpc('create_room_with_host', {
      p_code: code,
      p_name: name,
      p_avatar_id: avatarId,
      p_color: PLAYER_COLORS[0],
    })
    if (error) throw new Error(`Could not create room: ${error.message}`)

    const result = data as {
      room?: RoomRow
      player?: PlayerRow
      operator_capability?: unknown
    } | null
    const roomData = result?.room
    const playerData = result?.player
    const capability = normalizeOperatorCapability(result?.operator_capability)
    if (!roomData || !playerData || playerData.room_id !== roomData.id
        || roomData.host_id !== playerData.id || !playerData.is_host || !capability) {
      throw new Error('Could not create room: the database returned an invalid host session')
    }

    // Persist to localStorage so the session survives page refreshes
    try { localStorage.setItem(PLAYER_ID_KEY, playerData.id) } catch { /* current tab still owns context */ }
    try {
      localStorage.setItem(operatorCapabilityStorageKey(roomData.id), capability)
    } catch { /* the destination fragment hands the bearer to the app-shell */ }

    setRoom(roomData)
    setPlayer(playerData)
    setPlayers([playerData])
    return capability
  }

  /**
   * Joins an existing room by its 4-letter code.
   * Picks the first available color from the palette.
   */
  async function joinRoom(
    code: string,
    name: string,
    avatarId?: string | null,
  ): Promise<void> {
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .select()
      .eq('code', code.toUpperCase())
      .single()

    if (roomError || !roomData) throw new Error('Room not found. Check the code and try again.')

    const { data: existingPlayers, error: playersError } = await supabase
      .from('players')
      .select()
      .eq('room_id', roomData.id)

    if (playersError) throw new Error(`Could not load room seats: ${playersError.message}`)

    // SEAT RECLAIM: a player whose exact name already exists in this room IS
    // that player — adopt the existing row instead of inserting a duplicate.
    // This is how a phone that lost its stored identity (cleared storage,
    // borrowed device, mid-game hiccup) gets back into a running game with
    // their draft picks, bingo card and team intact: rejoin with the same
    // name. A griefer would need both the room code and a victim's exact name;
    // duplicate exact names are ambiguous and are never chosen automatically.
    const reclaim = resolvePlayerReclaim(existingPlayers ?? [], name)
    if (reclaim.status === 'ambiguous') {
      throw new Error('More than one seat uses that exact name. Ask the host which seat is yours.')
    }
    if (reclaim.status === 'match') {
      const reclaimedPlayer = reclaim.player
      localStorage.setItem(PLAYER_ID_KEY, reclaimedPlayer.id)
      setRoom(roomData)
      setPlayer(reclaimedPlayer)
      setPlayers(existingPlayers ?? [])
      return
    }

    if (roomData.phase !== 'lobby') {
      throw new Error(
        'This game has already started. To reclaim your seat, join with the exact name you used before.',
      )
    }

    if (!avatarId) throw new Error('Pick an avatar')

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

export interface RoomSubscriptionState {
  room: RoomRow | null
  isLoading: boolean
  syncError: string | null
  retrySync: () => void
}

const ROOM_REALTIME_STABILIZATION_MS = 5_000

/**
 * Subscribes to the canonical room row before hydrating it. Every live update
 * advances a revision, so a fetch that overlaps a phase change is retried
 * instead of replacing the newer row. A bounded reconciliation also covers a
 * cold Realtime worker that reports SUBSCRIBED before it begins forwarding WAL.
 *
 * We only listen for UPDATE (not INSERT/DELETE) because the room already exists
 * before this hook mounts. A missing hydration row is treated as a sync error.
 */
export function useRoomSubscription(roomId: string | undefined): RoomSubscriptionState {
  const { room, setRoom } = useGame()
  const [loadingState, setLoadingState] = useState(true)
  const [syncErrorState, setSyncErrorState] = useState<string | null>(null)
  const [retryVersion, setRetryVersion] = useState(0)
  const activeScopeRef = useRef<string | null>(null)

  const requestedScope = roomId ?? null
  const isLoading = loadingState || (
    requestedScope != null && requestedScope !== activeScopeRef.current
  )
  const syncError = requestedScope != null && requestedScope === activeScopeRef.current
    ? syncErrorState
    : null

  useEffect(() => {
    if (!roomId) {
      activeScopeRef.current = null
      setLoadingState(false)
      setSyncErrorState(null)
      return
    }

    activeScopeRef.current = roomId
    let disposed = false
    let subscribed = false
    let liveRevision = 0
    let hydrationRun = 0
    let stabilizationTimer: ReturnType<typeof setTimeout> | null = null
    setLoadingState(true)
    setSyncErrorState(null)

    const hydrateRoom = async (showLoading = true) => {
      const run = ++hydrationRun
      if (showLoading) {
        setLoadingState(true)
        setSyncErrorState(null)
      }

      try {
        while (!disposed && run === hydrationRun) {
          const revisionAtStart = liveRevision
          const { data, error } = await supabase
            .from('rooms')
            .select()
            .eq('id', roomId)
            .maybeSingle()
          if (error) throw error
          if (!data) throw new Error('The room no longer exists.')
          if (disposed || run !== hydrationRun) return
          if (liveRevision !== revisionAtStart) continue

          setRoom(data as RoomRow)
          setSyncErrorState(null)
          setLoadingState(false)
          return
        }
      } catch (loadError) {
        if (disposed || run !== hydrationRun) return
        console.error('Room record load failed:', loadError)
        setSyncErrorState('The shared room record could not be synchronized.')
        setLoadingState(false)
      }
    }

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
          if (disposed) return
          liveRevision += 1
          setRoom(payload.new as RoomRow)
        },
      )
      .subscribe((status) => {
        if (disposed) return
        if (status === 'SUBSCRIBED') {
          subscribed = true
          void hydrateRoom()
          if (stabilizationTimer) clearTimeout(stabilizationTimer)
          stabilizationTimer = setTimeout(() => {
            if (!disposed && subscribed) void hydrateRoom(false)
          }, ROOM_REALTIME_STABILIZATION_MS)
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          subscribed = false
          hydrationRun += 1
          setSyncErrorState('The shared room feed could not connect to Realtime.')
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
  }, [roomId, retryVersion, setRoom])

  const retrySync = useCallback(() => {
    setLoadingState(true)
    setSyncErrorState(null)
    setRetryVersion((current) => current + 1)
  }, [])

  return { room, isLoading, syncError, retrySync }
}

// ─── Realtime: all players in a room ─────────────────────────────────────────

/**
 * Subscribes to INSERT/UPDATE/DELETE on the players table for this room, then
 * publishes one complete canonical snapshot.
 *
 * WHY THE INITIAL FETCH?
 * Supabase Realtime doesn't replay past events — subscribing only gets you
 * changes from that moment forward. If someone joined during the brief window
 * between component mount and the WebSocket connecting, we'd miss their INSERT.
 * The initial fetch closes that gap.
 *
 * WHY WAIT FOR SUBSCRIBED AND REVISION-CHECK THE FETCH?
 * Calling subscribe() only starts the handshake. Hydration waits for the ready
 * status, and every live event advances a revision. If a fetch overlaps any
 * INSERT, UPDATE or DELETE, that snapshot is discarded and retried. Replacing
 * the final snapshot is therefore safe; a stale merge cannot resurrect a seat
 * deleted during hydration.
 *
 * DELETE NOTE: a default replica identity carries the primary key but not the
 * deleted row's room_id, so a room-filtered DELETE subscription never matches.
 * Deletes use the small global stream, advance the revision, and remove only a
 * primary key already present in this room's roster.
 */
export interface PlayersSubscriptionState {
  players: PlayerRow[]
  isLoading: boolean
  syncError: string | null
  retrySync: () => void
}

const ROSTER_REALTIME_STABILIZATION_MS = 5_000

export function usePlayersSubscription(roomId: string | undefined): PlayersSubscriptionState {
  const { players, setPlayers } = useGame()
  const [loadingState, setLoadingState] = useState(true)
  const [syncErrorState, setSyncErrorState] = useState<string | null>(null)
  const [retryVersion, setRetryVersion] = useState(0)
  const activeScopeRef = useRef<string | null>(null)

  const requestedScope = roomId ?? null
  const isLoading = loadingState || (
    requestedScope != null && requestedScope !== activeScopeRef.current
  )
  const syncError = requestedScope != null && requestedScope === activeScopeRef.current
    ? syncErrorState
    : null

  useEffect(() => {
    if (!roomId) {
      activeScopeRef.current = null
      setLoadingState(false)
      setSyncErrorState(null)
      return
    }

    activeScopeRef.current = roomId
    let disposed = false
    let subscribed = false
    let liveRevision = 0
    let hydrationRun = 0
    let stabilizationTimer: ReturnType<typeof setTimeout> | null = null
    setLoadingState(true)
    setSyncErrorState(null)

    const comparePlayers = (left: PlayerRow, right: PlayerRow) => (
      left.created_at.localeCompare(right.created_at) || left.id.localeCompare(right.id)
    )
    const upsertPlayer = (row: PlayerRow) => {
      setPlayers((current) => {
        const existingIndex = current.findIndex((player) => player.id === row.id)
        const next = existingIndex === -1
          ? [...current, row]
          : current.map((player, index) => index === existingIndex ? row : player)
        return next.sort(comparePlayers)
      })
    }

    const hydrateRoster = async (showLoading = true) => {
      const run = ++hydrationRun
      if (showLoading) {
        setLoadingState(true)
        setSyncErrorState(null)
      }

      try {
        while (!disposed && run === hydrationRun) {
          const revisionAtStart = liveRevision
          const result = await fetchAllRows<PlayerRow>((from, to) => supabase
            .from('players')
            .select()
            .eq('room_id', roomId)
            .order('created_at')
            .order('id')
            .range(from, to))
          if (result.error) throw result.error
          if (disposed || run !== hydrationRun) return
          if (liveRevision !== revisionAtStart) continue

          setPlayers(result.data ?? [])
          setSyncErrorState(null)
          setLoadingState(false)
          return
        }
      } catch (loadError) {
        if (disposed || run !== hydrationRun) return
        console.error('Player roster load failed:', loadError)
        setSyncErrorState('The player roster could not be synchronized.')
        setLoadingState(false)
      }
    }

    const channel = supabase
      .channel(`player-roster:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'players',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          if (disposed) return
          liveRevision += 1
          upsertPlayer(payload.new as PlayerRow)
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
          if (disposed) return
          liveRevision += 1
          upsertPlayer(payload.new as PlayerRow)
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'players',
        },
        (payload) => {
          if (disposed) return
          liveRevision += 1
          const deletedId = (payload.old as Partial<PlayerRow>).id
          if (deletedId) {
            setPlayers((current) => current.filter((player) => player.id !== deletedId))
          }
        },
      )
      .subscribe((status) => {
        if (disposed) return
        if (status === 'SUBSCRIBED') {
          subscribed = true
          void hydrateRoster()
          if (stabilizationTimer) clearTimeout(stabilizationTimer)
          stabilizationTimer = setTimeout(() => {
            if (!disposed && subscribed) void hydrateRoster(false)
          }, ROSTER_REALTIME_STABILIZATION_MS)
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          subscribed = false
          hydrationRun += 1
          setSyncErrorState('The player roster feed could not connect to Realtime.')
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
  }, [roomId, retryVersion, setPlayers])

  const retrySync = useCallback(() => {
    setLoadingState(true)
    setSyncErrorState(null)
    setRetryVersion((current) => current + 1)
  }, [])

  return { players, isLoading, syncError, retrySync }
}
