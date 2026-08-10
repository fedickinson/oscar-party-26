/**
 * ShareCard -- off-screen rendered share card captured as a PNG image.
 *
 * Fixed 1080x1350 (4:5 ratio for Instagram/social). All styles are inline
 * because html-to-image resolves better without Tailwind class resolution.
 *
 * This component is NEVER rendered visually in the app -- it is mounted
 * off-screen, captured via toPng(), then unmounted immediately.
 */

import type { ScoredPlayer } from '../../lib/scoring'
import type { PlayerRow } from '../../types/database'
import { AVATAR_CONFIGS } from '../../data/avatars'
import { PLAYER_AVATARS } from '../../data/avatar-config'

export interface ShareCardProps {
  leaderboard: ScoredPlayer[]
  players: PlayerRow[]
  roomCode: string
}

function getPlayerColor(avatarId: string): string {
  // Players now carry house-sigil ids (avatar-config); AVATAR_CONFIGS is the
  // legacy Oscars cast kept as fallback for old rooms. Warm ashlar if unknown.
  const house = PLAYER_AVATARS.find((a) => a.id === avatarId)
  if (house) return house.color
  const config = AVATAR_CONFIGS.find((a) => a.id === avatarId)
  return config?.colorPrimary ?? '#6E665B'
}

function getPlayerInitials(name: string): string {
  return name.charAt(0).toUpperCase()
}

function MotifBand() {
  return (
    <div
      style={{
        height: 24,
        width: '100%',
        background: '#24231f',
        borderTop: '1px solid rgba(214,205,186,0.48)',
        borderBottom: '1px solid rgba(18,17,15,0.82)',
        color: '#d6cdba',
        overflow: 'hidden',
      }}
    >
      <svg width="1080" height="24" viewBox="0 0 1080 24" aria-hidden="true">
        {Array.from({ length: 27 }, (_, index) => {
          const x = index * 40
          return (
            <g key={x} transform={`translate(${x} 0)`}>
              <path
                d="M0 12 10 3l10 9-10 9Zm20 0 10-9 10 9-10 9Z"
                fill="none"
                stroke="#d6cdba"
                strokeWidth="1.6"
              />
              <circle cx="10" cy="12" r="2.2" fill="#d6cdba" />
              <circle cx="30" cy="12" r="2.2" fill="#d6cdba" />
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function CornerOrnament({ right, bottom }: { right?: boolean; bottom?: boolean }) {
  return (
    <svg
      width="54"
      height="54"
      viewBox="0 0 40 40"
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: bottom ? undefined : 48,
        bottom: bottom ? 48 : undefined,
        left: right ? undefined : 48,
        right: right ? 48 : undefined,
        transform: `scale(${right ? -1 : 1}, ${bottom ? -1 : 1})`,
      }}
    >
      <path
        d="M3 36V4h32M8 31V9h22M13 26V14h12M3 16 16 3M3 27 27 3"
        fill="none"
        stroke="#665642"
        strokeWidth="1.8"
      />
      <circle cx="14" cy="14" r="3" fill="#665642" />
    </svg>
  )
}

function DanceMark() {
  return (
    <svg width="128" height="128" viewBox="0 0 120 120" aria-hidden="true">
      <circle cx="60" cy="60" r="53" fill="#e2d5b9" stroke="#292219" strokeWidth="5" />
      <circle cx="60" cy="60" r="47" fill="none" stroke="#665642" strokeWidth="1.5" />
      <g aria-label="Team Black dragon">
        <path fill="#101014" d="M66 17C45 11 25 21 16 39 8 56 12 77 26 89c11 10 28 12 39 3 9-7 10-20 3-28-6-8-18-9-26-3l-8 7 10 1-5 8 12-3c5 0 8 5 5 9-5 7-17 7-24 0-11-10-12-27-4-39 7-11 20-17 33-15l-8 7 15-2-5 11 16-8-2-9 10-3Z" />
        <path fill="#101014" d="M48 31C36 23 24 24 16 33l12 2-13 8 15 1-10 12 17-5-3 15 15-12 11-15Z" />
        <path fill="#8e3b2e" d="M56 31c9-6 19-3 23 6l11 2-7 6 9 6-12 3-5 9-5-10-13-2-10 5 4-10-8-6 11-1Z" />
        <path fill="#f0e5cb" d="M19 40c8-15 25-23 41-19l-6 4c-13 0-25 7-31 19-5 10-4 22 2 31-9-9-12-23-6-35Zm36-6c7-4 14-2 18 4l-5 1c-4-2-8-1-12 2Z" />
        <path fill="#8e3b2e" d="m26 35 19 6-12 5 12 4-10 8-1-9-11 5 7-10-10-3Z" />
        <g fill="none" stroke="#8e3b2e" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
          <path d="M27 37 44 48 33 59m-2-19 1 15m8-10 1 10M54 35l8 13-11 7M26 78c8 9 20 12 30 7" />
          <path d="m62 43 10 2-8 5m3 5 7-2" />
        </g>
        <circle cx="71" cy="43" r="2" fill="#f0e5cb" />
      </g>
      <g aria-label="Team Green dragon" transform="rotate(180 60 60)">
        <path fill="#2c4034" d="M66 17C45 11 25 21 16 39 8 56 12 77 26 89c11 10 28 12 39 3 9-7 10-20 3-28-6-8-18-9-26-3l-8 7 10 1-5 8 12-3c5 0 8 5 5 9-5 7-17 7-24 0-11-10-12-27-4-39 7-11 20-17 33-15l-8 7 15-2-5 11 16-8-2-9 10-3Z" />
        <path fill="#2c4034" d="M48 31C36 23 24 24 16 33l12 2-13 8 15 1-10 12 17-5-3 15 15-12 11-15Z" />
        <path fill="#b9863f" d="M56 31c9-6 19-3 23 6l11 2-7 6 9 6-12 3-5 9-5-10-13-2-10 5 4-10-8-6 11-1Z" />
        <path fill="#f0e5cb" d="M19 40c8-15 25-23 41-19l-6 4c-13 0-25 7-31 19-5 10-4 22 2 31-9-9-12-23-6-35Zm36-6c7-4 14-2 18 4l-5 1c-4-2-8-1-12 2Z" />
        <path fill="#b9863f" d="m26 35 19 6-12 5 12 4-10 8-1-9-11 5 7-10-10-3Z" />
        <g fill="none" stroke="#b9863f" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
          <path d="M27 37 44 48 33 59m-2-19 1 15m8-10 1 10M54 35l8 13-11 7M26 78c8 9 20 12 30 7" />
          <path d="m62 43 10 2-8 5m3 5 7-2" />
        </g>
        <circle cx="71" cy="43" r="2" fill="#f0e5cb" />
      </g>
    </svg>
  )
}

export function ShareCard({ leaderboard, players, roomCode }: ShareCardProps) {
  const winner = leaderboard[0]

  return (
    <div
      style={{
        width: 1080,
        height: 1350,
        backgroundColor: '#e2d5b9',
        backgroundImage:
          'repeating-linear-gradient(2deg, rgba(102,86,66,0.026) 0px, rgba(102,86,66,0.026) 1px, transparent 1px, transparent 7px), repeating-linear-gradient(91deg, rgba(240,229,203,0.12) 0px, rgba(240,229,203,0.12) 1px, transparent 1px, transparent 19px), url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'150\' height=\'150\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'.018 .08\' numOctaves=\'5\' seed=\'31\' stitchTiles=\'stitch\'/%3E%3CfeColorMatrix type=\'saturate\' values=\'0\'/%3E%3CfeComponentTransfer%3E%3CfeFuncA type=\'gamma\' amplitude=\'.28\' exponent=\'1.7\' offset=\'0\'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")',
        color: '#292219',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        padding: 0,
        overflow: 'hidden',
        position: 'relative',
        clipPath:
          'polygon(0.6% 0.2%, 8% 0.5%, 16% 0.1%, 25% 0.4%, 35% 0.1%, 45% 0.5%, 55% 0.1%, 65% 0.4%, 75% 0.1%, 85% 0.5%, 99.4% 0.2%, 99.7% 9%, 99.3% 18%, 99.8% 28%, 99.4% 39%, 99.8% 50%, 99.4% 61%, 99.8% 72%, 99.3% 83%, 99.7% 92%, 99.4% 99.8%, 90% 99.5%, 80% 99.9%, 70% 99.6%, 60% 99.9%, 50% 99.5%, 40% 99.9%, 30% 99.6%, 20% 99.9%, 10% 99.5%, 0.6% 99.8%, 0.3% 91%, 0.7% 81%, 0.2% 71%, 0.6% 61%, 0.2% 51%, 0.7% 41%, 0.2% 31%, 0.6% 21%, 0.2% 11%)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 20,
          border: '1px solid #292219',
          boxShadow: 'inset 0 0 0 5px rgba(102,86,66,0.18)',
          pointerEvents: 'none',
        }}
      />
      <CornerOrnament />
      <CornerOrnament right />
      <CornerOrnament bottom />
      <CornerOrnament right bottom />

      <div style={{ margin: '30px 32px 0' }}>
        <MotifBand />
      </div>

      {/* ── 1. Event masthead ─────────────────────────────────────────────── */}
      <div
        style={{
          height: 292,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: 12,
          position: 'relative',
        }}
      >
        <DanceMark />
        <div
          style={{
            marginTop: 5,
            fontFamily: 'Cinzel, Georgia, serif',
            fontSize: 13,
            fontWeight: 700,
            color: '#665642',
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
          }}
        >
          Watch Party Presents
        </div>
        <div
          style={{
            marginTop: 7,
            fontFamily: 'Cinzel, Georgia, serif',
            fontSize: 50,
            fontWeight: 800,
            color: '#292219',
            letterSpacing: '0.035em',
            lineHeight: 1,
            textTransform: 'uppercase',
          }}
        >
          Fire <span style={{ color: '#8e3b2e' }}>&amp;</span> Blood
        </div>
        <div
          style={{
            marginTop: 8,
            fontFamily: 'Cormorant Garamond, Georgia, serif',
            fontSize: 22,
            fontWeight: 700,
            color: '#665642',
            letterSpacing: '0.035em',
          }}
        >
          House of the Dragon — Season 3 Finale
        </div>
      </div>

      {/* ── 2. Winner proclamation ───────────────────────────────────────── */}
      {winner && (
        <div
          style={{
            minHeight: 188,
            margin: '0 76px',
            padding: '22px 34px',
            display: 'grid',
            gridTemplateColumns: '116px minmax(0, 1fr) auto',
            alignItems: 'center',
            columnGap: 26,
            background: 'rgba(116,50,38,0.075)',
            borderTop: '3px double #665642',
            borderBottom: '3px double #665642',
            position: 'relative',
          }}
        >
          <div
            style={{
              width: 104,
              height: 104,
              borderRadius: '50%',
              background: '#743226',
              border: '6px double #a4513e',
              boxShadow: 'inset 3px 3px 0 #a4513e, inset -4px -4px 0 #451d18, 0 5px 7px rgba(8,8,7,0.34)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transform: 'rotate(-4deg)',
            }}
          >
            <svg width="62" height="56" viewBox="0 0 26 22" fill="none" aria-hidden="true">
              <path
                d="M2 18h22M2 18 5 8l6 5 2-8 2 8 6-5 3 10"
                stroke="#451d18"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: 'Cinzel, Georgia, serif',
                fontSize: 13,
                fontWeight: 700,
                color: '#665642',
                textTransform: 'uppercase',
                letterSpacing: '0.25em',
              }}
            >
              Tonight&apos;s Champion
            </div>
            <div
              style={{
                marginTop: 7,
                fontFamily: 'Cinzel, Georgia, serif',
                fontSize: 42,
                fontWeight: 800,
                color: '#292219',
                lineHeight: 1.08,
              }}
            >
              {winner.player.name}
            </div>
            <div
              style={{
                marginTop: 5,
                fontFamily: 'Cormorant Garamond, Georgia, serif',
                fontSize: 20,
                fontWeight: 700,
                fontStyle: 'italic',
                color: '#665642',
              }}
            >
              First among the assembled houses
            </div>
          </div>
          <div style={{ textAlign: 'right', paddingLeft: 18 }}>
            <span
              style={{
                display: 'block',
                fontFamily: 'Cinzel, Georgia, serif',
                fontSize: 54,
                fontWeight: 800,
                lineHeight: 1,
                color: '#8e3b2e',
                fontVariantNumeric: 'tabular-nums lining-nums',
              }}
            >
              {winner.totalScore}
            </span>
            <span
              style={{
                display: 'block',
                marginTop: 5,
                fontSize: 12,
                fontWeight: 700,
                color: '#665642',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
              }}
            >
              points
            </span>
          </div>
        </div>
      )}

      {/* ── 3. Inked ledger ──────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          padding: '25px 86px 0',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '76px 1fr auto',
            alignItems: 'end',
            padding: '0 18px 10px',
            borderBottom: '3px double #292219',
            fontFamily: 'Cinzel, Georgia, serif',
            fontSize: 12,
            fontWeight: 700,
            color: '#665642',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
          }}
        >
          <span>Place</span>
          <span>Final Standings</span>
          <span>Score</span>
        </div>
        {leaderboard.map((entry, i) => {
          const avatarColor = getPlayerColor(entry.player.avatar_id)
          const isFirst = i === 0

          return (
            <div
              key={entry.player.id}
              style={{
                flex: 1,
                minHeight: 70,
                maxHeight: 92,
                display: 'grid',
                gridTemplateColumns: '54px 54px minmax(0, 1fr) auto',
                alignItems: 'center',
                gap: 16,
                padding: '10px 18px',
                borderBottom: '1px solid rgba(102,86,66,0.42)',
                background: isFirst ? 'rgba(116,50,38,0.055)' : 'transparent',
              }}
            >
              <span
                style={{
                  fontFamily: 'Cinzel, Georgia, serif',
                  fontSize: isFirst ? 27 : 22,
                  fontWeight: 800,
                  color: isFirst ? '#8e3b2e' : '#665642',
                  fontVariantNumeric: 'tabular-nums lining-nums',
                  textAlign: 'center',
                }}
              >
                {i + 1}
              </span>
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: '50%',
                  background: avatarColor,
                  border: '2px solid #292219',
                  boxShadow: 'inset 0 0 0 3px rgba(240,229,203,0.32)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  style={{
                    fontFamily: 'Cinzel, Georgia, serif',
                    fontSize: 19,
                    fontWeight: 800,
                    color: '#f0e5cb',
                    lineHeight: 1,
                  }}
                >
                  {getPlayerInitials(entry.player.name)}
                </span>
              </div>
              <div style={{ minWidth: 0 }}>
                <span
                  style={{
                    display: 'block',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    fontFamily: 'Cinzel, Georgia, serif',
                    fontSize: 21,
                    fontWeight: 700,
                    color: '#292219',
                    lineHeight: 1.2,
                  }}
                >
                  {entry.player.name}
                </span>
                <span
                  style={{
                    display: 'block',
                    marginTop: 4,
                    fontSize: 12,
                    fontWeight: 600,
                    color: '#665642',
                    letterSpacing: '0.045em',
                    fontVariantNumeric: 'tabular-nums lining-nums',
                  }}
                >
                  Draft {entry.ensembleScore} &nbsp;&middot;&nbsp; Bingo {entry.bingoScore}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <span
                  style={{
                    fontFamily: 'Cinzel, Georgia, serif',
                    fontSize: 31,
                    fontWeight: 800,
                    color: isFirst ? '#8e3b2e' : '#292219',
                    lineHeight: 1,
                    fontVariantNumeric: 'tabular-nums lining-nums',
                  }}
                >
                  {entry.totalScore}
                </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#665642' }}>PT</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── 4. Footer ────────────────────────────────────────────────────── */}
      <div
        style={{
          height: 88,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        <div
          style={{
            fontFamily: 'Cinzel, Georgia, serif',
            fontSize: 12,
            fontWeight: 700,
            color: '#665642',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
          }}
        >
          The record of the night
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: '#8e3b2e',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
          }}
        >
          Room {roomCode}
        </div>
      </div>

      <div style={{ margin: '0 32px 30px' }}>
        <MotifBand />
      </div>
    </div>
  )
}
