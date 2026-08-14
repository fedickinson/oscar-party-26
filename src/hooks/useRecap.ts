/**
 * useRecap -- orchestrates data fetching and PDF generation for the night's recap.
 *
 * The Results page already has leaderboard + categories + nominees + confidence picks
 * + draft picks + draft entities from useScores. This hook:
 *   1. Fetches chat messages (one-time, not realtime -- recap is a snapshot)
 *   2. Combines everything into RecapData
 *   3. Calls the pure generateRecapPDF function
 *
 * Returns { downloadRecap, isGenerating } for the UI to bind to a button.
 */

import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { generateRecapPDF } from '../lib/recap-pdf'
import { fetchAllRows } from './fetch-all-rows'
import type { RecapData } from '../lib/recap-pdf'
import type { ScoredPlayer } from '../lib/scoring'
import type { PlayerAward, CharacterAward } from '../lib/night-awards'
import type {
  CategoryRow,
  NomineeRow,
  ConfidencePickRow,
  DraftPickRow,
  DraftEntityRow,
  PlayerRow,
  MessageRow,
  PlayerVerdictRow,
} from '../types/database'

interface UseRecapArgs {
  roomId: string | undefined
  roomCode: string | undefined
  leaderboard: ScoredPlayer[]
  categories: CategoryRow[]
  nominees: NomineeRow[]
  confidencePicks: ConfidencePickRow[]
  draftPicks: DraftPickRow[]
  draftEntities: DraftEntityRow[]
  players: PlayerRow[]
  playerBingoCounts: Map<string, number>
  playerAwards?: PlayerAward[]
  characterAwards?: CharacterAward[]
  verdicts?: Map<string, PlayerVerdictRow>
  castIds?: string[]
  castIdentityReady?: boolean
}

export function useRecap({
  roomId,
  roomCode,
  leaderboard,
  categories,
  nominees,
  confidencePicks,
  draftPicks,
  draftEntities,
  players,
  playerBingoCounts,
  playerAwards,
  characterAwards,
  verdicts,
  castIds,
  castIdentityReady = true,
}: UseRecapArgs) {
  const [isGenerating, setIsGenerating] = useState(false)

  async function downloadRecap() {
    if (!roomId || !roomCode || isGenerating || !castIdentityReady) return

    setIsGenerating(true)

    try {
      // Fetch chat messages (snapshot -- not realtime)
      const { data: messages, error: messageError } = await fetchAllRows<MessageRow>((from, to) => supabase
        .from('messages').select('id, room_id, player_id, text, created_at')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(from, to))
      if (messageError) throw messageError

      const recapData: RecapData = {
        roomCode,
        leaderboard,
        categories,
        nominees,
        confidencePicks,
        draftPicks,
        draftEntities,
        players,
        messages: (messages ?? []) as MessageRow[],
        playerBingoCounts,
        playerAwards,
        characterAwards,
        verdicts,
        castIds,
      }

      generateRecapPDF(recapData)
    } catch (err) {
      console.error('Failed to generate recap PDF:', err)
    } finally {
      setIsGenerating(false)
    }
  }

  return { downloadRecap, isGenerating, isReady: castIdentityReady }
}
