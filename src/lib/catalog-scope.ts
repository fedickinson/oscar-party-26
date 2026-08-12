export const LEGACY_SHOW_PACK_ID = '8f27e9a4-9f6b-4f3a-9c91-a6b862c98101'

export interface RoomCatalogBinding {
  id: string
  show_pack_id: string | null | undefined
}

export interface CategoryCatalogBinding {
  show_pack_id?: string | null
  room_id?: string | null
}

export function requireShowPackId(room: RoomCatalogBinding): string {
  if (!room.show_pack_id) throw new Error(`Room has no show-pack binding: ${room.id}`)
  return room.show_pack_id
}

export function categoryScopeFilter(room: RoomCatalogBinding): string {
  return `show_pack_id.eq.${requireShowPackId(room)},room_id.eq.${room.id}`
}

export function isCategoryInRoomCatalog(
  category: CategoryCatalogBinding,
  room: RoomCatalogBinding,
): boolean {
  const showPackId = requireShowPackId(room)
  return category.show_pack_id === showPackId || category.room_id === room.id
}
