import { describe, expect, it } from 'vitest'
import {
  FANDOM_CORE_REVISION,
  characters,
  dragons,
  episodeRecaps,
  safeCriticism,
  stateOfPlay,
  theDead,
} from '../data/westeros-encyclopedia'
import { findCharacterImage } from '../data/image-library'

describe('Fandom Core knowledge adapter', () => {
  it('binds the runtime knowledge to the reviewed private snapshot', () => {
    expect(FANDOM_CORE_REVISION).toBe('0349ea0c1fe4f72740ba9f9008cc60c6317bbbfc')
    expect(characters).toHaveLength(27)
    expect(dragons).toHaveLength(11)
    expect(theDead).toHaveLength(6)
    expect(episodeRecaps).toHaveLength(7)
    expect(episodeRecaps.flatMap((episode) => episode.events)).toHaveLength(48)
  })

  it('preserves the prompt-critical character and dragon context', () => {
    const rhaenyra = characters.find((character) => character.id === 'Rhaenyra Targaryen')
    expect(rhaenyra?.dragon).toEqual({ name: 'Syrax', notes: 'Golden royal mount' })
    expect(rhaenyra?.statusEnteringFinale).toContain("holding the Iron Throne")

    const vhagar = dragons.find((dragon) => dragon.name === 'Vhagar')
    expect(vhagar?.status).toContain('WHEREABOUTS UNKNOWN')
    expect(stateOfPlay).toContain('Aemond lies poisoned at Harrenhal')
    expect(findCharacterImage('Rhaenyra Targaryen')?.path).toBe('/avatars/characters/rhaenyra.jpeg')
  })

  it('keeps source-material spoilers out of safe criticism', () => {
    expect(safeCriticism()).toHaveLength(18)
    expect(safeCriticism().every((item) => !item.spoiler)).toBe(true)
    expect(safeCriticism().some((item) => item.point.includes('both Ulf AND Hugh'))).toBe(false)
  })
})
