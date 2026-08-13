import type { ShowPackGameContract } from './game-contract'

export type RoomPhase =
  | 'lobby'
  | 'pre_draft'
  | 'draft'
  | 'confidence'
  | 'live'
  | 'finished'
  | 'closed'

export type EnsembleMode = 'full' | 'stars_and_films' | 'films_only'
export type PrestigeMode = 'full' | 'main_stage' | 'big_night'
export type GameModel = 'legacy_ensemble' | 'conviction_portfolio'

export type EntityType = 'person' | 'film'

export type BingoMarkStatus = 'pending' | 'approved' | 'denied'

export type SettlementBingoMode = 'preserve_live' | 'replace'
export type SettlementOutcome = 'resolved' | 'void'
export type ShowPackStatus = 'draft' | 'published' | 'retired'
export interface SettlementWarrant {
  verdict: 'true'
  sources: Array<{ kind: string; ref: string }>
}

// ─── rooms ───────────────────────────────────────────────────────────────────

export interface RoomRow {
  id: string
  code: string
  host_id: string
  phase: RoomPhase
  draft_order: string[] // jsonb — array of player ids
  current_pick: number
  ready_players: string[] // jsonb — array of player ids who tapped "Got it"
  active_spotlight_category_id: number | null
  spotlight_revision?: number
  spotlight_opened_at?: string | null
  show_started: boolean
  created_at: string
  // Game depth modes — added in migration add_game_modes.sql
  ensemble_mode?: EnsembleMode
  prestige_mode?: PrestigeMode
  // ── Remote co-watch sync (migration 20260809_watch_sync.sql) ──────────────
  // Two playbacks, not six: one screen in New York, one remote viewer. The
  // beacon is "I was at X at wall-clock T" — readers age it by transit time.
  sync_position_ms?: number | null
  sync_posted_at?: string | null
  sync_posted_by?: string | null
  is_paused?: boolean
  /** Set when someone asks; cleared when the point person actually pauses. */
  pause_requested_by?: string | null
  pause_reason?: string | null
  paused_at_ms?: number | null
  resume_ready?: string[]
  /** Two playbacks, two controllers: the room's remote-holder and the remote viewer. */
  point_person_ids?: string[]
  /** Wall clock both playbacks press play at. Drives the synced countdown. */
  resume_at?: string | null
  episode_started_at?: string | null
  /** When the pre-draft 3-2-1 began. Shared so every client derives the same count. */
  countdown_started_at?: string | null
  /** The researched record selected by the settlement command. */
  active_settlement_id?: string | null
  /** Immutable authored catalog version selected for this room. */
  show_pack_id: string
  /** Legacy character ownership or the show-neutral open belief portfolio. */
  game_model?: GameModel
  /** Immutable resolved behavior contract copied from the bound show pack. */
  game_contract?: ShowPackGameContract
  /** Realtime invalidation counter for the private host witness queue. */
  witness_revision?: number
  /** Realtime invalidation counter for blocked companion prose reviews. */
  grounding_review_revision?: number
  /** Realtime invalidation counter for operator capability issuance and rotation. */
  operator_capability_revision?: number
}

export interface RoomInsert {
  id?: string
  code: string
  host_id: string
  phase?: RoomPhase
  draft_order?: string[]
  current_pick?: number
  ready_players?: string[]
  active_spotlight_category_id?: number | null
  spotlight_revision?: number
  spotlight_opened_at?: string | null
  show_started?: boolean
  created_at?: string
  ensemble_mode?: EnsembleMode
  prestige_mode?: PrestigeMode
  // ── Remote co-watch sync (migration 20260809_watch_sync.sql) ──────────────
  // Two playbacks, not six: one screen in New York, one remote viewer. The
  // beacon is "I was at X at wall-clock T" — readers age it by transit time.
  sync_position_ms?: number | null
  sync_posted_at?: string | null
  sync_posted_by?: string | null
  is_paused?: boolean
  /** Set when someone asks; cleared when the point person actually pauses. */
  pause_requested_by?: string | null
  pause_reason?: string | null
  paused_at_ms?: number | null
  resume_ready?: string[]
  /** Two playbacks, two controllers: the room's remote-holder and the remote viewer. */
  point_person_ids?: string[]
  /** Wall clock both playbacks press play at. Drives the synced countdown. */
  resume_at?: string | null
  episode_started_at?: string | null
  /** When the pre-draft 3-2-1 began. Shared so every client derives the same count. */
  countdown_started_at?: string | null
  active_settlement_id?: string | null
  show_pack_id?: string
  game_model?: GameModel
  game_contract?: ShowPackGameContract
  operator_capability_revision?: number
}

export interface RoomUpdate {
  id?: string
  code?: string
  host_id?: string
  phase?: RoomPhase
  draft_order?: string[]
  current_pick?: number
  ready_players?: string[]
  active_spotlight_category_id?: number | null
  spotlight_revision?: number
  spotlight_opened_at?: string | null
  show_started?: boolean
  created_at?: string
  ensemble_mode?: EnsembleMode
  prestige_mode?: PrestigeMode
  // ── Remote co-watch sync (migration 20260809_watch_sync.sql) ──────────────
  // Two playbacks, not six: one screen in New York, one remote viewer. The
  // beacon is "I was at X at wall-clock T" — readers age it by transit time.
  sync_position_ms?: number | null
  sync_posted_at?: string | null
  sync_posted_by?: string | null
  is_paused?: boolean
  /** Set when someone asks; cleared when the point person actually pauses. */
  pause_requested_by?: string | null
  pause_reason?: string | null
  paused_at_ms?: number | null
  resume_ready?: string[]
  /** Two playbacks, two controllers: the room's remote-holder and the remote viewer. */
  point_person_ids?: string[]
  /** Wall clock both playbacks press play at. Drives the synced countdown. */
  resume_at?: string | null
  episode_started_at?: string | null
  /** When the pre-draft 3-2-1 began. Shared so every client derives the same count. */
  countdown_started_at?: string | null
  active_settlement_id?: string | null
  show_pack_id?: string
  game_model?: GameModel
  game_contract?: ShowPackGameContract
  operator_capability_revision?: number
}

// ─── show_packs ─────────────────────────────────────────────────────────────

export interface ShowPackRow {
  id: string
  pack_key: string
  version: number
  title: string
  property: string
  installment: string
  fact_source: 'scheduled' | 'room_declared' | 'ai_witnessed'
  game_contract: ShowPackGameContract | null
  manifest_sha256: string | null
  compiled_bundle: unknown | null
  status: ShowPackStatus
  published_at: string | null
  created_at: string
}

export interface ShowPackInsert {
  id: string
  pack_key: string
  version: number
  title: string
  property: string
  installment: string
  fact_source: ShowPackRow['fact_source']
  game_contract?: ShowPackGameContract | null
  manifest_sha256?: string | null
  compiled_bundle?: unknown | null
  status?: ShowPackStatus
  published_at?: string | null
  created_at?: string
}

export type ShowPackUpdate = Partial<ShowPackInsert>

/** Structured authoring evidence retained beside each normalized wager row. */
export interface TriggerContractRow {
  truth_authority?: 'official_result' | 'operator_declaration' | 'ai_proposal_human_confirmation'
  title: string
  condition: string
  exclusions: string[]
  adjudication: {
    proxies: 'count' | 'do_not_count' | 'explicit_only' | 'principal_accepts_if_unrefused'
    offscreen: 'count' | 'do_not_count' | 'explicit_only' | 'principal_accepts_if_unrefused'
    mentions: 'count' | 'do_not_count' | 'explicit_only' | 'principal_accepts_if_unrefused'
  }
  title_review: {
    status: 'approved'
    note: string
  }
  basis_claim_ids: string[]
}

// ─── players ─────────────────────────────────────────────────────────────────

export interface PlayerRow {
  id: string
  room_id: string
  name: string
  avatar_id: string
  color: string
  is_host: boolean
  created_at: string
  /** Which screen this player watches on. Players sharing a group share a playback. */
  watch_group?: string | null
  episode_started_at?: string | null
  team?: 'black' | 'green' | null
  previous_team?: 'black' | 'green' | null
  team_revision?: number
  welcomed_at?: string | null
  /** The one person per watch group who controls playback. */
  is_remote_holder?: boolean
}

export interface PlayerInsert {
  id?: string
  room_id: string
  name: string
  avatar_id: string
  color: string
  is_host?: boolean
  created_at?: string
  /** Which screen this player watches on. Players sharing a group share a playback. */
  watch_group?: string | null
  episode_started_at?: string | null
  team?: 'black' | 'green' | null
  previous_team?: 'black' | 'green' | null
  team_revision?: number
  welcomed_at?: string | null
  /** The one person per watch group who controls playback. */
  is_remote_holder?: boolean
}

export interface PlayerUpdate {
  id?: string
  room_id?: string
  name?: string
  avatar_id?: string
  color?: string
  is_host?: boolean
  created_at?: string
  /** Which screen this player watches on. Players sharing a group share a playback. */
  watch_group?: string | null
  episode_started_at?: string | null
  team?: 'black' | 'green' | null
  previous_team?: 'black' | 'green' | null
  team_revision?: number
  welcomed_at?: string | null
  /** The one person per watch group who controls playback. */
  is_remote_holder?: boolean
}

// ─── categories ──────────────────────────────────────────────────────────────

export interface CategoryRow {
  id: number
  name: string
  tier: number
  points: number
  display_order: number
  winner_id: string | null
  /** Second winner in a tie — null for normal (non-tie) categories */
  tie_winner_id: string | null
  announced_at: string | null
  show_pack_id?: string | null
  room_id?: string | null
  pack_key?: string | null
  trigger_contract?: TriggerContractRow | null
  /** Canonical authored beat this room declaration adjudicated. */
  source_signature_beat_id?: number | null
  /** Exact reviewed rule frozen when the declaration was made. */
  source_trigger_contract?: TriggerContractRow | null
}

export interface CategoryInsert {
  id?: number
  name: string
  tier: number
  points: number
  display_order: number
  winner_id?: string | null
  announced_at?: string | null
  show_pack_id?: string | null
  room_id?: string | null
  pack_key?: string | null
  trigger_contract?: TriggerContractRow | null
  source_signature_beat_id?: number | null
  source_trigger_contract?: TriggerContractRow | null
}

export interface CategoryUpdate {
  id?: number
  name?: string
  tier?: number
  points?: number
  display_order?: number
  winner_id?: string | null
  announced_at?: string | null
  show_pack_id?: string | null
  room_id?: string | null
  pack_key?: string | null
  trigger_contract?: TriggerContractRow | null
  source_signature_beat_id?: number | null
  source_trigger_contract?: TriggerContractRow | null
}

// ─── nominees ────────────────────────────────────────────────────────────────

export interface NomineeRow {
  id: string
  name: string
  type: EntityType
  film_name: string
  image_url: string
  show_pack_id?: string
  pack_key?: string | null
}

export interface NomineeInsert {
  id?: string
  name: string
  type: EntityType
  film_name: string
  image_url: string
  show_pack_id?: string
  pack_key?: string | null
}

export interface NomineeUpdate {
  id?: string
  name?: string
  type?: EntityType
  film_name?: string
  image_url?: string
  show_pack_id?: string
  pack_key?: string | null
}

// ─── category_nominees ───────────────────────────────────────────────────────

export interface CategoryNomineeRow {
  category_id: number
  nominee_id: string
}

export interface CategoryNomineeInsert {
  category_id: number
  nominee_id: string
}

export interface CategoryNomineeUpdate {
  category_id?: number
  nominee_id?: string
}

// ─── draft_entities ──────────────────────────────────────────────────────────

/** Shape of each entry in the draft_entities.nominations JSONB array */
export interface DraftEntityNomination {
  category_id: number
  nominee_id?: string
  category_name?: string
  points?: number
}

export interface DraftEntityRow {
  id: string
  name: string
  type: EntityType
  nominations: DraftEntityNomination[] // jsonb
  film_name: string
  nom_count: number
  show_pack_id?: string
  pack_key?: string | null
}

export interface DraftEntityInsert {
  id?: string
  name: string
  type: EntityType
  nominations?: DraftEntityNomination[]
  film_name: string
  nom_count?: number
  show_pack_id?: string
  pack_key?: string | null
}

export interface DraftEntityUpdate {
  id?: string
  name?: string
  type?: EntityType
  nominations?: DraftEntityNomination[]
  film_name?: string
  nom_count?: number
  show_pack_id?: string
  pack_key?: string | null
}

// ─── signature_beats ─────────────────────────────────────────────────────────

export interface SignatureBeatRow {
  id: number
  entity_id: string
  name: string
  trigger_text: string
  odds: string
  points: number
  pitch: string
  partner_entity_id: string | null
  show_pack_id?: string
  pack_key?: string | null
  trigger_contract?: TriggerContractRow | null
}

export interface SignatureBeatInsert {
  id?: number
  entity_id: string
  name: string
  trigger_text: string
  odds: string
  points: number
  pitch: string
  partner_entity_id?: string | null
  show_pack_id?: string
  pack_key?: string | null
  trigger_contract?: TriggerContractRow | null
}

export interface SignatureBeatUpdate {
  id?: number
  entity_id?: string
  name?: string
  trigger_text?: string
  odds?: string
  points?: number
  pitch?: string
  partner_entity_id?: string | null
  show_pack_id?: string
  pack_key?: string | null
  trigger_contract?: TriggerContractRow | null
}

// ─── draft_picks ─────────────────────────────────────────────────────────────

export interface DraftPickRow {
  id: string
  room_id: string
  player_id: string
  entity_id: string
  round: number
  pick_number: number
  created_at: string
}

export interface DraftPickInsert {
  id?: string
  room_id: string
  player_id: string
  entity_id: string
  round: number
  pick_number: number
  created_at?: string
}

export interface DraftPickUpdate {
  id?: string
  room_id?: string
  player_id?: string
  entity_id?: string
  round?: number
  pick_number?: number
  created_at?: string
}

// ─── beat_activations ────────────────────────────────────────────────────────

export interface BeatActivationRow {
  room_id: string
  player_id: string
  beat_id: number
  created_at: string
}

export interface BeatActivationInsert {
  room_id: string
  player_id: string
  beat_id: number
  created_at?: string
}

export interface BeatActivationUpdate {
  room_id?: string
  player_id?: string
  beat_id?: number
  created_at?: string
}

// ─── conviction_picks ───────────────────────────────────────────────────────

/** One equal-weight pre-show belief slot. The authored beat owns the payout. */
export interface ConvictionPickRow {
  room_id: string
  player_id: string
  beat_id: number
  created_at: string
}

export interface ConvictionPickInsert {
  room_id: string
  player_id: string
  beat_id: number
  created_at?: string
}

export interface ConvictionPickUpdate {
  room_id?: string
  player_id?: string
  beat_id?: number
  created_at?: string
}

// ─── confidence_picks ────────────────────────────────────────────────────────

export interface ConfidencePickRow {
  id: string
  room_id: string
  player_id: string
  category_id: number
  nominee_id: string
  confidence: number // 1–24
  is_correct: boolean | null
  created_at: string
}

export interface ConfidencePickInsert {
  id?: string
  room_id: string
  player_id: string
  category_id: number
  nominee_id: string
  confidence: number
  is_correct?: boolean | null
  created_at?: string
}

export interface ConfidencePickUpdate {
  id?: string
  room_id?: string
  player_id?: string
  category_id?: number
  nominee_id?: string
  confidence?: number
  is_correct?: boolean | null
  created_at?: string
}

// ─── bingo_squares ───────────────────────────────────────────────────────────

/**
 * Estimated chance the square's win condition happens at least once in the
 * finale. Set by the researcher who built the master pool, not measured.
 *   likely 60-100% · toss_up 40-59% · long_shot 20-39% · chaos 0-19%
 */
export type LikelihoodTier = 'likely' | 'toss_up' | 'long_shot' | 'chaos'

export interface BingoSquareRow {
  id: number
  text: string
  short_text: string
  is_objective: boolean
  /** Stable content key from the master pool (e.g. 'dragon_dies') */
  slug: string
  /** Grid tile label — same value as short_text */
  title: string
  /** The strict adjudication rule, including what does NOT count */
  win_condition: string
  probability_pct: number
  likelihood_tier: LikelihoodTier
  category: string | null
  why_it_is_fun: string | null
  /** Storyline threads this square belongs to — used to keep boards varied */
  storyline_tags: string[] | null
  fun_type: string | null
  show_pack_id?: string
  pack_key?: string | null
  trigger_contract?: TriggerContractRow | null
}

export interface BingoSquareInsert {
  id?: number
  text: string
  short_text: string
  is_objective: boolean
  slug: string
  title: string
  win_condition: string
  probability_pct: number
  likelihood_tier: LikelihoodTier
  category?: string | null
  why_it_is_fun?: string | null
  storyline_tags?: string[] | null
  fun_type?: string | null
  show_pack_id?: string
  pack_key?: string | null
  trigger_contract?: TriggerContractRow | null
}

export interface BingoSquareUpdate {
  id?: number
  text?: string
  short_text?: string
  is_objective?: boolean
  slug?: string
  title?: string
  win_condition?: string
  probability_pct?: number
  likelihood_tier?: LikelihoodTier
  category?: string | null
  why_it_is_fun?: string | null
  storyline_tags?: string[] | null
  fun_type?: string | null
  show_pack_id?: string
  pack_key?: string | null
  trigger_contract?: TriggerContractRow | null
}

// ─── bingo_cards ─────────────────────────────────────────────────────────────

export interface BingoCardRow {
  id: string
  room_id: string
  player_id: string
  squares: number[] // jsonb — array of 25 bingo_square ids
  created_at: string
}

export interface BingoCardInsert {
  id?: string
  room_id: string
  player_id: string
  squares: number[]
  created_at?: string
}

export interface BingoCardUpdate {
  id?: string
  room_id?: string
  player_id?: string
  squares?: number[]
  created_at?: string
}

// ─── bingo_marks ─────────────────────────────────────────────────────────────

export interface BingoMarkRow {
  id: string
  card_id: string
  square_index: number // 0–24
  status: BingoMarkStatus
  marked_at: string
}

export interface BingoMarkInsert {
  id?: string
  card_id: string
  square_index: number
  status?: BingoMarkStatus
  marked_at?: string
}

export interface BingoMarkUpdate {
  id?: string
  card_id?: string
  square_index?: number
  status?: BingoMarkStatus
  marked_at?: string
}

// ─── avatars ─────────────────────────────────────────────────────────────────

export interface AvatarRow {
  id: string
  character_name: string
  actor_name: string
  film_name: string
  image_happy: string
  image_sad: string
  image_shocked: string
  image_neutral: string
}

export interface AvatarInsert {
  id: string
  character_name: string
  actor_name: string
  film_name: string
  image_happy: string
  image_sad: string
  image_shocked: string
  image_neutral: string
}

export interface AvatarUpdate {
  id?: string
  character_name?: string
  actor_name?: string
  film_name?: string
  image_happy?: string
  image_sad?: string
  image_shocked?: string
  image_neutral?: string
}

// ─── messages ─────────────────────────────────────────────────────────────────

export interface MessageRow {
  id: string
  room_id: string
  // UUID for human players, or a companion id from data/ai-companions.ts for AI
  // companions, or 'system' / 'winner-divider' / 'film-link' for synthetic rows.
  // The FK was dropped in migration precisely to allow these non-UUID authors.
  player_id: string
  text: string
  created_at: string
}

export interface MessageInsert {
  id?: string
  room_id: string
  player_id: string
  text: string
  created_at?: string
}

export interface MessageUpdate {
  id?: string
  room_id?: string
  player_id?: string
  text?: string
  created_at?: string
}

// ─── room_winners ─────────────────────────────────────────────────────────────

export interface RoomWinnerRow {
  room_id: string
  category_id: number
  winner_id: string
  tie_winner_id: string | null
}

export interface RoomWinnerInsert {
  room_id: string
  category_id: number
  winner_id: string
  tie_winner_id?: string | null
}

export interface RoomWinnerUpdate {
  room_id?: string
  category_id?: number
  winner_id?: string
  tie_winner_id?: string | null
}

// ─── Settled room record ─────────────────────────────────────────────────────

export interface RoomSettlementRow {
  id: string
  room_id: string
  version: number
  manifest_hash: string
  title: string
  actor: string
  bingo_mode: SettlementBingoMode
  supersedes_id: string | null
  created_at: string
}

export interface RoomSettlementInsert {
  id?: string
  room_id: string
  version: number
  manifest_hash: string
  title: string
  actor: string
  bingo_mode: SettlementBingoMode
  supersedes_id?: string | null
  created_at?: string
}

export interface RoomSettlementUpdate {
  title?: string
  actor?: string
}

export interface RoomSettlementEntryRow {
  id: number
  settlement_id: string
  entry_key: string
  name: string
  category_id: number | null
  outcome: SettlementOutcome
  points: number
  winner_id: string | null
  tie_winner_id: string | null
  display_order: number
  occurred_at: string | null
  warrant: SettlementWarrant
}

export interface RoomSettlementEntryInsert {
  id?: number
  settlement_id: string
  entry_key: string
  name: string
  category_id?: number | null
  outcome: SettlementOutcome
  points: number
  winner_id?: string | null
  tie_winner_id?: string | null
  display_order: number
  occurred_at?: string | null
  warrant: SettlementWarrant
}

export type RoomSettlementEntryUpdate = never

export interface RoomSettlementBingoMarkRow {
  settlement_id: string
  card_id: string
  square_index: number
  marked_at: string
  warrant: SettlementWarrant
}

export interface RoomSettlementBingoMarkInsert {
  settlement_id: string
  card_id: string
  square_index: number
  marked_at?: string
  warrant: SettlementWarrant
}

export type RoomSettlementBingoMarkUpdate = never

// ─── Operator engine heartbeats ─────────────────────────────────────────────

export type OperatorEngine = 'companion_daemon'

export interface OperatorHeartbeatRow {
  room_id: string
  engine: OperatorEngine
  instance_id: string
  started_at: string
  heartbeat_at: string
}

export interface OperatorHeartbeatInsert {
  room_id: string
  engine: OperatorEngine
  instance_id: string
  started_at?: string
  heartbeat_at?: string
}

export type OperatorHeartbeatUpdate = Partial<OperatorHeartbeatInsert>

// ─── AI witness proposals ───────────────────────────────────────────────────

export type WitnessProposalStatus = 'pending' | 'accepted' | 'dismissed'

export interface WitnessProposalRow {
  id: string
  room_id: string
  source_signature_beat_id: number
  entity_id: string
  confidence: number
  observed_at: string
  frame_sha256: string
  reference_manifest_sha256: string
  reference_images_sha256: string
  model_output_sha256: string
  model: string
  source_candidate: unknown
  status: WitnessProposalStatus
  declaration_category_id: number | null
  reviewed_entity_id: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
}

export interface WitnessProposalInsert {
  id?: string
  room_id: string
  source_signature_beat_id: number
  entity_id: string
  confidence: number
  observed_at: string
  frame_sha256: string
  reference_manifest_sha256: string
  reference_images_sha256: string
  model_output_sha256: string
  model: string
  source_candidate: unknown
  status?: WitnessProposalStatus
  declaration_category_id?: number | null
  reviewed_entity_id?: string | null
  reviewed_by?: string | null
  reviewed_at?: string | null
  created_at?: string
}

export type WitnessProposalUpdate = Partial<WitnessProposalInsert>

export interface WitnessSupportingObservationRow {
  id: string
  proposal_id: string
  room_id: string
  entity_id: string
  confidence: number
  observed_at: string
  frame_sha256: string
  reference_manifest_sha256: string
  reference_images_sha256: string
  model_output_sha256: string
  model: string
  created_at: string
}

export interface WitnessSupportingObservationInsert {
  id?: string
  proposal_id: string
  room_id: string
  entity_id: string
  confidence: number
  observed_at: string
  frame_sha256: string
  reference_manifest_sha256: string
  reference_images_sha256: string
  model_output_sha256: string
  model: string
  created_at?: string
}

export type WitnessSupportingObservationUpdate = Partial<WitnessSupportingObservationInsert>

// ─── Player verdicts (The Reckoning) ─────────────────────────────────────────

export interface PlayerVerdictRow {
  room_id: string
  player_id: string
  /** CompanionId of whoever wrote it. Deterministically assigned. */
  companion_id: string
  /**
   * The honorific shown on the keepsake. Written by the companion when the
   * generation succeeded; otherwise the computed pool title from
   * lib/night-awards.ts. Denormalised so the public view is self-contained.
   */
  title: string
  verdict: string
  /** Chat lines the companion chose for this player, with its reason for each. */
  highlights: Array<{ message_id: string; note: string }>
  /** Artwork chosen per slot. Slugs resolve against src/data/image-library.ts. */
  imagery: Array<{ slot: string; slug: string; note: string }>
  grounding_reaction_key: string | null
  grounding_facts: string[] | null
  grounding_attempts: number | null
  grounding_model: string | null
  grounded_at: string | null
  created_at: string
}

export interface PlayerVerdictInsert {
  room_id: string
  player_id: string
  companion_id: string
  title: string
  verdict: string
  highlights?: Array<{ message_id: string; note: string }>
  imagery?: Array<{ slot: string; slug: string; note: string }>
  grounding_reaction_key?: string | null
  grounding_facts?: string[] | null
  grounding_attempts?: number | null
  grounding_model?: string | null
  grounded_at?: string | null
  created_at?: string
}

// ─── Database helper type ────────────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      rooms: { Row: RoomRow; Insert: RoomInsert; Update: RoomUpdate }
      show_packs: { Row: ShowPackRow; Insert: ShowPackInsert; Update: ShowPackUpdate }
      players: { Row: PlayerRow; Insert: PlayerInsert; Update: PlayerUpdate }
      categories: { Row: CategoryRow; Insert: CategoryInsert; Update: CategoryUpdate }
      nominees: { Row: NomineeRow; Insert: NomineeInsert; Update: NomineeUpdate }
      category_nominees: { Row: CategoryNomineeRow; Insert: CategoryNomineeInsert; Update: CategoryNomineeUpdate }
      draft_entities: { Row: DraftEntityRow; Insert: DraftEntityInsert; Update: DraftEntityUpdate }
      signature_beats: { Row: SignatureBeatRow; Insert: SignatureBeatInsert; Update: SignatureBeatUpdate }
      draft_picks: { Row: DraftPickRow; Insert: DraftPickInsert; Update: DraftPickUpdate }
      beat_activations: { Row: BeatActivationRow; Insert: BeatActivationInsert; Update: BeatActivationUpdate }
      conviction_picks: { Row: ConvictionPickRow; Insert: ConvictionPickInsert; Update: ConvictionPickUpdate }
      player_verdicts: { Row: PlayerVerdictRow; Insert: PlayerVerdictInsert; Update: Partial<PlayerVerdictInsert> }
      confidence_picks: { Row: ConfidencePickRow; Insert: ConfidencePickInsert; Update: ConfidencePickUpdate }
      bingo_squares: { Row: BingoSquareRow; Insert: BingoSquareInsert; Update: BingoSquareUpdate }
      bingo_cards: { Row: BingoCardRow; Insert: BingoCardInsert; Update: BingoCardUpdate }
      bingo_marks: { Row: BingoMarkRow; Insert: BingoMarkInsert; Update: BingoMarkUpdate }
      avatars: { Row: AvatarRow; Insert: AvatarInsert; Update: AvatarUpdate }
      messages: { Row: MessageRow; Insert: MessageInsert; Update: MessageUpdate }
      room_winners: { Row: RoomWinnerRow; Insert: RoomWinnerInsert; Update: RoomWinnerUpdate }
      room_settlements: { Row: RoomSettlementRow; Insert: RoomSettlementInsert; Update: RoomSettlementUpdate }
      room_settlement_entries: { Row: RoomSettlementEntryRow; Insert: RoomSettlementEntryInsert; Update: RoomSettlementEntryUpdate }
      room_settlement_bingo_marks: { Row: RoomSettlementBingoMarkRow; Insert: RoomSettlementBingoMarkInsert; Update: RoomSettlementBingoMarkUpdate }
      operator_heartbeats: { Row: OperatorHeartbeatRow; Insert: OperatorHeartbeatInsert; Update: OperatorHeartbeatUpdate }
      witness_proposals: { Row: WitnessProposalRow; Insert: WitnessProposalInsert; Update: WitnessProposalUpdate }
      witness_supporting_observations: {
        Row: WitnessSupportingObservationRow
        Insert: WitnessSupportingObservationInsert
        Update: WitnessSupportingObservationUpdate
      }
    }
  }
}
