import { describe, expect, it } from 'vitest'
import type { LegacyShowPackAuthoringWorksheet } from './legacy-show-pack-authoring'
import {
  applyLegacyCommentaryDecisions,
  type LegacyCommentaryDecisionManifest,
} from './legacy-commentary-authoring'

const LEGACY_SHA = 'a'.repeat(64)

function authoring(): LegacyShowPackAuthoringWorksheet {
  return {
    worksheet_version: 2,
    source: { worksheet_sha256: LEGACY_SHA },
    pack_draft: { id: 'target-pack', version: 1 },
    global_review: {
      sources: null,
      claims: null,
      commentary_voices: null,
      commentary_requests: null,
    },
    claims: [{
      id: 'screen-fact', canon: 'screen', status: 'verified', text: 'A screen fact.', source_ids: ['screen'],
    }, {
      id: 'discourse-angle', canon: 'discourse', status: 'verified', text: 'An audience angle.', source_ids: ['sentiment'],
    }, {
      id: 'book-attitude', canon: 'source_material', status: 'attitude_only', text: 'A lore attitude.', source_ids: ['book'],
    }],
    commentary_voices: [],
    commentary_requests: [],
  } as unknown as LegacyShowPackAuthoringWorksheet
}

function manifest(): LegacyCommentaryDecisionManifest {
  return {
    manifest_version: 1,
    artifact: 'legacy-commentary-decisions',
    target: { pack_id: 'target-pack', pack_version: 1 },
    legacy_worksheet_sha256: LEGACY_SHA,
    voices: [{
      id: 'the-witness',
      name: 'The Witness',
      instruction: 'Speak plainly and distinguish fact from judgment.',
      attitude_claim_ids: ['book-attitude'],
    }],
    requests: [{
      id: 'opening-record',
      speaker: 'the-witness',
      fact_claim_ids: ['screen-fact'],
      angle_claim_ids: ['discourse-angle'],
      angle: 'Complicate the audience reaction without inventing events.',
      publication: { status: 'pending' },
    }],
  }
}

describe('legacy commentary authoring', () => {
  it('authors only explicit voices and pending grounded requests without approving them', () => {
    const input = authoring()
    const result = applyLegacyCommentaryDecisions({ authoring: input, manifest: manifest() })

    expect(result.worksheet.commentary_voices).toEqual(manifest().voices)
    expect(result.worksheet.commentary_requests).toEqual(manifest().requests)
    expect(result.worksheet.global_review).toEqual(input.global_review)
    expect(result.applied_voice_ids).toEqual(['the-witness'])
    expect(result.applied_request_ids).toEqual(['opening-record'])
    expect(input.commentary_voices).toEqual([])
  })

  it('rejects canon contamination and generated output in an authoring decision', () => {
    const contaminatedVoice = manifest()
    contaminatedVoice.voices[0].attitude_claim_ids = ['screen-fact']
    expect(() => applyLegacyCommentaryDecisions({
      authoring: authoring(), manifest: contaminatedVoice,
    })).toThrow('must be source-material attitude only')

    const contaminatedFact = manifest()
    contaminatedFact.requests[0].fact_claim_ids = ['discourse-angle']
    expect(() => applyLegacyCommentaryDecisions({
      authoring: authoring(), manifest: contaminatedFact,
    })).toThrow('must be a verified screen claim')

    const generated = manifest() as unknown as LegacyCommentaryDecisionManifest & {
      requests: Array<Record<string, unknown>>
    }
    generated.requests[0].publication = { status: 'ready', text: 'Ungrounded output.' }
    expect(() => applyLegacyCommentaryDecisions({
      authoring: authoring(), manifest: generated,
    })).toThrow('publication must be exactly pending')
  })

  it('fails on drift or conflicts and is idempotent for the exact same decisions', () => {
    const drifted = manifest()
    drifted.legacy_worksheet_sha256 = 'b'.repeat(64)
    expect(() => applyLegacyCommentaryDecisions({
      authoring: authoring(), manifest: drifted,
    })).toThrow('worksheet SHA-256 does not match')

    const first = applyLegacyCommentaryDecisions({ authoring: authoring(), manifest: manifest() })
    const second = applyLegacyCommentaryDecisions({ authoring: first.worksheet, manifest: manifest() })
    expect(second.worksheet).toEqual(first.worksheet)

    const conflict = manifest()
    conflict.voices[0].instruction = 'Use a conflicting instruction.'
    expect(() => applyLegacyCommentaryDecisions({
      authoring: first.worksheet, manifest: conflict,
    })).toThrow('commentary voice the-witness conflicts with prior authoring')
  })
})
