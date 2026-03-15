/**
 * useOtherBingoCards — fetches and subscribes to bingo cards for all players
 * except the current user. Used by BingoTab to power the peek overlay.
 *
 * Returns one entry per other player whose card exists in the room.
 * Subscribes to bingo_marks per card so the peek view stays live.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { BingoCardRow, BingoMarkRow, BingoSquareRow, PlayerRow } from '../types/database'

export interface OtherPlayerCard {
  player: PlayerRow
  card: BingoCardRow
  squares: (BingoSquareRow | null)[]
  marks: BingoMarkRow[]
}

export function useOtherBingoCards(
  roomId: string | undefined,
  otherPlayers: PlayerRow[],
): OtherPlayerCard[] {
  const [cards, setCards] = useState<OtherPlayerCard[]>([])

  // Stable string dep to avoid re-running the load effect on every render
  const playerIdsKey = useMemo(
    () => otherPlayers.map((p) => p.id).sort().join(','),
    [otherPlayers],
  )

  // ── Initial fetch ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!roomId || otherPlayers.length === 0) {
      setCards([])
      return
    }

    let cancelled = false

    async function load() {
      // All bingo_cards for this room
      const { data: allCards } = await supabase
        .from('bingo_cards')
        .select()
        .eq('room_id', roomId!)

      if (cancelled || !allCards) return

      // Filter to cards owned by other players
      const playerMap = new Map(otherPlayers.map((p) => [p.id, p]))
      const matchedCards = allCards.filter((c) => playerMap.has(c.player_id))
      if (matchedCards.length === 0) return

      // All bingo_squares are shared — fetch once
      const { data: allSquares } = await supabase.from('bingo_squares').select()
      const squareMap = new Map((allSquares ?? []).map((s) => [s.id, s]))

      // Marks for all matched cards
      const cardIds = matchedCards.map((c) => c.id)
      const { data: allMarks } = await supabase
        .from('bingo_marks')
        .select()
        .in('card_id', cardIds)

      if (cancelled) return

      const marksByCard = new Map<string, BingoMarkRow[]>()
      ;(allMarks ?? []).forEach((m) => {
        const arr = marksByCard.get(m.card_id) ?? []
        arr.push(m)
        marksByCard.set(m.card_id, arr)
      })

      const result: OtherPlayerCard[] = matchedCards.map((card) => {
        const ordered = (card.squares as number[]).map((id) =>
          id === 0 ? null : (squareMap.get(id) ?? null),
        )
        return {
          player: playerMap.get(card.player_id)!,
          card,
          squares: ordered,
          marks: marksByCard.get(card.id) ?? [],
        }
      })

      setCards(result)
    }

    load()

    return () => {
      cancelled = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, playerIdsKey])

  // ── Realtime subscriptions (one channel per other player's card) ─────────────

  // Stable string dep based on card IDs so subscriptions only re-run when the
  // set of cards actually changes, not on every mark update.
  const cardIdsKey = useMemo(() => cards.map((c) => c.card.id).sort().join(','), [cards])
  const cardsRef = useRef(cards)
  useEffect(() => { cardsRef.current = cards }, [cards])

  useEffect(() => {
    if (cards.length === 0) return

    const channels = cards.map((entry) =>
      supabase
        .channel(`peek-marks:${entry.card.id}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'bingo_marks', filter: `card_id=eq.${entry.card.id}` },
          (payload) => {
            const m = payload.new as BingoMarkRow
            setCards((prev) =>
              prev.map((c) =>
                c.card.id === m.card_id
                  ? { ...c, marks: c.marks.some((x) => x.id === m.id) ? c.marks : [...c.marks, m] }
                  : c,
              ),
            )
          },
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'bingo_marks', filter: `card_id=eq.${entry.card.id}` },
          (payload) => {
            const m = payload.new as BingoMarkRow
            setCards((prev) =>
              prev.map((c) =>
                c.card.id === m.card_id
                  ? { ...c, marks: c.marks.map((x) => (x.id === m.id ? m : x)) }
                  : c,
              ),
            )
          },
        )
        .on(
          'postgres_changes',
          { event: 'DELETE', schema: 'public', table: 'bingo_marks', filter: `card_id=eq.${entry.card.id}` },
          (payload) => {
            const deletedId = (payload.old as Partial<BingoMarkRow>).id
            if (!deletedId) return
            setCards((prev) =>
              prev.map((c) =>
                c.marks.some((x) => x.id === deletedId)
                  ? { ...c, marks: c.marks.filter((x) => x.id !== deletedId) }
                  : c,
              ),
            )
          },
        )
        .subscribe(),
    )

    return () => {
      channels.forEach((ch) => supabase.removeChannel(ch))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardIdsKey])

  return cards
}
