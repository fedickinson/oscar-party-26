import {
  companionResponseMessageCount,
  isExactEmptyCompanionResponse,
  parseCompanionResponse,
  type CompanionMessage,
} from '../src/lib/companion-response.js'
import {
  buildGroundedBatchUser,
  buildGroundingAuditUser,
  collectGroundingFindings,
  normalizeGroundingFacts,
  type GroundingFinding,
} from '../src/lib/live-grounding.js'
import { COMPANION_IDS } from '../src/data/ai-companions.js'
import {
  parseVerdictResponse,
  type CompanionVerdict,
  type VerdictSlotContract,
} from '../src/lib/verdict-response.js'
import { containsDisallowedEmoji } from '../src/lib/generated-prose.js'
import { parseGroundingAuditResponse } from '../src/lib/grounding-response.js'

const AUDIT_SYSTEM = 'You are a strict factual auditor. No leniency for style.'
const INVALID_COMPANION_BATCH_FINDING = 'Generator response was not a valid companion message batch.'
const INVALID_VERDICT_BATCH_FINDING = 'Generator response was not a valid complete keepsake verdict batch.'

function isValidCompanionBatch(
  messages: CompanionMessage[],
  rawMessageCount: number | null,
  allowedCompanionIds: ReadonlySet<string>,
  expectedCompanionIds: readonly string[] | undefined,
  expectedDelaySeconds: readonly number[] | undefined,
): boolean {
  return rawMessageCount != null &&
    rawMessageCount >= 1 &&
    rawMessageCount <= 7 &&
    messages.length === rawMessageCount &&
    messages.every((message, index) =>
      allowedCompanionIds.has(message.companion_id) &&
      message.text.trim().length >= 1 &&
      message.text.trim().length <= 2000 &&
      Number.isInteger(message.delay_seconds) &&
      message.delay_seconds >= 0 &&
      message.delay_seconds <= 90 &&
      (index === 0
        ? message.delay_seconds === 0
        : message.delay_seconds > messages[index - 1].delay_seconds),
    ) &&
    (expectedCompanionIds == null || (
      messages.length === expectedCompanionIds.length &&
      messages.every((message, index) => message.companion_id === expectedCompanionIds[index])
    )) &&
    (expectedDelaySeconds == null || (
      messages.length === expectedDelaySeconds.length &&
      messages.every((message, index) => message.delay_seconds === expectedDelaySeconds[index])
    ))
}

export interface GroundingModelRequest {
  model: 'claude-sonnet-5' | 'claude-haiku-4-5'
  system: string
  user: string
  maxTokens: number
}

export type GroundingModelCaller = (request: GroundingModelRequest) => Promise<string>

export interface GroundedCompanionBatchResult {
  messages: CompanionMessage[]
  attempts: number
  findings: GroundingFinding[]
}

export async function groundedCompanionBatch(opts: {
  system: string
  user: string
  facts: string[]
  model?: GroundingModelRequest['model']
  maxTokens?: number
  maxRetries?: number
  allowedCompanionIds?: string[]
  expectedCompanionIds?: string[]
  expectedDelaySeconds?: number[]
  allowEmptyBatch?: boolean
  caller: GroundingModelCaller
}): Promise<GroundedCompanionBatchResult> {
  const {
    system,
    user,
    facts,
    model = 'claude-sonnet-5',
    maxTokens = 700,
    maxRetries = 2,
    allowedCompanionIds,
    expectedCompanionIds,
    expectedDelaySeconds,
    allowEmptyBatch = false,
    caller,
  } = opts
  if (!system.trim()) throw new Error('live grounding system prompt is required')
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 4000) {
    throw new Error('live grounding maxTokens must be an integer from 1 through 4000')
  }
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 2) {
    throw new Error('live grounding maxRetries must be an integer from 0 through 2')
  }
  const allowedIds = allowedCompanionIds ?? [...COMPANION_IDS]
  if (allowedIds.length < 1 || allowedIds.length > 7 ||
    new Set(allowedIds).size !== allowedIds.length ||
    allowedIds.some((companionId) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(companionId))) {
    throw new Error('allowed companion ids must name one to seven unique slug ids')
  }
  const allowedIdSet = new Set(allowedIds)
  if (expectedCompanionIds != null && (
    expectedCompanionIds.length < 1 ||
      expectedCompanionIds.length > 7 ||
    new Set(expectedCompanionIds).size !== expectedCompanionIds.length ||
    expectedCompanionIds.some((companionId) => !allowedIdSet.has(companionId))
  )) {
    throw new Error('expected companion ids must name one to seven unique cast members')
  }
  if (expectedDelaySeconds != null && (
    expectedDelaySeconds.length < 1 ||
      expectedDelaySeconds.length > 7 ||
    expectedDelaySeconds.some((delay, index) =>
      !Number.isInteger(delay) ||
      delay < 0 ||
      delay > 90 ||
      (index === 0 ? delay !== 0 : delay <= expectedDelaySeconds[index - 1])
    ) ||
    (expectedCompanionIds != null &&
      expectedDelaySeconds.length !== expectedCompanionIds.length)
  )) {
    throw new Error('expected delays must be one to seven strictly increasing integers from 0 through 90, starting at zero and matching the expected cast')
  }
  const normalizedFacts = normalizeGroundingFacts(facts)
  let findings: GroundingFinding[] = []
  let messages: CompanionMessage[] = []

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const raw = await caller({
      model,
      system,
      user: buildGroundedBatchUser(user, normalizedFacts, findings),
      maxTokens,
    })
    const rawMessageCount = companionResponseMessageCount(raw)
    messages = parseCompanionResponse(raw, allowedCompanionIds == null)
    if (allowEmptyBatch && isExactEmptyCompanionResponse(raw)) {
      return { messages: [], attempts: attempt, findings: [] }
    } else if (!isValidCompanionBatch(
      messages,
      rawMessageCount,
      allowedIdSet,
      expectedCompanionIds,
      expectedDelaySeconds,
    )) {
      messages = []
      findings = [{
        companion_id: 'batch',
        text: '',
        violations: [INVALID_COMPANION_BATCH_FINDING],
      }]
    } else {
      messages = messages.map((message) => ({ ...message, text: message.text.trim() }))
      const audits = await Promise.all(messages.map(async (message) => ({
        companion_id: message.companion_id,
        raw: await caller({
          model: 'claude-sonnet-5',
          system: AUDIT_SYSTEM,
          user: buildGroundingAuditUser(message.text, normalizedFacts),
          maxTokens: 300,
        }),
      })))
      findings = collectGroundingFindings(messages, audits)
    }
    if (findings.length === 0 || attempt === maxRetries + 1) {
      return { messages, attempts: attempt, findings }
    }
  }

  throw new Error('live grounding exhausted an unreachable attempt state')
}

export interface GroundedVerdictBatchResult {
  verdicts: CompanionVerdict[]
  attempts: number
  findings: GroundingFinding[]
  attemptedMessages: CompanionMessage[]
}

function exactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value)
  return actual.length === keys.length && keys.every((key) => actual.includes(key))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function strictVerdictEnvelope(raw: string): boolean {
  if (containsDisallowedEmoji(raw)) return false
  const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
  try {
    const parsed: unknown = JSON.parse(cleaned)
    if (!isRecord(parsed) || !exactKeys(parsed, ['verdicts']) || !Array.isArray(parsed.verdicts)) {
      return false
    }
    return parsed.verdicts.every((verdict) => {
      if (!isRecord(verdict) ||
        !exactKeys(verdict, ['slot', 'title', 'text', 'highlights', 'imagery']) ||
        typeof verdict.slot !== 'number' ||
        typeof verdict.title !== 'string' ||
        typeof verdict.text !== 'string' ||
        !Array.isArray(verdict.highlights) ||
        !Array.isArray(verdict.imagery)) return false
      return verdict.highlights.every((highlight) =>
        isRecord(highlight) &&
        exactKeys(highlight, ['message_id', 'note']) &&
        typeof highlight.message_id === 'string' &&
        typeof highlight.note === 'string',
      ) && verdict.imagery.every((image) =>
        isRecord(image) &&
        exactKeys(image, ['slot', 'slug', 'note']) &&
        typeof image.slot === 'string' &&
        typeof image.slug === 'string' &&
        typeof image.note === 'string',
      )
    })
  } catch {
    return false
  }
}

function validVerdictContracts(contracts: VerdictSlotContract[]): boolean {
  return contracts.length >= 1 &&
    contracts.length <= 7 &&
    new Set(contracts.map((contract) => contract.playerId)).size === contracts.length &&
    contracts.every((contract, index) =>
      contract.slot === index + 1 &&
      contract.playerId.trim().length > 0 && contract.playerId.length <= 100 &&
      COMPANION_IDS.has(contract.companionId) &&
      new Set(contract.allowedMessageIds).size === contract.allowedMessageIds.length &&
      contract.allowedMessageIds.every((id) => id.trim().length > 0 && id.length <= 100) &&
      new Set(contract.allowedImageSlugs).size === contract.allowedImageSlugs.length &&
      contract.allowedImageSlugs.every((slug) => slug.trim().length > 0 && slug.length <= 100),
    )
}

function isValidVerdictBatch(
  verdicts: CompanionVerdict[],
  contracts: VerdictSlotContract[],
): boolean {
  if (verdicts.length !== contracts.length) return false
  const titles = new Set<string>()
  return verdicts.every((verdict, index) => {
    const contract = contracts[index]
    const title = verdict.title.trim()
    const normalizedTitle = title.toLowerCase()
    const highlightIds = verdict.highlights.map((highlight) => highlight.messageId)
    const imageSlots = verdict.imagery.map((image) => image.slot)
    const imageSlugs = verdict.imagery.map((image) => image.slug)
    const valid = verdict.slot === contract.slot &&
      title.length >= 1 && title.length <= 80 &&
      !titles.has(normalizedTitle) &&
      verdict.text.trim().length >= 1 && verdict.text.trim().length <= 2000 &&
      verdictAuditText(verdict).length <= 2000 &&
      verdict.highlights.length <= 4 &&
      new Set(highlightIds).size === highlightIds.length &&
      verdict.highlights.every((highlight) =>
        contract.allowedMessageIds.includes(highlight.messageId) &&
        highlight.note.length <= 240,
      ) &&
      verdict.imagery.length <= 2 &&
      new Set(imageSlots).size === imageSlots.length &&
      new Set(imageSlugs).size === imageSlugs.length &&
      verdict.imagery.every((image) =>
        (image.slot === 'crest' || image.slot === 'hero') &&
        contract.allowedImageSlugs.includes(image.slug) &&
        image.note.length <= 240,
      )
    if (valid) titles.add(normalizedTitle)
    return valid
  })
}

function verdictAuditText(verdict: CompanionVerdict): string {
  return [
    `TITLE: ${verdict.title}`,
    `VERDICT: ${verdict.text}`,
    ...verdict.highlights.map((highlight) => `HIGHLIGHT NOTE: ${highlight.note}`),
    ...verdict.imagery.map((image) => `IMAGERY NOTE: ${image.note}`),
  ].join('\n')
}

export async function groundedVerdictBatch(opts: {
  system: string
  user: string
  facts: string[]
  contracts: VerdictSlotContract[]
  model?: GroundingModelRequest['model']
  maxTokens?: number
  maxRetries?: number
  caller: GroundingModelCaller
}): Promise<GroundedVerdictBatchResult> {
  const {
    system,
    user,
    facts,
    contracts,
    model = 'claude-sonnet-5',
    maxTokens = 2000,
    maxRetries = 2,
    caller,
  } = opts
  if (!system.trim()) throw new Error('verdict grounding system prompt is required')
  if (!user.trim()) throw new Error('verdict grounding user prompt is required')
  if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 4000) {
    throw new Error('verdict grounding maxTokens must be an integer from 1 through 4000')
  }
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 2) {
    throw new Error('verdict grounding maxRetries must be an integer from 0 through 2')
  }
  if (!validVerdictContracts(contracts)) {
    throw new Error('verdict grounding contracts must define one through seven ordered slots')
  }
  const normalizedFacts = normalizeGroundingFacts(facts)
  let findings: GroundingFinding[] = []
  let verdicts: CompanionVerdict[] = []
  let attemptedMessages: CompanionMessage[] = []

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const raw = await caller({
      model,
      system,
      user: buildGroundedBatchUser(user, normalizedFacts, findings),
      maxTokens,
    })
    verdicts = strictVerdictEnvelope(raw) ? parseVerdictResponse(raw) : []
    if (!isValidVerdictBatch(verdicts, contracts)) {
      verdicts = []
      attemptedMessages = []
      findings = [{
        companion_id: 'batch',
        text: '',
        violations: [INVALID_VERDICT_BATCH_FINDING],
      }]
    } else {
      attemptedMessages = verdicts.map((verdict, index) => ({
        companion_id: contracts[index].companionId,
        text: verdictAuditText(verdict),
        delay_seconds: 0,
      }))
      const audits = await Promise.all(attemptedMessages.map(async (message) => ({
        message,
        violations: parseGroundingAuditResponse(await caller({
          model: 'claude-sonnet-5',
          system: AUDIT_SYSTEM,
          user: buildGroundingAuditUser(message.text, normalizedFacts),
          maxTokens: 300,
        })),
      })))
      findings = audits.flatMap(({ message, violations }): GroundingFinding[] =>
        violations.length === 0
          ? []
          : [{ companion_id: message.companion_id, text: message.text, violations }],
      )
    }
    if (findings.length === 0 || attempt === maxRetries + 1) {
      return { verdicts, attempts: attempt, findings, attemptedMessages }
    }
  }

  throw new Error('verdict grounding exhausted an unreachable attempt state')
}
