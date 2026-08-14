/**
 * Install one compiled show pack and bind it to one lobby room.
 *
 * Dry-run is the default. Applying requires the room code twice. The pack row
 * stays draft until a service-visible reread exactly matches every planned
 * registry and normalized row; the room binding is the final write and is also
 * guarded transactionally in Postgres.
 *
 *   npx tsx scripts/activate-show-pack.mts --input PACK.json --room CODE
 *   npx tsx scripts/activate-show-pack.mts --input PACK.json --room CODE --apply --confirm-room CODE
 */
import { readFileSync } from 'node:fs'
import { parseShowPack } from '../src/lib/show-pack'
import {
  assessShowPackActivation,
  attestShowPackActivation,
  buildShowPackCatalogManifest,
  buildShowPackActivationPlan,
  describeShowPackRuntime,
  type InstalledShowPackCatalog,
} from '../src/lib/show-pack-activation'
import { supabaseConfig } from './lib/env.mts'
import { verifyShowPackPortraitAssets } from './lib/show-pack-assets.mts'

process.on('uncaughtException', (error) => {
  console.error(`[show-pack-activation] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
process.on('unhandledRejection', (error) => {
  console.error(`[show-pack-activation] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})

function arg(name: string): string | null {
  const index = process.argv.indexOf(name)
  return index >= 0 ? (process.argv[index + 1] ?? null) : null
}

function requiredArg(name: string): string {
  const value = arg(name)
  if (!value) throw new Error(`${name} is required`)
  return value
}

const inputPath = requiredArg('--input')
const roomCode = requiredArg('--room').toUpperCase()
const shouldApply = process.argv.includes('--apply')
const confirmedRoom = arg('--confirm-room')?.toUpperCase() ?? null
if (shouldApply && confirmedRoom !== roomCode) {
  throw new Error(`applying requires --confirm-room ${roomCode}`)
}

const plan = await buildShowPackActivationPlan(
  parseShowPack(readFileSync(inputPath, 'utf8')),
)
const {
  bingoSquares,
  categories,
  categoryNominees,
  compiled,
  draftEntities,
  manifestSha256,
  nominees,
  packRef,
  showPackId,
  signatureBeats,
} = plan
verifyShowPackPortraitAssets(compiled)
const catalogManifest = buildShowPackCatalogManifest(plan)
const runtime = describeShowPackRuntime(compiled)

const { target, url, anonKey, serviceKey } = supabaseConfig('local')
const readKey = anonKey
if (!serviceKey) {
  throw new Error('complete activation preflight requires service-role visibility, including draft registry rows')
}
async function request(path: string, init: RequestInit = {}, key = readKey): Promise<any> {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${response.status} ${text.slice(0, 500)}`)
  return text ? JSON.parse(text) : null
}

async function requestAll<Row>(path: string, key = readKey): Promise<Row[]> {
  const rows: Row[] = []
  const pageSize = 1000
  for (let offset = 0; ; offset += pageSize) {
    const separator = path.includes('?') ? '&' : '?'
    const page = await request(
      `${path}${separator}limit=${pageSize}&offset=${offset}`,
      {},
      key,
    )
    if (!Array.isArray(page)) throw new Error(`GET ${path} did not return an array`)
    rows.push(...page as Row[])
    if (page.length < pageSize) return rows
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

type InstalledRegistry = NonNullable<InstalledShowPackCatalog['showPack']>

async function readInstalledCatalog(key: string): Promise<InstalledShowPackCatalog> {
  const registryPath = 'show_packs?' + [
    `pack_key=eq.${encodeURIComponent(compiled.pack.id)}`,
    `version=eq.${compiled.pack.version}`,
    'select=id,pack_key,version,title,property,installment,fact_source,game_contract,manifest_sha256,compiled_bundle,status,published_at',
  ].join('&')
  const scope = `show_pack_id=eq.${showPackId}`
  const [registries, nominees, categories, draftEntities, signatureBeats, bingoSquares] = await Promise.all([
    requestAll<InstalledRegistry>(registryPath, key),
    requestAll<InstalledShowPackCatalog['nominees'][number]>(
      `nominees?${scope}&select=id,name,type,film_name,image_url,show_pack_id,pack_key&order=id.asc`,
      key,
    ),
    requestAll<InstalledShowPackCatalog['categories'][number]>(
      `categories?${scope}&select=id,name,tier,points,display_order,winner_id,announced_at,show_pack_id,room_id,pack_key,trigger_contract&order=id.asc`,
      key,
    ),
    requestAll<InstalledShowPackCatalog['draftEntities'][number]>(
      `draft_entities?${scope}&select=id,name,type,nominations,film_name,nom_count,show_pack_id,pack_key&order=id.asc`,
      key,
    ),
    requestAll<InstalledShowPackCatalog['signatureBeats'][number]>(
      `signature_beats?${scope}&select=id,entity_id,partner_entity_id,name,trigger_text,odds,points,pitch,show_pack_id,pack_key,trigger_contract&order=id.asc`,
      key,
    ),
    requestAll<InstalledShowPackCatalog['bingoSquares'][number]>(
      `bingo_squares?${scope}&select=id,text,short_text,is_objective,slug,title,category,probability_pct,likelihood_tier,win_condition,why_it_is_fun,storyline_tags,fun_type,show_pack_id,pack_key,trigger_contract&order=id.asc`,
      key,
    ),
  ])
  if (registries.length > 1) throw new Error(`${packRef} has multiple registry rows`)

  const categoryNominees: InstalledShowPackCatalog['categoryNominees'] = []
  const categoryIds = categories.map((row) => row.id)
  for (let index = 0; index < categoryIds.length; index += 100) {
    const ids = categoryIds.slice(index, index + 100).join(',')
    categoryNominees.push(...await requestAll<InstalledShowPackCatalog['categoryNominees'][number]>(
      `category_nominees?category_id=in.(${ids})&select=category_id,nominee_id&order=category_id.asc,nominee_id.asc`,
      key,
    ))
  }

  return {
    showPack: registries[0] ?? null,
    nominees,
    categories,
    categoryNominees,
    draftEntities,
    signatureBeats,
    bingoSquares,
  }
}

function requireExactCatalog(catalog: InstalledShowPackCatalog): void {
  const attestation = attestShowPackActivation(plan, catalog)
  if (!attestation.matches) {
    throw new Error(`installed catalog does not match ${packRef}:\n${attestation.issues.join('\n')}`)
  }
}

const [room] = await request(
  `rooms?code=eq.${encodeURIComponent(roomCode)}&select=id,code,phase,show_pack_id`,
) as Array<{ id: string; code: string; phase: string; show_pack_id: string }>
if (!room) throw new Error(`room ${roomCode} not found`)
if (room.phase !== 'lobby' && room.show_pack_id !== showPackId) {
  throw new Error(`room ${roomCode} must still be in the lobby; phase is ${room.phase}`)
}

const installedBefore = await readInstalledCatalog(serviceKey)
const existingPack = installedBefore.showPack
const assessment = assessShowPackActivation(plan, installedBefore)
const beforeAttestation = assessment.attestation

async function assertNoIdConflicts(
  table: string,
  expected: Array<{ id: string | number; pack_key: string | null }>,
): Promise<void> {
  if (expected.length === 0) return
  const expectedById = new Map(expected.map((row) => [String(row.id), row]))
  for (let index = 0; index < expected.length; index += 100) {
    const ids = expected.slice(index, index + 100).map((row) => row.id).join(',')
    const existing = await requestAll<{
      id: string | number
      show_pack_id: string
      pack_key: string | null
    }>(`${table}?id=in.(${ids})&select=id,show_pack_id,pack_key&order=id.asc`, serviceKey)
    for (const row of existing) {
      const wanted = expectedById.get(String(row.id))!
      if (row.show_pack_id !== showPackId || row.pack_key !== wanted.pack_key) {
        throw new Error(`${table} id ${row.id} collides with another catalog row`)
      }
    }
  }
}

await Promise.all([
  assertNoIdConflicts('nominees', nominees),
  assertNoIdConflicts('categories', categories),
  assertNoIdConflicts('draft_entities', draftEntities),
  assertNoIdConflicts('signature_beats', signatureBeats),
  assertNoIdConflicts('bingo_squares', bingoSquares),
])

console.log(`[show-pack-activation] target=${target}`)
console.log(`[show-pack-activation] mode=${shouldApply ? 'apply' : 'dry-run'}`)
console.log(`[show-pack-activation] room=${roomCode} pack=${packRef} id=${showPackId}`)
console.log(`[show-pack-activation] sha256=${manifestSha256}`)
console.log(`[show-pack-activation] predictions=${categories.length} entities=${draftEntities.length} beats=${signatureBeats.length} bingo=${bingoSquares.length}`)
console.log(`[show-pack-activation] portraits=${nominees.length} verified=true`)
console.log(`[show-pack-activation] contract=${runtime.summary}`)
console.log(`[show-pack-activation] runtime_model=${runtime.gameModel} fact_source=${compiled.pack.fact_source}`)
if (assessment.state === 'planned') {
  console.log('[show-pack-activation] catalog=planned')
} else if (assessment.state === 'published-attested' || assessment.state === 'draft-ready') {
  console.log(`[show-pack-activation] catalog=attested status=${existingPack.status}`)
} else {
  console.log(`[show-pack-activation] catalog=draft-partial differences=${beforeAttestation.issues.length}`)
  for (const issue of beforeAttestation.issues) console.log(`[show-pack-activation] difference=${issue}`)
}

if (!shouldApply) {
  console.log('[show-pack-activation] activatable=true; no rows written')
  process.exit(0)
}
if (!serviceKey) throw new Error('applying requires a service-role key for the selected target')

async function insertRows(
  table: string,
  rows: unknown[],
  conflictResolution: 'error' | 'ignore' | 'merge' = 'merge',
): Promise<void> {
  if (rows.length === 0) return
  await request(table, {
    method: 'POST',
    headers: {
      Prefer: `${conflictResolution === 'error' ? '' : `resolution=${conflictResolution}-duplicates,`}return=minimal`,
    },
    body: JSON.stringify(rows),
  }, serviceKey)
}

if (existingPack?.status !== 'published') {
  // The service role may insert a draft registry but deliberately cannot
  // update it around the atomic publication RPC. Do not express this strict
  // first insert as an upsert: Postgres would require the revoked UPDATE
  // privilege even when the deterministic registry ID is absent.
  if (!existingPack) await insertRows('show_packs', [plan.showPack], 'error')
  await insertRows('nominees?on_conflict=id', nominees)
  await insertRows('draft_entities?on_conflict=id', draftEntities)
  await insertRows('categories?on_conflict=id', categories)
  await insertRows('category_nominees', categoryNominees, 'ignore')
  await insertRows('signature_beats?on_conflict=id', signatureBeats)
  await insertRows('bingo_squares?on_conflict=id', bingoSquares)

  requireExactCatalog(await readInstalledCatalog(serviceKey))
}
const [binding] = await request('rpc/publish_and_bind_show_pack', {
  method: 'POST',
  body: JSON.stringify({
    p_room_code: roomCode,
    p_catalog: catalogManifest,
  }),
}, serviceKey) as Array<{ room_id: string; show_pack_id: string }>
if (binding?.room_id !== room.id || binding.show_pack_id !== showPackId) {
  throw new Error('atomic publication returned an unexpected room or show-pack id')
}
const [boundRoom] = await request(
  `rooms?id=eq.${room.id}&select=id,show_pack_id,game_model,game_contract`,
  {},
  serviceKey,
) as Array<{ id: string; show_pack_id: string; game_model: string; game_contract: unknown }>
if (boundRoom?.show_pack_id !== showPackId
  || boundRoom.game_model !== runtime.gameModel
  || canonicalJson(boundRoom.game_contract) !== canonicalJson(compiled.game_contract)) {
  throw new Error(`bound room did not select the attested ${runtime.gameModel} contract`)
}
requireExactCatalog(await readInstalledCatalog(serviceKey))
console.log(`[show-pack-activation] bound ${roomCode} to ${packRef} model=${runtime.gameModel}`)
