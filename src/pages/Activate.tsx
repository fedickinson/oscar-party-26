import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Check, Loader2, LockKeyhole } from 'lucide-react'
import { motion } from 'framer-motion'
import Avatar from '../components/Avatar'
import { useGame } from '../context/GameContext'
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
        'w-full min-h-11 rounded-xl border px-3 py-2.5 text-left transition-colors',
        selected ? 'bg-accent/10 border-accent/60' : 'bg-white/5 border-white/10',
        disabled && !selected ? 'cursor-not-allowed' : '',
      ].join(' ')}
    >
      <div className="flex items-start gap-3">
        <div className={[
          'mt-0.5 w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0',
          selected ? 'bg-accent border-accent text-ground' : 'border-white/20 text-transparent',
        ].join(' ')}>
          <Check size={14} strokeWidth={3} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-white/90">{beat.name}</p>
            <span className="text-sm font-bold text-accent whitespace-nowrap">{beat.points} pts</span>
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] uppercase tracking-wide text-white/40">{oddsLabel(beat.odds)}</span>
            {alwaysLive && <span className="text-[10px] font-semibold uppercase tracking-wide text-accent">always live</span>}
          </div>
          <p className="text-xs text-white/45 leading-relaxed mt-1">{beat.trigger_text}</p>
          {beat.pitch && <p className="text-xs text-white/30 leading-relaxed mt-1">{beat.pitch}</p>}
        </div>
      </div>
    </motion.button>
  )
}

export default function Activate() {
  const { code } = useParams<{ code: string }>()
  const navigate = useNavigate()
  const { room, player, loading } = useGame()
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
        <Loader2 className="w-7 h-7 text-accent animate-spin" />
      </div>
    )
  }
  if (!room || !player) return null

  const missingCount = activation.progress.reduce(
    (sum, entry) => sum + Math.max(0, entry.requiredCount - entry.activatedCount),
    0,
  )

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      className="min-h-[calc(100dvh-3rem)] pb-3"
    >
      <header className="mb-5">
        <p className="text-xs uppercase tracking-[0.2em] text-accent mb-1">Beat activation</p>
        <h1 className="text-2xl font-extrabold text-white">Choose your bets</h1>
        <p className="text-sm text-white/55 leading-relaxed mt-2">
          Activate exactly 3 beats per character. Only activated beats can score, and hedging opposite outcomes is allowed.
        </p>
      </header>

      <div className="space-y-4">
        {activation.characters.map(({ entity, beats, activatedBeatIds }) => {
          const chosen = activatedBeatIds.size
          return (
            <section key={entity.id} className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <h2 className="font-bold text-white truncate">{entity.name}</h2>
                  <p className="text-xs text-white/40 mt-0.5">House {entity.film_name}</p>
                </div>
                <span className={[
                  'text-xs font-bold tabular-nums whitespace-nowrap',
                  chosen === 3 ? 'text-accent' : 'text-white/50',
                ].join(' ')}>
                  {chosen} of 3 chosen
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
          <section className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h2 className="font-bold text-white">{activation.dragon.entity.name}</h2>
                <p className="text-xs text-white/40 mt-0.5">Dragon</p>
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-accent">
                <LockKeyhole size={12} />
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

      <footer className="sticky bottom-0 z-20 mt-5 -mx-4 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)] bg-ground-deep/95 backdrop-blur-xl border-t border-white/10">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-white">Your progress</span>
          <span className={[
            'text-sm font-bold tabular-nums',
            activation.myActivatedCount === activation.myRequiredCount ? 'text-accent' : 'text-white/60',
          ].join(' ')}>
            {activation.myActivatedCount} of {activation.myRequiredCount} chosen
          </span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-3">
          {activation.progress
            .filter((entry) => entry.player.id !== player.id)
            .map((entry) => (
              <div key={entry.player.id} className="flex items-center gap-2 flex-shrink-0 min-h-11 rounded-xl bg-white/5 border border-white/10 px-2.5">
                <Avatar avatarId={entry.player.avatar_id} size="sm" />
                <div>
                  <p className="text-xs text-white/65">{entry.player.name.split(' ')[0]}</p>
                  <p className="text-[10px] tabular-nums text-white/40">{entry.activatedCount}/{entry.requiredCount}</p>
                </div>
              </div>
            ))}
        </div>

        {activation.error && <p className="text-xs text-red-400 mb-2">{activation.error}</p>}
        {player.is_host ? (
          activation.allComplete ? (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => void activation.hostAdvance()}
              className="w-full min-h-11 rounded-xl bg-accent text-ground font-bold"
            >
              Start the show
            </motion.button>
          ) : confirmAnyway ? (
            <div className="grid grid-cols-[1fr_2fr] gap-2">
              <button onClick={() => setConfirmAnyway(false)} className="min-h-11 rounded-xl bg-white/5 border border-white/10 text-sm text-white/60">
                Go back
              </button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => void activation.hostAdvance()}
                className="min-h-11 rounded-xl bg-accent/15 border border-accent/40 text-sm font-bold text-accent"
              >
                Confirm start anyway
              </motion.button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmAnyway(true)}
              className="w-full min-h-11 rounded-xl bg-white/5 border border-white/15 text-sm font-semibold text-white/65"
            >
              Start anyway — {missingCount} picks missing
            </button>
          )
        ) : (
          <div className="min-h-11 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-sm text-white/45">
            Waiting for the host
          </div>
        )}
      </footer>
    </motion.div>
  )
}
