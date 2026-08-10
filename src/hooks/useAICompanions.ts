/**
 * useAICompanions — fires AI chat companion messages in response to game events.
 *
 * Cast: Ned narrates every event; Cersei, Tyrion, Joffrey, Daenerys, Olenna and
 * Arya rotate 2-3 per event. See data/ai-companions.ts.
 * Messages are inserted into the messages table as non-UUID player_ids
 * (see data/ai-companions.ts) and flow through the existing useChat subscription.
 *
 * Four triggers:
 *   1. Pre-ceremony: intro messages when no winners exist yet (mount once)
 *   2. Event reactions: Ned at 0s, then the rotating cast staggered behind him
 *   3. Milestones: 6 events logged, 12 events logged
 *   4. Lead change: when the leaderboard #1 changes
 *
 * Rate limiter: isGeneratingRef prevents overlapping API calls.
 * All data is read from refs at fire time to avoid stale closure issues.
 */

import React, { useEffect, useRef } from 'react'
import { useGame } from '../context/GameContext'
import { supabase } from '../lib/supabase'
import {
  buildBingoReactionPrompt,
  buildPlayerWelcomePrompt,
  buildPreCeremonyPrompt,
  buildShowStartedPrompt,
  buildTeamChangePrompt,
  buildWinnerReactionPrompt,
  buildPreCategoryPrompt,
  buildMilestonePrompt,
  parseCompanionResponse,
  type PlayerPrediction,
} from '../lib/companion-prompts'
import type {
  CategoryRow,
  NomineeRow,
  ConfidencePickRow,
  DraftPickRow,
  DraftEntityRow,
} from '../types/database'
import type { ScoredPlayer } from '../lib/scoring'
import type { StoredPrediction } from '../lib/chat-reactivity-utils'
import { COMPANION_IDS, NARRATOR, PRE_SHOW_COMPANIONS, pickGreeterForHouse } from '../data/ai-companions'
import { getAvatarById } from '../data/avatar-config'
import { buildCategoryContext, buildCeremonyPreamble } from '../lib/ceremony-context'
import { checkBingo } from '../lib/bingo-utils'
import { addPendingCompanion, removePendingCompanion, clearPendingCompanions } from './companionTypingStore'
import type { RealtimeChannel } from '@supabase/supabase-js'

export function useAICompanions(
  categories: CategoryRow[],
  nominees: NomineeRow[],
  confidencePicks: ConfidencePickRow[],
  draftPicks: DraftPickRow[],
  draftEntities: DraftEntityRow[],
  leaderboard: ScoredPlayer[],
  isHost: boolean,
  predictionsRef?: React.MutableRefObject<StoredPrediction[]>,
  showStarted?: boolean,
): { isGenerating: boolean } {
  const { room, players } = useGame()
  const roomIdForBingo = room?.id
  const isHostRef = useRef(isHost)
  isHostRef.current = isHost

  // Tracks delayed companion message timeouts so they can be cancelled on unmount
  const pendingTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([])

  // Broadcast channel — host sends typing events; all clients subscribe in ChatSection
  const broadcastChannelRef = useRef<RealtimeChannel | null>(null)
  useEffect(() => {
    if (!room?.id) return
    const ch = supabase.channel(`room-${room.id}-companion-typing`)
    ch.subscribe()
    broadcastChannelRef.current = ch
    return () => {
      supabase.removeChannel(ch)
      broadcastChannelRef.current = null
    }
  }, [room?.id])

  // ── State in refs to avoid stale closures and unnecessary re-renders ─────────
  const previousWinnersRef = useRef<Set<number>>(new Set())
  const preCategoryFiredRef = useRef<Set<number>>(new Set())
  const milestoneFiredRef = useRef<Set<string>>(new Set())
  const preCeremonyFiredRef = useRef(false)
  const showStartedFiredRef = useRef(false)
  const previousLeaderIdRef = useRef<string | null>(null)
  const dataInitializedRef = useRef(false)
  const prevSpotlightCategoryIdRef = useRef<number | null>(null)

  // Data refs — always current regardless of when async callbacks execute
  const categoriesRef = useRef(categories)
  categoriesRef.current = categories
  const nomineesRef = useRef(nominees)
  nomineesRef.current = nominees
  const confidencePicksRef = useRef(confidencePicks)
  confidencePicksRef.current = confidencePicks
  const draftPicksRef = useRef(draftPicks)
  draftPicksRef.current = draftPicks
  const draftEntitiesRef = useRef(draftEntities)
  draftEntitiesRef.current = draftEntities
  const leaderboardRef = useRef(leaderboard)
  leaderboardRef.current = leaderboard
  const playersRef = useRef(players)
  playersRef.current = players
  const roomRef = useRef(room)
  roomRef.current = room
  const showStartedRef = useRef(showStarted ?? false)
  showStartedRef.current = showStarted ?? false

  // ── Core helpers ──────────────────────────────────────────────────────────────

  async function callClaude(prompt: { system: string; user: string }, maxTokens = 600): Promise<string> {
    const response = await fetch('/api/anthropic/v1/messages', {
      method: 'POST',
      headers: {
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: maxTokens,
        // Thinking is OFF deliberately. On Sonnet 5 an omitted `thinking` field
        // runs adaptive thinking, and max_tokens caps thinking + response text
        // together — at maxTokens=600 that truncates companion banter or
        // returns nothing at all. These are one-liner reactions during a live
        // episode: latency matters, deliberation does not.
        thinking: { type: 'disabled' },
        output_config: { effort: 'low' },
        // SHARED_SYSTEM is ~8.9k tokens and byte-identical on every call — the
        // cast, the five behavioural axes, the spoiler rules. Caching it turns
        // the dominant cost of the evening into a rounding error and, more
        // importantly, cuts time-to-first-token: these fire while people are
        // watching, so latency is the thing that actually shows.
        // 1h TTL, not the 5m default: events are 3-4 minutes apart on average
        // but cluster, and a quiet stretch would otherwise expire the cache.
        system: [
          {
            type: 'text',
            text: prompt.system,
            cache_control: { type: 'ephemeral', ttl: '1h' },
          },
        ],
        messages: [{ role: 'user', content: prompt.user }],
      }),
    })

    if (!response.ok) return ''
    const data = await response.json()
    // Find the first text block rather than indexing content[0] — the response
    // can lead with a non-text block, and a wrong assumption here surfaces as
    // silent empty companion messages.
    const blocks = (data?.content ?? []) as Array<{ type?: string; text?: string }>
    return (blocks.find((b) => b.type === 'text')?.text ?? '') as string
  }

  async function insertCompanionMessage(companionId: string, text: string) {
    const currentRoom = roomRef.current
    if (!currentRoom) return
    await supabase.from('messages').insert({
      room_id: currentRoom.id,
      player_id: companionId,
      text,
    })
  }

  async function insertSystemDivider(text: string) {
    const currentRoom = roomRef.current
    if (!currentRoom || !isHostRef.current) return
    await supabase.from('messages').insert({
      room_id: currentRoom.id,
      player_id: 'system',
      text,
    })
  }

  async function insertWinnerDivider(text: string) {
    const currentRoom = roomRef.current
    if (!currentRoom || !isHostRef.current) return
    await supabase.from('messages').insert({
      room_id: currentRoom.id,
      player_id: 'winner-divider',
      text,
    })
  }

  async function insertFilmLink(filmName: string) {
    const currentRoom = roomRef.current
    if (!currentRoom || !isHostRef.current) return
    await supabase.from('messages').insert({
      room_id: currentRoom.id,
      player_id: 'film-link',
      text: filmName,
    })
  }

  async function fireCompanionMessages(prompt: { system: string; user: string }, maxTokens = 600) {
    if (!isHostRef.current) return
    // The delay-0 message gates all perceived latency: during the pre-show the
    // chat IS the show and generation takes seconds. Show the narrator typing
    // the moment the call goes out — the wait reads as typing, not dead air.
    addPendingCompanion(NARRATOR.id)
    broadcastChannelRef.current?.send({
      type: 'broadcast', event: 'companion_typing',
      payload: { id: NARRATOR.id, typing: true },
    })
    const clearNarratorTyping = () => {
      removePendingCompanion(NARRATOR.id)
      broadcastChannelRef.current?.send({
        type: 'broadcast', event: 'companion_typing',
        payload: { id: NARRATOR.id, typing: false },
      })
    }
    try {
      const raw = await callClaude(prompt, maxTokens)
      clearNarratorTyping()
      if (!raw) return
      const messages = parseCompanionResponse(raw)
      // Delays live in client setTimeouts on the host, and the host tonight is
      // a PHONE — locks, reloads, suspensions all wipe in-flight timers. The
      // 8-minute entrance arc was designed for an always-awake tab; under real
      // phone conditions long delays mostly died and re-fired from zero on the
      // next reload, which is why the chat crawled. Cap the tail: intros still
      // stagger, but everything lands within a plausible awake-window.
      for (const msg of messages) {
        msg.delay_seconds = Math.min(msg.delay_seconds, 90)
      }
      for (const msg of messages) {
        if (msg.delay_seconds === 0) {
          await insertCompanionMessage(msg.companion_id, msg.text)
        } else {
          // Typing indicator appears shortly BEFORE the message, not the instant
          // the batch is scheduled. Intros are now minutes apart, and lighting up
          // every indicator at once would show six people typing simultaneously
          // for eight minutes — which both spoils each arrival and looks broken.
          const typingLeadMs = Math.min(4000, msg.delay_seconds * 1000)
          const startTypingIn = msg.delay_seconds * 1000 - typingLeadMs
          const startTyping = () => {
            addPendingCompanion(msg.companion_id)
            broadcastChannelRef.current?.send({
              type: 'broadcast',
              event: 'companion_typing',
              payload: { id: msg.companion_id, typing: true },
            })
          }
          if (startTypingIn <= 0) startTyping()
          else pendingTimeoutsRef.current.push(setTimeout(startTyping, startTypingIn))

          const tid = setTimeout(() => {
            removePendingCompanion(msg.companion_id)
            broadcastChannelRef.current?.send({
              type: 'broadcast',
              event: 'companion_typing',
              payload: { id: msg.companion_id, typing: false },
            })
            insertCompanionMessage(msg.companion_id, msg.text)
          }, msg.delay_seconds * 1000)
          pendingTimeoutsRef.current.push(tid)
        }
      }
    } catch {
      clearNarratorTyping()
      // Companions are a nice-to-have — silently fail so the rest of the app works
    }
  }

  // ── Cleanup: cancel all pending delayed messages on unmount ──────────────────
  useEffect(() => {
    return () => {
      pendingTimeoutsRef.current.forEach(clearTimeout)
      pendingTimeoutsRef.current = []
      clearPendingCompanions()
    }
  }, [])

  // ── Effect 1: Pre-ceremony intro (fires once per room, ever) ────────────────
  // Waits for room to be non-null (session restore complete), then delays 2s
  // so useScores initial fetch completes before checking winners.
  // Checks the DB for existing companion messages before firing — prevents
  // duplicate welcome messages when the host reloads the page.

  useEffect(() => {
    if (!room) return

    const timer = setTimeout(async () => {
      if (preCeremonyFiredRef.current) return
      preCeremonyFiredRef.current = true

      // If the show already started while the 2s timer was pending, skip the
      // pre-ceremony intro — Effect 1b handles that moment via buildShowStartedPrompt.
      if (showStartedRef.current) return

      const hasWinners = categoriesRef.current.some((c) => c.winner_id != null)
      if (hasWinners) return

      // The introductions are spread over ~8 minutes, and the schedule lives
      // in setTimeouts in THIS browser. A host reload at minute two used to
      // lose the four who had not arrived yet, permanently: the old guard saw
      // Ned's message, concluded the intros had run, and skipped.
      //
      // So instead of "have any companions spoken", ask WHICH have spoken and
      // top up the rest. On a clean first run that is all six; after a reload
      // it is whoever is missing; once everyone has arrived it is nobody and
      // we return.
      const { data: existing } = await supabase
        .from('messages')
        .select('player_id')
        .eq('room_id', roomRef.current?.id ?? '')
        .in('player_id', [...COMPANION_IDS])

      const spoken = new Set((existing ?? []).map((m) => m.player_id))
      const missing = PRE_SHOW_COMPANIONS.map((c) => c.id).filter((id) => !spoken.has(id))
      if (missing.length === 0) return

      fireCompanionMessages(
        buildPreCeremonyPrompt(
          playersRef.current,
          draftPicksRef.current,
          draftEntitiesRef.current,
          confidencePicksRef.current,
          categoriesRef.current,
          nomineesRef.current,
          buildCeremonyPreamble(),
          spoken.size > 0 ? missing : undefined,
        ),
        // Six full-length entrances need real room. At 1400 the last two
        // arrivals came back truncated mid-sentence.
        2200,
      )
    }, 300)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room])

  // ── Effect 1b: "Show Started" — divider + companion reaction ────────────────
  // Fires once when show_started flips true. DB check guards against re-firing
  // on page reload when show_started is already true.

  useEffect(() => {
    if (!showStarted) return
    if (showStartedFiredRef.current) return
    showStartedFiredRef.current = true

    // Only the host inserts dividers and fires AI messages; non-hosts get them via Realtime
    if (!isHostRef.current) return

    // Guard against re-firing on reload: check before inserting the divider
    supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', roomRef.current?.id ?? '')
      .eq('player_id', 'system')
      .eq('text', 'Show Started')
      .then(({ count }) => {
        if (count != null && count > 0) return
        insertSystemDivider('Show Started')
        fireCompanionMessages(buildShowStartedPrompt(playersRef.current), 1000)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showStarted])

  // ── Effect 1c: Player welcomes ──────────────────────────────────────────────
  //
  // Each player gets ONE first-acknowledgement from the cast: their name, their
  // allegiance, a verdict on somebody they drafted. Spaced ~85s apart so they
  // thread BETWEEN the companion entrances instead of landing as a roll call,
  // and the greeter is drawn only from companions who have already introduced
  // themselves — a welcome from someone who has not arrived yet would both read
  // wrong and blow the late-arrival surprise.
  //
  // welcomed_at is claimed in the DB before the API call, so a host reload
  // mid-pre-show cannot re-welcome anyone. The claim is conditional
  // (is welcomed_at null), which also makes two racing host tabs safe.
  const welcomeTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const nextWelcomeAtRef = useRef(0)
  const lastGreeterRef = useRef<string | null>(null)

  async function spokenCompanionIds(): Promise<string[]> {
    const { data } = await supabase
      .from('messages')
      .select('player_id')
      .eq('room_id', roomRef.current?.id ?? '')
      .in('player_id', [...COMPANION_IDS])
    return [...new Set((data ?? []).map((m) => m.player_id as string))]
  }

  useEffect(() => {
    if (!isHost || !room) return
    const unwelcomed = players.filter(
      (p) => !p.welcomed_at && !welcomeTimersRef.current.has(p.id),
    )
    if (!unwelcomed.length) return

    for (const p of unwelcomed) {
      // Pre-show, the queue paces itself around the 8-minute entrance arc;
      // once the episode is running, arrivals (late joiners) get greeted sooner.
      const spacing = showStartedRef.current ? 45_000 : 85_000
      const minDelay = showStartedRef.current ? 20_000 : 40_000
      const at = Math.max(Date.now() + minDelay, nextWelcomeAtRef.current)
      nextWelcomeAtRef.current = at + spacing + Math.random() * 15_000

      const fire = async () => {
        welcomeTimersRef.current.delete(p.id)
        try {
          // Nobody on stage yet (companion intros still in flight)? Try again
          // shortly — a greeting from an empty room reads as a bug.
          const spoken = await spokenCompanionIds()
          if (!spoken.length) {
            const retry = setTimeout(fire, 30_000)
            welcomeTimersRef.current.set(p.id, retry)
            return
          }
          // Claim before calling the API — this is the reload guard.
          const { data: claimed } = await supabase
            .from('players')
            .update({ welcomed_at: new Date().toISOString() })
            .eq('id', p.id)
            .is('welcomed_at', null)
            .select('id')
          if (!claimed?.length) return

          // Freshest state at fire time, not schedule time — the player may
          // have picked a team in the minutes since this was queued.
          const current = playersRef.current.find((x) => x.id === p.id) ?? p
          const roster = draftPicksRef.current
            .filter((dp) => dp.player_id === p.id)
            .map((dp) => draftEntitiesRef.current.find((e) => e.id === dp.entity_id)?.name)
            .filter((n): n is string => !!n)

          // The greeter is chosen BY HOUSE: the player's sigil is treated as
          // their house, and whoever at the table has the sharpest personal
          // angle on that house is the one who looks up — Ned takes the
          // Arryns (fostered in the Vale), Olenna the Hightowers, Daenerys
          // judges anyone wearing her own dragon. Random fallback only when
          // the house is unknown or nobody with an angle is on stage yet.
          const houseId = current.avatar_id
          const angle = pickGreeterForHouse(houseId, spoken, lastGreeterRef.current)
          let greeter: string
          let house: { name: string; hook: string } | undefined
          if (angle) {
            greeter = angle.companionId
            house = {
              name: getAvatarById(houseId)?.name ?? houseId,
              hook: angle.hook,
            }
          } else {
            const pool = spoken.filter((id) => id !== lastGreeterRef.current)
            greeter = (pool.length ? pool : spoken)[
              Math.floor(Math.random() * (pool.length ? pool.length : spoken.length))
            ]
          }
          lastGreeterRef.current = greeter

          await fireCompanionMessages(
            buildPlayerWelcomePrompt(greeter, current.name, current.team ?? null, roster, house),
            400,
          )
        } catch {
          // Welcomes are decoration — never let one break the host client.
        }
      }
      welcomeTimersRef.current.set(p.id, setTimeout(fire, at - Date.now()))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, isHost, room?.id])

  useEffect(() => {
    return () => {
      welcomeTimersRef.current.forEach(clearTimeout)
      welcomeTimersRef.current.clear()
    }
  }, [])

  // ── Effect 1d: Team declarations and defections ─────────────────────────────
  //
  // Watches player UPDATEs for team transitions. A switch mid-episode is a
  // little ceremony: a system divider states the fact, then one companion
  // passes judgement a few seconds later. Baseline is seeded silently so a
  // page load never announces existing allegiances, and per-player cooldown
  // stops a rapid toggler from flooding the chat.
  const prevTeamsRef = useRef<Map<string, 'black' | 'green' | null> | null>(null)
  const lastTeamEventRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    if (!isHost || !players.length) return
    if (prevTeamsRef.current === null) {
      prevTeamsRef.current = new Map(players.map((p) => [p.id, p.team ?? null]))
      return
    }
    const prev = prevTeamsRef.current
    for (const p of players) {
      if (!prev.has(p.id)) { prev.set(p.id, p.team ?? null); continue }
      const was = prev.get(p.id) ?? null
      const now = p.team ?? null
      if (was === now) continue
      prev.set(p.id, now)
      if (!now) continue // clearing a team is not an event
      // A declaration BEFORE the welcome is folded into the welcome itself.
      if (!was && !p.welcomed_at) continue
      const last = lastTeamEventRef.current.get(p.id) ?? 0
      if (Date.now() - last < 90_000) continue
      lastTeamEventRef.current.set(p.id, Date.now())

      const label = now === 'black' ? 'Team Black' : 'Team Green'
      void insertSystemDivider(`${p.name} ${was ? 'defects to' : 'declares for'} ${label}`)

      const roster = draftPicksRef.current
        .filter((dp) => dp.player_id === p.id)
        .map((dp) => draftEntitiesRef.current.find((e) => e.id === dp.entity_id)?.name)
        .filter((n): n is string => !!n)
      const tid = setTimeout(async () => {
        try {
          const spoken = await spokenCompanionIds()
          if (!spoken.length) return
          const greeter = spoken[Math.floor(Math.random() * spoken.length)]
          await fireCompanionMessages(
            buildTeamChangePrompt(greeter, p.name, was, now, roster),
            400,
          )
        } catch { /* decoration */ }
      }, 6_000 + Math.random() * 6_000)
      pendingTimeoutsRef.current.push(tid)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, isHost])

  // ── Effect 1e: Bingo declarations ───────────────────────────────────────────
  //
  // The design principle for the whole night: nobody narrates the episode.
  // The GAME's declarations are the event stream — a GM-logged beat is one
  // kind, and a host-approved bingo square is the other. "Someone says
  // 'Dracarys' — confirmed" tells the cast what happened on screen without
  // anyone typing a play-by-play.
  //
  // Squares are LIGHT: probability-gated and cooled down hard, because on a
  // heavy episode approvals cluster and a reaction per square would be a
  // metronome. A completed LINE is a game moment and always lands, with the
  // player's name on it.
  const processedMarkIdsRef = useRef<Set<string>>(new Set())
  const lastSquareReactionAtRef = useRef(0)
  const cardLineCountRef = useRef<Map<string, number>>(new Map())
  const bingoSquaresCacheRef = useRef<Map<number, string> | null>(null)

  useEffect(() => {
    if (!roomIdForBingo) return

    async function squareText(id: number): Promise<string | null> {
      if (!bingoSquaresCacheRef.current) {
        const { data } = await supabase.from('bingo_squares').select('id, text')
        bingoSquaresCacheRef.current = new Map(
          (data ?? []).map((sq) => [sq.id as number, sq.text as string]),
        )
      }
      return bingoSquaresCacheRef.current.get(id) ?? null
    }

    async function onMark(mark: { id: string; card_id: string; square_index: number; status: string }) {
      if (!isHostRef.current) return
      if (mark.status !== 'approved') return
      if (processedMarkIdsRef.current.has(mark.id)) return
      processedMarkIdsRef.current.add(mark.id)

      // bingo_marks carries no room_id — resolve through the card, and drop
      // marks from other rooms (the subscription cannot filter them out).
      const { data: card } = await supabase
        .from('bingo_cards')
        .select('id, room_id, player_id, squares')
        .eq('id', mark.card_id)
        .maybeSingle()
      if (!card || card.room_id !== roomRef.current?.id) return

      const player = playersRef.current.find((p) => p.id === card.player_id)
      if (!player) return

      // Line detection first — a new completed line outranks the square gate.
      const { data: approved } = await supabase
        .from('bingo_marks')
        .select('square_index')
        .eq('card_id', card.id)
        .eq('status', 'approved')
      const marked = new Set<number>([12, ...(approved ?? []).map((m) => m.square_index as number)])
      const lines = checkBingo(marked, []).lines.length
      // First sight of this card (host reload mid-game): baseline is the card
      // WITHOUT the mark that just arrived, so a line completed an hour ago
      // does not get re-celebrated now.
      let prevLines = cardLineCountRef.current.get(card.id)
      if (prevLines === undefined) {
        const before = new Set(marked)
        before.delete(mark.square_index)
        prevLines = checkBingo(before, []).lines.length
      }
      cardLineCountRef.current.set(card.id, lines)

      const squareId = (card.squares as number[])[mark.square_index]
      const text = squareId ? await squareText(squareId) : null
      if (!text) return

      const isNewLine = lines > prevLines

      // Every mark lands in chat as a divider — the room should SEE claims
      // even when no companion comments. Delayed ~8s and re-verified so an
      // instant undo stays silent.
      {
        const tid = setTimeout(() => {
          void (async () => {
            const { data: still } = await supabase
              .from('bingo_marks').select('id').eq('id', mark.id).maybeSingle()
            if (!still) return
            await insertSystemDivider(
              isNewLine
                ? `BINGO — ${player.name} completes a line: "${text}"`
                : `${player.name} marked: "${text}"`,
            )
          })()
        }, 8_000)
        pendingTimeoutsRef.current.push(tid)
      }

      if (!isNewLine) {
        // Square-level throttle: at most one reaction per 2.5 minutes, and
        // even then only some squares get one. Silence is a valid reaction.
        if (Date.now() - lastSquareReactionAtRef.current < 150_000) return
        if (Math.random() > 0.45) return
      }
      lastSquareReactionAtRef.current = Date.now()

      const spoken = await spokenCompanionIds()
      if (!spoken.length) return
      const who = spoken[Math.floor(Math.random() * spoken.length)]
      // ~10s human lag, then RE-VERIFY the mark still exists before speaking.
      // Marks are honor-system now and tapping again is the undo — a companion
      // reacting to a misclick that was already taken back would be worse than
      // a short delay. The lag doubles as the misclick grace window: a fat-
      // finger gets noticed and untapped within seconds or not at all.
      const tid = setTimeout(() => {
        void (async () => {
          const { data: still } = await supabase
            .from('bingo_marks')
            .select('id')
            .eq('id', mark.id)
            .maybeSingle()
          if (!still) return
          await fireCompanionMessages(
            buildBingoReactionPrompt(who, player.name, text, isNewLine ? 'line' : 'square'),
            400,
          )
        })()
      }, 8_000 + Math.random() * 4_000)
      pendingTimeoutsRef.current.push(tid)
    }

    const channel = supabase
      .channel(`bingo-reactions:${roomIdForBingo}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bingo_marks' },
        (payload) => void onMark(payload.new as never))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bingo_marks' },
        (payload) => void onMark(payload.new as never))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomIdForBingo])

  // ── Effect 2: Winner reactions ────────────────────────────────────────────────
  // First meaningful data load: initialize seen set without firing reactions.
  // Subsequent updates: fire for genuinely new winners only.

  useEffect(() => {
    if (!categories.length) return

    if (!dataInitializedRef.current) {
      // Mark all currently-announced categories as already seen
      categories.filter((c) => c.winner_id != null).forEach((c) => previousWinnersRef.current.add(c.id))

      // Pre-populate milestoneFiredRef for any thresholds already passed so
      // Effect 5 (milestone reactions) doesn't re-fire them on page reload.
      const count = categories.filter((c) => c.winner_id != null).length
      if (count >= 12) milestoneFiredRef.current.add('halfway')
      if (count >= 18) milestoneFiredRef.current.add('final_stretch')
      const total = categories.length
      if (total > 0 && count >= total - 1) milestoneFiredRef.current.add('final_category')
      if (total > 0 && count >= total) milestoneFiredRef.current.add('ceremony_end')

      dataInitializedRef.current = true
      return
    }

    const newWinners = categories.filter(
      (c) => c.winner_id != null && !previousWinnersRef.current.has(c.id),
    )
    if (!newWinners.length) return

    const cat = newWinners[0]
    newWinners.forEach((c) => previousWinnersRef.current.add(c.id))

    const winner = nomineesRef.current.find((n) => n.id === cat.winner_id)
    if (!winner) return

    const tieWinner = cat.tie_winner_id
      ? nomineesRef.current.find((n) => n.id === cat.tie_winner_id) ?? undefined
      : undefined

    // Find stored predictions that mentioned nominees in this category
    let playerPredictions: PlayerPrediction[] | undefined
    if (predictionsRef) {
      const catNomineeIds = new Set(
        confidencePicksRef.current.filter((p) => p.category_id === cat.id).map((p) => p.nominee_id),
      )
      const catNomineeNames = new Set(
        nomineesRef.current
          .filter((n) => catNomineeIds.has(n.id))
          .map((n) => n.name.toLowerCase()),
      )

      const relevant = predictionsRef.current.filter((pred) =>
        pred.nomineeNames.some((name) => catNomineeNames.has(name.toLowerCase())),
      )

      if (relevant.length > 0) {
        playerPredictions = relevant.map((pred) => ({
          playerName: pred.playerName,
          text: pred.text,
          wasCorrect: pred.nomineeNames.some(
            (name) =>
              name.toLowerCase() === winner.name.toLowerCase() ||
              (tieWinner != null && name.toLowerCase() === tieWinner.name.toLowerCase()),
          ),
        }))
        // Consume these predictions so they don't repeat for future categories
        const usedTimestamps = new Set(relevant.map((p) => p.timestamp))
        predictionsRef.current = predictionsRef.current.filter(
          (p) => !usedTimestamps.has(p.timestamp),
        )
      }
    }

    insertWinnerDivider(
      tieWinner
        ? `Winner — ${winner.name} & ${tieWinner.name}`
        : `Winner — ${winner.name}`,
    )

    // Await so the film link fires only after the Academy's delay-0 message is inserted
    const filmName = winner.film_name || winner.name
    ;(async () => {
      await fireCompanionMessages(
        buildWinnerReactionPrompt(
          cat,
          winner,
          playersRef.current,
          nomineesRef.current,
          confidencePicksRef.current,
          draftPicksRef.current,
          draftEntitiesRef.current,
          leaderboardRef.current,
          playerPredictions,
          tieWinner,
          // Ground the reaction in the researched dossier for whoever the GM
          // named — without this the model invents this season wholesale.
          buildCategoryContext(cat.name, winner?.name),
          // How far into the night we are. Drives Daenerys' drift from warm to
          // cold across the episode — she has no memory between calls, so this
          // count is the only thing that tells the prompt where she's got to.
          categoriesRef.current.filter((c) => c.winner_id != null).length,
        ),
      )
      // Film-link cards used to open the film encyclopedia on the Films tab.
      // That tab is gone, so inserting one now puts a gold, tappable, dead card
      // in the chat after every single logged event. Stopped at the source; the
      // render branch in ChatSection stays for any rows already in the table.
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories])

  // ── Effect 3: Spotlight pre-category prompt ───────────────────────────────────
  // Fires immediately when host opens a spotlight for a category.
  // Replaces the old 45s-delayed pre-category scheduling.

  useEffect(() => {
    const spotlightId = room?.active_spotlight_category_id ?? null

    if (spotlightId === prevSpotlightCategoryIdRef.current) return
    prevSpotlightCategoryIdRef.current = spotlightId

    if (spotlightId == null) return

    const cat = categoriesRef.current.find((c) => c.id === spotlightId)
    if (!cat) return

    // Insert category divider for every spotlight open (even if pre-category prompt already fired)
    insertSystemDivider(cat.name)

    // The Academy announces the category immediately after the divider (varied phrasing)
    if (isHostRef.current) {
      callClaude(
        {
          system:
            'You are the Academy Awards host. Announce the next category in one short, casual sentence. Vary your phrasing every time — never repeat the same opener twice. Examples: "Okay, next up — Best Picture.", "Alright, we\'re moving on to Best Director.", "Next category: Best Actress." Keep it under 12 words. Plain text only, no quotes.',
          user: `Announce: ${cat.name}`,
        },
        80,
      ).then((text) => {
        const cleaned = text.trim().replace(/^["']|["']$/g, '')
        insertCompanionMessage(NARRATOR.id, cleaned || `Okay, next up — ${cat.name}.`)
      })
    }

    if (preCategoryFiredRef.current.has(cat.id)) return

    preCategoryFiredRef.current.add(cat.id)
    fireCompanionMessages(
      buildPreCategoryPrompt(
        cat,
        nomineesRef.current,
        confidencePicksRef.current,
        playersRef.current,
        buildCategoryContext(cat.name),
      ),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.active_spotlight_category_id])

  // ── Effect 5: Milestone reactions (halfway / final stretch) ───────────────────

  useEffect(() => {
    const count = categories.filter((c) => c.winner_id != null).length

    // Milestones fire on absolute event counts, NOT on progress toward a total.
    //
    // The Oscars had a fixed 24-category slate, so "12 of 24" was a real
    // halfway point and "all 24 announced" was a real ending. An episode has
    // neither: categories is an append-only GM event log (see useGameMaster),
    // so the total grows as the host writes and `announced === total` is not a
    // meaningful state. The old `count === total` trigger fired a full
    // "the record is closed, crown the champion" wrap-up mid-episode.
    //
    // The end of the night is now an explicit host action — "End episode" sets
    // room.phase = 'finished', which drives the post-show reactions.

    if (count === 6 && !milestoneFiredRef.current.has('halfway')) {
      milestoneFiredRef.current.add('halfway')
      fireCompanionMessages(
        buildMilestonePrompt('halfway', leaderboardRef.current, playersRef.current),
      )
    }

    if (count === 12 && !milestoneFiredRef.current.has('final_stretch')) {
      milestoneFiredRef.current.add('final_stretch')
      fireCompanionMessages(
        buildMilestonePrompt('final_stretch', leaderboardRef.current, playersRef.current),
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories])

  // ── Effect 6: Lead change reaction ────────────────────────────────────────────

  useEffect(() => {
    if (!leaderboard.length) return

    const leaderId = leaderboard[0].player.id

    // Lead-change commentary DISABLED (user call, mid-party): the cast was
    // narrating every scoreboard flip. The story is on screen, not the board.
    if (false && previousLeaderIdRef.current && previousLeaderIdRef.current !== leaderId) {
      const key = `lead_change:${leaderId}`
      if (!milestoneFiredRef.current.has(key)) {
        milestoneFiredRef.current.add(key)
        const newLeader = leaderboard[0]
        const oldLeader = leaderboard.find((e) => e.player.id === previousLeaderIdRef.current)
        const announcedCount = categoriesRef.current.filter((c) => c.winner_id != null).length
        fireCompanionMessages(
          buildMilestonePrompt(
            'lead_change',
            leaderboard,
            playersRef.current,
            newLeader,
            oldLeader,
            undefined,
            announcedCount,
            categoriesRef.current,
          ),
        )
      }
    }

    previousLeaderIdRef.current = leaderId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderboard])

  return { isGenerating: false }
}
