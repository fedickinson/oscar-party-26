/**
 * ScoreTimeline — recharts LineChart showing all players' cumulative scores
 * across the ceremony, one line per player colored by their avatar primary.
 *
 * Tap any data point to see a popup with category name, winner, and each
 * player's score delta for that category.
 */

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { TrendingUp, X } from 'lucide-react'
import {
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Area,
  AreaChart,
} from 'recharts'
import type { PlayerRow } from '../../types/database'
import type { TimelinePoint } from '../../lib/timeline-utils'

interface Props {
  timeline: TimelinePoint[]
  players: PlayerRow[]
}

// Four perceptually-distinct colors on a dark background, one per player slot
const CHART_LINE_COLORS = ['#D4AF37', '#7B2FF7', '#22C55E', '#F97316']

function getPlayerColor(_avatarId: string, playerIndex: number): string {
  return CHART_LINE_COLORS[playerIndex % CHART_LINE_COLORS.length]
}

interface DetailPopupData {
  point: TimelinePoint
}

export default function ScoreTimeline({ timeline, players }: Props) {
  const [detail, setDetail] = useState<DetailPopupData | null>(null)

  if (timeline.length === 0) {
    return (
      <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col items-center gap-2 py-8">
        <TrendingUp size={24} className="text-white/15" />
        <p className="text-sm text-white/35">No categories announced yet</p>
      </div>
    )
  }

  // Transform timeline into recharts data format
  const chartData = timeline.map((point) => {
    const row: Record<string, number | string> = {
      name: point.categoryIndex.toString(),
      categoryIndex: point.categoryIndex,
    }
    players.forEach((p) => {
      row[p.id] = point.playerScores[p.id]?.cumulative ?? 0
    })
    return row
  })

  // Add a zero-point at the start so lines begin from 0
  const zeroRow: Record<string, number | string> = { name: '0', categoryIndex: 0 }
  players.forEach((p) => { zeroRow[p.id] = 0 })
  const fullData = [zeroRow, ...chartData]

  const maxScore = Math.max(
    ...timeline.flatMap((pt) =>
      players.map((p) => pt.playerScores[p.id]?.cumulative ?? 0),
    ),
    10,
  )

  function handleChartClick(data: Record<string, unknown> | null | undefined) {
    if (!data || !data.activePayload) return
    const payload = data.activePayload as Array<{ payload: Record<string, unknown> }>
    if (!payload[0]) return
    const catIndex = payload[0].payload.categoryIndex as number
    if (catIndex === 0) return // skip the zero point
    const point = timeline.find((p) => p.categoryIndex === catIndex)
    if (point) setDetail({ point })
  }

  return (
    <div
      className="backdrop-blur-lg border border-white/10 rounded-2xl p-4 overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.04)' }}
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-6 h-6 rounded-md bg-oscar-gold/10 border border-oscar-gold/20 flex items-center justify-center flex-shrink-0">
          <TrendingUp size={12} className="text-oscar-gold/80" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-wider text-white/40">Score Timeline</p>
        <span className="ml-auto text-[10px] text-white/25">Tap to inspect</span>
      </div>

      <div style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer>
          <AreaChart
            data={fullData}
            onClick={handleChartClick}
            margin={{ top: 10, right: 6, bottom: 4, left: -18 }}
          >
            <defs>
              {players.map((player, i) => {
                const color = getPlayerColor(player.avatar_id, i)
                return (
                  <linearGradient key={player.id} id={`areafill-${player.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.18} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.01} />
                  </linearGradient>
                )
              })}
            </defs>
            <XAxis
              dataKey="categoryIndex"
              tick={{ fill: 'rgba(255,255,255,0.22)', fontSize: 9 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.06)' }}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              domain={[0, Math.ceil(maxScore * 1.12)]}
              tick={{ fill: 'rgba(255,255,255,0.22)', fontSize: 9 }}
              axisLine={false}
              tickLine={false}
              width={36}
            />
            <Tooltip content={() => null} />
            {players.map((player, i) => {
              const color = getPlayerColor(player.avatar_id, i)
              return (
                <Area
                  key={player.id}
                  type="monotone"
                  dataKey={player.id}
                  stroke={color}
                  strokeWidth={2.5}
                  fill={`url(#areafill-${player.id})`}
                  dot={false}
                  activeDot={{
                    r: 5,
                    strokeWidth: 1.5,
                    stroke: color,
                    fill: '#0A0E27',
                  }}
                  animationDuration={1400}
                  animationEasing="ease-out"
                />
              )
            })}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 pt-3 border-t border-white/6">
        {players.map((player, i) => (
          <div key={player.id} className="flex items-center gap-1.5">
            <div
              className="w-6 h-0.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: getPlayerColor(player.avatar_id, i) }}
            />
            <span className="text-xs text-white/50 font-medium">{player.name}</span>
          </div>
        ))}
      </div>

      {/* Detail popup */}
      <AnimatePresence>
        {detail && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
              onClick={() => setDetail(null)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', stiffness: 340, damping: 28 }}
              className="fixed inset-x-4 top-1/3 z-50 max-w-sm mx-auto rounded-2xl p-4 shadow-2xl border border-white/12"
              style={{ background: 'linear-gradient(145deg, #0e1230, #121840)' }}
            >
              <div className="flex items-start justify-between mb-3.5">
                <div className="flex-1 min-w-0 pr-3">
                  <p className="text-[10px] text-oscar-gold/60 uppercase tracking-wider mb-0.5">
                    Category {detail.point.categoryIndex}
                  </p>
                  <p className="text-base font-bold text-white leading-tight">
                    {detail.point.categoryName}
                  </p>
                  <p className="text-xs text-white/45 mt-0.5 truncate">
                    {detail.point.winnerName}
                    {detail.point.winnerFilm ? ` · ${detail.point.winnerFilm}` : ''}
                  </p>
                </div>
                <motion.button
                  whileTap={{ scale: 0.88 }}
                  onClick={() => setDetail(null)}
                  className="w-8 h-8 rounded-full bg-white/8 border border-white/10 flex items-center justify-center flex-shrink-0"
                >
                  <X size={13} className="text-white/55" />
                </motion.button>
              </div>

              <div className="space-y-1.5">
                {players.map((player, i) => {
                  const score = detail.point.playerScores[player.id]
                  if (!score) return null
                  const color = getPlayerColor(player.avatar_id, i)
                  return (
                    <div
                      key={player.id}
                      className="flex items-center justify-between py-2 px-3 rounded-xl border border-white/6"
                      style={{ background: `${color}10` }}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-sm text-white/80 font-medium">{player.name}</span>
                      </div>
                      <div className="flex items-center gap-2.5 flex-shrink-0">
                        {score.delta > 0 && (
                          <span
                            className="text-xs font-semibold px-1.5 py-0.5 rounded-md"
                            style={{ color, background: color + '20' }}
                          >
                            +{score.delta}
                          </span>
                        )}
                        <span className="text-sm font-bold text-white tabular-nums">
                          {score.cumulative}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
