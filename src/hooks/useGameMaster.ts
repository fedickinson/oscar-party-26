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
 * SCOPING CAVEAT
 * `categories` is a global table with no room_id, so GM-authored events are
 * visible to every room in the project. That is fine for a single party and is
 * the thing an `event_id` column would fix when this becomes multi-property.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { CategoryRow, NomineeRow, RoomWinnerRow } from '../types/database'

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
  error: string | null
  logEvent: (name: string, points: number, nomineeId: string) => Promise<void>
  undoEvent: (categoryId: number) => Promise<void>
}

/** Point tiers offered in the GM console. Mirrors the seeded category tiers. */
export const GM_POINT_TIERS = [
  { points: 10, label: 'Huge', hint: 'Death, betrayal, a dragon falls' },
  { points: 6, label: 'Solid', hint: 'A real beat, but not the episode' },
  { points: 4, label: 'Flavor', hint: 'A line, a look, a small moment' },
] as const

export function useGameMaster(roomId: string | undefined): GameMasterState {
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [characters, setCharacters] = useState<NomineeRow[]>([])
  const [winners, setWinners] = useState<RoomWinnerRow[]>([])
  /** Category ids this room's players actually staked confidence on. */
  const [stakedCategoryIds, setStakedCategoryIds] = useState<Set<number>>(new Set())
  const [isLoading, setIsLoading] = useState(true)
  const [isLogging, setIsLogging] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Serialises writes so two fast taps can't claim the same category id.
  const writeLock = useRef(false)
  // Wall-clock stamps keyed by category id, for GM-list ordering.
  const stampsRef = useRef<Map<number, number>>(new Map())

  // ── Initial fetch ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!roomId) return
    let cancelled = false

    async function load() {
      const [catRes, nomRes, rwRes, cpRes] = await Promise.all([
        supabase.from('categories').select().order('display_order'),
        supabase.from('nominees').select().order('name'),
        supabase.from('room_winners').select().eq('room_id', roomId!),
        // Which events this room's players bet on. Read from the picks
        // themselves rather than assuming "the seeded 20" — it stays correct if
        // the slate is ever re-seeded, trimmed by a prestige mode, or replaced
        // for a different property.
        supabase.from('confidence_picks').select('category_id').eq('room_id', roomId!),
      ])
      if (cancelled) return

      const cats = (catRes.data ?? []) as CategoryRow[]
      const rws = (rwRes.data ?? []) as RoomWinnerRow[]
      setStakedCategoryIds(
        new Set(((cpRes.data ?? []) as Array<{ category_id: number }>).map((p) => p.category_id)),
      )

      // Seed stamps so events logged before this client mounted still order
      // sensibly — fall back to category id, which is monotonic by construction.
      rws.forEach((rw) => {
        if (!stampsRef.current.has(rw.category_id)) {
          stampsRef.current.set(rw.category_id, rw.category_id)
        }
      })

      setCategories(cats)
      setCharacters((nomRes.data ?? []) as NomineeRow[])
      setWinners(rws)
      setIsLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [roomId])

  // ── Realtime: categories ───────────────────────────────────────────────────
  //
  // The Oscars build never subscribed here because the slate was static. With a
  // GM writing new rows mid-episode, every client needs the inserts or they see
  // a resolved winner attached to an event name they don't have yet.
  //
  // No room filter is possible — categories has no room_id (see scoping caveat).

  useEffect(() => {
    if (!roomId) return

    const channel = supabase
      .channel(`gm-categories:${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'categories' },
        (payload) => {
          const cat = payload.new as CategoryRow
          setCategories((prev) =>
            prev.some((c) => c.id === cat.id) ? prev : [...prev, cat],
          )
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'categories' },
        (payload) => {
          const cat = payload.new as CategoryRow
          setCategories((prev) => prev.map((c) => (c.id === cat.id ? cat : c)))
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'categories' },
        (payload) => {
          const old = payload.old as Partial<CategoryRow>
          if (old.id == null) return
          setCategories((prev) => prev.filter((c) => c.id !== old.id))
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [roomId])

  // ── Realtime: room_winners ─────────────────────────────────────────────────

  useEffect(() => {
    if (!roomId) return

    const upsertLocal = (rw: RoomWinnerRow) => {
      if (!stampsRef.current.has(rw.category_id)) {
        stampsRef.current.set(rw.category_id, Date.now())
      }
      setWinners((prev) => {
        const idx = prev.findIndex((w) => w.category_id === rw.category_id)
        if (idx === -1) return [...prev, rw]
        const next = [...prev]
        next[idx] = rw
        return next
      })
    }

    const channel = supabase
      .channel(`gm-room-winners:${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'room_winners', filter: `room_id=eq.${roomId}` },
        (payload) => upsertLocal(payload.new as RoomWinnerRow),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'room_winners', filter: `room_id=eq.${roomId}` },
        (payload) => upsertLocal(payload.new as RoomWinnerRow),
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'room_winners', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const old = payload.old as Partial<RoomWinnerRow>
          if (old.category_id == null) return
          stampsRef.current.delete(old.category_id)
          setWinners((prev) => prev.filter((w) => w.category_id !== old.category_id))
        },
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [roomId])

  // ── logEvent ───────────────────────────────────────────────────────────────
  //
  // Two writes, in this order:
  //   1. INSERT categories  — the event itself (name + point value)
  //   2. UPSERT room_winners — which character it resolved to
  //
  // Order matters. room_winners.category_id references categories, and every
  // client merges winners onto categories; a winner arriving first would point
  // at a row nobody has.

  const logEvent = useCallback(
    async (name: string, points: number, nomineeId: string) => {
      const trimmed = name.trim()
      if (!roomId || !trimmed || !nomineeId) return
      if (writeLock.current) return

      writeLock.current = true
      setIsLogging(true)
      setError(null)

      try {
        // Claim the next id. categories.id is a plain int with no sequence in
        // the Oscars schema (rows were seeded with explicit ids), so we derive
        // it. Single-GM by design, and the write lock covers double-taps.
        const { data: maxRow, error: maxErr } = await supabase
          .from('categories')
          .select('id')
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (maxErr) throw maxErr

        const nextId = ((maxRow?.id as number | undefined) ?? 0) + 1

        const { data: inserted, error: catErr } = await supabase
          .from('categories')
          .insert({
            id: nextId,
            name: trimmed,
            tier: points >= 10 ? 1 : points >= 6 ? 2 : 3,
            points,
            display_order: nextId,
          })
          .select()
          .single()
        if (catErr) throw catErr

        // Attach the resolved character to the event so any UI that renders a
        // category's nominee slate has something to show.
        const { error: cnErr } = await supabase
          .from('category_nominees')
          .insert({ category_id: nextId, nominee_id: nomineeId })
        if (cnErr) throw cnErr

        // No explicit onConflict — matches useAdmin.setWinner and
        // useSpotlight.confirmSpotlightWinner, which rely on the table's
        // primary key as the conflict target.
        const { error: rwErr } = await supabase
          .from('room_winners')
          .upsert({ room_id: roomId, category_id: nextId, winner_id: nomineeId, tie_winner_id: null })
        if (rwErr) throw rwErr

        // Optimistic local apply — realtime will echo, and both paths dedupe.
        stampsRef.current.set(nextId, Date.now())
        setCategories((prev) =>
          prev.some((c) => c.id === nextId) ? prev : [...prev, inserted as CategoryRow],
        )
        setWinners((prev) =>
          prev.some((w) => w.category_id === nextId)
            ? prev
            : [...prev, { room_id: roomId, category_id: nextId, winner_id: nomineeId, tie_winner_id: null }],
        )
      } catch (e) {
        console.error('logEvent failed:', e)
        setError(e instanceof Error ? e.message : 'Could not log that event.')
      } finally {
        writeLock.current = false
        setIsLogging(false)
      }
    },
    [roomId],
  )

  // ── undoEvent ──────────────────────────────────────────────────────────────
  //
  // Removes the resolution and the event row. Deleting the category is what
  // makes this a true undo rather than an unresolved event lingering in every
  // client's list.

  const undoEvent = useCallback(
    async (categoryId: number) => {
      if (!roomId) return
      setError(null)
      try {
        await supabase
          .from('room_winners')
          .delete()
          .eq('room_id', roomId)
          .eq('category_id', categoryId)

        await supabase.from('category_nominees').delete().eq('category_id', categoryId)
        await supabase.from('categories').delete().eq('id', categoryId)

        stampsRef.current.delete(categoryId)
        setWinners((prev) => prev.filter((w) => w.category_id !== categoryId))
        setCategories((prev) => prev.filter((c) => c.id !== categoryId))
      } catch (e) {
        console.error('undoEvent failed:', e)
        setError(e instanceof Error ? e.message : 'Could not undo that event.')
      }
    },
    [roomId],
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
    error,
    logEvent,
    undoEvent,
  }
}
