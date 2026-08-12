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
import { buildPlayerRecap, requiredImageSlugs } from '../lib/player-recap'
import { collectPlayerDraftPortraitPaths } from '../lib/draft-portrait'
import { getLibraryImage } from '../data/image-library'
import { renderPlayerRecapHtml, playerRecapFileName } from '../lib/player-recap-html'
import { recapUrlFor } from '../hooks/useShareResults'
import { AVATAR_CONFIGS } from '../data/avatars'
import { useEffect, useState } from 'react'

export default function PlayerRecap() {
  const { code, playerId } = useParams<{ code: string; playerId: string }>()
  const { snapshot, notFound, recordError } = useRoomSnapshot(code)
  const [saved, setSaved] = useState(false)
  /**
   * Library slug or pack-owned portrait path → base64 data URI.
   *
   * The keepsake has to survive being opened offline, so chosen artwork and
   * this player's roster portraits are inlined rather than linked. A document
   * that gets emailed around should not carry pictures it never renders.
   */
  const [imageSources, setImageSources] = useState<Map<string, string>>(new Map())
  const [loadedArtworkKey, setLoadedArtworkKey] = useState<string | null>(null)

  const verdict = snapshot && playerId ? snapshot.verdicts.get(playerId) : undefined
  const artworkSources = useMemo(() => {
    const slugs = requiredImageSlugs(verdict)
    const portraitPaths = snapshot && playerId
      ? collectPlayerDraftPortraitPaths(
          snapshot.draftEntities,
          snapshot.draftPicks,
          playerId,
          snapshot.nominees,
        )
      : []
    return [
      ...slugs.flatMap((slug) => {
        const entry = getLibraryImage(slug)
        return entry ? [{ key: slug, path: entry.path }] : []
      }),
      ...portraitPaths.map((path) => ({ key: path, path })),
    ]
  }, [verdict, snapshot, playerId])
  const artworkKey = useMemo(
    () => JSON.stringify(artworkSources.map((source) => [source.key, source.path])),
    [artworkSources],
  )
  const artworkReady = loadedArtworkKey === artworkKey

  useEffect(() => {
    if (artworkSources.length === 0) {
      setImageSources(new Map())
      setLoadedArtworkKey(artworkKey)
      return
    }
    let cancelled = false

    Promise.all(
      artworkSources.map(async (source) => {
        try {
          const res = await fetch(source.path)
          if (!res.ok) return null
          const blob = await res.blob()
          const dataUri = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result))
            reader.onerror = reject
            reader.readAsDataURL(blob)
          })
          return [source.key, dataUri] as const
        } catch {
          // Artwork is an enhancement; the sheet renders without it.
          return null
        }
      }),
    ).then((pairs) => {
      if (cancelled) return
      setImageSources(new Map(pairs.filter((p): p is readonly [string, string] => p !== null)))
      setLoadedArtworkKey(artworkKey)
    })

    return () => { cancelled = true }
  }, [artworkKey, artworkSources])

  const html = useMemo(() => {
    if (!snapshot || !playerId || snapshot.recordSource !== 'settled') return null
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
      snapshot.convictionPicks,
      snapshot.gameModel,
    )
    const timeline = computeScoreTimeline(
      snapshot.categories,
      snapshot.confidencePicks,
      snapshot.draftPicks,
      snapshot.draftEntities,
      snapshot.nominees,
      snapshot.players,
      snapshot.convictionPicks,
      snapshot.gameModel,
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
      snapshot.gameModel,
    )
    const avatar = AVATAR_CONFIGS.find((a) => a.id === player.avatar_id)

    return renderPlayerRecapHtml(
      buildPlayerRecap({
        player,
        players: snapshot.players,
        leaderboard,
        award: awards.playerAwards.find((a) => a.playerId === player.id),
        verdict: snapshot.verdicts.get(player.id),
        imageSources,
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
  }, [snapshot, playerId, imageSources])

  const playerName = snapshot?.players.find((p) => p.id === playerId)?.name ?? ''

  function download() {
    if (!html || !snapshot || !artworkReady) return
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

  if (snapshot?.recordSource === 'live') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-8 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-[color:var(--t-pending)]">
          Live record · provisional
        </p>
        <p className="mt-2 text-base font-semibold text-[color:var(--t-text)]">
          This keepsake is waiting for settlement
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[color:var(--t-text-muted)]">
          Research can still amend the standings, awards, and personal ledger.
          The saveable page opens after the researched record is closed.
        </p>
        {code && (
          <Link to={`/recap/${code}`} className="mt-5 text-sm text-accent">
            See the provisional standings
          </Link>
        )}
      </div>
    )
  }

  if (notFound || recordError || (snapshot && !html)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-8 text-center">
        <p className="text-base font-semibold text-white">
          {recordError ? 'The record could not be opened' : 'Nothing here'}
        </p>
        <p className="text-sm text-white/45 mt-2">
          {recordError ?? 'This link points at a player or a party that does not exist.'}
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
          disabled={!artworkReady}
          className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-accent/15
                     border border-accent/40 text-[13px] font-semibold text-accent
                     min-h-[44px] disabled:opacity-50"
        >
          {saved ? <Check className="w-4 h-4" /> : <Download className="w-4 h-4" />}
          {saved ? 'Saved' : artworkReady ? 'Save my page' : 'Preparing page'}
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
