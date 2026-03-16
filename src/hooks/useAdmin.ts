/**
 * useAdmin — host-only actions for the live scoring phase.
 *
 * setWinner CASCADE (the full scoring chain):
 *   1. UPSERT room_winners (room_id, category_id, winner_id, tie_winner_id)
 *      -> Every client's room_winners subscription fires (filtered by room_id)
 *      -> categories state updated with per-room winner_id -> scores update
 *
 *   2. UPDATE confidence_picks SET is_correct = true
 *      WHERE category_id = categoryId AND nominee_id IN (winnerId, tieWinnerId) AND room_id = roomId
 *      UPDATE confidence_picks SET is_correct = false
 *      WHERE category_id = categoryId AND nominee_id NOT IN (...) AND room_id = roomId
 *
 * TIE HANDLING:
 *   setTieWinner(categoryId, nomineeId1, nomineeId2) stores both winner_id and
 *   tie_winner_id. Confidence picks matching EITHER nominee earn full points.
 *
 * UNDO WINDOW:
 *   30 seconds from the setWinner call. Tracked as a timestamp per category.
 *   undoWinner() deletes from room_winners and resets is_correct = null.
 *
 * BINGO APPROVALS:
 *   Moved to useBingoApprovals.ts — now handled in the Bingo tab.
 */

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { CategoryWithNominees } from '../types/game'
import type { RoomWinnerRow } from '../types/database'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdminState {
  categories: CategoryWithNominees[]
  /** categoryId -> unix ms when winner was set. Used to compute undo eligibility. */
  winnerSetAt: Record<number, number>
  isLoading: boolean
  setWinner: (categoryId: number, nomineeId: string) => Promise<void>
  setTieWinner: (categoryId: number, nomineeId1: string, nomineeId2: string) => Promise<void>
  undoWinner: (categoryId: number) => Promise<void>
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAdmin(roomId: string | undefined): AdminState {
  const [categories, setCategories] = useState<CategoryWithNominees[]>([])
  const [winnerSetAt, setWinnerSetAt] = useState<Record<number, number>>({})
  const [isLoading, setIsLoading] = useState(true)

  // Guard against double-tapping winner selection
  const settingRef = useRef(false)

  // ── Initial fetch ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!roomId) return

    async function load() {
      const [catRes, rwRes] = await Promise.all([
        supabase
          .from('categories')
          .select(`*, category_nominees(nominees(*))`)
          .order('display_order'),
        supabase
          .from('room_winners')
          .select()
          .eq('room_id', roomId!),
      ])

      if (catRes.data) {
        const winnerMap = new Map<number, { winner_id: string; tie_winner_id: string | null }>(
          (rwRes.data ?? []).map((rw: RoomWinnerRow) => [
            rw.category_id,
            { winner_id: rw.winner_id, tie_winner_id: rw.tie_winner_id },
          ]),
        )
        const hydrated: CategoryWithNominees[] = (catRes.data as any[]).map((cat) => ({
          ...cat,
          winner_id: winnerMap.get(cat.id)?.winner_id ?? null,
          tie_winner_id: winnerMap.get(cat.id)?.tie_winner_id ?? null,
          nominees: (cat.category_nominees as any[])
            .map((cn: any) => cn.nominees)
            .filter(Boolean),
        }))
        setCategories(hydrated)
      }
      setIsLoading(false)
    }

    load()
  }, [roomId])

  // ── Subscribe to room_winners (winner changes scoped to this room) ───────────

  useEffect(() => {
    if (!roomId) return

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
          const rw = payload.new as RoomWinnerRow
          setCategories((prev) =>
            prev.map((c) => (c.id === rw.category_id ? { ...c, winner_id: rw.winner_id, tie_winner_id: rw.tie_winner_id } : c)),
          )
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
          const rw = payload.new as RoomWinnerRow
          setCategories((prev) =>
            prev.map((c) => (c.id === rw.category_id ? { ...c, winner_id: rw.winner_id, tie_winner_id: rw.tie_winner_id } : c)),
          )
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
          const rw = payload.old as Partial<RoomWinnerRow>
          if (rw.category_id == null) return
          setCategories((prev) =>
            prev.map((c) => (c.id === rw.category_id ? { ...c, winner_id: null, tie_winner_id: null } : c)),
          )
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [roomId])

  // ── setWinner ────────────────────────────────────────────────────────────────

  async function setWinner(categoryId: number, nomineeId: string): Promise<void> {
    if (!roomId || settingRef.current) return
    settingRef.current = true

    try {
      // 1. Upsert the per-room winner record (single winner, clear any tie)
      const { error: rwError } = await supabase
        .from('room_winners')
        .upsert({ room_id: roomId, category_id: categoryId, winner_id: nomineeId, tie_winner_id: null })

      if (rwError) throw new Error(rwError.message)

      // 2a. Mark correct picks
      const { error: correctError } = await supabase
        .from('confidence_picks')
        .update({ is_correct: true })
        .eq('category_id', categoryId)
        .eq('nominee_id', nomineeId)
        .eq('room_id', roomId)

      if (correctError) throw new Error(correctError.message)

      // 2b. Mark incorrect picks
      const { error: wrongError } = await supabase
        .from('confidence_picks')
        .update({ is_correct: false })
        .eq('category_id', categoryId)
        .neq('nominee_id', nomineeId)
        .eq('room_id', roomId)

      if (wrongError) throw new Error(wrongError.message)

      setWinnerSetAt((prev) => ({ ...prev, [categoryId]: Date.now() }))
    } finally {
      settingRef.current = false
    }
  }

  // ── setTieWinner ───────────────────────────────────────────────────────────────

  async function setTieWinner(categoryId: number, nomineeId1: string, nomineeId2: string): Promise<void> {
    if (!roomId || settingRef.current) return
    settingRef.current = true

    try {
      // 1. Upsert the per-room winner record with both winners
      const { error: rwError } = await supabase
        .from('room_winners')
        .upsert({
          room_id: roomId,
          category_id: categoryId,
          winner_id: nomineeId1,
          tie_winner_id: nomineeId2,
        })

      if (rwError) throw new Error(rwError.message)

      // 2a. Mark correct picks — picks matching EITHER winner
      const { error: correct1Error } = await supabase
        .from('confidence_picks')
        .update({ is_correct: true })
        .eq('category_id', categoryId)
        .eq('nominee_id', nomineeId1)
        .eq('room_id', roomId)

      if (correct1Error) throw new Error(correct1Error.message)

      const { error: correct2Error } = await supabase
        .from('confidence_picks')
        .update({ is_correct: true })
        .eq('category_id', categoryId)
        .eq('nominee_id', nomineeId2)
        .eq('room_id', roomId)

      if (correct2Error) throw new Error(correct2Error.message)

      // 2b. Mark incorrect picks — picks matching NEITHER winner
      const { error: wrongError } = await supabase
        .from('confidence_picks')
        .update({ is_correct: false })
        .eq('category_id', categoryId)
        .neq('nominee_id', nomineeId1)
        .neq('nominee_id', nomineeId2)
        .eq('room_id', roomId)

      if (wrongError) throw new Error(wrongError.message)

      setWinnerSetAt((prev) => ({ ...prev, [categoryId]: Date.now() }))
    } finally {
      settingRef.current = false
    }
  }

  // ── undoWinner ───────────────────────────────────────────────────────────────

  async function undoWinner(categoryId: number): Promise<void> {
    if (!roomId) return

    const setAt = winnerSetAt[categoryId]
    if (!setAt || Date.now() - setAt > 30_000) return

    const { error: rwError } = await supabase
      .from('room_winners')
      .delete()
      .eq('room_id', roomId)
      .eq('category_id', categoryId)

    if (rwError) throw new Error(rwError.message)

    const { error: cpError } = await supabase
      .from('confidence_picks')
      .update({ is_correct: null })
      .eq('category_id', categoryId)
      .eq('room_id', roomId)

    if (cpError) throw new Error(cpError.message)

    setWinnerSetAt((prev) => {
      const next = { ...prev }
      delete next[categoryId]
      return next
    })
  }

  return { categories, winnerSetAt, isLoading, setWinner, setTieWinner, undoWinner }
}
