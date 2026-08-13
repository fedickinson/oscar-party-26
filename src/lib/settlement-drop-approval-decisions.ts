import type { SettlementDropApprovalLaneKind } from './settlement-drop-approval-docket'

type UnknownRecord = Record<string, unknown>

export interface SettlementDropApprovalDecisionInput {
  room_code: string
  lanes: Record<SettlementDropApprovalLaneKind, {
    packet: UnknownRecord
    decisions: UnknownRecord
  }>
}

export interface SettlementDropApprovalDecisionStatus {
  required_values: number
  open_values: number
  open_items: string[]
  status: 'open' | 'complete'
}

type Result = Record<SettlementDropApprovalLaneKind, SettlementDropApprovalDecisionStatus>

const DECISION_CONTRACTS: Record<SettlementDropApprovalLaneKind, {
  packetArtifact: string
  decisionArtifact: string
  topKeys: string[]
}> = {
  player_identity: {
    packetArtifact: 'settlement-drop-player-identity-review',
    decisionArtifact: 'settlement-drop-player-identity-decisions',
    topKeys: ['decision_version', 'artifact', 'target', 'expected_packet_sha256', 'decisions'],
  },
  asset_semantics: {
    packetArtifact: 'settlement-drop-asset-semantics-review',
    decisionArtifact: 'settlement-drop-asset-semantics-decisions',
    topKeys: ['decision_version', 'artifact', 'target', 'expected_packet_sha256', 'decisions'],
  },
  quote_markup: {
    packetArtifact: 'settlement-drop-quote-markup-review',
    decisionArtifact: 'settlement-drop-quote-markup-decisions',
    topKeys: ['decision_version', 'artifact', 'target', 'expected_packet_sha256', 'decisions'],
  },
  presentation_structure: {
    packetArtifact: 'settlement-drop-presentation-structure-review',
    decisionArtifact: 'settlement-drop-presentation-structure-decisions',
    topKeys: ['decision_version', 'artifact', 'target', 'expected_packet_sha256', 'show', 'acts', 'beats'],
  },
  receipt_prerequisites: {
    packetArtifact: 'settlement-drop-receipt-prerequisites-review',
    decisionArtifact: 'settlement-drop-receipt-prerequisites-decisions',
    topKeys: [
      'decision_version', 'artifact', 'target', 'expected_packet_sha256',
      'settlement', 'entries', 'bingo', 'additional_fact_review',
    ],
  },
}

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function record(value: unknown, label: string): UnknownRecord {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  return value
}

function array(value: unknown, label: string): UnknownRecord[] {
  if (!Array.isArray(value) || value.some((entry) => !isRecord(entry))) {
    throw new Error(`${label} must be an array of objects`)
  }
  return value as UnknownRecord[]
}

function exactKeys(value: UnknownRecord, keys: string[], label: string): void {
  const expected = new Set(keys)
  const unknown = Object.keys(value).find((key) => !expected.has(key))
  if (unknown) throw new Error(`${label} has unknown field ${unknown}`)
  const missing = keys.find((key) => !Object.prototype.hasOwnProperty.call(value, key))
  if (missing) throw new Error(`${label} is missing field ${missing}`)
}

function nonempty(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a non-empty string`)
  return value
}

function nullableNote(value: unknown, label: string): void {
  if (value !== null && (typeof value !== 'string' || !value.trim())) {
    throw new Error(`${label} must be a non-empty string or null`)
  }
}

function targetRoom(value: UnknownRecord, roomCode: string, label: string): void {
  const target = record(value.target, `${label}.target`)
  if (target.room_code !== roomCode) throw new Error(`${label} room does not match room_code`)
}

function sameTarget(packet: UnknownRecord, decisions: UnknownRecord, label: string): void {
  const packetTarget = record(packet.target, `${label} packet.target`)
  const decisionTarget = record(decisions.target, `${label} decisions.target`)
  const packetKeys = Object.keys(packetTarget).sort()
  const decisionKeys = Object.keys(decisionTarget).sort()
  if (JSON.stringify(packetKeys) !== JSON.stringify(decisionKeys)
    || packetKeys.some((key) => decisionTarget[key] !== packetTarget[key])) {
    throw new Error(`${label} decision target does not exactly match the packet target`)
  }
}

function validateEnvelope(
  kind: SettlementDropApprovalLaneKind,
  packet: UnknownRecord,
  decisions: UnknownRecord,
): void {
  const contract = DECISION_CONTRACTS[kind]
  if (packet.artifact !== contract.packetArtifact) throw new Error(`${kind} packet artifact is invalid`)
  exactKeys(decisions, contract.topKeys, `${kind} decisions`)
  if (decisions.decision_version !== 1) throw new Error(`${kind} decision_version must be 1`)
  if (decisions.artifact !== contract.decisionArtifact) throw new Error(`${kind} decision artifact is invalid`)
  if (typeof decisions.expected_packet_sha256 !== 'string'
    || !/^[a-f0-9]{64}$/.test(decisions.expected_packet_sha256)) {
    throw new Error(`${kind} expected_packet_sha256 must be a lowercase SHA-256 digest`)
  }
  sameTarget(packet, decisions, kind)
}

function exactIdentityRows(
  kind: SettlementDropApprovalLaneKind,
  packetRows: UnknownRecord[],
  decisionRows: UnknownRecord[],
  packetKey: string,
  decisionKey = packetKey,
): Map<string, UnknownRecord> {
  const identity = (value: unknown, label: string): string => {
    if (typeof value === 'string' && value.trim()) return value
    if (Number.isInteger(value)) return String(value)
    throw new Error(`${label} must be a non-empty string or integer`)
  }
  const expected = new Set<string>()
  for (const row of packetRows) {
    const key = identity(row[packetKey], `${kind} packet ${packetKey}`)
    if (expected.has(key)) throw new Error(`${kind} packet contains duplicate key ${key}`)
    expected.add(key)
  }
  const result = new Map<string, UnknownRecord>()
  for (const row of decisionRows) {
    const key = identity(row[decisionKey], `${kind} decision ${decisionKey}`)
    if (result.has(key)) throw new Error(`${kind} decisions contain duplicate packet key ${key}`)
    if (!expected.has(key)) throw new Error(`${kind} decisions contain unknown packet key ${key}`)
    result.set(key, row)
  }
  for (const key of expected) {
    if (!result.has(key)) throw new Error(`${kind} decisions are missing packet key ${key}`)
  }
  return result
}

function collector(): {
  required: (path: string, value: unknown, validate: (value: unknown, label: string) => void) => void
  finish: () => SettlementDropApprovalDecisionStatus
} {
  let requiredValues = 0
  const openItems: string[] = []
  return {
    required(path, value, validate) {
      requiredValues += 1
      if (value === null) openItems.push(path)
      else validate(value, path)
    },
    finish() {
      return {
        required_values: requiredValues,
        open_values: openItems.length,
        open_items: openItems,
        status: openItems.length === 0 ? 'complete' : 'open',
      }
    },
  }
}

function requiredString(value: unknown, label: string): void {
  nonempty(value, label)
}

function identifier(value: unknown, label: string): string {
  const result = nonempty(value, label)
  if (!/^[a-z0-9][a-z0-9_-]*$/i.test(result)) {
    throw new Error(`${label} must contain only letters, numbers, underscores, or hyphens`)
  }
  return result
}

function requiredBoolean(value: unknown, label: string): void {
  if (typeof value !== 'boolean') throw new Error(`${label} must be a boolean or null`)
}

function requiredEnum(allowed: readonly string[]) {
  return (value: unknown, label: string): void => {
    if (typeof value !== 'string' || !allowed.includes(value)) {
      throw new Error(`${label} must be one of ${allowed.join(', ')} or null`)
    }
  }
}

function nullableString(value: unknown, label: string): void {
  if (value !== null) requiredString(value, label)
}

function nullableTimestamp(value: unknown, label: string): void {
  if (value !== null && (typeof value !== 'string' || !value.trim() || Number.isNaN(Date.parse(value)))) {
    throw new Error(`${label} must be a valid timestamp or null`)
  }
}

function assertNull(value: unknown, label: string): void {
  if (value !== null) throw new Error(`${label} must stay null when its parent choice is false`)
}

function warrant(value: unknown, label: string): void {
  const row = record(value, label)
  exactKeys(row, ['verdict', 'sources'], label)
  if (row.verdict !== 'true') throw new Error(`${label}.verdict must be true`)
  const sources = array(row.sources, `${label}.sources`)
  if (sources.length === 0) throw new Error(`${label}.sources must not be empty`)
  for (const [index, source] of sources.entries()) {
    exactKeys(source, ['kind', 'ref'], `${label}.sources[${index}]`)
    nonempty(source.kind, `${label}.sources[${index}].kind`)
    nonempty(source.ref, `${label}.sources[${index}].ref`)
  }
}

function inspectPlayers(packet: UnknownRecord, decisions: UnknownRecord): SettlementDropApprovalDecisionStatus {
  const rows = exactIdentityRows(
    'player_identity', array(packet.players, 'player_identity packet players'),
    array(decisions.decisions, 'player_identity decisions'), 'player_id',
  )
  const collect = collector()
  const canonicalNames = new Set<string>()
  for (const [key, row] of rows) {
    exactKeys(row, ['player_id', 'canonical_name', 'note'], `player_identity ${key}`)
    collect.required(`players[${key}].canonical_name`, row.canonical_name, (value, label) => {
      if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`player_identity ${key} canonical_name must be a non-empty string or null`)
      }
      if (canonicalNames.has(value)) {
        throw new Error(`player_identity canonical_name ${value} is assigned to more than one player`)
      }
      canonicalNames.add(value)
    })
    nullableNote(row.note, `player_identity ${key} note`)
  }
  return collect.finish()
}

export function inspectSettlementDropPlayerIdentityDecisions(
  packet: UnknownRecord,
  decisions: UnknownRecord,
): SettlementDropApprovalDecisionStatus {
  const packetTarget = record(packet.target, 'player_identity packet.target')
  const roomCode = nonempty(packetTarget.room_code, 'player_identity packet.target.room_code')
  targetRoom(packet, roomCode, 'player_identity packet')
  targetRoom(decisions, roomCode, 'player_identity decisions')
  validateEnvelope('player_identity', packet, decisions)
  return inspectPlayers(packet, decisions)
}

function inspectAssets(packet: UnknownRecord, decisions: UnknownRecord): SettlementDropApprovalDecisionStatus {
  const rows = exactIdentityRows(
    'asset_semantics', array(packet.assets, 'asset_semantics packet assets'),
    array(decisions.decisions, 'asset_semantics decisions'), 'id', 'asset_id',
  )
  const collect = collector()
  for (const [key, row] of rows) {
    exactKeys(row, ['asset_id', 'approved_alt_text', 'approve_structured_assignments', 'note'], `asset_semantics ${key}`)
    collect.required(`assets[${key}].approved_alt_text`, row.approved_alt_text, requiredString)
    collect.required(`assets[${key}].approve_structured_assignments`, row.approve_structured_assignments, requiredBoolean)
    nullableNote(row.note, `asset_semantics ${key} note`)
  }
  return collect.finish()
}

export function inspectSettlementDropAssetSemanticsDecisions(
  packet: UnknownRecord,
  decisions: UnknownRecord,
): SettlementDropApprovalDecisionStatus {
  const packetTarget = record(packet.target, 'asset_semantics packet.target')
  const roomCode = nonempty(packetTarget.room_code, 'asset_semantics packet.target.room_code')
  targetRoom(packet, roomCode, 'asset_semantics packet')
  targetRoom(decisions, roomCode, 'asset_semantics decisions')
  validateEnvelope('asset_semantics', packet, decisions)
  return inspectAssets(packet, decisions)
}

function inspectQuotes(packet: UnknownRecord, decisions: UnknownRecord): SettlementDropApprovalDecisionStatus {
  const rows = exactIdentityRows(
    'quote_markup', array(packet.quotes, 'quote_markup packet quotes'),
    array(decisions.decisions, 'quote_markup decisions'), 'quote_key',
  )
  const collect = collector()
  for (const [key, row] of rows) {
    exactKeys(row, ['quote_key', 'approved_plain_text', 'emphasis_treatment', 'note'], `quote_markup ${key}`)
    collect.required(`quotes[${key}].approved_plain_text`, row.approved_plain_text, (value) => {
      const text = nonempty(value, `quote_markup ${key} approved_plain_text`)
      if (/<[^>]+>/.test(text)) throw new Error(`quote_markup ${key} approved_plain_text must not contain HTML tags`)
    })
    collect.required(`quotes[${key}].emphasis_treatment`, row.emphasis_treatment, requiredEnum(['plain_text']))
    nullableNote(row.note, `quote_markup ${key} note`)
  }
  return collect.finish()
}

export function inspectSettlementDropQuoteMarkupDecisions(
  packet: UnknownRecord,
  decisions: UnknownRecord,
): SettlementDropApprovalDecisionStatus {
  const packetTarget = record(packet.target, 'quote_markup packet.target')
  const roomCode = nonempty(packetTarget.room_code, 'quote_markup packet.target.room_code')
  targetRoom(packet, roomCode, 'quote_markup packet')
  targetRoom(decisions, roomCode, 'quote_markup decisions')
  validateEnvelope('quote_markup', packet, decisions)
  return inspectQuotes(packet, decisions)
}

function assetIds(packet: UnknownRecord): Set<string> {
  return new Set(array(packet.assets, 'asset_semantics packet assets')
    .map((asset) => nonempty(asset.id, 'asset_semantics packet asset id')))
}

function requireKnownAsset(value: unknown, label: string, assets: Set<string>): void {
  const id = nonempty(value, label)
  if (!assets.has(id)) throw new Error(`${label} references unknown asset ${id}`)
}

function inspectStructure(
  packet: UnknownRecord,
  decisions: UnknownRecord,
  assets: Set<string>,
): SettlementDropApprovalDecisionStatus {
  const packetActs = array(packet.acts, 'presentation_structure packet acts')
  const packetBeats = array(packet.slides, 'presentation_structure packet slides')
    .filter((slide) => slide.kind === 'beat')
  const acts = exactIdentityRows(
    'presentation_structure', packetActs,
    array(decisions.acts, 'presentation_structure decisions acts'),
    'observed_act_ordinal',
  )
  const beats = exactIdentityRows(
    'presentation_structure', packetBeats,
    array(decisions.beats, 'presentation_structure decisions beats'),
    'slide_index',
  )
  const collect = collector()
  const show = record(decisions.show, 'presentation_structure show')
  exactKeys(show, [
    'title', 'subtitle', 'closing_title', 'opening_eyebrow', 'muster_title', 'begins_label', 'note',
  ], 'presentation_structure show')
  for (const key of ['title', 'subtitle', 'closing_title', 'opening_eyebrow', 'muster_title', 'begins_label']) {
    collect.required(`show.${key}`, show[key], requiredString)
  }
  nullableNote(show.note, 'presentation_structure show note')

  const packetActByKey = new Map(packetActs.map((row) => [String(row.observed_act_ordinal), row]))
  const includedActIds = new Set<string>()
  const actInclusionByOrdinal = new Map<string, boolean | null>()
  for (const [key, row] of acts) {
    const label = `presentation_structure act ${key}`
    exactKeys(row, [
      'observed_act_ordinal', 'include', 'id', 'title', 'subtitle', 'scene',
      'interstitial_slide_index', 'interstitial_portrait_asset', 'note',
    ], label)
    collect.required(`acts[${key}].include`, row.include, requiredBoolean)
    actInclusionByOrdinal.set(key, row.include as boolean | null)
    nullableNote(row.note, `${label} note`)
    if (row.include === true) {
      collect.required(`acts[${key}].id`, row.id, (value, path) => {
        const id = identifier(value, path)
        if (includedActIds.has(id)) throw new Error(`presentation_structure act id ${id} is used more than once`)
        includedActIds.add(id)
      })
      collect.required(`acts[${key}].title`, row.title, requiredString)
      collect.required(`acts[${key}].subtitle`, row.subtitle, requiredString)
      collect.required(`acts[${key}].scene`, row.scene, requiredEnum(['title', 'keep', 'hall', 'field', 'table']))
      collect.required(`acts[${key}].interstitial_slide_index`, row.interstitial_slide_index, (value, path) => {
        if (!Number.isInteger(value)) throw new Error(`${path} must be an integer or null`)
        const observed = packetActByKey.get(key)?.interstitial_slide_indices
        if (!Array.isArray(observed) || !observed.includes(value)) {
          throw new Error(`${path} must reference an observed interstitial slide`)
        }
      })
      collect.required(`acts[${key}].interstitial_portrait_asset`, row.interstitial_portrait_asset,
        (value, path) => requireKnownAsset(value, `presentation_structure act ${key} interstitial_portrait_asset`, assets))
    } else if (row.include === false) {
      for (const field of ['id', 'title', 'subtitle', 'scene', 'interstitial_slide_index', 'interstitial_portrait_asset']) {
        assertNull(row[field], `${label} ${field}`)
      }
    }
  }

  const packetBeatByKey = new Map(packetBeats.map((row) => [String(row.slide_index), row]))
  const includedBeatIds = new Set<string>()
  const includedBeatCountByAct = new Map<string, number>()
  for (const [key, row] of beats) {
    const label = `presentation_structure beat ${key}`
    exactKeys(row, [
      'slide_index', 'include', 'id', 'kicker', 'title', 'summary', 'weight', 'portrait_asset',
      'approve_beatline_group', 'approve_take_group', 'note',
    ], label)
    collect.required(`beats[${key}].include`, row.include, requiredBoolean)
    nullableNote(row.note, `${label} note`)
    const observed = packetBeatByKey.get(key) as UnknownRecord
    if (row.include === true) {
      const actOrdinal = String(observed.observed_act_ordinal)
      if (actInclusionByOrdinal.get(actOrdinal) === false) {
        throw new Error(`presentation_structure beat ${key} cannot be included under excluded act ${actOrdinal}`)
      }
      includedBeatCountByAct.set(actOrdinal, (includedBeatCountByAct.get(actOrdinal) ?? 0) + 1)
      collect.required(`beats[${key}].id`, row.id, (value, path) => {
        const id = identifier(value, path)
        if (includedBeatIds.has(id)) throw new Error(`presentation_structure beat id ${id} is used more than once`)
        includedBeatIds.add(id)
      })
      for (const field of ['kicker', 'title', 'summary']) {
        collect.required(`beats[${key}].${field}`, row[field], requiredString)
      }
      collect.required(`beats[${key}].weight`, row.weight, requiredEnum(['ordinary', 'death', 'betrayal']))
      nullableString(row.portrait_asset, `${label} portrait_asset`)
      if (typeof row.portrait_asset === 'string') requireKnownAsset(row.portrait_asset, `${label} portrait_asset`, assets)
      if (observed.beatline_group_candidate !== null) {
        collect.required(`beats[${key}].approve_beatline_group`, row.approve_beatline_group, requiredBoolean)
      } else assertNull(row.approve_beatline_group, `${label} approve_beatline_group`)
      if (observed.take_group !== null) {
        collect.required(`beats[${key}].approve_take_group`, row.approve_take_group, requiredBoolean)
      } else assertNull(row.approve_take_group, `${label} approve_take_group`)
    } else if (row.include === false) {
      for (const field of [
        'id', 'kicker', 'title', 'summary', 'weight', 'portrait_asset',
        'approve_beatline_group', 'approve_take_group',
      ]) assertNull(row[field], `${label} ${field}`)
    }
  }
  const allActChoicesMade = [...actInclusionByOrdinal.values()].every((value) => typeof value === 'boolean')
  const allBeatChoicesMade = [...beats.values()].every((row) => typeof row.include === 'boolean')
  if (allActChoicesMade && allBeatChoicesMade) {
    if (![...actInclusionByOrdinal.values()].some((value) => value === true)) {
      throw new Error('presentation_structure must include at least one act')
    }
    for (const [ordinal, include] of actInclusionByOrdinal) {
      if (include === true && (includedBeatCountByAct.get(ordinal) ?? 0) === 0) {
        throw new Error(`presentation_structure included act ${ordinal} must include at least one beat`)
      }
    }
  }
  return collect.finish()
}

export function inspectSettlementDropPresentationStructureDecisions(
  packet: UnknownRecord,
  decisions: UnknownRecord,
  assetPacket: UnknownRecord,
): SettlementDropApprovalDecisionStatus {
  const packetTarget = record(packet.target, 'presentation_structure packet.target')
  const roomCode = nonempty(packetTarget.room_code, 'presentation_structure packet.target.room_code')
  targetRoom(packet, roomCode, 'presentation_structure packet')
  targetRoom(decisions, roomCode, 'presentation_structure decisions')
  targetRoom(assetPacket, roomCode, 'asset_semantics packet')
  if (assetPacket.artifact !== DECISION_CONTRACTS.asset_semantics.packetArtifact) {
    throw new Error('asset_semantics packet artifact is invalid')
  }
  validateEnvelope('presentation_structure', packet, decisions)
  return inspectStructure(packet, decisions, assetIds(assetPacket))
}

function inspectReceipt(packet: UnknownRecord, decisions: UnknownRecord): SettlementDropApprovalDecisionStatus {
  const rows = exactIdentityRows(
    'receipt_prerequisites', array(packet.candidate_entries, 'receipt_prerequisites packet entries'),
    array(decisions.entries, 'receipt_prerequisites decisions entries'), 'entry_key',
  )
  const collect = collector()
  const settlement = record(decisions.settlement, 'receipt_prerequisites settlement')
  exactKeys(settlement, ['title', 'actor', 'bingo_mode'], 'receipt_prerequisites settlement')
  collect.required('settlement.title', settlement.title, requiredString)
  collect.required('settlement.actor', settlement.actor, requiredString)
  collect.required('settlement.bingo_mode', settlement.bingo_mode, requiredEnum(['preserve_live', 'replace']))
  for (const [key, row] of rows) {
    exactKeys(row, ['entry_key', 'approved_outcome', 'warrant', 'occurred_at', 'note'], `receipt_prerequisites ${key}`)
    collect.required(`entries[${key}].approved_outcome`, row.approved_outcome, requiredEnum(['resolved', 'void']))
    nullableTimestamp(row.occurred_at, `receipt_prerequisites ${key} occurred_at`)
    nullableNote(row.note, `receipt_prerequisites ${key} note`)
    if (row.approved_outcome !== null) collect.required(`entries[${key}].warrant`, row.warrant, warrant)
  }
  const bingo = record(decisions.bingo, 'receipt_prerequisites bingo')
  exactKeys(bingo, ['preserve_snapshot_marks', 'warrant', 'note'], 'receipt_prerequisites bingo')
  collect.required('bingo.preserve_snapshot_marks', bingo.preserve_snapshot_marks, requiredBoolean)
  nullableNote(bingo.note, 'receipt_prerequisites bingo note')
  if (bingo.preserve_snapshot_marks === true) {
    collect.required('bingo.warrant', bingo.warrant, warrant)
    if (settlement.bingo_mode !== null && settlement.bingo_mode !== 'preserve_live') {
      throw new Error('receipt_prerequisites bingo_mode must be preserve_live when snapshot marks are preserved')
    }
  } else if (bingo.preserve_snapshot_marks === false) {
    assertNull(bingo.warrant, 'receipt_prerequisites bingo warrant')
    if (settlement.bingo_mode !== null && settlement.bingo_mode !== 'replace') {
      throw new Error('receipt_prerequisites bingo_mode must be replace when snapshot marks are not preserved')
    }
  }
  collect.required('additional_fact_review', decisions.additional_fact_review, requiredBoolean)
  return collect.finish()
}

export function inspectSettlementDropReceiptPrerequisiteDecisions(
  packet: UnknownRecord,
  decisions: UnknownRecord,
): SettlementDropApprovalDecisionStatus {
  const packetTarget = record(packet.target, 'receipt_prerequisites packet.target')
  const roomCode = nonempty(packetTarget.room_code, 'receipt_prerequisites packet.target.room_code')
  targetRoom(packet, roomCode, 'receipt_prerequisites packet')
  targetRoom(decisions, roomCode, 'receipt_prerequisites decisions')
  validateEnvelope('receipt_prerequisites', packet, decisions)
  return inspectReceipt(packet, decisions)
}

export function inspectSettlementDropApprovalDecisions(
  input: SettlementDropApprovalDecisionInput,
): Result {
  const roomCode = nonempty(input.room_code, 'room_code')
  for (const [kind, lane] of Object.entries(input.lanes) as Array<[
    SettlementDropApprovalLaneKind,
    { packet: UnknownRecord; decisions: UnknownRecord },
  ]>) {
    targetRoom(lane.packet, roomCode, `${kind} packet`)
    targetRoom(lane.decisions, roomCode, `${kind} decisions`)
    validateEnvelope(kind, lane.packet, lane.decisions)
  }
  const assets = assetIds(input.lanes.asset_semantics.packet)
  return {
    player_identity: inspectPlayers(input.lanes.player_identity.packet, input.lanes.player_identity.decisions),
    asset_semantics: inspectAssets(input.lanes.asset_semantics.packet, input.lanes.asset_semantics.decisions),
    quote_markup: inspectQuotes(input.lanes.quote_markup.packet, input.lanes.quote_markup.decisions),
    presentation_structure: inspectStructure(
      input.lanes.presentation_structure.packet,
      input.lanes.presentation_structure.decisions,
      assets,
    ),
    receipt_prerequisites: inspectReceipt(
      input.lanes.receipt_prerequisites.packet,
      input.lanes.receipt_prerequisites.decisions,
    ),
  }
}
