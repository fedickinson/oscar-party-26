import { useEffect, useRef } from 'react'
import { groundedCompanionBatch, type GroundingModelRequest } from '../../api/_grounding'
import { buildPostShowPrompt } from '../lib/companion-prompts'
import { buildPostShowReactionKey } from '../lib/companion-reaction'
import { supabase } from '../lib/supabase'
import type { ScoredPlayer } from '../lib/scoring'
import type {
  CategoryRow,
  ConfidencePickRow,
  PlayerRow,
} from '../types/database'

interface PostShowCompanionOptions {
  roomId: string | undefined
  hostPlayerId: string | undefined
  isHost: boolean
  operatorCapability: string | null
  ready: boolean
  provisional: boolean
  leaderboard: ScoredPlayer[]
  players: PlayerRow[]
  categories: CategoryRow[]
  confidencePicks: ConfidencePickRow[]
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

export function usePostShowCompanions(options: PostShowCompanionOptions): void {
  const stateRef = useRef(options)
  stateRef.current = options
  const instanceIdRef = useRef(crypto.randomUUID())
  const dueTimersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  useEffect(() => {
    if (!options.roomId || !options.isHost || !options.provisional) return
    const roomId = options.roomId
    const flush = () => {
      void supabase.rpc('deliver_due_companion_reactions', {
        p_room_id: roomId,
        p_limit: 20,
      })
    }
    flush()
    const interval = setInterval(flush, 3_000)
    return () => clearInterval(interval)
  }, [options.roomId, options.isHost, options.provisional])

  useEffect(() => {
    const { roomId, hostPlayerId, isHost, operatorCapability, ready, provisional } = options
    if (!roomId || !hostPlayerId || !isHost || !operatorCapability || !ready || !provisional) return
    let disposed = false

    const stillValid = () => {
      const current = stateRef.current
      return !disposed && current.roomId === roomId && current.hostPlayerId === hostPlayerId &&
        current.isHost && current.ready && current.provisional
    }

    const release = async (reactionKey: string) => {
      await supabase.rpc('release_browser_companion_reaction_authorized', {
        p_room_id: roomId,
        p_reaction_key: reactionKey,
        p_instance_id: instanceIdRef.current,
        p_operator_capability: stateRef.current.operatorCapability,
      })
    }

    const claim = async (reactionKey: string, leaseSeconds: number) => {
      const { data, error } = await supabase.rpc('claim_browser_companion_reaction_authorized', {
        p_room_id: roomId,
        p_reaction_key: reactionKey,
        p_instance_id: instanceIdRef.current,
        p_lease_seconds: leaseSeconds,
        p_operator_capability: stateRef.current.operatorCapability,
      })
      if (error) throw error
      const row = (data as Array<{
        claimed?: boolean
        active_completed_at?: string | null
      }> | null)?.[0]
      return {
        claimed: row?.claimed === true,
        completed: row?.active_completed_at != null,
      }
    }

    const publishDivider = async (): Promise<boolean> => {
      const reactionKey = buildPostShowReactionKey('announcement')
      const ownership = await claim(reactionKey, 60)
      if (!ownership.claimed) return ownership.completed
      let completed = false
      try {
        if (!stillValid()) return false
        const { count, error: legacyError } = await supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('room_id', roomId)
          .eq('player_id', 'system')
          .eq('text', 'Final Standings')
        if (legacyError) throw legacyError
        if (count != null && count > 0) return false
        if (!stillValid()) return false
        const { data, error } = await supabase.rpc('complete_browser_companion_reaction_authorized', {
          p_room_id: roomId,
          p_reaction_key: reactionKey,
          p_instance_id: instanceIdRef.current,
          p_messages: [{ player_id: 'system', text: 'Final Standings' }],
          p_operator_capability: stateRef.current.operatorCapability,
        })
        if (error) throw error
        completed = (data as Array<{ completed?: boolean }> | null)?.[0]?.completed === true
        return completed
      } finally {
        if (!completed) await release(reactionKey)
      }
    }

    const publishFarewell = async () => {
      const reactionKey = buildPostShowReactionKey('reaction')
      const ownership = await claim(reactionKey, 300)
      if (!ownership.claimed) return
      let completed = false
      try {
        if (!stillValid()) return
        const current = stateRef.current
        const prompt = buildPostShowPrompt(
          current.leaderboard,
          current.players,
          current.categories,
          current.confidencePicks,
        )
        const grounded = await groundedCompanionBatch({
          system: prompt.system,
          user: prompt.user,
          facts: prompt.groundingFacts,
          model: 'claude-sonnet-5',
          maxTokens: 1800,
          maxRetries: 2,
          expectedCompanionIds: prompt.expectedCompanionIds,
          expectedDelaySeconds: prompt.expectedDelaySeconds,
          caller: callClaude,
        })
        if (grounded.findings.length > 0) {
          const currentCapability = stateRef.current.operatorCapability
          if (!currentCapability) return
          const { error } = await supabase.rpc('record_companion_grounding_review_authorized', {
            p_room_id: roomId,
            p_actor_player_id: hostPlayerId,
            p_reaction_key: reactionKey,
            p_surface: 'post_show',
            p_engine: 'browser',
            p_facts: prompt.groundingFacts,
            p_attempted_messages: grounded.messages,
            p_findings: grounded.findings,
            p_attempts: grounded.attempts,
            p_model: 'claude-sonnet-5',
            p_operator_capability: currentCapability,
          })
          if (error) console.error('Could not preserve blocked post-show prose:', error)
          return
        }
        if (grounded.messages.length !== 7 || !stillValid()) return
        const latest = stateRef.current
        const latestPrompt = buildPostShowPrompt(
          latest.leaderboard,
          latest.players,
          latest.categories,
          latest.confidencePicks,
        )
        if (JSON.stringify(latestPrompt.groundingFacts) !== JSON.stringify(prompt.groundingFacts)) return
        const { data, error } = await supabase.rpc('schedule_browser_companion_reaction_authorized', {
          p_room_id: roomId,
          p_reaction_key: reactionKey,
          p_instance_id: instanceIdRef.current,
          p_messages: grounded.messages.map((message) => ({
            player_id: message.companion_id,
            text: message.text,
            delay_seconds: message.delay_seconds,
          })),
          p_operator_capability: stateRef.current.operatorCapability,
        })
        if (error) throw error
        completed = (data as Array<{ completed?: boolean }> | null)?.[0]?.completed === true
        if (!completed) return
        for (const delaySeconds of prompt.expectedDelaySeconds.slice(1)) {
          const timer = setTimeout(() => {
            void supabase.rpc('deliver_due_companion_reactions', {
              p_room_id: roomId,
              p_limit: 20,
            })
          }, delaySeconds * 1000 + 50)
          dueTimersRef.current.push(timer)
        }
      } finally {
        if (!completed) await release(reactionKey)
      }
    }

    // The legacy bundle inserts its unkeyed divider at three seconds. The extra
    // grace lets that current deploy-window completion sentinel win cleanly.
    const timer = setTimeout(() => {
      void (async () => {
        if (!(await publishDivider())) return
        await publishFarewell()
      })().catch(() => undefined)
    }, 3_300)

    return () => {
      disposed = true
      clearTimeout(timer)
    }
  }, [
    options.roomId,
    options.hostPlayerId,
    options.isHost,
    options.operatorCapability,
    options.ready,
    options.provisional,
  ])

  useEffect(() => () => {
    dueTimersRef.current.forEach(clearTimeout)
    dueTimersRef.current = []
  }, [options.roomId])
}
