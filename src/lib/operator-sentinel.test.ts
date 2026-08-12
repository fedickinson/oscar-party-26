import { describe, expect, it } from 'vitest'
import {
  deriveOperatorSentinel,
  sentinelStateChanged,
} from './operator-sentinel'

const clearQueues = {
  grounding: { status: 'clear' as const, pending_count: 0, error: null },
  witness: { status: 'clear' as const, pending_count: 0, error: null },
}

const idleNarrative = {
  status: 'idle' as const,
  pending_fact_count: 0,
  last_cast_at: null,
  last_fact_at: null,
}

const liveHeartbeat = {
  status: 'live' as const,
  age_ms: 5_000,
  heartbeat_at: '2026-08-11T12:00:00.000Z',
}

describe('deriveOperatorSentinel', () => {
  it('reports a healthy live room as clear', () => {
    expect(deriveOperatorSentinel({
      room: { phase: 'live', host_id: 'host', active_settlement_id: null },
      engine_heartbeat: liveHeartbeat,
      narrative_sequence: idleNarrative,
      review_queues: clearQueues,
    })).toEqual({ status: 'clear', anomalies: [], signature: 'clear' })
  })

  it('emits one truthful anomaly per attention channel', () => {
    const result = deriveOperatorSentinel({
      room: { phase: 'live', host_id: null, active_settlement_id: 'impossible-settlement' },
      engine_heartbeat: {
        status: 'stale', age_ms: 60_000, heartbeat_at: '2026-08-11T11:59:00.000Z',
      },
      narrative_sequence: {
        status: 'quiet_after_fact',
        pending_fact_count: 4,
        last_cast_at: '2026-08-11T11:55:00.000Z',
        last_fact_at: '2026-08-11T12:00:00.000Z',
      },
      review_queues: {
        grounding: { status: 'pending', pending_count: 3, error: null },
        witness: { status: 'error', pending_count: 0, error: 'Witness queue unavailable' },
      },
    })

    expect(result.status).toBe('attention')
    expect(result.anomalies.map((anomaly) => anomaly.code)).toEqual([
      'record_identity',
      'host_identity',
      'engine',
      'narrative_sequence',
      'grounding_review',
      'witness_review',
    ])
    expect(result.anomalies.find((anomaly) => anomaly.code === 'narrative_sequence')?.detail)
      .toContain('sequence evidence only')
    expect(result.signature).toContain('narrative_sequence:quiet_after_fact:4')
  })

  it('checks record identity in every phase but requires the daemon only while live', () => {
    expect(deriveOperatorSentinel({
      room: { phase: 'finished', host_id: null, active_settlement_id: null },
      engine_heartbeat: { status: 'missing', age_ms: null, heartbeat_at: null },
      narrative_sequence: idleNarrative,
      review_queues: clearQueues,
    }).anomalies).toEqual([])

    expect(deriveOperatorSentinel({
      room: { phase: 'closed', host_id: null, active_settlement_id: null },
      engine_heartbeat: { status: 'missing', age_ms: null, heartbeat_at: null },
      narrative_sequence: idleNarrative,
      review_queues: clearQueues,
    }).anomalies.map((anomaly) => anomaly.code)).toEqual(['record_identity'])
  })

  it('keeps heartbeat age noise quiet but reports a meaningful state or count change', () => {
    const first = deriveOperatorSentinel({
      room: { phase: 'live', host_id: 'host', active_settlement_id: null },
      engine_heartbeat: { ...liveHeartbeat, age_ms: 5_000 },
      narrative_sequence: idleNarrative,
      review_queues: clearQueues,
    })
    const ageOnly = deriveOperatorSentinel({
      room: { phase: 'live', host_id: 'host', active_settlement_id: null },
      engine_heartbeat: { ...liveHeartbeat, age_ms: 20_000 },
      narrative_sequence: idleNarrative,
      review_queues: clearQueues,
    })
    const pending = deriveOperatorSentinel({
      room: { phase: 'live', host_id: 'host', active_settlement_id: null },
      engine_heartbeat: { ...liveHeartbeat, age_ms: 20_000 },
      narrative_sequence: idleNarrative,
      review_queues: {
        ...clearQueues,
        grounding: { status: 'pending', pending_count: 2, error: null },
      },
    })

    expect(sentinelStateChanged(first.signature, ageOnly.signature)).toBe(false)
    expect(sentinelStateChanged(ageOnly.signature, pending.signature)).toBe(true)
    expect(sentinelStateChanged(null, first.signature)).toBe(true)
  })
})
