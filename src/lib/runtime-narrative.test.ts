import { describe, expect, it } from 'vitest'
import { LEGACY_SHOW_PACK_ID } from './catalog-scope'
import { resolveRuntimeNarrativeMode } from './runtime-narrative'

describe('room-bound runtime narrative policy', () => {
  it('admits the deployed legacy cast only for its exact pinned show pack', () => {
    expect(resolveRuntimeNarrativeMode(LEGACY_SHOW_PACK_ID)).toBe('legacy_live_cast')
    expect(resolveRuntimeNarrativeMode('b99161ea-328f-4a00-904a-a6e98bc376b5'))
      .toBe('pack_commentary_only')
  })

  it('fails closed while the room pack binding is unknown', () => {
    expect(resolveRuntimeNarrativeMode(null)).toBe('pack_commentary_only')
    expect(resolveRuntimeNarrativeMode(undefined)).toBe('pack_commentary_only')
    expect(resolveRuntimeNarrativeMode('')).toBe('pack_commentary_only')
  })
})
