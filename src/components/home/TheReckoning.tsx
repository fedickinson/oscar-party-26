/**
 * TheReckoning — the part of the results page that belongs to everyone.
 *
 * The standings above this reward one person. This section gives every player a
 * card of their own: the title they earned, the stat behind it, and a short
 * passage written about them by one of the companions.
 *
 * TWO LAYERS, DELIBERATELY SEPARATE
 * Title and stat are computed locally and always render. The verdict passage
 * comes from Claude and may never arrive — a failed call, a slow network, a
 * player who opened the public link before the host generated anything. The card
 * is designed to look finished without it rather than to show a gap where it
 * should be, so nothing here is laid out around text that might not exist.
 */

import { motion } from 'framer-motion'
import { Crown, Quote, Share2, Skull, TrendingUp } from 'lucide-react'
import Avatar from '../Avatar'
import CompanionAvatar from '../ui/CompanionAvatar'
import { getCompanionById } from '../../data/ai-companions'
import type { PlayerAward, CharacterAward } from '../../lib/night-awards'
import type { PlayerVerdictRow } from '../../types/database'
import type { PlayerRow } from '../../types/database'

interface Props {
  playerAwards: PlayerAward[]
  characterAwards: CharacterAward[]
  verdicts: Map<string, PlayerVerdictRow>
  players: PlayerRow[]
  /** Highlights the reader's own card when known. Absent on the public view. */
  currentPlayerId?: string
  /** Absent on the public view, which has no card of its own to share. */
  onSharePlayerCard?: (playerId: string) => void
}

const CHARACTER_AWARD_ICONS = {
  character_of_the_night: Crown,
  the_bust: Skull,
  best_value: TrendingUp,
} as const

const CHARACTER_AWARD_COLORS = {
  character_of_the_night: 'text-accent',
  the_bust: 'text-white/40',
  best_value: 'text-emerald-400',
} as const

export default function TheReckoning({
  playerAwards,
  characterAwards,
  verdicts,
  players,
  currentPlayerId,
  onSharePlayerCard,
}: Props) {
  if (playerAwards.length === 0) return null

  const avatarFor = (playerId: string) =>
    players.find((p) => p.id === playerId)?.avatar_id ?? ''

  return (
    <div className="mb-8">
      <p className="text-[10px] text-white/35 uppercase tracking-[0.18em] mb-3 font-medium">
        The Reckoning
      </p>

      {/* ── Player cards ──────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {playerAwards.map((award, i) => {
          const verdict = verdicts.get(award.playerId)
          const companion = verdict ? getCompanionById(verdict.companion_id) : null
          const isMe = currentPlayerId === award.playerId

          return (
            <motion.div
              key={award.playerId}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.05 * i }}
              className={`bg-white/5 backdrop-blur-lg border rounded-2xl p-4 ${
                isMe ? 'border-accent/40' : 'border-white/10'
              }`}
            >
              <div className="flex items-start gap-3">
                <Avatar avatarId={avatarFor(award.playerId)} size="sm" emotion="neutral" />

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white truncate">
                      {award.playerName}
                    </span>
                    {isMe && (
                      <span className="text-[10px] text-accent/70 uppercase tracking-wider font-medium">
                        You
                      </span>
                    )}
                  </div>

                  <p className="text-base font-extrabold text-accent leading-tight mt-0.5">
                    {award.title}
                  </p>

                  <p className="text-[13px] text-white/55 leading-relaxed mt-1">
                    {award.blurb}
                  </p>

                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span
                      className="px-2 py-1 rounded-full bg-white/5
                                 border border-white/10 text-[11px] text-white/60 tabular-nums"
                    >
                      {award.stat}
                    </span>

                    {/* Only your own card is shareable. Posting somebody else's
                        verdict about them is theirs to do, not yours. */}
                    {isMe && onSharePlayerCard && (
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={() => onSharePlayerCard(award.playerId)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full
                                   bg-accent/10 border border-accent/30 text-[11px]
                                   font-medium text-accent min-h-[32px]"
                      >
                        <Share2 className="w-3 h-3" />
                        Share my card
                      </motion.button>
                    )}
                  </div>
                </div>
              </div>

              {/* The written passage. Absent by design when generation failed —
                  the card above is already complete without it. */}
              {verdict && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4 }}
                  className="mt-3 pt-3 border-t border-white/10"
                >
                  <div className="flex gap-2.5">
                    <Quote className="w-3.5 h-3.5 text-white/20 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-[13px] text-white/75 leading-relaxed italic">
                        {verdict.verdict}
                      </p>
                      <div className="flex items-center gap-1.5 mt-2">
                        <CompanionAvatar companionId={verdict.companion_id} size="sm" />
                        <span className="text-[11px] text-white/40">
                          {companion?.name ?? verdict.companion_id}
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )
        })}
      </div>

      {/* ── Character awards ──────────────────────────────────────────────── */}
      {characterAwards.length > 0 && (
        <div className="mt-6">
          <p className="text-[10px] text-white/35 uppercase tracking-[0.18em] mb-3 font-medium">
            The Roll of Honour
          </p>
          <div className="space-y-2">
            {characterAwards.map((award, i) => {
              const Icon = CHARACTER_AWARD_ICONS[award.kind]
              const color = CHARACTER_AWARD_COLORS[award.kind]
              return (
                <motion.div
                  key={award.kind}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.05 * i }}
                  className="bg-white/5 backdrop-blur-lg border border-white/10
                             rounded-2xl p-3 flex items-center gap-3"
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${color}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] text-white/35 uppercase tracking-wider font-medium">
                      {award.label}
                    </p>
                    <p className="text-sm font-semibold text-white truncate">
                      {award.entityName}
                    </p>
                    <p className="text-[11px] text-white/45 mt-0.5">{award.detail}</p>
                  </div>
                  {award.ownerName && (
                    <span className="flex-shrink-0 text-[11px] text-white/40 text-right">
                      {award.ownerName}
                    </span>
                  )}
                </motion.div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
