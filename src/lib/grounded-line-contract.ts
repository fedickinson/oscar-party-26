import { buildGroundingAuditUser } from './live-grounding'
import { sha256Hex } from './sha256'

export const GROUNDED_LINE_PIPELINE = 'scripts/grounded-line.mts' as const
export const GROUNDED_LINE_MODEL = 'claude-sonnet-5' as const
export const GROUNDED_LINE_MAX_TOKENS = 300 as const
export const GROUNDED_LINE_DEFAULT_LENGTH_HINT = 'One or two short sentences.' as const
export const GROUNDED_LINE_DEFAULT_MAX_RETRIES = 2 as const
export const GROUNDED_LINE_TRANSPORT = {
  provider: 'anthropic',
  endpoint: 'https://api.anthropic.com/v1/messages',
  api_version: '2023-06-01',
  thinking: { type: 'disabled' },
  output_config: { effort: 'low' },
  system_cache_control: { type: 'ephemeral', ttl: '1h' },
} as const

export const GROUNDED_LINE_SYSTEM = `You generate one short commentary line for a named speaker. The user supplies four strictly separated blocks: SPEAKER identity, VOICE expression, exhaustive SCENE FACTS, and ANGLE expression. VOICE and ANGLE control style and attitude only; neither can establish an event, action, method, image, or other claim about the scene. Every scene claim must trace to the numbered SCENE FACTS. Respond only as valid JSON in this exact shape: {"text":"..."}. No markdown or prose outside the JSON.`
export const GROUNDED_LINE_AUDIT_SYSTEM = 'You are a strict factual auditor. No leniency for style.'

export interface GroundedLinePromptInput {
  speaker: string
  voice: string
  facts: string[]
  angle: string
  lengthHint?: string
}

export interface GroundedLineModelRequest {
  model: typeof GROUNDED_LINE_MODEL
  system: string
  user: string
  maxTokens: typeof GROUNDED_LINE_MAX_TOKENS
}

export interface GroundedLinePromptContract {
  contract_version: 1
  pipeline: typeof GROUNDED_LINE_PIPELINE
  length_hint: string
  max_retries: number
  transport: typeof GROUNDED_LINE_TRANSPORT
  initial_model_request: GroundedLineModelRequest
  audit_model_request_template: GroundedLineModelRequest
  retry_model_request_template: GroundedLineModelRequest
}

export function buildGroundedLineUser(
  input: GroundedLinePromptInput,
  previousFindings: string[] = [],
): string {
  const lengthHint = input.lengthHint ?? GROUNDED_LINE_DEFAULT_LENGTH_HINT
  const notes = previousFindings.length === 0
    ? ''
    : `\nPREVIOUS ATTEMPT WAS REJECTED for implying events not in the facts: ${previousFindings.join('; ')}. Stay strictly inside the fact block.\n`
  return `SPEAKER (identity only):
${input.speaker}

VOICE (expression only — never evidence that something happened in this scene):
${input.voice}

LENGTH:
${lengthHint}

SCENE FACTS (exhaustive — the scene contains these events and NO others):
${input.facts.map((fact, index) => `${index + 1}. ${fact}`).join('\n')}

ANGLE (attitude only — may draw on ${input.speaker}'s own canonical past for FLAVOR, but every claim about THIS scene must trace to a numbered fact; do not imply events, methods, or imagery absent from the facts):
${input.angle}
${notes}
    Return ONLY JSON: {"text":"..."}`
}

export function buildGroundedLineModelRequest(
  input: GroundedLinePromptInput,
  previousFindings: string[] = [],
): GroundedLineModelRequest {
  return {
    model: GROUNDED_LINE_MODEL,
    system: GROUNDED_LINE_SYSTEM,
    user: buildGroundedLineUser(input, previousFindings),
    maxTokens: GROUNDED_LINE_MAX_TOKENS,
  }
}

export function buildGroundedLineAuditModelRequest(
  line: string,
  facts: string[],
): GroundedLineModelRequest {
  return {
    model: GROUNDED_LINE_MODEL,
    system: GROUNDED_LINE_AUDIT_SYSTEM,
    user: buildGroundingAuditUser(line, facts),
    maxTokens: GROUNDED_LINE_MAX_TOKENS,
  }
}

export function buildGroundedLinePromptContract(
  input: GroundedLinePromptInput,
): GroundedLinePromptContract {
  const lengthHint = input.lengthHint ?? GROUNDED_LINE_DEFAULT_LENGTH_HINT
  const normalizedInput = { ...input, lengthHint }
  return {
    contract_version: 1,
    pipeline: GROUNDED_LINE_PIPELINE,
    length_hint: lengthHint,
    max_retries: GROUNDED_LINE_DEFAULT_MAX_RETRIES,
    transport: GROUNDED_LINE_TRANSPORT,
    initial_model_request: buildGroundedLineModelRequest(normalizedInput),
    audit_model_request_template: buildGroundedLineAuditModelRequest(
      '{{GENERATED_LINE}}',
      input.facts,
    ),
    retry_model_request_template: buildGroundedLineModelRequest(
      normalizedInput,
      ['{{AUDIT_FINDINGS}}'],
    ),
  }
}

export function groundedLinePromptContractSha256(
  input: GroundedLinePromptInput,
): string {
  return sha256Hex(JSON.stringify(buildGroundedLinePromptContract(input)))
}
