import { describe, expect, it } from 'vitest'
import { OPERATOR_SNAPSHOT_TABLES, type OperatorSnapshotTableName } from './operator-snapshot'
import { buildRoomRecoveryPlan } from './room-recovery'

type Rows = Record<OperatorSnapshotTableName, Array<Record<string, unknown>>>

function emptyRows(): Rows {
  return Object.fromEntries(OPERATOR_SNAPSHOT_TABLES.map((table) => [table, []])) as unknown as Rows
}

function fixtures(): { snapshot: Rows; current: Rows } {
  const snapshot = emptyRows()
  const current = emptyRows()
  const room = {
    id: 'room-1', code: 'PROOF', show_pack_id: 'pack-1', phase: 'live', current_pick: 2,
  }
  snapshot.rooms.push(room)
  current.rooms.push({ ...room, current_pick: 3 })
  const pack = { id: 'pack-1', pack_key: 'proof', version: 1 }
  snapshot.show_packs.push(pack)
  current.show_packs.push(structuredClone(pack))
  const nominee = { id: 'nominee-1', show_pack_id: 'pack-1', name: 'The Wolf' }
  snapshot.nominees.push(nominee)
  current.nominees.push(structuredClone(nominee))
  return { snapshot, current }
}

describe('room recovery plan', () => {
  it('selects only missing rows owned by the requested room in dependency order', () => {
    const { snapshot, current } = fixtures()
    snapshot.players.push(
      { id: 'player-1', room_id: 'room-1', name: 'Arya' },
      { id: 'player-elsewhere', room_id: 'room-2', name: 'Sansa' },
    )
    snapshot.categories.push({
      id: 101, room_id: 'room-1', show_pack_id: null, name: 'The path opens', points: 4,
    })
    const entity = { id: 'entity-1', show_pack_id: 'pack-1', name: 'The Wolf' }
    const beat = {
      id: 17, show_pack_id: 'pack-1', entity_id: 'entity-1', partner_entity_id: null,
      name: 'The path opens',
    }
    snapshot.draft_entities.push(entity)
    current.draft_entities.push(structuredClone(entity))
    snapshot.signature_beats.push(beat)
    current.signature_beats.push(structuredClone(beat))
    snapshot.category_nominees.push({ category_id: 101, nominee_id: 'nominee-1' })
    snapshot.witness_proposals.push({
      id: 'proposal-1', room_id: 'room-1', source_signature_beat_id: 17,
      entity_id: 'entity-1', status: 'pending',
    })
    snapshot.witness_supporting_observations.push({
      id: 'observation-2', proposal_id: 'proposal-1', room_id: 'room-1',
      entity_id: 'entity-1', frame_sha256: 'a'.repeat(64),
    })
    snapshot.room_winners.push({
      room_id: 'room-1', category_id: 101, winner_id: 'nominee-1', tie_winner_id: null,
    })
    snapshot.messages.push(
      { id: 'message-1', room_id: 'room-1', player_id: 'system', text: 'A fact' },
      { id: 'message-2', room_id: 'room-2', player_id: 'system', text: 'Other room' },
    )
    snapshot.operator_heartbeats.push({ room_id: 'room-1', engine: 'companion_daemon' })

    const plan = buildRoomRecoveryPlan(snapshot, current, 'proof')

    expect(plan.room_code).toBe('PROOF')
    expect(plan.conflicts).toEqual([])
    expect(plan.tables.filter((table) => table.missing.length > 0).map((table) => table.name)).toEqual([
      'players', 'categories', 'category_nominees', 'witness_proposals',
      'witness_supporting_observations', 'messages', 'room_winners',
    ])
    expect(plan.tables.flatMap((table) => table.missing)).not.toContainEqual(
      expect.objectContaining({ room_id: 'room-2' }),
    )
    expect(plan.tables.map((table) => table.name)).not.toContain('operator_heartbeats')
    expect(plan.room_drift_fields).toEqual(['current_pick'])
  })

  it('treats exact rows as idempotent no-ops and divergent rows as blocking conflicts', () => {
    const { snapshot, current } = fixtures()
    const player = { id: 'player-1', room_id: 'room-1', name: 'Arya' }
    snapshot.players.push(player)
    current.players.push(structuredClone(player))

    let plan = buildRoomRecoveryPlan(snapshot, current, 'PROOF')
    expect(plan.tables.find((table) => table.name === 'players')).toMatchObject({
      missing: [],
      unchanged: 1,
    })
    expect(plan.conflicts).toEqual([])

    current.players[0].name = 'Not Arya'
    plan = buildRoomRecoveryPlan(snapshot, current, 'PROOF')
    expect(plan.conflicts).toEqual(['players[player-1] differs from the sealed snapshot'])
  })

  it('can restore accepted witness history after referee undo removed its declaration', () => {
    const { snapshot, current } = fixtures()
    const player = { id: 'player-1', room_id: 'room-1', name: 'Arya' }
    const entity = { id: 'entity-1', show_pack_id: 'pack-1', name: 'The Wolf' }
    const beat = {
      id: 17, show_pack_id: 'pack-1', entity_id: 'entity-1', partner_entity_id: null,
      name: 'The path opens',
    }
    snapshot.players.push(player)
    current.players.push(structuredClone(player))
    snapshot.draft_entities.push(entity)
    current.draft_entities.push(structuredClone(entity))
    snapshot.signature_beats.push(beat)
    current.signature_beats.push(structuredClone(beat))
    snapshot.witness_proposals.push({
      id: 'proposal-accepted', room_id: 'room-1', source_signature_beat_id: 17,
      entity_id: 'entity-1', status: 'accepted', reviewed_by: 'player-1',
      declaration_category_id: 404,
    })

    const plan = buildRoomRecoveryPlan(snapshot, current, 'PROOF')

    expect(plan.conflicts).toEqual([])
    expect(plan.tables.find((table) => table.name === 'witness_proposals')?.missing).toEqual([
      expect.objectContaining({ id: 'proposal-accepted', declaration_category_id: 404 }),
    ])
  })

  it('treats a missing legacy witness ruling field as null, but not as a chosen entity', () => {
    const { snapshot, current } = fixtures()
    const entity = { id: 'entity-1', show_pack_id: 'pack-1', name: 'The Wolf' }
    const beat = {
      id: 17, show_pack_id: 'pack-1', entity_id: 'entity-1', partner_entity_id: null,
      name: 'The path opens',
    }
    snapshot.draft_entities.push(entity)
    current.draft_entities.push(structuredClone(entity))
    snapshot.signature_beats.push(beat)
    current.signature_beats.push(structuredClone(beat))
    const sealed = {
      id: 'proposal-accepted', room_id: 'room-1', source_signature_beat_id: 17,
      entity_id: 'entity-1', status: 'accepted', reviewed_by: 'player-1',
      declaration_category_id: 404,
    }
    snapshot.witness_proposals.push(sealed)
    current.witness_proposals.push({ ...sealed, reviewed_entity_id: null })

    let plan = buildRoomRecoveryPlan(snapshot, current, 'PROOF')
    expect(plan.conflicts).toEqual([])
    expect(plan.tables.find((table) => table.name === 'witness_proposals')).toMatchObject({
      missing: [],
      unchanged: 1,
    })

    current.witness_proposals[0].reviewed_entity_id = 'entity-1'
    plan = buildRoomRecoveryPlan(snapshot, current, 'PROOF')
    expect(plan.conflicts).toContain(
      'witness_proposals[proposal-accepted] differs from the sealed snapshot',
    )
  })

  it('blocks when a referenced catalog row is absent or different', () => {
    const { snapshot, current } = fixtures()
    snapshot.categories.push({ id: 7, room_id: null, show_pack_id: 'pack-1', name: 'Authored fact' })
    snapshot.confidence_picks.push({
      id: 'pick-1', room_id: 'room-1', player_id: 'player-1', category_id: 7,
      nominee_id: 'nominee-1', confidence: 4,
    })
    snapshot.players.push({ id: 'player-1', room_id: 'room-1', name: 'Arya' })

    const missing = buildRoomRecoveryPlan(snapshot, current, 'PROOF')
    expect(missing.conflicts).toContain('categories[7] catalog prerequisite is missing')

    current.categories.push({ id: 7, room_id: null, show_pack_id: 'pack-1', name: 'Changed fact' })
    const changed = buildRoomRecoveryPlan(snapshot, current, 'PROOF')
    expect(changed.conflicts).toContain('categories[7] catalog prerequisite differs from the sealed snapshot')
  })

  it('refuses to recreate a missing room or cross a show-pack identity', () => {
    const { snapshot, current } = fixtures()
    current.rooms.length = 0
    expect(() => buildRoomRecoveryPlan(snapshot, current, 'PROOF')).toThrow(
      'current room PROOF is missing; this command does not recreate rooms',
    )

    current.rooms.push({ id: 'room-1', code: 'PROOF', show_pack_id: 'pack-2' })
    expect(() => buildRoomRecoveryPlan(snapshot, current, 'PROOF')).toThrow(
      'current room PROOF does not match the sealed room identity',
    )
  })
})
