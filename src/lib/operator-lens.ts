import { isCompanionId } from '../data/ai-companions'
import type { MessageRow, OperatorHeartbeatRow } from '../types/database'

export const ENGINE_HEARTBEAT_STALE_MS = 45_000

export interface OperatorPlayer {
  id: string
  name: string
  is_host: boolean
}

export interface OperatorPresenceMeta {
  player_id: string
  visible: boolean
  tracked_at: string
}

export type OperatorPresenceSignal = 'connecting' | 'live' | 'background' | 'absent'

export interface OperatorPresenceRow {
  player: OperatorPlayer
  signal: OperatorPresenceSignal
  tab_count: number
}

export function derivePresenceRows(
  players: OperatorPlayer[],
  metas: OperatorPresenceMeta[],
  isSynced: boolean,
): OperatorPresenceRow[] {
  const metasByPlayer = new Map<string, OperatorPresenceMeta[]>()
  for (const meta of metas) {
    const current = metasByPlayer.get(meta.player_id) ?? []
    current.push(meta)
    metasByPlayer.set(meta.player_id, current)
  }

  return players.map((player) => {
    const playerMetas = metasByPlayer.get(player.id) ?? []
    let signal: OperatorPresenceSignal = 'connecting'
    if (isSynced) {
      if (playerMetas.some((meta) => meta.visible)) signal = 'live'
      else if (playerMetas.length > 0) signal = 'background'
      else signal = 'absent'
    }
    return { player, signal, tab_count: playerMetas.length }
  })
}

export type NarrativeSequenceStatus =
  | 'loading'
  | 'idle'
  | 'activity_after_fact'
  | 'quiet_after_fact'

export interface NarrativeSequence {
  status: NarrativeSequenceStatus
  pending_fact_count: number
  last_cast_at: string | null
  last_fact_at: string | null
}

function latestMessage(messages: MessageRow[]): MessageRow | null {
  return messages.reduce<MessageRow | null>((latest, message) => {
    if (!latest) return message
    return new Date(message.created_at).getTime() > new Date(latest.created_at).getTime()
      ? message
      : latest
  }, null)
}

export function deriveNarrativeSequence(
  messages: MessageRow[],
  isLoading: boolean,
): NarrativeSequence {
  if (isLoading) {
    return {
      status: 'loading',
      pending_fact_count: 0,
      last_cast_at: null,
      last_fact_at: null,
    }
  }

  const facts = messages.filter((message) => message.player_id === 'winner-divider')
  const cast = messages.filter((message) => isCompanionId(message.player_id))
  const latestFact = latestMessage(facts)
  const latestCast = latestMessage(cast)
  if (!latestFact) {
    return {
      status: 'idle',
      pending_fact_count: 0,
      last_cast_at: latestCast?.created_at ?? null,
      last_fact_at: null,
    }
  }

  const latestCastTime = latestCast
    ? new Date(latestCast.created_at).getTime()
    : Number.NEGATIVE_INFINITY
  const pendingFactCount = facts.filter(
    (message) => new Date(message.created_at).getTime() > latestCastTime,
  ).length

  return {
    status: pendingFactCount > 0 ? 'quiet_after_fact' : 'activity_after_fact',
    pending_fact_count: pendingFactCount,
    last_cast_at: latestCast?.created_at ?? null,
    last_fact_at: latestFact.created_at,
  }
}

export type EngineHeartbeatStatus = 'loading' | 'missing' | 'live' | 'stale'

export interface EngineHeartbeatSignal {
  status: EngineHeartbeatStatus
  age_ms: number | null
  heartbeat_at: string | null
}

export type OperatorReadinessStatus = 'checking' | 'ready' | 'attention'
export type OperatorAttentionReason =
  | 'engine'
  | 'player_signal'
  | 'narrative'
  | 'grounding_review'
  | 'witness_review'

export type OperatorReviewQueueStatus = 'loading' | 'clear' | 'pending' | 'error'

export interface OperatorReviewQueueSignal {
  status: OperatorReviewQueueStatus
  pending_count: number
  error: string | null
}

export interface OperatorReviewQueues {
  grounding: OperatorReviewQueueSignal
  witness: OperatorReviewQueueSignal
}

export function deriveOperatorReviewQueue(
  pendingCount: number,
  isLoading: boolean,
  error: string | null,
): OperatorReviewQueueSignal {
  if (!Number.isInteger(pendingCount) || pendingCount < 0) {
    throw new Error('operator review queue count must be a non-negative integer')
  }
  if (isLoading) return { status: 'loading', pending_count: pendingCount, error: null }
  if (error) return { status: 'error', pending_count: pendingCount, error }
  if (pendingCount > 0) return { status: 'pending', pending_count: pendingCount, error: null }
  return { status: 'clear', pending_count: 0, error: null }
}

export interface OperatorReadiness {
  status: OperatorReadinessStatus
  attention_count: number
  connected_player_count: number
  foreground_player_count: number
  total_player_count: number
  absent_player_count: number
  reasons: OperatorAttentionReason[]
}

export function deriveEngineHeartbeat(
  heartbeat: OperatorHeartbeatRow | null,
  isLoading: boolean,
  nowMs: number,
): EngineHeartbeatSignal {
  if (isLoading) return { status: 'loading', age_ms: null, heartbeat_at: null }
  if (!heartbeat) return { status: 'missing', age_ms: null, heartbeat_at: null }

  const heartbeatMs = new Date(heartbeat.heartbeat_at).getTime()
  if (!Number.isFinite(heartbeatMs)) {
    return { status: 'stale', age_ms: null, heartbeat_at: heartbeat.heartbeat_at }
  }
  const ageMs = Math.max(0, nowMs - heartbeatMs)
  return {
    status: ageMs <= ENGINE_HEARTBEAT_STALE_MS ? 'live' : 'stale',
    age_ms: ageMs,
    heartbeat_at: heartbeat.heartbeat_at,
  }
}

/**
 * Collapses the operator's distinct evidence and review channels into one summary
 * without erasing their meanings. Each failed channel contributes one check;
 * individual absent players remain a detail rather than inflating severity.
 */
export function deriveOperatorReadiness(
  presenceRows: OperatorPresenceRow[],
  narrativeSequence: NarrativeSequence,
  engineHeartbeat: EngineHeartbeatSignal,
  heartbeatError: string | null,
  reviewQueues: OperatorReviewQueues,
): OperatorReadiness {
  const totalPlayerCount = presenceRows.length
  const connectedPlayerCount = presenceRows.filter(
    (row) => row.signal === 'live' || row.signal === 'background',
  ).length
  const foregroundPlayerCount = presenceRows.filter((row) => row.signal === 'live').length
  const absentPlayerCount = presenceRows.filter((row) => row.signal === 'absent').length
  const isChecking = totalPlayerCount === 0
    || presenceRows.some((row) => row.signal === 'connecting')
    || narrativeSequence.status === 'loading'
    || engineHeartbeat.status === 'loading'
    || reviewQueues.grounding.status === 'loading'
    || reviewQueues.witness.status === 'loading'

  if (isChecking) {
    return {
      status: 'checking',
      attention_count: 0,
      connected_player_count: connectedPlayerCount,
      foreground_player_count: foregroundPlayerCount,
      total_player_count: totalPlayerCount,
      absent_player_count: absentPlayerCount,
      reasons: [],
    }
  }

  const reasons: OperatorAttentionReason[] = []
  if (heartbeatError || engineHeartbeat.status === 'missing' || engineHeartbeat.status === 'stale') {
    reasons.push('engine')
  }
  if (absentPlayerCount > 0) reasons.push('player_signal')
  if (narrativeSequence.status === 'quiet_after_fact') reasons.push('narrative')
  if (reviewQueues.grounding.status === 'pending' || reviewQueues.grounding.status === 'error') {
    reasons.push('grounding_review')
  }
  if (reviewQueues.witness.status === 'pending' || reviewQueues.witness.status === 'error') {
    reasons.push('witness_review')
  }

  return {
    status: reasons.length > 0 ? 'attention' : 'ready',
    attention_count: reasons.length,
    connected_player_count: connectedPlayerCount,
    foreground_player_count: foregroundPlayerCount,
    total_player_count: totalPlayerCount,
    absent_player_count: absentPlayerCount,
    reasons,
  }
}
