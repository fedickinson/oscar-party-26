/**
 * usePlayerVerdicts — The Reckoning: one written verdict per player.
 *
 * WHO GENERATES
 * The host, once, and nobody else. Every client renders the same rows, which
 * arrive over Realtime. This mirrors the post-show farewell messages on the same
 * page: if all six clients fired the call, the party would pay for six
 * generations and each player would read a different verdict about themselves
 * than the person sitting next to them is reading aloud.
 *
 * FALLING BACK
 * The card is built from two layers. The TITLE and STAT are computed locally by
 * lib/night-awards.ts and always render. The VERDICT is the written passage and
 * is the only part that needs Claude. If the call fails, times out, or returns
 * something unparseable, the cards still show titles and stats — the night never
 * ends on a spinner or an error state. `isGenerating` exists only to soften the
 * arrival of the text, not to gate the section.
 *
 * IDEMPOTENCE
 * Guarded three ways, because the Results page can mount more than once (a
 * reload, a player navigating back) and each mount would otherwise re-bill:
 *   1. A ref, for double-mounts inside one session
 *   2. A read of existing rows before firing
 *   3. Upsert on the (room_id, player_id) primary key, so a genuine race
 *      overwrites instead of erroring
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  assignVerdictAuthors,
  buildVerdictsPrompt,
  parseVerdictResponse,
} from '../lib/companion-prompts'
import { collectLineCandidates } from '../lib/player-recap'
import type { ScoredPlayer } from '../lib/scoring'
import type { PlayerAward } from '../lib/night-awards'
import type { MessageRow, PlayerRow, PlayerVerdictRow } from '../types/database'

interface Args {
  roomId: string | undefined
  isHost: boolean
  playerAwards: PlayerAward[]
  leaderboard: ScoredPlayer[]
  /** Needed to resolve message authors into names for the candidate lines. */
  players: PlayerRow[]
  /** Hold generation until scores have settled — a verdict off a half-loaded board is wrong. */
  ready: boolean
}

export interface PlayerVerdictsState {
  /** playerId → row. Empty until generation lands; never blocks the UI. */
  verdicts: Map<string, PlayerVerdictRow>
  isGenerating: boolean
}

export function usePlayerVerdicts({
  roomId,
  isHost,
  playerAwards,
  leaderboard,
  players,
  ready,
}: Args): PlayerVerdictsState {
  const [verdicts, setVerdicts] = useState<Map<string, PlayerVerdictRow>>(new Map())
  const [isGenerating, setIsGenerating] = useState(false)
  const firedRef = useRef(false)

  const upsertLocal = useCallback((row: PlayerVerdictRow) => {
    setVerdicts((prev) => {
      const next = new Map(prev)
      next.set(row.player_id, row)
      return next
    })
  }, [])

  // ── Load whatever already exists ───────────────────────────────────────────

  useEffect(() => {
    if (!roomId) return
    let cancelled = false

    supabase
      .from('player_verdicts')
      .select()
      .eq('room_id', roomId)
      .then(({ data }) => {
        if (cancelled || !data) return
        setVerdicts(new Map((data as PlayerVerdictRow[]).map((r) => [r.player_id, r])))
      })

    return () => { cancelled = true }
  }, [roomId])

  // ── Realtime: non-host clients receive the host's generation ───────────────

  useEffect(() => {
    if (!roomId) return

    const channel = supabase
      .channel(`player-verdicts:${roomId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'player_verdicts', filter: `room_id=eq.${roomId}` },
        (payload) => upsertLocal(payload.new as PlayerVerdictRow),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'player_verdicts', filter: `room_id=eq.${roomId}` },
        (payload) => upsertLocal(payload.new as PlayerVerdictRow),
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [roomId, upsertLocal])

  // ── Host generates, once ───────────────────────────────────────────────────

  useEffect(() => {
    if (!roomId || !isHost || !ready) return
    if (firedRef.current) return
    if (playerAwards.length === 0) return

    firedRef.current = true

    async function generate() {
      // Someone already ran this — a reload, or the host rejoining.
      const { count } = await supabase
        .from('player_verdicts')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', roomId!)
      if (count != null && count > 0) return

      setIsGenerating(true)
      try {
        // Chat is fetched here rather than threaded down from the page: this is
        // the only consumer, it is a one-shot read, and the Results page has no
        // other reason to hold the transcript in state.
        const { data: msgData } = await supabase
          .from('messages')
          .select()
          .eq('room_id', roomId!)
          .order('created_at')
        const messages = (msgData ?? []) as MessageRow[]

        const authors = assignVerdictAuthors(playerAwards.map((a) => a.playerId))
        const candidates = collectLineCandidates(messages, players)
        const prompt = buildVerdictsPrompt(playerAwards, leaderboard, authors, candidates)

        const response = await fetch('/api/anthropic/v1/messages', {
          method: 'POST',
          headers: {
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-5',
            // ~90 tokens per verdict at 2-3 sentences, times up to 6 players,
            // with headroom for the JSON envelope.
            // Roughly triple the passage-only budget: each slot now also
            // returns a title and up to four highlight ids with notes.
            max_tokens: 3000,
            // Thinking off for the same reason as every other companion caller
            // in this app: on Sonnet 5 max_tokens caps thinking + text together,
            // so a long think silently truncates the actual verdicts.
            thinking: { type: 'disabled' },
            output_config: { effort: 'low' },
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

        if (!response.ok) return
        const data = await response.json()
        const blocks = (data?.content ?? []) as Array<{ type?: string; text?: string }>
        const raw = blocks.find((b) => b.type === 'text')?.text ?? ''
        if (!raw) return

        const parsed = parseVerdictResponse(raw)
        if (parsed.length === 0) return

        const awardByPlayer = new Map(playerAwards.map((a) => [a.playerId, a]))
        const validMessageIds = new Set(messages.map((m) => m.id))

        // Titles must be unique across the room. The prompt says so and the
        // model is shown every player at once, but "check before you answer" is
        // not a guarantee — so the first claimant keeps a name and anyone who
        // collides falls back to their computed pool title, which is already
        // distinct by construction. Case-insensitive because "The Kingmaker"
        // and "the kingmaker" would read as the same name on two keepsakes.
        const claimedTitles = new Set<string>()

        const rows = parsed
          .map((v) => {
            const playerId = prompt.slots.get(v.slot)
            if (!playerId) return null
            const award = awardByPlayer.get(playerId)
            if (!award) return null

            const proposed = v.title.trim()
            const key = proposed.toLowerCase()
            const usable = proposed.length > 0 && proposed.length <= 40 && !claimedTitles.has(key)
            if (usable) claimedTitles.add(key)
            const title = usable ? proposed : award.title
            claimedTitles.add(title.toLowerCase())

            return {
              room_id: roomId!,
              player_id: playerId,
              // Byline comes from our own deterministic assignment, never from
              // the model — it was told who writes each slot, but a wrong echo
              // would attribute the passage to the wrong companion forever.
              companion_id: authors.get(playerId) ?? 'ned',
              title,
              verdict: v.text,
              // Drop any id the model did not actually receive. A hallucinated
              // id would render as a missing line rather than a wrong one, but
              // filtering here keeps the stored row honest.
              highlights: v.highlights
                .filter((h) => validMessageIds.has(h.messageId))
                .slice(0, 4)
                .map((h) => ({ message_id: h.messageId, note: h.note })),
            }
          })
          .filter((r): r is NonNullable<typeof r> => r !== null)

        if (rows.length === 0) return

        const { error } = await supabase.from('player_verdicts').upsert(rows)
        if (error) {
          console.error('Failed to persist verdicts:', error)
          return
        }

        // Apply locally rather than waiting on the echo — the host wrote these
        // and should not watch their own page lag behind everyone else's.
        rows.forEach((r) =>
          upsertLocal({ ...r, created_at: new Date().toISOString() } as PlayerVerdictRow),
        )
      } catch (err) {
        // Verdicts are an enhancement. Titles and stats already rendered.
        console.error('Verdict generation failed:', err)
      } finally {
        setIsGenerating(false)
      }
    }

    // Let the finale overlay clear and the leaderboard settle first.
    const timer = setTimeout(generate, 1500)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, isHost, ready, playerAwards.length, players.length])

  return { verdicts, isGenerating }
}
