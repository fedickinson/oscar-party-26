import { describe, expect, it } from 'vitest'
import { collectLineCandidates } from './player-recap'
import type { MessageRow, PlayerRow } from '../types/database'
import type { RuntimeNarrativeVoice } from './runtime-narrative'

describe('keepsake chat candidate authors', () => {
  it('recognizes a room-pack voice by its authored display name', () => {
    const player = {
      id: 'player-a',
      name: 'Mara',
    } as PlayerRow
    const message = {
      id: 'message-a',
      player_id: 'archivist',
      text: 'Mara kept the promise in the ledger.',
    } as MessageRow
    const voice = {
      id: 'archivist',
      name: 'The Archivist',
    } as RuntimeNarrativeVoice

    expect(collectLineCandidates([message], [player], [voice]).get(player.id)).toEqual([{
      messageId: message.id,
      author: 'The Archivist',
      text: message.text,
    }])
  })
})
