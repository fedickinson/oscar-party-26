/**
 * avatar-utils.ts — pure utilities for avatar display logic.
 *
 * getAvatarById: instant config lookup from static data.
 * getAvatarEmotion: derives an emotion from a recent-events array.
 *   Priority (highest first): bingo/points_gained → happy,
 *   wrong_pick/points_lost → sad, upset → shocked, else → neutral.
 *   Events outside their time window are ignored.
 */

import { AVATAR_CONFIGS } from '../data/avatars'
import type { AvatarConfig } from '../data/avatars'

export type AvatarEmotion = 'happy' | 'sad' | 'shocked' | 'neutral'

export interface GameEvent {
  type: 'points_gained' | 'points_lost' | 'bingo' | 'upset' | 'wrong_pick'
  timestamp: number // Date.now() value
}

export function getAvatarById(id: string): AvatarConfig | undefined {
  return AVATAR_CONFIGS.find((a) => a.id === id)
}

export function getAvatarEmotion(recentEvents: GameEvent[]): AvatarEmotion {
  const now = Date.now()

  const within10 = (e: GameEvent) => now - e.timestamp < 10_000
  const within30 = (e: GameEvent) => now - e.timestamp < 30_000

  if (recentEvents.some((e) => within10(e) && (e.type === 'points_gained' || e.type === 'bingo'))) {
    return 'happy'
  }
  if (recentEvents.some((e) => within10(e) && (e.type === 'wrong_pick' || e.type === 'points_lost'))) {
    return 'sad'
  }
  if (recentEvents.some((e) => within30(e) && e.type === 'upset')) {
    return 'shocked'
  }

  return 'neutral'
}
