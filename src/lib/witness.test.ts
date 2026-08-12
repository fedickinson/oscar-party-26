import { describe, expect, it } from 'vitest'
import {
  buildWitnessInstruction,
  parseWitnessDecision,
  parseWitnessReferenceManifest,
  type WitnessCandidate,
} from './witness'

const candidates: WitnessCandidate[] = [
  {
    beat_id: 17,
    beat_key: 'the-dragon-falls',
    title: 'The Dragon Falls',
    condition: 'Vermithor visibly falls and can no longer continue the fight.',
    exclusions: ['A stumble, injury, mention, or off-screen report does not count.'],
    adjudication: { proxies: 'do_not_count', offscreen: 'do_not_count', mentions: 'do_not_count' },
    points: 25,
    entities: [
      { entity_id: 'entity-vermithor', entity_key: 'vermithor', name: 'Vermithor' },
    ],
  },
  {
    beat_id: 18,
    beat_key: 'the-collision',
    title: 'The Collision',
    condition: 'Either named fighter directly defeats the other on screen.',
    exclusions: ['An ally acting independently does not count.'],
    adjudication: { proxies: 'explicit_only', offscreen: 'do_not_count', mentions: 'do_not_count' },
    points: 20,
    entities: [
      { entity_id: 'entity-ulf', entity_key: 'ulf', name: 'Ulf the White' },
      { entity_id: 'entity-ormund', entity_key: 'ormund', name: 'Ormund Hightower' },
    ],
  },
]

describe('AI witness boundary', () => {
  it('accepts a closed local reference manifest and rejects unsafe paths', () => {
    const manifest = parseWitnessReferenceManifest(JSON.stringify({
      schema_version: 1,
      show_pack: { key: 'hotd-s3-finale', version: 2 },
      references: [
        { entity_key: 'vermithor', images: ['portraits/vermithor.webp'] },
        { entity_key: 'ulf', images: ['portraits/ulf one.jpeg', 'portraits/ulf two.jpeg'] },
      ],
    }))

    expect(manifest.references[1].images).toHaveLength(2)
    expect(() => parseWitnessReferenceManifest(JSON.stringify({
      ...manifest,
      references: [{ entity_key: 'vermithor', images: ['../private.webp'] }],
    }))).toThrow('reference image paths must stay inside the manifest directory')
    expect(() => parseWitnessReferenceManifest(JSON.stringify({
      ...manifest,
      references: [{ entity_key: 'vermithor', images: ['/tmp/private.webp'] }],
    }))).toThrow('reference image paths must stay inside the manifest directory')
  })

  it('builds a deterministic closed-world instruction from canonical board fields', () => {
    const instruction = buildWitnessInstruction(candidates)

    expect(instruction).toContain('17 | the-dragon-falls | The Dragon Falls | 25 points')
    expect(instruction).toContain('Allowed entity ids: entity-ulf, entity-ormund')
    expect(instruction).toContain('Adjudication: proxies=explicit_only | offscreen=do_not_count | mentions=do_not_count')
    expect(instruction).toContain('Apply each candidate\'s explicit proxy, off-screen, and mention adjudication')
    expect(instruction).not.toContain('off-screen, a mention, a proxy excluded by the rule')
    expect(instruction).toContain('Return exactly {"proposal":null}')
    expect(buildWitnessInstruction(structuredClone(candidates))).toBe(instruction)
  })

  it('accepts only a structured candidate pairing and never model-authored prose', () => {
    expect(parseWitnessDecision(
      '{"proposal":{"beat_id":18,"entity_id":"entity-ormund","confidence":87}}',
      candidates,
    )).toEqual({ beat_id: 18, entity_id: 'entity-ormund', confidence: 87 })

    expect(parseWitnessDecision('{"proposal":null}', candidates)).toBeNull()
    expect(() => parseWitnessDecision(
      '{"proposal":{"beat_id":18,"entity_id":"entity-vermithor","confidence":87}}',
      candidates,
    )).toThrow('does not belong to beat 18')
    expect(() => parseWitnessDecision(
      '{"proposal":{"beat_id":17,"entity_id":"entity-vermithor","confidence":87,"evidence":"It fell"}}',
      candidates,
    )).toThrow('proposal has unknown field evidence')
    expect(() => parseWitnessDecision(
      '```json\n{"proposal":null}\n```',
      candidates,
    )).toThrow('model response must be one JSON object with no surrounding text')
  })

  it('rejects ambiguous candidate contracts before a model call', () => {
    expect(() => buildWitnessInstruction([...candidates, structuredClone(candidates[0])]))
      .toThrow('duplicate witness beat id 17')
    expect(() => buildWitnessInstruction([{ ...candidates[0], condition: '' }]))
      .toThrow('witness beat 17 condition is required')
  })
})
