import { describe, expect, it } from 'vitest'
import { resolveLobbyStartMode } from './game-contract'
import type { ShowPackGameContract } from '../types/game-contract'

function storyIdentity(
  selection: 'none' | 'exclusive_entity_draft' | 'chosen_faction',
): ShowPackGameContract {
  return {
    version: 1,
    commitment: 'open_conviction',
    conviction_budget: 8,
    identity: { selection, scoring: 'none' },
    scarcity: {
      commitments: 'fixed_budget',
      identity: selection === 'none' ? 'none' : selection === 'chosen_faction' ? 'shared' : 'exclusive',
    },
    visibility: 'open_counts',
    cadence: 'immediate_facts_and_event_close',
    continuity: 'canon_write_back',
  }
}

describe('lobby start mode', () => {
  it('opens direct convictions only for an explicit no-identity Story contract', () => {
    expect(resolveLobbyStartMode(storyIdentity('none'))).toBe('convictions')
  })

  it('preserves the identity ceremony for exclusive draft contracts', () => {
    expect(resolveLobbyStartMode(storyIdentity('exclusive_entity_draft'))).toBe('identity_draft')
  })

  it('selects the shared faction ceremony without conflating it with a draft', () => {
    expect(resolveLobbyStartMode(storyIdentity('chosen_faction'))).toBe('faction_choice')
  })

  it('fails closed for a missing contract', () => {
    expect(resolveLobbyStartMode(undefined)).toBe('unsupported')
  })
})
