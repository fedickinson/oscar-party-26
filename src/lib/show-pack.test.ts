import { describe, expect, it } from 'vitest'
import {
  compileShowPack,
  deriveGameModel,
  parseShowPack,
  summarizeGameContract,
  type ShowPack,
} from './show-pack'

function validPack(): ShowPack {
  return {
    schema_version: 3,
    pack: {
      id: 'house-of-the-dragon-s3e8',
      version: 1,
      title: 'House of the Dragon Season 3 Finale',
      property: 'House of the Dragon',
      installment: 'Season 3, Episode 8',
      fact_source: 'room_declared',
      canon_cutoff: 'End of Season 3, Episode 7',
      predecessor: {
        pack_id: 'house-of-the-dragon-s3e7',
        settlement_id: 'settlement-public-id',
        settlement_version: 1,
      },
    },
    sources: [
      {
        id: 'table-record',
        kind: 'operator_record',
        title: 'Settled episode record',
        locator: 'settlement:settlement-public-id:v1',
      },
      {
        id: 'reaction-sweep',
        kind: 'sentiment',
        title: 'Post-episode sentiment sweep',
        locator: 'research:reaction-sweep',
      },
      {
        id: 'book-canon',
        kind: 'source_material',
        title: 'Fire and Blood',
        locator: 'book:fire-and-blood',
      },
    ],
    claims: [
      {
        id: 'screen-aegon-alive',
        canon: 'screen',
        status: 'verified',
        text: 'Aegon and Sunfyre were alive at the end of the episode.',
        source_ids: ['table-record'],
      },
      {
        id: 'discourse-sunfyre',
        canon: 'discourse',
        status: 'verified',
        text: 'The Aegon and Sunfyre reunion drew strong approval.',
        source_ids: ['reaction-sweep'],
      },
      {
        id: 'book-attitude',
        canon: 'source_material',
        status: 'attitude_only',
        text: 'The source chronicle treats dragon bonds as politically consequential.',
        source_ids: ['book-canon'],
      },
    ],
    entities: [
      {
        id: 'aegon-ii',
        name: 'Aegon II Targaryen',
        kind: 'person',
        group: 'The Greens',
        draftable: true,
        portrait: {
          path: '/avatars/characters/aegon.jpeg',
          sha256: '2c06d011f54ff823df0bb6a78c05d5ce92b2d36436366980ae7fb745cc2173cf',
        },
        dossier: {
          fact_claim_ids: ['screen-aegon-alive'],
          discourse_claim_ids: ['discourse-sunfyre'],
        },
      },
      {
        id: 'sunfyre',
        name: 'Sunfyre',
        kind: 'creature',
        group: 'The Greens',
        draftable: true,
        portrait: {
          path: '/avatars/characters/sunfyre.jpeg',
          sha256: '14e23ab444855b53c3c4a7a8247727a27bd4d216de5135ab1237cc70195dce75',
        },
        dossier: {
          fact_claim_ids: ['screen-aegon-alive'],
          discourse_claim_ids: ['discourse-sunfyre'],
        },
      },
    ],
    predictions: [
      {
        id: 'first-on-screen',
        title: 'First On Screen',
        condition: 'The first of the listed entities to appear clearly on screen wins.',
        exclusions: ['Dialogue-only mentions do not count.'],
        adjudication: {
          proxies: 'do_not_count',
          offscreen: 'do_not_count',
          mentions: 'do_not_count',
        },
        title_review: {
          status: 'approved',
          note: 'The title and condition both promise first visible appearance.',
        },
        basis_claim_ids: ['screen-aegon-alive'],
        points: 4,
        tier: 3,
        candidate_entity_ids: ['aegon-ii', 'sunfyre'],
      },
    ],
    signature_beats: [
      {
        id: 'sunfyre-protects-aegon',
        entity_ids: ['sunfyre'],
        title: 'Protects Aegon',
        condition: 'Sunfyre visibly intervenes against an immediate threat to Aegon.',
        exclusions: ['Routine mounting or travel does not count.'],
        adjudication: {
          proxies: 'do_not_count',
          offscreen: 'do_not_count',
          mentions: 'do_not_count',
        },
        title_review: {
          status: 'approved',
          note: 'The title promises the same protective intervention as the condition.',
        },
        probability_pct: 35,
        likelihood_tier: 'long_shot',
        points: 25,
        pitch: 'The bond becomes an action.',
        basis_claim_ids: ['screen-aegon-alive'],
      },
    ],
    bingo_squares: [
      {
        id: 'dragon-protects-rider',
        title: 'Dragon Rescue',
        condition: 'A dragon visibly prevents an immediate threat from reaching its rider.',
        exclusions: ['A rider escaping without the dragon intervening does not count.'],
        adjudication: {
          proxies: 'do_not_count',
          offscreen: 'do_not_count',
          mentions: 'do_not_count',
        },
        title_review: {
          status: 'approved',
          note: 'The title and condition both promise an on-screen rescue.',
        },
        probability_pct: 25,
        likelihood_tier: 'long_shot',
        why_it_is_fun: 'An unmistakable relationship payoff.',
        storyline_tags: ['dragons', 'rescue'],
        basis_claim_ids: ['screen-aegon-alive'],
      },
    ],
    commentary_voices: [
      {
        id: 'daenerys',
        name: 'Daenerys',
        instruction: 'Speak with sincere conviction and no ironic distance.',
        attitude_claim_ids: ['book-attitude'],
      },
    ],
    commentary_requests: [
      {
        id: 'sunfyre-line',
        speaker: 'daenerys',
        fact_claim_ids: ['screen-aegon-alive'],
        angle_claim_ids: ['discourse-sunfyre'],
        angle: 'Treat the dragon bond sincerely.',
        publication: {
          status: 'ready',
          text: 'A dragon remembers who loved him.',
          grounding: {
            pipeline: 'scripts/grounded-line.mts',
            speaker: 'daenerys',
            voice_block: [
              'Voice: Daenerys',
              'Expression instruction: Speak with sincere conviction and no ironic distance.',
              'Source-material attitude: The source chronicle treats dragon bonds as politically consequential.',
            ],
            fact_block: [
              'Aegon and Sunfyre were alive at the end of the episode.',
            ],
            angle_block: [
              'Treat the dragon bond sincerely.',
              'Audience discourse: The Aegon and Sunfyre reunion drew strong approval.',
            ],
            attempts: 1,
            residual_findings: [],
          },
        },
      },
    ],
  }
}

describe('parseShowPack', () => {
  it('upgrades a legacy pack to an explicit contract without changing its behavior', () => {
    const compiled = compileShowPack(validPack())

    expect(compiled.schema_version).toBe(4)
    expect(compiled.game_contract).toEqual({
      version: 1,
      commitment: 'open_conviction',
      conviction_budget: 12,
      identity: { selection: 'exclusive_entity_draft', scoring: 'none' },
      scarcity: { commitments: 'fixed_budget', identity: 'exclusive' },
      visibility: 'open_counts',
      cadence: 'immediate_facts_and_event_close',
      continuity: 'canon_write_back',
    })
    expect(deriveGameModel(compiled.game_contract!)).toBe('conviction_portfolio')
    expect(compiled.predictions[0].truth_authority).toBe('operator_declaration')
    expect(compiled.signature_beats[0].truth_authority).toBe('operator_declaration')
    expect(compiled.bingo_squares[0].truth_authority).toBe('operator_declaration')
  })

  it('preserves scheduled legacy packs as Results Night contracts', () => {
    const pack = validPack()
    pack.pack.fact_source = 'scheduled'
    const compiled = compileShowPack(pack)

    expect(deriveGameModel(compiled.game_contract!)).toBe('legacy_ensemble')
    expect(compiled.game_contract).toEqual({
      version: 1,
      commitment: 'confidence_allocation',
      conviction_budget: null,
      identity: { selection: 'exclusive_entity_draft', scoring: 'ensemble' },
      scarcity: { commitments: 'ranked_allocation', identity: 'exclusive' },
      visibility: 'sealed_until_lock',
      cadence: 'immediate_per_outcome',
      continuity: 'no_carryover',
    })
    expect(compiled.predictions[0].truth_authority).toBe('official_result')
    expect(compiled.signature_beats[0].truth_authority).toBe('official_result')
    expect(compiled.bingo_squares[0].truth_authority).toBe('official_result')
  })

  it('requires a complete contract and truth authority on newly authored packs', () => {
    const pack = structuredClone(validPack()) as unknown as Record<string, any>
    pack.schema_version = 4
    pack.game_contract = {
      version: 1,
      commitment: 'open_conviction',
      conviction_budget: 12,
      identity: { selection: 'exclusive_entity_draft', scoring: 'none' },
      scarcity: { commitments: 'fixed_budget', identity: 'exclusive' },
      visibility: 'open_counts',
      cadence: 'immediate_facts_and_event_close',
      continuity: 'canon_write_back',
    }
    for (const wager of [...pack.predictions, ...pack.signature_beats, ...pack.bingo_squares]) {
      wager.truth_authority = 'operator_declaration'
    }
    expect(parseShowPack(JSON.stringify(pack)).game_contract).toEqual(pack.game_contract)

    const missingDimension = structuredClone(pack)
    delete missingDimension.game_contract.visibility
    expect(() => parseShowPack(JSON.stringify(missingDimension)))
      .toThrow('show pack game_contract visibility is invalid')

    const missingAuthority = structuredClone(pack)
    delete missingAuthority.signature_beats[0].truth_authority
    expect(() => parseShowPack(JSON.stringify(missingAuthority)))
      .toThrow('signature beat sunfyre-protects-aegon truth_authority is required by schema 4')
  })

  it('lets a new pack select play independently from its compatibility fact source', () => {
    const pack = structuredClone(validPack()) as unknown as Record<string, any>
    pack.schema_version = 4
    pack.pack.fact_source = 'scheduled'
    pack.game_contract = {
      version: 1,
      commitment: 'open_conviction',
      conviction_budget: 12,
      identity: { selection: 'exclusive_entity_draft', scoring: 'none' },
      scarcity: { commitments: 'fixed_budget', identity: 'exclusive' },
      visibility: 'open_counts',
      cadence: 'immediate_facts_and_event_close',
      continuity: 'canon_write_back',
    }
    for (const [index, wager] of [...pack.predictions, ...pack.signature_beats, ...pack.bingo_squares].entries()) {
      wager.truth_authority = index === 0 ? 'official_result' : 'operator_declaration'
    }

    const parsed = parseShowPack(JSON.stringify(pack))
    expect(deriveGameModel(parsed.game_contract!)).toBe('conviction_portfolio')
    expect(new Set([
      ...parsed.predictions,
      ...parsed.signature_beats,
      ...parsed.bingo_squares,
    ].map((wager) => wager.truth_authority))).toEqual(new Set([
      'official_result',
      'operator_declaration',
    ]))
    expect(summarizeGameContract(parsed.game_contract!)).toBe(
      'Open convictions (12) | Exclusive entity draft, identity only | Open belief counts | Immediate facts plus event close | Canon write-back',
    )
  })

  it('requires a SHA-sealed deploy-owned raster portrait for every entity', () => {
    const migrated = structuredClone(validPack()) as unknown as Record<string, any>
    migrated.schema_version = 3
    for (const entity of migrated.entities) {
      entity.portrait = {
        path: `/show-packs/proof/${entity.id}.webp`,
        sha256: 'a'.repeat(64),
      }
    }
    expect(parseShowPack(JSON.stringify(migrated)).entities[0].portrait.path)
      .toBe('/show-packs/proof/aegon-ii.webp')

    const missing = structuredClone(migrated)
    delete missing.entities[0].portrait
    expect(() => parseShowPack(JSON.stringify(missing)))
      .toThrow('entity aegon-ii portrait is required')

    const external = structuredClone(migrated)
    external.entities[0].portrait.path = 'https://example.com/aegon.webp'
    expect(() => parseShowPack(JSON.stringify(external)))
      .toThrow('entity aegon-ii portrait path must be a deploy-owned raster asset')

    const unsealed = structuredClone(migrated)
    unsealed.entities[0].portrait.sha256 = 'not-a-digest'
    expect(() => parseShowPack(JSON.stringify(unsealed)))
      .toThrow('entity aegon-ii portrait sha256 must be a lowercase SHA-256 digest')
  })

  it('accepts a pack-owned commentary voice with attitude-only provenance', () => {
    const pack = validPack() as unknown as Record<string, unknown>
    pack.commentary_voices = [{
      id: 'daenerys',
      name: 'Daenerys',
      instruction: 'Speak with sincere conviction and no ironic distance.',
      attitude_claim_ids: ['book-attitude'],
    }]
    const requests = pack.commentary_requests as Array<Record<string, unknown>>
    requests[0].publication = { status: 'pending' }

    const parsed = parseShowPack(JSON.stringify(pack)) as ShowPack & {
      commentary_voices: Array<{ id: string }>
    }
    expect(parsed.commentary_voices.map((voice) => voice.id)).toEqual(['daenerys'])
  })

  it('accepts the complete authoring contract', () => {
    expect(parseShowPack(JSON.stringify(validPack())).pack.id)
      .toBe('house-of-the-dragon-s3e8')
  })

  it('rejects unknown voices and screen facts in the voice attitude lane', () => {
    const unknown = validPack()
    unknown.commentary_requests[0].speaker = 'unknown-voice'
    expect(() => parseShowPack(JSON.stringify(unknown)))
      .toThrow('commentary sunfyre-line references unknown commentary voice unknown-voice')

    const contaminated = validPack()
    contaminated.commentary_voices[0].attitude_claim_ids = ['screen-aegon-alive']
    expect(() => parseShowPack(JSON.stringify(contaminated)))
      .toThrow('commentary voice daenerys attitude screen-aegon-alive must be source-material attitude only')

    const malformed = validPack() as unknown as {
      commentary_voices: Array<Record<string, unknown>>
    }
    malformed.commentary_voices[0].attitude_claim_ids = 'book-attitude'
    expect(() => parseShowPack(JSON.stringify(malformed)))
      .toThrow('commentary voice daenerys attitude_claim_ids must be an array')
  })

  it('rejects a ready line whose voice or angle changed after generation', () => {
    const changedVoice = validPack()
    changedVoice.commentary_voices[0].instruction = 'Use a different voice now.'
    expect(() => compileShowPack(changedVoice))
      .toThrow('commentary sunfyre-line grounding voice_block does not match its commentary voice')

    const changedAngle = validPack()
    changedAngle.commentary_requests[0].angle = 'Take the opposite attitude.'
    expect(() => compileShowPack(changedAngle))
      .toThrow('commentary sunfyre-line grounding angle_block does not match its request')
  })

  it('rejects trigger doctrine that leaves proxy behavior implicit', () => {
    const pack = validPack()
    pack.signature_beats[0].adjudication.proxies = 'unspecified'

    expect(() => parseShowPack(JSON.stringify(pack)))
      .toThrow('signature beat sunfyre-protects-aegon proxies must be explicit')
  })

  it('rejects source-material canon promoted to a screen fact', () => {
    const pack = validPack()
    pack.claims[2].canon = 'screen'
    pack.claims[2].status = 'verified'

    expect(() => parseShowPack(JSON.stringify(pack)))
      .toThrow('screen claim book-attitude has no screen warrant')
  })

  it('permits only verified screen or discourse claims to warrant wagers', () => {
    const sourceMaterial = validPack()
    sourceMaterial.predictions[0].basis_claim_ids = ['book-attitude']
    expect(() => parseShowPack(JSON.stringify(sourceMaterial)))
      .toThrow('prediction first-on-screen basis claim book-attitude must be verified screen or discourse')

    const recap = validPack()
    recap.sources.push({
      id: 'recap-source',
      kind: 'recap',
      title: 'Unverified recap pass',
      locator: 'research:recap-pass',
    })
    recap.claims.push({
      id: 'recap-only',
      canon: 'screen',
      status: 'recap',
      text: 'A recap reports an event that has not been checked against the screen.',
      source_ids: ['recap-source'],
    })
    recap.signature_beats[0].basis_claim_ids = ['recap-only']
    expect(() => parseShowPack(JSON.stringify(recap)))
      .toThrow('signature beat sunfyre-protects-aegon basis claim recap-only must be verified screen or discourse')

    const unverifiable = validPack()
    unverifiable.claims[1].status = 'unverifiable'
    unverifiable.bingo_squares[0].basis_claim_ids = ['discourse-sunfyre']
    expect(() => parseShowPack(JSON.stringify(unverifiable)))
      .toThrow('bingo square dragon-protects-rider basis claim discourse-sunfyre must be verified screen, discourse, or authoring provenance')

    const verifiedDiscourse = validPack()
    verifiedDiscourse.predictions[0].basis_claim_ids = ['discourse-sunfyre']
    expect(parseShowPack(JSON.stringify(verifiedDiscourse)).predictions[0].basis_claim_ids)
      .toEqual(['discourse-sunfyre'])
  })

  it('permits authored game-rule provenance only for bingo wagers', () => {
    const pack = validPack()
    pack.sources.push({
      id: 'bingo-authoring-record',
      kind: 'authoring_record',
      title: 'Reviewed bingo master pool',
      locator: 'repo:src/data/bingo-master-pool.json:sha256:abc',
    })
    pack.claims.push({
      id: 'bingo-game-texture',
      canon: 'authoring',
      status: 'verified',
      text: 'This square is intentionally authored as judgeable game texture, not as a sourced forecast.',
      source_ids: ['bingo-authoring-record'],
    })
    pack.bingo_squares[0].basis_claim_ids = ['bingo-game-texture']

    expect(parseShowPack(JSON.stringify(pack)).bingo_squares[0].basis_claim_ids)
      .toEqual(['bingo-game-texture'])

    const prediction = structuredClone(pack)
    prediction.predictions[0].basis_claim_ids = ['bingo-game-texture']
    expect(() => parseShowPack(JSON.stringify(prediction)))
      .toThrow('prediction first-on-screen basis claim bingo-game-texture must be verified screen or discourse')

    const signature = structuredClone(pack)
    signature.signature_beats[0].basis_claim_ids = ['bingo-game-texture']
    expect(() => parseShowPack(JSON.stringify(signature)))
      .toThrow('signature beat sunfyre-protects-aegon basis claim bingo-game-texture must be verified screen or discourse')
  })

  it('requires authoring claims to cite only a reviewed authoring record', () => {
    const wrongStatus = validPack()
    wrongStatus.sources.push({
      id: 'bingo-authoring-record',
      kind: 'authoring_record',
      title: 'Reviewed bingo master pool',
      locator: 'repo:src/data/bingo-master-pool.json:sha256:abc',
    })
    wrongStatus.claims.push({
      id: 'bingo-game-texture',
      canon: 'authoring',
      status: 'unverifiable',
      text: 'The square is deliberately included as game texture.',
      source_ids: ['bingo-authoring-record'],
    })
    expect(() => parseShowPack(JSON.stringify(wrongStatus)))
      .toThrow('authoring claim bingo-game-texture must be verified')

    const mixedSources = validPack()
    mixedSources.sources.push({
      id: 'bingo-authoring-record',
      kind: 'authoring_record',
      title: 'Reviewed bingo master pool',
      locator: 'repo:src/data/bingo-master-pool.json:sha256:abc',
    })
    mixedSources.claims.push({
      id: 'bingo-game-texture',
      canon: 'authoring',
      status: 'verified',
      text: 'The square is deliberately included as game texture.',
      source_ids: ['bingo-authoring-record', 'table-record'],
    })
    expect(() => parseShowPack(JSON.stringify(mixedSources)))
      .toThrow('authoring claim bingo-game-texture cannot use operator_record source table-record')
  })

  it('rejects unresolved grounded prose from the publishable bundle', () => {
    const pack = validPack()
    const grounding = structuredClone(pack.commentary_requests[0].publication.grounding!)
    grounding.attempts = 3
    grounding.residual_findings = ['The line implies an unlisted death.']
    pack.commentary_requests[0].publication = {
      status: 'blocked',
      text: 'A line with an unsupported implication.',
      grounding,
    }

    expect(() => compileShowPack(pack))
      .toThrow('commentary sunfyre-line is blocked by residual grounding findings')
  })

  it('rejects references to absent entities and claims', () => {
    const pack = validPack()
    pack.predictions[0].candidate_entity_ids.push('missing-entity')
    pack.bingo_squares[0].basis_claim_ids.push('missing-claim')

    expect(() => compileShowPack(pack))
      .toThrow('prediction first-on-screen references unknown entity missing-entity')
  })

  it('rejects an empty no-op pack and duplicate candidate references', () => {
    const empty = validPack()
    empty.sources = []
    empty.claims = []
    empty.entities = []
    empty.predictions = []
    empty.signature_beats = []
    empty.bingo_squares = []

    expect(() => compileShowPack(empty))
      .toThrow('show pack sources must not be empty')

    const duplicated = validPack()
    duplicated.predictions[0].candidate_entity_ids = ['aegon-ii', 'aegon-ii']

    expect(() => compileShowPack(duplicated))
      .toThrow('prediction first-on-screen has duplicate candidate_entity_ids aegon-ii')
  })

  it('applies trigger doctrine to prediction wagers', () => {
    const pack = validPack()
    Object.assign(pack.predictions[0], {
      condition: 'The first of the listed entities to appear clearly on screen wins.',
      exclusions: ['Dialogue-only mentions do not count.'],
      adjudication: {
        proxies: 'unspecified',
        offscreen: 'do_not_count',
        mentions: 'do_not_count',
      },
      title_review: {
        status: 'approved',
        note: 'The title and condition both promise first visible appearance.',
      },
      basis_claim_ids: ['screen-aegon-alive'],
    })

    expect(() => compileShowPack(pack))
      .toThrow('prediction first-on-screen proxies must be explicit')

    const unreviewed = validPack()
    unreviewed.predictions[0].title_review.status = 'needs_revision'
    unreviewed.predictions[0].exclusions = []

    expect(() => compileShowPack(unreviewed))
      .toThrow('prediction first-on-screen exclusions must not be empty')
    expect(() => compileShowPack(unreviewed))
      .toThrow('prediction first-on-screen title must be approved as honest')

    const wrongTier = validPack()
    wrongTier.bingo_squares[0].likelihood_tier = 'likely'

    expect(() => compileShowPack(wrongTier))
      .toThrow('bingo square dragon-protects-rider likelihood_tier must be long_shot at 25%')
  })

  it('keeps source-material warrants out of screen claims', () => {
    const pack = validPack()
    pack.claims[0].source_ids.push('book-canon')

    expect(() => compileShowPack(pack))
      .toThrow('screen claim screen-aegon-alive cannot use source_material source book-canon')

    const missingSourceCanon = validPack()
    missingSourceCanon.claims[2].source_ids = []

    expect(() => compileShowPack(missingSourceCanon))
      .toThrow('source-material claim book-attitude has no source-material source')
  })

  it('requires grounded-line provenance and keeps screen facts out of the angle lane', () => {
    const unstamped = validPack()
    delete unstamped.commentary_requests[0].publication.grounding

    expect(() => compileShowPack(unstamped))
      .toThrow('commentary sunfyre-line ready publication needs a grounded-line record')

    const contaminatedAngle = validPack()
    contaminatedAngle.commentary_requests[0].angle_claim_ids.push('screen-aegon-alive')

    expect(() => compileShowPack(contaminatedAngle))
      .toThrow('commentary sunfyre-line angle screen-aegon-alive must be verified discourse')

    const duplicatedVoiceAttitude = validPack()
    duplicatedVoiceAttitude.commentary_requests[0].angle_claim_ids.push('book-attitude')
    expect(() => compileShowPack(duplicatedVoiceAttitude))
      .toThrow('commentary sunfyre-line angle book-attitude must be verified discourse')

    const wrongFacts = validPack()
    wrongFacts.commentary_requests[0].publication.grounding!.fact_block = [
      'A different fact block.',
    ]

    expect(() => compileShowPack(wrongFacts))
      .toThrow('commentary sunfyre-line grounding fact_block does not match its verified claims')
  })

  it('rejects unknown private fields instead of publishing them', () => {
    const topLevel = validPack() as ShowPack & { private_research_note: string }
    topLevel.private_research_note = 'Do not publish this note.'

    expect(() => compileShowPack(topLevel))
      .toThrow('show pack has unknown field private_research_note')

    const nested = validPack()
    Object.assign(nested.sources[0], {
      raw_excerpt: 'A private research excerpt that is not part of the public contract.',
    })

    expect(() => compileShowPack(nested))
      .toThrow('source table-record has unknown field raw_excerpt')

    const privateVoice = validPack()
    Object.assign(privateVoice.commentary_voices[0], {
      private_notes: 'Unpublished characterization research.',
    })
    expect(() => compileShowPack(privateVoice))
      .toThrow('commentary voice daenerys has unknown field private_notes')
  })

  it('rejects duplicate commentary references that would overweight a claim', () => {
    const facts = validPack()
    facts.commentary_requests[0].fact_claim_ids.push('screen-aegon-alive')

    expect(() => compileShowPack(facts))
      .toThrow('commentary sunfyre-line has duplicate fact_claim_ids screen-aegon-alive')

    const angles = validPack()
    angles.commentary_requests[0].angle_claim_ids.push('discourse-sunfyre')

    expect(() => compileShowPack(angles))
      .toThrow('commentary sunfyre-line has duplicate angle_claim_ids discourse-sunfyre')
  })
})

describe('compileShowPack', () => {
  it('normalizes order into deterministic output without mutating the input', () => {
    const pack = validPack()
    pack.entities.reverse()
    pack.claims.reverse()
    pack.sources.reverse()
    pack.commentary_voices.push({
      id: 'cersei',
      name: 'Cersei',
      instruction: 'Treat every concession as a political weakness.',
      attitude_claim_ids: [],
    })
    pack.commentary_voices.reverse()
    const beforeCompile = structuredClone(pack)

    const compiled = compileShowPack(pack)
    const repeated = compileShowPack(structuredClone(pack))

    expect(compiled).toEqual(repeated)
    expect(compiled.sources.map((source) => source.id))
      .toEqual(['book-canon', 'reaction-sweep', 'table-record'])
    expect(compiled.entities.map((entity) => entity.id))
      .toEqual(['aegon-ii', 'sunfyre'])
    expect(compiled.commentary_voices.map((voice) => voice.id))
      .toEqual(['cersei', 'daenerys'])
    expect(pack).toEqual(beforeCompile)
  })
})
