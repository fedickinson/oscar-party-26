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
 * Winner confirmation calls the same capability-gated, room-locked database
 * command as the scheduled Events slate. Confidence correctness is a
 * database-owned projection of room_winners, not a second client write cascade.
 */

import { useEffect, useRef, useState } from 'react'
import { useGame } from '../context/GameContext'
import { supabase } from '../lib/supabase'

export function useSpotlight(operatorCapability: string | null) {
  const { room, player } = useGame()
  const roomId = room?.id
  const spotlightCategoryId = room?.active_spotlight_category_id ?? null
  const spotlightRevision = room?.spotlight_revision ?? 0

  const [spotlightNomineeIds, setSpotlightNomineeIds] = useState<string[]>([])
  const [spotlightActionError, setSpotlightActionError] = useState<string | null>(null)
  const isTransitioningRef = useRef(false)
  const isConfirmingRef = useRef(false)

  useEffect(() => {
    setSpotlightActionError(null)
  }, [roomId])

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
    if (isTransitioningRef.current) return
    if (!roomId || !player) {
      setSpotlightActionError('The host seat must be restored before a spotlight can open.')
      return
    }
    if (!operatorCapability) {
      setSpotlightActionError('Current operator authority is required before a spotlight can open.')
      return
    }

    isTransitioningRef.current = true
    setSpotlightActionError(null)
    try {
      const { error } = await supabase.rpc('open_scheduled_spotlight_authorized', {
        p_room_id: roomId,
        p_category_id: categoryId,
        p_expected_revision: spotlightRevision,
        p_actor_player_id: player.id,
        p_operator_capability: operatorCapability,
      })
      if (error) throw new Error(error.message)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The request did not complete.'
      setSpotlightActionError(`Could not open the spotlight: ${message}`)
    } finally {
      isTransitioningRef.current = false
    }
  }

  async function closeSpotlight(): Promise<void> {
    if (isTransitioningRef.current) return
    if (!roomId || !player || spotlightCategoryId == null) {
      setSpotlightActionError('The active spotlight must be restored before it can close.')
      return
    }
    if (!operatorCapability) {
      setSpotlightActionError('Current operator authority is required before the spotlight can close.')
      return
    }

    isTransitioningRef.current = true
    setSpotlightActionError(null)
    try {
      const { error } = await supabase.rpc('close_scheduled_spotlight_authorized', {
        p_room_id: roomId,
        p_expected_category_id: spotlightCategoryId,
        p_expected_revision: spotlightRevision,
        p_actor_player_id: player.id,
        p_operator_capability: operatorCapability,
      })
      if (error) throw new Error(error.message)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The request did not complete.'
      setSpotlightActionError(`Could not close the spotlight: ${message}`)
    } finally {
      isTransitioningRef.current = false
    }
  }

  async function confirmSpotlightWinner(nomineeId: string): Promise<void> {
    if (!roomId || !spotlightCategoryId) {
      throw new Error('The spotlight must be restored before a result can be declared.')
    }
    if (!player) throw new Error('The host seat must be restored before a result can be declared.')
    if (!operatorCapability) throw new Error('Current operator authority is required before a result can be declared.')
    if (isConfirmingRef.current) return
    isConfirmingRef.current = true
    try {
      const { error } = await supabase.rpc('declare_scheduled_winner_authorized', {
        p_room_id: roomId,
        p_category_id: spotlightCategoryId,
        p_winner_id: nomineeId,
        p_tie_winner_id: null,
        p_actor_player_id: player.id,
        p_operator_capability: operatorCapability,
      })
      if (error) throw new Error(error.message)
    } finally {
      isConfirmingRef.current = false
    }
  }

  async function confirmSpotlightTieWinner(nomineeId1: string, nomineeId2: string): Promise<void> {
    if (!roomId || !spotlightCategoryId) {
      throw new Error('The spotlight must be restored before a result can be declared.')
    }
    if (!player) throw new Error('The host seat must be restored before a result can be declared.')
    if (!operatorCapability) throw new Error('Current operator authority is required before a result can be declared.')
    if (isConfirmingRef.current) return
    isConfirmingRef.current = true
    try {
      const { error } = await supabase.rpc('declare_scheduled_winner_authorized', {
        p_room_id: roomId,
        p_category_id: spotlightCategoryId,
        p_winner_id: nomineeId1,
        p_tie_winner_id: nomineeId2,
        p_actor_player_id: player.id,
        p_operator_capability: operatorCapability,
      })
      if (error) throw new Error(error.message)
    } finally {
      isConfirmingRef.current = false
    }
  }

  return {
    isSpotlightActive: spotlightCategoryId != null,
    spotlightCategoryId,
    spotlightNomineeIds,
    spotlightActionError,
    clearSpotlightActionError: () => setSpotlightActionError(null),
    openSpotlight,
    closeSpotlight,
    confirmSpotlightWinner,
    confirmSpotlightTieWinner,
  }
}
