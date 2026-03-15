/**
 * SpotlightView — the Home tab content when a category spotlight is active.
 *
 * NOT a full-screen overlay — this replaces the normal LiveHomeView content
 * inside the Home tab so chat remains visible and functional.
 *
 * SUSPENSE mode: all nominees shown, host can tap to confirm winner
 * REVEAL mode:   winning card highlighted, losers faded, auto-closes after 8s (host only)
 */

import { type ReactNode, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import SpotlightHeader from './SpotlightHeader'
import SpotlightNomineeCard from './SpotlightNomineeCard'
import type { CategoryRow, NomineeRow } from '../../types/database'

export interface SpotlightNomineeData {
  nominee: NomineeRow
  myConfidence: number | null
  myDraftPick: boolean
}

interface Props {
  category: CategoryRow
  nomineeData: SpotlightNomineeData[]
  isHost: boolean
  onSelectWinner: (nomineeId: string) => Promise<void>
  onClose: () => void
  chatSection: ReactNode
}

export default function SpotlightView({
  category,
  nomineeData,
  isHost,
  onSelectWinner,
  onClose,
  chatSection,
}: Props) {
  const [confirming, setConfirming] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const winnerNomineeId = category.winner_id
  const viewState = winnerNomineeId != null ? 'reveal' : 'suspense'

  // No auto-close — host taps "Next" to dismiss the spotlight

  // Reset confirm selection if winner is set while confirming
  useEffect(() => {
    if (winnerNomineeId) setConfirming(null)
  }, [winnerNomineeId])

  async function handleConfirm() {
    if (!confirming || isSubmitting) return
    setIsSubmitting(true)
    try {
      await onSelectWinner(confirming)
      setConfirming(null)
    } finally {
      setIsSubmitting(false)
    }
  }

  const confirmingNomineeData = nomineeData.find((nd) => nd.nominee.id === confirming)

  return (
    <div className="h-full flex flex-col max-w-md mx-auto">
      {/* Header row */}
      <div className="flex items-start gap-2 px-4 pt-4 pb-2 flex-shrink-0">
        <SpotlightHeader
          categoryName={category.name}
          tier={category.tier}
          points={category.points}
          state={viewState}
        />
        {isHost && !winnerNomineeId && (
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={onClose}
            disabled={isSubmitting}
            className="mt-0.5 w-8 h-8 rounded-full bg-white/8 border border-white/10 flex items-center justify-center flex-shrink-0"
          >
            <X size={14} className="text-white/50" />
          </motion.button>
        )}
        {isHost && winnerNomineeId && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onClose}
            className="mt-0.5 px-3 py-1.5 rounded-xl bg-white/10 border border-white/15 text-white/70 text-xs font-semibold flex-shrink-0"
          >
            Next
          </motion.button>
        )}
      </div>

      {/* Nominee list — scrollable, capped so chat always gets meaningful space */}
      <div className="px-4 space-y-1 overflow-y-auto flex-shrink-0" style={{ maxHeight: '35vh' }}>
        <AnimatePresence initial={false}>
          {nomineeData.map((nd) => {
            const nomineeState =
              viewState === 'suspense'
                ? 'normal'
                : nd.nominee.id === winnerNomineeId
                  ? 'winner'
                  : 'loser'
            return (
              <SpotlightNomineeCard
                key={nd.nominee.id}
                nominee={nd.nominee}
                myConfidence={nd.myConfidence}
                myDraftPick={nd.myDraftPick}
                isHost={isHost}
                onSelect={() => setConfirming(nd.nominee.id)}
                state={nomineeState}
              />
            )
          })}
        </AnimatePresence>
      </div>

      {/* Confirm prompt — suspense mode only */}
      {viewState === 'suspense' && (
        <div className="px-4 mt-2 flex-shrink-0">
          <AnimatePresence>
            {confirming && confirmingNomineeData && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                className="p-3 rounded-xl bg-oscar-gold/10 border border-oscar-gold/30"
              >
                <p className="text-xs text-white/60 mb-2">
                  Confirm{' '}
                  <span className="text-white font-medium">
                    {confirmingNomineeData.nominee.type === 'film'
                      ? confirmingNomineeData.nominee.film_name || confirmingNomineeData.nominee.name
                      : confirmingNomineeData.nominee.name}
                  </span>{' '}
                  as winner?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirming(null)}
                    disabled={isSubmitting}
                    className="flex-1 py-2 rounded-xl bg-white/10 text-white/70 text-sm font-medium disabled:opacity-40"
                  >
                    Cancel
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleConfirm}
                    disabled={isSubmitting}
                    className="flex-1 py-2 rounded-xl bg-oscar-gold text-deep-navy text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-60"
                  >
                    {isSubmitting ? (
                      <div className="w-4 h-4 border-2 border-deep-navy/40 border-t-deep-navy rounded-full animate-spin" />
                    ) : (
                      'Confirm Winner'
                    )}
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Chat fills remaining vertical space */}
      <div className="flex-1 flex flex-col min-h-0 px-4 pt-2 pb-4 mt-2">
        <p className="text-xs uppercase tracking-wider text-white/35 mb-2 px-1 flex-shrink-0">
          Chat
        </p>
        {chatSection}
      </div>
    </div>
  )
}
