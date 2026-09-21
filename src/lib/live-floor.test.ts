import { describe, expect, it } from 'vitest'
import {
  SCHEDULED_UNDO_HINT_WINDOW_MS,
  deriveLiveFloorCloseCard,
  deriveScheduledUndoAffordance,
} from './live-floor'

const NOW = 1_800_000_000_000

describe('live floor close card', () => {
  it('keeps the all-announced wording when every category is declared', () => {
    expect(deriveLiveFloorCloseCard({ announcedCount: 23, totalCount: 23 })).toEqual({
      unresolvedCount: 0,
      headline: 'All 23 categories announced',
      detail: 'Close the live floor to publish provisional results on every phone.',
      emptyLedgerWarning: null,
      confirmLabel: 'Show provisional results',
    })
  })

  it('offers the close with unresolved categories and names how many', () => {
    const card = deriveLiveFloorCloseCard({ announcedCount: 15, totalCount: 23 })
    expect(card.unresolvedCount).toBe(8)
    expect(card.headline).toBe('8 of 23 categories are still unresolved')
    expect(card.confirmLabel).toBe('Close with 8 unresolved')
  })

  it('tells the truth about what an unresolved category costs', () => {
    const card = deriveLiveFloorCloseCard({ announcedCount: 15, totalCount: 23 })
    expect(card.detail).toContain('confidence picks staked on it stay unresolved')
    expect(card.detail).toContain('draft credit goes unawarded')
    expect(card.detail).toContain('researched settlement resolves or voids it')
  })

  it('agrees with the singular when exactly one category is unresolved', () => {
    const card = deriveLiveFloorCloseCard({ announcedCount: 22, totalCount: 23 })
    expect(card.headline).toBe('1 of 23 categories is still unresolved')
    expect(card.confirmLabel).toBe('Close with 1 unresolved')
  })

  it('warns about an empty ledger only when nothing has been declared', () => {
    expect(deriveLiveFloorCloseCard({ announcedCount: 0, totalCount: 23 }).emptyLedgerWarning)
      .toBe('No winner has been declared, so the provisional ledger will be empty.')
    expect(deriveLiveFloorCloseCard({ announcedCount: 1, totalCount: 23 }).emptyLedgerWarning)
      .toBeNull()
  })

  it('does not claim that an unloaded slate is fully announced', () => {
    const card = deriveLiveFloorCloseCard({ announcedCount: 0, totalCount: 0 })
    expect(card.headline).toBe('No categories on the slate')
    expect(card.unresolvedCount).toBe(0)
  })

  it('rejects counts that cannot describe a real slate', () => {
    expect(() => deriveLiveFloorCloseCard({ announcedCount: 24, totalCount: 23 })).toThrow()
    expect(() => deriveLiveFloorCloseCard({ announcedCount: -1, totalCount: 23 })).toThrow()
    expect(() => deriveLiveFloorCloseCard({ announcedCount: 1.5, totalCount: 23 })).toThrow()
  })
})

describe('scheduled winner undo affordance', () => {
  const base = {
    isHost: true,
    refereeEnabled: true,
    roomPhase: 'live',
    hasWinner: true,
    declaredAtMs: null as number | null,
    nowMs: NOW,
  }

  it('offers undo for a declared category with no local declare timestamp', () => {
    expect(deriveScheduledUndoAffordance(base)).toEqual({
      enabled: true,
      status: 'available',
      countdownSeconds: null,
    })
  })

  it('still offers undo long after the legacy thirty-second window', () => {
    const affordance = deriveScheduledUndoAffordance({
      ...base,
      declaredAtMs: NOW - (SCHEDULED_UNDO_HINT_WINDOW_MS * 40),
    })
    expect(affordance.enabled).toBe(true)
    expect(affordance.countdownSeconds).toBeNull()
  })

  it('keeps the countdown as a hint inside the legacy window', () => {
    expect(deriveScheduledUndoAffordance({ ...base, declaredAtMs: NOW - 4_000 }).countdownSeconds)
      .toBe(26)
  })

  it('fails closed without a winner, host seat, authority or a live room', () => {
    expect(deriveScheduledUndoAffordance({ ...base, hasWinner: false }))
      .toEqual({ enabled: false, status: 'no_winner', countdownSeconds: null })
    expect(deriveScheduledUndoAffordance({ ...base, isHost: false }).status).toBe('not_host')
    expect(deriveScheduledUndoAffordance({ ...base, refereeEnabled: false }).status)
      .toBe('no_authority')
    expect(deriveScheduledUndoAffordance({ ...base, roomPhase: 'finished' }).status)
      .toBe('not_live')
    expect(deriveScheduledUndoAffordance({ ...base, roomPhase: null }).enabled).toBe(false)
  })
})
