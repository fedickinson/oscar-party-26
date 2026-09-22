import { describe, it, expect } from 'vitest'
import {
  NEUTRAL_AVATARS,
  NEUTRAL_AVATAR_PREFIX,
  PLAYER_AVATARS,
  getNeutralAvatarById,
  isNeutralAvatarId,
} from '../data/avatar-config'
import { AVATAR_CONFIGS } from '../data/avatars'
import { getAvatarById } from './avatar-utils'

describe('the neutral avatar set', () => {
  it('offers twelve marks, the same count as the sigil set', () => {
    expect(NEUTRAL_AVATARS).toHaveLength(12)
    expect(NEUTRAL_AVATARS).toHaveLength(PLAYER_AVATARS.length)
  })

  it('gives every mark a distinct id, name and shape', () => {
    expect(new Set(NEUTRAL_AVATARS.map((a) => a.id)).size).toBe(12)
    expect(new Set(NEUTRAL_AVATARS.map((a) => a.name)).size).toBe(12)
    expect(new Set(NEUTRAL_AVATARS.map((a) => a.shape)).size).toBe(12)
  })

  it('cannot collide with a legacy key, in either direction', () => {
    const legacyIds = [
      ...PLAYER_AVATARS.map((a) => a.id),
      ...AVATAR_CONFIGS.map((a) => a.id),
    ]
    for (const id of legacyIds) {
      expect(isNeutralAvatarId(id)).toBe(false)
      expect(getNeutralAvatarById(id)).toBeUndefined()
    }
    for (const mark of NEUTRAL_AVATARS) {
      expect(mark.id.startsWith(NEUTRAL_AVATAR_PREFIX)).toBe(true)
      expect(legacyIds).not.toContain(mark.id)
    }
  })

  it('names two tokens per mark and never a literal color', () => {
    for (const mark of NEUTRAL_AVATARS) {
      expect(mark.fieldToken).toMatch(/^--t-[a-z-]+$/)
      expect(mark.deviceToken).toMatch(/^--t-[a-z-]+$/)
      expect(mark.fieldToken).not.toBe(mark.deviceToken)
    }
  })

  it('carries no faction and no show in its words', () => {
    const words = NEUTRAL_AVATARS.map((a) => `${a.name} ${a.object}`.toLowerCase()).join(' ')
    for (const banned of ['black', 'green', 'house', 'dragon', 'sigil', 'oscar', 'film']) {
      expect(words).not.toContain(banned)
    }
  })
})

describe('getAvatarById resolves every key it is given', () => {
  it('resolves a neutral mark to a renderable config in token colors', () => {
    const config = getAvatarById('mark-ember')
    expect(config).toBeDefined()
    expect(config?.characterName).toBe('Ember')
    expect(config?.colorPrimary).toBe('var(--t-madder-light)')
    expect(config?.colorSecondary).toBe('var(--t-jet)')
    // A mark is drawn, never fetched — an image URL would 404.
    expect(config?.imageUrl).toBeUndefined()
  })

  it('still resolves both legacy sets unchanged', () => {
    expect(getAvatarById('targaryen')?.characterName).toBe('Targaryen')
    expect(getAvatarById('targaryen')?.imageUrl).toBe('/avatars/player/targaryen.webp')
    expect(getAvatarById('mbj-smoke')?.characterName).toBe('Smoke')
  })

  it('returns undefined for an unknown key rather than guessing', () => {
    expect(getAvatarById('mark-does-not-exist')).toBeUndefined()
    expect(getAvatarById('not-an-avatar')).toBeUndefined()
  })
})
