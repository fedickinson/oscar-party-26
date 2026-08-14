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
import { Link } from 'react-router-dom'
import { ArrowUpRight, Check, Crown, Quote, Share2, Skull, TrendingUp } from 'lucide-react'
import Avatar from '../Avatar'
import CompanionAvatar from '../ui/CompanionAvatar'
import { getCompanionById } from '../../data/ai-companions'
import type { PlayerAward, CharacterAward } from '../../lib/night-awards'
import type { PlayerVerdictRow } from '../../types/database'
import type { PlayerRow } from '../../types/database'
import type { RuntimeNarrativeVoice } from '../../lib/runtime-narrative'

interface Props {
  playerAwards: PlayerAward[]
  characterAwards: CharacterAward[]
  verdicts: Map<string, PlayerVerdictRow>
  players: PlayerRow[]
  /** Highlights the reader's own card when known. Absent on the public view. */
  currentPlayerId?: string
  /** Absent on the public view, which has no card of its own to share. */
  onSharePlayerCard?: (playerId: string) => void
  /** True for ~2s after a capture completes. Drives the confirmation state. */
  isCopied?: boolean
  /** Room code. Present only where the per-player keepsake is linkable. */
  roomCode?: string
  runtimeVoices?: RuntimeNarrativeVoice[]
}

const CHARACTER_AWARD_ICONS = {
  character_of_the_night: Crown,
  the_bust: Skull,
  best_value: TrendingUp,
} as const

const CHARACTER_AWARD_COLORS = {
  character_of_the_night: 'text-[var(--t-personal-text)]',
  the_bust: 'text-[var(--t-negative)]',
  best_value: 'text-[var(--t-positive)]',
} as const

const HOUSE_DEVICE_IDS = [
  'targaryen',
  'hightower',
  'stark',
  'lannister',
  'velaryon',
  'baratheon',
  'blackwood',
] as const

function houseDeviceId(avatarId: string): string | null {
  const normalized = avatarId.trim().toLowerCase().replace(/_/g, '-')
  const house = HOUSE_DEVICE_IDS.find((candidate) =>
    normalized === candidate
    || normalized.endsWith(`-${candidate}`)
    || normalized.includes(candidate),
  )
  return house ? `hallmark-device-${house}` : null
}

export default function TheReckoning({
  playerAwards,
  characterAwards,
  verdicts,
  players,
  currentPlayerId,
  onSharePlayerCard,
  isCopied,
  roomCode,
  runtimeVoices = [],
}: Props) {
  if (playerAwards.length === 0) return null

  const avatarFor = (playerId: string) =>
    players.find((p) => p.id === playerId)?.avatar_id ?? ''

  return (
    <div className="mb-8">
      <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-[var(--t-text-dim)]">
        The Reckoning
      </p>

      {/* ── Player cards ──────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {playerAwards.map((award, i) => {
          const verdict = verdicts.get(award.playerId)
          const companion = verdict ? getCompanionById(verdict.companion_id) : null
          const runtimeVoice = verdict
            ? runtimeVoices.find((voice) => voice.id === verdict.companion_id)
            : undefined
          const isMe = currentPlayerId === award.playerId
          const deviceId = houseDeviceId(avatarFor(award.playerId))

          return (
            <motion.div
              key={award.playerId}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.05 * i }}
              className={`material-vellum deckled relief-raised rounded-2xl border p-4 text-[var(--t-ink)] ${
                isMe ? 'border-[var(--t-personal-device)]' : 'border-[var(--t-vellum-deep)]'
              }`}
            >
              <div className="flex items-start gap-3">
                <Avatar avatarId={avatarFor(award.playerId)} size="sm" emotion="neutral" />

                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="truncate text-sm font-semibold text-[var(--t-ink)]">
                      {award.playerName}
                    </span>
                    {isMe && (
                      <span className="text-xs font-medium uppercase tracking-wider text-[var(--t-personal-device)]">
                        You
                      </span>
                    )}
                  </div>

                  <p className="mt-0.5 font-display text-base font-extrabold leading-tight text-[var(--t-personal-device)]">
                    {award.title}
                  </p>

                  <p className="mt-1 text-sm leading-relaxed text-[var(--t-ink-muted)]">
                    {award.blurb}
                  </p>

                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <span
                      className="rounded-full border border-[var(--t-ink-muted)] bg-[var(--t-vellum-deep)] px-2 py-1 text-xs text-[var(--t-ink)] tabular-nums"
                    >
                      {award.stat}
                    </span>

                    {/* Only your own card is shareable. Posting somebody else's
                        verdict about them is theirs to do, not yours. */}
                    {/* Everyone's page is linkable — reading what a companion
                        wrote about someone else is half the fun at the table. */}
                    {roomCode && (
                      <Link
                        to={`/recap/${roomCode}/${award.playerId}`}
                        className="flex min-h-11 items-center gap-1 rounded-full border border-[var(--t-ink-muted)] bg-[var(--t-vellum-deep)] px-3 py-1.5 text-xs font-medium text-[var(--t-ink)]"
                      >
                        {isMe ? 'My full page' : `${award.playerName}'s page`}
                        <ArrowUpRight className="w-3 h-3" />
                      </Link>
                    )}

                    {isMe && onSharePlayerCard && (
                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        onClick={() => onSharePlayerCard(award.playerId)}
                        className="flex min-h-11 items-center gap-1.5 rounded-full border border-[var(--t-personal-device)] bg-[var(--t-vellum-deep)] px-3 py-1.5 text-xs font-medium text-[var(--t-personal-device)]"
                      >
                        {/* Capturing the card takes a beat and, on desktop, ends
                            in a silent file download with nothing on screen to
                            show for it. Without this the button looked broken. */}
                        {isCopied ? (
                          <>
                            <Check className="w-3 h-3" />
                            Card saved
                          </>
                        ) : (
                          <>
                            <Share2 className="w-3 h-3" />
                            Share my card
                          </>
                        )}
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
                  className="relative mt-3 border-t border-[var(--t-vellum-deep)] pt-3"
                >
                  <div className="flex gap-2.5">
                    <Quote className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[var(--t-ink-muted)]" />
                    <div className="min-w-0">
                      <p className="font-manuscript text-base font-semibold italic leading-relaxed text-[var(--t-ink)]">
                        {verdict.verdict}
                      </p>
                      <div className="flex items-center gap-1.5 mt-2">
                        <CompanionAvatar
                          companionId={verdict.companion_id}
                          size="sm"
                          voice={runtimeVoice}
                        />
                        <span className="text-xs text-[var(--t-ink-muted)]">
                          {runtimeVoice?.name ?? companion?.name ?? verdict.companion_id}
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {deviceId && (
                <span
                  className="wax-seal relief-seal mt-4"
                  aria-label={`${award.playerName}'s house seal`}
                >
                  <svg aria-hidden="true" viewBox="0 0 100 100">
                    <use href={`#${deviceId}`} />
                  </svg>
                </span>
              )}
            </motion.div>
          )
        })}
      </div>

      {/* ── Character awards ──────────────────────────────────────────────── */}
      {characterAwards.length > 0 && (
        <div className="mt-6">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-[var(--t-text-dim)]">
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
                  className="relief-glass flex items-center gap-3 rounded-2xl p-3"
                >
                  <Icon className={`w-4 h-4 flex-shrink-0 ${color}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium uppercase tracking-wider text-[var(--t-text-dim)]">
                      {award.label}
                    </p>
                    <p className="truncate text-sm font-semibold text-[var(--t-text)]">
                      {award.entityName}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--t-text-muted)]">{award.detail}</p>
                  </div>
                  {award.ownerName && (
                    <span className="flex-shrink-0 text-right text-xs text-[var(--t-text-dim)]">
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
