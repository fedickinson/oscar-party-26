import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Check, Loader2, LockKeyhole, RotateCcw } from 'lucide-react'
import { motion } from 'framer-motion'
import Avatar from '../components/Avatar'
import { Hallmark } from '../components/ui/Hallmarks'
import { useGame } from '../context/GameContext'
import { useOperatorAuthority } from '../context/OperatorAuthorityContext'
import { useBeatActivation } from '../hooks/useBeatActivation'
import type { SignatureBeatRow } from '../types/database'

const ODDS_LABELS: Record<string, string> = {
  likely: 'Likely',
  coin_flip: 'Coin flip',
  'coin flip': 'Coin flip',
  long_shot: 'Long shot',
  'long shot': 'Long shot',
  wild: 'Wild',
  chaos: 'Wild',
}

function oddsLabel(odds: string): string {
  return ODDS_LABELS[odds.toLowerCase()] ?? odds
}

function oddsClass(odds: string): string {
  const tier = odds.toLowerCase()
  if (tier === 'likely') return 'text-positive'
  if (tier === 'long_shot' || tier === 'long shot') return 'text-pending'
  if (tier === 'wild' || tier === 'chaos') return 'text-[var(--t-personal-text)]'
  return 'text-[var(--t-text-muted)]'
}

function BeatRow({
  beat,
  selected,
  disabled,
  alwaysLive = false,
  onToggle,
  index,
}: {
  beat: SignatureBeatRow
  selected: boolean
  disabled: boolean
  alwaysLive?: boolean
  onToggle?: () => void
  index: number
}) {
  const activatedWager = selected && !alwaysLive

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: disabled && !selected ? 0.35 : 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      whileTap={!disabled && onToggle ? { scale: 0.97 } : undefined}
      disabled={disabled || alwaysLive}
      onClick={onToggle}
      className={[
        'relief-glass w-full min-h-11 rounded-xl px-3 py-3 text-left transition-colors',
        activatedWager ? 'border-l-2 border-l-[var(--t-personal-device)]' : '',
        disabled && !selected ? 'cursor-not-allowed' : '',
      ].join(' ')}
      style={activatedWager ? { borderLeftColor: 'var(--t-personal-device)' } : undefined}
    >
      <div className="flex items-start gap-3">
        <div className={[
          'mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0',
          selected
            ? alwaysLive
              ? 'bg-[var(--t-positive-soft)] border-positive text-positive'
              : 'bg-[var(--t-personal-device)] border-[var(--t-personal-device)] text-[var(--t-vellum-light)]'
            : 'border-[var(--t-line)] text-transparent',
        ].join(' ')}>
          <Check size={14} strokeWidth={3} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-[var(--t-text)] leading-snug">{beat.name}</p>
            <span className="inline-flex items-center gap-1 text-sm font-bold text-[var(--t-personal-text)] whitespace-nowrap">
              {beat.points >= 35 && <Hallmark id="hallmark-comet" size={14} />}
              {beat.points} pts
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
            <span className={['text-xs uppercase tracking-wide', oddsClass(beat.odds)].join(' ')}>{oddsLabel(beat.odds)}</span>
            {alwaysLive && <span className="text-xs font-semibold uppercase tracking-wide text-positive">always live</span>}
          </div>
          <p className="text-xs text-[var(--t-text-muted)] leading-relaxed mt-1">{beat.trigger_text}</p>
          {beat.pitch && <p className="text-xs text-[var(--t-text-dim)] leading-relaxed mt-1">{beat.pitch}</p>}
        </div>
      </div>
    </motion.button>
  )
}

export default function Activate() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { room, player, loading } = useGame()
  const { authority: operatorAuthority } = useOperatorAuthority()
  const activation = useBeatActivation(room?.id)
  const [confirmAnyway, setConfirmAnyway] = useState(false)

  useEffect(() => {
    if (!room || !code) return
    if (room.phase === 'live') navigate(`/room/${code}/live`)
    if (room.phase === 'lobby') navigate(`/room/${code}`)
  }, [room?.phase, code, navigate])

  useEffect(() => {
    if (!loading && !player) navigate('/')
  }, [loading, player, navigate])

  if (loading || activation.isLoading) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center">
        <Loader2 className="w-7 h-7 text-[var(--t-personal-text)] animate-spin" />
      </div>
    )
  }
  if (!room || !player) return null

  if (activation.syncError) {
    return (
      <div className="mx-auto flex min-h-[80vh] max-w-md items-start px-4 py-6">
        <section
          className="material-stone relief-inset w-full rounded-2xl p-4"
          role="alert"
          aria-live="assertive"
        >
          <p className="font-display text-xs uppercase tracking-widest text-[var(--t-pending)]">
            Wager ledger unavailable
          </p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--t-text-muted)]">
            {activation.syncError} Choosing bets and starting the show stay disabled until the room record is current.
          </p>
          <button
            type="button"
            onClick={activation.retrySync}
            className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--t-line)] bg-[var(--t-surface)] px-4 text-sm font-bold text-[var(--t-text)]"
          >
            <RotateCcw className="h-4 w-4" aria-hidden />
            Try again
          </button>
        </section>
      </div>
    )
  }

  const missingCount = activation.progress.reduce(
    (sum, entry) => sum + Math.max(0, entry.requiredCount - entry.activatedCount),
    0,
  )

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      className="min-h-[calc(100dvh-3rem)] min-w-0 overflow-x-hidden pb-3"
    >
      <header className="mb-5">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--t-personal-text)] mb-1">Beat activation</p>
        <h1 className="font-display text-2xl font-extrabold text-[var(--t-text)]">Choose your bets</h1>
        <p className="text-sm text-[var(--t-text-muted)] leading-relaxed mt-2">
          Activate exactly 3 beats per character. Only activated beats can score, and hedging opposite outcomes is allowed.
        </p>
      </header>

      <div className="space-y-4">
        {activation.characters.map(({ entity, beats, activatedBeatIds }) => {
          const chosen = activatedBeatIds.size
          return (
            <section key={entity.id} className="relief-glass rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0 pt-1">
                  <h2 className="font-display font-bold text-[var(--t-text)] truncate">{entity.name}</h2>
                  <p className="text-xs text-[var(--t-text-dim)] mt-0.5">House {entity.film_name}</p>
                </div>
                <span className={[
                  'relief-glass inline-flex min-h-11 items-center rounded-xl px-3 font-display text-lg font-bold tabular-nums whitespace-nowrap',
                  chosen === 3 ? 'text-[var(--t-personal-text)]' : 'text-[var(--t-text-muted)]',
                ].join(' ')}>
                  {chosen} of 3
                  <span className="sr-only"> chosen</span>
                </span>
              </div>
              <div className="space-y-2">
                {beats.map((beat, index) => {
                  const selected = activatedBeatIds.has(beat.id)
                  return (
                    <BeatRow
                      key={beat.id}
                      beat={beat}
                      selected={selected}
                      disabled={chosen >= 3 && !selected}
                      onToggle={() => void activation.toggle(beat.id)}
                      index={index}
                    />
                  )
                })}
              </div>
            </section>
          )
        })}

        {activation.dragon && (
          <section className="relief-glass rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h2 className="font-display font-bold text-[var(--t-text)]">{activation.dragon.entity.name}</h2>
                <p className="text-xs text-[var(--t-text-dim)] mt-0.5">Dragon</p>
              </div>
              <span className="inline-flex min-h-11 items-center gap-1 text-xs font-bold uppercase tracking-wide text-positive">
                <LockKeyhole size={14} />
                always live
              </span>
            </div>
            <div className="space-y-2">
              {activation.dragon.beats.map((beat, index) => (
                <BeatRow key={beat.id} beat={beat} selected disabled alwaysLive index={index} />
              ))}
            </div>
          </section>
        )}
      </div>

      <footer className="relief-glass sticky bottom-0 z-20 mt-5 -mx-4 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] rounded-b-none">
        <div className="flex items-center justify-between gap-3 mb-3">
          <span className="text-sm font-semibold text-[var(--t-text)]">Your progress</span>
          <span className={[
            'font-display text-sm font-bold tabular-nums text-right',
            activation.myActivatedCount === activation.myRequiredCount ? 'text-[var(--t-personal-text)]' : 'text-[var(--t-text-muted)]',
          ].join(' ')}>
            {activation.myActivatedCount} of {activation.myRequiredCount} chosen
          </span>
        </div>
        <div className="flex flex-wrap gap-2 pb-3">
          {activation.progress
            .filter((entry) => entry.player.id !== player.id)
            .map((entry) => (
              <div key={entry.player.id} className="relief-glass flex min-w-0 max-w-full items-center gap-2 min-h-11 rounded-xl px-2.5">
                <Avatar avatarId={entry.player.avatar_id} size="sm" />
                <div className="min-w-0">
                  <p className="max-w-28 truncate text-xs text-[var(--t-text-muted)]">{entry.player.name.split(' ')[0]}</p>
                  <p className="text-xs tabular-nums text-[var(--t-text-dim)]">{entry.activatedCount}/{entry.requiredCount}</p>
                </div>
              </div>
            ))}
        </div>

        {activation.actionError && (
          <p className="mb-2 text-xs text-negative" role="status">
            {activation.actionError}
          </p>
        )}
        {player.is_host && !operatorAuthority.enabled && operatorAuthority.message && (
          <p className="mb-2 text-xs text-[var(--t-pending)]" role="status">
            {operatorAuthority.message}
          </p>
        )}
        {player.is_host ? (
          activation.allComplete ? (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => void activation.hostAdvance()}
              disabled={activation.isAdvancing || !operatorAuthority.enabled}
              className="relief-raised w-full min-h-11 rounded-xl border border-[var(--t-personal-device)] bg-[var(--t-personal-field)] text-[var(--t-personal-text)] font-bold"
            >
              {activation.isAdvancing ? 'Starting the show' : 'Start the show'}
            </motion.button>
          ) : confirmAnyway ? (
            <div className="grid grid-cols-[1fr_2fr] gap-2">
              <button onClick={() => setConfirmAnyway(false)} className="relief-glass min-h-11 rounded-xl text-sm text-[var(--t-text-muted)]">
                Go back
              </button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => void activation.hostAdvance()}
                disabled={activation.isAdvancing || !operatorAuthority.enabled}
                className="relief-raised min-h-11 rounded-xl border border-[var(--t-personal-device)] bg-[var(--t-personal-field)] text-sm font-bold text-[var(--t-personal-text)]"
              >
                {activation.isAdvancing ? 'Starting the show' : 'Confirm start anyway'}
              </motion.button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmAnyway(true)}
              className="relief-glass w-full min-h-11 rounded-xl text-sm font-semibold text-pending"
            >
              Start anyway — {missingCount} picks missing
            </button>
          )
        ) : (
          <div className="relief-glass min-h-11 rounded-xl flex items-center justify-center text-sm text-[var(--t-text-dim)]">
            Waiting for the host
          </div>
        )}
      </footer>
    </motion.div>
  )
}
