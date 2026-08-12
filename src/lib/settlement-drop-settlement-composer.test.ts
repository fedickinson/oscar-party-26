import { describe, expect, it } from 'vitest'
import {
  buildSettlementDropReceiptPrerequisitesPacket,
  RECEIPT_PREREQUISITE_TABLES,
  serializeSettlementDropReceiptPrerequisitesDecisionTemplate,
  serializeSettlementDropReceiptPrerequisitesPacket,
} from './settlement-drop-receipt-prerequisites'
import { sha256Hex } from './sha256'
import { composeSettlementDropSettlementManifest } from './settlement-drop-settlement-composer'
import type { SealedTextArtifact } from './settlement-drop-asset-semantics'

const warrant = { verdict: 'true', sources: [{ kind: 'episode', ref: 'S3E8 00:10:00' }] }

function fixture() {
  const values: Record<typeof RECEIPT_PREREQUISITE_TABLES[number], unknown[]> = {
    rooms: [{ id: 'room-1', code: 'ROOM', phase: 'finished' }],
    players: [
      { id: 'p1', room_id: 'room-1', name: 'Arya' },
      { id: 'p2', room_id: 'room-1', name: 'Tyrion' },
    ],
    categories: [{ id: 1, name: 'Finds the path', tier: 3, points: 4, display_order: 1, winner_id: null, tie_winner_id: null, announced_at: null }],
    nominees: [{ id: 'nom-wolf', name: 'Wolf', type: 'person', film_name: 'Wolves' }],
    room_winners: [{ room_id: 'room-1', category_id: 1, winner_id: 'nom-wolf', tie_winner_id: null }],
    confidence_picks: [{ id: 'confidence-1', room_id: 'room-1', player_id: 'p2', category_id: 1, nominee_id: 'nom-wolf', confidence: 3, is_correct: null }],
    draft_entities: [{ id: 'wolf', name: 'Wolf', type: 'person', film_name: 'Wolves', nominations: [], nom_count: 0 }],
    draft_picks: [{ id: 'draft-1', room_id: 'room-1', player_id: 'p1', entity_id: 'wolf' }],
    bingo_cards: [
      { id: 'card-1', room_id: 'room-1', player_id: 'p1', squares: Array.from({ length: 25 }, (_, index) => index === 12 ? 0 : index + 1) },
      { id: 'card-2', room_id: 'room-1', player_id: 'p2', squares: Array.from({ length: 25 }, (_, index) => index === 12 ? 0 : index + 1) },
    ],
    bingo_squares: Array.from({ length: 25 }, (_, index) => ({ id: index + 1, slug: `square-${index + 1}`, likelihood_tier: 'likely' })),
    bingo_marks: Array.from({ length: 5 }, (_, index) => ({ id: `mark-${index}`, card_id: 'card-1', square_index: index, status: 'approved', marked_at: `2026-08-11T01:0${index}:00.000Z` })),
    beat_activations: [],
    signature_beats: [],
  }
  const tables = Object.fromEntries(RECEIPT_PREREQUISITE_TABLES.map((name) => {
    const raw = `${JSON.stringify(values[name], null, 2)}\n`
    return [name, { raw, seal: { name: `${name}.json`, bytes: new TextEncoder().encode(raw).byteLength, sha256: sha256Hex(raw) } }]
  })) as Record<typeof RECEIPT_PREREQUISITE_TABLES[number], SealedTextArtifact>
  const packet = buildSettlementDropReceiptPrerequisitesPacket({ room_code: 'ROOM', tables })
  const packetRaw = serializeSettlementDropReceiptPrerequisitesPacket(packet)
  const decisions = JSON.parse(serializeSettlementDropReceiptPrerequisitesDecisionTemplate(packet))
  decisions.settlement = { title: 'The true record', actor: 'The host', bingo_mode: 'preserve_live' }
  decisions.entries[0] = { ...decisions.entries[0], approved_outcome: 'resolved', warrant }
  decisions.bingo = { preserve_snapshot_marks: true, warrant, note: null }
  decisions.additional_fact_review = false
  return { packetRaw, decisions, tables }
}

describe('composeSettlementDropSettlementManifest', () => {
  it('materializes completed decisions through the canonical settlement preview', () => {
    const value = fixture()
    const result = composeSettlementDropSettlementManifest({
      packetRaw: value.packetRaw,
      decisionsRaw: `${JSON.stringify(value.decisions, null, 2)}\n`,
      tables: value.tables,
    })
    expect(result.manifest.entries).toMatchObject([{ key: 'category:1', outcome: 'resolved', winner: 'nom-wolf' }])
    expect(result.manifest.bingo.mode).toBe('preserve_live')
    expect(result.manifest.expected.player_totals).toEqual({ p1: 26, p2: 3 })
    expect(result.manifest.expected.character_points).toEqual({ wolf: 6 })
    expect(result.preview.inputSnapshot.bingo_marks).toHaveLength(5)
  })

  it('authors an intentionally empty replacement ledger only after an explicit negative preserve decision', () => {
    const value = fixture()
    value.decisions.settlement.bingo_mode = 'replace'
    value.decisions.bingo = { preserve_snapshot_marks: false, warrant: null, note: null }
    const result = composeSettlementDropSettlementManifest({
      packetRaw: value.packetRaw,
      decisionsRaw: `${JSON.stringify(value.decisions, null, 2)}\n`,
      tables: value.tables,
    })
    expect(result.manifest.bingo).toEqual({ mode: 'replace', marks: [] })
    expect(result.preview.resolvedBingoMarks).toEqual([])
    expect(result.manifest.expected.player_totals).toEqual({ p1: 6, p2: 3 })
  })

  it('fails closed on open decisions, changed packet bytes, and unrepresentable additional facts', () => {
    const open = fixture()
    open.decisions.entries[0].approved_outcome = null
    expect(() => composeSettlementDropSettlementManifest({
      packetRaw: open.packetRaw, decisionsRaw: JSON.stringify(open.decisions), tables: open.tables,
    })).toThrow('receipt prerequisite decisions are incomplete')

    const changed = fixture()
    expect(() => composeSettlementDropSettlementManifest({
      packetRaw: `${changed.packetRaw} `, decisionsRaw: JSON.stringify(changed.decisions), tables: changed.tables,
    })).toThrow('packet does not exactly match')

    const additional = fixture()
    additional.decisions.additional_fact_review = true
    expect(() => composeSettlementDropSettlementManifest({
      packetRaw: additional.packetRaw, decisionsRaw: JSON.stringify(additional.decisions), tables: additional.tables,
    })).toThrow('additional facts need a separate authored settlement worksheet')
  })

  it('rejects decision hash drift, snapshot source drift, and unsupported conviction snapshots', () => {
    const decisionDrift = fixture()
    decisionDrift.decisions.expected_packet_sha256 = 'f'.repeat(64)
    expect(() => composeSettlementDropSettlementManifest({
      packetRaw: decisionDrift.packetRaw,
      decisionsRaw: JSON.stringify(decisionDrift.decisions),
      tables: decisionDrift.tables,
    })).toThrow('do not target the exact packet bytes')

    const sourceDrift = fixture()
    const players = JSON.parse(sourceDrift.tables.players.raw)
    players[0].name = 'Changed'
    const raw = `${JSON.stringify(players, null, 2)}\n`
    sourceDrift.tables.players = {
      raw,
      seal: { name: 'players.json', bytes: new TextEncoder().encode(raw).byteLength, sha256: sha256Hex(raw) },
    }
    expect(() => composeSettlementDropSettlementManifest({
      packetRaw: sourceDrift.packetRaw,
      decisionsRaw: JSON.stringify(sourceDrift.decisions),
      tables: sourceDrift.tables,
    })).toThrow('packet does not exactly match')

    const conviction = fixture()
    const rooms = [{ id: 'room-1', code: 'ROOM', phase: 'finished', game_model: 'conviction_portfolio' }]
    const roomRaw = `${JSON.stringify(rooms, null, 2)}\n`
    conviction.tables.rooms = {
      raw: roomRaw,
      seal: { name: 'rooms.json', bytes: new TextEncoder().encode(roomRaw).byteLength, sha256: sha256Hex(roomRaw) },
    }
    const convictionPacket = buildSettlementDropReceiptPrerequisitesPacket({ room_code: 'ROOM', tables: conviction.tables })
    conviction.packetRaw = serializeSettlementDropReceiptPrerequisitesPacket(convictionPacket)
    conviction.decisions.expected_packet_sha256 = sha256Hex(conviction.packetRaw)
    expect(() => composeSettlementDropSettlementManifest({
      packetRaw: conviction.packetRaw,
      decisionsRaw: JSON.stringify(conviction.decisions),
      tables: conviction.tables,
    })).toThrow('conviction portfolio settlement needs sealed conviction picks')
  })
})
