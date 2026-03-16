/**
 * film-by-winner.ts — resolves a nominee name or category slug to a FilmProfile.
 *
 * Used by AI companions to deep-link to film entries after a winner is announced.
 * Pure function: no React, no Supabase, no async.
 */

import { filmEncyclopedia, type FilmProfile } from '../data/film-encyclopedia'

/**
 * Resolves a winner nominee name (or film name) to a FilmProfile.
 *
 * Matching strategy (in order):
 *   1. Exact title match (case-insensitive)
 *   2. Title contains nomineeName (case-insensitive)
 *   3. nomineeName contains title (case-insensitive)
 *   4. Stars array contains nomineeName (case-insensitive partial)
 *   5. If categorySlug is provided, match films by category
 *
 * Returns the first match or undefined.
 */
export function filmByWinner(
  nomineeName: string,
  categorySlug?: string,
): FilmProfile | undefined {
  if (!nomineeName) return undefined

  const target = nomineeName.toLowerCase().trim()

  // 1. Exact title match
  const exactTitle = filmEncyclopedia.find(
    (f) => f.title.toLowerCase() === target,
  )
  if (exactTitle) return exactTitle

  // 2. Title contains nominee name
  const titleContains = filmEncyclopedia.find(
    (f) => f.title.toLowerCase().includes(target),
  )
  if (titleContains) return titleContains

  // 3. Nominee name contains title (for cases like "Sinners" matching "Sinners")
  const nameContainsTitle = filmEncyclopedia.find(
    (f) => target.includes(f.title.toLowerCase()),
  )
  if (nameContainsTitle) return nameContainsTitle

  // 4. Stars match (for person nominees — e.g., "Michael B. Jordan" -> Sinners)
  const starMatch = filmEncyclopedia.find(
    (f) =>
      f.stars.some((star) => {
        const s = star.toLowerCase()
        return s.includes(target) || target.includes(s)
      }),
  )
  if (starMatch) return starMatch

  // 5. Category slug match as last resort (returns first film in that category)
  if (categorySlug) {
    const catTarget = categorySlug.toLowerCase().trim()
    const catMatch = filmEncyclopedia.find(
      (f) => f.category === catTarget || f.id === catTarget,
    )
    if (catMatch) return catMatch
  }

  return undefined
}
