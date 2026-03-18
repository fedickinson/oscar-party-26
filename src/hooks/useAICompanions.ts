/**
 * useAICompanions — fires AI chat companion messages in response to game events.
 *
 * Characters: Gloria (industry context), Razor (hot takes), Buddy (enthusiastic cheerleader).
 * Messages are inserted into the messages table as non-UUID player_ids
 * ('meryl', 'nikki', 'will') and flow through the existing useChat subscription.
 *
 * Four triggers:
 *   1. Pre-ceremony: intro messages when no winners exist yet (mount once)
 *   2. Winner reactions: Razor immediately, Gloria at 12s, Buddy at 25s (tier 1 only)
 *   3. Milestones: halfway (12 winners), final stretch (18 winners)
 *   4. Lead change: when the leaderboard #1 changes
 *
 * Rate limiter: isGeneratingRef prevents overlapping API calls.
 * All data is read from refs at fire time to avoid stale closure issues.
 */

import React, { useEffect, useRef } from 'react'
import { useGame } from '../context/GameContext'
import { supabase } from '../lib/supabase'
import {
  buildPreCeremonyPrompt,
  buildShowStartedPrompt,
  buildWinnerReactionPrompt,
  buildPreCategoryPrompt,
  buildMilestonePrompt,
  parseCompanionResponse,
  type PlayerPrediction,
} from '../lib/companion-prompts'
import type {
  CategoryRow,
  NomineeRow,
  ConfidencePickRow,
  DraftPickRow,
  DraftEntityRow,
} from '../types/database'
import type { ScoredPlayer } from '../lib/scoring'
import type { StoredPrediction } from '../lib/chat-reactivity-utils'
import { buildCategoryContext, buildCeremonyPreamble } from '../lib/ceremony-context'

export function useAICompanions(
  categories: CategoryRow[],
  nominees: NomineeRow[],
  confidencePicks: ConfidencePickRow[],
  draftPicks: DraftPickRow[],
  draftEntities: DraftEntityRow[],
  leaderboard: ScoredPlayer[],
  isHost: boolean,
  predictionsRef?: React.MutableRefObject<StoredPrediction[]>,
  showStarted?: boolean,
): { isGenerating: boolean } {
  const { room, players } = useGame()
  const isHostRef = useRef(isHost)
  isHostRef.current = isHost

  // Tracks delayed companion message timeouts so they can be cancelled on unmount
  const pendingTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])

  // ── State in refs to avoid stale closures and unnecessary re-renders ─────────
  const previousWinnersRef = useRef<Set<number>>(new Set())
  const preCategoryFiredRef = useRef<Set<number>>(new Set())
  const milestoneFiredRef = useRef<Set<string>>(new Set())
  const preCeremonyFiredRef = useRef(false)
  const showStartedFiredRef = useRef(false)
  const previousLeaderIdRef = useRef<string | null>(null)
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
  const showStartedRef = useRef(showStarted ?? false)
  showStartedRef.current = showStarted ?? false

  // ── Core helpers ──────────────────────────────────────────────────────────────

  async function callClaude(prompt: { system: string; user: string }, maxTokens = 600): Promise<string> {
    const response = await fetch('/api/anthropic/v1/messages', {
      method: 'POST',
      headers: {
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: maxTokens,
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

  async function insertSystemDivider(text: string) {
    const currentRoom = roomRef.current
    if (!currentRoom || !isHostRef.current) return
    await supabase.from('messages').insert({
      room_id: currentRoom.id,
      player_id: 'system',
      text,
    })
  }

  async function insertWinnerDivider(text: string) {
    const currentRoom = roomRef.current
    if (!currentRoom || !isHostRef.current) return
    await supabase.from('messages').insert({
      room_id: currentRoom.id,
      player_id: 'winner-divider',
      text,
    })
  }

  async function insertFilmLink(filmName: string) {
    const currentRoom = roomRef.current
    if (!currentRoom || !isHostRef.current) return
    await supabase.from('messages').insert({
      room_id: currentRoom.id,
      player_id: 'film-link',
      text: filmName,
    })
  }

  async function fireCompanionMessages(prompt: { system: string; user: string }, maxTokens = 600) {
    if (!isHostRef.current) return
    try {
      const raw = await callClaude(prompt, maxTokens)
      if (!raw) return
      const messages = parseCompanionResponse(raw)
      for (const msg of messages) {
        if (msg.delay_seconds === 0) {
          await insertCompanionMessage(msg.companion_id, msg.text)
        } else {
          const tid = setTimeout(() => {
            insertCompanionMessage(msg.companion_id, msg.text)
          }, msg.delay_seconds * 1000)
          pendingTimeoutsRef.current.push(tid)
        }
      }
    } catch {
      // Companions are a nice-to-have — silently fail so the rest of the app works
    }
  }

  // ── Cleanup: cancel all pending delayed messages on unmount ──────────────────
  useEffect(() => {
    return () => {
      pendingTimeoutsRef.current.forEach(clearTimeout)
      pendingTimeoutsRef.current = []
    }
  }, [])

  // ── Effect 1: Pre-ceremony intro (fires once per room, ever) ────────────────
  // Waits for room to be non-null (session restore complete), then delays 2s
  // so useScores initial fetch completes before checking winners.
  // Checks the DB for existing companion messages before firing — prevents
  // duplicate welcome messages when the host reloads the page.

  useEffect(() => {
    if (!room) return

    const timer = setTimeout(async () => {
      if (preCeremonyFiredRef.current) return
      preCeremonyFiredRef.current = true

      // If the show already started while the 2s timer was pending, skip the
      // pre-ceremony intro — Effect 1b handles that moment via buildShowStartedPrompt.
      if (showStartedRef.current) return

      const hasWinners = categoriesRef.current.some((c) => c.winner_id != null)
      if (hasWinners) return

      // Skip if companion messages already exist for this room (page reload case)
      const { count } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', roomRef.current?.id ?? '')
        .in('player_id', ['the-academy', 'meryl', 'nikki', 'will'])
      if (count && count > 0) return

      fireCompanionMessages(
        buildPreCeremonyPrompt(
          playersRef.current,
          draftPicksRef.current,
          draftEntitiesRef.current,
          confidencePicksRef.current,
          categoriesRef.current,
          nomineesRef.current,
          buildCeremonyPreamble(),
        ),
        1400,
      )
    }, 300)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room])

  // ── Effect 1b: "Show Started" — divider + companion reaction ────────────────
  // Fires once when show_started flips true. DB check guards against re-firing
  // on page reload when show_started is already true.

  useEffect(() => {
    if (!showStarted) return
    if (showStartedFiredRef.current) return
    showStartedFiredRef.current = true

    // Only the host inserts dividers and fires AI messages; non-hosts get them via Realtime
    if (!isHostRef.current) return

    // Guard against re-firing on reload: check before inserting the divider
    supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', roomRef.current?.id ?? '')
      .eq('player_id', 'system')
      .eq('text', 'Show Started')
      .then(({ count }) => {
        if (count != null && count > 0) return
        insertSystemDivider('Show Started')
        fireCompanionMessages(buildShowStartedPrompt(playersRef.current))
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showStarted])

  // ── Effect 2: Winner reactions ────────────────────────────────────────────────
  // First meaningful data load: initialize seen set without firing reactions.
  // Subsequent updates: fire for genuinely new winners only.

  useEffect(() => {
    if (!categories.length) return

    if (!dataInitializedRef.current) {
      // Mark all currently-announced categories as already seen
      categories.filter((c) => c.winner_id != null).forEach((c) => previousWinnersRef.current.add(c.id))

      // Pre-populate milestoneFiredRef for any thresholds already passed so
      // Effect 5 (milestone reactions) doesn't re-fire them on page reload.
      const count = categories.filter((c) => c.winner_id != null).length
      if (count >= 12) milestoneFiredRef.current.add('halfway')
      if (count >= 18) milestoneFiredRef.current.add('final_stretch')
      const total = categories.length
      if (total > 0 && count >= total - 1) milestoneFiredRef.current.add('final_category')
      if (total > 0 && count >= total) milestoneFiredRef.current.add('ceremony_end')

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

    const tieWinner = cat.tie_winner_id
      ? nomineesRef.current.find((n) => n.id === cat.tie_winner_id) ?? undefined
      : undefined

    // Find stored predictions that mentioned nominees in this category
    let playerPredictions: PlayerPrediction[] | undefined
    if (predictionsRef) {
      const catNomineeIds = new Set(
        confidencePicksRef.current.filter((p) => p.category_id === cat.id).map((p) => p.nominee_id),
      )
      const catNomineeNames = new Set(
        nomineesRef.current
          .filter((n) => catNomineeIds.has(n.id))
          .map((n) => n.name.toLowerCase()),
      )

      const relevant = predictionsRef.current.filter((pred) =>
        pred.nomineeNames.some((name) => catNomineeNames.has(name.toLowerCase())),
      )

      if (relevant.length > 0) {
        playerPredictions = relevant.map((pred) => ({
          playerName: pred.playerName,
          text: pred.text,
          wasCorrect: pred.nomineeNames.some(
            (name) =>
              name.toLowerCase() === winner.name.toLowerCase() ||
              (tieWinner != null && name.toLowerCase() === tieWinner.name.toLowerCase()),
          ),
        }))
        // Consume these predictions so they don't repeat for future categories
        const usedTimestamps = new Set(relevant.map((p) => p.timestamp))
        predictionsRef.current = predictionsRef.current.filter(
          (p) => !usedTimestamps.has(p.timestamp),
        )
      }
    }

    insertWinnerDivider(
      tieWinner
        ? `Winner — ${winner.name} & ${tieWinner.name}`
        : `Winner — ${winner.name}`,
    )

    // Await so the film link fires only after the Academy's delay-0 message is inserted
    const filmName = winner.film_name || winner.name
    ;(async () => {
      await fireCompanionMessages(
        buildWinnerReactionPrompt(
          cat,
          winner,
          playersRef.current,
          nomineesRef.current,
          confidencePicksRef.current,
          draftPicksRef.current,
          draftEntitiesRef.current,
          leaderboardRef.current,
          playerPredictions,
          tieWinner,
          buildCategoryContext(cat.name),
        ),
      )
      if (filmName) await insertFilmLink(filmName)
    })()
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
    if (!cat) return

    // Insert category divider for every spotlight open (even if pre-category prompt already fired)
    insertSystemDivider(cat.name)

    // The Academy announces the category immediately after the divider (varied phrasing)
    if (isHostRef.current) {
      callClaude(
        {
          system:
            'You are the Academy Awards host. Announce the next category in one short, casual sentence. Vary your phrasing every time — never repeat the same opener twice. Examples: "Okay, next up — Best Picture.", "Alright, we\'re moving on to Best Director.", "Next category: Best Actress." Keep it under 12 words. Plain text only, no quotes.',
          user: `Announce: ${cat.name}`,
        },
        80,
      ).then((text) => {
        const cleaned = text.trim().replace(/^["']|["']$/g, '')
        insertCompanionMessage('the-academy', cleaned || `Okay, next up — ${cat.name}.`)
      })
    }

    if (preCategoryFiredRef.current.has(cat.id)) return

    preCategoryFiredRef.current.add(cat.id)
    fireCompanionMessages(
      buildPreCategoryPrompt(
        cat,
        nomineesRef.current,
        confidencePicksRef.current,
        playersRef.current,
        buildCategoryContext(cat.name),
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
        buildMilestonePrompt(
          'final_category',
          leaderboardRef.current,
          playersRef.current,
          undefined,
          undefined,
          remaining?.name,
          count,
          categoriesRef.current,
          confidencePicksRef.current,
        ),
      )
    }

    if (count === totalCategories && totalCategories > 0 && !milestoneFiredRef.current.has('ceremony_end')) {
      milestoneFiredRef.current.add('ceremony_end')
      fireCompanionMessages(
        buildMilestonePrompt(
          'ceremony_end',
          leaderboardRef.current,
          playersRef.current,
          undefined,
          undefined,
          undefined,
          count,
          categoriesRef.current,
          confidencePicksRef.current,
        ),
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
        const announcedCount = categoriesRef.current.filter((c) => c.winner_id != null).length
        fireCompanionMessages(
          buildMilestonePrompt(
            'lead_change',
            leaderboard,
            playersRef.current,
            newLeader,
            oldLeader,
            undefined,
            announcedCount,
            categoriesRef.current,
          ),
        )
      }
    }

    previousLeaderIdRef.current = leaderId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderboard])

  return { isGenerating: false }
}
