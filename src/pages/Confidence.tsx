/**
 * Confidence — the confidence picks phase.
 *
 * LAYOUT (flex column, full viewport height):
 *
 *   ┌──────────────────────────────────┐  ← Header (flex-shrink-0)
 *   │  Confidence Picks · 0/24         │
 *   ├──────────────────────────────────┤
 *   │                                  │  ← Scrollable content (flex-1)
 *   │  [PICKING MODE]                  │
 *   │  Tier 1 heading                  │
 *   │  [CategoryPickCard] Best Picture │
 *   │  [CategoryPickCard] Best Director│
 *   │  ...                             │
 *   │                                  │
 *   │  [SUBMITTED MODE]                │
 *   │  [PicksReveal] all players' picks│
 *   ├──────────────────────────────────┤
 *   │  [SubmitStatus] progress/submit  │  ← Bottom bar (flex-shrink-0)
 *   └──────────────────────────────────┘
 *
 * ROUTING:
 * PredictionPhase renders this screen for `legacy_ensemble` rooms — the
 * `confidence_allocation` commitment. A player's submit writes only their own
 * confidence_picks rows; it never moves the room.
 *
 * PHASE NAVIGATION:
 * Only the host's lock opens live, and it does so through the capability-gated
 * open_room_live_authorized command. useRoomSubscription watches room.phase,
 * so phase = 'live' arrives over Realtime and every phone navigates together.
 * Nothing here navigates from the action itself.
 *
 * NUMBER PICKER:
 * A single ConfidenceNumberPicker bottom sheet, controlled by `pickerCategoryId` state.
 * AnimatePresence handles slide-in/out.
 */

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Lock, RotateCcw, Shuffle } from 'lucide-react'
import { useGame } from '../context/GameContext'
import { useOperatorAuthority } from '../context/OperatorAuthorityContext'
import { useRoomSubscription } from '../hooks/useRoom'
import { useConfidence } from '../hooks/useConfidence'
import { useShowIdentity } from '../hooks/useShowIdentity'
import { getConfidenceRange } from '../lib/mode-utils'
import { confidencePhaseTitle, confidenceTierLabel } from '../lib/show-identity'
import CategoryPickCard from '../components/confidence/CategoryPickCard'
import ConfidenceNumberPicker from '../components/confidence/ConfidenceNumberPicker'
import PicksReveal from '../components/confidence/PicksReveal'
import SubmitStatus from '../components/confidence/SubmitStatus'
import PhaseExplainer from '../components/PhaseExplainer'

const TIER_LABEL_COLORS: Record<number, string> = {
  1: 'text-[var(--t-pending)]',
  2: 'text-[var(--t-text-muted)]',
  3: 'text-[var(--t-ashlar)]',
  4: 'text-[var(--t-text-dim)]',
  5: 'text-[var(--t-negative)]',
}

export default function Confidence() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { room, player, players, loading } = useGame()
  const { authority: operatorAuthority } = useOperatorAuthority()
  // Tier names and the header are show copy: the legacy pack keeps its
  // authored strings, every other pack gets numbered tiers.
  const { identity: showIdentity } = useShowIdentity()

  const [pickerCategoryId, setPickerCategoryId] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLocking, setIsLocking] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [showExplainer, setShowExplainer] = useState(true)

  const roomSync = useRoomSubscription(room?.id)

  const {
    categories,
    localPicks,
    allSubmittedPicks,
    submittedPlayerIds,
    isComplete,
    myHasSubmitted,
    isLoading,
    syncError,
    assignNominee,
    assignConfidence,
    setLocalPicksDirectly,
    submitPicks,
    lockPicks,
    retrySync,
  } = useConfidence(room?.id)

  // Phase navigation
  useEffect(() => {
    if (!room || !code || roomSync.isLoading || roomSync.syncError != null) return
    if (room.phase === 'live') navigate(`/room/${code}/live`)
    if (room.phase === 'lobby') navigate(`/room/${code}`)
  }, [room?.phase, roomSync.isLoading, roomSync.syncError, code, navigate])

  // Guard: no session
  useEffect(() => {
    if (!loading && !player) navigate('/')
  }, [loading, player, navigate])

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (roomSync.isLoading || roomSync.syncError != null) {
      setSubmitError('The shared room record must synchronize before picks can be submitted.')
      return
    }
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      await submitPicks()
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Submit failed. Try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleRandomFill() {
    // Build the full picks map in one pass to avoid stale-closure issues with
    // sequential setLocalPicks calls that each read from the same snapshot.
    const range = getConfidenceRange(categories.length)
    const shuffledConfidence = Array.from({ length: range }, (_, i) => i + 1).sort(
      () => Math.random() - 0.5,
    )
    const newPicks: import('../hooks/useConfidence').LocalPicksMap = {}
    categories.forEach((cat, i) => {
      const randomNominee = cat.nominees[Math.floor(Math.random() * cat.nominees.length)]
      newPicks[cat.id] = {
        nominee_id: randomNominee?.id ?? null,
        confidence: shuffledConfidence[i],
      }
    })
    // Replace the entire localPicks map in a single setState call so every
    // category gets both a nominee and a unique confidence number.
    setLocalPicksDirectly(newPicks)
  }

  async function handleLock() {
    if (roomSync.isLoading || roomSync.syncError != null) {
      setSubmitError('The shared room record must synchronize before the show can start.')
      return
    }
    if (!operatorAuthority.enabled) {
      setSubmitError(operatorAuthority.message ?? 'Current operator authority is required.')
      return
    }
    setIsLocking(true)
    setSubmitError(null)
    try {
      await lockPicks()
      // No navigate() here. open_room_live_authorized writes the phase, the
      // room subscription delivers it, and every phone moves together.
    } catch (e) {
      // Auto-fill and the phase command both fail closed. Surface the reason
      // instead of leaving the host tapping a button that silently does
      // nothing.
      setSubmitError(e instanceof Error ? e.message : 'The show could not start. Try again.')
    } finally {
      setIsLocking(false)
    }
  }

  const sharedSyncError = roomSync.syncError ?? syncError

  if (!loading && room && player && sharedSyncError) {
    return (
      <div className="mx-auto flex min-h-[80vh] max-w-md items-start px-4 py-6">
        <section
          className="material-stone relief-inset w-full rounded-2xl p-4"
          role="alert"
          aria-live="assertive"
        >
          <p className="font-display text-xs uppercase tracking-widest text-[var(--t-pending)]">
            Prediction ledger unavailable
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--t-text-muted)]">
            {sharedSyncError} Submitting or closing picks stays disabled until the room record is current.
          </p>
          <button
            type="button"
            onClick={() => {
              roomSync.retrySync()
              retrySync()
            }}
            className="mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-[var(--t-line)] bg-[var(--t-surface)] px-4 text-sm font-bold text-[var(--t-text)]"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            Try again
          </button>
        </section>
      </div>
    )
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading || roomSync.isLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="w-8 h-8 border-2 border-[var(--t-pending)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!room || !player) return null

  const confidenceRange = getConfidenceRange(categories.length)

  // ── Derived ────────────────────────────────────────────────────────────────

  // A pick is "complete" only when both a nominee AND a confidence number are assigned.
  // We track the two intermediate states separately to drive the guidance UI.
  const nomineePickCount = categories.filter((cat) => localPicks[cat.id]?.nominee_id != null).length
  const completedPickCount = categories.filter((cat) => {
    const pick = localPicks[cat.id]
    return pick?.nominee_id != null && pick?.confidence != null
  }).length
  const missingConfidenceCount = nomineePickCount - completedPickCount

  // Group categories by tier, preserving display_order within each
  const tiers = [...new Set(categories.map((c) => c.tier))].sort()
  const categoriesByTier: Record<number, typeof categories> = {}
  tiers.forEach((tier) => {
    categoriesByTier[tier] = categories.filter((c) => c.tier === tier)
  })

  const pickerCategory =
    pickerCategoryId != null
      ? (categories.find((c) => c.id === pickerCategoryId) ?? null)
      : null

  // A pack may authorize a room without authoring any predictions: the
  // activation gate requires bingo squares, entities and beats, not a slate.
  // There is then nothing to submit, so the ordinary submit-then-lock path
  // would leave the room stranded in the prediction phase with no way to open
  // live. The host keeps the phase command; nobody is asked for picks.
  const slateIsEmpty = categories.length === 0
  const showOperatorAuthorityNotice =
    player.is_host && !operatorAuthority.enabled && operatorAuthority.message != null

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {showExplainer && (
        <PhaseExplainer phase="confidence" onContinue={() => setShowExplainer(false)} confidenceRange={confidenceRange} />
      )}

      <div className="flex flex-col min-w-0" style={{ height: 'calc(100dvh - 1.5rem)', marginBottom: '-1.5rem' }}>

        {/* ── Header ── */}
        <div className="flex-shrink-0 mb-3">
          <div className="relief-glass rounded-2xl px-4 py-3 flex items-center justify-between gap-3">
            <div>
              <p className="font-display text-xs text-[var(--t-pending)] uppercase tracking-[0.16em]">
                {confidencePhaseTitle(showIdentity)}
              </p>
              <p className="text-sm font-semibold text-[var(--t-text)] mt-0.5">
                {slateIsEmpty
                  ? 'This room has no prediction slate'
                  : myHasSubmitted
                    ? 'Submitted — waiting for others'
                    : `Choose your winner pick and assign prestige points for all ${categories.length} categories`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {import.meta.env.DEV && !myHasSubmitted && !slateIsEmpty && (
                <button
                  onClick={handleRandomFill}
                  className="flex min-h-[44px] items-center gap-1 text-xs font-medium text-[var(--t-pending)] border px-3 py-2 rounded-full"
                  style={{ backgroundColor: 'var(--t-pending-soft)', borderColor: 'var(--t-pending)' }}
                >
                  <Shuffle size={12} />
                  Random
                </button>
              )}
              {!myHasSubmitted && !slateIsEmpty && (
                <span className="font-display text-xs text-[var(--t-text-muted)] px-2 py-1 rounded-full tabular-nums border" style={{ backgroundColor: 'var(--t-surface)', borderColor: 'var(--t-line-soft)' }}>
                  {completedPickCount}/{categories.length}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Scrollable content ── */}
        <div className="flex-1 overflow-y-auto">
          <div className="pb-2">

            {slateIsEmpty ? (
              // EMPTY SLATE — no authored predictions in this room's pack
              <section className="material-stone relief-inset mt-3 rounded-2xl p-4">
                <p className="font-display text-xs uppercase tracking-widest text-[var(--t-text-dim)]">
                  Nothing to predict
                </p>
                <p className="mt-2 text-sm leading-relaxed text-[var(--t-text-muted)]">
                  This room&apos;s show pack has no prediction categories, so there are no picks to
                  make. The draft and the live board are unaffected.
                </p>
              </section>
            ) : !myHasSubmitted ? (
              // PICKING MODE — categories grouped by tier
              tiers.map((tier) => (
                <div key={tier}>
                  <p
                    className={[
                      'font-display text-xs uppercase tracking-widest px-1 mt-3 mb-1.5',
                      TIER_LABEL_COLORS[tier] ?? 'text-[var(--t-text-dim)]',
                    ].join(' ')}
                  >
                    {confidenceTierLabel(tier, showIdentity)}
                  </p>
                  <div className="space-y-2">
                    {categoriesByTier[tier].map((category, i) => (
                      <CategoryPickCard
                        key={category.id}
                        category={category}
                        pick={localPicks[category.id] ?? { nominee_id: null, confidence: null }}
                        onSelectNominee={(nomineeId) => assignNominee(category.id, nomineeId)}
                        onOpenPicker={() => setPickerCategoryId(category.id)}
                        index={i}
                      />
                    ))}
                  </div>
                </div>
              ))
            ) : (
              // SUBMITTED MODE — show all submitted picks
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="pt-1"
              >
                <p className="font-display text-xs text-[var(--t-text-dim)] uppercase tracking-widest px-1 mb-3">
                  Picks so far
                </p>
                <PicksReveal
                  categories={categories}
                  allSubmittedPicks={allSubmittedPicks}
                  submittedPlayerIds={submittedPlayerIds}
                  players={players}
                  myPlayerId={player.id}
                />
              </motion.div>
            )}

          </div>
        </div>

        {/* ── Host authority notice ── */}
        {showOperatorAuthorityNotice && (
          <p className="flex-shrink-0 px-4 pb-2 text-center text-xs text-[var(--t-pending)]" role="status">
            {operatorAuthority.message}
          </p>
        )}

        {/* ── Bottom status / submit bar ── */}
        {slateIsEmpty ? (
          <div className="relief-glass flex-shrink-0 border-t px-4 pt-4 pb-6" style={{ borderColor: 'var(--t-line)' }}>
            {player.is_host ? (
              <motion.button
                onClick={handleLock}
                disabled={isLocking || !operatorAuthority.enabled}
                whileTap={!isLocking && operatorAuthority.enabled ? { scale: 0.97 } : undefined}
                className={[
                  'flex w-full min-h-[52px] items-center justify-center gap-2 rounded-2xl border py-3 text-base font-bold',
                  !isLocking && operatorAuthority.enabled
                    ? 'material-enamel relief-raised border-[var(--t-personal-device)] text-[var(--t-personal-text)]'
                    : 'border-[var(--t-line-soft)] text-[var(--t-text-dim)]',
                ].join(' ')}
              >
                <Lock size={16} aria-hidden />
                {isLocking ? 'Starting the show' : 'Start the show'}
              </motion.button>
            ) : (
              <p className="text-center text-xs text-[var(--t-pending)]">
                Waiting for the host to start the show…
              </p>
            )}
          </div>
        ) : (
          <SubmitStatus
            players={players}
            submittedPlayerIds={submittedPlayerIds}
            myPlayerId={player.id}
            completedPickCount={completedPickCount}
            missingConfidenceCount={missingConfidenceCount}
            totalCategories={categories.length}
            isComplete={isComplete}
            myHasSubmitted={myHasSubmitted}
            isHost={player.is_host}
            isSubmitting={isSubmitting}
            isLocking={isLocking}
            onSubmit={handleSubmit}
            onLock={handleLock}
          />
        )}
      </div>

      {/* ── Confidence number picker sheet ── */}
      <AnimatePresence>
        {pickerCategory && (
          <ConfidenceNumberPicker
            key={pickerCategory.id}
            category={pickerCategory}
            localPicks={localPicks}
            categories={categories}
            maxConfidence={confidenceRange}
            onAssign={(confidence) => assignConfidence(pickerCategory.id, confidence)}
            onClose={() => setPickerCategoryId(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Submit error toast ── */}
      <AnimatePresence>
        {submitError && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="relief-glass fixed bottom-28 left-4 right-4 max-w-md mx-auto text-[var(--t-negative)] text-sm font-medium px-4 py-3 rounded-xl text-center z-40"
            style={{ backgroundColor: 'var(--t-negative-soft)', borderColor: 'var(--t-negative)' }}
          >
            {submitError}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
