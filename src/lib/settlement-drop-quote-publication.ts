import { containsDisallowedEmoji } from './generated-prose'
import { buildGroundedLinePromptContract } from './grounded-line-contract'
import {
  buildShowPackCommentaryBudget,
  type GroundedLineGenerator,
  type ShowPackCommentaryBudget,
} from './show-pack-commentary'
import type {
  SettlementDropQuoteFactSourceKind,
  SettlementDropQuoteGroundingPlan,
} from './settlement-drop-quote-grounding'
import {
  buildSettlementDropQuoteGroundingPlan,
  parseSettlementDropQuoteGroundingPacket,
  serializeSettlementDropQuoteGroundingPlan,
} from './settlement-drop-quote-grounding'
import type { SettlementDropQuote } from './settlement-drop'
import { sha256Hex } from './sha256'

type UnknownRecord = Record<string, unknown>

export interface SettlementDropQuoteAuthorizationTranscript {
  transcript_version: 1
  artifact: 'settlement-drop-quote-authorization-transcript'
  target: SettlementDropQuoteGroundingPlan['target']
  plan_sha256: string
  acknowledged_job_ids: string[]
  acknowledged_omission_ids: string[]
  acknowledged_budget: ShowPackCommentaryBudget
  note: string
}

export interface SettlementDropQuoteAuthorization {
  authorization_version: 1
  artifact: 'settlement-drop-quote-authorization'
  target: SettlementDropQuoteGroundingPlan['target']
  plan_sha256: string
  packet_sha256: string
  decisions_sha256: string
  authorized_job_ids: string[]
  acknowledged_omission_ids: string[]
  authorized_budget: ShowPackCommentaryBudget
  note: string
}

export interface SettlementDropQuotePublicationRecord {
  publication_version: 1
  artifact: 'settlement-drop-quote-publication'
  target: SettlementDropQuoteGroundingPlan['target']
  plan_sha256: string
  authorization_sha256: string
  packet_sha256: string
  decisions_sha256: string
  omissions: SettlementDropQuoteGroundingPlan['omissions']
  quotes: Array<{
    quote_key: string
    beat_id: string
    manifest_quote: SettlementDropQuote
    provenance: {
      prompt_contract_sha256: string
      refs: SettlementDropQuoteGroundingPlan['jobs'][number]['refs']
      fact_warrants: Array<{
        text: string
        sources: Array<{ kind: SettlementDropQuoteFactSourceKind; ref: string }>
      }>
    }
  }>
}

export type SettlementDropQuotePublicationStatus = 'pending' | 'ready' | 'blocked'

export interface SettlementDropQuotePublicationCheckpoint {
  checkpoint_version: 1
  artifact: 'settlement-drop-quote-publication-checkpoint'
  target: SettlementDropQuoteGroundingPlan['target']
  plan_sha256: string
  authorization_sha256: string
  packet_sha256: string
  decisions_sha256: string
  omissions: SettlementDropQuoteGroundingPlan['omissions']
  jobs: Array<{
    quote_key: string
    status: SettlementDropQuotePublicationStatus
    publication: SettlementDropQuotePublicationRecord['quotes'][number] | null
  }>
}

export interface SettlementDropQuotePublicationResult {
  checkpoint: SettlementDropQuotePublicationCheckpoint
  publication: SettlementDropQuotePublicationRecord | null
}

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
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

function digest(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest`)
  }
  return value
}

function records(value: unknown, label: string): UnknownRecord[] {
  if (!Array.isArray(value) || value.some((row) => !isRecord(row))) {
    throw new Error(`${label} must be an array of objects`)
  }
  return value as UnknownRecord[]
}

function strings(value: unknown, label: string, allowEmpty = false): string[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new Error(`${label} must be ${allowEmpty ? 'an' : 'a non-empty'} array`)
  }
  const result = value.map((item, index) => text(item, `${label}[${index}]`))
  if (new Set(result).size !== result.length) throw new Error(`${label} must not contain duplicates`)
  return result
}

function stringArrayPreservingDuplicates(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`)
  return value.map((item, index) => text(item, `${label}[${index}]`))
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${canonical(value[key])}`
    )).join(',')}}`
  }
  return JSON.stringify(value)
}

function sameTarget(
  expected: SettlementDropQuoteGroundingPlan['target'],
  actual: UnknownRecord,
  label: string,
): void {
  exactKeys(actual, ['room_code', 'settlement_id', 'settlement_version', 'manifest_hash'], label)
  if (actual.room_code !== expected.room_code || actual.settlement_id !== expected.settlement_id
    || actual.settlement_version !== expected.settlement_version
    || actual.manifest_hash !== expected.manifest_hash) {
    throw new Error(`${label} does not exactly match the plan target`)
  }
}

function exactStringOrder(actual: string[], expected: string[], label: string): void {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new Error(`${label} must exactly match source order`)
  }
}

function parseBudget(value: unknown, jobs: SettlementDropQuoteGroundingPlan['jobs']): ShowPackCommentaryBudget {
  if (!isRecord(value)) throw new Error('quote plan budget must be an object')
  const expected = buildShowPackCommentaryBudget(jobs.map((job) => ({
    request_id: job.quote_key,
    publication_status: 'pending' as const,
    speaker: job.speaker,
    voice: job.voice,
    facts: job.facts,
    angle: job.angle,
    prompt_contract: job.prompt_contract,
  })))
  if (canonical(value) !== canonical(expected)) throw new Error('quote plan budget is not canonical')
  return value as unknown as ShowPackCommentaryBudget
}

export function parseSettlementDropQuoteGroundingPlan(
  raw: string,
): SettlementDropQuoteGroundingPlan {
  let value: unknown
  try { value = JSON.parse(raw) } catch (error) {
    throw new Error(`quote grounding plan is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!isRecord(value)) throw new Error('quote grounding plan must be an object')
  exactKeys(value, [
    'plan_version', 'artifact', 'target', 'packet_sha256', 'decisions_sha256',
    'budget', 'omissions', 'jobs',
  ], 'quote grounding plan')
  if (value.plan_version !== 1 || value.artifact !== 'settlement-drop-quote-grounding-plan') {
    throw new Error('quote grounding plan identity is invalid')
  }
  if (!isRecord(value.target)) throw new Error('quote grounding plan target must be an object')
  const target = value.target
  exactKeys(target, ['room_code', 'settlement_id', 'settlement_version', 'manifest_hash'], 'quote grounding plan target')
  text(target.room_code, 'quote grounding plan target room_code')
  text(target.settlement_id, 'quote grounding plan target settlement_id')
  if (!Number.isInteger(target.settlement_version) || Number(target.settlement_version) < 1) {
    throw new Error('quote grounding plan settlement_version must be a positive integer')
  }
  digest(target.manifest_hash, 'quote grounding plan manifest_hash')
  digest(value.packet_sha256, 'quote grounding plan packet_sha256')
  digest(value.decisions_sha256, 'quote grounding plan decisions_sha256')
  const omissions = records(value.omissions, 'quote grounding plan omissions').map((row, index) => {
    exactKeys(row, ['quote_key', 'beat_id', 'note'], `quote grounding plan omission ${index + 1}`)
    return {
      quote_key: text(row.quote_key, `quote grounding plan omission ${index + 1}.quote_key`),
      beat_id: text(row.beat_id, `quote grounding plan omission ${index + 1}.beat_id`),
      note: text(row.note, `quote grounding plan omission ${index + 1}.note`),
    }
  })
  const jobs = records(value.jobs, 'quote grounding plan jobs').map((row, index) => {
    const label = `quote grounding plan job ${index + 1}`
    exactKeys(row, [
      'quote_key', 'beat_id', 'speaker', 'portrait_asset_id', 'refs', 'voice', 'facts',
      'fact_warrants', 'angle', 'prompt_contract',
    ], label)
    const refs = records(row.refs, `${label}.refs`).map((ref, refIndex) => {
      exactKeys(ref, ['character_id', 'name'], `${label}.refs[${refIndex}]`)
      return {
        character_id: text(ref.character_id, `${label}.refs[${refIndex}].character_id`),
        name: text(ref.name, `${label}.refs[${refIndex}].name`),
      }
    })
    if (refs.length === 0) throw new Error(`${label}.refs must not be empty`)
    const facts = strings(row.facts, `${label}.facts`)
    const factWarrants = records(row.fact_warrants, `${label}.fact_warrants`).map((fact, factIndex) => {
      exactKeys(fact, ['text', 'sources'], `${label}.fact_warrants[${factIndex}]`)
      const sources = records(fact.sources, `${label}.fact_warrants[${factIndex}].sources`).map((source, sourceIndex) => {
        exactKeys(source, ['kind', 'ref'], `${label}.fact_warrants[${factIndex}].sources[${sourceIndex}]`)
        const kind = text(source.kind, `${label}.fact_warrants[${factIndex}].sources[${sourceIndex}].kind`)
        if (!['screen_capture', 'table_testimony', 'operator_record', 'settlement_record', 'recap'].includes(kind)) {
          throw new Error(`${label}.fact_warrants[${factIndex}] contains invalid source kind ${kind}`)
        }
        return { kind: kind as SettlementDropQuoteFactSourceKind, ref: text(source.ref, `${label}.fact_warrants source ref`) }
      })
      if (sources.length === 0) throw new Error(`${label}.fact_warrants[${factIndex}].sources must not be empty`)
      return { text: text(fact.text, `${label}.fact_warrants[${factIndex}].text`), sources }
    })
    if (factWarrants.length !== facts.length
      || factWarrants.some((fact, factIndex) => fact.text !== facts[factIndex])) {
      throw new Error(`${label}.fact_warrants must exactly match facts in source order`)
    }
    const job = {
      quote_key: text(row.quote_key, `${label}.quote_key`),
      beat_id: text(row.beat_id, `${label}.beat_id`),
      speaker: text(row.speaker, `${label}.speaker`),
      portrait_asset_id: text(row.portrait_asset_id, `${label}.portrait_asset_id`),
      refs,
      voice: text(row.voice, `${label}.voice`),
      facts,
      fact_warrants: factWarrants,
      angle: text(row.angle, `${label}.angle`),
      prompt_contract: row.prompt_contract,
    }
    if (!isRecord(job.prompt_contract)
      || canonical(job.prompt_contract) !== canonical(buildGroundedLinePromptContract({
        speaker: job.speaker,
        voice: job.voice,
        facts: job.facts,
        angle: job.angle,
      }))) {
      throw new Error(`${label}.prompt_contract is not canonical`)
    }
    return job as SettlementDropQuoteGroundingPlan['jobs'][number]
  })
  const quoteKeys = [...omissions.map((row) => row.quote_key), ...jobs.map((row) => row.quote_key)]
  if (new Set(quoteKeys).size !== quoteKeys.length) throw new Error('quote grounding plan contains duplicate quote keys')
  parseBudget(value.budget, jobs)
  const noncanonicalText = (candidate: unknown): boolean => {
    if (typeof candidate === 'string') return candidate !== candidate.trim()
    if (Array.isArray(candidate)) return candidate.some(noncanonicalText)
    return isRecord(candidate) && Object.values(candidate).some(noncanonicalText)
  }
  if (noncanonicalText(value)) throw new Error('quote grounding plan contains noncanonical text')
  if (`${JSON.stringify(value, null, 2)}\n` !== raw) {
    throw new Error('quote grounding plan bytes are not canonical')
  }
  return value as unknown as SettlementDropQuoteGroundingPlan
}

/** Rebuilds the exact executable plan from the reviewed packet and human decisions. */
export function assertSettlementDropQuoteGroundingPlanCurrent(
  approvedPlanRaw: string,
  packetRaw: string,
  decisionsRaw: string,
): SettlementDropQuoteGroundingPlan {
  const packet = parseSettlementDropQuoteGroundingPacket(packetRaw)
  const rebuilt = buildSettlementDropQuoteGroundingPlan(packet, decisionsRaw)
  const rebuiltRaw = serializeSettlementDropQuoteGroundingPlan(rebuilt)
  if (rebuiltRaw !== approvedPlanRaw) {
    throw new Error('approved quote grounding plan is stale relative to the current packet and decisions')
  }
  return parseSettlementDropQuoteGroundingPlan(approvedPlanRaw)
}

function parseAuthorizationTranscript(value: unknown): SettlementDropQuoteAuthorizationTranscript {
  if (!isRecord(value)) throw new Error('quote authorization transcript must be an object')
  exactKeys(value, [
    'transcript_version', 'artifact', 'target', 'plan_sha256', 'acknowledged_job_ids',
    'acknowledged_omission_ids', 'acknowledged_budget', 'note',
  ], 'quote authorization transcript')
  if (value.transcript_version !== 1
    || value.artifact !== 'settlement-drop-quote-authorization-transcript') {
    throw new Error('quote authorization transcript identity is invalid')
  }
  if (!isRecord(value.target)) throw new Error('quote authorization transcript target must be an object')
  return value as unknown as SettlementDropQuoteAuthorizationTranscript
}

export function buildSettlementDropQuoteAuthorization(
  planRaw: string,
  transcriptValue: unknown,
): SettlementDropQuoteAuthorization {
  const plan = parseSettlementDropQuoteGroundingPlan(planRaw)
  const transcript = parseAuthorizationTranscript(transcriptValue)
  sameTarget(plan.target, transcript.target as unknown as UnknownRecord, 'quote authorization transcript target')
  if (transcript.plan_sha256 !== sha256Hex(planRaw)) {
    throw new Error('quote authorization transcript plan hash does not match')
  }
  const acknowledgedJobIds = strings(
    transcript.acknowledged_job_ids,
    'quote authorization acknowledged_job_ids',
    true,
  )
  const acknowledgedOmissionIds = strings(
    transcript.acknowledged_omission_ids,
    'quote authorization acknowledged_omission_ids',
    true,
  )
  if (transcript.acknowledged_job_ids.some((id, index) => id !== acknowledgedJobIds[index])
    || transcript.acknowledged_omission_ids.some((id, index) => id !== acknowledgedOmissionIds[index])) {
    throw new Error('quote authorization acknowledgements must be canonical')
  }
  exactStringOrder(
    acknowledgedJobIds,
    plan.jobs.map((job) => job.quote_key),
    'quote authorization job acknowledgements',
  )
  exactStringOrder(
    acknowledgedOmissionIds,
    plan.omissions.map((omission) => omission.quote_key),
    'quote authorization omission acknowledgements',
  )
  if (canonical(transcript.acknowledged_budget) !== canonical(plan.budget)) {
    throw new Error('quote authorization transcript budget does not match the plan')
  }
  return {
    authorization_version: 1,
    artifact: 'settlement-drop-quote-authorization',
    target: structuredClone(plan.target),
    plan_sha256: sha256Hex(planRaw),
    packet_sha256: plan.packet_sha256,
    decisions_sha256: plan.decisions_sha256,
    authorized_job_ids: plan.jobs.map((job) => job.quote_key),
    acknowledged_omission_ids: plan.omissions.map((omission) => omission.quote_key),
    authorized_budget: structuredClone(plan.budget),
    note: text(transcript.note, 'quote authorization note'),
  }
}

export function serializeSettlementDropQuoteAuthorization(
  authorization: SettlementDropQuoteAuthorization,
): string {
  return `${JSON.stringify(authorization, null, 2)}\n`
}

export function assertSettlementDropQuoteAuthorizationCurrent(
  planRaw: string,
  authorizationValue: unknown,
): asserts authorizationValue is SettlementDropQuoteAuthorization {
  const plan = parseSettlementDropQuoteGroundingPlan(planRaw)
  if (!isRecord(authorizationValue)) throw new Error('quote authorization must be an object')
  exactKeys(authorizationValue, [
    'authorization_version', 'artifact', 'target', 'plan_sha256', 'packet_sha256',
    'decisions_sha256', 'authorized_job_ids', 'acknowledged_omission_ids',
    'authorized_budget', 'note',
  ], 'quote authorization')
  if (authorizationValue.authorization_version !== 1
    || authorizationValue.artifact !== 'settlement-drop-quote-authorization') {
    throw new Error('quote authorization identity is invalid')
  }
  if (!isRecord(authorizationValue.target)) throw new Error('quote authorization target must be an object')
  sameTarget(plan.target, authorizationValue.target, 'quote authorization target')
  const jobIds = strings(
    authorizationValue.authorized_job_ids,
    'quote authorization authorized_job_ids',
    true,
  )
  const omissionIds = strings(
    authorizationValue.acknowledged_omission_ids,
    'quote authorization acknowledged_omission_ids',
    true,
  )
  if (authorizationValue.plan_sha256 !== sha256Hex(planRaw)
    || authorizationValue.packet_sha256 !== plan.packet_sha256
    || authorizationValue.decisions_sha256 !== plan.decisions_sha256
    || canonical(authorizationValue.authorized_budget) !== canonical(plan.budget)
    || jobIds.some((id, index) => id !== plan.jobs[index]?.quote_key)
    || jobIds.length !== plan.jobs.length
    || omissionIds.some((id, index) => id !== plan.omissions[index]?.quote_key)
    || omissionIds.length !== plan.omissions.length
    || typeof authorizationValue.note !== 'string'
    || authorizationValue.note !== authorizationValue.note.trim()
    || !authorizationValue.note
    || containsDisallowedEmoji(authorizationValue.note)) {
    throw new Error('quote authorization does not match the exact current plan')
  }
}

function parseSettlementDropQuoteAuthorizationRaw(
  planRaw: string,
  raw: string,
): SettlementDropQuoteAuthorization {
  let value: unknown
  try { value = JSON.parse(raw) } catch (error) {
    throw new Error(`quote authorization is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  assertSettlementDropQuoteAuthorizationCurrent(planRaw, value)
  if (serializeSettlementDropQuoteAuthorization(value) !== raw) {
    throw new Error('quote authorization bytes are not canonical')
  }
  return value
}

function parseFindings(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`)
  return value.map((finding, index) => text(finding, `${label}[${index}]`))
}

function assertPublicationMatchesJob(
  value: unknown,
  job: SettlementDropQuoteGroundingPlan['jobs'][number],
  status: Exclude<SettlementDropQuotePublicationStatus, 'pending'>,
): asserts value is SettlementDropQuotePublicationRecord['quotes'][number] {
  const label = `quote publication ${job.quote_key}`
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  exactKeys(value, ['quote_key', 'beat_id', 'manifest_quote', 'provenance'], label)
  if (value.quote_key !== job.quote_key || value.beat_id !== job.beat_id) {
    throw new Error(`${label} identity does not match the authorized job`)
  }

  if (!isRecord(value.manifest_quote)) throw new Error(`${label}.manifest_quote must be an object`)
  const quote = value.manifest_quote
  exactKeys(quote, ['speaker', 'portrait_asset', 'text', 'refs', 'grounding'], `${label}.manifest_quote`)
  if (quote.speaker !== job.speaker || quote.portrait_asset !== job.portrait_asset_id) {
    throw new Error(`${label}.manifest_quote identity does not match the authorized job`)
  }
  text(quote.text, `${label}.manifest_quote.text`)
  if (quote.text !== String(quote.text).trim()) {
    throw new Error(`${label}.manifest_quote.text must be canonical`)
  }
  const refs = strings(quote.refs, `${label}.manifest_quote.refs`)
  exactStringOrder(refs, job.refs.map((ref) => ref.name), `${label}.manifest_quote.refs`)
  if ((quote.refs as unknown[]).some((ref) => ref !== String(ref).trim())) {
    throw new Error(`${label}.manifest_quote.refs must be canonical`)
  }

  if (!isRecord(quote.grounding)) throw new Error(`${label}.manifest_quote.grounding must be an object`)
  const grounding = quote.grounding
  exactKeys(
    grounding,
    ['pipeline', 'fact_block', 'attempts', 'residual_findings'],
    `${label}.manifest_quote.grounding`,
  )
  if (grounding.pipeline !== 'scripts/grounded-line.mts') {
    throw new Error(`${label}.manifest_quote.grounding pipeline is invalid`)
  }
  const factBlock = strings(grounding.fact_block, `${label}.manifest_quote.grounding.fact_block`)
  exactStringOrder(factBlock, job.facts, `${label}.manifest_quote.grounding.fact_block`)
  if ((grounding.fact_block as unknown[]).some((fact) => fact !== String(fact).trim())) {
    throw new Error(`${label}.manifest_quote.grounding.fact_block must be canonical`)
  }
  if (!Number.isInteger(grounding.attempts) || Number(grounding.attempts) < 1
    || Number(grounding.attempts) > job.prompt_contract.max_retries + 1) {
    throw new Error(`${label}.manifest_quote.grounding attempts exceed the authorized contract`)
  }
  const residualFindings = stringArrayPreservingDuplicates(
    grounding.residual_findings,
    `${label}.manifest_quote.grounding.residual_findings`,
  )
  if ((grounding.residual_findings as unknown[])
    .some((finding) => finding !== String(finding).trim())) {
    throw new Error(`${label}.manifest_quote.grounding.residual_findings must be canonical`)
  }
  if ((status === 'ready' && residualFindings.length !== 0)
    || (status === 'blocked' && residualFindings.length === 0)) {
    throw new Error(`${label} status does not match its residual grounding findings`)
  }

  if (!isRecord(value.provenance)) throw new Error(`${label}.provenance must be an object`)
  exactKeys(value.provenance, ['prompt_contract_sha256', 'refs', 'fact_warrants'], `${label}.provenance`)
  if (value.provenance.prompt_contract_sha256 !== sha256Hex(JSON.stringify(job.prompt_contract))
    || canonical(value.provenance.refs) !== canonical(job.refs)
    || canonical(value.provenance.fact_warrants) !== canonical(job.fact_warrants)) {
    throw new Error(`${label}.provenance does not match the authorized job`)
  }
}

function parsePublicationCheckpoint(
  value: unknown,
  plan: SettlementDropQuoteGroundingPlan,
  planRaw: string,
  authorizationSha256: string,
): SettlementDropQuotePublicationCheckpoint {
  if (!isRecord(value)) throw new Error('quote publication checkpoint must be an object')
  exactKeys(value, [
    'checkpoint_version', 'artifact', 'target', 'plan_sha256', 'authorization_sha256',
    'packet_sha256', 'decisions_sha256', 'omissions', 'jobs',
  ], 'quote publication checkpoint')
  if (value.checkpoint_version !== 1
    || value.artifact !== 'settlement-drop-quote-publication-checkpoint') {
    throw new Error('quote publication checkpoint identity is invalid')
  }
  if (!isRecord(value.target)) throw new Error('quote publication checkpoint target must be an object')
  sameTarget(plan.target, value.target, 'quote publication checkpoint target')
  if (value.plan_sha256 !== sha256Hex(planRaw)
    || value.authorization_sha256 !== authorizationSha256
    || value.packet_sha256 !== plan.packet_sha256
    || value.decisions_sha256 !== plan.decisions_sha256
    || canonical(value.omissions) !== canonical(plan.omissions)) {
    throw new Error('quote publication checkpoint envelope does not match the current plan and authorization')
  }
  const rows = records(value.jobs, 'quote publication checkpoint jobs')
  if (rows.length !== plan.jobs.length) {
    throw new Error('quote publication checkpoint jobs do not match the current plan')
  }
  rows.forEach((row, index) => {
    const job = plan.jobs[index]
    exactKeys(row, ['quote_key', 'status', 'publication'], `quote publication checkpoint job ${index + 1}`)
    if (row.quote_key !== job.quote_key) {
      throw new Error('quote publication checkpoint jobs do not match the current plan')
    }
    if (!['pending', 'ready', 'blocked'].includes(String(row.status))) {
      throw new Error(`quote publication checkpoint job ${job.quote_key} has invalid status`)
    }
    if (row.status === 'pending') {
      if (row.publication !== null) throw new Error(`pending quote publication ${job.quote_key} cannot carry output`)
      return
    }
    assertPublicationMatchesJob(
      row.publication,
      job,
      row.status as Exclude<SettlementDropQuotePublicationStatus, 'pending'>,
    )
  })
  return value as unknown as SettlementDropQuotePublicationCheckpoint
}

export function serializeSettlementDropQuotePublicationCheckpoint(
  checkpoint: SettlementDropQuotePublicationCheckpoint,
): string {
  return `${JSON.stringify(checkpoint, null, 2)}\n`
}

export function serializeSettlementDropQuotePublication(
  publication: SettlementDropQuotePublicationRecord,
): string {
  return `${JSON.stringify(publication, null, 2)}\n`
}

export function parseSettlementDropQuotePublication(
  planRaw: string,
  authorizationRaw: string,
  publicationRaw: string,
): SettlementDropQuotePublicationRecord {
  const plan = parseSettlementDropQuoteGroundingPlan(planRaw)
  parseSettlementDropQuoteAuthorizationRaw(planRaw, authorizationRaw)
  let value: unknown
  try { value = JSON.parse(publicationRaw) } catch (error) {
    throw new Error(`quote publication is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!isRecord(value)) throw new Error('quote publication must be an object')
  exactKeys(value, [
    'publication_version', 'artifact', 'target', 'plan_sha256', 'authorization_sha256',
    'packet_sha256', 'decisions_sha256', 'omissions', 'quotes',
  ], 'quote publication')
  if (value.publication_version !== 1 || value.artifact !== 'settlement-drop-quote-publication') {
    throw new Error('quote publication identity is invalid')
  }
  if (!isRecord(value.target)) throw new Error('quote publication target must be an object')
  sameTarget(plan.target, value.target, 'quote publication target')
  if (value.plan_sha256 !== sha256Hex(planRaw)
    || value.authorization_sha256 !== sha256Hex(authorizationRaw)
    || value.packet_sha256 !== plan.packet_sha256
    || value.decisions_sha256 !== plan.decisions_sha256
    || canonical(value.omissions) !== canonical(plan.omissions)) {
    throw new Error('quote publication envelope does not match the exact plan and authorization')
  }
  const quotes = records(value.quotes, 'quote publication quotes')
  if (quotes.length !== plan.jobs.length) throw new Error('quote publication does not contain every planned job')
  quotes.forEach((quote, index) => assertPublicationMatchesJob(quote, plan.jobs[index], 'ready'))
  if (serializeSettlementDropQuotePublication(value as unknown as SettlementDropQuotePublicationRecord)
    !== publicationRaw) {
    throw new Error('quote publication bytes are not canonical')
  }
  return value as unknown as SettlementDropQuotePublicationRecord
}

export function validateSettlementDropQuotePublicationInputs(
  planRaw: string,
  authorizationRaw: string,
  checkpointValue?: SettlementDropQuotePublicationCheckpoint,
): SettlementDropQuotePublicationCheckpoint {
  const plan = parseSettlementDropQuoteGroundingPlan(planRaw)
  parseSettlementDropQuoteAuthorizationRaw(planRaw, authorizationRaw)
  const authorizationSha256 = sha256Hex(authorizationRaw)
  if (checkpointValue) {
    return structuredClone(parsePublicationCheckpoint(
      checkpointValue,
      plan,
      planRaw,
      authorizationSha256,
    ))
  }
  return {
    checkpoint_version: 1,
    artifact: 'settlement-drop-quote-publication-checkpoint',
    target: structuredClone(plan.target),
    plan_sha256: sha256Hex(planRaw),
    authorization_sha256: authorizationSha256,
    packet_sha256: plan.packet_sha256,
    decisions_sha256: plan.decisions_sha256,
    omissions: structuredClone(plan.omissions),
    jobs: plan.jobs.map((job) => ({ quote_key: job.quote_key, status: 'pending', publication: null })),
  }
}

export async function publishSettlementDropQuotes(
  planRaw: string,
  authorizationRaw: string,
  generate: GroundedLineGenerator,
  options: {
    checkpoint?: SettlementDropQuotePublicationCheckpoint
    onProgress?: (checkpoint: SettlementDropQuotePublicationCheckpoint) => void
  } = {},
): Promise<SettlementDropQuotePublicationResult> {
  const plan = parseSettlementDropQuoteGroundingPlan(planRaw)
  const authorizationSha256 = sha256Hex(authorizationRaw)
  const checkpoint = validateSettlementDropQuotePublicationInputs(
    planRaw,
    authorizationRaw,
    options.checkpoint,
  )
  for (const [index, row] of checkpoint.jobs.entries()) {
    if (row.status !== 'pending') continue
    const job = plan.jobs[index]
    const result = await generate({
      speaker: job.speaker,
      voice: job.voice,
      facts: [...job.facts],
      angle: job.angle,
    })
    const generatedText = text(result.text, `quote ${job.quote_key} generated text`)
    if (!Number.isInteger(result.attempts) || result.attempts < 1) {
      throw new Error(`quote ${job.quote_key} generator returned an invalid attempt count`)
    }
    if (!Array.isArray(result.lastViolations)
      || result.lastViolations.some((finding) => typeof finding !== 'string' || !finding.trim())) {
      throw new Error(`quote ${job.quote_key} generator returned invalid grounding findings`)
    }
    const residualFindings = stringArrayPreservingDuplicates(
      result.lastViolations,
      `quote ${job.quote_key} generator grounding findings`,
    )
    const publication: SettlementDropQuotePublicationRecord['quotes'][number] = {
      quote_key: job.quote_key,
      beat_id: job.beat_id,
      manifest_quote: {
        speaker: job.speaker,
        portrait_asset: job.portrait_asset_id,
        refs: job.refs.map((ref) => ref.name),
        text: generatedText,
        grounding: {
          pipeline: 'scripts/grounded-line.mts',
          fact_block: [...job.facts],
          attempts: result.attempts,
          residual_findings: residualFindings,
        },
      },
      provenance: {
        prompt_contract_sha256: sha256Hex(JSON.stringify(job.prompt_contract)),
        refs: structuredClone(job.refs),
        fact_warrants: structuredClone(job.fact_warrants),
      },
    }
    assertPublicationMatchesJob(
      publication,
      job,
      residualFindings.length === 0 ? 'ready' : 'blocked',
    )
    checkpoint.jobs[index] = {
      quote_key: job.quote_key,
      status: residualFindings.length === 0 ? 'ready' : 'blocked',
      publication,
    }
    options.onProgress?.(structuredClone(checkpoint))
  }
  const complete = checkpoint.jobs.every((job) => job.status === 'ready')
  return {
    checkpoint,
    publication: complete ? {
      publication_version: 1,
      artifact: 'settlement-drop-quote-publication',
      target: structuredClone(plan.target),
      plan_sha256: sha256Hex(planRaw),
      authorization_sha256: authorizationSha256,
      packet_sha256: plan.packet_sha256,
      decisions_sha256: plan.decisions_sha256,
      omissions: structuredClone(plan.omissions),
      quotes: checkpoint.jobs.map((row) => structuredClone(row.publication!)),
    } : null,
  }
}

function esc(value: unknown): string {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
}

export function renderSettlementDropQuoteAuthorizationReviewHtml(planRaw: string): string {
  const plan = parseSettlementDropQuoteGroundingPlan(planRaw)
  const planSha256 = sha256Hex(planRaw)
  const jobs = plan.jobs.map((job, index) => {
    const facts = job.fact_warrants.map((fact, factIndex) => `<li><b>${factIndex + 1}</b><span>${esc(fact.text)}</span><small>${fact.sources.map((source) => `${esc(source.kind)}: ${esc(source.ref)}`).join('<br>')}</small></li>`).join('')
    return `<section class="job"><p class="eyebrow">Job ${index + 1} of ${plan.jobs.length}</p><h2>${esc(job.quote_key)}</h2><p class="speaker">${esc(job.speaker)} · ${esc(job.beat_id)}</p><details open><summary>Reviewed prompt</summary><h3>Voice · expression only</h3><pre>${esc(job.voice)}</pre><h3>Screen facts · exhaustive</h3><ol>${facts}</ol><h3>Angle · expression only</h3><pre>${esc(job.angle)}</pre></details><details><summary>Exact execution contract</summary><pre>${esc(JSON.stringify(job.prompt_contract, null, 2))}</pre></details><label class="ack"><input type="checkbox" data-job-index="${index}"><span>I reviewed this exact job, its fact warrants and execution contract.</span></label></section>`
  }).join('')
  const omissions = plan.omissions.length === 0 ? '' : `<section><p class="eyebrow">Explicit omissions</p>${plan.omissions.map((omission, index) => `<article class="omission"><b>${esc(omission.quote_key)}</b><span>${esc(omission.note)}</span><label class="ack"><input type="checkbox" data-omission-index="${index}"><span>I acknowledge this quote will not be generated or published.</span></label></article>`).join('')}</section>`
  const seed = {
    transcript_version: 1,
    artifact: 'settlement-drop-quote-authorization-transcript',
    target: plan.target,
    plan_sha256: planSha256,
    acknowledged_budget: plan.budget,
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="dark"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';"><title>Quote generation authorization</title><style>
:root{--jet:#0c0c10;--iron:#17171c;--vellum:#e2d5b9;--madder:#8e3b2e;--beacon:#b9863f;--muted:#9a9387;--line:rgba(226,213,185,.16);--serif:Georgia,'Times New Roman',serif;--mono:'SFMono-Regular',Consolas,monospace}*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--jet);color:var(--vellum)}body{font-family:var(--serif)}main{width:min(100%,760px);margin:auto;padding:calc(env(safe-area-inset-top) + 36px) 18px calc(env(safe-area-inset-bottom) + 140px)}.hero{padding:7vh 0 40px}.eyebrow{margin:0 0 8px;color:var(--beacon);font:700 10px/1.4 var(--mono);letter-spacing:.13em;text-transform:uppercase;overflow-wrap:anywhere}h1{margin:0;font-size:clamp(42px,13vw,68px);font-weight:500;line-height:.96}h2{font-size:clamp(28px,8vw,42px);font-weight:500;margin:0 0 8px;overflow-wrap:anywhere}.hero>p{color:var(--muted);font-size:17px;line-height:1.5}.boundary{border-left:5px solid var(--madder);background:rgba(142,59,46,.12);padding:15px;margin-top:22px}.budget{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:22px}.budget div,.omission{padding:13px;border:1px solid var(--line);background:var(--iron)}.budget b{display:block;color:var(--beacon);font:700 18px var(--mono)}.budget span,.speaker,.omission span{display:block;color:var(--muted);font:11px/1.5 var(--mono);margin-top:5px;overflow-wrap:anywhere}.job{padding:42px 0;border-top:1px solid var(--line)}details{border-block:1px solid var(--line)}details+details{border-top:0}summary{min-height:48px;display:flex;align-items:center;color:var(--beacon);font:700 10px var(--mono);text-transform:uppercase}h3{color:var(--muted);font:700 9px var(--mono);text-transform:uppercase;margin:14px 0 6px}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:var(--iron);padding:12px;font:11px/1.55 var(--mono)}ol{padding:0;list-style:none}li{display:grid;grid-template-columns:24px minmax(0,1fr);gap:8px;margin:10px 0}li b{color:var(--beacon);font:10px var(--mono)}li span,li small{overflow-wrap:anywhere}li small{grid-column:2;color:var(--muted);font:10px/1.5 var(--mono)}.ack{min-height:56px;display:grid;grid-template-columns:24px minmax(0,1fr);gap:10px;align-items:center;border:1px solid var(--beacon);padding:10px;margin-top:16px;font-size:15px;line-height:1.4}input[type=checkbox]{appearance:none;width:22px;height:22px;border:1px solid var(--beacon);background:var(--jet)}input[type=checkbox]:checked:after{content:'';display:block;width:10px;height:6px;margin:5px 0 0 5px;border-left:2px solid var(--vellum);border-bottom:2px solid var(--vellum);transform:rotate(-45deg)}textarea{width:100%;min-height:110px;background:var(--iron);color:var(--vellum);border:1px solid var(--line);padding:12px;font:16px/1.5 var(--serif)}.attest{padding:42px 0;border-top:1px solid var(--line)}.export{position:fixed;left:0;right:0;bottom:0;padding:12px 18px calc(env(safe-area-inset-bottom) + 12px);background:rgba(12,12,16,.96);border-top:1px solid var(--line)}.export div{width:min(100%,724px);margin:auto;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center}.export p{margin:0;color:var(--muted);font:10px/1.4 var(--mono)}button{min-height:48px;border:1px solid var(--beacon);background:var(--beacon);padding:0 13px;font:700 10px var(--mono);text-transform:uppercase}button:disabled{background:var(--iron);border-color:var(--line);color:var(--muted)}@media(max-width:390px){.budget{grid-template-columns:1fr}}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
</style></head><body><main><header class="hero"><p class="eyebrow">Settlement drop · model authority</p><h1>Review the spend before the voice</h1><p>This document exposes the exact prompt, warrants, omissions and bounded spend.</p><div class="boundary"><b>This page cannot call a model.</b><span>It only downloads a transcript. A local builder must validate that transcript before a separate publication command can generate.</span></div><div class="budget"><div><b>${plan.budget.first_pass.total_calls_min}–${plan.budget.first_pass.total_calls_max}</b><span>first-pass calls · ${plan.budget.first_pass.max_output_tokens.toLocaleString('en-US')} output-token ceiling</span></div><div><b>${plan.budget.worst_case.total_calls_min}–${plan.budget.worst_case.total_calls_max}</b><span>worst-case calls · ${plan.budget.worst_case.max_output_tokens.toLocaleString('en-US')} output-token ceiling</span></div></div></header>${jobs}${omissions}<section class="attest"><p class="eyebrow">Final human boundary</p><label class="ack"><input id="budget" type="checkbox"><span>I reviewed the complete call and output-token ceilings, including unavailable input-token and currency estimates.</span></label><h3>Specific authorization note</h3><textarea id="note" rows="5"></textarea></section></main><div class="export"><div><p id="state">Review every item to continue.</p><button id="download" type="button" disabled>Download authorization transcript</button></div></div><script>
(function(){'use strict';var seed=${safeJson(seed)};var jobs=${safeJson(plan.jobs.map((job) => job.quote_key))};var omissions=${safeJson(plan.omissions.map((row) => row.quote_key))};var button=document.getElementById('download');var state=document.getElementById('state');function checked(attr,index){var input=document.querySelector('input['+attr+'="'+index+'"]');return input&&input.checked}function read(){var acknowledgedJobs=jobs.filter(function(_,index){return checked('data-job-index',index)});var acknowledgedOmissions=omissions.filter(function(_,index){return checked('data-omission-index',index)});var budget=document.getElementById('budget').checked;var note=document.getElementById('note').value.trim();var error=acknowledgedJobs.length!==jobs.length?'Review every generation job.':acknowledgedOmissions.length!==omissions.length?'Acknowledge every omission.':!budget?'Acknowledge the spend envelope.':!note?'Write a specific authorization note.':'';return {error:error,value:{transcript_version:seed.transcript_version,artifact:seed.artifact,target:seed.target,plan_sha256:seed.plan_sha256,acknowledged_job_ids:acknowledgedJobs,acknowledged_omission_ids:acknowledgedOmissions,acknowledged_budget:seed.acknowledged_budget,note:note}}}function update(){var result=read();button.disabled=!!result.error;state.textContent=result.error||jobs.length+' jobs ready to authorize.'}document.addEventListener('change',update);document.addEventListener('input',update);button.addEventListener('click',function(){var result=read();if(result.error)return;var blob=new Blob([JSON.stringify(result.value,null,2)+'\\n'],{type:'application/json'});var href=URL.createObjectURL(blob);var link=document.createElement('a');link.href=href;link.download=seed.target.room_code+'-quote-authorization-transcript.json';document.body.appendChild(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(href)},0)});update()})();
</script></body></html>`
}
