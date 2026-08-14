import { LEGACY_SHOW_PACK_ID } from './catalog-scope'
import {
  normalizeRuntimeMentionTerm,
  isReservedRuntimeVoiceId,
  runtimeMentionTermMatches,
  runtimeMentionTermsOverlap,
} from './message-authors'
import { parseShowPack } from './show-pack'

export type RuntimeNarrativeMode =
  | 'legacy_live_cast'
  | 'pack_live_cast'
  | 'pack_commentary_only'

export interface BrowserRuntimeNarrativePolicy {
  ceremony: boolean
  liveEvents: boolean
  bingo: boolean
  chat: boolean
  postShow: boolean
  keepsakes: boolean
}

export interface RuntimeNarrativeVoice {
  id: string
  name: string
  slot: 'narrator' | 'rotating'
  role: string
  aliases: string[]
  instruction: string
  attitudeFacts: string[]
  postShow?: {
    farewellOrder: number
    farewellDelaySeconds: number
    farewellInstruction: string
    keepsakeInstruction: string
  }
}

export interface RuntimeMilestoneVoice {
  voice: RuntimeNarrativeVoice
  delaySeconds: number
  instruction: string
}

export interface RuntimeMilestone {
  id: string
  declaredEventCount: number
  voices: RuntimeMilestoneVoice[]
}

export interface RuntimeIdentityChangeVoice {
  voice: RuntimeNarrativeVoice
  instruction: string
}

export interface PackRuntimeNarrativeCast {
  packId: string
  title: string
  property: string
  installment: string
  voices: RuntimeNarrativeVoice[]
  narrator: RuntimeNarrativeVoice
  rotating: RuntimeNarrativeVoice[]
  postShow: {
    voices: RuntimeNarrativeVoice[]
  } | null
  milestones: RuntimeMilestone[]
  identityChange: {
    voices: RuntimeIdentityChangeVoice[]
  } | null
}

interface PublishedRuntimeNarrativeBundle {
  pack_key: string
  version: number
  compiled_bundle: unknown
}

interface RuntimeNarrativePackInput {
  pack: {
    id: string
    title: string
    property: string
    installment: string
  }
  claims: Array<{
    id: string
    canon: string
    status: string
    text: string
  }>
  commentary_voices: Array<{
    id: string
    name: string
    instruction: string
    attitude_claim_ids: string[]
    runtime?: {
      slot: 'narrator' | 'rotating'
      role: string
      aliases: string[]
      post_show?: {
        farewell: {
          order: number
          delay_seconds: number
          instruction: string
        }
        keepsake: {
          instruction: string
        }
      }
    }
  }>
  runtime_ceremonies?: {
    milestones?: Array<{
      id: string
      declared_event_count: number
      voices: Array<{
        voice_id: string
        delay_seconds: number
        instruction: string
      }>
    }>
    identity_change?: {
      voices: Array<{
        voice_id: string
        instruction: string
      }>
    }
  }
}

function normalizedMentionTerms(voice: RuntimeNarrativeVoice): string[] {
  return [...new Set([voice.id, voice.name, ...voice.aliases]
    .map(normalizeRuntimeMentionTerm)
    .filter(Boolean))]
}

export function buildPackRuntimeNarrativeCast(
  pack: RuntimeNarrativePackInput,
): PackRuntimeNarrativeCast | null {
  if (pack.commentary_voices.length < 1 || pack.commentary_voices.length > 7) return null
  const claims = new Map(pack.claims.map((claim) => [claim.id, claim]))
  const voices: RuntimeNarrativeVoice[] = []
  const termOwners: Array<{ term: string; voiceId: string }> = []

  for (const voice of pack.commentary_voices) {
    if (!voice.runtime || isReservedRuntimeVoiceId(voice.id)) return null
    const attitudeFacts: string[] = []
    for (const claimId of voice.attitude_claim_ids) {
      const claim = claims.get(claimId)
      if (!claim || claim.canon !== 'source_material' || claim.status !== 'attitude_only') return null
      attitudeFacts.push(claim.text)
    }
    const projected: RuntimeNarrativeVoice = {
      id: voice.id,
      name: voice.name,
      slot: voice.runtime.slot,
      role: voice.runtime.role,
      aliases: [...voice.runtime.aliases],
      instruction: voice.instruction,
      attitudeFacts,
      ...(voice.runtime.post_show
        ? {
            postShow: {
              farewellOrder: voice.runtime.post_show.farewell.order,
              farewellDelaySeconds: voice.runtime.post_show.farewell.delay_seconds,
              farewellInstruction: voice.runtime.post_show.farewell.instruction,
              keepsakeInstruction: voice.runtime.post_show.keepsake.instruction,
            },
          }
        : {}),
    }
    for (const term of normalizedMentionTerms(projected)) {
      if (termOwners.some((entry) => (
        entry.voiceId !== voice.id && runtimeMentionTermsOverlap(entry.term, term)
      ))) return null
      termOwners.push({ term, voiceId: voice.id })
    }
    voices.push(projected)
  }

  const narrators = voices.filter((voice) => voice.slot === 'narrator')
  if (narrators.length !== 1) return null
  const postShowVoices = voices.filter((voice) => voice.postShow !== undefined)
  let postShow: PackRuntimeNarrativeCast['postShow'] = null
  if (postShowVoices.length > 0) {
    if (postShowVoices.length !== voices.length) return null
    const ordered = [...postShowVoices].sort((left, right) =>
      left.postShow!.farewellOrder - right.postShow!.farewellOrder)
    if (ordered.some((voice, index) => voice.postShow!.farewellOrder !== index + 1)) return null
    if (ordered[0].postShow!.farewellDelaySeconds !== 0) return null
    if (ordered.some((voice, index) => index > 0 &&
      voice.postShow!.farewellDelaySeconds <= ordered[index - 1].postShow!.farewellDelaySeconds)) {
      return null
    }
    postShow = { voices: ordered }
  }
  const voiceById = new Map(voices.map((voice) => [voice.id, voice]))
  const milestones: RuntimeMilestone[] = []
  for (const authored of pack.runtime_ceremonies?.milestones ?? []) {
    if (!Number.isInteger(authored.declared_event_count) || authored.declared_event_count < 1) return null
    const projectedVoices: RuntimeMilestoneVoice[] = []
    for (const entry of authored.voices) {
      const voice = voiceById.get(entry.voice_id)
      if (!voice || !Number.isInteger(entry.delay_seconds)
        || entry.delay_seconds < 0 || entry.delay_seconds > 90
        || !entry.instruction.trim()) return null
      projectedVoices.push({
        voice,
        delaySeconds: entry.delay_seconds,
        instruction: entry.instruction,
      })
    }
    if (projectedVoices.length < 1 || projectedVoices[0].delaySeconds !== 0
      || projectedVoices.some((entry, index) => index > 0
        && entry.delaySeconds <= projectedVoices[index - 1].delaySeconds)) return null
    milestones.push({
      id: authored.id,
      declaredEventCount: authored.declared_event_count,
      voices: projectedVoices,
    })
  }
  if (milestones.some((entry, index) => index > 0
    && entry.declaredEventCount <= milestones[index - 1].declaredEventCount)) return null

  let identityChange: PackRuntimeNarrativeCast['identityChange'] = null
  if (pack.runtime_ceremonies?.identity_change) {
    const projectedVoices: RuntimeIdentityChangeVoice[] = []
    for (const entry of pack.runtime_ceremonies.identity_change.voices) {
      const voice = voiceById.get(entry.voice_id)
      if (!voice || !entry.instruction.trim()) return null
      projectedVoices.push({ voice, instruction: entry.instruction })
    }
    if (projectedVoices.length < 1) return null
    identityChange = { voices: projectedVoices }
  }
  return {
    packId: pack.pack.id,
    title: pack.pack.title,
    property: pack.pack.property,
    installment: pack.pack.installment,
    voices,
    narrator: narrators[0],
    rotating: voices.filter((voice) => voice.slot === 'rotating'),
    postShow,
    milestones,
    identityChange,
  }
}

/** Project the cast only when the immutable registry coordinates agree with
 * the identity embedded in its compiled bundle. */
export function buildPublishedRuntimeNarrativeCast(
  registry: PublishedRuntimeNarrativeBundle,
): PackRuntimeNarrativeCast | null {
  if (registry.compiled_bundle == null) return null
  const bundle = registry.compiled_bundle
  if (typeof bundle === 'object' && bundle !== null && !Array.isArray(bundle)) {
    const identity = (bundle as { pack?: unknown }).pack
    if (typeof identity === 'object' && identity !== null && !Array.isArray(identity)) {
      const embedded = identity as { id?: unknown; version?: unknown }
      if (embedded.id !== registry.pack_key || embedded.version !== registry.version) {
        throw new Error('published show-pack bundle identity does not match its registry row')
      }
    }
  }
  const pack = parseShowPack(JSON.stringify(registry.compiled_bundle))
  if (pack.pack.id !== registry.pack_key || pack.pack.version !== registry.version) {
    throw new Error('published show-pack bundle identity does not match its registry row')
  }
  return buildPackRuntimeNarrativeCast(pack)
}

export function buildRoomRuntimeNarrativeCast(
  showPackId: string,
  registry: PublishedRuntimeNarrativeBundle,
): PackRuntimeNarrativeCast | null {
  if (showPackId === LEGACY_SHOW_PACK_ID) return null
  return buildPublishedRuntimeNarrativeCast(registry)
}

export function detectRuntimeVoiceMentions(
  text: string,
  cast?: PackRuntimeNarrativeCast | null,
): string[] {
  if (!cast) return []
  return cast.voices.flatMap((voice) => normalizedMentionTerms(voice)
    .some((term) => runtimeMentionTermMatches(text, term))
    ? [voice.id]
    : [])
}

export function selectRuntimeEventCast(
  cast: PackRuntimeNarrativeCast,
  rand: () => number = Math.random,
): RuntimeNarrativeVoice[] {
  if (cast.rotating.length === 0) return [cast.narrator]
  const index = Math.min(cast.rotating.length - 1, Math.floor(rand() * cast.rotating.length))
  return [cast.narrator, cast.rotating[index]]
}

export function buildRuntimePreShowArrivalSchedule(
  cast: PackRuntimeNarrativeCast,
  presentVoiceIds: readonly string[],
): Array<{ voiceId: string; delaySeconds: number }> {
  const present = new Set(presentVoiceIds)
  const ordered = [cast.narrator, ...cast.rotating]
    .filter((voice) => !present.has(voice.id))
  return ordered.map((voice, index) => ({
    voiceId: voice.id,
    delaySeconds: index * 75,
  }))
}

export function assignRuntimeKeepsakeAuthors(
  playerIds: readonly string[],
  cast: PackRuntimeNarrativeCast,
): Map<string, string> {
  const voices = cast.postShow?.voices ?? []
  const assignment = new Map<string, string>()
  if (playerIds.length === 0 || voices.length === 0) return assignment
  const seed = [...(playerIds[0] ?? '')]
    .reduce((total, character) => total + character.charCodeAt(0), 0)
  playerIds.forEach((playerId, index) => {
    assignment.set(playerId, voices[(seed + index) % voices.length].id)
  })
  return assignment
}

export function selectRuntimeIdentityChangeVoice(
  cast: PackRuntimeNarrativeCast,
  playerId: string,
  revision: number,
): RuntimeIdentityChangeVoice | null {
  const voices = cast.identityChange?.voices ?? []
  if (voices.length === 0 || !Number.isInteger(revision) || revision < 1) return null
  const seed = [...playerId]
    .reduce((total, character) => total + character.charCodeAt(0), revision)
  return voices[seed % voices.length]
}

/** Browser producers remain legacy-only; the daemon admits a non-legacy room
 * only when its validated compiled pack projects a complete authored cast. */
export function resolveRuntimeNarrativeMode(
  showPackId: string | null | undefined,
  packCast?: PackRuntimeNarrativeCast | null,
): RuntimeNarrativeMode {
  if (showPackId === LEGACY_SHOW_PACK_ID) return 'legacy_live_cast'
  return packCast ? 'pack_live_cast' : 'pack_commentary_only'
}

export function resolveBrowserRuntimeNarrativePolicy(
  showPackId: string | null | undefined,
  packCast?: PackRuntimeNarrativeCast | null,
): BrowserRuntimeNarrativePolicy {
  const mode = resolveRuntimeNarrativeMode(showPackId, packCast)
  if (mode === 'legacy_live_cast') {
    return {
      ceremony: true,
      liveEvents: true,
      bingo: true,
      chat: true,
      postShow: true,
      keepsakes: true,
    }
  }
  if (mode === 'pack_live_cast') {
    const postShowReady = packCast?.postShow != null
    return {
      ceremony: true,
      liveEvents: false,
      bingo: false,
      chat: false,
      postShow: postShowReady,
      keepsakes: postShowReady,
    }
  }
  return {
    ceremony: false,
    liveEvents: false,
    bingo: false,
    chat: false,
    postShow: false,
    keepsakes: false,
  }
}
