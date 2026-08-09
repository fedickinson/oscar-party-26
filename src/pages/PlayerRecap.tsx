/**
 * PlayerRecap — one person's night, at /recap/:code/:playerId.
 *
 * THE ARTIFACT
 * This is the thing a player keeps. Their title and the verdict written about
 * them, their roster and what each character actually did, the calls that made
 * and cost them the game, their bingo board as it finished, and the lines from
 * the chat that were about them.
 *
 * WHY AN IFRAME
 * The page renders the same HTML string that the download button writes to
 * disk, inside a srcDoc iframe. It looks like an odd choice for a React app and
 * it is load-bearing: the promise of the artifact is that the file you keep is
 * the page you shared. Rendering the page as JSX and the file from a separate
 * generator would mean two implementations of the same design, drifting apart
 * the first time either was touched.
 *
 * srcDoc also sandboxes the chat text. The generator escapes everything (see
 * esc() there), and the iframe means even a miss cannot reach this app's DOM,
 * cookies, or Supabase session.
 */

import { useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { Download, ArrowLeft, Check } from 'lucide-react'
import { motion } from 'framer-motion'
import { useRoomSnapshot } from '../hooks/useRoomSnapshot'
import { computeLeaderboard } from '../lib/scoring'
import { computePlayerBingoScores } from '../lib/bingo-utils'
import { computeNightAwards } from '../lib/night-awards'
import { computeScoreTimeline } from '../lib/timeline-utils'
import { buildPlayerRecap } from '../lib/player-recap'
import { renderPlayerRecapHtml, playerRecapFileName } from '../lib/player-recap-html'
import { recapUrlFor } from '../hooks/useShareResults'
import { AVATAR_CONFIGS } from '../data/avatars'
import { useState } from 'react'

export default function PlayerRecap() {
  const { code, playerId } = useParams<{ code: string; playerId: string }>()
  const { snapshot, notFound } = useRoomSnapshot(code)
  const [saved, setSaved] = useState(false)

  const html = useMemo(() => {
    if (!snapshot || !playerId) return null
    const player = snapshot.players.find((p) => p.id === playerId)
    if (!player) return null

    const { scores } = computePlayerBingoScores(
      snapshot.players,
      snapshot.bingoCards,
      snapshot.bingoMarks,
      snapshot.bingoSquaresById,
    )
    const leaderboard = computeLeaderboard(
      snapshot.players,
      snapshot.confidencePicks,
      snapshot.draftPicks,
      snapshot.draftEntities,
      snapshot.categories,
      snapshot.nominees,
      scores,
    )
    const timeline = computeScoreTimeline(
      snapshot.categories,
      snapshot.confidencePicks,
      snapshot.draftPicks,
      snapshot.draftEntities,
      snapshot.nominees,
      snapshot.players,
    )
    const awards = computeNightAwards(
      leaderboard,
      snapshot.players,
      snapshot.categories,
      snapshot.nominees,
      snapshot.draftEntities,
      snapshot.draftPicks,
      snapshot.confidencePicks,
      timeline,
    )
    const avatar = AVATAR_CONFIGS.find((a) => a.id === player.avatar_id)

    return renderPlayerRecapHtml(
      buildPlayerRecap({
        player,
        players: snapshot.players,
        leaderboard,
        award: awards.playerAwards.find((a) => a.playerId === player.id),
        verdict: snapshot.verdicts.get(player.id),
        categories: snapshot.categories,
        nominees: snapshot.nominees,
        draftEntities: snapshot.draftEntities,
        draftPicks: snapshot.draftPicks,
        confidencePicks: snapshot.confidencePicks,
        timeline,
        bingoCards: snapshot.bingoCards,
        bingoMarks: snapshot.bingoMarks,
        bingoSquaresById: snapshot.bingoSquaresById,
        messages: snapshot.messages,
        roomCode: snapshot.roomCode,
        recapUrl: `${recapUrlFor(snapshot.roomCode)}/${player.id}`,
        avatarColors: {
          primary: avatar?.colorPrimary ?? '#B9863F',
          secondary: avatar?.colorSecondary ?? '#8A6D1F',
        },
      }),
    )
  }, [snapshot, playerId])

  const playerName = snapshot?.players.find((p) => p.id === playerId)?.name ?? ''

  function download() {
    if (!html || !snapshot) return
    // A Blob rather than a data: URL — a full recap can exceed the length some
    // browsers accept in an href, and Blob downloads keep the filename.
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = playerRecapFileName(playerName, snapshot.roomCode)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (notFound || (snapshot && !html)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-8 text-center">
        <p className="text-base font-semibold text-white">Nothing here</p>
        <p className="text-sm text-white/45 mt-2">
          This link points at a player or a party that does not exist.
        </p>
        {code && (
          <Link to={`/recap/${code}`} className="mt-5 text-sm text-accent">
            See the full standings
          </Link>
        )}
      </div>
    )
  }

  if (!snapshot || !html) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-[#0A0E27]">
      {/* Chrome sits outside the iframe so it never ends up in the saved file. */}
      <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 py-3
                      border-b border-white/10 bg-white/5 backdrop-blur-lg">
        <Link
          to={`/recap/${code}`}
          className="flex items-center gap-1.5 text-[13px] text-white/60 hover:text-white
                     min-h-[44px] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Standings
        </Link>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={download}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-accent/15
                     border border-accent/40 text-[13px] font-semibold text-accent
                     min-h-[44px]"
        >
          {saved ? <Check className="w-4 h-4" /> : <Download className="w-4 h-4" />}
          {saved ? 'Saved' : 'Save my page'}
        </motion.button>
      </div>

      <iframe
        title={`${playerName} — the night`}
        srcDoc={html}
        // allow-same-origin is withheld deliberately: the document is inert
        // (no scripts of its own) and this keeps any escaping miss in the chat
        // text walled off from the parent app entirely.
        sandbox=""
        className="flex-1 w-full border-0"
      />
    </div>
  )
}
