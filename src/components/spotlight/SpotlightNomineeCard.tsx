/**
 * SpotlightNomineeCard — shows each nominee and the current player's stake.
 *
 * Right side badges (current player only):
 *   Prestige · [n]  — they confidence-picked this nominee (n = their value)
 *   Ensemble        — they drafted this entity
 *
 * States: normal (tappable by host) | winner (gold) | loser (faded)
 */

import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import type { NomineeRow } from '../../types/database'

export interface PlayerPickInfo {
  playerName: string
  avatarId: string
  confidence: number
  nomineeName: string
}

export interface DraftedByInfo {
  playerName: string
  avatarId: string
}

interface Props {
  nominee: NomineeRow
  myConfidence: number | null   // current player's confidence pick on this nominee
  myDraftPick: boolean          // current player drafted this entity
  isHost: boolean
  onSelect: () => void
  state: 'normal' | 'winner' | 'loser'
}

export default function SpotlightNomineeCard({
  nominee,
  myConfidence,
  myDraftPick,
  isHost,
  onSelect,
  state,
}: Props) {
  const isNormal = state === 'normal'
  const isWinner = state === 'winner'
  const isLoser = state === 'loser'

  const displayName =
    nominee.type === 'film' ? nominee.film_name || nominee.name : nominee.name

  return (
    <motion.div
      animate={{
        scale: isWinner ? 1.02 : isLoser ? 0.97 : 1,
        opacity: isLoser ? 0.2 : 1,
      }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
    >
      <motion.button
        whileTap={isHost && isNormal ? { scale: 0.97 } : undefined}
        onClick={isHost && isNormal ? onSelect : undefined}
        disabled={!isHost || !isNormal}
        className={[
          'w-full text-left px-3 py-1.5 rounded-lg border flex items-center gap-2',
          isWinner ? 'bg-oscar-gold/10 border-oscar-gold/50' : 'bg-white/5 border-white/10',
          isHost && isNormal ? 'cursor-pointer' : 'cursor-default',
        ].join(' ')}
      >
        {/* Name */}
        <div className="flex-1 min-w-0">
          <p className={[
            'text-sm font-semibold leading-tight truncate',
            isWinner ? 'text-oscar-gold' : 'text-white',
          ].join(' ')}>
            {displayName}
          </p>
          {nominee.type === 'person' && nominee.film_name && (
            <p className="text-[11px] text-white/35 truncate">{nominee.film_name}</p>
          )}
        </div>

        {/* Current player's stake badges */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {myConfidence != null && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-oscar-gold/15 border border-oscar-gold/30 text-oscar-gold whitespace-nowrap">
              Prestige · {myConfidence}
            </span>
          )}
          {myDraftPick && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-500/15 border border-violet-400/30 text-violet-300 whitespace-nowrap">
              Ensemble
            </span>
          )}
        </div>

        {/* WIN badge */}
        {isWinner && (
          <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-oscar-gold text-deep-navy flex-shrink-0">
            <Check size={9} strokeWidth={3} />
            <span className="text-[9px] font-bold">WIN</span>
          </div>
        )}
      </motion.button>
    </motion.div>
  )
}
