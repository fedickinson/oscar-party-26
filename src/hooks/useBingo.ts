/**
 * useBingo — all state and actions for a player's bingo card.
 *
 * INITIALIZATION:
 *   On mount, checks if the player already has a card for this room.
 *   If not, fetches all squares + existing cards, generates a new card,
 *   and inserts it. This runs exactly once per player per room.
 *
 * MARK LIFECYCLE:
 *   unmarked → pending  (player taps square; needs host approval unless objective)
 *   pending  → approved (host approves in Admin panel)
 *   pending  → denied   (host denies; brief red flash in BingoSquare, then visually reverts)
 *   denied   → pending  (player taps again; old denied mark deleted, new pending inserted)
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
  bingoScore: number
  /** Non-null when a new bingo line was just detected — drives BingoAlert */
  celebrationData: CelebrationData | null
  isLoading: boolean
  /** Local-only selected square index (no DB write); null when nothing selected */
  selectedIndex: number | null
  selectSquare: (index: number) => void
  deselectSquare: () => void
  markSquare: (index: number) => Promise<void>
  dismissCelebration: () => void
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBingo(
  roomId: string | undefined,
  categories: CategoryRow[] = [],
  nominees: NomineeRow[] = [],
): BingoState {
  const { player } = useGame()

  const [card, setCard] = useState<BingoCardRow | null>(null)
  const [squares, setSquares] = useState<(BingoSquareRow | null)[]>([])
  const [marks, setMarks] = useState<BingoMarkRow[]>([])
  const [celebrationData, setCelebrationData] = useState<CelebrationData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  // Refs for reading latest state inside effects without triggering re-runs
  const squaresRef = useRef<(BingoSquareRow | null)[]>([])
  const marksRef = useRef<BingoMarkRow[]>([])
  const cardRef = useRef<BingoCardRow | null>(null)
  useEffect(() => { squaresRef.current = squares }, [squares])
  useEffect(() => { marksRef.current = marks }, [marks])
  useEffect(() => { cardRef.current = card }, [card])

  // Tracks previously known complete lines for new-bingo detection
  const prevBingoLinesRef = useRef<number[][]>([])

  // ── Card initialization ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!roomId || !player) return

    async function initCard() {
      // Check for existing card first
      const { data: existing } = await supabase
        .from('bingo_cards')
        .select()
        .eq('room_id', roomId!)
        .eq('player_id', player!.id)
        .maybeSingle()

      if (existing) {
        setCard(existing)
        const { data: markData } = await supabase
          .from('bingo_marks')
          .select()
          .eq('card_id', existing.id)
        setMarks(markData ?? [])
        await loadSquares(existing)
        setIsLoading(false)
        return
      }

      // Generate a new card
      const [{ data: allSquares }, { data: existingCards }] = await Promise.all([
        supabase.from('bingo_squares').select(),
        supabase.from('bingo_cards').select('squares').eq('room_id', roomId!),
      ])

      const cardSquares = generateBingoCard(
        allSquares ?? [],
        (existingCards ?? []).map((c) => c.squares as number[]),
      )

      const { data: newCard } = await supabase
        .from('bingo_cards')
        .insert({ room_id: roomId!, player_id: player!.id, squares: cardSquares })
        .select()
        .single()

      if (newCard) {
        setCard(newCard)
        await loadSquares(newCard)
      }
      setIsLoading(false)
    }

    async function loadSquares(c: BingoCardRow) {
      const squareIds = (c.squares as number[]).filter((id) => id !== 0)
      const { data } = await supabase
        .from('bingo_squares')
        .select()
        .in('id', squareIds)

      if (data) {
        const squareMap = new Map(data.map((s) => [s.id, s]))
        const ordered = (c.squares as number[]).map((id) =>
          id === 0 ? null : (squareMap.get(id) ?? null),
        )
        setSquares(ordered)
      }
    }

    initCard()
  }, [roomId, player?.id])

  // ── Realtime: bingo_marks for this card ─────────────────────────────────────

  useEffect(() => {
    if (!card) return

    const channel = supabase
      .channel(`bingo-marks:${card.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bingo_marks', filter: `card_id=eq.${card.id}` },
        (payload) => {
          const m = payload.new as BingoMarkRow
          setMarks((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bingo_marks', filter: `card_id=eq.${card.id}` },
        (payload) => {
          setMarks((prev) =>
            prev.map((m) => (m.id === (payload.new as BingoMarkRow).id ? (payload.new as BingoMarkRow) : m)),
          )
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'bingo_marks', filter: `card_id=eq.${card.id}` },
        (payload) => {
          const deletedId = (payload.old as Partial<BingoMarkRow>).id
          if (deletedId) setMarks((prev) => prev.filter((m) => m.id !== deletedId))
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [card?.id])

  // ── Objective auto-approval: runs when winner is announced ──────────────────

  useEffect(() => {
    if (!cardRef.current || squaresRef.current.length === 0) return
    if (categories.length === 0) return

    const currentCard = cardRef.current

    squaresRef.current.forEach((square, index) => {
      if (index === FREE_CENTER_INDEX || !square) return
      if (!square.is_objective) return

      const existing = marksRef.current.find((m) => m.square_index === index)
      // Already approved or pending — skip
      if (existing && (existing.status === 'approved' || existing.status === 'pending')) return

      if (checkObjectiveCondition(square.text, categories, nominees)) {
        const autoApprove = async () => {
          // Delete any stale denied mark first
          if (existing?.status === 'denied') {
            await supabase.from('bingo_marks').delete().eq('id', existing.id)
          }
          await supabase.from('bingo_marks').insert({
            card_id: currentCard.id,
            square_index: index,
            status: 'approved',
            marked_at: new Date().toISOString(),
          })
        }
        autoApprove()
      }
    })
  }, [categories, nominees]) // runs when a winner is announced

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
  const approvedSquareCount = marks.filter((m) => m.status === 'approved').length
  const bingoScore = computeBingoScore(bingoCount, hasBlackout, approvedSquareCount)

  // ── New bingo detection → celebration trigger ────────────────────────────────

  useEffect(() => {
    const result = checkBingo(markedIndices, prevBingoLinesRef.current)
    if (result.newLines.length > 0) {
      const totalNow = result.lines.length
      const totalBefore = prevBingoLinesRef.current.length
      // Points earned this announcement
      let pointsEarned = 0
      for (let i = totalBefore + 1; i <= totalNow; i++) {
        pointsEarned += i === 1 ? 25 : i === 2 ? 15 : 10
      }
      setCelebrationData({ lines: result.newLines, pointsEarned, totalBingos: totalNow })
    }
    prevBingoLinesRef.current = result.lines
  }, [markedIndices])

  // ── markSquare ───────────────────────────────────────────────────────────────

  const markSquare = useCallback(
    async (index: number) => {
      const currentCard = cardRef.current
      if (!currentCard || !player) return
      if (index === FREE_CENTER_INDEX) return

      const existing = marksRef.current.find((m) => m.square_index === index)
      if (existing?.status === 'approved' || existing?.status === 'pending') return

      // Delete denied mark before inserting fresh one
      if (existing?.status === 'denied') {
        await supabase.from('bingo_marks').delete().eq('id', existing.id)
      }

      const square = squaresRef.current[index]
      if (!square) return

      // Objective squares auto-approve when condition is met.
      // Host marks always auto-approve — the host shouldn't have to review their own card.
      const autoApprove =
        player?.is_host === true ||
        (square.is_objective && checkObjectiveCondition(square.text, categories, nominees))

      await supabase.from('bingo_marks').insert({
        card_id: currentCard.id,
        square_index: index,
        status: autoApprove ? 'approved' : 'pending',
        marked_at: new Date().toISOString(),
      })
    },
    [player, categories, nominees],
  )

  // ── selectSquare / deselectSquare (local-only, no DB) ────────────────────────

  const selectSquare = useCallback((index: number) => {
    if (index === FREE_CENTER_INDEX) return
    setSelectedIndex((prev) => (prev === index ? null : index))
  }, [])

  const deselectSquare = useCallback(() => setSelectedIndex(null), [])

  const dismissCelebration = useCallback(() => setCelebrationData(null), [])

  return {
    card,
    squares,
    marks,
    markedIndices,
    pendingIndices,
    bingoLines: bingoResult.lines,
    bingoCount,
    hasBlackout,
    bingoScore,
    celebrationData,
    isLoading,
    selectedIndex,
    selectSquare,
    deselectSquare,
    markSquare,
    dismissCelebration,
  }
}
