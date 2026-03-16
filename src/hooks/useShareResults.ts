/**
 * useShareResults -- image-card social sharing for final standings.
 *
 * Renders a ShareCard off-screen, captures it as a PNG via html-to-image,
 * then shares via Web Share API (mobile with file support) or downloads
 * the image as a fallback (desktop / no file sharing).
 *
 * Returns { shareResults, isCopied } for API compatibility with
 * PostCeremonyView's existing button binding.
 */

import { useCallback, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { toPng } from 'html-to-image'
import { ShareCard } from '../components/home/ShareCard'
import type { ScoredPlayer } from '../lib/scoring'
import type { PlayerRow } from '../types/database'

export function useShareResults() {
  const [isCopied, setIsCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const shareResults = useCallback(
    async (leaderboard: ScoredPlayer[], players: PlayerRow[], roomCode: string) => {
      if (leaderboard.length === 0) return

      // Clean up any existing timer
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }

      // Create off-screen container
      const container = document.createElement('div')
      container.style.position = 'fixed'
      container.style.left = '-9999px'
      container.style.top = '0'
      document.body.appendChild(container)

      const root = createRoot(container)

      try {
        // Render the ShareCard into the off-screen container
        root.render(
          ShareCard({ leaderboard, players, roomCode }),
        )

        // Small delay to let React render the component
        await new Promise((resolve) => setTimeout(resolve, 150))

        const cardElement = container.firstElementChild as HTMLElement
        if (!cardElement) {
          throw new Error('ShareCard did not render')
        }

        // Capture as PNG
        const dataUrl = await toPng(cardElement, {
          width: 1080,
          height: 1350,
          pixelRatio: 1,
        })

        // Convert data URL to Blob
        const response = await fetch(dataUrl)
        const blob = await response.blob()
        const file = new File([blob], `oscars-results-${roomCode}.png`, {
          type: 'image/png',
        })

        // Try native share with file support (mobile)
        if (
          typeof navigator.share === 'function' &&
          typeof navigator.canShare === 'function' &&
          navigator.canShare({ files: [file] })
        ) {
          try {
            await navigator.share({
              title: 'Oscars Night 26 Results',
              files: [file],
            })
            setIsCopied(true)
            timerRef.current = setTimeout(() => {
              setIsCopied(false)
              timerRef.current = null
            }, 2000)
            return
          } catch {
            // User cancelled or share failed -- fall through to download
          }
        }

        // Fallback: download the image
        const link = document.createElement('a')
        link.href = dataUrl
        link.download = `oscars-results-${roomCode}.png`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)

        setIsCopied(true)
        timerRef.current = setTimeout(() => {
          setIsCopied(false)
          timerRef.current = null
        }, 2000)
      } catch {
        // Silently fail -- sharing is nice-to-have
      } finally {
        // Clean up off-screen container
        root.unmount()
        document.body.removeChild(container)
      }
    },
    [],
  )

  return { shareResults, isCopied }
}
