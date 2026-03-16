/**
 * SpotlightView — the Home tab content when a category spotlight is active.
 *
 * NOT a full-screen overlay — this replaces the normal LiveHomeView content
 * inside the Home tab so chat remains visible and functional.
 *
 * SUSPENSE mode: all nominees shown, host can tap to select winner(s)
 * REVEAL mode:   winning card(s) highlighted, losers faded, host closes manually
 *
 * TIE SUPPORT:
 *   Host can select 1 nominee for a normal win, or 2 for a tie.
 *   Selecting 2 shows a warning: "Are you sure there was a tie? This is unusual."
 *   Confirm triggers onSelectTieWinner with both IDs.
 */

import { type ReactNode, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Check, X } from 'lucide-react'
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
  onSelectTieWinner: (nomineeId1: string, nomineeId2: string) => Promise<void>
  onClose: () => void
  chatSection: ReactNode
}

export default function SpotlightView({
  category,
  nomineeData,
  isHost,
  onSelectWinner,
  onSelectTieWinner,
  onClose,
  chatSection,
}: Props) {
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  const winnerNomineeId = category.winner_id
  const tieWinnerNomineeId = category.tie_winner_id
  const viewState = winnerNomineeId != null ? 'reveal' : 'suspense'
  const isTie = selectedIds.length === 2
  const hasSelection = selectedIds.length > 0

  // Reset selection if winner is set while selecting
  useEffect(() => {
    if (winnerNomineeId) setSelectedIds([])
  }, [winnerNomineeId])

  function handleNomineeTap(nomineeId: string) {
    if (!isHost || isSubmitting || viewState !== 'suspense') return

    setSelectedIds((prev) => {
      if (prev.includes(nomineeId)) {
        return prev.filter((id) => id !== nomineeId)
      }
      if (prev.length >= 2) return prev
      return [...prev, nomineeId]
    })
  }

  async function handleConfirm() {
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      if (selectedIds.length === 1) {
        await onSelectWinner(selectedIds[0])
      } else if (selectedIds.length === 2) {
        await onSelectTieWinner(selectedIds[0], selectedIds[1])
      }
      setSelectedIds([])
    } finally {
      setIsSubmitting(false)
    }
  }

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
            Next up
          </motion.button>
        )}
      </div>

      {/* Selection hint for host in suspense mode */}
      {isHost && viewState === 'suspense' && !hasSelection && (
        <p className="text-[10px] text-white/25 px-5 mb-1">
          Tap a nominee to select. Tap two for a tie.
        </p>
      )}

      {/* Nominee list — scrollable, capped so chat always gets meaningful space */}
      <div className="px-4 space-y-1 overflow-y-auto flex-shrink-0" style={{ maxHeight: '35vh' }}>
        <AnimatePresence initial={false}>
          {nomineeData.map((nd) => {
            const isSelected = selectedIds.includes(nd.nominee.id)
            const nomineeState =
              viewState === 'suspense'
                ? isSelected ? 'selected' : 'normal'
                : (nd.nominee.id === winnerNomineeId || nd.nominee.id === tieWinnerNomineeId)
                  ? 'winner'
                  : 'loser'
            return (
              <SpotlightNomineeCard
                key={nd.nominee.id}
                nominee={nd.nominee}
                myConfidence={nd.myConfidence}
                myDraftPick={nd.myDraftPick}
                isHost={isHost}
                onSelect={() => handleNomineeTap(nd.nominee.id)}
                state={nomineeState}
                disabled={isSubmitting || (selectedIds.length >= 2 && !isSelected)}
              />
            )
          })}
        </AnimatePresence>
      </div>

      {/* Confirm prompt — suspense mode only */}
      {viewState === 'suspense' && (
        <div className="px-4 mt-2 flex-shrink-0">
          <AnimatePresence>
            {hasSelection && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                className="p-3 rounded-xl bg-oscar-gold/10 border border-oscar-gold/30 space-y-2"
              >
                {/* Tie warning */}
                {isTie && (
                  <div className="flex items-start gap-2 px-2 py-2 bg-amber-500/10 border border-amber-500/25 rounded-lg">
                    <AlertTriangle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-amber-300 leading-tight">
                        Are you sure there was a tie?
                      </p>
                      <p className="text-[10px] text-white/35 mt-0.5">
                        This is unusual. Both nominees will be marked as winners.
                      </p>
                    </div>
                  </div>
                )}

                {/* Selection summary */}
                <p className="text-xs text-white/60">
                  {isTie ? (
                    <>
                      Confirm tie between{' '}
                      <span className="text-white font-medium">
                        {nomineeData.find((nd) => nd.nominee.id === selectedIds[0])?.nominee.name}
                      </span>
                      {' and '}
                      <span className="text-white font-medium">
                        {nomineeData.find((nd) => nd.nominee.id === selectedIds[1])?.nominee.name}
                      </span>
                      ?
                    </>
                  ) : (
                    <>
                      Confirm{' '}
                      <span className="text-white font-medium">
                        {(() => {
                          const nd = nomineeData.find((nd) => nd.nominee.id === selectedIds[0])
                          if (!nd) return 'Unknown'
                          return nd.nominee.type === 'film'
                            ? nd.nominee.film_name || nd.nominee.name
                            : nd.nominee.name
                        })()}
                      </span>{' '}
                      as winner?
                    </>
                  )}
                </p>

                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedIds([])}
                    disabled={isSubmitting}
                    className="flex-1 py-2 rounded-xl bg-white/10 text-white/70 text-sm font-medium disabled:opacity-40"
                  >
                    Cancel
                  </button>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleConfirm}
                    disabled={isSubmitting}
                    className={[
                      'flex-1 py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 disabled:opacity-60',
                      isTie
                        ? 'bg-amber-500 text-deep-navy'
                        : 'bg-oscar-gold text-deep-navy',
                    ].join(' ')}
                  >
                    {isSubmitting ? (
                      <div className="w-4 h-4 border-2 border-deep-navy/40 border-t-deep-navy rounded-full animate-spin" />
                    ) : isTie ? (
                      <>
                        <AlertTriangle size={13} strokeWidth={2.5} /> Confirm Tie
                      </>
                    ) : (
                      <>
                        <Check size={13} strokeWidth={3} /> Confirm Winner
                      </>
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
