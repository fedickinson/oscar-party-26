/**
 * Draft — the character and dragon draft.
 *
 * LAYOUT (flex column, full viewport height):
 *
 *   ┌─────────────────────────────┐  ← DraftTimer (flex-shrink-0)
 *   │  Round 2 · Pick 1 · Sarah's │
 *   │  ██████████░░░░░░░   23s    │
 *   ├─────────────────────────────┤
 *   │                             │  ← Entity list (flex-1, overflow-y-auto)
 *   │  [EntityCard] Sinners  10pt │
 *   │  [EntityCard] Demi Moore 8pt│
 *   │  ...                        │
 *   │  [EntityCard] (drafted)     │
 *   ├─────────────────────────────┤
 *   │  My Roster  3/8 picks  ↑   │  ← MyRoster (flex-shrink-0, expands up)
 *   └─────────────────────────────┘
 *
 * SUBSCRIPTION ARCHITECTURE:
 * - useRoomSubscription: updates room in GameContext (current_pick, phase)
 * - useDraft: reads room from context + subscribes to draft_picks
 * No duplicate subscriptions to the same table.
 *
 * PHASE NAVIGATION:
 * When the host auto-transitions to 'confidence' (beat activation), the
 * useRoomSubscription callback updates room.phase in context. The
 * useEffect below catches that and navigates everyone simultaneously.
 */

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Trophy, Flame, Users, Shuffle } from 'lucide-react'
import { useGame } from '../context/GameContext'
import { useRoomSubscription } from '../hooks/useRoom'
import { useDraft } from '../hooks/useDraft'
import DraftTimer from '../components/draft/DraftTimer'
import EntityCard from '../components/draft/EntityCard'
import MyRoster from '../components/draft/MyRoster'
import ConfirmPickModal from '../components/draft/ConfirmPickModal'
import type { DraftEntityWithDetails } from '../types/game'

// ─── Character grouping ───────────────────────────────────────────────────────
//
// Previously grouped by Oscars award lanes (Lead Actors, Supporting
// Actresses, Craft). For this property every
// character would fall through to "Craft", putting all 27 in one bucket.
// Faction is the grouping that actually helps you draft: it is how the board is
// divided, and it makes the shape of your roster legible at a glance.
//
// film_name carries the faction — see the seed migration.

function groupByFaction(entities: DraftEntityWithDetails[]) {
  const map = new Map<string, DraftEntityWithDetails[]>()
  for (const e of entities) {
    const faction = e.film_name || 'Unaligned'
    if (!map.has(faction)) map.set(faction, [])
    map.get(faction)!.push(e)
  }
  for (const list of map.values()) list.sort((a, b) => b.nom_count - a.nom_count)
  // Biggest factions first — that is roughly where the valuable picks are.
  return Array.from(map.entries())
    .map(([label, list]) => ({ label, entities: list }))
    .sort((a, b) => b.entities.length - a.entities.length)
}

export default function Draft() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { room, player, players, loading } = useGame()

  const [selectedEntity, setSelectedEntity] = useState<DraftEntityWithDetails | null>(null)
  const [isConfirming, setIsConfirming] = useState(false)
  const [pickError, setPickError] = useState<string | null>(null)
  const [isAutoDrafting, setIsAutoDrafting] = useState(false)

  // Subscribe to room row changes (current_pick, phase) — updates GameContext
  useRoomSubscription(room?.id)

  const {
    entities,
    availableEntities,
    myRoster,
    beatsByEntityId,
    picksMap,
    isMyTurn,
    isDraftComplete,
    currentDrafter,
    roundInfo,
    timeRemaining,
    isLoading,
    myTotalPickSlots,
    draftSubPhase,
    makePick,
    devAutoPickAll,
  } = useDraft(room?.id)

  // Navigate when phase changes — same pattern as Room.tsx
  useEffect(() => {
    if (!room || !code) return
    if (room.phase === 'confidence') navigate(`/room/${code}/confidence`)
    if (room.phase === 'live') navigate(`/room/${code}/live`)
  }, [room?.phase, code, navigate])

  // Guard: no session
  useEffect(() => {
    if (!loading && !player) navigate('/')
  }, [loading, player, navigate])

  // ─── Confirm pick handler ─────────────────────────────────────────────────

  async function handleConfirmPick() {
    if (!selectedEntity) return
    setIsConfirming(true)
    setPickError(null)
    try {
      await makePick(selectedEntity.id)
      setSelectedEntity(null)
    } catch (e) {
      setPickError(e instanceof Error ? e.message : 'Pick failed. Try again.')
    } finally {
      setIsConfirming(false)
    }
  }

  // ─── Loading ──────────────────────────────────────────────────────────────

  if (loading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="w-8 h-8 border-2 border-[var(--t-pending)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!room || !player) return null

  const draftedEntities = entities.filter((e) => picksMap.has(e.id))

  const availablePeople = availableEntities.filter((e) => e.type === 'person')
  const availableDragons = availableEntities.filter((e) => e.type === 'film')
  const draftedPeople = draftedEntities.filter((e) => e.type === 'person')
  const draftedDragons = draftedEntities.filter((e) => e.type === 'film')

  const isDragonPhase = draftSubPhase === 'films'
  const activeAvailable = isDragonPhase ? availableDragons : availablePeople
  const activeDrafted = isDragonPhase ? draftedDragons : draftedPeople

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      {/*
        Full-height flex column.
        App.tsx has py-6 (3rem total) on its container, so we subtract that
        to get exactly the remaining viewport height.
      */}
      <div className="flex flex-col min-w-0" style={{ height: 'calc(100dvh - 1.5rem)', marginBottom: '-1.5rem' }}>

        {/* ── Top bar ── */}
        <DraftTimer
          timeRemaining={timeRemaining}
          totalTime={45}
          currentDrafter={currentDrafter}
          isMyTurn={isMyTurn}
          round={roundInfo.round}
          pickInRound={roundInfo.pickInRound}
          isDraftComplete={isDraftComplete}
        />

        {/* ── "Waiting" banner (when not my turn) ── */}
        {!isMyTurn && !isDraftComplete && currentDrafter && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="relief-glass text-center min-h-[44px] py-2.5 px-4 mb-2 rounded-xl text-sm flex-shrink-0 text-[var(--t-text-dim)]"
          >
            <motion.span
              animate={{ opacity: [1, 0.5, 1] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
              className="inline-flex items-center gap-1.5"
            >
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: currentDrafter.color, opacity: 0.7 }}
              />
              Waiting for{' '}
              <span className="font-semibold text-[var(--t-text-muted)]">{currentDrafter.name}</span>{' '}
              to pick…
            </motion.span>
          </motion.div>
        )}

        {/* ── Sub-phase header ── */}
        {!isDraftComplete && (
          <motion.div
            key={draftSubPhase}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="relief-glass flex items-center justify-between flex-shrink-0 px-3 py-2 mb-2 min-h-[52px] rounded-xl"
          >
            <div className="flex items-center gap-2">
              {isDragonPhase
                ? <Flame size={16} className="text-[var(--t-pending)]" />
                : <Users size={16} className="text-[var(--t-ornament)]" />
              }
              <span className="font-display text-xs font-semibold text-[var(--t-text)] uppercase tracking-[0.14em]">
                {isDragonPhase ? 'Claim a dragon' : 'Draft your characters'}
              </span>
              <span className="hidden min-[360px]:block h-px w-8" style={{ backgroundColor: 'var(--t-ornament-muted)' }} aria-hidden />
            </div>
            {devAutoPickAll && (
              <button
                onClick={async () => {
                  setIsAutoDrafting(true)
                  await devAutoPickAll()
                  setIsAutoDrafting(false)
                }}
                disabled={isAutoDrafting}
                className="flex min-h-[44px] items-center gap-1 text-xs font-medium text-[var(--t-pending)] border px-3 py-2 rounded-full disabled:opacity-40"
                style={{ backgroundColor: 'var(--t-pending-soft)', borderColor: 'var(--t-pending)' }}
              >
                <Shuffle size={12} />
                {isAutoDrafting ? 'Selecting…' : 'Auto Select'}
              </button>
            )}
          </motion.div>
        )}

        {/* ── Entity list (scrollable) ── */}
        <div className="flex-1 overflow-y-auto">
          <div className="pb-2">

            {isDraftComplete ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-10"
              >
                <Trophy size={48} className="text-[var(--t-ornament)] mx-auto mb-3" />
                <p className="font-display text-xl font-bold text-[var(--t-text)] mb-1">Roster complete</p>
                <p className="text-[var(--t-text-muted)] text-sm">Taking you to choose your bets…</p>
              </motion.div>
            ) : isDragonPhase ? (
              /* ── Dragons sub-draft ── */
              <>
                {isMyTurn && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-xs text-[var(--t-pending)] uppercase tracking-widest px-1 mb-2"
                  >
                    Tap to claim
                  </motion.p>
                )}
                <div className="space-y-2.5">
                  {activeAvailable.map((entity, i) => (
                    <EntityCard
                      key={entity.id}
                      entity={entity}
                      beats={beatsByEntityId.get(entity.id) ?? []}
                      isAvailable={true}
                      isMyTurn={isMyTurn}
                      draftedBy={null}
                      onTap={() => { if (isMyTurn) setSelectedEntity(entity) }}
                      index={i}
                    />
                  ))}
                </div>
              </>
            ) : (
              /* ── People sub-draft ── */
              <>
                {isMyTurn && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-xs text-[var(--t-pending)] uppercase tracking-widest px-1 mb-2"
                  >
                    Tap to claim
                  </motion.p>
                )}
                {groupByFaction(activeAvailable).map((group) => (
                  <div key={group.label} className="mb-3">
                    <p className="font-display text-xs text-[var(--t-text-dim)] uppercase tracking-widest px-1 mb-1.5">
                      {group.label}
                    </p>
                    <div className="space-y-2.5">
                      {group.entities.map((entity, i) => (
                        <EntityCard
                          key={entity.id}
                          entity={entity}
                          beats={beatsByEntityId.get(entity.id) ?? []}
                          isAvailable={true}
                          isMyTurn={isMyTurn}
                          draftedBy={null}
                          onTap={() => { if (isMyTurn) setSelectedEntity(entity) }}
                          index={i}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* Drafted entities — greyed, pinned below available */}
            {!isDraftComplete && activeDrafted.length > 0 && (
              <div className="mt-3">
                <p className="font-display text-xs text-[var(--t-negative)] uppercase tracking-widest px-1 mb-1.5">
                  Claimed ({activeDrafted.length})
                </p>
                <div className="space-y-2.5">
                  {activeDrafted.map((entity, i) => (
                    <EntityCard
                      key={entity.id}
                      entity={entity}
                      beats={beatsByEntityId.get(entity.id) ?? []}
                      isAvailable={false}
                      isMyTurn={false}
                      draftedBy={players.find((p) => p.id === picksMap.get(entity.id)) ?? null}
                      onTap={() => {}}
                      index={activeAvailable.length + i}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Bottom roster sheet ── */}
        <MyRoster
          roster={myRoster}
          totalPickSlots={myTotalPickSlots}
          playerColor={player.color}
          beatsByEntityId={beatsByEntityId}
        />
      </div>

      {/* ── Confirm pick modal ── */}
      <AnimatePresence>
        {selectedEntity && (
          <ConfirmPickModal
            entity={selectedEntity}
            beats={beatsByEntityId.get(selectedEntity.id) ?? []}
            onConfirm={handleConfirmPick}
            onCancel={() => {
              if (!isConfirming) {
                setSelectedEntity(null)
                setPickError(null)
              }
            }}
            isSubmitting={isConfirming}
          />
        )}
      </AnimatePresence>

      {/* ── Pick error toast ── */}
      <AnimatePresence>
        {pickError && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="relief-glass fixed bottom-24 left-4 right-4 max-w-md mx-auto text-[var(--t-negative)] text-sm font-medium px-4 py-3 rounded-xl text-center z-40"
            style={{ backgroundColor: 'var(--t-negative-soft)', borderColor: 'var(--t-negative)' }}
          >
            {pickError}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
