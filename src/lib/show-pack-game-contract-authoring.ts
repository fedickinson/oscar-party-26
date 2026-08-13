import type { ShowPackGameContract } from '../types/game-contract'
import { assertActivatableShowPack } from './show-pack-activation'
import {
  parseShowPack,
  type ShowPack,
  type TruthAuthority,
} from './show-pack'

export type ShowPackWagerKind = 'prediction' | 'signature_beat' | 'bingo_square'

export interface ShowPackTruthAuthorityOverride {
  kind: ShowPackWagerKind
  id: string
  authority: TruthAuthority
}

export interface ShowPackGameContractAuthoring {
  authoring_version: 1
  artifact: 'show-pack-game-contract-authoring'
  target: { pack_id: string; pack_version: number }
  game_contract: ShowPackGameContract
  truth_authority: {
    default: TruthAuthority
    overrides: ShowPackTruthAuthorityOverride[]
  }
}

const TRUTH_AUTHORITIES = new Set<TruthAuthority>([
  'official_result',
  'operator_declaration',
  'ai_proposal_human_confirmation',
])
const WAGER_KINDS = new Set<ShowPackWagerKind>([
  'prediction', 'signature_beat', 'bingo_square',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertExactKeys(value: Record<string, unknown>, keys: string[], label: string): void {
  const allowed = new Set(keys)
  const unknown = Object.keys(value).find((key) => !allowed.has(key))
  if (unknown) throw new Error(`${label} has unknown field ${unknown}`)
}

function assertTarget(value: unknown): asserts value is ShowPackGameContractAuthoring['target'] {
  if (!isRecord(value)) throw new Error('game-contract authoring target is required')
  assertExactKeys(value, ['pack_id', 'pack_version'], 'game-contract authoring target')
  if (typeof value.pack_id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.pack_id)
      || !Number.isInteger(value.pack_version) || Number(value.pack_version) < 1) {
    throw new Error('game-contract authoring target needs a pack id and positive version')
  }
}

function parseOverride(value: unknown, index: number): ShowPackTruthAuthorityOverride {
  if (!isRecord(value)) throw new Error(`truth-authority override ${index + 1} must be an object`)
  assertExactKeys(value, ['kind', 'id', 'authority'], `truth-authority override ${index + 1}`)
  if (!WAGER_KINDS.has(value.kind as ShowPackWagerKind)) {
    throw new Error(`truth-authority override ${index + 1} kind is invalid`)
  }
  if (typeof value.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.id)) {
    throw new Error(`truth-authority override ${index + 1} id must be a kebab-case slug`)
  }
  if (!TRUTH_AUTHORITIES.has(value.authority as TruthAuthority)) {
    throw new Error(`truth-authority override ${index + 1} authority is invalid`)
  }
  return {
    kind: value.kind as ShowPackWagerKind,
    id: value.id,
    authority: value.authority as TruthAuthority,
  }
}

export function parseShowPackGameContractAuthoring(raw: string): ShowPackGameContractAuthoring {
  let value: unknown
  try { value = JSON.parse(raw) } catch (error) {
    throw new Error(`game-contract authoring is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!isRecord(value)) throw new Error('game-contract authoring must be an object')
  assertExactKeys(
    value,
    ['authoring_version', 'artifact', 'target', 'game_contract', 'truth_authority'],
    'game-contract authoring',
  )
  if (value.authoring_version !== 1
      || value.artifact !== 'show-pack-game-contract-authoring') {
    throw new Error('game-contract authoring version or artifact is invalid')
  }
  assertTarget(value.target)
  if (!isRecord(value.game_contract)) throw new Error('game-contract authoring contract is required')
  if (!isRecord(value.truth_authority)) throw new Error('game-contract truth authority is required')
  assertExactKeys(value.truth_authority, ['default', 'overrides'], 'game-contract truth authority')
  if (!TRUTH_AUTHORITIES.has(value.truth_authority.default as TruthAuthority)) {
    throw new Error('game-contract default truth authority is invalid')
  }
  if (!Array.isArray(value.truth_authority.overrides)) {
    throw new Error('game-contract truth-authority overrides must be an array')
  }
  const overrides = value.truth_authority.overrides.map(parseOverride)
  const seen = new Set<string>()
  for (const override of overrides) {
    const key = `${override.kind}:${override.id}`
    if (seen.has(key)) throw new Error(`duplicate truth-authority override ${key}`)
    seen.add(key)
  }
  return {
    authoring_version: 1,
    artifact: 'show-pack-game-contract-authoring',
    target: { ...value.target },
    game_contract: structuredClone(value.game_contract) as unknown as ShowPackGameContract,
    truth_authority: {
      default: value.truth_authority.default as TruthAuthority,
      overrides,
    },
  }
}

export function serializeShowPackGameContractAuthoring(
  value: ShowPackGameContractAuthoring,
): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

export function applyShowPackGameContractAuthoring(
  input: ShowPack,
  authoringInput: ShowPackGameContractAuthoring,
): ShowPack {
  const authoring = parseShowPackGameContractAuthoring(
    serializeShowPackGameContractAuthoring(authoringInput),
  )
  if (input.pack.id !== authoring.target.pack_id
      || input.pack.version !== authoring.target.pack_version) {
    throw new Error(
      `game-contract authoring targets ${authoring.target.pack_id}@${authoring.target.pack_version} and does not target ${input.pack.id}@${input.pack.version}`,
    )
  }
  if (input.schema_version === 4 || input.game_contract !== undefined) {
    throw new Error('show pack already owns an explicit game contract')
  }

  const pack = structuredClone(input)
  pack.schema_version = 4
  pack.game_contract = structuredClone(authoring.game_contract)
  const wagers = {
    prediction: pack.predictions,
    signature_beat: pack.signature_beats,
    bingo_square: pack.bingo_squares,
  }
  for (const rows of Object.values(wagers)) {
    for (const wager of rows) wager.truth_authority = authoring.truth_authority.default
  }
  for (const override of authoring.truth_authority.overrides) {
    const wager = wagers[override.kind].find((row) => row.id === override.id)
    if (!wager) throw new Error(`truth-authority override references unknown ${override.kind} ${override.id}`)
    wager.truth_authority = override.authority
  }

  const parsed = parseShowPack(JSON.stringify(pack))
  assertActivatableShowPack(parsed)
  return parsed
}
