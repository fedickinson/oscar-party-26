import type { ShowPackGameContract } from '../types/game-contract'

export type LobbyStartMode = 'identity_draft' | 'faction_choice' | 'convictions' | 'unsupported'

/** Restrictive client projection of the room-bound contract's first ceremony. */
export function resolveLobbyStartMode(
  contract: ShowPackGameContract | null | undefined,
): LobbyStartMode {
  if (contract?.identity.selection === 'exclusive_entity_draft') return 'identity_draft'
  if (contract?.commitment !== 'open_conviction'
      || contract.identity.scoring !== 'none') return 'unsupported'
  if (contract.identity.selection === 'chosen_faction'
      && contract.scarcity.identity === 'shared') return 'faction_choice'
  if (contract.identity.selection === 'none'
      && contract.scarcity.identity === 'none') return 'convictions'
  return 'unsupported'
}
