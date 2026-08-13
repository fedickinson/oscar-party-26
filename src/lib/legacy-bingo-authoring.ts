import type { LegacyShowPackMigrationWorksheet } from './legacy-show-pack-audit'
import type { LegacyShowPackAuthoringWorksheet } from './legacy-show-pack-authoring'
import type {
  ShowPackClaim,
  ShowPackSource,
  TriggerAdjudication,
  TriggerContract,
} from './show-pack'
import { invalidateStaleLegacyGlobalReviewSeals } from './legacy-global-review'

const SHA256 = /^[a-f0-9]{64}$/

interface LegacyBingoMasterSource {
  title: string
  publisher: string
  url: string
  supports: string
}

interface LegacyBingoMasterSquare {
  id: string
  title: string
  estimated_probability_pct: number
  likelihood_tier: string
  win_condition: string
  why_it_is_fun: string
  storyline_tags: string[]
  source_basis: string[]
}

interface LegacyBingoMasterPool {
  sources: Record<string, LegacyBingoMasterSource>
  squares: LegacyBingoMasterSquare[]
}

export interface LegacyBingoContractDecisionManifest {
  manifest_version: 2
  artifact: 'legacy-bingo-contract-decisions'
  target: {
    pack_id: string
    pack_version: number
  }
  legacy_worksheet_sha256: string
  master_pool_sha256: string
  approved_square_ids: string[]
  approved_gameplay_square_ids: string[]
  sources: ShowPackSource[]
  claims: ShowPackClaim[]
  authoring_source: ShowPackSource
  authoring_claim_id_by_square_id: Record<string, string>
  source_id_by_source_key: Record<string, string>
  basis_claim_by_source_key: Record<string, string>
  adjudication: TriggerAdjudication
  adjudication_by_square_id?: Record<string, TriggerAdjudication>
  exclusions_by_square_id?: Record<string, string[]>
  title_review_note: string
  gameplay_title_review_note: string
}

export interface ApplyLegacyBingoContractDecisionsInput {
  legacy: LegacyShowPackMigrationWorksheet
  legacyWorksheetSha256: string
  authoring: LegacyShowPackAuthoringWorksheet
  masterPool: unknown
  masterPoolSha256: string
  manifest: LegacyBingoContractDecisionManifest
}

export interface ApplyLegacyBingoContractDecisionsResult {
  worksheet: LegacyShowPackAuthoringWorksheet
  applied_square_ids: string[]
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

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function asText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be text`)
  return value
}

function asTextArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.trim() === '')) {
    throw new Error(`${label} must be a text array`)
  }
  if (new Set(value).size !== value.length) throw new Error(`${label} must not contain duplicates`)
  return value
}

function parseMasterPool(value: unknown): LegacyBingoMasterPool {
  const raw = asRecord(value, 'bingo master pool')
  const rawSources = asRecord(raw.sources, 'bingo master pool sources')
  if (!Array.isArray(raw.squares)) throw new Error('bingo master pool squares must be an array')
  const sources: Record<string, LegacyBingoMasterSource> = {}
  for (const [key, value] of Object.entries(rawSources)) {
    const source = asRecord(value, `bingo master source ${key}`)
    sources[key] = {
      title: asText(source.title, `bingo master source ${key} title`),
      publisher: asText(source.publisher, `bingo master source ${key} publisher`),
      url: asText(source.url, `bingo master source ${key} url`),
      supports: asText(source.supports, `bingo master source ${key} supports`),
    }
  }
  const squares = raw.squares.map((value, index) => {
    const square = asRecord(value, `bingo master square ${index}`)
    if (typeof square.estimated_probability_pct !== 'number') {
      throw new Error(`bingo master square ${index} probability must be numeric`)
    }
    return {
      id: asText(square.id, `bingo master square ${index} id`),
      title: asText(square.title, `bingo master square ${index} title`),
      estimated_probability_pct: square.estimated_probability_pct,
      likelihood_tier: asText(square.likelihood_tier, `bingo master square ${index} likelihood`),
      win_condition: asText(square.win_condition, `bingo master square ${index} condition`),
      why_it_is_fun: asText(square.why_it_is_fun, `bingo master square ${index} rationale`),
      storyline_tags: asTextArray(square.storyline_tags, `bingo master square ${index} tags`),
      source_basis: asTextArray(square.source_basis, `bingo master square ${index} source basis`),
    }
  })
  return { sources, squares }
}

function assertExactIds(actual: string[], expected: string[], label: string): void {
  const normalizedActual = [...actual].sort()
  const normalizedExpected = [...expected].sort()
  if (normalizedActual.length !== normalizedExpected.length
    || normalizedActual.some((id, index) => id !== normalizedExpected[index])) {
    throw new Error(label)
  }
}

function mergeReviewedRows<T extends { id: string }>(
  current: T[],
  reviewed: T[],
  label: string,
): T[] {
  const merged = current.map((row) => structuredClone(row))
  const byId = new Map(merged.map((row) => [row.id, row]))
  for (const row of reviewed) {
    const existing = byId.get(row.id)
    if (existing && canonicalJson(existing) !== canonicalJson(row)) {
      throw new Error(`${label} ${row.id} conflicts with prior authoring`)
    }
    if (!existing) {
      const copy = structuredClone(row)
      merged.push(copy)
      byId.set(copy.id, copy)
    }
  }
  return merged
}

function conditionExclusions(condition: string, squareId: string): string[] {
  const boundary = condition.indexOf('. ')
  if (boundary < 0 || boundary + 2 >= condition.length) {
    throw new Error(`bingo square ${squareId} needs an explicit adjudication boundary after its condition`)
  }
  return [condition.slice(boundary + 2)]
}

function authoredGameRuleClaimText(square: LegacyBingoMasterSquare): string {
  return `The "${square.title}" bingo square is intentionally authored as judgeable game texture under its complete win condition; its inclusion and probability are not a sourced forecast or a claim that prior screen canon predicts it.`
}

function assertManifest(
  manifest: LegacyBingoContractDecisionManifest,
  authoring: LegacyShowPackAuthoringWorksheet,
  legacyWorksheetSha256: string,
  masterPoolSha256: string,
): void {
  if (manifest.manifest_version !== 2 || manifest.artifact !== 'legacy-bingo-contract-decisions') {
    throw new Error('bingo decision manifest identity is invalid')
  }
  if (!SHA256.test(masterPoolSha256) || manifest.master_pool_sha256 !== masterPoolSha256) {
    throw new Error('master pool SHA-256 does not match the bingo decision manifest')
  }
  if (!SHA256.test(legacyWorksheetSha256)
    || !SHA256.test(manifest.legacy_worksheet_sha256)
    || legacyWorksheetSha256 !== manifest.legacy_worksheet_sha256
    || authoring.source.worksheet_sha256 !== manifest.legacy_worksheet_sha256) {
    throw new Error('legacy worksheet SHA-256 does not match the bingo decision manifest')
  }
  if (authoring.pack_draft.id !== manifest.target.pack_id
    || authoring.pack_draft.version !== manifest.target.pack_version) {
    throw new Error('authoring target does not match the bingo decision manifest')
  }
  asTextArray(manifest.approved_square_ids, 'approved square ids')
  asTextArray(manifest.approved_gameplay_square_ids, 'approved gameplay square ids')
  asText(manifest.authoring_source.id, 'authoring source id')
  asText(manifest.authoring_source.title, 'authoring source title')
  if (manifest.authoring_source.kind !== 'authoring_record') {
    throw new Error('authoring source must be an authoring_record')
  }
  const expectedAuthoringLocator = `repo:src/data/bingo-master-pool.json:sha256:${masterPoolSha256}`
  if (manifest.authoring_source.locator !== expectedAuthoringLocator) {
    throw new Error('authoring source must seal the exact bingo master-pool bytes')
  }
  asText(manifest.title_review_note, 'title review note')
  asText(manifest.gameplay_title_review_note, 'gameplay title review note')
  for (const dimension of ['proxies', 'offscreen', 'mentions'] as const) {
    if (manifest.adjudication[dimension] === 'unspecified') {
      throw new Error(`bingo decision adjudication ${dimension} must be explicit`)
    }
  }
  for (const [squareId, adjudication] of Object.entries(manifest.adjudication_by_square_id ?? {})) {
    asText(squareId, 'adjudication override square id')
    for (const dimension of ['proxies', 'offscreen', 'mentions'] as const) {
      if (adjudication[dimension] === 'unspecified') {
        throw new Error(`bingo square ${squareId} adjudication ${dimension} must be explicit`)
      }
    }
  }
  for (const [squareId, exclusions] of Object.entries(manifest.exclusions_by_square_id ?? {})) {
    asText(squareId, 'exclusion override square id')
    if (asTextArray(exclusions, `bingo square ${squareId} exclusion override`).length === 0) {
      throw new Error(`bingo square ${squareId} exclusion override must not be empty`)
    }
  }
}

export function applyLegacyBingoContractDecisions(
  input: ApplyLegacyBingoContractDecisionsInput,
): ApplyLegacyBingoContractDecisionsResult {
  const { legacy, legacyWorksheetSha256, authoring, masterPoolSha256, manifest } = input
  assertManifest(manifest, authoring, legacyWorksheetSha256, masterPoolSha256)
  const master = parseMasterPool(input.masterPool)

  const legacyBySlug = new Map(legacy.catalog.bingo_squares.map((square) => [square.slug, square]))
  assertExactIds(
    master.squares.map((square) => square.id),
    [...legacyBySlug.keys()],
    'bingo master pool must exactly cover the audited legacy bingo ids',
  )
  for (const square of master.squares) {
    const audited = legacyBySlug.get(square.id)!
    const expected = {
      title: audited.title,
      probability_pct: audited.probability_pct,
      likelihood_tier: audited.likelihood_tier,
      win_condition: audited.win_condition,
      why_it_is_fun: audited.why_it_is_fun,
      storyline_tags: audited.storyline_tags,
    }
    const actual = {
      title: square.title,
      probability_pct: square.estimated_probability_pct,
      likelihood_tier: square.likelihood_tier,
      win_condition: square.win_condition,
      why_it_is_fun: square.why_it_is_fun,
      storyline_tags: square.storyline_tags,
    }
    if (canonicalJson(actual) !== canonicalJson(expected)) {
      throw new Error(`master square ${square.id} must match the audited legacy bingo record`)
    }
    for (const sourceKey of square.source_basis) {
      if (!master.sources[sourceKey]) {
        throw new Error(`bingo square ${square.id} references unknown master source ${sourceKey}`)
      }
    }
  }

  const evidenceBackedIds = master.squares
    .filter((square) => square.source_basis.length > 0)
    .map((square) => square.id)
  assertExactIds(
    manifest.approved_square_ids,
    evidenceBackedIds,
    'approved square ids must exactly match evidence-backed master-pool squares',
  )
  const gameplayIds = master.squares
    .filter((square) => square.source_basis.length === 0)
    .map((square) => square.id)
  assertExactIds(
    manifest.approved_gameplay_square_ids,
    gameplayIds,
    'approved gameplay square ids must exactly match source-free master-pool squares',
  )
  const approvedIds = [...evidenceBackedIds, ...gameplayIds]
  for (const squareId of Object.keys(manifest.adjudication_by_square_id ?? {})) {
    if (!approvedIds.includes(squareId)) {
      throw new Error(`adjudication override references unapproved bingo square ${squareId}`)
    }
  }
  for (const squareId of Object.keys(manifest.exclusions_by_square_id ?? {})) {
    if (!approvedIds.includes(squareId)) {
      throw new Error(`exclusion override references unapproved bingo square ${squareId}`)
    }
  }

  const claimById = new Map(manifest.claims.map((claim) => [claim.id, claim]))
  if (claimById.size !== manifest.claims.length) throw new Error('bingo decision claims contain duplicate ids')
  const reviewedSources = [...manifest.sources, manifest.authoring_source]
  const sourceById = new Map(reviewedSources.map((source) => [source.id, source]))
  if (sourceById.size !== reviewedSources.length) throw new Error('bingo decision sources contain duplicate ids')
  const usedSourceKeys = [...new Set(master.squares.flatMap((square) => square.source_basis))]
  assertExactIds(
    Object.keys(manifest.source_id_by_source_key),
    usedSourceKeys,
    'source mapping must exactly cover the master-pool source keys in use',
  )
  assertExactIds(
    Object.keys(manifest.basis_claim_by_source_key),
    usedSourceKeys,
    'basis claim mapping must exactly cover the master-pool source keys in use',
  )
  for (const sourceKey of usedSourceKeys) {
    const sourceId = manifest.source_id_by_source_key[sourceKey]
    const source = sourceById.get(sourceId)
    const masterSource = master.sources[sourceKey]
    if (!source || source.title !== masterSource.title || source.locator !== masterSource.url) {
      throw new Error(`master source ${sourceKey} does not match its reviewed show-pack source`)
    }
    const claimId = manifest.basis_claim_by_source_key[sourceKey]
    const claim = claimById.get(claimId)
    if (!claim || claim.status !== 'verified'
      || (claim.canon !== 'screen' && claim.canon !== 'discourse')) {
      throw new Error(`master source ${sourceKey} must map to a verified screen or discourse claim`)
    }
    if (!claim.source_ids.includes(sourceId)) {
      throw new Error(`claim ${claimId} must cite the reviewed source for ${sourceKey}`)
    }
  }
  assertExactIds(
    Object.keys(manifest.authoring_claim_id_by_square_id),
    gameplayIds,
    'authoring claim mapping must exactly cover source-free master-pool squares',
  )
  for (const square of master.squares.filter((row) => row.source_basis.length === 0)) {
    const claimId = manifest.authoring_claim_id_by_square_id[square.id]
    const claim = claimById.get(claimId)
    if (!claim || claim.canon !== 'authoring' || claim.status !== 'verified') {
      throw new Error(`gameplay square ${square.id} must map to a verified authoring claim`)
    }
    if (canonicalJson(claim.source_ids) !== canonicalJson([manifest.authoring_source.id])) {
      throw new Error(`authoring claim ${claimId} must cite only the hash-bound bingo authoring record`)
    }
    if (claim.text !== authoredGameRuleClaimText(square)) {
      throw new Error(`authoring claim ${claimId} must state the reviewed game-rule provenance exactly`)
    }
  }

  const knownSourceIds = new Set(sourceById.keys())
  for (const claim of manifest.claims) {
    for (const sourceId of claim.source_ids) {
      if (!knownSourceIds.has(sourceId)) throw new Error(`claim ${claim.id} references unknown source ${sourceId}`)
    }
    const kinds = claim.source_ids.map((sourceId) => sourceById.get(sourceId)!.kind)
    if (claim.canon === 'screen'
      && !kinds.some((kind) => kind === 'screen' || kind === 'operator_record' || kind === 'trailer')) {
      throw new Error(`verified screen claim ${claim.id} has no screen warrant`)
    }
    if (claim.canon === 'discourse' && !kinds.includes('sentiment')) {
      throw new Error(`verified discourse claim ${claim.id} has no sentiment warrant`)
    }
    if (claim.canon === 'authoring'
      && (claim.status !== 'verified'
        || kinds.length !== claim.source_ids.length
        || kinds.some((kind) => kind !== 'authoring_record'))) {
      throw new Error(`verified authoring claim ${claim.id} must use only authoring-record sources`)
    }
  }

  const worksheet = structuredClone(authoring)
  worksheet.sources = mergeReviewedRows(worksheet.sources, reviewedSources, 'source')
  worksheet.claims = mergeReviewedRows(worksheet.claims, manifest.claims, 'claim')
  const authoringByLegacyId = new Map(worksheet.bingo_squares.map((square) => (
    [square.legacy_bingo_square_id, square]
  )))
  const appliedSquareIds: string[] = []
  for (const square of master.squares) {
    const audited = legacyBySlug.get(square.id)!
    const decision = authoringByLegacyId.get(audited.id)
    if (!decision) throw new Error(`authoring worksheet is missing bingo square ${square.id}`)
    const contract: TriggerContract = {
      condition: square.win_condition,
      exclusions: structuredClone(
        manifest.exclusions_by_square_id?.[square.id]
          ?? conditionExclusions(square.win_condition, square.id),
      ),
      adjudication: structuredClone(
        manifest.adjudication_by_square_id?.[square.id] ?? manifest.adjudication,
      ),
      title_review: {
        status: 'approved',
        note: square.source_basis.length > 0
          ? manifest.title_review_note
          : manifest.gameplay_title_review_note,
      },
      basis_claim_ids: square.source_basis.length > 0
        ? square.source_basis.map((sourceKey) => manifest.basis_claim_by_source_key[sourceKey])
        : [manifest.authoring_claim_id_by_square_id[square.id]],
    }
    if (decision.contract !== null && canonicalJson(decision.contract) !== canonicalJson(contract)) {
      const priorGeneratedContract: TriggerContract = {
        ...contract,
        exclusions: conditionExclusions(square.win_condition, square.id),
      }
      if (canonicalJson(decision.contract) !== canonicalJson(priorGeneratedContract)) {
        throw new Error(`bingo square ${square.id} already has a conflicting contract`)
      }
    }
    decision.contract = contract
    appliedSquareIds.push(square.id)
  }

  invalidateStaleLegacyGlobalReviewSeals(worksheet)

  return {
    worksheet,
    applied_square_ids: appliedSquareIds,
  }
}
