/**
 * GameMasterConsole — the host's live event composer.
 *
 * The Oscars had an external event stream (24 awards, announced by a broadcast).
 * An episode has none, so the host narrates: they type what happened, pick who
 * it happened to, and set what it was worth. That write becomes canon for the
 * room and cascades through scoring, the feed, the timeline and the AI
 * companions — see useGameMaster for why nothing downstream needed changing.
 *
 * Host-only by design. A free-text log wired to a scoreboard is trivially
 * griefable, so players get to watch and argue, not write.
 *
 * FLOW (deliberately three taps or fewer, because it's used mid-episode):
 *   1. Type the event, or tap a quick-pick to prefill it
 *   2. Tap the character it happened to
 *   3. Tap a point tier to commit
 */

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FastForward, Flag, Loader2, Plus, RotateCcw, Swords, Zap } from 'lucide-react'
import { useGameMaster, GM_POINT_TIERS } from '../../hooks/useGameMaster'
import { Hallmark } from '../ui/Hallmarks'
import { useGame } from '../../context/GameContext'
import { useWatchSync, formatEpisodeTime } from '../../hooks/useWatchSync'
import { supabase } from '../../lib/supabase'
import type { BeatActivationRow, DraftEntityRow, DraftPickRow, PlayerRow, SignatureBeatRow } from '../../types/database'

const FREE_CENTER_INDEX = 12

interface Props {
  roomId: string
  isHost: boolean
  /** Ends the episode and moves the room to 'finished'. Carried over from
   *  WinnersTab, which this console replaces for episode-based properties. */
  onEndCeremony: () => void
  isEndingCeremony: boolean
}

export default function GameMasterConsole({
  roomId,
  isHost,
  onEndCeremony,
  isEndingCeremony,
}: Props) {
  const {
    events,
    quickPicks,
    characters,
    isLoading,
    isLogging,
    error,
    logEvent,
    undoEvent,
    unresolvedPredictionEvents,
  } = useGameMaster(roomId)

  // The GM narrates a broadcast; the single most useful piece of context while
  // doing it is what minute of the episode we are in — it anchors "wait, when
  // did that happen?" arguments and makes the log read like a timeline.
  const { room, player, players } = useGame()
  const sync = useWatchSync(room, player?.id, players)

  const [draft, setDraft] = useState('')
  const [selectedCharacter, setSelectedCharacter] = useState<string | null>(null)

  // ── Signature beats — pre-authored per-character moments ───────────────────
  // Content is being written against docs/signature-beats-brief.md in another
  // workstream; until its INSERTs land this map is empty and nothing renders.
  // Keyed by CHARACTER NAME because the picker above selects nominees while
  // beats reference draft_entities — the two tables share names, not ids.
  const [beatsByName, setBeatsByName] = useState<Map<string, SignatureBeatRow[]>>(new Map())
  const [collisionBeats, setCollisionBeats] = useState<SignatureBeatRow[]>([])
  const [entityByName, setEntityByName] = useState<Map<string, DraftEntityRow>>(new Map())
  const [entityNameById, setEntityNameById] = useState<Map<string, string>>(new Map())
  const [activatedBeatIds, setActivatedBeatIds] = useState<Set<number>>(new Set())
  const [activationPlayerByBeat, setActivationPlayerByBeat] = useState<Map<number, PlayerRow>>(new Map())
  const [drafterByEntityId, setDrafterByEntityId] = useState<Map<string, PlayerRow>>(new Map())
  useEffect(() => {
    void (async () => {
      const [{ data: beats }, { data: ents }, { data: activations }, { data: picks }, { data: roomPlayers }] = await Promise.all([
        supabase.from('signature_beats').select(),
        supabase.from('draft_entities').select(),
        supabase.from('beat_activations').select().eq('room_id', roomId),
        supabase.from('draft_picks').select().eq('room_id', roomId),
        supabase.from('players').select().eq('room_id', roomId),
      ])
      if (!beats?.length || !ents?.length) return
      const typedBeats = beats as SignatureBeatRow[]
      const typedEntities = ents as DraftEntityRow[]
      const typedPlayers = (roomPlayers ?? []) as PlayerRow[]
      const playerMap = new Map(typedPlayers.map((roomPlayer) => [roomPlayer.id, roomPlayer]))
      const entityName = new Map(typedEntities.map((entity) => [entity.id, entity.name]))
      const map = new Map<string, SignatureBeatRow[]>()
      for (const beat of typedBeats) {
        if (beat.partner_entity_id != null) continue
        const n = entityName.get(beat.entity_id)
        if (!n) continue
        map.set(n, [...(map.get(n) ?? []), beat])
      }
      const activationRows = (activations ?? []) as BeatActivationRow[]
      setBeatsByName(map)
      setCollisionBeats(typedBeats.filter((beat) => beat.partner_entity_id != null))
      setEntityByName(new Map(typedEntities.map((entity) => [entity.name, entity])))
      setEntityNameById(entityName)
      setActivatedBeatIds(new Set(activationRows.map((activation) => activation.beat_id)))
      setActivationPlayerByBeat(new Map(
        activationRows.flatMap((activation) => {
          const activatingPlayer = playerMap.get(activation.player_id)
          return activatingPlayer ? [[activation.beat_id, activatingPlayer] as const] : []
        }),
      ))
      setDrafterByEntityId(new Map(
        ((picks ?? []) as DraftPickRow[]).flatMap((pick) => {
          const draftingPlayer = playerMap.get(pick.player_id)
          return draftingPlayer ? [[pick.entity_id, draftingPlayer] as const] : []
        }),
      ))
    })()
  }, [roomId])
  const [confirmingEnd, setConfirmingEnd] = useState(false)

  const canCommit = draft.trim().length > 0 && selectedCharacter !== null && !isLogging

  async function commit(points: number) {
    if (!canCommit || !selectedCharacter) return
    await logEvent(draft, points, selectedCharacter)
    setDraft('')
    setSelectedCharacter(null)
  }

  // ── Dev: drive a whole night without typing ────────────────────────────────
  //
  // Ported from WinnersTab, which this console replaced. The point is not saving
  // keystrokes — several behaviours only appear ACROSS a sequence of events and
  // cannot be observed one at a time: Daenerys' warm-to-cold drift, the
  // milestone beats at 6 and 12 events, lead changes, and whether the companion
  // rotation genuinely varies or quietly settles on the same three voices.
  const [autoRunning, setAutoRunning] = useState(false)
  const [autoProgress, setAutoProgress] = useState(0)

  async function devFillBingoCards() {
    const { data: cards } = await supabase.from('bingo_cards').select().eq('room_id', roomId)
    if (!cards?.length) return
    for (const card of cards) {
      const { data: existing } = await supabase
        .from('bingo_marks').select('square_index').eq('card_id', card.id)
      const marked = new Set((existing ?? []).map((m) => m.square_index as number))
      marked.add(FREE_CENTER_INDEX)
      const toMark = Array.from({ length: 25 }, (_, i) => i)
        .filter((i) => !marked.has(i) && Math.random() < 0.5)
      if (!toMark.length) continue
      const now = new Date().toISOString()
      await supabase.from('bingo_marks').insert(
        toMark.map((index) => ({ card_id: card.id, square_index: index, status: 'approved', marked_at: now })),
      )
    }
  }

  async function devAutoLog(count: number) {
    if (autoRunning) return
    setAutoRunning(true)
    setAutoProgress(0)
    try {
      for (let i = 0; i < count; i++) {
        const qp = quickPicks[i % Math.max(1, quickPicks.length)]
        const who = characters[Math.floor(Math.random() * characters.length)]
        if (!who) break
        await logEvent(qp?.name ?? `Test event ${i + 1}`, qp?.points ?? 10, who.id)
        setAutoProgress(i + 1)
        // Companion generation is a live API round-trip. Pacing faster than ~4s
        // just queues calls behind one another and the chat lands in a lump,
        // hiding the ordering this is meant to exercise.
        await new Promise((r) => setTimeout(r, 4500))
      }
      await devFillBingoCards()
    } finally {
      setAutoRunning(false)
    }
  }

  const loggedNames = new Set(events.map((event) => event.category.name))

  function collisionSides(beat: SignatureBeatRow) {
    if (!beat.partner_entity_id) return null
    const leftName = entityNameById.get(beat.entity_id)
    const rightName = entityNameById.get(beat.partner_entity_id)
    if (!leftName || !rightName) return null
    const leftNominee = characters.find((character) => character.name === leftName)
    const rightNominee = characters.find((character) => character.name === rightName)
    if (!leftNominee || !rightNominee) return null
    return { leftName, rightName, leftNominee, rightNominee }
  }

  function isCollisionUsed(beat: SignatureBeatRow): boolean {
    const sides = collisionSides(beat)
    if (!sides) return false
    const leftEvent = `${beat.name} — ${sides.leftName.split(' ')[0]}`
    const rightEvent = `${beat.name} — ${sides.rightName.split(' ')[0]}`
    return loggedNames.has(leftEvent) || loggedNames.has(rightEvent)
  }

  async function awardCollision(beat: SignatureBeatRow): Promise<void> {
    const sides = collisionSides(beat)
    if (!sides || isCollisionUsed(beat) || isLogging) return
    await logEvent(
      `${beat.name} — ${sides.leftName.split(' ')[0]}`,
      beat.points,
      sides.leftNominee.id,
    )
    await logEvent(
      `${beat.name} — ${sides.rightName.split(' ')[0]}`,
      beat.points,
      sides.rightNominee.id,
    )
    setDraft('')
    setSelectedCharacter(null)
  }

  function renderCollisionBeat(beat: SignatureBeatRow) {
    const sides = collisionSides(beat)
    if (!sides) return null
    const used = isCollisionUsed(beat)
    return (
      <motion.button
        key={beat.id}
        whileTap={{ scale: 0.98 }}
        disabled={used || isLogging}
        title={beat.trigger_text}
        onClick={() => void awardCollision(beat)}
        className={`material-iron relief-raised min-h-11 w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-colors
          ${used
            ? 'border-[color:var(--t-line-soft)] text-[color:var(--t-text-dim)] opacity-50 line-through'
            : 'border-[color:var(--t-line)] text-[color:var(--t-text)]'}`}
      >
        {/* The Collision — two drafters score on one shot */}
        <span className={`flex-shrink-0 ${used ? 'opacity-40' : ''}`}>
          <Hallmark id="hallmark-collision" size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium truncate">{beat.name}</span>
          <span className="block text-[10px] text-white/35 truncate">{sides.leftName} + {sides.rightName}</span>
        </span>
        <span className="text-[10px] uppercase tracking-wide text-[color:var(--t-text-dim)] flex-shrink-0">{beat.odds}</span>
        <span className={`text-sm font-bold flex-shrink-0 ${used ? 'text-[color:var(--t-text-dim)]' : 'text-[color:var(--t-personal-text)]'}`}>
          {beat.points}
        </span>
      </motion.button>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 text-white/30 animate-spin" />
      </div>
    )
  }

  return (
    <div className="px-4 py-6 space-y-6">
      {/* ── Composer (host only) ─────────────────────────────────────────── */}
      {isHost && (
        <div className="material-oak relief-carved rounded-2xl p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Swords className="w-5 h-5 text-accent" />
            <h2 className="text-base font-semibold text-white">What just happened?</h2>
            {sync.screenStarted && (
              <span className="ml-auto text-sm font-bold text-white/60 tabular-nums">
                {formatEpisodeTime(sync.myPositionMs)}
              </span>
            )}
          </div>

          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Aemond burns Tumbleton"
            /* 16px prevents iOS zooming the viewport on focus */
            className="relief-inset w-full min-h-11 bg-[var(--t-input-bg)] border border-[color:var(--t-line)] rounded-xl px-4 py-3
                       text-[16px] text-[color:var(--t-text)] placeholder:text-[color:var(--t-text-dim)]
                       focus:outline-none focus:border-[color:var(--t-personal-text)] transition-colors"
          />

          {/* Quick-picks — seeded events, one tap to prefill */}
          {quickPicks.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {quickPicks.slice(0, 12).map((qp) => (
                <button
                  key={qp.id}
                  onClick={() => setDraft(qp.name)}
                  className="material-iron relief-raised min-h-11 flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-full
                             border border-[color:var(--t-line)] text-xs text-[color:var(--t-text-muted)]
                             hover:border-[color:var(--t-personal-text)] active:scale-97 transition-all"
                >
                  <Zap className="w-3 h-3 text-[color:var(--t-personal-text)]" />
                  {qp.name}
                </button>
              ))}
            </div>
          )}

          {/* Character picker */}
          <div>
            <p className="text-xs text-white/40 mb-2">Who?</p>
            <div className="flex flex-wrap gap-2">
              {characters.map((c) => {
                const active = selectedCharacter === c.id
                return (
                  <motion.button
                    key={c.id}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setSelectedCharacter(active ? null : c.id)}
                    className={`material-iron relief-raised min-h-11 px-3 py-2 rounded-xl text-xs font-medium border transition-colors
                      ${active
                        ? 'border-[color:var(--t-personal-text)] text-[color:var(--t-personal-text)]'
                        : 'border-[color:var(--t-line)] text-[color:var(--t-text-muted)]'}`}
                    style={active ? { backgroundColor: 'var(--t-iron)' } : undefined}
                  >
                    {c.name}
                  </motion.button>
                )
              })}
            </div>
          </div>

          {/* Signature beats for the selected entity. Character beats must
              have been activated before the show; dragon beats are always live. */}
          {(() => {
            const who = selectedCharacter ? characters.find((c) => c.id === selectedCharacter) : null
            const beats = who ? beatsByName.get(who.name) ?? [] : []
            if (!beats.length) return null
            const selectedEntity = who ? entityByName.get(who.name) : null
            const isDragon = selectedEntity?.type === 'film'
            return (
              <div>
                <p className="text-xs text-white/40 mb-2">{who!.name}'s signature beats</p>
                <div className="space-y-1.5">
                  {beats.map((b) => {
                    const used = loggedNames.has(b.name)
                    const active = isDragon || activatedBeatIds.has(b.id)
                    const activatingPlayer = activationPlayerByBeat.get(b.id)
                      ?? drafterByEntityId.get(b.entity_id)
                    return (
                      <motion.button
                        key={b.id}
                        whileTap={{ scale: 0.98 }}
                        disabled={used || !active || isLogging}
                        title={b.trigger_text}
                        onClick={() => {
                          void logEvent(b.name, b.points, selectedCharacter!).then(() => {
                            setDraft('')
                            setSelectedCharacter(null)
                          })
                        }}
                        className={`material-iron relief-raised min-h-11 w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left transition-colors
                          ${used
                            ? 'border-[color:var(--t-line-soft)] text-[color:var(--t-text-dim)] opacity-50 line-through'
                            : !active
                              ? 'border-[color:var(--t-line-soft)] text-[color:var(--t-text-dim)] opacity-50'
                              : 'border-[color:var(--t-line)] text-[color:var(--t-text)]'}`}
                      >
                        {/* The Comet marks the long-shot and wild bands — the swings */}
                        {b.points >= 35 ? (
                          <span className={`flex-shrink-0 ${used || !active ? 'opacity-30' : ''}`}>
                            <Hallmark id="hallmark-comet" size={15} />
                          </span>
                        ) : (
                          <Zap className={`w-3.5 h-3.5 flex-shrink-0 ${used || !active ? 'text-white/20' : 'text-accent'}`} />
                        )}
                        <span className="flex-1 min-w-0">
                          <span className="block text-xs font-medium truncate">{b.name}</span>
                          {active && !isDragon && activatingPlayer && (
                            <span className="block text-[10px] text-white/35 truncate">Activated by {activatingPlayer.name}</span>
                          )}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide text-white/35 flex-shrink-0">{b.odds}</span>
                        {active ? (
                          <span className={`text-sm font-bold flex-shrink-0 ${used ? 'text-white/25' : 'text-accent'}`}>
                            {b.points}
                          </span>
                        ) : (
                          <span className="text-[10px] text-white/25 flex-shrink-0">not activated</span>
                        )}
                      </motion.button>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {(() => {
            const who = selectedCharacter ? characters.find((character) => character.id === selectedCharacter) : null
            const selectedEntity = who ? entityByName.get(who.name) : null
            if (!selectedEntity) return null
            const relevant = collisionBeats.filter((beat) =>
              beat.entity_id === selectedEntity.id || beat.partner_entity_id === selectedEntity.id,
            )
            if (!relevant.length) return null
            return (
              <div>
                <p className="text-xs text-white/40 mb-2">Collision beats</p>
                <div className="space-y-1.5">{relevant.map(renderCollisionBeat)}</div>
              </div>
            )
          })()}

          {collisionBeats.length > 0 && (
            <details className="material-iron relief-inset rounded-xl border border-[color:var(--t-line-soft)] px-3 py-2.5">
              <summary className="min-h-11 flex items-center cursor-pointer text-xs font-medium text-white/45">
                All collision beats
              </summary>
              <div className="space-y-1.5 pb-1">{collisionBeats.map(renderCollisionBeat)}</div>
            </details>
          )}

          {/* Commit — point tier doubles as the submit button */}
          <div>
            <p className="text-xs text-white/40 mb-2">How big?</p>
            <div className="grid grid-cols-3 gap-2">
              {GM_POINT_TIERS.map((tier) => (
                <motion.button
                  key={tier.points}
                  whileTap={{ scale: 0.97 }}
                  disabled={!canCommit}
                  onClick={() => commit(tier.points)}
                  className={`material-iron relief-raised min-h-11 flex flex-col items-center gap-0.5 py-3 rounded-xl border transition-all
                    ${canCommit
                      ? 'border-[color:var(--t-personal-text)] text-[color:var(--t-text)]'
                      : 'border-[color:var(--t-line-soft)] text-[color:var(--t-text-dim)] opacity-50'}`}
                  style={canCommit ? {
                    backgroundColor: 'var(--t-personal-device)',
                    borderColor: 'var(--t-personal-text)',
                  } : undefined}
                >
                  <span className="text-lg font-bold leading-none">+{tier.points}</span>
                  <span className="text-[11px] font-medium">{tier.label}</span>
                </motion.button>
              ))}
            </div>
            {canCommit && (
              <p className="text-[11px] text-white/30 mt-2 text-center">
                {GM_POINT_TIERS.find((t) => t.points === 10)?.hint}
              </p>
            )}
          </div>

          {isLogging && (
            <div className="flex items-center gap-2 text-xs text-white/50">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Logging…
            </div>
          )}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      )}

      {/* ── Dev controls ─────────────────────────────────────────────────── */}
      {import.meta.env.DEV && isHost && (
        <div className="bg-purple-500/10 border border-purple-500/25 rounded-2xl p-3">
          <p className="text-[11px] uppercase tracking-wide text-purple-300/70 mb-2">
            Dev only — not visible in production
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[1, 6, 14].map((n) => (
              <button
                key={n}
                onClick={() => void devAutoLog(n)}
                disabled={autoRunning}
                className={`min-h-11 py-2.5 rounded-xl text-xs font-semibold border flex items-center
                            justify-center gap-1.5 ${
                  autoRunning
                    ? 'bg-white/5 border-white/10 text-white/30'
                    : 'bg-purple-500/15 border-purple-500/35 text-purple-200'
                }`}
              >
                {autoRunning ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FastForward className="w-3.5 h-3.5" />
                )}
                {n === 1 ? 'Log 1' : `Run ${n}`}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-purple-200/50 mt-2 leading-relaxed">
            {autoRunning
              ? `Logging event ${autoProgress}… watch the chat.`
              : 'Run 6 hits the first milestone. Run 14 crosses both and takes Daenerys from warm into cooling. Roughly 4.5s per event so the companions can keep up.'}
          </p>
        </div>
      )}

      {/* ── Event log ────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white/80">Episode log</h3>
          <span className="text-xs text-white/40">
            {events.length} event{events.length === 1 ? '' : 's'}
          </span>
        </div>

        {events.length === 0 ? (
          <div className="relief-glass p-6 text-center">
            <Plus className="w-6 h-6 text-white/20 mx-auto mb-2" />
            <p className="text-sm text-white/40">
              {isHost
                ? 'Nothing logged yet. Call the first one.'
                : 'Waiting for the host to log the first event.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {events.map((ev) => (
                <motion.div
                  key={ev.category.id}
                  layout
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="relief-glass
                             p-4 flex items-start gap-3"
                >
                  <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-accent/15
                                  flex items-center justify-center">
                    <span className="text-sm font-bold text-accent">
                      +{ev.category.points}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">
                      {ev.category.name}
                    </p>
                    <p className="text-xs text-white/50 mt-0.5">
                      {ev.nominee?.name ?? 'Unassigned'}
                      {ev.nominee?.film_name ? ` · ${ev.nominee.film_name}` : ''}
                    </p>
                  </div>

                  {isHost && (
                    <button
                      onClick={() => undoEvent(ev.category.id)}
                      aria-label={`Undo ${ev.category.name}`}
                      /* 44px touch target */
                      className="flex-shrink-0 w-11 h-11 -mr-1 flex items-center justify-center
                                 text-white/30 hover:text-white/70 transition-colors"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* ── End episode (host only) ──────────────────────────────────────── */}
      {/*
        Two-step when predictions are still open. Ending the episode is the one
        irreversible action in the console — undoEvent can walk back a mistaken
        call, but nothing walks back a final scoreboard — and any event left
        unresolved silently voids every confidence point staked on it.
      */}
      {isHost && events.length > 0 && (
        <div className="space-y-2">
          <AnimatePresence initial={false}>
            {confirmingEnd && unresolvedPredictionEvents.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-400/25">
                  <p className="text-sm font-semibold text-amber-200">
                    {unresolvedPredictionEvents.length} prediction
                    {unresolvedPredictionEvents.length === 1 ? '' : 's'} still open
                  </p>
                  <p className="mt-1 text-[13px] leading-relaxed text-white/60">
                    Everyone staked confidence on these before the episode. If you end
                    now they score nothing for anyone — including whoever called them
                    right.
                  </p>
                  <ul className="mt-3 space-y-1">
                    {unresolvedPredictionEvents.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-center justify-between gap-3 text-[13px]"
                      >
                        <span className="text-white/75 truncate">{c.name}</span>
                        <span className="shrink-0 text-white/35 tabular-nums">
                          {c.points} pts
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {confirmingEnd ? (
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmingEnd(false)}
                disabled={isEndingCeremony}
                className="min-h-11 flex-1 py-3 rounded-2xl bg-white/5 border border-white/10
                           text-sm font-medium text-white/70 hover:text-white
                           hover:border-white/25 disabled:opacity-40 transition-colors"
              >
                Keep going
              </button>
              <button
                onClick={onEndCeremony}
                disabled={isEndingCeremony}
                className="min-h-11 flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl
                           bg-accent/15 border border-accent/40 text-sm font-semibold
                           text-accent hover:bg-accent/25
                           disabled:opacity-40 transition-colors"
              >
                {isEndingCeremony ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Flag className="w-4 h-4" />
                )}
                {isEndingCeremony ? 'Ending…' : 'End anyway'}
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmingEnd(true)}
              disabled={isEndingCeremony}
              className="min-h-11 w-full flex items-center justify-center gap-2 py-3 rounded-2xl
                         bg-white/5 border border-white/10 text-sm font-medium
                         text-white/60 hover:text-white hover:border-white/25
                         disabled:opacity-40 transition-colors"
            >
              <Flag className="w-4 h-4" />
              End episode
              {unresolvedPredictionEvents.length > 0 && (
                <span
                  className="ml-1 px-2 py-0.5 rounded-full bg-amber-400/15
                             text-[11px] font-semibold text-amber-200 tabular-nums"
                >
                  {unresolvedPredictionEvents.length} open
                </span>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
