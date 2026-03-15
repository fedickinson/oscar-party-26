/**
 * MiniTimelines — three smaller breakdown charts:
 *   1. Confidence cumulative (area chart)
 *   2. Draft cumulative (area chart)
 *   3. Bingo totals (horizontal bar chart — not time-correlated)
 */

import type React from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from 'recharts'
import { Brain, Clapperboard, Grid3X3 } from 'lucide-react'
import { AVATAR_CONFIGS } from '../../data/avatars'
import type { PlayerRow } from '../../types/database'
import type { ScoredPlayer } from '../../lib/scoring'

const CHART_LINE_COLORS = ['#D4AF37', '#7B2FF7', '#22C55E', '#F97316']

interface Props {
  confidenceData: Array<Record<string, number | string>>
  draftData: Array<Record<string, number | string>>
  leaderboard: ScoredPlayer[]
  players: PlayerRow[]
}

function getPlayerColor(_avatarId: string, playerIndex: number): string {
  return CHART_LINE_COLORS[playerIndex % CHART_LINE_COLORS.length]
}

function getAvatarColor(avatarId: string): string {
  const config = AVATAR_CONFIGS.find((a) => a.id === avatarId)
  return config?.colorPrimary ?? '#888888'
}

function MiniLineChart({
  title,
  icon: Icon,
  data,
  players,
}: {
  title: string
  icon: React.ComponentType<{ size?: number; className?: string }>
  data: Array<Record<string, number | string>>
  players: PlayerRow[]
}) {
  if (data.length === 0) {
    return (
      <div
        className="border border-white/8 rounded-xl p-3"
        style={{ background: 'rgba(255,255,255,0.03)' }}
      >
        <div className="flex items-center gap-1.5 mb-1">
          <Icon size={10} className="text-white/25" />
          <p className="text-[10px] uppercase tracking-wider text-white/25">{title}</p>
        </div>
        <p className="text-xs text-white/20 text-center py-3">No data</p>
      </div>
    )
  }

  // Add a zero-point at the start
  const zeroRow: Record<string, number | string> = { categoryIndex: 0, categoryName: '' }
  players.forEach((p) => { zeroRow[p.id] = 0 })
  const fullData = [zeroRow, ...data]

  return (
    <div
      className="backdrop-blur-lg border border-white/8 rounded-xl p-3 overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.04)' }}
    >
      <div className="flex items-center gap-1.5 mb-2.5">
        <Icon size={10} className="text-white/40" />
        <p className="text-[10px] uppercase tracking-wider text-white/35 font-semibold">{title}</p>
      </div>
      <div style={{ width: '100%', height: 110 }}>
        <ResponsiveContainer>
          <AreaChart data={fullData} margin={{ top: 4, right: 2, bottom: 0, left: -28 }}>
            <defs>
              {players.map((player, i) => {
                const color = getPlayerColor(player.avatar_id, i)
                return (
                  <linearGradient key={player.id} id={`mini-fill-${title.replace(/\s/g, '')}-${player.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.16} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.01} />
                  </linearGradient>
                )
              })}
            </defs>
            <XAxis
              dataKey="categoryIndex"
              tick={false}
              axisLine={{ stroke: 'rgba(255,255,255,0.05)' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: 'rgba(255,255,255,0.18)', fontSize: 8 }}
              axisLine={false}
              tickLine={false}
              width={28}
            />
            {players.map((player, i) => {
              const color = getPlayerColor(player.avatar_id, i)
              return (
                <Area
                  key={player.id}
                  type="monotone"
                  dataKey={player.id}
                  stroke={color}
                  strokeWidth={2}
                  fill={`url(#mini-fill-${title.replace(/\s/g, '')}-${player.id})`}
                  dot={false}
                  animationDuration={1000}
                  animationEasing="ease-out"
                />
              )
            })}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {/* Mini legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 pt-2 border-t border-white/5">
        {players.map((player, i) => (
          <div key={player.id} className="flex items-center gap-1">
            <div
              className="w-4 h-0.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: getPlayerColor(player.avatar_id, i) }}
            />
            <span className="text-[10px] text-white/35">{player.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function BingoBarChart({
  leaderboard,
}: {
  leaderboard: ScoredPlayer[]
}) {
  const data = leaderboard
    .filter((sp) => sp.bingoScore > 0)
    .map((sp) => ({
      name: sp.player.name,
      score: sp.bingoScore,
      avatarId: sp.player.avatar_id,
    }))
    .sort((a, b) => b.score - a.score)

  if (data.length === 0) {
    return (
      <div
        className="border border-white/8 rounded-xl p-3"
        style={{ background: 'rgba(255,255,255,0.03)' }}
      >
        <div className="flex items-center gap-1.5 mb-1">
          <Grid3X3 size={10} className="text-white/25" />
          <p className="text-[10px] uppercase tracking-wider text-white/25">Bingo Scores</p>
        </div>
        <p className="text-xs text-white/20 text-center py-3">No bingo scores</p>
      </div>
    )
  }

  return (
    <div
      className="backdrop-blur-lg border border-white/8 rounded-xl p-3 overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.04)' }}
    >
      <div className="flex items-center gap-1.5 mb-2.5">
        <Grid3X3 size={10} className="text-white/40" />
        <p className="text-[10px] uppercase tracking-wider text-white/35 font-semibold">Bingo Scores</p>
      </div>
      <div style={{ width: '100%', height: Math.max(72, data.length * 36) }}>
        <ResponsiveContainer>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 0, right: 4, bottom: 0, left: 0 }}
          >
            <XAxis
              type="number"
              tick={{ fill: 'rgba(255,255,255,0.18)', fontSize: 8 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: 500 }}
              axisLine={false}
              tickLine={false}
              width={68}
            />
            <Bar dataKey="score" radius={[0, 5, 5, 0]} animationDuration={800} animationEasing="ease-out">
              {data.map((entry, i) => (
                <Cell
                  key={i}
                  fill={getAvatarColor(entry.avatarId)}
                  fillOpacity={0.65}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export default function MiniTimelines({
  confidenceData,
  draftData,
  leaderboard,
  players,
}: Props) {
  return (
    <div className="space-y-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/30">
        Game Breakdown
      </p>
      <MiniLineChart title="Confidence Picks" icon={Brain} data={confidenceData} players={players} />
      <MiniLineChart title="Ensemble" icon={Clapperboard} data={draftData} players={players} />
      <BingoBarChart leaderboard={leaderboard} />
    </div>
  )
}
