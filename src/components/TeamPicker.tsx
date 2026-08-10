/**
 * TeamPicker — declare for Team Black or Team Green, and defect whenever.
 *
 * Self-contained on purpose: reads the current player from GameContext and
 * writes players.team directly, so it can be dropped into any page (pre-show
 * Home, My Picks) as a one-line mount with zero prop threading.
 *
 * Changing teams IS the feature. There is deliberately no confirm step and no
 * lock: a mid-episode defection is the most on-theme move a player can make,
 * and the host client turns the row UPDATE into a chat ceremony (system
 * divider + a companion passing judgement — see useAICompanions Effect 1d).
 * The write is the announcement; this component stays dumb.
 */

import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'
import { useGame } from '../context/GameContext'

const TEAMS = [
  {
    id: 'black' as const,
    label: 'Team Black',
    claimant: 'Rhaenyra',
    // Jet field, madder device — the Black shield (design-system tokens)
    active: 'text-[color:var(--t-team-a-text)] bg-[color:var(--t-team-a-field)] border-[color:var(--t-team-a-device)]',
    idle: 'bg-white/5 border-white/10 text-white/55',
    dot: 'bg-[color:var(--t-team-a-device)]',
  },
  {
    id: 'green' as const,
    label: 'Team Green',
    claimant: 'Aegon',
    // Bottle field, beacon device — the Green shield
    active: 'text-[color:var(--t-team-b-text)] bg-[color:var(--t-team-b-field)] border-[color:var(--t-team-b-device)]',
    idle: 'bg-white/5 border-white/10 text-white/55',
    dot: 'bg-[color:var(--t-team-b-device)]',
  },
]

export default function TeamPicker({ compact = false }: { compact?: boolean }) {
  const { player, players, setPlayers } = useGame()
  if (!player) return null

  const current = players.find((p) => p.id === player.id)?.team ?? null

  async function declare(team: 'black' | 'green') {
    if (!player || team === current) return
    // Optimistic local flip — Realtime echoes to everyone else (and back).
    setPlayers((prev) => prev.map((p) => (p.id === player.id ? { ...p, team } : p)))
    await supabase.from('players').update({ team }).eq('id', player.id)
  }

  return (
    <div
      className={
        compact
          ? 'flex items-center gap-2'
          : 'backdrop-blur-lg bg-white/5 border border-white/10 rounded-2xl p-4'
      }
    >
      {!compact && (
        <p className="text-xs text-white/50 mb-2.5">
          {current
            ? 'Your allegiance. Defecting mid-episode is allowed — and noticed.'
            : 'Who has the right to the throne? The room will hear about it.'}
        </p>
      )}
      <div className={compact ? 'flex gap-1.5 flex-1' : 'flex gap-2'}>
        {TEAMS.map((t) => {
          const active = current === t.id
          return (
            <motion.button
              key={t.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => void declare(t.id)}
              className={`flex-1 rounded-xl border transition-colors min-h-[44px]
                ${compact ? 'px-2 py-2' : 'px-3 py-2.5'}
                ${active ? t.active : t.idle}`}
            >
              <span className="flex items-center justify-center gap-1.5">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${active ? t.dot : 'bg-white/20'}`} />
                <span className={`font-semibold ${compact ? 'text-xs' : 'text-sm'}`}>{t.label}</span>
              </span>
              {!compact && (
                <span className="block text-[10px] mt-0.5 opacity-60">{t.claimant}'s claim</span>
              )}
            </motion.button>
          )
        })}
      </div>
    </div>
  )
}
