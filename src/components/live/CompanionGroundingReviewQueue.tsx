import { Check, FileWarning, Loader2, ShieldAlert } from 'lucide-react'
import { motion } from 'framer-motion'
import type { PendingCompanionGroundingReview } from '../../hooks/useCompanionGroundingReviews'

interface Props {
  reviews: PendingCompanionGroundingReview[]
  isLoading: boolean
  dismissingId: string | null
  error: string | null
  onDismiss: (reviewId: string) => Promise<boolean>
}

function createdLabel(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Time unavailable'
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export default function CompanionGroundingReviewQueue({
  reviews,
  isLoading,
  dismissingId,
  error,
  onDismiss,
}: Props) {
  const queueTitle = isLoading && reviews.length === 0
    ? 'Reading blocked cast batches'
    : reviews.length === 0
      ? 'Grounding review unavailable'
      : reviews.length === 1
        ? 'One cast batch stayed off record'
        : `${reviews.length} cast batches stayed off record`

  if (!isLoading && reviews.length === 0 && !error) return null

  return (
    <section
      className="material-iron relief-inset rounded-2xl border border-[color:var(--t-line)] p-4 space-y-3"
      aria-label="Blocked companion prose reviews"
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border"
          style={{ borderColor: 'var(--t-pending)', color: 'var(--t-pending)' }}
        >
          <ShieldAlert className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-widest text-[color:var(--t-pending)]">
            Grounding desk
          </p>
          <h2 className="mt-1 text-lg font-bold text-[color:var(--t-text)]">
            {queueTitle}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-[color:var(--t-text-muted)]">
            The auditor found claims outside the declared facts. Nothing below entered chat.
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="flex min-h-11 items-center gap-2 text-sm text-[color:var(--t-text-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Reading blocked prose
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
        {reviews.map((review) => {
          const busy = dismissingId === review.id
          return (
            <article
              key={review.id}
              className="material-stone relief-raised rounded-xl border border-[color:var(--t-line)] p-3 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="break-words font-bold text-[color:var(--t-text)] [overflow-wrap:anywhere]">
                    {review.facts[0] ?? 'Grounding facts unavailable'}
                  </h3>
                  <p className="mt-1 text-xs text-[color:var(--t-text-dim)]">
                    {review.engine} · {review.attempts} {review.attempts === 1 ? 'attempt' : 'attempts'} · {createdLabel(review.created_at)}
                  </p>
                </div>
                <FileWarning className="h-4 w-4 flex-shrink-0 text-[color:var(--t-pending)]" aria-hidden />
              </div>

              <details className="rounded-xl border border-[color:var(--t-line-soft)]">
                <summary className="flex min-h-11 cursor-pointer items-center px-3 py-2 text-sm font-bold text-[color:var(--t-text)]">
                  Review numbered fact block ({review.facts.length})
                </summary>
                <ol className="list-decimal space-y-2 border-t border-[color:var(--t-line-soft)] px-3 py-3 pl-8 text-xs leading-relaxed text-[color:var(--t-text-muted)]">
                  {review.facts.map((fact, index) => (
                    <li key={index} className="break-words [overflow-wrap:anywhere]">{fact}</li>
                  ))}
                </ol>
              </details>

              <details className="rounded-xl border border-[color:var(--t-line-soft)]">
                <summary className="flex min-h-11 cursor-pointer items-center px-3 py-2 text-sm font-bold text-[color:var(--t-text)]">
                  Review attempted batch ({review.attempted_messages.length})
                </summary>
                <div className="space-y-2 border-t border-[color:var(--t-line-soft)] p-3">
                  {review.attempted_messages.length === 0 ? (
                    <p className="text-xs text-[color:var(--t-text-muted)]">
                      The generator did not return a valid batch.
                    </p>
                  ) : review.attempted_messages.map((message, index) => (
                    <div key={`${message.companion_id}-${index}`}>
                      <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--t-text-dim)]">
                        {message.companion_id}
                      </p>
                      <p className="mt-1 break-words text-sm leading-relaxed text-[color:var(--t-text)] [overflow-wrap:anywhere]">
                        {message.text}
                      </p>
                    </div>
                  ))}
                </div>
              </details>

              <div className="space-y-2">
                {review.findings.map((finding, index) => (
                  <div
                    key={`${finding.companion_id}-${index}`}
                    className="rounded-xl border border-[color:var(--t-line-soft)] p-3"
                  >
                    <p className="text-xs font-bold uppercase tracking-wide text-[color:var(--t-text-dim)]">
                      {finding.companion_id}
                    </p>
                    {finding.text && (
                      <p className="mt-1 break-words text-sm leading-relaxed text-[color:var(--t-text)] [overflow-wrap:anywhere]">
                        {finding.text}
                      </p>
                    )}
                    <ul className="mt-2 space-y-1 text-xs leading-relaxed text-[color:var(--t-negative)]">
                      {finding.violations.map((violation, violationIndex) => (
                        <li key={violationIndex} className="break-words [overflow-wrap:anywhere]">{violation}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <motion.button
                type="button"
                whileTap={{ scale: 0.97 }}
                disabled={dismissingId !== null}
                onClick={() => { void onDismiss(review.id) }}
                className="min-h-11 w-full rounded-xl border border-[color:var(--t-line)] px-3 py-2 text-sm font-bold
                           text-[color:var(--t-text)] disabled:opacity-40"
              >
                <span className="flex items-center justify-center gap-2">
                  {busy ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Check className="h-4 w-4" aria-hidden />
                  )}
                  {busy ? 'Acknowledging…' : 'Acknowledge and keep blocked'}
                </span>
              </motion.button>
            </article>
          )
        })}
      </div>
    </section>
  )
}
