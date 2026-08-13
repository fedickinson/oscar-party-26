import { describe, expect, it } from 'vitest'
import { deriveWitnessAuthority, deriveWitnessRulingOptions } from './witness-authority'

describe('witness declaration authority', () => {
  it('offers only sealed entities with retained positive evidence as host rulings', () => {
    const options = deriveWitnessRulingOptions({
      rootEntityId: 'entity-root',
      observationCount: 3,
      options: [
        { entity_id: 'entity-root', entity_name: 'Aemond Targaryen', positive_count: 2 },
        { entity_id: 'entity-other', entity_name: 'Ormund Hightower', positive_count: 1 },
      ],
    })
    expect(options).toEqual([
      { entity_id: 'entity-root', entity_name: 'Aemond Targaryen', positive_count: 2 },
      { entity_id: 'entity-other', entity_name: 'Ormund Hightower', positive_count: 1 },
    ])
    expect(() => deriveWitnessRulingOptions({
      rootEntityId: 'entity-root',
      observationCount: 3,
      options: [
        { entity_id: 'entity-root', entity_name: 'Aemond Targaryen', positive_count: 3 },
        { entity_id: 'entity-other', entity_name: 'Ormund Hightower', positive_count: 0 },
      ],
    })).toThrow('witness ruling options require positive evidence')
    expect(() => deriveWitnessRulingOptions({
      rootEntityId: 'entity-root',
      observationCount: 3,
      options: [
        { entity_id: 'entity-root', entity_name: 'Aemond Targaryen', positive_count: 2 },
      ],
    })).toThrow('witness ruling option counts must match retained observations')
  })

  it('keeps even a maximum-confidence single observation in human review', () => {
    expect(deriveWitnessAuthority({
      minimumConfidence: 100,
      maximumConfidence: 100,
      frameSha256: 'a'.repeat(64),
      modelOutputSha256: 'b'.repeat(64),
      exclusions: ['A mention does not count.'],
      adjudication: { proxies: 'do_not_count', offscreen: 'do_not_count', mentions: 'do_not_count' },
      observationCount: 1,
      matchingEntityCount: 1,
      conflictingEntityCount: 0,
      conflictingEntityName: null,
    })).toEqual({
      status: 'human_review_required',
      confidence_label: 'Model confidence: 100%',
      observation_label: '1 positive frame · 1 agree',
      reasons: [
        'One frame and one model output are a proposal, not independent corroboration.',
        'The confidence value is self-reported and has not been calibrated into declaration authority.',
        'Only the host can apply the trigger contract, exclusions, and edge-case judgment.',
      ],
    })
  })

  it('rejects malformed evidence instead of weakening the safety explanation', () => {
    expect(() => deriveWitnessAuthority({
      minimumConfidence: 101,
      maximumConfidence: 101,
      frameSha256: 'a'.repeat(64),
      modelOutputSha256: 'b'.repeat(64),
      exclusions: ['A mention does not count.'],
      adjudication: { proxies: 'do_not_count', offscreen: 'do_not_count', mentions: 'do_not_count' },
      observationCount: 1,
      matchingEntityCount: 1,
      conflictingEntityCount: 0,
      conflictingEntityName: null,
    })).toThrow('witness confidence range must contain integers from 0 through 100')
    expect(() => deriveWitnessAuthority({
      minimumConfidence: 90,
      maximumConfidence: 90,
      frameSha256: 'not-a-hash',
      modelOutputSha256: 'b'.repeat(64),
      exclusions: ['A mention does not count.'],
      adjudication: { proxies: 'do_not_count', offscreen: 'do_not_count', mentions: 'do_not_count' },
      observationCount: 1,
      matchingEntityCount: 1,
      conflictingEntityCount: 0,
      conflictingEntityName: null,
    })).toThrow('witness frame hash must be a lowercase SHA-256')
    expect(() => deriveWitnessAuthority({
      minimumConfidence: 90,
      maximumConfidence: 90,
      frameSha256: 'a'.repeat(64),
      modelOutputSha256: 'b'.repeat(64),
      exclusions: [],
      adjudication: { proxies: 'do_not_count', offscreen: 'do_not_count', mentions: 'do_not_count' },
      observationCount: 1,
      matchingEntityCount: 1,
      conflictingEntityCount: 0,
      conflictingEntityName: null,
    })).toThrow('witness authority requires the sealed non-empty exclusions')
    expect(() => deriveWitnessAuthority({
      minimumConfidence: 90,
      maximumConfidence: 90,
      frameSha256: 'a'.repeat(64),
      modelOutputSha256: 'b'.repeat(64),
      exclusions: ['A mention does not count.'],
      adjudication: { proxies: 'maybe', offscreen: 'do_not_count', mentions: 'do_not_count' },
      observationCount: 1,
      matchingEntityCount: 1,
      conflictingEntityCount: 0,
      conflictingEntityName: null,
    })).toThrow('witness authority requires sealed proxies adjudication')
  })

  it('distinguishes temporal repetition from independent corroboration and surfaces conflict', () => {
    const common = {
      minimumConfidence: 91,
      maximumConfidence: 96,
      frameSha256: 'a'.repeat(64),
      modelOutputSha256: 'b'.repeat(64),
      exclusions: ['A mention does not count.'],
      adjudication: { proxies: 'do_not_count', offscreen: 'do_not_count', mentions: 'do_not_count' },
    }
    expect(deriveWitnessAuthority({
      ...common,
      observationCount: 3,
      matchingEntityCount: 3,
      conflictingEntityCount: 0,
      conflictingEntityName: null,
    }).reasons[0]).toBe(
      'Three retained positive frame judgments repeat the same selection; that is temporal support, not independent corroboration.',
    )
    expect(deriveWitnessAuthority({
      ...common,
      observationCount: 3,
      matchingEntityCount: 2,
      conflictingEntityCount: 1,
      conflictingEntityName: 'Ormund Hightower',
    }).reasons[0]).toBe(
      'One of three retained positive frame judgments selected Ormund Hightower; the conflict requires a host ruling.',
    )
    expect(() => deriveWitnessAuthority({
      ...common,
      observationCount: 3,
      matchingEntityCount: 3,
      conflictingEntityCount: 1,
      conflictingEntityName: 'Ormund Hightower',
    })).toThrow('witness observation counts must reconcile')
    expect(() => deriveWitnessAuthority({
      ...common,
      observationCount: 9,
      matchingEntityCount: 9,
      conflictingEntityCount: 0,
      conflictingEntityName: null,
    })).toThrow('witness observation count exceeds the sealed evidence bound')
  })
})
