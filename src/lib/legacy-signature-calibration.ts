import type { LegacyShowPackMigrationWorksheet } from './legacy-show-pack-audit'
import type { LegacyShowPackAuthoringWorksheet } from './legacy-show-pack-authoring'
import type { LikelihoodTier } from './show-pack'

const SHA256 = /^[a-f0-9]{64}$/

export interface LegacySignatureCalibrationMapping {
  legacy_odds: string
  legacy_points: number
  probability_pct: number
  likelihood_tier: LikelihoodTier
}

export interface LegacySignatureCalibrationManifest {
  manifest_version: 1
  artifact: 'legacy-signature-calibration'
  target: {
    pack_id: string
    pack_version: number
  }
  legacy_worksheet_sha256: string
  rationale: string
  mappings: LegacySignatureCalibrationMapping[]
}

export interface ApplyLegacySignatureCalibrationInput {
  legacy: LegacyShowPackMigrationWorksheet
  legacyWorksheetSha256: string
  authoring: LegacyShowPackAuthoringWorksheet
  manifest: LegacySignatureCalibrationManifest
}

export interface ApplyLegacySignatureCalibrationResult {
  worksheet: LegacyShowPackAuthoringWorksheet
  applied_beat_ids: number[]
}

function normalizeOdds(value: string): string {
  return value.trim().toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ')
}

function pairKey(odds: string, points: number): string {
  return `${normalizeOdds(odds)}\u0000${points}`
}

function expectedTier(probability: number): LikelihoodTier {
  if (probability >= 60) return 'likely'
  if (probability >= 40) return 'toss_up'
  if (probability >= 20) return 'long_shot'
  return 'chaos'
}

function assertText(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be text`)
}

function assertExactKeys(value: object, expected: string[], label: string): void {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length
    || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} fields are invalid`)
  }
}

function assertExactValues(actual: string[], expected: string[], label: string): void {
  const normalizedActual = [...actual].sort()
  const normalizedExpected = [...expected].sort()
  if (normalizedActual.length !== normalizedExpected.length
    || normalizedActual.some((value, index) => value !== normalizedExpected[index])) {
    throw new Error(label)
  }
}

function assertManifest(
  manifest: LegacySignatureCalibrationManifest,
  authoring: LegacyShowPackAuthoringWorksheet,
  legacyWorksheetSha256: string,
): void {
  assertExactKeys(
    manifest,
    ['manifest_version', 'artifact', 'target', 'legacy_worksheet_sha256', 'rationale', 'mappings'],
    'signature calibration manifest',
  )
  if (manifest.manifest_version !== 1 || manifest.artifact !== 'legacy-signature-calibration') {
    throw new Error('signature calibration manifest identity is invalid')
  }
  if (!SHA256.test(legacyWorksheetSha256)
    || legacyWorksheetSha256 !== manifest.legacy_worksheet_sha256
    || authoring.source.worksheet_sha256 !== manifest.legacy_worksheet_sha256) {
    throw new Error('legacy worksheet SHA-256 does not match the signature calibration manifest')
  }
  assertExactKeys(manifest.target, ['pack_id', 'pack_version'], 'signature calibration target')
  if (authoring.pack_draft.id !== manifest.target.pack_id
    || authoring.pack_draft.version !== manifest.target.pack_version) {
    throw new Error('authoring target does not match the signature calibration manifest')
  }
  assertText(manifest.rationale, 'signature calibration rationale')
  if (!Array.isArray(manifest.mappings) || manifest.mappings.length === 0) {
    throw new Error('signature calibration mappings must be a non-empty array')
  }
  for (const mapping of manifest.mappings) {
    const label = `mapping ${normalizeOdds(mapping.legacy_odds)} / ${mapping.legacy_points}`
    assertExactKeys(
      mapping,
      ['legacy_odds', 'legacy_points', 'probability_pct', 'likelihood_tier'],
      label,
    )
    assertText(mapping.legacy_odds, `${label} odds`)
    if (!Number.isInteger(mapping.legacy_points) || mapping.legacy_points < 1) {
      throw new Error(`${label} points must be a positive integer`)
    }
    if (!Number.isInteger(mapping.probability_pct)
      || mapping.probability_pct < 0 || mapping.probability_pct > 100) {
      throw new Error(`${label} probability must be an integer from 0 to 100`)
    }
    const expected = expectedTier(mapping.probability_pct)
    if (mapping.likelihood_tier !== expected) {
      throw new Error(`${label} likelihood tier must be ${expected} at ${mapping.probability_pct}%`)
    }
  }
}

export function applyLegacySignatureCalibration(
  input: ApplyLegacySignatureCalibrationInput,
): ApplyLegacySignatureCalibrationResult {
  const { legacy, legacyWorksheetSha256, authoring, manifest } = input
  assertManifest(manifest, authoring, legacyWorksheetSha256)

  const auditedPairs = [...new Set(legacy.catalog.signature_beats.map((beat) => (
    pairKey(beat.odds, beat.points)
  )))]
  const mappingPairs = manifest.mappings.map((mapping) => (
    pairKey(mapping.legacy_odds, mapping.legacy_points)
  ))
  assertExactValues(
    mappingPairs,
    auditedPairs,
    'signature calibration mappings must exactly cover audited odds and points pairs',
  )
  if (new Set(mappingPairs).size !== mappingPairs.length) {
    throw new Error('signature calibration mappings must not contain duplicates')
  }
  const auditedIds = legacy.catalog.signature_beats.map((beat) => beat.id)
  const authoringIds = authoring.signature_beats.map((beat) => beat.legacy_signature_beat_id)
  assertExactValues(
    authoringIds.map(String),
    auditedIds.map(String),
    'authoring signature beats must exactly cover the audited beat ids',
  )

  const mappingByPair = new Map(manifest.mappings.map((mapping) => [
    pairKey(mapping.legacy_odds, mapping.legacy_points),
    mapping,
  ]))
  const worksheet = structuredClone(authoring)
  for (const audited of legacy.catalog.signature_beats) {
    const beat = worksheet.signature_beats.find((row) => (
      row.legacy_signature_beat_id === audited.id
    ))!
    const mapping = mappingByPair.get(pairKey(audited.odds, audited.points))!
    const currentIsOpen = beat.probability_pct === null && beat.likelihood_tier === null
    const currentMatches = beat.probability_pct === mapping.probability_pct
      && beat.likelihood_tier === mapping.likelihood_tier
    if (!currentIsOpen && !currentMatches) {
      throw new Error(`signature beat ${audited.id} already has conflicting calibration`)
    }
    beat.probability_pct = mapping.probability_pct
    beat.likelihood_tier = mapping.likelihood_tier
  }

  return { worksheet, applied_beat_ids: [...auditedIds] }
}
