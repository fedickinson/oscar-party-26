import { describe, expect, it } from 'vitest'
import {
  advanceWitnessObserverJournal,
  beginWitnessObserverAttempt,
  completeWitnessObserverAttempt,
  createWitnessObserverJournal,
  parseWitnessObserverJournal,
  skipWitnessObserverAttempt,
  selectNewestWitnessFrame,
  witnessObserverJournalHasHash,
  type WitnessFrameCandidate,
} from './witness-observer'

const frames: WitnessFrameCandidate[] = [
  { name: 'frame-001.webp', path: '/frames/frame-001.webp', size: 100, mtime_ms: 1_000 },
  { name: 'frame-002.webp', path: '/frames/frame-002.webp', size: 100, mtime_ms: 2_000 },
  { name: 'frame-003.webp', path: '/frames/frame-003.webp', size: 100, mtime_ms: 2_000 },
]

describe('continuous witness observer journal', () => {
  it('samples only the newest frame after the durable ingress cursor', () => {
    expect(selectNewestWitnessFrame(frames, null)?.name).toBe('frame-003.webp')
    expect(selectNewestWitnessFrame(frames, { mtime_ms: 2_000, name: 'frame-002.webp' })?.name)
      .toBe('frame-003.webp')
    expect(selectNewestWitnessFrame(frames, { mtime_ms: 2_000, name: 'frame-003.webp' }))
      .toBeNull()
  })

  it('keeps one journal scoped to the exact room and real ingress directory', () => {
    const journal = createWitnessObserverJournal('ABCD', '/real/frames', frames[1])
    const parsed = parseWitnessObserverJournal(JSON.stringify(journal), 'ABCD', '/real/frames')

    expect(parsed).toEqual(journal)
    expect(() => parseWitnessObserverJournal(JSON.stringify(journal), 'WXYZ', '/real/frames'))
      .toThrow('journal room does not match')
    expect(() => parseWitnessObserverJournal(JSON.stringify(journal), 'ABCD', '/other/frames'))
      .toThrow('journal ingress does not match')
  })

  it('records successful content once while advancing past renamed duplicates', () => {
    const initial = createWitnessObserverJournal('ABCD', '/real/frames', null)
    const first = advanceWitnessObserverJournal(initial, frames[1], 'a'.repeat(64))
    const duplicate = advanceWitnessObserverJournal(first, frames[2], 'a'.repeat(64))

    expect(duplicate.cursor).toEqual({ mtime_ms: 2_000, name: 'frame-003.webp' })
    expect(duplicate.processed_sha256).toEqual(['a'.repeat(64)])
    expect(witnessObserverJournalHasHash(duplicate, 'a'.repeat(64))).toBe(true)
  })

  it('persists an uncertain send before work and requires explicit resolution', () => {
    const initial = createWitnessObserverJournal('ABCD', '/real/frames', null)
    const inFlight = beginWitnessObserverAttempt(
      initial,
      frames[1],
      'b'.repeat(64),
      '2026-08-11T12:00:00.000Z',
    )
    const restarted = parseWitnessObserverJournal(
      JSON.stringify(inFlight),
      'ABCD',
      '/real/frames',
    )

    expect(restarted.in_flight).toEqual({
      cursor: { mtime_ms: 2_000, name: 'frame-002.webp' },
      sha256: 'b'.repeat(64),
      started_at: '2026-08-11T12:00:00.000Z',
    })
    expect(() => beginWitnessObserverAttempt(
      restarted,
      frames[2],
      'c'.repeat(64),
      '2026-08-11T12:00:01.000Z',
    )).toThrow('already has an in-flight observation')

    const skipped = skipWitnessObserverAttempt(restarted, 'b'.repeat(64))
    expect(skipped.in_flight).toBeNull()
    expect(skipped.cursor).toEqual({ mtime_ms: 2_000, name: 'frame-002.webp' })
    expect(skipped.processed_sha256).toEqual(['b'.repeat(64)])
  })

  it('completes only the exact in-flight frame and canonical worker hash', () => {
    const initial = beginWitnessObserverAttempt(
      createWitnessObserverJournal('ABCD', '/real/frames', null),
      frames[1],
      'd'.repeat(64),
      '2026-08-11T12:00:00.000Z',
    )

    expect(() => completeWitnessObserverAttempt(initial, frames[1], 'e'.repeat(64)))
      .toThrow('worker hash does not match')
    const completed = completeWitnessObserverAttempt(initial, frames[1], 'd'.repeat(64))
    expect(completed.in_flight).toBeNull()
    expect(completed.processed_sha256).toEqual(['d'.repeat(64)])
  })

  it('bounds restart history without changing the canonical cursor', () => {
    let journal = createWitnessObserverJournal('ABCD', '/real/frames', null)
    for (let index = 0; index < 5; index += 1) {
      journal = advanceWitnessObserverJournal(
        journal,
        { name: `frame-${index}.png`, path: `/frames/frame-${index}.png`, size: 10, mtime_ms: index + 1 },
        index.toString(16).padStart(64, '0'),
        3,
      )
    }

    expect(journal.processed_sha256).toHaveLength(3)
    expect(journal.processed_sha256[0]).toBe('2'.padStart(64, '0'))
    expect(journal.cursor).toEqual({ mtime_ms: 5, name: 'frame-4.png' })
  })

  it('rejects malformed or forward-versioned durable state', () => {
    const journal = createWitnessObserverJournal('ABCD', '/real/frames', null)
    expect(() => parseWitnessObserverJournal(
      JSON.stringify({ ...journal, schema_version: 2 }),
      'ABCD',
      '/real/frames',
    )).toThrow('schema_version must be 1')
    expect(() => parseWitnessObserverJournal(
      JSON.stringify({ ...journal, extra: true }),
      'ABCD',
      '/real/frames',
    )).toThrow('unknown field extra')
  })
})
