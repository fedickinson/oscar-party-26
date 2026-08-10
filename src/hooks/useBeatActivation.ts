import { useEffect, useRef, useState } from 'react'
import { useGame } from '../context/GameContext'
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
  error: string | null
  toggle: (beatId: number) => Promise<void>
  hostAdvance: () => Promise<void>
}

export function useBeatActivation(roomId: string | undefined): BeatActivationState {
  const { player, setRoom } = useGame()
  const [picks, setPicks] = useState<DraftPickRow[]>([])
  const [entities, setEntities] = useState<DraftEntityRow[]>([])
  const [beats, setBeats] = useState<SignatureBeatRow[]>([])
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [activations, setActivations] = useState<BeatActivationRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const activationsRef = useRef<BeatActivationRow[]>([])
  const beatsRef = useRef<SignatureBeatRow[]>([])
  const picksRef = useRef<DraftPickRow[]>([])
  const entitiesRef = useRef<DraftEntityRow[]>([])
  const togglingRef = useRef<Set<number>>(new Set())
  const deletedDuringLoadRef = useRef<Set<number>>(new Set())

  useEffect(() => { activationsRef.current = activations }, [activations])
  useEffect(() => { beatsRef.current = beats }, [beats])
  useEffect(() => { picksRef.current = picks }, [picks])
  useEffect(() => { entitiesRef.current = entities }, [entities])

  useEffect(() => {
    if (!roomId) return
    let cancelled = false

    const channel = supabase
      .channel(`beat-activation:${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'beat_activations', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const row = payload.new as BeatActivationRow
          deletedDuringLoadRef.current.delete(row.beat_id)
          setActivations((prev) => {
            const next = prev.some((a) => a.beat_id === row.beat_id) ? prev : [...prev, row]
            activationsRef.current = next
            return next
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'beat_activations', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const row = payload.old as Partial<BeatActivationRow>
          if (row.beat_id == null) return
          deletedDuringLoadRef.current.add(row.beat_id)
          setActivations((prev) => {
            const next = prev.filter((a) => a.beat_id !== row.beat_id)
            activationsRef.current = next
            return next
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => setRoom(payload.new as RoomRow),
      )
      .subscribe()

    async function load() {
      const [pickRes, entityRes, beatRes, playerRes, activationRes, roomRes] = await Promise.all([
        supabase.from('draft_picks').select().eq('room_id', roomId!),
        supabase.from('draft_entities').select(),
        supabase.from('signature_beats').select().order('points', { ascending: false }),
        supabase.from('players').select().eq('room_id', roomId!).order('created_at'),
        supabase.from('beat_activations').select().eq('room_id', roomId!),
        supabase.from('rooms').select().eq('id', roomId!).maybeSingle(),
      ])
      if (cancelled) return

      const firstError = [pickRes.error, entityRes.error, beatRes.error, playerRes.error, activationRes.error, roomRes.error]
        .find(Boolean)
      if (firstError) setError(firstError.message)

      const fetchedActivations = ((activationRes.data ?? []) as BeatActivationRow[])
        .filter((row) => !deletedDuringLoadRef.current.has(row.beat_id))
      setPicks((pickRes.data ?? []) as DraftPickRow[])
      setEntities((entityRes.data ?? []) as DraftEntityRow[])
      setBeats((beatRes.data ?? []) as SignatureBeatRow[])
      setPlayers((playerRes.data ?? []) as PlayerRow[])
      setActivations((prev) => {
        const merged = new Map<number, BeatActivationRow>()
        for (const row of fetchedActivations) merged.set(row.beat_id, row)
        for (const row of prev) merged.set(row.beat_id, row)
        const next = [...merged.values()]
        activationsRef.current = next
        return next
      })
      if (roomRes.data) setRoom(roomRes.data as RoomRow)
      setIsLoading(false)
    }

    void load()
    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [roomId, setRoom])

  async function toggle(beatId: number): Promise<void> {
    if (!roomId || !player || togglingRef.current.has(beatId)) return
    const beat = beatsRef.current.find((candidate) => candidate.id === beatId)
    if (!beat || beat.partner_entity_id != null) return

    const myEntityIds = new Set(
      picksRef.current.filter((pick) => pick.player_id === player.id).map((pick) => pick.entity_id),
    )
    const entity = entitiesRef.current.find((candidate) => candidate.id === beat.entity_id)
    if (!entity || entity.type !== 'person' || !myEntityIds.has(entity.id)) return

    const existing = activationsRef.current.find((activation) => activation.beat_id === beatId)
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
    setError(null)
    if (existing) {
      setActivations((prev) => {
        const next = prev.filter((activation) => activation.beat_id !== beatId)
        activationsRef.current = next
        return next
      })
      const { error: deleteError } = await supabase
        .from('beat_activations')
        .delete()
        .eq('room_id', roomId)
        .eq('beat_id', beatId)
      if (deleteError) {
        setActivations((prev) => {
          const next = prev.some((activation) => activation.beat_id === beatId) ? prev : [...prev, existing]
          activationsRef.current = next
          return next
        })
        setError(deleteError.message)
      }
    } else {
      const optimistic: BeatActivationRow = {
        room_id: roomId,
        player_id: player.id,
        beat_id: beatId,
        created_at: new Date().toISOString(),
      }
      setActivations((prev) => {
        const next = [...prev, optimistic]
        activationsRef.current = next
        return next
      })
      const { error: insertError } = await supabase.from('beat_activations').insert({
        room_id: roomId,
        player_id: player.id,
        beat_id: beatId,
      })
      if (insertError) {
        // 23505 = the row already exists — an earlier tap landed but this
        // client missed the realtime echo (phones suspend sockets in the
        // background). The beat IS active; rolling back the optimistic state
        // made the checkbox "instantly un-pick" while the DB disagreed. Keep it.
        if (insertError.code === '23505') {
          /* already active — optimistic state is correct */
        } else {
          setActivations((prev) => {
            const next = prev.filter((activation) => activation.beat_id !== beatId)
            activationsRef.current = next
            return next
          })
          setError(insertError.message)
        }
      }
    }
    togglingRef.current.delete(beatId)
  }

  async function hostAdvance(): Promise<void> {
    if (!roomId || !player?.is_host) return
    const { error: advanceError } = await supabase
      .from('rooms')
      .update({ phase: 'live' })
      .eq('id', roomId)
    if (advanceError) setError(advanceError.message)
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
    error,
    toggle,
    hostAdvance,
  }
}
