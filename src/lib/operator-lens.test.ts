import { describe, expect, it } from 'vitest'
import type { MessageRow } from '../types/database'
import {
  deriveEngineHeartbeat,
  deriveNarrativeSequence,
  deriveOperatorReviewQueue,
  deriveOperatorReadiness,
  derivePresenceRows,
  type OperatorPresenceMeta,
} from './operator-lens'

const players = [
  { id: 'host-id', name: 'Host', is_host: true },
  { id: 'guest-id', name: 'Guest', is_host: false },
  { id: 'away-id', name: 'Away', is_host: false },
]

function message(
  id: string,
  playerId: string,
  createdAt: string,
): MessageRow {
  return {
    id,
    room_id: 'room-id',
    player_id: playerId,
    text: id,
    created_at: createdAt,
  }
}

describe('derivePresenceRows', () => {
  it('does not call phones offline before the first presence sync', () => {
    expect(derivePresenceRows(players, [], false).map((row) => row.signal))
      .toEqual(['connecting', 'connecting', 'connecting'])
  })

  it('uses every tab signal and keeps foreground stronger than background', () => {
    const metas: OperatorPresenceMeta[] = [
      { player_id: 'host-id', visible: false, tracked_at: '2026-08-10T20:00:00.000Z' },
      { player_id: 'host-id', visible: true, tracked_at: '2026-08-10T20:00:01.000Z' },
      { player_id: 'guest-id', visible: false, tracked_at: '2026-08-10T20:00:02.000Z' },
      { player_id: 'not-in-room', visible: true, tracked_at: '2026-08-10T20:00:03.000Z' },
    ]

    expect(derivePresenceRows(players, metas, true)).toEqual([
      { player: players[0], signal: 'live', tab_count: 2 },
      { player: players[1], signal: 'background', tab_count: 1 },
      { player: players[2], signal: 'absent', tab_count: 0 },
    ])
  })
})

describe('deriveNarrativeSequence', () => {
  it('distinguishes an idle room from an unloaded message stream', () => {
    expect(deriveNarrativeSequence([], true).status).toBe('loading')
    expect(deriveNarrativeSequence([], false)).toEqual({
      status: 'idle',
      pending_fact_count: 0,
      last_cast_at: null,
      last_fact_at: null,
    })
  })

  it('reports only that cast activity followed the latest declared fact', () => {
    const messages = [
      message('human-chat', 'host-id', '2026-08-10T20:00:00.000Z'),
      message('fact-one', 'winner-divider', '2026-08-10T20:01:00.000Z'),
      message('cast-one', 'ned', '2026-08-10T20:02:00.000Z'),
    ]

    expect(deriveNarrativeSequence(messages, false)).toEqual({
      status: 'activity_after_fact',
      pending_fact_count: 0,
      last_cast_at: '2026-08-10T20:02:00.000Z',
      last_fact_at: '2026-08-10T20:01:00.000Z',
    })
  })

  it('accepts room-pack cast ids supplied by the canonical runtime projection', () => {
    const messages = [
      message('fact-one', 'winner-divider', '2026-08-10T20:01:00.000Z'),
      message('cast-one', 'archivist', '2026-08-10T20:02:00.000Z'),
    ]

    expect(deriveNarrativeSequence(messages, false, ['archivist'])).toMatchObject({
      status: 'activity_after_fact',
      last_cast_at: '2026-08-10T20:02:00.000Z',
    })
  })

  it('does not let a legacy cast id count as activity when a generic room supplies its cast', () => {
    const messages = [
      message('fact-one', 'winner-divider', '2026-08-10T20:01:00.000Z'),
      message('wrong-canon', 'cersei', '2026-08-10T20:02:00.000Z'),
    ]

    expect(deriveNarrativeSequence(messages, false, ['archivist'])).toMatchObject({
      status: 'quiet_after_fact',
      last_cast_at: null,
    })
  })

  it('counts every declared fact newer than the last cast activity', () => {
    const messages = [
      message('cast-old', 'arya', '2026-08-10T20:00:00.000Z'),
      message('fact-one', 'winner-divider', '2026-08-10T20:01:00.000Z'),
      message('system-note', 'system', '2026-08-10T20:01:30.000Z'),
      message('fact-two', 'winner-divider', '2026-08-10T20:02:00.000Z'),
    ]

    expect(deriveNarrativeSequence(messages, false)).toEqual({
      status: 'quiet_after_fact',
      pending_fact_count: 2,
      last_cast_at: '2026-08-10T20:00:00.000Z',
      last_fact_at: '2026-08-10T20:02:00.000Z',
    })
  })
})

describe('deriveEngineHeartbeat', () => {
  const heartbeat = {
    room_id: 'room-id',
    engine: 'companion_daemon' as const,
    instance_id: 'instance-id',
    started_at: '2026-08-10T20:00:00.000Z',
    heartbeat_at: '2026-08-10T20:01:00.000Z',
  }

  it('keeps loading and missing evidence distinct', () => {
    expect(deriveEngineHeartbeat(null, true, Date.parse('2026-08-10T20:01:10.000Z')))
      .toEqual({ status: 'loading', age_ms: null, heartbeat_at: null })
    expect(deriveEngineHeartbeat(null, false, Date.parse('2026-08-10T20:01:10.000Z')))
      .toEqual({ status: 'missing', age_ms: null, heartbeat_at: null })
  })

  it('uses the same 45-second lease boundary as the database', () => {
    expect(deriveEngineHeartbeat(
      heartbeat,
      false,
      Date.parse('2026-08-10T20:01:44.999Z'),
    ).status).toBe('live')
    expect(deriveEngineHeartbeat(
      heartbeat,
      false,
      Date.parse('2026-08-10T20:01:45.001Z'),
    )).toEqual({
      status: 'stale',
      age_ms: 45_001,
      heartbeat_at: '2026-08-10T20:01:00.000Z',
    })
  })

  it('does not turn clock skew into a negative age', () => {
    expect(deriveEngineHeartbeat(
      heartbeat,
      false,
      Date.parse('2026-08-10T20:00:59.000Z'),
    ).age_ms).toBe(0)
  })
})

describe('deriveOperatorReadiness', () => {
  const liveHeartbeat = {
    status: 'live' as const,
    age_ms: 5_000,
    heartbeat_at: '2026-08-10T20:01:00.000Z',
  }
  const idleNarrative = {
    status: 'idle' as const,
    pending_fact_count: 0,
    last_cast_at: null,
    last_fact_at: null,
  }
  const clearReviewQueues = {
    grounding: { status: 'clear' as const, pending_count: 0, error: null },
    witness: { status: 'clear' as const, pending_count: 0, error: null },
  }

  it('keeps loading, failed, pending and clear review queues distinct', () => {
    expect(deriveOperatorReviewQueue(0, true, null)).toEqual({
      status: 'loading', pending_count: 0, error: null,
    })
    expect(deriveOperatorReviewQueue(0, false, 'Private queue unavailable')).toEqual({
      status: 'error', pending_count: 0, error: 'Private queue unavailable',
    })
    expect(deriveOperatorReviewQueue(3, false, null)).toEqual({
      status: 'pending', pending_count: 3, error: null,
    })
    expect(deriveOperatorReviewQueue(0, false, null)).toEqual({
      status: 'clear', pending_count: 0, error: null,
    })
  })

  it('stays checking until roster presence and every operator channel is known', () => {
    expect(deriveOperatorReadiness(
      [], idleNarrative, liveHeartbeat, null, clearReviewQueues,
    )).toMatchObject({
      status: 'checking',
      attention_count: 0,
    })
    expect(deriveOperatorReadiness(
      [{ player: players[0], signal: 'connecting', tab_count: 0 }],
      idleNarrative,
      liveHeartbeat,
      null,
      clearReviewQueues,
    ).status).toBe('checking')
    expect(deriveOperatorReadiness(
      [{ player: players[0], signal: 'live', tab_count: 1 }],
      { ...idleNarrative, status: 'loading' },
      liveHeartbeat,
      null,
      clearReviewQueues,
    ).status).toBe('checking')
    expect(deriveOperatorReadiness(
      [{ player: players[0], signal: 'live', tab_count: 1 }],
      idleNarrative,
      liveHeartbeat,
      null,
      {
        ...clearReviewQueues,
        witness: { status: 'loading', pending_count: 0, error: null },
      },
    ).status).toBe('checking')
  })

  it('reports ready only when every player signals, the daemon is live, and no fact is waiting', () => {
    expect(deriveOperatorReadiness(
      [
        { player: players[0], signal: 'live', tab_count: 1 },
        { player: players[1], signal: 'background', tab_count: 1 },
      ],
      { ...idleNarrative, status: 'activity_after_fact' },
      liveHeartbeat,
      null,
      clearReviewQueues,
    )).toEqual({
      status: 'ready',
      attention_count: 0,
      connected_player_count: 2,
      foreground_player_count: 1,
      total_player_count: 2,
      absent_player_count: 0,
      reasons: [],
    })
  })

  it('keeps each evidence failure as one visible operator check', () => {
    expect(deriveOperatorReadiness(
      [
        { player: players[0], signal: 'live', tab_count: 1 },
        { player: players[1], signal: 'absent', tab_count: 0 },
      ],
      {
        status: 'quiet_after_fact',
        pending_fact_count: 2,
        last_cast_at: '2026-08-10T20:00:00.000Z',
        last_fact_at: '2026-08-10T20:02:00.000Z',
      },
      { status: 'stale', age_ms: 60_000, heartbeat_at: '2026-08-10T20:01:00.000Z' },
      'Heartbeat subscription unavailable',
      {
        grounding: { status: 'pending', pending_count: 4, error: null },
        witness: { status: 'error', pending_count: 0, error: 'Witness queue unavailable' },
      },
    )).toEqual({
      status: 'attention',
      attention_count: 5,
      connected_player_count: 1,
      foreground_player_count: 1,
      total_player_count: 2,
      absent_player_count: 1,
      reasons: ['engine', 'player_signal', 'narrative', 'grounding_review', 'witness_review'],
    })
  })
})
