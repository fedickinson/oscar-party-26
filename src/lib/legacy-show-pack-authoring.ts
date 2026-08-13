import type {
  EntityKind,
  LikelihoodTier,
  ShowPack,
  ShowPackBingoSquare,
  ShowPackClaim,
  ShowPackCommentaryRequest,
  ShowPackCommentaryVoice,
  ShowPackEntity,
  ShowPackPrediction,
  ShowPackSignatureBeat,
  ShowPackSource,
  TriggerContract,
} from './show-pack'
import {
  invalidateStaleLegacyGlobalReviewSeals,
  LEGACY_GLOBAL_REVIEW_COLLECTIONS,
  legacyGlobalReviewSealIssue,
  type LegacyGlobalReviewSeal,
} from './legacy-global-review'
import { LEGACY_SHOW_PACK_SCHEMA_VERSION, validateShowPack } from './show-pack'
import type { LegacyShowPackMigrationWorksheet } from './legacy-show-pack-audit'

const SHA256 = /^[a-f0-9]{64}$/

interface LegacyAuthoringPackDraft {
  id: string | null
  version: number | null
  title: string | null
  property: string
  installment: string
  fact_source: string
  canon_cutoff: string | null
}

export function applyLegacyCommentaryPublications(
  authoring: LegacyShowPackAuthoringWorksheet,
  publishedPack: ShowPack,
): LegacyShowPackAuthoringWorksheet {
  if (publishedPack.pack.id !== authoring.pack_draft.id
    || publishedPack.pack.version !== authoring.pack_draft.version) {
    throw new Error('published commentary pack does not match the legacy authoring target')
  }
  for (const [label, actual, expected] of [
    ['sources', publishedPack.sources, authoring.sources],
    ['claims', publishedPack.claims, authoring.claims],
    ['commentary voices', publishedPack.commentary_voices, authoring.commentary_voices],
  ] as const) {
    if (canonicalJson(actual) !== canonicalJson(expected)) {
      throw new Error(`published commentary pack changed its authored ${label}`)
    }
  }
  assertExactCoverage(
    publishedPack.commentary_requests.map((request) => request.id),
    authoring.commentary_requests.map((request) => request.id),
    'commentary publication',
  )
  const publishedById = new Map(publishedPack.commentary_requests.map((request) => [request.id, request]))
  for (const request of authoring.commentary_requests) {
    const published = publishedById.get(request.id)!
    const expectedContext = {
      id: request.id,
      speaker: request.speaker,
      fact_claim_ids: request.fact_claim_ids,
      angle_claim_ids: request.angle_claim_ids,
      angle: request.angle,
    }
    const actualContext = {
      id: published.id,
      speaker: published.speaker,
      fact_claim_ids: published.fact_claim_ids,
      angle_claim_ids: published.angle_claim_ids,
      angle: published.angle,
    }
    if (canonicalJson(actualContext) !== canonicalJson(expectedContext)) {
      throw new Error(`commentary publication ${request.id} changed its authored request context`)
    }
  }
  const packIssues = validateShowPack(publishedPack)
  if (packIssues.length > 0) {
    throw new Error(`published commentary pack is invalid: ${packIssues[0].message}`)
  }
  const worksheet = structuredClone(authoring)
  worksheet.commentary_requests = worksheet.commentary_requests.map((request) => {
    const published = publishedById.get(request.id)!
    return {
      ...request,
      publication: structuredClone(published.publication),
    }
  })
  invalidateStaleLegacyGlobalReviewSeals(worksheet)
  return worksheet
}

interface LegacyAuthoringEntity {
  legacy_entity_id: string
  legacy_record: {
    name: string
    legacy_type: string
    group: string
    portrait: { path: string; sha256: string }
  }
  id: string
  kind: EntityKind | null
  group: string
  dossier: ShowPackEntity['dossier'] | null
}

interface LegacyAuthoringPrediction {
  legacy_prediction_id: number
  legacy_record: {
    title: string
    points: number
    tier: number
    candidate_legacy_nominee_ids: string[]
  }
  id: string
  contract: TriggerContract | null
  candidate_legacy_nominee_ids: string[] | null
}

interface LegacyAuthoringSignatureBeat {
  legacy_signature_beat_id: number
  legacy_record: {
    title: string
    trigger_text: string
    odds: string
    points: number
    pitch: string
    legacy_entity_ids: string[]
  }
  id: string
  probability_pct: number | null
  likelihood_tier: LikelihoodTier | null
  contract: TriggerContract | null
}

interface LegacyAuthoringBingoSquare {
  legacy_bingo_square_id: number
  legacy_record: {
    title: string
    condition: string
    probability_pct: number
    likelihood_tier: string
    why_it_is_fun: string
    storyline_tags: string[]
  }
  id: string
  contract: TriggerContract | null
}

export interface LegacyShowPackAuthoringWorksheet {
  worksheet_version: 2
  artifact: 'legacy-show-pack-authoring'
  source: {
    pack_id: string
    pack_key: string
    worksheet_sha256: string
  }
  pack_draft: LegacyAuthoringPackDraft
  global_review: {
    sources: LegacyGlobalReviewSeal | null
    claims: LegacyGlobalReviewSeal | null
    commentary_voices: LegacyGlobalReviewSeal | null
    commentary_requests: LegacyGlobalReviewSeal | null
  }
  sources: ShowPackSource[]
  claims: ShowPackClaim[]
  entities: LegacyAuthoringEntity[]
  predictions: LegacyAuthoringPrediction[]
  signature_beats: LegacyAuthoringSignatureBeat[]
  bingo_squares: LegacyAuthoringBingoSquare[]
  commentary_voices: ShowPackCommentaryVoice[]
  commentary_requests: ShowPackCommentaryRequest[]
}

export interface LegacyShowPackAuthoringStatusLane {
  filled: number
  total: number
  open_ids: string[]
}

export interface LegacyShowPackAuthoringStatus {
  ready: boolean
  lanes: {
    target_identity: LegacyShowPackAuthoringStatusLane
    canon_cutoff: LegacyShowPackAuthoringStatusLane
    global_review: LegacyShowPackAuthoringStatusLane
    entity_kind: LegacyShowPackAuthoringStatusLane
    entity_dossier: LegacyShowPackAuthoringStatusLane
    prediction_candidates: LegacyShowPackAuthoringStatusLane
    prediction_contract: LegacyShowPackAuthoringStatusLane
    signature_beat_probability: LegacyShowPackAuthoringStatusLane
    signature_beat_likelihood: LegacyShowPackAuthoringStatusLane
    signature_beat_contract: LegacyShowPackAuthoringStatusLane
    bingo_contract: LegacyShowPackAuthoringStatusLane
  }
  issues: string[]
}

export interface LegacyShowPackPreparationOptions {
  target?: {
    id: string
    version: number
    title: string
    canon_cutoff: string
  }
  legacyFilmKind?: 'film' | 'creature'
  candidatePolicy?: 'audited-category-links'
}

function assertHealthyLegacyWorksheet(worksheet: LegacyShowPackMigrationWorksheet): void {
  if (worksheet.worksheet_version !== 1) throw new Error('legacy migration worksheet version is invalid')
  if (worksheet.issues.length > 0) {
    throw new Error(`legacy migration worksheet has integrity issues: ${worksheet.issues[0]}`)
  }
  if (!worksheet.identity.ready) throw new Error('legacy migration worksheet identity is not ready')
}

function assertSha256(value: string, label: string): void {
  if (!SHA256.test(value)) throw new Error(`${label} must be a lowercase SHA-256 digest`)
}

function exactKeys(value: Record<string, unknown>, expected: string[], label: string): void {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} fields are invalid`)
  }
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

function assertLegacyRecord(actual: unknown, expected: unknown, label: string): void {
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(`${label} must preserve the audited legacy record`)
  }
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function asRecordArray(value: unknown, label: string): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`)
  return value.map((row, index) => asRecord(row, `${label}[${index}]`))
}

function asTriggerContract(value: unknown, label: string): TriggerContract {
  const contract = asRecord(value, label)
  exactKeys(contract, [
    'condition', 'exclusions', 'adjudication', 'title_review', 'basis_claim_ids',
  ], label)
  return contract as unknown as TriggerContract
}

function assertExactCoverage(
  actual: Array<string | number>,
  expected: Array<string | number>,
  label: string,
): void {
  const normalizedActual = actual.map(String).sort()
  const normalizedExpected = expected.map(String).sort()
  if (normalizedActual.length !== normalizedExpected.length
    || normalizedActual.some((id, index) => id !== normalizedExpected[index])) {
    throw new Error(`${label} decisions must cover the audited legacy ids exactly`)
  }
}

function authoredEntityKind(
  legacyType: string,
  legacyFilmKind: LegacyShowPackPreparationOptions['legacyFilmKind'],
): EntityKind | null {
  if (legacyType === 'person') return 'person'
  return legacyType === 'film' ? (legacyFilmKind ?? null) : null
}

export function buildLegacyShowPackAuthoringWorksheet(
  worksheet: LegacyShowPackMigrationWorksheet,
  worksheetSha256: string,
  options: LegacyShowPackPreparationOptions = {},
): LegacyShowPackAuthoringWorksheet {
  assertHealthyLegacyWorksheet(worksheet)
  assertSha256(worksheetSha256, 'legacy migration worksheet SHA-256')
  if (options.target) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(options.target.id)
      || !Number.isInteger(options.target.version) || options.target.version < 1
      || options.target.title.trim() === ''
      || options.target.canon_cutoff.trim() === '') {
      throw new Error('legacy authoring target requires a slug id, positive version, title, and canon cutoff')
    }
    if (options.target.id === worksheet.source_pack.pack_key
      && options.target.version === worksheet.source_pack.version) {
      throw new Error('legacy authoring target must not reuse the published source key and version')
    }
  }

  return {
    worksheet_version: 2,
    artifact: 'legacy-show-pack-authoring',
    source: {
      pack_id: worksheet.source_pack.id,
      pack_key: worksheet.source_pack.pack_key,
      worksheet_sha256: worksheetSha256,
    },
    pack_draft: {
      id: options.target?.id ?? null,
      version: options.target?.version ?? null,
      title: options.target?.title ?? null,
      property: worksheet.source_pack.property,
      installment: worksheet.source_pack.installment,
      fact_source: worksheet.source_pack.fact_source,
      canon_cutoff: options.target?.canon_cutoff ?? null,
    },
    global_review: {
      sources: null,
      claims: null,
      commentary_voices: null,
      commentary_requests: null,
    },
    sources: [],
    claims: [],
    entities: worksheet.identity.entities.map((entity) => ({
      legacy_entity_id: entity.legacy_entity_id,
      legacy_record: {
        name: entity.name,
        legacy_type: entity.legacy_type,
        group: entity.group,
        portrait: { ...entity.portrait! },
      },
      id: entity.suggested_id!,
      kind: authoredEntityKind(entity.legacy_type, options.legacyFilmKind),
      group: entity.group,
      dossier: null,
    })),
    predictions: worksheet.catalog.predictions.map((prediction) => ({
      legacy_prediction_id: prediction.id,
      legacy_record: {
        title: prediction.name,
        points: prediction.points,
        tier: prediction.tier,
        candidate_legacy_nominee_ids: [...prediction.candidate_legacy_nominee_ids],
      },
      id: `prediction-${prediction.id}`,
      contract: null,
      candidate_legacy_nominee_ids: options.candidatePolicy === 'audited-category-links'
        ? [...prediction.candidate_legacy_nominee_ids]
        : null,
    })),
    signature_beats: worksheet.catalog.signature_beats.map((beat) => ({
      legacy_signature_beat_id: beat.id,
      legacy_record: {
        title: beat.name,
        trigger_text: beat.trigger_text,
        odds: beat.odds,
        points: beat.points,
        pitch: beat.pitch,
        legacy_entity_ids: [beat.entity_id, ...(beat.partner_entity_id ? [beat.partner_entity_id] : [])],
      },
      id: `signature-beat-${beat.id}`,
      probability_pct: null,
      likelihood_tier: null,
      contract: null,
    })),
    bingo_squares: worksheet.catalog.bingo_squares.map((square) => ({
      legacy_bingo_square_id: square.id,
      legacy_record: {
        title: square.title,
        condition: square.win_condition,
        probability_pct: square.probability_pct,
        likelihood_tier: square.likelihood_tier,
        why_it_is_fun: square.why_it_is_fun!,
        storyline_tags: [...square.storyline_tags!],
      },
      id: `bingo-${square.id}`,
      contract: null,
    })),
    commentary_voices: [],
    commentary_requests: [],
  }
}

function parseAuthoringWorksheet(value: unknown): {
  raw: Record<string, unknown>
  source: Record<string, unknown>
  packDraft: Record<string, unknown>
  globalReview: Record<string, unknown>
  entities: Record<string, unknown>[]
  predictions: Record<string, unknown>[]
  signatureBeats: Record<string, unknown>[]
  bingoSquares: Record<string, unknown>[]
} {
  const raw = asRecord(value, 'legacy show-pack authoring worksheet')
  exactKeys(raw, [
    'worksheet_version', 'artifact', 'source', 'pack_draft', 'global_review',
    'sources', 'claims', 'entities', 'predictions', 'signature_beats',
    'bingo_squares', 'commentary_voices', 'commentary_requests',
  ], 'legacy show-pack authoring worksheet')
  if (raw.worksheet_version !== 2 || raw.artifact !== 'legacy-show-pack-authoring') {
    throw new Error('legacy show-pack authoring worksheet identity is invalid')
  }
  const source = asRecord(raw.source, 'authoring source')
  exactKeys(source, ['pack_id', 'pack_key', 'worksheet_sha256'], 'authoring source')
  const packDraft = asRecord(raw.pack_draft, 'pack_draft')
  exactKeys(packDraft, [
    'id', 'version', 'title', 'property', 'installment', 'fact_source', 'canon_cutoff',
  ], 'pack_draft')
  const globalReview = asRecord(raw.global_review, 'global_review')
  exactKeys(globalReview, [
    'sources', 'claims', 'commentary_voices', 'commentary_requests',
  ], 'global_review')
  if (!Array.isArray(raw.sources) || !Array.isArray(raw.claims)
    || !Array.isArray(raw.commentary_voices) || !Array.isArray(raw.commentary_requests)) {
    throw new Error('global authoring collections must be arrays')
  }
  return {
    raw,
    source,
    packDraft,
    globalReview,
    entities: asRecordArray(raw.entities, 'entities'),
    predictions: asRecordArray(raw.predictions, 'predictions'),
    signatureBeats: asRecordArray(raw.signature_beats, 'signature_beats'),
    bingoSquares: asRecordArray(raw.bingo_squares, 'bingo_squares'),
  }
}

function statusLane(total: number, openIds: string[]): LegacyShowPackAuthoringStatusLane {
  return { filled: total - openIds.length, total, open_ids: openIds }
}

function allOpenStatus(
  legacy: LegacyShowPackMigrationWorksheet,
  issues: string[],
): LegacyShowPackAuthoringStatus {
  const entityIds = legacy.identity.entities.map((row) => row.legacy_entity_id)
  const predictionIds = legacy.catalog.predictions.map((row) => String(row.id))
  const beatIds = legacy.catalog.signature_beats.map((row) => String(row.id))
  const bingoIds = legacy.catalog.bingo_squares.map((row) => String(row.id))
  return {
    ready: false,
    lanes: {
      target_identity: statusLane(1, ['pack_draft']),
      canon_cutoff: statusLane(1, ['pack_draft']),
      global_review: statusLane(4, [
        'sources', 'claims', 'commentary_voices', 'commentary_requests',
      ]),
      entity_kind: statusLane(entityIds.length, entityIds),
      entity_dossier: statusLane(entityIds.length, entityIds),
      prediction_candidates: statusLane(predictionIds.length, predictionIds),
      prediction_contract: statusLane(predictionIds.length, predictionIds),
      signature_beat_probability: statusLane(beatIds.length, beatIds),
      signature_beat_likelihood: statusLane(beatIds.length, beatIds),
      signature_beat_contract: statusLane(beatIds.length, beatIds),
      bingo_contract: statusLane(bingoIds.length, bingoIds),
    },
    issues,
  }
}

function recordOrNull(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

/**
 * Reports aggregate progress without weakening the finalizer. Readiness is true
 * only when every decision lane is complete and the same input finalizes.
 */
export function assessLegacyShowPackAuthoringWorksheet(
  legacy: LegacyShowPackMigrationWorksheet,
  legacyWorksheetSha256: string,
  value: unknown,
): LegacyShowPackAuthoringStatus {
  const issues: string[] = []
  const addIssue = (message: string): void => {
    if (!issues.includes(message)) issues.push(message)
  }
  try {
    assertHealthyLegacyWorksheet(legacy)
    assertSha256(legacyWorksheetSha256, 'legacy migration worksheet SHA-256')
  } catch (error) {
    addIssue(error instanceof Error ? error.message : String(error))
    return allOpenStatus(legacy, issues)
  }

  let parsed: ReturnType<typeof parseAuthoringWorksheet>
  try {
    parsed = parseAuthoringWorksheet(value)
  } catch (error) {
    addIssue(error instanceof Error ? error.message : String(error))
    return allOpenStatus(legacy, issues)
  }
  const { source, packDraft, globalReview } = parsed

  if (source.pack_id !== legacy.source_pack.id || source.pack_key !== legacy.source_pack.pack_key) {
    addIssue('authoring source does not match the legacy migration worksheet')
  }
  if (source.worksheet_sha256 !== legacyWorksheetSha256) {
    addIssue('authoring source worksheet SHA-256 does not match')
  }
  for (const field of ['property', 'installment', 'fact_source'] as const) {
    if (packDraft[field] !== legacy.source_pack[field]) {
      addIssue(`pack_draft ${field} must preserve the audited legacy value`)
    }
  }

  const targetIdentityComplete = typeof packDraft.id === 'string'
    && packDraft.id.trim() !== ''
    && Number.isInteger(packDraft.version)
    && Number(packDraft.version) > 0
    && !(packDraft.id === legacy.source_pack.pack_key
      && packDraft.version === legacy.source_pack.version)
    && typeof packDraft.title === 'string'
    && packDraft.title.trim() !== ''
  const canonCutoffComplete = typeof packDraft.canon_cutoff === 'string'
    && packDraft.canon_cutoff.trim() !== ''
  const authoring = value as LegacyShowPackAuthoringWorksheet
  const openGlobalFields: string[] = []
  for (const field of LEGACY_GLOBAL_REVIEW_COLLECTIONS) {
    const sealIssue = legacyGlobalReviewSealIssue(authoring, field)
    if (sealIssue !== null) {
      openGlobalFields.push(field)
      if (authoring.global_review[field] !== null) addIssue(sealIssue)
    }
  }

  const checkCoverage = (
    actual: Array<string | number>,
    expected: Array<string | number>,
    label: string,
  ): void => {
    try {
      assertExactCoverage(actual, expected, label)
    } catch (error) {
      addIssue(error instanceof Error ? error.message : String(error))
    }
  }
  checkCoverage(
    parsed.entities.map((row) => row.legacy_entity_id as string),
    legacy.identity.entities.map((row) => row.legacy_entity_id),
    'entity',
  )
  checkCoverage(
    parsed.predictions.map((row) => row.legacy_prediction_id as number),
    legacy.catalog.predictions.map((row) => row.id),
    'prediction',
  )
  checkCoverage(
    parsed.signatureBeats.map((row) => row.legacy_signature_beat_id as number),
    legacy.catalog.signature_beats.map((row) => row.id),
    'signature beat',
  )
  checkCoverage(
    parsed.bingoSquares.map((row) => row.legacy_bingo_square_id as number),
    legacy.catalog.bingo_squares.map((row) => row.id),
    'bingo square',
  )

  const validateDecisionKeys = (
    rows: Record<string, unknown>[],
    expected: string[],
    label: string,
  ): void => {
    for (const row of rows) {
      try {
        exactKeys(row, expected, label)
      } catch (error) {
        addIssue(error instanceof Error ? error.message : String(error))
      }
    }
  }
  validateDecisionKeys(
    parsed.entities,
    ['legacy_entity_id', 'legacy_record', 'id', 'kind', 'group', 'dossier'],
    'entity decision',
  )
  validateDecisionKeys(
    parsed.predictions,
    ['legacy_prediction_id', 'legacy_record', 'id', 'contract', 'candidate_legacy_nominee_ids'],
    'prediction decision',
  )
  validateDecisionKeys(
    parsed.signatureBeats,
    ['legacy_signature_beat_id', 'legacy_record', 'id', 'probability_pct', 'likelihood_tier', 'contract'],
    'signature beat decision',
  )
  validateDecisionKeys(
    parsed.bingoSquares,
    ['legacy_bingo_square_id', 'legacy_record', 'id', 'contract'],
    'bingo square decision',
  )

  const entitiesByLegacyId = new Map(parsed.entities.map((row) => (
    [String(row.legacy_entity_id), row]
  )))
  const openEntityKinds: string[] = []
  const openEntityDossiers: string[] = []
  for (const identity of legacy.identity.entities) {
    const decision = entitiesByLegacyId.get(identity.legacy_entity_id)
    if (!decision || typeof decision.kind !== 'string' || decision.kind.trim() === '') {
      openEntityKinds.push(identity.legacy_entity_id)
    }
    if (!decision || !recordOrNull(decision.dossier)) {
      openEntityDossiers.push(identity.legacy_entity_id)
    }
    if (decision) {
      try {
        assertLegacyRecord(decision.legacy_record, {
          name: identity.name,
          legacy_type: identity.legacy_type,
          group: identity.group,
          portrait: identity.portrait,
        }, `entity ${identity.legacy_entity_id} legacy_record`)
      } catch (error) {
        addIssue(error instanceof Error ? error.message : String(error))
      }
    }
  }

  const predictionsByLegacyId = new Map(parsed.predictions.map((row) => (
    [Number(row.legacy_prediction_id), row]
  )))
  const openPredictionCandidates: string[] = []
  const openPredictionContracts: string[] = []
  for (const prediction of legacy.catalog.predictions) {
    const id = String(prediction.id)
    const decision = predictionsByLegacyId.get(prediction.id)
    if (!decision || !Array.isArray(decision.candidate_legacy_nominee_ids)) {
      openPredictionCandidates.push(id)
    }
    try {
      if (!decision) throw new Error(`prediction ${prediction.id} contract must be an object`)
      asTriggerContract(decision.contract, `prediction ${prediction.id} contract`)
    } catch (error) {
      openPredictionContracts.push(id)
      if (decision?.contract !== null && decision?.contract !== undefined) {
        addIssue(error instanceof Error ? error.message : String(error))
      }
    }
    if (decision) {
      try {
        assertLegacyRecord(decision.legacy_record, {
          title: prediction.name,
          points: prediction.points,
          tier: prediction.tier,
          candidate_legacy_nominee_ids: prediction.candidate_legacy_nominee_ids,
        }, `prediction ${prediction.id} legacy_record`)
      } catch (error) {
        addIssue(error instanceof Error ? error.message : String(error))
      }
    }
  }

  const beatsByLegacyId = new Map(parsed.signatureBeats.map((row) => (
    [Number(row.legacy_signature_beat_id), row]
  )))
  const openBeatProbability: string[] = []
  const openBeatLikelihood: string[] = []
  const openBeatContracts: string[] = []
  for (const beat of legacy.catalog.signature_beats) {
    const id = String(beat.id)
    const decision = beatsByLegacyId.get(beat.id)
    if (!decision || typeof decision.probability_pct !== 'number') openBeatProbability.push(id)
    if (!decision || typeof decision.likelihood_tier !== 'string') openBeatLikelihood.push(id)
    try {
      if (!decision) throw new Error(`signature beat ${beat.id} contract must be an object`)
      asTriggerContract(decision.contract, `signature beat ${beat.id} contract`)
    } catch (error) {
      openBeatContracts.push(id)
      if (decision?.contract !== null && decision?.contract !== undefined) {
        addIssue(error instanceof Error ? error.message : String(error))
      }
    }
    if (decision) {
      try {
        assertLegacyRecord(decision.legacy_record, {
          title: beat.name,
          trigger_text: beat.trigger_text,
          odds: beat.odds,
          points: beat.points,
          pitch: beat.pitch,
          legacy_entity_ids: [
            beat.entity_id,
            ...(beat.partner_entity_id ? [beat.partner_entity_id] : []),
          ],
        }, `signature beat ${beat.id} legacy_record`)
      } catch (error) {
        addIssue(error instanceof Error ? error.message : String(error))
      }
    }
  }

  const bingoByLegacyId = new Map(parsed.bingoSquares.map((row) => (
    [Number(row.legacy_bingo_square_id), row]
  )))
  const openBingoContracts: string[] = []
  for (const square of legacy.catalog.bingo_squares) {
    const id = String(square.id)
    const decision = bingoByLegacyId.get(square.id)
    try {
      if (!decision) throw new Error(`bingo square ${square.id} contract must be an object`)
      asTriggerContract(decision.contract, `bingo square ${square.id} contract`)
    } catch (error) {
      openBingoContracts.push(id)
      if (decision?.contract !== null && decision?.contract !== undefined) {
        addIssue(error instanceof Error ? error.message : String(error))
      }
    }
    if (decision) {
      try {
        assertLegacyRecord(decision.legacy_record, {
          title: square.title,
          condition: square.win_condition,
          probability_pct: square.probability_pct,
          likelihood_tier: square.likelihood_tier,
          why_it_is_fun: square.why_it_is_fun,
          storyline_tags: square.storyline_tags,
        }, `bingo square ${square.id} legacy_record`)
      } catch (error) {
        addIssue(error instanceof Error ? error.message : String(error))
      }
    }
  }

  const lanes: LegacyShowPackAuthoringStatus['lanes'] = {
    target_identity: statusLane(1, targetIdentityComplete ? [] : ['pack_draft']),
    canon_cutoff: statusLane(1, canonCutoffComplete ? [] : ['pack_draft']),
    global_review: statusLane(4, openGlobalFields),
    entity_kind: statusLane(legacy.identity.entities.length, openEntityKinds),
    entity_dossier: statusLane(legacy.identity.entities.length, openEntityDossiers),
    prediction_candidates: statusLane(legacy.catalog.predictions.length, openPredictionCandidates),
    prediction_contract: statusLane(legacy.catalog.predictions.length, openPredictionContracts),
    signature_beat_probability: statusLane(legacy.catalog.signature_beats.length, openBeatProbability),
    signature_beat_likelihood: statusLane(legacy.catalog.signature_beats.length, openBeatLikelihood),
    signature_beat_contract: statusLane(legacy.catalog.signature_beats.length, openBeatContracts),
    bingo_contract: statusLane(legacy.catalog.bingo_squares.length, openBingoContracts),
  }
  const lanesComplete = Object.values(lanes).every((lane) => lane.filled === lane.total)
  if (lanesComplete) {
    try {
      finalizeLegacyShowPackAuthoringWorksheet(legacy, legacyWorksheetSha256, value)
    } catch (error) {
      addIssue(error instanceof Error ? error.message : String(error))
    }
  }
  return { ready: lanesComplete && issues.length === 0, lanes, issues }
}

function projectLegacyShowPackAuthoringWorksheetInternal(
  legacy: LegacyShowPackMigrationWorksheet,
  legacyWorksheetSha256: string,
  value: unknown,
  requireGlobalReview: boolean,
): ShowPack {
  assertHealthyLegacyWorksheet(legacy)
  assertSha256(legacyWorksheetSha256, 'legacy migration worksheet SHA-256')
  const parsed = parseAuthoringWorksheet(value)
  const { raw, source, packDraft, globalReview } = parsed

  if (source.pack_id !== legacy.source_pack.id || source.pack_key !== legacy.source_pack.pack_key) {
    throw new Error('authoring source does not match the legacy migration worksheet')
  }
  if (source.worksheet_sha256 !== legacyWorksheetSha256) {
    throw new Error('authoring source worksheet SHA-256 does not match')
  }
  if (typeof packDraft.id !== 'string' || packDraft.id.trim() === ''
    || !Number.isInteger(packDraft.version) || Number(packDraft.version) < 1) {
    throw new Error('pack_draft target id and version require human approval')
  }
  if (packDraft.id === legacy.source_pack.pack_key
    && packDraft.version === legacy.source_pack.version) {
    throw new Error('pack_draft target id and version must not collide with the published legacy pack')
  }
  for (const field of ['property', 'installment', 'fact_source'] as const) {
    if (packDraft[field] !== legacy.source_pack[field]) {
      throw new Error(`pack_draft ${field} must preserve the audited legacy value`)
    }
  }
  if (typeof packDraft.canon_cutoff !== 'string' || packDraft.canon_cutoff.trim() === '') {
    throw new Error('pack_draft canon_cutoff requires human approval')
  }
  for (const row of parsed.entities) {
    exactKeys(row, ['legacy_entity_id', 'legacy_record', 'id', 'kind', 'group', 'dossier'], 'entity decision')
  }
  for (const row of parsed.predictions) {
    exactKeys(row, [
      'legacy_prediction_id', 'legacy_record', 'id', 'contract', 'candidate_legacy_nominee_ids',
    ], 'prediction decision')
  }
  for (const row of parsed.signatureBeats) {
    exactKeys(row, [
      'legacy_signature_beat_id', 'legacy_record', 'id', 'probability_pct', 'likelihood_tier', 'contract',
    ], 'signature beat decision')
  }
  for (const row of parsed.bingoSquares) {
    exactKeys(row, ['legacy_bingo_square_id', 'legacy_record', 'id', 'contract'], 'bingo square decision')
  }

  assertExactCoverage(
    parsed.entities.map((row) => row.legacy_entity_id as string),
    legacy.identity.entities.map((row) => row.legacy_entity_id),
    'entity',
  )
  assertExactCoverage(
    parsed.predictions.map((row) => row.legacy_prediction_id as number),
    legacy.catalog.predictions.map((row) => row.id),
    'prediction',
  )
  assertExactCoverage(
    parsed.signatureBeats.map((row) => row.legacy_signature_beat_id as number),
    legacy.catalog.signature_beats.map((row) => row.id),
    'signature beat',
  )
  assertExactCoverage(
    parsed.bingoSquares.map((row) => row.legacy_bingo_square_id as number),
    legacy.catalog.bingo_squares.map((row) => row.id),
    'bingo square',
  )

  const entityDecisionByLegacyId = new Map(parsed.entities.map((row) => (
    [String(row.legacy_entity_id), row]
  )))
  const entityIdByLegacyNominee = new Map<string, string>()
  const entities: ShowPackEntity[] = legacy.identity.entities.map((identity) => {
    const decision = entityDecisionByLegacyId.get(identity.legacy_entity_id)!
    assertLegacyRecord(decision.legacy_record, {
      name: identity.name,
      legacy_type: identity.legacy_type,
      group: identity.group,
      portrait: identity.portrait,
    }, `entity ${identity.legacy_entity_id} legacy_record`)
    if (typeof decision.id !== 'string' || typeof decision.kind !== 'string'
      || typeof decision.group !== 'string' || !asRecord(decision.dossier, 'entity dossier')) {
      throw new Error(`entity ${identity.legacy_entity_id} requires id, kind, group, and dossier decisions`)
    }
    if (!identity.portrait || !identity.suggested_id || !identity.legacy_nominee_id) {
      throw new Error(`entity ${identity.legacy_entity_id} audited identity is incomplete`)
    }
    entityIdByLegacyNominee.set(identity.legacy_nominee_id, decision.id)
    return {
      id: decision.id,
      name: identity.name,
      kind: decision.kind as EntityKind,
      group: decision.group,
      draftable: true,
      portrait: { ...identity.portrait },
      dossier: decision.dossier as unknown as ShowPackEntity['dossier'],
    }
  })

  const predictionDecisionByLegacyId = new Map(parsed.predictions.map((row) => (
    [Number(row.legacy_prediction_id), row]
  )))
  const predictions: ShowPackPrediction[] = legacy.catalog.predictions.map((legacyPrediction) => {
    const decision = predictionDecisionByLegacyId.get(legacyPrediction.id)!
    assertLegacyRecord(decision.legacy_record, {
      title: legacyPrediction.name,
      points: legacyPrediction.points,
      tier: legacyPrediction.tier,
      candidate_legacy_nominee_ids: legacyPrediction.candidate_legacy_nominee_ids,
    }, `prediction ${legacyPrediction.id} legacy_record`)
    const contract = asTriggerContract(decision.contract, `prediction ${legacyPrediction.id} contract`)
    if (typeof decision.id !== 'string') throw new Error(`prediction ${legacyPrediction.id} id is required`)
    if (!Array.isArray(decision.candidate_legacy_nominee_ids)) {
      throw new Error(`prediction ${legacyPrediction.id} candidate owner requires explicit approval`)
    }
    const seenNominees = new Set<string>()
    const candidateEntityIds = decision.candidate_legacy_nominee_ids.map((nomineeId) => {
      if (typeof nomineeId !== 'string' || !entityIdByLegacyNominee.has(nomineeId)) {
        throw new Error(`prediction ${legacyPrediction.id} references unknown legacy nominee ${String(nomineeId)}`)
      }
      if (seenNominees.has(nomineeId)) {
        throw new Error(`prediction ${legacyPrediction.id} repeats legacy nominee ${nomineeId}`)
      }
      seenNominees.add(nomineeId)
      return entityIdByLegacyNominee.get(nomineeId)!
    })
    return {
      id: decision.id,
      title: legacyPrediction.name,
      ...contract,
      points: legacyPrediction.points,
      tier: legacyPrediction.tier,
      candidate_entity_ids: candidateEntityIds,
    }
  })

  const entityIdByLegacyEntity = new Map(legacy.identity.entities.map((identity) => (
    [identity.legacy_entity_id, entityDecisionByLegacyId.get(identity.legacy_entity_id)!.id as string]
  )))
  const signatureDecisionByLegacyId = new Map(parsed.signatureBeats.map((row) => (
    [Number(row.legacy_signature_beat_id), row]
  )))
  const signatureBeats: ShowPackSignatureBeat[] = legacy.catalog.signature_beats.map((legacyBeat) => {
    const decision = signatureDecisionByLegacyId.get(legacyBeat.id)!
    assertLegacyRecord(decision.legacy_record, {
      title: legacyBeat.name,
      trigger_text: legacyBeat.trigger_text,
      odds: legacyBeat.odds,
      points: legacyBeat.points,
      pitch: legacyBeat.pitch,
      legacy_entity_ids: [
        legacyBeat.entity_id,
        ...(legacyBeat.partner_entity_id ? [legacyBeat.partner_entity_id] : []),
      ],
    }, `signature beat ${legacyBeat.id} legacy_record`)
    const contract = asTriggerContract(decision.contract, `signature beat ${legacyBeat.id} contract`)
    if (typeof decision.id !== 'string') throw new Error(`signature beat ${legacyBeat.id} id is required`)
    const entityIds = [entityIdByLegacyEntity.get(legacyBeat.entity_id)]
    if (legacyBeat.partner_entity_id) entityIds.push(entityIdByLegacyEntity.get(legacyBeat.partner_entity_id))
    if (entityIds.some((id) => typeof id !== 'string')) {
      throw new Error(`signature beat ${legacyBeat.id} has an unresolved legacy entity`)
    }
    return {
      id: decision.id,
      title: legacyBeat.name,
      ...contract,
      probability_pct: decision.probability_pct as number,
      likelihood_tier: decision.likelihood_tier as LikelihoodTier,
      entity_ids: entityIds as string[],
      points: legacyBeat.points,
      pitch: legacyBeat.pitch,
    }
  })

  const bingoDecisionByLegacyId = new Map(parsed.bingoSquares.map((row) => (
    [Number(row.legacy_bingo_square_id), row]
  )))
  const bingoSquares: ShowPackBingoSquare[] = legacy.catalog.bingo_squares.map((legacySquare) => {
    const decision = bingoDecisionByLegacyId.get(legacySquare.id)!
    assertLegacyRecord(decision.legacy_record, {
      title: legacySquare.title,
      condition: legacySquare.win_condition,
      probability_pct: legacySquare.probability_pct,
      likelihood_tier: legacySquare.likelihood_tier,
      why_it_is_fun: legacySquare.why_it_is_fun,
      storyline_tags: legacySquare.storyline_tags,
    }, `bingo square ${legacySquare.id} legacy_record`)
    const contract = asTriggerContract(decision.contract, `bingo square ${legacySquare.id} contract`)
    if (typeof decision.id !== 'string') throw new Error(`bingo square ${legacySquare.id} id is required`)
    return {
      id: decision.id,
      title: legacySquare.title,
      ...contract,
      probability_pct: legacySquare.probability_pct,
      likelihood_tier: legacySquare.likelihood_tier as LikelihoodTier,
      why_it_is_fun: legacySquare.why_it_is_fun!,
      storyline_tags: [...legacySquare.storyline_tags!],
    }
  })

  const pack: ShowPack = {
    schema_version: LEGACY_SHOW_PACK_SCHEMA_VERSION,
    pack: {
      id: packDraft.id,
      version: packDraft.version as number,
      title: packDraft.title as string,
      property: packDraft.property as string,
      installment: packDraft.installment as string,
      fact_source: packDraft.fact_source as ShowPack['pack']['fact_source'],
      canon_cutoff: packDraft.canon_cutoff,
    },
    sources: structuredClone(raw.sources) as ShowPackSource[],
    claims: structuredClone(raw.claims) as ShowPackClaim[],
    entities,
    predictions,
    signature_beats: signatureBeats,
    bingo_squares: bingoSquares,
    commentary_voices: structuredClone(raw.commentary_voices) as ShowPackCommentaryVoice[],
    commentary_requests: structuredClone(raw.commentary_requests) as ShowPackCommentaryRequest[],
  }
  const issues = validateShowPack(pack)
  if (issues.length > 0) {
    throw new Error(`schema-v3 authoring is invalid:\n${issues.map((issue) => issue.message).join('\n')}`)
  }
  const authoring = value as LegacyShowPackAuthoringWorksheet
  for (const field of LEGACY_GLOBAL_REVIEW_COLLECTIONS) {
    const sealIssue = legacyGlobalReviewSealIssue(authoring, field)
    if (sealIssue !== null
      && (requireGlobalReview || authoring.global_review[field] !== null)) {
      throw new Error(`global_review ${sealIssue}`)
    }
  }
  return pack
}

/**
 * Builds the schema-v3 working surface needed by grounded commentary without
 * treating collection review as complete. All structural, doctrine and claim
 * checks still run; only the four independent review seals remain open.
 */
export function projectLegacyShowPackAuthoringWorksheet(
  legacy: LegacyShowPackMigrationWorksheet,
  legacyWorksheetSha256: string,
  value: unknown,
): ShowPack {
  return projectLegacyShowPackAuthoringWorksheetInternal(
    legacy,
    legacyWorksheetSha256,
    value,
    false,
  )
}

export function finalizeLegacyShowPackAuthoringWorksheet(
  legacy: LegacyShowPackMigrationWorksheet,
  legacyWorksheetSha256: string,
  value: unknown,
): ShowPack {
  return projectLegacyShowPackAuthoringWorksheetInternal(
    legacy,
    legacyWorksheetSha256,
    value,
    true,
  )
}

export function serializeLegacyShowPackAuthoringWorksheet(
  worksheet: LegacyShowPackAuthoringWorksheet,
): string {
  return `${JSON.stringify(worksheet, null, 2)}\n`
}
