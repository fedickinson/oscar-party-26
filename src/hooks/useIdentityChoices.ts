import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { PlayerIdentitySelectionRow } from '../types/database'

export interface IdentityChoicesState {
  options: string[]
  selections: PlayerIdentitySelectionRow[]
  isLoading: boolean
  syncError: string | null
  choose: (playerId: string, choiceKey: string) => Promise<void>
  retrySync: () => void
}

/** Shared pack identity choices. The database admits only lobby or live writes.
 * Subscribe first, then hydrate so a transition cannot fall between them. */
export function useIdentityChoices(
  roomId: string | undefined,
  showPackId: string | undefined,
  active: boolean,
): IdentityChoicesState {
  const [options, setOptions] = useState<string[]>([])
  const [selections, setSelections] = useState<PlayerIdentitySelectionRow[]>([])
  const [loadingState, setLoadingState] = useState(active)
  const [syncErrorState, setSyncErrorState] = useState<string | null>(null)
  const [retryVersion, setRetryVersion] = useState(0)
  const activeScopeRef = useRef<string | null>(null)

  const requestedScope = active && roomId && showPackId ? `${roomId}:${showPackId}` : null
  const isLoading = requestedScope != null && (
    loadingState || requestedScope !== activeScopeRef.current
  )
  const syncError = requestedScope != null && requestedScope === activeScopeRef.current
    ? syncErrorState
    : null

  useEffect(() => {
    if (!active || !roomId || !showPackId) {
      activeScopeRef.current = null
      setOptions([])
      setSelections([])
      setLoadingState(false)
      setSyncErrorState(null)
      return
    }

    const scope = `${roomId}:${showPackId}`
    activeScopeRef.current = scope
    let disposed = false
    let subscribed = false
    let liveRevision = 0
    let hydrationRun = 0
    let stabilizationTimer: ReturnType<typeof setTimeout> | null = null
    setLoadingState(true)
    setSyncErrorState(null)

    const upsertSelection = (row: PlayerIdentitySelectionRow) => {
      if (row.show_pack_id !== showPackId) return
      setSelections((current) => {
        const withoutPlayer = current.filter((selection) => selection.player_id !== row.player_id)
        return [...withoutPlayer, row].sort((left, right) => left.player_id.localeCompare(right.player_id))
      })
    }

    const hydrate = async () => {
      const run = ++hydrationRun
      try {
        while (!disposed && run === hydrationRun) {
          const revisionAtStart = liveRevision
          const [optionsResult, selectionsResult] = await Promise.all([
            supabase.rpc('show_pack_identity_choices', { p_show_pack_id: showPackId }),
            supabase
              .from('player_identity_selections')
              .select()
              .eq('room_id', roomId)
              .eq('show_pack_id', showPackId)
              .order('player_id'),
          ])
          if (optionsResult.error) throw optionsResult.error
          if (selectionsResult.error) throw selectionsResult.error
          if (disposed || run !== hydrationRun) return
          if (liveRevision !== revisionAtStart) continue

          const authoredOptions = (optionsResult.data as Array<{ choice_key?: unknown }> | null)
            ?.map((option) => option.choice_key)
            .filter((choice): choice is string => typeof choice === 'string' && choice.length > 0) ?? []
          if (authoredOptions.length < 2) throw new Error('The show pack has fewer than two identity choices.')
          setOptions(authoredOptions)
          setSelections((selectionsResult.data ?? []) as PlayerIdentitySelectionRow[])
          setSyncErrorState(null)
          setLoadingState(false)
          return
        }
      } catch (loadError) {
        if (disposed || run !== hydrationRun) return
        console.error('Identity choice synchronization failed:', loadError)
        setSyncErrorState('Shared identity choices could not be synchronized.')
        setLoadingState(false)
      }
    }

    const channel = supabase
      .channel(`identity-choices:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'player_identity_selections',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          if (disposed) return
          liveRevision += 1
          if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as Partial<PlayerIdentitySelectionRow>).player_id
            if (deletedId) {
              setSelections((current) => current.filter((selection) => selection.player_id !== deletedId))
            }
          } else {
            upsertSelection(payload.new as PlayerIdentitySelectionRow)
          }
        },
      )
      .subscribe((status) => {
        if (disposed) return
        if (status === 'SUBSCRIBED') {
          subscribed = true
          void hydrate()
          stabilizationTimer = setTimeout(() => {
            if (!disposed && subscribed) void hydrate()
          }, 5_000)
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          subscribed = false
          hydrationRun += 1
          setSyncErrorState('The shared identity feed could not connect to Realtime.')
          setLoadingState(false)
        }
      })

    return () => {
      disposed = true
      subscribed = false
      hydrationRun += 1
      if (stabilizationTimer) clearTimeout(stabilizationTimer)
      void supabase.removeChannel(channel)
    }
  }, [active, roomId, showPackId, retryVersion])

  const choose = useCallback(async (playerId: string, choiceKey: string) => {
    if (!active || !roomId) throw new Error('Shared identity choice is not active in this room.')
    const { data, error } = await supabase.rpc('set_player_identity_choice', {
      p_room_id: roomId,
      p_actor_player_id: playerId,
      p_choice_key: choiceKey,
    })
    if (error) throw new Error(error.message)
    if (data) {
      const row = data as PlayerIdentitySelectionRow
      setSelections((current) => [
        ...current.filter((selection) => selection.player_id !== row.player_id),
        row,
      ].sort((left, right) => left.player_id.localeCompare(right.player_id)))
    }
  }, [active, roomId])

  const retrySync = useCallback(() => {
    setLoadingState(true)
    setSyncErrorState(null)
    setRetryVersion((current) => current + 1)
  }, [])

  return { options, selections, isLoading, syncError, choose, retrySync }
}
