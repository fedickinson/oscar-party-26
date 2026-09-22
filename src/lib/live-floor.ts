/**
 * live-floor.ts — pure contracts for the Results Night host's two live-floor
 * controls: closing the floor, and undoing one provisional declaration.
 *
 * Both used to be decided inside the component, and both decided the wrong
 * thing. The close card was gated on every category having a winner, which a
 * Results Night with post-broadcast social winners never reaches; the undo
 * button was gated on a local 30-second timestamp that only the admin declare
 * path ever wrote, so a spotlight-declared winner could not be undone at all.
 *
 * The database is the authority in both cases. `close_live_floor_authorized`
 * accepts a floor with unresolved categories, and `undo_scheduled_winner`
 * carries no time window — it checks host, capability, provisional phase and
 * an exact compare-and-swap on the winner row. These functions derive what the
 * host is told and offered from canonical counts and rows, nothing local.
 *
 * What "unresolved" costs, so the warning copy is true:
 *   - computeLeaderboard (scoring.ts) only credits draft points for categories
 *     where winner_id is set, so an unresolved category pays no draft credit.
 *   - confidence_picks.is_correct is a database projection of room_winners, so
 *     with no winner row it stays null and contributes nothing to any score.
 *   - Neither is lost: a settlement entry may still resolve or void the
 *     category in the researched record (settlement-evidence.ts).
 */

/** Legacy Oscars-room affordance, kept as a visual hint only. */
export const SCHEDULED_UNDO_HINT_WINDOW_MS = 30_000

export interface LiveFloorCloseCard {
  /** Categories on the slate with no declared winner. */
  unresolvedCount: number
  headline: string
  detail: string
  /** Set only when the provisional ledger would be entirely empty. */
  emptyLedgerWarning: string | null
  /** Label for the second, explicit confirmation step. */
  confirmLabel: string
}

/**
 * The permanent close-the-floor card. Closing is always two-step in the UI;
 * this decides what the two steps say.
 */
export function deriveLiveFloorCloseCard(input: {
  announcedCount: number
  totalCount: number
}): LiveFloorCloseCard {
  const { announcedCount, totalCount } = input
  if (!Number.isInteger(announcedCount) || announcedCount < 0) {
    throw new Error('live floor announced count must be a non-negative integer')
  }
  if (!Number.isInteger(totalCount) || totalCount < 0) {
    throw new Error('live floor total count must be a non-negative integer')
  }
  if (announcedCount > totalCount) {
    throw new Error('live floor announced count cannot exceed the slate size')
  }

  const emptyLedgerWarning = announcedCount === 0
    ? 'No winner has been declared, so the provisional ledger will be empty.'
    : null

  if (totalCount === 0) {
    return {
      unresolvedCount: 0,
      headline: 'No categories on the slate',
      detail: 'Close the live floor to publish provisional results on every phone.',
      emptyLedgerWarning,
      confirmLabel: 'Show provisional results',
    }
  }

  const unresolvedCount = totalCount - announcedCount
  if (unresolvedCount === 0) {
    return {
      unresolvedCount: 0,
      headline: `All ${totalCount} categories announced`,
      detail: 'Close the live floor to publish provisional results on every phone.',
      emptyLedgerWarning: null,
      confirmLabel: 'Show provisional results',
    }
  }

  return {
    unresolvedCount,
    headline: `${unresolvedCount} of ${totalCount} categories ${unresolvedCount === 1 ? 'is' : 'are'} still unresolved`,
    detail:
      'Closing now publishes the provisional ledger exactly as it stands. An unresolved '
      + 'category scores nothing for anyone: the confidence picks staked on it stay unresolved '
      + 'and its draft credit goes unawarded, until the researched settlement resolves or voids it.',
    emptyLedgerWarning,
    confirmLabel: `Close with ${unresolvedCount} unresolved`,
  }
}

export type ScheduledUndoStatus =
  | 'available'
  | 'no_winner'
  | 'not_host'
  | 'no_authority'
  | 'not_live'

export interface ScheduledUndoAffordance {
  enabled: boolean
  status: ScheduledUndoStatus
  /**
   * Seconds left in the legacy 30-second window, when this phone is the one
   * that declared. A hint about how fresh the call is — never the gate.
   */
  countdownSeconds: number | null
}

/**
 * Whether the host may undo one provisionally declared category, derived from
 * canonical rows rather than a local declare timestamp. Mirrors the checks in
 * `undo_scheduled_winner` and fails closed ahead of them.
 */
export function deriveScheduledUndoAffordance(input: {
  isHost: boolean
  refereeEnabled: boolean
  roomPhase: string | null
  hasWinner: boolean
  declaredAtMs: number | null
  nowMs: number
}): ScheduledUndoAffordance {
  const blocked = (status: ScheduledUndoStatus): ScheduledUndoAffordance => ({
    enabled: false,
    status,
    countdownSeconds: null,
  })

  if (!input.hasWinner) return blocked('no_winner')
  if (!input.isHost) return blocked('not_host')
  if (!input.refereeEnabled) return blocked('no_authority')
  if (input.roomPhase !== 'live') return blocked('not_live')

  let countdownSeconds: number | null = null
  if (input.declaredAtMs != null && Number.isFinite(input.declaredAtMs)) {
    const elapsed = input.nowMs - input.declaredAtMs
    if (elapsed >= 0 && elapsed < SCHEDULED_UNDO_HINT_WINDOW_MS) {
      countdownSeconds = Math.ceil((SCHEDULED_UNDO_HINT_WINDOW_MS - elapsed) / 1000)
    }
  }

  return { enabled: true, status: 'available', countdownSeconds }
}
