export type RoomPhase =
  | 'lobby'
  | 'pre_draft'
  | 'draft'
  | 'confidence'
  | 'live'
  | 'finished'

export type EnsembleMode = 'full' | 'stars_and_films' | 'films_only'
export type PrestigeMode = 'full' | 'main_stage' | 'big_night'

export type EntityType = 'person' | 'film'

export type BingoMarkStatus = 'pending' | 'approved' | 'denied'

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
}

export interface CategoryInsert {
  id?: number
  name: string
  tier: number
  points: number
  display_order: number
  winner_id?: string | null
  announced_at?: string | null
}

export interface CategoryUpdate {
  id?: number
  name?: string
  tier?: number
  points?: number
  display_order?: number
  winner_id?: string | null
  announced_at?: string | null
}

// ─── nominees ────────────────────────────────────────────────────────────────

export interface NomineeRow {
  id: string
  name: string
  type: EntityType
  film_name: string
  image_url: string
}

export interface NomineeInsert {
  id?: string
  name: string
  type: EntityType
  film_name: string
  image_url: string
}

export interface NomineeUpdate {
  id?: string
  name?: string
  type?: EntityType
  film_name?: string
  image_url?: string
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
}

export interface DraftEntityInsert {
  id?: string
  name: string
  type: EntityType
  nominations?: DraftEntityNomination[]
  film_name: string
  nom_count?: number
}

export interface DraftEntityUpdate {
  id?: string
  name?: string
  type?: EntityType
  nominations?: DraftEntityNomination[]
  film_name?: string
  nom_count?: number
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

// ─── Player verdicts (The Reckoning) ─────────────────────────────────────────

export interface PlayerVerdictRow {
  room_id: string
  player_id: string
  /** CompanionId of whoever wrote it. Deterministically assigned. */
  companion_id: string
  /** Computed honorific — see lib/night-awards.ts. Denormalised for the public view. */
  title: string
  verdict: string
  created_at: string
}

export interface PlayerVerdictInsert {
  room_id: string
  player_id: string
  companion_id: string
  title: string
  verdict: string
  created_at?: string
}

// ─── Database helper type ────────────────────────────────────────────────────

export interface Database {
  public: {
    Tables: {
      rooms: { Row: RoomRow; Insert: RoomInsert; Update: RoomUpdate }
      players: { Row: PlayerRow; Insert: PlayerInsert; Update: PlayerUpdate }
      categories: { Row: CategoryRow; Insert: CategoryInsert; Update: CategoryUpdate }
      nominees: { Row: NomineeRow; Insert: NomineeInsert; Update: NomineeUpdate }
      category_nominees: { Row: CategoryNomineeRow; Insert: CategoryNomineeInsert; Update: CategoryNomineeUpdate }
      draft_entities: { Row: DraftEntityRow; Insert: DraftEntityInsert; Update: DraftEntityUpdate }
      signature_beats: { Row: SignatureBeatRow; Insert: SignatureBeatInsert; Update: SignatureBeatUpdate }
      draft_picks: { Row: DraftPickRow; Insert: DraftPickInsert; Update: DraftPickUpdate }
      beat_activations: { Row: BeatActivationRow; Insert: BeatActivationInsert; Update: BeatActivationUpdate }
      player_verdicts: { Row: PlayerVerdictRow; Insert: PlayerVerdictInsert; Update: Partial<PlayerVerdictInsert> }
      confidence_picks: { Row: ConfidencePickRow; Insert: ConfidencePickInsert; Update: ConfidencePickUpdate }
      bingo_squares: { Row: BingoSquareRow; Insert: BingoSquareInsert; Update: BingoSquareUpdate }
      bingo_cards: { Row: BingoCardRow; Insert: BingoCardInsert; Update: BingoCardUpdate }
      bingo_marks: { Row: BingoMarkRow; Insert: BingoMarkInsert; Update: BingoMarkUpdate }
      avatars: { Row: AvatarRow; Insert: AvatarInsert; Update: AvatarUpdate }
      messages: { Row: MessageRow; Insert: MessageInsert; Update: MessageUpdate }
      room_winners: { Row: RoomWinnerRow; Insert: RoomWinnerInsert; Update: RoomWinnerUpdate }
    }
  }
}
