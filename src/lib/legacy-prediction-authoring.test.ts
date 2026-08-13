import { describe, expect, it } from 'vitest'
import type { LegacyShowPackMigrationWorksheet } from './legacy-show-pack-audit'
import type { LegacyShowPackAuthoringWorksheet } from './legacy-show-pack-authoring'
import {
  applyLegacyPredictionContractDecisions,
  type LegacyPredictionContractDecisionManifest,
} from './legacy-prediction-authoring'

const LEGACY_SHA = 'a'.repeat(64)

function legacyWorksheet(): LegacyShowPackMigrationWorksheet {
  return {
    identity: {
      entities: [{
        legacy_entity_id: 'legacy-aegon',
        legacy_nominee_id: 'nominee-aegon',
        name: 'Aegon',
      }, {
        legacy_entity_id: 'legacy-rhaenyra',
        legacy_nominee_id: 'nominee-rhaenyra',
        name: 'Rhaenyra',
      }],
    },
    catalog: {
      predictions: [{
        id: 1,
        name: 'Wins the Battle',
        candidate_legacy_nominee_ids: ['nominee-aegon', 'nominee-rhaenyra'],
      }],
    },
  } as unknown as LegacyShowPackMigrationWorksheet
}

function authoringWorksheet(): LegacyShowPackAuthoringWorksheet {
  return {
    source: { worksheet_sha256: LEGACY_SHA },
    pack_draft: { id: 'target-pack', version: 1 },
    claims: [{
      id: 'aegon-screen-state', canon: 'screen', status: 'verified', text: 'Alive.', source_ids: ['record'],
    }, {
      id: 'rhaenyra-screen-state', canon: 'screen', status: 'verified', text: 'Alive.', source_ids: ['record'],
    }],
    entities: [{
      legacy_entity_id: 'legacy-aegon',
      id: 'aegon',
      dossier: { fact_claim_ids: ['aegon-screen-state'], discourse_claim_ids: [] },
    }, {
      legacy_entity_id: 'legacy-rhaenyra',
      id: 'rhaenyra',
      dossier: { fact_claim_ids: ['rhaenyra-screen-state'], discourse_claim_ids: [] },
    }],
    predictions: [{
      legacy_prediction_id: 1,
      id: 'wins-the-battle',
      candidate_legacy_nominee_ids: ['nominee-aegon', 'nominee-rhaenyra'],
      contract: null,
    }],
  } as unknown as LegacyShowPackAuthoringWorksheet
}

function manifest(): LegacyPredictionContractDecisionManifest {
  return {
    manifest_version: 1,
    artifact: 'legacy-prediction-contract-decisions',
    target: { pack_id: 'target-pack', pack_version: 1 },
    legacy_worksheet_sha256: LEGACY_SHA,
    decisions: [{
      legacy_prediction_id: 1,
      condition: 'The candidate whose side wins the episode\'s principal organized battle.',
      exclusions: ['A skirmish without a clear tactical result does not count.'],
      adjudication: {
        proxies: 'principal_accepts_if_unrefused',
        offscreen: 'explicit_only',
        mentions: 'explicit_only',
      },
      title_review: {
        status: 'approved',
        note: 'Battle means the episode\'s principal organized engagement.',
      },
    }],
  }
}

describe('legacy prediction authoring', () => {
  it('applies explicit doctrine and derives basis from every candidate dossier', () => {
    const authoring = authoringWorksheet()
    const result = applyLegacyPredictionContractDecisions({
      legacy: legacyWorksheet(),
      legacyWorksheetSha256: LEGACY_SHA,
      authoring,
      manifest: manifest(),
    })

    expect(result.applied_prediction_ids).toEqual([1])
    expect(result.worksheet.predictions[0].contract).toEqual({
      condition: manifest().decisions[0].condition,
      exclusions: manifest().decisions[0].exclusions,
      adjudication: manifest().decisions[0].adjudication,
      title_review: manifest().decisions[0].title_review,
      basis_claim_ids: ['aegon-screen-state', 'rhaenyra-screen-state'],
    })
    expect(result.worksheet.predictions[0].contract).not.toHaveProperty('legacy_prediction_id')
    expect(authoring.predictions[0].contract).toBeNull()
  })

  it('fails closed on source drift and incomplete decision coverage', () => {
    expect(() => applyLegacyPredictionContractDecisions({
      legacy: legacyWorksheet(),
      legacyWorksheetSha256: 'b'.repeat(64),
      authoring: authoringWorksheet(),
      manifest: manifest(),
    })).toThrow('legacy worksheet SHA-256 does not match')

    const decisions = manifest()
    decisions.decisions = []
    expect(() => applyLegacyPredictionContractDecisions({
      legacy: legacyWorksheet(),
      legacyWorksheetSha256: LEGACY_SHA,
      authoring: authoringWorksheet(),
      manifest: decisions,
    })).toThrow('prediction decisions must exactly cover the audited prediction ids')
  })

  it('requires explicit adjudication, approved honest titles, and closed fields', () => {
    const unspecified = manifest()
    unspecified.decisions[0].adjudication.proxies = 'unspecified'
    expect(() => applyLegacyPredictionContractDecisions({
      legacy: legacyWorksheet(), legacyWorksheetSha256: LEGACY_SHA,
      authoring: authoringWorksheet(), manifest: unspecified,
    })).toThrow('prediction 1 adjudication proxies must be explicit')

    const title = manifest()
    title.decisions[0].title_review.status = 'needs_revision'
    expect(() => applyLegacyPredictionContractDecisions({
      legacy: legacyWorksheet(), legacyWorksheetSha256: LEGACY_SHA,
      authoring: authoringWorksheet(), manifest: title,
    })).toThrow('prediction 1 title review must be approved')

    const hidden = manifest()
    Object.assign(hidden.decisions[0], { private_note: 'must not pass through' })
    expect(() => applyLegacyPredictionContractDecisions({
      legacy: legacyWorksheet(), legacyWorksheetSha256: LEGACY_SHA,
      authoring: authoringWorksheet(), manifest: hidden,
    })).toThrow('prediction 1 decision fields are invalid')
  })

  it('requires the exact candidate universe and verified screen dossier claims', () => {
    const candidates = authoringWorksheet()
    candidates.predictions[0].candidate_legacy_nominee_ids = ['nominee-aegon']
    expect(() => applyLegacyPredictionContractDecisions({
      legacy: legacyWorksheet(), legacyWorksheetSha256: LEGACY_SHA,
      authoring: candidates, manifest: manifest(),
    })).toThrow('prediction 1 candidates must match the audited candidate universe')

    const dossier = authoringWorksheet()
    dossier.entities[0].dossier = null
    expect(() => applyLegacyPredictionContractDecisions({
      legacy: legacyWorksheet(), legacyWorksheetSha256: LEGACY_SHA,
      authoring: dossier, manifest: manifest(),
    })).toThrow('prediction 1 candidate Aegon needs a dossier fact claim')
  })

  it('refuses conflicting prior contracts and is idempotent', () => {
    const first = applyLegacyPredictionContractDecisions({
      legacy: legacyWorksheet(), legacyWorksheetSha256: LEGACY_SHA,
      authoring: authoringWorksheet(), manifest: manifest(),
    })
    const second = applyLegacyPredictionContractDecisions({
      legacy: legacyWorksheet(), legacyWorksheetSha256: LEGACY_SHA,
      authoring: first.worksheet, manifest: manifest(),
    })
    expect(second.worksheet).toEqual(first.worksheet)

    const conflict = structuredClone(first.worksheet)
    conflict.predictions[0].contract!.condition = 'A different rule.'
    expect(() => applyLegacyPredictionContractDecisions({
      legacy: legacyWorksheet(), legacyWorksheetSha256: LEGACY_SHA,
      authoring: conflict, manifest: manifest(),
    })).toThrow('prediction 1 already has a conflicting contract')
  })
})
