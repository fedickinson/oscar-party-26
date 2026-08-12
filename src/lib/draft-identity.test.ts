import { describe, expect, it } from 'vitest'
import { LEGACY_SHOW_PACK_ID } from './catalog-scope'
import {
  assessNomineeForDraftEntity,
  resolveDraftEntityForNominee,
  resolveNomineeForDraftEntity,
} from './draft-identity'
import type { DraftEntityRow, NomineeRow } from '../types/database'

function entity(overrides: Partial<DraftEntityRow> = {}): DraftEntityRow {
  return {
    id: 'entity-rhaenyra',
    name: 'Rhaenyra',
    type: 'person',
    nominations: [],
    film_name: 'The Blacks',
    nom_count: 1,
    show_pack_id: 'pack-finale',
    pack_key: 'rhaenyra',
    ...overrides,
  }
}

function nominee(overrides: Partial<NomineeRow> = {}): NomineeRow {
  return {
    id: 'nominee-rhaenyra',
    name: 'Rhaenyra',
    type: 'person',
    film_name: 'The Blacks',
    image_url: '/rhaenyra.jpeg',
    show_pack_id: 'pack-finale',
    pack_key: 'rhaenyra',
    ...overrides,
  }
}

describe('draft and nominee identity', () => {
  it('matches a versioned catalog only by the same pack and stable key', () => {
    const winner = nominee()
    const sameNameWrongKey = entity({ id: 'wrong-key', pack_key: 'rhaenyra-imposter' })
    const sameKeyWrongPack = entity({ id: 'wrong-pack', show_pack_id: 'pack-prequel' })
    const exact = entity()

    expect(resolveDraftEntityForNominee(winner, [sameNameWrongKey, sameKeyWrongPack, exact]))
      .toEqual(exact)
    expect(resolveNomineeForDraftEntity(exact, [
      nominee({ id: 'wrong-key-nominee', pack_key: 'rhaenyra-imposter' }),
      winner,
    ])).toEqual(winner)
  })

  it('fails closed when a versioned key is missing or ambiguous', () => {
    expect(resolveDraftEntityForNominee(nominee(), [
      entity({ pack_key: 'other-rhaenyra' }),
    ])).toBeNull()
    expect(resolveDraftEntityForNominee(nominee(), [
      entity(),
      entity({ id: 'duplicate-entity' }),
    ])).toBeNull()
    expect(resolveNomineeForDraftEntity(entity(), [
      nominee(),
      nominee({ id: 'duplicate-nominee' }),
    ])).toBeNull()
  })

  it('exposes missing and ambiguous inverse identity without collapsing either to a guess', () => {
    expect(assessNomineeForDraftEntity(entity(), [nominee()]).state).toBe('matched')
    expect(assessNomineeForDraftEntity(entity(), [
      nominee(), nominee({ id: 'duplicate-nominee' }),
    ]).state).toBe('ambiguous')
    expect(assessNomineeForDraftEntity(entity(), [
      nominee({ pack_key: 'other' }),
    ]).state).toBe('missing')
  })

  it('keeps name matching only for the fixed legacy catalog', () => {
    const legacyEntity = entity({ show_pack_id: LEGACY_SHOW_PACK_ID, pack_key: 'legacy-entity-id' })
    const legacyNominee = nominee({ show_pack_id: LEGACY_SHOW_PACK_ID, pack_key: 'legacy-nominee-id' })
    expect(resolveDraftEntityForNominee(legacyNominee, [legacyEntity])).toEqual(legacyEntity)
    expect(resolveNomineeForDraftEntity(legacyEntity, [legacyNominee])).toEqual(legacyNominee)
  })

  it('preserves unscoped historical film fixtures without weakening versioned packs', () => {
    const unscopedFilm = entity({
      show_pack_id: undefined,
      pack_key: null,
      id: 'entity-film',
      name: 'The Brutalist',
      type: 'film',
      film_name: 'The Brutalist',
    })
    const unscopedNominee = nominee({
      show_pack_id: undefined,
      pack_key: null,
      id: 'nominee-film',
      name: 'The Brutalist',
      type: 'film',
      film_name: '',
    })
    expect(resolveDraftEntityForNominee(unscopedNominee, [unscopedFilm])).toEqual(unscopedFilm)
  })
})
