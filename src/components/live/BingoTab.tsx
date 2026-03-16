/**
 * BingoTab — the bingo section of the live phase dashboard.
 *
 * Renders the player's own bingo card, a progress summary, a compact
 * per-player progress row for competitive awareness, and the BingoAlert
 * overlay when a new bingo line is detected.
 *
 * Tapping another player's progress row opens a read-only PeekCardOverlay
 * of their card.
 *
 * HOST ONLY:
 *   When there are pending bingo marks, a "N Pending" button appears below
 *   the card hint. Tapping it opens BingoApprovalSheet — a drag-to-dismiss
 *   bottom sheet for approving or denying each claim.
 *
 * Receives categories and nominees from the parent (already fetched by
 * useScores) so there are no duplicate subscriptions.
 */

import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BookOpen, CheckCircle, ClipboardList } from 'lucide-react'
import { useGame } from '../../context/GameContext'
import { useBingo } from '../../hooks/useBingo'
import { useBingoApprovals } from '../../hooks/useBingoApprovals'
import { useOtherBingoCards } from '../../hooks/useOtherBingoCards'
import BingoCard from '../bingo/BingoCard'
import BingoAlert from '../bingo/BingoAlert'
import BingoApprovalSheet from '../bingo/BingoApprovalSheet'
import PeekCardOverlay from '../bingo/PeekCardOverlay'
import Avatar from '../Avatar'
import type { CategoryRow, NomineeRow } from '../../types/database'
import type { ScoredPlayer } from '../../lib/scoring'
import { BINGO_LINE_PALETTE, BINGO_LINES, FREE_CENTER_INDEX, checkBingo, countBingos } from '../../lib/bingo-utils'

interface Props {
  roomId: string
  isHost: boolean
  categories: CategoryRow[]
  nominees: NomineeRow[]
  leaderboard: ScoredPlayer[]
  onShowExplainer?: () => void
  onSquareApproved?: (squareText: string) => void
}

export default function BingoTab({ roomId, isHost, categories, nominees, leaderboard, onShowExplainer, onSquareApproved }: Props) {
  const { player } = useGame()
  const [peekingPlayerId, setPeekingPlayerId] = useState<string | null>(null)
  const [showApprovals, setShowApprovals] = useState(false)

  const {
    squares,
    marks,
    markedIndices,
    pendingIndices,
    bingoLines,
    bingoCount,
    bingoScore,
    celebrationData,
    isLoading,
    selectedIndex,
    selectSquare,
    deselectSquare,
    markSquare,
    dismissCelebration,
  } = useBingo(roomId, categories, nominees, onSquareApproved)

  const { pendingMarks, approveMark, denyMark } = useBingoApprovals(roomId)

  // Other players' cards for peek feature
  const otherPlayers = useMemo(
    () => leaderboard.filter((e) => e.player.id !== player?.id).map((e) => e.player),
    [leaderboard, player?.id],
  )
  const otherCards = useOtherBingoCards(roomId, otherPlayers)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-7 h-7 border-2 border-oscar-gold border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const approvedCount = markedIndices.size - 1 // exclude free center
  const pendingCount = pendingIndices.size
  const totalSquares = 24 // excludes free center

  return (
    <>
      <div className="flex flex-col items-center gap-4 py-2">

        {/* Progress summary */}
        <div className="w-full backdrop-blur-lg bg-white/8 border border-white/12 rounded-2xl px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-xs text-white/40 uppercase tracking-widest">Bingo Progress</p>
              <p className="text-sm font-semibold text-white">
                {bingoCount > 0
                  ? `${bingoCount} line${bingoCount !== 1 ? 's' : ''} complete`
                  : 'No bingos yet'}
              </p>
            </div>
            <div className="text-right space-y-0.5">
              <p className="text-xs text-white/40">
                {approvedCount}/{totalSquares} marked
                {pendingCount > 0 && (
                  <span className="text-amber-400 ml-1">· {pendingCount} pending</span>
                )}
              </p>
              {bingoScore > 0 && (
                <p className="text-xs font-bold text-oscar-gold">{bingoScore} pts</p>
              )}
            </div>
          </div>

          {/* Bingo line badges — color matches the corresponding line on the card */}
          {bingoCount > 0 && (
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {bingoLines.map((completedLine, i) => {
                const lineIdx = BINGO_LINES.findIndex(
                  (l) => l.length === completedLine.length && l.every((v, j) => v === completedLine[j]),
                )
                const palette = lineIdx >= 0 ? BINGO_LINE_PALETTE[lineIdx] : BINGO_LINE_PALETTE[0]
                return (
                  <span
                    key={i}
                    className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border"
                    style={{ color: palette.text, backgroundColor: palette.bg, borderColor: palette.border }}
                  >
                    <CheckCircle size={9} />
                    BINGO {bingoCount > 1 ? i + 1 : ''}
                  </span>
                )
              })}
            </div>
          )}
        </div>

        {/* The card */}
        <BingoCard
          squares={squares}
          marks={marks}
          bingoLines={bingoLines}
          selectedIndex={selectedIndex}
          onSelect={selectSquare}
          onDeselect={deselectSquare}
          onConfirm={markSquare}
        />

        {/* Hint text */}
        <p className="text-xs text-white/25 text-center px-4">
          Italic squares auto-mark when the condition is met.
          Others need host approval.
        </p>

        {/* Host: pending approvals button */}
        <AnimatePresence>
          {isHost && pendingMarks.length > 0 && (
            <motion.div
              key="approvals-btn"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="w-full"
            >
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowApprovals(true)}
                className="w-full flex items-center justify-between px-4 py-3 backdrop-blur-lg bg-amber-500/10 border border-amber-500/25 rounded-2xl"
              >
                <div className="flex items-center gap-2.5">
                  <ClipboardList size={16} className="text-amber-400" />
                  <span className="text-sm font-semibold text-white">Pending Approvals</span>
                </div>
                <span className="text-xs font-bold text-deep-navy bg-amber-400 px-2.5 py-1 rounded-full">
                  {pendingMarks.length}
                </span>
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Other players' bingo progress — tappable to peek */}
        {leaderboard.length > 1 && (
          <div className="w-full backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl px-4 py-3">
            <p className="text-xs text-white/40 uppercase tracking-widest mb-3">
              Other Players
            </p>
            <div className="space-y-1">
              {leaderboard
                .filter((entry) => entry.player.id !== player?.id)
                .map((entry) => {
                  const otherCard = otherCards.find((c) => c.player.id === entry.player.id)
                  let peekedBingos = 0
                  let peekedApproved = 0
                  if (otherCard) {
                    const mi = new Set<number>([FREE_CENTER_INDEX])
                    otherCard.marks
                      .filter((m) => m.status === 'approved')
                      .forEach((m) => mi.add(m.square_index))
                    const { lines } = checkBingo(mi, [])
                    peekedBingos = countBingos(lines)
                    peekedApproved = otherCard.marks.filter((m) => m.status === 'approved').length
                  }

                  return (
                    <motion.button
                      key={entry.player.id}
                      whileTap={{ scale: 0.97 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                      onClick={() => otherCard ? setPeekingPlayerId(entry.player.id) : undefined}
                      className={[
                        'w-full flex items-center gap-2.5 py-2.5 px-1 rounded-xl',
                        'transition-colors duration-150',
                        otherCard ? 'cursor-pointer active:bg-white/5' : 'cursor-default',
                      ].join(' ')}
                    >
                      <Avatar avatarId={entry.player.avatar_id} size="sm" />
                      <span className="text-sm text-white/70 flex-1 text-left truncate">
                        {entry.player.name}
                      </span>
                      {otherCard ? (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {peekedBingos > 0 && (
                            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-400/10 border border-emerald-400/30 px-1.5 py-0.5 rounded-full">
                              {peekedBingos}B
                            </span>
                          )}
                          <span className="text-xs text-white/35">
                            {peekedApproved}/25
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs font-bold text-oscar-gold flex-shrink-0">
                          {entry.bingoScore}pt
                        </span>
                      )}
                    </motion.button>
                  )
                })}
            </div>
          </div>
        )}

        {/* How Bingo Works — re-show the explainer */}
        {onShowExplainer && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onShowExplainer}
            className="flex items-center gap-2 text-xs text-white/30 hover:text-white/50 transition-colors"
          >
            <BookOpen size={13} />
            How Bingo Works
          </motion.button>
        )}
      </div>

      {/* Celebration overlay */}
      <AnimatePresence>
        {celebrationData && player && (
          <BingoAlert
            data={celebrationData}
            squares={squares}
            playerName={player.name}
            playerColor={player.color}
            onDismiss={dismissCelebration}
          />
        )}
      </AnimatePresence>

      {/* Peek card overlay */}
      <AnimatePresence>
        {peekingPlayerId && (() => {
          const liveCard = otherCards.find((c) => c.player.id === peekingPlayerId)
          return liveCard ? (
            <PeekCardOverlay
              player={liveCard.player}
              squares={liveCard.squares}
              marks={liveCard.marks}
              onDismiss={() => setPeekingPlayerId(null)}
            />
          ) : null
        })()}
      </AnimatePresence>

      {/* Host approval sheet */}
      <AnimatePresence>
        {showApprovals && (
          <BingoApprovalSheet
            marks={pendingMarks}
            onApprove={approveMark}
            onDeny={denyMark}
            onDismiss={() => setShowApprovals(false)}
          />
        )}
      </AnimatePresence>
    </>
  )
}
