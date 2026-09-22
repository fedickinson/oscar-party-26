import { describe, it, expect } from 'vitest'
import { titleIconKey, type TitleIconKey } from './title-icon-map'

const LEGACY_TITLES = [
  'Caraxes', 'Vermithor', 'The Blacks', 'The Greens', 'House Hightower',
  'House Velaryon', 'Harrenhal', 'The Dragonseeds', 'The North',
  'House Stark', 'House Lannister', 'House Baratheon', 'House Blackwood',
  'Sinners', 'One Battle After Another', 'Marty Supreme', 'Hamnet',
  'Frankenstein', 'Sentimental Value', 'Bugonia', 'F1', 'Train Dreams',
  'The Secret Agent', 'KPop Demon Hunters',
]

describe('titleIconKey — the legacy chain is untouched', () => {
  it('still resolves the heraldry and the ceremony titles', () => {
    expect(titleIconKey('Caraxes', true)).toBe('dragon-head')
    expect(titleIconKey('The Blacks', true)).toBe('device-targaryen')
    expect(titleIconKey('The Greens', true)).toBe('green-crown')
    expect(titleIconKey('Harrenhal', true)).toBe('melted-tower')
    expect(titleIconKey('The Dragonseeds', true)).toBe('dragon-egg')
    expect(titleIconKey('House Hightower', true)).toBe('device-hightower')
    expect(titleIconKey('Sinners', true)).toBe('guitar')
    expect(titleIconKey('F1', true)).toBe('steering-wheel')
    expect(titleIconKey('KPop Demon Hunters', true)).toBe('demon-mic')
  })

  it('falls back to the heraldic shield for an unknown title', () => {
    expect(titleIconKey('The Fate of Ophelia', true)).toBe('heraldic-shield')
  })
})

describe('titleIconKey — a non-legacy pack sees no heraldry at all', () => {
  it('renders the neutral mark for a VMA title', () => {
    // The shield behind "The Fate of Ophelia" is the case this exists for.
    expect(titleIconKey('The Fate of Ophelia', false)).toBe('neutral')
    expect(titleIconKey('2026 VMA nominee', false)).toBe('neutral')
    expect(titleIconKey('', false)).toBe('neutral')
  })

  it('cannot hand any name a dragon, a house or an Academy nominee', () => {
    const heraldic = new Set<TitleIconKey>(LEGACY_TITLES.map((t) => titleIconKey(t, true)))
    expect(heraldic.size).toBeGreaterThan(1)
    for (const title of LEGACY_TITLES) {
      expect(titleIconKey(title, false)).toBe('neutral')
    }
    // Including the substring traps: an artist named for a house, a song with
    // a dragon's name in it.
    expect(titleIconKey('Stark', false)).toBe('neutral')
    expect(titleIconKey('Sunfyre', false)).toBe('neutral')
    expect(titleIconKey('Blackwood', false)).toBe('neutral')
  })
})
