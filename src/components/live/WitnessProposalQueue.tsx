import { useState } from 'react'
import { Check, Eye, Loader2, X } from 'lucide-react'
import { motion } from 'framer-motion'
import type {
  PendingWitnessProposal,
  WitnessReviewAction,
} from '../../hooks/useWitnessProposals'
import { deriveWitnessAuthority, deriveWitnessRulingOptions } from '../../lib/witness-authority'

interface Props {
  proposals: PendingWitnessProposal[]
  isLoading: boolean
  reviewingId: string | null
  error: string | null
  onReview: (
    proposalId: string,
    action: WitnessReviewAction,
    selectedEntityId?: string | null,
    expectedObservationCount?: number | null,
  ) => Promise<boolean>
}

function observedLabel(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Observation time unavailable'
  return `Observed ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
}

function adjudicationLabel(value: string): string {
  return ({
    count: 'counts',
    do_not_count: 'does not count',
    explicit_only: 'explicit only',
    principal_accepts_if_unrefused: 'counts if the principal accepts without refusal',
  } as Record<string, string>)[value] ?? value
}

export default function WitnessProposalQueue({
  proposals,
  isLoading,
  reviewingId,
  error,
  onReview,
}: Props) {
  const [selectedEntities, setSelectedEntities] = useState<Record<string, {
    entityId: string
    evidenceSignature: string
  }>>({})
  if (!isLoading && proposals.length === 0 && !error) return null

  return (
    <section
      className="material-iron relief-inset rounded-2xl border border-[color:var(--t-line)] p-4 space-y-3"
      aria-label="AI witness proposals"
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border"
          style={{ borderColor: 'var(--t-pending)', color: 'var(--t-pending)' }}
        >
          <Eye className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-widest text-[color:var(--t-pending)]">
            Witness desk
          </p>
          <h2 className="mt-1 text-lg font-bold text-[color:var(--t-text)]">
            {proposals.length === 1 ? 'One moment needs your ruling' : `${proposals.length} moments need your ruling`}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-[color:var(--t-text-muted)]">
            The watcher can point. Only you can write the room&apos;s record.
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="flex min-h-11 items-center gap-2 text-sm text-[color:var(--t-text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Reading the private queue
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-xl border p-3 text-sm text-[color:var(--t-text)]"
          style={{ borderColor: 'var(--t-negative)', background: 'var(--t-negative-soft)' }}
        >
          {error}
        </p>
      )}

      <div className="space-y-3" aria-live="polite">
        {proposals.map((proposal) => {
          const busy = reviewingId === proposal.id
          const authority = deriveWitnessAuthority({
            minimumConfidence: proposal.minimum_confidence,
            maximumConfidence: proposal.maximum_confidence,
            frameSha256: proposal.frame_sha256,
            modelOutputSha256: proposal.model_output_sha256,
            exclusions: proposal.exclusions,
            adjudication: proposal.adjudication,
            observationCount: proposal.observation_count,
            matchingEntityCount: proposal.matching_entity_count,
            conflictingEntityCount: proposal.conflicting_entity_count,
            conflictingEntityName: proposal.conflicting_entity_name,
          })
          const rulingOptions = deriveWitnessRulingOptions({
            rootEntityId: proposal.entity_id,
            observationCount: proposal.observation_count,
            options: proposal.ruling_options,
          })
          const evidenceSignature = rulingOptions
            .map((option) => `${option.entity_id}:${option.positive_count}`)
            .join('|')
          const storedSelection = selectedEntities[proposal.id]
          const selectedEntityId = rulingOptions.length === 1
            ? rulingOptions[0].entity_id
            : storedSelection?.evidenceSignature === evidenceSignature
              ? storedSelection.entityId
              : null
          return (
            <article key={proposal.id} className="material-stone relief-raised rounded-xl border border-[color:var(--t-line)] p-3 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-bold text-[color:var(--t-text)]">{proposal.beat_name}</h3>
                  <p className="mt-1 text-sm text-[color:var(--t-text-muted)]">
                    {rulingOptions.length > 1 ? 'First frame: ' : ''}{proposal.entity_name} · +{proposal.points}
                  </p>
                </div>
                <span
                  className="flex-shrink-0 rounded-full border px-2 py-1 text-xs font-bold tabular-nums"
                  style={{ borderColor: 'var(--t-pending)', color: 'var(--t-pending)' }}
                >
                  Human ruling
                </span>
              </div>
              <p className="text-sm leading-relaxed text-[color:var(--t-text)]">
                {proposal.trigger_text}
              </p>
              <div className="rounded-xl border border-[color:var(--t-line-soft)] p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--t-text-dim)]">
                  Does not count
                </p>
                <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm leading-relaxed text-[color:var(--t-text-muted)]">
                  {proposal.exclusions.map((exclusion, index) => <li key={`${index}:${exclusion}`}>{exclusion}</li>)}
                </ul>
                <p className="mt-2 text-xs leading-relaxed text-[color:var(--t-text-dim)]">
                  Proxy: {adjudicationLabel(proposal.adjudication.proxies)} · Off-screen: {adjudicationLabel(proposal.adjudication.offscreen)} · Mention: {adjudicationLabel(proposal.adjudication.mentions)}
                </p>
              </div>
              <p className="text-xs text-[color:var(--t-text-dim)]">
                {observedLabel(proposal.latest_observed_at)} · first frame {proposal.frame_sha256.slice(0, 10)}
              </p>
              <details className="rounded-xl border border-[color:var(--t-line-soft)] p-3">
                <summary className="min-h-11 cursor-pointer list-none text-sm font-bold text-[color:var(--t-text)] [&::-webkit-details-marker]:hidden">
                  <span className="flex min-h-11 flex-col justify-center gap-1">
                    <span>Why this cannot auto-declare</span>
                    <span className="text-xs font-medium tabular-nums text-[color:var(--t-text-dim)]">
                      {authority.observation_label}
                    </span>
                    <span className="text-xs font-medium tabular-nums text-[color:var(--t-text-dim)]">
                      {authority.confidence_label}
                    </span>
                  </span>
                </summary>
                <ul className="list-disc space-y-2 border-t border-[color:var(--t-line-soft)] pl-4 pt-3 text-xs leading-relaxed text-[color:var(--t-text-muted)]">
                  {authority.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                </ul>
              </details>
              {rulingOptions.length > 1 && (
                <fieldset className="space-y-2">
                  <legend className="text-xs font-bold uppercase tracking-wide text-[color:var(--t-text-dim)]">
                    Your ruling
                  </legend>
                  <p className="text-xs leading-relaxed text-[color:var(--t-text-muted)]">
                    The retained frames disagree. Choose the character whose moment you witnessed.
                  </p>
                  <div className="grid gap-2">
                    {rulingOptions.map((option) => {
                      const selected = selectedEntityId === option.entity_id
                      return (
                        <button
                          key={option.entity_id}
                          type="button"
                          aria-pressed={selected}
                          disabled={reviewingId !== null}
                          onClick={() => setSelectedEntities((current) => ({
                            ...current,
                            [proposal.id]: {
                              entityId: option.entity_id,
                              evidenceSignature,
                            },
                          }))}
                          className="flex min-h-11 items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm disabled:opacity-40"
                          style={{
                            borderColor: selected ? 'var(--t-pending)' : 'var(--t-line)',
                            background: selected ? 'var(--t-pending-soft)' : 'transparent',
                            color: 'var(--t-text)',
                          }}
                        >
                          <span className="font-bold">{option.entity_name}</span>
                          <span className="flex-shrink-0 tabular-nums text-[color:var(--t-text-dim)]">
                            {option.positive_count} {option.positive_count === 1 ? 'frame' : 'frames'}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </fieldset>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={reviewingId !== null}
                  onClick={() => { void onReview(proposal.id, 'dismiss') }}
                  className="min-h-11 rounded-xl border border-[color:var(--t-line)] px-3 py-2 text-sm font-medium
                             text-[color:var(--t-text-muted)] disabled:opacity-40"
                >
                  <span className="flex items-center justify-center gap-2">
                    <X className="h-4 w-4" aria-hidden />
                    Not enough
                  </span>
                </button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  disabled={reviewingId !== null || selectedEntityId === null}
                  onClick={() => {
                    void onReview(
                      proposal.id,
                      'accept',
                      selectedEntityId,
                      proposal.observation_count,
                    )
                  }}
                  className="min-h-11 rounded-xl bg-[var(--t-personal-device)] px-3 py-2 text-sm font-bold
                             text-[color:var(--t-ground)] disabled:opacity-40"
                >
                  <span className="flex items-center justify-center gap-2">
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Check className="h-4 w-4" aria-hidden />
                    )}
                    {busy ? 'Writing…' : selectedEntityId === null ? 'Choose first' : `Declare +${proposal.points}`}
                  </span>
                </motion.button>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
