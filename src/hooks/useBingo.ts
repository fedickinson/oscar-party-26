/**
 * useBingo — all state and actions for a player's bingo card.
 *
 * INITIALIZATION:
 *   On mount, checks if the player already has a card for this room.
 *   If not, fetches all squares + existing cards, generates a new card,
 *   and inserts it. This runs exactly once per player per room.
 *
 * MARK LIFECYCLE:
 *   unmarked → approved (player taps a square; bingo is self-serve)
 *   approved → gone     (player taps a marked square; honor-system undo)
 *   objective + condition met → approved directly (no host approval needed)
 *
 * OBJECTIVE AUTO-APPROVAL:
 *   Runs whenever `categories` changes (new winner announced).
 *   For each unmarked objective square, calls checkObjectiveCondition().
 *   If condition is now met, inserts a mark with status='approved' directly.
 *
 * CELEBRATION:
 *   `prevBingoLinesRef` tracks the previously known complete lines.
 *   When `marks` changes (approval fires), compare current lines to prev.
 *   If newLines is non-empty → set celebrationData to trigger BingoAlert.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useGame } from '../context/GameContext'
import {
  FREE_CENTER_INDEX,
  checkBingo,
  checkObjectiveCondition,
  computeBingoScore,
  computeSquarePoints,
  countBingos,
  generateBingoCard,
  isBlackout,
} from '../lib/bingo-utils'
import type { BingoCardRow, BingoMarkRow, BingoSquareRow, CategoryRow, NomineeRow } from '../types/database'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CelebrationData {
  lines: number[][]
  pointsEarned: number
  totalBingos: number
}

export interface BingoState {
  card: BingoCardRow | null
  /** 25 entries; null at position 12 (free center) */
  squares: (BingoSquareRow | null)[]
  marks: BingoMarkRow[]
  /** Grid positions that count as marked (approved + free center) */
  markedIndices: Set<number>
  /** Grid positions with pending marks */
  pendingIndices: Set<number>
  bingoLines: number[][]
  bingoCount: number
  hasBlackout: boolean
  /** Tier points from approved squares — the component of bingoScore you earn without a line */
  squarePoints: number
  bingoScore: number
  /** Non-null when a new bingo line was just detected — drives BingoAlert */
  celebrationData: CelebrationData | null
  isLoading: boolean
  syncError: string | null
  /** Local-only selected square index (no DB write); null when nothing selected */
  selectedIndex: number | null
  selectSquare: (index: number) => void
  deselectSquare: () => void
  markSquare: (index: number) => Promise<void>
  dismissCelebration: () => void
  retrySync: () => void
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBingo(
  roomId: string | undefined,
  categories: CategoryRow[] = [],
  nominees: NomineeRow[] = [],
  onSquareApproved?: (squareText: string) => void,
): BingoState {
  const { player, room } = useGame()

  const [card, setCard] = useState<BingoCardRow | null>(null)
  const [squares, setSquares] = useState<(BingoSquareRow | null)[]>([])
  const [marks, setMarks] = useState<BingoMarkRow[]>([])
  const [celebrationData, setCelebrationData] = useState<CelebrationData | null>(null)
  const [cardLoading, setCardLoading] = useState(true)
  const [marksLoading, setMarksLoading] = useState(false)
  const [marksReadyCardId, setMarksReadyCardId] = useState<string | null>(null)
  const [cardError, setCardError] = useState<string | null>(null)
  const [marksError, setMarksError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [retryVersion, setRetryVersion] = useState(0)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const cardScopeRef = useRef<string | null>(null)
  const marksReadyCardIdRef = useRef<string | null>(null)
  const marksRevisionRef = useRef(0)
  const autoMarkWritesRef = useRef<Set<number>>(new Set())
  const playerMarkWritesRef = useRef<Set<number>>(new Set())

  const requestedCardScope = roomId && player && room
    ? `${roomId}:${player.id}:${room.show_pack_id}`
    : null
  const isLoading = cardLoading
    || marksLoading
    || (requestedCardScope != null && requestedCardScope !== cardScopeRef.current)
  const syncError = requestedCardScope != null && requestedCardScope === cardScopeRef.current
    ? (cardError ?? marksError ?? actionError)
    : null

  // Refs for reading latest state inside effects without triggering re-runs
  const squaresRef = useRef<(BingoSquareRow | null)[]>([])
  const marksRef = useRef<BingoMarkRow[]>([])
  const cardRef = useRef<BingoCardRow | null>(null)
  const onSquareApprovedRef = useRef(onSquareApproved)
  useEffect(() => { squaresRef.current = squares }, [squares])
  useEffect(() => { marksRef.current = marks }, [marks])
  useEffect(() => { cardRef.current = card }, [card])
  useEffect(() => { onSquareApprovedRef.current = onSquareApproved }, [onSquareApproved])

  const replaceMarks = useCallback((update: (current: BingoMarkRow[]) => BingoMarkRow[]) => {
    const next = update(marksRef.current)
    marksRef.current = next
    setMarks(next)
  }, [])

  const publishMarksReady = useCallback((cardId: string | null) => {
    marksReadyCardIdRef.current = cardId
    setMarksReadyCardId(cardId)
  }, [])

  // Tracks previously known complete lines for new-bingo detection
  const prevBingoLinesRef = useRef<number[][]>([])

  // ── Card initialization ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!roomId || !player || !room) {
      cardScopeRef.current = null
      setCard(null)
      setSquares([])
      replaceMarks(() => [])
      setCardLoading(false)
      setMarksLoading(false)
      publishMarksReady(null)
      setCardError(null)
      setMarksError(null)
      setActionError(null)
      prevBingoLinesRef.current = []
      setCelebrationData(null)
      setSelectedIndex(null)
      autoMarkWritesRef.current.clear()
      playerMarkWritesRef.current.clear()
      return
    }

    let cancelled = false
    const cardScope = `${roomId}:${player.id}:${room.show_pack_id}`
    const cardScopeChanged = cardScopeRef.current !== cardScope
    cardScopeRef.current = cardScope
    if (cardScopeChanged) {
      setCard(null)
      setSquares([])
      replaceMarks(() => [])
      publishMarksReady(null)
      prevBingoLinesRef.current = []
      setCelebrationData(null)
      setSelectedIndex(null)
      autoMarkWritesRef.current.clear()
      playerMarkWritesRef.current.clear()
      setMarksError(null)
      setActionError(null)
    }
    setCardLoading(true)
    setCardError(null)

    const activateCard = (nextCard: BingoCardRow) => {
      setMarksLoading(true)
      publishMarksReady(null)
      setCard(nextCard)
    }

    async function initCard() {
      // Check for existing card first
      const { data: existing, error: existingError } = await supabase
        .from('bingo_cards')
        .select()
        .eq('room_id', roomId!)
        .eq('player_id', player!.id)
        .maybeSingle()
      if (existingError) throw existingError
      if (cancelled) return

      if (existing) {
        activateCard(existing)
        await loadSquares(existing)
        return
      }

      // Generate a new card
      const [squaresResult, cardsResult] = await Promise.all([
        supabase.from('bingo_squares').select().eq('show_pack_id', room!.show_pack_id),
        supabase.from('bingo_cards').select('squares').eq('room_id', roomId!),
      ])
      if (squaresResult.error) throw squaresResult.error
      if (cardsResult.error) throw cardsResult.error
      if (cancelled) return

      const cardSquares = generateBingoCard(
        squaresResult.data ?? [],
        (cardsResult.data ?? []).map((c) => c.squares as number[]),
      )

      const { data: newCard, error: cardInsertError } = await supabase
        .rpc('deal_player_bingo_card', {
          p_room_id: roomId!,
          p_actor_player_id: player!.id,
          p_squares: cardSquares,
        })
      if (cancelled) return

      if (cardInsertError) {
        // Card creation failed (network error, RLS, or duplicate). Attempt to
        // recover by fetching an existing card that may have been created by a
        // concurrent initCard() call (e.g. StrictMode double-invoke in dev).
        const { data: recovery, error: recoveryError } = await supabase
          .from('bingo_cards')
          .select()
          .eq('room_id', roomId!)
          .eq('player_id', player!.id)
          .maybeSingle()
        if (cancelled) return
        if (recovery) {
          activateCard(recovery)
          await loadSquares(recovery)
        } else {
          throw new Error(
            recoveryError?.message
              ?? `Bingo card creation failed: ${cardInsertError.message}`,
          )
        }
      } else if (newCard) {
        activateCard(newCard)
        await loadSquares(newCard)
      } else {
        throw new Error('Bingo card creation returned no card.')
      }
    }

    async function loadSquares(c: BingoCardRow) {
      const squareIds = (c.squares as number[]).filter((id) => id !== 0)
      const { data, error } = await supabase
        .from('bingo_squares')
        .select()
        .in('id', squareIds)
      if (error) throw error
      if (cancelled) return

      const squareMap = new Map((data ?? []).map((s) => [s.id, s]))
      const ordered = (c.squares as number[]).map((id) =>
        id === 0 ? null : (squareMap.get(id) ?? null),
      )
      setSquares(ordered)
    }

    void initCard()
      .catch((loadError) => {
        if (cancelled) return
        console.error('Bingo card load failed:', loadError)
        setCardError('Your bingo card could not be synchronized.')
      })
      .finally(() => {
        if (!cancelled) setCardLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [roomId, player?.id, room?.show_pack_id, retryVersion, publishMarksReady, replaceMarks])

  // ── Realtime: bingo_marks for this card ─────────────────────────────────────

  useEffect(() => {
    if (!card) {
      setMarksLoading(false)
      publishMarksReady(null)
      return
    }

    let disposed = false
    let hydrationRun = 0
    setMarksLoading(true)
    publishMarksReady(null)
    setMarksError(null)
    replaceMarks(() => [])

    const upsertMark = (mark: BingoMarkRow) => {
      autoMarkWritesRef.current.delete(mark.square_index)
      replaceMarks((current) => {
        const index = current.findIndex((candidate) => candidate.id === mark.id)
        if (index === -1) return [...current, mark]
        const next = [...current]
        next[index] = mark
        return next
      })
    }

    const hydrateMarks = async () => {
      const run = ++hydrationRun
      setMarksLoading(true)
      publishMarksReady(null)
      setMarksError(null)

      try {
        while (!disposed && run === hydrationRun) {
          const revisionAtStart = marksRevisionRef.current
          const { data, error } = await supabase
            .from('bingo_marks')
            .select()
            .eq('card_id', card.id)
          if (error) throw error
          if (disposed || run !== hydrationRun) return
          if (marksRevisionRef.current !== revisionAtStart) continue

          const initialMarks = (data ?? []) as BingoMarkRow[]
          const initialMarkedIndices = new Set<number>([FREE_CENTER_INDEX])
          initialMarks
            .filter((mark) => mark.status === 'approved')
            .forEach((mark) => initialMarkedIndices.add(mark.square_index))

          // Hydration and reconnects establish a baseline; only later events
          // are new enough to produce a celebration.
          prevBingoLinesRef.current = checkBingo(initialMarkedIndices, []).lines
          autoMarkWritesRef.current.clear()
          replaceMarks(() => initialMarks)
          publishMarksReady(card.id)
          setMarksLoading(false)
          return
        }
      } catch (loadError) {
        if (disposed || run !== hydrationRun) return
        console.error('Bingo mark load failed:', loadError)
        setMarksError('Your bingo marks could not be synchronized.')
        setMarksLoading(false)
      }
    }

    const channel = supabase
      .channel(`bingo-marks:${card.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bingo_marks', filter: `card_id=eq.${card.id}` },
        (payload) => {
          if (disposed) return
          marksRevisionRef.current += 1
          const m = payload.new as BingoMarkRow
          upsertMark(m)
          // Notify for cascade-approved marks: approved INSERT on a non-objective
          // square that the player didn't initiate (host auto-approves via cascade).
          if (m.status === 'approved') {
            const square = squaresRef.current[m.square_index]
            if (square && !square.is_objective) {
              onSquareApprovedRef.current?.(square.short_text)
            }
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bingo_marks', filter: `card_id=eq.${card.id}` },
        (payload) => {
          if (disposed) return
          marksRevisionRef.current += 1
          const m = payload.new as BingoMarkRow
          upsertMark(m)
          // Notify when the host approves a pending mark (pending → approved)
          if (m.status === 'approved') {
            const square = squaresRef.current[m.square_index]
            if (square) {
              onSquareApprovedRef.current?.(square.short_text)
            }
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'bingo_marks', filter: `card_id=eq.${card.id}` },
        (payload) => {
          if (disposed) return
          marksRevisionRef.current += 1
          const deletedId = (payload.old as Partial<BingoMarkRow>).id
          if (deletedId) replaceMarks((current) => current.filter((mark) => mark.id !== deletedId))
        },
      )
      .subscribe((status) => {
        if (disposed) return
        if (status === 'SUBSCRIBED') {
          void hydrateMarks()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          hydrationRun += 1
          publishMarksReady(null)
          setMarksError('The bingo feed could not connect to Realtime.')
          setMarksLoading(false)
        }
      })

    return () => {
      disposed = true
      hydrationRun += 1
      supabase.removeChannel(channel)
    }
  }, [card?.id, retryVersion, publishMarksReady, replaceMarks])

  // ── Objective auto-approval: runs when winner is announced ──────────────────

  useEffect(() => {
    if (!cardRef.current || squaresRef.current.length === 0) return
    if (marksReadyCardId !== cardRef.current.id) return
    if (categories.length === 0) return

    const currentCard = cardRef.current

    squaresRef.current.forEach((square, index) => {
      if (index === FREE_CENTER_INDEX || !square) return
      if (!square.is_objective) return

      const existing = marksRef.current.find((m) => m.square_index === index)
      // Already approved or pending — skip
      if (existing && (existing.status === 'approved' || existing.status === 'pending')) return
      if (autoMarkWritesRef.current.has(index)) return
      if (playerMarkWritesRef.current.has(index)) return

      if (checkObjectiveCondition(square.text, categories, nominees)) {
        autoMarkWritesRef.current.add(index)
        const autoApprove = async () => {
          // The command promotes a stale denied mark in place or inserts a new
          // approved mark, so objective reconciliation is one atomic write.
          const { error } = await supabase.rpc('set_player_bingo_mark', {
            p_room_id: currentCard.room_id,
            p_actor_player_id: currentCard.player_id,
            p_card_id: currentCard.id,
            p_square_index: index,
            p_marked: true,
          })
          if (error) {
            console.error('Bingo auto-approve: insert failed', error)
            autoMarkWritesRef.current.delete(index)
            setActionError('An objective mark could not be saved. Reload the bingo ledger before continuing.')
          }
        }
        autoApprove().catch((err) => {
          autoMarkWritesRef.current.delete(index)
          console.error('Bingo auto-approve threw:', err)
          setActionError('An objective mark could not be saved. Reload the bingo ledger before continuing.')
        })
      }
    })
  }, [categories, nominees, marksReadyCardId]) // runs when a winner is announced or marks become ready

  // ── Derived state ────────────────────────────────────────────────────────────

  const markedIndices = useMemo(() => {
    const s = new Set<number>([FREE_CENTER_INDEX])
    marks
      .filter((m) => m.status === 'approved')
      .forEach((m) => s.add(m.square_index))
    return s
  }, [marks])

  const pendingIndices = useMemo(() => {
    const s = new Set<number>()
    marks.filter((m) => m.status === 'pending').forEach((m) => s.add(m.square_index))
    return s
  }, [marks])

  const bingoResult = checkBingo(markedIndices, prevBingoLinesRef.current)
  const bingoCount = countBingos(bingoResult.lines)
  const hasBlackout = isBlackout(markedIndices)
  // Tier points for every approved square, plus the line bonuses. Must match
  // computePlayerBingoScores or the card would disagree with the leaderboard.
  const squarePoints = computeSquarePoints(squares, markedIndices)
  const bingoScore = computeBingoScore(bingoCount, hasBlackout, squarePoints)

  // ── New bingo detection → celebration trigger ────────────────────────────────

  useEffect(() => {
    const result = checkBingo(markedIndices, prevBingoLinesRef.current)
    if (result.newLines.length > 0) {
      const totalNow = result.lines.length
      const totalBefore = prevBingoLinesRef.current.length
      // Points earned this announcement. Derived from computeBingoScore rather
      // than restated here — the celebration used to hardcode the old 25/15/10
      // scale and kept promising points the leaderboard never paid out.
      const pointsEarned =
        computeBingoScore(totalNow, false) - computeBingoScore(totalBefore, false)
      setCelebrationData({ lines: result.newLines, pointsEarned, totalBingos: totalNow })
    }
    prevBingoLinesRef.current = result.lines
  }, [markedIndices])

  // ── markSquare ───────────────────────────────────────────────────────────────

  // HONOR SYSTEM. Marks used to go pending -> host approval, which made the
  // host (already the GM, a remote-holder, and a player) the bottleneck for
  // every square on a busy night. The trust split for this app: self-serve
  // what only affects yourself, referee what moves the shared race. A bingo
  // card is your own score among six friends — so a tap marks it approved
  // immediately, and tapping a marked square UNMARKS it (that's the undo;
  // mistakes are corrected by their maker, not adjudicated).
  //
  // The companion bingo reactions wait ~20s and re-check the mark still
  // exists before speaking, so an instantly-undone misclick stays silent.
  const markSquare = useCallback(
    async (index: number) => {
      const currentCard = cardRef.current
      if (!currentCard || !player) return
      if (marksReadyCardIdRef.current !== currentCard.id) return
      if (index === FREE_CENTER_INDEX) return
      if (autoMarkWritesRef.current.has(index)) return
      if (playerMarkWritesRef.current.has(index)) return
      playerMarkWritesRef.current.add(index)
      setActionError(null)

      try {
        const existing = marksRef.current.find((m) => m.square_index === index)

        // Toggle off — the undo. OPTIMISTIC: the marker's own screen updates
        // this instant; the realtime echo (which phones can drop or delay)
        // merely confirms. Both paths dedupe by id.
        if (existing) {
          marksRevisionRef.current += 1
          replaceMarks((current) => current.filter((mark) => mark.id !== existing.id))
          const { error } = await supabase.rpc('set_player_bingo_mark', {
            p_room_id: currentCard.room_id,
            p_actor_player_id: player.id,
            p_card_id: currentCard.id,
            p_square_index: index,
            p_marked: false,
          })
          if (error) {
            console.error('Bingo mark removal failed:', error)
            replaceMarks((current) => (
              current.some((mark) => mark.id === existing.id) ? current : [...current, existing]
            ))
            setActionError('That mark could not be removed. Refresh the bingo ledger before continuing.')
          }
          return
        }

        const square = squaresRef.current[index]
        if (!square) return

        const { data: inserted, error } = await supabase.rpc('set_player_bingo_mark', {
          p_room_id: currentCard.room_id,
          p_actor_player_id: player.id,
          p_card_id: currentCard.id,
          p_square_index: index,
          p_marked: true,
        })
        if (error) {
          console.error('Bingo mark creation failed:', error)
          setActionError('That mark could not be saved. Refresh the bingo ledger before continuing.')
          return
        }
        marksRevisionRef.current += 1
        // Optimistic apply from the insert's own return — no waiting on the
        // realtime echo. The subscription handler dedupes by id when it arrives.
        if (inserted) {
          replaceMarks((current) => (
            current.some((mark) => mark.id === inserted.id) ? current : [...current, inserted]
          ))
        }
      } finally {
        playerMarkWritesRef.current.delete(index)
      }
    },
    [player, replaceMarks],
  )

  // ── selectSquare / deselectSquare (local-only, no DB) ────────────────────────

  const selectSquare = useCallback((index: number) => {
    if (index === FREE_CENTER_INDEX) return
    setSelectedIndex((prev) => (prev === index ? null : index))
  }, [])

  const deselectSquare = useCallback(() => setSelectedIndex(null), [])

  const dismissCelebration = useCallback(() => setCelebrationData(null), [])

  const retrySync = useCallback(() => {
    setCardLoading(true)
    if (cardRef.current) setMarksLoading(true)
    setCardError(null)
    setMarksError(null)
    setActionError(null)
    setRetryVersion((current) => current + 1)
  }, [])

  return {
    card,
    squares,
    marks,
    markedIndices,
    pendingIndices,
    bingoLines: bingoResult.lines,
    bingoCount,
    hasBlackout,
    squarePoints,
    bingoScore,
    celebrationData,
    isLoading,
    syncError,
    selectedIndex,
    selectSquare,
    deselectSquare,
    markSquare,
    dismissCelebration,
    retrySync,
  }
}
