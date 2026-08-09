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

import { useEffect, useRef } from 'react'
import { useGame } from '../context/GameContext'
import { supabase } from '../lib/supabase'
import {
  buildChatReactivePrompt,
  buildBanterPrompt,
  parseCompanionResponse,
} from '../lib/companion-prompts'
import { pickBanterResponder } from '../lib/companion-banter'
import { addPendingCompanion, removePendingCompanion } from './companionTypingStore'
import type { RealtimeChannel } from '@supabase/supabase-js'
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
): { predictionsRef: React.MutableRefObject<StoredPrediction[]> } {
  const { room } = useGame()

  // ── Refs — stable across re-renders ──────────────────────────────────────────
  const isHostRef = useRef(isHost)
  isHostRef.current = isHost

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

  // Predictions — read by useAICompanions for delayed callbacks
  const predictionsRef = useRef<StoredPrediction[]>([])

  // Seen message IDs — initialized from existing messages on mount
  const seenMessageIdsRef = useRef<Set<string>>(new Set())
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
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
    }
  }, [])

  // Typing indicators go out on the same broadcast channel useAICompanions uses,
  // so a banter reply gets the same "…is typing" treatment as everything else.
  const typingChannelRef = useRef<RealtimeChannel | null>(null)
  useEffect(() => {
    if (!roomId) return
    const ch = supabase.channel(`room-${roomId}-companion-typing`)
    ch.subscribe()
    typingChannelRef.current = ch
    return () => {
      supabase.removeChannel(ch)
      typingChannelRef.current = null
    }
  }, [roomId])

  function setTyping(companionId: string, typing: boolean) {
    if (typing) addPendingCompanion(companionId)
    else removePendingCompanion(companionId)
    typingChannelRef.current?.send({
      type: 'broadcast',
      event: 'companion_typing',
      payload: { id: companionId, typing },
    })
  }

  // ── Claude API helper ─────────────────────────────────────────────────────────

  async function callClaude(prompt: { system: string; user: string }): Promise<string> {
    const response = await fetch('/api/anthropic/v1/messages', {
      method: 'POST',
      headers: {
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 200,
        // Same reasoning as useAICompanions: on Sonnet 5 an omitted `thinking`
        // runs adaptive, and max_tokens caps thinking + text together — at 200
        // that would return an empty reply every time.
        thinking: { type: 'disabled' },
        output_config: { effort: 'low' },
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

  /**
   * Returns the inserted row id so the caller can record how deep in a banter
   * chain this message sits. Reading the id back here rather than matching on
   * the Realtime echo keeps the depth bookkeeping exact — a guess based on
   * "a message from Olenna arrived at about the right time" would eventually
   * mis-attribute and let a thread run past its cap.
   */
  async function insertMessage(companionId: string, text: string): Promise<string | null> {
    const currentRoom = roomRef.current
    if (!currentRoom) return null
    const { data } = await supabase
      .from('messages')
      .insert({ room_id: currentRoom.id, player_id: companionId, text })
      .select('id')
      .maybeSingle()
    return (data?.id as string | undefined) ?? null
  }

  async function fireChatReaction(
    companionId: string,
    triggerMsg: { playerName: string; text: string },
    triggerType: 'mention' | 'ambient',
    ambientType?: string,
    delayMs = 0,
  ) {
    const fire = async () => {
      if (!isHostRef.current) return
      try {
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
        const raw = await callClaude(prompt)
        if (!raw) return
        const messages = parseCompanionResponse(raw)
        for (const msg of messages) {
          await insertMessage(msg.companion_id, msg.text)
        }
      } catch {
        // Chat reactivity is a nice-to-have — silently fail
      }
    }

    if (delayMs > 0) {
      setTimeout(fire, delayMs)
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

    // Typing appears shortly before the message, not for the whole delay.
    const lead = Math.min(4000, pick.delayMs)
    banterTimeoutsRef.current.push(
      setTimeout(() => setTyping(pick.responderId, true), pick.delayMs - lead),
    )

    banterTimeoutsRef.current.push(
      setTimeout(async () => {
        try {
          if (!isHostRef.current) return
          const prompt = buildBanterPrompt(
            pick.responderId,
            { companionId: msg.player_id, text: msg.text },
            recentMessagesRef.current,
            {
              leaderboard: leaderboardRef.current,
              announcedCount: categoriesRef.current.filter((c) => c.winner_id != null).length,
            },
          )
          const raw = await callClaude(prompt)
          if (!raw) return
          for (const out of parseCompanionResponse(raw)) {
            const id = await insertMessage(out.companion_id, out.text)
            // Record the reply's depth so it can be answered at most once more.
            if (id) banterDepthRef.current.set(id, depth + 1)
          }
        } catch {
          // Banter is decoration — never let it break the chat.
        } finally {
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

    const triggerMsg = { playerName: sender.name, text: msg.text }

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
          const msg = payload.new as MessageRow

          // Update recent messages buffer for context
          recentMessagesRef.current = [...recentMessagesRef.current, msg].slice(-10)

          // If the initial fetch hasn't finished yet, buffer the message so it
          // isn't silently dropped. It will be processed once seenMessageIdsRef
          // is populated and we know whether it's truly new.
          if (!initializedRef.current) {
            preInitBufferRef.current.push(msg)
            return
          }
          if (seenMessageIdsRef.current.has(msg.id)) return

          processMessage(msg)
        },
      )
      .subscribe()

    // Fetch existing messages — mark as seen, populate recent buffer
    supabase
      .from('messages')
      .select('id, room_id, player_id, text, created_at')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (data) {
          for (const msg of data as MessageRow[]) {
            seenMessageIdsRef.current.add(msg.id)
            if (COMPANION_IDS.has(msg.player_id)) spokenCompanionsRef.current.add(msg.player_id)
          }
          // Keep last 10 for context buffer
          recentMessagesRef.current = (data as MessageRow[]).slice(-10)
        }
        initializedRef.current = true

        // Drain messages that arrived via Realtime before this fetch completed.
        // Filter out any whose IDs are now in seenMessageIdsRef (they were already
        // in the DB when we fetched, so they're pre-existing, not new).
        const newDuringFetch = preInitBufferRef.current.filter(
          (msg) => !seenMessageIdsRef.current.has(msg.id),
        )
        preInitBufferRef.current = []
        for (const msg of newDuringFetch) {
          processMessage(msg)
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  return { predictionsRef }
}
