import type { LegacyShowPackMigrationWorksheet } from './legacy-show-pack-audit'
import type { LegacyShowPackAuthoringWorksheet } from './legacy-show-pack-authoring'
import type { TriggerAdjudication, TriggerContract } from './show-pack'

const SHA256 = /^[a-f0-9]{64}$/
const DECISIONS = new Set(['count', 'do_not_count', 'explicit_only', 'principal_accepts_if_unrefused'])

interface LegacySignatureDeathDoctrine {
  exclusions: string[]
  adjudication: TriggerAdjudication
  title_review: TriggerContract['title_review']
}

export interface LegacySignatureDeathDecisionManifest {
  manifest_version: 1
  artifact: 'legacy-signature-death-decisions'
  target: { pack_id: string; pack_version: number }
  legacy_worksheet_sha256: string
  person_beat_ids: number[]
  creature_beat_ids: number[]
  person: LegacySignatureDeathDoctrine
  creature: LegacySignatureDeathDoctrine
}

export interface ApplyLegacySignatureDeathDecisionsInput {
  legacy: LegacyShowPackMigrationWorksheet
  legacyWorksheetSha256: string
  authoring: LegacyShowPackAuthoringWorksheet
  manifest: LegacySignatureDeathDecisionManifest
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function exactKeys(value: object, keys: string[], label: string): void {
  const actual = Object.keys(value).sort(); const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} fields are invalid`)
  }
}

function exactNumbers(actual: number[], expected: number[], label: string): void {
  const left = [...actual].sort((a, b) => a - b); const right = [...expected].sort((a, b) => a - b)
  if (left.length !== right.length || left.some((value, index) => value !== right[index])) throw new Error(label)
}

function assertText(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be text`)
}

function assertDoctrine(value: LegacySignatureDeathDoctrine, label: string): void {
  exactKeys(value, ['exclusions', 'adjudication', 'title_review'], `${label} death doctrine`)
  if (!Array.isArray(value.exclusions) || value.exclusions.length === 0) {
    throw new Error(`${label} death exclusions must not be empty`)
  }
  value.exclusions.forEach((text, index) => assertText(text, `${label} death exclusion ${index}`))
  exactKeys(value.adjudication, ['proxies', 'offscreen', 'mentions'], `${label} death adjudication`)
  for (const dimension of ['proxies', 'offscreen', 'mentions'] as const) {
    if (!DECISIONS.has(value.adjudication[dimension])) {
      throw new Error(`${label} death adjudication ${dimension} must be explicit`)
    }
  }
  exactKeys(value.title_review, ['status', 'note'], `${label} death title review`)
  if (value.title_review.status !== 'approved') throw new Error(`${label} death title review must be approved`)
  assertText(value.title_review.note, `${label} death title review note`)
}

export function applyLegacySignatureDeathDecisions(input: ApplyLegacySignatureDeathDecisionsInput): {
  worksheet: LegacyShowPackAuthoringWorksheet
  applied_beat_ids: number[]
} {
  const { legacy, legacyWorksheetSha256, authoring, manifest } = input
  exactKeys(manifest, [
    'manifest_version', 'artifact', 'target', 'legacy_worksheet_sha256',
    'person_beat_ids', 'creature_beat_ids', 'person', 'creature',
  ], 'signature death decision manifest')
  if (manifest.manifest_version !== 1 || manifest.artifact !== 'legacy-signature-death-decisions') {
    throw new Error('signature death decision manifest identity is invalid')
  }
  if (!SHA256.test(legacyWorksheetSha256)
    || legacyWorksheetSha256 !== manifest.legacy_worksheet_sha256
    || authoring.source.worksheet_sha256 !== manifest.legacy_worksheet_sha256) {
    throw new Error('legacy worksheet SHA-256 does not match the signature death decision manifest')
  }
  exactKeys(manifest.target, ['pack_id', 'pack_version'], 'signature death decision target')
  if (authoring.pack_draft.id !== manifest.target.pack_id
    || authoring.pack_draft.version !== manifest.target.pack_version) {
    throw new Error('authoring target does not match the signature death decision manifest')
  }
  assertDoctrine(manifest.person, 'person')
  assertDoctrine(manifest.creature, 'creature')

  const auditedDeaths = legacy.catalog.signature_beats.filter((beat) => beat.name.endsWith(' Dies'))
  const decisionIds = [...manifest.person_beat_ids, ...manifest.creature_beat_ids]
  exactNumbers(decisionIds, auditedDeaths.map((beat) => beat.id), 'death decision ids must exactly cover the audited death beats')
  if (new Set(decisionIds).size !== decisionIds.length) throw new Error('death decision ids must not contain duplicates')

  const personIds = new Set(manifest.person_beat_ids)
  const creatureIds = new Set(manifest.creature_beat_ids)
  const authoringEntityByLegacyId = new Map(authoring.entities.map((entity) => [entity.legacy_entity_id, entity]))
  const claimsById = new Map(authoring.claims.map((claim) => [claim.id, claim]))
  const worksheet = structuredClone(authoring)
  for (const audited of auditedDeaths) {
    const entity = authoringEntityByLegacyId.get(audited.entity_id)
    if (!entity) throw new Error(`signature beat ${audited.id} owner is not authored`)
    const expectedKind = personIds.has(audited.id) ? 'person' : creatureIds.has(audited.id) ? 'creature' : null
    if (entity.kind !== expectedKind) throw new Error(`signature beat ${audited.id} owner must be ${expectedKind}`)
    const factClaims = entity.dossier?.fact_claim_ids ?? []
    if (factClaims.length === 0) throw new Error(`signature beat ${audited.id} owner needs a dossier fact claim`)
    for (const claimId of factClaims) {
      const claim = claimsById.get(claimId)
      if (!claim || claim.canon !== 'screen' || claim.status !== 'verified') {
        throw new Error(`signature beat ${audited.id} basis claim ${claimId} must be verified screen canon`)
      }
    }
    const doctrine = expectedKind === 'person' ? manifest.person : manifest.creature
    const contract: TriggerContract = {
      condition: audited.trigger_text,
      exclusions: [...doctrine.exclusions],
      adjudication: { ...doctrine.adjudication },
      title_review: { ...doctrine.title_review },
      basis_claim_ids: [...factClaims],
    }
    const beat = worksheet.signature_beats.find((row) => row.legacy_signature_beat_id === audited.id)
    if (!beat) throw new Error(`signature beat ${audited.id} is not authored`)
    if (beat.contract !== null && canonicalJson(beat.contract) !== canonicalJson(contract)) {
      throw new Error(`signature beat ${audited.id} already has a conflicting contract`)
    }
    beat.contract = contract
  }
  return { worksheet, applied_beat_ids: auditedDeaths.map((beat) => beat.id) }
}
