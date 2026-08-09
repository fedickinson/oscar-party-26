/**
 * useShareResults -- image-card social sharing.
 *
 * Renders a share card off-screen, captures it as a PNG via html-to-image, then
 * shares via the Web Share API (mobile with file support) or downloads the
 * image as a fallback (desktop / no file sharing).
 *
 * TWO CARDS, ONE PIPELINE
 *   shareResults()    -- the standings. Same image for everyone.
 *   sharePlayerCard() -- one player's own title and verdict.
 * The render/capture/share plumbing is identical for both and lives in
 * captureAndShare; only the element differs. This was one inlined function
 * before the second card existed, and duplicating ~70 lines of blob and
 * navigator.share handling to add it would have meant two places to fix the
 * next time a browser disagreed about canShare.
 */

import { useCallback, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { toPng } from 'html-to-image'
import type { ReactNode } from 'react'
import { ShareCard } from '../components/home/ShareCard'
import { PlayerShareCard } from '../components/home/PlayerShareCard'
import type { ScoredPlayer } from '../lib/scoring'
import type { PlayerAward } from '../lib/night-awards'
import type { PlayerRow, PlayerVerdictRow } from '../types/database'

/** Public recap URL for a room — printed on the card and used as share text. */
export function recapUrlFor(roomCode: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/recap/${roomCode}`
}

export function useShareResults() {
  const [isCopied, setIsCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const flashCopied = useCallback(() => {
    setIsCopied(true)
    timerRef.current = setTimeout(() => {
      setIsCopied(false)
      timerRef.current = null
    }, 2000)
  }, [])

  const captureAndShare = useCallback(
    async (element: ReactNode, fileName: string, shareTitle: string, shareUrl?: string) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }

      const container = document.createElement('div')
      container.style.position = 'fixed'
      container.style.left = '-9999px'
      container.style.top = '0'
      document.body.appendChild(container)

      const root = createRoot(container)

      try {
        root.render(element)

        // Let React commit before we rasterise. Without this the capture races
        // the first paint and comes back blank.
        await new Promise((resolve) => setTimeout(resolve, 150))

        const cardElement = container.firstElementChild as HTMLElement
        if (!cardElement) throw new Error('Share card did not render')

        const dataUrl = await toPng(cardElement, {
          width: 1080,
          height: 1350,
          pixelRatio: 1,
        })

        const response = await fetch(dataUrl)
        const blob = await response.blob()
        const file = new File([blob], fileName, { type: 'image/png' })

        if (
          typeof navigator.share === 'function' &&
          typeof navigator.canShare === 'function' &&
          navigator.canShare({ files: [file] })
        ) {
          try {
            // The URL rides along with the image so a recipient can open the
            // full recap. An image alone is a dead end.
            await navigator.share({ title: shareTitle, text: shareUrl, files: [file] })
            flashCopied()
            return
          } catch {
            // Cancelled or unsupported -- fall through to download
          }
        }

        const link = document.createElement('a')
        link.href = dataUrl
        link.download = fileName
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)

        flashCopied()
      } catch {
        // Sharing is nice-to-have -- never let it surface as an error
      } finally {
        root.unmount()
        document.body.removeChild(container)
      }
    },
    [flashCopied],
  )

  const shareResults = useCallback(
    async (leaderboard: ScoredPlayer[], players: PlayerRow[], roomCode: string) => {
      if (leaderboard.length === 0) return
      await captureAndShare(
        ShareCard({ leaderboard, players, roomCode }),
        `hotd-finale-standings-${roomCode}.png`,
        'House of the Dragon Finale — Final Standings',
        recapUrlFor(roomCode),
      )
    },
    [captureAndShare],
  )

  const sharePlayerCard = useCallback(
    async (
      award: PlayerAward,
      entry: ScoredPlayer | undefined,
      verdict: PlayerVerdictRow | undefined,
      roomCode: string,
    ) => {
      const recapUrl = recapUrlFor(roomCode)
      await captureAndShare(
        PlayerShareCard({ award, entry, verdict, roomCode, recapUrl }),
        `hotd-finale-${award.playerName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`,
        `${award.playerName} — ${award.title}`,
        recapUrl,
      )
    },
    [captureAndShare],
  )

  return { shareResults, sharePlayerCard, isCopied }
}
