/**
 * useRoomSnapshot — one-shot read of a finished room, by room code.
 *
 * Serves the two session-free pages: the public standings (/recap/:code) and a
 * single player's keepsake (/recap/:code/:playerId). Both are reached by
 * strangers pasting links, so neither can rely on GameContext, a player id in
 * localStorage, or the live subscriptions the in-app pages use.
 *
 * A SNAPSHOT, NOT A SUBSCRIPTION
 * Deliberately no Realtime. The night is over and nothing will change, so
 * holding a websocket open for every casual link click would be pure cost.
 *
 * Extracted from PublicResults when the per-player page needed the identical
 * fetch-and-merge. A second copy of the room_winners merge is exactly the kind
 * of thing that silently rots — one page would show a resolved event the other
 * did not.
 */

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type {
  BingoCardRow,
  BingoMarkRow,
  BingoSquareRow,
  CategoryRow,
  ConfidencePickRow,
  DraftEntityRow,
  DraftPickRow,
  MessageRow,
  NomineeRow,
  PlayerRow,
  PlayerVerdictRow,
  RoomWinnerRow,
} from '../types/database'

export interface RoomSnapshot {
  roomId: string
  roomCode: string
  players: PlayerRow[]
  categories: CategoryRow[]
  nominees: NomineeRow[]
  confidencePicks: ConfidencePickRow[]
  draftPicks: DraftPickRow[]
  draftEntities: DraftEntityRow[]
  bingoCards: BingoCardRow[]
  bingoMarks: BingoMarkRow[]
  /** Static square pool keyed by id — carries the tier each mark scores on. */
  bingoSquaresById: Map<number, BingoSquareRow>
  verdicts: Map<string, PlayerVerdictRow>
  messages: MessageRow[]
}

export function useRoomSnapshot(code: string | undefined): {
  snapshot: RoomSnapshot | null
  notFound: boolean
} {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!code) return
    let cancelled = false

    async function load() {
      // maybeSingle over single: a mistyped or expired code is an expected
      // outcome on a pasted link, not an exception.
      const { data: room } = await supabase
        .from('rooms')
        .select('id, code')
        .eq('code', code!.toUpperCase())
        .maybeSingle()

      if (cancelled) return
      if (!room) { setNotFound(true); return }

      const roomId = room.id as string

      const [
        playersRes, catRes, nomRes, cpRes, dpRes, deRes, rwRes, bcRes, pvRes, bsRes, msgRes,
      ] = await Promise.all([
        supabase.from('players').select().eq('room_id', roomId).order('created_at'),
        supabase.from('categories').select().order('display_order'),
        supabase.from('nominees').select(),
        supabase.from('confidence_picks').select().eq('room_id', roomId),
        supabase.from('draft_picks').select().eq('room_id', roomId),
        supabase.from('draft_entities').select(),
        supabase.from('room_winners').select().eq('room_id', roomId),
        supabase.from('bingo_cards').select().eq('room_id', roomId),
        supabase.from('player_verdicts').select().eq('room_id', roomId),
        supabase.from('bingo_squares').select(),
        supabase.from('messages').select().eq('room_id', roomId).order('created_at'),
      ])
      if (cancelled) return

      // Winners are per-room; the global categories table carries no result.
      const winnerMap = new Map<number, RoomWinnerRow>(
        ((rwRes.data ?? []) as RoomWinnerRow[]).map((rw) => [rw.category_id, rw]),
      )
      const categories = ((catRes.data ?? []) as CategoryRow[]).map((c) => ({
        ...c,
        winner_id: winnerMap.get(c.id)?.winner_id ?? null,
        tie_winner_id: winnerMap.get(c.id)?.tie_winner_id ?? null,
      }))

      const bingoCards = (bcRes.data ?? []) as BingoCardRow[]
      let bingoMarks: BingoMarkRow[] = []
      if (bingoCards.length > 0) {
        const { data: markData } = await supabase
          .from('bingo_marks')
          .select()
          .in('card_id', bingoCards.map((c) => c.id))
        if (cancelled) return
        bingoMarks = (markData ?? []) as BingoMarkRow[]
      }

      setSnapshot({
        roomId,
        roomCode: room.code as string,
        players: (playersRes.data ?? []) as PlayerRow[],
        categories,
        nominees: (nomRes.data ?? []) as NomineeRow[],
        confidencePicks: (cpRes.data ?? []) as ConfidencePickRow[],
        draftPicks: (dpRes.data ?? []) as DraftPickRow[],
        draftEntities: (deRes.data ?? []) as DraftEntityRow[],
        bingoCards,
        bingoMarks,
        bingoSquaresById: new Map(
          ((bsRes.data ?? []) as BingoSquareRow[]).map((sq) => [sq.id, sq]),
        ),
        verdicts: new Map(
          ((pvRes.data ?? []) as PlayerVerdictRow[]).map((r) => [r.player_id, r]),
        ),
        messages: (msgRes.data ?? []) as MessageRow[],
      })
    }

    load()
    return () => { cancelled = true }
  }, [code])

  return { snapshot, notFound }
}
