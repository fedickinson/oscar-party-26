import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileShowPack, parseShowPack } from '../../src/lib/show-pack'

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))))

/**
 * How large a Results Night proof catalog a fixture needs.
 *
 * A published pack's compiled manifest is immutable, so any catalog that is not
 * the default shape must carry its own `packKey`: reusing a key would attest
 * different bytes against an already published registry row and be rejected.
 */
export type ResultsNightDogfoodPackShape = {
  packKey?: string
  title?: string
  /** Draftable person-kind entities; the legacy person sub-draft pool. */
  people?: number
  /** Draftable creature-kind entities; the legacy film sub-draft pool. */
  creatures?: number
  predictions?: number
  bingoSquares?: number
}

const DEFAULT_SHAPE = {
  packKey: 'results-night-command-dogfood-v2',
  title: 'Results Night Command Dogfood',
  people: 2,
  creatures: 1,
  predictions: 3,
  bingoSquares: 24,
} as const

function ordinal(index: number): string {
  return String(index).padStart(2, '0')
}

/** Bind a deterministic Results Night proof pack to one local lobby. */
export function bindResultsNightDogfoodPack(
  roomCode: string,
  shape: ResultsNightDogfoodPackShape = {},
): void {
  const { packKey, title, people, creatures, predictions, bingoSquares } = {
    ...DEFAULT_SHAPE,
    ...shape,
  }
  if (people < 1 || creatures < 1 || predictions < 1 || bingoSquares < 1) {
    throw new Error('a Results Night dogfood catalog needs at least one row of every kind')
  }
  const workspace = mkdtempSync(join(tmpdir(), 'results-night-dogfood-'))
  try {
    const pack = compileShowPack(parseShowPack(readFileSync(
      join(repoRoot, 'show-packs/examples/hotd-s3e8-proof.json'),
      'utf8',
    )))
    pack.pack.id = packKey
    pack.pack.title = title
    // Compatibility metadata deliberately disagrees with the contract so the
    // proof fails if fact_source ever regains authority over room behavior.
    pack.pack.fact_source = 'room_declared'
    pack.game_contract = {
      version: 1,
      commitment: 'confidence_allocation',
      conviction_budget: null,
      identity: { selection: 'exclusive_entity_draft', scoring: 'ensemble' },
      scarcity: { commitments: 'ranked_allocation', identity: 'exclusive' },
      visibility: 'sealed_until_lock',
      cadence: 'immediate_per_outcome',
      continuity: 'no_carryover',
    }
    // The authored slice opens with one person and one creature; the creature
    // kind is what the legacy draft installs as the "film" sub-draft pool.
    const [basePerson, baseCreature] = pack.entities
    if (basePerson.kind !== 'person' || baseCreature.kind !== 'creature') {
      throw new Error('the authored proof slice no longer opens with a person and a creature')
    }
    // The first extra person keeps its original identity so the default shape
    // still compiles to the exact bytes of the published dogfood registry.
    for (let index = 1; index < people; index += 1) {
      pack.entities.push({
        ...structuredClone(basePerson),
        id: index === 1 ? 'results-third-candidate' : `results-candidate-${ordinal(index + 2)}`,
        name: index === 1 ? 'Results Third Candidate' : `Results Candidate ${index + 2}`,
      })
    }
    for (let index = 1; index < creatures; index += 1) {
      pack.entities.push({
        ...structuredClone(baseCreature),
        id: `results-creature-${ordinal(index + 1)}`,
        name: `Results Creature ${index + 1}`,
      })
    }
    pack.predictions = Array.from({ length: predictions }, (_, index) => ({
      ...structuredClone(pack.predictions[0]),
      id: `results-outcome-${ordinal(index + 1)}`,
      title: `Results outcome ${index + 1}`,
      candidate_entity_ids: pack.entities.map((entity) => entity.id),
    }))
    for (const wager of [
      ...pack.predictions,
      ...pack.signature_beats,
      ...pack.bingo_squares,
    ]) wager.truth_authority = 'official_result'
    pack.bingo_squares = Array.from({ length: bingoSquares }, (_, index) => ({
      ...structuredClone(pack.bingo_squares[0]),
      id: `results-square-${ordinal(index + 1)}`,
      title: `Results square ${index + 1}`,
    }))

    const inputPath = join(workspace, 'results-night-pack.json')
    writeFileSync(inputPath, `${JSON.stringify(pack, null, 2)}\n`, 'utf8')
    const result = spawnSync(process.execPath, [
      '--import', 'tsx', 'scripts/activate-show-pack.mts',
      '--input', inputPath,
      '--room', roomCode,
      '--apply',
      '--confirm-room', roomCode,
    ], { cwd: repoRoot, encoding: 'utf8', timeout: 90_000 })
    if (result.status !== 0) {
      const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
      throw new Error(`Results Night pack activation failed: ${output}`)
    }
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
}
