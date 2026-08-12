/**
 * sentinel — a quiet, read-only operator alarm for one exact room.
 *
 *   npx tsx scripts/sentinel.mts --room WDKH
 *   npx tsx scripts/sentinel.mts --room WDKH --loop 15
 *
 * One-shot mode exits 0 when clear, 2 when operator attention is required,
 * and 1 when observation itself fails. Loop mode prints only state changes.
 * The default target is production because this is an operator observer;
 * override deliberately with SUPABASE_TARGET=local.
 */
import {
  deriveEngineHeartbeat,
  deriveNarrativeSequence,
  deriveOperatorReviewQueue,
} from '../src/lib/operator-lens'
import {
  deriveOperatorSentinel,
  sentinelStateChanged,
  type OperatorSentinelState,
} from '../src/lib/operator-sentinel'
import { createOperatorRoomReader } from './lib/operator-room-read.mts'

interface SentinelArgs {
  room: string
  loop_seconds: number | null
}

function usage(): string {
  return 'Usage: npx tsx scripts/sentinel.mts --room CODE [--loop SECONDS]'
}

function parseArgs(argv: string[]): SentinelArgs {
  let room: string | null = null
  let loopSeconds: number | null = null

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--room' && room === null) {
      const value = argv[index + 1]?.trim().toUpperCase()
      if (!value || value.startsWith('--')) throw new Error(usage())
      room = value
      index += 1
      continue
    }
    if (argument === '--loop' && loopSeconds === null) {
      const raw = argv[index + 1]?.trim()
      const value = raw && /^\d+$/.test(raw) ? Number(raw) : Number.NaN
      if (!Number.isInteger(value) || value < 5 || value > 3600) {
        throw new Error(`${usage()}\n--loop must be an integer from 5 through 3600.`)
      }
      loopSeconds = value
      index += 1
      continue
    }
    throw new Error(usage())
  }

  if (room === null) throw new Error(usage())
  return { room, loop_seconds: loopSeconds }
}

function render(room: string, phase: string, observedAtMs: number, state: OperatorSentinelState): void {
  console.log(
    `[sentinel] room=${room} phase=${phase} status=${state.status.toUpperCase()}` +
      ` observed=${new Date(observedAtMs).toISOString()}`,
  )
  if (state.status === 'clear') {
    console.log('  all monitored channels clear')
    return
  }
  for (const anomaly of state.anomalies) {
    console.log(`  ${anomaly.code.toUpperCase()}: ${anomaly.detail}`)
  }
}

function observerFailure(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const reader = createOperatorRoomReader('remote')
  let previousSignature: string | null = null

  async function observeOnce(): Promise<OperatorSentinelState> {
    const observation = await reader.read(args.room)
    const state = deriveOperatorSentinel({
      room: observation.room,
      engine_heartbeat: deriveEngineHeartbeat(
        observation.heartbeat,
        false,
        observation.observed_at_ms,
      ),
      narrative_sequence: deriveNarrativeSequence(observation.messages, false),
      review_queues: {
        grounding: deriveOperatorReviewQueue(
          observation.grounding_queue.count,
          false,
          observation.grounding_queue.error,
        ),
        witness: deriveOperatorReviewQueue(
          observation.witness_queue.count,
          false,
          observation.witness_queue.error,
        ),
      },
    })
    if (sentinelStateChanged(previousSignature, state.signature)) {
      render(observation.room.code, observation.room.phase, observation.observed_at_ms, state)
      previousSignature = state.signature
    }
    return state
  }

  if (args.loop_seconds === null) {
    const state = await observeOnce()
    process.exitCode = state.status === 'clear' ? 0 : 2
    return
  }

  console.log(`[sentinel] mode=read-only loop=${args.loop_seconds}s`)
  while (true) {
    try {
      await observeOnce()
    } catch (error) {
      const signature = `observer:error:${observerFailure(error)}`
      if (sentinelStateChanged(previousSignature, signature)) {
        console.error(`[sentinel] OBSERVER ERROR: ${observerFailure(error)}`)
        previousSignature = signature
      }
    }
    await new Promise<void>((resolve) => setTimeout(resolve, args.loop_seconds! * 1000))
  }
}

main().catch((error: unknown) => {
  console.error(`[sentinel] ERROR: ${observerFailure(error)}`)
  process.exitCode = 1
})
