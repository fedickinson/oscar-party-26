/**
 * A lossless, deliberately non-publishable bridge from the grandfathered
 * catalog to schema-v3 show-pack authoring. It preserves what the database
 * actually knows and names the review work it cannot truthfully invent.
 */
import {
  assessDraftEntityForNominee,
  assessNomineeForDraftEntity,
} from './draft-identity'
import type { EntityType } from '../types/database'

export interface LegacyMigrationShowPack {
  id: string
  pack_key: string
  version: number
  title: string
  property: string
  installment: string
  fact_source: string
  status: string
}

export interface LegacyMigrationCategory {
  id: number
  name: string
  tier: number
  points: number
  display_order: number
  pack_key: string | null
  trigger_contract: unknown | null
}

export interface LegacyMigrationNominee {
  id: string
  name: string
  type: EntityType
  film_name: string
  image_url: string
  show_pack_id?: string
  pack_key: string | null
}

export interface LegacyMigrationDraftEntity {
  id: string
  name: string
  type: EntityType
  film_name: string
  nominations: Array<{
    category_id: number
    nominee_id?: string
    category_name?: string
    points?: number
  }>
  nom_count: number
  show_pack_id?: string
  pack_key: string | null
}

export interface LegacyMigrationSignatureBeat {
  id: number
  entity_id: string
  partner_entity_id: string | null
  name: string
  trigger_text: string
  odds: string
  points: number
  pitch: string
  pack_key: string | null
  trigger_contract: unknown | null
}

export interface LegacyMigrationBingoSquare {
  id: number
  text: string
  short_text: string
  is_objective: boolean
  slug: string
  title: string
  category: string | null
  probability_pct: number
  likelihood_tier: string
  win_condition: string
  why_it_is_fun: string | null
  storyline_tags: string[] | null
  fun_type: string | null
  pack_key: string | null
  trigger_contract: unknown | null
}

export interface LegacyMigrationPortrait {
  suggested_id: string
  label: string
  path: string
  sha256: string
}

export interface LegacyShowPackExpectedCounts {
  predictions: number
  candidate_links: number
  nominees: number
  draft_entities: number
  signature_beats: number
  bingo_squares: number
  portraits: number
}

export interface LegacyShowPackMigrationInput {
  showPack: LegacyMigrationShowPack
  categories: LegacyMigrationCategory[]
  categoryNominees: Array<{ category_id: number; nominee_id: string }>
  nominees: LegacyMigrationNominee[]
  draftEntities: LegacyMigrationDraftEntity[]
  signatureBeats: LegacyMigrationSignatureBeat[]
  bingoSquares: LegacyMigrationBingoSquare[]
  portraits: LegacyMigrationPortrait[]
  expectedCounts?: LegacyShowPackExpectedCounts
}

export interface LegacyShowPackMigrationWorksheet {
  worksheet_version: 1
  source_pack: LegacyMigrationShowPack
  counts: {
    predictions: number
    candidate_links: number
    nominees: number
    draft_entities: number
    signature_beats: number
    bingo_squares: number
    portraits: number
  }
  identity: {
    ready: boolean
    entities: Array<{
      legacy_entity_id: string
      legacy_nominee_id: string | null
      suggested_id: string | null
      name: string
      legacy_type: string
      group: string
      draftable: true
      portrait: { path: string; sha256: string } | null
    }>
  }
  catalog: {
    candidate_links: Array<{ category_id: number; nominee_id: string }>
    nominees: LegacyMigrationNominee[]
    draft_entities: LegacyMigrationDraftEntity[]
    predictions: Array<LegacyMigrationCategory & {
      candidate_legacy_nominee_ids: string[]
    }>
    signature_beats: LegacyMigrationSignatureBeat[]
    bingo_squares: LegacyMigrationBingoSquare[]
  }
  authoring_queue: {
    global: ['sources', 'claims', 'commentary_voices', 'commentary_requests']
    entity_dossier_legacy_ids: string[]
    prediction_contract_legacy_ids: number[]
    signature_beat_contract_legacy_ids: number[]
    bingo_contract_legacy_ids: number[]
    legacy_nomination_candidate_divergences: Array<{
      legacy_entity_id: string
      legacy_nominee_id: string
      category_id: number
    }>
  }
  issues: string[]
}

function byNumberId<T extends { id: number }>(left: T, right: T): number {
  return left.id - right.id
}

function byStringId<T extends { id: string }>(left: T, right: T): number {
  return left.id.localeCompare(right.id)
}

function groupedByName<T extends { name?: string; label?: string }>(rows: T[]): Map<string, T[]> {
  const result = new Map<string, T[]>()
  for (const row of rows) {
    const name = row.name ?? row.label ?? ''
    const current = result.get(name) ?? []
    current.push(row)
    result.set(name, current)
  }
  return result
}

function duplicateIdIssues(
  rows: Array<{ id: string | number }>,
  label: string,
): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const row of rows) {
    const id = String(row.id)
    if (seen.has(id)) duplicates.add(id)
    seen.add(id)
  }
  return [...duplicates].sort().map((id) => `${label} has duplicate id ${id}`)
}

export function buildLegacyShowPackMigrationWorksheet(
  input: LegacyShowPackMigrationInput,
): LegacyShowPackMigrationWorksheet {
  const categories = input.categories.map((row) => structuredClone(row)).sort((left, right) => (
    left.display_order - right.display_order || left.id - right.id
  ))
  const categoryNominees = input.categoryNominees.map((row) => ({ ...row })).sort((left, right) => (
    left.category_id - right.category_id || left.nominee_id.localeCompare(right.nominee_id)
  ))
  const nominees = input.nominees.map((row) => structuredClone(row)).sort(byStringId)
  const draftEntities = input.draftEntities.map((row) => structuredClone(row)).sort(byStringId)
  const signatureBeats = input.signatureBeats.map((row) => structuredClone(row)).sort(byNumberId)
  const bingoSquares = input.bingoSquares.map((row) => structuredClone(row)).sort(byNumberId)
  const portraits = input.portraits.map((row) => ({ ...row })).sort((left, right) => (
    left.suggested_id.localeCompare(right.suggested_id)
  ))
  const counts: LegacyShowPackExpectedCounts = {
    predictions: categories.length,
    candidate_links: categoryNominees.length,
    nominees: nominees.length,
    draft_entities: draftEntities.length,
    signature_beats: signatureBeats.length,
    bingo_squares: bingoSquares.length,
    portraits: portraits.length,
  }

  const issues = [
    ...duplicateIdIssues(categories, 'legacy prediction'),
    ...duplicateIdIssues(nominees, 'legacy nominee'),
    ...duplicateIdIssues(draftEntities, 'legacy draft entity'),
    ...duplicateIdIssues(signatureBeats, 'legacy signature beat'),
    ...duplicateIdIssues(bingoSquares, 'legacy bingo square'),
    ...duplicateIdIssues(
      portraits.map((row) => ({ id: row.suggested_id })),
      'legacy portrait',
    ),
  ]
  if (input.expectedCounts) {
    for (const key of Object.keys(counts) as Array<keyof LegacyShowPackExpectedCounts>) {
      const expected = input.expectedCounts[key]
      const actual = counts[key]
      if (actual !== expected) {
        issues.push(`legacy inventory ${key} expected ${expected}, found ${actual}`)
      }
    }
  }
  if (input.showPack.status !== 'published') {
    issues.push(`legacy show pack status is ${input.showPack.status}, not published`)
  }

  const categoryIds = new Set(categories.map((row) => row.id))
  const nomineesById = new Map(nominees.map((row) => [row.id, row]))
  const draftById = new Map(draftEntities.map((row) => [row.id, row]))
  const candidateIdsByCategory = new Map<number, string[]>()
  const candidateLinks = new Set<string>()
  for (const link of categoryNominees) {
    if (!categoryIds.has(link.category_id)) {
      issues.push(`candidate link references unknown category ${link.category_id}`)
    }
    if (!nomineesById.has(link.nominee_id)) {
      issues.push(`candidate link for category ${link.category_id} references unknown nominee ${link.nominee_id}`)
    }
    const linkKey = `${link.category_id}:${link.nominee_id}`
    if (candidateLinks.has(linkKey)) issues.push(`candidate link is duplicated for ${linkKey}`)
    candidateLinks.add(linkKey)
    const values = candidateIdsByCategory.get(link.category_id) ?? []
    values.push(link.nominee_id)
    candidateIdsByCategory.set(link.category_id, values)
  }
  for (const category of categories) {
    if ((candidateIdsByCategory.get(category.id) ?? []).length === 0) {
      issues.push(`legacy prediction ${category.id} has no candidate nominees`)
    }
  }

  for (const entity of draftEntities) {
    for (const nomination of entity.nominations) {
      if (!categoryIds.has(nomination.category_id)) {
        issues.push(`draft entity ${entity.id} nomination references unknown category ${nomination.category_id}`)
      }
    }
  }

  const portraitsByName = groupedByName(portraits)
  const nomineeIdByDraftEntity = new Map<string, string>()
  const identityEntities = draftEntities.map((entity) => {
    const nomineeResolution = assessNomineeForDraftEntity(entity, nominees)
    const matchingPortraits = portraitsByName.get(entity.name) ?? []
    if (nomineeResolution.state === 'missing') {
      issues.push(`draft entity ${entity.name} has no canonical nominee identity`)
    } else if (nomineeResolution.state === 'ambiguous') {
      issues.push(`draft entity ${entity.name} has ambiguous canonical nominee identity`)
    }
    if (matchingPortraits.length !== 1) {
      const detail = matchingPortraits.length === 0
        ? 'no exact-name portrait'
        : `${matchingPortraits.length} exact-name portraits`
      issues.push(`draft entity ${entity.name} has ${detail}`)
    }
    const nominee = nomineeResolution.state === 'matched' ? nomineeResolution.row : null
    const portrait = matchingPortraits.length === 1 ? matchingPortraits[0] : null
    if (nominee) nomineeIdByDraftEntity.set(entity.id, nominee.id)
    return {
      legacy_entity_id: entity.id,
      legacy_nominee_id: nominee?.id ?? null,
      suggested_id: portrait?.suggested_id ?? null,
      name: entity.name,
      legacy_type: entity.type,
      group: entity.film_name,
      draftable: true as const,
      portrait: portrait ? { path: portrait.path, sha256: portrait.sha256 } : null,
    }
  })

  const nominationCandidateDivergences: Array<{
    legacy_entity_id: string
    legacy_nominee_id: string
    category_id: number
  }> = []
  for (const entity of draftEntities) {
    const nomineeId = nomineeIdByDraftEntity.get(entity.id)
    if (!nomineeId) continue
    for (const nomination of entity.nominations) {
      if (!candidateLinks.has(`${nomination.category_id}:${nomineeId}`)) {
        nominationCandidateDivergences.push({
          legacy_entity_id: entity.id,
          legacy_nominee_id: nomineeId,
          category_id: nomination.category_id,
        })
      }
    }
  }

  for (const nominee of nominees) {
    const resolution = assessDraftEntityForNominee(nominee, draftEntities)
    if (resolution.state === 'missing') issues.push(`legacy nominee ${nominee.id} has no canonical draft entity`)
    if (resolution.state === 'ambiguous') issues.push(`legacy nominee ${nominee.id} has ambiguous canonical draft identity`)
  }
  const draftNames = new Set(draftEntities.map((row) => row.name))
  for (const portrait of portraits) {
    if (!draftNames.has(portrait.label)) {
      issues.push(`portrait ${portrait.suggested_id} has no exact-name draft entity`)
    }
  }

  for (const beat of signatureBeats) {
    if (!draftById.has(beat.entity_id)) {
      issues.push(`signature beat ${beat.id} references unknown entity ${beat.entity_id}`)
    }
    if (beat.partner_entity_id !== null && !draftById.has(beat.partner_entity_id)) {
      issues.push(`signature beat ${beat.id} references unknown partner ${beat.partner_entity_id}`)
    }
  }

  return {
    worksheet_version: 1,
    source_pack: { ...input.showPack },
    counts,
    identity: {
      ready: issues.length === 0,
      entities: identityEntities,
    },
    catalog: {
      candidate_links: categoryNominees,
      nominees,
      draft_entities: draftEntities,
      predictions: categories.map((category) => ({
        ...category,
        candidate_legacy_nominee_ids: candidateIdsByCategory.get(category.id) ?? [],
      })),
      signature_beats: signatureBeats,
      bingo_squares: bingoSquares,
    },
    authoring_queue: {
      global: ['sources', 'claims', 'commentary_voices', 'commentary_requests'],
      entity_dossier_legacy_ids: draftEntities.map((row) => row.id),
      prediction_contract_legacy_ids: categories
        .filter((row) => row.trigger_contract === null)
        .map((row) => row.id),
      signature_beat_contract_legacy_ids: signatureBeats
        .filter((row) => row.trigger_contract === null)
        .map((row) => row.id),
      bingo_contract_legacy_ids: bingoSquares
        .filter((row) => row.trigger_contract === null)
        .map((row) => row.id),
      legacy_nomination_candidate_divergences: nominationCandidateDivergences,
    },
    issues,
  }
}
