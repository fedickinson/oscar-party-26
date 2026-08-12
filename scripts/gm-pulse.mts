/**
 * gm-pulse — the operator's laptop lens, as one read-only command.
 *
 *   npx tsx scripts/gm-pulse.mts [--room WDKH]
 *
 * The default target remains production because this command exists to observe
 * a live room. Override deliberately with SUPABASE_TARGET=local.
 */
import { deriveGmPulseReport } from '../src/lib/gm-pulse'
import {
  deriveEngineHeartbeat,
  deriveOperatorReviewQueue,
  type OperatorReviewQueueSignal,
} from '../src/lib/operator-lens'
import { createOperatorRoomReader } from './lib/operator-room-read.mts'

function roomCode(argv: string[]): string {
  if (argv.length === 0) return 'WDKH'
  if (argv.length !== 2 || argv[0] !== '--room') {
    throw new Error('Usage: npx tsx scripts/gm-pulse.mts [--room CODE]')
  }
  const value = argv[1]?.trim().toUpperCase()
  if (!value || value.startsWith('--')) {
    throw new Error('Usage: npx tsx scripts/gm-pulse.mts [--room CODE]')
  }
  return value
}

const code = roomCode(process.argv.slice(2))
const reader = createOperatorRoomReader('remote')

function queueLabel(signal: OperatorReviewQueueSignal, singular: string, plural: string): string {
  if (signal.status === 'loading') return 'CHECKING'
  if (signal.status === 'error') return `UNAVAILABLE · ${signal.error}`
  if (signal.status === 'clear') return 'CLEAR'
  return `${signal.pending_count} ${signal.pending_count === 1 ? singular : plural} WAITING`
}

const observation = await reader.read(code)
const { room, players, messages, cards, marks } = observation
const report = deriveGmPulseReport({ players, messages, cards, marks })

const groundingSignal = deriveOperatorReviewQueue(
  observation.grounding_queue.count, false, observation.grounding_queue.error,
)
const witnessSignal = deriveOperatorReviewQueue(
  observation.witness_queue.count, false, observation.witness_queue.error,
)

const now = observation.observed_at_ms
function ago(iso: string): string {
  const minutes = Math.round((now - new Date(iso).getTime()) / 60_000)
  return minutes < 1 ? 'now' : `${minutes}m ago`
}

const heartbeat = deriveEngineHeartbeat(observation.heartbeat, false, now)
const daemon = heartbeat.status === 'missing'
  ? 'NOT RUNNING'
  : heartbeat.status === 'live'
    ? `LIVE · pulse ${Math.floor((heartbeat.age_ms ?? 0) / 1000)}s ago`
    : heartbeat.age_ms === null
      ? 'STALE · invalid heartbeat timestamp'
      : `STALE · pulse ${Math.floor(heartbeat.age_ms / 1000)}s ago`

console.log('[gm-pulse] mode=read-only')
console.log(`\n═══ ${code} · phase ${room.phase} · ${observation.winner_count} events declared ═══\n`)
console.log('PLAYERS — last seen (chat), declares (banner-attributed), marks:')
for (const activity of report.players) {
  const player = activity.player
  const team = player.team === 'black' ? 'BLK' : player.team === 'green' ? 'GRN' : ' — '
  const chat = activity.last_chat_at ? ago(activity.last_chat_at).padEnd(8) : 'never   '
  const declares = activity.declaration_attribution === 'ambiguous_name'
    ? 'ambiguous'
    : String(activity.declaration_count)
  console.log(
    `  ${(player.is_host ? 'HOST' : '    ')} ${player.name.padEnd(16)} ${team}` +
      `  chat:${chat} declares:${declares}  marks:${activity.mark_count}`,
  )
}

console.log('\nLAST 6 THINGS THAT HAPPENED:')
for (const fact of report.recent_facts) {
  console.log(`  ${ago(fact.created_at).padEnd(8)} ${fact.text.slice(0, 78)}`)
}

console.log(`\nENGINE: companion daemon ${daemon}`)
console.log(
  `CAST SEQUENCE: last spoke ${report.last_companion_at ? ago(report.last_companion_at) : 'NEVER'}` +
    ' (activity only; not response proof)',
)
console.log('\nREVIEW QUEUES:')
console.log(`  grounding (room capability): ${queueLabel(groundingSignal, 'blocked batch', 'blocked batches')}`)
console.log(`  witness (room capability):  ${queueLabel(witnessSignal, 'proposal', 'proposals')}`)
console.log('')
