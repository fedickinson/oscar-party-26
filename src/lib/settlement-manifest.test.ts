import { describe, expect, it } from 'vitest'
import {
  assertResolvedSettlementReferences,
  parseSettlementManifest,
  settlementIdentityPayload,
} from './settlement-manifest'

const warrant = {
  verdict: 'true' as const,
  sources: [{ kind: 'screen', ref: '00:12:30' }],
}

function manifest(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    version: 1,
    title: 'The researched record',
    actor: 'operator',
    entries: [{
      key: 'event-1',
      name: 'The event',
      category_id: 1,
      outcome: 'resolved',
      points: 10,
      winner: 'winner-id',
      occurred_at: '2026-08-10T01:02:03.000Z',
      warrant,
    }],
    bingo: { mode: 'replace', marks: [] },
    expected: { player_totals: {}, character_points: {} },
    ...overrides,
  })
}

describe('parseSettlementManifest', () => {
  it('accepts the complete manifest contract', () => {
    expect(parseSettlementManifest(manifest()).entries).toHaveLength(1)
  })

  it('rejects an outcome the RPC would reject', () => {
    const entries = [{
      key: 'event-1', name: 'The event', category_id: 1,
      outcome: 'provisional', points: 10, winner: 'winner-id', warrant,
    }]

    expect(() => parseSettlementManifest(manifest({ entries })))
      .toThrow('outcome must be resolved or void')
  })

  it('rejects invalid entry and bingo timestamps before preflight', () => {
    const entries = [{
      key: 'event-1', name: 'The event', category_id: 1,
      outcome: 'resolved', points: 10, winner: 'winner-id',
      occurred_at: 'not-a-time', warrant,
    }]
    const bingo = {
      mode: 'replace',
      marks: [{ player: 'player-id', square_slug: 'dragon', marked_at: 'also-not-a-time', warrant }],
    }

    expect(() => parseSettlementManifest(manifest({ entries })))
      .toThrow('occurred_at must be a valid timestamp')
    expect(() => parseSettlementManifest(manifest({ bingo })))
      .toThrow('marked_at must be a valid timestamp')
  })

  it('rejects incomplete or non-integer expected ledgers before a record is emitted', () => {
    expect(() => parseSettlementManifest(manifest({
      expected: { player_totals: { 'player-1': null }, character_points: {} },
    }))).toThrow('expected player_totals value for player-1 must be an integer')
    expect(() => parseSettlementManifest(manifest({
      expected: { player_totals: {}, character_points: { fox: 1.5 } },
    }))).toThrow('expected character_points value for fox must be an integer')
  })

  it('rejects unknown fields at every manifest object boundary', () => {
    const cases: Array<{
      field: string
      label: string
      mutate: (value: Record<string, any>) => void
    }> = [{
      field: 'private_notes',
      label: 'manifest',
      mutate: (value) => { value.private_notes = 'research stays outside the canonical record' },
    }, {
      field: 'raw_transcript',
      label: 'entry 1',
      mutate: (value) => { value.entries[0].raw_transcript = 'private source material' },
    }, {
      field: 'private_notes',
      label: 'entry 1 warrant',
      mutate: (value) => { value.entries[0].warrant.private_notes = 'operator note' },
    }, {
      field: 'excerpt',
      label: 'entry 1 warrant source 1',
      mutate: (value) => { value.entries[0].warrant.sources[0].excerpt = 'unpublished excerpt' },
    }, {
      field: 'provisional_marks',
      label: 'bingo',
      mutate: (value) => { value.bingo.provisional_marks = [] },
    }, {
      field: 'reviewed_at',
      label: 'bingo mark 1',
      mutate: (value) => {
        value.bingo.marks = [{
          player: 'player-id',
          square_slug: 'dragon',
          warrant,
          reviewed_at: '2026-08-10T02:00:00.000Z',
        }]
      },
    }, {
      field: 'provisional',
      label: 'expected',
      mutate: (value) => { value.expected.provisional = true },
    }]

    for (const testCase of cases) {
      const value = JSON.parse(manifest()) as Record<string, any>
      testCase.mutate(value)
      expect(() => parseSettlementManifest(JSON.stringify(value)))
        .toThrow(`${testCase.label} has unknown field ${testCase.field}`)
    }
  })
})

describe('assertResolvedSettlementReferences', () => {
  it('rejects winner aliases that resolve to the same row', () => {
    expect(() => assertResolvedSettlementReferences(
      [{ entry_key: 'event-1', winner_id: 'nominee-1', tie_winner_id: 'nominee-1' }],
      [],
    )).toThrow('winner and tie winner resolve to the same nominee')
  })

  it('rejects bingo aliases that resolve to the same card position', () => {
    expect(() => assertResolvedSettlementReferences(
      [],
      [
        { card_id: 'card-1', square_index: 3 },
        { card_id: 'card-1', square_index: 3 },
      ],
    )).toThrow('replacement bingo marks resolve to the same card position')
  })
})

describe('settlementIdentityPayload', () => {
  const entries = [{
    entry_key: 'event-1', category_id: 1,
    winner_id: 'winner-id', tie_winner_id: null,
  }]

  it('makes a preserved live mark timestamp part of settlement identity', () => {
    const parsed = parseSettlementManifest(manifest({
      bingo: { mode: 'preserve_live', warrant },
    }))
    const first = settlementIdentityPayload(parsed, entries, [{
      card_id: 'card-1', square_index: 3, marked_at: '2026-08-10T01:00:00.000Z',
    }])
    const corrected = settlementIdentityPayload(parsed, entries, [{
      card_id: 'card-1', square_index: 3, marked_at: '2026-08-10T01:04:00.000Z',
    }])

    expect(corrected).not.toEqual(first)
  })

  it('does not make a generated preview time a second identity for replacement marks', () => {
    const parsed = parseSettlementManifest(manifest({
      bingo: {
        mode: 'replace',
        marks: [{ player: 'player-id', square_slug: 'dragon', warrant }],
      },
    }))
    const first = settlementIdentityPayload(parsed, entries, [{
      card_id: 'card-1', square_index: 3, marked_at: '2026-08-10T01:00:00.000Z',
    }])
    const retried = settlementIdentityPayload(parsed, entries, [{
      card_id: 'card-1', square_index: 3, marked_at: '2026-08-10T01:04:00.000Z',
    }])

    expect(retried).toEqual(first)
  })

  it('orders preserved mark identity by card and square rather than live-row insertion', () => {
    const parsed = parseSettlementManifest(manifest({
      bingo: { mode: 'preserve_live', warrant },
    }))
    const marks = [{
      card_id: 'card-b', square_index: 1, marked_at: '2026-08-10T01:02:00.000Z',
    }, {
      card_id: 'card-a', square_index: 4, marked_at: '2026-08-10T01:01:00.000Z',
    }]

    expect(settlementIdentityPayload(parsed, entries, marks))
      .toEqual(settlementIdentityPayload(parsed, entries, [...marks].reverse()))
  })
})
