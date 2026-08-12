import { containsDisallowedEmoji } from './generated-prose'
import {
  serializeShowPackFlywheelSeed,
  type ShowPackFlywheelPredecessor,
  type ShowPackFlywheelSeed,
} from './show-pack-flywheel'
import type { ClaimStatus, ShowPackClaim, ShowPackSource } from './show-pack'
import { sha256Hex } from './sha256'

type UnknownRecord = Record<string, unknown>
type CandidateSourceKind = 'recap' | 'sentiment'
type CandidateClaimCanon = 'screen' | 'discourse'
type DecisionDisposition = 'include' | 'omit'

export interface ShowPackResearchCandidates {
  candidate_version: 1
  artifact: 'show-pack-research-candidates'
  target: ShowPackFlywheelPredecessor
  sources: Array<{
    id: string
    kind: CandidateSourceKind
    title: string
    locator: string
  }>
  claims: Array<{
    id: string
    canon: CandidateClaimCanon
    text: string
    source_ids: string[]
    candidate_cross_check_claim_ids: string[]
  }>
}

export interface ShowPackResearchIntakePacket {
  packet_version: 1
  artifact: 'show-pack-research-intake-review'
  target: ShowPackFlywheelPredecessor
  inputs: {
    flywheel_seed_sha256: string
    candidates_sha256: string
  }
  doctrine: {
    recap_default_status: 'recap'
    recap_verification_requires: 'canonical_screen_cross_check'
    sentiment_canon: 'discourse'
    source_material_role: 'attitude_only'
    screen_silence_verdict: 'unverifiable'
  }
  canonical_source: ShowPackSource
  canonical_screen_claims: ShowPackClaim[]
  sources: ShowPackResearchCandidates['sources']
  claims: ShowPackResearchCandidates['claims']
}

export interface ShowPackResearchIntakeDecisionTemplate {
  decision_version: 1
  artifact: 'show-pack-research-intake-decisions'
  target: ShowPackFlywheelPredecessor
  expected_packet_sha256: string
  sources: Array<{
    source_id: string
    disposition: null
    note: null
  }>
  claims: Array<{
    claim_id: string
    disposition: null
    status: null
    approved_cross_check_claim_ids: null
    note: null
  }>
}

export interface ShowPackResearchIntakeDecisionStatus {
  required_values: number
  open_values: number
  open_items: string[]
  status: 'open' | 'complete'
}

export interface ShowPackResearchIntakeResult {
  result_version: 1
  artifact: 'show-pack-research-intake'
  target: ShowPackFlywheelPredecessor
  packet_sha256: string
  decisions_sha256: string
  sources: ShowPackSource[]
  claims: ShowPackClaim[]
}

const SHA256 = /^[a-f0-9]{64}$/
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const REVIEW_SOURCE_ID = 'predecessor-research-review'

function record(value: unknown, label: string): UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as UnknownRecord
}

function records(value: unknown, label: string): UnknownRecord[] {
  if (!Array.isArray(value) || value.some((row) => row === null || typeof row !== 'object' || Array.isArray(row))) {
    throw new Error(`${label} must be an array of objects`)
  }
  return value as UnknownRecord[]
}

function parseJson(raw: string, label: string): UnknownRecord {
  try { return record(JSON.parse(raw), label) } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`${label} is not valid JSON: ${error.message}`)
    throw error
  }
}

function exactKeys(value: UnknownRecord, keys: string[], label: string): void {
  const expected = new Set(keys)
  const unknown = Object.keys(value).find((key) => !expected.has(key))
  if (unknown) throw new Error(`${label} has unknown field ${unknown}`)
  const missing = keys.find((key) => !Object.prototype.hasOwnProperty.call(value, key))
  if (missing) throw new Error(`${label} is missing field ${missing}`)
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  const result = value.trim()
  if (containsDisallowedEmoji(result)) throw new Error(`${label} must not contain emoji`)
  return result
}

function slug(value: unknown, label: string): string {
  const result = text(value, label)
  if (!SLUG.test(result)) throw new Error(`${label} must be a kebab-case slug`)
  return result
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`)
  const result = value.map((item, index) => text(item, `${label}[${index}]`))
  if (new Set(result).size !== result.length) throw new Error(`${label} must not contain duplicates`)
  return result
}

function target(value: unknown, label: string): ShowPackFlywheelPredecessor {
  const result = record(value, label)
  exactKeys(result, ['pack_id', 'settlement_id', 'settlement_version'], label)
  const packId = slug(result.pack_id, `${label}.pack_id`)
  const settlementId = text(result.settlement_id, `${label}.settlement_id`)
  if (!Number.isInteger(result.settlement_version) || Number(result.settlement_version) < 1) {
    throw new Error(`${label}.settlement_version must be a positive integer`)
  }
  return { pack_id: packId, settlement_id: settlementId, settlement_version: Number(result.settlement_version) }
}

function sameTarget(left: ShowPackFlywheelPredecessor, right: unknown, label: string): void {
  if (JSON.stringify(left) !== JSON.stringify(target(right, label))) {
    throw new Error(`${label} does not match the flywheel seed`)
  }
}

function parseCanonicalSeed(raw: string): ShowPackFlywheelSeed {
  const value = parseJson(raw, 'flywheel seed') as unknown as ShowPackFlywheelSeed
  if (value.schema_version !== 3 || value.artifact !== 'show-pack-flywheel-seed') {
    throw new Error('flywheel seed identity is invalid')
  }
  if (serializeShowPackFlywheelSeed(value) !== raw) throw new Error('flywheel seed bytes are not canonical')
  target(value.predecessor, 'flywheel seed predecessor')
  if (!value.source || value.source.id !== 'predecessor-settlement' || value.source.kind !== 'operator_record') {
    throw new Error('flywheel seed canonical source is invalid')
  }
  if (!Array.isArray(value.screen_claims) || value.screen_claims.some((claim) => (
    claim.canon !== 'screen' || claim.status !== 'verified'
      || !claim.id.startsWith('predecessor-screen-')
      || JSON.stringify(claim.source_ids) !== JSON.stringify([value.source.id])
  ))) {
    throw new Error('flywheel seed canonical screen claims are invalid')
  }
  return value
}

function parseCandidates(raw: string, expectedTarget: ShowPackFlywheelPredecessor): ShowPackResearchCandidates {
  const value = parseJson(raw, 'research candidates')
  exactKeys(value, ['candidate_version', 'artifact', 'target', 'sources', 'claims'], 'research candidates')
  if (value.candidate_version !== 1 || value.artifact !== 'show-pack-research-candidates') {
    throw new Error('research candidates identity is invalid')
  }
  sameTarget(expectedTarget, value.target, 'research candidates target')
  const sources = records(value.sources, 'research candidate sources').map((source, index) => {
    exactKeys(source, ['id', 'kind', 'title', 'locator'], `research candidate source ${index + 1}`)
    const id = slug(source.id, `research candidate source ${index + 1}.id`)
    if (source.kind !== 'recap' && source.kind !== 'sentiment') {
      throw new Error(`research candidate source ${id} kind must be recap or sentiment`)
    }
    return {
      id,
      kind: source.kind,
      title: text(source.title, `research candidate source ${id}.title`),
      locator: text(source.locator, `research candidate source ${id}.locator`),
    } as ShowPackResearchCandidates['sources'][number]
  })
  if (new Set(sources.map((source) => source.id)).size !== sources.length) {
    throw new Error('research candidates contain duplicate source ids')
  }
  const sourceById = new Map(sources.map((source) => [source.id, source]))
  const claims = records(value.claims, 'research candidate claims').map((claim, index) => {
    exactKeys(claim, [
      'id', 'canon', 'text', 'source_ids', 'candidate_cross_check_claim_ids',
    ], `research candidate claim ${index + 1}`)
    const id = slug(claim.id, `research candidate claim ${index + 1}.id`)
    if (claim.canon !== 'screen' && claim.canon !== 'discourse') {
      throw new Error(`research candidate claim ${id} canon must be screen or discourse`)
    }
    const sourceIds = stringArray(claim.source_ids, `research candidate claim ${id}.source_ids`)
    if (sourceIds.length === 0) throw new Error(`research candidate claim ${id} requires at least one source`)
    for (const sourceId of sourceIds) {
      if (!sourceById.has(sourceId)) throw new Error(`research candidate claim ${id} references unknown source ${sourceId}`)
    }
    if (claim.canon === 'screen' && sourceIds.some((sourceId) => sourceById.get(sourceId)?.kind !== 'recap')) {
      throw new Error(`screen claim ${id} may use only recap candidate sources`)
    }
    if (claim.canon === 'discourse' && !sourceIds.some((sourceId) => sourceById.get(sourceId)?.kind === 'sentiment')) {
      throw new Error(`discourse claim ${id} requires a sentiment source`)
    }
    const candidateCrossCheckClaimIds = stringArray(
      claim.candidate_cross_check_claim_ids,
      `research candidate claim ${id}.candidate_cross_check_claim_ids`,
    )
    if (claim.canon === 'discourse' && candidateCrossCheckClaimIds.length !== 0) {
      throw new Error(`discourse research candidate ${id} cannot offer screen cross-checks`)
    }
    return {
      id,
      canon: claim.canon,
      text: text(claim.text, `research candidate claim ${id}.text`),
      source_ids: sourceIds,
      candidate_cross_check_claim_ids: candidateCrossCheckClaimIds,
    } as ShowPackResearchCandidates['claims'][number]
  })
  if (new Set(claims.map((claim) => claim.id)).size !== claims.length) {
    throw new Error('research candidates contain duplicate claim ids')
  }
  const parsed: ShowPackResearchCandidates = {
    candidate_version: 1,
    artifact: 'show-pack-research-candidates',
    target: expectedTarget,
    sources,
    claims,
  }
  if (`${JSON.stringify(parsed, null, 2)}\n` !== raw) throw new Error('research candidate bytes are not canonical')
  return parsed
}

export function buildShowPackResearchIntakePacket(
  flywheelSeedRaw: string,
  candidatesRaw: string,
): ShowPackResearchIntakePacket {
  const seed = parseCanonicalSeed(flywheelSeedRaw)
  const candidates = parseCandidates(candidatesRaw, seed.predecessor)
  const reservedSourceIds = new Set([seed.source.id, REVIEW_SOURCE_ID])
  const reservedSource = candidates.sources.find((source) => reservedSourceIds.has(source.id))
  if (reservedSource) throw new Error(`research source id ${reservedSource.id} is reserved`)
  const reservedClaim = candidates.claims.find((claim) => claim.id.startsWith('predecessor-screen-'))
  if (reservedClaim) throw new Error(`research claim id ${reservedClaim.id} is reserved`)
  const canonicalIds = new Set(seed.screen_claims.map((claim) => claim.id))
  for (const claim of candidates.claims) {
    for (const crossCheckId of claim.candidate_cross_check_claim_ids) {
      if (!canonicalIds.has(crossCheckId)) {
        throw new Error(`research candidate claim ${claim.id} references unknown canonical screen claim ${crossCheckId}`)
      }
    }
  }
  return {
    packet_version: 1,
    artifact: 'show-pack-research-intake-review',
    target: structuredClone(seed.predecessor),
    inputs: {
      flywheel_seed_sha256: sha256Hex(flywheelSeedRaw),
      candidates_sha256: sha256Hex(candidatesRaw),
    },
    doctrine: {
      recap_default_status: 'recap',
      recap_verification_requires: 'canonical_screen_cross_check',
      sentiment_canon: 'discourse',
      source_material_role: 'attitude_only',
      screen_silence_verdict: 'unverifiable',
    },
    canonical_source: structuredClone(seed.source),
    canonical_screen_claims: structuredClone(seed.screen_claims),
    sources: structuredClone(candidates.sources),
    claims: structuredClone(candidates.claims),
  }
}

export function serializeShowPackResearchIntakePacket(packet: ShowPackResearchIntakePacket): string {
  return `${JSON.stringify(packet, null, 2)}\n`
}

export function serializeShowPackResearchIntakeDecisionTemplate(
  packet: ShowPackResearchIntakePacket,
): string {
  const template: ShowPackResearchIntakeDecisionTemplate = {
    decision_version: 1,
    artifact: 'show-pack-research-intake-decisions',
    target: structuredClone(packet.target),
    expected_packet_sha256: sha256Hex(serializeShowPackResearchIntakePacket(packet)),
    sources: packet.sources.map((source) => ({ source_id: source.id, disposition: null, note: null })),
    claims: packet.claims.map((claim) => ({
      claim_id: claim.id,
      disposition: null,
      status: null,
      approved_cross_check_claim_ids: null,
      note: null,
    })),
  }
  return `${JSON.stringify(template, null, 2)}\n`
}

export function serializeShowPackResearchIntakeDecisions(input: unknown): string {
  return `${JSON.stringify(input, null, 2)}\n`
}

function exactRows(
  packetIds: string[],
  value: unknown,
  key: string,
  label: string,
): Map<string, UnknownRecord> {
  const rows = records(value, label)
  const result = new Map<string, UnknownRecord>()
  for (const row of rows) {
    const id = slug(row[key], `${label} ${key}`)
    if (result.has(id)) throw new Error(`${label} contains duplicate ${id}`)
    result.set(id, row)
  }
  const unknown = [...result.keys()].find((id) => !packetIds.includes(id))
  if (unknown) throw new Error(`${label} contains unknown ${unknown}`)
  const missing = packetIds.find((id) => !result.has(id))
  if (missing) throw new Error(`${label} is missing ${missing}`)
  return result
}

export function inspectShowPackResearchIntakeDecisions(
  packet: ShowPackResearchIntakePacket,
  input: unknown,
): ShowPackResearchIntakeDecisionStatus {
  const decisions = record(input, 'research intake decisions')
  exactKeys(decisions, [
    'decision_version', 'artifact', 'target', 'expected_packet_sha256', 'sources', 'claims',
  ], 'research intake decisions')
  if (decisions.decision_version !== 1 || decisions.artifact !== 'show-pack-research-intake-decisions') {
    throw new Error('research intake decisions identity is invalid')
  }
  if (JSON.stringify(decisions.target) !== JSON.stringify(packet.target)
    || decisions.expected_packet_sha256 !== sha256Hex(serializeShowPackResearchIntakePacket(packet))) {
    throw new Error('research intake decisions do not target the exact packet bytes')
  }
  const sourceRows = exactRows(packet.sources.map((source) => source.id), decisions.sources, 'source_id', 'research intake source decisions')
  const claimRows = exactRows(packet.claims.map((claim) => claim.id), decisions.claims, 'claim_id', 'research intake claim decisions')
  const sourceById = new Map(packet.sources.map((source) => [source.id, source]))
  const canonicalClaimIds = new Set(packet.canonical_screen_claims.map((claim) => claim.id))
  const open: string[] = []
  let required = 0
  const requiredValue = (path: string, value: unknown, validate: () => void): void => {
    required += 1
    if (value === null) open.push(path)
    else validate()
  }
  for (const source of packet.sources) {
    const row = sourceRows.get(source.id) as UnknownRecord
    exactKeys(row, ['source_id', 'disposition', 'note'], `research intake source ${source.id}`)
    requiredValue(`sources[${source.id}].disposition`, row.disposition, () => {
      if (row.disposition !== 'include' && row.disposition !== 'omit') {
        throw new Error(`research intake source ${source.id} disposition is invalid`)
      }
    })
    requiredValue(`sources[${source.id}].note`, row.note, () => { text(row.note, `research intake source ${source.id} note`) })
  }
  for (const claim of packet.claims) {
    const row = claimRows.get(claim.id) as UnknownRecord
    exactKeys(row, [
      'claim_id', 'disposition', 'status', 'approved_cross_check_claim_ids', 'note',
    ], `research intake claim ${claim.id}`)
    requiredValue(`claims[${claim.id}].disposition`, row.disposition, () => {
      if (row.disposition !== 'include' && row.disposition !== 'omit') {
        throw new Error(`research intake claim ${claim.id} disposition is invalid`)
      }
    })
    requiredValue(`claims[${claim.id}].note`, row.note, () => { text(row.note, `research intake claim ${claim.id} note`) })
    if (row.disposition === null) {
      if (row.status !== null || row.approved_cross_check_claim_ids !== null) {
        throw new Error(`open research intake claim ${claim.id} cannot carry dependent decisions`)
      }
      continue
    }
    if (row.disposition === 'omit') {
      if (row.status !== null || row.approved_cross_check_claim_ids !== null) {
        throw new Error(`omitted research intake claim ${claim.id} cannot carry publication decisions`)
      }
      continue
    }
    const includedSource = claim.source_ids.find((sourceId) => sourceRows.get(sourceId)?.disposition !== 'include')
    if (includedSource) throw new Error(`included research claim ${claim.id} requires included source ${includedSource}`)
    const crossChecks = stringArray(
      row.approved_cross_check_claim_ids,
      `research intake claim ${claim.id}.approved_cross_check_claim_ids`,
    )
    const unoffered = crossChecks.find((id) => !claim.candidate_cross_check_claim_ids.includes(id) || !canonicalClaimIds.has(id))
    if (unoffered) throw new Error(`research intake claim ${claim.id} references an unoffered canonical screen cross-check ${unoffered}`)
    if (claim.canon === 'screen') {
      if (!claim.source_ids.some((sourceId) => sourceById.get(sourceId)?.kind === 'recap')) {
        throw new Error(`screen claim ${claim.id} requires a recap source`)
      }
      if (!['verified', 'recap', 'unverifiable'].includes(String(row.status))) {
        throw new Error(`screen research claim ${claim.id} status is invalid`)
      }
      if (row.status === 'verified' && crossChecks.length === 0) {
        throw new Error(`verified recap claim ${claim.id} requires an approved canonical screen cross-check`)
      }
      if (row.status !== 'verified' && crossChecks.length !== 0) {
        throw new Error(`non-verified recap claim ${claim.id} cannot carry approved screen cross-checks`)
      }
    } else {
      if (!claim.source_ids.some((sourceId) => sourceById.get(sourceId)?.kind === 'sentiment')) {
        throw new Error(`discourse claim ${claim.id} requires a sentiment source`)
      }
      if (row.status !== 'verified' && row.status !== 'unverifiable') {
        throw new Error(`discourse research claim ${claim.id} status is invalid`)
      }
      if (crossChecks.length !== 0) {
        throw new Error(`discourse research claim ${claim.id} cannot use screen cross-checks as sentiment warrant`)
      }
    }
  }
  return {
    required_values: required,
    open_values: open.length,
    open_items: open,
    status: open.length === 0 ? 'complete' : 'open',
  }
}

export function applyShowPackResearchIntake(
  packet: ShowPackResearchIntakePacket,
  decisionsInput: unknown,
): ShowPackResearchIntakeResult {
  const status = inspectShowPackResearchIntakeDecisions(packet, decisionsInput)
  if (status.status !== 'complete') {
    throw new Error(`research intake decisions are incomplete: ${status.open_items.join(', ')}`)
  }
  const decisions = decisionsInput as UnknownRecord
  const packetSha256 = sha256Hex(serializeShowPackResearchIntakePacket(packet))
  const decisionsSha256 = sha256Hex(serializeShowPackResearchIntakeDecisions(decisionsInput))
  const sourceRows = new Map(records(decisions.sources, 'research intake source decisions')
    .map((row) => [String(row.source_id), row]))
  const claimRows = new Map(records(decisions.claims, 'research intake claim decisions')
    .map((row) => [String(row.claim_id), row]))
  const candidateSources = packet.sources.filter((source) => sourceRows.get(source.id)?.disposition === 'include')
    .map((source) => structuredClone(source) as ShowPackSource)
  const needsReviewSource = packet.claims.some((claim) => {
    const row = claimRows.get(claim.id)
    return row?.disposition === 'include' && claim.canon === 'screen' && row.status === 'verified'
  })
  const reviewSource: ShowPackSource = {
    id: REVIEW_SOURCE_ID,
    kind: 'operator_record',
    title: 'Reviewed predecessor recap cross-checks',
    locator: `research-intake:packet:${packetSha256}:decisions:${decisionsSha256}`,
  }
  const sources = [...candidateSources, ...(needsReviewSource ? [reviewSource] : [])]
  const claims = packet.claims.filter((claim) => claimRows.get(claim.id)?.disposition === 'include')
    .map((claim): ShowPackClaim => {
      const row = claimRows.get(claim.id) as UnknownRecord
      const crossChecks = row.approved_cross_check_claim_ids as string[]
      return {
        id: claim.id,
        canon: claim.canon,
        status: row.status as ClaimStatus,
        text: claim.text,
        source_ids: [
          ...claim.source_ids,
          ...(row.status === 'verified' && claim.canon === 'screen' && crossChecks.length > 0
            ? [REVIEW_SOURCE_ID]
            : []),
        ],
      }
    })
  return {
    result_version: 1,
    artifact: 'show-pack-research-intake',
    target: structuredClone(packet.target),
    packet_sha256: packetSha256,
    decisions_sha256: decisionsSha256,
    sources,
    claims,
  }
}

export function serializeShowPackResearchIntakeResult(result: ShowPackResearchIntakeResult): string {
  return `${JSON.stringify(result, null, 2)}\n`
}

export function assertShowPackResearchIntakeResultCurrent(input: {
  flywheelSeedRaw: string
  candidatesRaw: string
  packetRaw: string
  decisionsRaw: string
  resultRaw: string
}): ShowPackResearchIntakeResult {
  const packet = buildShowPackResearchIntakePacket(input.flywheelSeedRaw, input.candidatesRaw)
  if (serializeShowPackResearchIntakePacket(packet) !== input.packetRaw) {
    throw new Error('research intake packet is stale relative to the seed and candidates')
  }
  const decisions = parseJson(input.decisionsRaw, 'research intake decisions')
  const expected = applyShowPackResearchIntake(packet, decisions)
  if (serializeShowPackResearchIntakeDecisions(decisions) !== input.decisionsRaw) {
    throw new Error('research intake decision bytes are not canonical')
  }
  let supplied: unknown
  try { supplied = JSON.parse(input.resultRaw) } catch (error) {
    throw new Error(`research intake result is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (serializeShowPackResearchIntakeResult(expected) !== input.resultRaw
    || JSON.stringify(supplied) !== JSON.stringify(expected)) {
    throw new Error('research intake result does not match the exact reviewed artifacts')
  }
  return expected
}
