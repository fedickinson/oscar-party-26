import { describe, expect, it } from 'vitest'
import { sha256Hex } from './sha256'
import {
  buildSettlementDropReceiptPrerequisitesPacket,
  RECEIPT_PREREQUISITE_TABLES,
  serializeSettlementDropReceiptPrerequisitesDecisionTemplate,
  serializeSettlementDropReceiptPrerequisitesPacket,
} from './settlement-drop-receipt-prerequisites'

function sealed(name: string, value: unknown) {
  const raw = JSON.stringify(value)
  return { raw, seal: { name: `${name}.json`, bytes: new TextEncoder().encode(raw).byteLength, sha256: sha256Hex(raw) } }
}

function input() {
  const roomId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const playerId = '11111111-1111-4111-8111-111111111111'
  const tables = Object.fromEntries(RECEIPT_PREREQUISITE_TABLES.map((name) => [name, sealed(name, [])])) as Record<typeof RECEIPT_PREREQUISITE_TABLES[number], ReturnType<typeof sealed>>
  tables.rooms = sealed('rooms', [{ id: roomId, code: 'WDKH', phase: 'finished' }])
  tables.players = sealed('players', [{ id: playerId, room_id: roomId, name: 'Alice' }])
  tables.categories = sealed('categories', [{ id: 7, name: 'A fact', points: 5, announced_at: '2026-01-01T00:00:00Z' }])
  tables.nominees = sealed('nominees', [{ id: 'nom-1', name: 'Winner' }])
  tables.room_winners = sealed('room_winners', [{ room_id: roomId, category_id: 7, winner_id: 'nom-1', tie_winner_id: null }])
  tables.draft_entities = sealed('draft_entities', [{ id: 'entity-1', name: 'Entity' }])
  tables.draft_picks = sealed('draft_picks', [{ id: 'pick-1', room_id: roomId, player_id: playerId, entity_id: 'entity-1' }])
  tables.bingo_cards = sealed('bingo_cards', [{ id: 'card-1', room_id: roomId, player_id: playerId, squares: [0] }])
  tables.bingo_squares = sealed('bingo_squares', [{ id: 0, title: 'Free' }])
  tables.bingo_marks = sealed('bingo_marks', [{ id: 'mark-1', card_id: 'card-1', square_index: 0, status: 'approved' }])
  return { room_code: 'WDKH', tables }
}

describe('buildSettlementDropReceiptPrerequisitesPacket', () => {
  it('inventories pre-settlement evidence without claiming receipt recoverability', () => {
    const packet = buildSettlementDropReceiptPrerequisitesPacket(input())
    expect(packet.canonical_state).toEqual({
      snapshot_phase: 'finished', room_closed: false, active_settlement_id: null,
      settlement_rows_provided: false, canonical_receipt_recoverable: false,
    })
    expect(packet.coverage).toEqual({
      players: 1, room_winners: 1, confidence_picks: 0, draft_picks: 1,
      bingo_cards: 1, bingo_marks: 1, approved_bingo_marks: 1,
      beat_activations: 0, candidate_entries: 1,
    })
    expect(packet.candidate_entries[0]).toMatchObject({
      entry_key: 'category:7', category_name: 'A fact', winner_name: 'Winner', points: 5,
    })
  })

  it('leaves every settlement decision null and packet-bound', () => {
    const packet = buildSettlementDropReceiptPrerequisitesPacket(input())
    const decisions = JSON.parse(serializeSettlementDropReceiptPrerequisitesDecisionTemplate(packet))
    expect(decisions.expected_packet_sha256).toBe(sha256Hex(serializeSettlementDropReceiptPrerequisitesPacket(packet)))
    expect(decisions.settlement).toEqual({ title: null, actor: null, bingo_mode: null })
    expect(decisions.entries[0].approved_outcome).toBeNull()
    expect(decisions.bingo.preserve_snapshot_marks).toBeNull()
    expect(decisions.additional_fact_review).toBeNull()
  })

  it('rejects closed state and broken joins', () => {
    const closed = input()
    closed.tables.rooms = sealed('rooms', [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', code: 'WDKH', phase: 'closed', active_settlement_id: 's1' }])
    expect(() => buildSettlementDropReceiptPrerequisitesPacket(closed))
      .toThrow('only for a pre-settlement finished snapshot')
    const broken = input()
    broken.tables.room_winners = sealed('room_winners', [{ room_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', category_id: 7, winner_id: 'missing', tie_winner_id: null }])
    expect(() => buildSettlementDropReceiptPrerequisitesPacket(broken))
      .toThrow('references unknown nominee missing')
  })

  it('rejects every phase except the finished pre-settlement boundary', () => {
    const live = input()
    live.tables.rooms = sealed('rooms', [{
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', code: 'WDKH', phase: 'live', active_settlement_id: null,
    }])
    expect(() => buildSettlementDropReceiptPrerequisitesPacket(live))
      .toThrow('only for a pre-settlement finished snapshot')
  })

  it('rejects seal drift', () => {
    const value = input()
    value.tables.players.seal.sha256 = 'f'.repeat(64)
    expect(() => buildSettlementDropReceiptPrerequisitesPacket(value))
      .toThrow('players seal does not match its bytes')
  })
})
