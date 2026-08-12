import { describe, expect, it } from 'vitest'
import { OPERATOR_SNAPSHOT_TABLES, type OperatorSnapshotPayload } from './operator-snapshot'
import {
  assertMessageRepairPlanMatchesSnapshot,
  buildMessageRepairPreflight,
  classifyApprovedMessageRepairCurrent,
  parseMessageRepairPlan,
  serializeMessageRepairPlan,
} from './message-repair'

const ROOM_ID = '10000000-0000-4000-8000-000000000001'
const PLAYER_ID = '20000000-0000-4000-8000-000000000002'
const MESSAGE_ID = '30000000-0000-4000-8000-000000000003'
const SNAPSHOT_SHA = 'a'.repeat(64)

function emptyRows(): OperatorSnapshotPayload {
  return Object.fromEntries(
    OPERATOR_SNAPSHOT_TABLES.map((table) => [table, []]),
  ) as unknown as OperatorSnapshotPayload
}

function fixtures(): { snapshot: OperatorSnapshotPayload; current: OperatorSnapshotPayload } {
  const snapshot = emptyRows()
  const current = emptyRows()
  const room = {
    id: ROOM_ID,
    code: 'PROOF',
    show_pack_id: '40000000-0000-4000-8000-000000000004',
    phase: 'live',
  }
  const player = { id: PLAYER_ID, room_id: ROOM_ID, name: 'Rhaenyra' }
  const message = {
    id: MESSAGE_ID,
    room_id: ROOM_ID,
    player_id: PLAYER_ID,
    text: 'The sealed line',
    created_at: '2026-08-12T12:00:00.000Z',
  }
  snapshot.rooms.push(room)
  current.rooms.push(structuredClone(room))
  snapshot.players.push(player)
  current.players.push(structuredClone(player))
  snapshot.messages.push(message)
  current.messages.push(structuredClone(message))
  return { snapshot, current }
}

function build(
  snapshot: OperatorSnapshotPayload,
  current: OperatorSnapshotPayload,
  note = 'Correcting a transcription error.',
) {
  return buildMessageRepairPreflight({
    snapshot,
    current,
    roomCode: 'proof',
    messageId: MESSAGE_ID,
    snapshotManifestSha256: SNAPSHOT_SHA,
    note,
  })
}

describe('operator message repair', () => {
  it('plans a text-only compare-and-swap replacement with a deterministic public receipt', () => {
    const { snapshot, current } = fixtures()
    current.messages[0].text = 'The drifted line'

    const result = build(snapshot, current)

    expect(result.status).toBe('actionable')
    if (result.status !== 'actionable') throw new Error('expected actionable plan')
    expect(result.plan).toMatchObject({
      version: 1,
      artifact: 'operator-message-repair-plan',
      snapshot_manifest_sha256: SNAPSHOT_SHA,
      action: 'replace_text',
      room: {
        id: ROOM_ID,
        code: 'PROOF',
        show_pack_id: '40000000-0000-4000-8000-000000000004',
      },
      message_id: MESSAGE_ID,
      expected_row: { text: 'The drifted line' },
      desired_row: { text: 'The sealed line' },
      public_correction: 'Operator correction: a player chat message was restored to the sealed record. Correcting a transcription error.',
    })
    expect(result.plan.repair_key).toMatch(/^[a-f0-9]{64}$/)
    expect(parseMessageRepairPlan(serializeMessageRepairPlan(result.plan))).toEqual(result.plan)
    expect(serializeMessageRepairPlan(result.plan)).toBe(serializeMessageRepairPlan(result.plan))
  })

  it('plans deletion only when the selected current player message is absent from the seal', () => {
    const { snapshot, current } = fixtures()
    snapshot.messages.length = 0

    const result = build(snapshot, current, 'Removing an accidental duplicate.')

    expect(result.status).toBe('actionable')
    if (result.status !== 'actionable') throw new Error('expected actionable plan')
    expect(result.plan.action).toBe('delete_extra')
    expect(result.plan.desired_row).toBeNull()
    expect(result.plan.public_correction).toBe(
      'Operator correction: an extra player chat message was removed. Removing an accidental duplicate.',
    )
  })

  it('reports exact and missing-current rows without widening repair authority', () => {
    let { snapshot, current } = fixtures()
    expect(build(snapshot, current)).toEqual({
      status: 'unchanged',
      room_id: ROOM_ID,
      room_code: 'PROOF',
      message_id: MESSAGE_ID,
    })

    ;({ snapshot, current } = fixtures())
    current.messages.length = 0
    expect(build(snapshot, current)).toEqual({
      status: 'restore_missing',
      room_id: ROOM_ID,
      room_code: 'PROOF',
      message_id: MESSAGE_ID,
    })
  })

  it('rejects synthetic authors, closed rooms, and non-text drift', () => {
    let { snapshot, current } = fixtures()
    snapshot.messages[0].player_id = 'system'
    current.messages[0].player_id = 'system'
    current.messages[0].text = 'Changed'
    expect(() => build(snapshot, current)).toThrow('target message is not authored by a current room player')

    ;({ snapshot, current } = fixtures())
    current.rooms[0].phase = 'closed'
    current.messages[0].text = 'Changed'
    expect(() => build(snapshot, current)).toThrow('closed room chat cannot be repaired')

    ;({ snapshot, current } = fixtures())
    current.messages[0].text = 'Changed'
    current.messages[0].created_at = '2026-08-12T12:01:00.000Z'
    expect(() => build(snapshot, current)).toThrow('target message differs beyond its text')
  })

  it('rejects ambiguous identities and unsafe operator notes', () => {
    let { snapshot, current } = fixtures()
    current.messages[0].text = 'Changed'
    current.rooms[0].show_pack_id = '50000000-0000-4000-8000-000000000005'
    expect(() => build(snapshot, current)).toThrow('does not match the sealed room identity')

    ;({ snapshot, current } = fixtures())
    current.messages[0].text = 'Changed'
    current.players.length = 0
    expect(() => build(snapshot, current)).toThrow('target message is not authored by a current room player')

    ;({ snapshot, current } = fixtures())
    current.messages[0].text = 'Changed'
    expect(() => build(snapshot, current, '  ')).toThrow('operator note is required')
    expect(() => build(snapshot, current, 'Bad note \u{1f525}')).toThrow('operator note must not contain emoji')
  })

  it('rejects noncanonical or tampered approved plan bytes', () => {
    const { snapshot, current } = fixtures()
    current.messages[0].text = 'Changed'
    const result = build(snapshot, current)
    if (result.status !== 'actionable') throw new Error('expected actionable plan')
    const canonical = serializeMessageRepairPlan(result.plan)
    expect(() => parseMessageRepairPlan(canonical.replace('\n', ''))).toThrow(
      'approved message repair plan is not in canonical form',
    )
    const tampered = canonical.replace('Correcting a transcription error.', 'Different note.')
    expect(() => parseMessageRepairPlan(tampered)).toThrow('message repair plan repair_key does not match its contents')
  })

  it('binds approved plans back to the sealed row and recognizes only pending or replay state', () => {
    const { snapshot, current } = fixtures()
    current.messages[0].text = 'Changed'
    const result = build(snapshot, current)
    if (result.status !== 'actionable') throw new Error('expected actionable plan')

    expect(() => assertMessageRepairPlanMatchesSnapshot(result.plan, snapshot)).not.toThrow()
    expect(classifyApprovedMessageRepairCurrent(result.plan, current)).toBe('pending')
    current.messages[0] = structuredClone(snapshot.messages[0])
    expect(classifyApprovedMessageRepairCurrent(result.plan, current)).toBe('replay_candidate')
    current.messages[0].text = 'Third value'
    expect(() => classifyApprovedMessageRepairCurrent(result.plan, current)).toThrow(
      'current target message matches neither the approved expectation nor result',
    )

    snapshot.messages[0].text = 'Tampered seal projection'
    expect(() => assertMessageRepairPlanMatchesSnapshot(result.plan, snapshot)).toThrow(
      'replacement plan desired row does not match the sealed snapshot',
    )
  })

  it('binds deletion plans to absence in the sealed snapshot', () => {
    const { snapshot, current } = fixtures()
    snapshot.messages.length = 0
    const result = build(snapshot, current)
    if (result.status !== 'actionable') throw new Error('expected actionable plan')
    expect(() => assertMessageRepairPlanMatchesSnapshot(result.plan, snapshot)).not.toThrow()
    current.messages.length = 0
    expect(classifyApprovedMessageRepairCurrent(result.plan, current)).toBe('replay_candidate')

    snapshot.messages.push({ ...result.plan.expected_row })
    expect(() => assertMessageRepairPlanMatchesSnapshot(result.plan, snapshot)).toThrow(
      'deletion target is present in the sealed snapshot',
    )
  })
})
