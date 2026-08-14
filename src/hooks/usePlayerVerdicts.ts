/**
 * One grounded keepsake verdict per player, published as one room artifact.
 * Existing complete legacy packets remain readable. An incomplete packet is
 * never a completion sentinel: the host replaces it through one atomic RPC.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  groundedVerdictBatch,
  type GroundingModelRequest,
} from '../../api/_grounding'
import {
  assignVerdictAuthors,
  buildVerdictsPrompt,
} from '../lib/companion-prompts'
import { buildRuntimeVerdictsPrompt } from '../lib/runtime-narrative-prompts'
import {
  assignRuntimeKeepsakeAuthors,
  type PackRuntimeNarrativeCast,
} from '../lib/runtime-narrative'
import { buildVerdictReactionKey } from '../lib/companion-reaction'
import { collectLineCandidates } from '../lib/player-recap'
import { fetchAllRows } from './fetch-all-rows'
import { supabase } from '../lib/supabase'
import type { ScoredPlayer } from '../lib/scoring'
import type { PlayerAward } from '../lib/night-awards'
import type {
  MessageRow,
  PlayerRow,
  PlayerVerdictRow,
} from '../types/database'

interface Args {
  roomId: string | undefined
  hostPlayerId: string | undefined
  isHost: boolean
  operatorCapability: string | null
  playerAwards: PlayerAward[]
  leaderboard: ScoredPlayer[]
  players: PlayerRow[]
  ready: boolean
  recordSource: 'live' | 'settled'
  runtimeCast?: PackRuntimeNarrativeCast | null
}

export interface PlayerVerdictsState {
  verdicts: Map<string, PlayerVerdictRow>
  isGenerating: boolean
}

async function callClaude(request: GroundingModelRequest): Promise<string> {
  const response = await fetch('/api/anthropic/v1/messages', {
    method: 'POST',
    headers: {
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: request.model,
      max_tokens: request.maxTokens,
      thinking: { type: 'disabled' },
      output_config: { effort: 'low' },
      system: [{
        type: 'text',
        text: request.system,
        cache_control: { type: 'ephemeral', ttl: '1h' },
      }],
      messages: [{ role: 'user', content: request.user }],
    }),
  })
  if (!response.ok) return ''
  const data = await response.json()
  const blocks = (data?.content ?? []) as Array<{ type?: string; text?: string }>
  return blocks.find((block) => block.type === 'text')?.text ?? ''
}

function isCompletePlayerSet(rows: PlayerVerdictRow[], playerAwards: PlayerAward[]): boolean {
  if (rows.length !== playerAwards.length || rows.length === 0) return false
  const expected = [...playerAwards.map((award) => award.playerId)].sort()
  const actual = [...new Set(rows.map((row) => row.player_id))].sort()
  return actual.length === rows.length && JSON.stringify(actual) === JSON.stringify(expected)
}

export function usePlayerVerdicts(options: Args): PlayerVerdictsState {
  const [verdicts, setVerdicts] = useState<Map<string, PlayerVerdictRow>>(new Map())
  const [isGenerating, setIsGenerating] = useState(false)
  const stateRef = useRef(options)
  stateRef.current = options
  const instanceIdRef = useRef(crypto.randomUUID())
  const attemptedRoomRef = useRef<string | null>(null)

  const upsertLocal = useCallback((row: PlayerVerdictRow) => {
    setVerdicts((previous) => {
      const next = new Map(previous)
      next.set(row.player_id, row)
      return next
    })
  }, [])

  // Subscribe first. Hydration begins only after the channel is live and is
  // retried if a database event crosses the fetch window.
  useEffect(() => {
    const { roomId, recordSource } = options
    setVerdicts(new Map())
    attemptedRoomRef.current = null
    if (!roomId || recordSource === 'settled') return
    let disposed = false
    let revision = 0

    const hydrate = async (): Promise<void> => {
      const startRevision = revision
      const result = await fetchAllRows<PlayerVerdictRow>((from, to) => supabase
        .from('player_verdicts')
        .select()
        .eq('room_id', roomId)
        .order('player_id')
        .range(from, to))
      if (disposed || result.error) return
      if (revision !== startRevision) {
        await hydrate()
        return
      }
      setVerdicts(new Map((result.data ?? []).map((row) => [row.player_id, row])))
    }

    const channel = supabase
      .channel(`player-verdicts:${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'player_verdicts', filter: `room_id=eq.${roomId}` },
        (payload) => {
          revision += 1
          upsertLocal(payload.new as PlayerVerdictRow)
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'player_verdicts', filter: `room_id=eq.${roomId}` },
        (payload) => {
          revision += 1
          upsertLocal(payload.new as PlayerVerdictRow)
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'player_verdicts', filter: `room_id=eq.${roomId}` },
        (payload) => {
          revision += 1
          const removed = payload.old as Partial<PlayerVerdictRow>
          if (!removed.player_id) return
          setVerdicts((previous) => {
            const next = new Map(previous)
            next.delete(removed.player_id!)
            return next
          })
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void hydrate()
      })

    return () => {
      disposed = true
      void supabase.removeChannel(channel)
    }
  }, [options.roomId, options.recordSource, upsertLocal])

  useEffect(() => {
    const {
      roomId, hostPlayerId, isHost, operatorCapability,
      ready, recordSource, playerAwards,
    } = options
    if (!roomId || !hostPlayerId || !isHost || !operatorCapability
      || !ready || recordSource === 'settled' ||
      playerAwards.length === 0 || playerAwards.length > 7) return
    if (attemptedRoomRef.current === roomId) return
    attemptedRoomRef.current = roomId
    let disposed = false
    const reactionKey = buildVerdictReactionKey()

    const stillValid = () => {
      const current = stateRef.current
      return !disposed && current.roomId === roomId && current.hostPlayerId === hostPlayerId &&
        current.isHost && current.ready && current.recordSource === 'live'
    }
    const release = async () => {
      await supabase.rpc('release_browser_companion_reaction_authorized', {
        p_room_id: roomId,
        p_reaction_key: reactionKey,
        p_instance_id: instanceIdRef.current,
        p_operator_capability: stateRef.current.operatorCapability,
      })
    }

    const generate = async (): Promise<'done' | 'retry-ownership'> => {
      const existing = await fetchAllRows<PlayerVerdictRow>((from, to) => supabase
        .from('player_verdicts')
        .select()
        .eq('room_id', roomId)
        .order('player_id')
        .range(from, to))
      if (existing.error) throw existing.error
      if (isCompletePlayerSet(existing.data ?? [], stateRef.current.playerAwards)) return 'done'

      const { data: claimData, error: claimError } = await supabase.rpc('claim_browser_companion_reaction_authorized', {
        p_room_id: roomId,
        p_reaction_key: reactionKey,
        p_instance_id: instanceIdRef.current,
        p_lease_seconds: 300,
        p_operator_capability: stateRef.current.operatorCapability,
      })
      if (claimError) throw claimError
      const ownership = (claimData as Array<{
        claimed?: boolean
        active_completed_at?: string | null
      }> | null)?.[0]
      if (ownership?.claimed !== true) {
        return ownership?.active_completed_at == null ? 'retry-ownership' : 'done'
      }

      let completed = false
      setIsGenerating(true)
      try {
        if (!stillValid()) return 'done'
        const messageResult = await fetchAllRows<MessageRow>((from, to) => supabase
          .from('messages')
          .select()
          .eq('room_id', roomId)
          .order('created_at')
          .order('id')
          .range(from, to))
        if (messageResult.error) throw messageResult.error
        const messages = messageResult.data ?? []
        const current = stateRef.current
        const playerIds = current.playerAwards.map((award) => award.playerId)
        const authors = current.runtimeCast?.postShow
          ? assignRuntimeKeepsakeAuthors(playerIds, current.runtimeCast)
          : assignVerdictAuthors(playerIds)
        const candidates = collectLineCandidates(
          messages,
          current.players,
          current.runtimeCast?.voices,
        )
        const prompt = current.runtimeCast?.postShow
          ? buildRuntimeVerdictsPrompt(
              current.runtimeCast,
              current.playerAwards,
              current.leaderboard,
              authors,
              candidates,
            )
          : buildVerdictsPrompt(
              current.playerAwards,
              current.leaderboard,
              authors,
              candidates,
            )
        const grounded = await groundedVerdictBatch({
          system: prompt.system,
          user: prompt.user,
          facts: prompt.groundingFacts,
          contracts: prompt.slotContracts,
          model: 'claude-sonnet-5',
          maxTokens: 3000,
          maxRetries: 2,
          caller: callClaude,
        })
        if (grounded.findings.length > 0) {
          const currentCapability = stateRef.current.operatorCapability
          if (!currentCapability) return 'done'
          const { error } = await supabase.rpc('record_companion_grounding_review_authorized', {
            p_room_id: roomId,
            p_actor_player_id: hostPlayerId,
            p_reaction_key: reactionKey,
            p_surface: 'verdict',
            p_engine: 'browser',
            p_facts: prompt.groundingFacts,
            p_attempted_messages: grounded.attemptedMessages,
            p_findings: grounded.findings,
            p_attempts: grounded.attempts,
            p_model: 'claude-sonnet-5',
            p_operator_capability: currentCapability,
          })
          if (error) console.error('Could not preserve blocked keepsake prose:', error)
          return 'done'
        }
        if (grounded.verdicts.length !== prompt.slotContracts.length || !stillValid()) return 'done'

        const latest = stateRef.current
        const latestPlayerIds = latest.playerAwards.map((award) => award.playerId)
        const latestAuthors = latest.runtimeCast?.postShow
          ? assignRuntimeKeepsakeAuthors(latestPlayerIds, latest.runtimeCast)
          : assignVerdictAuthors(latestPlayerIds)
        const latestPrompt = latest.runtimeCast?.postShow
          ? buildRuntimeVerdictsPrompt(
              latest.runtimeCast,
              latest.playerAwards,
              latest.leaderboard,
              latestAuthors,
              candidates,
            )
          : buildVerdictsPrompt(
              latest.playerAwards,
              latest.leaderboard,
              latestAuthors,
              candidates,
            )
        if (JSON.stringify(latestPrompt.groundingFacts) !== JSON.stringify(prompt.groundingFacts) ||
          JSON.stringify(latestPrompt.slotContracts) !== JSON.stringify(prompt.slotContracts)) return 'done'

        const rows = grounded.verdicts.map((verdict, index) => ({
          player_id: prompt.slotContracts[index].playerId,
          companion_id: prompt.slotContracts[index].companionId,
          title: verdict.title,
          verdict: verdict.text,
          highlights: verdict.highlights.map((highlight) => ({
            message_id: highlight.messageId,
            note: highlight.note,
          })),
          imagery: verdict.imagery,
        }))
        const completionRpc = latest.runtimeCast?.postShow
          ? 'complete_grounded_runtime_player_verdicts_authorized'
          : 'complete_grounded_player_verdicts_authorized'
        const { data, error } = await supabase.rpc(completionRpc, {
          p_room_id: roomId,
          p_actor_player_id: hostPlayerId,
          p_reaction_key: reactionKey,
          p_instance_id: instanceIdRef.current,
          p_rows: rows,
          p_facts: prompt.groundingFacts,
          p_attempts: grounded.attempts,
          p_model: 'claude-sonnet-5',
          p_operator_capability: stateRef.current.operatorCapability,
        })
        if (error) throw error
        completed = (data as Array<{ completed?: boolean }> | null)?.[0]?.completed === true
        if (!completed) return 'done'

        const persisted = await fetchAllRows<PlayerVerdictRow>((from, to) => supabase
          .from('player_verdicts')
          .select()
          .eq('room_id', roomId)
          .order('player_id')
          .range(from, to))
        if (!persisted.error && persisted.data) {
          setVerdicts(new Map(persisted.data.map((row) => [row.player_id, row])))
        }
        return 'done'
      } finally {
        if (!completed) await release()
        setIsGenerating(false)
      }
    }

    // The old bundle begins its direct write at 1.5 seconds. This brief grace
    // preserves a complete legacy packet; the atomic path replaces only a
    // missing or partial one and seals later stale writes after completion.
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    const run = () => {
      void generate().then((result) => {
        if (result === 'retry-ownership' && stillValid()) {
          retryTimer = setTimeout(run, 5_000)
        }
      }).catch((error) => {
        console.error('Verdict generation failed:', error)
        setIsGenerating(false)
      })
    }
    const timer = setTimeout(run, 3_300)
    return () => {
      disposed = true
      clearTimeout(timer)
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [
    options.roomId,
    options.hostPlayerId,
    options.isHost,
    options.operatorCapability,
    options.ready,
    options.recordSource,
    options.playerAwards.length,
    options.runtimeCast,
  ])

  return { verdicts, isGenerating }
}
