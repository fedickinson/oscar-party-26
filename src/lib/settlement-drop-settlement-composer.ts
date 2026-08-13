import { inspectSettlementDropReceiptPrerequisiteDecisions } from './settlement-drop-approval-decisions'
import type { SealedTextArtifact } from './settlement-drop-asset-semantics'
import {
  buildSettlementDropReceiptPrerequisitesPacket,
  RECEIPT_PREREQUISITE_TABLES,
  serializeSettlementDropReceiptPrerequisitesPacket,
  type SettlementDropReceiptPrerequisitesPacket,
} from './settlement-drop-receipt-prerequisites'
import { parseSettlementManifest, type SettlementManifest } from './settlement-manifest'
import {
  buildSettlementPreview,
  type SettlementPreview,
  type SettlementPreviewInput,
} from './settlement-preview'
import { sha256Hex } from './sha256'
import type {
  BingoCardRow,
  BingoMarkRow,
  BingoSquareRow,
  CategoryRow,
  ConfidencePickRow,
  DraftEntityRow,
  DraftPickRow,
  NomineeRow,
  PlayerRow,
  RoomWinnerRow,
  SettlementWarrant,
} from '../types/database'

type TableName = typeof RECEIPT_PREREQUISITE_TABLES[number]
type UnknownRecord = Record<string, unknown>

interface ReceiptDecisions {
  expected_packet_sha256: string
  settlement: { title: string; actor: string; bingo_mode: 'preserve_live' | 'replace' }
  entries: Array<{
    entry_key: string
    approved_outcome: 'resolved' | 'void'
    warrant: SettlementWarrant
    occurred_at: string | null
  }>
  bingo: { preserve_snapshot_marks: boolean; warrant: SettlementWarrant | null }
  additional_fact_review: boolean
}

export interface SettlementDropSettlementComposerInput {
  packetRaw: string
  decisionsRaw: string
  tables: Record<TableName, SealedTextArtifact>
}

export interface SettlementDropSettlementComposerResult {
  manifest: SettlementManifest
  manifestBytes: string
  preview: SettlementPreview
  packetSha256: string
}

function parseObject(raw: string, label: string): UnknownRecord {
  const value: unknown = JSON.parse(raw)
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as UnknownRecord
}

function rows<Row>(tables: Record<TableName, SealedTextArtifact>, table: TableName): Row[] {
  return JSON.parse(tables[table].raw) as Row[]
}

function roomRows<Row extends { room_id: string }>(values: Row[], roomId: string): Row[] {
  return values.filter((row) => row.room_id === roomId)
}

export function composeSettlementDropSettlementManifest(
  input: SettlementDropSettlementComposerInput,
): SettlementDropSettlementComposerResult {
  const packetValue = parseObject(input.packetRaw, 'receipt prerequisites packet')
  const target = packetValue.target
  if (target === null || typeof target !== 'object' || Array.isArray(target)
    || typeof (target as UnknownRecord).room_code !== 'string') {
    throw new Error('receipt prerequisites packet target is invalid')
  }
  const rebuiltPacket = buildSettlementDropReceiptPrerequisitesPacket({
    room_code: (target as UnknownRecord).room_code as string,
    tables: input.tables,
  })
  const expectedPacketBytes = serializeSettlementDropReceiptPrerequisitesPacket(rebuiltPacket)
  if (input.packetRaw !== expectedPacketBytes) {
    throw new Error('receipt prerequisites packet does not exactly match the sealed snapshot sources')
  }
  const packet = rebuiltPacket as SettlementDropReceiptPrerequisitesPacket
  const decisionsValue = parseObject(input.decisionsRaw, 'receipt prerequisite decisions')
  const packetSha256 = sha256Hex(input.packetRaw)
  if (decisionsValue.expected_packet_sha256 !== packetSha256) {
    throw new Error('receipt prerequisite decisions do not target the exact packet bytes')
  }
  const decisionStatus = inspectSettlementDropReceiptPrerequisiteDecisions(packet as unknown as UnknownRecord, decisionsValue)
  if (decisionStatus.status !== 'complete') {
    throw new Error(`receipt prerequisite decisions are incomplete: ${decisionStatus.open_items.join(', ')}`)
  }
  const decisions = decisionsValue as unknown as ReceiptDecisions
  if (decisions.additional_fact_review) {
    throw new Error('additional facts need a separate authored settlement worksheet before this composer can continue')
  }

  const roomId = packet.target.room_id
  const room = rows<UnknownRecord>(input.tables, 'rooms')
    .find((row) => row.id === roomId)
  if (!room) throw new Error(`sealed snapshot does not contain target room ${roomId}`)
  if (room.game_model === 'conviction_portfolio') {
    throw new Error('conviction portfolio settlement needs sealed conviction picks, which this packet version does not carry')
  }
  const showPackId = typeof room.show_pack_id === 'string' ? room.show_pack_id : null
  const showRows = <Row extends { show_pack_id?: string | null; room_id?: string | null }>(values: Row[]): Row[] => (
    showPackId === null
      ? values
      : values.filter((row) => row.show_pack_id === showPackId || row.room_id === roomId)
  )
  const entryDecisions = new Map(decisions.entries.map((entry) => [entry.entry_key, entry]))
  const provisionalManifest: SettlementManifest = {
    version: 1,
    title: decisions.settlement.title,
    actor: decisions.settlement.actor,
    entries: packet.candidate_entries.map((candidate) => {
      const decision = entryDecisions.get(candidate.entry_key)
      if (!decision) throw new Error(`receipt prerequisite decisions are missing ${candidate.entry_key}`)
      return {
        key: candidate.entry_key,
        name: candidate.category_name,
        category_id: candidate.category_id,
        outcome: decision.approved_outcome,
        points: candidate.points,
        ...(decision.approved_outcome === 'resolved' ? {
          winner: candidate.winner_id,
          ...(candidate.tie_winner_id ? { tie_winner: candidate.tie_winner_id } : {}),
        } : {}),
        ...(decision.occurred_at || candidate.announced_at
          ? { occurred_at: decision.occurred_at ?? candidate.announced_at as string }
          : {}),
        warrant: structuredClone(decision.warrant),
      }
    }),
    bingo: decisions.bingo.preserve_snapshot_marks
      ? { mode: 'preserve_live', warrant: structuredClone(decisions.bingo.warrant as SettlementWarrant) }
      : { mode: 'replace', marks: [] },
    expected: { player_totals: {}, character_points: {} },
  }
  const checkedProvisional = parseSettlementManifest(JSON.stringify(provisionalManifest))
  const players = roomRows(rows<PlayerRow>(input.tables, 'players'), roomId)
  const bingoCards = roomRows(rows<BingoCardRow>(input.tables, 'bingo_cards'), roomId)
  const cardIds = new Set(bingoCards.map((card) => card.id))
  const previewInput = {
    room: {
      id: roomId,
      active_settlement_id: null,
      game_model: null,
    },
    players,
    categories: showRows(rows<CategoryRow>(input.tables, 'categories')),
    nominees: showRows(rows<NomineeRow>(input.tables, 'nominees')),
    confidencePicks: roomRows(rows<ConfidencePickRow>(input.tables, 'confidence_picks'), roomId),
    convictionPicks: [],
    draftPicks: roomRows(rows<DraftPickRow>(input.tables, 'draft_picks'), roomId),
    draftEntities: showRows(rows<DraftEntityRow>(input.tables, 'draft_entities')),
    bingoCards,
    bingoSquares: showRows(rows<BingoSquareRow>(input.tables, 'bingo_squares')),
    liveMarks: rows<BingoMarkRow>(input.tables, 'bingo_marks').filter((mark) => cardIds.has(mark.card_id)),
    roomWinners: roomRows(rows<RoomWinnerRow>(input.tables, 'room_winners'), roomId),
    activeSettlements: [],
    activeSettlementEntries: [],
    activeSettlementMarks: [],
  } satisfies Omit<SettlementPreviewInput, 'manifest'>
  const preview = buildSettlementPreview({
    ...previewInput,
    manifest: checkedProvisional,
  }, { verifyExpected: false, nowIso: '1970-01-01T00:00:00.000Z' })
  const manifest = parseSettlementManifest(JSON.stringify({
    ...checkedProvisional,
    expected: {
      player_totals: preview.playerTotals,
      character_points: preview.characterPoints,
    },
  }))
  const verifiedPreview = buildSettlementPreview({
    ...previewInput,
    manifest,
  })
  return {
    manifest,
    manifestBytes: `${JSON.stringify(manifest, null, 2)}\n`,
    preview: verifiedPreview,
    packetSha256,
  }
}
