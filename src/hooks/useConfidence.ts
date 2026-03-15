/**
 * useConfidence — all state and actions for the confidence picks phase.
 *
 * FLOW:
 *   1. Fetches all 24 categories + their nominees (via nested select)
 *   2. Player taps nominees and assigns confidence numbers 1–24
 *   3. Each confidence number is used exactly once (implicit swap on conflict)
 *   4. submitPicks() batch-inserts 24 rows at once
 *   5. Host calls lockPicks() to auto-fill any stragglers and push phase → 'live'
 *
 * LOCAL vs SUBMITTED:
 *   localPicks = pre-submit working state (component state only)
 *   allSubmittedPicks = rows from confidence_picks table (realtime-synced)
 *
 * IMPLICIT SWAP:
 *   If the player assigns confidence number N to category A, and N is already
 *   on category B, category B gets category A's old confidence (possibly null).
 *   This means the player never has to manually "unassign" a number.
 */

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useGame } from '../context/GameContext'
import type { CategoryWithNominees } from '../types/game'
import type { ConfidencePickRow, ConfidencePickInsert } from '../types/database'

export interface LocalPick {
  nominee_id: string | null
  confidence: number | null
}

/** Keyed by category_id */
export type LocalPicksMap = Record<number, LocalPick>

export interface ConfidenceState {
  categories: CategoryWithNominees[]
  localPicks: LocalPicksMap
  allSubmittedPicks: ConfidencePickRow[]
  submittedPlayerIds: Set<string>
  isComplete: boolean
  myHasSubmitted: boolean
  availableConfidenceNumbers: number[]
  isLoading: boolean
  assignNominee: (categoryId: number, nomineeId: string) => void
  assignConfidence: (categoryId: number, confidence: number) => void
  submitPicks: () => Promise<void>
  lockPicks: () => Promise<void>
}

export function useConfidence(roomId: string | undefined): ConfidenceState {
  const { room, player, players } = useGame()
  const [categories, setCategories] = useState<CategoryWithNominees[]>([])
  const [localPicks, setLocalPicks] = useState<LocalPicksMap>({})
  const [allSubmittedPicks, setAllSubmittedPicks] = useState<ConfidencePickRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const submittingRef = useRef(false)

  // ── Fetch categories + nominees ─────────────────────────────────────────────

  useEffect(() => {
    if (!roomId) return

    async function fetchCategories() {
      const { data } = await supabase
        .from('categories')
        .select(`
          *,
          category_nominees (
            nominees (*)
          )
        `)
        .order('display_order')

      if (data) {
        // Flatten nested join result into CategoryWithNominees shape
        const hydrated: CategoryWithNominees[] = (data as any[]).map((cat) => ({
          ...cat,
          nominees: (cat.category_nominees as any[])
            .map((cn: any) => cn.nominees)
            .filter(Boolean),
        }))
        setCategories(hydrated)

        // Pre-allocate empty local pick slots for each category
        const initial: LocalPicksMap = {}
        hydrated.forEach((cat) => {
          initial[cat.id] = { nominee_id: null, confidence: null }
        })
        setLocalPicks(initial)
      }

      setIsLoading(false)
    }

    fetchCategories()
  }, [roomId])

  // ── Fetch + subscribe to submitted picks ────────────────────────────────────

  useEffect(() => {
    if (!roomId) return

    // Subscribe before initial fetch to avoid missing events during the gap
    const channel = supabase
      .channel(`confidence_picks:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'confidence_picks',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          setAllSubmittedPicks((prev) => {
            if (prev.some((p) => p.id === payload.new.id)) return prev
            return [...prev, payload.new as ConfidencePickRow]
          })
        },
      )
      .subscribe()

    supabase
      .from('confidence_picks')
      .select()
      .eq('room_id', roomId)
      .then(({ data }) => {
        if (data) setAllSubmittedPicks(data)
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId])

  // ── Derived values ──────────────────────────────────────────────────────────

  const submittedPlayerIds = new Set(allSubmittedPicks.map((p) => p.player_id))
  const myHasSubmitted = !!player && submittedPlayerIds.has(player.id)

  const isComplete =
    categories.length > 0 &&
    categories.every((cat) => {
      const pick = localPicks[cat.id]
      return pick?.nominee_id != null && pick?.confidence != null
    })

  const assignedNumbers = Object.values(localPicks)
    .map((p) => p.confidence)
    .filter((c): c is number => c != null)

  const availableConfidenceNumbers = Array.from({ length: 24 }, (_, i) => i + 1).filter(
    (n) => !assignedNumbers.includes(n),
  )

  // ── Mutators ────────────────────────────────────────────────────────────────

  function assignNominee(categoryId: number, nomineeId: string) {
    setLocalPicks((prev) => ({
      ...prev,
      [categoryId]: {
        ...prev[categoryId],
        nominee_id: prev[categoryId]?.nominee_id === nomineeId ? null : nomineeId,
      },
    }))
  }

  function assignConfidence(categoryId: number, confidence: number) {
    setLocalPicks((prev) => {
      // Find if this number is already assigned to another category
      const conflictEntry = Object.entries(prev).find(
        ([id, pick]) => pick.confidence === confidence && Number(id) !== categoryId,
      )

      if (conflictEntry) {
        // Swap: give the conflict category this category's current confidence
        const conflictId = Number(conflictEntry[0])
        const outgoingConfidence = prev[categoryId]?.confidence ?? null
        return {
          ...prev,
          [conflictId]: { ...prev[conflictId], confidence: outgoingConfidence },
          [categoryId]: { ...prev[categoryId], confidence },
        }
      }

      // Toggle off if tapping the same number already on this category
      if (prev[categoryId]?.confidence === confidence) {
        return {
          ...prev,
          [categoryId]: { ...prev[categoryId], confidence: null },
        }
      }

      return {
        ...prev,
        [categoryId]: { ...prev[categoryId], confidence },
      }
    })
  }

  async function submitPicks() {
    if (!roomId || !player || submittingRef.current || myHasSubmitted) return
    submittingRef.current = true

    // Use first nominee as fallback for any unselected categories
    const rows: ConfidencePickInsert[] = categories.map((cat, i) => ({
      room_id: roomId,
      player_id: player.id,
      category_id: cat.id,
      nominee_id: localPicks[cat.id]?.nominee_id ?? cat.nominees[0]?.id ?? '',
      confidence: localPicks[cat.id]?.confidence ?? i + 1,
    }))

    const { error } = await supabase.from('confidence_picks').insert(rows)
    submittingRef.current = false
    if (error) throw new Error(error.message)
  }

  async function lockPicks() {
    if (!roomId || !room || !player?.is_host) return

    const unsubmittedPlayers = players.filter((p) => !submittedPlayerIds.has(p.id))

    for (const p of unsubmittedPlayers) {
      // Random confidence assignment for auto-fill
      const shuffled = Array.from({ length: 24 }, (_, i) => i + 1).sort(
        () => Math.random() - 0.5,
      )
      const rows: ConfidencePickInsert[] = categories.map((cat, i) => ({
        room_id: roomId,
        player_id: p.id,
        category_id: cat.id,
        nominee_id: cat.nominees[0]?.id ?? '',
        confidence: shuffled[i],
      }))
      await supabase.from('confidence_picks').insert(rows)
    }

    await supabase.from('rooms').update({ phase: 'live' }).eq('id', roomId)
  }

  return {
    categories,
    localPicks,
    allSubmittedPicks,
    submittedPlayerIds,
    isComplete,
    myHasSubmitted,
    availableConfidenceNumbers,
    isLoading,
    assignNominee,
    assignConfidence,
    submitPicks,
    lockPicks,
  }
}
