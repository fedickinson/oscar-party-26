/**
 * show-identity — the show a room is bound to, in the words a player sees.
 *
 * Every room carries `rooms.show_pack_id`. The pinned legacy pack keeps its
 * authored canon everywhere in the app; every other pack has to name itself
 * from the `show_packs` registry row instead of from copy hard-coded into a
 * component. These helpers are the single place that decision is made, so a
 * surface only has to ask "which identity am I rendering" rather than carry a
 * second copy of the legacy strings.
 *
 * Pure by contract: no React, no Supabase. `src/hooks/useShowIdentity.ts` does
 * the read; this file only decides what the read means.
 */

import { LEGACY_SHOW_PACK_ID } from './catalog-scope'

export interface ShowIdentity {
  /** The pack's own title. Always renderable. */
  title: string
  /** The property the show belongs to, or null when the pack does not name one. */
  property: string | null
  /** The installment inside that property, or null when there is none. */
  installment: string | null
  /** True only for the pinned legacy pack, which keeps its exact authored copy. */
  isLegacy: boolean
}

export function isLegacyShowPack(showPackId: string | null | undefined): boolean {
  return showPackId === LEGACY_SHOW_PACK_ID
}

/**
 * The legacy pack's identity, stated here rather than read from the registry.
 * These are the exact strings the legacy surfaces shipped with, and pinning
 * them keeps a legacy room's copy byte-identical whether or not the pack row
 * has loaded.
 */
export const LEGACY_SHOW_IDENTITY: ShowIdentity = {
  title: 'House of the Dragon — Season 3 Finale',
  property: 'House of the Dragon',
  installment: 'Season 3 Finale',
  isLegacy: true,
}

/**
 * The restrictive answer: a pack row that has not resolved yet, failed to load,
 * or named nothing at all. It deliberately names no show, because naming the
 * wrong one is worse than naming none.
 *
 * It is no longer what a room-less route renders — those name the featured show
 * below.
 */
export const UNBOUND_SHOW_IDENTITY: ShowIdentity = {
  title: 'Watch Party',
  property: 'Tonight’s show',
  installment: null,
  isLegacy: false,
}

/**
 * The show a route with no room names: the landing (which exists before any
 * room does) and the public explainer opened by someone with no session.
 *
 * This is the one constant that still hard-codes show copy, and it is the
 * single object a pack activation could later own rather than a scatter of
 * literals across the pages. It is not bound to any room, so it decides no
 * scoring, no phase and no catalog — only what a visitor is told is on tonight.
 */
export const FEATURED_SHOW_IDENTITY: ShowIdentity = {
  title: '2026 VMAs',
  property: 'MTV Video Music Awards',
  installment: 'Sunday, September 27',
  isLegacy: false,
}

/** The `show_packs` columns these surfaces read. All optional: packs vary. */
export interface ShowPackIdentityRow {
  title?: string | null
  property?: string | null
  installment?: string | null
}

function trimmed(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text.length > 0 ? text : null
}

/**
 * Resolve a room's identity from its pack id and (for non-legacy packs) the
 * registry row. A row that names nothing falls back to the unbound identity
 * rather than rendering blanks — the restrictive answer, since showing less is
 * always safer than showing another show's name.
 */
export function showIdentityFromPackRow(
  showPackId: string | null | undefined,
  row: ShowPackIdentityRow | null | undefined,
): ShowIdentity {
  if (isLegacyShowPack(showPackId)) return LEGACY_SHOW_IDENTITY

  const title = trimmed(row?.title)
  const property = trimmed(row?.property)
  const installment = trimmed(row?.installment)
  if (title == null && property == null && installment == null) return UNBOUND_SHOW_IDENTITY

  return {
    title: title ?? property ?? UNBOUND_SHOW_IDENTITY.title,
    property,
    installment,
    isLegacy: false,
  }
}

/**
 * The one-line show credit: `property — installment`, collapsed to whichever
 * halves exist, falling back to the title when the pack names neither.
 */
export function showIdentityLine(identity: ShowIdentity, separator = ' — '): string {
  const parts = [identity.property, identity.installment].filter(
    (part): part is string => part != null,
  )
  return parts.length > 0 ? parts.join(separator) : identity.title
}

/**
 * True when the masthead kicker carries the property — `MTV Video Music Awards`
 * over `2026 VMAs` — which frees the line under the wordmark for the
 * installment instead of repeating what the kicker already said.
 *
 * False for the legacy pack, whose kicker is pinned platform copy, and for any
 * identity that names only one of the two halves: with nothing left for the
 * line, the property belongs there rather than above the wordmark.
 */
export function showIdentityPresentsProperty(identity: ShowIdentity): boolean {
  return !identity.isLegacy && identity.property != null && identity.installment != null
}

/**
 * The kicker above the wordmark. `platformKicker` is the surface's own wording
 * (the landing says `Watch Party presents`, the explainer says `Watch Party`),
 * used whenever the identity has no property to present.
 */
export function showIdentityKicker(identity: ShowIdentity, platformKicker: string): string {
  return showIdentityPresentsProperty(identity) ? (identity.property as string) : platformKicker
}

/** The line under the wordmark, once the kicker may have taken the property. */
export function showIdentityMastheadLine(identity: ShowIdentity, separator = ' — '): string {
  if (showIdentityPresentsProperty(identity)) return identity.installment as string
  return showIdentityLine(identity, separator)
}

// ─── Pool-dependent copy ──────────────────────────────────────────────────────
//
// `draft_entities.type` carries two pools: 'film' and 'person'. The legacy pack
// rides the film slot for dragons and the person slot for characters. Any other
// pack fills the same two slots with its own kinds, so the wording has to stop
// naming the legacy ones. A pack with no film entities never reaches the film
// wording at all — the sub-draft is skipped — but the label still has to be
// correct for a pack that does draft both pools.

export type DraftPool = 'film' | 'person'

/** Sub-draft header label, per pool. */
export function draftSubPhaseLabel(pool: DraftPool, identity: ShowIdentity): string {
  if (identity.isLegacy) return pool === 'film' ? 'Claim a dragon' : 'Draft your characters'
  return pool === 'film' ? 'Claim your first pick' : 'Draft your roster'
}

/** Countable noun for a roster tally, e.g. `3 characters` / `3 people`. */
export function draftPoolNoun(pool: DraftPool, count: number, identity: ShowIdentity): string {
  const singular = count === 1
  if (identity.isLegacy) {
    if (pool === 'film') return singular ? 'dragon' : 'dragons'
    return singular ? 'character' : 'characters'
  }
  if (pool === 'film') return singular ? 'title' : 'titles'
  return singular ? 'person' : 'people'
}

/** Both pools together, for prose that describes a whole roster. */
export function draftRosterNoun(identity: ShowIdentity): string {
  return identity.isLegacy ? 'characters and dragons' : 'entities'
}

// ─── Confidence-phase copy ────────────────────────────────────────────────────
//
// `categories.tier` is the authored `prediction.tier` from the pack, validated
// only as a positive integer: no pack contract gives the numbers a name. The
// legacy surfaces shipped with awards-ceremony tier names, which stay pinned
// for that pack; every other pack gets its tiers numbered rather than a name
// borrowed from another show.

const LEGACY_CONFIDENCE_TIER_LABELS: Record<number, string> = {
  1: 'Major Awards',
  2: 'Prestige Craft',
  3: 'Technical & Performance',
  4: 'Specialty',
  5: 'Short Films',
}

/** Section heading for one confidence tier. */
export function confidenceTierLabel(tier: number, identity: ShowIdentity): string {
  if (identity.isLegacy) return LEGACY_CONFIDENCE_TIER_LABELS[tier] ?? `Tier ${tier}`
  return `Tier ${tier}`
}

/** The confidence screen's header eyebrow. */
export function confidencePhaseTitle(identity: ShowIdentity): string {
  return identity.isLegacy ? 'Prestige Picks' : 'Predictions'
}
