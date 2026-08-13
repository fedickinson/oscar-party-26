import { describe, expect, it } from 'vitest'
import {
  buildReferenceIndex,
  normalizeExpectedLedger,
  resolveReference,
} from './settlement-ledger'

const records = [
  { id: 'player-1', name: 'Alex' },
  { id: 'player-2', name: 'Alex' },
  { id: 'player-3', name: 'Sam' },
]

describe('settlement ledger references', () => {
  it('accepts stable ids and unambiguous names', () => {
    expect(normalizeExpectedLedger(
      { 'player-1': 12, 'player-2': 8, Sam: 4 },
      records,
      'player totals',
    )).toEqual({ 'player-1': 12, 'player-2': 8, 'player-3': 4 })
  })

  it('rejects an ambiguous display name instead of overwriting a ledger row', () => {
    expect(() => normalizeExpectedLedger(
      { Alex: 12, Sam: 4 },
      records,
      'player totals',
    )).toThrow('player totals reference Alex is ambiguous; use an id')
  })

  it('rejects two aliases for the same record', () => {
    expect(() => normalizeExpectedLedger(
      { 'player-3': 4, Sam: 4 },
      records,
      'player totals',
    )).toThrow('player totals references player-3 more than once')
  })

  it('resolves bingo and winner references with the same ambiguity rule', () => {
    const index = buildReferenceIndex(records)

    expect(resolveReference('player-3', index, 'bingo player')).toEqual(records[2])
    expect(() => resolveReference('Alex', index, 'bingo player'))
      .toThrow('bingo player Alex is ambiguous; use an id')
  })
})
