/**
 * PreCeremonyView — Home tab content before the first winner is announced.
 *
 * Host sees a "Go to Winners" button to begin announcing.
 * Non-hosts see "Waiting for host to begin."
 * Static Story of the Night between hero card and stats. Chat and Browse below.
 */

import { motion } from 'framer-motion'
import { Grid3X3, Trophy } from 'lucide-react'
import { useGame } from '../../context/GameContext'
import ChatSection from './ChatSection'
import QuickStats from './QuickStats'
import StoryOfTheNight from './StoryOfTheNight'
import type { CategoryRow, ConfidencePickRow, DraftPickRow, DraftEntityRow, NomineeRow } from '../../types/database'
import type { ScoredPlayer } from '../../lib/scoring'

interface Props {
  categories: CategoryRow[]
  nominees: NomineeRow[]
  confidencePicks: ConfidencePickRow[]
  draftPicks: DraftPickRow[]
  draftEntities: DraftEntityRow[]
  leaderboard: ScoredPlayer[]
  onNavigateToWinnersTab: () => void
  onNavigateToBingo: () => void
}

// ─── Pre-ceremony story builder ───────────────────────────────────────────────

function buildPreCeremonyStory(
  players: { id: string; name: string }[],
  draftPicks: DraftPickRow[],
  draftEntities: DraftEntityRow[],
  confidencePicks: ConfidencePickRow[],
  categories: CategoryRow[],
  nominees: NomineeRow[],
): string {
  const sentences: string[] = []

  // ── Who went all-in on a single film? ──────────────────────────────────────
  let allInPlayer = ''
  let allInFilm = ''
  let allInCount = 0

  for (const player of players) {
    const picks = draftPicks.filter((p) => p.player_id === player.id)
    const filmCounts: Record<string, number> = {}
    for (const pick of picks) {
      const entity = draftEntities.find((e) => e.id === pick.entity_id)
      if (entity?.film_name) {
        filmCounts[entity.film_name] = (filmCounts[entity.film_name] ?? 0) + 1
      }
    }
    const top = Object.entries(filmCounts).sort((a, b) => b[1] - a[1])[0]
    if (top && top[1] > allInCount) {
      allInCount = top[1]
      allInFilm = top[0]
      allInPlayer = player.name
    }
  }

  if (allInPlayer && allInCount >= 2) {
    sentences.push(
      `${allInPlayer} went all-in on ${allInFilm}, drafting ${allInCount} entities from the film.`,
    )
  }

  // ── Who made the boldest confidence play (put 24 on something)? ────────────
  const top24 = confidencePicks.find((p) => p.confidence === 24)
  if (top24) {
    const p = players.find((pl) => pl.id === top24.player_id)
    const cat = categories.find((c) => c.id === top24.category_id)
    const nominee = nominees.find((n) => n.id === top24.nominee_id)
    if (p && cat && nominee) {
      sentences.push(
        `${p.name} made the boldest confidence play, putting their 24 on ${nominee.name} in ${cat.name}.`,
      )
    }
  }

  // ── How many players agree on Best Picture? ─────────────────────────────────
  const bestPicCat = categories.find(
    (c) => c.name.toLowerCase().includes('best picture') || c.name.toLowerCase().includes('best film'),
  )
  if (bestPicCat) {
    const bpPicks = confidencePicks.filter((p) => p.category_id === bestPicCat.id)
    const pickCounts: Record<string, number> = {}
    for (const p of bpPicks) {
      pickCounts[p.nominee_id] = (pickCounts[p.nominee_id] ?? 0) + 1
    }
    const entries = Object.entries(pickCounts).sort((a, b) => b[1] - a[1])
    if (entries.length > 0) {
      const [topNomineeId, topCount] = entries[0]
      const topNominee = nominees.find((n) => n.id === topNomineeId)
      if (topNominee && topCount > 1) {
        sentences.push(
          `${topCount} of ${players.length} players agree on ${topNominee.name} for Best Picture.`,
        )
      } else if (players.length > 1 && entries.length === players.length) {
        sentences.push(`Every player picked a different Best Picture — this one's going to sting.`)
      }
    }
  }

  sentences.push('The stage is set.')

  return sentences.join(' ')
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PreCeremonyView({
  categories,
  nominees,
  confidencePicks,
  draftPicks,
  draftEntities,
  leaderboard,
  onNavigateToWinnersTab,
  onNavigateToBingo,
}: Props) {
  const { player, players } = useGame()
  const isHost = player?.is_host ?? false

  const preStory = buildPreCeremonyStory(
    players,
    draftPicks,
    draftEntities,
    confidencePicks,
    categories,
    nominees,
  )

  return (
    <div className="px-4 py-6 pb-24 space-y-4 max-w-md mx-auto">
      {/* Hero card */}
      <div className="bg-white/5 backdrop-blur-lg border border-white/10 rounded-2xl p-5 text-center">
        {/* Pulsing icon */}
        <div className="flex justify-center mb-3">
          <motion.div
            animate={{ scale: [1, 1.12, 1], opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            className="w-14 h-14 rounded-full bg-oscar-gold/15 border border-oscar-gold/30 flex items-center justify-center"
          >
            <Trophy size={24} className="text-oscar-gold" />
          </motion.div>
        </div>

        <h2 className="text-lg font-bold text-white mb-1">The show starts soon</h2>
        <p className="text-sm text-white/50 mb-4">
          Picks are locked. Bingo cards are set. All that's left is the ceremony.
        </p>

        {isHost ? (
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={onNavigateToWinnersTab}
            className="w-full py-3.5 rounded-xl bg-oscar-gold font-semibold text-midnight text-base"
            style={{
              boxShadow: '0 0 24px rgba(212,175,55,0.35)',
            }}
          >
            Start Announcing Winners
          </motion.button>
        ) : (
          <div className="py-3 px-4 bg-white/5 border border-white/10 rounded-xl">
            <p className="text-sm text-white/50">Waiting for host to begin announcing...</p>
          </div>
        )}

        {/* Bingo CTA */}
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={onNavigateToBingo}
          className="w-full mt-3 py-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center gap-2 text-sm font-semibold text-emerald-400"
        >
          <Grid3X3 size={16} />
          View your Bingo card
        </motion.button>
      </div>

      {/* Static story — draft summary and pick highlights */}
      <StoryOfTheNight staticText={preStory} />

      {/* Pre-ceremony quick stats */}
      <div>
        <p className="text-xs uppercase tracking-wider text-white/35 mb-2 px-1">Pre-show stats</p>
        <QuickStats
          isPreCeremony
          categories={categories}
          nominees={nominees}
          confidencePicks={confidencePicks}
          draftPicks={draftPicks}
          draftEntities={draftEntities}
          leaderboard={leaderboard}
        />
      </div>

      {/* Chat */}
      <div>
        <p className="text-xs uppercase tracking-wider text-white/35 mb-2 px-1">Chat</p>
        <ChatSection />
      </div>

    </div>
  )
}
