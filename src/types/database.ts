export type RoomPhase =
  | 'lobby'
  | 'pre_draft'
  | 'draft'
  | 'confidence'
  | 'live'
  | 'finished'
  | 'hot_takes'
  | 'morning_after'

export type EntityType = 'person' | 'film'

export type BingoMarkStatus = 'pending' | 'approved' | 'denied'

// ─── rooms ───────────────────────────────────────────────────────────────────

export interface RoomRow {
  id: string
  code: string
  host_id: string
  phase: RoomPhase
  draft_order: unknown // jsonb — array of player ids
  current_pick: number
  ready_players: unknown // jsonb — array of player ids who tapped "Got it"
  ai_analysis: unknown // jsonb
  active_spotlight_category_id: number | null
  created_at: string
}

export interface RoomInsert {
  id?: string
  code: string
  host_id: string
  phase?: RoomPhase
  draft_order?: unknown
  current_pick?: number
  ready_players?: unknown
  ai_analysis?: unknown
  active_spotlight_category_id?: number | null
  created_at?: string
}

export interface RoomUpdate {
  id?: string
  code?: string
  host_id?: string
  phase?: RoomPhase
  draft_order?: unknown
  current_pick?: number
  ready_players?: unknown
  ai_analysis?: unknown
  active_spotlight_category_id?: number | null
  created_at?: string
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
}

export interface PlayerInsert {
  id?: string
  room_id: string
  name: string
  avatar_id: string
  color: string
  is_host?: boolean
  created_at?: string
}

export interface PlayerUpdate {
  id?: string
  room_id?: string
  name?: string
  avatar_id?: string
  color?: string
  is_host?: boolean
  created_at?: string
}

// ─── categories ──────────────────────────────────────────────────────────────

export interface CategoryRow {
  id: number
  name: string
  tier: number
  points: number
  display_order: number
  winner_id: string | null
}

export interface CategoryInsert {
  id?: number
  name: string
  tier: number
  points: number
  display_order: number
  winner_id?: string | null
}

export interface CategoryUpdate {
  id?: number
  name?: string
  tier?: number
  points?: number
  display_order?: number
  winner_id?: string | null
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

export interface DraftEntityRow {
  id: string
  name: string
  type: EntityType
  nominations: unknown // jsonb
  film_name: string
  nom_count: number
}

export interface DraftEntityInsert {
  id?: string
  name: string
  type: EntityType
  nominations?: unknown
  film_name: string
  nom_count?: number
}

export interface DraftEntityUpdate {
  id?: string
  name?: string
  type?: EntityType
  nominations?: unknown
  film_name?: string
  nom_count?: number
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

export interface BingoSquareRow {
  id: number
  text: string
  short_text: string
  is_objective: boolean
}

export interface BingoSquareInsert {
  id?: number
  text: string
  short_text: string
  is_objective: boolean
}

export interface BingoSquareUpdate {
  id?: number
  text?: string
  short_text?: string
  is_objective?: boolean
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

// ─── hot_takes ───────────────────────────────────────────────────────────────

export interface HotTakeRow {
  id: string
  room_id: string
  player_id: string
  text: string
  submitted_at: string
}

export interface HotTakeInsert {
  id?: string
  room_id: string
  player_id: string
  text: string
  submitted_at?: string
}

export interface HotTakeUpdate {
  id?: string
  room_id?: string
  player_id?: string
  text?: string
  submitted_at?: string
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
  // UUID for human players, or 'meryl' | 'nikki' | 'will' for AI companions (FK dropped in migration).
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
}

export interface RoomWinnerInsert {
  room_id: string
  category_id: number
  winner_id: string
}

export interface RoomWinnerUpdate {
  room_id?: string
  category_id?: number
  winner_id?: string
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
      draft_picks: { Row: DraftPickRow; Insert: DraftPickInsert; Update: DraftPickUpdate }
      confidence_picks: { Row: ConfidencePickRow; Insert: ConfidencePickInsert; Update: ConfidencePickUpdate }
      bingo_squares: { Row: BingoSquareRow; Insert: BingoSquareInsert; Update: BingoSquareUpdate }
      bingo_cards: { Row: BingoCardRow; Insert: BingoCardInsert; Update: BingoCardUpdate }
      bingo_marks: { Row: BingoMarkRow; Insert: BingoMarkInsert; Update: BingoMarkUpdate }
      hot_takes: { Row: HotTakeRow; Insert: HotTakeInsert; Update: HotTakeUpdate }
      avatars: { Row: AvatarRow; Insert: AvatarInsert; Update: AvatarUpdate }
      messages: { Row: MessageRow; Insert: MessageInsert; Update: MessageUpdate }
      room_winners: { Row: RoomWinnerRow; Insert: RoomWinnerInsert; Update: RoomWinnerUpdate }
    }
  }
}
