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
 * PHASE NAVIGATION:
 * useRoomSubscription watches room.phase. When host locks → phase = 'live' → everyone navigates.
 *
 * NUMBER PICKER:
 * A single ConfidenceNumberPicker bottom sheet, controlled by `pickerCategoryId` state.
 * AnimatePresence handles slide-in/out.
 */

import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Shuffle } from 'lucide-react'
import { useGame } from '../context/GameContext'
import { useRoomSubscription } from '../hooks/useRoom'
import { useConfidence } from '../hooks/useConfidence'
import CategoryPickCard from '../components/confidence/CategoryPickCard'
import ConfidenceNumberPicker from '../components/confidence/ConfidenceNumberPicker'
import PicksReveal from '../components/confidence/PicksReveal'
import SubmitStatus from '../components/confidence/SubmitStatus'
import PhaseExplainer from '../components/PhaseExplainer'

const TIER_LABELS: Record<number, string> = {
  1: 'Major Awards',
  2: 'Prestige Craft',
  3: 'Technical & Performance',
  4: 'Specialty',
  5: 'Short Films',
}

const TIER_LABEL_COLORS: Record<number, string> = {
  1: 'text-oscar-gold',
  2: 'text-violet-400',
  3: 'text-sky-400',
  4: 'text-emerald-400',
  5: 'text-white/40',
}

export default function Confidence() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { room, player, players, loading } = useGame()

  const [pickerCategoryId, setPickerCategoryId] = useState<number | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLocking, setIsLocking] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [showExplainer, setShowExplainer] = useState(true)

  useRoomSubscription(room?.id)

  const {
    categories,
    localPicks,
    allSubmittedPicks,
    submittedPlayerIds,
    isComplete,
    myHasSubmitted,
    isLoading,
    assignNominee,
    assignConfidence,
    submitPicks,
    lockPicks,
  } = useConfidence(room?.id)

  // Phase navigation
  useEffect(() => {
    if (!room || !code) return
    if (room.phase === 'live') navigate(`/room/${code}/live`)
    if (room.phase === 'lobby') navigate(`/room/${code}`)
  }, [room?.phase, code, navigate])

  // Guard: no session
  useEffect(() => {
    if (!loading && !player) navigate('/')
  }, [loading, player, navigate])

  // ── Handlers ──────────────────────────────────────────────────────────────

  async function handleSubmit() {
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
    const shuffledConfidence = Array.from({ length: 24 }, (_, i) => i + 1).sort(
      () => Math.random() - 0.5,
    )
    categories.forEach((cat, i) => {
      const randomNominee = cat.nominees[Math.floor(Math.random() * cat.nominees.length)]
      if (randomNominee) assignNominee(cat.id, randomNominee.id)
      assignConfidence(cat.id, shuffledConfidence[i])
    })
  }

  async function handleLock() {
    setIsLocking(true)
    try {
      await lockPicks()
    } finally {
      setIsLocking(false)
    }
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="w-8 h-8 border-2 border-oscar-gold border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!room || !player) return null

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

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      {showExplainer && (
        <PhaseExplainer phase="confidence" onContinue={() => setShowExplainer(false)} />
      )}

      <div className="flex flex-col" style={{ height: 'calc(100vh - 3rem)' }}>

        {/* ── Header ── */}
        <div className="flex-shrink-0 mb-3">
          <div className="backdrop-blur-lg bg-white/10 border border-white/15 rounded-2xl px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-white/40 uppercase tracking-widest">
                Prestige Picks
              </p>
              <p className="text-sm font-semibold text-white mt-0.5">
                {myHasSubmitted
                  ? 'Submitted — waiting for others'
                  : 'Pick a nominee + prestige for each category'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {import.meta.env.DEV && !myHasSubmitted && (
                <button
                  onClick={handleRandomFill}
                  className="flex items-center gap-1 text-xs font-medium text-amber-400 bg-amber-400/10 border border-amber-400/30 px-2 py-1 rounded-full"
                >
                  <Shuffle size={12} />
                  Random
                </button>
              )}
              {!myHasSubmitted && (
                <span className="text-xs font-mono text-white/40 bg-white/5 px-2 py-1 rounded-full tabular-nums">
                  {completedPickCount}/{categories.length}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Scrollable content ── */}
        <div className="flex-1 overflow-y-auto">
          <div className="pb-2">

            {!myHasSubmitted ? (
              // PICKING MODE — categories grouped by tier
              tiers.map((tier) => (
                <div key={tier}>
                  <p
                    className={[
                      'text-xs uppercase tracking-widest px-1 mt-3 mb-1.5',
                      TIER_LABEL_COLORS[tier] ?? 'text-white/30',
                    ].join(' ')}
                  >
                    {TIER_LABELS[tier] ?? `Tier ${tier}`}
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
                <p className="text-xs text-white/40 uppercase tracking-widest px-1 mb-3">
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

        {/* ── Bottom status / submit bar ── */}
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
      </div>

      {/* ── Confidence number picker sheet ── */}
      <AnimatePresence>
        {pickerCategory && (
          <ConfidenceNumberPicker
            key={pickerCategory.id}
            category={pickerCategory}
            localPicks={localPicks}
            categories={categories}
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
            className="fixed bottom-28 left-4 right-4 max-w-md mx-auto bg-red-500/90 text-white text-sm font-medium px-4 py-3 rounded-xl text-center z-40"
          >
            {submitError}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
