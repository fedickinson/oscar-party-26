import type { LegacyShowPackMigrationWorksheet } from './legacy-show-pack-audit'
import type { LegacyShowPackAuthoringWorksheet } from './legacy-show-pack-authoring'
import type { TriggerAdjudication, TriggerContract } from './show-pack'

const SHA256 = /^[a-f0-9]{64}$/
const EXPLICIT = new Set(['count', 'do_not_count', 'explicit_only', 'principal_accepts_if_unrefused'])
export interface LegacySignatureBatchDecision { legacy_signature_beat_id: number; basis_legacy_entity_ids: string[]; condition: string; exclusions: string[]; adjudication: TriggerAdjudication; title_review: TriggerContract['title_review'] }
export interface LegacySignatureBatchDecisionManifest { manifest_version: 1; artifact: 'legacy-signature-batch-decisions'; batch_id: string; target: { pack_id: string; pack_version: number }; legacy_worksheet_sha256: string; decisions: LegacySignatureBatchDecision[] }
interface Input { legacy: LegacyShowPackMigrationWorksheet; legacyWorksheetSha256: string; authoring: LegacyShowPackAuthoringWorksheet; manifest: LegacySignatureBatchDecisionManifest }

function canonical(value: unknown): string { if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`; if (typeof value === 'object' && value !== null) { const r = value as Record<string, unknown>; return `{${Object.keys(r).sort().map((k) => `${JSON.stringify(k)}:${canonical(r[k])}`).join(',')}}` } return JSON.stringify(value) }
function text(value: unknown, label: string): asserts value is string { if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be text`) }
function keys(value: object, expected: string[], label: string): void { const a = Object.keys(value).sort(); const e = [...expected].sort(); if (a.length !== e.length || a.some((k, i) => k !== e[i])) throw new Error(`${label} fields are invalid`) }

export function applyLegacySignatureBatchDecisions(input: Input): { worksheet: LegacyShowPackAuthoringWorksheet; applied_beat_ids: number[] } {
  const { legacy, legacyWorksheetSha256, authoring, manifest } = input
  keys(manifest, ['manifest_version', 'artifact', 'batch_id', 'target', 'legacy_worksheet_sha256', 'decisions'], 'signature batch manifest')
  if (manifest.manifest_version !== 1 || manifest.artifact !== 'legacy-signature-batch-decisions') throw new Error('signature batch manifest identity is invalid')
  text(manifest.batch_id, 'signature batch id')
  if (!SHA256.test(legacyWorksheetSha256) || legacyWorksheetSha256 !== manifest.legacy_worksheet_sha256 || authoring.source.worksheet_sha256 !== manifest.legacy_worksheet_sha256) throw new Error('legacy worksheet SHA-256 does not match the signature batch manifest')
  keys(manifest.target, ['pack_id', 'pack_version'], 'signature batch target')
  if (authoring.pack_draft.id !== manifest.target.pack_id || authoring.pack_draft.version !== manifest.target.pack_version) throw new Error('authoring target does not match the signature batch manifest')
  if (!Array.isArray(manifest.decisions) || manifest.decisions.length === 0) throw new Error('signature batch decisions must not be empty')
  const auditedById = new Map(legacy.catalog.signature_beats.map((beat) => [beat.id, beat])); const ids = manifest.decisions.map((d) => d.legacy_signature_beat_id)
  if (new Set(ids).size !== ids.length) throw new Error('signature batch decision ids must not contain duplicates')
  const entities = new Map(authoring.entities.map((entity) => [entity.legacy_entity_id, entity])); const claims = new Map(authoring.claims.map((claim) => [claim.id, claim])); const worksheet = structuredClone(authoring)
  for (const decision of manifest.decisions) {
    const label = `signature beat ${decision.legacy_signature_beat_id}`; keys(decision, ['legacy_signature_beat_id', 'basis_legacy_entity_ids', 'condition', 'exclusions', 'adjudication', 'title_review'], `${label} decision`)
    const audited = auditedById.get(decision.legacy_signature_beat_id); if (!audited) throw new Error(`${label} is not audited`)
    text(decision.condition, `${label} condition`); if (decision.condition !== audited.trigger_text) throw new Error(`${label} condition must match the audited trigger text`)
    if (!Array.isArray(decision.basis_legacy_entity_ids) || !decision.basis_legacy_entity_ids.includes(audited.entity_id)) throw new Error(`${label} basis must include its audited owner`)
    if (new Set(decision.basis_legacy_entity_ids).size !== decision.basis_legacy_entity_ids.length) throw new Error(`${label} basis entities must not contain duplicates`)
    if (!Array.isArray(decision.exclusions) || decision.exclusions.length === 0) throw new Error(`${label} exclusions must not be empty`); decision.exclusions.forEach((v, i) => text(v, `${label} exclusion ${i}`))
    keys(decision.adjudication, ['proxies', 'offscreen', 'mentions'], `${label} adjudication`); for (const dimension of ['proxies', 'offscreen', 'mentions'] as const) if (!EXPLICIT.has(decision.adjudication[dimension])) throw new Error(`${label} adjudication ${dimension} must be explicit`)
    keys(decision.title_review, ['status', 'note'], `${label} title review`); if (decision.title_review.status !== 'approved') throw new Error(`${label} title review must be approved`); text(decision.title_review.note, `${label} title review note`)
    const basis: string[] = []; for (const entityId of decision.basis_legacy_entity_ids) { const entity = entities.get(entityId); if (!entity) throw new Error(`${label} basis entity ${entityId} is not authored`); const factIds = entity.dossier?.fact_claim_ids ?? []; if (!factIds.length) throw new Error(`${label} basis entity ${entityId} needs a dossier fact claim`); for (const claimId of factIds) { const claim = claims.get(claimId); if (!claim || claim.canon !== 'screen' || claim.status !== 'verified') throw new Error(`${label} basis claim ${claimId} must be verified screen canon`); if (!basis.includes(claimId)) basis.push(claimId) } }
    const contract: TriggerContract = { condition: decision.condition, exclusions: [...decision.exclusions], adjudication: { ...decision.adjudication }, title_review: { ...decision.title_review }, basis_claim_ids: basis }
    const beat = worksheet.signature_beats.find((row) => row.legacy_signature_beat_id === audited.id); if (!beat) throw new Error(`${label} is not authored`); if (beat.contract !== null && canonical(beat.contract) !== canonical(contract)) throw new Error(`${label} already has a conflicting contract`); beat.contract = contract
  }
  return { worksheet, applied_beat_ids: ids }
}
