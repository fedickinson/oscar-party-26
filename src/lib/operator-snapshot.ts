/** Canonical completeness seal shared by snapshot and recovery tooling. */

export const OPERATOR_SNAPSHOT_TABLES_V1 = [
  'show_packs',
  'avatars',
  'rooms',
  'players',
  'draft_picks',
  'bingo_cards',
  'bingo_marks',
  'messages',
  'player_verdicts',
  'room_winners',
  'categories',
  'category_nominees',
  'room_settlements',
  'room_settlement_entries',
  'room_settlement_bingo_marks',
  'signature_beats',
  'beat_activations',
  'conviction_picks',
  'confidence_picks',
  'nominees',
  'draft_entities',
  'bingo_squares',
  'operator_heartbeats',
  'witness_proposals',
] as const

export const OPERATOR_SNAPSHOT_TABLES = [
  ...OPERATOR_SNAPSHOT_TABLES_V1,
  'witness_supporting_observations',
] as const

export type OperatorSnapshotTableName = typeof OPERATOR_SNAPSHOT_TABLES[number]
export type OperatorSnapshotPayload = {
  [Table in OperatorSnapshotTableName]: Array<Record<string, unknown>>
}

export interface OperatorSnapshotTableSeal {
  name: OperatorSnapshotTableName
  row_count: number
  sha256: string
}

export interface OperatorSnapshotManifest {
  version: 1 | 2
  source: 'scripts/snapshot-game.mts'
  complete: true
  created_at: string
  target: 'local' | 'remote'
  schema_sha256: string
  tables: OperatorSnapshotTableSeal[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalizeJson)
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalizeJson(item)]),
    )
  }
  return value
}

function assertKeys(
  value: Record<string, unknown>,
  required: string[],
  label: string,
): void {
  const allowed = new Set(required)
  const unknown = Object.keys(value).find((key) => !allowed.has(key))
  if (unknown) throw new Error(`${label} has unknown field ${unknown}`)
  const missing = required.find((key) => !(key in value))
  if (missing) throw new Error(`${label} is missing field ${missing}`)
}

function exactTableSet(keys: string[], expectedTables: readonly string[]): boolean {
  return keys.length === expectedTables.length
    && [...keys].sort().every((key, index) => (
      key === [...expectedTables].sort()[index]
    ))
}

export function operatorSnapshotTablesForVersion(version: 1 | 2): readonly OperatorSnapshotTableName[] {
  return version === 1 ? OPERATOR_SNAPSHOT_TABLES_V1 : OPERATOR_SNAPSHOT_TABLES
}

export function assertOperatorSnapshotSchema(
  raw: string,
  expectedTables: readonly string[] = OPERATOR_SNAPSHOT_TABLES,
): void {
  const value: unknown = JSON.parse(raw)
  if (!isRecord(value) || !isRecord(value.definitions)) {
    throw new Error('OpenAPI schema definitions must be an object')
  }
  if (!exactTableSet(Object.keys(value.definitions), expectedTables)) {
    throw new Error('OpenAPI table set does not match the canonical operator snapshot set')
  }
}

export function canonicalizeOperatorSnapshotSchema(
  raw: string,
  expectedTables: readonly string[] = OPERATOR_SNAPSHOT_TABLES,
): string {
  assertOperatorSnapshotSchema(raw, expectedTables)
  return `${JSON.stringify(canonicalizeJson(JSON.parse(raw)))}\n`
}

export function assertOperatorSnapshotSchemaCompatible(
  sealedRaw: string,
  currentRaw: string,
  sealedVersion: 1 | 2,
): void {
  const sealedTables = operatorSnapshotTablesForVersion(sealedVersion)
  assertOperatorSnapshotSchema(sealedRaw, sealedTables)
  assertOperatorSnapshotSchema(currentRaw, OPERATOR_SNAPSHOT_TABLES)
  const sealed = JSON.parse(sealedRaw) as { definitions: Record<string, unknown> }
  const current = JSON.parse(currentRaw) as { definitions: Record<string, unknown> }
  const assertSealedShape = (expected: unknown, actual: unknown, path: string): void => {
    if (Array.isArray(expected)) {
      if (!Array.isArray(actual)
        || JSON.stringify(canonicalizeJson(expected)) !== JSON.stringify(canonicalizeJson(actual))) {
        throw new Error(`operator snapshot schema changed at ${path}`)
      }
      return
    }
    if (isRecord(expected)) {
      if (!isRecord(actual)) throw new Error(`operator snapshot schema changed at ${path}`)
      for (const [key, value] of Object.entries(expected)) {
        if (!(key in actual)) throw new Error(`operator snapshot schema changed at ${path}.${key}`)
        assertSealedShape(value, actual[key], `${path}.${key}`)
      }
      return
    }
    if (expected !== actual) throw new Error(`operator snapshot schema changed at ${path}`)
  }
  for (const table of sealedTables) {
    assertSealedShape(
      sealed.definitions[table],
      current.definitions[table],
      `definitions.${table}`,
    )
  }
  const { definitions: _sealedDefinitions, ...sealedSurface } = sealed as Record<string, unknown>
  const { definitions: _currentDefinitions, ...currentSurface } = current as Record<string, unknown>
  assertSealedShape(sealedSurface, currentSurface, 'root')
}

export function assertStableOperatorSnapshotSchema(before: string, after: string): void {
  if (before !== after) throw new Error('operator schema changed during atomic snapshot capture')
}

export function parseOperatorSnapshotPayload(value: unknown): OperatorSnapshotPayload {
  if (!isRecord(value) || !exactTableSet(Object.keys(value), OPERATOR_SNAPSHOT_TABLES)) {
    throw new Error('atomic snapshot payload must contain the exact operator table set')
  }
  return Object.fromEntries(OPERATOR_SNAPSHOT_TABLES.map((table) => {
    const rows = value[table]
    if (!Array.isArray(rows)) throw new Error(`atomic snapshot payload ${table} must be an array`)
    if (rows.some((row) => !isRecord(row))) {
      throw new Error(`atomic snapshot payload ${table} must contain only row objects`)
    }
    return [table, rows as Array<Record<string, unknown>>]
  })) as OperatorSnapshotPayload
}

export function parseOperatorSnapshotManifest(raw: string): OperatorSnapshotManifest {
  const value: unknown = JSON.parse(raw)
  if (!isRecord(value)) throw new Error('snapshot manifest must be an object')
  assertKeys(
    value,
    ['version', 'source', 'complete', 'created_at', 'target', 'schema_sha256', 'tables'],
    'snapshot manifest',
  )
  if (value.version !== 1 && value.version !== 2) {
    throw new Error('snapshot manifest version must be 1 or 2')
  }
  if (value.source !== 'scripts/snapshot-game.mts') {
    throw new Error('snapshot manifest source must be scripts/snapshot-game.mts')
  }
  if (value.complete !== true) throw new Error('snapshot manifest complete must be true')
  if (typeof value.created_at !== 'string'
    || Number.isNaN(Date.parse(value.created_at))
    || new Date(value.created_at).toISOString() !== value.created_at) {
    throw new Error('snapshot manifest created_at must be a canonical ISO timestamp')
  }
  if (value.target !== 'local' && value.target !== 'remote') {
    throw new Error('snapshot manifest target must be local or remote')
  }
  if (typeof value.schema_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.schema_sha256)) {
    throw new Error('snapshot manifest schema_sha256 must be a lowercase SHA-256 digest')
  }
  const expectedTables = operatorSnapshotTablesForVersion(value.version)
  if (!Array.isArray(value.tables)
    || value.tables.length !== expectedTables.length
    || value.tables.some((table, index) => (
      !isRecord(table) || table.name !== expectedTables[index]
    ))) {
    throw new Error('snapshot manifest must seal the exact operator table set')
  }

  const tables = value.tables.map((table, index): OperatorSnapshotTableSeal => {
    const label = `snapshot table ${expectedTables[index]}`
    if (!isRecord(table)) throw new Error(`${label} must be an object`)
    assertKeys(table, ['name', 'row_count', 'sha256'], label)
    if (!Number.isInteger(table.row_count) || (table.row_count as number) < 0) {
      throw new Error(`${label} row_count must be a non-negative integer`)
    }
    if (typeof table.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(table.sha256)) {
      throw new Error(`${label} sha256 must be a lowercase SHA-256 digest`)
    }
    return {
      name: expectedTables[index],
      row_count: table.row_count as number,
      sha256: table.sha256,
    }
  })

  return {
    version: value.version,
    source: 'scripts/snapshot-game.mts',
    complete: true,
    created_at: value.created_at,
    target: value.target,
    schema_sha256: value.schema_sha256,
    tables,
  }
}

export function serializeOperatorSnapshotManifest(manifest: OperatorSnapshotManifest): string {
  const canonical = parseOperatorSnapshotManifest(JSON.stringify(manifest))
  return `${JSON.stringify(canonical, null, 2)}\n`
}
