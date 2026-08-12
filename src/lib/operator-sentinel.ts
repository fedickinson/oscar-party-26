import type { RoomPhase } from '../types/database'
import type {
  EngineHeartbeatSignal,
  NarrativeSequence,
  OperatorReviewQueueSignal,
  OperatorReviewQueues,
} from './operator-lens'

export type OperatorSentinelAnomalyCode =
  | 'record_identity'
  | 'host_identity'
  | 'engine'
  | 'narrative_sequence'
  | 'grounding_review'
  | 'witness_review'

export interface OperatorSentinelAnomaly {
  code: OperatorSentinelAnomalyCode
  detail: string
  signature: string
}

export interface OperatorSentinelState {
  status: 'clear' | 'attention'
  anomalies: OperatorSentinelAnomaly[]
  signature: string
}

interface OperatorSentinelInput {
  room: {
    phase: RoomPhase
    host_id: string | null
    active_settlement_id: string | null
  }
  engine_heartbeat: EngineHeartbeatSignal
  narrative_sequence: NarrativeSequence
  review_queues: OperatorReviewQueues
}

function reviewAnomaly(
  code: 'grounding_review' | 'witness_review',
  label: string,
  signal: OperatorReviewQueueSignal,
): OperatorSentinelAnomaly | null {
  if (signal.status === 'clear') return null
  if (signal.status === 'pending') {
    return {
      code,
      detail: `${signal.pending_count} ${label} ${signal.pending_count === 1 ? 'item needs' : 'items need'} operator review.`,
      signature: `${code}:pending:${signal.pending_count}`,
    }
  }
  if (signal.status === 'error') {
    return {
      code,
      detail: `${label} queue unavailable: ${signal.error ?? 'unknown read failure'}`,
      signature: `${code}:error`,
    }
  }
  return {
    code,
    detail: `${label} queue has not finished loading.`,
    signature: `${code}:loading`,
  }
}

/**
 * Reduces one complete operator observation to stable attention channels. The
 * signature excludes heartbeat age so a healthy polling loop stays quiet, but
 * retains states and queue/fact counts that change the operator's workload.
 */
export function deriveOperatorSentinel(input: OperatorSentinelInput): OperatorSentinelState {
  const anomalies: OperatorSentinelAnomaly[] = []
  const { room, engine_heartbeat: heartbeat, narrative_sequence: narrative } = input

  if (room.phase === 'closed' && room.active_settlement_id === null) {
    anomalies.push({
      code: 'record_identity',
      detail: 'The room is closed without an active researched settlement.',
      signature: 'record_identity:closed_without_settlement',
    })
  } else if (room.phase !== 'closed' && room.active_settlement_id !== null) {
    anomalies.push({
      code: 'record_identity',
      detail: `The ${room.phase} room points at an active settlement before closure.`,
      signature: `record_identity:${room.phase}_with_settlement`,
    })
  }

  if (room.phase === 'live') {
    if (room.host_id === null) {
      anomalies.push({
        code: 'host_identity',
        detail: 'The live room has no host identity for operator actions.',
        signature: 'host_identity:missing',
      })
    }

    if (heartbeat.status !== 'live') {
      const detail = heartbeat.status === 'missing'
        ? 'The live room has no companion-daemon lease.'
        : heartbeat.status === 'stale'
          ? heartbeat.age_ms === null
            ? 'The companion-daemon heartbeat timestamp is invalid.'
            : `The companion-daemon lease is stale at ${Math.floor(heartbeat.age_ms / 1000)} seconds.`
          : 'The companion-daemon heartbeat has not finished loading.'
      anomalies.push({
        code: 'engine',
        detail,
        signature: `engine:${heartbeat.status}`,
      })
    }

    if (narrative.status === 'quiet_after_fact') {
      anomalies.push({
        code: 'narrative_sequence',
        detail: `${narrative.pending_fact_count} ${narrative.pending_fact_count === 1 ? 'fact is' : 'facts are'} newer than cast activity. This is sequence evidence only, not response proof.`,
        signature: `narrative_sequence:quiet_after_fact:${narrative.pending_fact_count}`,
      })
    } else if (narrative.status === 'loading') {
      anomalies.push({
        code: 'narrative_sequence',
        detail: 'The room transcript has not finished loading.',
        signature: 'narrative_sequence:loading',
      })
    }
  }

  const grounding = reviewAnomaly(
    'grounding_review', 'Grounding', input.review_queues.grounding,
  )
  if (grounding) anomalies.push(grounding)
  const witness = reviewAnomaly(
    'witness_review', 'Witness', input.review_queues.witness,
  )
  if (witness) anomalies.push(witness)

  return {
    status: anomalies.length === 0 ? 'clear' : 'attention',
    anomalies,
    signature: anomalies.length === 0
      ? 'clear'
      : anomalies.map((anomaly) => anomaly.signature).join('|'),
  }
}

export function sentinelStateChanged(
  previousSignature: string | null,
  currentSignature: string,
): boolean {
  return previousSignature === null || previousSignature !== currentSignature
}
