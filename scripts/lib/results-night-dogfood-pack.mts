import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileShowPack, parseShowPack } from '../../src/lib/show-pack'

const repoRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))))

/** Bind the shared deterministic Results Night proof pack to one local lobby. */
export function bindResultsNightDogfoodPack(roomCode: string): void {
  const workspace = mkdtempSync('/private/tmp/results-night-dogfood-')
  try {
    const pack = compileShowPack(parseShowPack(readFileSync(
      join(repoRoot, 'show-packs/examples/hotd-s3e8-proof.json'),
      'utf8',
    )))
    pack.pack.id = 'results-night-command-dogfood-v2'
    pack.pack.title = 'Results Night Command Dogfood'
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
    pack.entities.push({
      ...structuredClone(pack.entities[0]),
      id: 'results-third-candidate',
      name: 'Results Third Candidate',
    })
    pack.predictions = Array.from({ length: 3 }, (_, index) => ({
      ...structuredClone(pack.predictions[0]),
      id: `results-outcome-${String(index + 1).padStart(2, '0')}`,
      title: `Results outcome ${index + 1}`,
      candidate_entity_ids: pack.entities.map((entity) => entity.id),
    }))
    for (const wager of [
      ...pack.predictions,
      ...pack.signature_beats,
      ...pack.bingo_squares,
    ]) wager.truth_authority = 'official_result'
    pack.bingo_squares = Array.from({ length: 24 }, (_, index) => ({
      ...structuredClone(pack.bingo_squares[0]),
      id: `results-square-${String(index + 1).padStart(2, '0')}`,
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
    ], { cwd: repoRoot, encoding: 'utf8', timeout: 30_000 })
    if (result.status !== 0) {
      const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
      throw new Error(`Results Night pack activation failed: ${output}`)
    }
  } finally {
    rmSync(workspace, { recursive: true, force: true })
  }
}
