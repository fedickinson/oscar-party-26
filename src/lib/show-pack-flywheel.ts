import {
  createSettlementReceipt,
  type SettlementReceipt,
  type SettlementReceiptFact,
  type SettlementReceiptRevision,
  type SettlementReceiptScoreKind,
  type SettlementReceiptTrigger,
} from './settlement-receipt'
import {
  compileShowPack,
  parseShowPack,
  type ShowPack,
  type ShowPackClaim,
  type ShowPackSource,
} from './show-pack'
import type { ShowPackResearchIntakeResult } from './show-pack-research-intake'

export const SHOW_PACK_FLYWHEEL_SCHEMA_VERSION = 3 as const
const FLYWHEEL_CLAIM_PREFIX = 'predecessor-screen-'

export interface ShowPackFlywheelPredecessor {
  pack_id: string
  settlement_id: string
  settlement_version: number
}

export interface ShowPackFlywheelAttestation {
  pack_version: number
  registry_id: string
  receipt_source: SettlementReceipt['source']
  manifest_hash: string
  receipt_sha256: string
  revision: SettlementReceiptRevision
}

export interface ShowPackFlywheelEvent {
  id: string
  kind: SettlementReceiptScoreKind
  label: string
  points: number
  character_id?: string
  trigger?: SettlementReceiptTrigger
  screen_claim_id?: string
}

export interface ShowPackFlywheelFact extends SettlementReceiptFact {
  screen_claim_id?: string
}

export interface ShowPackFlywheelEntity {
  id: string
  name: string
  net_points: number
  event_ids: string[]
}

export interface ShowPackFlywheelSeed {
  schema_version: typeof SHOW_PACK_FLYWHEEL_SCHEMA_VERSION
  artifact: 'show-pack-flywheel-seed'
  predecessor: ShowPackFlywheelPredecessor
  attestation: ShowPackFlywheelAttestation
  source: ShowPackSource
  screen_claims: ShowPackClaim[]
  facts: ShowPackFlywheelFact[]
  events: ShowPackFlywheelEvent[]
  entities: ShowPackFlywheelEntity[]
}

export interface ShowPackFlywheelOptions {
  allowProof?: boolean
}

export type ShowPackFlywheelCompositionStage = 'authoring' | 'compiled'

function isSha256(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    )
  }
  return value
}

function copyTrigger(trigger: SettlementReceiptTrigger): SettlementReceiptTrigger {
  return {
    source_signature_beat_id: trigger.source_signature_beat_id,
    contract: {
      title: trigger.contract.title,
      condition: trigger.contract.condition,
      exclusions: [...trigger.contract.exclusions],
      adjudication: { ...trigger.contract.adjudication },
      title_review: { ...trigger.contract.title_review },
      basis_claim_ids: [...trigger.contract.basis_claim_ids],
    },
  }
}

/**
 * Projects a closed-room receipt into public-safe evidence for research on the
 * next show. It does not author future wagers, discourse, portraits, or prose.
 */
export function createShowPackFlywheelSeed(
  receiptInput: SettlementReceipt,
  receiptSha256: string,
  options: ShowPackFlywheelOptions = {},
): ShowPackFlywheelSeed {
  if (!isSha256(receiptSha256)) {
    throw new Error('receipt SHA-256 must be a lowercase SHA-256 digest')
  }

  const receipt = createSettlementReceipt(receiptInput)
  if (!receipt.show_pack) {
    throw new Error('settlement receipt has no show-pack attestation; re-emit it with settle-room')
  }
  if (!receipt.settled_facts) {
    throw new Error('settlement receipt has no settled-fact timeline; re-emit it with settle-room')
  }
  if (!receipt.revision) {
    throw new Error('settlement receipt has no revision provenance; re-emit it with settle-room')
  }
  if (receipt.source === 'synthetic-proof' && options.allowProof !== true) {
    throw new Error('synthetic proof receipt requires explicit proof authority')
  }

  const sourceId = 'predecessor-settlement'
  const screenClaims: ShowPackClaim[] = []
  let factClaimOrdinal = 0
  const facts = receipt.settled_facts.map((fact): ShowPackFlywheelFact => {
    const screenClaimId = fact.outcome === 'resolved'
      ? `${FLYWHEEL_CLAIM_PREFIX}fact-${String(++factClaimOrdinal).padStart(3, '0')}`
      : undefined
    if (screenClaimId && fact.winner) {
      const winnerText = fact.tie_winner
        ? `${fact.winner.name} and ${fact.tie_winner.name}`
        : fact.winner.name
      screenClaims.push({
        id: screenClaimId,
        canon: 'screen',
        status: 'verified',
        text: `${fact.title}: ${winnerText}`,
        source_ids: [sourceId],
      })
    }
    return {
      id: fact.id,
      sequence: fact.sequence,
      title: fact.title,
      outcome: fact.outcome,
      board_status: fact.board_status,
      ...(fact.occurred_at === undefined ? {} : { occurred_at: fact.occurred_at }),
      ...(fact.winner === undefined ? {} : { winner: { ...fact.winner } }),
      ...(fact.tie_winner === undefined ? {} : { tie_winner: { ...fact.tie_winner } }),
      ...(screenClaimId === undefined ? {} : { screen_claim_id: screenClaimId }),
    }
  })
  let bingoClaimOrdinal = 0
  const events = receipt.score_events.map((event): ShowPackFlywheelEvent => {
    const screenClaimId = event.kind === 'bingo' && event.id.startsWith('bingo-square:')
      ? `${FLYWHEEL_CLAIM_PREFIX}bingo-${String(++bingoClaimOrdinal).padStart(3, '0')}`
      : undefined
    if (screenClaimId) {
      screenClaims.push({
        id: screenClaimId,
        canon: 'screen',
        status: 'verified',
        text: event.label,
        source_ids: [sourceId],
      })
    }
    return {
      id: event.id,
      kind: event.kind,
      label: event.label,
      points: event.points,
      ...(event.character_id === undefined ? {} : { character_id: event.character_id }),
      ...(event.trigger === undefined ? {} : { trigger: copyTrigger(event.trigger) }),
      ...(screenClaimId === undefined ? {} : { screen_claim_id: screenClaimId }),
    }
  })

  const entities = receipt.characters.map((character): ShowPackFlywheelEntity => {
    const entityEvents = events.filter((event) => event.character_id === character.id)
    return {
      id: character.id,
      name: character.name,
      net_points: entityEvents.reduce((total, event) => total + event.points, 0),
      event_ids: entityEvents.map((event) => event.id),
    }
  })

  return {
    schema_version: SHOW_PACK_FLYWHEEL_SCHEMA_VERSION,
    artifact: 'show-pack-flywheel-seed',
    predecessor: {
      pack_id: receipt.show_pack.pack_id,
      settlement_id: receipt.settlement_id,
      settlement_version: receipt.settlement_version,
    },
    attestation: {
      pack_version: receipt.show_pack.version,
      registry_id: receipt.show_pack.registry_id,
      receipt_source: receipt.source,
      manifest_hash: receipt.manifest_hash,
      receipt_sha256: receiptSha256,
      revision: { ...receipt.revision },
    },
    source: {
      id: sourceId,
      kind: 'operator_record',
      title: 'Settled predecessor record',
      locator: `settlement:${receipt.settlement_id}:v${receipt.settlement_version}:sha256:${receiptSha256}`,
    },
    screen_claims: screenClaims,
    facts,
    events,
    entities,
  }
}

export function serializeShowPackFlywheelSeed(seed: ShowPackFlywheelSeed): string {
  return `${JSON.stringify(seed, null, 2)}\n`
}

/** Rebuilds the seed from its receipt so edited or mismatched evidence cannot compose. */
export function assertShowPackFlywheelSeedMatchesReceipt(
  rawSeed: string,
  receipt: SettlementReceipt,
  receiptSha256: string,
  options: ShowPackFlywheelOptions = {},
): ShowPackFlywheelSeed {
  let candidate: unknown
  try {
    candidate = JSON.parse(rawSeed)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`flywheel seed is not valid JSON: ${message}`)
  }
  const expected = createShowPackFlywheelSeed(receipt, receiptSha256, options)
  if (JSON.stringify(canonicalize(candidate)) !== JSON.stringify(canonicalize(expected))) {
    throw new Error('flywheel seed does not match its canonical settlement receipt')
  }
  return expected
}

/**
 * Injects receipt-owned predecessor evidence before running the ordinary show-
 * pack validator. The authoring input may therefore cite injected claim IDs,
 * but it cannot author or override those claims itself.
 */
export function composeShowPackWithFlywheel(
  rawAuthoringPack: string,
  seed: ShowPackFlywheelSeed,
  research?: ShowPackResearchIntakeResult,
): ShowPack {
  let value: unknown
  try {
    value = JSON.parse(rawAuthoringPack)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`flywheel authoring pack is not valid JSON: ${message}`)
  }
  if (!isRecord(value)) throw new Error('flywheel authoring pack must be an object')
  if (!isRecord(value.pack)) throw new Error('flywheel authoring pack metadata is required')
  if (Object.prototype.hasOwnProperty.call(value.pack, 'predecessor')) {
    throw new Error('flywheel authoring pack must omit pack.predecessor')
  }
  if (!Array.isArray(value.sources)) throw new Error('flywheel authoring pack sources must be an array')
  if (!Array.isArray(value.claims)) throw new Error('flywheel authoring pack claims must be an array')

  const sourceCollision = value.sources.find((source) => (
    isRecord(source) && source.id === seed.source.id
  ))
  if (sourceCollision) throw new Error(`flywheel source id ${seed.source.id} is reserved`)
  const claimCollision = value.claims.find((claim) => (
    isRecord(claim)
      && typeof claim.id === 'string'
      && claim.id.startsWith(FLYWHEEL_CLAIM_PREFIX)
  )) as Record<string, unknown> | undefined
  if (claimCollision) throw new Error(`flywheel claim id ${String(claimCollision.id)} is reserved`)

  if (research) {
    if (research.result_version !== 1 || research.artifact !== 'show-pack-research-intake'
      || JSON.stringify(research.target) !== JSON.stringify(seed.predecessor)) {
      throw new Error('research intake does not target the canonical flywheel settlement')
    }
    if (!isSha256(research.packet_sha256) || !isSha256(research.decisions_sha256)) {
      throw new Error('research intake provenance is invalid')
    }
    if (!Array.isArray(research.sources) || !Array.isArray(research.claims)) {
      throw new Error('research intake collections are invalid')
    }
    const researchSourceCollision = research.sources.find((source) => source.id === seed.source.id)
    if (researchSourceCollision) throw new Error(`research source id ${researchSourceCollision.id} is reserved`)
    const researchClaimCollision = research.claims.find((claim) => claim.id.startsWith(FLYWHEEL_CLAIM_PREFIX))
    if (researchClaimCollision) throw new Error(`research claim id ${researchClaimCollision.id} is reserved`)
  }

  const composed = {
    ...value,
    pack: {
      ...value.pack,
      predecessor: { ...seed.predecessor },
    },
    sources: [
      ...value.sources,
      { ...seed.source },
      ...(research?.sources.map((source) => ({ ...source })) ?? []),
    ],
    claims: [
      ...value.claims,
      ...seed.screen_claims.map((claim) => ({
        ...claim,
        source_ids: [...claim.source_ids],
      })),
      ...(research?.claims.map((claim) => ({
        ...claim,
        source_ids: [...claim.source_ids],
      })) ?? []),
    ],
  }
  return parseShowPack(JSON.stringify(composed))
}

/** Authoring mode opens the grounding lane; compiled mode closes publication. */
export function finalizeShowPackFlywheelComposition(
  pack: ShowPack,
  stage: ShowPackFlywheelCompositionStage,
): ShowPack {
  if (stage === 'authoring') return pack
  if (stage === 'compiled') return compileShowPack(pack)
  throw new Error(`unknown flywheel composition stage ${String(stage)}`)
}
