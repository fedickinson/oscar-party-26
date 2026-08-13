import { describe, expect, it } from 'vitest'
import {
  planInitialReactiveTranscript,
  planReactiveTranscriptReconciliation,
} from './reactive-transcript'

type Row = { id: string; text: string }

describe('reactive transcript planning', () => {
  it('processes a buffered live row even when hydration already contains it', () => {
    const row: Row = { id: 'new', text: 'new during hydration' }
    const plan = planInitialReactiveTranscript(
      [{ id: 'old', text: 'existing' }, row],
      [row, row],
    )

    expect(plan.toProcess).toEqual([row])
    expect([...plan.seenIds]).toEqual(['old', 'new'])
  })

  it('processes only unseen durable rows during cold-worker reconciliation', () => {
    const missed: Row = { id: 'missed', text: 'committed without callback' }
    const plan = planReactiveTranscriptReconciliation(
      [{ id: 'old', text: 'existing' }, missed, missed],
      new Set(['old']),
    )

    expect(plan.toProcess).toEqual([missed])
    expect([...plan.seenIds]).toEqual(['old', 'missed'])
  })
})
