/**
 * useAICompanions — fires AI chat companion messages in response to game events.
 *
 * Characters: Meryl (industry context), Nikki (hot takes), Will (confused enthusiasm).
 * Messages are inserted into the messages table as non-UUID player_ids
 * ('meryl', 'nikki', 'will') and flow through the existing useChat subscription.
 *
 * Four triggers:
 *   1. Pre-ceremony: intro messages when no winners exist yet (mount once)
 *   2. Winner reactions: Nikki immediately, Meryl at 12s, Will at 25s (tier 1 only)
 *   3. Milestones: halfway (12 winners), final stretch (18 winners)
 *   4. Lead change: when the leaderboard #1 changes
 *
 * Rate limiter: isGeneratingRef prevents overlapping API calls.
 * All data is read from refs at fire time to avoid stale closure issues.
 */

import { useEffect, useRef } from 'react'
import { useGame } from '../context/GameContext'
import { supabase } from '../lib/supabase'
import {
  buildPreCeremonyPrompt,
  buildWinnerReactionPrompt,
  buildPreCategoryPrompt,
  buildMilestonePrompt,
  parseCompanionResponse,
} from '../lib/companion-prompts'
import type {
  CategoryRow,
  NomineeRow,
  ConfidencePickRow,
  DraftPickRow,
  DraftEntityRow,
} from '../types/database'
import type { ScoredPlayer } from '../lib/scoring'

export function useAICompanions(
  categories: CategoryRow[],
  nominees: NomineeRow[],
  confidencePicks: ConfidencePickRow[],
  draftPicks: DraftPickRow[],
  draftEntities: DraftEntityRow[],
  leaderboard: ScoredPlayer[],
  isHost: boolean,
): { isGenerating: boolean } {
  const { room, players } = useGame()
  const isHostRef = useRef(isHost)
  isHostRef.current = isHost

  // ── State in refs to avoid stale closures and unnecessary re-renders ─────────
  const previousWinnersRef = useRef<Set<number>>(new Set())
  const preCategoryFiredRef = useRef<Set<number>>(new Set())
  const milestoneFiredRef = useRef<Set<string>>(new Set())
  const preCeremonyFiredRef = useRef(false)
  const previousLeaderIdRef = useRef<string | null>(null)
  const isGeneratingRef = useRef(false)
  const dataInitializedRef = useRef(false)
  const prevSpotlightCategoryIdRef = useRef<number | null>(null)

  // Data refs — always current regardless of when async callbacks execute
  const categoriesRef = useRef(categories)
  categoriesRef.current = categories
  const nomineesRef = useRef(nominees)
  nomineesRef.current = nominees
  const confidencePicksRef = useRef(confidencePicks)
  confidencePicksRef.current = confidencePicks
  const draftPicksRef = useRef(draftPicks)
  draftPicksRef.current = draftPicks
  const draftEntitiesRef = useRef(draftEntities)
  draftEntitiesRef.current = draftEntities
  const leaderboardRef = useRef(leaderboard)
  leaderboardRef.current = leaderboard
  const playersRef = useRef(players)
  playersRef.current = players
  const roomRef = useRef(room)
  roomRef.current = room

  // ── Core helpers ──────────────────────────────────────────────────────────────

  async function callClaude(prompt: { system: string; user: string }): Promise<string> {
    const response = await fetch('/api/anthropic/v1/messages', {
      method: 'POST',
      headers: {
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 400,
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
      }),
    })

    if (!response.ok) return ''
    const data = await response.json()
    return (data?.content?.[0]?.text ?? '') as string
  }

  async function insertCompanionMessage(companionId: string, text: string) {
    const currentRoom = roomRef.current
    if (!currentRoom) return
    await supabase.from('messages').insert({
      room_id: currentRoom.id,
      player_id: companionId,
      text,
    })
  }

  async function fireCompanionMessages(prompt: { system: string; user: string }) {
    if (!isHostRef.current) return
    if (isGeneratingRef.current) return
    isGeneratingRef.current = true
    try {
      const raw = await callClaude(prompt)
      if (!raw) return
      const messages = parseCompanionResponse(raw)
      for (const msg of messages) {
        if (msg.delay_seconds === 0) {
          await insertCompanionMessage(msg.companion_id, msg.text)
        } else {
          setTimeout(() => {
            insertCompanionMessage(msg.companion_id, msg.text)
          }, msg.delay_seconds * 1000)
        }
      }
    } catch {
      // Companions are a nice-to-have — silently fail so the rest of the app works
    } finally {
      isGeneratingRef.current = false
    }
  }

  // ── Effect 1: Pre-ceremony intro (mount only) ─────────────────────────────────
  // Delay 2s to allow useScores initial fetch to complete before checking winners.

  useEffect(() => {
    if (preCeremonyFiredRef.current) return
    preCeremonyFiredRef.current = true

    const timer = setTimeout(() => {
      const hasWinners = categoriesRef.current.some((c) => c.winner_id != null)
      if (hasWinners) return

      fireCompanionMessages(
        buildPreCeremonyPrompt(
          playersRef.current,
          draftPicksRef.current,
          draftEntitiesRef.current,
          confidencePicksRef.current,
          categoriesRef.current,
          nomineesRef.current,
        ),
      )
    }, 2000)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Effect 2: Winner reactions ────────────────────────────────────────────────
  // First meaningful data load: initialize seen set without firing reactions.
  // Subsequent updates: fire for genuinely new winners only.

  useEffect(() => {
    if (!categories.length) return

    if (!dataInitializedRef.current) {
      // Mark all currently-announced categories as already seen
      categories.filter((c) => c.winner_id != null).forEach((c) => previousWinnersRef.current.add(c.id))
      dataInitializedRef.current = true
      return
    }

    const newWinners = categories.filter(
      (c) => c.winner_id != null && !previousWinnersRef.current.has(c.id),
    )
    if (!newWinners.length) return

    const cat = newWinners[0]
    newWinners.forEach((c) => previousWinnersRef.current.add(c.id))

    const winner = nomineesRef.current.find((n) => n.id === cat.winner_id)
    if (!winner) return

    fireCompanionMessages(
      buildWinnerReactionPrompt(
        cat,
        winner,
        playersRef.current,
        nomineesRef.current,
        confidencePicksRef.current,
        draftPicksRef.current,
        draftEntitiesRef.current,
        leaderboardRef.current,
      ),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories])

  // ── Effect 3: Spotlight pre-category prompt ───────────────────────────────────
  // Fires immediately when host opens a spotlight for a category.
  // Replaces the old 45s-delayed pre-category scheduling.

  useEffect(() => {
    const spotlightId = room?.active_spotlight_category_id ?? null

    if (spotlightId === prevSpotlightCategoryIdRef.current) return
    prevSpotlightCategoryIdRef.current = spotlightId

    if (spotlightId == null) return

    const cat = categoriesRef.current.find((c) => c.id === spotlightId)
    if (!cat || preCategoryFiredRef.current.has(cat.id)) return

    preCategoryFiredRef.current.add(cat.id)
    fireCompanionMessages(
      buildPreCategoryPrompt(
        cat,
        nomineesRef.current,
        confidencePicksRef.current,
        playersRef.current,
      ),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.active_spotlight_category_id])

  // ── Effect 5: Milestone reactions (halfway / final stretch) ───────────────────

  useEffect(() => {
    const count = categories.filter((c) => c.winner_id != null).length

    if (count === 12 && !milestoneFiredRef.current.has('halfway')) {
      milestoneFiredRef.current.add('halfway')
      fireCompanionMessages(
        buildMilestonePrompt('halfway', leaderboardRef.current, playersRef.current),
      )
    }

    if (count === 18 && !milestoneFiredRef.current.has('final_stretch')) {
      milestoneFiredRef.current.add('final_stretch')
      fireCompanionMessages(
        buildMilestonePrompt('final_stretch', leaderboardRef.current, playersRef.current),
      )
    }

    const totalCategories = categoriesRef.current.length
    if (count === totalCategories - 1 && !milestoneFiredRef.current.has('final_category')) {
      milestoneFiredRef.current.add('final_category')
      const remaining = categoriesRef.current.find((c) => c.winner_id == null)
      fireCompanionMessages(
        buildMilestonePrompt('final_category', leaderboardRef.current, playersRef.current, undefined, undefined, remaining?.name),
      )
    }

    if (count === totalCategories && totalCategories > 0 && !milestoneFiredRef.current.has('ceremony_end')) {
      milestoneFiredRef.current.add('ceremony_end')
      fireCompanionMessages(
        buildMilestonePrompt('ceremony_end', leaderboardRef.current, playersRef.current),
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories])

  // ── Effect 6: Lead change reaction ────────────────────────────────────────────

  useEffect(() => {
    if (!leaderboard.length) return

    const leaderId = leaderboard[0].player.id

    if (previousLeaderIdRef.current && previousLeaderIdRef.current !== leaderId) {
      const key = `lead_change:${leaderId}`
      if (!milestoneFiredRef.current.has(key)) {
        milestoneFiredRef.current.add(key)
        const newLeader = leaderboard[0]
        const oldLeader = leaderboard.find((e) => e.player.id === previousLeaderIdRef.current)
        fireCompanionMessages(
          buildMilestonePrompt('lead_change', leaderboard, playersRef.current, newLeader, oldLeader),
        )
      }
    }

    previousLeaderIdRef.current = leaderId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderboard])

  return { isGenerating: isGeneratingRef.current }
}
