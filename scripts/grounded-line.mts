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
 *     facts: ['Rhaenyra demanded anointment; the High Septon refused.',
 *             'Rhaenyra ORDERED the killing; Alyn of Hull carried it out with blades.',
 *             'No fire was used by anyone.'],
 *     angle: 'She knows this business intimately from her own past; what interests her is the delegation.',
 *   })
 */
import { readFileSync } from 'fs'

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const KEY = env.split('\n').find((l) => l.startsWith('VITE_ANTHROPIC_API_KEY='))!.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '')
const promptsSrc = readFileSync(new URL('../src/lib/companion-prompts.ts', import.meta.url), 'utf8')
const SYSTEM = promptsSrc.match(/const SHARED_SYSTEM = `([\s\S]*?)`\n\n/)?.[1] ?? ''

async function call(system: string, user: string, maxTokens = 300): Promise<string> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-5', max_tokens: maxTokens,
      thinking: { type: 'disabled' }, output_config: { effort: 'low' },
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral', ttl: '1h' } }],
      messages: [{ role: 'user', content: user }],
    }),
  })
  const d = await r.json()
  return ((d.content ?? []).find((b: { type?: string }) => b.type === 'text')?.text ?? '') as string
}

export async function verifyGrounding(line: string, facts: string[]): Promise<string[]> {
  const user = `FACTS (exhaustive — nothing else happened in this scene):
${facts.map((f, i) => `${i + 1}. ${f}`).join('\n')}

LINE OF COMMENTARY:
"${line}"

Your only job is refutation. List every event, action, or method that this line ASSERTS OR IMPLIES occurred in the scene but which is not in the FACTS — including implications carried by framing or comparison (e.g. a line framed around burning implies fire). A speaker's attitude, opinions, or references to their OWN separate past are NOT violations; only claims about this scene count. Restating, paraphrasing, or drawing a judgment from a listed fact (including who ordered vs who executed, when both are listed) is NOT a violation — only the introduction of events, methods, or imagery absent from the list.

Return ONLY JSON: {"violations":["..."]} — empty array if fully grounded.`
  const raw = await call('You are a strict factual auditor. No leniency for style.', user, 300)
  try { return JSON.parse(raw.slice(raw.indexOf('{'))).violations ?? [] } catch { return ['auditor parse failure — treat as violation'] }
}

export async function groundedLine(opts: {
  speaker: string
  facts: string[]
  angle: string
  lengthHint?: string
  maxRetries?: number
}): Promise<{ text: string; attempts: number; lastViolations: string[] }> {
  const { speaker, facts, angle, lengthHint = 'One or two short sentences.', maxRetries = 2 } = opts
  let notes = ''
  for (let attempt = 1; ; attempt++) {
    const user = `${speaker.toUpperCase()} comments on a scene. ${lengthHint}

FACTS (exhaustive — the scene contains these events and NO others):
${facts.map((f, i) => `${i + 1}. ${f}`).join('\n')}

ANGLE (attitude only — may draw on ${speaker}'s own canonical past for FLAVOR, but every claim about THIS scene must trace to a numbered fact; do not imply events, methods, or imagery absent from the facts):
${angle}
${notes}
Return ONLY JSON: {"text":"..."}`
    const raw = await call(SYSTEM, user, 300)
    let text = ''
    try {
      const parsed = JSON.parse(raw.slice(raw.indexOf('{')))
      // SHARED_SYSTEM enforces its own {"messages":[...]} contract and will
      // override a user-prompt format request — accept both shapes.
      text = parsed.text ?? parsed.messages?.[0]?.text ?? ''
    } catch { continue }
    if (!text) continue
    const violations = await verifyGrounding(text, facts)
    if (violations.length === 0 || attempt > maxRetries) {
      return { text, attempts: attempt, lastViolations: violations }
    }
    notes = `\nPREVIOUS ATTEMPT WAS REJECTED for implying events not in the facts: ${violations.join('; ')}. Stay strictly inside the fact block.\n`
  }
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
    angle: 'She has intimate personal history with destroyed septs; what interests her here is the DELEGATION — a queen ordering it done by another\'s hand — and the naivety of thinking belief dies with the priest.',
  })
  console.log(`attempts=${out.attempts} violations=${JSON.stringify(out.lastViolations)}`)
  console.log(out.text)
}
