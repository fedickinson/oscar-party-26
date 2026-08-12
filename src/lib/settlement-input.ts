import type {
  BingoCardRow,
  BingoMarkRow,
  ConfidencePickRow,
  ConvictionPickRow,
  DraftPickRow,
  PlayerRow,
} from '../types/database'

export interface SettlementInputSnapshot {
  players: Array<{ id: string; name: string }>
  confidence_picks: Array<{
    id: string
    player_id: string
    category_id: number
    nominee_id: string
    confidence: number
  }>
  conviction_picks: Array<{
    player_id: string
    beat_id: number
  }>
  draft_picks: Array<{
    id: string
    player_id: string
    entity_id: string
  }>
  bingo_cards: Array<{
    id: string
    player_id: string
    squares: number[]
  }>
  bingo_marks: Array<{
    card_id: string
    square_index: number
    marked_at: string
  }>
}

interface SettlementInputRows {
  players: PlayerRow[]
  confidencePicks: ConfidencePickRow[]
  convictionPicks?: ConvictionPickRow[]
  draftPicks: DraftPickRow[]
  bingoCards: BingoCardRow[]
  bingoMarks: BingoMarkRow[]
}

/**
 * Canonical room-scoped inputs whose identity or value can change final scores
 * or settlement-receipt evidence. The checked RPC rebuilds this exact JSONB
 * shape while holding the room's settlement-input lock.
 */
export function buildSettlementInputSnapshot(
  input: SettlementInputRows,
): SettlementInputSnapshot {
  const byId = <T extends { id: string }>(left: T, right: T) => left.id.localeCompare(right.id)
  return {
    players: input.players
      .map((player) => ({ id: player.id, name: player.name }))
      .sort(byId),
    confidence_picks: input.confidencePicks
      .map((pick) => ({
        id: pick.id,
        player_id: pick.player_id,
        category_id: pick.category_id,
        nominee_id: pick.nominee_id,
        confidence: pick.confidence,
      }))
      .sort(byId),
    conviction_picks: (input.convictionPicks ?? [])
      .map((pick) => ({ player_id: pick.player_id, beat_id: pick.beat_id }))
      .sort((left, right) => (
        left.player_id.localeCompare(right.player_id) || left.beat_id - right.beat_id
      )),
    draft_picks: input.draftPicks
      .map((pick) => ({
        id: pick.id,
        player_id: pick.player_id,
        entity_id: pick.entity_id,
      }))
      .sort(byId),
    bingo_cards: input.bingoCards
      .map((card) => ({
        id: card.id,
        player_id: card.player_id,
        squares: [...card.squares],
      }))
      .sort(byId),
    bingo_marks: input.bingoMarks
      .filter((mark) => mark.status === 'approved')
      .map((mark) => ({
        card_id: mark.card_id,
        square_index: mark.square_index,
        marked_at: mark.marked_at,
      }))
      .sort((left, right) => (
        left.card_id.localeCompare(right.card_id)
        || left.square_index - right.square_index
      )),
  }
}
