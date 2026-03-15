/**
 * BingoApprovalSheet — slide-up bottom sheet for host bingo mark review.
 *
 * Dismiss: swipe down > 100px OR tap the dark backdrop.
 * Each pending mark row exits with a height collapse + fade when
 * the host approves or denies it. When the last mark is resolved
 * the sheet shows "All clear!" and auto-closes after 1.2 seconds.
 */

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, X } from 'lucide-react'
import Avatar from '../Avatar'
import type { PendingMark } from '../../hooks/useBingoApprovals'

interface Props {
  marks: PendingMark[]
  onApprove: (markId: string) => Promise<void>
  onDeny: (markId: string) => Promise<void>
  onDismiss: () => void
}

export default function BingoApprovalSheet({ marks, onApprove, onDeny, onDismiss }: Props) {
  const [actingOn, setActingOn] = useState<string | null>(null)
  const [allClear, setAllClear] = useState(false)
  const hadMarksRef = useRef(marks.length > 0)

  // Detect transition from non-empty → empty → auto-close
  useEffect(() => {
    if (marks.length > 0) {
      hadMarksRef.current = true
    } else if (hadMarksRef.current) {
      setAllClear(true)
      const timer = setTimeout(onDismiss, 1200)
      return () => clearTimeout(timer)
    }
  }, [marks.length, onDismiss])

  async function handleApprove(markId: string) {
    if (actingOn) return
    setActingOn(markId)
    try {
      await onApprove(markId)
    } finally {
      setActingOn(null)
    }
  }

  async function handleDeny(markId: string) {
    if (actingOn) return
    setActingOn(markId)
    try {
      await onDeny(markId)
    } finally {
      setActingOn(null)
    }
  }

  return (
    // Backdrop — tap to dismiss
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onDismiss}
    >
      {/* Bottom sheet — drag down to dismiss */}
      <motion.div
        className="w-full max-w-md bg-[#0A0E27] border border-white/10 rounded-t-3xl pb-10 pt-3 max-h-[80vh] flex flex-col"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        drag="y"
        dragConstraints={{ top: 0 }}
        dragElastic={0.2}
        onDragEnd={(_, info) => {
          if (info.offset.y > 100) onDismiss()
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center mb-3">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 mb-4 flex-shrink-0">
          <h2 className="text-base font-bold text-white">Pending Claims</h2>
          {marks.length > 0 && (
            <span className="text-xs font-bold text-deep-navy bg-oscar-gold px-2.5 py-1 rounded-full">
              {marks.length}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 px-4">
          {allClear ? (
            // All clear state
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center justify-center py-8 gap-3"
            >
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                <Check size={22} className="text-emerald-400" strokeWidth={2.5} />
              </div>
              <p className="text-sm font-semibold text-white">All clear!</p>
              <p className="text-xs text-white/40">No more pending marks</p>
            </motion.div>
          ) : marks.length === 0 ? (
            // Empty state (shouldn't normally show since button hides at 0)
            <p className="text-sm text-white/30 text-center py-8">No pending claims</p>
          ) : (
            <div className="space-y-2 pb-2">
              <AnimatePresence initial={false}>
                {marks.map((mark) => (
                  <motion.div
                    key={mark.markId}
                    initial={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                    transition={{ duration: 0.22, ease: 'easeInOut' }}
                    className="overflow-hidden"
                  >
                    <div className="backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-3.5 flex items-start gap-3">
                      {/* Player avatar */}
                      <div className="flex-shrink-0 mt-0.5">
                        <Avatar avatarId={mark.playerAvatarId} size="sm" />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-white/80 mb-1">
                          {mark.playerName}
                        </p>
                        <p className="text-sm text-white leading-snug">
                          {mark.squareText}
                        </p>
                      </div>

                      {/* Approve / Deny buttons */}
                      <div className="flex gap-2 flex-shrink-0 mt-0.5">
                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          disabled={!!actingOn}
                          onClick={() => handleDeny(mark.markId)}
                          className={[
                            'w-9 h-9 rounded-xl flex items-center justify-center transition-all',
                            actingOn === mark.markId
                              ? 'bg-white/5'
                              : 'bg-red-500/15 border border-red-500/25 active:bg-red-500/25',
                          ].join(' ')}
                          aria-label="Deny"
                        >
                          {actingOn === mark.markId ? (
                            <div className="w-3.5 h-3.5 border border-white/30 border-t-white/60 rounded-full animate-spin" />
                          ) : (
                            <X size={16} className="text-red-400" strokeWidth={2.5} />
                          )}
                        </motion.button>

                        <motion.button
                          whileTap={{ scale: 0.9 }}
                          disabled={!!actingOn}
                          onClick={() => handleApprove(mark.markId)}
                          className={[
                            'w-9 h-9 rounded-xl flex items-center justify-center transition-all',
                            actingOn === mark.markId
                              ? 'bg-white/5'
                              : 'bg-emerald-500/20 border border-emerald-500/30 active:bg-emerald-500/30',
                          ].join(' ')}
                          aria-label="Approve"
                        >
                          {actingOn === mark.markId ? (
                            <div className="w-3.5 h-3.5 border border-white/30 border-t-white/60 rounded-full animate-spin" />
                          ) : (
                            <Check size={16} className="text-emerald-400" strokeWidth={2.5} />
                          )}
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
