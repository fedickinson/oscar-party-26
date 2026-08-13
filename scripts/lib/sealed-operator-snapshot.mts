import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import {
  canonicalizeOperatorSnapshotSchema,
  OPERATOR_SNAPSHOT_TABLES,
  operatorSnapshotTablesForVersion,
  parseOperatorSnapshotManifest,
} from '../../src/lib/operator-snapshot'
import type { OperatorSnapshotRows } from '../../src/lib/room-recovery'

export interface SealedOperatorSnapshot {
  directory: string
  manifest: ReturnType<typeof parseOperatorSnapshotManifest>
  manifestSha256: string
  schema: string
  rows: OperatorSnapshotRows
}

function confinedFile(directory: string, name: string): string {
  const unresolved = join(directory, name)
  if (!existsSync(unresolved)) throw new Error(`sealed snapshot is missing ${name}`)
  const path = realpathSync(unresolved)
  const fromRoot = relative(directory, path)
  if (!fromRoot || fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
    throw new Error(`${name} must resolve inside the snapshot directory`)
  }
  if (!statSync(path).isFile()) throw new Error(`${name} must be a file`)
  return path
}

export function loadSealedOperatorSnapshot(directoryOption: string): SealedOperatorSnapshot {
  const unresolved = resolve(directoryOption)
  if (!existsSync(unresolved)) throw new Error(`snapshot directory does not exist: ${unresolved}`)
  const directory = realpathSync(unresolved)
  if (!statSync(directory).isDirectory()) throw new Error('snapshot path must be a directory')

  const manifestRaw = readFileSync(confinedFile(directory, 'manifest.json'), 'utf8')
  const manifest = parseOperatorSnapshotManifest(manifestRaw)
  const manifestTables = operatorSnapshotTablesForVersion(manifest.version)
  const expectedFiles = new Set([
    'manifest.json',
    'schema.json',
    ...manifestTables.map((table) => `${table}.json`),
  ])
  const fileNames = readdirSync(directory)
  const unexpected = fileNames.find((name) => !expectedFiles.has(name))
  if (unexpected) throw new Error(`sealed snapshot has unexpected file ${unexpected}`)
  if (fileNames.length !== expectedFiles.size) {
    throw new Error('sealed snapshot does not contain the exact manifest file set')
  }

  const schema = canonicalizeOperatorSnapshotSchema(
    readFileSync(confinedFile(directory, 'schema.json'), 'utf8'),
    manifestTables,
  )
  if (createHash('sha256').update(schema).digest('hex') !== manifest.schema_sha256) {
    throw new Error('schema.json does not match its sealed SHA-256')
  }
  const rows = {} as OperatorSnapshotRows
  for (const table of OPERATOR_SNAPSHOT_TABLES) rows[table] = []
  for (const seal of manifest.tables) {
    const raw = readFileSync(confinedFile(directory, `${seal.name}.json`), 'utf8')
    const hash = createHash('sha256').update(raw).digest('hex')
    if (hash !== seal.sha256) throw new Error(`${seal.name}.json does not match its sealed SHA-256`)
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value)) throw new Error(`${seal.name}.json must contain an array`)
    if (value.length !== seal.row_count) {
      throw new Error(`${seal.name}.json has ${value.length} rows; manifest seals ${seal.row_count}`)
    }
    if (value.some((row) => row === null || typeof row !== 'object' || Array.isArray(row))) {
      throw new Error(`${seal.name}.json must contain only row objects`)
    }
    rows[seal.name] = value as Array<Record<string, unknown>>
  }
  return {
    directory,
    manifest,
    manifestSha256: createHash('sha256').update(manifestRaw).digest('hex'),
    schema,
    rows,
  }
}
