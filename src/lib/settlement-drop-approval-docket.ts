import type { SealedTextArtifact } from './settlement-drop-asset-semantics'
import type { SettlementDropAssetSourceSeal } from './settlement-drop-asset-extraction'
import { inspectSettlementDropApprovalDecisions } from './settlement-drop-approval-decisions'
import { sha256Hex } from './sha256'

type UnknownRecord = Record<string, unknown>

export type SettlementDropApprovalLaneKind =
  | 'receipt_prerequisites'
  | 'player_identity'
  | 'asset_semantics'
  | 'quote_markup'
  | 'presentation_structure'

const LANE_CONTRACTS: Record<SettlementDropApprovalLaneKind, {
  packetArtifact: string
  decisionArtifact: string
  blocker: string
}> = {
  receipt_prerequisites: {
    packetArtifact: 'settlement-drop-receipt-prerequisites-review',
    decisionArtifact: 'settlement-drop-receipt-prerequisites-decisions',
    blocker: 'missing_settlement_receipt',
  },
  player_identity: {
    packetArtifact: 'settlement-drop-player-identity-review',
    decisionArtifact: 'settlement-drop-player-identity-decisions',
    blocker: 'player_identity_requires_approval',
  },
  asset_semantics: {
    packetArtifact: 'settlement-drop-asset-semantics-review',
    decisionArtifact: 'settlement-drop-asset-semantics-decisions',
    blocker: 'asset_semantics_requires_approval',
  },
  quote_markup: {
    packetArtifact: 'settlement-drop-quote-markup-review',
    decisionArtifact: 'settlement-drop-quote-markup-decisions',
    blocker: 'quote_markup_requires_approval',
  },
  presentation_structure: {
    packetArtifact: 'settlement-drop-presentation-structure-review',
    decisionArtifact: 'settlement-drop-presentation-structure-decisions',
    blocker: 'presentation_structure_requires_approval',
  },
}

export interface SettlementDropApprovalDocket {
  docket_version: 2
  artifact: 'settlement-drop-approval-docket'
  target: { room_code: string }
  audit: SettlementDropAssetSourceSeal
  blockers: Array<{ code: string; count?: number; detail: string; required_action: string }>
  lanes: Array<{
    kind: SettlementDropApprovalLaneKind
    blocker_code: string
    blocker_present: boolean
    packet: SettlementDropAssetSourceSeal
    decisions: SettlementDropAssetSourceSeal
    decision_units: number
    required_values: number
    open_values: number
    open_items: string[]
    decision_status: 'open' | 'complete'
  }>
}

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value
}

function sealedJson(artifact: SealedTextArtifact, label: string): {
  seal: SettlementDropAssetSourceSeal
  value: UnknownRecord
} {
  const bytes = new TextEncoder().encode(artifact.raw).byteLength
  const sha256 = sha256Hex(artifact.raw)
  if (artifact.seal.bytes !== bytes || artifact.seal.sha256 !== sha256) {
    throw new Error(`${label} seal does not match its bytes`)
  }
  const parsed: unknown = JSON.parse(artifact.raw)
  if (!isRecord(parsed)) throw new Error(`${label} must be a JSON object`)
  return {
    seal: { name: requiredString(artifact.seal.name, `${label} seal name`), bytes, sha256 },
    value: parsed,
  }
}

function roomCode(value: UnknownRecord, label: string): string {
  if (!isRecord(value.target)) throw new Error(`${label}.target must be an object`)
  return requiredString(value.target.room_code, `${label}.target.room_code`)
}

function requiredArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`)
  return value
}

function decisionUnits(kind: SettlementDropApprovalLaneKind, decision: UnknownRecord): number {
  if (kind === 'player_identity' || kind === 'asset_semantics' || kind === 'quote_markup') {
    return requiredArray(decision.decisions, `${kind}.decisions`).length
  }
  if (kind === 'presentation_structure') {
    if (!isRecord(decision.show)) throw new Error('presentation_structure.show must be an object')
    return 1
      + requiredArray(decision.acts, 'presentation_structure.acts').length
      + requiredArray(decision.beats, 'presentation_structure.beats').length
  }
  if (!isRecord(decision.settlement)) throw new Error('receipt_prerequisites.settlement must be an object')
  if (!isRecord(decision.bingo)) throw new Error('receipt_prerequisites.bingo must be an object')
  if (!Object.prototype.hasOwnProperty.call(decision, 'additional_fact_review')) {
    throw new Error('receipt_prerequisites.additional_fact_review is required')
  }
  return 3 + requiredArray(decision.entries, 'receipt_prerequisites.entries').length
}

export function buildSettlementDropApprovalDocket(input: {
  room_code: string
  audit: SealedTextArtifact
  lanes: Array<{ kind: SettlementDropApprovalLaneKind; packet: SealedTextArtifact; decisions: SealedTextArtifact }>
}): SettlementDropApprovalDocket {
  const requestedRoom = requiredString(input.room_code, 'room_code')
  const audit = sealedJson(input.audit, 'audit')
  if (audit.value.artifact !== 'settlement-drop-migration-audit') {
    throw new Error('audit artifact is not a settlement-drop migration audit')
  }
  if (roomCode(audit.value, 'audit') !== requestedRoom) throw new Error('audit room does not match room_code')
  const rawBlockers = requiredArray(audit.value.blockers, 'audit.blockers')
  const blockers = rawBlockers.map((value, index) => {
    if (!isRecord(value)) throw new Error(`audit.blockers[${index}] must be an object`)
    const count = value.count
    if (count !== undefined && (!Number.isInteger(count) || (count as number) < 0)) {
      throw new Error(`audit.blockers[${index}].count must be a non-negative integer`)
    }
    return {
      code: requiredString(value.code, `audit.blockers[${index}].code`),
      ...(count === undefined ? {} : { count: count as number }),
      detail: requiredString(value.detail, `audit.blockers[${index}].detail`),
      required_action: requiredString(value.required_action, `audit.blockers[${index}].required_action`),
    }
  })
  const blockersByCode = new Set(blockers.map((blocker) => blocker.code))
  const suppliedKinds = new Set<SettlementDropApprovalLaneKind>()
  const parsedLanes = input.lanes.map((lane) => {
    if (!Object.prototype.hasOwnProperty.call(LANE_CONTRACTS, lane.kind)) {
      throw new Error(`unsupported approval lane ${String(lane.kind)}`)
    }
    if (suppliedKinds.has(lane.kind)) throw new Error(`duplicate approval lane ${lane.kind}`)
    suppliedKinds.add(lane.kind)
    const contract = LANE_CONTRACTS[lane.kind]
    const packet = sealedJson(lane.packet, `${lane.kind} packet`)
    const decisions = sealedJson(lane.decisions, `${lane.kind} decisions`)
    if (packet.value.artifact !== contract.packetArtifact) {
      throw new Error(`${lane.kind} packet artifact is ${String(packet.value.artifact)}`)
    }
    if (decisions.value.artifact !== contract.decisionArtifact) {
      throw new Error(`${lane.kind} decision artifact is ${String(decisions.value.artifact)}`)
    }
    if (roomCode(packet.value, `${lane.kind} packet`) !== requestedRoom
      || roomCode(decisions.value, `${lane.kind} decisions`) !== requestedRoom) {
      throw new Error(`${lane.kind} room does not match room_code`)
    }
    if (decisions.value.expected_packet_sha256 !== packet.seal.sha256) {
      throw new Error(`${lane.kind} decisions do not target the supplied packet hash`)
    }
    return {
      kind: lane.kind,
      blocker_code: contract.blocker,
      blocker_present: blockersByCode.has(contract.blocker),
      packet: packet.seal,
      decisions: decisions.seal,
      decision_units: decisionUnits(lane.kind, decisions.value),
      packetValue: packet.value,
      decisionValue: decisions.value,
    }
  })
  const missingKinds = (Object.keys(LANE_CONTRACTS) as SettlementDropApprovalLaneKind[])
    .filter((kind) => !suppliedKinds.has(kind))
  if (missingKinds.length > 0) throw new Error(`missing approval lanes: ${missingKinds.join(', ')}`)
  const semanticStatus = inspectSettlementDropApprovalDecisions({
    room_code: requestedRoom,
    lanes: Object.fromEntries(parsedLanes.map((lane) => [lane.kind, {
      packet: lane.packetValue,
      decisions: lane.decisionValue,
    }])) as Parameters<typeof inspectSettlementDropApprovalDecisions>[0]['lanes'],
  })
  const lanes = parsedLanes.map(({ packetValue: _packet, decisionValue: _decisions, ...lane }) => ({
    ...lane,
    required_values: semanticStatus[lane.kind].required_values,
    open_values: semanticStatus[lane.kind].open_values,
    open_items: semanticStatus[lane.kind].open_items,
    decision_status: semanticStatus[lane.kind].status,
  })).sort((left, right) => left.kind < right.kind ? -1 : left.kind > right.kind ? 1 : 0)

  return {
    docket_version: 2,
    artifact: 'settlement-drop-approval-docket',
    target: { room_code: requestedRoom },
    audit: audit.seal,
    blockers,
    lanes,
  }
}

export function serializeSettlementDropApprovalDocket(docket: SettlementDropApprovalDocket): string {
  return `${JSON.stringify(docket, null, 2)}\n`
}
