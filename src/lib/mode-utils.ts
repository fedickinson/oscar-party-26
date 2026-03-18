/**
 * mode-utils.ts — pure functions and descriptors for game depth modes.
 *
 * ENSEMBLE DRAFT MODES control which entities go into the draft pool.
 * PRESTIGE PICKS MODES control which Oscar categories players predict.
 *
 * All filter functions are pure: no React, no Supabase, no side effects.
 * Modal content (labels, descriptions, includes/excludes) lives here too
 * so the UI never hardcodes copy.
 */

import type { EnsembleMode, PrestigeMode, DraftEntityRow, CategoryRow } from '../types/database'

export type { EnsembleMode, PrestigeMode }

// ─── Detail shape (used by ModeSelectPanel modal) ─────────────────────────────

export interface ModeDetail {
  id: string
  label: string
  eyebrow: string        // e.g. "Ensemble Draft"
  description: string
  includes: string[]
  excludes?: string[]
  bestFor: string
  stat: string           // e.g. "~11 picks / player" or "Confidence 1–24"
  statLabel: string      // e.g. "picks per player" or "confidence range"
}

// ─── Category IDs by role ──────────────────────────────────────────────────────
// These match the categories table seed. Verify against DB if ever re-seeded.

/** Categories whose nominees qualify a person entity for 'stars_and_films' mode. */
export const ACTING_DIRECTING_CATEGORY_IDS = new Set([
  1,  // Best Supporting Actress
  8,  // Best Supporting Actor
  21, // Best Directing
  22, // Best Actor in a Leading Role
  23, // Best Actress in a Leading Role
])

/** Category IDs included in 'main_stage' prestige mode (12 categories). */
export const MAIN_STAGE_CATEGORY_IDS = new Set([
  1,  // Best Supporting Actress
  8,  // Best Supporting Actor
  9,  // Best Adapted Screenplay
  10, // Best Original Screenplay
  15, // Best Original Score
  17, // Best Film Editing
  18, // Best Cinematography
  21, // Best Directing
  22, // Best Actor in a Leading Role
  23, // Best Actress in a Leading Role
  24, // Best Picture
  2,  // Best Animated Feature
])

/** Category IDs included in 'big_night' prestige mode (6 categories). */
export const BIG_NIGHT_CATEGORY_IDS = new Set([
  1,  // Best Supporting Actress
  8,  // Best Supporting Actor
  21, // Best Directing
  22, // Best Actor in a Leading Role
  23, // Best Actress in a Leading Role
  24, // Best Picture
])

// ─── Filter functions ──────────────────────────────────────────────────────────

export function filterEnsembleEntities(
  entities: DraftEntityRow[],
  mode: EnsembleMode,
): DraftEntityRow[] {
  if (mode === 'full') return entities
  if (mode === 'films_only') return entities.filter((e) => e.type === 'film')
  // stars_and_films: films + people in acting/directing categories only
  return entities.filter((e) => {
    if (e.type === 'film') return true
    const noms = (e.nominations as Array<{ category_id: number }> | null) ?? []
    return noms.some((n) => ACTING_DIRECTING_CATEGORY_IDS.has(n.category_id))
  })
}

export function filterPrestigeCategories(
  categories: CategoryRow[],
  mode: PrestigeMode,
): CategoryRow[] {
  if (mode === 'full') return categories
  const ids = mode === 'main_stage' ? MAIN_STAGE_CATEGORY_IDS : BIG_NIGHT_CATEGORY_IDS
  return categories.filter((c) => ids.has(c.id))
}

/** Returns the maximum confidence value for the given prestige mode. */
export function getConfidenceRange(mode: PrestigeMode): number {
  if (mode === 'big_night') return 6
  if (mode === 'main_stage') return 12
  return 24
}

// ─── Ensemble mode descriptors ────────────────────────────────────────────────

export const ENSEMBLE_MODES: ModeDetail[] = [
  {
    id: 'full',
    label: 'The Works',
    eyebrow: 'Ensemble Draft',
    description:
      'The complete draft pool — every film and every nominated individual. Actors, directors, writers, and all craft nominees are in play. The biggest strategizing, the most chaos.',
    includes: [
      'All nominated films (~15)',
      'Lead actors and actresses (10 nominees)',
      'Supporting actors and actresses (10 nominees)',
      'Best Director nominees (5)',
      'Adapted and Original Screenplay nominees (~10)',
      'Craft and crew — cinematographers, composers, editors, and more',
    ],
    bestFor: 'Oscar superfans who\'ve researched every category and seen every film.',
    stat: '44 nominees',
    statLabel: 'draft pool size',
  },
  {
    id: 'stars_and_films',
    label: 'Stars & Films',
    eyebrow: 'Ensemble Draft',
    description:
      'Films plus the headlining talent — the actors everyone recognizes and the directors who defined each film. Deep enough to be strategic, light enough for anyone to follow.',
    includes: [
      'All nominated films (~15)',
      'Lead actors and actresses (10 nominees)',
      'Supporting actors and actresses (10 nominees)',
      'Best Director nominees (5)',
    ],
    excludes: [
      'Screenplay nominees',
      'Cinematographers, composers, editors',
      'All other craft and technical crew',
    ],
    bestFor: 'Film fans who know the big names but don\'t track every technical category.',
    stat: '~28 nominees',
    statLabel: 'draft pool size',
  },
  {
    id: 'films_only',
    label: 'Films Only',
    eyebrow: 'Ensemble Draft',
    description:
      'Draft the movies, not the people. Claim a film and you score whenever any of its nominees win — actors, directors, crew, all of it. The fastest, simplest draft format.',
    includes: [
      'All nominated films (~15)',
      'Points flow from every win by any nominee associated with that film',
    ],
    excludes: [
      'All individual people — actors, directors, writers, crew',
    ],
    bestFor: 'Casual viewers, tight schedules, or anyone new to the draft format.',
    stat: '~15 films',
    statLabel: 'draft pool size',
  },
]

// ─── Prestige mode descriptors ────────────────────────────────────────────────

export const PRESTIGE_MODES: ModeDetail[] = [
  {
    id: 'full',
    label: 'All 24',
    eyebrow: 'Prestige Picks',
    description:
      'Predict every Oscar category. Assign your 24 confidence tokens — one per category, each value used exactly once. The strategy is deciding where to put your biggest numbers.',
    includes: [
      'All 24 categories — from Animated Short to Best Picture',
      'Every craft category: Sound, VFX, Production Design, Makeup',
      'All documentary and short film categories',
      'Confidence values 1 through 24',
    ],
    bestFor: 'Completists and Oscar nerds who want to predict every category.',
    stat: 'Confidence 1–24',
    statLabel: 'max possible score: 300 pts',
  },
  {
    id: 'main_stage',
    label: 'Main Stage',
    eyebrow: 'Prestige Picks',
    description:
      'The 12 categories that define awards season. Acting, directing, writing, and the essential craft awards — everything that drives the conversation.',
    includes: [
      'Best Picture',
      'Best Director',
      'Best Actor and Best Actress (Leading)',
      'Best Supporting Actor and Actress',
      'Adapted and Original Screenplay',
      'Cinematography and Film Editing',
      'Original Score',
      'Animated Feature',
    ],
    excludes: [
      'Visual Effects, Sound, Production Design, Costume, Makeup',
      'International Feature, Documentary, all Short Film categories',
      'Casting',
    ],
    bestFor: 'Film fans who follow awards season but skip the technical categories.',
    stat: 'Confidence 1–12',
    statLabel: 'max possible score: 78 pts',
  },
  {
    id: 'big_night',
    label: 'Big Night',
    eyebrow: 'Prestige Picks',
    description:
      'Just the six awards everyone watches for. Predict the acting categories, Best Director, and Best Picture — the choices that make or break a ceremony.',
    includes: [
      'Best Picture',
      'Best Director',
      'Best Actor in a Leading Role',
      'Best Actress in a Leading Role',
      'Best Supporting Actor',
      'Best Supporting Actress',
    ],
    excludes: [
      'All other 18 categories',
    ],
    bestFor: 'Casual viewers, quick games, or anyone who just wants to root for their favorites.',
    stat: 'Confidence 1–6',
    statLabel: 'max possible score: 21 pts',
  },
]

export const ENSEMBLE_MODE_MAP: Record<EnsembleMode, ModeDetail> = {
  full: ENSEMBLE_MODES[0],
  stars_and_films: ENSEMBLE_MODES[1],
  films_only: ENSEMBLE_MODES[2],
}

export const PRESTIGE_MODE_MAP: Record<PrestigeMode, ModeDetail> = {
  full: PRESTIGE_MODES[0],
  main_stage: PRESTIGE_MODES[1],
  big_night: PRESTIGE_MODES[2],
}
