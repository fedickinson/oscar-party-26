/**
 * useRoomSnapshot — one-shot read of a finished room, by room code.
 *
 * Serves the two session-free pages: the public standings (/recap/:code) and a
 * single player's keepsake (/recap/:code/:playerId). Both are reached by
 * strangers pasting links, so neither can rely on GameContext, a player id in
 * localStorage, or the live subscriptions the in-app pages use.
 *
 * A SNAPSHOT, NOT A SUBSCRIPTION
 * Deliberately no Realtime. A later settlement amendment appears on reload;
 * holding a websocket open for every casual link click would be pure cost.
 *
 * Extracted from PublicResults when the per-player page needed the identical
 * fetch-and-merge. A second copy of the room_winners merge is exactly the kind
 * of thing that silently rots — one page would show a resolved event the other
 * did not.
 */

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { buildCanonicalRoomRecord } from '../lib/room-record'
import { categoryScopeFilter } from '../lib/catalog-scope'
import { fetchAllRows } from './fetch-all-rows'
import type {
  BingoCardRow,
  BingoMarkRow,
  BingoSquareRow,
  CategoryRow,
  ConfidencePickRow,
  ConvictionPickRow,
  DraftEntityRow,
  DraftPickRow,
  MessageRow,
  NomineeRow,
  PlayerRow,
  PlayerVerdictRow,
  RoomWinnerRow,
  RoomSettlementRow,
  RoomSettlementEntryRow,
  RoomSettlementBingoMarkRow,
  GameModel,
} from '../types/database'

export interface RoomSnapshot {
  roomId: string
  roomCode: string
  players: PlayerRow[]
  categories: CategoryRow[]
  nominees: NomineeRow[]
  confidencePicks: ConfidencePickRow[]
  convictionPicks: ConvictionPickRow[]
  gameModel: GameModel
  draftPicks: DraftPickRow[]
  draftEntities: DraftEntityRow[]
  bingoCards: BingoCardRow[]
  bingoMarks: BingoMarkRow[]
  /** Static square pool keyed by id — carries the tier each mark scores on. */
  bingoSquaresById: Map<number, BingoSquareRow>
  verdicts: Map<string, PlayerVerdictRow>
  messages: MessageRow[]
  recordSource: 'live' | 'settled'
}

export function useRoomSnapshot(code: string | undefined): {
  snapshot: RoomSnapshot | null
  notFound: boolean
  recordError: string | null
} {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [recordError, setRecordError] = useState<string | null>(null)

  useEffect(() => {
    if (!code) return
    let cancelled = false

    async function load() {
      // maybeSingle over single: a mistyped or expired code is an expected
      // outcome on a pasted link, not an exception.
      const { data: room } = await supabase
        .from('rooms')
        .select('id, code, active_settlement_id, show_pack_id, game_model')
        .eq('code', code!.toUpperCase())
        .maybeSingle()

      if (cancelled) return
      if (!room) { setNotFound(true); return }

      const roomId = room.id as string
      const roomBinding = { id: roomId, show_pack_id: room.show_pack_id as string }
      const activeSettlementId = room.active_settlement_id as string | null
      const inactiveSettlementId = '00000000-0000-0000-0000-000000000000'

      const [
        playersRes, catRes, nomRes, cpRes, convictionRes, dpRes, deRes, rwRes, bcRes, pvRes, bsRes, msgRes,
        settlementRes, entryRes, settledMarkRes,
      ] = await Promise.all([
        fetchAllRows<PlayerRow>((from, to) => supabase
          .from('players').select().eq('room_id', roomId)
          .order('created_at').order('id').range(from, to)),
        fetchAllRows<CategoryRow>((from, to) => supabase
          .from('categories').select().or(categoryScopeFilter(roomBinding))
          .order('display_order').order('id').range(from, to)),
        fetchAllRows<NomineeRow>((from, to) => supabase
          .from('nominees').select().eq('show_pack_id', roomBinding.show_pack_id).order('id').range(from, to)),
        fetchAllRows<ConfidencePickRow>((from, to) => supabase
          .from('confidence_picks').select().eq('room_id', roomId).order('id').range(from, to)),
        fetchAllRows<ConvictionPickRow>((from, to) => supabase
          .from('conviction_picks').select().eq('room_id', roomId)
          .order('player_id').order('beat_id').range(from, to)),
        fetchAllRows<DraftPickRow>((from, to) => supabase
          .from('draft_picks').select().eq('room_id', roomId).order('id').range(from, to)),
        fetchAllRows<DraftEntityRow>((from, to) => supabase
          .from('draft_entities').select().eq('show_pack_id', roomBinding.show_pack_id).order('id').range(from, to)),
        fetchAllRows<RoomWinnerRow>((from, to) => supabase
          .from('room_winners').select().eq('room_id', roomId).order('category_id').range(from, to)),
        fetchAllRows<BingoCardRow>((from, to) => supabase
          .from('bingo_cards').select().eq('room_id', roomId).order('id').range(from, to)),
        fetchAllRows<PlayerVerdictRow>((from, to) => supabase
          .from('player_verdicts').select().eq('room_id', roomId).order('player_id').range(from, to)),
        fetchAllRows<BingoSquareRow>((from, to) => supabase
          .from('bingo_squares').select().eq('show_pack_id', roomBinding.show_pack_id).order('id').range(from, to)),
        fetchAllRows<MessageRow>((from, to) => supabase
          .from('messages').select().eq('room_id', roomId)
          .order('created_at').order('id').range(from, to)),
        supabase.from('room_settlements').select().eq('id', activeSettlementId ?? inactiveSettlementId),
        fetchAllRows<RoomSettlementEntryRow>((from, to) => supabase
          .from('room_settlement_entries').select()
          .eq('settlement_id', activeSettlementId ?? inactiveSettlementId)
          .order('display_order').order('id').range(from, to)),
        fetchAllRows<RoomSettlementBingoMarkRow>((from, to) => supabase
          .from('room_settlement_bingo_marks').select()
          .eq('settlement_id', activeSettlementId ?? inactiveSettlementId)
          .order('card_id').order('square_index').range(from, to)),
      ])
      if (cancelled) return

      const firstError = [playersRes, catRes, nomRes, cpRes, convictionRes, dpRes, deRes, rwRes, bcRes, pvRes, bsRes, msgRes, settlementRes, entryRes, settledMarkRes]
        .find((result) => result.error)?.error
      if (firstError) throw firstError

      const bingoCards = (bcRes.data ?? []) as BingoCardRow[]
      let bingoMarks: BingoMarkRow[] = []
      if (bingoCards.length > 0) {
        const { data: markData, error: markError } = await fetchAllRows<BingoMarkRow>((from, to) => supabase
          .from('bingo_marks').select().in('card_id', bingoCards.map((c) => c.id))
          .order('card_id').order('square_index').order('id').range(from, to))
        if (markError) throw markError
        if (cancelled) return
        bingoMarks = (markData ?? []) as BingoMarkRow[]
      }

      const record = buildCanonicalRoomRecord({
        activeSettlementId,
        categories: (catRes.data ?? []) as CategoryRow[],
        roomWinners: (rwRes.data ?? []) as RoomWinnerRow[],
        confidencePicks: (cpRes.data ?? []) as ConfidencePickRow[],
        bingoMarks,
        settlements: (settlementRes.data ?? []) as RoomSettlementRow[],
        settlementEntries: (entryRes.data ?? []) as RoomSettlementEntryRow[],
        settlementBingoMarks: (settledMarkRes.data ?? []) as RoomSettlementBingoMarkRow[],
      })

      setSnapshot({
        roomId,
        roomCode: room.code as string,
        players: (playersRes.data ?? []) as PlayerRow[],
        categories: record.categories,
        nominees: (nomRes.data ?? []) as NomineeRow[],
        confidencePicks: record.confidencePicks,
        convictionPicks: (convictionRes.data ?? []) as ConvictionPickRow[],
        gameModel: (room.game_model ?? 'legacy_ensemble') as GameModel,
        draftPicks: (dpRes.data ?? []) as DraftPickRow[],
        draftEntities: (deRes.data ?? []) as DraftEntityRow[],
        bingoCards,
        bingoMarks: record.bingoMarks,
        bingoSquaresById: new Map(
          ((bsRes.data ?? []) as BingoSquareRow[]).map((sq) => [sq.id, sq]),
        ),
        verdicts: record.source === 'settled'
          ? new Map()
          : new Map(
            ((pvRes.data ?? []) as PlayerVerdictRow[]).map((r) => [r.player_id, r]),
          ),
        messages: (msgRes.data ?? []) as MessageRow[],
        recordSource: record.source,
      })
    }

    load().catch((error) => {
      if (cancelled) return
      console.error('Room snapshot load failed:', error)
      setRecordError(error instanceof Error ? error.message : 'The room record could not be loaded.')
    })
    return () => { cancelled = true }
  }, [code])

  return { snapshot, notFound, recordError }
}
