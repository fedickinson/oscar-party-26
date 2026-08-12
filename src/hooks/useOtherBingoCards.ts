/**
 * useOtherBingoCards — the read-only peer bingo ledger used by BingoTab.
 *
 * One channel watches room card membership plus mark changes before the first
 * snapshot. Card events trigger a complete refresh because a newly dealt card
 * can receive its first mark before a card-specific subscription could exist.
 * Mark callbacks update known cards immediately, while a revision counter makes
 * any overlapping hydration retry before it publishes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useGame } from '../context/GameContext'
import type { BingoCardRow, BingoMarkRow, BingoSquareRow, PlayerRow } from '../types/database'

export interface OtherPlayerCard {
  player: PlayerRow
  card: BingoCardRow
  squares: (BingoSquareRow | null)[]
  marks: BingoMarkRow[]
}

export interface OtherBingoCardsState {
  cards: OtherPlayerCard[]
  isLoading: boolean
  syncError: string | null
  retrySync: () => void
}

const REALTIME_STABILIZATION_MS = 5_000

export function useOtherBingoCards(
  roomId: string | undefined,
  otherPlayers: PlayerRow[],
): OtherBingoCardsState {
  const { room } = useGame()
  const [cards, setCards] = useState<OtherPlayerCard[]>([])
  const [loadingState, setLoadingState] = useState(true)
  const [syncErrorState, setSyncErrorState] = useState<string | null>(null)
  const [retryVersion, setRetryVersion] = useState(0)
  const cardsRef = useRef<OtherPlayerCard[]>([])
  const playersRef = useRef(otherPlayers)
  const activeScopeRef = useRef<string | null>(null)
  playersRef.current = otherPlayers

  const replaceCards = useCallback((update: (current: OtherPlayerCard[]) => OtherPlayerCard[]) => {
    const next = update(cardsRef.current)
    cardsRef.current = next
    setCards(next)
  }, [])

  // Include presentation identity as well as IDs so an edited player name or
  // avatar reaches an already-open peek without waiting for a card event.
  const playerIdentityKey = useMemo(
    () => JSON.stringify(
      otherPlayers
        .map((player) => [player.id, player.name, player.avatar_id, player.color])
        .sort(([leftId], [rightId]) => leftId.localeCompare(rightId)),
    ),
    [otherPlayers],
  )
  const requestedScope = roomId && room && otherPlayers.length > 0
    ? `${roomId}:${room.show_pack_id}:${playerIdentityKey}`
    : null
  const isLoading = loadingState || (requestedScope != null && requestedScope !== activeScopeRef.current)
  const syncError = requestedScope != null && requestedScope === activeScopeRef.current
    ? syncErrorState
    : null

  useEffect(() => {
    if (!roomId || !room || otherPlayers.length === 0) {
      activeScopeRef.current = null
      replaceCards(() => [])
      setLoadingState(false)
      setSyncErrorState(null)
      return
    }

    const currentRoom = room
    activeScopeRef.current = `${roomId}:${room.show_pack_id}:${playerIdentityKey}`
    let disposed = false
    let subscribed = false
    let hydrating = false
    let liveRevision = 0
    let hydrationRun = 0
    let stabilizationTimer: ReturnType<typeof setTimeout> | null = null
    replaceCards(() => [])
    setLoadingState(true)
    setSyncErrorState(null)

    const upsertMark = (mark: BingoMarkRow) => {
      replaceCards((current) => current.map((entry) => {
        if (entry.card.id !== mark.card_id) return entry
        const index = entry.marks.findIndex((candidate) => candidate.id === mark.id)
        if (index === -1) return { ...entry, marks: [...entry.marks, mark] }
        const nextMarks = [...entry.marks]
        nextMarks[index] = mark
        return { ...entry, marks: nextMarks }
      }))
    }

    const hydratePeerLedger = async (showLoading = true) => {
      const run = ++hydrationRun
      hydrating = true
      if (showLoading) {
        setLoadingState(true)
        setSyncErrorState(null)
      }

      try {
        while (!disposed && run === hydrationRun) {
          const revisionAtStart = liveRevision
          const [cardsResult, squaresResult] = await Promise.all([
            supabase.from('bingo_cards').select().eq('room_id', roomId),
            supabase.from('bingo_squares').select().eq('show_pack_id', currentRoom.show_pack_id),
          ])
          if (cardsResult.error) throw cardsResult.error
          if (squaresResult.error) throw squaresResult.error
          if (disposed || run !== hydrationRun) return

          const playerMap = new Map(playersRef.current.map((player) => [player.id, player]))
          const matchedCards = ((cardsResult.data ?? []) as BingoCardRow[])
            .filter((card) => playerMap.has(card.player_id))
          const cardIds = matchedCards.map((card) => card.id)
          let marks: BingoMarkRow[] = []

          if (cardIds.length > 0) {
            const { data, error } = await supabase
              .from('bingo_marks')
              .select()
              .in('card_id', cardIds)
            if (error) throw error
            marks = (data ?? []) as BingoMarkRow[]
          }
          if (disposed || run !== hydrationRun) return
          if (liveRevision !== revisionAtStart) continue

          const squareMap = new Map(
            ((squaresResult.data ?? []) as BingoSquareRow[]).map((square) => [square.id, square]),
          )
          const marksByCard = new Map<string, BingoMarkRow[]>()
          marks.forEach((mark) => {
            const current = marksByCard.get(mark.card_id) ?? []
            current.push(mark)
            marksByCard.set(mark.card_id, current)
          })

          replaceCards(() => matchedCards.map((card) => ({
            player: playerMap.get(card.player_id)!,
            card,
            squares: (card.squares as number[]).map((squareId) => (
              squareId === 0 ? null : (squareMap.get(squareId) ?? null)
            )),
            marks: marksByCard.get(card.id) ?? [],
          })))
          hydrating = false
          setSyncErrorState(null)
          setLoadingState(false)
          return
        }
      } catch (loadError) {
        if (disposed || run !== hydrationRun) return
        hydrating = false
        console.error('Peer bingo ledger load failed:', loadError)
        setSyncErrorState('Other players’ bingo cards could not be synchronized.')
        setLoadingState(false)
      }
    }

    const refreshAfterCardChange = () => {
      if (disposed) return
      liveRevision += 1
      if (subscribed) void hydratePeerLedger()
    }

    const refreshAfterCardDelete = (payload: { old: Record<string, unknown> }) => {
      if (disposed) return
      const deletedId = payload.old.id
      const relevant = hydrating || (
        typeof deletedId === 'string'
        && cardsRef.current.some((entry) => entry.card.id === deletedId)
      )
      if (relevant) refreshAfterCardChange()
    }

    const channel = supabase
      .channel(`peer-bingo:${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bingo_cards', filter: `room_id=eq.${roomId}` },
        refreshAfterCardChange,
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bingo_cards', filter: `room_id=eq.${roomId}` },
        refreshAfterCardChange,
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'bingo_cards' },
        refreshAfterCardDelete,
      )
      // Realtime cannot filter one subscription by a changing set of card IDs.
      // Receive the small global mark stream, advance the revision for every
      // event, and project only rows belonging to cards already in this room.
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bingo_marks' },
        (payload) => {
          if (disposed) return
          const mark = payload.new as BingoMarkRow
          const relevant = hydrating || cardsRef.current.some((entry) => entry.card.id === mark.card_id)
          if (!relevant) return
          liveRevision += 1
          upsertMark(mark)
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bingo_marks' },
        (payload) => {
          if (disposed) return
          const mark = payload.new as BingoMarkRow
          const relevant = hydrating || cardsRef.current.some((entry) => entry.card.id === mark.card_id)
          if (!relevant) return
          liveRevision += 1
          upsertMark(mark)
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'bingo_marks' },
        (payload) => {
          if (disposed) return
          const deletedId = (payload.old as Partial<BingoMarkRow>).id
          if (!deletedId) return
          const relevant = hydrating || cardsRef.current.some(
            (entry) => entry.marks.some((mark) => mark.id === deletedId),
          )
          if (!relevant) return
          liveRevision += 1
          replaceCards((current) => current.map((entry) => (
            entry.marks.some((mark) => mark.id === deletedId)
              ? { ...entry, marks: entry.marks.filter((mark) => mark.id !== deletedId) }
              : entry
          )))
        },
      )
      .subscribe((status) => {
        if (disposed) return
        if (status === 'SUBSCRIBED') {
          subscribed = true
          void hydratePeerLedger()
          // A cold self-hosted Realtime worker can acknowledge the channel a
          // few seconds before its Postgres Changes stream is ready. Reconcile
          // once after that window so a first missed card event cannot leave
          // the peer ledger stale for the rest of the tab session.
          if (stabilizationTimer) clearTimeout(stabilizationTimer)
          stabilizationTimer = setTimeout(() => {
            if (!disposed && subscribed) void hydratePeerLedger(false)
          }, REALTIME_STABILIZATION_MS)
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          subscribed = false
          hydrating = false
          hydrationRun += 1
          setSyncErrorState('The peer bingo feed could not connect to Realtime.')
          setLoadingState(false)
        }
      })

    return () => {
      disposed = true
      subscribed = false
      hydrating = false
      hydrationRun += 1
      if (stabilizationTimer) clearTimeout(stabilizationTimer)
      supabase.removeChannel(channel)
    }
  }, [roomId, room?.show_pack_id, playerIdentityKey, retryVersion, replaceCards])

  const retrySync = useCallback(() => {
    setLoadingState(true)
    setSyncErrorState(null)
    setRetryVersion((current) => current + 1)
  }, [])

  return { cards, isLoading, syncError, retrySync }
}
