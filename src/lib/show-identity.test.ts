import { describe, expect, it } from 'vitest'
import { LEGACY_SHOW_PACK_ID } from './catalog-scope'
import {
  LEGACY_SHOW_IDENTITY,
  UNBOUND_SHOW_IDENTITY,
  draftPoolNoun,
  draftRosterNoun,
  draftSubPhaseLabel,
  isLegacyShowPack,
  showIdentityFromPackRow,
  showIdentityLine,
} from './show-identity'

const VMA_ROW = {
  title: '2026 MTV Video Music Awards',
  property: 'MTV Video Music Awards',
  installment: '2026',
}
const VMA_PACK_ID = '6a1c0f7e-2d44-4a10-9b0e-41f0b0a5b7c2'

describe('isLegacyShowPack', () => {
  it('recognizes only the pinned legacy id', () => {
    expect(isLegacyShowPack(LEGACY_SHOW_PACK_ID)).toBe(true)
    expect(isLegacyShowPack(VMA_PACK_ID)).toBe(false)
    expect(isLegacyShowPack(null)).toBe(false)
    expect(isLegacyShowPack(undefined)).toBe(false)
  })
})

describe('showIdentityFromPackRow', () => {
  it('keeps the legacy pack on its pinned copy whatever the row says', () => {
    expect(showIdentityFromPackRow(LEGACY_SHOW_PACK_ID, VMA_ROW)).toEqual(LEGACY_SHOW_IDENTITY)
    expect(showIdentityFromPackRow(LEGACY_SHOW_PACK_ID, null)).toEqual(LEGACY_SHOW_IDENTITY)
  })

  it('names a non-legacy pack from its registry row and never says legacy copy', () => {
    const identity = showIdentityFromPackRow(VMA_PACK_ID, VMA_ROW)
    expect(identity).toEqual({
      title: '2026 MTV Video Music Awards',
      property: 'MTV Video Music Awards',
      installment: '2026',
      isLegacy: false,
    })
    expect(JSON.stringify(identity)).not.toMatch(/dragon/i)
  })

  it('falls back to the unbound identity when nothing is bound or nothing is named', () => {
    expect(showIdentityFromPackRow(null, null)).toEqual(UNBOUND_SHOW_IDENTITY)
    expect(showIdentityFromPackRow(VMA_PACK_ID, null)).toEqual(UNBOUND_SHOW_IDENTITY)
    expect(showIdentityFromPackRow(VMA_PACK_ID, { title: '  ', property: '', installment: null }))
      .toEqual(UNBOUND_SHOW_IDENTITY)
  })

  it('carries a missing half as null rather than a blank string', () => {
    const identity = showIdentityFromPackRow(VMA_PACK_ID, { title: 'One Night Only' })
    expect(identity.property).toBeNull()
    expect(identity.installment).toBeNull()
    expect(identity.title).toBe('One Night Only')
  })
})

describe('showIdentityLine', () => {
  it('joins the halves that exist', () => {
    expect(showIdentityLine(LEGACY_SHOW_IDENTITY)).toBe('House of the Dragon — Season 3 Finale')
    expect(showIdentityLine(showIdentityFromPackRow(VMA_PACK_ID, VMA_ROW)))
      .toBe('MTV Video Music Awards — 2026')
    expect(showIdentityLine(showIdentityFromPackRow(VMA_PACK_ID, VMA_ROW), ' · '))
      .toBe('MTV Video Music Awards · 2026')
  })

  it('falls back to the title when the pack names neither half', () => {
    expect(showIdentityLine(showIdentityFromPackRow(VMA_PACK_ID, { title: 'One Night Only' })))
      .toBe('One Night Only')
  })

  it('never emits legacy copy for the unbound identity', () => {
    expect(showIdentityLine(UNBOUND_SHOW_IDENTITY)).toBe('Tonight’s show')
  })
})

describe('pool copy', () => {
  it('keeps the legacy pools named as they were', () => {
    expect(draftSubPhaseLabel('film', LEGACY_SHOW_IDENTITY)).toBe('Claim a dragon')
    expect(draftSubPhaseLabel('person', LEGACY_SHOW_IDENTITY)).toBe('Draft your characters')
    expect(draftPoolNoun('film', 1, LEGACY_SHOW_IDENTITY)).toBe('dragon')
    expect(draftPoolNoun('film', 3, LEGACY_SHOW_IDENTITY)).toBe('dragons')
    expect(draftPoolNoun('person', 2, LEGACY_SHOW_IDENTITY)).toBe('characters')
    expect(draftRosterNoun(LEGACY_SHOW_IDENTITY)).toBe('characters and dragons')
  })

  it('says nothing legacy for any other pack', () => {
    const identity = showIdentityFromPackRow(VMA_PACK_ID, VMA_ROW)
    const strings = [
      draftSubPhaseLabel('film', identity),
      draftSubPhaseLabel('person', identity),
      draftPoolNoun('film', 1, identity),
      draftPoolNoun('film', 4, identity),
      draftPoolNoun('person', 1, identity),
      draftPoolNoun('person', 4, identity),
      draftRosterNoun(identity),
    ]
    for (const text of strings) {
      expect(text).not.toMatch(/dragon|oscar|academy award|film encyclopedia/i)
    }
    expect(draftSubPhaseLabel('person', identity)).toBe('Draft your roster')
    expect(draftPoolNoun('person', 4, identity)).toBe('people')
  })
})
