/**
 * preview-harness.tsx — TEMPORARY, not part of the app.
 * Mounts ShareCard + PlayerShareCard with mock data for visual verification.
 * Bundled with esbuild; deleted after the check.
 */
import React from 'react'
import { createRoot } from 'react-dom/client'
import { ShareCard } from './src/components/home/ShareCard'
import { PlayerShareCard } from './src/components/home/PlayerShareCard'
import type { ScoredPlayer } from './src/lib/scoring'
import type { PlayerRow, PlayerVerdictRow } from './src/types/database'
import type { PlayerAward } from './src/lib/night-awards'

const mkPlayer = (id: string, name: string, avatar: string): PlayerRow =>
  ({ id, name, avatar_id: avatar, room_id: 'r1', is_host: id === 'p1', joined_at: '', emotion: 'neutral' } as unknown as PlayerRow)

const players: PlayerRow[] = [
  mkPlayer('p1', 'Franklin', 'targaryen'),
  mkPlayer('p2', 'Maya', 'hightower'),
  mkPlayer('p3', 'Dev', 'stark'),
  mkPlayer('p4', 'June', 'lannister'),
]

const mkScored = (p: PlayerRow, rank: number, total: number, conf: number, ensemble: number, bingo: number): ScoredPlayer => ({
  player: p,
  ensembleScore: ensemble,
  confidenceScore: conf,
  bingoScore: bingo,
  totalScore: total,
  rank,
  correctPickCount: 9,
  topCorrectPick: 22,
})

const leaderboard: ScoredPlayer[] = [
  mkScored(players[1], 1, 386, 180, 156, 50),
  mkScored(players[0], 2, 374, 190, 134, 50),
  mkScored(players[2], 3, 341, 160, 131, 50),
  mkScored(players[3], 4, 319, 150, 119, 50),
]

const award: PlayerAward = {
  playerId: 'p1',
  playerName: 'Franklin',
  title: 'The Kingmaker',
  blurb: 'Backed the right claim at the worst moments and profited every time.',
  stat: 'Called 9 of 12 events',
}

const verdict: PlayerVerdictRow = {
  room_id: 'r1', player_id: 'p1', companion_id: 'tyrion',
  verdict: 'You wagered like a man who had read the book, and lost like one who had only skimmed it. Still — first among the survivors of your own confidence.',
  created_at: '',
} as unknown as PlayerVerdictRow

function Scaled({ children }: { children: React.ReactNode }) {
  // Cards are fixed 1080x1350 and must NOT flex-shrink (that would fake
  // overflow bugs). Render at true size, scale for viewing.
  return (
    <div style={{ width: 540, height: 675, flexShrink: 0, overflow: 'hidden' }}>
      <div style={{ transform: 'scale(0.5)', transformOrigin: 'top left', width: 1080, height: 1350 }}>
        {children}
      </div>
    </div>
  )
}

function App() {
  return (
    <div style={{ display: 'flex', gap: 40, padding: 40, background: '#151009', minHeight: '100vh', alignItems: 'flex-start' }}>
      <Scaled><ShareCard leaderboard={leaderboard} players={players} roomCode="LSSW" /></Scaled>
      <Scaled><PlayerShareCard award={award} entry={leaderboard[1]} verdict={verdict} roomCode="LSSW" recapUrl="https://partynight.app/recap/LSSW" /></Scaled>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
