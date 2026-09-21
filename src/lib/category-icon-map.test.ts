import { describe, it, expect } from 'vitest'
import { categoryIconKey } from './category-icon-map'

describe('categoryIconKey — the legacy map is untouched', () => {
  it('keeps the ceremony wording on its original icons', () => {
    expect(categoryIconKey('Best Picture', true)).toBe('oscar-trophy')
    expect(categoryIconKey('Best Director', true)).toBe('swords')
    expect(categoryIconKey('Best Supporting Actress', true)).toBe('user')
    expect(categoryIconKey('Best Adapted Screenplay', true)).toBe('book-open')
    expect(categoryIconKey('Best Original Screenplay', true)).toBe('pen-line')
    expect(categoryIconKey('Best Cinematography', true)).toBe('aperture')
    expect(categoryIconKey('Best Original Song', true)).toBe('mic')
    expect(categoryIconKey('Best Production Design', true)).toBe('palette')
    expect(categoryIconKey('Best Sound', true)).toBe('volume')
  })

  it('falls back to a film strip', () => {
    expect(categoryIconKey('The Fate of Ophelia', true)).toBe('film')
    expect(categoryIconKey('Video of the Year', true)).toBe('film')
  })
})

describe('categoryIconKey — the music map', () => {
  it('reads the top of the card', () => {
    expect(categoryIconKey('Video of the Year', false)).toBe('trophy')
    expect(categoryIconKey('Artist of the Year', false)).toBe('star')
    expect(categoryIconKey('Song of the Year', false)).toBe('music')
    expect(categoryIconKey('Best New Artist', false)).toBe('sparkles')
    expect(categoryIconKey('Album of the Year', false)).toBe('disc3')
    expect(categoryIconKey('Best Collaboration', false)).toBe('users')
    expect(categoryIconKey('Group of the Year', false)).toBe('users')
    expect(categoryIconKey('Best Long Form Video', false)).toBe('video')
    expect(categoryIconKey('Song of Summer', false)).toBe('sun')
  })

  it('reads the craft categories', () => {
    expect(categoryIconKey('Best Direction', false)).toBe('clapperboard')
    expect(categoryIconKey('Best Choreography', false)).toBe('footprints')
    expect(categoryIconKey('Best Cinematography', false)).toBe('aperture')
    expect(categoryIconKey('Best Editing', false)).toBe('scissors')
    expect(categoryIconKey('Best Visual Effects', false)).toBe('wand')
    expect(categoryIconKey('Best Art Direction', false)).toBe('palette')
  })

  it('reads the genre categories', () => {
    expect(categoryIconKey('Best Pop', false)).toBe('music2')
    expect(categoryIconKey('Best Hip-Hop', false)).toBe('mic')
    expect(categoryIconKey('Best R&B', false)).toBe('headphones')
    expect(categoryIconKey('Best Alternative', false)).toBe('drum')
    expect(categoryIconKey('Best Dance', false)).toBe('disc')
    expect(categoryIconKey('Best Country', false)).toBe('guitar')
    expect(categoryIconKey('Best Latin', false)).toBe('music4')
    expect(categoryIconKey('Best K-Pop', false)).toBe('audio-lines')
  })

  it('never lands on a film strip, whatever the wording', () => {
    expect(categoryIconKey('The Fate of Ophelia', false)).toBe('award')
    expect(categoryIconKey('Best Picture', false)).toBe('award')
    expect(categoryIconKey('Best Documentary Feature', false)).toBe('award')
  })
})

describe('categoryIconKey — the ordering hazards', () => {
  // Every one of these pairs shares a substring with the line above it, and
  // each was resolvable to the wrong icon by reordering the chain.
  it('reads art direction before direction', () => {
    expect(categoryIconKey('Best Art Direction', false)).toBe('palette')
    expect(categoryIconKey('Best Direction', false)).toBe('clapperboard')
  })

  it('reads best new artist before artist of the year', () => {
    expect(categoryIconKey('Best New Artist', false)).toBe('sparkles')
    expect(categoryIconKey('Artist of the Year', false)).toBe('star')
  })

  it('reads the named song categories before the bare word', () => {
    expect(categoryIconKey('Song of Summer', false)).toBe('sun')
    expect(categoryIconKey('Song of the Year', false)).toBe('music')
    expect(categoryIconKey('Best Rock Song', false)).toBe('guitar')
  })

  it('does not let K-Pop fall into Pop', () => {
    expect(categoryIconKey('Best K-Pop', false)).toBe('audio-lines')
    expect(categoryIconKey('Best Pop', false)).toBe('music2')
  })

  it('is case-insensitive, as the DB wording varies', () => {
    expect(categoryIconKey('VIDEO OF THE YEAR', false)).toBe('trophy')
    expect(categoryIconKey('best new artist', false)).toBe('sparkles')
  })
})
