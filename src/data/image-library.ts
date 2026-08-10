/**
 * image-library.ts — the catalogue of artwork a companion may place in a keepsake.
 *
 * WHY A CATALOGUE AND NOT JUST PATHS
 * The end-of-night verdict call is already reading each player's whole night, so
 * it is the only thing in the system positioned to answer "which picture belongs
 * on this person's page". To choose well it needs to know what each image
 * actually shows — hence `description`, which is written for the model to read,
 * not for the UI.
 *
 * The model never sees a file path and never invents one. It returns a slug from
 * this list; anything unrecognised is dropped at the persistence layer. That is
 * what keeps a hallucinated filename from becoming a broken image in a file
 * somebody keeps for a year.
 *
 * ADDING ARTWORK IS A DATA CHANGE
 * Drop files into public/avatars/<kind>/<slug>.webp and add a row here. Nothing
 * downstream needs touching: the prompt renders this list, the renderer inlines
 * whatever was chosen. CHARACTER_IMAGES is deliberately empty until the House of
 * the Dragon portraits land.
 *
 * KEEP THEM SMALL
 * Every chosen image is inlined into the standalone keepsake as a base64 data
 * URI, which costs about a third more than the file on disk. The existing webp
 * run 6-34KB, so two or three per page is nothing. A multi-megabyte PNG would
 * make the artifact unsendable — the Oscars-era PNGs still sitting in
 * public/avatars are 2-9MB each and are deliberately not listed here.
 */

import { AI_COMPANIONS } from './ai-companions'
import { PLAYER_AVATARS } from './avatar-config'

export type ImageKind = 'companion' | 'sigil' | 'character'

export interface LibraryImage {
  /** Stable id the model returns. Unique across every kind. */
  slug: string
  kind: ImageKind
  label: string
  /** One line telling the model what this shows, so it can choose deliberately. */
  description: string
  /** Public path. Never shown to the model. */
  path: string
}

/**
 * Where a chosen image is allowed to land.
 *
 *   crest  — beside the masthead, setting the tone of the whole sheet
 *   hero   — beside the draft ledger, for whoever carried the player's night
 *
 * The verdict portrait is NOT a slot: the companion who wrote the passage is
 * already known, so asking the model to pick it would spend tokens on a
 * question with one correct answer.
 */
export type ImageSlot = 'crest' | 'hero'

export const IMAGE_SLOTS: ImageSlot[] = ['crest', 'hero']

// ─── The catalogue ────────────────────────────────────────────────────────────

const COMPANION_IMAGES: LibraryImage[] = AI_COMPANIONS.map((c) => ({
  slug: `companion-${c.id}`,
  kind: 'companion' as const,
  label: c.name,
  description: `${c.name} of the watching table — ${c.role}.`,
  path: `/avatars/companions/${c.id}.webp`,
}))

const SIGIL_IMAGES: LibraryImage[] = PLAYER_AVATARS.filter((a) => a.image).map((a) => ({
  slug: `sigil-${a.id}`,
  kind: 'sigil' as const,
  label: `House ${a.name}`,
  description: `The ${a.name} sigil, ${a.object.toLowerCase()}. ${a.description}`,
  path: a.image,
}))

/**
 * House of the Dragon character portraits.
 *
 * Empty until the artwork exists. Add rows as:
 *   { slug: 'character-rhaenyra', kind: 'character', label: 'Rhaenyra Targaryen',
 *     description: '...', path: '/avatars/characters/rhaenyra.webp' }
 *
 * Slugs should match the draft entity name closely enough that
 * findCharacterImage below can resolve them without a second mapping table.
 */
const CHARACTER_IMAGES: LibraryImage[] = []

export const IMAGE_LIBRARY: LibraryImage[] = [
  ...CHARACTER_IMAGES,
  ...COMPANION_IMAGES,
  ...SIGIL_IMAGES,
]

const BY_SLUG = new Map(IMAGE_LIBRARY.map((i) => [i.slug, i]))

export function getLibraryImage(slug: string): LibraryImage | undefined {
  return BY_SLUG.get(slug)
}

/** The portrait for a companion, used for the verdict byline. Deterministic. */
export function companionImage(companionId: string): LibraryImage | undefined {
  return BY_SLUG.get(`companion-${companionId}`)
}

/**
 * Best-effort portrait for a drafted character, by name.
 *
 * Returns undefined when no artwork exists, which is the normal case today and
 * every caller already handles — the keepsake simply renders without a portrait
 * rather than reserving an empty box for one.
 */
export function findCharacterImage(entityName: string): LibraryImage | undefined {
  const normalized = entityName.toLowerCase().replace(/[^a-z]/g, '')
  return IMAGE_LIBRARY.find(
    (i) => i.kind === 'character' && normalized.includes(i.slug.replace('character-', '')),
  )
}

/** The catalogue as the model sees it: slug, label, and what it depicts. */
export function describeLibraryForPrompt(): string {
  if (IMAGE_LIBRARY.length === 0) return ''
  return IMAGE_LIBRARY.map((i) => `  [${i.slug}] ${i.label} — ${i.description}`).join('\n')
}
