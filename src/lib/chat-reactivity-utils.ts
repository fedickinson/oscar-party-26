/**
 * chat-reactivity-utils.ts — pure utilities for chat-reactive AI companion behavior.
 *
 * Detects direct mentions, ambient triggers, and prediction-like statements
 * in human chat messages. No React. No Supabase. Unit-testable.
 */

import type { NomineeRow } from '../types/database'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StoredPrediction {
  playerName: string
  playerId: string
  text: string
  nomineeNames: string[]
  timestamp: number
}

export type AmbientTriggerType =
  | 'trash_talk'
  | 'despair'
  | 'film_opinion'
  | 'game_confusion'
  | 'ceremony_reaction'

export interface AmbientTrigger {
  type: AmbientTriggerType
  companions: string[]
  probability: number
}

// ─── Direct mention detection ─────────────────────────────────────────────────

const MENTION_MAP: [string, string][] = [
  ['meryl', 'meryl'],
  ['gloria', 'meryl'],
  ['nikki', 'nikki'],
  ['razor', 'nikki'],
  ['buddy', 'will'],
  ['academy', 'the-academy'],
]

// Patterns that detect "will" as the companion name rather than the English verb.
// Matches: "Will - ...", "Will, ...", "hey will", "will!", "@will", sentence-initial
// "Will" followed by a question or conversational phrase, etc.
const WILL_NAME_PATTERNS: RegExp[] = [
  // "Will" at the start of a sentence followed by punctuation/dash/question
  /^will[\s,\-!?.]/i,
  // "Will" preceded by @, hey, hi, yo, ask, tell, thanks, thank you, ok, okay
  /\b(?:@|hey|hi|yo|ask|tell|thanks|thank\s+you|ok|okay|oh|omg|lol)\s+will\b/i,
  // "Will" followed by question words, conversational verbs, or exclamations
  /\bwill[\s,\-]+(?:who|what|how|why|where|when|do|are|is|can|would|should|tell|help|say|think|you|i\b)/i,
  // "Will" at end of sentence or before punctuation (e.g., "what about you Will?")
  /\bwill[!?.]*$/i,
  // "Will" with a dash/comma separator (e.g., "Will - who are you?")
  /\bwill\s*[-,]\s*\w/i,
  // Direct address patterns: "right Will", "thanks Will", "love you Will"
  /\b(?:right|thanks|love|miss|agree|disagree|sure|ok|okay|yes|no|stop|please)\s+will\b/i,
  // "Will" surrounded by quotes or after colon
  /[:"']\s*will\b/i,
  // Buddy (always a name reference)
  /\bbuddy\b/i,
]

export function detectMentions(text: string): string[] {
  const lower = text.toLowerCase()
  const found = new Set<string>()
  for (const [keyword, companionId] of MENTION_MAP) {
    if (lower.includes(keyword)) found.add(companionId)
  }
  // Check "will" with name-detection heuristics to avoid false positives
  // from the common English verb
  if (!found.has('will') && WILL_NAME_PATTERNS.some((p) => p.test(text))) {
    found.add('will')
  }
  return Array.from(found)
}

// ─── Ambient trigger detection ────────────────────────────────────────────────

interface TriggerDef {
  patterns: RegExp[]
  trigger: AmbientTrigger
}

const TRIGGER_DEFS: TriggerDef[] = [
  {
    patterns: [
      /i'?m\s+(definitely|totally|clearly|absolutely|so)\s+winning/i,
      /nobody\s+can\s+stop\s+me/i,
      /this\s+is\s+my\s+year/i,
      /i\s+can'?t\s+lose/i,
      /suck\s+it/i,
      /in\s+your\s+face/i,
      /you('re|\s+are)\s+(going\s+)?down/i,
      /eat\s+it/i,
    ],
    trigger: { type: 'trash_talk', companions: ['nikki'], probability: 0.85 },
  },
  {
    patterns: [
      /i\s+give\s+up/i,
      /it'?s\s+over\s+for\s+me/i,
      /i'?m\s+so\s+far\s+behind/i,
      /no\s+chance\s+for\s+me/i,
      /i'?m\s+(done|finished|dead|toast)/i,
      /kill\s+me/i,
      /this\s+is\s+hopeless/i,
    ],
    trigger: { type: 'despair', companions: ['nikki', 'will'], probability: 0.80 },
  },
  {
    patterns: [
      /that\s+movie\s+was\s+(terrible|awful|bad|great|amazing|overrated|underrated|mid|fine|ok|okay)/i,
      /deserved\s+better/i,
      /biggest\s+snub/i,
      /should\s+have\s+won/i,
      /was\s+robbed/i,
      /love(d)?\s+that\s+(movie|film)/i,
      /hate(d)?\s+that\s+(movie|film)/i,
      /best\s+(movie|film|picture)\s+(of|this)/i,
      /overrated/i,
      /underrated/i,
      /snub/i,
    ],
    trigger: { type: 'film_opinion', companions: ['meryl'], probability: 0.80 },
  },
  {
    patterns: [
      /wait\s+how\s+does\s+scoring\s+work/i,
      /i\s+don'?t\s+understand/i,
      /what\s+just\s+happened/i,
      /how\s+do\s+(the\s+)?points/i,
      /confused/i,
      /what\s+(is|are)\s+(the\s+)?(rules|scoring|points)/i,
      /how\s+does\s+this\s+work/i,
    ],
    trigger: { type: 'game_confusion', companions: ['will'], probability: 0.85 },
  },
  {
    patterns: [
      /that\s+speech\s+was/i,
      /she'?s\s+so\s+beautiful/i,
      /this\s+is\s+boring/i,
      /that\s+was\s+(amazing|incredible|so\s+good|terrible|awful|beautiful|funny|weird|wild|crazy)/i,
      /i'?m\s+crying/i,
      /oh\s+(my\s+god|wow|no|yes)/i,
      /holy\s+(crap|cow|moly)/i,
      /what\s+a\s+(moment|speech|night|win|upset|surprise|shock)/i,
      /did\s+(you|anyone|everybody)\s+see\s+that/i,
      /can\s+you\s+believe/i,
    ],
    trigger: { type: 'ceremony_reaction', companions: ['meryl', 'will', 'nikki'], probability: 0.75 },
  },
]

// ─── Conversational catch-all ─────────────────────────────────────────────────
// Detects general questions, opinions, or conversational messages that should
// get a companion response even if they don't match specific trigger patterns.

const CONVERSATIONAL_PATTERNS: RegExp[] = [
  // Questions (any message ending with ?)
  /\?\s*$/,
  // "What do you (all|guys) think"
  /what\s+do\s+(you|y'?all|everyone)\s+think/i,
  // "Anyone" / "everybody" questions
  /\b(anyone|anybody|everyone|everybody)\b.*\?/i,
  // Opinion solicitation
  /\b(thoughts|opinions?|predictions?|hot\s+take|take)\b/i,
  // Exclamatory reactions (short excited messages)
  /^(oh|omg|lol|haha|ha|wow|whoa|no way|yes|yesss|noo+|damn|dang|whew|oof|bruh)\b/i,
  // Agreement/disagreement
  /\b(agree|disagree|exactly|right|wrong|true|false|facts|cap|no\s+cap)\b/i,
  // Laughter
  /\b(lmao|lmfao|rofl|hahaha|lolol)\b/i,
]

export function isConversationalMessage(text: string): boolean {
  return CONVERSATIONAL_PATTERNS.some((p) => p.test(text))
}

export function detectAmbientTrigger(text: string): AmbientTrigger | null {
  for (const { patterns, trigger } of TRIGGER_DEFS) {
    for (const pattern of patterns) {
      if (pattern.test(text)) return trigger
    }
  }
  // Catch-all: if the message is conversational, pick a random companion to chime in
  if (isConversationalMessage(text)) {
    const companions = ['meryl', 'nikki', 'will']
    return {
      type: 'ceremony_reaction',
      companions,
      probability: 0.55,
    }
  }
  return null
}

export function shouldFireAmbient(trigger: AmbientTrigger): boolean {
  return Math.random() < trigger.probability
}

// ─── Prediction detection ─────────────────────────────────────────────────────

const PREDICTION_PHRASES = [
  /\bwill\s+win\b/i,
  /\bis\s+winning\b/i,
  /\bgoing\s+to\s+win\b/i,
  /\bshould\s+win\b/i,
  /\bhas\s+to\s+win\b/i,
  /\bfor\s+sure\b/i,
  /\bguaranteed\b/i,
  /\bno\s+doubt\b/i,
  /\bi\s+called\s+it\b/i,
  /\bi\s+feel\s+(it|like)\b/i,
]

export function detectPrediction(text: string, nominees: NomineeRow[]): string[] {
  const hasPredictionLanguage = PREDICTION_PHRASES.some((p) => p.test(text))
  if (!hasPredictionLanguage) return []

  const lower = text.toLowerCase()
  const found: string[] = []

  for (const nominee of nominees) {
    const nameLower = nominee.name.toLowerCase()
    if (nameLower.length <= 3) continue

    if (lower.includes(nameLower)) {
      found.push(nominee.name)
      continue
    }

    // Check last name only (e.g., "Chalamet" for "Timothée Chalamet")
    const parts = nameLower.split(' ')
    const lastName = parts[parts.length - 1]
    if (lastName.length > 4 && lower.includes(lastName) && !found.includes(nominee.name)) {
      found.push(nominee.name)
    }
  }

  return found
}

// ─── Cooldown ─────────────────────────────────────────────────────────────────

export function isCooldownActive(lastResponseTime: number, cooldownMs: number): boolean {
  return Date.now() - lastResponseTime < cooldownMs
}
