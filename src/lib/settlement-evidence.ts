/**
 * Converts the canonical closed-room rows into the complete evidence carried by
 * a settlement receipt. Ceremony manifests may reorder these events, but may
 * not author their attribution, label, or points.
 */
import {
  BINGO_LINES,
  FREE_CENTER_INDEX,
  TIER_POINTS,
  checkBingo,
  isBlackout,
} from './bingo-utils'
import { findDraftPointsForWinner } from './scoring'
import type {
  BingoCardRow,
  BingoMarkRow,
  BingoSquareRow,
  CategoryRow,
  ConfidencePickRow,
  ConvictionPickRow,
  DraftEntityRow,
  DraftPickRow,
  NomineeRow,
  PlayerRow,
  RoomRow,
  RoomSettlementEntryRow,
  RoomSettlementRow,
  ShowPackRow,
  GameModel,
} from '../types/database'
import {
  createSettlementReceipt,
  type SettlementReceipt,
  type SettlementReceiptCharacter,
  type SettlementReceiptFact,
  type SettlementReceiptPersonalCard,
  type SettlementReceiptPlayer,
  type SettlementReceiptScoreEvent,
} from './settlement-receipt'

export function buildSettlementReceiptFacts(
  entries: RoomSettlementEntryRow[],
  nominees: NomineeRow[],
): SettlementReceiptFact[] {
  const nomineesById = new Map(nominees.map((nominee) => [nominee.id, nominee]))
  const keys = new Set<string>()
  const orders = new Set<number>()

  return [...entries]
    .sort((left, right) => left.display_order - right.display_order || left.entry_key.localeCompare(right.entry_key))
    .map((entry) => {
      if (keys.has(entry.entry_key)) throw new Error(`duplicate settlement entry key ${entry.entry_key}`)
      keys.add(entry.entry_key)
      if (!Number.isInteger(entry.display_order) || entry.display_order < 1) {
        throw new Error(`settlement entry ${entry.entry_key} has invalid display order ${entry.display_order}`)
      }
      if (orders.has(entry.display_order)) {
        throw new Error(`duplicate settlement display order ${entry.display_order}`)
      }
      orders.add(entry.display_order)
      if (entry.outcome === 'resolved' && entry.winner_id === null) {
        throw new Error(`settlement entry ${entry.entry_key} resolved without a winner`)
      }
      if (entry.outcome === 'void' && (entry.winner_id !== null || entry.tie_winner_id !== null)) {
        throw new Error(`settlement entry ${entry.entry_key} is void but has a winner`)
      }
      if (entry.outcome === 'void' && entry.category_id === null) {
        throw new Error(`settlement entry ${entry.entry_key} is an unscored void`)
      }
      if (entry.winner_id !== null && entry.winner_id === entry.tie_winner_id) {
        throw new Error(`settlement entry ${entry.entry_key} resolves the same winner twice`)
      }

      const resolveParty = (
        nomineeId: string | null,
        position: 'winner' | 'tie winner',
      ) => {
        if (nomineeId === null) return undefined
        const nominee = nomineesById.get(nomineeId)
        if (!nominee) {
          throw new Error(`settlement entry ${entry.entry_key} references unknown ${position} ${nomineeId}`)
        }
        return { id: nominee.id, name: nominee.name }
      }
      const winner = resolveParty(entry.winner_id, 'winner')
      const tieWinner = resolveParty(entry.tie_winner_id, 'tie winner')
      return {
        id: entry.entry_key,
        sequence: entry.display_order,
        title: entry.name,
        outcome: entry.outcome,
        board_status: entry.category_id === null ? 'unscored' : 'authored',
        ...(entry.occurred_at === null ? {} : { occurred_at: entry.occurred_at }),
        ...(winner === undefined ? {} : { winner }),
        ...(tieWinner === undefined ? {} : { tie_winner: tieWinner }),
      }
    })
}

export interface SettlementReceiptEvidenceInput {
  players: PlayerRow[]
  categories: CategoryRow[]
  nominees: NomineeRow[]
  draftEntities: DraftEntityRow[]
  draftPicks: DraftPickRow[]
  confidencePicks: ConfidencePickRow[]
  convictionPicks?: ConvictionPickRow[]
  gameModel?: GameModel
  bingoCards: BingoCardRow[]
  bingoSquares: BingoSquareRow[]
  bingoMarks: BingoMarkRow[]
}

export interface SettlementReceiptEvidence {
  players: SettlementReceiptPlayer[]
  characters: SettlementReceiptCharacter[]
  score_events: SettlementReceiptScoreEvent[]
  personal_cards: SettlementReceiptPersonalCard[]
}

export interface PostCloseSettlementReceiptInput {
  room: {
    id: RoomRow['id']
    code: RoomRow['code']
    phase: RoomRow['phase']
    show_pack_id: RoomRow['show_pack_id']
    active_settlement_id: string | null
  }
  settlement: Pick<
    RoomSettlementRow,
    'id' | 'room_id' | 'version' | 'manifest_hash' | 'supersedes_id' | 'created_at'
  >
  showPack: Pick<ShowPackRow, 'id' | 'pack_key' | 'version'>
  facts: SettlementReceiptFact[]
  evidence: SettlementReceiptEvidence
}

/**
 * Builds portable evidence from one coherent post-close reread. Identity and
 * revision fields come only from the frozen database rows, never preflight
 * variables retained by the operator process.
 */
export function buildPostCloseSettlementReceipt(
  input: PostCloseSettlementReceiptInput,
): SettlementReceipt {
  const { room, settlement, showPack, facts, evidence } = input
  if (room.phase !== 'closed') {
    throw new Error('post-close receipt requires a closed room')
  }
  if (settlement.room_id !== room.id) {
    throw new Error('post-close receipt settlement belongs to another room')
  }
  if (room.active_settlement_id !== settlement.id) {
    throw new Error(`post-close receipt settlement is not active for room ${room.code}`)
  }
  if (showPack.id !== room.show_pack_id) {
    throw new Error(`post-close receipt show pack is not bound to room ${room.code}`)
  }

  return createSettlementReceipt({
    version: 1,
    source: 'scripts/settle-room.mts',
    room_code: room.code,
    room_id: room.id,
    settlement_id: settlement.id,
    settlement_version: settlement.version,
    manifest_hash: settlement.manifest_hash,
    revision: {
      settled_at: settlement.created_at,
      supersedes_id: settlement.supersedes_id,
    },
    show_pack: {
      registry_id: showPack.id,
      pack_id: showPack.pack_key,
      version: showPack.version,
    },
    settled_facts: facts,
    players: evidence.players,
    characters: evidence.characters,
    score_events: evidence.score_events,
    personal_cards: evidence.personal_cards,
  })
}

function bingoLinePoints(ordinal: number): number {
  if (ordinal === 0) return 15
  if (ordinal === 1) return 10
  return 5
}

export function buildSettlementReceiptEvidence(
  input: SettlementReceiptEvidenceInput,
): SettlementReceiptEvidence {
  const players = [...input.players].sort((left, right) => left.id.localeCompare(right.id))
  const playerIds = new Set(players.map((player) => player.id))
  const cardsByPlayer = new Map(input.bingoCards.map((card) => [card.player_id, card]))
  const cardIds = new Set(input.bingoCards.map((card) => card.id))
  const squaresById = new Map(input.bingoSquares.map((square) => [square.id, square]))
  const entitiesById = new Map(input.draftEntities.map((entity) => [entity.id, entity]))
  const pickByEntity = new Map(input.draftPicks.map((pick) => [pick.entity_id, pick]))
  const categoriesById = new Map(input.categories.map((category) => [category.id, category]))
  const nomineesById = new Map(input.nominees.map((nominee) => [nominee.id, nominee]))
  const scoreEvents: SettlementReceiptScoreEvent[] = []
  const personalCards: SettlementReceiptPersonalCard[] = []
  const gameModel = input.gameModel ?? 'legacy_ensemble'
  const paidConvictionBeats = new Set<number>()

  const unknownMark = input.bingoMarks.find((mark) => !cardIds.has(mark.card_id))
  if (unknownMark) throw new Error(`bingo mark references unknown card ${unknownMark.card_id}`)

  for (const category of [...input.categories].sort((left, right) => (
    left.display_order - right.display_order || left.id - right.id
  ))) {
    const hasSourceBeat = category.source_signature_beat_id != null
    const hasSourceContract = category.source_trigger_contract != null
    if (hasSourceBeat !== hasSourceContract) {
      throw new Error(`category ${category.id} has incomplete source-beat provenance`)
    }
    const trigger = hasSourceBeat && hasSourceContract
      ? {
          source_signature_beat_id: category.source_signature_beat_id as number,
          contract: category.source_trigger_contract!,
        }
      : undefined
    if (gameModel === 'conviction_portfolio') {
      const beatId = category.source_signature_beat_id
      if (category.winner_id == null || beatId == null || paidConvictionBeats.has(beatId)) continue
      paidConvictionBeats.add(beatId)
      const believers = [...new Set((input.convictionPicks ?? [])
        .filter((pick) => pick.beat_id === beatId)
        .map((pick) => pick.player_id))]
        .filter((playerId) => playerIds.has(playerId))
        .sort()
      if (believers.length === 0) continue
      const payout = Math.floor(category.points / believers.length)
      for (const playerId of believers) {
        scoreEvents.push({
          id: `conviction:${category.id}:${playerId}`,
          kind: 'prediction',
          player_id: playerId,
          label: category.name,
          points: payout,
          ...(trigger === undefined ? {} : { trigger }),
        })
      }
      continue
    }
    const winners: Array<['primary' | 'tie', string | null]> = [
      ['primary', category.winner_id],
      ['tie', category.tie_winner_id],
    ]
    for (const [position, winnerId] of winners) {
      if (!winnerId) continue
      const result = findDraftPointsForWinner(
        category.id,
        winnerId,
        input.categories,
        input.nominees,
        input.draftEntities,
        input.draftPicks,
      )
      if (!result.playerId || !result.entityId || result.points === 0) continue
      if (!playerIds.has(result.playerId)) {
        throw new Error(`draft evidence references unknown player ${result.playerId}`)
      }
      const entity = entitiesById.get(result.entityId)
      if (!entity) throw new Error(`draft evidence references unknown character ${result.entityId}`)
      scoreEvents.push({
        id: `draft:${category.id}:${position}:${result.entityId}`,
        kind: 'draft',
        player_id: result.playerId,
        character_id: result.entityId,
        label: `${entity.name}: ${category.name}`,
        points: result.points,
        ...(trigger === undefined ? {} : { trigger }),
      })
    }
  }

  for (const pick of (gameModel === 'legacy_ensemble' ? input.confidencePicks : [])
    .filter((candidate) => candidate.is_correct === true)) {
    if (!playerIds.has(pick.player_id)) {
      throw new Error(`prediction evidence references unknown player ${pick.player_id}`)
    }
    const category = categoriesById.get(pick.category_id)
    if (!category) throw new Error(`prediction ${pick.id} references missing category ${pick.category_id}`)
    const nominee = nomineesById.get(pick.nominee_id)
    if (!nominee) throw new Error(`prediction ${pick.id} references missing nominee ${pick.nominee_id}`)
    scoreEvents.push({
      id: `prediction:${pick.id}`,
      kind: 'prediction',
      player_id: pick.player_id,
      label: `${category.name}: ${nominee.name}`,
      points: pick.confidence,
    })
  }

  for (const player of players) {
    const card = cardsByPlayer.get(player.id)
    if (!card) throw new Error(`player ${player.id} has no bingo card`)
    if (card.squares.length !== 25 || card.squares[FREE_CENTER_INDEX] !== 0) {
      throw new Error(`card ${card.id} must have 25 cells with a free center at index 12`)
    }
    const approved = new Set(
      input.bingoMarks
        .filter((mark) => mark.card_id === card.id && mark.status === 'approved')
        .map((mark) => mark.square_index),
    )
    const invalidIndex = [...approved].find((index) => !Number.isInteger(index) || index < 0 || index > 24)
    if (invalidIndex !== undefined) throw new Error(`card ${card.id} has invalid mark index ${invalidIndex}`)

    const bingo = card.squares.map((squareId, index) => {
      if (index === FREE_CENTER_INDEX) return { label: 'FREE', marked: true, free: true }
      const square = squaresById.get(squareId)
      if (!square) throw new Error(`card ${card.id} references missing square ${squareId}`)
      const marked = approved.has(index)
      if (marked) {
        scoreEvents.push({
          id: `bingo-square:${card.id}:${index}`,
          kind: 'bingo',
          player_id: player.id,
          label: square.title,
          points: TIER_POINTS[square.likelihood_tier],
        })
      }
      return { label: square.title, marked, free: false }
    })

    const completeLines = checkBingo(approved).lines
    completeLines.forEach((line, ordinal) => {
      const lineIndex = BINGO_LINES.findIndex((candidate) => candidate.join(',') === line.join(','))
      scoreEvents.push({
        id: `bingo-line:${card.id}:${lineIndex}`,
        kind: 'bingo',
        player_id: player.id,
        label: `Bingo line ${ordinal + 1}`,
        points: bingoLinePoints(ordinal),
      })
    })
    if (isBlackout(approved)) {
      scoreEvents.push({
        id: `bingo-blackout:${card.id}`,
        kind: 'bingo',
        player_id: player.id,
        label: 'Bingo blackout',
        points: 25,
      })
    }
    personalCards.push({ player_id: player.id, bingo })
  }

  return {
    players: players.map((player) => ({ id: player.id, name: player.name })),
    characters: [...input.draftEntities]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((entity) => {
        const owner = pickByEntity.get(entity.id)?.player_id
        return {
          id: entity.id,
          name: entity.name,
          ...(owner === undefined ? {} : { player_id: owner }),
        }
      }),
    score_events: scoreEvents.sort((left, right) => left.id.localeCompare(right.id)),
    personal_cards: personalCards,
  }
}
