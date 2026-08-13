export const WITNESS_OBSERVER_JOURNAL_VERSION = 1
export const WITNESS_OBSERVER_HASH_HISTORY_LIMIT = 2_048

export interface WitnessFrameCursor {
  mtime_ms: number
  name: string
}

export interface WitnessFrameCandidate extends WitnessFrameCursor {
  path: string
  size: number
}

export interface WitnessObserverInFlight {
  cursor: WitnessFrameCursor
  sha256: string
  started_at: string
}

export interface WitnessObserverJournal {
  schema_version: 1
  room: string
  ingress: string
  cursor: WitnessFrameCursor | null
  in_flight: WitnessObserverInFlight | null
  processed_sha256: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const allowed = new Set(keys)
  const unknown = Object.keys(value).find((key) => !allowed.has(key))
  if (unknown) throw new Error(`${label} has unknown field ${unknown}`)
  const missing = keys.find((key) => !(key in value))
  if (missing) throw new Error(`${label} is missing field ${missing}`)
}

function assertRoom(room: string): void {
  if (!/^[A-Z0-9]{4,12}$/.test(room)) {
    throw new Error('witness observer room must be 4 to 12 uppercase letters or numbers')
  }
}

function assertIngress(ingress: string): void {
  if (!ingress || !ingress.startsWith('/')) {
    throw new Error('witness observer ingress must be an absolute real path')
  }
}

function assertFrameName(name: string): void {
  if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) {
    throw new Error('witness frame name must be one direct filename')
  }
}

function parseCursor(value: unknown, label: string): WitnessFrameCursor | null {
  if (value === null) return null
  if (!isRecord(value)) throw new Error(`${label} must be an object or null`)
  assertExactKeys(value, ['mtime_ms', 'name'], label)
  if (typeof value.mtime_ms !== 'number'
    || !Number.isFinite(value.mtime_ms)
    || value.mtime_ms < 0) {
    throw new Error(`${label} mtime_ms must be a non-negative finite number`)
  }
  if (typeof value.name !== 'string') throw new Error(`${label} name must be a string`)
  assertFrameName(value.name)
  return { mtime_ms: value.mtime_ms, name: value.name }
}

function parseInFlight(value: unknown): WitnessObserverInFlight | null {
  if (value === null) return null
  if (!isRecord(value)) throw new Error('witness observer journal in_flight must be an object or null')
  assertExactKeys(value, ['cursor', 'sha256', 'started_at'], 'witness observer journal in_flight')
  const cursor = parseCursor(value.cursor, 'witness observer journal in_flight cursor')
  if (!cursor) throw new Error('witness observer journal in_flight cursor is required')
  if (typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256)) {
    throw new Error('witness observer journal in_flight sha256 is invalid')
  }
  if (typeof value.started_at !== 'string'
    || Number.isNaN(Date.parse(value.started_at))
    || new Date(value.started_at).toISOString() !== value.started_at) {
    throw new Error('witness observer journal in_flight started_at must be a canonical ISO timestamp')
  }
  return { cursor, sha256: value.sha256, started_at: value.started_at }
}

function assertCandidate(candidate: WitnessFrameCandidate): void {
  parseCursor(
    { mtime_ms: candidate.mtime_ms, name: candidate.name },
    'witness frame candidate',
  )
  if (!candidate.path || !candidate.path.startsWith('/')) {
    throw new Error('witness frame candidate path must be absolute')
  }
  if (!Number.isFinite(candidate.size) || candidate.size < 1) {
    throw new Error('witness frame candidate size must be positive')
  }
}

function compareCursor(left: WitnessFrameCursor, right: WitnessFrameCursor): number {
  if (left.mtime_ms !== right.mtime_ms) return left.mtime_ms - right.mtime_ms
  if (left.name < right.name) return -1
  if (left.name > right.name) return 1
  return 0
}

function cursorFromCandidate(candidate: WitnessFrameCandidate): WitnessFrameCursor {
  assertCandidate(candidate)
  return { mtime_ms: candidate.mtime_ms, name: candidate.name }
}

export function selectNewestWitnessFrame(
  candidates: WitnessFrameCandidate[],
  cursor: WitnessFrameCursor | null,
): WitnessFrameCandidate | null {
  if (cursor) parseCursor(cursor, 'witness observer cursor')
  let newest: WitnessFrameCandidate | null = null
  for (const candidate of candidates) {
    assertCandidate(candidate)
    if (cursor && compareCursor(candidate, cursor) <= 0) continue
    if (!newest || compareCursor(candidate, newest) > 0) newest = candidate
  }
  return newest
}

export function createWitnessObserverJournal(
  room: string,
  ingress: string,
  baseline: WitnessFrameCandidate | null,
): WitnessObserverJournal {
  assertRoom(room)
  assertIngress(ingress)
  return {
    schema_version: WITNESS_OBSERVER_JOURNAL_VERSION,
    room,
    ingress,
    cursor: baseline ? cursorFromCandidate(baseline) : null,
    in_flight: null,
    processed_sha256: [],
  }
}

export function parseWitnessObserverJournal(
  raw: string,
  expectedRoom: string,
  expectedIngress: string,
): WitnessObserverJournal {
  assertRoom(expectedRoom)
  assertIngress(expectedIngress)
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('witness observer journal must be valid JSON')
  }
  if (!isRecord(value)) throw new Error('witness observer journal must be an object')
  assertExactKeys(
    value,
    ['schema_version', 'room', 'ingress', 'cursor', 'in_flight', 'processed_sha256'],
    'witness observer journal',
  )
  if (value.schema_version !== WITNESS_OBSERVER_JOURNAL_VERSION) {
    throw new Error('witness observer journal schema_version must be 1')
  }
  if (value.room !== expectedRoom) throw new Error('witness observer journal room does not match')
  if (value.ingress !== expectedIngress) throw new Error('witness observer journal ingress does not match')
  const cursor = parseCursor(value.cursor, 'witness observer journal cursor')
  const inFlight = parseInFlight(value.in_flight)
  if (cursor && inFlight && compareCursor(inFlight.cursor, cursor) <= 0) {
    throw new Error('witness observer journal in_flight cursor must follow the durable cursor')
  }
  if (!Array.isArray(value.processed_sha256)
    || value.processed_sha256.length > WITNESS_OBSERVER_HASH_HISTORY_LIMIT
    || value.processed_sha256.some((hash) => (
      typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash)
    ))) {
    throw new Error('witness observer journal processed_sha256 is invalid')
  }
  if (new Set(value.processed_sha256).size !== value.processed_sha256.length) {
    throw new Error('witness observer journal processed_sha256 must be unique')
  }
  return {
    schema_version: WITNESS_OBSERVER_JOURNAL_VERSION,
    room: expectedRoom,
    ingress: expectedIngress,
    cursor,
    in_flight: inFlight,
    processed_sha256: [...value.processed_sha256] as string[],
  }
}

export function witnessObserverJournalHasHash(
  journal: WitnessObserverJournal,
  sha256: string,
): boolean {
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('witness frame sha256 is invalid')
  return journal.processed_sha256.includes(sha256)
}

export function advanceWitnessObserverJournal(
  journal: WitnessObserverJournal,
  frame: WitnessFrameCandidate,
  sha256: string,
  historyLimit = WITNESS_OBSERVER_HASH_HISTORY_LIMIT,
): WitnessObserverJournal {
  assertRoom(journal.room)
  assertIngress(journal.ingress)
  if (journal.in_flight) {
    throw new Error('witness observer journal already has an in-flight observation')
  }
  const cursor = cursorFromCandidate(frame)
  if (journal.cursor && compareCursor(cursor, journal.cursor) <= 0) {
    throw new Error('witness observer journal cursor may only advance')
  }
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('witness frame sha256 is invalid')
  if (!Number.isInteger(historyLimit) || historyLimit < 1
    || historyLimit > WITNESS_OBSERVER_HASH_HISTORY_LIMIT) {
    throw new Error(`witness observer history limit must be 1 through ${WITNESS_OBSERVER_HASH_HISTORY_LIMIT}`)
  }
  const hashes = journal.processed_sha256.filter((hash) => hash !== sha256)
  hashes.push(sha256)
  return {
    ...journal,
    cursor,
    processed_sha256: hashes.slice(-historyLimit),
  }
}

export function beginWitnessObserverAttempt(
  journal: WitnessObserverJournal,
  frame: WitnessFrameCandidate,
  sha256: string,
  startedAt: string,
): WitnessObserverJournal {
  if (journal.in_flight) {
    throw new Error('witness observer journal already has an in-flight observation')
  }
  const cursor = cursorFromCandidate(frame)
  if (journal.cursor && compareCursor(cursor, journal.cursor) <= 0) {
    throw new Error('witness observer in-flight cursor must follow the durable cursor')
  }
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error('witness frame sha256 is invalid')
  if (Number.isNaN(Date.parse(startedAt)) || new Date(startedAt).toISOString() !== startedAt) {
    throw new Error('witness observer attempt time must be a canonical ISO timestamp')
  }
  return {
    ...journal,
    in_flight: { cursor, sha256, started_at: startedAt },
  }
}

export function completeWitnessObserverAttempt(
  journal: WitnessObserverJournal,
  frame: WitnessFrameCandidate,
  workerSha256: string,
): WitnessObserverJournal {
  const attempt = journal.in_flight
  if (!attempt) throw new Error('witness observer journal has no in-flight observation')
  if (workerSha256 !== attempt.sha256) {
    throw new Error('witness worker hash does not match the in-flight observation')
  }
  const cursor = cursorFromCandidate(frame)
  if (cursor.name !== attempt.cursor.name || compareCursor(cursor, attempt.cursor) < 0) {
    throw new Error('witness worker frame does not match the in-flight observation')
  }
  return advanceWitnessObserverJournal(
    { ...journal, in_flight: null },
    frame,
    workerSha256,
  )
}

export function skipWitnessObserverAttempt(
  journal: WitnessObserverJournal,
  expectedSha256: string,
): WitnessObserverJournal {
  const attempt = journal.in_flight
  if (!attempt) throw new Error('witness observer journal has no in-flight observation')
  if (expectedSha256 !== attempt.sha256) {
    throw new Error('in-flight skip hash does not match the uncertain observation')
  }
  const hashes = journal.processed_sha256.filter((hash) => hash !== attempt.sha256)
  hashes.push(attempt.sha256)
  return {
    ...journal,
    cursor: attempt.cursor,
    in_flight: null,
    processed_sha256: hashes.slice(-WITNESS_OBSERVER_HASH_HISTORY_LIMIT),
  }
}
