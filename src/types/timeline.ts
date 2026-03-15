// src/types/timeline.ts
export interface PlayerScoreDetail {
  cumulative: number
  delta: number
  source: 'confidence' | 'draft' | 'both' | 'none'
}

export interface TimelinePoint {
  categoryIndex: number
  categoryName: string
  winnerName: string
  winnerFilm: string
  playerScores: Record<string, PlayerScoreDetail>
}

export interface TurningPoint {
  categoryIndex: number
  categoryName: string
  description: string
}

export interface HeadToHead {
  playerA: string
  playerB: string
  categoriesNeck: number
  narrative: string
}
