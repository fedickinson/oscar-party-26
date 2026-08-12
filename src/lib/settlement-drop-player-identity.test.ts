import { describe, expect, it } from 'vitest'
import { sha256Hex } from './sha256'
import {
  buildSettlementDropPlayerIdentityPacket,
  serializeSettlementDropPlayerIdentityDecisionTemplate,
  serializeSettlementDropPlayerIdentityPacket,
} from './settlement-drop-player-identity'

function sealed(name: string, value: unknown) {
  const raw = typeof value === 'string' ? value : JSON.stringify(value)
  return { raw, seal: { name, bytes: new TextEncoder().encode(raw).byteLength, sha256: sha256Hex(raw) } }
}

function input() {
  const ceremony = '<script>var PIDS={"11111111-1111-4111-8111-111111111111":"Alice & Bob","22222222-2222-4222-8222-222222222222":"Cara"};</script>'
  return {
    room_code: 'WDKH',
    ceremony: sealed('ceremony.html', ceremony),
    tiers: sealed('tiers.json', {
      'Alice & Bob': { heavy: [], impact: [], present: [], absent: [] },
      Cara: { heavy: [], impact: [], present: [], absent: [] },
      _meta: {},
    }),
    personal: sealed('personal.json', {
      'Alice & Bob': { roster: [], card: [] }, Cara: { roster: [], card: [] },
    }),
    board: sealed('board.json', {
      cards: [{ player: 'Alice and Bob' }, { player: 'Cara' }],
      owners: { Wolf: 'Alice and Bob', Raven: 'Cara' },
      beats: [{ drafter: 'Alice and Bob' }, { drafter: 'Cara' }, { drafter: null }],
    }),
    rooms: sealed('rooms.json', [{
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', code: 'WDKH', phase: 'finished',
    }]),
    players: sealed('players.json', [
      { id: '11111111-1111-4111-8111-111111111111', room_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Alice and Bob' },
      { id: '22222222-2222-4222-8222-222222222222', room_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Cara' },
    ]),
  }
}

describe('buildSettlementDropPlayerIdentityPacket', () => {
  it('joins legacy display variants only through shared player UUIDs', () => {
    const packet = buildSettlementDropPlayerIdentityPacket(input())

    expect(packet.coverage).toEqual({
      snapshot_players: 2,
      ceremony_player_ids: 2,
      exact_uuid_joins: 2,
      display_name_variants: 1,
      missing_from_tiers: [],
      missing_from_personal: [],
      missing_from_board: [],
    })
    expect(packet.players).toEqual([
      {
        player_id: '11111111-1111-4111-8111-111111111111',
        snapshot_name: 'Alice and Bob',
        ceremony_name: 'Alice & Bob',
        exact_name_match: false,
        observed_names: {
          tiers: ['Alice & Bob'], personal: ['Alice & Bob'], board: ['Alice and Bob'],
        },
      },
      {
        player_id: '22222222-2222-4222-8222-222222222222',
        snapshot_name: 'Cara',
        ceremony_name: 'Cara',
        exact_name_match: true,
        observed_names: { tiers: ['Cara'], personal: ['Cara'], board: ['Cara'] },
      },
    ])
  })

  it('emits null canonical-name decisions bound to the packet', () => {
    const packet = buildSettlementDropPlayerIdentityPacket(input())
    const decisions = JSON.parse(serializeSettlementDropPlayerIdentityDecisionTemplate(packet))

    expect(decisions.expected_packet_sha256)
      .toBe(sha256Hex(serializeSettlementDropPlayerIdentityPacket(packet)))
    expect(decisions.decisions).toEqual([
      { player_id: '11111111-1111-4111-8111-111111111111', canonical_name: null, note: null },
      { player_id: '22222222-2222-4222-8222-222222222222', canonical_name: null, note: null },
    ])
  })

  it('rejects room ambiguity, UUID drift and unknown legacy names', () => {
    const ambiguous = input()
    ambiguous.rooms.raw = JSON.stringify([
      ...JSON.parse(ambiguous.rooms.raw),
      { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', code: 'WDKH' },
    ])
    ambiguous.rooms.seal = sealed('rooms.json', JSON.parse(ambiguous.rooms.raw)).seal
    expect(() => buildSettlementDropPlayerIdentityPacket(ambiguous))
      .toThrow('room code WDKH must resolve to exactly one snapshot room')

    const drifted = input()
    drifted.players.raw = drifted.players.raw.replace('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333')
    drifted.players.seal = sealed('players.json', JSON.parse(drifted.players.raw)).seal
    expect(() => buildSettlementDropPlayerIdentityPacket(drifted))
      .toThrow('ceremony player 11111111-1111-4111-8111-111111111111 is missing from snapshot room')

    const unknown = input()
    const board = JSON.parse(unknown.board.raw)
    board.cards.push({ player: 'Intruder' })
    unknown.board = sealed('board.json', board)
    expect(() => buildSettlementDropPlayerIdentityPacket(unknown))
      .toThrow('board references name Intruder not owned by a snapshot or ceremony player')
  })

  it('rejects duplicate ceremony names and seal drift', () => {
    const duplicate = input()
    duplicate.ceremony.raw = duplicate.ceremony.raw.replace('"Cara"', '"Alice & Bob"')
    duplicate.ceremony.seal = sealed('ceremony.html', duplicate.ceremony.raw).seal
    expect(() => buildSettlementDropPlayerIdentityPacket(duplicate))
      .toThrow('ceremony display name Alice & Bob belongs to multiple player IDs')

    const drifted = input()
    drifted.personal.seal.sha256 = 'f'.repeat(64)
    expect(() => buildSettlementDropPlayerIdentityPacket(drifted))
      .toThrow('personal seal does not match its bytes')
  })

  it('rejects identifiers that cannot prove a UUID join', () => {
    const invalid = input()
    invalid.ceremony.raw = invalid.ceremony.raw.replace(
      '11111111-1111-4111-8111-111111111111',
      'legacy-alice',
    )
    invalid.ceremony.seal = sealed('ceremony.html', invalid.ceremony.raw).seal
    expect(() => buildSettlementDropPlayerIdentityPacket(invalid))
      .toThrow('ceremony player ID must be a UUID')
  })

  it('serializes deterministically', () => {
    const packet = buildSettlementDropPlayerIdentityPacket(input())
    const first = serializeSettlementDropPlayerIdentityPacket(packet)
    expect(first).toBe(serializeSettlementDropPlayerIdentityPacket(packet))
    expect(first.endsWith('\n')).toBe(true)
  })
})
