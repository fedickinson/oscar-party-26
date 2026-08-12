import { useEffect, useRef, useState } from 'react'
import { useGame } from '../context/GameContext'
import { useOperatorAuthority } from '../context/OperatorAuthorityContext'
import { CONVICTION_BUDGET } from '../lib/conviction'
import { supabase } from '../lib/supabase'
import { fetchAllRows } from './fetch-all-rows'
import type {
  ConvictionPickRow,
  DraftEntityRow,
  PlayerRow,
  RoomRow,
  SignatureBeatRow,
} from '../types/database'

export interface ConvictionProgress {
  player: PlayerRow
  chosen: number
  required: number
}

export interface ConvictionPortfolioState {
  entities: DraftEntityRow[]
  beats: SignatureBeatRow[]
  picks: ConvictionPickRow[]
  myBeatIds: Set<number>
  believerCountByBeat: Map<number, number>
  progress: ConvictionProgress[]
  myChosenCount: number
  allComplete: boolean
  isLoading: boolean
  syncError: string | null
  actionError: string | null
  isAdvancing: boolean
  toggle: (beatId: number) => Promise<void>
  hostAdvance: () => Promise<void>
  retrySync: () => void
}

const REALTIME_STABILIZATION_MS = 5_000

function pickKey(pick: Pick<ConvictionPickRow, 'player_id' | 'beat_id'>): string {
  return `${pick.player_id}:${pick.beat_id}`
}

export function useConvictionPortfolio(roomId: string | undefined): ConvictionPortfolioState {
  const { room, player, setRoom } = useGame()
  const { capability: operatorCapability, authority: operatorAuthority } = useOperatorAuthority()
  const [entities, setEntities] = useState<DraftEntityRow[]>([])
  const [beats, setBeats] = useState<SignatureBeatRow[]>([])
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [picks, setPicks] = useState<ConvictionPickRow[]>([])
  const [loadingState, setLoadingState] = useState(true)
  const [syncErrorState, setSyncErrorState] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isAdvancing, setIsAdvancing] = useState(false)
  const [retryVersion, setRetryVersion] = useState(0)
  const picksRef = useRef<ConvictionPickRow[]>([])
  const beatsRef = useRef<SignatureBeatRow[]>([])
  const togglingRef = useRef(new Set<number>())
  const advancingRef = useRef(false)
  const activeScopeRef = useRef<string | null>(null)

  useEffect(() => { picksRef.current = picks }, [picks])
  useEffect(() => { beatsRef.current = beats }, [beats])

  function upsertPick(row: ConvictionPickRow) {
    setPicks((current) => {
      const key = pickKey(row)
      const next = current.some((candidate) => pickKey(candidate) === key)
        ? current.map((candidate) => pickKey(candidate) === key ? row : candidate)
        : [...current, row]
      picksRef.current = next
      return next
    })
  }

  function removePick(row: Pick<ConvictionPickRow, 'player_id' | 'beat_id'>) {
    setPicks((current) => {
      const key = pickKey(row)
      const next = current.filter((candidate) => pickKey(candidate) !== key)
      picksRef.current = next
      return next
    })
  }

  const requestedScope = roomId && room?.id === roomId
    ? `${roomId}:${room.show_pack_id}:${room.game_model ?? 'legacy_ensemble'}`
    : null
  const isLoading = loadingState || (
    requestedScope != null && requestedScope !== activeScopeRef.current
  )
  const syncError = requestedScope != null && requestedScope === activeScopeRef.current
    ? syncErrorState
    : null

  useEffect(() => {
    if (!roomId || !room || room.id !== roomId || room.game_model !== 'conviction_portfolio') {
      activeScopeRef.current = null
      picksRef.current = []
      beatsRef.current = []
      setEntities([])
      setBeats([])
      setPlayers([])
      setPicks([])
      setLoadingState(false)
      setSyncErrorState(null)
      setActionError(null)
      return
    }

    const currentRoom = room
    activeScopeRef.current = `${roomId}:${currentRoom.show_pack_id}:conviction_portfolio`
    let disposed = false
    let liveRevision = 0
    let hydrationRun = 0
    let stabilizationTimer: ReturnType<typeof setTimeout> | null = null

    picksRef.current = []
    beatsRef.current = []
    setEntities([])
    setBeats([])
    setPlayers([])
    setPicks([])
    setLoadingState(true)
    setSyncErrorState(null)
    setActionError(null)

    const hydrate = async (showLoading = true) => {
      const run = ++hydrationRun
      if (showLoading) {
        setLoadingState(true)
        setSyncErrorState(null)
      }
      try {
        while (!disposed && run === hydrationRun) {
          const revisionAtStart = liveRevision
          const [entityResult, beatResult, playerResult, pickResult, roomResult] = await Promise.all([
            fetchAllRows<DraftEntityRow>((from, to) => supabase.from('draft_entities')
              .select().eq('show_pack_id', currentRoom.show_pack_id).order('name').range(from, to)),
            fetchAllRows<SignatureBeatRow>((from, to) => supabase.from('signature_beats')
              .select().eq('show_pack_id', currentRoom.show_pack_id)
              .order('points', { ascending: false }).order('id').range(from, to)),
            fetchAllRows<PlayerRow>((from, to) => supabase.from('players')
              .select().eq('room_id', roomId).order('created_at').order('id').range(from, to)),
            fetchAllRows<ConvictionPickRow>((from, to) => supabase.from('conviction_picks')
              .select().eq('room_id', roomId).order('player_id').order('beat_id').range(from, to)),
            supabase.from('rooms').select().eq('id', roomId).maybeSingle(),
          ])
          const firstError = [
            entityResult.error,
            beatResult.error,
            playerResult.error,
            pickResult.error,
            roomResult.error,
          ].find(Boolean)
          if (firstError) throw firstError
          if (!roomResult.data) throw new Error('The room no longer exists.')
          if (disposed || run !== hydrationRun) return
          if (liveRevision !== revisionAtStart) continue

          const nextBeats = beatResult.data ?? []
          const nextPicks = pickResult.data ?? []
          beatsRef.current = nextBeats
          picksRef.current = nextPicks
          setEntities(entityResult.data ?? [])
          setBeats(nextBeats)
          setPlayers(playerResult.data ?? [])
          setPicks(nextPicks)
          setRoom(roomResult.data as RoomRow)
          setSyncErrorState(null)
          setLoadingState(false)
          return
        }
      } catch (loadError) {
        if (disposed || run !== hydrationRun) return
        console.error('Conviction portfolio load failed:', loadError)
        setSyncErrorState('The conviction ledger could not be synchronized.')
        setLoadingState(false)
      }
    }

    const channel = supabase
      .channel(`conviction-portfolio:${roomId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'conviction_picks', filter: `room_id=eq.${roomId}`,
      }, (payload) => {
        if (disposed) return
        liveRevision += 1
        upsertPick(payload.new as ConvictionPickRow)
      })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'conviction_picks', filter: `room_id=eq.${roomId}`,
      }, (payload) => {
        if (disposed) return
        const old = payload.old as Partial<ConvictionPickRow>
        if (!old.player_id || old.beat_id == null) return
        liveRevision += 1
        removePick({ player_id: old.player_id, beat_id: old.beat_id })
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}`,
      }, (payload) => {
        if (disposed) return
        liveRevision += 1
        setRoom(payload.new as RoomRow)
      })
      .subscribe((status) => {
        if (disposed) return
        if (status === 'SUBSCRIBED') {
          void hydrate()
          stabilizationTimer = setTimeout(() => {
            if (!disposed) void hydrate(false)
          }, REALTIME_STABILIZATION_MS)
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          hydrationRun += 1
          setSyncErrorState('The conviction feed could not connect to Realtime.')
          setLoadingState(false)
        }
      })

    return () => {
      disposed = true
      hydrationRun += 1
      if (stabilizationTimer) clearTimeout(stabilizationTimer)
      supabase.removeChannel(channel)
    }
  }, [roomId, room?.id, room?.show_pack_id, room?.game_model, retryVersion, setRoom])

  async function toggle(beatId: number): Promise<void> {
    if (!roomId || !player || isLoading || syncError || togglingRef.current.has(beatId)) return
    if (!beatsRef.current.some((beat) => beat.id === beatId)) return
    const existing = picksRef.current.find((pick) => (
      pick.player_id === player.id && pick.beat_id === beatId
    ))
    const myCount = picksRef.current.filter((pick) => pick.player_id === player.id).length
    if (!existing && myCount >= CONVICTION_BUDGET) return

    togglingRef.current.add(beatId)
    setActionError(null)
    try {
      if (existing) {
        const next = picksRef.current.filter((pick) => pickKey(pick) !== pickKey(existing))
        picksRef.current = next
        setPicks(next)
        const { error } = await supabase.from('conviction_picks').delete()
          .eq('room_id', roomId).eq('player_id', player.id).eq('beat_id', beatId)
        if (error) {
          upsertPick(existing)
          throw error
        }
        return
      }

      const optimistic: ConvictionPickRow = {
        room_id: roomId,
        player_id: player.id,
        beat_id: beatId,
        created_at: new Date().toISOString(),
      }
      upsertPick(optimistic)
      const { data, error } = await supabase.from('conviction_picks').insert({
        room_id: roomId, player_id: player.id, beat_id: beatId,
      }).select().single()
      if (error) {
        removePick(optimistic)
        throw error
      }
      upsertPick(data as ConvictionPickRow)
    } catch (toggleError) {
      setActionError(toggleError instanceof Error ? toggleError.message : 'That belief could not be saved.')
    } finally {
      togglingRef.current.delete(beatId)
    }
  }

  async function hostAdvance(): Promise<void> {
    if (!roomId || !room || !player?.is_host || room.phase !== 'confidence'
      || isLoading || syncError || advancingRef.current) return
    if (!operatorAuthority.enabled || !operatorCapability) {
      setActionError(operatorAuthority.message ?? 'Current operator authority is required.')
      return
    }
    advancingRef.current = true
    setIsAdvancing(true)
    setActionError(null)
    try {
      const { data, error } = await supabase.rpc('open_room_live_authorized', {
        p_room_id: roomId,
        p_actor_player_id: player.id,
        p_operator_capability: operatorCapability,
      })
      if (error) throw error
      if (!data) throw new Error('The room phase changed before the show could start.')
    } catch (advanceError) {
      setActionError(advanceError instanceof Error ? advanceError.message : 'The show could not start.')
    } finally {
      advancingRef.current = false
      setIsAdvancing(false)
    }
  }

  function retrySync() {
    setLoadingState(true)
    setSyncErrorState(null)
    setActionError(null)
    setRetryVersion((current) => current + 1)
  }

  const myBeatIds = new Set(picks.filter((pick) => pick.player_id === player?.id).map((pick) => pick.beat_id))
  const believerCountByBeat = new Map<number, number>()
  for (const pick of picks) {
    believerCountByBeat.set(pick.beat_id, (believerCountByBeat.get(pick.beat_id) ?? 0) + 1)
  }
  const progress = players.map((roomPlayer) => ({
    player: roomPlayer,
    chosen: picks.filter((pick) => pick.player_id === roomPlayer.id).length,
    required: CONVICTION_BUDGET,
  }))

  return {
    entities,
    beats,
    picks,
    myBeatIds,
    believerCountByBeat,
    progress,
    myChosenCount: myBeatIds.size,
    allComplete: progress.length > 0 && progress.every((entry) => entry.chosen === entry.required),
    isLoading,
    syncError,
    actionError,
    isAdvancing,
    toggle,
    hostAdvance,
    retrySync,
  }
}
