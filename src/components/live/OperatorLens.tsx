import {
  Activity,
  ChevronDown,
  Eye,
  EyeOff,
  FileWarning,
  ListChecks,
  Loader2,
  MonitorCheck,
  Radio,
  WifiOff,
} from 'lucide-react'
import type {
  EngineHeartbeatSignal,
  NarrativeSequence,
  OperatorPresenceRow,
  OperatorPresenceSignal,
  OperatorReviewQueues,
  OperatorReviewQueueSignal,
} from '../../lib/operator-lens'
import { deriveOperatorReadiness } from '../../lib/operator-lens'

interface Props {
  presenceRows: OperatorPresenceRow[]
  narrativeSequence: NarrativeSequence
  engineHeartbeat: EngineHeartbeatSignal
  heartbeatError: string | null
  reviewQueues: OperatorReviewQueues
}

const SIGNAL_LABEL: Record<OperatorPresenceSignal, string> = {
  connecting: 'Syncing',
  live: 'Here',
  background: 'Background',
  absent: 'No signal',
}

function SignalIcon({ signal }: { signal: OperatorPresenceSignal }) {
  const props = { className: 'h-4 w-4', 'aria-hidden': true } as const
  if (signal === 'connecting') return <Loader2 {...props} className="h-4 w-4 animate-spin" />
  if (signal === 'live') return <Eye {...props} />
  if (signal === 'background') return <EyeOff {...props} />
  return <WifiOff {...props} />
}

function narrativeLabel(sequence: NarrativeSequence): string {
  if (sequence.status === 'loading') return 'Reading cast'
  if (sequence.status === 'idle') return 'Cast idle'
  if (sequence.status === 'activity_after_fact') return 'Cast activity after fact'
  return `${sequence.pending_fact_count} ${sequence.pending_fact_count === 1 ? 'fact' : 'facts'} since cast activity`
}

function heartbeatLabel(signal: EngineHeartbeatSignal): string {
  if (signal.status === 'loading') return 'Checking daemon'
  if (signal.status === 'live') return 'Daemon live'
  if (signal.status === 'stale') return 'Daemon stale'
  return 'Daemon not running'
}

function heartbeatDetail(signal: EngineHeartbeatSignal): string {
  if (signal.status === 'loading') return 'Reading the room heartbeat lease.'
  if (signal.status === 'missing') return 'No companion daemon holds this room lease.'
  if (signal.age_ms == null) return 'The last heartbeat timestamp is invalid.'
  const seconds = Math.floor(signal.age_ms / 1000)
  if (signal.status === 'live') return `Last pulse ${seconds}s ago. The room lease is current.`
  return `Last pulse ${seconds}s ago. Another daemon may take over the stale lease.`
}

function timeLabel(value: string | null): string | null {
  if (!value) return null
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function reviewQueueLabel(
  label: string,
  signal: OperatorReviewQueueSignal,
  singular: string,
  plural: string,
): string {
  if (signal.status === 'loading') return `${label}: checking`
  if (signal.status === 'error') return `${label}: unavailable`
  if (signal.status === 'clear') return `${label}: clear`
  return `${signal.pending_count} ${signal.pending_count === 1 ? singular : plural} waiting`
}

export default function OperatorLens({
  presenceRows,
  narrativeSequence,
  engineHeartbeat,
  heartbeatError,
  reviewQueues,
}: Props) {
  const readiness = deriveOperatorReadiness(
    presenceRows,
    narrativeSequence,
    engineHeartbeat,
    heartbeatError,
    reviewQueues,
  )
  const lastCastTime = timeLabel(narrativeSequence.last_cast_at)
  const summaryBadge = readiness.status === 'checking'
    ? 'Checking'
    : readiness.status === 'ready'
      ? 'Ready'
      : `${readiness.attention_count} ${readiness.attention_count === 1 ? 'check' : 'checks'}`
  const summaryDetail = readiness.status === 'checking'
    ? 'Checking room systems'
    : readiness.status === 'ready'
      ? `${readiness.connected_player_count}/${readiness.total_player_count} signaled · record and reviews clear`
      : `${readiness.attention_count} operator ${readiness.attention_count === 1 ? 'check needs' : 'checks need'} attention`

  return (
    <details className="group material-stone relief-inset rounded-2xl">
      <summary className="min-h-11 cursor-pointer list-none px-4 py-3 [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl border"
            style={{ borderColor: 'var(--t-line)', color: 'var(--t-personal-text)' }}
          >
            <Radio className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <p className="text-xs font-bold uppercase tracking-widest text-[color:var(--t-personal-text)]">
                Operator lens
              </p>
              <span className="flex flex-shrink-0 items-center gap-1.5">
                <span
                  className="rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide"
                  style={{
                    borderColor: readiness.status === 'ready'
                      ? 'var(--t-positive)'
                      : readiness.status === 'attention'
                        ? 'var(--t-pending)'
                        : 'var(--t-line)',
                    color: readiness.status === 'ready'
                      ? 'var(--t-positive)'
                      : readiness.status === 'attention'
                        ? 'var(--t-pending)'
                        : 'var(--t-text-dim)',
                  }}
                >
                  {summaryBadge}
                </span>
                <ChevronDown
                  className="h-4 w-4 text-[color:var(--t-text-dim)] transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </span>
            </div>
            <p className="mt-0.5 text-sm text-[color:var(--t-text-muted)]">
              {summaryDetail}
            </p>
          </div>
        </div>
      </summary>

      <div className="space-y-4 border-t border-[color:var(--t-line)] px-4 pb-4 pt-3">
        <section aria-labelledby="operator-engine-heading">
          <div className="mb-2 flex items-center gap-2">
            <MonitorCheck className="h-4 w-4 text-[color:var(--t-text-dim)]" aria-hidden />
            <h3
              id="operator-engine-heading"
              className="text-xs font-bold uppercase tracking-wide text-[color:var(--t-text-dim)]"
            >
              Engine heartbeat
            </h3>
          </div>
          <div
            className="rounded-xl border p-3"
            style={{
              borderColor: engineHeartbeat.status === 'live'
                ? 'var(--t-positive)'
                : engineHeartbeat.status === 'stale'
                  ? 'var(--t-pending)'
                  : 'var(--t-line-soft)',
              background: engineHeartbeat.status === 'live'
                ? 'var(--t-positive-soft)'
                : engineHeartbeat.status === 'stale'
                  ? 'var(--t-pending-soft)'
                  : 'var(--t-negative-soft)',
            }}
          >
            <p className="text-sm font-bold text-[color:var(--t-text)]">
              {heartbeatLabel(engineHeartbeat)}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[color:var(--t-text-muted)]">
              {heartbeatError ?? heartbeatDetail(engineHeartbeat)}
            </p>
          </div>
        </section>

        <section aria-labelledby="operator-presence-heading">
          <div className="mb-2 flex items-center gap-2">
            <Radio className="h-4 w-4 text-[color:var(--t-text-dim)]" aria-hidden />
            <h3
              id="operator-presence-heading"
              className="text-xs font-bold uppercase tracking-wide text-[color:var(--t-text-dim)]"
            >
              Room signal
            </h3>
          </div>
          <div className="divide-y divide-[color:var(--t-line-soft)] rounded-xl border border-[color:var(--t-line-soft)]">
            {presenceRows.map((row) => (
              <div key={row.player.id} className="flex min-h-11 items-center gap-3 px-3 py-2">
                <span
                  style={{
                    color: row.signal === 'live'
                      ? 'var(--t-positive)'
                      : row.signal === 'background'
                        ? 'var(--t-pending)'
                        : 'var(--t-text-dim)',
                  }}
                >
                  <SignalIcon signal={row.signal} />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-[color:var(--t-text)]">
                  {row.player.name}
                  {row.player.is_host ? ' · host' : ''}
                </span>
                <span className="text-xs text-[color:var(--t-text-dim)]">
                  {SIGNAL_LABEL[row.signal]}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="operator-cast-heading">
          <div className="mb-2 flex items-center gap-2">
            <Activity className="h-4 w-4 text-[color:var(--t-text-dim)]" aria-hidden />
            <h3
              id="operator-cast-heading"
              className="text-xs font-bold uppercase tracking-wide text-[color:var(--t-text-dim)]"
            >
              Narrative sequence
            </h3>
          </div>
          <div
            className="rounded-xl border p-3"
            style={{
              borderColor: narrativeSequence.status === 'quiet_after_fact'
                ? 'var(--t-pending)'
                : 'var(--t-line-soft)',
              background: narrativeSequence.status === 'quiet_after_fact'
                ? 'var(--t-pending-soft)'
                : 'var(--t-positive-soft)',
            }}
          >
            <p className="text-sm font-bold text-[color:var(--t-text)]">
              {narrativeLabel(narrativeSequence)}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[color:var(--t-text-muted)]">
              {narrativeSequence.status === 'quiet_after_fact'
                ? 'Declared facts are newer than the most recent companion message.'
                : narrativeSequence.status === 'activity_after_fact'
                  ? `A companion message landed after the latest fact${lastCastTime ? ` at ${lastCastTime}` : ''}.`
                  : narrativeSequence.status === 'idle'
                    ? 'No declared fact is newer than the latest cast activity.'
                    : 'Loading the room message record.'}
            </p>
          </div>
        </section>

        <section aria-labelledby="operator-reviews-heading">
          <div className="mb-2 flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-[color:var(--t-text-dim)]" aria-hidden />
            <h3
              id="operator-reviews-heading"
              className="text-xs font-bold uppercase tracking-wide text-[color:var(--t-text-dim)]"
            >
              Review queues
            </h3>
          </div>
          <div className="divide-y divide-[color:var(--t-line-soft)] rounded-xl border border-[color:var(--t-line-soft)]">
            {([
              {
                key: 'grounding',
                label: 'Grounding desk',
                singular: 'blocked batch',
                plural: 'blocked batches',
                signal: reviewQueues.grounding,
                Icon: FileWarning,
              },
              {
                key: 'witness',
                label: 'Witness desk',
                singular: 'proposal',
                plural: 'proposals',
                signal: reviewQueues.witness,
                Icon: Eye,
              },
            ] as const).map(({ key, label, singular, plural, signal, Icon }) => (
              <div key={key} className="flex min-h-11 items-start gap-3 px-3 py-2.5">
                <span
                  className="mt-0.5 flex-shrink-0"
                  style={{
                    color: signal.status === 'clear'
                      ? 'var(--t-positive)'
                      : signal.status === 'error'
                        ? 'var(--t-negative)'
                        : signal.status === 'pending'
                          ? 'var(--t-pending)'
                          : 'var(--t-text-dim)',
                  }}
                >
                  {signal.status === 'loading'
                    ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    : <Icon className="h-4 w-4" aria-hidden />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-[color:var(--t-text)]">
                    {reviewQueueLabel(label, signal, singular, plural)}
                  </span>
                  {signal.error && (
                    <span className="mt-0.5 block break-words text-xs leading-relaxed text-[color:var(--t-negative)]">
                      {signal.error}
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>

        <p className="text-[11px] leading-relaxed text-[color:var(--t-text-dim)]">
          Presence covers this live page. Heartbeat proves the daemon lease is current;
          narrative status proves sequence only, not a response. Review queues report pending
          operator work, not new facts. The episode log below is the canonical activity feed.
        </p>
      </div>
    </details>
  )
}
