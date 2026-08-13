/**
 * Product-facing compatibility adapter for the pinned Fandom Core snapshot.
 *
 * Reusable House of the Dragon knowledge is owned by the private Fandom Core
 * repository. The reviewed snapshot under vendor/fandom-core is intentionally
 * committed so public CI and Vercel need no private-repository credential.
 * Run `npm run fandom:check` to prove the snapshot, public portraits and lock.
 */

import snapshotLock from '../../vendor/fandom-core.lock.json'
import characterDocument from '../../vendor/fandom-core/universes/asoiaf/shows/house-of-the-dragon/seasons/season-3/characters/index.json'
import claimDocument from '../../vendor/fandom-core/universes/asoiaf/shows/house-of-the-dragon/seasons/season-3/claims/index.json'
import dragonDocument from '../../vendor/fandom-core/universes/asoiaf/shows/house-of-the-dragon/seasons/season-3/dragons/index.json'
import episodeDocument from '../../vendor/fandom-core/universes/asoiaf/shows/house-of-the-dragon/seasons/season-3/episodes/index.json'
import eventDocument from '../../vendor/fandom-core/universes/asoiaf/shows/house-of-the-dragon/seasons/season-3/events/index.json'
import relationshipDocument from '../../vendor/fandom-core/universes/asoiaf/shows/house-of-the-dragon/seasons/season-3/relationships/index.json'

export type Allegiance = 'Black' | 'Green' | 'Neutral'

export interface CharacterProfile {
  id: string
  name: string
  actor: string
  house: string
  allegiance: Allegiance
  dragon: { name: string; notes: string } | null
  statusEnteringFinale: string
  arcThisSeason: string
  whatTheyveLost: string
  discourse: string | null
  audienceReaction: string | null
}

export interface EpisodeRecap {
  episode: number
  title: string
  events: string[]
}

export type CriticismCategory =
  | 'adaptation' | 'pacing' | 'characterisation'
  | 'incest-discourse' | 'sexual-violence' | 'production' | 'praise'

export interface CriticismItem {
  category: CriticismCategory
  point: string
  prevalence: string
  spoiler: boolean
}

export interface DragonProfile {
  name: string
  rider: string | null
  allegiance: Allegiance
  status: string
  audienceReaction: string
}

interface CoreDeath {
  season: number
  episode: number
  summary: string
}

interface CoreCharacter {
  id: string
  kind: 'character' | 'collective'
  name: string
  profile_scope?: 'deceased_reference'
  portrayed_by?: string
  legacy_house_label?: string
  faction_id?: string
  status_at_cutoff: string
  season_arc?: string
  losses?: string | null
  critical_discourse?: string | null
  audience_reaction?: string | null
  death?: CoreDeath
}

interface CoreDragon {
  id: string
  kind: 'creature'
  name: string
  profile_scope?: 'deceased_reference'
  rider_as_recorded?: string | null
  faction_id?: string
  status_at_cutoff: string
  audience_reaction?: string
  death?: CoreDeath
}

interface CoreRelationship {
  type: string
  subject_entity_id: string
  object_entity_id: string
  notes: string
}

interface CoreEpisode {
  id: string
  number: number
  title: string | null
  knowledge_status: 'screen_canon_recorded' | 'possibilities_only'
}

interface CoreEvent {
  episode_id: string
  sequence: number
  summary: string
}

interface CoreClaim {
  id: string
  canon: 'screen' | 'discourse' | 'source_material'
  text: string
  category?: string
  prevalence?: string
}

const coreCharacters = characterDocument.records as CoreCharacter[]
const coreDragons = dragonDocument.records as CoreDragon[]
const coreRelationships = relationshipDocument.records as CoreRelationship[]
const coreEpisodes = episodeDocument.records as CoreEpisode[]
const coreEvents = eventDocument.records as CoreEvent[]
const coreClaims = claimDocument.records as CoreClaim[]

export const FANDOM_CORE_REVISION = snapshotLock.revision
export const FANDOM_CORE_PACKAGE_VERSION = snapshotLock.package_version

function requireValue<T>(value: T | null | undefined, label: string): T {
  if (value == null) throw new Error(`Fandom Core snapshot is missing ${label}`)
  return value
}

function allegiance(factionId: string | undefined): Allegiance {
  if (factionId === 'the-blacks') return 'Black'
  if (factionId === 'the-greens') return 'Green'
  if (factionId === 'neutral') return 'Neutral'
  throw new Error(`Fandom Core snapshot has unknown faction ${factionId ?? '(missing)'}`)
}

const dragonById = new Map(coreDragons.map((dragon) => [dragon.id, dragon]))
const dragonBondByCharacter = new Map(
  coreRelationships
    .filter((relationship) => relationship.type === 'dragon_rider_bond')
    .map((relationship) => [relationship.subject_entity_id, relationship]),
)

export const characters: CharacterProfile[] = coreCharacters
  .filter((character) => character.profile_scope == null && character.kind === 'character')
  .map((character) => {
    const bond = dragonBondByCharacter.get(character.id)
    const bondedDragon = bond ? requireValue(dragonById.get(bond.object_entity_id), `dragon ${bond.object_entity_id}`) : null
    return {
      id: character.name,
      name: character.name,
      actor: requireValue(character.portrayed_by, `${character.id}.portrayed_by`),
      house: requireValue(character.legacy_house_label, `${character.id}.legacy_house_label`),
      allegiance: allegiance(character.faction_id),
      dragon: bond && bondedDragon ? { name: bondedDragon.name, notes: bond.notes } : null,
      statusEnteringFinale: character.status_at_cutoff,
      arcThisSeason: requireValue(character.season_arc, `${character.id}.season_arc`),
      // Two legacy profiles intentionally carry null here despite the historic
      // string-only compatibility type. Preserve that runtime behavior.
      whatTheyveLost: (character.losses ?? null) as unknown as string,
      discourse: character.critical_discourse ?? null,
      audienceReaction: character.audience_reaction ?? null,
    }
  })

export const dragons: DragonProfile[] = coreDragons
  .filter((dragon) => dragon.profile_scope == null)
  .map((dragon) => ({
    name: dragon.name,
    rider: dragon.rider_as_recorded ?? null,
    allegiance: allegiance(dragon.faction_id),
    status: dragon.status_at_cutoff,
    audienceReaction: requireValue(dragon.audience_reaction, `${dragon.id}.audience_reaction`),
  }))

const deadOrder = [
  'jacaerys-velaryon',
  'vermax',
  'sharako-lohar',
  'simon-strong-and-his-sons',
  'otto-hightower',
  'criston-cole',
] as const
const deadById = new Map(
  [...coreCharacters, ...coreDragons]
    .filter((entity) => entity.profile_scope === 'deceased_reference')
    .map((entity) => [entity.id, entity]),
)

export const theDead = deadOrder.map((id) => {
  const entity = requireValue(deadById.get(id), `deceased entity ${id}`)
  const death = requireValue(entity.death, `${id}.death`)
  return { name: entity.name, episode: death.episode, how: death.summary }
})

export const episodeRecaps: EpisodeRecap[] = coreEpisodes
  .filter((episode) => episode.knowledge_status === 'screen_canon_recorded')
  .sort((left, right) => left.number - right.number)
  .map((episode) => ({
    episode: episode.number,
    title: requireValue(episode.title, `${episode.id}.title`),
    events: coreEvents
      .filter((event) => event.episode_id === episode.id)
      .sort((left, right) => left.sequence - right.sequence)
      .map((event) => event.summary),
  }))

export const stateOfPlay = requireValue(
  coreClaims.find((claim) => claim.id === 'season-three-state-of-play-through-episode-seven')?.text,
  'state-of-play claim',
)

export const criticism: CriticismItem[] = coreClaims
  .filter((claim) => claim.id.startsWith('season-three-criticism-'))
  .sort((left, right) => left.id.localeCompare(right.id))
  .map((claim) => ({
    category: requireValue(claim.category, `${claim.id}.category`) as CriticismCategory,
    spoiler: claim.canon === 'source_material',
    prevalence: requireValue(claim.prevalence, `${claim.id}.prevalence`),
    point: claim.text,
  }))

export function getCharacter(nameOrId: string): CharacterProfile | undefined {
  const query = nameOrId.trim().toLowerCase()
  return (
    characters.find((character) => character.id.toLowerCase() === query) ??
    characters.find((character) => character.name.toLowerCase() === query) ??
    characters.find((character) => character.name.toLowerCase().includes(query)) ??
    characters.find((character) => query.includes(character.name.toLowerCase().split(' ')[0]))
  )
}

export function getDragon(name: string): DragonProfile | undefined {
  const query = name.trim().toLowerCase()
  return dragons.find((dragon) => dragon.name.toLowerCase() === query)
    ?? dragons.find((dragon) => query.includes(dragon.name.toLowerCase()))
}

export function isDead(name: string): boolean {
  const query = name.trim().toLowerCase()
  return theDead.some((record) => (
    record.name.toLowerCase().includes(query) || query.includes(record.name.toLowerCase())
  ))
}

export function safeCriticism(category?: CriticismCategory): CriticismItem[] {
  return criticism.filter((item) => (
    !item.spoiler && (category == null || item.category === category)
  ))
}

export function hasEncyclopedia(): boolean {
  return characters.length > 0
}
