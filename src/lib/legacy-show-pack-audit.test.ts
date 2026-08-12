import { describe, expect, it } from 'vitest'
import {
  buildLegacyShowPackMigrationWorksheet,
  type LegacyShowPackMigrationInput,
} from './legacy-show-pack-audit'

const SHA = 'a'.repeat(64)

function fixture(): LegacyShowPackMigrationInput {
  return {
    showPack: {
      id: '8f27e9a4-9f6b-4f3a-9c91-a6b862c98101',
      pack_key: 'legacy-hotd-finale',
      version: 1,
      title: 'Legacy finale',
      property: 'House of the Dragon',
      installment: 'Season finale',
      fact_source: 'room_declared',
      status: 'published',
    },
    categories: [{
      id: 1,
      name: 'First Named Character to Die',
      tier: 1,
      points: 10,
      display_order: 1,
      pack_key: null,
      trigger_contract: null,
    }],
    categoryNominees: [{ category_id: 1, nominee_id: 'nominee-aegon' }],
    nominees: [{
      id: 'nominee-aegon',
      name: 'Aegon II Targaryen',
      type: 'person',
      film_name: 'The Greens',
      image_url: '',
      show_pack_id: '8f27e9a4-9f6b-4f3a-9c91-a6b862c98101',
      pack_key: null,
    }],
    draftEntities: [{
      id: 'entity-aegon',
      name: 'Aegon II Targaryen',
      type: 'person',
      film_name: 'The Greens',
      nominations: [{ category_id: 1, points: 10 }],
      nom_count: 1,
      show_pack_id: '8f27e9a4-9f6b-4f3a-9c91-a6b862c98101',
      pack_key: null,
    }],
    signatureBeats: [{
      id: 10,
      entity_id: 'entity-aegon',
      partner_entity_id: null,
      name: 'Goes King',
      trigger_text: 'Aegon must issue an order.',
      odds: 'Likely',
      points: 20,
      pitch: 'A claimant acts like one.',
      pack_key: null,
      trigger_contract: null,
    }],
    bingoSquares: [{
      id: 20,
      text: 'Aegon issues an order.',
      short_text: 'Aegon Goes King',
      is_objective: false,
      slug: 'aegon_goes_king',
      title: 'Aegon Goes King',
      category: 'greens',
      probability_pct: 70,
      likelihood_tier: 'likely',
      win_condition: 'Aegon must issue an order.',
      why_it_is_fun: 'A claimant acts like one.',
      storyline_tags: ['aegon'],
      fun_type: 'character-payoff',
      pack_key: null,
      trigger_contract: null,
    }],
    portraits: [{
      suggested_id: 'aegon-ii-targaryen',
      label: 'Aegon II Targaryen',
      path: '/avatars/characters/aegon.jpeg',
      sha256: SHA,
    }],
  }
}

describe('legacy show-pack migration worksheet', () => {
  it('preserves the complete source rows while separating identity proof from human authoring', () => {
    const worksheet = buildLegacyShowPackMigrationWorksheet(fixture())

    expect(worksheet.worksheet_version).toBe(1)
    expect(worksheet.counts).toEqual({
      predictions: 1,
      candidate_links: 1,
      nominees: 1,
      draft_entities: 1,
      signature_beats: 1,
      bingo_squares: 1,
      portraits: 1,
    })
    expect(worksheet.identity.ready).toBe(true)
    expect(worksheet.identity.entities).toEqual([expect.objectContaining({
      legacy_entity_id: 'entity-aegon',
      legacy_nominee_id: 'nominee-aegon',
      suggested_id: 'aegon-ii-targaryen',
      portrait: {
        path: '/avatars/characters/aegon.jpeg',
        sha256: SHA,
      },
    })])
    expect(worksheet.catalog.predictions[0].candidate_legacy_nominee_ids).toEqual(['nominee-aegon'])
    expect(worksheet.authoring_queue).toEqual({
      global: ['sources', 'claims', 'commentary_voices', 'commentary_requests'],
      entity_dossier_legacy_ids: ['entity-aegon'],
      prediction_contract_legacy_ids: [1],
      signature_beat_contract_legacy_ids: [10],
      bingo_contract_legacy_ids: [20],
      legacy_nomination_candidate_divergences: [],
    })
    expect(worksheet.issues).toEqual([])
  })

  it('surfaces ambiguous identities and dangling references without inventing a mapping', () => {
    const input = fixture()
    input.nominees.push({ ...input.nominees[0], id: 'nominee-duplicate' })
    input.categoryNominees.push({ category_id: 99, nominee_id: 'nominee-missing' })
    input.signatureBeats[0].entity_id = 'entity-missing'
    input.portraits = []

    const worksheet = buildLegacyShowPackMigrationWorksheet(input)

    expect(worksheet.identity.ready).toBe(false)
    expect(worksheet.identity.entities[0]).toEqual(expect.objectContaining({
      legacy_nominee_id: null,
      suggested_id: null,
      portrait: null,
    }))
    expect(worksheet.issues).toEqual([
      'candidate link references unknown category 99',
      'candidate link for category 99 references unknown nominee nominee-missing',
      'draft entity Aegon II Targaryen has ambiguous canonical nominee identity',
      'draft entity Aegon II Targaryen has no exact-name portrait',
      'signature beat 10 references unknown entity entity-missing',
    ])
  })

  it('is byte-stable across input row order', () => {
    const input = fixture()
    input.categories.push({ ...input.categories[0], id: 2, name: 'Best Speech', display_order: 2 })
    const reversed = structuredClone(input)
    reversed.categories.reverse()
    reversed.categoryNominees.reverse()

    expect(JSON.stringify(buildLegacyShowPackMigrationWorksheet(reversed)))
      .toBe(JSON.stringify(buildLegacyShowPackMigrationWorksheet(input)))
  })

  it('uses the canonical legacy film identity instead of dragon display-name matching', () => {
    const input = fixture()
    input.nominees[0] = {
      ...input.nominees[0],
      name: 'The Golden Dragon',
      type: 'film',
      film_name: 'Sunfyre',
    }
    input.draftEntities[0] = {
      ...input.draftEntities[0],
      name: 'Sunfyre',
      type: 'film',
      film_name: 'Sunfyre',
    }
    input.portraits[0] = {
      ...input.portraits[0],
      suggested_id: 'sunfyre',
      label: 'Sunfyre',
      path: '/avatars/characters/sunfyre.jpeg',
    }

    const worksheet = buildLegacyShowPackMigrationWorksheet(input)
    expect(worksheet.identity.entities[0].legacy_nominee_id).toBe('nominee-aegon')
    expect(worksheet.issues).toEqual([])
  })

  it('preserves a split legacy nomination as a migration decision instead of inventing a candidate', () => {
    const input = fixture()
    input.categoryNominees = []

    const worksheet = buildLegacyShowPackMigrationWorksheet(input)
    expect(worksheet.issues).toEqual(['legacy prediction 1 has no candidate nominees'])
    expect(worksheet.authoring_queue.legacy_nomination_candidate_divergences).toEqual([{
      legacy_entity_id: 'entity-aegon',
      legacy_nominee_id: 'nominee-aegon',
      category_id: 1,
    }])
  })

  it('fails closed when the sealed legacy inventory is incomplete', () => {
    const input = fixture() as LegacyShowPackMigrationInput & {
      expectedCounts: {
        predictions: number
        candidate_links: number
        nominees: number
        draft_entities: number
        signature_beats: number
        bingo_squares: number
        portraits: number
      }
    }
    input.expectedCounts = {
      predictions: 2,
      candidate_links: 1,
      nominees: 1,
      draft_entities: 1,
      signature_beats: 1,
      bingo_squares: 1,
      portraits: 1,
    }

    const worksheet = buildLegacyShowPackMigrationWorksheet(input)
    expect(worksheet.identity.ready).toBe(false)
    expect(worksheet.issues).toContain('legacy inventory predictions expected 2, found 1')
  })

  it('rejects duplicate portrait identities even when their labels differ', () => {
    const input = fixture()
    input.portraits.push({
      ...input.portraits[0],
      label: 'Aemond Targaryen',
      path: '/avatars/characters/aemond.jpeg',
    })

    const worksheet = buildLegacyShowPackMigrationWorksheet(input)
    expect(worksheet.identity.ready).toBe(false)
    expect(worksheet.issues).toContain('legacy portrait has duplicate id aegon-ii-targaryen')
  })
})
