import { describe, expect, it } from 'vitest'
import type { LegacyShowPackMigrationWorksheet } from './legacy-show-pack-audit'
import type { LegacyShowPackAuthoringWorksheet } from './legacy-show-pack-authoring'
import {
  applyLegacySignatureCalibration,
  type LegacySignatureCalibrationManifest,
} from './legacy-signature-calibration'

const LEGACY_SHA = 'a'.repeat(64)

function legacyWorksheet(): LegacyShowPackMigrationWorksheet {
  return {
    catalog: {
      signature_beats: [
        { id: 1, odds: 'Likely', points: 20 },
        { id: 2, odds: 'coin flip', points: 25 },
        { id: 3, odds: 'Long shot', points: 35 },
        { id: 4, odds: 'Wild', points: 45 },
      ],
    },
  } as unknown as LegacyShowPackMigrationWorksheet
}

function authoringWorksheet(): LegacyShowPackAuthoringWorksheet {
  return {
    source: { worksheet_sha256: LEGACY_SHA },
    pack_draft: { id: 'target-pack', version: 1 },
    signature_beats: [1, 2, 3, 4].map((id) => ({
      legacy_signature_beat_id: id,
      probability_pct: null,
      likelihood_tier: null,
      contract: null,
    })),
  } as unknown as LegacyShowPackAuthoringWorksheet
}

function manifest(): LegacySignatureCalibrationManifest {
  return {
    manifest_version: 1,
    artifact: 'legacy-signature-calibration',
    target: { pack_id: 'target-pack', pack_version: 1 },
    legacy_worksheet_sha256: LEGACY_SHA,
    rationale: 'Restrictive intersections of the published odds bands and schema tiers.',
    mappings: [
      { legacy_odds: 'likely', legacy_points: 20, probability_pct: 60, likelihood_tier: 'likely' },
      { legacy_odds: 'coin flip', legacy_points: 25, probability_pct: 40, likelihood_tier: 'toss_up' },
      { legacy_odds: 'long shot', legacy_points: 35, probability_pct: 20, likelihood_tier: 'long_shot' },
      { legacy_odds: 'wild', legacy_points: 45, probability_pct: 9, likelihood_tier: 'chaos' },
    ],
  }
}

describe('legacy signature calibration', () => {
  it('normalizes every audited odds label through the explicit mapping and leaves contracts open', () => {
    const authoring = authoringWorksheet()
    const result = applyLegacySignatureCalibration({
      legacy: legacyWorksheet(),
      legacyWorksheetSha256: LEGACY_SHA,
      authoring,
      manifest: manifest(),
    })

    expect(result.applied_beat_ids).toEqual([1, 2, 3, 4])
    expect(result.worksheet.signature_beats.map((beat) => ({
      probability_pct: beat.probability_pct,
      likelihood_tier: beat.likelihood_tier,
      contract: beat.contract,
    }))).toEqual([
      { probability_pct: 60, likelihood_tier: 'likely', contract: null },
      { probability_pct: 40, likelihood_tier: 'toss_up', contract: null },
      { probability_pct: 20, likelihood_tier: 'long_shot', contract: null },
      { probability_pct: 9, likelihood_tier: 'chaos', contract: null },
    ])
    expect(authoring.signature_beats[0].probability_pct).toBeNull()
  })

  it('fails closed on audit drift, incomplete mappings, and unknown legacy odds', () => {
    expect(() => applyLegacySignatureCalibration({
      legacy: legacyWorksheet(), legacyWorksheetSha256: 'b'.repeat(64),
      authoring: authoringWorksheet(), manifest: manifest(),
    })).toThrow('legacy worksheet SHA-256 does not match')

    const incomplete = manifest()
    incomplete.mappings.pop()
    expect(() => applyLegacySignatureCalibration({
      legacy: legacyWorksheet(), legacyWorksheetSha256: LEGACY_SHA,
      authoring: authoringWorksheet(), manifest: incomplete,
    })).toThrow('signature calibration mappings must exactly cover audited odds and points pairs')

    const legacy = legacyWorksheet()
    legacy.catalog.signature_beats[0].odds = 'Almost certain'
    expect(() => applyLegacySignatureCalibration({
      legacy, legacyWorksheetSha256: LEGACY_SHA,
      authoring: authoringWorksheet(), manifest: manifest(),
    })).toThrow('signature calibration mappings must exactly cover audited odds and points pairs')
  })

  it('requires schema-consistent tiers and closed manifest fields', () => {
    const wrongTier = manifest()
    wrongTier.mappings[1].likelihood_tier = 'likely'
    expect(() => applyLegacySignatureCalibration({
      legacy: legacyWorksheet(), legacyWorksheetSha256: LEGACY_SHA,
      authoring: authoringWorksheet(), manifest: wrongTier,
    })).toThrow('mapping coin flip / 25 likelihood tier must be toss_up at 40%')

    const hidden = manifest()
    Object.assign(hidden.mappings[0], { note: 'must not pass through' })
    expect(() => applyLegacySignatureCalibration({
      legacy: legacyWorksheet(), legacyWorksheetSha256: LEGACY_SHA,
      authoring: authoringWorksheet(), manifest: hidden,
    })).toThrow('mapping likely / 20 fields are invalid')
  })

  it('refuses conflicting prior calibration and is idempotent', () => {
    const first = applyLegacySignatureCalibration({
      legacy: legacyWorksheet(), legacyWorksheetSha256: LEGACY_SHA,
      authoring: authoringWorksheet(), manifest: manifest(),
    })
    const second = applyLegacySignatureCalibration({
      legacy: legacyWorksheet(), legacyWorksheetSha256: LEGACY_SHA,
      authoring: first.worksheet, manifest: manifest(),
    })
    expect(second.worksheet).toEqual(first.worksheet)

    const conflict = structuredClone(first.worksheet)
    conflict.signature_beats[0].probability_pct = 65
    expect(() => applyLegacySignatureCalibration({
      legacy: legacyWorksheet(), legacyWorksheetSha256: LEGACY_SHA,
      authoring: conflict, manifest: manifest(),
    })).toThrow('signature beat 1 already has conflicting calibration')
  })
})
