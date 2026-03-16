/**
 * ceremony-context.ts -- pure helpers that format static encyclopedia data
 * for injection into AI companion prompts.
 *
 * No React, no Supabase, no async. Unit-testable.
 */

import {
  categoryPresenters,
  filmEncyclopedia,
  ceremonyStorylines,
  biggestSnubs,
  type PresenterEntry,
} from '../data/film-encyclopedia'

// ─── buildCategoryContext ────────────────────────────────────────────────────
// Returns a compact text block with presenter info and relevant film context
// for a specific category. Used in pre-category and winner-reaction prompts.

export function buildCategoryContext(categoryName: string): string {
  const parts: string[] = []

  // Match presenter by case-insensitive substring
  const lowerCat = categoryName.toLowerCase()
  const presenter: PresenterEntry | undefined = categoryPresenters.find(
    (p) => p.category.toLowerCase() === lowerCat,
  ) ?? categoryPresenters.find(
    (p) => lowerCat.includes(p.category.toLowerCase()) || p.category.toLowerCase().includes(lowerCat),
  )

  if (presenter) {
    parts.push(
      `Presenter: ${presenter.presenter} -- ${presenter.about} (${presenter.oscarConnection})`,
    )
  }

  // Find films relevant to nominees in this category by checking if any film
  // has a storyline or key facts that mention this category type. We pick at
  // most one film to keep the context short.
  const relevantFilm = filmEncyclopedia.find((f) => {
    const storylineLower = f.oscarStoryline.toLowerCase()
    const whyLower = f.whyNominated.toLowerCase()
    return storylineLower.includes(lowerCat) || whyLower.includes(lowerCat)
  })

  if (relevantFilm) {
    // Pick the most compact useful line -- oscarStoryline first sentence
    const firstSentence = relevantFilm.oscarStoryline.split('. ')[0]
    parts.push(
      `Key nominee context: ${relevantFilm.title} -- ${firstSentence}.`,
    )
  }

  return parts.join('\n')
}

// ─── buildCeremonyPreamble ──────────────────────────────────────────────────
// Returns a text block with key storylines and snubs for the pre-ceremony
// prompt. Called once at ceremony start. Kept under ~400 characters.

export function buildCeremonyPreamble(): string {
  const storylineLines = ceremonyStorylines
    .slice(0, 5)
    .map((s) => `- ${s.title}: ${s.description.split('. ')[0]}.`)
    .join('\n')

  const snubLines = biggestSnubs
    .slice(0, 3)
    .map((s) => `- ${s.name} (${s.category})`)
    .join('\n')

  return `Key storylines tonight:\n${storylineLines}\nBiggest snubs:\n${snubLines}`
}
