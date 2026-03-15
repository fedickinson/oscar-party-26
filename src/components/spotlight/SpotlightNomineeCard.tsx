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
import { FilmIcon } from '../../lib/film-icons'
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
      layout
      animate={{
        scale: isWinner ? 1.03 : isLoser ? 0.96 : 1,
        opacity: isLoser ? 0.18 : 1,
        y: isWinner ? -2 : 0,
      }}
      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
    >
      <motion.button
        whileTap={isHost && isNormal ? { scale: 0.97 } : undefined}
        onClick={isHost && isNormal ? onSelect : undefined}
        disabled={!isHost || !isNormal}
        className={[
          'w-full text-left px-3 py-1.5 rounded-lg border flex items-center gap-2 relative overflow-hidden',
          isWinner ? 'border-oscar-gold/60' : 'bg-white/5 border-white/10',
          isHost && isNormal ? 'cursor-pointer' : 'cursor-default',
        ].join(' ')}
        style={isWinner ? {
          background: 'linear-gradient(135deg, rgba(212,175,55,0.18) 0%, rgba(212,175,55,0.06) 100%)',
          boxShadow: '0 0 16px 2px rgba(212,175,55,0.25)',
        } : undefined}
      >
        {/* Winner shimmer sweep */}
        {isWinner && (
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'linear-gradient(105deg, transparent 35%, rgba(212,175,55,0.18) 50%, transparent 65%)',
            }}
            initial={{ x: '-100%' }}
            animate={{ x: '200%' }}
            transition={{ duration: 0.9, delay: 0.15, ease: 'easeOut' }}
          />
        )}
        {/* Name */}
        <div className="flex-1 min-w-0">
          <p className={[
            'text-sm font-semibold leading-tight truncate',
            isWinner ? 'text-oscar-gold' : 'text-white',
          ].join(' ')}>
            {displayName}
          </p>
          {nominee.type === 'person' && nominee.film_name && (
            <div className="flex items-center gap-1 mt-0.5">
              <FilmIcon filmName={nominee.film_name} size={9} className="text-white/25 flex-shrink-0" />
              <p className="text-[11px] text-white/35 truncate">{nominee.film_name}</p>
            </div>
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
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.1 }}
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-oscar-gold text-deep-navy flex-shrink-0"
          >
            <Check size={9} strokeWidth={3} />
            <span className="text-[9px] font-bold">WIN</span>
          </motion.div>
        )}
      </motion.button>
    </motion.div>
  )
}
