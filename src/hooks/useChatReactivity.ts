/**
 * useChatReactivity — makes AI companions react to human chat messages.
 *
 * Three trigger types:
 *   1. Direct mentions — player names a companion → that companion responds (cooldown: 2 min/companion)
 *   2. Ambient reactions — pattern-matched messages fire with ~15-25% probability (cooldown: 5 min global)
 *   3. Prediction storage — messages with nominee names + prediction language are stored for
 *      delayed callbacks when that category's winner is announced (handled in useAICompanions)
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
  parseCompanionResponse,
} from '../lib/companion-prompts'
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

  // ── Claude API helper ─────────────────────────────────────────────────────────

  async function callClaude(prompt: { system: string; user: string }): Promise<string> {
    const response = await fetch('/api/anthropic/v1/messages', {
      method: 'POST',
      headers: {
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 200,
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
      }),
    })
    if (!response.ok) return ''
    const data = await response.json()
    return (data?.content?.[0]?.text ?? '') as string
  }

  async function insertMessage(companionId: string, text: string) {
    const currentRoom = roomRef.current
    if (!currentRoom) return
    await supabase.from('messages').insert({
      room_id: currentRoom.id,
      player_id: companionId,
      text,
    })
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

  // ── Message processor ─────────────────────────────────────────────────────────

  function processMessage(msg: MessageRow) {
    if (!isHostRef.current) return
    if (COMPANION_IDS.has(msg.player_id)) return // Skip AI messages
    if (msg.player_id === 'system') return // Skip system dividers

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
