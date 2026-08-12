/**
 * useAdmin — host-only actions for the live scoring phase.
 *
 * setWinner CASCADE (the full scoring chain):
 *   1. Call the capability-gated, room-locked scheduled-winner command.
 *   2. The command inserts room_winners; its database trigger derives every
 *      confidence outcome in the same transaction.
 *   3. Every client's room_winners subscription fires (filtered by room_id),
 *      categories state receives the result, and scores recompute.
 *
 * TIE HANDLING:
 *   setTieWinner(categoryId, nomineeId1, nomineeId2) stores both winner_id and
 *   tie_winner_id. Confidence picks matching EITHER nominee earn full points.
 *
 * UNDO WINDOW:
 *   30 seconds from the setWinner call. Tracked as a timestamp per category.
 *   undoWinner() calls a compare-and-delete command; the same trigger resets
 *   confidence outcomes to null in that transaction.
 *
 * Bingo is a separate self-serve, player-owned command path; this hook never
 * adjudicates marks.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useGame } from '../context/GameContext'
import { fetchAllRows } from './fetch-all-rows'
import type { CategoryWithNominees } from '../types/game'
import type { CategoryRow, NomineeRow, RoomWinnerRow } from '../types/database'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdminState {
  categories: CategoryWithNominees[]
  /** categoryId -> unix ms when winner was set. Used to compute undo eligibility. */
  winnerSetAt: Record<number, number>
  isLoading: boolean
  syncError: string | null
  retrySync: () => void
  setWinner: (categoryId: number, nomineeId: string) => Promise<void>
  setTieWinner: (categoryId: number, nomineeId1: string, nomineeId2: string) => Promise<void>
  undoWinner: (categoryId: number) => Promise<void>
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAdmin(
  roomId: string | undefined,
  operatorCapability: string | null,
): AdminState {
  const { room, player } = useGame()
  const [categories, setCategories] = useState<CategoryWithNominees[]>([])
  const [winnerSetAt, setWinnerSetAt] = useState<Record<number, number>>({})
  const [loadingState, setLoadingState] = useState(true)
  const [syncErrorState, setSyncErrorState] = useState<string | null>(null)
  const [retryVersion, setRetryVersion] = useState(0)
  const activeScopeRef = useRef<string | null>(null)
  const canWriteRef = useRef(false)

  // Guard against double-tapping winner selection
  const settingRef = useRef(false)

  const showPackId = room?.show_pack_id
  const requestedScope = roomId && showPackId ? `${roomId}:${showPackId}` : null
  const isLoading = roomId != null && (
    requestedScope == null ||
    loadingState ||
    activeScopeRef.current !== requestedScope
  )
  const syncError = requestedScope != null && activeScopeRef.current === requestedScope
    ? syncErrorState
    : null

  // ── Subscribe, then hydrate one revision-clean snapshot ─────────────────────

  const REALTIME_STABILIZATION_MS = 5_000
  useEffect(() => {
    if (!roomId || !showPackId || !requestedScope) {
      activeScopeRef.current = null
      canWriteRef.current = false
      setCategories([])
      setWinnerSetAt({})
      setLoadingState(roomId != null)
      setSyncErrorState(null)
      return
    }

    activeScopeRef.current = requestedScope
    canWriteRef.current = false
    let disposed = false
    let subscribed = false
    let liveRevision = 0
    let hydrationRun = 0
    let stabilizationTimer: ReturnType<typeof setTimeout> | null = null
    setCategories([])
    setWinnerSetAt({})
    setLoadingState(true)
    setSyncErrorState(null)

    type CategoryWithJoin = CategoryRow & {
      category_nominees: Array<{ nominees: NomineeRow | null }>
    }

    const applyWinner = (winner: RoomWinnerRow) => {
      setCategories((current) => current.map((category) => (
        category.id === winner.category_id
          ? {
              ...category,
              winner_id: winner.winner_id,
              tie_winner_id: winner.tie_winner_id,
            }
          : category
      )))
    }

    const clearWinner = (categoryId: number) => {
      setCategories((current) => current.map((category) => (
        category.id === categoryId
          ? { ...category, winner_id: null, tie_winner_id: null }
          : category
      )))
    }

    const hydrateAdmin = async (showLoading = true) => {
      const run = ++hydrationRun
      if (showLoading) {
        canWriteRef.current = false
        setLoadingState(true)
        setSyncErrorState(null)
      }

      try {
        while (!disposed && run === hydrationRun) {
          const revisionAtStart = liveRevision
          const [categoryResult, winnerResult] = await Promise.all([
            fetchAllRows<CategoryWithJoin>((from, to) => supabase
              .from('categories')
              .select('*, category_nominees(nominees(*))')
              .eq('show_pack_id', showPackId)
              .order('display_order')
              .order('id')
              .range(from, to)),
            fetchAllRows<RoomWinnerRow>((from, to) => supabase
              .from('room_winners')
              .select()
              .eq('room_id', roomId)
              .order('category_id')
              .range(from, to)),
          ])
          if (categoryResult.error) throw categoryResult.error
          if (winnerResult.error) throw winnerResult.error
          if (disposed || run !== hydrationRun) return
          if (liveRevision !== revisionAtStart) continue

          const winnerMap = new Map<number, RoomWinnerRow>(
            (winnerResult.data ?? []).map((winner) => [
              winner.category_id,
              winner,
            ]),
          )
          const hydrated = (categoryResult.data ?? []).map((category) => {
            const winner = winnerMap.get(category.id)
            const { category_nominees: categoryNominees, ...row } = category
            return {
              ...row,
              winner_id: winner?.winner_id ?? null,
              tie_winner_id: winner?.tie_winner_id ?? null,
              nominees: categoryNominees
                .map((link) => link.nominees)
                .filter((nominee): nominee is NomineeRow => nominee != null),
            }
          })

          setCategories(hydrated)
          canWriteRef.current = true
          setSyncErrorState(null)
          setLoadingState(false)
          return
        }
      } catch (loadError) {
        if (disposed || run !== hydrationRun) return
        console.error('Winner slate synchronization failed:', loadError)
        canWriteRef.current = false
        setSyncErrorState('The winner slate could not be synchronized.')
        setLoadingState(false)
      }
    }

    const channel = supabase
      .channel(`admin-room-winners:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'room_winners',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          if (disposed) return
          liveRevision += 1
          const rw = payload.new as RoomWinnerRow
          applyWinner(rw)
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'room_winners',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          if (disposed) return
          liveRevision += 1
          const rw = payload.new as RoomWinnerRow
          applyWinner(rw)
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'room_winners',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          if (disposed) return
          liveRevision += 1
          const rw = payload.old as Partial<RoomWinnerRow>
          if (rw.category_id == null) return
          clearWinner(rw.category_id)
        },
      )
      .subscribe((status) => {
        if (disposed) return
        if (status === 'SUBSCRIBED') {
          subscribed = true
          void hydrateAdmin()
          if (stabilizationTimer) clearTimeout(stabilizationTimer)
          stabilizationTimer = setTimeout(() => {
            if (!disposed && subscribed) void hydrateAdmin(false)
          }, REALTIME_STABILIZATION_MS)
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          subscribed = false
          hydrationRun += 1
          canWriteRef.current = false
          setSyncErrorState('The winner feed could not connect to Realtime.')
          setLoadingState(false)
        }
      })

    return () => {
      disposed = true
      subscribed = false
      hydrationRun += 1
      canWriteRef.current = false
      if (stabilizationTimer) clearTimeout(stabilizationTimer)
      void supabase.removeChannel(channel)
    }
  }, [roomId, showPackId, requestedScope, retryVersion])

  const retrySync = useCallback(() => {
    canWriteRef.current = false
    setLoadingState(true)
    setSyncErrorState(null)
    setRetryVersion((current) => current + 1)
  }, [])

  // ── setWinner ────────────────────────────────────────────────────────────────

  async function setWinner(categoryId: number, nomineeId: string): Promise<void> {
    if (!roomId) throw new Error('The room must be restored before a result can be declared.')
    if (settingRef.current) return
    if (!player) throw new Error('The host seat must be restored before a result can be declared.')
    if (!operatorCapability) throw new Error('Current operator authority is required before a result can be declared.')
    if (!canWriteRef.current) {
      throw new Error('The winner slate must finish synchronizing before a result can be declared.')
    }
    settingRef.current = true

    try {
      const { error } = await supabase.rpc('declare_scheduled_winner_authorized', {
        p_room_id: roomId,
        p_category_id: categoryId,
        p_winner_id: nomineeId,
        p_tie_winner_id: null,
        p_actor_player_id: player.id,
        p_operator_capability: operatorCapability,
      })
      if (error) throw new Error(error.message)
      setWinnerSetAt((prev) => ({ ...prev, [categoryId]: Date.now() }))
    } finally {
      settingRef.current = false
    }
  }

  // ── setTieWinner ───────────────────────────────────────────────────────────────

  async function setTieWinner(categoryId: number, nomineeId1: string, nomineeId2: string): Promise<void> {
    if (!roomId) throw new Error('The room must be restored before a result can be declared.')
    if (settingRef.current) return
    if (!player) throw new Error('The host seat must be restored before a result can be declared.')
    if (!operatorCapability) throw new Error('Current operator authority is required before a result can be declared.')
    if (!canWriteRef.current) {
      throw new Error('The winner slate must finish synchronizing before a result can be declared.')
    }
    settingRef.current = true

    try {
      const { error } = await supabase.rpc('declare_scheduled_winner_authorized', {
        p_room_id: roomId,
        p_category_id: categoryId,
        p_winner_id: nomineeId1,
        p_tie_winner_id: nomineeId2,
        p_actor_player_id: player.id,
        p_operator_capability: operatorCapability,
      })
      if (error) throw new Error(error.message)
      setWinnerSetAt((prev) => ({ ...prev, [categoryId]: Date.now() }))
    } finally {
      settingRef.current = false
    }
  }

  // ── undoWinner ───────────────────────────────────────────────────────────────

  async function undoWinner(categoryId: number): Promise<void> {
    if (!roomId) throw new Error('The room must be restored before a result can be undone.')
    if (settingRef.current) return
    if (!player) throw new Error('The host seat must be restored before a result can be undone.')
    if (!operatorCapability) throw new Error('Current operator authority is required before a result can be undone.')
    if (!canWriteRef.current) {
      throw new Error('The winner slate must finish synchronizing before a result can be undone.')
    }

    const setAt = winnerSetAt[categoryId]
    if (!setAt || Date.now() - setAt > 30_000) return
    const current = categories.find((category) => category.id === categoryId)
    if (!current?.winner_id) return

    settingRef.current = true
    try {
      const { error } = await supabase.rpc('undo_scheduled_winner_authorized', {
        p_room_id: roomId,
        p_category_id: categoryId,
        p_expected_winner_id: current.winner_id,
        p_expected_tie_winner_id: current.tie_winner_id,
        p_actor_player_id: player.id,
        p_operator_capability: operatorCapability,
      })
      if (error) throw new Error(error.message)

      setWinnerSetAt((prev) => {
        const next = { ...prev }
        delete next[categoryId]
        return next
      })
    } finally {
      settingRef.current = false
    }
  }

  return {
    categories,
    winnerSetAt,
    isLoading,
    syncError,
    retrySync,
    setWinner,
    setTieWinner,
    undoWinner,
  }
}
