import { describe, expect, it } from 'vitest'
import { LEGACY_SHOW_PACK_ID } from './catalog-scope'
import {
  buildPackRuntimeNarrativeCast,
  buildPublishedRuntimeNarrativeCast,
  buildRoomRuntimeNarrativeCast,
  detectRuntimeVoiceMentions,
  resolveRuntimeNarrativeMode,
  resolveBrowserRuntimeNarrativePolicy,
  buildRuntimePreShowArrivalSchedule,
  selectRuntimeEventCast,
  assignRuntimeKeepsakeAuthors,
  selectRuntimeIdentityChangeVoice,
} from './runtime-narrative'

const packNarrative = {
  pack: {
    id: 'lantern-watch-s1e2',
    title: 'Lantern Watch',
    property: 'Lantern Watch',
    installment: 'Season 1, Episode 2',
  },
  claims: [{
    id: 'archivist-attitude',
    canon: 'source_material' as const,
    status: 'attitude_only' as const,
    text: 'The Archivist treats public promises as debts.',
    source_ids: ['chronicle'],
  }],
  commentary_voices: [
    {
      id: 'archivist',
      name: 'The Archivist',
      instruction: 'Judge public promises with calm precision.',
      attitude_claim_ids: ['archivist-attitude'],
      runtime: {
        slot: 'narrator' as const,
        role: 'The Record',
        aliases: ['archive'],
        post_show: {
          farewell: {
            order: 1,
            delay_seconds: 0,
            instruction: 'Close the record with calm precision.',
          },
          keepsake: {
            instruction: 'Judge the player by promises kept and broken.',
          },
        },
      },
    },
    {
      id: 'lamplighter',
      name: 'The Lamplighter',
      instruction: 'Delight in danger, but never invent it.',
      attitude_claim_ids: [],
      runtime: {
        slot: 'rotating' as const,
        role: 'The Spark',
        aliases: ['lamp'],
        post_show: {
          farewell: {
            order: 2,
            delay_seconds: 8,
            instruction: 'End with delighted danger and one warm note.',
          },
          keepsake: {
            instruction: 'Find the brave choice without inventing its motive.',
          },
        },
      },
    },
  ],
  runtime_ceremonies: {
    milestones: [{
      id: 'first-turn',
      declared_event_count: 3,
      voices: [
        { voice_id: 'archivist', delay_seconds: 0, instruction: 'Enter the checkpoint.' },
        { voice_id: 'lamplighter', delay_seconds: 5, instruction: 'Judge the standings.' },
      ],
    }],
    identity_change: {
      voices: [
        { voice_id: 'archivist', instruction: 'Treat the revision as a debt.' },
        { voice_id: 'lamplighter', instruction: 'Treat the revision as a spark.' },
      ],
    },
  },
}

describe('room-bound runtime narrative policy', () => {
  it('admits the deployed legacy cast only for its exact pinned show pack', () => {
    expect(resolveRuntimeNarrativeMode(LEGACY_SHOW_PACK_ID)).toBe('legacy_live_cast')
    expect(resolveRuntimeNarrativeMode('b99161ea-328f-4a00-904a-a6e98bc376b5'))
      .toBe('pack_commentary_only')
  })

  it('fails closed while the room pack binding is unknown', () => {
    expect(resolveRuntimeNarrativeMode(null)).toBe('pack_commentary_only')
    expect(resolveRuntimeNarrativeMode(undefined)).toBe('pack_commentary_only')
    expect(resolveRuntimeNarrativeMode('')).toBe('pack_commentary_only')
  })

  it('projects a complete pack-owned cast and admits its daemon runtime', () => {
    const cast = buildPackRuntimeNarrativeCast(packNarrative)

    expect(cast).toMatchObject({
      packId: 'lantern-watch-s1e2',
      narrator: { id: 'archivist', role: 'The Record' },
      rotating: [{ id: 'lamplighter', role: 'The Spark' }],
    })
    expect(cast?.narrator.attitudeFacts).toEqual([
      'The Archivist treats public promises as debts.',
    ])
    expect(resolveRuntimeNarrativeMode('pack-registry-id', cast)).toBe('pack_live_cast')
    expect(cast?.milestones[0]).toMatchObject({ id: 'first-turn', declaredEventCount: 3 })
    expect(cast?.identityChange?.voices.map((entry) => entry.voice.id))
      .toEqual(['archivist', 'lamplighter'])
  })

  it('rejects a compiled bundle whose embedded identity differs from the registry', () => {
    expect(() => buildPublishedRuntimeNarrativeCast({
      pack_key: 'another-show',
      version: 1,
      compiled_bundle: packNarrative,
    })).toThrow('published show-pack bundle identity does not match its registry row')
  })

  it('keeps the legacy room on its compatibility cast even if its bundle later gains voices', () => {
    expect(buildRoomRuntimeNarrativeCast(LEGACY_SHOW_PACK_ID, {
      pack_key: 'lantern-watch-s1e2',
      version: 1,
      compiled_bundle: packNarrative,
    })).toBeNull()
  })

  it('gives a generic browser ceremony ownership without duplicating daemon or post-show work', () => {
    const cast = buildPackRuntimeNarrativeCast(packNarrative)!

    expect(resolveBrowserRuntimeNarrativePolicy('pack-registry-id', cast)).toEqual({
      ceremony: true,
      liveEvents: false,
      bingo: false,
      chat: false,
      postShow: true,
      keepsakes: true,
    })
    expect(resolveBrowserRuntimeNarrativePolicy('pack-registry-id', null))
      .toEqual(expect.objectContaining({ ceremony: false }))
    expect(resolveBrowserRuntimeNarrativePolicy(LEGACY_SHOW_PACK_ID))
      .toEqual(expect.objectContaining({
        ceremony: true,
        liveEvents: true,
        bingo: true,
        chat: true,
        postShow: true,
        keepsakes: true,
      }))
  })

  it('keeps generic post-show closed when the live cast has no authored post-show contract', () => {
    const liveOnly = {
      ...structuredClone(packNarrative),
      commentary_voices: packNarrative.commentary_voices.map((voice) => ({
        ...voice,
        runtime: {
          slot: voice.runtime.slot,
          role: voice.runtime.role,
          aliases: [...voice.runtime.aliases],
        },
      })),
    }
    const cast = buildPackRuntimeNarrativeCast(liveOnly)!

    expect(resolveBrowserRuntimeNarrativePolicy('pack-registry-id', cast)).toEqual(
      expect.objectContaining({ ceremony: true, postShow: false, keepsakes: false }),
    )
  })

  it('assigns pack keepsake authors deterministically from the authored farewell order', () => {
    const cast = buildPackRuntimeNarrativeCast(packNarrative)!
    const first = assignRuntimeKeepsakeAuthors(['player-a', 'player-b', 'player-c'], cast)
    const second = assignRuntimeKeepsakeAuthors(['player-a', 'player-b', 'player-c'], cast)

    expect([...first.entries()]).toEqual([...second.entries()])
    expect(new Set(first.values())).toEqual(new Set(['archivist', 'lamplighter']))
  })

  it('selects an authored identity-change voice deterministically by player revision', () => {
    const cast = buildPackRuntimeNarrativeCast(packNarrative)!
    const first = selectRuntimeIdentityChangeVoice(cast, 'player-a', 2)
    const replay = selectRuntimeIdentityChangeVoice(cast, 'player-a', 2)

    expect(replay).toEqual(first)
    expect(cast.identityChange?.voices).toContainEqual(first)
  })

  it('fails closed for partial metadata, duplicate aliases, or an ambiguous narrator', () => {
    expect(buildPackRuntimeNarrativeCast({
      ...packNarrative,
      commentary_voices: packNarrative.commentary_voices.map((voice) => (
        voice.id === 'lamplighter' ? { ...voice, runtime: undefined } : voice
      )),
    })).toBeNull()
    expect(buildPackRuntimeNarrativeCast({
      ...packNarrative,
      commentary_voices: packNarrative.commentary_voices.map((voice) => voice.id === 'lamplighter'
        ? { ...voice, name: 'Archivist Junior' }
        : voice),
    })).toBeNull()
    expect(buildPackRuntimeNarrativeCast({
      ...packNarrative,
      commentary_voices: packNarrative.commentary_voices.map((voice) => ({
        ...voice,
        runtime: { ...voice.runtime, aliases: ['archive'] },
      })),
    })).toBeNull()
    expect(buildPackRuntimeNarrativeCast({
      ...packNarrative,
      commentary_voices: packNarrative.commentary_voices.map((voice) => ({
        ...voice,
        runtime: { ...voice.runtime, slot: 'narrator' as const },
      })),
    })).toBeNull()
  })

  it('fails closed when a pack tries to reuse a synthetic message identity', () => {
    expect(buildPackRuntimeNarrativeCast({
      ...packNarrative,
      commentary_voices: [{
        ...packNarrative.commentary_voices[0],
        id: 'system',
      }],
    })).toBeNull()
  })

  it('matches authored names and aliases on word boundaries', () => {
    const cast = buildPackRuntimeNarrativeCast(packNarrative)!

    expect(detectRuntimeVoiceMentions('Archivist, what did you make of that?', cast))
      .toEqual(['archivist'])
    expect(detectRuntimeVoiceMentions('Ask the lamp, not the archive.', cast))
      .toEqual(['archivist', 'lamplighter'])
    expect(detectRuntimeVoiceMentions('The lamprey was visible.')).toEqual([])
  })

  it('puts the narrator first and deterministically limits a live beat to two voices', () => {
    const cast = buildPackRuntimeNarrativeCast(packNarrative)!

    expect(selectRuntimeEventCast(cast, () => 0)).toEqual([
      cast.narrator,
      cast.rotating[0],
    ])
  })

  it('schedules every missing pack voice in narrator-first order and rebases after reload', () => {
    const cast = buildPackRuntimeNarrativeCast(packNarrative)!

    expect(buildRuntimePreShowArrivalSchedule(cast, [])).toEqual([
      { voiceId: 'archivist', delaySeconds: 0 },
      { voiceId: 'lamplighter', delaySeconds: 75 },
    ])
    expect(buildRuntimePreShowArrivalSchedule(cast, ['archivist'])).toEqual([
      { voiceId: 'lamplighter', delaySeconds: 0 },
    ])
  })
})
