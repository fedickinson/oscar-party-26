import { describe, expect, it } from 'vitest'
import {
  LEGACY_SHOW_PACK_ID,
  categoryScopeFilter,
  isCategoryInRoomCatalog,
  requireShowPackId,
} from './catalog-scope'

describe('catalog scope', () => {
  const room = { id: '11111111-1111-4111-8111-111111111111', show_pack_id: LEGACY_SHOW_PACK_ID }

  it('includes authored rows from the room pack and declarations from the room only', () => {
    expect(isCategoryInRoomCatalog({ show_pack_id: LEGACY_SHOW_PACK_ID, room_id: null }, room)).toBe(true)
    expect(isCategoryInRoomCatalog({ show_pack_id: null, room_id: room.id }, room)).toBe(true)
    expect(isCategoryInRoomCatalog({ show_pack_id: '22222222-2222-4222-8222-222222222222', room_id: null }, room)).toBe(false)
    expect(isCategoryInRoomCatalog({ show_pack_id: null, room_id: '33333333-3333-4333-8333-333333333333' }, room)).toBe(false)
  })

  it('builds the PostgREST OR filter without weakening either branch', () => {
    expect(categoryScopeFilter(room)).toBe(
      `show_pack_id.eq.${LEGACY_SHOW_PACK_ID},room_id.eq.${room.id}`,
    )
  })

  it('fails closed when a room has no pack binding', () => {
    expect(() => requireShowPackId({ id: room.id, show_pack_id: null })).toThrow(
      'Room has no show-pack binding',
    )
  })
})
