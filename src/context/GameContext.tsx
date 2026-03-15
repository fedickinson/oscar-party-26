/**
 * GameContext — the single source of truth for the current game session.
 *
 * WHY A CONTEXT?
 * We have deeply nested components (Room → PlayerList → PlayerCard) that all
 * need to know who the current player is and what room they're in. Without
 * context, we'd prop-drill room/player through every level. Context lets any
 * component call useGame() and get the data directly.
 *
 * We expose the raw React setState dispatchers (not wrapper functions) so that
 * hooks like usePlayersSubscription can use functional updates:
 *   setPlayers(prev => [...prev, newPlayer])
 * React.Dispatch<React.SetStateAction<T>> is the exact type of useState's setter,
 * and it accepts both direct values AND updater functions.
 *
 * SESSION RESTORATION
 * On every mount (including page refreshes), we read 'oscar_player_id' from
 * localStorage and re-fetch the player + room + players from Supabase. This means
 * a user who refreshes /room/ABCD lands right back in their game without
 * re-entering their name. If the ID is stale (room deleted), we clear it.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react'
import type React from 'react'
import { supabase } from '../lib/supabase'
import type { PlayerRow, RoomRow } from '../types/database'

const PLAYER_ID_KEY = 'oscar_player_id'

interface GameContextValue {
  room: RoomRow | null
  player: PlayerRow | null
  players: PlayerRow[]
  /** True while the initial session-restore fetch is in flight. */
  loading: boolean
  setRoom: React.Dispatch<React.SetStateAction<RoomRow | null>>
  setPlayer: React.Dispatch<React.SetStateAction<PlayerRow | null>>
  setPlayers: React.Dispatch<React.SetStateAction<PlayerRow[]>>
}

const GameContext = createContext<GameContextValue | null>(null)

export function GameProvider({ children }: { children: React.ReactNode }) {
  const [room, setRoom] = useState<RoomRow | null>(null)
  const [player, setPlayer] = useState<PlayerRow | null>(null)
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const playerId = localStorage.getItem(PLAYER_ID_KEY)

    if (!playerId) {
      setLoading(false)
      return
    }

    async function restoreSession() {
      try {
        // Fetch the player row. If it's gone (room deleted, etc.) we clear
        // the stale key and let the user start fresh.
        const { data: playerData } = await supabase
          .from('players')
          .select()
          .eq('id', playerId)
          .single()

        if (!playerData) {
          localStorage.removeItem(PLAYER_ID_KEY)
          return
        }

        // Fetch room + all players in parallel — these can't fail independently
        // (if the room is gone the player row would also be gone), so Promise.all
        // is safe here.
        const [{ data: roomData }, { data: playersData }] = await Promise.all([
          supabase.from('rooms').select().eq('id', playerData.room_id).single(),
          supabase.from('players').select().eq('room_id', playerData.room_id),
        ])

        setPlayer(playerData)
        if (roomData) setRoom(roomData)
        if (playersData) setPlayers(playersData)
      } finally {
        // Always mark loading=false even if fetches fail, so pages can render
        setLoading(false)
      }
    }

    restoreSession()
  }, []) // Empty deps: runs exactly once on mount

  return (
    <GameContext.Provider
      value={{ room, player, players, loading, setRoom, setPlayer, setPlayers }}
    >
      {children}
    </GameContext.Provider>
  )
}

/** Typed hook — throws if used outside GameProvider so errors are caught early. */
export function useGame(): GameContextValue {
  const ctx = useContext(GameContext)
  if (!ctx) throw new Error('useGame must be called within a <GameProvider>')
  return ctx
}

/** The localStorage key, exported so hooks can clear it on logout. */
export { PLAYER_ID_KEY }
