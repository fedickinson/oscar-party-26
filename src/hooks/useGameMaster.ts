/**
 * useGameMaster — the host-as-GM live event log.
 *
 * WHY THIS EXISTS
 * The Oscars build had an externally-supplied event stream: 24 awards, handed
 * out in order, each with a fixed nominee slate. A TV episode has no such
 * structure — it is a continuous narrative, and nothing outside the room knows
 * what "happened". So the host becomes the Game Master: they watch, they type
 * what happened, they assign it to a character, and that becomes canon.
 *
 * THE TRICK
 * We do NOT introduce a parallel event system. A GM event is written as a
 * normal `categories` row plus a `room_winners` row — exactly the shape the
 * app already produces when a host announces an award. Downstream, nothing can
 * tell the difference, so all of this keeps working untouched:
 *
 *   - the scoring cascade + leaderboard   (useScores)
 *   - the results feed and score timeline (ResultsFeed, timeline-utils)
 *   - turning points, share cards, recap  (TurningPoints, useShareResults)
 *   - AI companion reactions              (useAICompanions diffs new winners)
 *
 * So `categories` stops being a fixed slate and becomes an append-only event
 * log. Seeded events still exist — they are quick-picks, not a required set.
 *
 * TRUST MODEL
 * Only the host writes here. Players cannot log events, by design: a shared
 * free-text log that feeds a scoreboard is trivially griefable. The intended
 * next step is a proposal queue — players suggest, host one-taps to accept —
 * reusing the pending/approved/denied mechanism that bingo marks already have.
 *
 * SCOPING
 * Authored predictions belong to the room's immutable show pack. GM-authored
 * declarations belong to this room. The database rejects a winner, pick, card
 * or beat that crosses that boundary.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useGame } from '../context/GameContext'
import { categoryScopeFilter, isCategoryInRoomCatalog } from '../lib/catalog-scope'
import { deriveRefereeAuthority } from '../lib/referee-authority'
import type {
  CategoryRow,
  NomineeRow,
  RoomWinnerRow,
  TriggerContractRow,
} from '../types/database'

export interface GameMasterEventSource {
  sourceSignatureBeatId: number
  triggerContract: TriggerContractRow
}

interface DeclareRoomEventResult {
  category: CategoryRow
  winner: RoomWinnerRow
  announcement: string
}

/** A logged event: the category row plus who it resolved to. */
export interface GameMasterEvent {
  category: CategoryRow
  /** Resolved character, or null if the row exists but has no winner yet. */
  nominee: NomineeRow | null
  /** Wall-clock ordering for the GM's own undo list. */
  loggedAt: number
}

export interface GameMasterState {
  /** Events this room has logged, most recent first. */
  events: GameMasterEvent[]
  /** Every seeded/known event name, for quick-pick buttons. */
  quickPicks: CategoryRow[]
  /** All draftable characters, for the assign-to picker. */
  characters: NomineeRow[]
  /**
   * Events players staked confidence on that the host has not resolved yet.
   *
   * WHY THE HOST HAS TO SEE THIS BEFORE ENDING:
   * Seeded events are quick-picks, not a required set — the host is free to
   * narrate whatever the episode actually gives them and never touch half the
   * list. That is correct for the draft, which only ever pays out on events
   * that happen.
   *
   * It is NOT correct for confidence. Every player spent a fixed budget across
   * all 20 seeded events before the episode started, and an event the host
   * never resolves pays nobody. A player who staked their 20 on "Whose Dragon
   * Falls" and watched a dragon fall loses those points to an unlogged event,
   * not to a bad read — and they have no way to know that is why they lost.
   *
   * So this is the one thing worth interrupting the host for at the end.
   */
  unresolvedPredictionEvents: CategoryRow[]
  isLoading: boolean
  isLogging: boolean
  canReferee: boolean
  authorityMessage: string | null
  error: string | null
  logEvent: (
    name: string,
    points: number,
    nomineeId: string,
    source?: GameMasterEventSource,
  ) => Promise<void>
  undoEvent: (categoryId: number) => Promise<void>
}

/** Point tiers offered in the GM console. Mirrors the seeded category tiers. */
export const GM_POINT_TIERS = [
  { points: 10, label: 'Huge', hint: 'Death, betrayal, a dragon falls' },
  { points: 6, label: 'Solid', hint: 'A real beat, but not the episode' },
  { points: 4, label: 'Flavor', hint: 'A line, a look, a small moment' },
] as const

export function useGameMaster(
  roomId: string | undefined,
  operatorCapability: string | null,
  operatorCapabilityLoading: boolean,
): GameMasterState {
  const { room, player } = useGame()
  const refereeAuthority = deriveRefereeAuthority({
    isHost: player?.is_host ?? false,
    capability: operatorCapability,
    capabilityLoading: operatorCapabilityLoading,
  })
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [characters, setCharacters] = useState<NomineeRow[]>([])
  const [winners, setWinners] = useState<RoomWinnerRow[]>([])
  /** Category ids this room's players actually staked confidence on. */
  const [stakedCategoryIds, setStakedCategoryIds] = useState<Set<number>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [isLogging, setIsLogging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [realtimeReadyRoomId, setRealtimeReadyRoomId] = useState<string | null>(null)

  // Serialises writes so two fast taps can't claim the same category id.
  const writeLock = useRef(false)
  // Wall-clock stamps keyed by category id, for GM-list ordering.
  const stampsRef = useRef<Map<number, number>>(new Map())
  // Any mutable-row event overlapping hydration invalidates that snapshot.
  const liveRevisionRef = useRef(0)

  // ── Realtime ───────────────────────────────────────────────────────────────
  //
  // Categories and room winners form one live declaration ledger. Keep them on
  // one channel so a single readiness barrier proves both subscriptions are
  // active before hydration starts. Realtime cannot express the pack-or-room
  // category filter, so callbacks apply the canonical catalog predicate.

  useEffect(() => {
    if (!roomId || !room) return
    const currentRoom = room
    let disposed = false
    setRealtimeReadyRoomId(null)
    setIsLoading(true)
    setError(null)
    setCategories([])
    setCharacters([])
    setWinners([])
    setStakedCategoryIds(new Set())
    stampsRef.current = new Map()

    const upsertLocalWinner = (rw: RoomWinnerRow) => {
      if (!stampsRef.current.has(rw.category_id)) {
        stampsRef.current.set(rw.category_id, Date.now())
      }
      setWinners((prev) => {
        const idx = prev.findIndex((winner) => winner.category_id === rw.category_id)
        if (idx === -1) return [...prev, rw]
        const next = [...prev]
        next[idx] = rw
        return next
      })
    }

    const channel = supabase
      .channel(`gm-ledger:${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'categories' },
        (payload) => {
          if (disposed) return
          liveRevisionRef.current += 1
          const cat = payload.new as CategoryRow
          if (!isCategoryInRoomCatalog(cat, currentRoom)) return
          setCategories((prev) =>
            prev.some((c) => c.id === cat.id) ? prev : [...prev, cat],
          )
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'categories' },
        (payload) => {
          if (disposed) return
          liveRevisionRef.current += 1
          const cat = payload.new as CategoryRow
          setCategories((prev) => {
            if (!isCategoryInRoomCatalog(cat, currentRoom)) {
              return prev.filter((candidate) => candidate.id !== cat.id)
            }
            return prev.some((candidate) => candidate.id === cat.id)
              ? prev.map((candidate) => (candidate.id === cat.id ? cat : candidate))
              : [...prev, cat]
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'categories' },
        (payload) => {
          if (disposed) return
          liveRevisionRef.current += 1
          const old = payload.old as Partial<CategoryRow>
          if (old.id == null) return
          setCategories((prev) => prev.filter((c) => c.id !== old.id))
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'room_winners', filter: `room_id=eq.${roomId}` },
        (payload) => {
          if (disposed) return
          liveRevisionRef.current += 1
          upsertLocalWinner(payload.new as RoomWinnerRow)
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'room_winners', filter: `room_id=eq.${roomId}` },
        (payload) => {
          if (disposed) return
          liveRevisionRef.current += 1
          upsertLocalWinner(payload.new as RoomWinnerRow)
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'room_winners', filter: `room_id=eq.${roomId}` },
        (payload) => {
          if (disposed) return
          liveRevisionRef.current += 1
          const old = payload.old as Partial<RoomWinnerRow>
          if (old.category_id == null) return
          stampsRef.current.delete(old.category_id)
          setWinners((prev) => prev.filter((w) => w.category_id !== old.category_id))
        },
      )
      .subscribe((status) => {
        if (disposed) return
        if (status === 'SUBSCRIBED') {
          setRealtimeReadyRoomId(roomId)
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setRealtimeReadyRoomId(null)
          setError('The declaration feed could not connect to Realtime.')
          setIsLoading(false)
        }
      })

    return () => {
      disposed = true
      supabase.removeChannel(channel)
    }
  }, [roomId, room?.show_pack_id])

  // ── Initial hydration ──────────────────────────────────────────────────────
  //
  // Fetch only after the complete declaration feed is live. If a callback or
  // optimistic host write overlaps the fetch, its revision changes and this
  // snapshot is discarded; the next pass reads the new canonical ledger.

  useEffect(() => {
    if (!roomId || !room || realtimeReadyRoomId !== roomId) return
    const currentRoom = room
    let cancelled = false

    setIsLoading(true)
    setError(null)

    void (async () => {
      while (!cancelled) {
        const revisionAtStart = liveRevisionRef.current
        const [catRes, nomRes, rwRes, cpRes] = await Promise.all([
          supabase.from('categories').select().or(categoryScopeFilter(currentRoom)).order('display_order'),
          supabase.from('nominees').select().eq('show_pack_id', currentRoom.show_pack_id).order('name'),
          supabase.from('room_winners').select().eq('room_id', roomId),
          // Read the actual picks rather than assuming a fixed authored slate.
          supabase.from('confidence_picks').select('category_id').eq('room_id', roomId),
        ])
        const firstError = [catRes, nomRes, rwRes, cpRes].find((result) => result.error)?.error
        if (firstError) throw firstError
        if (cancelled) return
        if (liveRevisionRef.current !== revisionAtStart) continue

        const cats = (catRes.data ?? []) as CategoryRow[]
        const rws = (rwRes.data ?? []) as RoomWinnerRow[]

        // Preserve real wall-clock stamps from callbacks and optimistic writes;
        // rows only seen in the snapshot fall back to their monotonic id.
        rws.forEach((rw) => {
          if (!stampsRef.current.has(rw.category_id)) {
            stampsRef.current.set(rw.category_id, rw.category_id)
          }
        })

        setCategories(cats)
        setCharacters((nomRes.data ?? []) as NomineeRow[])
        setWinners(rws)
        setStakedCategoryIds(
          new Set(((cpRes.data ?? []) as Array<{ category_id: number }>).map((pick) => pick.category_id)),
        )
        setIsLoading(false)
        return
      }
    })().catch((loadError) => {
      if (cancelled) return
      console.error('useGameMaster initial load failed:', loadError)
      setError(loadError instanceof Error ? loadError.message : 'The declaration ledger could not be loaded.')
      setIsLoading(false)
    })

    return () => { cancelled = true }
  }, [roomId, room?.show_pack_id, realtimeReadyRoomId])

  // ── logEvent ───────────────────────────────────────────────────────────────
  //
  // One capability-gated database transaction owns the room declaration,
  // nominee link, winner and public announcement. The current host seat and
  // current private room bearer are both checked under the room lock.

  const logEvent = useCallback(
    async (
      name: string,
      points: number,
      nomineeId: string,
      source?: GameMasterEventSource,
    ) => {
      const trimmed = name.trim()
      if (!roomId || !player || !trimmed || !nomineeId) return
      if (writeLock.current) return
      if (!refereeAuthority.enabled || !operatorCapability) {
        setError(refereeAuthority.message ?? 'Current host authority is required.')
        return
      }

      writeLock.current = true
      setIsLogging(true)
      setError(null)

      try {
        const { data, error: declarationError } = await supabase.rpc('declare_room_event_authorized', {
          p_room_id: roomId,
          p_name: trimmed,
          p_points: points,
          p_nominee_id: nomineeId,
          p_actor_player_id: player.id,
          p_operator_capability: operatorCapability,
          p_source_signature_beat_id: source?.sourceSignatureBeatId ?? null,
          p_source_trigger_contract: source?.triggerContract ?? null,
        })
        if (declarationError) throw new Error(declarationError.message)
        const result = data as DeclareRoomEventResult | null
        if (!result?.category || !result.winner) {
          throw new Error('Atomic declaration returned an incomplete result')
        }
        const inserted = result.category
        const winner = result.winner
        const nextId = inserted.id

        // Optimistic local apply — realtime will echo, and both paths dedupe.
        liveRevisionRef.current += 1
        stampsRef.current.set(nextId, Date.now())
        setCategories((prev) =>
          prev.some((c) => c.id === nextId) ? prev : [...prev, inserted as CategoryRow],
        )
        setWinners((prev) =>
          prev.some((w) => w.category_id === nextId)
            ? prev
            : [...prev, winner],
        )
      } catch (e) {
        console.error('logEvent failed:', e)
        setError(e instanceof Error ? e.message : 'Could not log that event.')
      } finally {
        writeLock.current = false
        setIsLogging(false)
      }
    },
    [roomId, player, refereeAuthority.enabled, refereeAuthority.message, operatorCapability],
  )

  // ── undoEvent ──────────────────────────────────────────────────────────────
  //
  // One database command removes the resolution and room declaration, then
  // appends a public correction. The transaction owns both outcomes: the room
  // can never see a correction for a fact that failed to leave the ledger.

  const undoEvent = useCallback(
    async (categoryId: number) => {
      if (!roomId || !player || writeLock.current) return
      if (!refereeAuthority.enabled || !operatorCapability) {
        setError(refereeAuthority.message ?? 'Current host authority is required.')
        return
      }
      writeLock.current = true
      setIsLogging(true)
      setError(null)
      try {
        const { error: undoError } = await supabase.rpc('undo_room_declaration_authorized', {
          p_room_id: roomId,
          p_category_id: categoryId,
          p_actor_player_id: player.id,
          p_operator_capability: operatorCapability,
        })
        if (undoError) throw new Error(undoError.message)

        liveRevisionRef.current += 1
        stampsRef.current.delete(categoryId)
        setWinners((prev) => prev.filter((w) => w.category_id !== categoryId))
        setCategories((prev) => prev.filter((c) => c.id !== categoryId))
      } catch (e) {
        console.error('undoEvent failed:', e)
        setError(e instanceof Error ? e.message : 'Could not undo that event.')
      } finally {
        writeLock.current = false
        setIsLogging(false)
      }
    },
    [roomId, player, refereeAuthority.enabled, refereeAuthority.message, operatorCapability],
  )

  // ── Derived ────────────────────────────────────────────────────────────────

  const categoryById = new Map(categories.map((c) => [c.id, c]))
  const nomineeById = new Map(characters.map((n) => [n.id, n]))

  const events: GameMasterEvent[] = winners
    .map((w) => {
      const category = categoryById.get(w.category_id)
      if (!category) return null
      return {
        category,
        nominee: nomineeById.get(w.winner_id) ?? null,
        loggedAt: stampsRef.current.get(w.category_id) ?? w.category_id,
      }
    })
    .filter((e): e is GameMasterEvent => e !== null)
    .sort((a, b) => b.loggedAt - a.loggedAt)

  // Quick-picks are seeded events that haven't been used in this room yet.
  const usedIds = new Set(winners.map((w) => w.category_id))
  const quickPicks = categories
    .filter((c) => !usedIds.has(c.id))
    .sort((a, b) => a.display_order - b.display_order)

  // Staked but unresolved — the subset of quick-picks that will silently void
  // player predictions if the episode ends now. See the interface doc.
  const unresolvedPredictionEvents = quickPicks.filter((c) => stakedCategoryIds.has(c.id))

  return {
    events,
    quickPicks,
    characters,
    unresolvedPredictionEvents,
    isLoading,
    isLogging,
    canReferee: refereeAuthority.enabled,
    authorityMessage: refereeAuthority.message,
    error,
    logEvent,
    undoEvent,
  }
}
