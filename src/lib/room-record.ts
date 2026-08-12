/**
 * Selects the one record every scoring and recap consumer should read.
 *
 * Before settlement, room_winners projected onto the authored category slate
 * are the provisional live record. Once rooms.active_settlement_id is set, the
 * researched settlement replaces that projection wholesale. The live rows stay
 * intact as history; they are never mixed into the final ledger.
 */
import type {
  BingoMarkRow,
  CategoryRow,
  ConfidencePickRow,
  RoomSettlementBingoMarkRow,
  RoomSettlementEntryRow,
  RoomSettlementRow,
  RoomWinnerRow,
} from '../types/database'

interface CanonicalRoomRecordInput {
  activeSettlementId: string | null
  categories: CategoryRow[]
  roomWinners: RoomWinnerRow[]
  confidencePicks: ConfidencePickRow[]
  bingoMarks: BingoMarkRow[]
  settlements: RoomSettlementRow[]
  settlementEntries: RoomSettlementEntryRow[]
  settlementBingoMarks: RoomSettlementBingoMarkRow[]
}

export interface CanonicalRoomRecord {
  source: 'live' | 'settled'
  settlement: RoomSettlementRow | null
  categories: CategoryRow[]
  confidencePicks: ConfidencePickRow[]
  bingoMarks: BingoMarkRow[]
}

function liveCategories(
  categories: CategoryRow[],
  roomWinners: RoomWinnerRow[],
): CategoryRow[] {
  const winners = new Map(roomWinners.map((row) => [row.category_id, row]))
  return categories.map((category) => ({
    ...category,
    winner_id: winners.get(category.id)?.winner_id ?? null,
    tie_winner_id: winners.get(category.id)?.tie_winner_id ?? null,
  }))
}

function settledCategory(
  entry: RoomSettlementEntryRow,
  authoredById: Map<number, CategoryRow>,
): CategoryRow {
  const authored = entry.category_id == null ? null : authoredById.get(entry.category_id)
  if (entry.category_id != null && !authored) {
    throw new Error(`Settlement entry ${entry.entry_key} references missing category ${entry.category_id}`)
  }
  if (authored && authored.points !== entry.points) {
    throw new Error(`Settlement entry ${entry.entry_key} changes authored points for category ${entry.category_id}`)
  }

  return {
    id: entry.category_id ?? -entry.id,
    name: entry.name,
    tier: authored?.tier ?? (entry.points >= 10 ? 1 : entry.points >= 6 ? 2 : 3),
    points: entry.points,
    display_order: entry.display_order,
    winner_id: entry.winner_id,
    tie_winner_id: entry.tie_winner_id,
    announced_at: entry.occurred_at,
    ...(authored?.show_pack_id === undefined ? {} : { show_pack_id: authored.show_pack_id }),
    ...(authored?.room_id === undefined ? {} : { room_id: authored.room_id }),
    ...(authored?.pack_key === undefined ? {} : { pack_key: authored.pack_key }),
    ...(authored?.trigger_contract === undefined ? {} : { trigger_contract: authored.trigger_contract }),
    ...(authored?.source_signature_beat_id === undefined
      ? {}
      : { source_signature_beat_id: authored.source_signature_beat_id }),
    ...(authored?.source_trigger_contract === undefined
      ? {}
      : { source_trigger_contract: authored.source_trigger_contract }),
  }
}

export function buildCanonicalRoomRecord(
  input: CanonicalRoomRecordInput,
): CanonicalRoomRecord {
  if (!input.activeSettlementId) {
    return {
      source: 'live',
      settlement: null,
      categories: liveCategories(input.categories, input.roomWinners),
      confidencePicks: input.confidencePicks,
      bingoMarks: input.bingoMarks,
    }
  }

  const settlement = input.settlements.find((row) => row.id === input.activeSettlementId)
  if (!settlement) {
    throw new Error(`Active settlement ${input.activeSettlementId} was not loaded`)
  }

  const entries = input.settlementEntries
    .filter((entry) => entry.settlement_id === settlement.id)
    .sort((left, right) => left.display_order - right.display_order)
  const outcomeByCategory = new Map(
    entries.flatMap((entry) => entry.category_id == null ? [] : [[entry.category_id, entry] as const]),
  )

  const settledConfidence = input.confidencePicks.map((pick) => {
    const outcome = outcomeByCategory.get(pick.category_id)
    if (!outcome) {
      throw new Error(`Settlement does not resolve prediction category ${pick.category_id}`)
    }
    const isCorrect = outcome.outcome === 'resolved' && (
      pick.nominee_id === outcome.winner_id || pick.nominee_id === outcome.tie_winner_id
    )
    return { ...pick, is_correct: isCorrect }
  })

  const authoredById = new Map(input.categories.map((category) => [category.id, category]))
  const settledCategories = entries
    .filter((entry) => entry.outcome === 'resolved')
    .map((entry) => settledCategory(entry, authoredById))

  const settledBingoMarks = input.settlementBingoMarks
    .filter((mark) => mark.settlement_id === settlement.id)
    .map((mark) => ({
      id: `${mark.settlement_id}:${mark.card_id}:${mark.square_index}`,
      card_id: mark.card_id,
      square_index: mark.square_index,
      status: 'approved' as const,
      marked_at: mark.marked_at,
    }))

  return {
    source: 'settled',
    settlement,
    categories: settledCategories,
    confidencePicks: settledConfidence,
    bingoMarks: settledBingoMarks,
  }
}
