/**
 * useBingoApprovals — host-only bingo mark review.
 *
 * Fetches all pending bingo_marks for this room, enriches them with
 * player name and the full square text, and subscribes to INSERT so
 * new marks appear in real-time.
 *
 * approveMark / denyMark update the status field and optimistically
 * remove the mark from local state.
 *
 * Only mounted for all players but meaningful for the host only.
 * Non-hosts get an empty pendingMarks array and no-op functions.
 *
 * Channel: bingo-approvals:${roomId}  (unique — no conflict with
 * the live-bingo-host channel in Live.tsx which is only for toasts)
 */

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useGame } from '../context/GameContext'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PendingMark {
  markId: string
  cardId: string
  squareIndex: number
  playerId: string
  playerName: string
  playerAvatarId: string
  playerColor: string
  squareText: string
  markedAt: string
}

export interface BingoApprovalsState {
  pendingMarks: PendingMark[]
  approveMark: (markId: string) => Promise<void>
  denyMark: (markId: string) => Promise<void>
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBingoApprovals(roomId: string | undefined): BingoApprovalsState {
  const { players } = useGame()
  const [pendingMarks, setPendingMarks] = useState<PendingMark[]>([])

  const fetchPendingMarks = useCallback(async () => {
    if (!roomId) return

    // Step 1: all pending marks in the system
    const { data: marks } = await supabase
      .from('bingo_marks')
      .select()
      .eq('status', 'pending')

    if (!marks?.length) {
      setPendingMarks([])
      return
    }

    // Step 2: cards for this room
    const cardIds = [...new Set(marks.map((m) => m.card_id))]
    const { data: cards } = await supabase
      .from('bingo_cards')
      .select()
      .in('id', cardIds)
      .eq('room_id', roomId)

    if (!cards?.length) {
      setPendingMarks([])
      return
    }

    const cardMap = new Map(cards.map((c) => [c.id, c]))

    // Step 3: collect referenced square ids from card JSONB
    const squareIds = new Set<number>()
    marks.forEach((mark) => {
      const card = cardMap.get(mark.card_id)
      if (card) squareIds.add((card.squares as number[])[mark.square_index])
    })

    const { data: squares } = await supabase
      .from('bingo_squares')
      .select()
      .in('id', [...squareIds])

    const squareMap = new Map(squares?.map((s) => [s.id, s]) ?? [])

    // Step 4: build PendingMark objects
    const pending: PendingMark[] = marks
      .map((mark) => {
        const card = cardMap.get(mark.card_id)
        if (!card) return null

        const player = players.find((p) => p.id === card.player_id)
        const squareId = (card.squares as number[])[mark.square_index]
        const square = squareId != null ? squareMap.get(squareId) : null

        return {
          markId: mark.id,
          cardId: mark.card_id,
          squareIndex: mark.square_index,
          playerId: card.player_id,
          playerName: player?.name ?? 'Unknown',
          playerAvatarId: player?.avatar_id ?? '',
          playerColor: player?.color ?? '#ffffff',
          squareText: square?.text ?? 'Unknown square',
          markedAt: mark.marked_at,
        }
      })
      .filter((m): m is PendingMark => m !== null)

    setPendingMarks(pending)
  }, [roomId, players])

  // Initial fetch
  useEffect(() => {
    fetchPendingMarks()
  }, [fetchPendingMarks])

  // Subscribe to bingo_marks INSERT and UPDATE — new pending marks appear
  // immediately, and approved/denied marks drop from the pending list.
  useEffect(() => {
    if (!roomId) return

    const channel = supabase
      .channel(`bingo-approvals:${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bingo_marks' },
        () => { fetchPendingMarks() },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bingo_marks' },
        () => { fetchPendingMarks() },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [roomId, fetchPendingMarks])

  // ── Actions ────────────────────────────────────────────────────────────────

  async function approveMark(markId: string): Promise<void> {
    const mark = pendingMarks.find((m) => m.markId === markId)

    // Approve the submitted mark
    await supabase.from('bingo_marks').update({ status: 'approved' }).eq('id', markId)
    setPendingMarks((prev) => prev.filter((m) => m.markId !== markId))

    if (!mark || !roomId) return

    // Cascade: find the bingo_square_id at this position on the origin card
    const { data: originCard } = await supabase
      .from('bingo_cards')
      .select('squares')
      .eq('id', mark.cardId)
      .maybeSingle()
    if (!originCard) return

    const squareId = (originCard.squares as number[])[mark.squareIndex]
    if (!squareId) return

    // Find all other cards in the room
    const { data: otherCards } = await supabase
      .from('bingo_cards')
      .select()
      .eq('room_id', roomId)
      .neq('id', mark.cardId)
    if (!otherCards?.length) return

    // For each card that contains the same square, approve or insert a mark
    for (const otherCard of otherCards) {
      const otherSquares = otherCard.squares as number[]
      const otherIndex = otherSquares.indexOf(squareId)
      if (otherIndex === -1) continue

      const { data: existing } = await supabase
        .from('bingo_marks')
        .select('id, status')
        .eq('card_id', otherCard.id)
        .eq('square_index', otherIndex)
        .maybeSingle()

      if (existing) {
        if (existing.status !== 'approved') {
          await supabase.from('bingo_marks').update({ status: 'approved' }).eq('id', existing.id)
        }
      } else {
        await supabase.from('bingo_marks').insert({
          card_id: otherCard.id,
          square_index: otherIndex,
          status: 'approved',
          marked_at: new Date().toISOString(),
        })
      }
    }
  }

  async function denyMark(markId: string): Promise<void> {
    await supabase.from('bingo_marks').update({ status: 'denied' }).eq('id', markId)
    setPendingMarks((prev) => prev.filter((m) => m.markId !== markId))
  }

  return { pendingMarks, approveMark, denyMark }
}
