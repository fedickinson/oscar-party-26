import { describe, expect, it } from 'vitest'
import {
  isNonHumanMessageAuthor,
  isReservedRuntimeVoiceId,
  runtimeMentionTermMatches,
  RESERVED_RUNTIME_VOICE_IDS,
} from './message-authors'

describe('message author ownership', () => {
  it('keeps legacy, synthetic, and room-pack cast identities out of human chat', () => {
    expect(isNonHumanMessageAuthor('cersei')).toBe(true)
    expect(isNonHumanMessageAuthor('winner-divider')).toBe(true)
    expect(isNonHumanMessageAuthor('archivist', ['archivist'])).toBe(true)
    expect(isNonHumanMessageAuthor('human-player', ['archivist'])).toBe(false)
  })

  it('reserves synthetic identities while allowing a pack to own its cast names', () => {
    expect(RESERVED_RUNTIME_VOICE_IDS.has('cersei')).toBe(false)
    expect(RESERVED_RUNTIME_VOICE_IDS.has('system')).toBe(true)
    expect(RESERVED_RUNTIME_VOICE_IDS.has('archivist')).toBe(false)
    expect(isReservedRuntimeVoiceId('7fb8ec6c-6f6f-4cab-a03d-2ed89b208fd8')).toBe(true)
  })

  it('matches authored terms without turning embedded names into mentions', () => {
    expect(runtimeMentionTermMatches('Ask Aemon.', 'aemon')).toBe(true)
    expect(runtimeMentionTermMatches('Ask Daemon.', 'aemon')).toBe(false)
    expect(runtimeMentionTermMatches('Élodie, speak.', 'élodie')).toBe(true)
    expect(runtimeMentionTermMatches('élodienne', 'élodie')).toBe(false)
  })
})
