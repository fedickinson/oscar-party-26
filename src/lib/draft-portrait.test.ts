import { describe, expect, it } from 'vitest'
import type { DraftEntityRow, NomineeRow } from '../types/database'
import {
  collectPlayerDraftPortraitPaths,
  resolveDraftEntityPortrait,
  resolveEmbeddedDraftEntityPortrait,
} from './draft-portrait'

const entity = {
  id: 'draft-aegon',
  name: 'Aegon II Targaryen',
  type: 'person',
  nominations: [],
  film_name: 'The Greens',
  nom_count: 1,
  show_pack_id: 'pack-green',
  pack_key: 'aegon-ii',
} satisfies DraftEntityRow

function nominee(overrides: Partial<NomineeRow> = {}): NomineeRow {
  return {
    id: 'nominee-aegon',
    name: 'Aegon II Targaryen',
    type: 'person',
    film_name: 'The Greens',
    image_url: '/avatars/characters/aegon.jpeg',
    show_pack_id: 'pack-green',
    pack_key: 'aegon-ii',
    ...overrides,
  }
}

describe('resolveDraftEntityPortrait', () => {
  it('uses the one nominee with the same show pack and stable entity key', () => {
    expect(resolveDraftEntityPortrait(entity, [
      nominee({ id: 'same-name-wrong-pack', show_pack_id: 'pack-black' }),
      nominee(),
    ])).toBe('/avatars/characters/aegon.jpeg')
  })

  it('fails closed instead of name-matching or choosing an ambiguous portrait', () => {
    expect(resolveDraftEntityPortrait(entity, [
      nominee({ id: 'name-only', pack_key: 'another-aegon' }),
    ])).toBeNull()
    expect(resolveDraftEntityPortrait(entity, [
      nominee(),
      nominee({ id: 'duplicate-key' }),
    ])).toBeNull()
    expect(resolveDraftEntityPortrait(entity, [nominee({ image_url: '   ' })])).toBeNull()
    expect(resolveDraftEntityPortrait({ ...entity, pack_key: null }, [nominee()])).toBeNull()
  })

  it('collects only the selected player roster paths for offline embedding', () => {
    const otherEntity = { ...entity, id: 'draft-sunfyre', pack_key: 'sunfyre' }
    const picks = [
      { id: 'pick-1', room_id: 'room', player_id: 'player-a', entity_id: entity.id, round: 1, pick_number: 0, created_at: '2026-08-11T00:00:00Z' },
      { id: 'pick-2', room_id: 'room', player_id: 'player-b', entity_id: otherEntity.id, round: 1, pick_number: 1, created_at: '2026-08-11T00:00:01Z' },
    ]
    expect(collectPlayerDraftPortraitPaths(
      [entity, otherEntity],
      picks,
      'player-a',
      [nominee(), nominee({ id: 'nominee-sunfyre', pack_key: 'sunfyre', image_url: '/avatars/characters/sunfyre.jpeg' })],
    )).toEqual(['/avatars/characters/aegon.jpeg'])
  })

  it('exposes only an already-inlined portrait to the standalone recap', () => {
    const path = '/avatars/characters/aegon.jpeg'
    expect(resolveEmbeddedDraftEntityPortrait(
      entity,
      [nominee()],
      new Map([[path, 'data:image/jpeg;base64,proof']]),
    )).toEqual({ src: 'data:image/jpeg;base64,proof', alt: 'Aegon II Targaryen portrait' })
    expect(resolveEmbeddedDraftEntityPortrait(entity, [nominee()], new Map())).toBeUndefined()
  })
})
