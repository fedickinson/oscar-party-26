import { describe, expect, it } from 'vitest'
import {
  buildSettlementDropMigrationAudit,
  serializeSettlementDropMigrationAudit,
  type SettlementDropMigrationArtifact,
} from './settlement-drop-migration-audit'
import {
  planSettlementDropAssetExtraction,
  type SettlementDropAssetExtractionManifest,
} from './settlement-drop-asset-extraction'
import {
  buildSettlementDropPresentationStructurePacket,
  type SettlementDropPresentationStructurePacket,
} from './settlement-drop-presentation-structure'
import {
  buildSettlementDropPlayerIdentityPacket,
  serializeSettlementDropPlayerIdentityPacket,
} from './settlement-drop-player-identity'
import {
  buildSettlementDropQuoteMarkupPacket,
  serializeSettlementDropQuoteMarkupPacket,
} from './settlement-drop-quote-markup'
import {
  buildSettlementDropReceiptPrerequisitesPacket,
  RECEIPT_PREREQUISITE_TABLES,
  serializeSettlementDropReceiptPrerequisitesPacket,
} from './settlement-drop-receipt-prerequisites'
import {
  buildSettlementDropAssetSemanticsPacket,
  serializeSettlementDropAssetSemanticsPacket,
} from './settlement-drop-asset-semantics'
import { sha256Hex } from './sha256'

const dataUri = (mime: string, bytes: number[]) =>
  `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`

const digest = (name: string): SettlementDropMigrationArtifact => ({
  name,
  bytes: 10,
  sha256: name.padEnd(64, '0').slice(0, 64),
})

function input() {
  return {
    room_code: 'WDKH',
    artifacts: {
      ceremony: digest('a'),
      tiers: digest('b'),
      takes: digest('c'),
      beatlines: digest('d'),
      personal: digest('e'),
      assets: digest('f'),
      board: digest('1'),
    },
    tiers: {
      Alice: { heavy: ['Dragon'], impact: ['Queen'], present: [], absent: ['Knight'] },
      Bob: { heavy: [], impact: ['Knight'], present: ['Dragon'], absent: ['Queen'] },
      _meta: { note: 'legacy', tiers: {} },
    },
    takes: {
      4: [{ speaker: 'Ned', text: '<b>That</b> was costly.', refs: ['Dragon', 'Alice'] }],
      9: [{
        speaker: 'Arya',
        text: 'The board remembers.',
        refs: ['Knight'],
        grounding: {
          pipeline: 'scripts/grounded-line.mts',
          fact_block: ['Knight scored.'],
          attempts: 1,
          residual_findings: [],
        },
      }],
    },
    beatlines: {
      B1: [
        { kind: 'draft', char: 'Dragon', pts: 5, text: 'Dragon arrives.' },
        { kind: 'bingo', player: 'Alice', pts: 2, square: 'A square', at: '01:00', tier: 1 },
      ],
      B2: [{ kind: 'nocard', text: 'No card.' }],
    },
    personal: {
      Alice: {
        sigil: 'stark',
        bingo_points: 2,
        roster: [{ char: 'Dragon', beats: [], amendments: [] }],
        card: [{ short: 'A square', marked: true, free: false, pts: 2, tier: 1 }],
      },
      Bob: {
        sigil: 'tully',
        bingo_points: 0,
        roster: [],
        card: [{ short: 'Free', marked: true, free: true, tier: 0 }],
      },
    },
    assets: {
      dragon: dataUri('image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ned: dataUri('image/jpeg', [0xff, 0xd8, 0xff, 0xe0]),
      vhagar: dataUri('image/webp', [0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]),
    },
    board: {
      owners: { Dragon: 'Alice', Knight: 'Bob' },
      cards: [{ player: 'Alice', squares: [] }, { player: 'Bob', squares: [] }],
      beats: [
        { id: 1, beat: 'Arrives', char: 'Dragon', drafter: 'Alice', pts: 5, trig: 'appears', type: 'draft' },
        { beat: 'Missing id', char: 'Knight', drafter: 'Bob', pts: 1, trig: 'speaks', type: 'draft' },
      ],
    },
  }
}

function extraction(): SettlementDropAssetExtractionManifest {
  const value = input()
  return planSettlementDropAssetExtraction({
    room_code: value.room_code,
    source: value.artifacts.assets,
    assets: value.assets,
  }).manifest
}

function presentation() {
  const ceremonyRaw = `
    <section class="slide scene-title"><h1>Night</h1></section>
    <section class="slide scene-keep actdiv"><h2>Act</h2><p>Subtitle</p></section>
    <section class="slide scene-keep beat"><h2>Dragon arrives</h2><div class="ledger"><div class="bl">Dragon arrives Alice +5</div><div class="bl">A square Alice +2</div></div></section>
    <section class="slide scene-keep beat"><h2>No card truth</h2><div class="ledger"><div class="bl">No card truth</div></div></section>
    <section class="slide scene-table inter"><h2>Table</h2></section>
    <section class="slide scene-title other"></section>
    <section class="slide scene-title other"></section>
    <section class="slide scene-title other"></section>
    <section class="slide scene-title other"></section>
    <section class="slide scene-keep beat"><h2>The board remembers</h2></section>
    <script>var PUNDITS={"9":{"name":"Arya"}};function move(n){return PUNDITS[String(n)]}</script>`
  const value = input()
  const beatlines = { ...value.beatlines, B2: [{ kind: 'nocard', text: 'No card truth' }] }
  const takes = { 9: value.takes[9] }
  const beatlinesRaw = JSON.stringify(beatlines)
  const takesRaw = JSON.stringify(takes)
  const artifacts = {
    ceremony: { name: 'the-ceremony.html', bytes: new TextEncoder().encode(ceremonyRaw).byteLength, sha256: sha256Hex(ceremonyRaw) },
    beatlines: { name: 'beatlines.json', bytes: new TextEncoder().encode(beatlinesRaw).byteLength, sha256: sha256Hex(beatlinesRaw) },
    takes: { name: 'takes.json', bytes: new TextEncoder().encode(takesRaw).byteLength, sha256: sha256Hex(takesRaw) },
  }
  const packet = buildSettlementDropPresentationStructurePacket({
    room_code: value.room_code,
    ceremony: { raw: ceremonyRaw, seal: artifacts.ceremony },
    beatlines: { raw: beatlinesRaw, seal: artifacts.beatlines },
    takes: { raw: takesRaw, seal: artifacts.takes },
  })
  return { ceremonyRaw, beatlines, beatlinesRaw, takes, takesRaw, artifacts, packet }
}

describe('buildSettlementDropMigrationAudit', () => {
  it('inventories recoverable legacy lanes and fails closed on truth gaps', () => {
    const audit = buildSettlementDropMigrationAudit(input())

    expect(audit.audit_version).toBe(1)
    expect(audit.target).toEqual({ room_code: 'WDKH' })
    expect(audit.inventory.players).toEqual({
      tiers: 2,
      personal_editions: 2,
      board_cards: 2,
      names_consistent: true,
      identity_packet_provided: false,
      exact_uuid_joins: 0,
      display_name_variants: 0,
    })
    expect(audit.inventory.muster).toEqual({
      tier_entries: 6,
      heavy: 1,
      impact: 2,
      present: 1,
      absent: 2,
    })
    expect(audit.inventory.quotes).toEqual({
      groups: 2,
      quotes: 2,
      references: 3,
      grounded: 1,
      with_markup: 1,
      markup_packet_provided: false,
      emphasis_spans: 0,
    })
    expect(audit.inventory.ledger).toEqual({
      presentation_groups: 2,
      presentation_lines: 3,
      presentation_lines_with_receipt_link: 0,
      board_beats: 2,
      board_beats_with_id: 1,
    })
    expect(audit.inventory.assets).toEqual({
      total: 3,
      embedded_data_uris: 3,
      source_local_paths: 0,
      extracted_local_files: 0,
      extraction_source_matches: false,
      semantics_packet_provided: false,
      character_assignments: 0,
      pundit_assignments: 0,
      player_sigil_assignments: 0,
      assets_without_structured_assignment: 0,
    })
    expect(audit.inventory.personal_editions).toEqual({
      roster_slots: 1,
      bingo_squares: 2,
      marked_squares: 2,
    })
    expect(audit.blockers.map((blocker) => blocker.code)).toEqual([
      'missing_settlement_receipt',
      'ungrounded_quotes',
      'legacy_ledger_not_receipt_linked',
      'embedded_assets_require_extraction',
      'quote_markup_requires_plain_text_decision',
      'presentation_structure_not_authored',
    ])
    expect(audit.readiness.ready_for_manifest).toBe(false)
    expect(audit.readiness.recoverable_lanes).toEqual([
      'muster',
      'pundit_reference_sets',
      'board_evidence_candidates',
      'personal_editions',
      'portrait_inventory',
    ])
  })

  it('reports player-name drift instead of silently joining display names', () => {
    const value = input()
    value.board.cards[1].player = 'Robert'

    const audit = buildSettlementDropMigrationAudit(value)

    expect(audit.inventory.players.names_consistent).toBe(false)
    expect(audit.blockers.map((blocker) => blocker.code)).toContain('player_identity_mismatch')
  })

  it('replaces display-name drift with an approval blocker only for an exact UUID-bound packet', () => {
    const value = input()
    value.board.cards[1].player = 'Robert'
    value.board.owners.Knight = 'Robert'
    value.board.beats[1].drafter = 'Robert'
    const ceremonyRaw = '<script>var PIDS={"11111111-1111-4111-8111-111111111111":"Alice","22222222-2222-4222-8222-222222222222":"Bob"};</script>'
    const tiersRaw = JSON.stringify(value.tiers)
    const personalRaw = JSON.stringify(value.personal)
    const boardRaw = JSON.stringify(value.board)
    const roomsRaw = JSON.stringify([{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', code: 'WDKH' }])
    const playersRaw = JSON.stringify([
      { id: '11111111-1111-4111-8111-111111111111', room_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Alice' },
      { id: '22222222-2222-4222-8222-222222222222', room_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Robert' },
    ])
    const sealedArtifact = (name: string, raw: string) => ({
      name, bytes: new TextEncoder().encode(raw).byteLength, sha256: sha256Hex(raw),
    })
    const sourceArtifacts = {
      ceremony: sealedArtifact('the-ceremony.html', ceremonyRaw),
      tiers: sealedArtifact('tiers.json', tiersRaw),
      personal: sealedArtifact('personal.json', personalRaw),
      board: sealedArtifact('board.json', boardRaw),
      snapshot_rooms: sealedArtifact('rooms.json', roomsRaw),
      snapshot_players: sealedArtifact('players.json', playersRaw),
    }
    const packet = buildSettlementDropPlayerIdentityPacket({
      room_code: 'WDKH',
      ceremony: { raw: ceremonyRaw, seal: sourceArtifacts.ceremony },
      tiers: { raw: tiersRaw, seal: sourceArtifacts.tiers },
      personal: { raw: personalRaw, seal: sourceArtifacts.personal },
      board: { raw: boardRaw, seal: sourceArtifacts.board },
      rooms: { raw: roomsRaw, seal: sourceArtifacts.snapshot_rooms },
      players: { raw: playersRaw, seal: sourceArtifacts.snapshot_players },
    })
    const packetRaw = serializeSettlementDropPlayerIdentityPacket(packet)
    const audit = buildSettlementDropMigrationAudit({
      ...value,
      artifacts: {
        ...value.artifacts,
        ...sourceArtifacts,
        player_identity: sealedArtifact('identity.json', packetRaw),
      },
      player_identity: packet,
      identity_sources: {
        ceremony_raw: ceremonyRaw,
        tiers_raw: tiersRaw,
        personal_raw: personalRaw,
        board_raw: boardRaw,
        rooms_raw: roomsRaw,
        players_raw: playersRaw,
      },
    })

    expect(audit.inventory.players).toEqual({
      tiers: 2,
      personal_editions: 2,
      board_cards: 2,
      names_consistent: false,
      identity_packet_provided: true,
      exact_uuid_joins: 2,
      display_name_variants: 1,
    })
    expect(audit.blockers.map((blocker) => blocker.code)).not.toContain('player_identity_mismatch')
    expect(audit.blockers.map((blocker) => blocker.code)).toContain('player_identity_requires_approval')

    packet.players[0].snapshot_name = 'Substituted'
    const substitutedPacketRaw = serializeSettlementDropPlayerIdentityPacket(packet)
    expect(() => buildSettlementDropMigrationAudit({
      ...value,
      artifacts: {
        ...value.artifacts,
        ...sourceArtifacts,
        player_identity: sealedArtifact('identity.json', substitutedPacketRaw),
      },
      player_identity: packet,
      identity_sources: {
        ceremony_raw: ceremonyRaw, tiers_raw: tiersRaw, personal_raw: personalRaw,
        board_raw: boardRaw, rooms_raw: roomsRaw, players_raw: playersRaw,
      },
    })).toThrow('player identity does not match the sealed legacy and snapshot sources')
  })

  it('retires extraction only for an exact source-bound complete handoff', () => {
    const value = input()
    const audit = buildSettlementDropMigrationAudit({
      ...value,
      artifacts: { ...value.artifacts, asset_extraction: digest('8') },
      asset_extraction: extraction(),
    })

    expect(audit.inventory.assets).toEqual({
      total: 3,
      embedded_data_uris: 3,
      source_local_paths: 0,
      extracted_local_files: 3,
      extraction_source_matches: true,
      semantics_packet_provided: false,
      character_assignments: 0,
      pundit_assignments: 0,
      player_sigil_assignments: 0,
      assets_without_structured_assignment: 0,
    })
    expect(audit.blockers.map((blocker) => blocker.code)).not.toContain('embedded_assets_require_extraction')
    expect(audit.blockers.map((blocker) => blocker.code)).toContain('asset_semantics_require_authoring')
  })

  it('replaces the broad markup warning only for an exact source-bound review packet', () => {
    const value = input()
    const takesRaw = JSON.stringify(value.takes)
    const takesArtifact = {
      name: 'takes.json', bytes: new TextEncoder().encode(takesRaw).byteLength, sha256: sha256Hex(takesRaw),
    }
    const packet = buildSettlementDropQuoteMarkupPacket({
      room_code: 'WDKH', takes: { raw: takesRaw, seal: takesArtifact },
    })
    const packetRaw = serializeSettlementDropQuoteMarkupPacket(packet)
    const packetArtifact = {
      name: 'markup.json', bytes: new TextEncoder().encode(packetRaw).byteLength, sha256: sha256Hex(packetRaw),
    }
    const audit = buildSettlementDropMigrationAudit({
      ...value,
      artifacts: { ...value.artifacts, takes: takesArtifact, quote_markup: packetArtifact },
      quote_markup: packet,
      quote_markup_source: { takes_raw: takesRaw },
    })
    expect(audit.inventory.quotes.markup_packet_provided).toBe(true)
    expect(audit.inventory.quotes.emphasis_spans).toBe(1)
    expect(audit.blockers.map((blocker) => blocker.code))
      .not.toContain('quote_markup_requires_plain_text_decision')
    expect(audit.blockers.map((blocker) => blocker.code)).toContain('quote_markup_requires_approval')

    packet.quotes[0].plain_text_candidate = 'Substituted'
    const substitutedRaw = serializeSettlementDropQuoteMarkupPacket(packet)
    expect(() => buildSettlementDropMigrationAudit({
      ...value,
      artifacts: {
        ...value.artifacts,
        takes: takesArtifact,
        quote_markup: {
          name: 'markup.json', bytes: new TextEncoder().encode(substitutedRaw).byteLength,
          sha256: sha256Hex(substitutedRaw),
        },
      },
      quote_markup: packet,
      quote_markup_source: { takes_raw: takesRaw },
    })).toThrow('quote markup does not match the sealed legacy takes')
  })

  it('inventories receipt prerequisites without retiring the missing canonical receipt', () => {
    const value = input()
    const roomId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const sources = Object.fromEntries(RECEIPT_PREREQUISITE_TABLES.map((table) => [table, '[]'])) as Record<typeof RECEIPT_PREREQUISITE_TABLES[number], string>
    sources.rooms = JSON.stringify([{ id: roomId, code: 'WDKH', phase: 'finished' }])
    sources.players = JSON.stringify([{ id: '11111111-1111-4111-8111-111111111111', room_id: roomId, name: 'Alice' }])
    sources.categories = JSON.stringify([{ id: 7, name: 'A fact', points: 5 }])
    sources.nominees = JSON.stringify([{ id: 'nom-1', name: 'Winner' }])
    sources.room_winners = JSON.stringify([{ room_id: roomId, category_id: 7, winner_id: 'nom-1', tie_winner_id: null }])
    sources.draft_entities = JSON.stringify([{ id: 'entity-1', name: 'Entity' }])
    sources.draft_picks = JSON.stringify([{ id: 'pick-1', room_id: roomId, player_id: '11111111-1111-4111-8111-111111111111', entity_id: 'entity-1' }])
    const prerequisiteTables = Object.fromEntries(RECEIPT_PREREQUISITE_TABLES.map((table) => [table, {
      raw: sources[table],
      seal: {
        name: `${table}.json`, bytes: new TextEncoder().encode(sources[table]).byteLength,
        sha256: sha256Hex(sources[table]),
      },
    }])) as unknown as Parameters<typeof buildSettlementDropReceiptPrerequisitesPacket>[0]['tables']
    const packet = buildSettlementDropReceiptPrerequisitesPacket({
      room_code: 'WDKH',
      tables: prerequisiteTables,
    })
    const packetRaw = serializeSettlementDropReceiptPrerequisitesPacket(packet)
    const audit = buildSettlementDropMigrationAudit({
      ...value,
      artifacts: {
        ...value.artifacts,
        receipt_prerequisites: {
          name: 'prerequisites.json', bytes: new TextEncoder().encode(packetRaw).byteLength,
          sha256: sha256Hex(packetRaw),
        },
      },
      receipt_prerequisites: packet,
      receipt_prerequisite_sources: sources,
    })
    expect(audit.inventory.settlement_receipt).toEqual({
      provided: false, score_events: 0, settled_facts: 0,
      prerequisites_packet_provided: true, candidate_entries: 1,
      canonical_recovery_possible: false,
    })
    expect(audit.blockers.map((blocker) => blocker.code)).toContain('missing_settlement_receipt')
  })

  it('rejects stale or incomplete extraction handoffs', () => {
    const value = input()
    const stale = extraction()
    stale.source.sha256 = '9'.repeat(64)
    const artifacts = { ...value.artifacts, asset_extraction: digest('8') }
    expect(() => buildSettlementDropMigrationAudit({ ...value, artifacts, asset_extraction: stale }))
      .toThrow('asset extraction source does not match artifacts.assets')

    const incomplete = extraction()
    incomplete.assets.pop()
    expect(() => buildSettlementDropMigrationAudit({ ...value, artifacts, asset_extraction: incomplete }))
      .toThrow('asset extraction IDs do not exactly match legacy assets')

    const substituted = extraction()
    substituted.assets[0].sha256 = '7'.repeat(64)
    expect(() => buildSettlementDropMigrationAudit({ ...value, artifacts, asset_extraction: substituted }))
      .toThrow('asset extraction does not match the sealed legacy asset bytes')
  })

  it('replaces broad asset authoring only for an exact source-bound semantics packet', () => {
    const value = input()
    const assetsRaw = JSON.stringify(value.assets)
    const assetUris = value.assets
    const ceremonyRaw = `<script>var CHARS={"Dragon":{"img":"${assetUris.dragon}"}};var PUNDITS={"1":{"name":"Ned","img":"${assetUris.ned}"}};var PDATA={"Alice":{"sigil":"${assetUris.vhagar}"}};</script>`
    const sealedArtifact = (name: string, raw: string) => ({
      name, bytes: new TextEncoder().encode(raw).byteLength, sha256: sha256Hex(raw),
    })
    const baseSourceArtifacts = {
      ceremony: sealedArtifact('the-ceremony.html', ceremonyRaw),
      assets: sealedArtifact('assets.json', assetsRaw),
    }
    const extractionManifest = planSettlementDropAssetExtraction({
      room_code: 'WDKH', source: baseSourceArtifacts.assets, assets: value.assets,
    }).manifest
    const extractionRaw = `${JSON.stringify(extractionManifest, null, 2)}\n`
    const sourceArtifacts = {
      ...baseSourceArtifacts,
      asset_extraction: sealedArtifact('asset-extraction.json', extractionRaw),
    }
    const packet = buildSettlementDropAssetSemanticsPacket({
      room_code: 'WDKH',
      ceremony: { raw: ceremonyRaw, seal: sourceArtifacts.ceremony },
      legacy_assets: { raw: assetsRaw, seal: sourceArtifacts.assets },
      extraction: { raw: extractionRaw, seal: sourceArtifacts.asset_extraction },
    })
    const packetRaw = serializeSettlementDropAssetSemanticsPacket(packet)
    const audit = buildSettlementDropMigrationAudit({
      ...value,
      artifacts: {
        ...value.artifacts,
        ...sourceArtifacts,
        asset_semantics: sealedArtifact('asset-semantics.json', packetRaw),
      },
      asset_extraction: extractionManifest,
      asset_semantics: packet,
      asset_semantics_sources: {
        ceremony_raw: ceremonyRaw, assets_raw: assetsRaw, extraction_raw: extractionRaw,
      },
    })
    expect(audit.inventory.assets).toMatchObject({
      semantics_packet_provided: true,
      character_assignments: 1,
      pundit_assignments: 1,
      player_sigil_assignments: 1,
      assets_without_structured_assignment: 0,
    })
    expect(audit.blockers.map((blocker) => blocker.code)).not.toContain('asset_semantics_require_authoring')
    expect(audit.blockers.map((blocker) => blocker.code)).toContain('asset_semantics_requires_approval')
  })

  it('retires unauthored structure only for an exact source-bound packet', () => {
    const value = input()
    const structure = presentation()
    const packetRaw = `${JSON.stringify(structure.packet, null, 2)}\n`
    const audit = buildSettlementDropMigrationAudit({
      ...value,
      artifacts: {
        ...value.artifacts,
        ...structure.artifacts,
        presentation_structure: {
          name: 'structure.json', bytes: new TextEncoder().encode(packetRaw).byteLength, sha256: sha256Hex(packetRaw),
        },
      },
      takes: structure.takes,
      beatlines: structure.beatlines,
      presentation_structure: structure.packet,
      presentation_sources: {
        ceremony_raw: structure.ceremonyRaw,
        beatlines_raw: structure.beatlinesRaw,
        takes_raw: structure.takesRaw,
      },
    })

    expect(audit.inventory.presentation_structure).toEqual({
      packet_provided: true,
      slides: 10,
      acts: 1,
      beats: 3,
      interstitials: 1,
      beatline_group_candidates: 2,
      take_groups_mapped: 1,
      unresolved_beatline_groups: [],
    })
    expect(audit.blockers.map((blocker) => blocker.code)).not.toContain('presentation_structure_not_authored')
    expect(audit.blockers.map((blocker) => blocker.code)).toContain('presentation_structure_requires_approval')
  })

  it('rejects substituted structure packets and raw/parsed divergence', () => {
    const value = input()
    const structure = presentation()
    const packet = structuredClone(structure.packet) as SettlementDropPresentationStructurePacket
    packet.slides[2].title = 'Substituted'
    const packetRaw = `${JSON.stringify(packet, null, 2)}\n`
    const artifacts = {
      ...value.artifacts,
      ...structure.artifacts,
      presentation_structure: {
        name: 'structure.json', bytes: new TextEncoder().encode(packetRaw).byteLength, sha256: sha256Hex(packetRaw),
      },
    }
    const sources = {
      ceremony_raw: structure.ceremonyRaw,
      beatlines_raw: structure.beatlinesRaw,
      takes_raw: structure.takesRaw,
    }
    expect(() => buildSettlementDropMigrationAudit({
      ...value, artifacts, takes: structure.takes, beatlines: structure.beatlines,
      presentation_structure: packet, presentation_sources: sources,
    })).toThrow('presentation structure does not match the sealed legacy sources')

    expect(() => buildSettlementDropMigrationAudit({
      ...value, artifacts, takes: structure.takes, beatlines: { B9: [] },
      presentation_structure: structure.packet, presentation_sources: sources,
    })).toThrow('presentation beatlines raw bytes do not match parsed beatlines')
  })

  it('counts only grounding stamps accepted by the settlement-drop compiler', () => {
    const value = input()
    value.takes[9][0].grounding = {
      ...value.takes[9][0].grounding,
      private_note: 'not part of the public grounding contract',
    } as never

    const audit = buildSettlementDropMigrationAudit(value)

    expect(audit.inventory.quotes.grounded).toBe(0)
    expect(audit.blockers.find((blocker) => blocker.code === 'ungrounded_quotes')?.count).toBe(2)
  })

  it('serializes deterministically with a trailing newline', () => {
    const audit = buildSettlementDropMigrationAudit(input())
    const first = serializeSettlementDropMigrationAudit(audit)
    const second = serializeSettlementDropMigrationAudit(audit)

    expect(first).toBe(second)
    expect(first.endsWith('\n')).toBe(true)
    expect(JSON.parse(first)).toEqual(audit)
  })

  it('rejects malformed legacy roots rather than claiming partial evidence', () => {
    const value = input()
    value.takes = [] as never

    expect(() => buildSettlementDropMigrationAudit(value)).toThrow('takes must be an object')
  })
})
