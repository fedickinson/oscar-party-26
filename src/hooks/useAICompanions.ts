/**
 * useAICompanions — fires AI chat companion messages in response to game events.
 *
 * Cast: Ned narrates every event; Cersei, Tyrion, Joffrey, Daenerys, Olenna and
 * Arya rotate 2-3 per event. See data/ai-companions.ts.
 * Messages are inserted into the messages table as non-UUID player_ids
 * (see data/ai-companions.ts) and flow through the existing useChat subscription.
 *
 * Four triggers:
 *   1. Pre-ceremony: intro messages when no winners exist yet (mount once)
 *   2. Event reactions: Ned at 0s, then the rotating cast staggered behind him
 *   3. Milestones: 6 events logged, 12 events logged
 *
 * Rate limiter: isGeneratingRef prevents overlapping API calls.
 * All data is read from refs at fire time to avoid stale closure issues.
 */

import React, { useEffect, useRef } from 'react'
import { useGame } from '../context/GameContext'
import { supabase } from '../lib/supabase'
import {
  buildBingoReactionPrompt,
  buildPlayerWelcomePrompt,
  buildPreCeremonyPrompt,
  buildPreShowArrivalSchedule,
  buildShowStartedPrompt,
  buildTeamChangePrompt,
  buildWinnerReactionPrompt,
  buildPreCategoryPrompt,
  buildMilestonePrompt,
  parseCompanionResponse,
  type CompanionMessage,
  type PlayerPrediction,
} from '../lib/companion-prompts'
import {
  groundedCompanionBatch,
  type GroundingModelRequest,
} from '../../api/_grounding'
import type {
  CategoryRow,
  NomineeRow,
  ConfidencePickRow,
  DraftPickRow,
  DraftEntityRow,
  BingoMarkRow,
  PlayerIdentitySelectionRow,
} from '../types/database'
import type { ScoredPlayer } from '../lib/scoring'
import type { StoredPrediction } from '../lib/chat-reactivity-utils'
import { COMPANION_IDS, NARRATOR, PRE_SHOW_COMPANIONS, pickGreeterForHouse } from '../data/ai-companions'
import { getAvatarById } from '../data/avatar-config'
import { buildCategoryContext } from '../lib/ceremony-context'
import {
  buildBingoReactionKey,
  buildMilestoneReactionKey,
  buildPreShowArrivalReactionKey,
  buildShowStartedReactionKey,
  buildSpotlightReactionKey,
  buildTeamChangeReactionKey,
  buildWelcomeReactionKey,
  buildRuntimePreShowArrivalReactionKey,
  buildRuntimeMilestoneReactionKey,
  buildIdentityChangeReactionKey,
  isMilestoneScoreboardReady,
  selectSpokenCompanionIds,
} from '../lib/companion-reaction'
import {
  buildRuntimePreShowPrompt,
  buildRuntimeShowStartedPrompt,
  buildRuntimeSpotlightPrompt,
  buildRuntimeWelcomePrompt,
  buildRuntimeMilestonePrompt,
  buildRuntimeIdentityChangePrompt,
} from '../lib/runtime-narrative-prompts'
import {
  buildRuntimePreShowArrivalSchedule,
  selectRuntimeIdentityChangeVoice,
  selectRuntimeEventCast,
  type PackRuntimeNarrativeCast,
} from '../lib/runtime-narrative'
import { didBingoMarkCompleteLine } from '../lib/bingo-utils'
import { addPendingCompanion, removePendingCompanion, clearPendingCompanions } from './companionTypingStore'
import {
  acquireCompanionTypingChannel,
  type CompanionTypingChannelHandle,
} from './companionTypingChannel'

export function useAICompanions(
  categories: CategoryRow[],
  nominees: NomineeRow[],
  confidencePicks: ConfidencePickRow[],
  draftPicks: DraftPickRow[],
  draftEntities: DraftEntityRow[],
  leaderboard: ScoredPlayer[],
  isHost: boolean,
  operatorCapability: string | null,
  predictionsRef?: React.MutableRefObject<StoredPrediction[]>,
  showStarted?: boolean,
  narrativeDataReady = false,
  runtimeCast?: PackRuntimeNarrativeCast | null,
  identitySelections: PlayerIdentitySelectionRow[] = [],
  identityDataReady = false,
): { isGenerating: boolean } {
  const { room, players } = useGame()
  const roomIdForBingo = room?.id
  const isHostRef = useRef(isHost)
  isHostRef.current = isHost
  const operatorCapabilityRef = useRef(operatorCapability)
  operatorCapabilityRef.current = operatorCapability
  const narrativeDataReadyRef = useRef(narrativeDataReady)
  narrativeDataReadyRef.current = narrativeDataReady
  const runtimeCastRef = useRef(runtimeCast ?? null)
  runtimeCastRef.current = runtimeCast ?? null
  const identitySelectionsRef = useRef(identitySelections)
  identitySelectionsRef.current = identitySelections
  const identityDataReadyRef = useRef(identityDataReady)
  identityDataReadyRef.current = identityDataReady
  const packCeremony = runtimeCast != null

  useEffect(() => {
    if (isHost) return
    pendingTimeoutsRef.current.forEach(clearTimeout)
    pendingTimeoutsRef.current = []
    welcomeTimersRef.current.forEach(clearTimeout)
    welcomeTimersRef.current.clear()
    clearPendingCompanions()
  }, [isHost])
  const reactionInstanceRef = useRef(crypto.randomUUID())

  // Tracks delayed companion message timeouts so they can be cancelled on unmount
  const pendingTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])

  // Broadcast channel — host sends typing events; all clients subscribe in ChatSection
  const broadcastChannelRef = useRef<CompanionTypingChannelHandle | null>(null)
  useEffect(() => {
    if (!room?.id) return
    const channel = acquireCompanionTypingChannel(room.id)
    broadcastChannelRef.current = channel
    return () => {
      channel.release()
      broadcastChannelRef.current = null
    }
  }, [room?.id])

  // Staggered event lines live in a private due-time queue. Exact timers give
  // an awake host the intended cadence; this poll is the reload/background
  // recovery path. The daemon runs the same flush, and the RPC is idempotent.
  useEffect(() => {
    if (!isHost || !room?.id) return
    const roomId = room.id
    const flush = () => {
      void supabase.rpc('deliver_due_companion_reactions', {
        p_room_id: roomId,
        p_limit: 20,
      })
    }
    flush()
    const timer = setInterval(flush, 3_000)
    return () => clearInterval(timer)
  }, [isHost, room?.id])

  // ── State in refs to avoid stale closures and unnecessary re-renders ─────────
  const previousWinnersRef = useRef<Set<number>>(new Set())
  const milestoneFiredRef = useRef<Set<string>>(new Set())
  const dataInitializedRef = useRef(false)

  useEffect(() => {
    previousWinnersRef.current = new Set()
    milestoneFiredRef.current = new Set()
    dataInitializedRef.current = false
  }, [room?.id])

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

  async function callClaude(
    prompt: { system: string; user: string },
    maxTokens = 600,
    model: GroundingModelRequest['model'] = 'claude-sonnet-5',
  ): Promise<string> {
    const response = await fetch('/api/anthropic/v1/messages', {
      method: 'POST',
      headers: {
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        // Thinking is OFF deliberately. On Sonnet 5 an omitted `thinking` field
        // runs adaptive thinking, and max_tokens caps thinking + response text
        // together — at maxTokens=600 that truncates companion banter or
        // returns nothing at all. These are one-liner reactions during a live
        // episode: latency matters, deliberation does not.
        thinking: { type: 'disabled' },
        output_config: { effort: 'low' },
        // SHARED_SYSTEM is ~8.9k tokens and byte-identical on every call — the
        // cast, the five behavioural axes, the spoiler rules. Caching it turns
        // the dominant cost of the evening into a rounding error and, more
        // importantly, cuts time-to-first-token: these fire while people are
        // watching, so latency is the thing that actually shows.
        // 1h TTL, not the 5m default: events are 3-4 minutes apart on average
        // but cluster, and a quiet stretch would otherwise expire the cache.
        system: [
          {
            type: 'text',
            text: prompt.system,
            cache_control: { type: 'ephemeral', ttl: '1h' },
          },
        ],
        messages: [{ role: 'user', content: prompt.user }],
      }),
    })

    if (!response.ok) return ''
    const data = await response.json()
    // Find the first text block rather than indexing content[0] — the response
    // can lead with a non-text block, and a wrong assumption here surfaces as
    // silent empty companion messages.
    const blocks = (data?.content ?? []) as Array<{ type?: string; text?: string }>
    return (blocks.find((b) => b.type === 'text')?.text ?? '') as string
  }

  async function callGroundedClaude(
    prompt: {
      system: string
      user: string
      groundingFacts: string[]
      expectedCompanionIds: string[]
      expectedDelaySeconds?: number[]
    },
    maxTokens: number,
    reactionKey: string,
    surface: 'event' | 'bingo' | 'milestone' | 'welcome' | 'team_change' | 'identity_change' | 'show_start' | 'pre_show' | 'spotlight',
    legacyPlayerId?: string,
    stillValid?: () => boolean,
  ): Promise<CompanionMessage[] | null> {
    const currentRoom = roomRef.current
    if (!currentRoom?.host_id) return null
    const roomId = currentRoom.id
    let claimed = false
    let completed = false
    try {
      const { data: claimData, error: claimError } = await supabase.rpc(
        'claim_browser_companion_reaction_authorized',
        {
          p_room_id: roomId,
          p_reaction_key: reactionKey,
          p_instance_id: reactionInstanceRef.current,
          p_lease_seconds: 300,
          p_operator_capability: operatorCapabilityRef.current,
        },
      )
      if (claimError) throw claimError
      claimed = (claimData as Array<{ claimed?: boolean }> | null)?.[0]?.claimed === true
      if (!claimed || roomRef.current?.id !== roomId) return null
      if (stillValid && !stillValid()) return null

      const grounded = await groundedCompanionBatch({
        system: prompt.system,
        user: prompt.user,
        facts: prompt.groundingFacts,
        model: 'claude-sonnet-5',
        maxTokens,
        maxRetries: 2,
        ...(runtimeCastRef.current
          ? { allowedCompanionIds: runtimeCastRef.current.voices.map((voice) => voice.id) }
          : {}),
        expectedCompanionIds: prompt.expectedCompanionIds,
        expectedDelaySeconds: prompt.expectedDelaySeconds,
        allowEmptyBatch: surface === 'bingo',
        caller: (request) => callClaude(
          { system: request.system, user: request.user },
          request.maxTokens,
          request.model,
        ),
      })
      if (roomRef.current?.id !== roomId) return null
      if (grounded.findings.length > 0) {
        const { error } = await supabase.rpc('record_companion_grounding_review_authorized', {
          p_room_id: roomId,
          p_actor_player_id: currentRoom.host_id,
          p_reaction_key: reactionKey,
          p_surface: surface,
          p_engine: 'browser',
          p_facts: prompt.groundingFacts,
          p_attempted_messages: grounded.messages,
          p_findings: grounded.findings,
          p_attempts: grounded.attempts,
          p_model: 'claude-sonnet-5',
          p_operator_capability: operatorCapabilityRef.current,
        })
        if (error) console.error('Could not preserve blocked companion prose:', error)
        return null
      }
      if (grounded.messages.length === 0) return null
      if (stillValid && !stillValid()) return null
      if (surface === 'pre_show' && (
        !isHostRef.current ||
        !narrativeDataReadyRef.current ||
        showStartedRef.current ||
        categoriesRef.current.some((category) => category.winner_id != null)
      )) return null
      if (legacyPlayerId) {
        const { count, error } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('room_id', roomId)
          .eq('player_id', legacyPlayerId)
        if (error) throw error
        if (count != null && count > 0) return null
      }

      const { data: scheduleData, error: scheduleError } = await supabase.rpc(
        'schedule_browser_companion_reaction_authorized',
        {
          p_room_id: roomId,
          p_reaction_key: reactionKey,
          p_instance_id: reactionInstanceRef.current,
          p_messages: grounded.messages.map((message) => ({
            player_id: message.companion_id,
            text: message.text,
            delay_seconds: message.delay_seconds,
          })),
          p_operator_capability: operatorCapabilityRef.current,
        },
      )
      if (scheduleError) throw scheduleError
      completed = (scheduleData as Array<{ completed?: boolean }> | null)?.[0]?.completed === true
      return completed ? grounded.messages : null
    } finally {
      if (claimed && !completed) {
        await supabase.rpc('release_browser_companion_reaction_authorized', {
          p_room_id: roomId,
          p_reaction_key: reactionKey,
          p_instance_id: reactionInstanceRef.current,
          p_operator_capability: operatorCapabilityRef.current,
        })
      }
    }
  }

  async function deliverDueCompanionReactions(roomId: string): Promise<void> {
    const { error } = await supabase.rpc('deliver_due_companion_reactions', {
      p_room_id: roomId,
      p_limit: 20,
    })
    if (error) throw error
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

  async function insertClaimedSystemDivider(
    reactionKey: string,
    text: string,
    legacyTextSentinel?: string,
    legacySince?: string,
    stillValid?: () => boolean,
  ): Promise<boolean> {
    const currentRoom = roomRef.current
    if (!currentRoom || !isHostRef.current) return false
    let claimed = false
    let completed = false
    try {
      let legacyRowExists = false
      if (legacyTextSentinel) {
        let legacyQuery = supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('room_id', currentRoom.id)
          .eq('player_id', 'system')
          .eq('text', legacyTextSentinel)
        if (legacySince) legacyQuery = legacyQuery.gte('created_at', legacySince)
        const { count, error } = await legacyQuery
        if (error) throw error
        legacyRowExists = count != null && count > 0
      }
      const { data: claimData, error: claimError } = await supabase.rpc(
        'claim_browser_companion_reaction_authorized',
        {
          p_room_id: currentRoom.id,
          p_reaction_key: reactionKey,
          p_instance_id: reactionInstanceRef.current,
          p_lease_seconds: 60,
          p_operator_capability: operatorCapabilityRef.current,
        },
      )
      if (claimError) throw claimError
      const claim = (claimData as Array<{
        claimed?: boolean
        active_completed_at?: string | null
      }> | null)?.[0]
      claimed = claim?.claimed === true
      if (!claimed) return claim?.active_completed_at != null
      if (roomRef.current?.id !== currentRoom.id) return false
      // A divider written by the unkeyed legacy bundle is the old ceremony's
      // completion sentinel. Do not backfill a second announcement or reaction.
      if (legacyRowExists) return false
      if (stillValid && !stillValid()) return false
      const { data: completeData, error: completeError } = await supabase.rpc(
        'complete_browser_companion_reaction_authorized',
        {
          p_room_id: currentRoom.id,
          p_reaction_key: reactionKey,
          p_instance_id: reactionInstanceRef.current,
          p_messages: [{ player_id: 'system', text }],
          p_operator_capability: operatorCapabilityRef.current,
        },
      )
      if (completeError) throw completeError
      completed = (completeData as Array<{ completed?: boolean }> | null)?.[0]?.completed === true
      return completed
    } finally {
      if (claimed && !completed) {
        await supabase.rpc('release_browser_companion_reaction_authorized', {
          p_room_id: currentRoom.id,
          p_reaction_key: reactionKey,
          p_instance_id: reactionInstanceRef.current,
          p_operator_capability: operatorCapabilityRef.current,
        })
      }
    }
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

  async function fireCompanionMessages(
    prompt: {
      system: string
      user: string
      groundingFacts?: string[]
      expectedCompanionIds?: string[]
      expectedDelaySeconds?: number[]
    },
    maxTokens = 600,
    reactionKey?: string,
    groundingSurface: 'event' | 'bingo' | 'milestone' | 'welcome' | 'team_change' | 'identity_change' | 'show_start' | 'pre_show' | 'spotlight' = 'event',
    legacyPlayerId?: string,
    stillValid?: () => boolean,
  ) {
    if (!isHostRef.current) return
    // The delay-0 message gates all perceived latency: during the pre-show the
    // chat IS the show and generation takes seconds. Show the narrator typing
    // the moment the call goes out — the wait reads as typing, not dead air.
    const narratorId = prompt.expectedCompanionIds?.[0]
      ?? runtimeCastRef.current?.narrator.id
      ?? NARRATOR.id
    addPendingCompanion(narratorId)
    void broadcastChannelRef.current?.send({ id: narratorId, typing: true })
    const clearNarratorTyping = () => {
      removePendingCompanion(narratorId)
      void broadcastChannelRef.current?.send({ id: narratorId, typing: false })
    }
    try {
      let messages: CompanionMessage[]
      let firstMessageAlreadyPersisted = false
      const scheduledRoomId = roomRef.current?.id
      if (prompt.groundingFacts && prompt.expectedCompanionIds && reactionKey) {
        const groundedMessages = await callGroundedClaude(
          {
            ...prompt,
            groundingFacts: prompt.groundingFacts,
            expectedCompanionIds: prompt.expectedCompanionIds,
            expectedDelaySeconds: prompt.expectedDelaySeconds,
          },
          maxTokens,
          reactionKey,
          groundingSurface,
          legacyPlayerId,
          stillValid,
        )
        if (!groundedMessages) {
          clearNarratorTyping()
          return
        }
        messages = groundedMessages
        firstMessageAlreadyPersisted = true
      } else if (prompt.groundingFacts || prompt.expectedCompanionIds) {
        clearNarratorTyping()
        return
      } else {
        const raw = await callClaude(prompt, maxTokens)
        if (!raw) {
          clearNarratorTyping()
          return
        }
        messages = parseCompanionResponse(raw, runtimeCastRef.current == null)
      }
      clearNarratorTyping()
      // Ungrounded decoration still uses client timers, so cap its tail inside
      // a plausible awake-window. Grounded event batches are different: their
      // complete delay plan is already durable, and these timers merely wake
      // the idempotent database delivery RPC at the intended cadence.
      for (const msg of messages) {
        msg.delay_seconds = Math.min(msg.delay_seconds, 90)
      }
      for (const [messageIndex, msg] of messages.entries()) {
        if (msg.delay_seconds === 0) {
          if (!firstMessageAlreadyPersisted || messageIndex > 0) {
            await insertCompanionMessage(msg.companion_id, msg.text)
          }
        } else {
          // Typing indicator appears shortly BEFORE the message, not the instant
          // the batch is scheduled. Intros are now minutes apart, and lighting up
          // every indicator at once would show six people typing simultaneously
          // for eight minutes — which both spoils each arrival and looks broken.
          const typingLeadMs = Math.min(4000, msg.delay_seconds * 1000)
          const startTypingIn = msg.delay_seconds * 1000 - typingLeadMs
          const startTyping = () => {
            addPendingCompanion(msg.companion_id)
            void broadcastChannelRef.current?.send({ id: msg.companion_id, typing: true })
          }
          if (startTypingIn <= 0) startTyping()
          else pendingTimeoutsRef.current.push(setTimeout(startTyping, startTypingIn))

          const tid = setTimeout(() => {
            removePendingCompanion(msg.companion_id)
            void broadcastChannelRef.current?.send({ id: msg.companion_id, typing: false })
            if (firstMessageAlreadyPersisted && scheduledRoomId) {
              void deliverDueCompanionReactions(scheduledRoomId).catch(() => undefined)
            } else {
              void insertCompanionMessage(msg.companion_id, msg.text)
            }
          }, msg.delay_seconds * 1000)
          pendingTimeoutsRef.current.push(tid)
        }
      }
    } catch {
      clearNarratorTyping()
      // Companions are a nice-to-have — silently fail so the rest of the app works
    }
  }

  // ── Cleanup: cancel all pending delayed messages on unmount ──────────────────
  useEffect(() => {
    return () => {
      pendingTimeoutsRef.current.forEach(clearTimeout)
      pendingTimeoutsRef.current = []
      clearPendingCompanions()
    }
  }, [])

  // ── Effect 1: Grounded pre-ceremony arrivals ─────────────────────────────────
  // Each authored arrival owns its own durable key. Missing rows are re-based
  // after reload so the long entrance arc survives without replaying anyone who
  // already spoke, including companions inserted by a still-running old bundle.

  useEffect(() => {
    if (!room?.id || !isHost || !narrativeDataReady) return
    const packCast = runtimeCast
    const scheduledRoomId = room.id
    let disposed = false
    const timers: ReturnType<typeof setTimeout>[] = []

    const fireArrival = async (companionId: string) => {
      if (disposed || !isHostRef.current || showStartedRef.current ||
          roomRef.current?.id !== scheduledRoomId ||
          categoriesRef.current.some((category) => category.winner_id != null)) return

      // Fast legacy sentinel before spending model tokens. The grounded helper
      // repeats this check after audit to close the longer generation window.
      const { count: existingCount, error: existingError } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', scheduledRoomId)
        .eq('player_id', companionId)
      if (existingError || (existingCount != null && existingCount > 0)) return

      const { data: recent, error: recentError } = await supabase
        .from('messages')
        .select('player_id,text,created_at')
        .eq('room_id', scheduledRoomId)
        .in('player_id', packCast
          ? packCast.voices.map((voice) => voice.id)
          : PRE_SHOW_COMPANIONS.map((companion) => companion.id))
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(6)
      if (recentError || disposed) return

      const prompt = packCast
        ? buildRuntimePreShowPrompt(
            packCast,
            packCast.voices.find((voice) => voice.id === companionId)!,
            {
              playerNames: playersRef.current.map((player) => player.name),
              draftRosters: playersRef.current.map((player) => ({
                playerName: player.name,
                entityNames: draftPicksRef.current
                  .filter((pick) => pick.player_id === player.id)
                  .map((pick) => draftEntitiesRef.current
                    .find((entity) => entity.id === pick.entity_id)?.name)
                  .filter((name): name is string => !!name),
              })),
              recentMessages: [...(recent ?? [])].reverse(),
            },
          )
        : buildPreCeremonyPrompt(
            companionId,
            playersRef.current,
            draftPicksRef.current,
            draftEntitiesRef.current,
            [...(recent ?? [])].reverse(),
          )
      await fireCompanionMessages(
        prompt,
        700,
        packCast
          ? buildRuntimePreShowArrivalReactionKey(companionId)
          : buildPreShowArrivalReactionKey(companionId),
        'pre_show',
        companionId,
      )
    }

    const bootstrap = setTimeout(async () => {
      if (disposed || showStartedRef.current ||
          categoriesRef.current.some((category) => category.winner_id != null)) return
      const { data: existing, error } = await supabase
        .from('messages')
        .select('player_id')
        .eq('room_id', scheduledRoomId)
        .in('player_id', packCast
          ? packCast.voices.map((voice) => voice.id)
          : PRE_SHOW_COMPANIONS.map((companion) => companion.id))
      if (error || disposed) return

      const present = (existing ?? []).map((message) => message.player_id)
      const schedule = packCast
        ? buildRuntimePreShowArrivalSchedule(packCast, present)
          .map((arrival) => ({
            companionId: arrival.voiceId,
            delaySeconds: arrival.delaySeconds,
          }))
        : buildPreShowArrivalSchedule(present)
      for (const arrival of schedule) {
        const timer = setTimeout(
          () => void fireArrival(arrival.companionId).catch(() => undefined),
          arrival.delaySeconds * 1000,
        )
        timers.push(timer)
      }
    }, 300)
    timers.push(bootstrap)

    return () => {
      disposed = true
      timers.forEach(clearTimeout)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.id, isHost, narrativeDataReady, runtimeCast])

  // ── Effect 1b: "Show Started" — divider + companion reaction ────────────────
  // The room phase is canonical. Stable database claims make competing host
  // tabs and reload recovery safe; the legacy divider remains a deploy-window
  // sentinel for rooms whose old bundle already performed this ceremony.

  useEffect(() => {
    if (!showStarted || !isHost || !room?.id) return
    void (async () => {
      const shouldReact = await insertClaimedSystemDivider(
        buildShowStartedReactionKey('announcement'),
        'Show Started',
        'Show Started',
      )
      if (!shouldReact) return
      const packCast = runtimeCastRef.current
      await fireCompanionMessages(
        packCast
          ? buildRuntimeShowStartedPrompt(
              packCast,
              selectRuntimeEventCast(packCast),
              playersRef.current.map((player) => player.name),
            )
          : buildShowStartedPrompt(playersRef.current),
        1000,
        buildShowStartedReactionKey('reaction'),
        'show_start',
      )
    })().catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showStarted, isHost, room?.id, runtimeCast])

  // ── Effect 1c: Player welcomes ──────────────────────────────────────────────
  //
  // Each player gets ONE scheduled arrival welcome from the cast: their name,
  // their allegiance, a verdict on somebody they drafted. Spaced ~85s apart so they
  // thread BETWEEN the companion entrances instead of landing as a roll call,
  // and the greeter is drawn only from companions who have already introduced
  // themselves — a welcome from someone who has not arrived yet would both read
  // wrong and blow the late-arrival surprise.
  //
  // welcomed_at is claimed in the DB before the API call, so a host reload
  // mid-pre-show cannot re-welcome anyone. The claim is conditional
  // (is welcomed_at null), which also makes two racing host tabs safe.
  const welcomeTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const nextWelcomeAtRef = useRef(0)
  const lastGreeterRef = useRef<string | null>(null)

  useEffect(() => {
    nextWelcomeAtRef.current = 0
    lastGreeterRef.current = null
    return () => {
      welcomeTimersRef.current.forEach(clearTimeout)
      welcomeTimersRef.current.clear()
    }
  }, [room?.id])

  async function spokenCompanionIds(): Promise<string[]> {
    const castIds = runtimeCastRef.current?.voices.map((voice) => voice.id)
      ?? [...COMPANION_IDS]
    const { data } = await supabase
      .from('messages')
      .select('player_id')
      .eq('room_id', roomRef.current?.id ?? '')
      .in('player_id', castIds)
    const authorIds = (data ?? []).map((message) => message.player_id as string)
    return runtimeCastRef.current
      ? [...new Set(authorIds.filter((id) => castIds.includes(id)))]
      : selectSpokenCompanionIds(authorIds)
  }

  useEffect(() => {
    if (!isHost || !room) return
    const unwelcomed = players.filter(
      (p) => !p.welcomed_at && !welcomeTimersRef.current.has(p.id),
    )
    if (!unwelcomed.length) return

    for (const p of unwelcomed) {
      // Pre-show, the queue paces itself around the 8-minute entrance arc;
      // once the episode is running, arrivals (late joiners) get greeted sooner.
      const spacing = showStartedRef.current ? 45_000 : 85_000
      const minDelay = showStartedRef.current ? 20_000 : 40_000
      const at = Math.max(Date.now() + minDelay, nextWelcomeAtRef.current)
      nextWelcomeAtRef.current = at + spacing + Math.random() * 15_000

      const fire = async () => {
        welcomeTimersRef.current.delete(p.id)
        try {
          // Nobody on stage yet (companion intros still in flight)? Try again
          // shortly — a greeting from an empty room reads as a bug.
          const spoken = await spokenCompanionIds()
          if (!spoken.length) {
            const retry = setTimeout(fire, 30_000)
            welcomeTimersRef.current.set(p.id, retry)
            return
          }
          // Claim before calling the API — this is the reload guard.
          const actorPlayerId = roomRef.current?.host_id
          if (!actorPlayerId || !operatorCapabilityRef.current) return
          const { data: claimed, error: claimError } = await supabase.rpc(
            'claim_player_welcome_authorized_v2', {
              p_room_id: roomRef.current?.id,
              p_actor_player_id: actorPlayerId,
              p_target_player_id: p.id,
              p_operator_capability: operatorCapabilityRef.current,
            },
          )
          if (claimError || !claimed) return

          // Freshest state at fire time, not schedule time — the player may
          // have picked a team in the minutes since this was queued.
          const current = playersRef.current.find((x) => x.id === p.id) ?? p
          const roster = draftPicksRef.current
            .filter((dp) => dp.player_id === p.id)
            .map((dp) => draftEntitiesRef.current.find((e) => e.id === dp.entity_id)?.name)
            .filter((n): n is string => !!n)

          const packCast = runtimeCastRef.current
          // The legacy greeter is chosen BY HOUSE: the player's sigil is treated as
          // their house, and whoever at the table has the sharpest personal
          // angle on that house is the one who looks up — Ned takes the
          // Arryns (fostered in the Vale), Olenna the Hightowers, Daenerys
          // judges anyone wearing her own dragon. Random fallback only when
          // the house is unknown or nobody with an angle is on stage yet.
          const houseId = current.avatar_id
          const banner = getAvatarById(houseId)
          const angle = packCast
            ? null
            : pickGreeterForHouse(houseId, spoken, lastGreeterRef.current)
          let greeter: string
          let house: { name: string; hook?: string } | undefined = banner
            ? { name: banner.name }
            : undefined
          if (angle) {
            greeter = angle.companionId
            if (house) house.hook = angle.hook
          } else {
            const pool = spoken.filter((id) => id !== lastGreeterRef.current)
            greeter = (pool.length ? pool : spoken)[
              Math.floor(Math.random() * (pool.length ? pool.length : spoken.length))
            ]
          }
          lastGreeterRef.current = greeter

          await fireCompanionMessages(
            packCast
              ? buildRuntimeWelcomePrompt(
                  packCast,
                  packCast.voices.find((voice) => voice.id === greeter)!,
                  {
                    playerName: current.name,
                    rosterNames: roster,
                  },
                )
              : buildPlayerWelcomePrompt(greeter, current.name, current.team ?? null, roster, house),
            400,
            buildWelcomeReactionKey(p.id),
            'welcome',
          )
        } catch {
          // Welcomes are decoration — never let one break the host client.
        }
      }
      welcomeTimersRef.current.set(p.id, setTimeout(fire, at - Date.now()))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, isHost, room?.id, runtimeCast])

  // ── Effect 1d: Team declarations and defections ─────────────────────────────
  //
  // Database-owned revisions distinguish repeated transitions and let a host
  // reload recover the latest uncompleted ceremony. Revision zero is inherited
  // baseline state and remains silent.
  const processedTeamRevisionsRef = useRef<Map<string, number>>(new Map())
  const lastTeamEventRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    // These are observation/cooldown cursors, not durable ownership. Reset them
    // at the room boundary so a long-lived provider cannot carry narrative
    // state into a later session; the database reaction keys remain the source
    // of truth for whether the new room still needs its latest revision.
    processedTeamRevisionsRef.current.clear()
    lastTeamEventRef.current.clear()
  }, [room?.id])

  useEffect(() => {
    if (!isHost || !players.length || packCeremony) return
    for (const p of players) {
      const revision = p.team_revision ?? 0
      const processedRevision = processedTeamRevisionsRef.current.get(p.id) ?? 0
      if (revision <= processedRevision) continue
      processedTeamRevisionsRef.current.set(p.id, revision)

      const was = p.previous_team ?? null
      const now = p.team ?? null
      if (!now) continue // clearing a team is not an event
      // A declaration BEFORE the welcome is folded into the welcome itself.
      if (!was && !p.welcomed_at) continue
      const last = lastTeamEventRef.current.get(p.id) ?? 0
      if (Date.now() - last < 90_000) continue
      lastTeamEventRef.current.set(p.id, Date.now())

      const label = now === 'black' ? 'Team Black' : 'Team Green'
      void insertClaimedSystemDivider(
        buildTeamChangeReactionKey(p.id, revision, 'announcement'),
        `${p.name} ${was ? 'defects to' : 'declares for'} ${label}`,
      ).catch(() => undefined)

      const tid = setTimeout(async () => {
        try {
          const current = playersRef.current.find((player) => player.id === p.id)
          if ((current?.team_revision ?? 0) !== revision) return
          const spoken = await spokenCompanionIds()
          if (!spoken.length) return
          const greeter = spoken[Math.floor(Math.random() * spoken.length)]
          const roster = draftPicksRef.current
            .filter((dp) => dp.player_id === p.id)
            .map((dp) => draftEntitiesRef.current.find((e) => e.id === dp.entity_id)?.name)
            .filter((n): n is string => !!n)
          await fireCompanionMessages(
            buildTeamChangePrompt(greeter, p.name, was, now, revision, roster),
            400,
            buildTeamChangeReactionKey(p.id, revision, 'reaction'),
            'team_change',
          )
        } catch { /* decoration */ }
      }, 6_000 + Math.random() * 6_000)
      pendingTimeoutsRef.current.push(tid)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, isHost, packCeremony])

  // ── Effect 1e: Pack-authored identity revisions ────────────────────────────
  // The selection row is the fact. Revision zero is a silent initial banner;
  // only an exact live transition with a retained prior choice enters ceremony.
  const processedIdentityRevisionsRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    processedIdentityRevisionsRef.current.clear()
  }, [room?.id])

  useEffect(() => {
    const packCast = runtimeCastRef.current
    if (!isHost || !packCast?.identityChange || !identityDataReady
      || !narrativeDataReady) return
    for (const selection of identitySelections) {
      const revision = selection.revision ?? 0
      const processed = processedIdentityRevisionsRef.current.get(selection.player_id) ?? 0
      if (revision <= processed) continue
      if (revision < 1 || selection.changed_in_phase !== 'live'
        || !selection.previous_choice_key
        || selection.previous_choice_key === selection.choice_key) continue

      const player = playersRef.current.find((candidate) => candidate.id === selection.player_id)
      const voice = selectRuntimeIdentityChangeVoice(packCast, selection.player_id, revision)
      if (!player || !voice) continue
      processedIdentityRevisionsRef.current.set(selection.player_id, revision)
      const stillCurrent = () => {
        const current = identitySelectionsRef.current.find(
          (candidate) => candidate.player_id === selection.player_id,
        )
        return isHostRef.current && identityDataReadyRef.current
          && narrativeDataReadyRef.current
          && roomRef.current?.phase === 'live'
          && current?.revision === revision
          && current.choice_key === selection.choice_key
          && current.previous_choice_key === selection.previous_choice_key
      }

      void (async () => {
        const shouldReact = await insertClaimedSystemDivider(
          buildIdentityChangeReactionKey(selection.player_id, revision, 'announcement'),
          `${player.name} changes from ${selection.previous_choice_key} to ${selection.choice_key}`,
          undefined,
          undefined,
          stillCurrent,
        )
        if (!shouldReact || !stillCurrent()) return
        const roster = draftPicksRef.current
          .filter((pick) => pick.player_id === selection.player_id)
          .map((pick) => draftEntitiesRef.current.find((entity) => entity.id === pick.entity_id)?.name)
          .filter((name): name is string => !!name)
        await fireCompanionMessages(
          buildRuntimeIdentityChangePrompt(packCast, voice, {
            playerName: player.name,
            previousChoice: selection.previous_choice_key!,
            choice: selection.choice_key,
            revision,
            rosterNames: roster,
          }),
          400,
          buildIdentityChangeReactionKey(selection.player_id, revision, 'reaction'),
          'identity_change',
          undefined,
          stillCurrent,
        )
      })().catch(() => undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    identitySelections,
    identityDataReady,
    narrativeDataReady,
    isHost,
    runtimeCast,
    room?.id,
  ])

  // ── Effect 1f: Bingo declarations ───────────────────────────────────────────
  //
  // The design principle for the whole night: nobody narrates the episode.
  // The GAME's declarations are the event stream — a GM-logged beat is one
  // kind, and an approved honor-system bingo mark is the other. "Someone says
  // 'Dracarys' — confirmed" tells the cast what happened on screen without
  // anyone typing a play-by-play.
  //
  // Squares are LIGHT: probability-gated and cooled down hard, because on a
  // heavy episode approvals cluster and a reaction per square would be a
  // metronome. A completed LINE is a game moment and always lands, with the
  // player's name on it.
  const processedMarkIdsRef = useRef<Set<string>>(new Set())
  const lastSquareReactionAtRef = useRef(0)
  const bingoSquaresCacheRef = useRef<Map<number, string> | null>(null)

  useEffect(() => {
    processedMarkIdsRef.current = new Set()
    lastSquareReactionAtRef.current = 0
    bingoSquaresCacheRef.current = null
  }, [room?.id])

  useEffect(() => {
    if (!roomIdForBingo || !isHost || packCeremony) return

    async function squareText(id: number): Promise<string | null> {
      if (!bingoSquaresCacheRef.current) {
        if (!roomRef.current) return null
        const { data } = await supabase
          .from('bingo_squares').select('id, text')
          .eq('show_pack_id', roomRef.current.show_pack_id)
        bingoSquaresCacheRef.current = new Map(
          (data ?? []).map((sq) => [sq.id as number, sq.text as string]),
        )
      }
      return bingoSquaresCacheRef.current.get(id) ?? null
    }

    async function onMark(mark: BingoMarkRow) {
      if (!isHostRef.current) return
      if (mark.status !== 'approved') return
      if (processedMarkIdsRef.current.has(mark.id)) return
      processedMarkIdsRef.current.add(mark.id)

      // bingo_marks carries no room_id — resolve through the card, and drop
      // marks from other rooms (the subscription cannot filter them out).
      const { data: card } = await supabase
        .from('bingo_cards')
        .select('id, room_id, player_id, squares')
        .eq('id', mark.card_id)
        .maybeSingle()
      if (!card || card.room_id !== roomRef.current?.id) return

      const player = playersRef.current.find((p) => p.id === card.player_id)
      if (!player) return

      // Line detection first — a new completed line outranks the square gate.
      const { data: approved, error: approvedError } = await supabase
        .from('bingo_marks')
        .select('id, card_id, square_index, status, marked_at')
        .eq('card_id', card.id)
        .eq('status', 'approved')
      if (approvedError) return

      const squareId = (card.squares as number[])[mark.square_index]
      const text = squareId ? await squareText(squareId) : null
      if (!text) return

      const isNewLine = didBingoMarkCompleteLine(mark, approved ?? [])

      // Every mark lands in chat as a divider — the room should SEE claims
      // even when no companion comments. Delayed ~8s and re-verified so an
      // instant undo stays silent.
      {
        const tid = setTimeout(() => {
          void (async () => {
            const { data: still } = await supabase
              .from('bingo_marks').select('id, status').eq('id', mark.id).maybeSingle()
            if (!still || still.status !== 'approved') return
            await insertClaimedSystemDivider(
              buildBingoReactionKey(mark.id, 'announcement'),
              isNewLine
                ? `BINGO — ${player.name} completes a line: "${text}"`
                : `${player.name} marked: "${text}"`,
            )
          })()
        }, 8_000)
        pendingTimeoutsRef.current.push(tid)
      }

      if (!isNewLine) {
        // Square-level throttle: at most one reaction per 2.5 minutes, and
        // even then only some squares get one. Silence is a valid reaction.
        if (Date.now() - lastSquareReactionAtRef.current < 150_000) return
        if (Math.random() > 0.45) return
      }
      lastSquareReactionAtRef.current = Date.now()

      const spoken = await spokenCompanionIds()
      if (!spoken.length) return
      const who = spoken[Math.floor(Math.random() * spoken.length)]
      // ~10s human lag, then RE-VERIFY the mark still exists before speaking.
      // Marks are honor-system now and tapping again is the undo — a companion
      // reacting to a misclick that was already taken back would be worse than
      // a short delay. The lag doubles as the misclick grace window: a fat-
      // finger gets noticed and untapped within seconds or not at all.
      const tid = setTimeout(() => {
        void (async () => {
          const { data: still } = await supabase
            .from('bingo_marks')
            .select('id, status')
            .eq('id', mark.id)
            .maybeSingle()
          if (!still || still.status !== 'approved') return
          await fireCompanionMessages(
            buildBingoReactionPrompt(who, player.name, text, isNewLine ? 'line' : 'square'),
            400,
            buildBingoReactionKey(mark.id, 'reaction'),
            'bingo',
          )
        })()
      }, 8_000 + Math.random() * 4_000)
      pendingTimeoutsRef.current.push(tid)
    }

    const channel = supabase
      .channel(`bingo-reactions:${roomIdForBingo}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bingo_marks' },
        (payload) => void onMark(payload.new as never))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bingo_marks' },
        (payload) => void onMark(payload.new as never))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomIdForBingo, isHost, packCeremony])

  // ── Effect 2: Winner reactions ────────────────────────────────────────────────
  // First meaningful data load: initialize seen set without firing reactions.
  // Subsequent updates: fire for genuinely new winners only.

  useEffect(() => {
    if (!isHost || !categories.length || packCeremony) return

    if (!dataInitializedRef.current) {
      // Mark all currently-announced categories as already seen
      categories.filter((c) => c.winner_id != null).forEach((c) => previousWinnersRef.current.add(c.id))

      // Pre-populate milestoneFiredRef for any thresholds already passed so
      // Effect 5 (milestone reactions) doesn't re-fire them on page reload.
      const count = categories.filter((c) => c.winner_id != null).length
      if (count >= 6) milestoneFiredRef.current.add('halfway')
      if (count >= 12) milestoneFiredRef.current.add('final_stretch')
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
          // Ground the reaction in the researched dossier for whoever the GM
          // named — without this the model invents this season wholesale.
          buildCategoryContext(cat.name, winner?.name),
          // How far into the night we are. Drives Daenerys' drift from warm to
          // cold across the episode — she has no memory between calls, so this
          // count is the only thing that tells the prompt where she's got to.
          categoriesRef.current.filter((c) => c.winner_id != null).length,
        ),
        700,
        `event:${cat.id}:winner`,
      )
      // Film-link cards used to open the film encyclopedia on the Films tab.
      // That tab is gone, so inserting one now puts a gold, tappable, dead card
      // in the chat after every single logged event. Stopped at the source; the
      // render branch in ChatSection stays for any rows already in the table.
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, isHost, packCeremony])

  // ── Effect 3: Grounded spotlight opening ─────────────────────────────────────
  // The database revision distinguishes close/reopen cycles. A short grace lets
  // an old bundle publish its immediate divider first; that current-opening row
  // becomes the legacy completion sentinel instead of causing a replay.

  useEffect(() => {
    const spotlightId = room?.active_spotlight_category_id ?? null
    const spotlightRevision = room?.spotlight_revision ?? 0
    const spotlightOpenedAt = room?.spotlight_opened_at ?? null
    if (!isHost || !narrativeDataReady || spotlightId == null ||
        spotlightRevision < 1 || !spotlightOpenedAt || !room?.id) return

    const roomId = room.id
    const timer = setTimeout(() => {
      void (async () => {
        const spotlightStillCurrent = () => {
          const currentRoom = roomRef.current
          return isHostRef.current && narrativeDataReadyRef.current &&
            currentRoom?.id === roomId &&
            currentRoom.active_spotlight_category_id === spotlightId &&
            (currentRoom.spotlight_revision ?? 0) === spotlightRevision
        }
        if (!spotlightStillCurrent()) return

        const category = categoriesRef.current.find((candidate) => candidate.id === spotlightId)
        if (!category) return
        const { data: candidateRows, error: candidateError } = await supabase
          .from('category_nominees')
          .select('nominee_id')
          .eq('category_id', spotlightId)
          .order('nominee_id')
        if (candidateError) return
        const candidateIds = (candidateRows ?? []).map((row) => row.nominee_id)
        const categoryNominees = candidateIds
          .map((id) => nomineesRef.current.find((nominee) => nominee.id === id))
          .filter((nominee): nominee is NomineeRow => !!nominee)
        if (categoryNominees.length !== candidateIds.length) return

        const shouldReact = await insertClaimedSystemDivider(
          buildSpotlightReactionKey(spotlightRevision, 'announcement'),
          category.name,
          category.name,
          spotlightOpenedAt,
          spotlightStillCurrent,
        )
        if (!shouldReact) return
        const packCast = runtimeCastRef.current
        await fireCompanionMessages(
          packCast
            ? buildRuntimeSpotlightPrompt(
                packCast,
                selectRuntimeEventCast(packCast),
                {
                  revision: spotlightRevision,
                  label: category.name,
                  candidates: categoryNominees.map((nominee) => nominee.name),
                  wagers: confidencePicksRef.current
                    .filter((pick) => pick.category_id === category.id)
                    .flatMap((pick) => {
                      const player = playersRef.current
                        .find((candidate) => candidate.id === pick.player_id)
                      const outcome = categoryNominees
                        .find((candidate) => candidate.id === pick.nominee_id)
                      return player && outcome ? [{
                        playerName: player.name,
                        outcomeName: outcome.name,
                        conviction: pick.confidence,
                      }] : []
                    }),
                },
              )
            : buildPreCategoryPrompt(
                category,
                spotlightRevision,
                categoryNominees,
                confidencePicksRef.current,
                playersRef.current,
              ),
          700,
          buildSpotlightReactionKey(spotlightRevision, 'reaction'),
          'spotlight',
          undefined,
          spotlightStillCurrent,
        )
      })().catch(() => undefined)
    }, 300)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    room?.id,
    room?.active_spotlight_category_id,
    room?.spotlight_revision,
    room?.spotlight_opened_at,
    isHost,
    narrativeDataReady,
    runtimeCast,
  ])

  // ── Effect 5: Milestone reactions (halfway / final stretch) ───────────────────

  useEffect(() => {
    if (!isHost || !narrativeDataReady) return
    const count = categories.filter((c) => c.winner_id != null).length

    // Milestones fire on absolute event counts, NOT on progress toward a total.
    //
    // The Oscars had a fixed 24-category slate, so "12 of 24" was a real
    // halfway point and "all 24 announced" was a real ending. An episode has
    // neither: categories is an append-only GM event log (see useGameMaster),
    // so the total grows as the host writes and `announced === total` is not a
    // meaningful state. The old `count === total` trigger fired a full
    // "the record is closed, crown the champion" wrap-up mid-episode.
    //
    // The end of the night is now an explicit host action — "End episode" sets
    // room.phase = 'finished', which drives the post-show reactions.

    // Awards-style declarations update the winner before their confidence rows.
    // Wait for that cascade so the grounded fact block cannot freeze a
    // half-scored leaderboard. Room-authored events have no attached picks and
    // pass immediately.
    if (!isMilestoneScoreboardReady(categories, confidencePicks)) return

    const authoredCast = runtimeCastRef.current
    if (authoredCast) {
      for (const milestone of authoredCast.milestones) {
        if (count < milestone.declaredEventCount
          || milestoneFiredRef.current.has(milestone.id)) continue
        milestoneFiredRef.current.add(milestone.id)
        void fireCompanionMessages(
          buildRuntimeMilestonePrompt(
            authoredCast,
            milestone,
            count,
            leaderboardRef.current,
          ),
          700,
          buildRuntimeMilestoneReactionKey(milestone.id),
          'milestone',
        )
      }
      return
    }

    if (count >= 6 && !milestoneFiredRef.current.has('halfway')) {
      milestoneFiredRef.current.add('halfway')
      fireCompanionMessages(
        buildMilestonePrompt('halfway', count, leaderboardRef.current),
        700,
        buildMilestoneReactionKey('halfway'),
        'milestone',
      )
    }

    if (count >= 12 && !milestoneFiredRef.current.has('final_stretch')) {
      milestoneFiredRef.current.add('final_stretch')
      fireCompanionMessages(
        buildMilestonePrompt('final_stretch', count, leaderboardRef.current),
        700,
        buildMilestoneReactionKey('final_stretch'),
        'milestone',
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    categories,
    confidencePicks,
    isHost,
    packCeremony,
    runtimeCast,
    narrativeDataReady,
  ])

  return { isGenerating: false }
}
