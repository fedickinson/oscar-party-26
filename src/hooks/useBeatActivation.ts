import { useEffect, useRef, useState } from 'react'
import { useGame } from '../context/GameContext'
import { useOperatorAuthority } from '../context/OperatorAuthorityContext'
import { supabase } from '../lib/supabase'
import type {
  BeatActivationRow,
  DraftEntityRow,
  DraftPickRow,
  PlayerRow,
  RoomRow,
  SignatureBeatRow,
} from '../types/database'

export interface ActivatableCharacter {
  entity: DraftEntityRow
  beats: SignatureBeatRow[]
  activatedBeatIds: Set<number>
}

export interface DragonActivationView {
  entity: DraftEntityRow
  beats: SignatureBeatRow[]
  alwaysActive: true
}

export interface PlayerActivationProgress {
  player: PlayerRow
  activatedCount: number
  requiredCount: number
}

export interface BeatActivationState {
  characters: ActivatableCharacter[]
  dragon: DragonActivationView | null
  progress: PlayerActivationProgress[]
  myActivatedCount: number
  myRequiredCount: number
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

export function useBeatActivation(roomId: string | undefined): BeatActivationState {
  const { room, player, setRoom } = useGame()
  const { capability: operatorCapability, authority: operatorAuthority } = useOperatorAuthority()
  const [picks, setPicks] = useState<DraftPickRow[]>([])
  const [entities, setEntities] = useState<DraftEntityRow[]>([])
  const [beats, setBeats] = useState<SignatureBeatRow[]>([])
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [activations, setActivations] = useState<BeatActivationRow[]>([])
  const [loadingState, setLoadingState] = useState(true)
  const [syncErrorState, setSyncErrorState] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isAdvancing, setIsAdvancing] = useState(false)
  const [retryVersion, setRetryVersion] = useState(0)

  const activationsRef = useRef<BeatActivationRow[]>([])
  const beatsRef = useRef<SignatureBeatRow[]>([])
  const picksRef = useRef<DraftPickRow[]>([])
  const entitiesRef = useRef<DraftEntityRow[]>([])
  const togglingRef = useRef<Set<number>>(new Set())
  const advancingRef = useRef(false)
  const activeScopeRef = useRef<string | null>(null)

  useEffect(() => { activationsRef.current = activations }, [activations])
  useEffect(() => { beatsRef.current = beats }, [beats])
  useEffect(() => { picksRef.current = picks }, [picks])
  useEffect(() => { entitiesRef.current = entities }, [entities])

  const requestedScope = roomId && room?.id === roomId
    ? `${roomId}:${room.show_pack_id}`
    : null
  const isLoading = loadingState || (
    requestedScope != null && requestedScope !== activeScopeRef.current
  )
  const syncError = requestedScope != null && requestedScope === activeScopeRef.current
    ? syncErrorState
    : null

  useEffect(() => {
    if (!roomId || !room || room.id !== roomId) {
      activeScopeRef.current = null
      activationsRef.current = []
      beatsRef.current = []
      picksRef.current = []
      entitiesRef.current = []
      setPicks([])
      setEntities([])
      setBeats([])
      setPlayers([])
      setActivations([])
      setLoadingState(false)
      setSyncErrorState(null)
      setActionError(null)
      return
    }

    const currentRoom = room
    activeScopeRef.current = `${roomId}:${currentRoom.show_pack_id}`
    let disposed = false
    let subscribed = false
    let liveRevision = 0
    let hydrationRun = 0
    let stabilizationTimer: ReturnType<typeof setTimeout> | null = null

    activationsRef.current = []
    beatsRef.current = []
    picksRef.current = []
    entitiesRef.current = []
    setPicks([])
    setEntities([])
    setBeats([])
    setPlayers([])
    setActivations([])
    setLoadingState(true)
    setSyncErrorState(null)
    setActionError(null)

    const hydrateActivationLedger = async (showLoading = true) => {
      const run = ++hydrationRun
      if (showLoading) {
        setLoadingState(true)
        setSyncErrorState(null)
      }

      try {
        while (!disposed && run === hydrationRun) {
          const revisionAtStart = liveRevision
          const [pickRes, entityRes, beatRes, playerRes, activationRes, roomRes] = await Promise.all([
            supabase.from('draft_picks').select().eq('room_id', roomId),
            supabase.from('draft_entities').select().eq('show_pack_id', currentRoom.show_pack_id),
            supabase
              .from('signature_beats')
              .select()
              .eq('show_pack_id', currentRoom.show_pack_id)
              .order('points', { ascending: false }),
            supabase.from('players').select().eq('room_id', roomId).order('created_at'),
            supabase.from('beat_activations').select().eq('room_id', roomId),
            supabase.from('rooms').select().eq('id', roomId).maybeSingle(),
          ])
          const firstError = [
            pickRes.error,
            entityRes.error,
            beatRes.error,
            playerRes.error,
            activationRes.error,
            roomRes.error,
          ].find(Boolean)
          if (firstError) throw firstError
          if (!roomRes.data) throw new Error('The room no longer exists.')
          if (disposed || run !== hydrationRun) return
          if (liveRevision !== revisionAtStart) continue

          const nextPicks = (pickRes.data ?? []) as DraftPickRow[]
          const nextEntities = (entityRes.data ?? []) as DraftEntityRow[]
          const nextBeats = (beatRes.data ?? []) as SignatureBeatRow[]
          const nextActivations = (activationRes.data ?? []) as BeatActivationRow[]
          picksRef.current = nextPicks
          entitiesRef.current = nextEntities
          beatsRef.current = nextBeats
          activationsRef.current = nextActivations
          setPicks(nextPicks)
          setEntities(nextEntities)
          setBeats(nextBeats)
          setPlayers((playerRes.data ?? []) as PlayerRow[])
          setActivations(nextActivations)
          setRoom(roomRes.data as RoomRow)
          setSyncErrorState(null)
          setLoadingState(false)
          return
        }
      } catch (loadError) {
        if (disposed || run !== hydrationRun) return
        console.error('Beat activation ledger load failed:', loadError)
        setSyncErrorState('The beat activation ledger could not be synchronized.')
        setLoadingState(false)
      }
    }

    const channel = supabase
      .channel(`beat-activation:${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'beat_activations', filter: `room_id=eq.${roomId}` },
        (payload) => {
          if (disposed) return
          liveRevision += 1
          const row = payload.new as BeatActivationRow
          setActivations((current) => {
            const index = current.findIndex((activation) => activation.beat_id === row.beat_id)
            const next = index === -1
              ? [...current, row]
              : current.map((activation, candidateIndex) => (
                candidateIndex === index ? row : activation
              ))
            activationsRef.current = next
            return next
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'beat_activations', filter: `room_id=eq.${roomId}` },
        (payload) => {
          if (disposed) return
          const row = payload.old as Partial<BeatActivationRow>
          if (row.beat_id == null) return
          liveRevision += 1
          setActivations((current) => {
            const next = current.filter((activation) => activation.beat_id !== row.beat_id)
            activationsRef.current = next
            return next
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
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
          void hydrateActivationLedger()
          if (stabilizationTimer) clearTimeout(stabilizationTimer)
          stabilizationTimer = setTimeout(() => {
            if (!disposed && subscribed) void hydrateActivationLedger(false)
          }, REALTIME_STABILIZATION_MS)
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          subscribed = false
          hydrationRun += 1
          setSyncErrorState('The beat activation feed could not connect to Realtime.')
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

  async function toggle(beatId: number): Promise<void> {
    if (
      !roomId
      || !player
      || isLoading
      || syncError != null
      || togglingRef.current.has(beatId)
    ) return

    const beat = beatsRef.current.find((candidate) => candidate.id === beatId)
    if (!beat || beat.partner_entity_id != null) return

    const myEntityIds = new Set(
      picksRef.current.filter((pick) => pick.player_id === player.id).map((pick) => pick.entity_id),
    )
    const entity = entitiesRef.current.find((candidate) => candidate.id === beat.entity_id)
    if (!entity || entity.type !== 'person' || !myEntityIds.has(entity.id)) return

    const existing = activationsRef.current.find((activation) => activation.beat_id === beatId)
    if (existing && existing.player_id !== player.id) {
      setActionError('That wager is already owned by another player’s ledger.')
      return
    }
    if (!existing) {
      const chosenForCharacter = activationsRef.current.filter((activation) => {
        const activatedBeat = beatsRef.current.find((candidate) => candidate.id === activation.beat_id)
        return activation.player_id === player.id
          && activatedBeat?.entity_id === entity.id
          && activatedBeat.partner_entity_id == null
      }).length
      if (chosenForCharacter >= 3) return
    }

    togglingRef.current.add(beatId)
    setActionError(null)
    try {
      if (existing) {
        setActivations((current) => {
          const next = current.filter((activation) => activation.beat_id !== beatId)
          activationsRef.current = next
          return next
        })
        const { error: deleteError } = await supabase
          .from('beat_activations')
          .delete()
          .eq('room_id', roomId)
          .eq('beat_id', beatId)
          .eq('player_id', player.id)
        if (deleteError) {
          setActivations((current) => {
            const next = current.some((activation) => activation.beat_id === beatId)
              ? current
              : [...current, existing]
            activationsRef.current = next
            return next
          })
          setActionError(deleteError.message)
        }
        return
      }

      const optimistic: BeatActivationRow = {
        room_id: roomId,
        player_id: player.id,
        beat_id: beatId,
        created_at: new Date().toISOString(),
      }
      setActivations((current) => {
        const next = current.some((activation) => activation.beat_id === beatId)
          ? current
          : [...current, optimistic]
        activationsRef.current = next
        return next
      })
      const { error: insertError } = await supabase.from('beat_activations').insert({
        room_id: roomId,
        player_id: player.id,
        beat_id: beatId,
      })
      if (!insertError) return

      if (insertError.code === '23505') {
        const { data: canonical, error: canonicalError } = await supabase
          .from('beat_activations')
          .select()
          .eq('room_id', roomId)
          .eq('beat_id', beatId)
          .maybeSingle()
        if (!canonicalError && canonical?.player_id === player.id) {
          setActivations((current) => {
            const next = current.map((activation) => (
              activation.beat_id === beatId ? canonical as BeatActivationRow : activation
            ))
            activationsRef.current = next
            return next
          })
          return
        }
      }

      setActivations((current) => {
        const next = current.filter((activation) => activation.beat_id !== beatId)
        activationsRef.current = next
        return next
      })
      setActionError(insertError.message)
    } finally {
      togglingRef.current.delete(beatId)
    }
  }

  async function hostAdvance(): Promise<void> {
    if (
      !roomId
      || !room
      || !player?.is_host
      || room.phase !== 'confidence'
      || isLoading
      || syncError != null
      || advancingRef.current
    ) return

    if (!operatorAuthority.enabled || !operatorCapability) {
      setActionError(operatorAuthority.message ?? 'Current operator authority is required.')
      return
    }

    advancingRef.current = true
    setIsAdvancing(true)
    setActionError(null)
    try {
      const { data, error: advanceError } = await supabase.rpc('open_room_live_authorized', {
        p_room_id: roomId,
        p_actor_player_id: player.id,
        p_operator_capability: operatorCapability,
      })
      if (advanceError) throw advanceError
      if (!data) throw new Error('The room phase changed before the show could start. Refresh and try again.')
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

  const entitiesById = new Map(entities.map((entity) => [entity.id, entity]))
  const beatsByEntityId = new Map<string, SignatureBeatRow[]>()
  for (const beat of beats) {
    if (beat.partner_entity_id != null) continue
    beatsByEntityId.set(beat.entity_id, [...(beatsByEntityId.get(beat.entity_id) ?? []), beat])
  }
  const activatedIds = new Set(activations.map((activation) => activation.beat_id))
  const myEntityIds = picks.filter((pick) => pick.player_id === player?.id).map((pick) => pick.entity_id)
  const myEntities = myEntityIds.flatMap((id) => entitiesById.get(id) ?? [])
  const characters = myEntities
    .filter((entity) => entity.type === 'person')
    .map((entity) => ({
      entity,
      beats: beatsByEntityId.get(entity.id) ?? [],
      activatedBeatIds: new Set((beatsByEntityId.get(entity.id) ?? []).filter((beat) => activatedIds.has(beat.id)).map((beat) => beat.id)),
    }))
  const dragonEntity = myEntities.find((entity) => entity.type === 'film') ?? null
  const dragon = dragonEntity
    ? { entity: dragonEntity, beats: beatsByEntityId.get(dragonEntity.id) ?? [], alwaysActive: true as const }
    : null

  const progress = players.map((roomPlayer) => {
    const draftedCharacterIds = picks
      .filter((pick) => pick.player_id === roomPlayer.id && entitiesById.get(pick.entity_id)?.type === 'person')
      .map((pick) => pick.entity_id)
    const characterIds = new Set(draftedCharacterIds)
    const activatedCount = activations.filter((activation) => {
      if (activation.player_id !== roomPlayer.id) return false
      const beat = beats.find((candidate) => candidate.id === activation.beat_id)
      return beat != null && beat.partner_entity_id == null && characterIds.has(beat.entity_id)
    }).length
    return { player: roomPlayer, activatedCount, requiredCount: draftedCharacterIds.length * 3 }
  })
  const myProgress = progress.find((entry) => entry.player.id === player?.id)

  return {
    characters,
    dragon,
    progress,
    myActivatedCount: myProgress?.activatedCount ?? 0,
    myRequiredCount: myProgress?.requiredCount ?? characters.length * 3,
    allComplete: progress.length > 0 && progress.every((entry) => entry.activatedCount === entry.requiredCount),
    isLoading,
    syncError,
    actionError,
    isAdvancing,
    toggle,
    hostAdvance,
    retrySync,
  }
}
