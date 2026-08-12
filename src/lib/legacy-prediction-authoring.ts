import type { LegacyShowPackMigrationWorksheet } from './legacy-show-pack-audit'
import type { LegacyShowPackAuthoringWorksheet } from './legacy-show-pack-authoring'
import type { AdjudicationDecision, TriggerAdjudication, TriggerContract } from './show-pack'

const SHA256 = /^[a-f0-9]{64}$/
const ADJUDICATION = new Set<AdjudicationDecision>([
  'count',
  'do_not_count',
  'explicit_only',
  'principal_accepts_if_unrefused',
  'unspecified',
])

export interface LegacyPredictionContractDecision {
  legacy_prediction_id: number
  condition: string
  exclusions: string[]
  adjudication: TriggerAdjudication
  title_review: TriggerContract['title_review']
}

export interface LegacyPredictionContractDecisionManifest {
  manifest_version: 1
  artifact: 'legacy-prediction-contract-decisions'
  target: {
    pack_id: string
    pack_version: number
  }
  legacy_worksheet_sha256: string
  decisions: LegacyPredictionContractDecision[]
}

export interface ApplyLegacyPredictionContractDecisionsInput {
  legacy: LegacyShowPackMigrationWorksheet
  legacyWorksheetSha256: string
  authoring: LegacyShowPackAuthoringWorksheet
  manifest: LegacyPredictionContractDecisionManifest
}

export interface ApplyLegacyPredictionContractDecisionsResult {
  worksheet: LegacyShowPackAuthoringWorksheet
  applied_prediction_ids: number[]
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

function assertExactKeys(value: object, expected: string[], label: string): void {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} fields are invalid`)
  }
}

function assertExactValues<T extends string | number>(
  actual: T[],
  expected: T[],
  label: string,
): void {
  const normalizedActual = [...actual].sort()
  const normalizedExpected = [...expected].sort()
  if (normalizedActual.length !== normalizedExpected.length
    || normalizedActual.some((value, index) => value !== normalizedExpected[index])) {
    throw new Error(label)
  }
}

function assertDecision(decision: LegacyPredictionContractDecision): void {
  const label = `prediction ${decision.legacy_prediction_id}`
  assertExactKeys(
    decision,
    ['legacy_prediction_id', 'condition', 'exclusions', 'adjudication', 'title_review'],
    `${label} decision`,
  )
  if (!Number.isInteger(decision.legacy_prediction_id) || decision.legacy_prediction_id < 1) {
    throw new Error(`${label} id must be a positive integer`)
  }
  assertText(decision.condition, `${label} condition`)
  if (!Array.isArray(decision.exclusions) || decision.exclusions.length === 0) {
    throw new Error(`${label} exclusions must be a non-empty array`)
  }
  for (const [index, exclusion] of decision.exclusions.entries()) {
    assertText(exclusion, `${label} exclusion ${index}`)
  }
  if (new Set(decision.exclusions).size !== decision.exclusions.length) {
    throw new Error(`${label} exclusions must not contain duplicates`)
  }
  assertExactKeys(decision.adjudication, ['proxies', 'offscreen', 'mentions'], `${label} adjudication`)
  for (const dimension of ['proxies', 'offscreen', 'mentions'] as const) {
    const value = decision.adjudication[dimension]
    if (!ADJUDICATION.has(value)) throw new Error(`${label} adjudication ${dimension} is invalid`)
    if (value === 'unspecified') throw new Error(`${label} adjudication ${dimension} must be explicit`)
  }
  assertExactKeys(decision.title_review, ['status', 'note'], `${label} title review`)
  if (decision.title_review.status !== 'approved') {
    throw new Error(`${label} title review must be approved`)
  }
  assertText(decision.title_review.note, `${label} title review note`)
}

function assertManifest(
  manifest: LegacyPredictionContractDecisionManifest,
  authoring: LegacyShowPackAuthoringWorksheet,
  legacyWorksheetSha256: string,
): void {
  assertExactKeys(
    manifest,
    ['manifest_version', 'artifact', 'target', 'legacy_worksheet_sha256', 'decisions'],
    'prediction decision manifest',
  )
  if (manifest.manifest_version !== 1
    || manifest.artifact !== 'legacy-prediction-contract-decisions') {
    throw new Error('prediction decision manifest identity is invalid')
  }
  if (!SHA256.test(legacyWorksheetSha256)
    || legacyWorksheetSha256 !== manifest.legacy_worksheet_sha256
    || authoring.source.worksheet_sha256 !== manifest.legacy_worksheet_sha256) {
    throw new Error('legacy worksheet SHA-256 does not match the prediction decision manifest')
  }
  assertExactKeys(manifest.target, ['pack_id', 'pack_version'], 'prediction decision target')
  if (authoring.pack_draft.id !== manifest.target.pack_id
    || authoring.pack_draft.version !== manifest.target.pack_version) {
    throw new Error('authoring target does not match the prediction decision manifest')
  }
  if (!Array.isArray(manifest.decisions)) throw new Error('prediction decisions must be an array')
  for (const decision of manifest.decisions) assertDecision(decision)
}

export function applyLegacyPredictionContractDecisions(
  input: ApplyLegacyPredictionContractDecisionsInput,
): ApplyLegacyPredictionContractDecisionsResult {
  const { legacy, legacyWorksheetSha256, authoring, manifest } = input
  assertManifest(manifest, authoring, legacyWorksheetSha256)

  const auditedPredictionIds = legacy.catalog.predictions.map((prediction) => prediction.id)
  const decisionIds = manifest.decisions.map((decision) => decision.legacy_prediction_id)
  assertExactValues(
    decisionIds,
    auditedPredictionIds,
    'prediction decisions must exactly cover the audited prediction ids',
  )
  if (new Set(decisionIds).size !== decisionIds.length) {
    throw new Error('prediction decision ids must not contain duplicates')
  }
  assertExactValues(
    authoring.predictions.map((prediction) => prediction.legacy_prediction_id),
    auditedPredictionIds,
    'authoring predictions must exactly cover the audited prediction ids',
  )

  const identityByNomineeId = new Map<string, LegacyShowPackMigrationWorksheet['identity']['entities'][number]>()
  for (const identity of legacy.identity.entities) {
    if (identity.legacy_nominee_id === null) continue
    if (identityByNomineeId.has(identity.legacy_nominee_id)) {
      throw new Error(`legacy nominee ${identity.legacy_nominee_id} maps to multiple entities`)
    }
    identityByNomineeId.set(identity.legacy_nominee_id, identity)
  }
  const entityByLegacyId = new Map(authoring.entities.map((entity) => [entity.legacy_entity_id, entity]))
  const claimById = new Map(authoring.claims.map((claim) => [claim.id, claim]))
  const decisionById = new Map(manifest.decisions.map((decision) => [
    decision.legacy_prediction_id,
    decision,
  ]))
  const worksheet = structuredClone(authoring)

  for (const audited of legacy.catalog.predictions) {
    const prediction = worksheet.predictions.find((row) => (
      row.legacy_prediction_id === audited.id
    ))!
    if (!Array.isArray(prediction.candidate_legacy_nominee_ids)) {
      throw new Error(`prediction ${audited.id} candidates need explicit approval`)
    }
    assertExactValues(
      prediction.candidate_legacy_nominee_ids,
      audited.candidate_legacy_nominee_ids,
      `prediction ${audited.id} candidates must match the audited candidate universe`,
    )
    if (new Set(prediction.candidate_legacy_nominee_ids).size
      !== prediction.candidate_legacy_nominee_ids.length) {
      throw new Error(`prediction ${audited.id} candidates must not contain duplicates`)
    }

    const basisClaimIds: string[] = []
    for (const nomineeId of prediction.candidate_legacy_nominee_ids) {
      const identity = identityByNomineeId.get(nomineeId)
      if (!identity) throw new Error(`prediction ${audited.id} references unknown nominee ${nomineeId}`)
      const entity = entityByLegacyId.get(identity.legacy_entity_id)
      if (!entity) throw new Error(`prediction ${audited.id} candidate ${identity.name} is not authored`)
      const factClaimIds = entity.dossier?.fact_claim_ids ?? []
      if (factClaimIds.length === 0) {
        throw new Error(`prediction ${audited.id} candidate ${identity.name} needs a dossier fact claim`)
      }
      for (const claimId of factClaimIds) {
        const claim = claimById.get(claimId)
        if (!claim || claim.canon !== 'screen' || claim.status !== 'verified') {
          throw new Error(`prediction ${audited.id} basis claim ${claimId} must be verified screen canon`)
        }
        if (!basisClaimIds.includes(claimId)) basisClaimIds.push(claimId)
      }
    }

    const decision = decisionById.get(audited.id)!
    const contract: TriggerContract = {
      condition: decision.condition,
      exclusions: [...decision.exclusions],
      adjudication: { ...decision.adjudication },
      title_review: { ...decision.title_review },
      basis_claim_ids: basisClaimIds,
    }
    if (prediction.contract !== null
      && canonicalJson(prediction.contract) !== canonicalJson(contract)) {
      throw new Error(`prediction ${audited.id} already has a conflicting contract`)
    }
    prediction.contract = contract
  }

  return { worksheet, applied_prediction_ids: [...auditedPredictionIds] }
}
