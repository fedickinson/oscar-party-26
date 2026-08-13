import { describe, expect, it } from 'vitest'
import {
  buildSettlementDeltaReport,
  formatSettlementDeltaReport,
  type SettlementDeltaInput,
} from './settlement-delta'
import type {
  CategoryRow,
  NomineeRow,
  RoomSettlementEntryRow,
} from '../types/database'

const nominees = [
  { id: 'wolf', name: 'The Wolf' },
  { id: 'scribe', name: 'The Scribe' },
] as NomineeRow[]

function category(
  id: number,
  name: string,
  winnerId: string | null,
  tieWinnerId: string | null = null,
): CategoryRow {
  return {
    id,
    name,
    winner_id: winnerId,
    tie_winner_id: tieWinnerId,
    display_order: id,
    points: 5,
  } as CategoryRow
}

function entry(input: {
  id: number
  key: string
  name: string
  order: number
  categoryId: number | null
  outcome: 'resolved' | 'void'
  winnerId?: string | null
  tieWinnerId?: string | null
}): RoomSettlementEntryRow {
  return {
    id: input.id,
    settlement_id: 'settlement-after',
    entry_key: input.key,
    name: input.name,
    category_id: input.categoryId,
    outcome: input.outcome,
    points: 5,
    winner_id: input.winnerId ?? null,
    tie_winner_id: input.tieWinnerId ?? null,
    display_order: input.order,
    occurred_at: null,
    warrant: { verdict: 'true', sources: [{ kind: 'screen', ref: '00:10' }] },
  }
}

function input(): SettlementDeltaInput {
  return {
    before: {
      source: 'live' as const,
      categories: [
        category(1, 'The path is found', 'wolf'),
        category(2, 'The crown is claimed', 'wolf'),
        category(3, 'The gate opens', 'wolf'),
        category(4, 'The bell rings', 'wolf'),
      ],
    },
    after_entries: [
      entry({ id: 11, key: 'path', name: 'The path is found', order: 1, categoryId: 1, outcome: 'resolved', winnerId: 'wolf' }),
      entry({ id: 12, key: 'crown', name: 'The crown is claimed', order: 2, categoryId: 2, outcome: 'resolved', winnerId: 'scribe' }),
      entry({ id: 13, key: 'gate', name: 'The gate opens', order: 3, categoryId: 3, outcome: 'void' }),
      entry({ id: 14, key: 'wall', name: 'The witness reaches the wall', order: 4, categoryId: null, outcome: 'resolved', winnerId: 'wolf', tieWinnerId: 'scribe' }),
    ],
    nominees,
    players: [
      { id: 'alice', name: 'Alice' },
      { id: 'bob', name: 'Bob' },
    ],
    characters: [
      { id: 'wolf-character', name: 'The Wolf' },
      { id: 'scribe-character', name: 'The Scribe' },
    ],
    before_player_totals: { alice: 10, bob: 5 },
    after_player_totals: { alice: 13, bob: 5 },
    before_character_points: { 'wolf-character': 6 },
    after_character_points: { 'scribe-character': 8 },
    before_bingo_marks: [
      { card_id: 'alice-card', square_index: 0 },
      { card_id: 'bob-card', square_index: 1 },
    ],
    after_bingo_marks: [
      { card_id: 'alice-card', square_index: 0 },
      { card_id: 'bob-card', square_index: 2 },
    ],
  }
}

describe('settlement delta report', () => {
  it('classifies every live-to-settled fact and derives exact score and bingo deltas', () => {
    const report = buildSettlementDeltaReport(input())

    expect(report.before_source).toBe('live')
    expect(report.facts.map((fact) => [fact.id, fact.disposition])).toEqual([
      ['category:1', 'confirmed'],
      ['category:2', 'changed'],
      ['category:3', 'voided'],
      ['entry:wall', 'added'],
      ['category:4', 'struck'],
    ])
    expect(report.facts[1]).toMatchObject({
      before_winners: [{ id: 'wolf', name: 'The Wolf' }],
      after_winners: [{ id: 'scribe', name: 'The Scribe' }],
    })
    expect(report.facts[3]).toMatchObject({
      before_outcome: 'absent',
      after_winners: [
        { id: 'wolf', name: 'The Wolf' },
        { id: 'scribe', name: 'The Scribe' },
      ],
    })
    expect(report.player_totals).toEqual([
      { id: 'alice', name: 'Alice', before: 10, after: 13, delta: 3 },
      { id: 'bob', name: 'Bob', before: 5, after: 5, delta: 0 },
    ])
    expect(report.character_points).toEqual([
      { id: 'scribe-character', name: 'The Scribe', before: 0, after: 8, delta: 8 },
      { id: 'wolf-character', name: 'The Wolf', before: 6, after: 0, delta: -6 },
    ])
    expect(report.bingo_marks).toEqual({
      before: 2,
      after: 2,
      added: 1,
      removed: 1,
      unchanged: 1,
    })
  })

  it('compares amendments against the active settlement and keeps stable entry keys', () => {
    const value = input()
    value.before = {
      source: 'settled',
      entries: [
        entry({ id: 21, key: 'wall', name: 'The witness reaches the wall', order: 1, categoryId: null, outcome: 'resolved', winnerId: 'wolf' }),
        entry({ id: 22, key: 'gate', name: 'The gate opens', order: 2, categoryId: 3, outcome: 'void' }),
      ],
    }
    value.after_entries = [
      entry({ id: 31, key: 'wall', name: 'The witness reaches the far wall', order: 1, categoryId: null, outcome: 'resolved', winnerId: 'wolf' }),
      entry({ id: 32, key: 'gate', name: 'The gate opens', order: 2, categoryId: 3, outcome: 'void' }),
    ]

    const report = buildSettlementDeltaReport(value)
    expect(report.before_source).toBe('settled')
    expect(report.facts.map((fact) => [fact.id, fact.disposition])).toEqual([
      ['entry:wall', 'changed'],
      ['category:3', 'confirmed'],
    ])
  })

  it('formats an operator-readable deterministic report, including zero deltas', () => {
    expect(formatSettlementDeltaReport(buildSettlementDeltaReport(input()))).toEqual([
      'settlement delta (before=live)',
      'facts: confirmed=1 changed=1 added=1 voided=1 struck=1',
      '  [confirmed] The path is found: The Wolf -> The Wolf',
      '  [changed] The crown is claimed: The Wolf -> The Scribe',
      '  [voided] The gate opens: The Wolf -> void',
      '  [added] The witness reaches the wall: absent -> The Wolf + The Scribe',
      '  [struck] The bell rings: The Wolf -> absent',
      'player totals:',
      '  Alice: 10 -> 13 (+3)',
      '  Bob: 5 -> 5 (0)',
      'character points:',
      '  The Scribe: 0 -> 8 (+8)',
      '  The Wolf: 6 -> 0 (-6)',
      'bingo marks: 2 -> 2 (+1 added, -1 removed, 1 unchanged)',
    ])
  })

  it('keeps a no-change amendment explicit instead of collapsing it to an empty report', () => {
    const value = input()
    const unchangedEntry = entry({
      id: 41,
      key: 'wall',
      name: 'The witness reaches the wall',
      order: 1,
      categoryId: null,
      outcome: 'resolved',
      winnerId: 'wolf',
    })
    value.before = { source: 'settled', entries: [unchangedEntry] }
    value.after_entries = [{ ...unchangedEntry, id: 42 }]
    value.before_player_totals = { alice: 0, bob: 0 }
    value.after_player_totals = { alice: 0, bob: 0 }
    value.before_character_points = {}
    value.after_character_points = {}
    value.before_bingo_marks = []
    value.after_bingo_marks = []

    expect(formatSettlementDeltaReport(buildSettlementDeltaReport(value))).toEqual([
      'settlement delta (before=settled)',
      'facts: confirmed=1 changed=0 added=0 voided=0 struck=0',
      '  [confirmed] The witness reaches the wall: The Wolf -> The Wolf',
      'player totals:',
      '  Alice: 0 -> 0 (0)',
      '  Bob: 0 -> 0 (0)',
      'character points:',
      '  none',
      'bingo marks: 0 -> 0 (+0 added, -0 removed, 0 unchanged)',
    ])
  })

  it('adds stable IDs when display names are ambiguous', () => {
    const value = input()
    value.nominees = value.nominees.map((nominee) => ({ ...nominee, name: 'The Mask' })) as NomineeRow[]
    value.players = value.players.map((player) => ({ ...player, name: 'Alex' }))

    const lines = formatSettlementDeltaReport(buildSettlementDeltaReport(value))
    expect(lines).toContain('  [changed] The crown is claimed: The Mask (wolf) -> The Mask (scribe)')
    expect(lines).toContain('  Alex (alice): 10 -> 13 (+3)')
    expect(lines).toContain('  Alex (bob): 5 -> 5 (0)')
  })

  it('fails closed on unknown identities, duplicate marks, or extra ledger keys', () => {
    const unknownWinner = input()
    unknownWinner.after_entries[0].winner_id = 'missing'
    expect(() => buildSettlementDeltaReport(unknownWinner))
      .toThrow('after fact category:1 references unknown nominee missing')

    const duplicateMark = input()
    duplicateMark.before_bingo_marks.push({ card_id: 'alice-card', square_index: 0 })
    expect(() => buildSettlementDeltaReport(duplicateMark))
      .toThrow('before bingo marks contain duplicate position alice-card:0')

    const unknownPlayer = input()
    unknownPlayer.after_player_totals.intruder = 4
    expect(() => buildSettlementDeltaReport(unknownPlayer))
      .toThrow('after player totals reference unknown identity intruder')
  })
})
