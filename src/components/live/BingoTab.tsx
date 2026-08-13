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
 * MARKING:
 *   Honor-system (markSquare inserts approved directly; tapping a marked
 *   square deletes the mark). The old host-approval flow is gone — no
 *   bottom sheet for approving or denying each claim.
 *
 * Receives categories and nominees from the parent (already fetched by
 * useScores) so there are no duplicate subscriptions.
 */

import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BookOpen, CheckCircle, RotateCcw } from 'lucide-react'
import { useGame } from '../../context/GameContext'
import { useBingo } from '../../hooks/useBingo'
import { useOtherBingoCards } from '../../hooks/useOtherBingoCards'
import BingoCard from '../bingo/BingoCard'
import BingoAlert from '../bingo/BingoAlert'
import PeekCardOverlay from '../bingo/PeekCardOverlay'
import PipLegend from '../bingo/PipLegend'
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

  const {
    card,
    squares,
    marks,
    markedIndices,
    pendingIndices,
    bingoLines,
    bingoCount,
    squarePoints,
    bingoScore,
    celebrationData,
    isLoading,
    syncError,
    selectedIndex,
    selectSquare,
    deselectSquare,
    markSquare,
    dismissCelebration,
    retrySync,
  } = useBingo(roomId, categories, nominees, onSquareApproved)


  // Other players' cards for peek feature
  const otherPlayers = useMemo(
    () => leaderboard.filter((e) => e.player.id !== player?.id).map((e) => e.player),
    [leaderboard, player?.id],
  )
  const {
    cards: otherCards,
    isLoading: otherCardsLoading,
    syncError: otherCardsError,
    retrySync: retryOtherCards,
  } = useOtherBingoCards(roomId, otherPlayers)

  if (syncError) {
    return (
      <div className="px-4 py-6">
        <section
          className="material-stone relief-inset rounded-2xl p-4"
          role="alert"
          aria-live="assertive"
        >
          <p className="font-display text-xs uppercase tracking-widest text-[var(--t-pending)]">
            Bingo ledger unavailable
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--t-text-muted)]">
            {syncError} Marking stays disabled until the room record is current.
          </p>
          <button
            type="button"
            onClick={retrySync}
            className="mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-[var(--t-line)] bg-[var(--t-surface)] px-4 text-sm font-bold text-[var(--t-text)]"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            Try again
          </button>
        </section>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // No card after loading finished — retry the scoped deal without discarding
  // the rest of the live page.
  if (!card) {
    return (
      <div className="px-4 py-6 text-center">
        <p className="text-sm text-[var(--t-text-muted)]">Your bingo card did not deal.</p>
        <button
          type="button"
          onClick={retrySync}
          className="mt-3 min-h-[44px] rounded-xl border border-[var(--t-line)] bg-[var(--t-surface)] px-4 text-sm font-bold text-[var(--t-text)]"
        >
          Deal my card
        </button>
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
              {/* Always shown. Squares pay on their own now, so a player with
                  no line is not on zero and should not be told they are. */}
              <p className="text-xs font-bold text-accent">
                {bingoScore} pts
                {bingoCount > 0 && (
                  <span className="font-medium text-white/35 ml-1">
                    ({squarePoints} squares)
                  </span>
                )}
              </p>
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

        {/* Legend, then instruction. The dots are decoded by showing them; the
            sentence is left with one job instead of three. */}
        <div className="flex flex-col items-center gap-1.5">
          <PipLegend />
          <p className="text-xs text-white/25 text-center px-4">
            Tap a square to see what counts, then mark it. Tap it again to undo.
          </p>
        </div>

        {/* Other players' bingo progress — tappable to peek */}
        {leaderboard.length > 1 && (
          <div className="w-full backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl px-4 py-3">
            <p className="text-xs text-white/40 uppercase tracking-widest mb-3">
              Other Players
            </p>
            {otherCardsError && (
              <div
                className="mb-3 rounded-xl border border-[var(--t-line)] bg-[var(--t-surface)] p-3"
                role="status"
              >
                <p className="text-xs leading-relaxed text-[var(--t-text-muted)]">
                  {otherCardsError} Your own card is still live.
                </p>
                <button
                  type="button"
                  onClick={retryOtherCards}
                  className="mt-2 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-[var(--t-line)] px-3 text-xs font-bold text-[var(--t-text)]"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden />
                  Retry peer cards
                </button>
              </div>
            )}
            {otherCardsLoading && !otherCardsError && (
              <p className="mb-3 text-xs text-[var(--t-text-dim)]" role="status">
                Synchronizing peer cards
              </p>
            )}
            <div className="space-y-1">
              {leaderboard
                .filter((entry) => entry.player.id !== player?.id)
                .map((entry) => {
                  const peerCardsReady = !otherCardsLoading && !otherCardsError
                  const otherCard = peerCardsReady
                    ? otherCards.find((c) => c.player.id === entry.player.id)
                    : undefined
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
                        <span className="text-xs font-bold text-accent flex-shrink-0">
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

    </>
  )
}
