import { describe, expect, it } from 'vitest'
import {
  buildLegacyShowPackMigrationWorksheet,
  type LegacyShowPackMigrationInput,
} from './legacy-show-pack-audit'
import {
  assessLegacyShowPackAuthoringWorksheet,
  applyLegacyCommentaryPublications,
  buildLegacyShowPackAuthoringWorksheet,
  finalizeLegacyShowPackAuthoringWorksheet,
  projectLegacyShowPackAuthoringWorksheet,
} from './legacy-show-pack-authoring'
import {
  LEGACY_GLOBAL_REVIEW_COLLECTIONS,
  legacyGlobalReviewCollectionSha256,
} from './legacy-global-review'

const SHA = 'a'.repeat(64)
const WORKSHEET_SHA = 'b'.repeat(64)

function legacyFixture(): ReturnType<typeof buildLegacyShowPackMigrationWorksheet> {
  const input: LegacyShowPackMigrationInput = {
    showPack: {
      id: 'legacy-registry-id',
      pack_key: 'legacy-finale',
      version: 1,
      title: 'Legacy finale',
      property: 'House of the Dragon',
      installment: 'Season finale',
      fact_source: 'room_declared',
      status: 'published',
    },
    categories: [{
      id: 1,
      name: 'Last Character On Screen',
      tier: 1,
      points: 10,
      display_order: 1,
      pack_key: null,
      trigger_contract: null,
    }],
    categoryNominees: [
      { category_id: 1, nominee_id: 'nominee-aegon' },
      { category_id: 1, nominee_id: 'nominee-sunfyre' },
    ],
    nominees: [
      {
        id: 'nominee-aegon',
        name: 'Aegon II Targaryen',
        type: 'person',
        film_name: 'The Greens',
        image_url: '',
        pack_key: null,
      },
      {
        id: 'nominee-sunfyre',
        name: 'The Golden Dragon',
        type: 'film',
        film_name: 'Sunfyre',
        image_url: '',
        pack_key: null,
      },
    ],
    draftEntities: [
      {
        id: 'entity-aegon',
        name: 'Aegon II Targaryen',
        type: 'person',
        film_name: 'The Greens',
        nominations: [{ category_id: 1 }],
        nom_count: 1,
        pack_key: null,
      },
      {
        id: 'entity-sunfyre',
        name: 'Sunfyre',
        type: 'film',
        film_name: 'Sunfyre',
        nominations: [{ category_id: 1 }],
        nom_count: 1,
        pack_key: null,
      },
    ],
    signatureBeats: [{
      id: 10,
      entity_id: 'entity-aegon',
      partner_entity_id: 'entity-sunfyre',
      name: 'The King Flies',
      trigger_text: 'Aegon and Sunfyre take flight.',
      odds: 'Coin flip',
      points: 20,
      pitch: 'The reunion becomes a sortie.',
      pack_key: null,
      trigger_contract: null,
    }],
    bingoSquares: [{
      id: 20,
      text: 'A dragon takes flight.',
      short_text: 'Dragon Flight',
      is_objective: true,
      slug: 'dragon_flight',
      title: 'Dragon Flight',
      category: 'dragons',
      probability_pct: 60,
      likelihood_tier: 'likely',
      win_condition: 'A dragon must visibly take flight.',
      why_it_is_fun: 'A clean spectacle beat.',
      storyline_tags: ['dragons'],
      fun_type: 'spectacle',
      pack_key: null,
      trigger_contract: null,
    }],
    portraits: [
      {
        suggested_id: 'aegon',
        label: 'Aegon II Targaryen',
        path: '/avatars/characters/aegon.jpeg',
        sha256: SHA,
      },
      {
        suggested_id: 'sunfyre',
        label: 'Sunfyre',
        path: '/avatars/characters/sunfyre.jpeg',
        sha256: SHA,
      },
    ],
  }
  return buildLegacyShowPackMigrationWorksheet(input)
}

function completedAuthoring() {
  const legacy = legacyFixture()
  const authoring = buildLegacyShowPackAuthoringWorksheet(legacy, WORKSHEET_SHA)
  authoring.pack_draft.id = 'legacy-finale-v3'
  authoring.pack_draft.version = 1
  authoring.pack_draft.title = 'Legacy finale schema-v3 pack'
  authoring.pack_draft.canon_cutoff = 'End of the preceding episode'
  authoring.sources = [{
    id: 'prior-screen-record',
    kind: 'screen',
    title: 'Prior episode screen record',
    locator: 'screen:prior-episode',
  }]
  authoring.claims = [{
    id: 'both-remain-in-play',
    canon: 'screen',
    status: 'verified',
    text: 'Aegon and Sunfyre remained in play at the prior episode cutoff.',
    source_ids: ['prior-screen-record'],
  }]
  for (const entity of authoring.entities) {
    entity.kind = entity.legacy_entity_id === 'entity-sunfyre' ? 'creature' : 'person'
    entity.group = 'The Greens'
    entity.dossier = {
      fact_claim_ids: ['both-remain-in-play'],
      discourse_claim_ids: [],
    }
  }
  authoring.predictions[0].candidate_legacy_nominee_ids = [
    'nominee-aegon',
    'nominee-sunfyre',
  ]
  authoring.predictions[0].contract = contract()
  authoring.signature_beats[0].probability_pct = 50
  authoring.signature_beats[0].likelihood_tier = 'toss_up'
  authoring.signature_beats[0].contract = contract()
  authoring.bingo_squares[0].contract = contract()
  for (const collection of LEGACY_GLOBAL_REVIEW_COLLECTIONS) {
    authoring.global_review[collection] = {
      sha256: legacyGlobalReviewCollectionSha256(authoring, collection),
      note: `Reviewed ${collection} fixture.`,
    }
  }
  return { legacy, authoring }
}

function contract() {
  return {
    condition: 'The promised event must happen unmistakably on screen.',
    exclusions: ['Dialogue-only references do not count.'],
    adjudication: {
      proxies: 'do_not_count' as const,
      offscreen: 'do_not_count' as const,
      mentions: 'do_not_count' as const,
    },
    title_review: {
      status: 'approved' as const,
      note: 'The title and condition promise the same visible event.',
    },
    basis_claim_ids: ['both-remain-in-play'],
  }
}

describe('legacy show-pack authoring factory', () => {
  it('reports every incomplete authoring lane without mistaking seeded mechanics for approval', () => {
    const legacy = legacyFixture()
    const authoring = buildLegacyShowPackAuthoringWorksheet(legacy, WORKSHEET_SHA)
    const status = assessLegacyShowPackAuthoringWorksheet(legacy, WORKSHEET_SHA, authoring)

    expect(status.ready).toBe(false)
    expect(status.issues).toEqual([])
    expect(status.lanes).toMatchObject({
      target_identity: { filled: 0, total: 1, open_ids: ['pack_draft'] },
      canon_cutoff: { filled: 0, total: 1, open_ids: ['pack_draft'] },
      global_review: {
        filled: 0,
        total: 4,
        open_ids: ['sources', 'claims', 'commentary_voices', 'commentary_requests'],
      },
      entity_kind: { filled: 1, total: 2, open_ids: ['entity-sunfyre'] },
      entity_dossier: { filled: 0, total: 2, open_ids: ['entity-aegon', 'entity-sunfyre'] },
      prediction_candidates: { filled: 0, total: 1, open_ids: ['1'] },
      prediction_contract: { filled: 0, total: 1, open_ids: ['1'] },
      signature_beat_probability: { filled: 0, total: 1, open_ids: ['10'] },
      signature_beat_likelihood: { filled: 0, total: 1, open_ids: ['10'] },
      signature_beat_contract: { filled: 0, total: 1, open_ids: ['10'] },
      bingo_contract: { filled: 0, total: 1, open_ids: ['20'] },
    })
  })

  it('marks the review ledger ready only when the same input finalizes successfully', () => {
    const { legacy, authoring } = completedAuthoring()
    const status = assessLegacyShowPackAuthoringWorksheet(legacy, WORKSHEET_SHA, authoring)

    expect(status.ready).toBe(true)
    expect(status.issues).toEqual([])
    expect(Object.values(status.lanes).every((lane) => lane.filled === lane.total)).toBe(true)
  })

  it('keeps source drift, coverage loss, and schema errors visible in the status ledger', () => {
    const { legacy, authoring } = completedAuthoring()
    authoring.source.worksheet_sha256 = 'c'.repeat(64)
    authoring.entities.pop()
    Object.assign(authoring.predictions[0].contract!, { title: 'Hidden override' })

    const status = assessLegacyShowPackAuthoringWorksheet(legacy, WORKSHEET_SHA, authoring)
    expect(status.ready).toBe(false)
    expect(status.issues).toEqual(expect.arrayContaining([
      'authoring source worksheet SHA-256 does not match',
      'entity decisions must cover the audited legacy ids exactly',
      'prediction 1 contract fields are invalid',
    ]))
    expect(status.lanes.entity_kind.open_ids).toContain('entity-sunfyre')
    expect(status.lanes.entity_dossier.open_ids).toContain('entity-sunfyre')
    expect(status.lanes.prediction_contract.open_ids).toEqual(['1'])
  })

  it('reports a changed reviewed collection as stale and open', () => {
    const { legacy, authoring } = completedAuthoring()
    authoring.claims[0].text = 'A changed claim after review.'

    const status = assessLegacyShowPackAuthoringWorksheet(legacy, WORKSHEET_SHA, authoring)

    expect(status.ready).toBe(false)
    expect(status.lanes.global_review.open_ids).toEqual([
      'claims', 'commentary_voices', 'commentary_requests',
    ])
    expect(status.issues).toEqual([
      'claims review seal is stale',
      'commentary_voices review seal is stale',
      'commentary_requests review seal is stale',
    ])
  })

  it('prepares every audited row without manufacturing human approvals', () => {
    const legacy = legacyFixture()
    const authoring = buildLegacyShowPackAuthoringWorksheet(legacy, WORKSHEET_SHA)

    expect(authoring.source).toEqual({
      pack_id: 'legacy-registry-id',
      pack_key: 'legacy-finale',
      worksheet_sha256: WORKSHEET_SHA,
    })
    expect(authoring.pack_draft).toMatchObject({
      id: null,
      version: null,
      title: null,
      canon_cutoff: null,
    })
    expect(authoring.global_review).toEqual({
      sources: null,
      claims: null,
      commentary_voices: null,
      commentary_requests: null,
    })
    expect(authoring.entities).toHaveLength(2)
    expect(authoring.entities.find((row) => row.legacy_entity_id === 'entity-sunfyre'))
      .toMatchObject({ id: 'sunfyre', kind: null, dossier: null })
    expect(authoring.predictions[0]).toMatchObject({
      legacy_prediction_id: 1,
      legacy_record: {
        title: 'Last Character On Screen',
        candidate_legacy_nominee_ids: ['nominee-aegon', 'nominee-sunfyre'],
      },
      id: 'prediction-1',
      contract: null,
      candidate_legacy_nominee_ids: null,
    })
    expect(authoring.signature_beats[0]).toMatchObject({
      legacy_signature_beat_id: 10,
      legacy_record: {
        title: 'The King Flies',
        trigger_text: 'Aegon and Sunfyre take flight.',
        legacy_entity_ids: ['entity-aegon', 'entity-sunfyre'],
      },
      id: 'signature-beat-10',
      probability_pct: null,
      likelihood_tier: null,
      contract: null,
    })
    expect(authoring.bingo_squares[0]).toMatchObject({
      legacy_bingo_square_id: 20,
      legacy_record: {
        title: 'Dragon Flight',
        condition: 'A dragon must visibly take flight.',
      },
      id: 'bingo-20',
      contract: null,
    })
  })

  it('applies explicit migration decisions without weakening the default worksheet', () => {
    const legacy = legacyFixture()
    const authoring = buildLegacyShowPackAuthoringWorksheet(legacy, WORKSHEET_SHA, {
      target: {
        id: 'hotd-finale-v3',
        version: 1,
        title: 'House of the Dragon Finale',
        canon_cutoff: 'End of the preceding episode',
      },
      legacyFilmKind: 'creature',
      candidatePolicy: 'audited-category-links',
    })

    expect(authoring.pack_draft).toMatchObject({
      id: 'hotd-finale-v3',
      version: 1,
      title: 'House of the Dragon Finale',
      canon_cutoff: 'End of the preceding episode',
    })
    expect(authoring.entities.find((row) => row.legacy_entity_id === 'entity-sunfyre')?.kind)
      .toBe('creature')
    expect(authoring.predictions[0].candidate_legacy_nominee_ids)
      .toEqual(['nominee-aegon', 'nominee-sunfyre'])

    const status = assessLegacyShowPackAuthoringWorksheet(legacy, WORKSHEET_SHA, authoring)
    expect(status.lanes.target_identity).toMatchObject({ filled: 1, open_ids: [] })
    expect(status.lanes.canon_cutoff).toMatchObject({ filled: 1, open_ids: [] })
    expect(status.lanes.entity_kind).toMatchObject({ filled: 2, open_ids: [] })
    expect(status.lanes.prediction_candidates).toMatchObject({ filled: 1, open_ids: [] })
    expect(status.ready).toBe(false)
  })

  it('turns complete explicit decisions into a valid schema-v3 authoring pack', () => {
    const { legacy, authoring } = completedAuthoring()
    const pack = finalizeLegacyShowPackAuthoringWorksheet(legacy, WORKSHEET_SHA, authoring)

    expect(pack.pack).toMatchObject({ id: 'legacy-finale-v3', canon_cutoff: 'End of the preceding episode' })
    expect(pack.entities.map((row) => row.id)).toEqual(['aegon', 'sunfyre'])
    expect(pack.predictions[0].candidate_entity_ids).toEqual(['aegon', 'sunfyre'])
    expect(pack.signature_beats[0].entity_ids).toEqual(['aegon', 'sunfyre'])
    expect(pack.bingo_squares[0]).toMatchObject({
      id: 'bingo-20',
      probability_pct: 60,
      likelihood_tier: 'likely',
    })
  })

  it('projects a schema-v3 working pack before global review without granting approval', () => {
    const { legacy, authoring } = completedAuthoring()
    for (const collection of LEGACY_GLOBAL_REVIEW_COLLECTIONS) {
      authoring.global_review[collection] = null
    }

    const pack = projectLegacyShowPackAuthoringWorksheet(legacy, WORKSHEET_SHA, authoring)

    expect(pack.pack.id).toBe('legacy-finale-v3')
    expect(authoring.global_review).toEqual({
      sources: null,
      claims: null,
      commentary_voices: null,
      commentary_requests: null,
    })
    expect(() => finalizeLegacyShowPackAuthoringWorksheet(legacy, WORKSHEET_SHA, authoring))
      .toThrow('global_review sources review is not approved')

    authoring.global_review.sources = { sha256: 'a'.repeat(64), note: 'Stale review.' }
    expect(() => projectLegacyShowPackAuthoringWorksheet(legacy, WORKSHEET_SHA, authoring))
      .toThrow('global_review sources review seal is stale')
  })

  it('writes only projected commentary publications back and invalidates a stale request seal', () => {
    const { legacy, authoring } = completedAuthoring()
    authoring.commentary_voices = [{
      id: 'ned',
      name: 'Ned',
      instruction: 'Speak plainly.',
      attitude_claim_ids: [],
    }]
    authoring.commentary_requests = [{
      id: 'plain-record',
      speaker: 'ned',
      fact_claim_ids: ['both-remain-in-play'],
      angle_claim_ids: [],
      angle: 'State only the witnessed record.',
      publication: { status: 'pending' },
    }]
    for (const collection of LEGACY_GLOBAL_REVIEW_COLLECTIONS) {
      authoring.global_review[collection] = {
        sha256: legacyGlobalReviewCollectionSha256(authoring, collection),
        note: `Reviewed ${collection}.`,
      }
    }
    authoring.global_review.commentary_requests = null
    const pack = projectLegacyShowPackAuthoringWorksheet(legacy, WORKSHEET_SHA, authoring)
    pack.commentary_requests[0].publication = {
      status: 'ready',
      text: 'Both remain in play.',
      grounding: {
        pipeline: 'scripts/grounded-line.mts',
        speaker: 'ned',
        voice_block: ['Voice: Ned', 'Expression instruction: Speak plainly.'],
        fact_block: ['Aegon and Sunfyre remained in play at the prior episode cutoff.'],
        angle_block: ['State only the witnessed record.'],
        attempts: 1,
        residual_findings: [],
      },
    }

    const result = applyLegacyCommentaryPublications(authoring, pack)

    expect(result.commentary_requests[0].publication.status).toBe('ready')
    expect(result.global_review.commentary_requests).toBeNull()
    expect(result.global_review.sources).toEqual(authoring.global_review.sources)
    expect(authoring.commentary_requests[0].publication.status).toBe('pending')

    pack.commentary_requests[0].angle = 'Changed context.'
    expect(() => applyLegacyCommentaryPublications(authoring, pack))
      .toThrow('changed its authored request context')

    const changedClaims = projectLegacyShowPackAuthoringWorksheet(legacy, WORKSHEET_SHA, authoring)
    changedClaims.claims[0].text = 'A changed fact block.'
    expect(() => applyLegacyCommentaryPublications(authoring, changedClaims))
      .toThrow('changed its authored claims')
  })

  it('fails closed on incomplete decisions, source drift, and incomplete coverage', () => {
    const legacy = legacyFixture()
    const incomplete = buildLegacyShowPackAuthoringWorksheet(legacy, WORKSHEET_SHA)
    expect(() => finalizeLegacyShowPackAuthoringWorksheet(legacy, WORKSHEET_SHA, incomplete))
      .toThrow('pack_draft target id and version require human approval')

    const { authoring } = completedAuthoring()
    expect(() => finalizeLegacyShowPackAuthoringWorksheet(legacy, 'c'.repeat(64), authoring))
      .toThrow('authoring source worksheet SHA-256 does not match')

    authoring.entities.pop()
    expect(() => finalizeLegacyShowPackAuthoringWorksheet(legacy, WORKSHEET_SHA, authoring))
      .toThrow('entity decisions must cover the audited legacy ids exactly')
  })

  it('requires an explicit, known nominee set for the schema-v3 candidate owner', () => {
    const { legacy, authoring } = completedAuthoring()
    authoring.predictions[0].candidate_legacy_nominee_ids = [
      'nominee-aegon',
      'nominee-not-audited',
    ]

    expect(() => finalizeLegacyShowPackAuthoringWorksheet(legacy, WORKSHEET_SHA, authoring))
      .toThrow('prediction 1 references unknown legacy nominee nominee-not-audited')
  })

  it('rejects the already-published legacy registry identity as a target', () => {
    const { legacy, authoring } = completedAuthoring()
    authoring.pack_draft.id = legacy.source_pack.pack_key
    authoring.pack_draft.version = legacy.source_pack.version

    expect(() => finalizeLegacyShowPackAuthoringWorksheet(legacy, WORKSHEET_SHA, authoring))
      .toThrow('pack_draft target id and version must not collide with the published legacy pack')
  })

  it('treats embedded legacy context as read-only rather than a second fact owner', () => {
    const { legacy, authoring } = completedAuthoring()
    authoring.signature_beats[0].legacy_record.trigger_text = 'A hand-edited historical trigger.'

    expect(() => finalizeLegacyShowPackAuthoringWorksheet(legacy, WORKSHEET_SHA, authoring))
      .toThrow('signature beat 10 legacy_record must preserve the audited legacy record')
  })

  it('does not let a trigger contract override row identity or audited titles', () => {
    const { legacy, authoring } = completedAuthoring()
    Object.assign(authoring.predictions[0].contract!, { title: 'A hidden override' })

    expect(() => finalizeLegacyShowPackAuthoringWorksheet(legacy, WORKSHEET_SHA, authoring))
      .toThrow('prediction 1 contract fields are invalid')
  })
})
