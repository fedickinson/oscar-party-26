import { describe, expect, it } from 'vitest'
import {
  assertOperatorSnapshotSchema,
  assertOperatorSnapshotSchemaCompatible,
  assertStableOperatorSnapshotSchema,
  canonicalizeOperatorSnapshotSchema,
  OPERATOR_SNAPSHOT_TABLES,
  parseOperatorSnapshotPayload,
  parseOperatorSnapshotManifest,
  serializeOperatorSnapshotManifest,
  type OperatorSnapshotManifest,
} from './operator-snapshot'

function manifest(): OperatorSnapshotManifest {
  return {
    version: 2,
    source: 'scripts/snapshot-game.mts',
    complete: true,
    created_at: '2026-08-10T23:06:06.000Z',
    target: 'remote',
    schema_sha256: 'f'.repeat(64),
    tables: OPERATOR_SNAPSHOT_TABLES.map((name, index) => ({
      name,
      row_count: index,
      sha256: String(index % 10).repeat(64),
    })),
  }
}

describe('operator snapshot manifest', () => {
  it('accepts only an OpenAPI schema exposing the exact canonical public table set', () => {
    const schema = JSON.stringify({
      definitions: Object.fromEntries(OPERATOR_SNAPSHOT_TABLES.map((table) => [table, {}])),
    })
    expect(() => assertOperatorSnapshotSchema(schema)).not.toThrow()

    const missing = JSON.parse(schema)
    delete missing.definitions.players
    expect(() => assertOperatorSnapshotSchema(JSON.stringify(missing))).toThrow(
      'OpenAPI table set does not match the canonical operator snapshot set',
    )

    const extra = JSON.parse(schema)
    extra.definitions.private_notes = {}
    expect(() => assertOperatorSnapshotSchema(JSON.stringify(extra))).toThrow(
      'OpenAPI table set does not match the canonical operator snapshot set',
    )
  })

  it('canonicalizes semantically identical OpenAPI documents to identical bytes', () => {
    const definitions = Object.fromEntries(OPERATOR_SNAPSHOT_TABLES.map((table) => [table, {
      type: 'object',
      properties: { z: { type: 'string' }, a: { type: 'number' } },
    }]))
    const first = JSON.stringify({ swagger: '2.0', definitions, paths: { '/z': {}, '/a': {} } })
    const second = JSON.stringify({
      paths: { '/a': {}, '/z': {} },
      definitions: Object.fromEntries(Object.entries(definitions).reverse()),
      swagger: '2.0',
    })

    expect(canonicalizeOperatorSnapshotSchema(first)).toBe(
      canonicalizeOperatorSnapshotSchema(second),
    )
    expect(canonicalizeOperatorSnapshotSchema(first).endsWith('\n')).toBe(true)
  })

  it('rejects a schema change across an atomic capture boundary', () => {
    const definitions = Object.fromEntries(OPERATOR_SNAPSHOT_TABLES.map((table) => [table, {}]))
    const before = canonicalizeOperatorSnapshotSchema(JSON.stringify({ definitions, revision: 1 }))
    const equivalent = canonicalizeOperatorSnapshotSchema(JSON.stringify({ revision: 1, definitions }))
    const changed = canonicalizeOperatorSnapshotSchema(JSON.stringify({ definitions, revision: 2 }))

    expect(() => assertStableOperatorSnapshotSchema(before, equivalent)).not.toThrow()
    expect(() => assertStableOperatorSnapshotSchema(before, changed)).toThrow(
      'operator schema changed during atomic snapshot capture',
    )
  })

  it('accepts only an atomic RPC payload with every canonical table array', () => {
    const payload = Object.fromEntries(OPERATOR_SNAPSHOT_TABLES.map((table) => [table, []]))
    expect(Object.keys(parseOperatorSnapshotPayload(payload))).toEqual(OPERATOR_SNAPSHOT_TABLES)

    const partial = { ...payload }
    delete partial.players
    expect(() => parseOperatorSnapshotPayload(partial)).toThrow(
      'atomic snapshot payload must contain the exact operator table set',
    )

    expect(() => parseOperatorSnapshotPayload({
      ...payload,
      messages: [null],
    })).toThrow('atomic snapshot payload messages must contain only row objects')
  })

  it('round-trips one canonical seal with the complete ordered table set', () => {
    const first = serializeOperatorSnapshotManifest(manifest())
    const parsed = parseOperatorSnapshotManifest(first)

    expect(serializeOperatorSnapshotManifest(parsed)).toBe(first)
    expect(parsed.tables.map((table) => table.name)).toEqual(OPERATOR_SNAPSHOT_TABLES)
    expect(first.endsWith('\n')).toBe(true)
  })

  it('keeps the original 24-table version-1 seal readable', () => {
    const legacy = manifest()
    legacy.version = 1
    legacy.tables = legacy.tables.filter((table) => table.name !== 'witness_supporting_observations')
    const raw = serializeOperatorSnapshotManifest(legacy)

    expect(parseOperatorSnapshotManifest(raw).version).toBe(1)
    expect(parseOperatorSnapshotManifest(raw).tables).toHaveLength(24)
  })

  it('allows only additive optional schema fields across a sealed recovery boundary', () => {
    const originalDefinitions = Object.fromEntries(
      OPERATOR_SNAPSHOT_TABLES.slice(0, -1).map((table) => [table, { properties: { id: { type: 'string' } } }]),
    )
    const sealed = JSON.stringify({
      definitions: originalDefinitions,
      paths: { '/rooms': { parameters: ['original'] } },
    })
    const current = JSON.stringify({
      definitions: {
        ...originalDefinitions,
        witness_supporting_observations: { properties: { id: { type: 'string' } } },
      },
      paths: { '/rooms': { parameters: ['original'] }, '/rpc/record_witness_observation_v2': {} },
    })
    expect(() => assertOperatorSnapshotSchemaCompatible(sealed, current, 1)).not.toThrow()

    const additive = JSON.parse(current)
    additive.definitions.rooms.properties.reviewed_entity_id = { type: 'string', nullable: true }
    expect(() => assertOperatorSnapshotSchemaCompatible(sealed, JSON.stringify(additive), 1)).not.toThrow()

    const changed = JSON.parse(current)
    changed.definitions.rooms.properties.id.type = 'integer'
    expect(() => assertOperatorSnapshotSchemaCompatible(sealed, JSON.stringify(changed), 1)).toThrow(
      'operator snapshot schema changed at definitions.rooms.properties.id.type',
    )

    const changedPath = JSON.parse(current)
    changedPath.paths['/rooms'] = { parameters: ['different'] }
    expect(() => assertOperatorSnapshotSchemaCompatible(sealed, JSON.stringify(changedPath), 1)).toThrow(
      'operator snapshot schema changed at root.paths./rooms',
    )
  })

  it('rejects a partial, reordered, or extended snapshot', () => {
    const partial = manifest()
    partial.tables.pop()
    expect(() => parseOperatorSnapshotManifest(JSON.stringify(partial))).toThrow(
      'snapshot manifest must seal the exact operator table set',
    )

    const reordered = manifest()
    ;[reordered.tables[0], reordered.tables[1]] = [reordered.tables[1], reordered.tables[0]]
    expect(() => parseOperatorSnapshotManifest(JSON.stringify(reordered))).toThrow(
      'snapshot manifest must seal the exact operator table set',
    )

    const extended = manifest()
    extended.tables.push({ name: 'private_notes', row_count: 0, sha256: 'a'.repeat(64) } as never)
    expect(() => parseOperatorSnapshotManifest(JSON.stringify(extended))).toThrow(
      'snapshot manifest must seal the exact operator table set',
    )
  })

  it('rejects an unsealed manifest and malformed integrity metadata', () => {
    expect(() => parseOperatorSnapshotManifest(JSON.stringify({
      ...manifest(),
      complete: false,
    }))).toThrow('snapshot manifest complete must be true')

    const badCount = manifest()
    badCount.tables[0].row_count = -1
    expect(() => parseOperatorSnapshotManifest(JSON.stringify(badCount))).toThrow(
      'snapshot table show_packs row_count must be a non-negative integer',
    )

    const badHash = manifest()
    badHash.tables[0].sha256 = 'not-a-hash'
    expect(() => parseOperatorSnapshotManifest(JSON.stringify(badHash))).toThrow(
      'snapshot table show_packs sha256 must be a lowercase SHA-256 digest',
    )
  })

  it('rejects unknown fields and non-canonical source metadata', () => {
    expect(() => parseOperatorSnapshotManifest(JSON.stringify({
      ...manifest(),
      private_note: 'not part of the seal',
    }))).toThrow('snapshot manifest has unknown field private_note')

    expect(() => parseOperatorSnapshotManifest(JSON.stringify({
      ...manifest(),
      target: 'production',
    }))).toThrow('snapshot manifest target must be local or remote')
  })
})
