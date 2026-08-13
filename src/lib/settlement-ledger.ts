export interface NamedRecord {
  id: string
  name: string
}

export interface ReferenceIndex<T extends NamedRecord> {
  byId: Map<string, T>
  byUniqueName: Map<string, T>
  ambiguousNames: Set<string>
}

export function buildReferenceIndex<T extends NamedRecord>(records: T[]): ReferenceIndex<T> {
  const byId = new Map(records.map((record) => [record.id, record]))
  const nameCounts = new Map<string, number>()
  for (const record of records) {
    nameCounts.set(record.name, (nameCounts.get(record.name) ?? 0) + 1)
  }

  const byUniqueName = new Map<string, T>()
  const ambiguousNames = new Set<string>()
  for (const record of records) {
    if (nameCounts.get(record.name) === 1) byUniqueName.set(record.name, record)
    else ambiguousNames.add(record.name)
  }

  return { byId, byUniqueName, ambiguousNames }
}

export function resolveReference<T extends NamedRecord>(
  reference: string,
  index: ReferenceIndex<T>,
  label: string,
): T {
  const byId = index.byId.get(reference)
  if (byId) return byId
  if (index.ambiguousNames.has(reference)) {
    throw new Error(`${label} ${reference} is ambiguous; use an id`)
  }
  const byName = index.byUniqueName.get(reference)
  if (byName) return byName
  throw new Error(`${label} ${reference} not found`)
}

export function normalizeExpectedLedger<T extends NamedRecord>(
  expected: Record<string, number>,
  records: T[],
  label: string,
): Record<string, number> {
  const index = buildReferenceIndex(records)
  const normalized: Record<string, number> = {}

  for (const [reference, points] of Object.entries(expected)) {
    if (!Number.isInteger(points)) {
      throw new Error(`${label} value for ${reference} must be an integer`)
    }
    const record = resolveReference(reference, index, `${label} reference`)
    if (Object.prototype.hasOwnProperty.call(normalized, record.id)) {
      throw new Error(`${label} references ${record.id} more than once`)
    }
    normalized[record.id] = points
  }

  return normalized
}

export function displayReference<T extends NamedRecord>(
  record: T,
  index: ReferenceIndex<T>,
): string {
  return index.ambiguousNames.has(record.name)
    ? `${record.name} (${record.id})`
    : record.name
}
