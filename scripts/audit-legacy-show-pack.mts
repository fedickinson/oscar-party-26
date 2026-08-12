#!/usr/bin/env -S npx tsx

/**
 * Builds a deterministic, non-publishable worksheet for migrating the complete
 * grandfathered catalog into the reviewed schema-v3 show-pack contract.
 *
 * This command is local-only and read-only. It preserves legacy authored rows,
 * proves identity and portrait coverage, and names every review queue. It never
 * manufactures claims, trigger decisions, title approval, or commentary.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { IMAGE_LIBRARY } from '../src/data/image-library'
import { fetchAllRows } from '../src/hooks/fetch-all-rows'
import { LEGACY_SHOW_PACK_ID } from '../src/lib/catalog-scope'
import {
  buildLegacyShowPackMigrationWorksheet,
  type LegacyMigrationBingoSquare,
  type LegacyMigrationCategory,
  type LegacyMigrationDraftEntity,
  type LegacyMigrationNominee,
  type LegacyMigrationPortrait,
  type LegacyMigrationShowPack,
  type LegacyMigrationSignatureBeat,
  type LegacyShowPackExpectedCounts,
} from '../src/lib/legacy-show-pack-audit'
import { assertRasterAssetMatchesPath } from '../src/lib/raster-asset'
import { supabaseConfig } from './lib/env.mts'
import { writeUtf8FileSafely } from './lib/safe-write.mts'

process.on('uncaughtException', (error) => {
  console.error(`[legacy-show-pack-audit] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})
process.on('unhandledRejection', (error) => {
  console.error(`[legacy-show-pack-audit] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
})

function arg(name: string): string | null {
  const index = process.argv.indexOf(name)
  return index >= 0 ? (process.argv[index + 1] ?? null) : null
}

const outputArg = arg('--output')
const outputPath = outputArg ? resolve(outputArg) : null
const force = process.argv.includes('--force')
if (force && !outputPath) throw new Error('--force requires --output PATH')
if (outputPath && existsSync(outputPath) && !force) {
  throw new Error(`worksheet already exists: ${outputPath}; pass --force to replace it`)
}

const { target, url, serviceKey } = supabaseConfig('local')
if (target !== 'local') {
  throw new Error('legacy show-pack audit is local-only and refuses every remote target')
}
if (!serviceKey) throw new Error('local Supabase did not report a service role key')
const SERVICE_KEY = serviceKey

const EXPECTED_COUNTS: LegacyShowPackExpectedCounts = {
  predictions: 20,
  candidate_links: 213,
  nominees: 38,
  draft_entities: 38,
  signature_beats: 275,
  bingo_squares: 75,
  portraits: 38,
}

async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path} -> ${response.status} ${text.slice(0, 500)}`)
  }
  return text ? JSON.parse(text) : null
}

async function allRows<Row>(path: string): Promise<Row[]> {
  const result = await fetchAllRows<Row, unknown>(async (from, to) => {
    try {
      const data = await request(path, {
        headers: { Range: `${from}-${to}`, 'Range-Unit': 'items' },
      }) as Row[]
      return { data, error: null }
    } catch (error) {
      return { data: null, error }
    }
  })
  if (result.error) throw result.error
  return result.data ?? []
}

function verifiedPortraits(): LegacyMigrationPortrait[] {
  const publicRoot = realpathSync(fileURLToPath(new URL('../public/', import.meta.url)))
  return IMAGE_LIBRARY
    .filter((image) => image.kind === 'character' || image.kind === 'dragon')
    .map((image) => {
      if (!image.slug.startsWith('character-')) {
        throw new Error(`legacy portrait ${image.slug} needs a character- identity prefix`)
      }
      if (!image.path.startsWith('/avatars/characters/')) {
        throw new Error(`legacy portrait ${image.slug} is outside the character asset lane`)
      }
      const actual = realpathSync(resolve(publicRoot, `.${image.path}`))
      const fromRoot = relative(publicRoot, actual)
      if (fromRoot === '' || fromRoot === '..'
        || fromRoot.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`)
        || isAbsolute(fromRoot)) {
        throw new Error(`legacy portrait ${image.slug} escapes the public asset root`)
      }
      if (!statSync(actual).isFile()) throw new Error(`legacy portrait ${image.slug} is not a file`)
      const bytes = readFileSync(actual)
      assertRasterAssetMatchesPath(image.path, bytes)
      return {
        suggested_id: image.slug.slice('character-'.length),
        label: image.label,
        path: image.path,
        sha256: createHash('sha256').update(bytes).digest('hex'),
      }
    })
}

const scope = `show_pack_id=eq.${LEGACY_SHOW_PACK_ID}`
const [showPacks, categories, nominees, draftEntities, signatureBeats, bingoSquares] = await Promise.all([
  allRows<LegacyMigrationShowPack>(
    `show_packs?id=eq.${LEGACY_SHOW_PACK_ID}&select=id,pack_key,version,title,property,installment,fact_source,status&order=id.asc`,
  ),
  allRows<LegacyMigrationCategory>(
    `categories?${scope}&room_id=is.null&select=id,name,tier,points,display_order,pack_key,trigger_contract&order=display_order.asc,id.asc`,
  ),
  allRows<LegacyMigrationNominee>(
    `nominees?${scope}&select=id,name,type,film_name,image_url,show_pack_id,pack_key&order=id.asc`,
  ),
  allRows<LegacyMigrationDraftEntity>(
    `draft_entities?${scope}&select=id,name,type,film_name,nominations,nom_count,show_pack_id,pack_key&order=id.asc`,
  ),
  allRows<LegacyMigrationSignatureBeat>(
    `signature_beats?${scope}&select=id,entity_id,partner_entity_id,name,trigger_text,odds,points,pitch,pack_key,trigger_contract&order=id.asc`,
  ),
  allRows<LegacyMigrationBingoSquare>(
    `bingo_squares?${scope}&select=id,text,short_text,is_objective,slug,title,category,probability_pct,likelihood_tier,win_condition,why_it_is_fun,storyline_tags,fun_type,pack_key,trigger_contract&order=id.asc`,
  ),
])
if (showPacks.length !== 1) {
  throw new Error(`expected one legacy show-pack registry row, found ${showPacks.length}`)
}

const categoryNominees: Array<{ category_id: number; nominee_id: string }> = []
const categoryIds = categories.map((row) => row.id)
for (let index = 0; index < categoryIds.length; index += 100) {
  const ids = categoryIds.slice(index, index + 100).join(',')
  categoryNominees.push(...await allRows<{ category_id: number; nominee_id: string }>(
    `category_nominees?category_id=in.(${ids})&select=category_id,nominee_id&order=category_id.asc,nominee_id.asc`,
  ))
}

const worksheet = buildLegacyShowPackMigrationWorksheet({
  showPack: showPacks[0],
  categories,
  categoryNominees,
  nominees,
  draftEntities,
  signatureBeats,
  bingoSquares,
  portraits: verifiedPortraits(),
  expectedCounts: EXPECTED_COUNTS,
})
const bytes = `${JSON.stringify(worksheet, null, 2)}\n`
const sha256 = createHash('sha256').update(bytes).digest('hex')

console.log(`[legacy-show-pack-audit] predictions=${worksheet.counts.predictions} candidate_links=${worksheet.counts.candidate_links}`)
console.log(`[legacy-show-pack-audit] entities=${worksheet.counts.draft_entities} nominees=${worksheet.counts.nominees} portraits=${worksheet.counts.portraits}`)
console.log(`[legacy-show-pack-audit] signature_beats=${worksheet.counts.signature_beats} bingo_squares=${worksheet.counts.bingo_squares}`)
console.log(`[legacy-show-pack-audit] identity_ready=${worksheet.identity.ready}`)
console.log(`[legacy-show-pack-audit] contracts_to_review=${worksheet.authoring_queue.prediction_contract_legacy_ids.length + worksheet.authoring_queue.signature_beat_contract_legacy_ids.length + worksheet.authoring_queue.bingo_contract_legacy_ids.length}`)
console.log(`[legacy-show-pack-audit] nomination_candidate_decisions=${worksheet.authoring_queue.legacy_nomination_candidate_divergences.length}`)
console.log(`[legacy-show-pack-audit] worksheet_sha256=${sha256}`)
if (outputPath) {
  writeUtf8FileSafely(outputPath, bytes, force)
  console.log(`[legacy-show-pack-audit] worksheet=${outputPath}`)
} else {
  console.log('[legacy-show-pack-audit] dry_run=true; pass --output PATH to write the worksheet')
}
if (worksheet.issues.length > 0) {
  throw new Error(`catalog migration integrity failed:\n${worksheet.issues.join('\n')}`)
}
