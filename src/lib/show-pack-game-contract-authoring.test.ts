import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseShowPack, type ShowPack } from './show-pack'
import {
  applyShowPackGameContractAuthoring,
  parseShowPackGameContractAuthoring,
  serializeShowPackGameContractAuthoring,
  type ShowPackGameContractAuthoring,
} from './show-pack-game-contract-authoring'

function legacyPack(): ShowPack {
  const pack = parseShowPack(readFileSync(
    new URL('../../show-packs/examples/hotd-s3e8-proof.json', import.meta.url),
    'utf8',
  ))
  pack.bingo_squares = Array.from({ length: 24 }, (_, index) => ({
    ...structuredClone(pack.bingo_squares[0]),
    id: `factory-square-${String(index + 1).padStart(2, '0')}`,
  }))
  return pack
}

function authoring(
  identity: 'none' | 'exclusive_entity_draft' | 'chosen_faction',
): ShowPackGameContractAuthoring {
  return {
    authoring_version: 1,
    artifact: 'show-pack-game-contract-authoring',
    target: { pack_id: 'show-pack-contract-proof', pack_version: 1 },
    game_contract: {
      version: 1,
      commitment: 'open_conviction',
      conviction_budget: 2,
      identity: { selection: identity, scoring: 'none' },
      scarcity: {
        commitments: 'fixed_budget',
        identity: identity === 'none' ? 'none' : identity === 'chosen_faction' ? 'shared' : 'exclusive',
      },
      visibility: 'open_counts',
      cadence: 'immediate_facts_and_event_close',
      continuity: 'canon_write_back',
    },
    truth_authority: {
      default: 'operator_declaration',
      overrides: [{
        kind: 'prediction',
        id: 'cliffhanger-centers-on',
        authority: 'official_result',
      }],
    },
  }
}

describe('show-pack game-contract authoring', () => {
  it.each(['none', 'exclusive_entity_draft', 'chosen_faction'] as const)(
    'authors the complete %s Story profile and every wager authority',
    (identity) => {
      const pack = legacyPack()
      pack.pack.id = 'show-pack-contract-proof'
      if (identity === 'chosen_faction') pack.entities[1].group = 'The Blacks'

      const result = applyShowPackGameContractAuthoring(pack, authoring(identity))

      expect(result.schema_version).toBe(4)
      expect(result.game_contract).toEqual(authoring(identity).game_contract)
      expect(result.predictions[0].truth_authority).toBe('official_result')
      expect([
        ...result.signature_beats,
        ...result.bingo_squares,
      ].every((wager) => wager.truth_authority === 'operator_declaration')).toBe(true)
    },
  )

  it('rejects an oversized budget and a chosen-faction pack without two groups', () => {
    const pack = legacyPack()
    pack.pack.id = 'show-pack-contract-proof'
    const oversized = authoring('none')
    oversized.game_contract.conviction_budget = 3
    expect(() => applyShowPackGameContractAuthoring(pack, oversized))
      .toThrow('conviction budget 3 exceeds the 2 authored beats')

    expect(() => applyShowPackGameContractAuthoring(pack, authoring('chosen_faction')))
      .toThrow('chosen-faction identity needs at least two authored entity groups')
  })

  it('rejects target drift, duplicate or unknown overrides, and unsupported profiles', () => {
    const pack = legacyPack()
    pack.pack.id = 'show-pack-contract-proof'
    const targetDrift = authoring('none')
    targetDrift.target.pack_version = 2
    expect(() => applyShowPackGameContractAuthoring(pack, targetDrift))
      .toThrow('does not target show-pack-contract-proof@1')

    const duplicate = authoring('none')
    duplicate.truth_authority.overrides.push(structuredClone(duplicate.truth_authority.overrides[0]))
    expect(() => applyShowPackGameContractAuthoring(pack, duplicate))
      .toThrow('duplicate truth-authority override prediction:cliffhanger-centers-on')

    const unknown = authoring('none')
    unknown.truth_authority.overrides[0].id = 'not-a-wager'
    expect(() => applyShowPackGameContractAuthoring(pack, unknown))
      .toThrow('references unknown prediction not-a-wager')

    const unsupported = authoring('none')
    unsupported.game_contract.visibility = 'hidden_until_resolution'
    expect(() => applyShowPackGameContractAuthoring(pack, unsupported))
      .toThrow('requires the proven Story Night contract profile')
  })

  it('parses closed canonical bytes and refuses to overwrite a schema-v4 owner', () => {
    const input = authoring('none')
    const raw = serializeShowPackGameContractAuthoring(input)
    expect(parseShowPackGameContractAuthoring(raw)).toEqual(input)

    const unknown = { ...input, note: 'not public contract data' }
    expect(() => parseShowPackGameContractAuthoring(JSON.stringify(unknown)))
      .toThrow('game-contract authoring has unknown field note')

    const pack = legacyPack()
    pack.pack.id = 'show-pack-contract-proof'
    const authored = applyShowPackGameContractAuthoring(pack, input)
    expect(() => applyShowPackGameContractAuthoring(authored, input))
      .toThrow('already owns an explicit game contract')
  })
})
