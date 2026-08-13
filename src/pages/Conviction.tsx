import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Check, Loader2, RotateCcw } from 'lucide-react'
import { motion } from 'framer-motion'
import Avatar from '../components/Avatar'
import { useGame } from '../context/GameContext'
import { useOperatorAuthority } from '../context/OperatorAuthorityContext'
import { useConvictionPortfolio } from '../hooks/useConvictionPortfolio'
import { CONVICTION_BUDGET } from '../lib/conviction'
import type { SignatureBeatRow } from '../types/database'

function BeatChoice({
  beat,
  selected,
  believerCount,
  disabled,
  onToggle,
}: {
  beat: SignatureBeatRow
  selected: boolean
  believerCount: number
  disabled: boolean
  onToggle: () => void
}) {
  const resultingCrowd = selected ? believerCount : believerCount + 1
  const payout = Math.floor(beat.points / Math.max(1, resultingCrowd))
  return (
    <motion.button
      type="button"
      whileTap={disabled ? undefined : { scale: 0.97 }}
      disabled={disabled}
      onClick={onToggle}
      className={[
        'relief-glass min-h-11 w-full rounded-xl border px-3 py-3 text-left',
        selected ? 'border-[var(--t-personal-device)]' : 'border-[var(--t-line)]',
        disabled ? 'opacity-40' : '',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        <span className={[
          'mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border',
          selected
            ? 'border-[var(--t-personal-device)] bg-[var(--t-personal-device)] text-[var(--t-vellum-light)]'
            : 'border-[var(--t-line)] text-transparent',
        ].join(' ')}>
          <Check size={14} strokeWidth={3} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-3">
            <span className="text-sm font-semibold leading-snug text-[var(--t-text)]">{beat.name}</span>
            <span className="whitespace-nowrap font-display text-sm font-bold text-[var(--t-personal-text)]">
              {payout} pts
            </span>
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-[var(--t-text-muted)]">{beat.trigger_text}</span>
          <span className="mt-1 block text-xs text-[var(--t-text-dim)]">
            {resultingCrowd === 1 ? 'Yours alone: full pot' : `${resultingCrowd} believers split ${beat.points}`}
          </span>
        </span>
      </div>
    </motion.button>
  )
}

export default function Conviction() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { room, player, loading } = useGame()
  const { authority: operatorAuthority } = useOperatorAuthority()
  const portfolio = useConvictionPortfolio(room?.id)
  const [confirmAnyway, setConfirmAnyway] = useState(false)

  useEffect(() => {
    if (!room || !code) return
    if (room.phase === 'live') navigate(`/room/${code}/live`)
    if (room.phase === 'lobby') navigate(`/room/${code}`)
  }, [room?.phase, code, navigate])

  useEffect(() => {
    if (!loading && !player) navigate('/')
  }, [loading, player, navigate])

  const sections = useMemo(() => {
    const entityById = new Map(portfolio.entities.map((entity) => [entity.id, entity]))
    const ordinary = new Map<string, { name: string; beats: SignatureBeatRow[] }>()
    const collisions: SignatureBeatRow[] = []
    for (const beat of portfolio.beats) {
      if (beat.partner_entity_id != null) {
        collisions.push(beat)
        continue
      }
      const entity = entityById.get(beat.entity_id)
      const key = entity?.id ?? beat.entity_id
      const current = ordinary.get(key) ?? { name: entity?.name ?? 'Unknown', beats: [] }
      current.beats.push(beat)
      ordinary.set(key, current)
    }
    return {
      ordinary: [...ordinary.entries()].map(([id, value]) => ({ id, ...value })),
      collisions,
    }
  }, [portfolio.entities, portfolio.beats])

  if (loading || portfolio.isLoading) {
    return <div className="flex min-h-[80vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-[var(--t-personal-text)]" /></div>
  }
  if (!room || !player) return null

  if (portfolio.syncError) {
    return (
      <section className="material-stone relief-inset mt-6 rounded-2xl p-4" role="alert">
        <p className="font-display text-xs uppercase tracking-widest text-[var(--t-pending)]">Conviction ledger unavailable</p>
        <p className="mt-2 text-sm text-[var(--t-text-muted)]">{portfolio.syncError} Choices and show start remain disabled.</p>
        <button type="button" onClick={portfolio.retrySync} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--t-line)]">
          <RotateCcw className="h-4 w-4" /> Try again
        </button>
      </section>
    )
  }

  const full = portfolio.myChosenCount === CONVICTION_BUDGET
  const missingCount = portfolio.progress.reduce((sum, entry) => sum + Math.max(0, entry.required - entry.chosen), 0)

  return (
    <div className="min-h-[calc(100dvh-3rem)] min-w-0 overflow-x-hidden pb-[calc(var(--t-conviction-footer-height)+env(safe-area-inset-bottom,0rem))]">
      <header className="mb-5">
        <p className="mb-1 text-xs uppercase tracking-[0.2em] text-[var(--t-personal-text)]">Conviction portfolio</p>
        <h1 className="font-display text-2xl font-extrabold text-[var(--t-text)]">What do you believe?</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--t-text-muted)]">
          Choose exactly {CONVICTION_BUDGET} beats from the whole board. A hit pays its full pot when you stand alone; every believer makes the split smaller.
        </p>
      </header>

      <div className="space-y-4">
        {sections.ordinary.map((section) => (
          <section key={section.id} className="relief-glass rounded-2xl p-4">
            <h2 className="mb-3 font-display font-bold text-[var(--t-text)]">{section.name}</h2>
            <div className="space-y-2">
              {section.beats.map((beat) => {
                const selected = portfolio.myBeatIds.has(beat.id)
                return <BeatChoice key={beat.id} beat={beat} selected={selected} believerCount={portfolio.believerCountByBeat.get(beat.id) ?? 0} disabled={full && !selected} onToggle={() => void portfolio.toggle(beat.id)} />
              })}
            </div>
          </section>
        ))}

        {sections.collisions.length > 0 && (
          <section className="relief-glass rounded-2xl p-4">
            <h2 className="mb-1 font-display font-bold text-[var(--t-text)]">Collisions</h2>
            <p className="mb-3 text-xs text-[var(--t-text-dim)]">Shared moments between two forces.</p>
            <div className="space-y-2">
              {sections.collisions.map((beat) => {
                const selected = portfolio.myBeatIds.has(beat.id)
                return <BeatChoice key={beat.id} beat={beat} selected={selected} believerCount={portfolio.believerCountByBeat.get(beat.id) ?? 0} disabled={full && !selected} onToggle={() => void portfolio.toggle(beat.id)} />
              })}
            </div>
          </section>
        )}
      </div>

      <footer className="relief-glass fixed bottom-0 left-0 right-0 z-20 mx-auto min-h-[var(--t-conviction-footer-height)] max-w-md rounded-b-none px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0rem)+12px)]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-[var(--t-text)]">Your portfolio</span>
          <span className={['font-display text-sm font-bold tabular-nums', full ? 'text-[var(--t-personal-text)]' : 'text-[var(--t-text-muted)]'].join(' ')}>{portfolio.myChosenCount} of {CONVICTION_BUDGET}</span>
        </div>
        <div className="mb-3 flex flex-nowrap gap-2 overflow-x-auto">
          {portfolio.progress.filter((entry) => entry.player.id !== player.id).map((entry) => (
            <div key={entry.player.id} className="relief-glass flex min-h-11 flex-shrink-0 items-center gap-2 rounded-xl px-2.5">
              <Avatar avatarId={entry.player.avatar_id} size="sm" />
              <span className="text-xs text-[var(--t-text-muted)]">{entry.player.name.split(' ')[0]} {entry.chosen}/{entry.required}</span>
            </div>
          ))}
        </div>
        {portfolio.actionError && <p className="mb-2 text-xs text-[var(--t-negative)]" role="status">{portfolio.actionError}</p>}
        {player.is_host && !operatorAuthority.enabled && operatorAuthority.message && (
          <p className="mb-2 text-xs text-[var(--t-pending)]" role="status">{operatorAuthority.message}</p>
        )}
        {player.is_host ? (
          portfolio.allComplete ? (
            <button type="button" onClick={() => void portfolio.hostAdvance()} disabled={portfolio.isAdvancing || !operatorAuthority.enabled} className="relief-raised min-h-11 w-full rounded-xl border border-[var(--t-personal-device)] bg-[var(--t-personal-field)] font-bold text-[var(--t-personal-text)]">
              {portfolio.isAdvancing ? 'Starting the show' : 'Start the show'}
            </button>
          ) : confirmAnyway ? (
            <div className="grid grid-cols-[1fr_2fr] gap-2">
              <button type="button" onClick={() => setConfirmAnyway(false)} className="relief-glass min-h-11 rounded-xl text-sm text-[var(--t-text-muted)]">Go back</button>
              <button type="button" onClick={() => void portfolio.hostAdvance()} disabled={portfolio.isAdvancing || !operatorAuthority.enabled} className="relief-raised min-h-11 rounded-xl border border-[var(--t-personal-device)] bg-[var(--t-personal-field)] text-sm font-bold text-[var(--t-personal-text)]">
                {portfolio.isAdvancing ? 'Starting the show' : 'Confirm start anyway'}
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmAnyway(true)} className="relief-glass min-h-11 w-full rounded-xl text-sm font-semibold text-[var(--t-pending)]">Start anyway — {missingCount} beliefs missing</button>
          )
        ) : <div className="relief-glass flex min-h-11 items-center justify-center rounded-xl text-sm text-[var(--t-text-dim)]">Waiting for the host</div>}
      </footer>
    </div>
  )
}
