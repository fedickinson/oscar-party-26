/**
 * useChatReactivity — makes AI companions react to human chat messages.
 *
 * Four trigger types:
 *   1. Direct mentions — player names a companion → that companion responds
 *   2. Ambient reactions — pattern-matched messages fire probabilistically
 *   3. Prediction storage — messages with entity names + prediction language are stored for
 *      delayed callbacks when that entity next scores (handled in useAICompanions)
 *   4. Banter — a companion answers ANOTHER companion. See lib/companion-banter
 *      for who answers whom, and maybeBanter() below for the four throttles that
 *      keep it from turning the chat into a wall of AI talking to itself.
 *
 * Only the host calls the Claude API and inserts messages.
 * Subscribes independently to the messages table — existing messages on mount are marked
 * as seen and not re-processed.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useGame } from '../context/GameContext'
import { supabase } from '../lib/supabase'
import {
  buildChatReactivePrompt,
  buildBanterPrompt,
} from '../lib/companion-prompts'
import { pickBanterResponder } from '../lib/companion-banter'
import { buildCompanionReactionKey } from '../lib/companion-reaction'
import {
  planInitialReactiveTranscript,
  planReactiveTranscriptReconciliation,
} from '../lib/reactive-transcript'
import { addPendingCompanion, removePendingCompanion } from './companionTypingStore'
import { fetchAllRows } from './fetch-all-rows'
import {
  acquireCompanionTypingChannel,
  type CompanionTypingChannelHandle,
} from './companionTypingChannel'
import {
  detectMentions,
  detectAmbientTrigger,
  shouldFireAmbient,
  detectPrediction,
  isCooldownActive,
  type StoredPrediction,
} from '../lib/chat-reactivity-utils'
import { COMPANION_IDS } from '../data/ai-companions'
import type { CategoryRow, NomineeRow, PlayerRow, MessageRow } from '../types/database'
import type { ScoredPlayer } from '../lib/scoring'
import {
  groundedCompanionBatch,
  type GroundingModelRequest,
} from '../../api/_grounding'

// Cooldown durations — kept short to allow natural back-and-forth conversation
const MENTION_COOLDOWN_MS = 15 * 1000      // 15 seconds per companion (allows rapid conversation)
const AMBIENT_COOLDOWN_MS = 30 * 1000      // 30 seconds global (companions chime in frequently)

// ── Banter throttles ─────────────────────────────────────────────────────────
// Tuned for a 75-minute episode with ~20 logged events. Roughly one
// companion-to-companion exchange every couple of minutes at most, which reads
// as a room that occasionally turns on itself rather than one that never shuts up.
const BANTER_COOLDOWN_MS = 75 * 1000          // global — one exchange starts at a time
const COMPANION_REPLY_COOLDOWN_MS = 150 * 1000 // the same character does not keep answering
const BURST_WINDOW_MS = 25 * 1000              // an event batch is landing; stay quiet
// How long the chat must be quiet before banter considers answering. Also the
// debounce that lets a staggered event batch finish landing first.
const BATCH_SETTLE_MS = 20 * 1000
const HUMAN_PRIORITY_MS = 12 * 1000            // somebody just typed; they go first
// Absolute ceiling regardless of everything above: no more than this many
// banter replies in any rolling window. Caps both the noise and the spend.
const BANTER_BUDGET_WINDOW_MS = 10 * 60 * 1000
const BANTER_BUDGET_MAX = 5

export function useChatReactivity(
  roomId: string | undefined,
  players: PlayerRow[],
  nominees: NomineeRow[],
  leaderboard: ScoredPlayer[],
  categories: CategoryRow[],
  isHost: boolean,
  operatorCapability: string | null,
): {
  predictionsRef: React.MutableRefObject<StoredPrediction[]>
  isLoading: boolean
  syncError: string | null
  retrySync: () => void
} {
  const { room } = useGame()
  const [isLoading, setIsLoading] = useState(true)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [retryVersion, setRetryVersion] = useState(0)

  // ── Refs — stable across re-renders ──────────────────────────────────────────
  const isHostRef = useRef(isHost)
  isHostRef.current = isHost
  const operatorCapabilityRef = useRef(operatorCapability)
  operatorCapabilityRef.current = operatorCapability

  const playersRef = useRef(players)
  playersRef.current = players
  const nomineesRef = useRef(nominees)
  nomineesRef.current = nominees
  const leaderboardRef = useRef(leaderboard)
  leaderboardRef.current = leaderboard
  const categoriesRef = useRef(categories)
  categoriesRef.current = categories
  const roomRef = useRef(room)
  roomRef.current = room
  const reactionInstanceRef = useRef(crypto.randomUUID())

  // Predictions — read by useAICompanions for delayed callbacks
  const predictionsRef = useRef<StoredPrediction[]>([])

  // Seen message IDs — initialized from existing messages on mount
  const seenMessageIdsRef = useRef<Set<string>>(new Set())
  // Realtime callbacks are new work even when the same row is already present
  // in an overlapping hydration snapshot. This set deduplicates callback
  // delivery without confusing “present in the database” with “processed.”
  const processedRealtimeIdsRef = useRef<Set<string>>(new Set())
  const initializedRef = useRef(false)
  // Buffer for messages that arrived via Realtime before the initial fetch completed.
  // Processed once initialization is done so they are not silently dropped.
  const preInitBufferRef = useRef<MessageRow[]>([])

  // Cooldown tracking
  const lastMentionResponseRef = useRef<Map<string, number>>(new Map())
  const lastAmbientResponseRef = useRef<number>(0)

  // Recent messages buffer for context in prompts
  const recentMessagesRef = useRef<MessageRow[]>([])

  // ── Banter bookkeeping ───────────────────────────────────────────────────────
  // Depth of each banter-generated message, by message id. Anything absent is
  // depth 0 — i.e. it was a reaction to an event or to a player, and is fair
  // game to answer. Capped so a long evening does not grow it without bound.
  const banterDepthRef = useRef<Map<string, number>>(new Map())
  const lastBanterAtRef = useRef<number>(0)
  const lastCompanionReplyAtRef = useRef<Map<string, number>>(new Map())
  // Timestamps of recent companion messages — used to detect an event batch
  // landing, during which banter must stay out of the way.
  const recentCompanionAtRef = useRef<number[]>([])
  const lastHumanAtRef = useRef<number>(0)
  const banterTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const reactionTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])
  // Timestamps of banter replies actually scheduled, for the rolling budget.
  const banterSentAtRef = useRef<number[]>([])
  // Debounce state — the most recent companion message, and the timer that will
  // decide whether anyone answers it once the chat goes quiet.
  const lastCompanionMsgRef = useRef<MessageRow | null>(null)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Which companions have posted at all tonight. Seeded from the initial fetch
  // so a host reload does not resurrect somebody's entrance.
  const spokenCompanionsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    return () => {
      banterTimeoutsRef.current.forEach(clearTimeout)
      banterTimeoutsRef.current = []
      reactionTimeoutsRef.current.forEach(clearTimeout)
      reactionTimeoutsRef.current = []
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
    }
  }, [])

  // Typing indicators go out on the same broadcast channel useAICompanions uses,
  // so a banter reply gets the same "…is typing" treatment as everything else.
  const typingChannelRef = useRef<CompanionTypingChannelHandle | null>(null)
  useEffect(() => {
    if (!roomId) {
      setIsLoading(false)
      setSyncError(null)
      return
    }
    const channel = acquireCompanionTypingChannel(roomId)
    typingChannelRef.current = channel
    return () => {
      channel.release()
      typingChannelRef.current = null
    }
  }, [roomId])

  function setTyping(companionId: string, typing: boolean) {
    if (typing) addPendingCompanion(companionId)
    else removePendingCompanion(companionId)
    void typingChannelRef.current?.send({ id: companionId, typing })
  }

  // ── Claude API helper ─────────────────────────────────────────────────────────

  async function callClaude(
    prompt: { system: string; user: string },
    maxTokens = 200,
    model: GroundingModelRequest['model'] = 'claude-haiku-4-5',
  ): Promise<string> {
    const response = await fetch('/api/anthropic/v1/messages', {
      method: 'POST',
      headers: {
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        // Haiku generates the reply deliberately — THIS is the path where
        // latency is felt: a human just addressed a companion and is watching.
        // Benchmarked ~2x faster than Sonnet (~2s vs ~4s to last token) with
        // voice holding up on one-liners. The shared grounding engine still
        // uses Sonnet for the factual audit; `model` varies because this helper
        // carries both calls through the same browser proxy.
        model,
        max_tokens: maxTokens,
        // This is the busiest caller of the night — one call per player message
        // that earns a reply. CHAT_REACTIVE_SYSTEM is identical every time.
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
    const blocks = (data?.content ?? []) as Array<{ type?: string; text?: string }>
    return (blocks.find((b) => b.type === 'text')?.text ?? '') as string
  }

  async function claimReaction(roomId: string, reactionKey: string): Promise<boolean> {
    const { data, error } = await supabase.rpc('claim_browser_companion_reaction_authorized', {
      p_room_id: roomId,
      p_reaction_key: reactionKey,
      p_instance_id: reactionInstanceRef.current,
      p_lease_seconds: 60,
      p_operator_capability: operatorCapabilityRef.current,
    })
    if (error) throw error
    return (data as Array<{ claimed?: boolean }> | null)?.[0]?.claimed === true
  }

  async function completeReaction(
    roomId: string,
    reactionKey: string,
    messages: Array<{ companion_id: string; text: string }>,
  ): Promise<string[]> {
    const { data, error } = await supabase.rpc('complete_browser_companion_reaction_authorized', {
      p_room_id: roomId,
      p_reaction_key: reactionKey,
      p_instance_id: reactionInstanceRef.current,
      p_messages: messages.map((message) => ({
        player_id: message.companion_id,
        text: message.text,
      })),
      p_operator_capability: operatorCapabilityRef.current,
    })
    if (error) throw error
    const result = (data as Array<{
      completed?: boolean
      output_message_ids?: string[]
    }> | null)?.[0]
    return result?.completed ? (result.output_message_ids ?? []) : []
  }

  async function releaseReaction(roomId: string, reactionKey: string): Promise<void> {
    await supabase.rpc('release_browser_companion_reaction_authorized', {
      p_room_id: roomId,
      p_reaction_key: reactionKey,
      p_instance_id: reactionInstanceRef.current,
      p_operator_capability: operatorCapabilityRef.current,
    })
  }

  async function fireChatReaction(
    companionId: string,
    triggerMsg: { messageId: string; playerName: string; text: string },
    triggerType: 'mention' | 'ambient',
    ambientType?: string,
    delayMs = 0,
  ) {
    const reactionRoomId = roomRef.current?.id
    if (!reactionRoomId) return
    const reactionKey = buildCompanionReactionKey(
      triggerMsg.messageId,
      triggerType,
      companionId,
    )
    const fire = async () => {
      if (!isHostRef.current || roomRef.current?.id !== reactionRoomId) return
      let claimed = false
      let completed = false
      try {
        claimed = await claimReaction(reactionRoomId, reactionKey)
        if (!claimed || roomRef.current?.id !== reactionRoomId) return
        const prompt = buildChatReactivePrompt(
          companionId,
          triggerMsg,
          recentMessagesRef.current,
          {
            leaderboard: leaderboardRef.current,
            announcedCount: categoriesRef.current.filter((c) => c.winner_id != null).length,
          },
          triggerType,
          ambientType,
        )
        const grounded = await groundedCompanionBatch({
          system: prompt.system,
          user: prompt.user,
          facts: prompt.groundingFacts,
          model: 'claude-haiku-4-5',
          maxTokens: 200,
          maxRetries: 1,
          expectedCompanionIds: [companionId],
          allowEmptyBatch: true,
          caller: (request) => callClaude(
            { system: request.system, user: request.user },
            request.maxTokens,
            request.model,
          ),
        })
        if (roomRef.current?.id !== reactionRoomId) return
        if (grounded.findings.length > 0) {
          const currentRoom = roomRef.current
          if (currentRoom?.host_id) {
            const { error: reviewError } = await supabase.rpc('record_companion_grounding_review_authorized', {
              p_room_id: reactionRoomId,
              p_actor_player_id: currentRoom.host_id,
              p_reaction_key: reactionKey,
              p_surface: 'chat',
              p_engine: 'browser',
              p_facts: prompt.groundingFacts,
              p_attempted_messages: grounded.messages,
              p_findings: grounded.findings,
              p_attempts: grounded.attempts,
              p_model: 'claude-haiku-4-5',
              p_operator_capability: operatorCapabilityRef.current,
            })
            if (reviewError) console.error('Could not preserve blocked chat prose:', reviewError)
          }
          return
        }
        if (grounded.messages.length === 0) return
        const outputIds = await completeReaction(reactionRoomId, reactionKey, grounded.messages)
        completed = outputIds.length > 0
      } catch {
        // Chat reactivity is a nice-to-have — silently fail
      } finally {
        if (claimed && !completed) await releaseReaction(reactionRoomId, reactionKey)
      }
    }

    if (delayMs > 0) {
      reactionTimeoutsRef.current.push(setTimeout(fire, delayMs))
    } else {
      await fire()
    }
  }

  // ── Companion-to-companion banter ────────────────────────────────────────────
  //
  // The dangerous one. Every guard below exists because without it the chat
  // either floods or never stops:
  //
  //   depth cap      — a reply can be replied to once, then the thread dies
  //   global cooldown— at most one exchange starts per BANTER_COOLDOWN_MS
  //   burst gate     — an event fires 2-4 staggered messages; piling banter on
  //                    top of that is how you get twelve messages in a minute
  //   human priority — if somebody just typed, they get answered, not talked over
  //
  // Any one of these alone is insufficient. The burst gate in particular is
  // what keeps a heavy stretch of the episode readable.

  /**
   * Companion messages arrive in BATCHES — an event fires Ned at 0s and two or
   * three others staggered behind him. Deciding on each message as it lands
   * targets whoever spoke FIRST, which is always Ned, and the interesting pairs
   * (Olenna after Joffrey, Cersei after Tyrion) never get a turn. A simulation
   * over 200 episodes had 40% of all banter answering the narrator.
   *
   * So: debounce. Wait for the batch to settle, then answer whoever had the LAST
   * word. That is both the correct target dramatically — you reply to the thing
   * still hanging in the air — and the one that produces the pairings the
   * affinity table was written for.
   */
  function scheduleBanterCheck(msg: MessageRow) {
    lastCompanionMsgRef.current = msg
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
    settleTimerRef.current = setTimeout(() => {
      const latest = lastCompanionMsgRef.current
      if (latest) maybeBanter(latest)
    }, BATCH_SETTLE_MS)
  }

  function maybeBanter(msg: MessageRow) {
    const now = Date.now()
    const depth = banterDepthRef.current.get(msg.id) ?? 0

    // Hard ceiling, independent of every other guard. The depth map is written
    // when the insert returns, and in the vanishingly unlikely case the Realtime
    // echo beats that write a reply would look like depth 0 and could extend a
    // chain. This backstop bounds the damage — and bounds the API spend — no
    // matter how the timing falls.
    banterSentAtRef.current = banterSentAtRef.current.filter(
      (t) => now - t < BANTER_BUDGET_WINDOW_MS,
    )
    if (banterSentAtRef.current.length >= BANTER_BUDGET_MAX) return

    if (isCooldownActive(lastBanterAtRef.current, BANTER_COOLDOWN_MS)) return

    // An event batch is mid-flight — stay out of it.
    const inBurst =
      recentCompanionAtRef.current.filter((t) => now - t < BURST_WINDOW_MS).length >= 2
    if (inBurst) return

    // A human is mid-thought. They outrank the cast.
    if (now - lastHumanAtRef.current < HUMAN_PRIORITY_MS) return

    const onCooldown = [...lastCompanionReplyAtRef.current.entries()]
      .filter(([, t]) => isCooldownActive(t, COMPANION_REPLY_COOLDOWN_MS))
      .map(([id]) => id)

    // Nobody may ARRIVE via a banter reply. The pre-show introductions are ~75s
    // apart, which is longer than the settle window, so every intro triggers a
    // check — and without this a companion who has not introduced themselves yet
    // could answer one. That is merely odd for most of the cast and fatal for
    // Joffrey, whose entire bit is that he turns up unannounced after the
    // episode starts. A character's first message of the night is always their
    // own entrance.
    const notYetArrived = [...COMPANION_IDS].filter((id) => !spokenCompanionsRef.current.has(id))

    const pick = pickBanterResponder(msg.player_id, depth, [...onCooldown, ...notYetArrived])
    if (!pick) return

    lastBanterAtRef.current = now
    lastCompanionReplyAtRef.current.set(pick.responderId, now)
    banterSentAtRef.current.push(now)
    const banterRoomId = roomRef.current?.id
    if (!banterRoomId) return
    const reactionKey = buildCompanionReactionKey(msg.id, 'banter', pick.responderId)

    // Typing appears shortly before the message, not for the whole delay.
    const lead = Math.min(4000, pick.delayMs)
    banterTimeoutsRef.current.push(
      setTimeout(() => setTyping(pick.responderId, true), pick.delayMs - lead),
    )

    banterTimeoutsRef.current.push(
      setTimeout(async () => {
        let claimed = false
        let completed = false
        try {
          if (!isHostRef.current || roomRef.current?.id !== banterRoomId) return
          claimed = await claimReaction(banterRoomId, reactionKey)
          if (!claimed || roomRef.current?.id !== banterRoomId) return
          const prompt = buildBanterPrompt(
            pick.responderId,
            { messageId: msg.id, companionId: msg.player_id, text: msg.text },
            recentMessagesRef.current,
            {
              leaderboard: leaderboardRef.current,
              announcedCount: categoriesRef.current.filter((c) => c.winner_id != null).length,
            },
          )
          const grounded = await groundedCompanionBatch({
            system: prompt.system,
            user: prompt.user,
            facts: prompt.groundingFacts,
            model: 'claude-haiku-4-5',
            maxTokens: 200,
            maxRetries: 1,
            expectedCompanionIds: [pick.responderId],
            allowEmptyBatch: true,
            caller: (request) => callClaude(
              { system: request.system, user: request.user },
              request.maxTokens,
              request.model,
            ),
          })
          if (roomRef.current?.id !== banterRoomId) return
          if (grounded.findings.length > 0) {
            const currentRoom = roomRef.current
            if (currentRoom?.host_id) {
              const { error: reviewError } = await supabase.rpc('record_companion_grounding_review_authorized', {
                p_room_id: banterRoomId,
                p_actor_player_id: currentRoom.host_id,
                p_reaction_key: reactionKey,
                p_surface: 'banter',
                p_engine: 'browser',
                p_facts: prompt.groundingFacts,
                p_attempted_messages: grounded.messages,
                p_findings: grounded.findings,
                p_attempts: grounded.attempts,
                p_model: 'claude-haiku-4-5',
                p_operator_capability: operatorCapabilityRef.current,
              })
              if (reviewError) console.error('Could not preserve blocked banter prose:', reviewError)
            }
            return
          }
          if (grounded.messages.length === 0) return
          const outputIds = await completeReaction(banterRoomId, reactionKey, grounded.messages)
          completed = outputIds.length > 0
          // Record every inserted reply's depth so it can be answered at most
          // once more. IDs come from the same transaction that seals the claim.
          outputIds.forEach((id) => banterDepthRef.current.set(id, depth + 1))
        } catch {
          // Banter is decoration — never let it break the chat.
        } finally {
          if (claimed && !completed) await releaseReaction(banterRoomId, reactionKey)
          setTyping(pick.responderId, false)
          // Keep the depth map from growing all night.
          if (banterDepthRef.current.size > 200) banterDepthRef.current.clear()
        }
      }, pick.delayMs),
    )
  }

  // ── Message processor ─────────────────────────────────────────────────────────

  function processMessage(msg: MessageRow) {
    if (!isHostRef.current) return
    if (msg.player_id === 'system') return // Skip system dividers

    // Companion messages do not go through mention/ambient detection — they feed
    // the banter path instead, which is the only place a companion answers one.
    if (COMPANION_IDS.has(msg.player_id)) {
      spokenCompanionsRef.current.add(msg.player_id)
      recentCompanionAtRef.current = [
        ...recentCompanionAtRef.current.filter((t) => Date.now() - t < BURST_WINDOW_MS * 2),
        Date.now(),
      ]
      scheduleBanterCheck(msg)
      return
    }

    lastHumanAtRef.current = Date.now()

    const sender = playersRef.current.find((p) => p.id === msg.player_id)
    if (!sender) return

    const triggerMsg = { messageId: msg.id, playerName: sender.name, text: msg.text }

    // 1. Detect predictions for delayed callbacks
    const nomineeNames = detectPrediction(msg.text, nomineesRef.current)
    if (nomineeNames.length > 0) {
      predictionsRef.current = [
        ...predictionsRef.current,
        {
          playerName: sender.name,
          playerId: sender.id,
          text: msg.text,
          nomineeNames,
          timestamp: Date.now(),
        },
      ]
      // Cap at 20 stored predictions to avoid unbounded growth
      if (predictionsRef.current.length > 20) {
        predictionsRef.current = predictionsRef.current.slice(-20)
      }
    }

    // 2. Direct mentions — check cooldowns per companion
    const mentioned = detectMentions(msg.text)
    if (mentioned.length > 0) {
      const eligibleMentions = mentioned.filter((companionId) => {
        const last = lastMentionResponseRef.current.get(companionId) ?? 0
        return !isCooldownActive(last, MENTION_COOLDOWN_MS)
      })

      for (let i = 0; i < eligibleMentions.length; i++) {
        const companionId = eligibleMentions[i]
        lastMentionResponseRef.current.set(companionId, Date.now())
        // Stagger if multiple companions mentioned (short delay for natural feel)
        fireChatReaction(companionId, triggerMsg, 'mention', undefined, i * 1500)
      }

      // If a direct mention was handled, skip ambient checks
      if (eligibleMentions.length > 0) return
    }

    // 3. Ambient reactions — global cooldown gate + probability
    if (isCooldownActive(lastAmbientResponseRef.current, AMBIENT_COOLDOWN_MS)) return

    const trigger = detectAmbientTrigger(msg.text)
    if (!trigger) return
    if (!shouldFireAmbient(trigger)) return

    // Pick one companion from the trigger's companion list
    const companionId = trigger.companions[Math.floor(Math.random() * trigger.companions.length)]
    lastAmbientResponseRef.current = Date.now()
    fireChatReaction(companionId, triggerMsg, 'ambient', trigger.type)
  }

  // ── Subscription ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!roomId) return

    let disposed = false
    let subscribed = false
    let hydrationRun = 0
    let stabilizationTimer: ReturnType<typeof setTimeout> | null = null

    setIsLoading(true)
    setSyncError(null)

    initializedRef.current = false
    seenMessageIdsRef.current = new Set()
    processedRealtimeIdsRef.current = new Set()
    preInitBufferRef.current = []
    recentMessagesRef.current = []
    spokenCompanionsRef.current = new Set()
    predictionsRef.current = []
    lastMentionResponseRef.current = new Map()
    lastAmbientResponseRef.current = 0
    banterDepthRef.current = new Map()
    lastBanterAtRef.current = 0
    lastCompanionReplyAtRef.current = new Map()
    recentCompanionAtRef.current = []
    lastHumanAtRef.current = 0
    banterSentAtRef.current = []
    lastCompanionMsgRef.current = null
    banterTimeoutsRef.current.forEach(clearTimeout)
    banterTimeoutsRef.current = []
    reactionTimeoutsRef.current.forEach(clearTimeout)
    reactionTimeoutsRef.current = []
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
    settleTimerRef.current = null

    const processRealtimeOnce = (msg: MessageRow) => {
      if (processedRealtimeIdsRef.current.has(msg.id)) return
      processedRealtimeIdsRef.current.add(msg.id)
      seenMessageIdsRef.current.add(msg.id)
      processMessage(msg)
    }

    const hydrateReactiveTranscript = async () => {
      const run = ++hydrationRun
      try {
        const result = await fetchAllRows<MessageRow>((from, to) => supabase
          .from('messages')
          .select('id, room_id, player_id, text, created_at')
          .eq('room_id', roomId)
          .order('created_at', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to))
        if (result.error) throw result.error
        if (disposed || run !== hydrationRun) return

        const transcript = result.data ?? []
        if (!initializedRef.current) {
          const plan = planInitialReactiveTranscript(
            transcript,
            preInitBufferRef.current,
          )
          seenMessageIdsRef.current = plan.seenIds
          for (const msg of transcript) {
            if (COMPANION_IDS.has(msg.player_id)) spokenCompanionsRef.current.add(msg.player_id)
          }
          recentMessagesRef.current = transcript.slice(-10)
          initializedRef.current = true

          // Every buffered row came from a live INSERT callback after this
          // channel mounted. Process it once even if the overlapping snapshot
          // already contained it; database presence and trigger execution are
          // deliberately separate facts.
          preInitBufferRef.current = []
          for (const msg of plan.toProcess) processRealtimeOnce(msg)
          setSyncError(null)
          setIsLoading(false)
          return
        }

        // A cold worker can report SUBSCRIBED before forwarding WAL. Any row
        // absent from the prior seen set is a missed live insertion and must be
        // processed, not merely adopted as context.
        const plan = planReactiveTranscriptReconciliation(
          transcript,
          seenMessageIdsRef.current,
        )
        seenMessageIdsRef.current = plan.seenIds
        for (const msg of plan.toProcess) {
          processedRealtimeIdsRef.current.add(msg.id)
          processMessage(msg)
        }
        recentMessagesRef.current = transcript.slice(-10)
        setSyncError(null)
        setIsLoading(false)
      } catch (loadError) {
        if (!disposed && run === hydrationRun) {
          console.error('Reactive chat transcript load failed:', loadError)
          setSyncError('The AI chat trigger feed could not be synchronized.')
          setIsLoading(false)
        }
      }
    }

    const channel = supabase
      .channel(`chat-reactive:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          if (disposed) return
          const msg = payload.new as MessageRow

          // Update recent messages buffer for context
          recentMessagesRef.current = [...recentMessagesRef.current, msg].slice(-10)

          // If the initial fetch hasn't finished yet, buffer the message so it
          // isn't silently dropped. It will be processed once seenMessageIdsRef
          // is populated and we know whether it's truly new.
          if (!initializedRef.current) {
            if (!processedRealtimeIdsRef.current.has(msg.id) &&
                !preInitBufferRef.current.some((candidate) => candidate.id === msg.id)) {
              preInitBufferRef.current = [...preInitBufferRef.current, msg].slice(-200)
            }
            return
          }
          processRealtimeOnce(msg)
        },
      )
      .subscribe((status) => {
        if (disposed) return
        if (status === 'SUBSCRIBED') {
          subscribed = true
          void hydrateReactiveTranscript()
          if (stabilizationTimer) clearTimeout(stabilizationTimer)
          stabilizationTimer = setTimeout(() => {
            if (!disposed && subscribed) void hydrateReactiveTranscript()
          }, 5_000)
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          subscribed = false
          hydrationRun += 1
          setSyncError('The AI chat trigger feed could not connect to Realtime.')
          setIsLoading(false)
        }
      })

    return () => {
      disposed = true
      subscribed = false
      hydrationRun += 1
      if (stabilizationTimer) clearTimeout(stabilizationTimer)
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, retryVersion])

  const retrySync = useCallback(() => {
    setIsLoading(true)
    setSyncError(null)
    setRetryVersion((current) => current + 1)
  }, [])

  return { predictionsRef, isLoading, syncError, retrySync }
}
