import { describe, expect, it } from 'vitest'
import {
  buildSettlementAuthoringWorksheet,
  finalizeSettlementAuthoringWorksheet,
  serializeSettlementAuthoringWorksheet,
  type SettlementAuthoringInput,
} from './settlement-authoring'

const warrant = {
  verdict: 'true' as const,
  sources: [{ kind: 'screen', ref: '00:12:30' }],
}

function fixture(): SettlementAuthoringInput {
  const squareIds = [...Array.from({ length: 12 }, (_, index) => index + 1), 0,
    ...Array.from({ length: 12 }, (_, index) => index + 13)]
  return {
    room: {
      id: 'room-1',
      code: 'NIGHT1',
      phase: 'finished',
      show_pack_id: 'pack-1',
      active_settlement_id: null,
    },
    showPack: {
      id: 'pack-1',
      pack_key: 'night-one',
      version: 1,
      title: 'Night One',
      status: 'published',
    },
    activeSettlement: null,
    activeSettlementEntries: [],
    activeSettlementMarks: [],
    players: [{ id: 'player-1', name: 'Private Player One', is_host: true }, {
      id: 'player-2', name: 'Private Player Two', is_host: false,
    }],
    categories: [{
      id: 1,
      name: 'The Fox breaks the bargain',
      points: 10,
      display_order: 1,
      announced_at: '2026-08-10T01:02:03.000Z',
      show_pack_id: 'pack-1',
      room_id: null,
    }, {
      id: 2,
      name: 'The old gate opens',
      points: 5,
      display_order: 2,
      announced_at: null,
      show_pack_id: 'pack-1',
      room_id: null,
    }, {
      id: 3,
      name: 'Unused possibility',
      points: 4,
      display_order: 3,
      announced_at: null,
      show_pack_id: 'pack-1',
      room_id: null,
    }],
    nominees: [{ id: 'fox', name: 'The Fox', type: 'person', film_name: 'The Wood' }, {
      id: 'owl', name: 'The Owl', type: 'person', film_name: 'The Tower',
    }],
    roomWinners: [{
      category_id: 1,
      winner_id: 'fox',
      tie_winner_id: null,
    }],
    confidencePicks: [{
      id: 'confidence-1',
      player_id: 'player-1',
      category_id: 2,
      nominee_id: 'owl',
      confidence: 4,
    }],
    draftEntities: [{ id: 'fox', name: 'The Fox', type: 'person', film_name: 'The Wood' }, {
      id: 'owl', name: 'The Owl', type: 'person', film_name: 'The Tower',
    }],
    draftPicks: [{ id: 'draft-1', player_id: 'player-1', entity_id: 'fox' }, {
      id: 'draft-2', player_id: 'player-2', entity_id: 'owl',
    }],
    bingoCards: [{ id: 'card-1', player_id: 'player-1', squares: squareIds }, {
      id: 'card-2', player_id: 'player-2', squares: squareIds,
    }],
    bingoSquares: Array.from({ length: 24 }, (_, index) => ({
      id: index + 1,
      slug: `square-${index + 1}`,
      title: `Square ${index + 1}`,
    })),
    bingoMarks: [{
      id: 'mark-approved',
      card_id: 'card-1',
      square_index: 0,
      status: 'approved',
      marked_at: '2026-08-10T01:03:00.000Z',
    }, {
      id: 'mark-denied',
      card_id: 'card-1',
      square_index: 1,
      status: 'denied',
      marked_at: '2026-08-10T01:04:00.000Z',
    }],
  }
}

describe('settlement authoring worksheet', () => {
  it('separates provisional evidence from every still-unmade settlement decision', () => {
    const worksheet = buildSettlementAuthoringWorksheet(fixture())

    expect(worksheet.counts).toEqual({
      players: 2,
      current_entries: 2,
      resolved_entries: 1,
      unresolved_staked_entries: 1,
      approved_bingo_marks: 1,
    })
    expect(worksheet.current_record.source).toBe('live')
    expect(worksheet.current_record.entries.map((entry) => ({
      category_id: entry.category_id,
      status: entry.status,
      winner_id: entry.winner?.id ?? null,
    }))).toEqual([
      { category_id: 1, status: 'provisional_resolved', winner_id: 'fox' },
      { category_id: 2, status: 'unresolved_stake', winner_id: null },
    ])
    expect(worksheet.current_record.approved_bingo_marks).toEqual([
      expect.objectContaining({
        player: { id: 'player-1', name: 'Private Player One' },
        square: { id: 1, slug: 'square-1', title: 'Square 1' },
      }),
    ])
    expect(worksheet.manifest_draft.entries).toEqual([
      expect.objectContaining({ category_id: 1, outcome: null, warrant: null }),
      expect.objectContaining({ category_id: 2, outcome: null, warrant: null }),
    ])
    expect(worksheet.manifest_draft.entries[0]).not.toHaveProperty('winner')
    expect(worksheet.manifest_draft.bingo).toEqual({ mode: null, marks: [] })
    expect(worksheet.manifest_draft.expected.player_totals).toEqual({
      'player-1': null,
      'player-2': null,
    })
    expect(worksheet.issues).toEqual([])
  })

  it('is byte-stable across database row order', () => {
    const input = fixture()
    const reversed = structuredClone(input)
    reversed.players.reverse()
    reversed.categories.reverse()
    reversed.nominees.reverse()
    reversed.roomWinners.reverse()
    reversed.draftEntities.reverse()
    reversed.draftPicks.reverse()
    reversed.bingoCards.reverse()
    reversed.bingoSquares.reverse()
    reversed.bingoMarks.reverse()

    expect(serializeSettlementAuthoringWorksheet(buildSettlementAuthoringWorksheet(reversed)))
      .toBe(serializeSettlementAuthoringWorksheet(buildSettlementAuthoringWorksheet(input)))
  })

  it('carries the complete conviction portfolio into the settlement worksheet', () => {
    const input = fixture()
    input.room.game_model = 'conviction_portfolio'
    input.categories[0].source_signature_beat_id = 41
    input.signatureBeats = [
      { id: 41, name: 'The Fox breaks the bargain', points: 10, entity_id: 'fox' },
      { id: 42, name: 'The Owl crosses the gate', points: 7, entity_id: 'owl' },
    ]
    input.convictionPicks = [
      { player_id: 'player-1', beat_id: 41 },
      { player_id: 'player-2', beat_id: 41 },
      { player_id: 'player-1', beat_id: 42 },
    ]

    const worksheet = buildSettlementAuthoringWorksheet(input)

    expect(worksheet.counts).toMatchObject({
      conviction_picks: 3,
      conviction_beats: 2,
      resolved_conviction_beats: 1,
    })
    expect(worksheet.current_record.convictions).toEqual([
      expect.objectContaining({
        player: { id: 'player-1', name: 'Private Player One' },
        beat: expect.objectContaining({ id: 41, points: 10 }),
        believer_count: 2,
        status: 'struck',
      }),
      expect.objectContaining({
        player: { id: 'player-2', name: 'Private Player Two' },
        beat: expect.objectContaining({ id: 41, points: 10 }),
        believer_count: 2,
        status: 'struck',
      }),
      expect.objectContaining({
        player: { id: 'player-1', name: 'Private Player One' },
        beat: expect.objectContaining({ id: 42, points: 7 }),
        believer_count: 1,
        status: 'quiet',
      }),
    ])
    expect(worksheet.authoring_queue.required_conviction_beat_ids).toEqual([41, 42])
    expect(worksheet.issues).toEqual([])
  })

  it('preserves an active researched settlement as the amendment starting point', () => {
    const input = fixture()
    input.room.phase = 'closed'
    input.room.active_settlement_id = 'settlement-1'
    input.activeSettlement = {
      id: 'settlement-1',
      room_id: 'room-1',
      version: 2,
      title: 'The true record',
      actor: 'research desk',
      bingo_mode: 'replace',
      created_at: '2026-08-10T02:00:00.000Z',
    }
    input.activeSettlementEntries = [{
      settlement_id: 'settlement-1',
      entry_key: 'unscored-witness',
      name: 'A witness reaches the wall',
      category_id: null,
      outcome: 'resolved',
      points: 1,
      winner_id: 'owl',
      tie_winner_id: null,
      display_order: 1,
      occurred_at: '2026-08-10T01:04:05.000Z',
      warrant,
    }]
    input.activeSettlementMarks = [{
      settlement_id: 'settlement-1',
      card_id: 'card-1',
      square_index: 0,
      marked_at: '2026-08-10T01:03:00.000Z',
      warrant,
    }]

    const worksheet = buildSettlementAuthoringWorksheet(input)
    expect(worksheet.current_record.source).toBe('settled')
    expect(worksheet.current_record.entries).toEqual([
      expect.objectContaining({
        key: 'unscored-witness',
        status: 'settled',
        winner: { id: 'owl', name: 'The Owl' },
      }),
    ])
    expect(worksheet.manifest_draft.entries).toEqual([{
      key: 'unscored-witness',
      name: 'A witness reaches the wall',
      outcome: 'resolved',
      points: 1,
      winner: 'owl',
      occurred_at: '2026-08-10T01:04:05.000Z',
      warrant,
    }])
    expect(worksheet.manifest_draft.title).toBeNull()
    expect(worksheet.manifest_draft.actor).toBeNull()
    expect(worksheet.manifest_draft.bingo.mode).toBeNull()
    expect(worksheet.issues).toEqual([])
  })

  it('fails closed on dangling room, winner, stake, draft and bingo references', () => {
    const input = fixture()
    input.showPack.id = 'other-pack'
    input.roomWinners[0].winner_id = 'missing-nominee'
    input.confidencePicks[0].player_id = 'missing-player'
    input.draftPicks[0].entity_id = 'missing-entity'
    input.bingoMarks[0].square_index = 30

    const worksheet = buildSettlementAuthoringWorksheet(input)
    expect(worksheet.issues).toEqual(expect.arrayContaining([
      'room show pack pack-1 does not match registry other-pack',
      'winner for category 1 references unknown nominee missing-nominee',
      'confidence pick confidence-1 references unknown player missing-player',
      'draft pick draft-1 references unknown entity missing-entity',
      'approved bingo mark mark-approved has invalid square index 30',
    ]))
  })

  it('emits a canonical manifest only after every researched field is valid', () => {
    const worksheet = buildSettlementAuthoringWorksheet(fixture())
    const raw = serializeSettlementAuthoringWorksheet(worksheet)
    expect(() => finalizeSettlementAuthoringWorksheet(raw))
      .toThrow('manifest title and actor are required')

    worksheet.manifest_draft.title = 'The researched record'
    worksheet.manifest_draft.actor = 'research desk'
    Object.assign(worksheet.manifest_draft.entries[0], {
      outcome: 'resolved',
      winner: 'fox',
      warrant,
    })
    Object.assign(worksheet.manifest_draft.entries[1], {
      outcome: 'void',
      warrant,
    })
    Object.assign(worksheet.manifest_draft.bingo, {
      mode: 'preserve_live',
      warrant,
    })
    worksheet.manifest_draft.expected.player_totals = {
      'player-1': 15,
      'player-2': 0,
    }
    worksheet.manifest_draft.expected.character_points = { fox: 10 }

    const missingStake = structuredClone(worksheet)
    missingStake.manifest_draft.entries = missingStake.manifest_draft.entries
      .filter((entry) => entry.category_id !== 2)
    expect(() => finalizeSettlementAuthoringWorksheet(
      serializeSettlementAuthoringWorksheet(missingStake),
    )).toThrow('manifest draft is missing required staked category 2')

    const missingPlayerTotal = structuredClone(worksheet)
    delete missingPlayerTotal.manifest_draft.expected.player_totals['player-2']
    expect(() => finalizeSettlementAuthoringWorksheet(
      serializeSettlementAuthoringWorksheet(missingPlayerTotal),
    )).toThrow('manifest draft player_totals must use the worksheet player ids exactly')

    const manifest = finalizeSettlementAuthoringWorksheet(
      serializeSettlementAuthoringWorksheet(worksheet),
    )
    expect(manifest.entries).toHaveLength(2)
    expect(JSON.stringify(manifest)).not.toContain('current_record')
    expect(JSON.stringify(manifest)).not.toContain('Private Player')
  })
})
