import {
  inspectSettlementDropApprovalDecisions,
  type SettlementDropApprovalDecisionStatus,
} from './settlement-drop-approval-decisions'
import type {
  SettlementDropApprovalDocket,
  SettlementDropApprovalLaneKind,
} from './settlement-drop-approval-docket'
import type { SettlementDropApprovalReviewInput } from './settlement-drop-approval-review'
import { sha256Hex } from './sha256'

type UnknownRecord = Record<string, unknown>

const LANE_ORDER: SettlementDropApprovalLaneKind[] = [
  'receipt_prerequisites',
  'player_identity',
  'asset_semantics',
  'quote_markup',
  'presentation_structure',
]

export interface SettlementDropApprovalTranscript {
  transcript_version: 1
  artifact: 'settlement-drop-approval-transcript'
  target: { room_code: string }
  docket_sha256: string
  lanes: Array<{
    kind: SettlementDropApprovalLaneKind
    packet_sha256: string
    baseline_decisions_sha256: string
    edits: Array<{ path: string; value: unknown }>
  }>
  note: string
}

export interface SettlementDropApprovalBuildResult {
  decision_raw: Record<SettlementDropApprovalLaneKind, string>
  status: Record<SettlementDropApprovalLaneKind, SettlementDropApprovalDecisionStatus>
  note: string
}

interface ParsedInput {
  docket: SettlementDropApprovalDocket
  packets: Record<SettlementDropApprovalLaneKind, UnknownRecord>
  decisions: Record<SettlementDropApprovalLaneKind, UnknownRecord>
}

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function object(value: unknown, label: string): UnknownRecord {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  return value
}

function parseObject(raw: string, label: string): UnknownRecord {
  let value: unknown
  try { value = JSON.parse(raw) } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  return object(value, label)
}

function exactKeys(value: UnknownRecord, keys: string[], label: string): void {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} fields are invalid`)
  }
}

function array(value: unknown, label: string): UnknownRecord[] {
  if (!Array.isArray(value) || value.some((row) => !isRecord(row))) {
    throw new Error(`${label} must be an array of objects`)
  }
  return value as UnknownRecord[]
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be text`)
  return value
}

function parseInput(input: SettlementDropApprovalReviewInput): ParsedInput {
  const docket = parseObject(input.docket_raw, 'approval docket') as unknown as SettlementDropApprovalDocket
  if (docket.docket_version !== 2 || docket.artifact !== 'settlement-drop-approval-docket'
    || !isRecord(docket.target) || typeof docket.target.room_code !== 'string'
    || !Array.isArray(docket.lanes)) {
    throw new Error('approval docket identity is invalid')
  }
  const packets = {} as Record<SettlementDropApprovalLaneKind, UnknownRecord>
  const decisions = {} as Record<SettlementDropApprovalLaneKind, UnknownRecord>
  for (const kind of LANE_ORDER) {
    const docketLane = docket.lanes.find((lane) => lane.kind === kind)
    if (!docketLane) throw new Error(`approval docket is missing ${kind}`)
    const packetRaw = input.packet_raw[kind]
    const decisionRaw = input.decision_raw[kind]
    if (typeof packetRaw !== 'string' || sha256Hex(packetRaw) !== docketLane.packet.sha256) {
      throw new Error(`${kind} packet does not match the docket hash`)
    }
    if (typeof decisionRaw !== 'string' || sha256Hex(decisionRaw) !== docketLane.decisions.sha256) {
      throw new Error(`${kind} decisions do not match the docket hash`)
    }
    packets[kind] = parseObject(packetRaw, `${kind} packet`)
    decisions[kind] = parseObject(decisionRaw, `${kind} decisions`)
    if (decisions[kind].expected_packet_sha256 !== sha256Hex(packetRaw)) {
      throw new Error(`${kind} decisions do not target the supplied packet hash`)
    }
  }
  inspectSettlementDropApprovalDecisions({
    room_code: docket.target.room_code,
    lanes: Object.fromEntries(LANE_ORDER.map((kind) => [kind, {
      packet: packets[kind], decisions: decisions[kind],
    }])) as Parameters<typeof inspectSettlementDropApprovalDecisions>[0]['lanes'],
  })
  return { docket, packets, decisions }
}

function editableSetters(
  kind: SettlementDropApprovalLaneKind,
  decision: UnknownRecord,
): Map<string, (value: unknown) => void> {
  const result = new Map<string, (value: unknown) => void>()
  const add = (path: string, owner: UnknownRecord, field: string): void => {
    result.set(path, (value) => { owner[field] = structuredClone(value) })
  }
  const rows = (field: string, identity: string, fields: string[]): void => {
    for (const row of array(decision[field], `${kind}.${field}`)) {
      const key = String(row[identity])
      for (const editable of fields) add(`${field}[${key}].${editable}`, row, editable)
    }
  }
  if (kind === 'player_identity') {
    rows('decisions', 'player_id', ['canonical_name', 'note'])
  } else if (kind === 'asset_semantics') {
    rows('decisions', 'asset_id', ['approved_alt_text', 'approve_structured_assignments', 'note'])
  } else if (kind === 'quote_markup') {
    rows('decisions', 'quote_key', ['approved_plain_text', 'emphasis_treatment', 'note'])
  } else if (kind === 'presentation_structure') {
    const show = object(decision.show, 'presentation_structure.show')
    for (const field of ['title', 'subtitle', 'closing_title', 'opening_eyebrow', 'muster_title', 'begins_label', 'note']) {
      add(`show.${field}`, show, field)
    }
    rows('acts', 'observed_act_ordinal', [
      'include', 'id', 'title', 'subtitle', 'scene', 'interstitial_slide_index',
      'interstitial_portrait_asset', 'note',
    ])
    rows('beats', 'slide_index', [
      'include', 'id', 'kicker', 'title', 'summary', 'weight', 'portrait_asset',
      'approve_beatline_group', 'approve_take_group', 'note',
    ])
  } else {
    const settlement = object(decision.settlement, 'receipt_prerequisites.settlement')
    for (const field of ['title', 'actor', 'bingo_mode']) add(`settlement.${field}`, settlement, field)
    rows('entries', 'entry_key', ['approved_outcome', 'warrant', 'occurred_at', 'note'])
    const bingo = object(decision.bingo, 'receipt_prerequisites.bingo')
    for (const field of ['preserve_snapshot_marks', 'warrant', 'note']) add(`bingo.${field}`, bingo, field)
    add('additional_fact_review', decision, 'additional_fact_review')
  }
  return result
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

function parseTranscript(value: unknown, input: SettlementDropApprovalReviewInput, parsed: ParsedInput): SettlementDropApprovalTranscript {
  const transcript = object(value, 'approval transcript')
  exactKeys(transcript, ['transcript_version', 'artifact', 'target', 'docket_sha256', 'lanes', 'note'], 'approval transcript')
  if (transcript.transcript_version !== 1 || transcript.artifact !== 'settlement-drop-approval-transcript') {
    throw new Error('approval transcript identity is invalid')
  }
  const target = object(transcript.target, 'approval transcript target')
  exactKeys(target, ['room_code'], 'approval transcript target')
  if (target.room_code !== parsed.docket.target.room_code) throw new Error('approval transcript room does not match')
  if (transcript.docket_sha256 !== sha256Hex(input.docket_raw)) {
    throw new Error('transcript docket hash does not match')
  }
  if (typeof transcript.note !== 'string' || !transcript.note.trim()) {
    throw new Error('approval transcript note must be text')
  }
  const lanes = array(transcript.lanes, 'approval transcript lanes')
  if (lanes.length !== LANE_ORDER.length) throw new Error('approval transcript must contain every lane once')
  for (const [index, kind] of LANE_ORDER.entries()) {
    const lane = lanes[index]
    exactKeys(lane, ['kind', 'packet_sha256', 'baseline_decisions_sha256', 'edits'], `approval transcript lane ${index + 1}`)
    if (lane.kind !== kind) throw new Error('approval transcript lanes are not in canonical order')
    if (lane.packet_sha256 !== sha256Hex(input.packet_raw[kind])) throw new Error(`${kind} transcript packet hash does not match`)
    if (lane.baseline_decisions_sha256 !== sha256Hex(input.decision_raw[kind])) {
      throw new Error(`${kind} transcript baseline hash does not match`)
    }
    const edits = array(lane.edits, `${kind} transcript edits`)
    const paths = new Set<string>()
    for (const [editIndex, edit] of edits.entries()) {
      exactKeys(edit, ['path', 'value'], `${kind} edit ${editIndex + 1}`)
      const path = text(edit.path, `${kind} edit ${editIndex + 1} path`)
      if (paths.has(path)) throw new Error(`${kind} transcript contains duplicate edit path ${path}`)
      paths.add(path)
    }
  }
  return transcript as unknown as SettlementDropApprovalTranscript
}

export function buildSettlementDropApprovalDecisions(
  input: SettlementDropApprovalReviewInput,
  transcriptInput: unknown,
): SettlementDropApprovalBuildResult {
  const parsed = parseInput(input)
  const transcript = parseTranscript(transcriptInput, input, parsed)
  const next = structuredClone(parsed.decisions)
  let editCount = 0
  for (const lane of transcript.lanes) {
    const setters = editableSetters(lane.kind, next[lane.kind])
    for (const edit of lane.edits) {
      const setter = setters.get(edit.path)
      if (!setter) throw new Error(`${lane.kind} path ${edit.path} is not an editable decision path`)
      if (canonical(valueAt(parsed.decisions[lane.kind], edit.path)) === canonical(edit.value)) {
        throw new Error(`${lane.kind} edit ${edit.path} does not change the sealed baseline`)
      }
      setter(edit.value)
      editCount += 1
    }
  }
  if (editCount === 0) throw new Error('transcript must contain at least one decision edit')
  const status = inspectSettlementDropApprovalDecisions({
    room_code: parsed.docket.target.room_code,
    lanes: Object.fromEntries(LANE_ORDER.map((kind) => [kind, {
      packet: parsed.packets[kind], decisions: next[kind],
    }])) as Parameters<typeof inspectSettlementDropApprovalDecisions>[0]['lanes'],
  })
  const decisionRaw = Object.fromEntries(LANE_ORDER.map((kind) => (
    [kind, `${JSON.stringify(next[kind], null, 2)}\n`]
  ))) as Record<SettlementDropApprovalLaneKind, string>
  return { decision_raw: decisionRaw, status, note: transcript.note.trim() }
}

function esc(value: unknown): string {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
}

function valueAt(decision: UnknownRecord, path: string): unknown {
  const direct = /^([a-z_]+)\.([a-z_]+)$/.exec(path)
  if (direct) return object(decision[direct[1]], direct[1])[direct[2]]
  if (path === 'additional_fact_review') return decision.additional_fact_review
  const row = /^([a-z_]+)\[([^\]]+)\]\.([a-z_]+)$/.exec(path)
  if (!row) throw new Error(`unsupported control path ${path}`)
  const identity = row[1] === 'decisions'
    ? (decision.artifact === 'settlement-drop-player-identity-decisions' ? 'player_id'
      : decision.artifact === 'settlement-drop-asset-semantics-decisions' ? 'asset_id' : 'quote_key')
    : row[1] === 'acts' ? 'observed_act_ordinal'
      : row[1] === 'beats' ? 'slide_index' : 'entry_key'
  const item = array(decision[row[1]], row[1]).find((candidate) => String(candidate[identity]) === row[2])
  if (!item) throw new Error(`control path ${path} has no owner`)
  return item[row[3]]
}

function control(
  kind: SettlementDropApprovalLaneKind,
  decision: UnknownRecord,
  path: string,
  label: string,
  options: { type?: 'text' | 'long' | 'json' | 'boolean' | 'integer'; values?: Array<string | number> } = {},
): string {
  const value = valueAt(decision, path)
  const type = options.type ?? 'text'
  const attributes = `class="decision" data-kind="${kind}" data-path="${esc(path)}" data-type="${type}"`
  let field: string
  if (options.values || type === 'boolean') {
    const values = options.values ?? ['true', 'false']
    field = `<select ${attributes}><option value="">Unresolved</option>${values.map((option) => {
      const optionValue = String(option)
      return `<option value="${esc(optionValue)}"${String(value) === optionValue ? ' selected' : ''}>${esc(optionValue)}</option>`
    }).join('')}</select>`
  } else if (type === 'long' || type === 'json') {
    const display = value === null ? '' : type === 'json' ? JSON.stringify(value, null, 2) : String(value)
    field = `<textarea ${attributes} rows="${type === 'json' ? 6 : 4}">${esc(display)}</textarea>`
  } else {
    field = `<input ${attributes} type="text" value="${esc(value ?? '')}">`
  }
  return `<label class="field"><span>${esc(label)}</span><code>${esc(path)}</code>${field}</label>`
}

function card(title: string, eyebrow: string, evidence: string, controls: string): string {
  return `<details class="decision-card"><summary><span><small>${esc(eyebrow)}</small><b>${esc(title)}</b></span></summary><div class="decision-body"><div class="evidence">${evidence}</div><div class="fields">${controls}</div></div></details>`
}

export function renderSettlementDropApprovalWorkbench(input: SettlementDropApprovalReviewInput): string {
  const parsed = parseInput(input)
  const playerPacket = parsed.packets.player_identity
  const assetPacket = parsed.packets.asset_semantics
  const quotePacket = parsed.packets.quote_markup
  const structurePacket = parsed.packets.presentation_structure
  const receiptPacket = parsed.packets.receipt_prerequisites
  const players = array(playerPacket.players, 'players').map((row) => card(
    String(row.snapshot_name), `Player · ${String(row.player_id)}`,
    `<p>Snapshot <b>${esc(row.snapshot_name)}</b><br>Ceremony <b>${esc(row.ceremony_name)}</b></p>`,
    control('player_identity', parsed.decisions.player_identity, `decisions[${String(row.player_id)}].canonical_name`, 'Canonical display name')
      + control('player_identity', parsed.decisions.player_identity, `decisions[${String(row.player_id)}].note`, 'Decision note', { type: 'long' }),
  )).join('')
  const assets = array(assetPacket.assets, 'assets').map((row) => {
    const uri = input.asset_data_urls[String(row.id)]
    if (!uri) throw new Error(`approval workbench is missing embedded asset ${String(row.id)}`)
    const assignments = Array.isArray(row.structured_assignments)
      ? row.structured_assignments.map((assignment) => {
        const value = object(assignment, 'asset assignment')
        return `${String(value.kind)} · ${String(value.consumer)}`
      }).join(', ') : 'None observed'
    const candidates = Array.isArray(row.candidate_alt_texts) ? row.candidate_alt_texts.join(' / ') : 'None observed'
    return card(String(row.id), 'Asset semantics',
      `<img class="portrait" src="${esc(uri)}" alt=""><p>Assignments: ${esc(assignments)}<br>Observed alt candidates: ${esc(candidates)}</p>`,
      control('asset_semantics', parsed.decisions.asset_semantics, `decisions[${String(row.id)}].approved_alt_text`, 'Approved alt text')
        + control('asset_semantics', parsed.decisions.asset_semantics, `decisions[${String(row.id)}].approve_structured_assignments`, 'Approve observed assignments', { type: 'boolean' })
        + control('asset_semantics', parsed.decisions.asset_semantics, `decisions[${String(row.id)}].note`, 'Decision note', { type: 'long' }))
  }).join('')
  const quotes = array(quotePacket.quotes, 'quotes').map((row) => card(
    String(row.speaker), `Quote · ${String(row.quote_key)}`,
    `<p>Legacy: ${esc(row.source_text)}</p><blockquote>${esc(row.plain_text_candidate)}</blockquote>`,
    control('quote_markup', parsed.decisions.quote_markup, `decisions[${String(row.quote_key)}].approved_plain_text`, 'Approved plain text', { type: 'long' })
      + control('quote_markup', parsed.decisions.quote_markup, `decisions[${String(row.quote_key)}].emphasis_treatment`, 'Emphasis treatment', { values: ['plain_text'] })
      + control('quote_markup', parsed.decisions.quote_markup, `decisions[${String(row.quote_key)}].note`, 'Decision note', { type: 'long' }),
  )).join('')
  const assetIds = array(assetPacket.assets, 'assets').map((row) => String(row.id))
  const showFields = ['title', 'subtitle', 'closing_title', 'opening_eyebrow', 'muster_title', 'begins_label']
    .map((field) => control('presentation_structure', parsed.decisions.presentation_structure, `show.${field}`, field.replace(/_/g, ' '))).join('')
    + control('presentation_structure', parsed.decisions.presentation_structure, 'show.note', 'Show note', { type: 'long' })
  const acts = array(structurePacket.acts, 'acts').map((row) => {
    const key = String(row.observed_act_ordinal)
    const base = `acts[${key}]`
    const interstitials = Array.isArray(row.interstitial_slide_indices) ? row.interstitial_slide_indices as number[] : []
    return card(String(row.title), `Observed act ${key}`,
      `<p>${esc(row.subtitle)}<br>Interstitial candidates: ${esc(interstitials.join(', ') || 'none')}</p>`,
      control('presentation_structure', parsed.decisions.presentation_structure, `${base}.include`, 'Include act', { type: 'boolean' })
        + control('presentation_structure', parsed.decisions.presentation_structure, `${base}.id`, 'Compiler ID')
        + control('presentation_structure', parsed.decisions.presentation_structure, `${base}.title`, 'Title')
        + control('presentation_structure', parsed.decisions.presentation_structure, `${base}.subtitle`, 'Subtitle')
        + control('presentation_structure', parsed.decisions.presentation_structure, `${base}.scene`, 'Scene', { values: ['title', 'keep', 'hall', 'field', 'table'] })
        + control('presentation_structure', parsed.decisions.presentation_structure, `${base}.interstitial_slide_index`, 'Interstitial slide', { type: 'integer', values: interstitials })
        + control('presentation_structure', parsed.decisions.presentation_structure, `${base}.interstitial_portrait_asset`, 'Interstitial portrait', { values: assetIds })
        + control('presentation_structure', parsed.decisions.presentation_structure, `${base}.note`, 'Decision note', { type: 'long' }))
  }).join('')
  const beats = array(structurePacket.slides, 'slides').filter((row) => row.kind === 'beat').map((row) => {
    const key = String(row.slide_index)
    const base = `beats[${key}]`
    return card(String(row.title ?? `Slide ${key}`), `Observed beat · slide ${key}`,
      `<p>${esc(row.kicker ?? '')}<br>Ledger ${esc(row.beatline_group_candidate ?? 'unresolved')} · Takes ${esc(row.take_group ?? 'none')}</p>`,
      control('presentation_structure', parsed.decisions.presentation_structure, `${base}.include`, 'Include beat', { type: 'boolean' })
        + control('presentation_structure', parsed.decisions.presentation_structure, `${base}.id`, 'Compiler ID')
        + control('presentation_structure', parsed.decisions.presentation_structure, `${base}.kicker`, 'Kicker')
        + control('presentation_structure', parsed.decisions.presentation_structure, `${base}.title`, 'Title')
        + control('presentation_structure', parsed.decisions.presentation_structure, `${base}.summary`, 'Summary', { type: 'long' })
        + control('presentation_structure', parsed.decisions.presentation_structure, `${base}.weight`, 'Weight', { values: ['ordinary', 'death', 'betrayal'] })
        + control('presentation_structure', parsed.decisions.presentation_structure, `${base}.portrait_asset`, 'Beat portrait', { values: assetIds })
        + control('presentation_structure', parsed.decisions.presentation_structure, `${base}.approve_beatline_group`, 'Approve ledger join', { type: 'boolean' })
        + control('presentation_structure', parsed.decisions.presentation_structure, `${base}.approve_take_group`, 'Approve take join', { type: 'boolean' })
        + control('presentation_structure', parsed.decisions.presentation_structure, `${base}.note`, 'Decision note', { type: 'long' }))
  }).join('')
  const settlementControls = control('receipt_prerequisites', parsed.decisions.receipt_prerequisites, 'settlement.title', 'Settlement title')
    + control('receipt_prerequisites', parsed.decisions.receipt_prerequisites, 'settlement.actor', 'Settlement actor')
    + control('receipt_prerequisites', parsed.decisions.receipt_prerequisites, 'settlement.bingo_mode', 'Bingo mode', { values: ['preserve_live', 'replace'] })
  const entries = array(receiptPacket.candidate_entries, 'candidate entries').map((row) => {
    const key = String(row.entry_key)
    const base = `entries[${key}]`
    return card(String(row.category_name), key,
      `<p>Observed winner <b>${esc(row.winner_name)}</b>${row.tie_winner_name ? ` / ${esc(row.tie_winner_name)}` : ''}<br>${esc(row.points)} points · announced ${esc(row.announced_at ?? 'unknown')}</p>`,
      control('receipt_prerequisites', parsed.decisions.receipt_prerequisites, `${base}.approved_outcome`, 'Approved outcome', { values: ['resolved', 'void'] })
        + control('receipt_prerequisites', parsed.decisions.receipt_prerequisites, `${base}.warrant`, 'Truth warrant JSON', { type: 'json' })
        + control('receipt_prerequisites', parsed.decisions.receipt_prerequisites, `${base}.occurred_at`, 'Occurred at · ISO timestamp')
        + control('receipt_prerequisites', parsed.decisions.receipt_prerequisites, `${base}.note`, 'Decision note', { type: 'long' }))
  }).join('')
  const bingoControls = control('receipt_prerequisites', parsed.decisions.receipt_prerequisites, 'bingo.preserve_snapshot_marks', 'Preserve snapshot marks', { type: 'boolean' })
    + control('receipt_prerequisites', parsed.decisions.receipt_prerequisites, 'bingo.warrant', 'Bingo warrant JSON', { type: 'json' })
    + control('receipt_prerequisites', parsed.decisions.receipt_prerequisites, 'bingo.note', 'Bingo note', { type: 'long' })
    + control('receipt_prerequisites', parsed.decisions.receipt_prerequisites, 'additional_fact_review', 'Additional facts exist beyond these candidates', { type: 'boolean' })
  const seed = {
    transcript_version: 1,
    artifact: 'settlement-drop-approval-transcript',
    target: parsed.docket.target,
    docket_sha256: sha256Hex(input.docket_raw),
    lanes: LANE_ORDER.map((kind) => ({
      kind,
      packet_sha256: sha256Hex(input.packet_raw[kind]),
      baseline_decisions_sha256: sha256Hex(input.decision_raw[kind]),
    })),
    baseline: Object.fromEntries(LANE_ORDER.flatMap((kind) => (
      [...editableSetters(kind, structuredClone(parsed.decisions[kind])).keys()].map((path) => [
        `${kind}|${path}`, valueAt(parsed.decisions[kind], path),
      ])
    ))),
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="color-scheme" content="dark"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; script-src 'unsafe-inline'; style-src 'unsafe-inline';"><title>${esc(parsed.docket.target.room_code)} approval workbench</title><style>
:root{--jet:#0c0c10;--iron:#17171c;--vellum:#e2d5b9;--madder:#8e3b2e;--beacon:#b9863f;--muted:#9a9387;--line:rgba(226,213,185,.16);--serif:Georgia,'Times New Roman',serif;--mono:'SFMono-Regular',Consolas,monospace}*{box-sizing:border-box}html{background:var(--jet);color:var(--vellum);scroll-behavior:smooth}body{margin:0;background:radial-gradient(circle at 50% 0,rgba(185,134,63,.1),transparent 28rem),var(--jet);font-family:var(--serif)}main{width:min(100%,760px);margin:auto;padding:calc(env(safe-area-inset-top) + 36px) 18px calc(env(safe-area-inset-bottom) + 150px)}.hero{padding:8vh 0 38px}.eyebrow{margin:0 0 7px;color:var(--beacon);font:700 9px/1.4 var(--mono);letter-spacing:.12em;text-transform:uppercase;overflow-wrap:anywhere}h1{font-size:clamp(44px,14vw,74px);font-weight:500;line-height:.94;margin:0 0 18px}h2{font-size:clamp(34px,10vw,52px);font-weight:500;line-height:1;margin:0 0 10px}h3{font-size:22px;margin:0 0 10px}p{line-height:1.5}.hero>p,.lane>header>p,.evidence{color:var(--muted)}.boundary{border-left:5px solid var(--madder);background:rgba(142,59,46,.12);padding:15px}.lane{padding:50px 0;border-top:1px solid var(--line)}.decision-card,.show-card{background:var(--iron);border:1px solid var(--line);margin:10px 0}.decision-card summary{min-height:56px;display:flex;align-items:center;padding:10px 14px;cursor:pointer;list-style:none}.decision-card summary::-webkit-details-marker{display:none}.decision-card summary:after{content:'+';margin-left:auto;color:var(--beacon);font:700 20px var(--mono)}.decision-card[open] summary:after{content:'−'}.decision-card summary small,.decision-card summary b{display:block}.decision-card summary small{color:var(--beacon);font:700 9px/1.4 var(--mono);text-transform:uppercase;overflow-wrap:anywhere}.decision-card summary b{font-size:18px;overflow-wrap:anywhere}.decision-body,.show-card{padding:15px}.decision-card .decision-body{border-top:1px solid var(--line)}.portrait{width:78px;height:98px;object-fit:cover;border:1px solid var(--line);float:left;margin:0 12px 8px 0}.evidence{font-size:14px}.evidence blockquote{margin:8px 0;padding-left:11px;border-left:2px solid var(--beacon);color:var(--vellum)}.fields{clear:both;display:grid;gap:12px;margin-top:16px}.field>span,.field>code{display:block}.field>span{color:var(--beacon);font:700 10px var(--mono);text-transform:uppercase}.field>code{color:var(--muted);font:9px/1.4 var(--mono);overflow-wrap:anywhere;margin:4px 0 6px}input,select,textarea{width:100%;min-height:48px;border:1px solid var(--line);border-radius:0;background:var(--jet);color:var(--vellum);padding:11px;font:16px/1.45 var(--serif)}textarea{resize:vertical}input:focus-visible,select:focus-visible,textarea:focus-visible,button:focus-visible,summary:focus-visible{outline:2px solid var(--beacon);outline-offset:2px}.warrant-help{border:1px dashed var(--line);padding:12px;color:var(--muted);font:11px/1.5 var(--mono);white-space:pre-wrap;overflow-wrap:anywhere}.attest{padding:48px 0;border-top:1px solid var(--line)}.draft-note{color:var(--muted);font-size:13px}.clear{display:block;margin-top:12px;background:transparent;color:var(--beacon)}.export{position:fixed;z-index:4;bottom:0;left:0;right:0;background:rgba(12,12,16,.97);border-top:1px solid var(--line);padding:11px 18px calc(env(safe-area-inset-bottom) + 11px)}.export-inner{width:min(100%,724px);margin:auto;display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center}.export p{margin:0;color:var(--muted);font:10px/1.4 var(--mono)}button{min-height:48px;border:1px solid var(--beacon);background:var(--beacon);color:var(--jet);padding:0 13px;font:700 10px var(--mono);text-transform:uppercase}button:disabled{background:var(--iron);border-color:var(--line);color:var(--muted)}footer{color:var(--muted);font:9px/1.6 var(--mono);overflow-wrap:anywhere}@media(min-width:620px){.fields{grid-template-columns:1fr 1fr}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
</style></head><body><main><header class="hero"><p class="eyebrow">Settlement-drop factory · ${esc(parsed.docket.target.room_code)}</p><h1>Decision workbench</h1><p>Record explicit human judgments against the sealed evidence. Blank values remain unresolved; this page never fills, validates, or publishes a decision for you.</p><div class="boundary"><strong>The canonical JSON remains the owner.</strong><p>This offline page downloads only a hash-bound edit transcript. The local builder replays those edits onto the unchanged templates and reruns every semantic guard.</p></div></header>
<section class="lane" id="identity"><header><p class="eyebrow">Lane 1</p><h2>Player identity</h2><p>Choose exact canonical display names for the proven UUID joins.</p></header>${players}</section>
<section class="lane" id="assets"><header><p class="eyebrow">Lane 2</p><h2>Asset semantics</h2><p>Approve accessible descriptions and the observed structured assignments separately.</p></header>${assets}</section>
<section class="lane" id="quotes"><header><p class="eyebrow">Lane 3</p><h2>Quote markup</h2><p>Approve plain copy only. Legacy HTML never enters the compiler.</p></header>${quotes}</section>
<section class="lane" id="structure"><header><p class="eyebrow">Lane 4</p><h2>Presentation structure</h2><p>Author the reusable ceremony grammar from the observed deck without treating observation as approval.</p></header><article class="show-card"><p class="eyebrow">Show contract</p><div class="fields">${showFields}</div></article>${acts}${beats}</section>
<section class="lane" id="receipt"><header><p class="eyebrow">Lane 5</p><h2>Receipt prerequisites</h2><p>These are research decisions, not a settlement receipt and not authority to write the room.</p></header><article class="show-card"><p class="eyebrow">Settlement envelope</p><div class="fields">${settlementControls}</div></article><p class="warrant-help">Warrant shape only; author real sources yourself:\n{&quot;verdict&quot;:&quot;true&quot;,&quot;sources&quot;:[{&quot;kind&quot;:&quot;source-kind&quot;,&quot;ref&quot;:&quot;source-reference&quot;}]}</p>${entries}<article class="show-card"><p class="eyebrow">Bingo and additional facts</p><div class="fields">${bingoControls}</div></article></section>
<section class="attest"><p class="eyebrow">Human record</p><h2>Name what you decided</h2><label class="field"><span>Specific review note</span><textarea id="note" rows="5" placeholder="Describe the evidence reviewed and the decision scope. No blanket approval."></textarea></label><p class="draft-note">Your in-progress field values are stored only in this browser, under this exact docket hash.</p><button class="clear" id="clear" type="button">Clear local draft</button></section><footer>Docket ${sha256Hex(input.docket_raw)}<br>All evidence and baseline decision bytes are sealed into the transcript.</footer></main><div class="export"><div class="export-inner"><p id="state" role="status">Make at least one explicit edit and write a review note.</p><button id="download" type="button" disabled>Download decision transcript</button></div></div><script>
(function(){'use strict';var seed=${safeJson(seed)};var fields=[].slice.call(document.querySelectorAll('.decision'));var note=document.getElementById('note');var button=document.getElementById('download');var clear=document.getElementById('clear');var state=document.getElementById('state');var storageKey='settlement-drop-approval-draft:'+seed.docket_sha256;var baseline=fields.map(function(field){return field.value});function parseField(field){var raw=field.value;if(raw.trim()==='')return null;var type=field.getAttribute('data-type');if(type==='boolean')return raw==='true';if(type==='integer')return Number(raw);if(type==='json'){try{return JSON.parse(raw)}catch(error){throw new Error('Invalid JSON at '+field.getAttribute('data-path'))}}return raw.trim()}function save(){try{localStorage.setItem(storageKey,JSON.stringify({values:fields.map(function(field){return field.value}),note:note.value}))}catch(_error){}}function restore(){try{var draft=JSON.parse(localStorage.getItem(storageKey)||'null');if(!draft||!Array.isArray(draft.values)||draft.values.length!==fields.length)return;fields.forEach(function(field,index){field.value=String(draft.values[index]==null?'':draft.values[index])});note.value=String(draft.note||'')}catch(_error){}}function read(){var edits={};seed.lanes.forEach(function(lane){edits[lane.kind]=[]});var error='';fields.forEach(function(field){if(error)return;try{var kind=field.getAttribute('data-kind');var path=field.getAttribute('data-path');var value=parseField(field);if(JSON.stringify(value)!==JSON.stringify(seed.baseline[kind+'|'+path]))edits[kind].push({path:path,value:value})}catch(reason){error=reason.message}});var count=Object.keys(edits).reduce(function(total,kind){return total+edits[kind].length},0);if(!error&&count===0)error='Make at least one explicit decision edit.';if(!error&&!note.value.trim())error='Write a specific review note.';return{error:error,count:count,transcript:{transcript_version:seed.transcript_version,artifact:seed.artifact,target:seed.target,docket_sha256:seed.docket_sha256,lanes:seed.lanes.map(function(lane){return{kind:lane.kind,packet_sha256:lane.packet_sha256,baseline_decisions_sha256:lane.baseline_decisions_sha256,edits:edits[lane.kind]}}),note:note.value.trim()}}}function update(){save();var result=read();button.disabled=!!result.error;state.textContent=result.error||result.count+' explicit edits ready for local validation.'}document.addEventListener('input',update);document.addEventListener('change',update);clear.addEventListener('click',function(){fields.forEach(function(field,index){field.value=baseline[index]});note.value='';update();try{localStorage.removeItem(storageKey)}catch(_error){}state.textContent='Local draft cleared; sealed baseline restored.'});button.addEventListener('click',function(){var result=read();if(result.error)return;var blob=new Blob([JSON.stringify(result.transcript,null,2)+'\\n'],{type:'application/json'});var href=URL.createObjectURL(blob);var link=document.createElement('a');link.href=href;link.download=seed.target.room_code.toLowerCase()+'-settlement-drop-approval-transcript.json';document.body.appendChild(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(href)},0);state.textContent='Transcript downloaded. Run the local builder before replacing any canonical decisions.'});restore();update()})();
</script></body></html>`
}
