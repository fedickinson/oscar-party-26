import type { LegacyShowPackMigrationWorksheet } from './legacy-show-pack-audit'
import type { LegacyShowPackAuthoringWorksheet } from './legacy-show-pack-authoring'
import type { ShowPackClaim, ShowPackSource } from './show-pack'
import { invalidateStaleLegacyGlobalReviewSeals } from './legacy-global-review'

const SHA256 = /^[a-f0-9]{64}$/
const COMMIT_SHA = /^[a-f0-9]{40}$/
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export interface LegacyDossierProfile {
  name: string
  screen_state: string
  audience_reaction: string
}

export interface LegacyDossierDecisionManifest {
  manifest_version: 1
  artifact: 'legacy-dossier-decisions'
  target: {
    pack_id: string
    pack_version: number
  }
  legacy_worksheet_sha256: string
  encyclopedia_sha256: string
  fandom_core_revision: string
  approved_entity_legacy_ids: string[]
  screen_source: ShowPackSource
  sentiment_source: ShowPackSource
}

export interface ApplyLegacyDossierDecisionsInput {
  legacy: LegacyShowPackMigrationWorksheet
  legacyWorksheetSha256: string
  authoring: LegacyShowPackAuthoringWorksheet
  profiles: LegacyDossierProfile[]
  encyclopediaSha256: string
  fandomCoreRevision: string
  manifest: LegacyDossierDecisionManifest
}

export interface ApplyLegacyDossierDecisionsResult {
  worksheet: LegacyShowPackAuthoringWorksheet
  applied_entity_legacy_ids: string[]
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => (
      `${JSON.stringify(key)}:${canonicalJson(record[key])}`
    )).join(',')}}`
  }
  return JSON.stringify(value)
}

function assertText(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be text`)
}

function assertExactIds(actual: string[], expected: string[], label: string): void {
  const normalizedActual = [...actual].sort()
  const normalizedExpected = [...expected].sort()
  if (normalizedActual.length !== normalizedExpected.length
    || normalizedActual.some((id, index) => id !== normalizedExpected[index])) {
    throw new Error(label)
  }
}

function assertExactKeys(value: object, expected: string[], label: string): void {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} fields are invalid`)
  }
}

function mergeRows<T extends { id: string }>(current: T[], incoming: T[], label: string): T[] {
  const currentIds = current.map((row) => row.id)
  const incomingIds = incoming.map((row) => row.id)
  if (new Set(currentIds).size !== currentIds.length) throw new Error(`prior ${label} ids contain duplicates`)
  if (new Set(incomingIds).size !== incomingIds.length) throw new Error(`${label} ids contain duplicates`)
  const result = current.map((row) => structuredClone(row))
  const byId = new Map(result.map((row) => [row.id, row]))
  for (const row of incoming) {
    const existing = byId.get(row.id)
    if (existing && canonicalJson(existing) !== canonicalJson(row)) {
      throw new Error(`${label} ${row.id} conflicts with prior authoring`)
    }
    if (!existing) {
      const copy = structuredClone(row)
      result.push(copy)
      byId.set(copy.id, copy)
    }
  }
  return result
}

function assertManifest(
  manifest: LegacyDossierDecisionManifest,
  authoring: LegacyShowPackAuthoringWorksheet,
  legacyWorksheetSha256: string,
  encyclopediaSha256: string,
  fandomCoreRevision: string,
): void {
  if (manifest.manifest_version !== 1 || manifest.artifact !== 'legacy-dossier-decisions') {
    throw new Error('dossier decision manifest identity is invalid')
  }
  if (!SHA256.test(legacyWorksheetSha256)
    || legacyWorksheetSha256 !== manifest.legacy_worksheet_sha256
    || authoring.source.worksheet_sha256 !== manifest.legacy_worksheet_sha256) {
    throw new Error('legacy worksheet SHA-256 does not match the dossier decision manifest')
  }
  if (!SHA256.test(encyclopediaSha256)
    || encyclopediaSha256 !== manifest.encyclopedia_sha256) {
    throw new Error('encyclopedia SHA-256 does not match the dossier decision manifest')
  }
  if (!COMMIT_SHA.test(fandomCoreRevision)
    || fandomCoreRevision !== manifest.fandom_core_revision) {
    throw new Error('Fandom Core revision does not match the dossier decision manifest')
  }
  if (authoring.pack_draft.id !== manifest.target.pack_id
    || authoring.pack_draft.version !== manifest.target.pack_version) {
    throw new Error('authoring target does not match the dossier decision manifest')
  }
  if (new Set(manifest.approved_entity_legacy_ids).size
    !== manifest.approved_entity_legacy_ids.length) {
    throw new Error('approved dossier ids must not contain duplicates')
  }
  if (manifest.screen_source.kind !== 'operator_record') {
    throw new Error('dossier screen source must be an operator record')
  }
  if (manifest.sentiment_source.kind !== 'sentiment') {
    throw new Error('dossier audience source must be sentiment')
  }
  for (const [label, source] of [
    ['screen', manifest.screen_source],
    ['sentiment', manifest.sentiment_source],
  ] as const) {
    assertExactKeys(source, ['id', 'kind', 'title', 'locator'], `dossier ${label} source`)
    if (!SLUG.test(source.id)) throw new Error(`dossier ${label} source id must be a slug`)
    assertText(source.title, `dossier ${label} source title`)
    assertText(source.locator, `dossier ${label} source locator`)
  }
  if (manifest.screen_source.id === manifest.sentiment_source.id) {
    throw new Error('dossier screen and sentiment sources must have different ids')
  }
}

export function applyLegacyDossierDecisions(
  input: ApplyLegacyDossierDecisionsInput,
): ApplyLegacyDossierDecisionsResult {
  const {
    legacy,
    legacyWorksheetSha256,
    authoring,
    profiles,
    encyclopediaSha256,
    fandomCoreRevision,
    manifest,
  } = input
  assertManifest(
    manifest,
    authoring,
    legacyWorksheetSha256,
    encyclopediaSha256,
    fandomCoreRevision,
  )

  const auditedEntities = legacy.identity.entities
  const auditedNames = auditedEntities.map((entity) => entity.name)
  const auditedLegacyIds = auditedEntities.map((entity) => entity.legacy_entity_id)
  if (new Set(auditedNames).size !== auditedNames.length) {
    throw new Error('audited entity names must be unique for dossier authoring')
  }
  if (new Set(auditedLegacyIds).size !== auditedLegacyIds.length) {
    throw new Error('audited legacy entity ids must be unique for dossier authoring')
  }
  const profileNames = profiles.map((profile) => profile.name)
  assertExactIds(
    profileNames,
    auditedNames,
    'dossier profiles must exactly cover the audited entity names',
  )
  assertExactIds(
    manifest.approved_entity_legacy_ids,
    auditedLegacyIds,
    'approved dossier ids must exactly cover the audited legacy entity ids',
  )
  const profileByName = new Map<string, LegacyDossierProfile>()
  for (const profile of profiles) {
    assertText(profile.name, 'dossier profile name')
    assertText(profile.screen_state, `dossier profile ${profile.name} screen state`)
    assertText(profile.audience_reaction, `dossier profile ${profile.name} audience reaction`)
    profileByName.set(profile.name, profile)
  }

  const worksheet = structuredClone(authoring)
  const authoringLegacyIds = worksheet.entities.map((entity) => entity.legacy_entity_id)
  assertExactIds(
    authoringLegacyIds,
    auditedLegacyIds,
    'authoring entities must exactly cover the audited legacy entity ids',
  )
  worksheet.sources = mergeRows(
    worksheet.sources,
    [manifest.screen_source, manifest.sentiment_source],
    'source',
  )

  const claims: ShowPackClaim[] = []
  const dossierByLegacyId = new Map<string, NonNullable<LegacyShowPackAuthoringWorksheet['entities'][number]['dossier']>>()
  for (const entity of auditedEntities) {
    const authoringEntity = worksheet.entities.find((row) => (
      row.legacy_entity_id === entity.legacy_entity_id
    ))!
    const profile = profileByName.get(entity.name)!
    const screenClaimId = `${authoringEntity.id}-screen-state`
    const audienceClaimId = `${authoringEntity.id}-audience-reaction`
    if (!SLUG.test(screenClaimId) || !SLUG.test(audienceClaimId)) {
      throw new Error(`entity ${entity.name} cannot produce stable dossier claim ids`)
    }
    claims.push({
      id: screenClaimId,
      canon: 'screen',
      status: 'verified',
      text: profile.screen_state,
      source_ids: [manifest.screen_source.id],
    }, {
      id: audienceClaimId,
      canon: 'discourse',
      status: 'verified',
      text: profile.audience_reaction,
      source_ids: [manifest.sentiment_source.id],
    })
    dossierByLegacyId.set(entity.legacy_entity_id, {
      fact_claim_ids: [screenClaimId],
      discourse_claim_ids: [audienceClaimId],
    })
  }
  worksheet.claims = mergeRows(worksheet.claims, claims, 'claim')

  for (const entity of worksheet.entities) {
    const dossier = dossierByLegacyId.get(entity.legacy_entity_id)!
    if (entity.dossier !== null && canonicalJson(entity.dossier) !== canonicalJson(dossier)) {
      const name = auditedEntities.find((row) => (
        row.legacy_entity_id === entity.legacy_entity_id
      ))!.name
      throw new Error(`entity ${name} already has a conflicting dossier`)
    }
    entity.dossier = dossier
  }

  invalidateStaleLegacyGlobalReviewSeals(worksheet)

  return {
    worksheet,
    applied_entity_legacy_ids: [...auditedLegacyIds],
  }
}
