import { describe, expect, it } from 'vitest'
import type { LegacyShowPackMigrationWorksheet } from './legacy-show-pack-audit'
import type { LegacyShowPackAuthoringWorksheet } from './legacy-show-pack-authoring'
import {
  applyLegacyDossierDecisions,
  type LegacyDossierDecisionManifest,
  type LegacyDossierProfile,
} from './legacy-dossier-authoring'

const LEGACY_SHA = 'a'.repeat(64)
const ENCYCLOPEDIA_SHA = 'b'.repeat(64)

const profiles: LegacyDossierProfile[] = [{
  name: 'Aegon II Targaryen',
  screen_state: 'Alive with Sunfyre at the cutoff.',
  audience_reaction: 'Audience interest rose during the road story.',
}, {
  name: 'Sunfyre',
  screen_state: 'Alive, scarred, and reunited with Aegon.',
  audience_reaction: 'The reunion was a major audience favorite.',
}]

function legacyWorksheet(): LegacyShowPackMigrationWorksheet {
  return {
    identity: {
      entities: [{
        legacy_entity_id: 'legacy-aegon',
        name: 'Aegon II Targaryen',
      }, {
        legacy_entity_id: 'legacy-sunfyre',
        name: 'Sunfyre',
      }],
    },
  } as unknown as LegacyShowPackMigrationWorksheet
}

function authoringWorksheet(): LegacyShowPackAuthoringWorksheet {
  return {
    source: { worksheet_sha256: LEGACY_SHA },
    pack_draft: { id: 'target-pack', version: 1 },
    sources: [],
    claims: [],
    entities: [{
      legacy_entity_id: 'legacy-aegon',
      id: 'aegon',
      dossier: null,
    }, {
      legacy_entity_id: 'legacy-sunfyre',
      id: 'sunfyre',
      dossier: null,
    }],
  } as unknown as LegacyShowPackAuthoringWorksheet
}

function manifest(): LegacyDossierDecisionManifest {
  return {
    manifest_version: 1,
    artifact: 'legacy-dossier-decisions',
    target: { pack_id: 'target-pack', pack_version: 1 },
    legacy_worksheet_sha256: LEGACY_SHA,
    encyclopedia_sha256: ENCYCLOPEDIA_SHA,
    approved_entity_legacy_ids: ['legacy-aegon', 'legacy-sunfyre'],
    screen_source: {
      id: 'entity-screen-record',
      kind: 'operator_record',
      title: 'Entity screen record',
      locator: 'repo:encyclopedia#screen',
    },
    sentiment_source: {
      id: 'entity-audience-synthesis',
      kind: 'sentiment',
      title: 'Entity audience synthesis',
      locator: 'repo:encyclopedia#audience',
    },
  }
}

describe('legacy dossier authoring', () => {
  it('copies exact canonical profile text into claims and fills every approved dossier', () => {
    const authoring = authoringWorksheet()
    const result = applyLegacyDossierDecisions({
      legacy: legacyWorksheet(),
      legacyWorksheetSha256: LEGACY_SHA,
      authoring,
      profiles,
      encyclopediaSha256: ENCYCLOPEDIA_SHA,
      manifest: manifest(),
    })

    expect(result.applied_entity_legacy_ids).toEqual(['legacy-aegon', 'legacy-sunfyre'])
    expect(result.worksheet.sources).toEqual([
      manifest().screen_source,
      manifest().sentiment_source,
    ])
    expect(result.worksheet.claims).toEqual(expect.arrayContaining([{
      id: 'aegon-screen-state',
      canon: 'screen',
      status: 'verified',
      text: profiles[0].screen_state,
      source_ids: ['entity-screen-record'],
    }, {
      id: 'sunfyre-audience-reaction',
      canon: 'discourse',
      status: 'verified',
      text: profiles[1].audience_reaction,
      source_ids: ['entity-audience-synthesis'],
    }]))
    expect(result.worksheet.entities[0].dossier).toEqual({
      fact_claim_ids: ['aegon-screen-state'],
      discourse_claim_ids: ['aegon-audience-reaction'],
    })
    expect(authoring.entities[0].dossier).toBeNull()
  })

  it('fails closed on either source hash drifting', () => {
    expect(() => applyLegacyDossierDecisions({
      legacy: legacyWorksheet(),
      legacyWorksheetSha256: 'c'.repeat(64),
      authoring: authoringWorksheet(),
      profiles,
      encyclopediaSha256: ENCYCLOPEDIA_SHA,
      manifest: manifest(),
    })).toThrow('legacy worksheet SHA-256 does not match')

    expect(() => applyLegacyDossierDecisions({
      legacy: legacyWorksheet(),
      legacyWorksheetSha256: LEGACY_SHA,
      authoring: authoringWorksheet(),
      profiles,
      encyclopediaSha256: 'c'.repeat(64),
      manifest: manifest(),
    })).toThrow('encyclopedia SHA-256 does not match')
  })

  it('requires exact profile and approval coverage', () => {
    expect(() => applyLegacyDossierDecisions({
      legacy: legacyWorksheet(),
      legacyWorksheetSha256: LEGACY_SHA,
      authoring: authoringWorksheet(),
      profiles: profiles.slice(0, 1),
      encyclopediaSha256: ENCYCLOPEDIA_SHA,
      manifest: manifest(),
    })).toThrow('dossier profiles must exactly cover the audited entity names')

    const decisions = manifest()
    decisions.approved_entity_legacy_ids.pop()
    expect(() => applyLegacyDossierDecisions({
      legacy: legacyWorksheet(),
      legacyWorksheetSha256: LEGACY_SHA,
      authoring: authoringWorksheet(),
      profiles,
      encyclopediaSha256: ENCYCLOPEDIA_SHA,
      manifest: decisions,
    })).toThrow('approved dossier ids must exactly cover the audited legacy entity ids')
  })

  it('refuses conflicting prior dossier authoring', () => {
    const authoring = authoringWorksheet()
    authoring.entities[0].dossier = {
      fact_claim_ids: ['different-fact'],
      discourse_claim_ids: ['different-discourse'],
    }
    expect(() => applyLegacyDossierDecisions({
      legacy: legacyWorksheet(),
      legacyWorksheetSha256: LEGACY_SHA,
      authoring,
      profiles,
      encyclopediaSha256: ENCYCLOPEDIA_SHA,
      manifest: manifest(),
    })).toThrow('entity Aegon II Targaryen already has a conflicting dossier')
  })

  it('rejects unknown fields on copied source objects', () => {
    const decisions = manifest()
    Object.assign(decisions.screen_source, { private_note: 'must not ride into authoring' })
    expect(() => applyLegacyDossierDecisions({
      legacy: legacyWorksheet(),
      legacyWorksheetSha256: LEGACY_SHA,
      authoring: authoringWorksheet(),
      profiles,
      encyclopediaSha256: ENCYCLOPEDIA_SHA,
      manifest: decisions,
    })).toThrow('dossier screen source fields are invalid')
  })

  it('is byte-structurally idempotent', () => {
    const first = applyLegacyDossierDecisions({
      legacy: legacyWorksheet(),
      legacyWorksheetSha256: LEGACY_SHA,
      authoring: authoringWorksheet(),
      profiles,
      encyclopediaSha256: ENCYCLOPEDIA_SHA,
      manifest: manifest(),
    })
    const second = applyLegacyDossierDecisions({
      legacy: legacyWorksheet(),
      legacyWorksheetSha256: LEGACY_SHA,
      authoring: first.worksheet,
      profiles,
      encyclopediaSha256: ENCYCLOPEDIA_SHA,
      manifest: manifest(),
    })
    expect(second.worksheet).toEqual(first.worksheet)
  })
})
