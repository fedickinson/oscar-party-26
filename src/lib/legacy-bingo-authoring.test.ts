import { describe, expect, it } from 'vitest'
import type { LegacyShowPackMigrationWorksheet } from './legacy-show-pack-audit'
import type { LegacyShowPackAuthoringWorksheet } from './legacy-show-pack-authoring'
import {
  applyLegacyBingoContractDecisions,
  type LegacyBingoContractDecisionManifest,
} from './legacy-bingo-authoring'

const MASTER_SHA = 'a'.repeat(64)
const LEGACY_SHA = 'b'.repeat(64)

const supported = {
  id: 1,
  slug: 'supported-square',
  title: 'Supported Square',
  win_condition: 'The supported event must happen. A mere mention does not count.',
  probability_pct: 60,
  likelihood_tier: 'likely',
  why_it_is_fun: 'It pays off established screen state.',
  storyline_tags: ['story'],
}

const unsupported = {
  id: 2,
  slug: 'unsupported-square',
  title: 'Unsupported Square',
  win_condition: 'The unsupported event must happen. A mere mention does not count.',
  probability_pct: 20,
  likelihood_tier: 'long_shot',
  why_it_is_fun: 'It is pure game texture.',
  storyline_tags: ['chaos'],
}

function legacyWorksheet(): LegacyShowPackMigrationWorksheet {
  return {
    catalog: { bingo_squares: [supported, unsupported] },
  } as unknown as LegacyShowPackMigrationWorksheet
}

function authoringWorksheet(): LegacyShowPackAuthoringWorksheet {
  const row = (square: typeof supported) => ({
    legacy_bingo_square_id: square.id,
    legacy_record: {
      title: square.title,
      condition: square.win_condition,
      probability_pct: square.probability_pct,
      likelihood_tier: square.likelihood_tier,
      why_it_is_fun: square.why_it_is_fun,
      storyline_tags: square.storyline_tags,
    },
    id: `bingo-${square.id}`,
    contract: null,
  })
  return {
    source: { worksheet_sha256: LEGACY_SHA },
    pack_draft: { id: 'target-pack', version: 1 },
    sources: [],
    claims: [],
    bingo_squares: [row(supported), row(unsupported)],
  } as unknown as LegacyShowPackAuthoringWorksheet
}

function masterPool() {
  const square = (legacy: typeof supported, sourceBasis: string[]) => ({
    id: legacy.slug,
    title: legacy.title,
    estimated_probability_pct: legacy.probability_pct,
    likelihood_tier: legacy.likelihood_tier,
    win_condition: legacy.win_condition,
    why_it_is_fun: legacy.why_it_is_fun,
    storyline_tags: legacy.storyline_tags,
    source_basis: sourceBasis,
  })
  return {
    sources: {
      episode_recap: {
        title: 'Episode recap',
        publisher: 'Publisher',
        url: 'https://example.com/recap',
        supports: 'The supported setup.',
      },
    },
    squares: [square(supported, ['episode_recap']), square(unsupported, [])],
  }
}

function manifest(): LegacyBingoContractDecisionManifest {
  return {
    manifest_version: 2,
    artifact: 'legacy-bingo-contract-decisions',
    target: { pack_id: 'target-pack', pack_version: 1 },
    legacy_worksheet_sha256: LEGACY_SHA,
    master_pool_sha256: MASTER_SHA,
    approved_square_ids: ['supported-square'],
    approved_gameplay_square_ids: ['unsupported-square'],
    sources: [{
      id: 'screen-record',
      kind: 'operator_record',
      title: 'Witnessed screen record',
      locator: 'repo:screen-record',
    }, {
      id: 'episode-recap',
      kind: 'recap',
      title: 'Episode recap',
      locator: 'https://example.com/recap',
    }],
    claims: [{
      id: 'episode-setup',
      canon: 'screen',
      status: 'verified',
      text: 'The supported setup was established on screen.',
      source_ids: ['screen-record', 'episode-recap'],
    }, {
      id: 'unsupported-square-authored-game-rule',
      canon: 'authoring',
      status: 'verified',
      text: 'The "Unsupported Square" bingo square is intentionally authored as judgeable game texture under its complete win condition; its inclusion and probability are not a sourced forecast or a claim that prior screen canon predicts it.',
      source_ids: ['bingo-master-pool-authoring-record'],
    }],
    authoring_source: {
      id: 'bingo-master-pool-authoring-record',
      kind: 'authoring_record',
      title: 'Reviewed bingo master pool',
      locator: `repo:src/data/bingo-master-pool.json:sha256:${MASTER_SHA}`,
    },
    authoring_claim_id_by_square_id: {
      'unsupported-square': 'unsupported-square-authored-game-rule',
    },
    source_id_by_source_key: { episode_recap: 'episode-recap' },
    basis_claim_by_source_key: { episode_recap: 'episode-setup' },
    adjudication: {
      proxies: 'do_not_count',
      offscreen: 'do_not_count',
      mentions: 'do_not_count',
    },
    adjudication_by_square_id: {
      'supported-square': {
        proxies: 'do_not_count',
        offscreen: 'explicit_only',
        mentions: 'explicit_only',
      },
    },
    title_review_note: 'Each approved title was checked against its complete strict condition.',
    gameplay_title_review_note: 'Each gameplay title was checked against its complete strict condition.',
  }
}

describe('legacy bingo contract authoring', () => {
  it('applies evidence-backed and explicitly approved authored-gameplay contracts', () => {
    const result = applyLegacyBingoContractDecisions({
      legacy: legacyWorksheet(),
      legacyWorksheetSha256: LEGACY_SHA,
      authoring: authoringWorksheet(),
      masterPool: masterPool(),
      masterPoolSha256: MASTER_SHA,
      manifest: manifest(),
    })

    expect(result.applied_square_ids).toEqual(['supported-square', 'unsupported-square'])
    expect(result.worksheet.sources).toHaveLength(3)
    expect(result.worksheet.claims).toHaveLength(2)
    expect(result.worksheet.bingo_squares[0].contract).toEqual({
      condition: supported.win_condition,
      exclusions: ['A mere mention does not count.'],
      adjudication: manifest().adjudication_by_square_id?.['supported-square'],
      title_review: {
        status: 'approved',
        note: manifest().title_review_note,
      },
      basis_claim_ids: ['episode-setup'],
    })
    expect(result.worksheet.bingo_squares[1].contract?.basis_claim_ids)
      .toEqual(['unsupported-square-authored-game-rule'])
    expect(result.worksheet.bingo_squares[1].contract?.title_review.note)
      .toBe(manifest().gameplay_title_review_note)
    expect(authoringWorksheet().bingo_squares[0].contract).toBeNull()
  })

  it('fails closed on source drift and approval that does not match evidence coverage', () => {
    expect(() => applyLegacyBingoContractDecisions({
      legacy: legacyWorksheet(),
      legacyWorksheetSha256: LEGACY_SHA,
      authoring: authoringWorksheet(),
      masterPool: masterPool(),
      masterPoolSha256: 'c'.repeat(64),
      manifest: manifest(),
    })).toThrow('master pool SHA-256 does not match')

    const decisions = manifest()
    decisions.approved_square_ids.push('unsupported-square')
    expect(() => applyLegacyBingoContractDecisions({
      legacy: legacyWorksheet(),
      legacyWorksheetSha256: LEGACY_SHA,
      authoring: authoringWorksheet(),
      masterPool: masterPool(),
      masterPoolSha256: MASTER_SHA,
      manifest: decisions,
    })).toThrow('approved square ids must exactly match evidence-backed master-pool squares')

    const gameplayDecisions = manifest()
    gameplayDecisions.approved_gameplay_square_ids = []
    expect(() => applyLegacyBingoContractDecisions({
      legacy: legacyWorksheet(),
      legacyWorksheetSha256: LEGACY_SHA,
      authoring: authoringWorksheet(),
      masterPool: masterPool(),
      masterPoolSha256: MASTER_SHA,
      manifest: gameplayDecisions,
    })).toThrow('approved gameplay square ids must exactly match source-free master-pool squares')
  })

  it('rejects drift in the audit bytes actually supplied to the applicator', () => {
    expect(() => applyLegacyBingoContractDecisions({
      legacy: legacyWorksheet(),
      legacyWorksheetSha256: 'c'.repeat(64),
      authoring: authoringWorksheet(),
      masterPool: masterPool(),
      masterPoolSha256: MASTER_SHA,
      manifest: manifest(),
    })).toThrow('legacy worksheet SHA-256 does not match the bingo decision manifest')
  })

  it('rejects authored-gameplay approval without exact hash-bound provenance', () => {
    const decisions = manifest()
    decisions.authoring_source.locator = 'repo:src/data/bingo-master-pool.json:sha256:wrong'
    expect(() => applyLegacyBingoContractDecisions({
      legacy: legacyWorksheet(),
      legacyWorksheetSha256: LEGACY_SHA,
      authoring: authoringWorksheet(),
      masterPool: masterPool(),
      masterPoolSha256: MASTER_SHA,
      manifest: decisions,
    })).toThrow('authoring source must seal the exact bingo master-pool bytes')

    const wrongClaim = manifest()
    wrongClaim.claims[1].text = 'This is too vague to identify the reviewed rule boundary.'
    expect(() => applyLegacyBingoContractDecisions({
      legacy: legacyWorksheet(),
      legacyWorksheetSha256: LEGACY_SHA,
      authoring: authoringWorksheet(),
      masterPool: masterPool(),
      masterPoolSha256: MASTER_SHA,
      manifest: wrongClaim,
    })).toThrow('must state the reviewed game-rule provenance exactly')
  })

  it('rejects master-pool drift and conflicting prior authoring without overwriting either', () => {
    const changedPool = masterPool()
    changedPool.squares[0].win_condition = 'Changed condition.'
    expect(() => applyLegacyBingoContractDecisions({
      legacy: legacyWorksheet(),
      legacyWorksheetSha256: LEGACY_SHA,
      authoring: authoringWorksheet(),
      masterPool: changedPool,
      masterPoolSha256: MASTER_SHA,
      manifest: manifest(),
    })).toThrow('master square supported-square must match the audited legacy bingo record')

    const authoring = authoringWorksheet()
    authoring.bingo_squares[0].contract = {
      condition: 'Conflicting decision.',
      exclusions: ['Anything else does not count.'],
      adjudication: manifest().adjudication,
      title_review: { status: 'approved', note: 'Prior review.' },
      basis_claim_ids: ['episode-setup'],
    }
    expect(() => applyLegacyBingoContractDecisions({
      legacy: legacyWorksheet(),
      legacyWorksheetSha256: LEGACY_SHA,
      authoring,
      masterPool: masterPool(),
      masterPoolSha256: MASTER_SHA,
      manifest: manifest(),
    })).toThrow('bingo square supported-square already has a conflicting contract')
  })

  it('is idempotent when the same decisions are applied twice', () => {
    const first = applyLegacyBingoContractDecisions({
      legacy: legacyWorksheet(),
      legacyWorksheetSha256: LEGACY_SHA,
      authoring: authoringWorksheet(),
      masterPool: masterPool(),
      masterPoolSha256: MASTER_SHA,
      manifest: manifest(),
    })
    const second = applyLegacyBingoContractDecisions({
      legacy: legacyWorksheet(),
      legacyWorksheetSha256: LEGACY_SHA,
      authoring: first.worksheet,
      masterPool: masterPool(),
      masterPoolSha256: MASTER_SHA,
      manifest: manifest(),
    })
    expect(second.worksheet).toEqual(first.worksheet)
  })

  it('uses an explicit exclusion review when the source boundary is a positive clarification', () => {
    const decisions = manifest()
    decisions.exclusions_by_square_id = {
      'supported-square': ['An ambiguous version of the event does not count.'],
    }
    const result = applyLegacyBingoContractDecisions({
      legacy: legacyWorksheet(),
      legacyWorksheetSha256: LEGACY_SHA,
      authoring: authoringWorksheet(),
      masterPool: masterPool(),
      masterPoolSha256: MASTER_SHA,
      manifest: decisions,
    })
    expect(result.worksheet.bingo_squares[0].contract?.exclusions)
      .toEqual(['An ambiguous version of the event does not count.'])
  })

  it('upgrades its own legacy-derived exclusion when a later explicit review replaces it', () => {
    const first = applyLegacyBingoContractDecisions({
      legacy: legacyWorksheet(),
      legacyWorksheetSha256: LEGACY_SHA,
      authoring: authoringWorksheet(),
      masterPool: masterPool(),
      masterPoolSha256: MASTER_SHA,
      manifest: manifest(),
    })
    const decisions = manifest()
    decisions.exclusions_by_square_id = {
      'supported-square': ['An ambiguous version of the event does not count.'],
    }
    const second = applyLegacyBingoContractDecisions({
      legacy: legacyWorksheet(),
      legacyWorksheetSha256: LEGACY_SHA,
      authoring: first.worksheet,
      masterPool: masterPool(),
      masterPoolSha256: MASTER_SHA,
      manifest: decisions,
    })
    expect(second.worksheet.bingo_squares[0].contract?.exclusions)
      .toEqual(['An ambiguous version of the event does not count.'])
  })

})
