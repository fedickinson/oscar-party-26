import { describe, expect, it } from 'vitest'
import {
  createSettlementReceipt,
  parseSettlementReceipt,
  serializeSettlementReceipt,
  settlementCharacterPoints,
  settlementPlayerTotals,
  settlementStandings,
  type SettlementReceipt,
} from './settlement-receipt'

function card(playerId: string) {
  return {
    player_id: playerId,
    bingo: Array.from({ length: 25 }, (_, index) => ({
      label: index === 12 ? 'FREE' : `Square ${index + 1}`,
      marked: index === 12,
      free: index === 12,
    })),
  }
}

function receiptInput(): SettlementReceipt {
  return {
    version: 1 as const,
    source: 'scripts/settle-room.mts' as const,
    room_code: 'PROOF',
    room_id: '22222222-2222-4222-8222-222222222222',
    settlement_id: '11111111-1111-4111-8111-111111111111',
    settlement_version: 2,
    manifest_hash: 'a'.repeat(64),
    revision: {
      settled_at: '2026-08-11T01:30:00.000Z',
      supersedes_id: '44444444-4444-4444-8444-444444444444',
    },
    show_pack: {
      registry_id: '33333333-3333-4333-8333-333333333333',
      pack_id: 'hotd-s3e7',
      version: 7,
    },
    players: [
      { id: 'tyrion', name: 'Tyrion' },
      { id: 'arya', name: 'Arya' },
    ],
    characters: [
      { id: 'wolf', name: 'The Wolf', player_id: 'arya' },
      { id: 'scribe', name: 'The Scribe' },
    ],
    settled_facts: [
      {
        id: 'path-found',
        sequence: 1,
        title: 'The hidden path is found',
        outcome: 'resolved',
        board_status: 'authored',
        occurred_at: '2026-08-11T01:02:03.000Z',
        winner: { id: 'wolf', name: 'The Wolf' },
      },
      {
        id: 'gate-void',
        sequence: 2,
        title: 'The north gate opens',
        outcome: 'void',
        board_status: 'authored',
      },
      {
        id: 'witness-at-wall',
        sequence: 3,
        title: 'The witness reaches the wall',
        outcome: 'resolved',
        board_status: 'unscored',
        occurred_at: '2026-08-11T01:04:05.000Z',
        winner: { id: 'scribe', name: 'The Scribe' },
      },
    ],
    score_events: [
      {
        id: 'draft:wolf:path',
        kind: 'draft' as const,
        player_id: 'arya',
        character_id: 'wolf',
        label: 'The Wolf: finds the path',
        points: 8,
      },
      {
        id: 'prediction:tyrion:path',
        kind: 'prediction' as const,
        player_id: 'tyrion',
        label: 'The path was found',
        points: 3,
      },
    ],
    personal_cards: [card('tyrion'), card('arya')],
  }
}

const trigger = {
  source_signature_beat_id: 42,
  contract: {
    truth_authority: 'operator_declaration' as const,
    title: 'The Wolf finds the path',
    condition: 'The Wolf must visibly find and enter the hidden path.',
    exclusions: ['A map alone does not count.'],
    adjudication: {
      proxies: 'do_not_count' as const,
      offscreen: 'do_not_count' as const,
      mentions: 'do_not_count' as const,
    },
    title_review: {
      status: 'approved' as const,
      note: 'The title promises the visible discovery required by the rule.',
    },
    basis_claim_ids: ['screen-claim-42'],
  },
}

describe('settlement receipt', () => {
  it('serializes canonical settlement evidence and derives totals from score events', () => {
    const receipt = createSettlementReceipt(receiptInput())
    const first = serializeSettlementReceipt(receipt)
    const second = serializeSettlementReceipt(parseSettlementReceipt(first))

    expect(first).toBe(second)
    expect(receipt.score_events.map((event) => event.id)).toEqual([
      'draft:wolf:path',
      'prediction:tyrion:path',
    ])
    expect(receipt.personal_cards.map((edition) => edition.player_id)).toEqual(['arya', 'tyrion'])
    expect(receipt.players.map((player) => player.id)).toEqual(['arya', 'tyrion'])
    expect(receipt.characters.map((character) => character.id)).toEqual(['scribe', 'wolf'])
    expect(receipt.settled_facts?.map((fact) => fact.id)).toEqual([
      'path-found',
      'gate-void',
      'witness-at-wall',
    ])
    expect(receipt.revision).toEqual({
      settled_at: '2026-08-11T01:30:00.000Z',
      supersedes_id: '44444444-4444-4444-8444-444444444444',
    })
    expect(settlementPlayerTotals(receipt)).toEqual({ arya: 8, tyrion: 3 })
    expect(settlementCharacterPoints(receipt)).toEqual({ wolf: 8 })
    expect(first).not.toContain('player_totals')
    expect(first.endsWith('\n')).toBe(true)
  })

  it('retains reviewed trigger provenance on a conviction prediction event', () => {
    const input = receiptInput()
    input.score_events[1] = { ...input.score_events[1], trigger }
    const receipt = createSettlementReceipt(input)

    expect(receipt.score_events.find((event) => event.kind === 'prediction')?.trigger).toEqual(trigger)
  })

  it('rejects receipts that could not identify an applied settlement', () => {
    expect(() => parseSettlementReceipt(JSON.stringify({
      ...receiptInput(),
      settlement_id: 'preview',
    }))).toThrow('settlement_id must be a UUID')

    expect(() => parseSettlementReceipt(JSON.stringify({
      ...receiptInput(),
      source: 'hand-authored',
    }))).toThrow('source must be scripts/settle-room.mts')
  })

  it('attests the settled room show pack while accepting legacy receipts without it', () => {
    const receipt = createSettlementReceipt(receiptInput())
    expect(receipt.show_pack).toEqual({
      registry_id: '33333333-3333-4333-8333-333333333333',
      pack_id: 'hotd-s3e7',
      version: 7,
    })

    const legacy = receiptInput()
    delete legacy.show_pack
    expect(parseSettlementReceipt(JSON.stringify(legacy)).show_pack).toBeUndefined()

    const invalid = receiptInput()
    invalid.show_pack!.pack_id = 'HotD S3E7'
    expect(() => parseSettlementReceipt(JSON.stringify(invalid)))
      .toThrow('show_pack pack_id must be a kebab-case slug')
  })

  it('accepts legacy receipts without settled facts but validates any supplied fact timeline', () => {
    const legacy = receiptInput()
    delete legacy.settled_facts
    expect(parseSettlementReceipt(JSON.stringify(legacy)).settled_facts).toBeUndefined()

    const duplicateSequence = receiptInput()
    duplicateSequence.settled_facts![1].sequence = duplicateSequence.settled_facts![0].sequence
    expect(() => parseSettlementReceipt(JSON.stringify(duplicateSequence)))
      .toThrow('duplicate settled fact sequence')

    const sameTie = receiptInput()
    sameTie.settled_facts![0].tie_winner = { id: 'wolf', name: 'The Wolf' }
    expect(() => parseSettlementReceipt(JSON.stringify(sameTie)))
      .toThrow('winner and tie_winner must be different')

    const voidWinner = receiptInput()
    voidWinner.settled_facts![1].winner = { id: 'wolf', name: 'The Wolf' }
    expect(() => parseSettlementReceipt(JSON.stringify(voidWinner)))
      .toThrow('void settled fact cannot have a winner')
  })

  it('accepts legacy receipts without revision provenance but validates any supplied chain', () => {
    const legacy = receiptInput()
    delete legacy.revision
    expect(parseSettlementReceipt(JSON.stringify(legacy)).revision).toBeUndefined()

    const invalidDate = receiptInput()
    invalidDate.revision!.settled_at = 'not-a-timestamp'
    expect(() => parseSettlementReceipt(JSON.stringify(invalidDate)))
      .toThrow('revision settled_at must be an ISO timestamp')

    const selfSupersession = receiptInput()
    selfSupersession.revision!.supersedes_id = selfSupersession.settlement_id
    expect(() => parseSettlementReceipt(JSON.stringify(selfSupersession)))
      .toThrow('revision supersedes_id cannot equal settlement_id')
  })

  it('rejects duplicate evidence, unknown players, and non-integer points', () => {
    const duplicate = receiptInput()
    duplicate.score_events[1].id = duplicate.score_events[0].id
    expect(() => parseSettlementReceipt(JSON.stringify(duplicate))).toThrow('duplicate score event')

    const unknownPlayer = receiptInput()
    unknownPlayer.score_events[0].player_id = 'sansa'
    expect(() => parseSettlementReceipt(JSON.stringify(unknownPlayer))).toThrow('unknown player sansa')

    const fractional = receiptInput()
    fractional.score_events[0].points = 8.5
    expect(() => parseSettlementReceipt(JSON.stringify(fractional))).toThrow('points must be a non-zero integer')
  })

  it('permits negative corrections only as adjustment events', () => {
    for (const kind of ['draft', 'prediction', 'bingo'] as const) {
      const receipt = receiptInput()
      receipt.score_events[0] = {
        ...receipt.score_events[0],
        kind,
        character_id: kind === 'draft' ? receipt.score_events[0].character_id : undefined,
        points: -2,
      }
      expect(() => parseSettlementReceipt(JSON.stringify(receipt))).toThrow(
        `${kind} points must be a positive integer`,
      )
    }

    const correction = receiptInput()
    correction.score_events[0] = {
      ...correction.score_events[0],
      kind: 'adjustment',
      points: -2,
    }
    expect(parseSettlementReceipt(JSON.stringify(correction)).score_events[0].points).toBe(-2)
  })

  it('freezes a complete reviewed source-beat rule beside its score event', () => {
    const receipt = receiptInput()
    receipt.score_events[0].trigger = trigger

    const parsed = parseSettlementReceipt(JSON.stringify(receipt))

    expect(parsed.score_events[0].trigger).toEqual(trigger)
    expect(serializeSettlementReceipt(parsed)).toContain('source_signature_beat_id')
    expect(parsed.score_events[0].trigger?.contract.truth_authority)
      .toBe('operator_declaration')
  })

  it('rejects an unknown proposition truth authority without breaking legacy trigger receipts', () => {
    for (const authority of [
      'official_result',
      'operator_declaration',
      'ai_proposal_human_confirmation',
    ] as const) {
      const supported = receiptInput()
      supported.score_events[0].trigger = structuredClone(trigger)
      supported.score_events[0].trigger!.contract.truth_authority = authority
      expect(parseSettlementReceipt(JSON.stringify(supported))
        .score_events[0].trigger?.contract.truth_authority).toBe(authority)
    }

    const invalid = receiptInput()
    invalid.score_events[0].trigger = structuredClone(trigger)
    ;(invalid.score_events[0].trigger!.contract as unknown as Record<string, unknown>)
      .truth_authority = 'model_decides'
    expect(() => parseSettlementReceipt(JSON.stringify(invalid))).toThrow(
      'trigger contract truth_authority must be an explicit supported authority',
    )

    const legacy = receiptInput()
    legacy.score_events[0].trigger = structuredClone(trigger)
    delete legacy.score_events[0].trigger!.contract.truth_authority
    expect(parseSettlementReceipt(JSON.stringify(legacy)).score_events[0].trigger?.contract)
      .not.toHaveProperty('truth_authority')
  })

  it('permits trigger provenance only on character drafts and conviction predictions', () => {
    for (const kind of ['bingo', 'adjustment'] as const) {
      const receipt = receiptInput()
      receipt.score_events[0] = {
        ...receipt.score_events[0],
        kind,
        character_id: kind === 'adjustment' ? receipt.score_events[0].character_id : undefined,
        trigger,
      }
      expect(() => parseSettlementReceipt(JSON.stringify(receipt))).toThrow(
        'score event 1 trigger requires a character draft or conviction prediction event',
      )
    }

    const ownerlessDraft = receiptInput()
    ownerlessDraft.score_events[0] = {
      ...ownerlessDraft.score_events[0],
      character_id: undefined,
      trigger,
    }
    expect(() => parseSettlementReceipt(JSON.stringify(ownerlessDraft))).toThrow(
      'score event 1 trigger requires a character draft or conviction prediction event',
    )
  })

  it('rejects incomplete, implicit, or unreviewed trigger provenance', () => {
    const missingExclusion = receiptInput()
    missingExclusion.score_events[0].trigger = structuredClone(trigger)
    missingExclusion.score_events[0].trigger!.contract.exclusions = []
    expect(() => parseSettlementReceipt(JSON.stringify(missingExclusion))).toThrow(
      'trigger contract exclusions must be a non-empty array',
    )

    const implicitProxy = receiptInput()
    implicitProxy.score_events[0].trigger = structuredClone(trigger)
    ;(implicitProxy.score_events[0].trigger!.contract.adjudication as Record<string, unknown>).proxies = 'unspecified'
    expect(() => parseSettlementReceipt(JSON.stringify(implicitProxy))).toThrow(
      'trigger contract adjudication.proxies',
    )

    const inventedField = receiptInput()
    inventedField.score_events[0].trigger = {
      ...structuredClone(trigger),
      private_note: 'not canonical',
    } as typeof trigger
    expect(() => parseSettlementReceipt(JSON.stringify(inventedField))).toThrow(
      'trigger has unknown field private_note',
    )
  })

  it('binds score and card attribution to canonical player and roster identities', () => {
    const wrongOwner = receiptInput()
    wrongOwner.characters[0].player_id = 'tyrion'
    expect(() => parseSettlementReceipt(JSON.stringify(wrongOwner))).toThrow(
      'score event draft:wolf:path awards wolf to the wrong player',
    )

    const missingCharacter = receiptInput()
    missingCharacter.characters = missingCharacter.characters.filter((character) => character.id !== 'wolf')
    expect(() => parseSettlementReceipt(JSON.stringify(missingCharacter))).toThrow(
      'score event draft:wolf:path references unknown character wolf',
    )

    const swappedCard = receiptInput()
    swappedCard.personal_cards[0].player_id = 'sansa'
    expect(() => parseSettlementReceipt(JSON.stringify(swappedCard))).toThrow(
      'personal card 1 references unknown player sansa',
    )
  })

  it('uses the canonical confidence cascade and competition ranks', () => {
    const receipt = receiptInput()
    receipt.score_events = [
      { id: 'arya-draft', kind: 'draft', player_id: 'arya', character_id: 'wolf', label: 'Draft', points: 10 },
      { id: 'tyrion-prediction', kind: 'prediction', player_id: 'tyrion', label: 'Prediction', points: 10 },
    ]
    const standings = settlementStandings(createSettlementReceipt(receipt))

    expect(standings.map((row) => [row.player_id, row.rank])).toEqual([
      ['tyrion', 1],
      ['arya', 2],
    ])

    receipt.score_events = [
      { id: 'arya-prediction', kind: 'prediction', player_id: 'arya', label: 'Prediction', points: 10 },
      { id: 'tyrion-prediction', kind: 'prediction', player_id: 'tyrion', label: 'Prediction', points: 10 },
    ]
    expect(settlementStandings(createSettlementReceipt(receipt)).map((row) => row.rank)).toEqual([1, 1])
  })

  it('rejects non-canonical personal cards and unknown receipt fields', () => {
    const unmarkedFree = receiptInput()
    unmarkedFree.personal_cards[0].bingo[12].marked = false
    expect(() => parseSettlementReceipt(JSON.stringify(unmarkedFree))).toThrow(
      'must have one marked free cell at index 12',
    )

    expect(() => parseSettlementReceipt(JSON.stringify({
      ...receiptInput(),
      private_note: 'do not publish',
    }))).toThrow('settlement receipt has unknown field private_note')
  })
})
