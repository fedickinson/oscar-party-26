import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseShowPack } from './show-pack'
import { resolveDraftEntityPortrait } from './draft-portrait'
import {
  assessShowPackActivation,
  assertActivatableShowPack,
  attestShowPackActivation,
  buildShowPackCatalogManifest,
  buildShowPackActivationPlan,
  buildTriggerContract,
  type InstalledShowPackCatalog,
} from './show-pack-activation'

const proof = parseShowPack(
  readFileSync(new URL('../../show-packs/examples/hotd-s3e8-proof.json', import.meta.url), 'utf8'),
)

describe('show-pack activation gate', () => {
  it('rejects the representative proof slice as too small to deal a bingo card', () => {
    expect(() => assertActivatableShowPack(proof)).toThrow('at least 24 bingo squares')
  })

  it('rejects signature beats that cannot fit the current one-or-pair storage primitive', () => {
    const pack = structuredClone(proof)
    pack.bingo_squares = Array.from({ length: 24 }, (_, index) => ({
      ...proof.bingo_squares[0],
      id: `square-${index + 1}`,
    }))
    pack.signature_beats[0].entity_ids = [
      pack.entities[0].id,
      pack.entities[1].id,
      pack.entities[0].id,
    ]
    expect(() => assertActivatableShowPack(pack)).toThrow('one entity or one explicit pair')
  })

  it('rejects complete contracts whose behavior is not implemented yet', () => {
    const compiled = structuredClone(proof)
    compiled.schema_version = 4
    compiled.game_contract = {
      version: 1,
      commitment: 'open_conviction',
      conviction_budget: 8,
      identity: { selection: 'none', scoring: 'none' },
      scarcity: { commitments: 'fixed_budget', identity: 'none' },
      visibility: 'open_counts',
      cadence: 'immediate_facts_and_event_close',
      continuity: 'canon_write_back',
    }
    for (const wager of [
      ...compiled.predictions,
      ...compiled.signature_beats,
      ...compiled.bingo_squares,
    ]) wager.truth_authority = 'operator_declaration'

    expect(() => assertActivatableShowPack(compiled))
      .toThrow('current conviction engine requires the proven Story Night contract profile')
  })

  it('preserves the complete trigger doctrine in the normalized catalog contract', () => {
    const beat = proof.signature_beats[0]
    const contract = buildTriggerContract(beat)

    expect(contract).toEqual({
      title: beat.title,
      condition: beat.condition,
      exclusions: beat.exclusions,
      adjudication: beat.adjudication,
      title_review: beat.title_review,
      basis_claim_ids: beat.basis_claim_ids,
    })

    contract.exclusions.push('A later amendment.')
    contract.basis_claim_ids.push('a-later-claim')
    contract.adjudication.proxies = 'count'
    contract.title_review.note = 'A later review.'

    expect(beat.exclusions).not.toContain('A later amendment.')
    expect(beat.basis_claim_ids).not.toContain('a-later-claim')
    expect(beat.adjudication.proxies).not.toBe('count')
    expect(beat.title_review.note).not.toBe('A later review.')
  })

  it('builds the complete deterministic normalized activation plan in the pure layer', async () => {
    const pack = structuredClone(proof)
    pack.bingo_squares = Array.from({ length: 24 }, (_, index) => ({
      ...proof.bingo_squares[0],
      id: index === 0 ? proof.bingo_squares[0].id : `square-${index + 1}`,
    }))
    pack.signature_beats[0].entity_ids = ['aegon-ii-targaryen', 'sunfyre']

    const plan = await buildShowPackActivationPlan(pack)
    const repeated = await buildShowPackActivationPlan(structuredClone(pack))

    expect(repeated).toEqual(plan)
    expect(buildShowPackCatalogManifest(plan)).toEqual({
      showPack: plan.showPack,
      nominees: plan.nominees,
      categories: plan.categories,
      categoryNominees: plan.categoryNominees,
      draftEntities: plan.draftEntities,
      signatureBeats: plan.signatureBeats,
      bingoSquares: plan.bingoSquares,
    })
    expect(plan.packRef).toBe('hotd-s3e8-proof@1')
    expect(plan.manifestSha256).toMatch(/^[0-9a-f]{64}$/)
    expect(plan.showPackId).toBe('d3bfcb05-2603-4d61-85bf-148ef4736a1d')
    expect(plan.showPack).toMatchObject({
      id: plan.showPackId,
      pack_key: 'hotd-s3e8-proof',
      version: 1,
      game_contract: plan.compiled.game_contract,
      manifest_sha256: plan.manifestSha256,
      compiled_bundle: plan.compiled,
      status: 'draft',
      published_at: null,
    })
    expect(plan.nominees.map((row) => [row.pack_key, row.id])).toEqual([
      ['aegon-ii-targaryen', 'f8a01839-56ab-4ef6-a6e7-0cdc048e442e'],
      ['sunfyre', '6de619e0-3074-4bda-a936-2ad720834381'],
    ])
    expect(plan.nominees.map((row) => [row.pack_key, row.image_url])).toEqual([
      ['aegon-ii-targaryen', '/avatars/characters/aegon.jpeg'],
      ['sunfyre', '/avatars/characters/sunfyre.jpeg'],
    ])
    expect(plan.draftEntities.map((row) => resolveDraftEntityPortrait(row, plan.nominees))).toEqual([
      '/avatars/characters/aegon.jpeg',
      '/avatars/characters/sunfyre.jpeg',
    ])
    expect(plan.categories[0]).toMatchObject({
      id: 1252333807,
      pack_key: 'cliffhanger-centers-on',
      display_order: 1,
      show_pack_id: plan.showPackId,
    })
    expect(plan.categoryNominees).toEqual([
      { category_id: 1252333807, nominee_id: 'f8a01839-56ab-4ef6-a6e7-0cdc048e442e' },
      { category_id: 1252333807, nominee_id: '6de619e0-3074-4bda-a936-2ad720834381' },
    ])
    expect(plan.draftEntities.map((row) => ({
      pack_key: row.pack_key,
      id: row.id,
      nom_count: row.nom_count,
      nominations: row.nominations,
    }))).toEqual([
      {
        pack_key: 'aegon-ii-targaryen',
        id: '59e1d96c-d89c-4b3f-a992-7092960e1a81',
        nom_count: 1,
        nominations: [{
          category_id: 1252333807,
          nominee_id: 'f8a01839-56ab-4ef6-a6e7-0cdc048e442e',
          category_name: 'The Cliffhanger Centers On',
          points: 10,
        }],
      },
      {
        pack_key: 'sunfyre',
        id: '17ad4525-8cec-43d8-b647-d8dffcef10c0',
        nom_count: 1,
        nominations: [{
          category_id: 1252333807,
          nominee_id: '6de619e0-3074-4bda-a936-2ad720834381',
          category_name: 'The Cliffhanger Centers On',
          points: 10,
        }],
      },
    ])
    expect(plan.signatureBeats[0]).toMatchObject({
      id: 1643277602,
      entity_id: '59e1d96c-d89c-4b3f-a992-7092960e1a81',
      partner_entity_id: '17ad4525-8cec-43d8-b647-d8dffcef10c0',
      pack_key: 'aegon-sass',
    })
    expect(plan.bingoSquares.find((row) => row.pack_key === 'sunfyre-love')).toMatchObject({
      id: 954120463,
      slug: 'hotd-s3e8-proof-v1-sunfyre-love',
      pack_key: 'sunfyre-love',
    })

    plan.categories[0].trigger_contract.exclusions.push('A later mutation.')
    expect(plan.compiled.predictions[0].exclusions).not.toContain('A later mutation.')
  })

  it('attests the installed catalog exactly and rejects missing, extra, or drifted rows', async () => {
    const pack = structuredClone(proof)
    pack.bingo_squares = Array.from({ length: 24 }, (_, index) => ({
      ...proof.bingo_squares[0],
      id: index === 0 ? proof.bingo_squares[0].id : `square-${index + 1}`,
    }))
    const plan = await buildShowPackActivationPlan(pack)
    const installed: InstalledShowPackCatalog = {
      showPack: structuredClone(plan.showPack),
      nominees: structuredClone(plan.nominees),
      categories: structuredClone(plan.categories),
      categoryNominees: structuredClone(plan.categoryNominees),
      draftEntities: structuredClone(plan.draftEntities),
      signatureBeats: structuredClone(plan.signatureBeats),
      bingoSquares: structuredClone(plan.bingoSquares),
    }

    expect(attestShowPackActivation(plan, installed)).toEqual({
      matches: true,
      issues: [],
    })

    const published = structuredClone(installed)
    published.showPack!.status = 'published'
    published.showPack!.published_at = '2026-08-11T00:00:00.000Z'
    expect(attestShowPackActivation(plan, published)).toEqual({
      matches: true,
      issues: [],
    })
    expect(assessShowPackActivation(plan, installed).state).toBe('draft-ready')
    expect(assessShowPackActivation(plan, published).state).toBe('published-attested')

    const absent: InstalledShowPackCatalog = {
      showPack: null,
      nominees: [],
      categories: [],
      categoryNominees: [],
      draftEntities: [],
      signatureBeats: [],
      bingoSquares: [],
    }
    expect(assessShowPackActivation(plan, absent).state).toBe('planned')

    const retired = structuredClone(installed)
    retired.showPack!.status = 'retired'
    retired.showPack!.published_at = '2026-08-11T00:00:00.000Z'
    expect(() => assessShowPackActivation(plan, retired)).toThrow('is retired')

    const registryDrift = structuredClone(installed)
    registryDrift.showPack!.compiled_bundle.pack.title = 'A different compiled title'
    expect(attestShowPackActivation(plan, registryDrift)).toEqual({
      matches: false,
      issues: [`show packs id ${plan.showPackId} differs from compiled plan`],
    })

    const missing = structuredClone(installed)
    const missingNominee = missing.nominees.pop()!
    expect(attestShowPackActivation(plan, missing)).toEqual({
      matches: false,
      issues: [`nominees missing id ${missingNominee.id}`],
    })
    expect(assessShowPackActivation(plan, missing).state).toBe('draft-partial')

    const hiddenDraft = structuredClone(absent)
    hiddenDraft.nominees.push(plan.nominees[0])
    expect(() => assessShowPackActivation(plan, hiddenDraft)).toThrow(
      'has normalized rows but no visible registry row',
    )

    const extra = structuredClone(installed)
    extra.categoryNominees.push({
      category_id: plan.categories[0].id,
      nominee_id: '00000000-0000-4000-8000-000000000001',
    })
    expect(attestShowPackActivation(plan, extra)).toEqual({
      matches: false,
      issues: [
        `category nominees unexpected id ${plan.categories[0].id}:00000000-0000-4000-8000-000000000001`,
      ],
    })

    const drifted = structuredClone(installed)
    drifted.signatureBeats[0].trigger_contract.condition = 'A weaker condition.'
    expect(attestShowPackActivation(plan, drifted)).toEqual({
      matches: false,
      issues: [`signature beats id ${plan.signatureBeats[0].id} differs from compiled plan`],
    })
    drifted.showPack!.status = 'published'
    drifted.showPack!.published_at = '2026-08-11T00:00:00.000Z'
    expect(() => assessShowPackActivation(plan, drifted)).toThrow(
      'installed catalog does not match',
    )
  })
})
