import { describe, expect, it } from 'vitest'
import {
  groundedCompanionBatch,
  groundedVerdictBatch,
  type GroundingModelCaller,
  type GroundingModelRequest,
} from './_grounding.js'

const batch = (cerseiText: string) => JSON.stringify({
  messages: [
    { companion_id: 'ned', text: 'The queen ordered the arrest.', delay_seconds: 0 },
    { companion_id: 'cersei', text: cerseiText, delay_seconds: 3 },
  ],
})

describe('canonical grounded companion batch', () => {
  it('keeps the retry budget inside the durable three-attempt review contract', async () => {
    await expect(groundedCompanionBatch({
      system: 'Return companion JSON.',
      user: 'React to the arrest.',
      facts: ['The queen ordered the arrest.'],
      maxRetries: 3,
      caller: async () => batch('Grounded.'),
    })).rejects.toThrow('0 through 2')
  })

  it('audits every line in parallel and retries the whole batch with attributed findings', async () => {
    const requests: GroundingModelRequest[] = []
    const caller: GroundingModelCaller = async (request) => {
      requests.push(request)
      if (request.system.includes('strict factual auditor')) {
        return request.user.includes('Blades')
          ? '{"violations":["Invented blades."]}'
          : '{"violations":[]}'
      }
      return request.user.includes('PREVIOUS BATCH REJECTED')
        ? batch('At least the order was clear.')
        : batch('Blades. At least someone understood the assignment.')
    }

    const result = await groundedCompanionBatch({
      system: 'Return companion JSON.',
      user: 'React to the arrest.',
      facts: ['The queen ordered the arrest.', 'The guard used no weapon.'],
      maxRetries: 1,
      caller,
    })

    expect(result).toMatchObject({ attempts: 2, findings: [] })
    expect(result.messages[1].text).toBe('At least the order was clear.')
    expect(requests.filter((request) => request.system.includes('strict factual auditor')))
      .toHaveLength(4)
    expect(requests.find((request) => request.user.includes('PREVIOUS BATCH REJECTED'))?.user)
      .toContain('cersei: Invented blades.')
  })

  it('returns exact residual findings after the bounded final attempt', async () => {
    const caller: GroundingModelCaller = async (request) => request.system.includes('strict factual auditor')
      ? '{"violations":["Invented blades."]}'
      : batch('Blades. At least someone understood the assignment.')

    const result = await groundedCompanionBatch({
      system: 'Return companion JSON.',
      user: 'React to the arrest.',
      facts: ['The queen ordered the arrest.', 'The guard used no weapon.'],
      maxRetries: 0,
      caller,
    })

    expect(result.attempts).toBe(1)
    expect(result.findings).toEqual([
      {
        companion_id: 'ned',
        text: 'The queen ordered the arrest.',
        violations: ['Invented blades.'],
      },
      {
        companion_id: 'cersei',
        text: 'Blades. At least someone understood the assignment.',
        violations: ['Invented blades.'],
      },
    ])
  })

  it('treats an unparseable generated batch as a bounded residual', async () => {
    const result = await groundedCompanionBatch({
      system: 'Return companion JSON.',
      user: 'React to the arrest.',
      facts: ['The queen ordered the arrest.'],
      maxRetries: 0,
      caller: async () => 'not json',
    })

    expect(result.messages).toEqual([])
    expect(result.findings[0]).toMatchObject({ companion_id: 'batch' })
  })

  it('accepts the complete seven-speaker ceremony contract', async () => {
    const result = await groundedCompanionBatch({
      system: 'Return the full cast.',
      user: 'Close the room.',
      facts: ['ROOM RECORD: the game ledger is finished.'],
      expectedCompanionIds: ['ned', 'cersei', 'tyrion', 'joffrey', 'daenerys', 'olenna', 'arya'],
      expectedDelaySeconds: [0, 1, 2, 3, 4, 5, 6],
      maxRetries: 0,
      caller: async (request) => request.system.includes('strict factual auditor')
        ? '{"violations":[]}'
        : JSON.stringify({
            messages: ['ned', 'cersei', 'tyrion', 'joffrey', 'daenerys', 'olenna', 'arya']
              .map((companion_id, index) => ({
                companion_id,
                text: `Line ${index + 1}.`,
                delay_seconds: index,
              })),
          }),
    })

    expect(result.findings).toEqual([])
    expect(result.messages).toHaveLength(7)
  })

  it('blocks a generated batch larger than the seven-message publication contract', async () => {
    const result = await groundedCompanionBatch({
      system: 'Return companion JSON.',
      user: 'React to the record.',
      facts: ['ROOM RECORD: the game ledger is finished.'],
      maxRetries: 0,
      caller: async () => JSON.stringify({
        messages: Array.from({ length: 8 }, (_, index) => ({
          companion_id: index === 0 ? 'ned' : 'cersei',
          text: `Line ${index + 1}.`,
          delay_seconds: index,
        })),
      }),
    })

    expect(result.messages).toEqual([])
    expect(result.findings[0]).toMatchObject({ companion_id: 'batch' })
  })

  it('turns partial, duplicate or blank generated items into a batch residual', async () => {
    const malformedBatches = [
      { messages: [{ companion_id: 'ned', text: '', delay_seconds: 0 }] },
      { messages: [
        { companion_id: 'ned', text: 'First.', delay_seconds: 0 },
        { companion_id: 'ned', text: 'Second.', delay_seconds: 1 },
      ] },
      { messages: [{ companion_id: 'invented-speaker', text: 'Line.', delay_seconds: 0 }] },
      { messages: [{ companion_id: 'ned', text: 'Line.', delay_seconds: -1 }] },
      { messages: [
        { companion_id: 'ned', text: 'First.', delay_seconds: 0 },
        { companion_id: 'cersei', text: 'Second.', delay_seconds: 0 },
      ] },
    ]

    for (const malformed of malformedBatches) {
      const result = await groundedCompanionBatch({
        system: 'Return companion JSON.',
        user: 'React to the arrest.',
        facts: ['The queen ordered the arrest.'],
        maxRetries: 0,
        caller: async () => JSON.stringify(malformed),
      })
      expect(result.messages).toEqual([])
      expect(result.findings[0]).toMatchObject({ companion_id: 'batch' })
    }
  })

  it('blocks a valid batch attributed to a companion other than the requested speaker', async () => {
    const result = await groundedCompanionBatch({
      system: 'Return one companion reply.',
      user: 'Answer the player.',
      facts: ['CHAT RECORD: Mara wrote "Hello."'],
      expectedCompanionIds: ['tyrion'],
      maxRetries: 0,
      caller: async () => JSON.stringify({
        messages: [{ companion_id: 'cersei', text: 'No.', delay_seconds: 0 }],
      }),
    })

    expect(result.messages).toEqual([])
    expect(result.findings[0]).toMatchObject({ companion_id: 'batch' })
  })

  it('accepts an exact pack-owned cast without admitting arbitrary speaker ids', async () => {
    const result = await groundedCompanionBatch({
      system: 'Return the pack cast.',
      user: 'React to the bell.',
      facts: ['The bell rang.'],
      allowedCompanionIds: ['archivist', 'lamplighter'],
      expectedCompanionIds: ['archivist', 'lamplighter'],
      expectedDelaySeconds: [0, 6],
      maxRetries: 0,
      caller: async (request) => request.system.includes('strict factual auditor')
        ? '{"violations":[]}'
        : JSON.stringify({
            messages: [
              { companion_id: 'archivist', text: 'The bell rang.', delay_seconds: 0 },
              { companion_id: 'lamplighter', text: 'At last.', delay_seconds: 6 },
            ],
          }),
    })

    expect(result.findings).toEqual([])
    expect(result.messages.map((message) => message.companion_id))
      .toEqual(['archivist', 'lamplighter'])

    const rejected = await groundedCompanionBatch({
      system: 'Return the pack cast.',
      user: 'React to the bell.',
      facts: ['The bell rang.'],
      allowedCompanionIds: ['archivist'],
      maxRetries: 0,
      caller: async () => JSON.stringify({
        messages: [{ companion_id: 'intruder', text: 'I arrived.', delay_seconds: 0 }],
      }),
    })
    expect(rejected.messages).toEqual([])
    expect(rejected.findings[0]).toMatchObject({ companion_id: 'batch' })
  })

  it('does not rewrite a pack-owned id through the legacy cast alias map', async () => {
    const result = await groundedCompanionBatch({
      system: 'Return the pack cast.',
      user: 'React to the bell.',
      facts: ['The bell rang.'],
      allowedCompanionIds: ['queen'],
      expectedCompanionIds: ['queen'],
      expectedDelaySeconds: [0],
      maxRetries: 0,
      caller: async (request) => request.system.includes('strict factual auditor')
        ? '{"violations":[]}'
        : JSON.stringify({
            messages: [{ companion_id: 'queen', text: 'The bell rang.', delay_seconds: 0 }],
          }),
    })

    expect(result.findings).toEqual([])
    expect(result.messages[0]?.companion_id).toBe('queen')
  })

  it('blocks a valid ordered batch when it changes an authored exact cadence', async () => {
    const result = await groundedCompanionBatch({
      system: 'Return the show-start cast.',
      user: 'Begin the watch.',
      facts: ['ROOM RECORD: playback began.'],
      expectedCompanionIds: ['ned', 'arya', 'joffrey', 'olenna'],
      expectedDelaySeconds: [0, 9, 26, 36],
      maxRetries: 0,
      caller: async () => JSON.stringify({
        messages: ['ned', 'arya', 'joffrey', 'olenna'].map((companion_id, index) => ({
          companion_id,
          text: `Line ${index + 1}.`,
          delay_seconds: index,
        })),
      }),
    })

    expect(result.messages).toEqual([])
    expect(result.findings[0]).toMatchObject({ companion_id: 'batch' })
  })

  it('allows the chat safety contract to return an exact empty batch without clearing malformed output', async () => {
    const safeEmpty = await groundedCompanionBatch({
      system: 'Return one companion reply or an empty safety batch.',
      user: 'Answer the player safely.',
      facts: ['CHAT RECORD: Mara wrote "unsafe content".'],
      expectedCompanionIds: ['ned'],
      allowEmptyBatch: true,
      maxRetries: 0,
      caller: async () => '{"messages":[]}',
    })
    const malformed = await groundedCompanionBatch({
      system: 'Return one companion reply or an empty safety batch.',
      user: 'Answer the player safely.',
      facts: ['CHAT RECORD: Mara wrote "unsafe content".'],
      expectedCompanionIds: ['ned'],
      allowEmptyBatch: true,
      maxRetries: 0,
      caller: async () => '{"result":[]}',
    })

    expect(safeEmpty).toMatchObject({ messages: [], findings: [], attempts: 1 })
    expect(malformed.findings[0]).toMatchObject({ companion_id: 'batch' })
  })
})

describe('canonical grounded keepsake verdict batch', () => {
  const contracts = [{
    slot: 1,
    playerId: 'player-1',
    companionId: 'ned',
    allowedMessageIds: ['message-1'],
    allowedImageSlugs: ['character-aemond'],
  }]

  it('audits every prose-bearing verdict field and retries the complete schema-shaped batch', async () => {
    const requests: GroundingModelRequest[] = []
    const unsafe = JSON.stringify({
      verdicts: [{
        slot: 1,
        title: 'The Dragonfall',
        text: 'You watched the dragon die.',
        highlights: [{ message_id: 'message-1', note: 'A death correctly called.' }],
        imagery: [{ slot: 'hero', slug: 'character-aemond', note: 'The killer.' }],
      }],
    })
    const safe = JSON.stringify({
      verdicts: [{
        slot: 1,
        title: 'Held the Line',
        text: 'You held first place with fourteen points.',
        highlights: [{ message_id: 'message-1', note: 'A memorable wager.' }],
        imagery: [{ slot: 'hero', slug: 'character-aemond', note: 'Your strongest draft.' }],
      }],
    })
    const result = await groundedVerdictBatch({
      system: 'Return verdict JSON.',
      user: 'Write the keepsake.',
      facts: [
        'GAME RECORD: the player finished first with fourteen points.',
        'CHAT RECORD: message-1 contains a player wager; it proves only what was written.',
        'ARTWORK CATALOG RECORD: character-aemond is available.',
      ],
      contracts,
      maxRetries: 1,
      caller: async (request) => {
        requests.push(request)
        if (request.system.includes('strict factual auditor')) {
          return request.user.includes('dragon die') || request.user.includes('killer')
            ? '{"violations":["Invented a screen death."]}'
            : '{"violations":[]}'
        }
        return request.user.includes('PREVIOUS BATCH REJECTED') ? safe : unsafe
      },
    })

    expect(result).toMatchObject({ attempts: 2, findings: [] })
    expect(result.verdicts[0].text).toBe('You held first place with fourteen points.')
    expect(requests.filter((request) => request.system.includes('strict factual auditor')))
      .toHaveLength(2)
  })

  it('turns missing slots and invented references into bounded batch residuals', async () => {
    const malformed = [
      { verdicts: [] },
      { verdicts: [{
        slot: 1, title: 'One', text: 'Text.',
        highlights: [{ message_id: 'invented', note: '' }], imagery: [],
      }] },
      { verdicts: [{
        slot: 1, title: 'One', text: 'Text.', highlights: [],
        imagery: [{ slot: 'hero', slug: 'invented', note: '' }],
      }] },
    ]

    for (const payload of malformed) {
      const result = await groundedVerdictBatch({
        system: 'Return verdict JSON.',
        user: 'Write the keepsake.',
        facts: ['GAME RECORD: the player finished first.'],
        contracts,
        maxRetries: 0,
        caller: async () => JSON.stringify(payload),
      })
      expect(result.verdicts).toEqual([])
      expect(result.findings[0]).toMatchObject({ companion_id: 'batch' })
    }
  })
})
