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
 *   - categories INSERT + room_winners changes: declared facts and undo. Triggers re-score.
 *   - confidence_picks UPDATE: fires when is_correct changes (set by useAdmin).
 *     Filtered by room_id so we only receive this room's picks.
 *   - bingo_marks changes: filtered against this room's loaded cards in callbacks.
 *   All three channels subscribe before hydration; events overlapping the fetch
 *   advance a revision and force the snapshot to retry.
 *
 * RECENT RESULTS:
 *   Tracked by comparing category states before/after each update.
 *   When winner_id transitions null → uuid: a new RecentResult is prepended.
 *   When winner_id is cleared (undo): that result is removed.
 *   Capped at 10 entries.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useGame } from '../context/GameContext'
import { computeLeaderboard, findDraftPointsForWinner } from '../lib/scoring'
import { computeConvictionPortfolioScores } from '../lib/conviction'
import { computePlayerBingoScores } from '../lib/bingo-utils'
import { buildCanonicalRoomRecord } from '../lib/room-record'
import { categoryScopeFilter, isCategoryInRoomCatalog } from '../lib/catalog-scope'
import { fetchAllRows } from './fetch-all-rows'
import type { ScoredPlayer } from '../lib/scoring'
import type {
  BingoCardRow,
  BingoMarkRow,
  BingoSquareRow,
  CategoryRow,
  NomineeRow,
  ConfidencePickRow,
  ConvictionPickRow,
  DraftPickRow,
  DraftEntityRow,
  PlayerRow,
  RoomWinnerRow,
  RoomSettlementRow,
  RoomSettlementEntryRow,
  RoomSettlementBingoMarkRow,
} from '../types/database'

export interface RecentResult {
  categoryId: number
  categoryName: string
  categoryPoints: number
  winnerName: string
  winnerFilm: string
  /** Second winner name when there is a tie */
  tieWinnerName: string | null
  /** Second winner film when there is a tie */
  tieWinnerFilm: string | null
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
  /** Second winner name when there is a tie */
  tieWinnerName: string | null
  /** Second winner film when there is a tie */
  tieWinnerFilm: string | null
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
  convictionPicks: ConvictionPickRow[]
  draftPicks: DraftPickRow[]
  draftEntities: DraftEntityRow[]
  bingoCards: BingoCardRow[]
  bingoMarks: BingoMarkRow[]
  bingoSquares: BingoSquareRow[]
  recordSource: 'live' | 'settled'
  recordError: string | null
  /** Bingo line counts per player ID — used for badge notifications */
  playerBingoCounts: Map<string, number>
  isLoading: boolean
}

export function useScores(
  roomId: string | undefined,
  activeSettlementId: string | null | undefined = null,
): ScoresState {
  const { players, room } = useGame()

  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [nominees, setNominees] = useState<NomineeRow[]>([])
  const [confidencePicks, setConfidencePicks] = useState<ConfidencePickRow[]>([])
  const [convictionPicks, setConvictionPicks] = useState<ConvictionPickRow[]>([])
  const [draftPicks, setDraftPicks] = useState<DraftPickRow[]>([])
  const [draftEntities, setDraftEntities] = useState<DraftEntityRow[]>([])
  const [bingoCards, setBingoCards] = useState<BingoCardRow[]>([])
  const [bingoMarks, setBingoMarks] = useState<BingoMarkRow[]>([])
  /** The static 75-square pool. Only its tier data is used, for square points. */
  const [bingoSquares, setBingoSquares] = useState<BingoSquareRow[]>([])
  const [recentResults, setRecentResults] = useState<RecentResult[]>([])
  const [winnerEntries, setWinnerEntries] = useState<WinnerFeedEntry[]>([])
  const [leadChanges, setLeadChanges] = useState<LeadChangeFeedEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [recordSource, setRecordSource] = useState<'live' | 'settled'>('live')
  const [recordError, setRecordError] = useState<string | null>(null)
  const [liveSubscriptionsReady, setLiveSubscriptionsReady] = useState({
    roomId: null as string | null,
    winners: false,
    bingo: false,
    confidence: false,
    conviction: false,
  })
  const liveRevisionRef = useRef(0)

  // Refs kept in sync with state so subscription callbacks read fresh values
  // without stale closure issues
  const nomineesRef = useRef<NomineeRow[]>([])
  const confidencePicksRef = useRef<ConfidencePickRow[]>([])
  const convictionPicksRef = useRef<ConvictionPickRow[]>([])
  const draftPicksRef = useRef<DraftPickRow[]>([])
  const draftEntitiesRef = useRef<DraftEntityRow[]>([])
  const categoriesRef = useRef<CategoryRow[]>([])
  const playersRef = useRef<PlayerRow[]>([])

  useEffect(() => { nomineesRef.current = nominees }, [nominees])
  useEffect(() => { confidencePicksRef.current = confidencePicks }, [confidencePicks])
  useEffect(() => { convictionPicksRef.current = convictionPicks }, [convictionPicks])
  useEffect(() => { draftPicksRef.current = draftPicks }, [draftPicks])
  useEffect(() => { draftEntitiesRef.current = draftEntities }, [draftEntities])
  useEffect(() => { categoriesRef.current = categories }, [categories])
  useEffect(() => { playersRef.current = players }, [players])

  // Track the complete winner identity so tie-only changes are not discarded.
  const prevCategoriesRef = useRef<Map<number, {
    winnerId: string | null
    tieWinnerId: string | null
  }>>(new Map())

  // ── Initial data load ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!roomId || !room) return
    const subscriptionsReady = activeSettlementId != null || (
      liveSubscriptionsReady.roomId === roomId
      && liveSubscriptionsReady.winners
      && liveSubscriptionsReady.bingo
      && liveSubscriptionsReady.confidence
      && liveSubscriptionsReady.conviction
    )
    if (!subscriptionsReady) return

    let cancelled = false
    setIsLoading(true)
    setRecordError(null)

    const inactiveSettlementId = '00000000-0000-0000-0000-000000000000'

    void (async () => {
      while (!cancelled) {
        const revisionAtStart = liveRevisionRef.current
        const [catRes, nomRes, cpRes, convictionRes, dpRes, deRes, bcRes, rwRes, bsRes, settlementRes, entryRes, settledMarkRes] = await Promise.all([
          fetchAllRows<CategoryRow>((from, to) => supabase
            .from('categories').select().or(categoryScopeFilter(room))
            .order('display_order').order('id').range(from, to)),
          fetchAllRows<NomineeRow>((from, to) => supabase
            .from('nominees').select().eq('show_pack_id', room.show_pack_id).order('id').range(from, to)),
          fetchAllRows<ConfidencePickRow>((from, to) => supabase
            .from('confidence_picks').select().eq('room_id', roomId).order('id').range(from, to)),
          fetchAllRows<ConvictionPickRow>((from, to) => supabase
            .from('conviction_picks').select().eq('room_id', roomId)
            .order('player_id').order('beat_id').range(from, to)),
          fetchAllRows<DraftPickRow>((from, to) => supabase
            .from('draft_picks').select().eq('room_id', roomId).order('id').range(from, to)),
          fetchAllRows<DraftEntityRow>((from, to) => supabase
            .from('draft_entities').select().eq('show_pack_id', room.show_pack_id).order('id').range(from, to)),
          fetchAllRows<BingoCardRow>((from, to) => supabase
            .from('bingo_cards').select().eq('room_id', roomId).order('id').range(from, to)),
          fetchAllRows<RoomWinnerRow>((from, to) => supabase
            .from('room_winners').select().eq('room_id', roomId).order('category_id').range(from, to)),
          // Needed for tier points — a marked chaos square is worth 5x a likely one
          fetchAllRows<BingoSquareRow>((from, to) => supabase
            .from('bingo_squares').select().eq('show_pack_id', room.show_pack_id).order('id').range(from, to)),
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
        const firstError = [catRes, nomRes, cpRes, convictionRes, dpRes, deRes, bcRes, rwRes, bsRes, settlementRes, entryRes, settledMarkRes]
          .find((result) => result.error)?.error
        if (firstError) throw firstError
        if (cancelled) return

        let liveMarks: BingoMarkRow[] = []
        if (bcRes.data && bcRes.data.length > 0) {
          const cardIds = bcRes.data.map((card) => card.id)
          const { data: markData, error: markError } = await fetchAllRows<BingoMarkRow>((from, to) => supabase
            .from('bingo_marks').select().in('card_id', cardIds)
            .order('card_id').order('square_index').order('id').range(from, to))
          if (markError) throw markError
          liveMarks = (markData ?? []) as BingoMarkRow[]
        }
        if (cancelled) return
        if (activeSettlementId == null && liveRevisionRef.current !== revisionAtStart) continue

        const record = buildCanonicalRoomRecord({
          activeSettlementId: activeSettlementId ?? null,
          categories: (catRes.data ?? []) as CategoryRow[],
          roomWinners: (rwRes.data ?? []) as RoomWinnerRow[],
          confidencePicks: (cpRes.data ?? []) as ConfidencePickRow[],
          bingoMarks: liveMarks,
          settlements: (settlementRes.data ?? []) as RoomSettlementRow[],
          settlementEntries: (entryRes.data ?? []) as RoomSettlementEntryRow[],
          settlementBingoMarks: (settledMarkRes.data ?? []) as RoomSettlementBingoMarkRow[],
        })
        const loadedNominees = (nomRes.data ?? []) as NomineeRow[]
        const loadedDraftPicks = (dpRes.data ?? []) as DraftPickRow[]
        const loadedDraftEntities = (deRes.data ?? []) as DraftEntityRow[]

        setCategories(record.categories)
        categoriesRef.current = record.categories
        prevCategoriesRef.current = new Map(
          record.categories.map((category) => [category.id, {
            winnerId: category.winner_id,
            tieWinnerId: category.tie_winner_id,
          }]),
        )
        setNominees(loadedNominees)
        nomineesRef.current = loadedNominees
        setConfidencePicks(record.confidencePicks)
        confidencePicksRef.current = record.confidencePicks
        setConvictionPicks((convictionRes.data ?? []) as ConvictionPickRow[])
        convictionPicksRef.current = (convictionRes.data ?? []) as ConvictionPickRow[]
        setDraftPicks(loadedDraftPicks)
        draftPicksRef.current = loadedDraftPicks
        setDraftEntities(loadedDraftEntities)
        draftEntitiesRef.current = loadedDraftEntities
        setBingoCards((bcRes.data ?? []) as BingoCardRow[])
        setBingoMarks(record.bingoMarks)
        setBingoSquares((bsRes.data ?? []) as BingoSquareRow[])
        setRecordSource(record.source)
        setIsLoading(false)
        return
      }
    })().catch((err) => {
      if (cancelled) return
      console.error('useScores initial load failed:', err)
      setRecordError(err instanceof Error ? err.message : 'The room record could not be loaded.')
      setIsLoading(false)
    })

    return () => { cancelled = true }
  }, [roomId, activeSettlementId, room?.show_pack_id, liveSubscriptionsReady])

  // ── Subscribe to room_winners (winner changes scoped to this room) ───────────

  useEffect(() => {
    if (!roomId || !room || activeSettlementId) return

    const currentRoom = room
    let disposed = false
    setLiveSubscriptionsReady((current) => (
      current.roomId === roomId
        ? { ...current, winners: false }
        : { roomId, winners: false, bingo: false, confidence: false, conviction: false }
    ))

    function handleWinnerSet(rw: RoomWinnerRow) {
      const cat = categoriesRef.current.find((c) => c.id === rw.category_id)
      if (!cat) {
        // GM-declared events INSERT brand-new category rows; this hook only
        // fetched categories at mount, so a winner for an unseen category was
        // silently dropped — no announcement overlay, no live leaderboard
        // movement, until someone reloaded. Recover: fetch the row, add it,
        // and re-run with the ref now populated.
        void (async () => {
          const { data } = await supabase
            .from('categories').select().eq('id', rw.category_id).maybeSingle()
          if (!data || !isCategoryInRoomCatalog(data, currentRoom)) return
          if (!categoriesRef.current.some((c) => c.id === data.id)) {
            const merged = { ...data, winner_id: null, tie_winner_id: null }
            categoriesRef.current = [...categoriesRef.current, merged]
            setCategories((prev) => (prev.some((c) => c.id === data.id) ? prev : [...prev, merged]))
          }
          handleWinnerSet(rw)
        })()
        return
      }

      const previous = prevCategoriesRef.current.get(rw.category_id) ?? {
        winnerId: null,
        tieWinnerId: null,
      }

      if (
        rw.winner_id === previous.winnerId
        && rw.tie_winner_id === previous.tieWinnerId
      ) return

      prevCategoriesRef.current.set(rw.category_id, {
        winnerId: rw.winner_id,
        tieWinnerId: rw.tie_winner_id,
      })

      // Update categories state with the per-room winner (including tie)
      categoriesRef.current = categoriesRef.current.map((c) => (
        c.id === rw.category_id
          ? { ...c, winner_id: rw.winner_id, tie_winner_id: rw.tie_winner_id }
          : c
      ))
      setCategories((prev) =>
        prev.map((c) => (c.id === rw.category_id ? { ...c, winner_id: rw.winner_id, tie_winner_id: rw.tie_winner_id } : c)),
      )

      const winner = nomineesRef.current.find((n) => n.id === rw.winner_id)
      if (!winner) return

      const tieWinner = rw.tie_winner_id
        ? nomineesRef.current.find((n) => n.id === rw.tie_winner_id)
        : null

      const now = new Date()

      setRecentResults((prev) =>
        [
          {
            categoryId: cat.id,
            categoryName: cat.name,
            categoryPoints: cat.points,
            winnerName: winner.name,
            winnerFilm: winner.film_name,
            tieWinnerName: tieWinner?.name ?? null,
            tieWinnerFilm: tieWinner?.film_name ?? null,
            announcedAt: now,
          },
          ...prev.filter((result) => result.categoryId !== cat.id),
        ].slice(0, 10),
      )

      // Build per-player impacts for activity feed
      const categoriesWithUpdate = categoriesRef.current.map((c) =>
        c.id === rw.category_id ? { ...c, winner_id: rw.winner_id, tie_winner_id: rw.tie_winner_id } : c,
      )

      // Draft impact for first winner
      const draftWinnerResult = currentRoom.game_model === 'conviction_portfolio'
        ? { playerId: null, points: 0, entityId: null }
        : findDraftPointsForWinner(
        rw.category_id,
        rw.winner_id,
        categoriesWithUpdate,
        nomineesRef.current,
        draftEntitiesRef.current,
        draftPicksRef.current,
      )

      // Draft impact for tie winner (if any)
      const draftTieResult = currentRoom.game_model !== 'conviction_portfolio' && rw.tie_winner_id
        ? findDraftPointsForWinner(
          rw.category_id,
          rw.tie_winner_id,
          categoriesWithUpdate,
          nomineesRef.current,
          draftEntitiesRef.current,
          draftPicksRef.current,
        )
        : { playerId: null, points: 0, entityId: null }

      const draftImpactByPlayer = new Map<string, { points: number; entityNames: string[] }>()
      for (const result of [draftWinnerResult, draftTieResult]) {
        if (!result.playerId || !result.entityId || result.points <= 0) continue
        const entity = draftEntitiesRef.current.find((candidate) => candidate.id === result.entityId)
        if (!entity) continue
        const entityName = entity.type === 'film' ? entity.film_name : entity.name
        const current = draftImpactByPlayer.get(result.playerId) ?? { points: 0, entityNames: [] }
        current.points += result.points
        if (entityName && !current.entityNames.includes(entityName)) current.entityNames.push(entityName)
        draftImpactByPlayer.set(result.playerId, current)
      }

      const playerImpacts: PlayerImpact[] = playersRef.current.map((player) => {
        const convictionOutcome = currentRoom.game_model === 'conviction_portfolio'
          ? computeConvictionPortfolioScores(
              playersRef.current,
              convictionPicksRef.current,
              categoriesWithUpdate.filter((category) => category.id === rw.category_id),
            ).get(player.id)
          : null
        const confPick = confidencePicksRef.current.find(
          (p) => p.player_id === player.id && p.category_id === rw.category_id,
        )
        // In a tie, picks matching EITHER winner are correct
        const confidenceCorrect = convictionOutcome != null
          ? convictionOutcome.correctPickCount > 0
          : confPick
            ? (confPick.nominee_id === rw.winner_id || confPick.nominee_id === rw.tie_winner_id)
            : false
        const confidenceDelta = convictionOutcome?.score ?? (confidenceCorrect ? confPick!.confidence : 0)
        const pickedNominee = confPick
          ? nomineesRef.current.find((n) => n.id === confPick.nominee_id)
          : null
        // Combine draft points from both winners (a player could theoretically draft both entities).
        // The scorer returns the canonical entity id; presentation never re-matches by display name.
        const draftImpact = draftImpactByPlayer.get(player.id)
        const draftDelta = draftImpact?.points ?? 0

        return {
          playerId: player.id,
          playerName: player.name,
          avatarId: player.avatar_id,
          confidenceDelta,
          confidencePickedName: convictionOutcome ? cat.name : (pickedNominee?.name ?? null),
          confidenceCorrect,
          draftDelta,
          draftedEntityName: draftImpact?.entityNames.join(' and ') || null,
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
          tieWinnerName: tieWinner?.name ?? null,
          tieWinnerFilm: tieWinner?.film_name ?? null,
          time: now,
          playerImpacts,
        },
        ...prev.filter((entry) => entry.categoryId !== cat.id),
      ])
    }

    function handleWinnerUndo(categoryId: number) {
      prevCategoriesRef.current.set(categoryId, { winnerId: null, tieWinnerId: null })
      categoriesRef.current = categoriesRef.current.map((c) => (
        c.id === categoryId ? { ...c, winner_id: null, tie_winner_id: null } : c
      ))
      setCategories((prev) =>
        prev.map((c) => (c.id === categoryId ? { ...c, winner_id: null, tie_winner_id: null } : c)),
      )
      setRecentResults((prev) => prev.filter((r) => r.categoryId !== categoryId))
      setWinnerEntries((prev) => prev.filter((e) => e.categoryId !== categoryId))
    }

    const channel = supabase
      .channel(`scores-room-winners:${roomId}`)
      // GM-declared events are brand-new category rows (the Oscars only ever
      // UPDATEd seeded ones). Without this, phones already on Live never learn
      // a declaration exists: no overlay, no leaderboard movement. Cannot be
      // expressed as a Realtime OR filter, so reject rows outside this room's
      // authored pack or room-scoped declaration ledger in the callback.
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'categories' },
        (payload) => {
          const cat = payload.new as CategoryRow
          if (!isCategoryInRoomCatalog(cat, currentRoom)) return
          liveRevisionRef.current += 1
          if (categoriesRef.current.some((c) => c.id === cat.id)) return
          const merged = { ...cat, winner_id: null, tie_winner_id: null }
          categoriesRef.current = [...categoriesRef.current, merged]
          setCategories((prev) => (prev.some((c) => c.id === cat.id) ? prev : [...prev, merged]))
          // Its winner may have landed first and been dropped — check.
          void supabase
            .from('room_winners').select().eq('room_id', roomId!).eq('category_id', cat.id).maybeSingle()
            .then(({ data }) => { if (data) handleWinnerSet(data as RoomWinnerRow) })
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'categories' },
        (payload) => {
          const categoryId = (payload.old as Partial<CategoryRow>).id
          if (categoryId == null) return
          const category = categoriesRef.current.find((candidate) => candidate.id === categoryId)
          if (!category || category.room_id !== roomId) return
          liveRevisionRef.current += 1
          categoriesRef.current = categoriesRef.current.filter((candidate) => candidate.id !== categoryId)
          prevCategoriesRef.current.delete(categoryId)
          setCategories((prev) => prev.filter((candidate) => candidate.id !== categoryId))
          setRecentResults((prev) => prev.filter((result) => result.categoryId !== categoryId))
          setWinnerEntries((prev) => prev.filter((entry) => entry.categoryId !== categoryId))
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'room_winners',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          liveRevisionRef.current += 1
          handleWinnerSet(payload.new as RoomWinnerRow)
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'room_winners',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          liveRevisionRef.current += 1
          handleWinnerSet(payload.new as RoomWinnerRow)
        },
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
          liveRevisionRef.current += 1
          const rw = payload.old as Partial<RoomWinnerRow>
          if (rw.category_id != null) handleWinnerUndo(rw.category_id)
        },
      )
      .subscribe((status) => {
        if (disposed) return
        if (status === 'SUBSCRIBED') {
          setLiveSubscriptionsReady((current) => (
            current.roomId === roomId
              ? { ...current, winners: true }
              : { roomId, winners: true, bingo: false, confidence: false, conviction: false }
          ))
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setRecordError('The winner feed could not connect to Realtime.')
          setIsLoading(false)
        }
      })

    return () => {
      disposed = true
      supabase.removeChannel(channel)
    }
  }, [roomId, activeSettlementId, room?.show_pack_id, room?.game_model])

  // ── Subscribe to bingo_marks (approval status changes) ────────────────────

  useEffect(() => {
    if (!roomId || activeSettlementId) return

    let disposed = false
    setLiveSubscriptionsReady((current) => (
      current.roomId === roomId
        ? { ...current, bingo: false }
        : { roomId, winners: false, bingo: false, confidence: false, conviction: false }
    ))

    const channel = supabase
      .channel(`scores-bingo:${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bingo_marks' },
        (payload) => {
          liveRevisionRef.current += 1
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
          liveRevisionRef.current += 1
          const m = payload.new as BingoMarkRow
          setBingoMarks((prev) => prev.map((x) => (x.id === m.id ? m : x)))
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'bingo_marks' },
        (payload) => {
          liveRevisionRef.current += 1
          const deletedId = (payload.old as Partial<BingoMarkRow>).id
          if (deletedId) setBingoMarks((prev) => prev.filter((x) => x.id !== deletedId))
        },
      )
      .subscribe((status) => {
        if (disposed) return
        if (status === 'SUBSCRIBED') {
          setLiveSubscriptionsReady((current) => (
            current.roomId === roomId
              ? { ...current, bingo: true }
              : { roomId, winners: false, bingo: true, confidence: false, conviction: false }
          ))
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setRecordError('The bingo feed could not connect to Realtime.')
          setIsLoading(false)
        }
      })

    return () => {
      disposed = true
      supabase.removeChannel(channel)
    }
  }, [roomId, activeSettlementId])

  // ── Subscribe to confidence_picks (is_correct updates) ────────────────────

  useEffect(() => {
    if (!roomId || activeSettlementId) return

    let disposed = false
    setLiveSubscriptionsReady((current) => (
      current.roomId === roomId
        ? { ...current, confidence: false }
        : { roomId, winners: false, bingo: false, confidence: false, conviction: false }
    ))

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
          liveRevisionRef.current += 1
          const updated = payload.new as ConfidencePickRow
          setConfidencePicks((prev) =>
            prev.map((p) => (p.id === updated.id ? updated : p)),
          )
        },
      )
      .subscribe((status) => {
        if (disposed) return
        if (status === 'SUBSCRIBED') {
          setLiveSubscriptionsReady((current) => (
            current.roomId === roomId
              ? { ...current, confidence: true }
              : { roomId, winners: false, bingo: false, confidence: true, conviction: false }
          ))
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setRecordError('The confidence feed could not connect to Realtime.')
          setIsLoading(false)
        }
      })

    return () => {
      disposed = true
      supabase.removeChannel(channel)
    }
  }, [roomId, activeSettlementId])

  // Conviction choices freeze before Live, but the channel still establishes
  // readiness before hydration so a phase-boundary write cannot be missed.
  useEffect(() => {
    if (!roomId || activeSettlementId) return
    let disposed = false
    setLiveSubscriptionsReady((current) => (
      current.roomId === roomId
        ? { ...current, conviction: false }
        : { roomId, winners: false, bingo: false, confidence: false, conviction: false }
    ))

    const upsert = (row: ConvictionPickRow) => {
      const key = `${row.player_id}:${row.beat_id}`
      setConvictionPicks((current) => {
        const next = current.some((pick) => `${pick.player_id}:${pick.beat_id}` === key)
          ? current.map((pick) => `${pick.player_id}:${pick.beat_id}` === key ? row : pick)
          : [...current, row]
        convictionPicksRef.current = next
        return next
      })
    }
    const channel = supabase.channel(`scores-conviction:${roomId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'conviction_picks', filter: `room_id=eq.${roomId}`,
      }, (payload) => {
        if (disposed) return
        liveRevisionRef.current += 1
        upsert(payload.new as ConvictionPickRow)
      })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'conviction_picks', filter: `room_id=eq.${roomId}`,
      }, (payload) => {
        if (disposed) return
        const old = payload.old as Partial<ConvictionPickRow>
        if (!old.player_id || old.beat_id == null) return
        liveRevisionRef.current += 1
        setConvictionPicks((current) => {
          const next = current.filter((pick) => (
            pick.player_id !== old.player_id || pick.beat_id !== old.beat_id
          ))
          convictionPicksRef.current = next
          return next
        })
      })
      .subscribe((status) => {
        if (disposed) return
        if (status === 'SUBSCRIBED') {
          setLiveSubscriptionsReady((current) => current.roomId === roomId
            ? { ...current, conviction: true }
            : { roomId, winners: false, bingo: false, confidence: false, conviction: true })
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setRecordError('The conviction feed could not connect to Realtime.')
          setIsLoading(false)
        }
      })
    return () => {
      disposed = true
      supabase.removeChannel(channel)
    }
  }, [roomId, activeSettlementId])

  // ── Compute bingo scores per player ────────────────────────────────────────

  const bingoSquaresById = useMemo(
    () => new Map(bingoSquares.map((s) => [s.id, s])),
    [bingoSquares],
  )

  const { scores: bingoScores, counts: playerBingoCounts } = computePlayerBingoScores(
    players,
    bingoCards,
    bingoMarks,
    bingoSquaresById,
  )

  const leaderboard = computeLeaderboard(
    players,
    confidencePicks,
    draftPicks,
    draftEntities,
    categories,
    nominees,
    bingoScores,
    convictionPicks,
    room?.game_model ?? 'legacy_ensemble',
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
    convictionPicks,
    draftPicks,
    draftEntities,
    bingoCards,
    bingoMarks,
    bingoSquares,
    recordSource,
    recordError,
    playerBingoCounts,
    isLoading,
  }
}
