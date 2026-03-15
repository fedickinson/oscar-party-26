/**
 * useRecap -- orchestrates data fetching and PDF generation for the night's recap.
 *
 * The Results page already has leaderboard + categories + nominees + confidence picks
 * from useScores. This hook:
 *   1. Fetches chat messages (one-time, not realtime -- recap is a snapshot)
 *   2. Combines everything into RecapData
 *   3. Calls the pure generateRecapPDF function
 *
 * Returns { downloadRecap, isGenerating } for the UI to bind to a button.
 */

import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { generateRecapPDF } from '../lib/recap-pdf'
import type { RecapData } from '../lib/recap-pdf'
import type { ScoredPlayer } from '../lib/scoring'
import type {
  CategoryRow,
  NomineeRow,
  ConfidencePickRow,
  PlayerRow,
  MessageRow,
} from '../types/database'

interface UseRecapArgs {
  roomId: string | undefined
  roomCode: string | undefined
  leaderboard: ScoredPlayer[]
  categories: CategoryRow[]
  nominees: NomineeRow[]
  confidencePicks: ConfidencePickRow[]
  players: PlayerRow[]
  playerBingoCounts: Map<string, number>
}

export function useRecap({
  roomId,
  roomCode,
  leaderboard,
  categories,
  nominees,
  confidencePicks,
  players,
  playerBingoCounts,
}: UseRecapArgs) {
  const [isGenerating, setIsGenerating] = useState(false)

  async function downloadRecap() {
    if (!roomId || !roomCode || isGenerating) return

    setIsGenerating(true)

    try {
      // Fetch chat messages (snapshot -- not realtime)
      const { data: messages } = await supabase
        .from('messages')
        .select('id, room_id, player_id, text, created_at')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })

      const recapData: RecapData = {
        roomCode,
        leaderboard,
        categories,
        nominees,
        confidencePicks,
        players,
        messages: (messages ?? []) as MessageRow[],
        playerBingoCounts,
      }

      generateRecapPDF(recapData)
    } catch (err) {
      console.error('Failed to generate recap PDF:', err)
    } finally {
      setIsGenerating(false)
    }
  }

  return { downloadRecap, isGenerating }
}
