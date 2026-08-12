import { LEGACY_SHOW_PACK_ID } from './catalog-scope'
import type { DraftEntityRow, NomineeRow } from '../types/database'

type DraftIdentityEntity = Pick<
  DraftEntityRow,
  'name' | 'type' | 'film_name' | 'show_pack_id' | 'pack_key'
>
type DraftIdentityNominee = Pick<
  NomineeRow,
  'name' | 'type' | 'film_name' | 'show_pack_id' | 'pack_key'
>
type DraftExactIdentity = Pick<
  DraftEntityRow,
  'type' | 'show_pack_id' | 'pack_key'
>

export type DraftIdentityResolution<Row> =
  | { state: 'matched'; row: Row }
  | { state: 'missing' }
  | { state: 'ambiguous' }

function hasExactIdentity(
  entity: DraftExactIdentity,
  nominee: DraftExactIdentity,
): boolean {
  return Boolean(
    entity.show_pack_id
    && nominee.show_pack_id
    && entity.pack_key
    && nominee.pack_key
    && entity.show_pack_id === nominee.show_pack_id
    && entity.pack_key === nominee.pack_key
    && entity.type === nominee.type,
  )
}

function permitsLegacyFallback(
  entity: DraftIdentityEntity,
  nominee: DraftIdentityNominee,
): boolean {
  const fixedLegacy = entity.show_pack_id === LEGACY_SHOW_PACK_ID
    && nominee.show_pack_id === LEGACY_SHOW_PACK_ID
  const historicalUnscoped = !entity.show_pack_id && !nominee.show_pack_id
  return fixedLegacy || historicalUnscoped
}

function hasLegacyIdentity(
  entity: DraftIdentityEntity,
  nominee: DraftIdentityNominee,
): boolean {
  if (!permitsLegacyFallback(entity, nominee) || entity.type !== nominee.type) return false
  if (entity.type === 'person') return entity.name === nominee.name
  const nomineeFilm = nominee.film_name || nominee.name
  return entity.film_name === nomineeFilm
}

function classify<Row>(rows: Row[]): DraftIdentityResolution<Row> {
  if (rows.length === 0) return { state: 'missing' }
  if (rows.length > 1) return { state: 'ambiguous' }
  return { state: 'matched', row: rows[0] }
}

/** Preserves missing and ambiguous as separate scoring decisions. */
export function assessDraftEntityForNominee<Entity extends DraftIdentityEntity>(
  nominee: DraftIdentityNominee,
  entities: readonly Entity[],
): DraftIdentityResolution<Entity> {
  const exact = entities.filter((entity) => hasExactIdentity(entity, nominee))
  if (exact.length > 0) return classify(exact)
  return classify(entities.filter((entity) => hasLegacyIdentity(entity, nominee)))
}

/** Canonical versioned matcher, with one explicit fixed-legacy compatibility lane. */
export function resolveDraftEntityForNominee<Entity extends DraftIdentityEntity>(
  nominee: DraftIdentityNominee,
  entities: readonly Entity[],
): Entity | null {
  const resolution = assessDraftEntityForNominee(nominee, entities)
  return resolution.state === 'matched' ? resolution.row : null
}

function assessExactNomineeForDraftEntity<Nominee extends DraftExactIdentity>(
  entity: DraftExactIdentity,
  nominees: readonly Nominee[],
): DraftIdentityResolution<Nominee> {
  return classify(nominees.filter((nominee) => hasExactIdentity(entity, nominee)))
}

/** Canonical inverse matcher with explicit missing and ambiguous states. */
export function assessNomineeForDraftEntity<Nominee extends DraftIdentityNominee>(
  entity: DraftIdentityEntity,
  nominees: readonly Nominee[],
): DraftIdentityResolution<Nominee> {
  const exact = assessExactNomineeForDraftEntity(entity, nominees)
  return exact.state !== 'missing'
    ? exact
    : classify(nominees.filter((nominee) => hasLegacyIdentity(entity, nominee)))
}

/** Exact-only lane for artwork and other surfaces that must never name-match. */
export function resolveExactNomineeForDraftEntity<Nominee extends DraftExactIdentity>(
  entity: DraftExactIdentity,
  nominees: readonly Nominee[],
): Nominee | null {
  const resolution = assessExactNomineeForDraftEntity(entity, nominees)
  return resolution.state === 'matched' ? resolution.row : null
}

/** Inverse of resolveDraftEntityForNominee for roster and visual consumers. */
export function resolveNomineeForDraftEntity<Nominee extends DraftIdentityNominee>(
  entity: DraftIdentityEntity,
  nominees: readonly Nominee[],
): Nominee | null {
  const resolution = assessNomineeForDraftEntity(entity, nominees)
  return resolution.state === 'matched' ? resolution.row : null
}
