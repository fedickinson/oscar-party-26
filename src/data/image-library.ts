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
 * Drop a file into public/avatars/<kind>/<slug> and add a row here. Nothing
 * downstream needs touching: the prompt renders this list, the renderer inlines
 * whatever was chosen.
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
import portraitDocument from '../../vendor/fandom-core/universes/asoiaf/shows/house-of-the-dragon/seasons/season-3/assets/portraits.json'

export type ImageKind = 'companion' | 'sigil' | 'character' | 'dragon'

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
 * The 27 draftable characters of the finale.
 *
 * Slugs are chosen so findCharacterImage can resolve a draft entity name by
 * substring without a second mapping table, and are deliberately disambiguated
 * where names overlap: `alysrivers` (not `alys`) because "Alysanne Blackwood"
 * contains "alys", and `oscartully` for the same reason. Every entity is
 * covered — see the resolver check in the notes for this change.
 */
const CHARACTER_IMAGES: LibraryImage[] = [
  { slug: 'character-rhaenyra', kind: 'character', label: 'Rhaenyra Targaryen',
    description: 'the Black Queen, Targaryen, claimant to the Iron Throne',
    path: '/avatars/characters/rhaenyra.jpeg' },
  { slug: 'character-daemon', kind: 'character', label: 'Daemon Targaryen',
    description: 'the Rogue Prince, Targaryen, Rhaenyra\'s consort and sword',
    path: '/avatars/characters/daemon.jpeg' },
  { slug: 'character-aemond', kind: 'character', label: 'Aemond Targaryen',
    description: 'one-eyed Targaryen prince of the Greens, rider of Vhagar',
    path: '/avatars/characters/aemond.jpeg' },
  { slug: 'character-alicent', kind: 'character', label: 'Alicent Hightower',
    description: 'the Queen Dowager, Hightower, mother of the Greens',
    path: '/avatars/characters/alicent.jpeg' },
  { slug: 'character-aegon', kind: 'character', label: 'Aegon II Targaryen',
    description: 'the crowned Green king, Targaryen, rider of Sunfyre',
    path: '/avatars/characters/aegon.jpeg' },
  { slug: 'character-helaena', kind: 'character', label: 'Helaena Targaryen',
    description: 'the gentle Green queen, Targaryen, dreamer',
    path: '/avatars/characters/helaena.jpeg' },
  { slug: 'character-baela', kind: 'character', label: 'Baela Targaryen',
    description: 'Targaryen, daughter of Daemon, rider of Moondancer',
    path: '/avatars/characters/baela.jpeg' },
  { slug: 'character-rhaena', kind: 'character', label: 'Rhaena Targaryen',
    description: 'Targaryen, Baela\'s twin, seeking a dragon of her own',
    path: '/avatars/characters/rhaena.jpeg' },
  { slug: 'character-mysaria', kind: 'character', label: 'Mysaria',
    description: 'the White Worm, Rhaenyra\'s spymistress, no house',
    path: '/avatars/characters/mysaria.jpeg' },
  { slug: 'character-corlys', kind: 'character', label: 'Corlys Velaryon',
    description: 'the Sea Snake, Velaryon, lord of the tides',
    path: '/avatars/characters/corlys.jpeg' },
  { slug: 'character-addam', kind: 'character', label: 'Addam of Hull',
    description: 'Velaryon-blooded dragonseed, rider of Seasmoke',
    path: '/avatars/characters/addam.jpeg' },
  { slug: 'character-alyn', kind: 'character', label: 'Alyn of Hull',
    description: 'Velaryon-blooded sailor, Addam\'s brother',
    path: '/avatars/characters/alyn.jpeg' },
  { slug: 'character-daeron', kind: 'character', label: 'Daeron Targaryen',
    description: 'the youngest Green prince, Targaryen, rider of Tessarion',
    path: '/avatars/characters/daeron.jpeg' },
  { slug: 'character-ormund', kind: 'character', label: 'Ormund Hightower',
    description: 'Hightower commander of the Green host',
    path: '/avatars/characters/ormund.jpeg' },
  { slug: 'character-gwayne', kind: 'character', label: 'Gwayne Hightower',
    description: 'Hightower knight, Alicent\'s brother',
    path: '/avatars/characters/gwayne.jpeg' },
  { slug: 'character-roxton', kind: 'character', label: 'Bold Jon Roxton',
    description: 'a swaggering Green knight with a Valyrian blade',
    path: '/avatars/characters/roxton.jpeg' },
  { slug: 'character-larys', kind: 'character', label: 'Larys Strong',
    description: 'the Clubfoot, Strong, master of whisperers',
    path: '/avatars/characters/larys.jpeg' },
  { slug: 'character-tyland', kind: 'character', label: 'Tyland Lannister',
    description: 'Lannister master of coin for the Greens',
    path: '/avatars/characters/tyland.jpeg' },
  { slug: 'character-orwyle', kind: 'character', label: 'Grand Maester Orwyle',
    description: 'the Grand Maester of King\'s Landing',
    path: '/avatars/characters/orwyle.jpeg' },
  { slug: 'character-alysrivers', kind: 'character', label: 'Alys Rivers',
    description: 'the witch of Harrenhal, Rivers, Aemond\'s keeper',
    path: '/avatars/characters/alysrivers.jpeg' },
  { slug: 'character-hugh', kind: 'character', label: 'Hugh Hammer',
    description: 'a blacksmith turned dragonseed, rider of Vermithor',
    path: '/avatars/characters/hugh.jpeg' },
  { slug: 'character-ulf', kind: 'character', label: 'Ulf the White',
    description: 'a drunkard turned dragonseed, rider of Silverwing',
    path: '/avatars/characters/ulf.jpeg' },
  { slug: 'character-kat', kind: 'character', label: 'Kat',
    description: 'a commonborn dragonseed of Tumbleton',
    path: '/avatars/characters/kat.jpeg' },
  { slug: 'character-roderick', kind: 'character', label: 'Roderick Dustin',
    description: 'Roddy the Ruin, Dustin, Northern warrior',
    path: '/avatars/characters/roderick.jpeg' },
  { slug: 'character-oscartully', kind: 'character', label: 'Oscar Tully',
    description: 'the boy lord of Riverrun, Tully',
    path: '/avatars/characters/oscartully.jpeg' },
  { slug: 'character-alysanne', kind: 'character', label: 'Alysanne Blackwood',
    description: 'Black Aly, Blackwood, archer of the Riverlands',
    path: '/avatars/characters/alysanne.jpeg' },
  { slug: 'character-torrhen', kind: 'character', label: 'Torrhen Manderly',
    description: 'Manderly lord of White Harbor, Northern bannerman for the Blacks',
    path: '/avatars/characters/torrhen.jpeg' },
]

/** The eleven dragons of the Dance. Draftable, so they can carry a night too. */
const DRAGON_IMAGES: LibraryImage[] = [
  { slug: 'character-caraxes', kind: 'dragon', label: 'Caraxes',
    description: 'the Blood Wyrm, Daemon\'s red dragon',
    path: '/avatars/characters/caraxes.jpeg' },
  { slug: 'character-vhagar', kind: 'dragon', label: 'Vhagar',
    description: 'the greatest living dragon, ridden by Aemond',
    path: '/avatars/characters/vhagar.jpeg' },
  { slug: 'character-vermithor', kind: 'dragon', label: 'Vermithor',
    description: 'the Bronze Fury, claimed by Hugh Hammer',
    path: '/avatars/characters/vermithor.jpeg' },
  { slug: 'character-syrax', kind: 'dragon', label: 'Syrax',
    description: 'Rhaenyra\'s yellow she-dragon',
    path: '/avatars/characters/syrax.jpeg' },
  { slug: 'character-sunfyre', kind: 'dragon', label: 'Sunfyre',
    description: 'the Golden, Aegon II\'s dragon',
    path: '/avatars/characters/sunfyre.jpeg' },
  { slug: 'character-seasmoke', kind: 'dragon', label: 'Seasmoke',
    description: 'the pale silver dragon claimed by Addam',
    path: '/avatars/characters/seasmoke.jpeg' },
  { slug: 'character-silverwing', kind: 'dragon', label: 'Silverwing',
    description: 'the silver dragon claimed by Ulf',
    path: '/avatars/characters/silverwing.jpeg' },
  { slug: 'character-dreamfyre', kind: 'dragon', label: 'Dreamfyre',
    description: 'Helaena\'s pale blue dragon',
    path: '/avatars/characters/dreamfyre.jpeg' },
  { slug: 'character-sheepstealer', kind: 'dragon', label: 'Sheepstealer',
    description: 'the ugly brown wild dragon of the Dragonmont',
    path: '/avatars/characters/sheepstealer.jpeg' },
  { slug: 'character-tessarion', kind: 'dragon', label: 'Tessarion',
    description: 'the Blue Queen, Daeron\'s dragon',
    path: '/avatars/characters/tessarion.jpeg' },
  { slug: 'character-moondancer', kind: 'dragon', label: 'Moondancer',
    description: 'Baela\'s small green dragon',
    path: '/avatars/characters/moondancer.jpeg' },
]

const CORE_PORTRAIT_PATHS = new Map(
  portraitDocument.records.map((portrait) => [
    portrait.entity_id,
    portrait.origin_path.replace(/^public/, ''),
  ]),
)

function bindCorePortrait(image: LibraryImage): LibraryImage {
  const entityId = image.slug.replace(/^character-/, '')
  const path = CORE_PORTRAIT_PATHS.get(entityId)
  if (!path) throw new Error(`Fandom Core snapshot has no portrait for ${entityId}`)
  return { ...image, path }
}

export const IMAGE_LIBRARY: LibraryImage[] = [
  ...CHARACTER_IMAGES.map(bindCorePortrait),
  ...DRAGON_IMAGES.map(bindCorePortrait),
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
    (i) =>
      (i.kind === 'character' || i.kind === 'dragon') &&
      normalized.includes(i.slug.replace('character-', '')),
  )
}

/** The catalogue as the model sees it: slug, label, and what it depicts. */
export function describeLibraryForPrompt(): string {
  if (IMAGE_LIBRARY.length === 0) return ''
  return IMAGE_LIBRARY.map((i) => `  [${i.slug}] ${i.label} — ${i.description}`).join('\n')
}
