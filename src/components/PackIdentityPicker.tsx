import { useState } from 'react'
import { Check, Flag } from 'lucide-react'

interface Props {
  options: string[]
  currentChoice: string | null
  onChoose: (choice: string) => Promise<void>
  disabled?: boolean
  compact?: boolean
}

/** Show-neutral identity control. Every label comes from the bound pack. */
export default function PackIdentityPicker({
  options,
  currentChoice,
  onChoose,
  disabled = false,
  compact = false,
}: Props) {
  const [pendingChoice, setPendingChoice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function choose(choice: string) {
    if (disabled || pendingChoice || choice === currentChoice) return
    setPendingChoice(choice)
    setError(null)
    try {
      await onChoose(choice)
    } catch (choiceError) {
      const detail = choiceError instanceof Error ? choiceError.message : 'The choice did not save.'
      setError(`Could not change your banner: ${detail}`)
    } finally {
      setPendingChoice(null)
    }
  }

  return (
    <section className={compact ? 'space-y-2' : 'relief-glass space-y-3 rounded-2xl p-4'}>
      <div className="flex items-center gap-2">
        <Flag size={15} className="text-[var(--t-personal-text)]" aria-hidden />
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-[var(--t-text-muted)]">
            Your banner
          </p>
          {!compact && (
            <p className="mt-0.5 text-xs text-[var(--t-text-dim)]">
              You may change sides. The room will remember the turn.
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((choice) => {
          const active = choice === currentChoice
          return (
            <button
              key={choice}
              type="button"
              disabled={disabled || pendingChoice != null}
              onClick={() => void choose(choice)}
              aria-pressed={active}
              className={[
                'inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors disabled:opacity-50',
                active
                  ? 'border-[var(--t-personal-device)] bg-[var(--t-personal-field)] text-[var(--t-personal-text)]'
                  : 'border-[var(--t-line)] bg-[var(--t-surface)] text-[var(--t-text-muted)]',
              ].join(' ')}
            >
              {active && <Check size={15} aria-hidden />}
              <span>{choice}</span>
            </button>
          )
        })}
      </div>
      {error && <p role="alert" className="text-xs text-[var(--t-negative)]">{error}</p>}
    </section>
  )
}
