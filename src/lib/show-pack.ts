import { groundedLinePromptContractSha256 } from './grounded-line-contract'

export const SHOW_PACK_SCHEMA_VERSION = 3 as const

export type ShowFactSource = 'scheduled' | 'room_declared' | 'ai_witnessed'
export type ShowPackSourceKind =
  | 'screen'
  | 'operator_record'
  | 'recap'
  | 'sentiment'
  | 'trailer'
  | 'source_material'
  | 'authoring_record'

export type ClaimCanon = 'screen' | 'discourse' | 'source_material' | 'authoring'
export type ClaimStatus = 'verified' | 'recap' | 'unverifiable' | 'attitude_only'
export type EntityKind = 'person' | 'creature' | 'group' | 'film' | 'object' | 'other'
export type LikelihoodTier = 'likely' | 'toss_up' | 'long_shot' | 'chaos'
export type AdjudicationDecision =
  | 'count'
  | 'do_not_count'
  | 'explicit_only'
  | 'principal_accepts_if_unrefused'
  | 'unspecified'

export interface ShowPackSource {
  id: string
  kind: ShowPackSourceKind
  title: string
  locator: string
}

export interface ShowPackClaim {
  id: string
  canon: ClaimCanon
  status: ClaimStatus
  text: string
  source_ids: string[]
}

export interface ShowPackEntity {
  id: string
  name: string
  kind: EntityKind
  group: string
  draftable: boolean
  portrait: {
    path: string
    sha256: string
  }
  dossier: {
    fact_claim_ids: string[]
    discourse_claim_ids: string[]
  }
}

export interface TriggerContract {
  condition: string
  exclusions: string[]
  adjudication: TriggerAdjudication
  title_review: TriggerTitleReview
  basis_claim_ids: string[]
}

interface ShowPackWagerDoctrine extends TriggerContract {
  id: string
  title: string
}

export interface ShowPackPrediction extends ShowPackWagerDoctrine {
  points: number
  tier: number
  candidate_entity_ids: string[]
}

export interface TriggerAdjudication {
  proxies: AdjudicationDecision
  offscreen: AdjudicationDecision
  mentions: AdjudicationDecision
}

export interface TriggerTitleReview {
  status: 'approved' | 'needs_revision'
  note: string
}

interface ShowPackTriggerBase extends ShowPackWagerDoctrine {
  probability_pct: number
  likelihood_tier: LikelihoodTier
}

export interface ShowPackSignatureBeat extends ShowPackTriggerBase {
  entity_ids: string[]
  points: number
  pitch: string
}

export interface ShowPackBingoSquare extends ShowPackTriggerBase {
  why_it_is_fun: string
  storyline_tags: string[]
}

export interface CommentaryPublication {
  status: 'pending' | 'ready' | 'blocked'
  text?: string
  grounding?: {
    pipeline: 'scripts/grounded-line.mts'
    prompt_contract_sha256?: string
    speaker: string
    voice_block: string[]
    fact_block: string[]
    angle_block: string[]
    attempts: number
    residual_findings: string[]
  }
}

export interface ShowPackCommentaryVoice {
  id: string
  name: string
  instruction: string
  attitude_claim_ids: string[]
}

export interface ShowPackCommentaryRequest {
  id: string
  speaker: string
  fact_claim_ids: string[]
  angle_claim_ids: string[]
  angle: string
  publication: CommentaryPublication
}

export interface ShowPack {
  schema_version: typeof SHOW_PACK_SCHEMA_VERSION
  pack: {
    id: string
    version: number
    title: string
    property: string
    installment: string
    fact_source: ShowFactSource
    canon_cutoff: string
    predecessor?: {
      pack_id: string
      settlement_id: string
      settlement_version: number
    }
  }
  sources: ShowPackSource[]
  claims: ShowPackClaim[]
  entities: ShowPackEntity[]
  predictions: ShowPackPrediction[]
  signature_beats: ShowPackSignatureBeat[]
  bingo_squares: ShowPackBingoSquare[]
  commentary_voices: ShowPackCommentaryVoice[]
  commentary_requests: ShowPackCommentaryRequest[]
}

export interface ShowPackCommentaryContext {
  speaker: string
  voice_block: string[]
  fact_block: string[]
  angle_block: string[]
}

function commentaryVoiceBlock(
  voice: ShowPackCommentaryVoice,
  claims: Map<string, ShowPackClaim>,
): string[] {
  return [
    `Voice: ${voice.name}`,
    `Expression instruction: ${voice.instruction}`,
    ...voice.attitude_claim_ids.map((claimId) => (
      `Source-material attitude: ${claims.get(claimId)!.text}`
    )),
  ]
}

function commentaryAngleBlock(
  request: ShowPackCommentaryRequest,
  claims: Map<string, ShowPackClaim>,
): string[] {
  return [
    request.angle,
    ...request.angle_claim_ids.map((claimId) => {
      const claim = claims.get(claimId)!
      const label = claim.canon === 'source_material'
        ? 'Source-material attitude'
        : 'Audience discourse'
      return `${label}: ${claim.text}`
    }),
  ]
}

/** One canonical projection owns every input sent to grounded-line. */
export function buildShowPackCommentaryContext(
  pack: ShowPack,
  request: ShowPackCommentaryRequest,
): ShowPackCommentaryContext {
  const claims = new Map(pack.claims.map((claim) => [claim.id, claim]))
  const voice = pack.commentary_voices.find((candidate) => candidate.id === request.speaker)
  if (!voice) throw new Error(`commentary ${request.id} references unknown voice ${request.speaker}`)
  return {
    speaker: voice.id,
    voice_block: commentaryVoiceBlock(voice, claims),
    fact_block: request.fact_claim_ids.map((claimId) => claims.get(claimId)!.text),
    angle_block: commentaryAngleBlock(request, claims),
  }
}

export interface ShowPackIssue {
  message: string
}

const SOURCE_KINDS = new Set<ShowPackSourceKind>([
  'screen', 'operator_record', 'recap', 'sentiment', 'trailer', 'source_material',
  'authoring_record',
])
const FACT_SOURCES = new Set<ShowFactSource>(['scheduled', 'room_declared', 'ai_witnessed'])
const SHA256 = /^[a-f0-9]{64}$/
const CLAIM_CANONS = new Set<ClaimCanon>(['screen', 'discourse', 'source_material', 'authoring'])
const CLAIM_STATUSES = new Set<ClaimStatus>(['verified', 'recap', 'unverifiable', 'attitude_only'])
const ENTITY_KINDS = new Set<EntityKind>(['person', 'creature', 'group', 'film', 'object', 'other'])
const ADJUDICATION_DECISIONS = new Set<AdjudicationDecision>([
  'count', 'do_not_count', 'explicit_only', 'principal_accepts_if_unrefused', 'unspecified',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isSlug(value: unknown): value is string {
  return hasText(value) && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
}

function isDeployOwnedRasterAsset(value: unknown): value is string {
  return typeof value === 'string'
    && /^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.(?:avif|jpe?g|png|webp)$/.test(value)
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0
}

function pushDuplicateIssues(
  rows: unknown[],
  label: string,
  issues: string[],
): void {
  const seen = new Set<string>()
  for (const row of rows) {
    if (!isRecord(row) || !hasText(row.id)) continue
    if (seen.has(row.id)) issues.push(`duplicate ${label} id ${row.id}`)
    seen.add(row.id)
  }
}

function pushDuplicateValues(values: string[], label: string, issues: string[]): void {
  const seen = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) issues.push(`${label} ${value}`)
    seen.add(value)
  }
}

function checkExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
  issues: string[],
): void {
  const known = new Set(allowed)
  for (const key of Object.keys(value)) {
    if (!known.has(key)) issues.push(`${label} has unknown field ${key}`)
  }
}

function checkTextArray(value: unknown, label: string, issues: string[], requireOne = false): value is string[] {
  if (!Array.isArray(value)) {
    issues.push(`${label} must be an array`)
    return false
  }
  if (requireOne && value.length === 0) issues.push(`${label} must not be empty`)
  value.forEach((entry, index) => {
    if (!hasText(entry)) issues.push(`${label} item ${index + 1} must be non-empty text`)
  })
  return value.every(hasText)
}

function expectedLikelihoodTier(probability: number): LikelihoodTier {
  if (probability >= 60) return 'likely'
  if (probability >= 40) return 'toss_up'
  if (probability >= 20) return 'long_shot'
  return 'chaos'
}

function checkReference(
  owner: string,
  kind: string,
  id: string,
  targetKind: string,
  known: Set<string>,
  issues: string[],
): void {
  if (!known.has(id)) issues.push(`${kind} ${owner} references unknown ${targetKind} ${id}`)
}

function validateWagerDoctrine(
  raw: unknown,
  kind: 'prediction' | 'signature beat' | 'bingo square',
  claims: ReadonlyMap<string, ShowPackClaim>,
  issues: string[],
  variantFields: readonly string[],
  allowAuthoringBasis = false,
): raw is ShowPackWagerDoctrine {
  if (!isRecord(raw)) {
    issues.push(`${kind} must be an object`)
    return false
  }
  const id = hasText(raw.id) ? raw.id : '(missing-id)'
  checkExactKeys(raw, [
    'id', 'title', 'condition', 'exclusions', 'adjudication',
    'title_review', 'basis_claim_ids', ...variantFields,
  ], `${kind} ${id}`, issues)
  if (!isSlug(raw.id)) issues.push(`${kind} ${id} id must be a kebab-case slug`)
  if (!hasText(raw.title)) issues.push(`${kind} ${id} title is required`)
  if (!hasText(raw.condition)) issues.push(`${kind} ${id} condition is required`)
  checkTextArray(raw.exclusions, `${kind} ${id} exclusions`, issues, true)

  if (!isRecord(raw.adjudication)) {
    issues.push(`${kind} ${id} adjudication is required`)
  } else {
    checkExactKeys(
      raw.adjudication,
      ['proxies', 'offscreen', 'mentions'],
      `${kind} ${id} adjudication`,
      issues,
    )
    for (const dimension of ['proxies', 'offscreen', 'mentions'] as const) {
      const decision = raw.adjudication[dimension]
      if (!ADJUDICATION_DECISIONS.has(decision as AdjudicationDecision)) {
        issues.push(`${kind} ${id} ${dimension} has an invalid decision`)
      } else if (decision === 'unspecified') {
        issues.push(`${kind} ${id} ${dimension} must be explicit`)
      }
    }
  }

  if (!isRecord(raw.title_review)) {
    issues.push(`${kind} ${id} title review is required`)
  } else {
    checkExactKeys(
      raw.title_review,
      ['status', 'note'],
      `${kind} ${id} title_review`,
      issues,
    )
    if (raw.title_review.status !== 'approved') {
      issues.push(`${kind} ${id} title must be approved as honest`)
    }
    if (!hasText(raw.title_review.note)) issues.push(`${kind} ${id} title review note is required`)
  }

  if (!checkTextArray(raw.basis_claim_ids, `${kind} ${id} basis_claim_ids`, issues, true)) return false
  pushDuplicateValues(raw.basis_claim_ids, `${kind} ${id} has duplicate basis_claim_ids`, issues)
  for (const claimId of raw.basis_claim_ids) {
    const claim = claims.get(claimId)
    if (!claim) {
      issues.push(`${kind} ${id} references unknown claim ${claimId}`)
    } else if (claim.status !== 'verified'
      || (claim.canon !== 'screen'
        && claim.canon !== 'discourse'
        && !(allowAuthoringBasis && claim.canon === 'authoring'))) {
      const permittedBasis = allowAuthoringBasis
        ? 'verified screen, discourse, or authoring provenance'
        : 'verified screen or discourse'
      issues.push(`${kind} ${id} basis claim ${claimId} must be ${permittedBasis}`)
    }
  }
  return true
}

function validateTrigger(
  raw: unknown,
  kind: 'signature beat' | 'bingo square',
  claims: ReadonlyMap<string, ShowPackClaim>,
  issues: string[],
): raw is ShowPackTriggerBase {
  const variantFields = kind === 'signature beat'
    ? ['probability_pct', 'likelihood_tier', 'entity_ids', 'points', 'pitch']
    : ['probability_pct', 'likelihood_tier', 'why_it_is_fun', 'storyline_tags']
  if (!validateWagerDoctrine(
    raw,
    kind,
    claims,
    issues,
    variantFields,
    kind === 'bingo square',
  ) || !isRecord(raw)) return false
  const id = String(raw.id)
  if (!Number.isInteger(raw.probability_pct)
    || Number(raw.probability_pct) < 0
    || Number(raw.probability_pct) > 100) {
    issues.push(`${kind} ${id} probability_pct must be an integer from 0 to 100`)
  } else {
    const expected = expectedLikelihoodTier(Number(raw.probability_pct))
    if (raw.likelihood_tier !== expected) {
      issues.push(`${kind} ${id} likelihood_tier must be ${expected} at ${raw.probability_pct}%`)
    }
  }

  return true
}

/**
 * Returns every deterministic authoring-contract issue that can be checked
 * without network access or model judgment.
 */
export function validateShowPack(value: unknown): ShowPackIssue[] {
  const issues: string[] = []
  if (!isRecord(value)) return [{ message: 'show pack must be an object' }]
  checkExactKeys(value, [
    'schema_version', 'pack', 'sources', 'claims', 'entities',
    'predictions', 'signature_beats', 'bingo_squares',
    'commentary_voices', 'commentary_requests',
  ], 'show pack', issues)
  if (value.schema_version !== SHOW_PACK_SCHEMA_VERSION) {
    issues.push(`show pack schema_version must be ${SHOW_PACK_SCHEMA_VERSION}`)
  }

  if (!isRecord(value.pack)) {
    issues.push('show pack metadata is required')
  } else {
    checkExactKeys(value.pack, [
      'id', 'version', 'title', 'property', 'installment',
      'fact_source', 'canon_cutoff', 'predecessor',
    ], 'show pack metadata', issues)
    if (!isSlug(value.pack.id)) issues.push('show pack id must be a kebab-case slug')
    if (!isPositiveInteger(value.pack.version)) issues.push('show pack version must be a positive integer')
    for (const field of ['title', 'property', 'installment', 'canon_cutoff'] as const) {
      if (!hasText(value.pack[field])) issues.push(`show pack ${field} is required`)
    }
    if (!FACT_SOURCES.has(value.pack.fact_source as ShowFactSource)) {
      issues.push('show pack fact_source is invalid')
    }
    if (value.pack.predecessor !== undefined) {
      const predecessor = value.pack.predecessor
      if (isRecord(predecessor)) {
        checkExactKeys(
          predecessor,
          ['pack_id', 'settlement_id', 'settlement_version'],
          'show pack predecessor',
          issues,
        )
      }
      if (!isRecord(predecessor)
        || !isSlug(predecessor.pack_id)
        || !hasText(predecessor.settlement_id)
        || !isPositiveInteger(predecessor.settlement_version)) {
        issues.push('show pack predecessor needs pack_id, settlement_id, and settlement_version')
      }
    }
  }

  const collectionNames = [
    'sources', 'claims', 'entities', 'predictions',
    'signature_beats', 'bingo_squares', 'commentary_voices', 'commentary_requests',
  ] as const
  for (const name of collectionNames) {
    if (!Array.isArray(value[name])) issues.push(`show pack ${name} must be an array`)
  }
  if (collectionNames.some((name) => !Array.isArray(value[name]))) {
    return issues.map((message) => ({ message }))
  }

  const sources = value.sources as unknown[]
  const claims = value.claims as unknown[]
  const entities = value.entities as unknown[]
  const predictions = value.predictions as unknown[]
  const signatureBeats = value.signature_beats as unknown[]
  const bingoSquares = value.bingo_squares as unknown[]
  const commentaryVoices = value.commentary_voices as unknown[]
  const commentaryRequests = value.commentary_requests as unknown[]

  for (const [name, rows, minimum] of [
    ['sources', sources, 1],
    ['claims', claims, 1],
    ['entities', entities, 2],
    ['predictions', predictions, 1],
    ['signature_beats', signatureBeats, 1],
    ['bingo_squares', bingoSquares, 1],
  ] as const) {
    if (rows.length < minimum) {
      issues.push(minimum === 1
        ? `show pack ${name} must not be empty`
        : `show pack ${name} needs at least ${minimum} entries`)
    }
  }

  pushDuplicateIssues(sources, 'source', issues)
  pushDuplicateIssues(claims, 'claim', issues)
  pushDuplicateIssues(entities, 'entity', issues)
  pushDuplicateIssues(predictions, 'prediction', issues)
  pushDuplicateIssues(signatureBeats, 'signature beat', issues)
  pushDuplicateIssues(bingoSquares, 'bingo square', issues)
  pushDuplicateIssues(commentaryVoices, 'commentary voice', issues)
  pushDuplicateIssues(commentaryRequests, 'commentary', issues)

  const sourceKinds = new Map<string, ShowPackSourceKind>()
  for (const raw of sources) {
    if (!isRecord(raw)) {
      issues.push('source must be an object')
      continue
    }
    const id = hasText(raw.id) ? raw.id : '(missing-id)'
    checkExactKeys(raw, ['id', 'kind', 'title', 'locator'], `source ${id}`, issues)
    if (!isSlug(raw.id)) issues.push(`source ${id} id must be a kebab-case slug`)
    if (!SOURCE_KINDS.has(raw.kind as ShowPackSourceKind)) issues.push(`source ${id} kind is invalid`)
    if (!hasText(raw.title) || !hasText(raw.locator)) issues.push(`source ${id} needs title and locator`)
    if (isSlug(raw.id) && SOURCE_KINDS.has(raw.kind as ShowPackSourceKind)) {
      sourceKinds.set(raw.id, raw.kind as ShowPackSourceKind)
    }
  }

  const claimById = new Map<string, ShowPackClaim>()
  const knownSourceIds = new Set(sourceKinds.keys())
  for (const raw of claims) {
    if (!isRecord(raw)) {
      issues.push('claim must be an object')
      continue
    }
    const id = hasText(raw.id) ? raw.id : '(missing-id)'
    checkExactKeys(raw, ['id', 'canon', 'status', 'text', 'source_ids'], `claim ${id}`, issues)
    if (!isSlug(raw.id)) issues.push(`claim ${id} id must be a kebab-case slug`)
    if (!CLAIM_CANONS.has(raw.canon as ClaimCanon)) issues.push(`claim ${id} canon is invalid`)
    if (!CLAIM_STATUSES.has(raw.status as ClaimStatus)) issues.push(`claim ${id} status is invalid`)
    if (!hasText(raw.text)) issues.push(`claim ${id} text is required`)
    const sourceIds = raw.source_ids
    const validSourceIds = checkTextArray(sourceIds, `claim ${id} source_ids`, issues)
    const kinds = validSourceIds
      ? sourceIds.map((sourceId) => sourceKinds.get(sourceId)).filter(Boolean)
      : []
    if (validSourceIds) {
      pushDuplicateValues(sourceIds, `claim ${id} has duplicate source_ids`, issues)
      for (const sourceId of sourceIds) {
        checkReference(id, 'claim', sourceId, 'source', knownSourceIds, issues)
      }
    }
    if (raw.canon === 'screen') {
      if (!['verified', 'recap', 'unverifiable'].includes(String(raw.status))) {
        issues.push(`screen claim ${id} status must be verified, recap, or unverifiable`)
      }
      if (raw.status === 'verified'
        && !kinds.some((kind) => kind === 'screen' || kind === 'operator_record' || kind === 'trailer')) {
        issues.push(`screen claim ${id} has no screen warrant`)
      }
      if (raw.status === 'recap' && !kinds.includes('recap')) {
        issues.push(`recap claim ${id} has no recap source`)
      }
      if (validSourceIds) {
        for (const sourceId of sourceIds) {
          const kind = sourceKinds.get(sourceId)
          if (kind === 'source_material' || kind === 'sentiment' || kind === 'authoring_record') {
            issues.push(`screen claim ${id} cannot use ${kind} source ${sourceId}`)
          }
        }
      }
    } else if (raw.canon === 'discourse') {
      if (!['verified', 'unverifiable'].includes(String(raw.status))) {
        issues.push(`discourse claim ${id} status must be verified or unverifiable`)
      }
      if (raw.status === 'verified' && !kinds.includes('sentiment')) {
        issues.push(`discourse claim ${id} has no sentiment source`)
      }
      if (validSourceIds) {
        for (const sourceId of sourceIds) {
          const kind = sourceKinds.get(sourceId)
          if (kind === 'source_material' || kind === 'authoring_record') {
            issues.push(`discourse claim ${id} cannot use ${kind} source ${sourceId}`)
          }
        }
      }
    } else if (raw.canon === 'source_material') {
      if (raw.status !== 'attitude_only') {
        issues.push(`source-material claim ${id} must be attitude_only`)
      }
      if (!kinds.includes('source_material')) {
        issues.push(`source-material claim ${id} has no source-material source`)
      }
      if (validSourceIds) {
        for (const sourceId of sourceIds) {
          const kind = sourceKinds.get(sourceId)
          if (kind !== undefined && kind !== 'source_material') {
            issues.push(`source-material claim ${id} cannot use ${kind} source ${sourceId}`)
          }
        }
      }
    } else if (raw.canon === 'authoring') {
      if (raw.status !== 'verified') {
        issues.push(`authoring claim ${id} must be verified`)
      }
      if (!kinds.includes('authoring_record')) {
        issues.push(`authoring claim ${id} has no authoring-record source`)
      }
      if (validSourceIds) {
        for (const sourceId of sourceIds) {
          const kind = sourceKinds.get(sourceId)
          if (kind !== undefined && kind !== 'authoring_record') {
            issues.push(`authoring claim ${id} cannot use ${kind} source ${sourceId}`)
          }
        }
      }
    } else if (raw.status === 'attitude_only') {
      issues.push(`attitude-only claim ${id} must belong to source_material canon`)
    }
    if (isSlug(raw.id)
      && CLAIM_CANONS.has(raw.canon as ClaimCanon)
      && CLAIM_STATUSES.has(raw.status as ClaimStatus)) {
      claimById.set(raw.id, raw as unknown as ShowPackClaim)
    }
  }

  const knownClaims = new Set(claimById.keys())
  const voiceById = new Map<string, ShowPackCommentaryVoice>()
  for (const raw of commentaryVoices) {
    if (!isRecord(raw)) {
      issues.push('commentary voice must be an object')
      continue
    }
    const id = hasText(raw.id) ? raw.id : '(missing-id)'
    checkExactKeys(
      raw,
      ['id', 'name', 'instruction', 'attitude_claim_ids'],
      `commentary voice ${id}`,
      issues,
    )
    if (!isSlug(raw.id)) issues.push(`commentary voice ${id} id must be a kebab-case slug`)
    if (!hasText(raw.name) || !hasText(raw.instruction)) {
      issues.push(`commentary voice ${id} needs name and instruction`)
    }
    const attitudeClaimIds = raw.attitude_claim_ids
    const attitudeClaimsValid = checkTextArray(
      attitudeClaimIds,
      `commentary voice ${id} attitude_claim_ids`,
      issues,
    )
    if (attitudeClaimsValid) {
      pushDuplicateValues(
        attitudeClaimIds,
        `commentary voice ${id} has duplicate attitude_claim_ids`,
        issues,
      )
      for (const claimId of attitudeClaimIds) {
        checkReference(id, 'commentary voice', claimId, 'claim', knownClaims, issues)
        const claim = claimById.get(claimId)
        if (claim && (claim.canon !== 'source_material' || claim.status !== 'attitude_only')) {
          issues.push(`commentary voice ${id} attitude ${claimId} must be source-material attitude only`)
        }
      }
    }
    if (isSlug(raw.id) && hasText(raw.name) && hasText(raw.instruction) && attitudeClaimsValid) {
      voiceById.set(raw.id, {
        id: raw.id,
        name: raw.name,
        instruction: raw.instruction,
        attitude_claim_ids: [...attitudeClaimIds],
      })
    }
  }

  const entityIds = new Set<string>()
  for (const raw of entities) {
    if (!isRecord(raw)) {
      issues.push('entity must be an object')
      continue
    }
    const id = hasText(raw.id) ? raw.id : '(missing-id)'
    checkExactKeys(
      raw,
      ['id', 'name', 'kind', 'group', 'draftable', 'portrait', 'dossier'],
      `entity ${id}`,
      issues,
    )
    if (!isSlug(raw.id)) issues.push(`entity ${id} id must be a kebab-case slug`)
    if (!hasText(raw.name) || !hasText(raw.group)) issues.push(`entity ${id} needs name and group`)
    if (!ENTITY_KINDS.has(raw.kind as EntityKind)) issues.push(`entity ${id} kind is invalid`)
    if (typeof raw.draftable !== 'boolean') issues.push(`entity ${id} draftable must be boolean`)
    if (!isRecord(raw.portrait)) {
      issues.push(`entity ${id} portrait is required`)
    } else {
      checkExactKeys(raw.portrait, ['path', 'sha256'], `entity ${id} portrait`, issues)
      if (!isDeployOwnedRasterAsset(raw.portrait.path)) {
        issues.push(`entity ${id} portrait path must be a deploy-owned raster asset`)
      }
      if (!isSha256(raw.portrait.sha256)) {
        issues.push(`entity ${id} portrait sha256 must be a lowercase SHA-256 digest`)
      }
    }
    if (!isRecord(raw.dossier)) {
      issues.push(`entity ${id} dossier is required`)
    } else {
      checkExactKeys(
        raw.dossier,
        ['fact_claim_ids', 'discourse_claim_ids'],
        `entity ${id} dossier`,
        issues,
      )
      for (const [field, expectedCanon] of [
        ['fact_claim_ids', 'screen'],
        ['discourse_claim_ids', 'discourse'],
      ] as const) {
        if (!checkTextArray(raw.dossier[field], `entity ${id} ${field}`, issues)) continue
        pushDuplicateValues(raw.dossier[field], `entity ${id} has duplicate ${field}`, issues)
        for (const claimId of raw.dossier[field]) {
          checkReference(id, 'entity', claimId, 'claim', knownClaims, issues)
          const claim = claimById.get(claimId)
          if (claim && claim.canon !== expectedCanon) {
            issues.push(`entity ${id} ${field} includes ${claim.canon} claim ${claimId}`)
          }
        }
      }
    }
    if (isSlug(raw.id)) entityIds.add(raw.id)
  }

  for (const raw of predictions) {
    if (!validateWagerDoctrine(
      raw,
      'prediction',
      claimById,
      issues,
      ['points', 'tier', 'candidate_entity_ids'],
    ) || !isRecord(raw)) continue
    const id = String(raw.id)
    if (!isPositiveInteger(raw.points)) issues.push(`prediction ${id} points must be a positive integer`)
    if (!isPositiveInteger(raw.tier)) issues.push(`prediction ${id} tier must be a positive integer`)
    if (!checkTextArray(raw.candidate_entity_ids, `prediction ${id} candidate_entity_ids`, issues, true)) continue
    pushDuplicateValues(
      raw.candidate_entity_ids,
      `prediction ${id} has duplicate candidate_entity_ids`,
      issues,
    )
    if (raw.candidate_entity_ids.length < 2) issues.push(`prediction ${id} needs at least two candidates`)
    for (const entityId of raw.candidate_entity_ids) {
      checkReference(id, 'prediction', entityId, 'entity', entityIds, issues)
    }
  }

  for (const raw of signatureBeats) {
    if (!validateTrigger(raw, 'signature beat', claimById, issues) || !isRecord(raw)) continue
    const id = String(raw.id)
    if (!checkTextArray(raw.entity_ids, `signature beat ${id} entity_ids`, issues, true)) continue
    pushDuplicateValues(raw.entity_ids, `signature beat ${id} has duplicate entity_ids`, issues)
    for (const entityId of raw.entity_ids) {
      checkReference(id, 'signature beat', entityId, 'entity', entityIds, issues)
    }
    if (!isPositiveInteger(raw.points)) issues.push(`signature beat ${id} points must be a positive integer`)
    if (!hasText(raw.pitch)) issues.push(`signature beat ${id} pitch is required`)
  }

  for (const raw of bingoSquares) {
    if (!validateTrigger(raw, 'bingo square', claimById, issues) || !isRecord(raw)) continue
    const id = String(raw.id)
    if (!hasText(raw.why_it_is_fun)) issues.push(`bingo square ${id} why_it_is_fun is required`)
    checkTextArray(raw.storyline_tags, `bingo square ${id} storyline_tags`, issues, true)
  }

  for (const raw of commentaryRequests) {
    if (!isRecord(raw)) {
      issues.push('commentary request must be an object')
      continue
    }
    const id = hasText(raw.id) ? raw.id : '(missing-id)'
    checkExactKeys(
      raw,
      ['id', 'speaker', 'fact_claim_ids', 'angle_claim_ids', 'angle', 'publication'],
      `commentary ${id}`,
      issues,
    )
    if (!isSlug(raw.id)) issues.push(`commentary ${id} id must be a kebab-case slug`)
    if (!isSlug(raw.speaker)) {
      issues.push(`commentary ${id} speaker must reference a commentary voice id`)
    } else if (!voiceById.has(raw.speaker)) {
      issues.push(`commentary ${id} references unknown commentary voice ${raw.speaker}`)
    }
    if (!hasText(raw.angle)) issues.push(`commentary ${id} angle is required`)
    if (checkTextArray(raw.fact_claim_ids, `commentary ${id} fact_claim_ids`, issues, true)) {
      pushDuplicateValues(
        raw.fact_claim_ids,
        `commentary ${id} has duplicate fact_claim_ids`,
        issues,
      )
      for (const claimId of raw.fact_claim_ids) {
        checkReference(id, 'commentary', claimId, 'claim', knownClaims, issues)
        const claim = claimById.get(claimId)
        if (claim && (claim.canon !== 'screen' || claim.status !== 'verified')) {
          issues.push(`commentary ${id} fact ${claimId} is not a verified screen claim`)
        }
      }
    }
    if (checkTextArray(raw.angle_claim_ids, `commentary ${id} angle_claim_ids`, issues)) {
      pushDuplicateValues(
        raw.angle_claim_ids,
        `commentary ${id} has duplicate angle_claim_ids`,
        issues,
      )
      for (const claimId of raw.angle_claim_ids) {
        checkReference(id, 'commentary', claimId, 'claim', knownClaims, issues)
        const claim = claimById.get(claimId)
        const safeAngle = claim != null
          && claim.canon === 'discourse'
          && claim.status === 'verified'
        if (claim && !safeAngle) {
          issues.push(`commentary ${id} angle ${claimId} must be verified discourse`)
        }
      }
    }
    if (!isRecord(raw.publication)) {
      issues.push(`commentary ${id} publication is required`)
      continue
    }
    checkExactKeys(
      raw.publication,
      ['status', 'text', 'grounding'],
      `commentary ${id} publication`,
      issues,
    )
    const status = raw.publication.status
    if (!['pending', 'ready', 'blocked'].includes(String(status))) {
      issues.push(`commentary ${id} publication status is invalid`)
    }
    const grounding = raw.publication.grounding
    if (status === 'pending') {
      if (grounding !== undefined || raw.publication.text !== undefined) {
        issues.push(`commentary ${id} pending publication cannot carry generated output`)
      }
      continue
    }
    if (!isRecord(grounding)) {
      issues.push(`commentary ${id} ${status} publication needs a grounded-line record`)
      continue
    }
    checkExactKeys(
      grounding,
      [
        'pipeline', 'speaker', 'voice_block', 'fact_block', 'angle_block',
        'attempts', 'residual_findings', 'prompt_contract_sha256',
      ],
      `commentary ${id} grounding`,
      issues,
    )
    if (grounding.pipeline !== 'scripts/grounded-line.mts') {
      issues.push(`commentary ${id} grounding pipeline must be scripts/grounded-line.mts`)
    }
    const promptContractSha256 = grounding.prompt_contract_sha256
    if (promptContractSha256 !== undefined
      && (typeof promptContractSha256 !== 'string' || !SHA256.test(promptContractSha256))) {
      issues.push(`commentary ${id} grounding prompt_contract_sha256 must be a SHA-256 digest`)
    }
    if (grounding.speaker !== raw.speaker) {
      issues.push(`commentary ${id} grounding speaker does not match its requested voice`)
    }
    const voice = typeof raw.speaker === 'string' ? voiceById.get(raw.speaker) : undefined
    const expectedVoiceBlock = voice
      && voice.attitude_claim_ids.every((claimId) => claimById.has(claimId))
      ? commentaryVoiceBlock(voice, claimById)
      : []
    const voiceBlock = grounding.voice_block
    const voiceBlockValid = checkTextArray(
      voiceBlock,
      `commentary ${id} grounding voice_block`,
      issues,
      true,
    )
    if (voiceBlockValid
      && (voiceBlock.length !== expectedVoiceBlock.length
        || voiceBlock.some((line, index) => line !== expectedVoiceBlock[index]))) {
      issues.push(`commentary ${id} grounding voice_block does not match its commentary voice`)
    }
    const factBlock = grounding.fact_block
    const factBlockValid = checkTextArray(
      factBlock,
      `commentary ${id} grounding fact_block`,
      issues,
      true,
    )
    const expectedFactBlock = Array.isArray(raw.fact_claim_ids)
      ? raw.fact_claim_ids
        .map((claimId) => claimById.get(String(claimId))?.text)
        .filter((text): text is string => text !== undefined)
      : []
    if (factBlockValid
      && (factBlock.length !== expectedFactBlock.length
        || factBlock.some((fact, index) => fact !== expectedFactBlock[index]))) {
      issues.push(`commentary ${id} grounding fact_block does not match its verified claims`)
    }
    const expectedAngleBlock = hasText(raw.angle)
      && Array.isArray(raw.angle_claim_ids)
      && raw.angle_claim_ids.every((claimId) => typeof claimId === 'string' && claimById.has(claimId))
      ? commentaryAngleBlock(raw as unknown as ShowPackCommentaryRequest, claimById)
      : []
    const angleBlock = grounding.angle_block
    const angleBlockValid = checkTextArray(
      angleBlock,
      `commentary ${id} grounding angle_block`,
      issues,
      true,
    )
    if (angleBlockValid
      && (angleBlock.length !== expectedAngleBlock.length
        || angleBlock.some((line, index) => line !== expectedAngleBlock[index]))) {
      issues.push(`commentary ${id} grounding angle_block does not match its request`)
    }
    if (typeof promptContractSha256 === 'string'
      && voiceBlockValid
      && factBlockValid
      && angleBlockValid
      && typeof grounding.speaker === 'string'
      && promptContractSha256 !== groundedLinePromptContractSha256({
        speaker: grounding.speaker,
        voice: voiceBlock.join('\n'),
        facts: factBlock,
        angle: angleBlock.join('\n'),
      })) {
      issues.push(`commentary ${id} grounding prompt_contract_sha256 does not match its grounded-line contract`)
    }
    if (!isPositiveInteger(grounding.attempts)) {
      issues.push(`commentary ${id} grounding attempts must be a positive integer`)
    }
    const residualFindings = grounding.residual_findings
    const residualsValid = checkTextArray(
      residualFindings,
      `commentary ${id} grounding residual_findings`,
      issues,
    )
    if (!hasText(raw.publication.text)) {
      issues.push(`commentary ${id} ${status} publication needs generated text`)
    }
    if (status === 'ready' && residualsValid && residualFindings.length > 0) {
      issues.push(`commentary ${id} cannot be ready with residual grounding findings`)
    }
    if (status === 'blocked' && residualsValid && residualFindings.length === 0) {
      issues.push(`commentary ${id} blocked publication needs residual grounding findings`)
    }
  }

  return issues.map((message) => ({ message }))
}

function assertValidShowPack(value: unknown): asserts value is ShowPack {
  const issues = validateShowPack(value)
  if (issues.length > 0) throw new Error(issues.map((issue) => issue.message).join('\n'))
}

export function parseShowPack(raw: string): ShowPack {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`show pack is not valid JSON: ${message}`)
  }
  assertValidShowPack(value)
  return value
}

function byId<T extends { id: string }>(left: T, right: T): number {
  if (left.id < right.id) return -1
  if (left.id > right.id) return 1
  return 0
}

function copyAdjudication(value: TriggerAdjudication): TriggerAdjudication {
  return {
    proxies: value.proxies,
    offscreen: value.offscreen,
    mentions: value.mentions,
  }
}

function copyTitleReview(value: TriggerTitleReview): TriggerTitleReview {
  return { status: value.status, note: value.note }
}

/**
 * Produces the stable, publishable bundle. Pending or refutation-blocked prose
 * is never allowed to cross this boundary.
 */
export function compileShowPack(pack: ShowPack): ShowPack {
  assertValidShowPack(pack)
  for (const commentary of pack.commentary_requests) {
    if (commentary.publication.status === 'blocked') {
      throw new Error(`commentary ${commentary.id} is blocked by residual grounding findings`)
    }
    if (commentary.publication.status !== 'ready') {
      throw new Error(`commentary ${commentary.id} is not ready for publication`)
    }
  }

  const metadata: ShowPack['pack'] = {
    id: pack.pack.id,
    version: pack.pack.version,
    title: pack.pack.title,
    property: pack.pack.property,
    installment: pack.pack.installment,
    fact_source: pack.pack.fact_source,
    canon_cutoff: pack.pack.canon_cutoff,
  }
  if (pack.pack.predecessor) {
    metadata.predecessor = {
      pack_id: pack.pack.predecessor.pack_id,
      settlement_id: pack.pack.predecessor.settlement_id,
      settlement_version: pack.pack.predecessor.settlement_version,
    }
  }

  return {
    schema_version: pack.schema_version,
    pack: metadata,
    sources: pack.sources.map((source) => ({
      id: source.id,
      kind: source.kind,
      title: source.title,
      locator: source.locator,
    })).sort(byId),
    claims: pack.claims
      .map((claim) => ({
        id: claim.id,
        canon: claim.canon,
        status: claim.status,
        text: claim.text,
        source_ids: [...claim.source_ids],
      }))
      .sort(byId),
    entities: pack.entities
      .map((entity) => ({
        id: entity.id,
        name: entity.name,
        kind: entity.kind,
        group: entity.group,
        draftable: entity.draftable,
        portrait: {
          path: entity.portrait.path,
          sha256: entity.portrait.sha256,
        },
        dossier: {
          fact_claim_ids: [...entity.dossier.fact_claim_ids],
          discourse_claim_ids: [...entity.dossier.discourse_claim_ids],
        },
      }))
      .sort(byId),
    predictions: pack.predictions
      .map((prediction) => ({
        id: prediction.id,
        title: prediction.title,
        condition: prediction.condition,
        exclusions: [...prediction.exclusions],
        adjudication: copyAdjudication(prediction.adjudication),
        title_review: copyTitleReview(prediction.title_review),
        basis_claim_ids: [...prediction.basis_claim_ids],
        points: prediction.points,
        tier: prediction.tier,
        candidate_entity_ids: [...prediction.candidate_entity_ids],
      }))
      .sort(byId),
    signature_beats: pack.signature_beats
      .map((beat) => ({
        id: beat.id,
        title: beat.title,
        condition: beat.condition,
        exclusions: [...beat.exclusions],
        adjudication: copyAdjudication(beat.adjudication),
        title_review: copyTitleReview(beat.title_review),
        basis_claim_ids: [...beat.basis_claim_ids],
        probability_pct: beat.probability_pct,
        likelihood_tier: beat.likelihood_tier,
        entity_ids: [...beat.entity_ids],
        points: beat.points,
        pitch: beat.pitch,
      }))
      .sort(byId),
    bingo_squares: pack.bingo_squares
      .map((square) => ({
        id: square.id,
        title: square.title,
        condition: square.condition,
        exclusions: [...square.exclusions],
        adjudication: copyAdjudication(square.adjudication),
        title_review: copyTitleReview(square.title_review),
        basis_claim_ids: [...square.basis_claim_ids],
        probability_pct: square.probability_pct,
        likelihood_tier: square.likelihood_tier,
        why_it_is_fun: square.why_it_is_fun,
        storyline_tags: [...square.storyline_tags],
      }))
      .sort(byId),
    commentary_voices: pack.commentary_voices
      .map((voice) => ({
        id: voice.id,
        name: voice.name,
        instruction: voice.instruction,
        attitude_claim_ids: [...voice.attitude_claim_ids],
      }))
      .sort(byId),
    commentary_requests: pack.commentary_requests
      .map((request) => ({
        id: request.id,
        speaker: request.speaker,
        fact_claim_ids: [...request.fact_claim_ids],
        angle_claim_ids: [...request.angle_claim_ids],
        angle: request.angle,
        publication: {
          status: request.publication.status,
          text: request.publication.text,
          grounding: request.publication.grounding
            ? {
              pipeline: request.publication.grounding.pipeline,
              ...(request.publication.grounding.prompt_contract_sha256
                ? { prompt_contract_sha256: request.publication.grounding.prompt_contract_sha256 }
                : {}),
                speaker: request.publication.grounding.speaker,
                voice_block: [...request.publication.grounding.voice_block],
                fact_block: [...request.publication.grounding.fact_block],
                angle_block: [...request.publication.grounding.angle_block],
                attempts: request.publication.grounding.attempts,
                residual_findings: [...request.publication.grounding.residual_findings],
              }
            : undefined,
        },
      }))
      .sort(byId),
  }
}
