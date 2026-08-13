import type {
  CategoryRow,
  DraftEntityRow,
  NomineeRow,
  SignatureBeatRow,
} from '../types/database'
import { resolveNomineeForDraftEntity } from './draft-identity'

/**
 * Versioned declarations carry immutable source identity. Only historical or
 * manually authored rows without provenance may use the display-name lane.
 */
export function declarationMatchesSignatureBeat(
  category: CategoryRow,
  beat: SignatureBeatRow,
): boolean {
  if (category.source_signature_beat_id != null) {
    return category.source_signature_beat_id === beat.id
  }
  return category.name === beat.name || category.name.startsWith(`${beat.name} — `)
}

export function signatureBeatWasHit(
  beat: SignatureBeatRow,
  entity: DraftEntityRow,
  categories: readonly CategoryRow[],
  nominees: readonly NomineeRow[],
): boolean {
  const nominee = resolveNomineeForDraftEntity(entity, nominees)
  if (!nominee) return false
  return categories.some((category) => (
    (category.winner_id === nominee.id || category.tie_winner_id === nominee.id)
    && declarationMatchesSignatureBeat(category, beat)
  ))
}

export function draftEntityHasHitSignatureBeat(
  entity: DraftEntityRow,
  categories: readonly CategoryRow[],
  nominees: readonly NomineeRow[],
  beats: readonly SignatureBeatRow[],
): boolean {
  return beats
    .filter((beat) => beat.entity_id === entity.id || beat.partner_entity_id === entity.id)
    .some((beat) => signatureBeatWasHit(beat, entity, categories, nominees))
}
