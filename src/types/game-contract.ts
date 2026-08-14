export type GameContractCommitment =
  | 'confidence_allocation'
  | 'open_conviction'
  | 'season_thesis'

export interface ShowPackGameContract {
  version: 1
  commitment: GameContractCommitment
  conviction_budget: number | null
  identity: {
    selection: 'none' | 'exclusive_entity_draft' | 'chosen_faction'
    scoring: 'none' | 'ensemble'
  }
  scarcity: {
    commitments: 'none' | 'ranked_allocation' | 'fixed_budget'
    identity: 'none' | 'shared' | 'exclusive'
  }
  visibility: 'open_counts' | 'sealed_until_lock' | 'hidden_until_resolution'
  cadence: 'immediate_per_outcome' | 'immediate_facts_and_event_close' | 'installment_and_season_close'
  continuity: 'no_carryover' | 'canon_write_back' | 'cumulative_standings_and_canon'
}
