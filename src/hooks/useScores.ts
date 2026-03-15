/**
 * useScores — fetches and subscribes to all data needed for live scoring.
 *
 * DATA DEPENDENCIES:
 *   categories        — for point values and winner_id (the trigger)
 *   nominees          — for name/film_name lookups in entity matching
 *   confidence_picks  — for is_correct field updates
 *   draft_picks       — for entity → player ownership
 *   draft_entities    — for entity name/film/type
 *
 * SUBSCRIPTION STRATEGY:
 *   - categories UPDATE: fires when host sets a winner_id. Triggers re-score.
 *   - confidence_picks UPDATE: fires when is_correct changes (set by useAdmin).
 *     Filtered by room_id so we only receive this room's picks.
 *
 * RECENT RESULTS:
 *   Tracked by comparing category states before/after each update.
 *   When winner_id transitions null → uuid: a new RecentResult is prepended.
 *   When winner_id is cleared (undo): that result is removed.
 *   Capped at 10 entries.
 */

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useGame } from '../context/GameContext'
import { computeLeaderboard, findDraftPointsForWinner } from '../lib/scoring'
import { checkBingo, computeBingoScore, countBingos, isBlackout } from '../lib/bingo-utils'
import type { ScoredPlayer } from '../lib/scoring'
import type {
  BingoCardRow,
  BingoMarkRow,
  CategoryRow,
  NomineeRow,
  ConfidencePickRow,
  DraftPickRow,
  DraftEntityRow,
  PlayerRow,
  RoomWinnerRow,
} from '../types/database'

export interface RecentResult {
  categoryId: number
  categoryName: string
  categoryPoints: number
  winnerName: string
  winnerFilm: string
  announcedAt: Date
}

// ─── Activity feed types ──────────────────────────────────────────────────────

export interface PlayerImpact {
  playerId: string
  playerName: string
  avatarId: string
  confidenceDelta: number
  confidencePickedName: string | null
  confidenceCorrect: boolean
  draftDelta: number
  draftedEntityName: string | null
}

export interface WinnerFeedEntry {
  kind: 'winner'
  categoryId: number
  categoryName: string
  categoryTier: number
  categoryPoints: number
  winnerName: string
  winnerFilm: string
  time: Date
  playerImpacts: PlayerImpact[]
}

export interface LeadChangeFeedEntry {
  kind: 'lead-change'
  leaderId: string
  leaderName: string
  leaderAvatarId: string
  totalScore: number
  time: Date
}

export type FeedEvent = WinnerFeedEntry | LeadChangeFeedEntry

export interface ScoresState {
  leaderboard: ScoredPlayer[]
  recentResults: RecentResult[]
  activityFeed: FeedEvent[]
  // Raw data exposed so child tabs don't duplicate fetches
  categories: CategoryRow[]
  nominees: NomineeRow[]
  confidencePicks: ConfidencePickRow[]
  draftPicks: DraftPickRow[]
  draftEntities: DraftEntityRow[]
  isLoading: boolean
}

export function useScores(roomId: string | undefined): ScoresState {
  const { players } = useGame()

  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [nominees, setNominees] = useState<NomineeRow[]>([])
  const [confidencePicks, setConfidencePicks] = useState<ConfidencePickRow[]>([])
  const [draftPicks, setDraftPicks] = useState<DraftPickRow[]>([])
  const [draftEntities, setDraftEntities] = useState<DraftEntityRow[]>([])
  const [bingoCards, setBingoCards] = useState<BingoCardRow[]>([])
  const [bingoMarks, setBingoMarks] = useState<BingoMarkRow[]>([])
  const [recentResults, setRecentResults] = useState<RecentResult[]>([])
  const [winnerEntries, setWinnerEntries] = useState<WinnerFeedEntry[]>([])
  const [leadChanges, setLeadChanges] = useState<LeadChangeFeedEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Refs kept in sync with state so subscription callbacks read fresh values
  // without stale closure issues
  const nomineesRef = useRef<NomineeRow[]>([])
  const confidencePicksRef = useRef<ConfidencePickRow[]>([])
  const draftPicksRef = useRef<DraftPickRow[]>([])
  const draftEntitiesRef = useRef<DraftEntityRow[]>([])
  const categoriesRef = useRef<CategoryRow[]>([])
  const playersRef = useRef<PlayerRow[]>([])

  useEffect(() => { nomineesRef.current = nominees }, [nominees])
  useEffect(() => { confidencePicksRef.current = confidencePicks }, [confidencePicks])
  useEffect(() => { draftPicksRef.current = draftPicks }, [draftPicks])
  useEffect(() => { draftEntitiesRef.current = draftEntities }, [draftEntities])
  useEffect(() => { categoriesRef.current = categories }, [categories])
  useEffect(() => { playersRef.current = players }, [players])

  // Track previous winner_ids to detect new announcements vs. undos
  const prevCategoriesRef = useRef<Map<number, string | null>>(new Map())

  // ── Initial data load ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!roomId) return

    Promise.all([
      supabase.from('categories').select().order('display_order'),
      supabase.from('nominees').select(),
      supabase.from('confidence_picks').select().eq('room_id', roomId),
      supabase.from('draft_picks').select().eq('room_id', roomId),
      supabase.from('draft_entities').select(),
      supabase.from('bingo_cards').select().eq('room_id', roomId),
      supabase.from('room_winners').select().eq('room_id', roomId),
    ]).then(async ([catRes, nomRes, cpRes, dpRes, deRes, bcRes, rwRes]) => {
      if (catRes.data) {
        const winnerMap = new Map(
          (rwRes.data ?? []).map((rw: RoomWinnerRow) => [rw.category_id, rw.winner_id]),
        )
        const mergedCats = catRes.data.map((c) => ({
          ...c,
          winner_id: winnerMap.get(c.id) ?? null,
        }))
        setCategories(mergedCats)
        categoriesRef.current = mergedCats
        const seed = new Map<number, string | null>()
        mergedCats.forEach((c) => seed.set(c.id, c.winner_id))
        prevCategoriesRef.current = seed
      }
      if (nomRes.data) {
        setNominees(nomRes.data)
        nomineesRef.current = nomRes.data
      }
      if (cpRes.data) setConfidencePicks(cpRes.data)
      if (dpRes.data) setDraftPicks(dpRes.data)
      if (deRes.data) setDraftEntities(deRes.data)

      // Fetch all bingo marks for this room's cards
      if (bcRes.data && bcRes.data.length > 0) {
        setBingoCards(bcRes.data)
        const cardIds = bcRes.data.map((c) => c.id)
        const { data: markData } = await supabase
          .from('bingo_marks')
          .select()
          .in('card_id', cardIds)
        if (markData) setBingoMarks(markData)
      }

      setIsLoading(false)
    })
  }, [roomId])

  // ── Subscribe to room_winners (winner changes scoped to this room) ───────────

  useEffect(() => {
    if (!roomId) return

    function handleWinnerSet(rw: RoomWinnerRow) {
      const cat = categoriesRef.current.find((c) => c.id === rw.category_id)
      if (!cat) return

      const prevWinnerId = prevCategoriesRef.current.get(rw.category_id) ?? null
      prevCategoriesRef.current.set(rw.category_id, rw.winner_id)

      // Update categories state with the per-room winner
      setCategories((prev) =>
        prev.map((c) => (c.id === rw.category_id ? { ...c, winner_id: rw.winner_id } : c)),
      )

      if (rw.winner_id === prevWinnerId) return

      const winner = nomineesRef.current.find((n) => n.id === rw.winner_id)
      if (!winner) return

      const now = new Date()

      setRecentResults((prev) =>
        [
          {
            categoryId: cat.id,
            categoryName: cat.name,
            categoryPoints: cat.points,
            winnerName: winner.name,
            winnerFilm: winner.film_name,
            announcedAt: now,
          },
          ...prev,
        ].slice(0, 10),
      )

      // Build per-player impacts for activity feed
      const categoriesWithUpdate = categoriesRef.current.map((c) =>
        c.id === rw.category_id ? { ...c, winner_id: rw.winner_id } : c,
      )
      const { playerId: draftWinnerId, points: draftPoints } =
        findDraftPointsForWinner(
          rw.category_id,
          rw.winner_id,
          categoriesWithUpdate,
          nomineesRef.current,
          draftEntitiesRef.current,
          draftPicksRef.current,
        )

      let draftedEntityName: string | null = null
      const matchingEntity = draftEntitiesRef.current.find((entity) => {
        if (winner.type === 'person') {
          if (entity.type !== 'person' || entity.name !== winner.name) return false
          const noms = entity.nominations as Array<{ category_id?: number }>
          if (!Array.isArray(noms) || noms.length === 0) return true
          return noms.some((n) => n.category_id === rw.category_id)
        } else {
          const filmTitle = winner.film_name || winner.name
          return entity.type === 'film' && entity.film_name === filmTitle
        }
      })
      if (matchingEntity) {
        draftedEntityName =
          matchingEntity.type === 'film' ? matchingEntity.film_name : matchingEntity.name
      }

      const playerImpacts: PlayerImpact[] = playersRef.current.map((player) => {
        const confPick = confidencePicksRef.current.find(
          (p) => p.player_id === player.id && p.category_id === rw.category_id,
        )
        const confidenceCorrect = confPick ? confPick.nominee_id === rw.winner_id : false
        const confidenceDelta = confidenceCorrect ? confPick!.confidence : 0
        const pickedNominee = confPick
          ? nomineesRef.current.find((n) => n.id === confPick.nominee_id)
          : null
        const draftDelta = draftWinnerId === player.id ? draftPoints : 0

        return {
          playerId: player.id,
          playerName: player.name,
          avatarId: player.avatar_id,
          confidenceDelta,
          confidencePickedName: pickedNominee?.name ?? null,
          confidenceCorrect,
          draftDelta,
          draftedEntityName: draftDelta > 0 ? draftedEntityName : null,
        }
      })

      setWinnerEntries((prev) => [
        {
          kind: 'winner',
          categoryId: cat.id,
          categoryName: cat.name,
          categoryTier: cat.tier,
          categoryPoints: cat.points,
          winnerName: winner.name,
          winnerFilm: winner.film_name,
          time: now,
          playerImpacts,
        },
        ...prev,
      ])
    }

    function handleWinnerUndo(categoryId: number) {
      prevCategoriesRef.current.set(categoryId, null)
      setCategories((prev) =>
        prev.map((c) => (c.id === categoryId ? { ...c, winner_id: null } : c)),
      )
      setRecentResults((prev) => prev.filter((r) => r.categoryId !== categoryId))
      setWinnerEntries((prev) => prev.filter((e) => e.categoryId !== categoryId))
    }

    const channel = supabase
      .channel(`scores-room-winners:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'room_winners',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => handleWinnerSet(payload.new as RoomWinnerRow),
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'room_winners',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => handleWinnerSet(payload.new as RoomWinnerRow),
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'room_winners',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const rw = payload.old as Partial<RoomWinnerRow>
          if (rw.category_id != null) handleWinnerUndo(rw.category_id)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId])

  // ── Subscribe to bingo_marks (approval status changes) ────────────────────

  useEffect(() => {
    if (!roomId) return

    const channel = supabase
      .channel(`scores-bingo:${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bingo_marks' },
        (payload) => {
          const m = payload.new as BingoMarkRow
          // Only track marks for cards in this room
          setBingoCards((currentCards) => {
            if (!currentCards.some((c) => c.id === m.card_id)) return currentCards
            setBingoMarks((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
            return currentCards
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bingo_marks' },
        (payload) => {
          const m = payload.new as BingoMarkRow
          setBingoMarks((prev) => prev.map((x) => (x.id === m.id ? m : x)))
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'bingo_marks' },
        (payload) => {
          const deletedId = (payload.old as Partial<BingoMarkRow>).id
          if (deletedId) setBingoMarks((prev) => prev.filter((x) => x.id !== deletedId))
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId])

  // ── Subscribe to confidence_picks (is_correct updates) ────────────────────

  useEffect(() => {
    if (!roomId) return

    const channel = supabase
      .channel(`scores-confidence:${roomId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'confidence_picks',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const updated = payload.new as ConfidencePickRow
          setConfidencePicks((prev) =>
            prev.map((p) => (p.id === updated.id ? updated : p)),
          )
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId])

  // ── Compute bingo scores per player ────────────────────────────────────────

  const bingoScores = new Map<string, number>()
  players.forEach((player) => {
    const card = bingoCards.find((c) => c.player_id === player.id)
    if (!card) return

    const playerMarks = bingoMarks.filter((m) => m.card_id === card.id)
    const approvedIndices = new Set<number>()
    playerMarks
      .filter((m) => m.status === 'approved')
      .forEach((m) => approvedIndices.add(m.square_index))

    const { lines } = checkBingo(approvedIndices)
    const score = computeBingoScore(
      countBingos(lines),
      isBlackout(approvedIndices),
      approvedIndices.size, // each approved square = 1pt
    )
    bingoScores.set(player.id, score)
  })

  const leaderboard = computeLeaderboard(
    players,
    confidencePicks,
    draftPicks,
    draftEntities,
    categories,
    nominees,
    bingoScores,
  )

  // ── Lead change detection ──────────────────────────────────────────────────
  //
  // Watches the top player ID. When it changes (and we're not in initial load),
  // appends a lead-change entry to the feed.

  const topPlayerId = leaderboard.length > 0 ? leaderboard[0].player.id : null
  const prevLeaderIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (isLoading || !topPlayerId) {
      prevLeaderIdRef.current = topPlayerId
      return
    }
    if (
      prevLeaderIdRef.current !== null &&
      prevLeaderIdRef.current !== topPlayerId
    ) {
      const topPlayer = leaderboard[0]
      setLeadChanges((prev) => [
        ...prev,
        {
          kind: 'lead-change',
          leaderId: topPlayerId,
          leaderName: topPlayer.player.name,
          leaderAvatarId: topPlayer.player.avatar_id,
          totalScore: topPlayer.totalScore,
          time: new Date(),
        },
      ])
    }
    prevLeaderIdRef.current = topPlayerId
  }, [topPlayerId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Merge and sort all feed events newest-first
  const activityFeed: FeedEvent[] = [...winnerEntries, ...leadChanges].sort(
    (a, b) => b.time.getTime() - a.time.getTime(),
  )

  return {
    leaderboard,
    recentResults,
    activityFeed,
    categories,
    nominees,
    confidencePicks,
    draftPicks,
    draftEntities,
    isLoading,
  }
}
