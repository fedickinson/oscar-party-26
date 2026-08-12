/**
 * grounded-line — generate in-character commentary that cannot drift from facts.
 *
 * BORN FROM A REAL FAILURE (the Cersei line, replay night): a prompt carrying
 * one clause of scene-fact and two clauses of character-resonance produced a
 * line whose frame implied an event that never happened. Salience beat
 * specificity — the third instance of that mode in one night (a player declared
 * a beat from its title; the maester wrote a chronicle entry from a beat name;
 * the model wrote commentary from a casting angle).
 *
 * THE CONTRACT, now enforced in code rather than remembered in prompts:
 *   1. Facts arrive as an exhaustive, numbered block. The prompt states that
 *      the character's OWN canon may color attitude but every claim about THIS
 *      scene must trace to a numbered fact.
 *   2. Every generated line faces a REFUTATION PASS by a second call whose only
 *      job is to list events the line asserts or implies that are absent from
 *      the fact block. Any finding = regeneration with the findings attached.
 *
 * Usage (from any replay/generation script):
 *   import { groundedLine } from './grounded-line'
 *   const line = await groundedLine({
 *     speaker: 'cersei',
 *     voice: 'Voice: Cersei\nExpression instruction: Judge power with clipped contempt.',
 *     facts: ['Rhaenyra demanded anointment; the High Septon refused.',
 *             'Rhaenyra ORDERED the killing; Alyn of Hull carried it out with blades.',
 *             'No fire was used by anyone.'],
 *     angle: 'She knows this business intimately from her own past; what interests her is the delegation.',
 *   })
 */
import { readFileSync } from 'fs'
import {
  parseGroundedLineResponse,
} from '../src/lib/grounding-response.js'
import {
  collectGroundingFindings,
} from '../src/lib/live-grounding.js'
import {
  buildGroundedLineAuditModelRequest,
  buildGroundedLineModelRequest,
  GROUNDED_LINE_DEFAULT_LENGTH_HINT,
  GROUNDED_LINE_DEFAULT_MAX_RETRIES,
  GROUNDED_LINE_TRANSPORT,
} from '../src/lib/grounded-line-contract.js'
import {
  groundedCompanionBatch,
  type GroundingModelCaller,
  type GroundingModelRequest,
} from '../api/_grounding.js'
export { groundedCompanionBatch }
export type { GroundingModelCaller, GroundingModelRequest }

let cachedOperatorKey: string | null = null

function operatorKey(): string {
  if (cachedOperatorKey) return cachedOperatorKey
  const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
  const keyLine = env.split('\n').find((line) => line.startsWith('ANTHROPIC_API_KEY='))
  if (!keyLine) throw new Error('.env.local is missing ANTHROPIC_API_KEY')
  cachedOperatorKey = keyLine.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '')
  return cachedOperatorKey
}

const call: GroundingModelCaller = async ({ model, system, user, maxTokens }) => {
  const r = await fetch(GROUNDED_LINE_TRANSPORT.endpoint, {
    method: 'POST',
    headers: {
      'x-api-key': operatorKey(),
      'anthropic-version': GROUNDED_LINE_TRANSPORT.api_version,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model, max_tokens: maxTokens,
      thinking: GROUNDED_LINE_TRANSPORT.thinking,
      output_config: GROUNDED_LINE_TRANSPORT.output_config,
      system: [{
        type: 'text',
        text: system,
        cache_control: GROUNDED_LINE_TRANSPORT.system_cache_control,
      }],
      messages: [{ role: 'user', content: user }],
    }),
  })
  const d = await r.json() as { content?: Array<{ type?: string; text?: string }> }
  if (!r.ok) {
    throw new Error(`Anthropic request failed (${r.status}): ${JSON.stringify(d).slice(0, 300)}`)
  }
  return ((d.content ?? []).find((b: { type?: string }) => b.type === 'text')?.text ?? '') as string
}

export async function verifyGrounding(
  line: string,
  facts: string[],
  caller: GroundingModelCaller = call,
): Promise<string[]> {
  const raw = await caller(buildGroundedLineAuditModelRequest(line, facts))
  return collectGroundingFindings(
    [{ companion_id: 'line', text: line, delay_seconds: 0 }],
    [{ companion_id: 'line', raw }],
  )[0]?.violations ?? []
}

export async function groundedLine(opts: {
  speaker: string
  voice: string
  facts: string[]
  angle: string
  lengthHint?: string
  maxRetries?: number
  caller?: GroundingModelCaller
}): Promise<{ text: string; attempts: number; lastViolations: string[] }> {
  const {
    speaker,
    voice,
    facts,
    angle,
    lengthHint = GROUNDED_LINE_DEFAULT_LENGTH_HINT,
    maxRetries = GROUNDED_LINE_DEFAULT_MAX_RETRIES,
    caller = call,
  } = opts
  if (!Number.isInteger(maxRetries) || maxRetries < 0) throw new Error('maxRetries must be a non-negative integer')
  if (!speaker.trim()) throw new Error('speaker is required')
  if (!voice.trim()) throw new Error('voice is required')
  let previousFindings: string[] = []
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    const raw = await caller(buildGroundedLineModelRequest({
      speaker,
      voice,
      facts,
      angle,
      lengthHint,
    }, previousFindings))
    const text = parseGroundedLineResponse(raw, speaker)
    if (text === null) continue
    const violations = await verifyGrounding(text, facts, caller)
    if (violations.length === 0 || attempt === maxRetries + 1) {
      return { text, attempts: attempt, lastViolations: violations }
    }
    previousFindings = violations
  }
  throw new Error(`generator returned no parseable commentary after ${maxRetries + 1} attempts`)
}


// ── Self-test on the real failure when run directly ──────────────────────────
if (process.argv[1]?.endsWith('grounded-line.mts')) {
  const facts = [
    'Rhaenyra demanded the High Septon anoint her; he refused.',
    'Rhaenyra ordered her guards to kill the High Septon and his attendants.',
    'Alyn of Hull carried out the killings, with blades, inside the High Sept.',
    'No fire was used by anyone.',
  ]
  const badLine = 'Amateurish. You leave no septons alive to write the version where you are the villain — though I confess a professional would have used wildfire and been done with it.'
  console.log('── auditing the ORIGINAL failure-class line ──')
  console.log('violations:', await verifyGrounding(badLine, facts))
  console.log('── generating a protected replacement ──')
  const out = await groundedLine({
    speaker: 'cersei', facts,
    voice: 'Voice: Cersei\nExpression instruction: Judge political violence with clipped contempt.',
    angle: 'She has intimate personal history with destroyed septs; what interests her here is the DELEGATION — a queen ordering it done by another\'s hand — and the naivety of thinking belief dies with the priest.',
  })
  console.log(`attempts=${out.attempts} violations=${JSON.stringify(out.lastViolations)}`)
  console.log(out.text)
}
