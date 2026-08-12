import type { DraftEntityRow, DraftPickRow, NomineeRow } from '../types/database'
import { resolveExactNomineeForDraftEntity } from './draft-identity'

type DraftPortraitEntity = Pick<DraftEntityRow, 'name' | 'type' | 'show_pack_id' | 'pack_key'>
type DraftPortraitNominee = Pick<NomineeRow, 'type' | 'show_pack_id' | 'pack_key' | 'image_url'>

/**
 * Resolves the normalized portrait by immutable pack identity. Display names
 * are deliberately excluded: two shows may reuse a name for different art.
 */
export function resolveDraftEntityPortrait(
  entity: DraftPortraitEntity,
  nominees: readonly DraftPortraitNominee[],
): string | null {
  const nominee = resolveExactNomineeForDraftEntity(entity, nominees)
  if (!nominee) return null
  const portrait = nominee.image_url.trim()
  return portrait || null
}

/** Returns the exact deployed files needed by one player's offline roster. */
export function collectPlayerDraftPortraitPaths(
  entities: readonly DraftEntityRow[],
  picks: readonly DraftPickRow[],
  playerId: string,
  nominees: readonly DraftPortraitNominee[],
): string[] {
  const entitiesById = new Map(entities.map((entity) => [entity.id, entity]))
  const paths = picks
    .filter((pick) => pick.player_id === playerId)
    .sort((left, right) => left.pick_number - right.pick_number || left.id.localeCompare(right.id))
    .map((pick) => entitiesById.get(pick.entity_id))
    .filter((entity): entity is DraftEntityRow => entity !== undefined)
    .map((entity) => resolveDraftEntityPortrait(entity, nominees))
    .filter((path): path is string => path !== null)
  return [...new Set(paths)]
}

/** Keeps standalone HTML honest: an unfetched remote path is never emitted. */
export function resolveEmbeddedDraftEntityPortrait(
  entity: DraftPortraitEntity,
  nominees: readonly DraftPortraitNominee[],
  imageSources: ReadonlyMap<string, string> | undefined,
): { src: string; alt: string } | undefined {
  const path = resolveDraftEntityPortrait(entity, nominees)
  const src = path ? imageSources?.get(path) : undefined
  return src ? { src, alt: `${entity.name} portrait` } : undefined
}
