#!/usr/bin/env -S npx tsx

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const vendorRoot = join(projectRoot, 'vendor/fandom-core')
const lockPath = join(projectRoot, 'vendor/fandom-core.lock.json')
const repository = 'https://github.com/fedickinson/fandom-core.git'

const includedFiles = [
  'manifest.json',
  'package.json',
  'schemas/fandom-core.schema.json',
  'universes/asoiaf/universe.json',
  'universes/asoiaf/shows/house-of-the-dragon/show.json',
  'universes/asoiaf/shows/house-of-the-dragon/sources/index.json',
  'universes/asoiaf/shows/house-of-the-dragon/seasons/season-3/season.json',
  'universes/asoiaf/shows/house-of-the-dragon/seasons/season-3/episodes/index.json',
  'universes/asoiaf/shows/house-of-the-dragon/seasons/season-3/characters/index.json',
  'universes/asoiaf/shows/house-of-the-dragon/seasons/season-3/dragons/index.json',
  'universes/asoiaf/shows/house-of-the-dragon/seasons/season-3/factions/index.json',
  'universes/asoiaf/shows/house-of-the-dragon/seasons/season-3/relationships/index.json',
  'universes/asoiaf/shows/house-of-the-dragon/seasons/season-3/events/index.json',
  'universes/asoiaf/shows/house-of-the-dragon/seasons/season-3/claims/index.json',
  'universes/asoiaf/shows/house-of-the-dragon/seasons/season-3/possibilities/episode-8.json',
  'universes/asoiaf/shows/house-of-the-dragon/seasons/season-3/assets/portraits.json',
] as const

interface SnapshotLock {
  schema_version: 1
  repository: string
  revision: string
  package_version: string
  files: Array<{ path: string; sha256: string }>
}

function sha256(bytes: string | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function parseArgs(argv: string[]): { apply: boolean; source?: string } {
  let apply = false
  let source: string | undefined
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--apply') apply = true
    else if (arg === '--source') source = argv[++index]
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: npx tsx scripts/sync-fandom-core.mts [--apply --source DIR]')
      process.exit(0)
    } else throw new Error(`unknown argument ${arg}`)
  }
  if (apply && !source) throw new Error('--apply requires --source DIR')
  if (!apply && source) throw new Error('--source is only valid with --apply')
  return { apply, source }
}

function json(path: string): any {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${relative(projectRoot, path)} is not valid JSON: ${message}`)
  }
}

function writeAtomic(path: string, bytes: string | Buffer): void {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.tmp`
  writeFileSync(temporary, bytes)
  renameSync(temporary, path)
}

function filesBelow(root: string, current = root): string[] {
  if (!existsSync(current)) return []
  return readdirSync(current).flatMap((name) => {
    const path = join(current, name)
    return statSync(path).isDirectory() ? filesBelow(root, path) : [relative(root, path)]
  })
}

function applySnapshot(sourceInput: string): void {
  const source = resolve(sourceInput)
  const sourcePackage = json(join(source, 'package.json'))
  if (sourcePackage.name !== '@fedickinson/fandom-core') {
    throw new Error(`source is not Fandom Core: ${source}`)
  }
  const status = execFileSync('git', ['-C', source, 'status', '--short'], { encoding: 'utf8' }).trim()
  if (status) throw new Error('Fandom Core source must be clean before snapshotting')
  const revision = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('Fandom Core revision is not a full commit SHA')

  const files = includedFiles.map((path) => {
    const sourcePath = join(source, path)
    if (!existsSync(sourcePath) || !statSync(sourcePath).isFile()) {
      throw new Error(`Fandom Core source is missing ${path}`)
    }
    const bytes = readFileSync(sourcePath)
    writeAtomic(join(vendorRoot, path), bytes)
    return { path, sha256: sha256(bytes) }
  })
  const lock: SnapshotLock = {
    schema_version: 1,
    repository,
    revision,
    package_version: sourcePackage.version,
    files,
  }
  writeAtomic(lockPath, `${JSON.stringify(lock, null, 2)}\n`)
  console.log(`[fandom-core] snapshot=${revision} version=${sourcePackage.version} files=${files.length}`)
}

function verifySnapshot(): void {
  if (!existsSync(lockPath)) throw new Error('vendor/fandom-core.lock.json is missing')
  const lock = json(lockPath) as SnapshotLock
  if (lock.schema_version !== 1) throw new Error('unsupported Fandom Core lock schema')
  if (lock.repository !== repository) throw new Error('Fandom Core lock points to the wrong repository')
  if (!/^[a-f0-9]{40}$/.test(lock.revision)) throw new Error('Fandom Core lock needs a full commit SHA')
  const expected = [...includedFiles].sort()
  const locked = lock.files.map((file) => file.path).sort()
  if (JSON.stringify(locked) !== JSON.stringify(expected)) {
    throw new Error('Fandom Core lock does not list the exact approved snapshot files')
  }
  const actual = filesBelow(vendorRoot).sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('vendored Fandom Core files differ from the approved snapshot surface')
  }
  for (const file of lock.files) {
    const digest = sha256(readFileSync(join(vendorRoot, file.path)))
    if (digest !== file.sha256) throw new Error(`Fandom Core snapshot drift: ${file.path}`)
  }

  const vendoredPackage = json(join(vendorRoot, 'package.json'))
  if (vendoredPackage.name !== '@fedickinson/fandom-core' || vendoredPackage.version !== lock.package_version) {
    throw new Error('Fandom Core package identity does not match the lock')
  }
  const manifest = json(join(vendorRoot, 'manifest.json'))
  if (manifest.dataset_id !== 'asoiaf-house-of-the-dragon-season-3') {
    throw new Error('unexpected Fandom Core dataset')
  }

  const seasonRoot = join(
    vendorRoot,
    'universes/asoiaf/shows/house-of-the-dragon/seasons/season-3',
  )
  const possibilities = json(join(seasonRoot, 'possibilities/episode-8.json')).records as Array<{
    id: string
    title: string
    condition: string
    exclusions: string[]
    observation_policy: Record<string, string>
    likelihood: { probability_pct: number; tier: string }
    entity_ids: string[]
    basis_claim_ids: string[]
    origin: { legacy_signature_beat_id: number }
  }>
  const claims = json(join(seasonRoot, 'claims/index.json')).records as Array<{
    id: string
    entity_ids?: string[]
  }>
  const claimEntities = new Map(claims.map((claim) => [claim.id, claim.entity_ids ?? []]))
  const authoring = json(join(projectRoot, 'show-packs/research/hotd-s3-finale-authoring.json'))
  const authoringEntityIds = new Map(
    authoring.entities.map((entity: { legacy_entity_id: string; id: string }) => (
      [entity.legacy_entity_id, entity.id]
    )),
  )
  const authoringBeats = new Map(
    authoring.signature_beats.map((beat: { legacy_signature_beat_id: number }) => (
      [beat.legacy_signature_beat_id, beat]
    )),
  )
  if (possibilities.length !== 275 || authoringBeats.size !== 275) {
    throw new Error('Fandom Core and show-pack authoring must each contain 275 story possibilities')
  }
  for (const possibility of possibilities) {
    const beat = authoringBeats.get(possibility.origin.legacy_signature_beat_id) as {
      id: string
      probability_pct: number
      likelihood_tier: string
      legacy_record: {
        title: string
        legacy_entity_ids: string[]
      }
      contract: {
        condition: string
        exclusions: string[]
        adjudication: Record<string, string>
        basis_claim_ids: string[]
      }
    } | undefined
    if (!beat) throw new Error(`show-pack authoring is missing ${possibility.id}`)
    const expectedEntityIds = [...new Set([
      ...beat.legacy_record.legacy_entity_ids.map((legacyId) => {
        const id = authoringEntityIds.get(legacyId)
        if (!id) throw new Error(`${beat.id} has an unknown legacy entity ${legacyId}`)
        return id
      }),
      ...beat.contract.basis_claim_ids.flatMap((claimId) => claimEntities.get(claimId) ?? []),
    ])].sort()
    const aligned = possibility.title === beat.legacy_record.title
      && possibility.condition === beat.contract.condition
      && JSON.stringify(possibility.exclusions) === JSON.stringify(beat.contract.exclusions)
      && JSON.stringify(possibility.observation_policy) === JSON.stringify(beat.contract.adjudication)
      && possibility.likelihood.probability_pct === beat.probability_pct
      && possibility.likelihood.tier === beat.likelihood_tier
      && JSON.stringify(possibility.basis_claim_ids) === JSON.stringify(beat.contract.basis_claim_ids)
      && JSON.stringify([...possibility.entity_ids].sort()) === JSON.stringify(expectedEntityIds)
    if (!aligned) throw new Error(`Fandom Core possibility drift for ${possibility.id}`)
  }

  const portraitsPath = join(
    vendorRoot,
    'universes/asoiaf/shows/house-of-the-dragon/seasons/season-3/assets/portraits.json',
  )
  const portraits = json(portraitsPath).records as Array<{
    id: string
    origin_path: string
    sha256: string
  }>
  for (const portrait of portraits) {
    const publicPath = resolve(projectRoot, portrait.origin_path)
    const fromRoot = relative(projectRoot, publicPath)
    if (fromRoot.startsWith('..') || !existsSync(publicPath) || !statSync(publicPath).isFile()) {
      throw new Error(`public portrait missing for ${portrait.id}`)
    }
    if (sha256(readFileSync(publicPath)) !== portrait.sha256) {
      throw new Error(`public portrait drift for ${portrait.id}`)
    }
  }
  console.log(
    `[fandom-core] revision=${lock.revision} version=${lock.package_version} files=${lock.files.length} possibilities=${possibilities.length} portraits=${portraits.length} verified=true`,
  )
}

try {
  const options = parseArgs(process.argv.slice(2))
  if (options.apply) applySnapshot(options.source!)
  verifySnapshot()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[fandom-core] ERROR: ${message}`)
  process.exit(1)
}
