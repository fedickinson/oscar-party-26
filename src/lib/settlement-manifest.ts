import type {
  SettlementBingoMode,
  SettlementOutcome,
  SettlementWarrant,
} from '../types/database'

export interface ManifestEntry {
  key: string
  name: string
  category_id?: number
  outcome: SettlementOutcome
  points: number
  winner?: string
  tie_winner?: string
  occurred_at?: string
  warrant: SettlementWarrant
}

export interface ManifestBingoMark {
  player: string
  square_slug: string
  marked_at?: string
  warrant: SettlementWarrant
}

export interface SettlementManifest {
  version: 1
  title: string
  actor: string
  entries: ManifestEntry[]
  bingo: {
    mode: SettlementBingoMode
    marks?: ManifestBingoMark[]
    /** Required when preserve_live snapshots the approved live ledger. */
    warrant?: SettlementWarrant
  }
  expected: {
    player_totals: Record<string, number>
    character_points: Record<string, number>
  }
}

interface ResolvedEntryReference {
  entry_key: string
  winner_id: string | null
  tie_winner_id: string | null
}

interface ResolvedBingoReference {
  card_id: string
  square_index: number
}

export interface SettlementIdentityEntry {
  entry_key: string
  category_id: number | null
  winner_id: string | null
  tie_winner_id: string | null
}

export interface SettlementIdentityBingoMark extends ResolvedBingoReference {
  marked_at: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertKeys(value: Record<string, unknown>, allowed: string[], label: string): void {
  const allowedKeys = new Set(allowed)
  const unknown = Object.keys(value).filter((key) => !allowedKeys.has(key)).sort()
  if (unknown.length > 0) throw new Error(`${label} has unknown field ${unknown[0]}`)
}

function assertWarrant(value: unknown, label: string): asserts value is SettlementWarrant {
  if (!isRecord(value) || value.verdict !== 'true' || !Array.isArray(value.sources) || value.sources.length === 0) {
    throw new Error(`${label} needs verdict "true" and at least one source`)
  }
  assertKeys(value, ['verdict', 'sources'], label)
  for (const [index, source] of value.sources.entries()) {
    if (!isRecord(source) || typeof source.kind !== 'string' || !source.kind.trim()
      || typeof source.ref !== 'string' || !source.ref.trim()) {
      throw new Error(`${label} has a source without kind or ref`)
    }
    assertKeys(source, ['kind', 'ref'], `${label} source ${index + 1}`)
  }
}

function assertTimestamp(value: unknown, label: string): void {
  if (value === undefined) return
  if (typeof value !== 'string' || !value.trim() || Number.isNaN(Date.parse(value))) {
    throw new Error(`${label} must be a valid timestamp`)
  }
}

function assertIntegerLedger(value: Record<string, unknown>, label: string): void {
  for (const [reference, points] of Object.entries(value)) {
    if (!reference.trim()) throw new Error(`${label} has an empty reference`)
    if (!Number.isInteger(points)) {
      throw new Error(`${label} value for ${reference} must be an integer`)
    }
  }
}

export function parseSettlementManifest(raw: string): SettlementManifest {
  const value: unknown = JSON.parse(raw)
  if (!isRecord(value)) throw new Error('manifest must be an object')
  assertKeys(value, ['version', 'title', 'actor', 'entries', 'bingo', 'expected'], 'manifest')
  if (value.version !== 1) throw new Error('manifest.version must be 1')
  if (typeof value.title !== 'string' || !value.title.trim()
    || typeof value.actor !== 'string' || !value.actor.trim()) {
    throw new Error('manifest title and actor are required')
  }
  if (!Array.isArray(value.entries)) throw new Error('manifest.entries must be an array')
  if (!isRecord(value.bingo) || !['preserve_live', 'replace'].includes(String(value.bingo.mode))) {
    throw new Error('manifest.bingo.mode must be preserve_live or replace')
  }
  assertKeys(value.bingo, ['mode', 'marks', 'warrant'], 'bingo')
  if (value.bingo.marks !== undefined && !Array.isArray(value.bingo.marks)) {
    throw new Error('manifest.bingo.marks must be an array')
  }
  if (!isRecord(value.expected)
    || !isRecord(value.expected.player_totals)
    || !isRecord(value.expected.character_points)) {
    throw new Error('expected player_totals and character_points are required')
  }
  assertKeys(value.expected, ['player_totals', 'character_points'], 'expected')
  assertIntegerLedger(value.expected.player_totals, 'expected player_totals')
  assertIntegerLedger(value.expected.character_points, 'expected character_points')

  const manifest = value as unknown as SettlementManifest
  if (manifest.bingo.mode === 'preserve_live' && (manifest.bingo.marks?.length ?? 0) > 0) {
    throw new Error('preserve_live cannot include replacement bingo marks')
  }
  if (manifest.bingo.mode === 'preserve_live') {
    assertWarrant(manifest.bingo.warrant, 'preserved live bingo warrant')
  } else if (manifest.bingo.warrant !== undefined) {
    throw new Error('replace bingo uses per-mark warrants, not bingo.warrant')
  }

  const keys = new Set<string>()
  const categoryIds = new Set<number>()
  for (const [index, entry] of manifest.entries.entries()) {
    const label = `entry ${index + 1}`
    if (!isRecord(entry) || typeof entry.key !== 'string' || !entry.key.trim()
      || typeof entry.name !== 'string' || !entry.name.trim()) {
      throw new Error(`${label} needs key and name`)
    }
    assertKeys(entry, [
      'key', 'name', 'category_id', 'outcome', 'points', 'winner',
      'tie_winner', 'occurred_at', 'warrant',
    ], label)
    if (keys.has(entry.key)) throw new Error(`duplicate entry key ${entry.key}`)
    keys.add(entry.key)
    if (entry.category_id !== undefined) {
      if (!Number.isInteger(entry.category_id)) throw new Error(`${label} category_id must be an integer`)
      if (categoryIds.has(entry.category_id)) throw new Error(`duplicate category_id ${entry.category_id}`)
      categoryIds.add(entry.category_id)
    }
    if (entry.outcome !== 'resolved' && entry.outcome !== 'void') {
      throw new Error(`${label} outcome must be resolved or void`)
    }
    if (!Number.isInteger(entry.points) || entry.points <= 0) {
      throw new Error(`${label} points must be a positive integer`)
    }
    if (entry.winner !== undefined && (typeof entry.winner !== 'string' || !entry.winner.trim())) {
      throw new Error(`${label} winner must be a non-empty reference`)
    }
    if (entry.tie_winner !== undefined && (typeof entry.tie_winner !== 'string' || !entry.tie_winner.trim())) {
      throw new Error(`${label} tie_winner must be a non-empty reference`)
    }
    if (entry.outcome === 'resolved' && !entry.winner) throw new Error(`${label} needs a winner`)
    if (entry.outcome === 'void' && (entry.winner || entry.tie_winner || entry.category_id == null)) {
      throw new Error(`${label} void outcomes need category_id and no winner`)
    }
    assertTimestamp(entry.occurred_at, `${label} occurred_at`)
    assertWarrant(entry.warrant, `${label} warrant`)
  }

  for (const [index, mark] of (manifest.bingo.marks ?? []).entries()) {
    const label = `bingo mark ${index + 1}`
    if (!isRecord(mark) || typeof mark.player !== 'string' || !mark.player.trim()
      || typeof mark.square_slug !== 'string' || !mark.square_slug.trim()) {
      throw new Error(`${label} needs player and square_slug`)
    }
    assertKeys(mark, ['player', 'square_slug', 'marked_at', 'warrant'], label)
    assertTimestamp(mark.marked_at, `${label} marked_at`)
    assertWarrant(mark.warrant, `${label} warrant`)
  }

  return manifest
}

/** Mirrors uniqueness checks that the RPC applies after aliases become IDs. */
export function assertResolvedSettlementReferences(
  entries: ResolvedEntryReference[],
  bingoMarks: ResolvedBingoReference[],
): void {
  for (const entry of entries) {
    if (entry.winner_id !== null && entry.winner_id === entry.tie_winner_id) {
      throw new Error(`entry ${entry.entry_key}: winner and tie winner resolve to the same nominee`)
    }
  }

  const positions = new Set<string>()
  for (const mark of bingoMarks) {
    const key = `${mark.card_id}:${mark.square_index}`
    if (positions.has(key)) {
      throw new Error('replacement bingo marks resolve to the same card position')
    }
    positions.add(key)
  }
}

/**
 * Canonical, database-resolved identity mixed into the settlement hash.
 * Preserve-live timestamps are record facts and therefore versioned. Replace
 * timestamps already belong to the authored manifest; a generated preview
 * fallback must not turn a retry into a different settlement.
 */
export function settlementIdentityPayload(
  manifest: SettlementManifest,
  entries: SettlementIdentityEntry[],
  bingoMarks: SettlementIdentityBingoMark[],
): unknown {
  return {
    manifest,
    resolved: {
      entries: entries.map((entry) => ({
        entry_key: entry.entry_key,
        category_id: entry.category_id,
        winner_id: entry.winner_id,
        tie_winner_id: entry.tie_winner_id,
      })),
      bingo_marks: [...bingoMarks]
        .sort((left, right) => (
          left.card_id.localeCompare(right.card_id)
          || left.square_index - right.square_index
        ))
        .map((mark) => ({
          card_id: mark.card_id,
          square_index: mark.square_index,
          ...(manifest.bingo.mode === 'preserve_live'
            ? { marked_at: mark.marked_at }
            : {}),
        })),
    },
  }
}
