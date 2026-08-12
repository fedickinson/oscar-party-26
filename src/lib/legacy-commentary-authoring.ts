import type {
  LegacyShowPackAuthoringWorksheet,
} from './legacy-show-pack-authoring'
import type {
  ShowPackCommentaryRequest,
  ShowPackCommentaryVoice,
} from './show-pack'
import { invalidateStaleLegacyGlobalReviewSeals } from './legacy-global-review'

const SHA256 = /^[a-f0-9]{64}$/
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export interface LegacyCommentaryDecisionManifest {
  manifest_version: 1
  artifact: 'legacy-commentary-decisions'
  target: { pack_id: string; pack_version: number }
  legacy_worksheet_sha256: string
  voices: ShowPackCommentaryVoice[]
  requests: ShowPackCommentaryRequest[]
}

interface ApplyLegacyCommentaryDecisionsInput {
  authoring: LegacyShowPackAuthoringWorksheet
  manifest: LegacyCommentaryDecisionManifest
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => (
      `${JSON.stringify(key)}:${canonical(record[key])}`
    )).join(',')}}`
  }
  return JSON.stringify(value)
}

function text(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be text`)
}

function exactKeys(value: object, expected: string[], label: string): void {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} fields are invalid`)
  }
}

function textIds(value: unknown, label: string, allowEmpty: boolean): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new Error(`${label} must be ${allowEmpty ? 'a' : 'a nonempty'} text array`)
  }
  for (const item of value) text(item, label)
  if (new Set(value).size !== value.length) throw new Error(`${label} must not contain duplicates`)
  return value as string[]
}

function mergeExact<T extends { id: string }>(current: T[], reviewed: T[], label: string): T[] {
  const merged = structuredClone(current)
  const byId = new Map(merged.map((row) => [row.id, row]))
  for (const row of reviewed) {
    const prior = byId.get(row.id)
    if (prior && canonical(prior) !== canonical(row)) {
      throw new Error(`${label} ${row.id} conflicts with prior authoring`)
    }
    if (!prior) {
      const copy = structuredClone(row)
      merged.push(copy)
      byId.set(copy.id, copy)
    }
  }
  return merged
}

export function applyLegacyCommentaryDecisions(
  input: ApplyLegacyCommentaryDecisionsInput,
): {
  worksheet: LegacyShowPackAuthoringWorksheet
  applied_voice_ids: string[]
  applied_request_ids: string[]
} {
  const { authoring, manifest } = input
  exactKeys(manifest, [
    'manifest_version', 'artifact', 'target', 'legacy_worksheet_sha256', 'voices', 'requests',
  ], 'commentary manifest')
  if (manifest.manifest_version !== 1 || manifest.artifact !== 'legacy-commentary-decisions') {
    throw new Error('commentary manifest identity is invalid')
  }
  exactKeys(manifest.target, ['pack_id', 'pack_version'], 'commentary target')
  if (manifest.target.pack_id !== authoring.pack_draft.id
    || manifest.target.pack_version !== authoring.pack_draft.version) {
    throw new Error('authoring target does not match the commentary manifest')
  }
  if (!SHA256.test(manifest.legacy_worksheet_sha256)
    || manifest.legacy_worksheet_sha256 !== authoring.source.worksheet_sha256) {
    throw new Error('legacy worksheet SHA-256 does not match the commentary manifest')
  }
  if (!Array.isArray(manifest.voices) || manifest.voices.length === 0) {
    throw new Error('commentary voices must not be empty')
  }
  if (!Array.isArray(manifest.requests) || manifest.requests.length === 0) {
    throw new Error('commentary requests must not be empty')
  }
  const claimById = new Map(authoring.claims.map((claim) => [claim.id, claim]))
  const voiceIds = manifest.voices.map((voice) => voice.id)
  const requestIds = manifest.requests.map((request) => request.id)
  if (new Set(voiceIds).size !== voiceIds.length) throw new Error('commentary voice ids must not contain duplicates')
  if (new Set(requestIds).size !== requestIds.length) throw new Error('commentary request ids must not contain duplicates')
  const manifestVoiceIds = new Set(voiceIds)

  for (const voice of manifest.voices) {
    exactKeys(voice, ['id', 'name', 'instruction', 'attitude_claim_ids'], `commentary voice ${voice.id}`)
    if (!SLUG.test(voice.id)) throw new Error(`commentary voice ${voice.id} id must be a kebab-case slug`)
    text(voice.name, `commentary voice ${voice.id} name`)
    text(voice.instruction, `commentary voice ${voice.id} instruction`)
    for (const claimId of textIds(
      voice.attitude_claim_ids,
      `commentary voice ${voice.id} attitude_claim_ids`,
      true,
    )) {
      const claim = claimById.get(claimId)
      if (!claim || claim.canon !== 'source_material' || claim.status !== 'attitude_only') {
        throw new Error(`commentary voice ${voice.id} attitude ${claimId} must be source-material attitude only`)
      }
    }
  }

  for (const request of manifest.requests) {
    exactKeys(request, [
      'id', 'speaker', 'fact_claim_ids', 'angle_claim_ids', 'angle', 'publication',
    ], `commentary request ${request.id}`)
    if (!SLUG.test(request.id)) throw new Error(`commentary request ${request.id} id must be a kebab-case slug`)
    if (!manifestVoiceIds.has(request.speaker)) {
      throw new Error(`commentary request ${request.id} references unknown manifest voice ${request.speaker}`)
    }
    text(request.angle, `commentary request ${request.id} angle`)
    for (const claimId of textIds(
      request.fact_claim_ids,
      `commentary request ${request.id} fact_claim_ids`,
      false,
    )) {
      const claim = claimById.get(claimId)
      if (!claim || claim.canon !== 'screen' || claim.status !== 'verified') {
        throw new Error(`commentary request ${request.id} fact ${claimId} must be a verified screen claim`)
      }
    }
    for (const claimId of textIds(
      request.angle_claim_ids,
      `commentary request ${request.id} angle_claim_ids`,
      true,
    )) {
      const claim = claimById.get(claimId)
      if (!claim || claim.canon !== 'discourse' || claim.status !== 'verified') {
        throw new Error(`commentary request ${request.id} angle ${claimId} must be verified discourse`)
      }
    }
    if (canonical(request.publication) !== canonical({ status: 'pending' })) {
      throw new Error(`commentary request ${request.id} publication must be exactly pending`)
    }
  }

  const worksheet = structuredClone(authoring)
  worksheet.commentary_voices = mergeExact(
    worksheet.commentary_voices,
    manifest.voices,
    'commentary voice',
  )
  worksheet.commentary_requests = mergeExact(
    worksheet.commentary_requests,
    manifest.requests,
    'commentary request',
  )
  invalidateStaleLegacyGlobalReviewSeals(worksheet)
  return {
    worksheet,
    applied_voice_ids: voiceIds,
    applied_request_ids: requestIds,
  }
}
