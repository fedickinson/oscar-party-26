import { describe, expect, it } from 'vitest'
import type { LegacyShowPackMigrationWorksheet } from './legacy-show-pack-audit'
import type { LegacyShowPackAuthoringWorksheet } from './legacy-show-pack-authoring'
import {
  applyLegacySignatureDeathDecisions,
  type LegacySignatureDeathDecisionManifest,
} from './legacy-signature-death-authoring'

const LEGACY_SHA = 'a'.repeat(64)

function legacyWorksheet(): LegacyShowPackMigrationWorksheet {
  return {
    catalog: { signature_beats: [{
      id: 1, name: 'Aegon Dies',
      trigger_text: 'Aegon dies on screen, or the death is stated unambiguously.',
      entity_id: 'legacy-aegon', partner_entity_id: null,
    }, {
      id: 2, name: 'Sunfyre Dies',
      trigger_text: 'Sunfyre is killed or dies on screen.',
      entity_id: 'legacy-sunfyre', partner_entity_id: null,
    }, { id: 3, name: 'Flies', trigger_text: 'Aegon flies.', entity_id: 'legacy-aegon' }] },
  } as unknown as LegacyShowPackMigrationWorksheet
}

function authoringWorksheet(): LegacyShowPackAuthoringWorksheet {
  return {
    source: { worksheet_sha256: LEGACY_SHA }, pack_draft: { id: 'target', version: 1 },
    claims: [
      { id: 'aegon-screen-state', canon: 'screen', status: 'verified' },
      { id: 'sunfyre-screen-state', canon: 'screen', status: 'verified' },
    ],
    entities: [
      { legacy_entity_id: 'legacy-aegon', kind: 'person', dossier: { fact_claim_ids: ['aegon-screen-state'] } },
      { legacy_entity_id: 'legacy-sunfyre', kind: 'creature', dossier: { fact_claim_ids: ['sunfyre-screen-state'] } },
    ],
    signature_beats: [1, 2, 3].map((id) => ({ legacy_signature_beat_id: id, contract: null })),
  } as unknown as LegacyShowPackAuthoringWorksheet
}

function manifest(): LegacySignatureDeathDecisionManifest {
  return {
    manifest_version: 1, artifact: 'legacy-signature-death-decisions',
    target: { pack_id: 'target', pack_version: 1 }, legacy_worksheet_sha256: LEGACY_SHA,
    person_beat_ids: [1], creature_beat_ids: [2],
    person: {
      exclusions: ['An ambiguous disappearance or apparently fatal wound does not count.'],
      adjudication: { proxies: 'do_not_count', offscreen: 'explicit_only', mentions: 'explicit_only' },
      title_review: { status: 'approved', note: 'Dies requires an unambiguous death.' },
    },
    creature: {
      exclusions: ['An off-screen report, disappearance, or disabling wound does not count.'],
      adjudication: { proxies: 'do_not_count', offscreen: 'do_not_count', mentions: 'do_not_count' },
      title_review: { status: 'approved', note: 'Dies requires an on-screen dragon death.' },
    },
  }
}

describe('legacy signature death authoring', () => {
  it('preserves audited conditions, grounds owners, and leaves other beats open', () => {
    const result = applyLegacySignatureDeathDecisions({
      legacy: legacyWorksheet(), legacyWorksheetSha256: LEGACY_SHA,
      authoring: authoringWorksheet(), manifest: manifest(),
    })
    expect(result.applied_beat_ids).toEqual([1, 2])
    expect(result.worksheet.signature_beats[0].contract).toMatchObject({
      condition: 'Aegon dies on screen, or the death is stated unambiguously.',
      basis_claim_ids: ['aegon-screen-state'],
      adjudication: { offscreen: 'explicit_only' },
    })
    expect(result.worksheet.signature_beats[1].contract).toMatchObject({
      condition: 'Sunfyre is killed or dies on screen.',
      basis_claim_ids: ['sunfyre-screen-state'],
      adjudication: { offscreen: 'do_not_count' },
    })
    expect(result.worksheet.signature_beats[2].contract).toBeNull()
  })

  it('fails closed on audit drift, incomplete death coverage, and wrong owner kind', () => {
    expect(() => applyLegacySignatureDeathDecisions({
      legacy: legacyWorksheet(), legacyWorksheetSha256: 'b'.repeat(64),
      authoring: authoringWorksheet(), manifest: manifest(),
    })).toThrow('legacy worksheet SHA-256 does not match')
    const incomplete = manifest(); incomplete.creature_beat_ids = []
    expect(() => applyLegacySignatureDeathDecisions({
      legacy: legacyWorksheet(), legacyWorksheetSha256: LEGACY_SHA,
      authoring: authoringWorksheet(), manifest: incomplete,
    })).toThrow('death decision ids must exactly cover the audited death beats')
    const wrong = authoringWorksheet(); wrong.entities[1].kind = 'person'
    expect(() => applyLegacySignatureDeathDecisions({
      legacy: legacyWorksheet(), legacyWorksheetSha256: LEGACY_SHA,
      authoring: wrong, manifest: manifest(),
    })).toThrow('signature beat 2 owner must be creature')
  })

  it('refuses bad doctrine and conflicting prior contracts, and is idempotent', () => {
    const bad = manifest(); bad.person.adjudication.offscreen = 'unspecified'
    expect(() => applyLegacySignatureDeathDecisions({
      legacy: legacyWorksheet(), legacyWorksheetSha256: LEGACY_SHA,
      authoring: authoringWorksheet(), manifest: bad,
    })).toThrow('person death adjudication offscreen must be explicit')
    const first = applyLegacySignatureDeathDecisions({
      legacy: legacyWorksheet(), legacyWorksheetSha256: LEGACY_SHA,
      authoring: authoringWorksheet(), manifest: manifest(),
    })
    const second = applyLegacySignatureDeathDecisions({
      legacy: legacyWorksheet(), legacyWorksheetSha256: LEGACY_SHA,
      authoring: first.worksheet, manifest: manifest(),
    })
    expect(second.worksheet).toEqual(first.worksheet)
    first.worksheet.signature_beats[0].contract!.condition = 'Different.'
    expect(() => applyLegacySignatureDeathDecisions({
      legacy: legacyWorksheet(), legacyWorksheetSha256: LEGACY_SHA,
      authoring: first.worksheet, manifest: manifest(),
    })).toThrow('signature beat 1 already has a conflicting contract')
  })
})
