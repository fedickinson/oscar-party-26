/**
 * useHotTakes — data and actions for the Hot Take Review phase.
 *
 * DATA:
 *   hotTakes    — all hot_takes rows for this room (updated in real-time)
 *   myTake      — current player's take, or undefined if not yet submitted
 *   allSubmitted — true when every player in the room has a take row
 *
 * REALTIME:
 *   Subscribes to hot_takes INSERT filtered by room_id so the submission
 *   status of other players updates without polling.
 *
 * ACTIONS:
 *   submitTake(text)   — inserts the current player's take
 *   analyzeHotTakes()  — host only; fetches winners + builds prompt, then:
 *
 *   MOCK: calls the Anthropic API directly from the client.
 *   TODO: move to a Supabase Edge Function before production deploy —
 *         API key exposure risk. The Edge Function pattern:
 *         supabase.functions.invoke('analyze-hot-takes', { body: { room_id } })
 *         The edge function holds ANTHROPIC_API_KEY in a server-side env var.
 *
 *   On success: stores AnalysisResult in rooms.ai_analysis and sets
 *   room phase to 'morning_after'. The Realtime subscription propagates
 *   both changes to all connected clients simultaneously.
 */

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useGame } from '../context/GameContext'
import { buildAnalysisPrompt } from '../lib/ai-prompts'
import type { HotTakeRow, CategoryRow, NomineeRow } from '../types/database'

export interface HotTakesState {
  hotTakes: HotTakeRow[]
  myTake: HotTakeRow | undefined
  allSubmitted: boolean
  isLoading: boolean
  isAnalyzing: boolean
  analyzeError: string | null
  submitTake: (text: string) => Promise<void>
  analyzeHotTakes: () => Promise<void>
}

export function useHotTakes(roomId: string | undefined): HotTakesState {
  const { player, players } = useGame()
  const [hotTakes, setHotTakes] = useState<HotTakeRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)

  // ── Initial fetch ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!roomId) return

    supabase
      .from('hot_takes')
      .select()
      .eq('room_id', roomId)
      .then(({ data }) => {
        if (data) setHotTakes(data)
        setIsLoading(false)
      })
  }, [roomId])

  // ── Realtime: watch for other players submitting ──────────────────────────

  useEffect(() => {
    if (!roomId) return

    const channel = supabase
      .channel(`hot-takes:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'hot_takes',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const newTake = payload.new as HotTakeRow
          setHotTakes((prev) =>
            prev.some((t) => t.id === newTake.id) ? prev : [...prev, newTake],
          )
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId])

  // ── submitTake ─────────────────────────────────────────────────────────────

  async function submitTake(text: string): Promise<void> {
    if (!roomId || !player) return

    const { data, error } = await supabase
      .from('hot_takes')
      .insert({ room_id: roomId, player_id: player.id, text })
      .select()
      .single()

    if (error) throw new Error(error.message)
    // Realtime INSERT will update state, but also update locally for instant feedback
    if (data) {
      setHotTakes((prev) => (prev.some((t) => t.id === data.id) ? prev : [...prev, data]))
    }
  }

  // ── analyzeHotTakes ────────────────────────────────────────────────────────

  async function analyzeHotTakes(): Promise<void> {
    if (!roomId || !player?.is_host) return

    setIsAnalyzing(true)
    setAnalyzeError(null)

    try {
      // Fetch current ceremony results alongside takes
      const [catRes, nomRes] = await Promise.all([
        supabase.from('categories').select().order('display_order'),
        supabase.from('nominees').select(),
      ])

      const categories = (catRes.data ?? []) as CategoryRow[]
      const nominees = (nomRes.data ?? []) as NomineeRow[]

      const prompt = buildAnalysisPrompt(hotTakes, players, categories, nominees)

      // TODO: move to edge function for production — API key exposure risk
      // Production pattern:
      //   const { data } = await supabase.functions.invoke('analyze-hot-takes', {
      //     body: { room_id: roomId },
      //   })
      const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined
      if (!apiKey) {
        throw new Error(
          'VITE_ANTHROPIC_API_KEY is not set. Add it to .env.local to run analysis.',
        )
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-opus-4-6',
          max_tokens: 2048,
          system: prompt.system,
          messages: [{ role: 'user', content: prompt.user }],
        }),
      })

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}))
        const errMsg = (errBody as { error?: { message?: string } })?.error?.message
        throw new Error(errMsg ?? `Anthropic API error ${response.status}`)
      }

      const apiResponse = await response.json()
      const rawText: string = apiResponse?.content?.[0]?.text ?? ''

      let analysis: unknown
      try {
        analysis = JSON.parse(rawText)
      } catch {
        throw new Error('Claude returned malformed JSON. Try again.')
      }

      // Store result + advance phase — Realtime propagates both to all clients
      const { error: updateError } = await supabase
        .from('rooms')
        .update({ ai_analysis: analysis, phase: 'morning_after' })
        .eq('id', roomId)

      if (updateError) throw new Error(updateError.message)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Analysis failed. Try again.'
      setAnalyzeError(msg)
      throw e
    } finally {
      setIsAnalyzing(false)
    }
  }

  const myTake = player ? hotTakes.find((t) => t.player_id === player.id) : undefined
  const allSubmitted = players.length > 0 && hotTakes.length >= players.length

  return {
    hotTakes,
    myTake,
    allSubmitted,
    isLoading,
    isAnalyzing,
    analyzeError,
    submitTake,
    analyzeHotTakes,
  }
}
