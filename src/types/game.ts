import type {
  AvatarRow,
  BingoMarkStatus,
  CategoryRow,
  DraftEntityRow,
  EntityType,
  NomineeRow,
  PlayerRow,
  RoomPhase,
} from './database'

// Re-export primitives so callers can import from one place
export type { RoomPhase, EntityType, BingoMarkStatus }

export type AvatarEmotion = 'happy' | 'sad' | 'shocked' | 'neutral'

// ─── Nomination link (join table entry) ──────────────────────────────────────

export interface NominationLink {
  category_id: number
  nominee_id: string
}

// ─── Category with its nominees hydrated ─────────────────────────────────────

export interface CategoryWithNominees extends CategoryRow {
  nominees: NomineeRow[]
}

// ─── Draft entity with nominations parsed from jsonb ─────────────────────────

export interface DraftNomination {
  category_id: number
  category_name: string
  points: number
}

export interface DraftEntityWithDetails extends Omit<DraftEntityRow, 'nominations'> {
  nominations: DraftNomination[]
}

// ─── Player with their chosen avatar ─────────────────────────────────────────

export interface PlayerWithAvatar extends PlayerRow {
  avatar: AvatarRow
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  player: PlayerWithAvatar
  fantasyScore: number
  confidenceScore: number
  bingoScore: number
  totalScore: number
}
