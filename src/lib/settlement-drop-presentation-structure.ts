import type { SettlementDropAssetSourceSeal } from './settlement-drop-asset-extraction'
import type { SealedTextArtifact } from './settlement-drop-asset-semantics'
import { sha256Hex } from './sha256'

type UnknownRecord = Record<string, unknown>

export type SettlementDropObservedSlideKind =
  | 'opening'
  | 'muster'
  | 'act_divider'
  | 'beat'
  | 'interstitial'
  | 'personal'
  | 'other'

export interface SettlementDropObservedSlide {
  slide_index: number
  ordinal: number
  classes: string[]
  scene_class: string | null
  kind: SettlementDropObservedSlideKind
  observed_act_ordinal: number | null
  kicker: string | null
  title: string | null
  summary: string | null
  ledger_rows: number
  beatline_group_candidate: string | null
  beatline_match_evidence: {
    shared_tokens: number
    runner_up_shared_tokens: number
  } | null
  take_group: string | null
  observed_weight_evidence: 'beat-death class' | 'betrayal title/class evidence' | null
}

export interface SettlementDropObservedAct {
  observed_act_ordinal: number
  divider_slide_index: number
  scene_class: string | null
  title: string | null
  subtitle: string | null
  beat_slide_indices: number[]
  interstitial_slide_indices: number[]
}

export interface SettlementDropPresentationStructurePacket {
  packet_version: 1
  artifact: 'settlement-drop-presentation-structure-review'
  target: { room_code: string }
  inputs: {
    ceremony: SettlementDropAssetSourceSeal
    beatlines: SettlementDropAssetSourceSeal
    takes: SettlementDropAssetSourceSeal
  }
  coverage: {
    slides: number
    acts: number
    beats: number
    interstitials: number
    beatline_groups: number
    beatline_group_candidates: number
    take_groups: number
    take_groups_mapped: number
    unresolved_beatline_groups: string[]
  }
  acts: SettlementDropObservedAct[]
  slides: SettlementDropObservedSlide[]
}

export interface SettlementDropPresentationStructureDecisionTemplate {
  decision_version: 1
  artifact: 'settlement-drop-presentation-structure-decisions'
  target: { room_code: string }
  expected_packet_sha256: string
  show: {
    title: null
    subtitle: null
    closing_title: null
    opening_eyebrow: null
    muster_title: null
    begins_label: null
    note: null
  }
  acts: Array<{
    observed_act_ordinal: number
    include: null
    id: null
    title: null
    subtitle: null
    scene: null
    interstitial_slide_index: null
    interstitial_portrait_asset: null
    note: null
  }>
  beats: Array<{
    slide_index: number
    include: null
    id: null
    kicker: null
    title: null
    summary: null
    weight: null
    portrait_asset: null
    approve_beatline_group: null
    approve_take_group: null
    note: null
  }>
}

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value
}

function validateSeal(artifact: SealedTextArtifact, label: string): SettlementDropAssetSourceSeal {
  const bytes = new TextEncoder().encode(artifact.raw).byteLength
  const digest = sha256Hex(artifact.raw)
  if (artifact.seal.bytes !== bytes || artifact.seal.sha256 !== digest) {
    throw new Error(`${label} seal does not match its bytes`)
  }
  return { name: requiredString(artifact.seal.name, `${label} seal name`), bytes, sha256: digest }
}

function parseObject(raw: string, label: string): UnknownRecord {
  const value: unknown = JSON.parse(raw)
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  return value
}

function extractJsonObject(raw: string, variable: string): UnknownRecord {
  const match = new RegExp(`\\bvar\\s+${variable}\\s*=\\s*`).exec(raw)
  if (!match) throw new Error(`ceremony variable ${variable} is missing`)
  const start = match.index + match[0].length
  if (raw[start] !== '{') throw new Error(`ceremony variable ${variable} must start with an object`)
  let depth = 0
  let inString = false
  let escaped = false
  for (let index = start; index < raw.length; index += 1) {
    const character = raw[index]
    if (inString) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') inString = false
      continue
    }
    if (character === '"') inString = true
    else if (character === '{') depth += 1
    else if (character === '}') {
      depth -= 1
      if (depth === 0) return parseObject(raw.slice(start, index + 1), `ceremony variable ${variable}`)
    }
  }
  throw new Error(`ceremony variable ${variable} is unterminated`)
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&middot;/g, ' · ')
    .replace(/&mdash;|&ndash;/g, ' — ')
    .replace(/&ldquo;|&rdquo;|&quot;/g, '"')
    .replace(/&rsquo;|&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function visibleText(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim()
}

function captureVisible(body: string, expression: RegExp): string | null {
  const match = expression.exec(body)
  if (!match) return null
  const text = visibleText(match[1])
  return text || null
}

function classifySlide(classes: string[]): SettlementDropObservedSlideKind {
  if (classes.includes('personal')) return 'personal'
  if (classes.includes('muster')) return 'muster'
  if (classes.includes('actdiv')) return 'act_divider'
  if (classes.includes('beat')) return 'beat'
  if (classes.includes('inter')) return 'interstitial'
  if (classes.includes('scene-title')) return 'opening'
  return 'other'
}

interface ParsedSlide extends SettlementDropObservedSlide {
  body: string
  text: string
}

function parseSlides(raw: string): ParsedSlide[] {
  const matches = [...raw.matchAll(/<section\b([^>]*)>([\s\S]*?)<\/section>/g)]
  if (matches.length === 0) throw new Error('ceremony has no slides')
  let actOrdinal: number | null = null
  return matches.map((match, slideIndex) => {
    const classValue = /\bclass="([^"]*)"/.exec(match[1])?.[1] ?? ''
    const classes = classValue.split(/\s+/).filter(Boolean)
    const kind = classifySlide(classes)
    if (kind === 'act_divider') actOrdinal = (actOrdinal ?? 0) + 1
    if (kind === 'beat' && actOrdinal === null) {
      throw new Error(`beat slide ${slideIndex} appears before an act divider`)
    }
    const body = match[2]
    const title = captureVisible(body, /<h[12][^>]*>([\s\S]*?)<\/h[12]>/)
    const lowerEvidence = `${classes.join(' ')} ${title ?? ''}`.toLowerCase()
    const weight = /betray/.test(lowerEvidence)
      ? 'betrayal title/class evidence'
      : classes.includes('beat-death') ? 'beat-death class' : null
    return {
      slide_index: slideIndex,
      ordinal: slideIndex + 1,
      classes,
      scene_class: classes.find((className) => className.startsWith('scene-')) ?? null,
      kind,
      observed_act_ordinal: kind === 'beat' || kind === 'interstitial' ? actOrdinal : kind === 'act_divider' ? actOrdinal : null,
      kicker: captureVisible(body, /<div class="kicker">([\s\S]*?)<\/div>/),
      title,
      summary: captureVisible(body, /<p[^>]*>([\s\S]*?)<\/p>/),
      ledger_rows: (body.match(/class="bl"/g) ?? []).length,
      beatline_group_candidate: null,
      beatline_match_evidence: null,
      take_group: null,
      observed_weight_evidence: weight,
      body,
      text: visibleText(body),
    }
  })
}

const TOKEN_STOP = new Set([
  'and', 'the', 'that', 'this', 'with', 'from', 'into', 'gets', 'again', 'draft', 'bingo',
  'targaryen', 'hightower', 'falls', 'fall', 'square', 'points', 'point', 'claimed', 'night',
])

function tokens(value: string): Set<string> {
  return new Set(value.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/).filter((token) => token.length >= 3 && !TOKEN_STOP.has(token)))
}

function beatlineText(rows: unknown[], label: string): string {
  return rows.map((unknownRow, index) => {
    if (!isRecord(unknownRow)) throw new Error(`${label} row ${index + 1} must be an object`)
    const row = unknownRow
    if (row.kind === 'draft') return [row.char, row.text, row.pts].join(' ')
    if (row.kind === 'bingo') return [row.player, row.square, row.pts].join(' ')
    if (row.kind === 'nocard') return String(row.text ?? '')
    throw new Error(`${label} row ${index + 1} has unknown kind ${String(row.kind)}`)
  }).join(' ')
}

function intersectionSize(left: Set<string>, right: Set<string>): number {
  let count = 0
  for (const token of left) if (right.has(token)) count += 1
  return count
}

function mapBeatlineGroups(slides: ParsedSlide[], rawBeatlines: UnknownRecord): string[] {
  const beats = slides.filter((slide) => slide.kind === 'beat')
  const unresolved: string[] = []
  const usedSlides = new Set<number>()
  const entries = Object.entries(rawBeatlines).sort(([left], [right]) => left.localeCompare(right, undefined, { numeric: true }))
  for (const [group, unknownRows] of entries) {
    if (!Array.isArray(unknownRows)) throw new Error(`beatline group ${group} must be an array`)
    if (unknownRows.length === 0) {
      unresolved.push(group)
      continue
    }
    const signature = tokens(beatlineText(unknownRows, `beatline group ${group}`))
    const scores = beats.map((slide) => ({
      slide,
      score: intersectionSize(signature, tokens(slide.text)),
    })).sort((left, right) => right.score - left.score || left.slide.slide_index - right.slide.slide_index)
    const best = scores[0]
    if (!best || best.score < 2) throw new Error(`beatline group ${group} has no proven ledger signature`)
    if (scores[1]?.score === best.score) throw new Error(`beatline group ${group} has ambiguous ledger signature`)
    if (usedSlides.has(best.slide.slide_index)) {
      throw new Error(`beatline group ${group} collides on slide ${best.slide.slide_index}`)
    }
    usedSlides.add(best.slide.slide_index)
    best.slide.beatline_group_candidate = group
    best.slide.beatline_match_evidence = {
      shared_tokens: best.score,
      runner_up_shared_tokens: scores[1]?.score ?? 0,
    }
  }
  return unresolved
}

function mapTakeGroups(slides: ParsedSlide[], rawTakes: UnknownRecord, ceremonyRaw: string): void {
  if (!/PUNDITS\s*\[\s*String\s*\(/.test(ceremonyRaw)) {
    throw new Error('ceremony does not prove PUNDITS keys are slide indices')
  }
  const pundits = extractJsonObject(ceremonyRaw, 'PUNDITS')
  const takeKeys = Object.keys(rawTakes).sort()
  const punditKeys = Object.keys(pundits).sort()
  for (const key of punditKeys) {
    if (!(key in rawTakes)) throw new Error(`ceremony PUNDITS key ${key} is missing from takes`)
    const pundit = pundits[key]
    if (!isRecord(pundit)) throw new Error(`ceremony PUNDITS ${key} must be an object`)
    const speaker = requiredString(pundit.name, `ceremony PUNDITS ${key}.name`)
    const rows = rawTakes[key]
    if (!Array.isArray(rows) || !rows.some((row) => isRecord(row) && row.speaker === speaker)) {
      throw new Error(`take group ${key} does not preserve ceremony speaker ${speaker}`)
    }
  }
  for (const key of takeKeys) {
    const rows = rawTakes[key]
    if (!Array.isArray(rows) || rows.length === 0) throw new Error(`take group ${key} must be a non-empty array`)
    const index = Number(key)
    if (!Number.isInteger(index) || index < 0 || index >= slides.length) {
      throw new Error(`take group ${key} is not a valid slide index`)
    }
    if (slides[index].kind !== 'beat') throw new Error(`take group ${key} does not reference a beat slide`)
    slides[index].take_group = key
  }
}

export function buildSettlementDropPresentationStructurePacket(input: {
  room_code: string
  ceremony: SealedTextArtifact
  beatlines: SealedTextArtifact
  takes: SealedTextArtifact
}): SettlementDropPresentationStructurePacket {
  const roomCode = requiredString(input.room_code, 'room_code')
  const ceremonySeal = validateSeal(input.ceremony, 'ceremony')
  const beatlinesSeal = validateSeal(input.beatlines, 'beatlines')
  const takesSeal = validateSeal(input.takes, 'takes')
  const beatlines = parseObject(input.beatlines.raw, 'beatlines')
  const takes = parseObject(input.takes.raw, 'takes')
  const slides = parseSlides(input.ceremony.raw)
  const unresolved = mapBeatlineGroups(slides, beatlines)
  mapTakeGroups(slides, takes, input.ceremony.raw)

  const dividers = slides.filter((slide) => slide.kind === 'act_divider')
  const acts = dividers.map((divider) => {
    const ordinal = divider.observed_act_ordinal as number
    return {
      observed_act_ordinal: ordinal,
      divider_slide_index: divider.slide_index,
      scene_class: divider.scene_class,
      title: divider.title,
      subtitle: divider.summary,
      beat_slide_indices: slides.filter((slide) => slide.kind === 'beat' && slide.observed_act_ordinal === ordinal)
        .map((slide) => slide.slide_index),
      interstitial_slide_indices: slides.filter((slide) => slide.kind === 'interstitial' && slide.observed_act_ordinal === ordinal)
        .map((slide) => slide.slide_index),
    }
  })
  const publicSlides = slides.map(({ body: _body, text: _text, ...slide }) => slide)
  return {
    packet_version: 1,
    artifact: 'settlement-drop-presentation-structure-review',
    target: { room_code: roomCode },
    inputs: { ceremony: ceremonySeal, beatlines: beatlinesSeal, takes: takesSeal },
    coverage: {
      slides: slides.length,
      acts: acts.length,
      beats: slides.filter((slide) => slide.kind === 'beat').length,
      interstitials: slides.filter((slide) => slide.kind === 'interstitial').length,
      beatline_groups: Object.keys(beatlines).length,
      beatline_group_candidates: Object.keys(beatlines).length - unresolved.length,
      take_groups: Object.keys(takes).length,
      take_groups_mapped: slides.filter((slide) => slide.take_group !== null).length,
      unresolved_beatline_groups: unresolved,
    },
    acts,
    slides: publicSlides,
  }
}

export function serializeSettlementDropPresentationStructurePacket(
  packet: SettlementDropPresentationStructurePacket,
): string {
  return `${JSON.stringify(packet, null, 2)}\n`
}

export function serializeSettlementDropPresentationStructureDecisionTemplate(
  packet: SettlementDropPresentationStructurePacket,
): string {
  const decision: SettlementDropPresentationStructureDecisionTemplate = {
    decision_version: 1,
    artifact: 'settlement-drop-presentation-structure-decisions',
    target: packet.target,
    expected_packet_sha256: sha256Hex(serializeSettlementDropPresentationStructurePacket(packet)),
    show: {
      title: null, subtitle: null, closing_title: null, opening_eyebrow: null,
      muster_title: null, begins_label: null, note: null,
    },
    acts: packet.acts.map((act) => ({
      observed_act_ordinal: act.observed_act_ordinal,
      include: null, id: null, title: null, subtitle: null, scene: null,
      interstitial_slide_index: null, interstitial_portrait_asset: null, note: null,
    })),
    beats: packet.slides.filter((slide) => slide.kind === 'beat').map((slide) => ({
      slide_index: slide.slide_index,
      include: null, id: null, kicker: null, title: null, summary: null, weight: null,
      portrait_asset: null, approve_beatline_group: null, approve_take_group: null, note: null,
    })),
  }
  return `${JSON.stringify(decision, null, 2)}\n`
}
