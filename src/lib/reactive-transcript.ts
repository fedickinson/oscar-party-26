export interface ReactiveTranscriptPlan<Row extends { id: string }> {
  seenIds: Set<string>
  toProcess: Row[]
}

function uniqueById<Row extends { id: string }>(rows: Row[]): Row[] {
  const ids = new Set<string>()
  return rows.filter((row) => {
    if (ids.has(row.id)) return false
    ids.add(row.id)
    return true
  })
}

/**
 * Snapshot presence does not erase a live callback. A row can legitimately be
 * returned by hydration and buffered from Realtime at the same time; the
 * callback proves that it is new trigger work, while the snapshot proves only
 * that it is durable.
 */
export function planInitialReactiveTranscript<Row extends { id: string }>(
  transcript: Row[],
  bufferedRealtimeRows: Row[],
): ReactiveTranscriptPlan<Row> {
  const toProcess = uniqueById(bufferedRealtimeRows)
  return {
    seenIds: new Set([...transcript, ...toProcess].map((row) => row.id)),
    toProcess,
  }
}

/** Rows missing from the prior canonical snapshot are cold-worker catch-up. */
export function planReactiveTranscriptReconciliation<Row extends { id: string }>(
  transcript: Row[],
  priorSeenIds: ReadonlySet<string>,
): ReactiveTranscriptPlan<Row> {
  const seenIds = new Set(priorSeenIds)
  const toProcess = uniqueById(transcript.filter((row) => !seenIds.has(row.id)))
  toProcess.forEach((row) => seenIds.add(row.id))
  return { seenIds, toProcess }
}
