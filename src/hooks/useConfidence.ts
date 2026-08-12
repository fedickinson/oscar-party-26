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
import { useOperatorAuthority } from '../context/OperatorAuthorityContext'
import { filterPrestigeCategories, getConfidenceRange } from '../lib/mode-utils'
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
  syncError: string | null
  assignNominee: (categoryId: number, nomineeId: string) => void
  assignConfidence: (categoryId: number, confidence: number) => void
  setLocalPicksDirectly: (picks: LocalPicksMap) => void
  submitPicks: () => Promise<void>
  lockPicks: () => Promise<void>
  retrySync: () => void
}

export function useConfidence(roomId: string | undefined): ConfidenceState {
  const { room, player, players } = useGame()
  const { capability: operatorCapability, authority: operatorAuthority } = useOperatorAuthority()
  const [categories, setCategories] = useState<CategoryWithNominees[]>([])
  const [localPicks, setLocalPicks] = useState<LocalPicksMap>({})
  const [allSubmittedPicks, setAllSubmittedPicks] = useState<ConfidencePickRow[]>([])
  const [categoriesLoading, setCategoriesLoading] = useState(true)
  const [submittedPicksLoading, setSubmittedPicksLoading] = useState(true)
  const [categoriesError, setCategoriesError] = useState<string | null>(null)
  const [submittedPicksError, setSubmittedPicksError] = useState<string | null>(null)
  const [retryVersion, setRetryVersion] = useState(0)
  const submittingRef = useRef(false)
  const catalogScopeRef = useRef<string | null>(null)

  const isLoading = categoriesLoading || submittedPicksLoading
  const syncError = categoriesError ?? submittedPicksError

  // ── Fetch categories + nominees ─────────────────────────────────────────────

  useEffect(() => {
    if (!roomId || !room) {
      setCategories([])
      setLocalPicks({})
      setCategoriesError(null)
      setCategoriesLoading(false)
      return
    }
    let cancelled = false
    const catalogScope = `${roomId}:${room.show_pack_id}:${room.prestige_mode}`
    const catalogScopeChanged = catalogScopeRef.current !== catalogScope
    catalogScopeRef.current = catalogScope
    if (catalogScopeChanged) {
      setCategories([])
      setLocalPicks({})
    }
    setCategoriesLoading(true)
    setCategoriesError(null)

    async function fetchCategories() {
      const { data, error } = await supabase
        .from('categories')
        .select(`
          *,
          category_nominees (
            nominees (*)
          )
        `)
        .eq('show_pack_id', room!.show_pack_id)
        .order('display_order')
      if (error) throw error
      if (cancelled) return

      // Flatten nested join result into CategoryWithNominees shape
      const hydrated: CategoryWithNominees[] = ((data ?? []) as any[]).map((cat) => ({
        ...cat,
        nominees: (cat.category_nominees as any[])
          .map((cn: any) => cn.nominees)
          .filter(Boolean),
      }))
      const prestigeMode = room?.prestige_mode ?? 'full'

      // Only events with a real slate belong on the prediction sheet.
      //
      // Authored predictions are selected by show_pack_id. Game Master
      // declarations carry room_id instead, so they cannot enter this query.
      //
      // Keep the slate-shape check as a second safety boundary: a prediction
      // must still offer an actual choice rather than one pre-resolved entity.
      const predictable = hydrated.filter((cat) => cat.nominees.length >= 2)
      const filtered = filterPrestigeCategories(predictable as any, prestigeMode) as CategoryWithNominees[]
      setCategories(filtered)

      // Pre-allocate empty local pick slots for each category
      setLocalPicks((current) => {
        const initial: LocalPicksMap = {}
        filtered.forEach((cat) => {
          initial[cat.id] = catalogScopeChanged
            ? { nominee_id: null, confidence: null }
            : (current[cat.id] ?? { nominee_id: null, confidence: null })
        })
        return initial
      })

      setCategoriesLoading(false)
    }

    void fetchCategories().catch((loadError) => {
      if (cancelled) return
      console.error('Confidence catalog load failed:', loadError)
      setCategoriesError('The prediction catalog could not be loaded.')
      setCategoriesLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [roomId, room?.show_pack_id, room?.prestige_mode, retryVersion])

  // ── Fetch + subscribe to submitted picks ────────────────────────────────────

  useEffect(() => {
    if (!roomId) {
      setAllSubmittedPicks([])
      setSubmittedPicksError(null)
      setSubmittedPicksLoading(false)
      return
    }

    let disposed = false
    let liveRevision = 0
    let hydrationRun = 0
    setAllSubmittedPicks([])
    setSubmittedPicksLoading(true)
    setSubmittedPicksError(null)

    const hydrateSubmittedPicks = async () => {
      const run = ++hydrationRun
      setSubmittedPicksLoading(true)
      setSubmittedPicksError(null)

      try {
        while (!disposed && run === hydrationRun) {
          const revisionAtStart = liveRevision
          const { data, error } = await supabase
            .from('confidence_picks')
            .select()
            .eq('room_id', roomId)
          if (error) throw error
          if (disposed || run !== hydrationRun) return
          if (liveRevision !== revisionAtStart) continue

          setAllSubmittedPicks((data ?? []) as ConfidencePickRow[])
          setSubmittedPicksLoading(false)
          return
        }
      } catch (loadError) {
        if (disposed || run !== hydrationRun) return
        console.error('Confidence submission load failed:', loadError)
        setSubmittedPicksError('Submitted picks could not be synchronized.')
        setSubmittedPicksLoading(false)
      }
    }

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
          if (disposed) return
          liveRevision += 1
          setAllSubmittedPicks((prev) => {
            if (prev.some((p) => p.id === payload.new.id)) return prev
            return [...prev, payload.new as ConfidencePickRow]
          })
        },
      )
      .subscribe((status) => {
        if (disposed) return
        if (status === 'SUBSCRIBED') {
          void hydrateSubmittedPicks()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          hydrationRun += 1
          setSubmittedPicksError('The submission feed could not connect to Realtime.')
          setSubmittedPicksLoading(false)
        }
      })

    return () => {
      disposed = true
      hydrationRun += 1
      supabase.removeChannel(channel)
    }
  }, [roomId, retryVersion])

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

  // `categories` is already filtered to the events in play, so the budget and
  // the event count can never drift apart.
  const confidenceRange = getConfidenceRange(categories.length)
  const availableConfidenceNumbers = Array.from({ length: confidenceRange }, (_, i) => i + 1).filter(
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

    // Only include categories with nominees — empty nominee_id violates the FK.
    // Use first nominee as fallback for any unselected categories.
    const rows: ConfidencePickInsert[] = categories
      .filter((cat) => cat.nominees.length > 0)
      .map((cat, i) => ({
        room_id: roomId,
        player_id: player.id,
        category_id: cat.id,
        nominee_id: localPicks[cat.id]?.nominee_id ?? cat.nominees[0].id,
        confidence: localPicks[cat.id]?.confidence ?? i + 1,
      }))

    try {
      const { data, error } = await supabase.from('confidence_picks').insert(rows).select()
      if (error) throw new Error(error.message)

      // The submitting phone should become read-only immediately; Realtime
      // echoes are confirmation and dedupe by row id on every client.
      const inserted = (data ?? []) as ConfidencePickRow[]
      setAllSubmittedPicks((current) => {
        const byId = new Map(current.map((pick) => [pick.id, pick]))
        inserted.forEach((pick) => byId.set(pick.id, pick))
        return [...byId.values()]
      })
    } finally {
      submittingRef.current = false
    }
  }

  async function lockPicks() {
    if (!roomId || !room || !player?.is_host) return
    if (!operatorAuthority.enabled || !operatorCapability) {
      throw new Error(operatorAuthority.message ?? 'Current operator authority is required.')
    }

    const unsubmittedPlayers = players.filter((p) => !submittedPlayerIds.has(p.id))

    const range = getConfidenceRange(categories.length)
    for (const p of unsubmittedPlayers) {
      // Random confidence assignment for auto-fill
      const shuffled = Array.from({ length: range }, (_, i) => i + 1).sort(
        () => Math.random() - 0.5,
      )
      // Only include categories that have at least one nominee so we don't
      // insert rows with an empty-string nominee_id (which violates the FK).
      const rows: ConfidencePickInsert[] = categories
        .filter((cat) => cat.nominees.length > 0)
        .map((cat, i) => ({
          room_id: roomId,
          player_id: p.id,
          category_id: cat.id,
          nominee_id: cat.nominees[0].id,
          confidence: shuffled[i],
        }))
      if (rows.length > 0) {
        const { error } = await supabase.from('confidence_picks').insert(rows)
        // If auto-fill insert fails, abort rather than advancing the phase
        // and leaving this player without picks.
        if (error) throw new Error(`Auto-fill failed for ${p.name}: ${error.message}`)
      }
    }

    const { error } = await supabase.rpc('open_room_live_authorized', {
      p_room_id: roomId,
      p_actor_player_id: player.id,
      p_operator_capability: operatorCapability,
    })
    if (error) throw new Error(`Could not start the show: ${error.message}`)
  }

  function setLocalPicksDirectly(picks: LocalPicksMap) {
    setLocalPicks(picks)
  }

  function retrySync() {
    setCategoriesLoading(true)
    setSubmittedPicksLoading(true)
    setCategoriesError(null)
    setSubmittedPicksError(null)
    setRetryVersion((current) => current + 1)
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
    syncError,
    assignNominee,
    assignConfidence,
    setLocalPicksDirectly,
    submitPicks,
    lockPicks,
    retrySync,
  }
}
