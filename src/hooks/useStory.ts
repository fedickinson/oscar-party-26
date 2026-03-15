/**
 * useStory — auto-generates an AI narrative of the night during the ceremony.
 *
 * Auto-triggers a new story when announcedCount crosses these thresholds:
 *   [3, 6, 9, 12, 16, 20, 24]
 *
 * Also generates on-demand via refreshStory().
 *
 * Cache: skips auto-generation if announcedCount hasn't changed since the
 * last successful call. Manual refresh always re-generates.
 *
 * Uses claude-haiku-4-5-20251001 for fast, cheap short-form narrative.
 *
 * TODO: move Claude API call to Supabase Edge Function before production —
 *       API key exposure risk (same issue as useHotTakes.ts).
 */

import { useEffect, useRef, useState } from 'react'
import { useGame } from '../context/GameContext'
import { buildStoryPrompt } from '../lib/story-prompts'
import type {
  CategoryRow,
  NomineeRow,
  ConfidencePickRow,
  DraftPickRow,
  DraftEntityRow,
} from '../types/database'
import type { ScoredPlayer } from '../lib/scoring'

const THRESHOLDS = [3, 6, 9, 12, 16, 20, 24]

export interface UseStoryResult {
  story: string | null
  isGenerating: boolean
  announcedCount: number
  refreshStory: () => void
}

export function useStory(
  categories: CategoryRow[],
  nominees: NomineeRow[],
  confidencePicks: ConfidencePickRow[],
  draftPicks: DraftPickRow[],
  draftEntities: DraftEntityRow[],
  leaderboard: ScoredPlayer[],
): UseStoryResult {
  const { players } = useGame()
  const [story, setStory] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)

  // Track the announcedCount at which we last (attempted to) generate.
  // Set at the START of a generation attempt so we don't double-fire.
  const lastGeneratedAtRef = useRef<number>(-1)
  const isGeneratingRef = useRef(false)

  const announcedCount = categories.filter((c) => c.winner_id != null).length

  // Capture current data in refs so generateStory always has fresh data
  // regardless of when the async call completes.
  const categoriesRef = useRef(categories)
  const nomineesRef = useRef(nominees)
  const playersRef = useRef(players)
  const leaderboardRef = useRef(leaderboard)
  const confidencePicksRef = useRef(confidencePicks)
  const draftPicksRef = useRef(draftPicks)
  const draftEntitiesRef = useRef(draftEntities)
  const announcedCountRef = useRef(announcedCount)

  categoriesRef.current = categories
  nomineesRef.current = nominees
  playersRef.current = players
  leaderboardRef.current = leaderboard
  confidencePicksRef.current = confidencePicks
  draftPicksRef.current = draftPicks
  draftEntitiesRef.current = draftEntities
  announcedCountRef.current = announcedCount

  async function generateStory(force = false) {
    if (isGeneratingRef.current) return

    const currentCount = announcedCountRef.current
    if (!force && currentCount === lastGeneratedAtRef.current) return

    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY as string | undefined
    if (!apiKey) return

    isGeneratingRef.current = true
    setIsGenerating(true)
    lastGeneratedAtRef.current = currentCount

    try {
      const prompt = buildStoryPrompt(
        categoriesRef.current,
        nomineesRef.current,
        playersRef.current,
        leaderboardRef.current,
        confidencePicksRef.current,
        draftPicksRef.current,
        draftEntitiesRef.current,
        currentCount,
      )

      // TODO: move to Supabase Edge Function for production — same pattern as
      //       useHotTakes.analyzeHotTakes():
      //   const { data } = await supabase.functions.invoke('story-of-the-night', {
      //     body: { room_id: roomId, announced_count: currentCount },
      //   })
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 256,
          system: prompt.system,
          messages: [{ role: 'user', content: prompt.user }],
        }),
      })

      if (!response.ok) return

      const data = await response.json()
      const text: string = data?.content?.[0]?.text ?? ''
      if (text.trim()) setStory(text.trim())
    } catch {
      // Story is a nice-to-have — silently fail so the rest of the app works
    } finally {
      isGeneratingRef.current = false
      setIsGenerating(false)
    }
  }

  // ── Auto-trigger at thresholds ────────────────────────────────────────────

  useEffect(() => {
    if (announcedCount === 0) return

    const crossedThreshold = THRESHOLDS.some(
      (t) => announcedCount >= t && lastGeneratedAtRef.current < t,
    )

    if (crossedThreshold) {
      generateStory()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [announcedCount])

  // ── Manual refresh (bypasses cache) ──────────────────────────────────────

  function refreshStory() {
    generateStory(true)
  }

  return { story, isGenerating, announcedCount, refreshStory }
}
