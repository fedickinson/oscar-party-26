import { describe, expect, it } from 'vitest'
import type { LegacyShowPackMigrationWorksheet } from './legacy-show-pack-audit'
import type { LegacyShowPackAuthoringWorksheet } from './legacy-show-pack-authoring'
import { applyLegacySignatureBatchDecisions, type LegacySignatureBatchDecisionManifest } from './legacy-signature-batch-authoring'

const SHA = 'a'.repeat(64)
const legacy = { catalog: { signature_beats: [{ id: 1, trigger_text: 'A and B reconcile.', entity_id: 'a' }, { id: 2, trigger_text: 'Unreviewed.', entity_id: 'a' }] } } as unknown as LegacyShowPackMigrationWorksheet
const authoring = (): LegacyShowPackAuthoringWorksheet => ({ source: { worksheet_sha256: SHA }, pack_draft: { id: 'pack', version: 1 }, claims: [{ id: 'a-state', canon: 'screen', status: 'verified' }, { id: 'b-state', canon: 'screen', status: 'verified' }], entities: [{ legacy_entity_id: 'a', dossier: { fact_claim_ids: ['a-state'] } }, { legacy_entity_id: 'b', dossier: { fact_claim_ids: ['b-state'] } }], signature_beats: [{ legacy_signature_beat_id: 1, contract: null }, { legacy_signature_beat_id: 2, contract: null }] } as unknown as LegacyShowPackAuthoringWorksheet)
const manifest = (): LegacySignatureBatchDecisionManifest => ({ manifest_version: 1, artifact: 'legacy-signature-batch-decisions', batch_id: 'mirrors', target: { pack_id: 'pack', pack_version: 1 }, legacy_worksheet_sha256: SHA, decisions: [{ legacy_signature_beat_id: 1, basis_legacy_entity_ids: ['a', 'b'], condition: 'A and B reconcile.', exclusions: ['A temporary pause in conflict does not count.'], adjudication: { proxies: 'do_not_count', offscreen: 'do_not_count', mentions: 'do_not_count' }, title_review: { status: 'approved', note: 'Reconcile requires an explicit shared act.' } }] })

describe('legacy signature batch authoring', () => {
  it('applies only explicit IDs and grounds every named entity', () => {
    const result = applyLegacySignatureBatchDecisions({ legacy, legacyWorksheetSha256: SHA, authoring: authoring(), manifest: manifest() })
    expect(result.applied_beat_ids).toEqual([1])
    expect(result.worksheet.signature_beats[0].contract?.basis_claim_ids).toEqual(['a-state', 'b-state'])
    expect(result.worksheet.signature_beats[1].contract).toBeNull()
  })
  it('requires the decision condition to equal the immutable audit and include the owner', () => {
    const changed = manifest(); changed.decisions[0].condition = 'Different.'
    expect(() => applyLegacySignatureBatchDecisions({ legacy, legacyWorksheetSha256: SHA, authoring: authoring(), manifest: changed })).toThrow('signature beat 1 condition must match the audited trigger text')
    const owner = manifest(); owner.decisions[0].basis_legacy_entity_ids = ['b']
    expect(() => applyLegacySignatureBatchDecisions({ legacy, legacyWorksheetSha256: SHA, authoring: authoring(), manifest: owner })).toThrow('signature beat 1 basis must include its audited owner')
  })
  it('fails on source drift, bad doctrine and prior conflict, and is idempotent', () => {
    expect(() => applyLegacySignatureBatchDecisions({ legacy, legacyWorksheetSha256: 'b'.repeat(64), authoring: authoring(), manifest: manifest() })).toThrow('legacy worksheet SHA-256 does not match')
    const bad = manifest(); bad.decisions[0].adjudication.offscreen = 'unspecified'
    expect(() => applyLegacySignatureBatchDecisions({ legacy, legacyWorksheetSha256: SHA, authoring: authoring(), manifest: bad })).toThrow('signature beat 1 adjudication offscreen must be explicit')
    const first = applyLegacySignatureBatchDecisions({ legacy, legacyWorksheetSha256: SHA, authoring: authoring(), manifest: manifest() })
    const second = applyLegacySignatureBatchDecisions({ legacy, legacyWorksheetSha256: SHA, authoring: first.worksheet, manifest: manifest() })
    expect(second.worksheet).toEqual(first.worksheet)
    first.worksheet.signature_beats[0].contract!.condition = 'Conflict.'
    expect(() => applyLegacySignatureBatchDecisions({ legacy, legacyWorksheetSha256: SHA, authoring: first.worksheet, manifest: manifest() })).toThrow('signature beat 1 already has a conflicting contract')
  })
})
