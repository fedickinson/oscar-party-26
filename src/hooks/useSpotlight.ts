/**
 * useSpotlight — manages the category spotlight flow.
 *
 * The spotlight is driven by rooms.active_spotlight_category_id.
 * When the host opens a spotlight, they write to this column;
 * useRoomSubscription propagates it to all clients via Realtime.
 *
 * This hook:
 *   - Reads spotlightCategoryId from room state
 *   - Fetches category_nominees for the active spotlight category
 *   - Provides openSpotlight / closeSpotlight / confirmSpotlightWinner actions
 *
 * confirmSpotlightWinner replicates the useAdmin.setWinner cascade
 * (room_winners upsert + confidence_picks is_correct updates) without
 * importing useAdmin (which would create duplicate Realtime channels).
 */

import { useEffect, useRef, useState } from 'react'
import { useGame } from '../context/GameContext'
import { supabase } from '../lib/supabase'

export function useSpotlight() {
  const { room } = useGame()
  const roomId = room?.id
  const spotlightCategoryId = room?.active_spotlight_category_id ?? null

  const [spotlightNomineeIds, setSpotlightNomineeIds] = useState<string[]>([])
  const isConfirmingRef = useRef(false)

  // Fetch nominee ids for the active spotlight category
  useEffect(() => {
    if (!spotlightCategoryId) {
      setSpotlightNomineeIds([])
      return
    }

    supabase
      .from('category_nominees')
      .select('nominee_id')
      .eq('category_id', spotlightCategoryId)
      .then(({ data }) => {
        setSpotlightNomineeIds(data?.map((r) => r.nominee_id) ?? [])
      })
  }, [spotlightCategoryId])

  async function openSpotlight(categoryId: number): Promise<void> {
    if (!roomId) return
    await supabase
      .from('rooms')
      .update({ active_spotlight_category_id: categoryId })
      .eq('id', roomId)
  }

  async function closeSpotlight(): Promise<void> {
    if (!roomId) return
    await supabase
      .from('rooms')
      .update({ active_spotlight_category_id: null })
      .eq('id', roomId)
  }

  async function confirmSpotlightWinner(nomineeId: string): Promise<void> {
    if (!roomId || !spotlightCategoryId || isConfirmingRef.current) return
    isConfirmingRef.current = true
    try {
      // 1. Upsert the per-room winner record (single winner, clear any tie)
      await supabase.from('room_winners').upsert({
        room_id: roomId,
        category_id: spotlightCategoryId,
        winner_id: nomineeId,
        tie_winner_id: null,
      })

      // 2a. Mark correct picks
      await supabase
        .from('confidence_picks')
        .update({ is_correct: true })
        .eq('category_id', spotlightCategoryId)
        .eq('nominee_id', nomineeId)
        .eq('room_id', roomId)

      // 2b. Mark incorrect picks
      await supabase
        .from('confidence_picks')
        .update({ is_correct: false })
        .eq('category_id', spotlightCategoryId)
        .neq('nominee_id', nomineeId)
        .eq('room_id', roomId)

      // Keep spotlight open so reveal animation plays — host closes manually
      // or opens next spotlight
    } finally {
      isConfirmingRef.current = false
    }
  }

  async function confirmSpotlightTieWinner(nomineeId1: string, nomineeId2: string): Promise<void> {
    if (!roomId || !spotlightCategoryId || isConfirmingRef.current) return
    isConfirmingRef.current = true
    try {
      // 1. Upsert with both winners
      await supabase.from('room_winners').upsert({
        room_id: roomId,
        category_id: spotlightCategoryId,
        winner_id: nomineeId1,
        tie_winner_id: nomineeId2,
      })

      // 2a. Mark correct picks for first winner
      await supabase
        .from('confidence_picks')
        .update({ is_correct: true })
        .eq('category_id', spotlightCategoryId)
        .eq('nominee_id', nomineeId1)
        .eq('room_id', roomId)

      // 2b. Mark correct picks for second winner
      await supabase
        .from('confidence_picks')
        .update({ is_correct: true })
        .eq('category_id', spotlightCategoryId)
        .eq('nominee_id', nomineeId2)
        .eq('room_id', roomId)

      // 2c. Mark incorrect picks — neither winner
      await supabase
        .from('confidence_picks')
        .update({ is_correct: false })
        .eq('category_id', spotlightCategoryId)
        .neq('nominee_id', nomineeId1)
        .neq('nominee_id', nomineeId2)
        .eq('room_id', roomId)
    } finally {
      isConfirmingRef.current = false
    }
  }

  return {
    isSpotlightActive: spotlightCategoryId != null,
    spotlightCategoryId,
    spotlightNomineeIds,
    openSpotlight,
    closeSpotlight,
    confirmSpotlightWinner,
    confirmSpotlightTieWinner,
  }
}
