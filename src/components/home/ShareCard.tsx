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

export interface ShareCardProps {
  leaderboard: ScoredPlayer[]
  players: PlayerRow[]
  roomCode: string
}

function getPlayerColor(avatarId: string): string {
  const config = AVATAR_CONFIGS.find((a) => a.id === avatarId)
  return config?.colorPrimary ?? '#888888'
}

function getPlayerInitials(name: string): string {
  return name.charAt(0).toUpperCase()
}

export function ShareCard({ leaderboard, players, roomCode }: ShareCardProps) {
  const winner = leaderboard[0]

  return (
    <div
      style={{
        width: 1080,
        height: 1350,
        background: 'linear-gradient(135deg, #0A0E27 0%, #12163A 100%)',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        padding: 0,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Decorative glow behind winner area */}
      <div
        style={{
          position: 'absolute',
          top: 80,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 700,
          height: 500,
          background: 'radial-gradient(ellipse, rgba(212,175,55,0.10) 0%, rgba(212,175,55,0.03) 55%, transparent 75%)',
          pointerEvents: 'none',
        }}
      />
      {/* Secondary ambient glow at bottom */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 800,
          height: 300,
          background: 'radial-gradient(ellipse, rgba(212,175,55,0.04) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* ── 1. Header ──────────────────────────────────────────────────────── */}
      <div
        style={{
          height: 200,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          paddingTop: 52,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'rgba(212,175,55,0.65)',
            letterSpacing: '0.32em',
            textTransform: 'uppercase',
            marginBottom: 14,
          }}
        >
          98th Academy Awards
        </div>
        <div
          style={{
            fontSize: 52,
            fontWeight: 800,
            color: '#D4AF37',
            letterSpacing: '0.05em',
            lineHeight: 1.0,
          }}
        >
          OSCARS NIGHT 26
        </div>
        {/* Gold rule under title */}
        <div
          style={{
            width: 80,
            height: 2,
            background: 'linear-gradient(90deg, transparent, rgba(212,175,55,0.60), transparent)',
            marginTop: 14,
            marginBottom: 6,
          }}
        />
        <div
          style={{
            fontSize: 15,
            fontWeight: 400,
            color: 'rgba(255,255,255,0.35)',
            letterSpacing: '0.14em',
          }}
        >
          March 15, 2026
        </div>
      </div>

      {/* ── 2. Winner Spotlight ─────────────────────────────────────────────── */}
      {winner && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 72px',
            padding: '32px 0 28px',
            background: 'linear-gradient(150deg, rgba(212,175,55,0.11) 0%, rgba(212,175,55,0.05) 55%, rgba(10,14,39,0.5) 100%)',
            borderRadius: 32,
            border: '1px solid rgba(212,175,55,0.28)',
            boxShadow: '0 0 48px 12px rgba(212,175,55,0.06), inset 0 1px 0 rgba(212,175,55,0.12)',
            position: 'relative',
          }}
        >
          {/* Crown / rank badge */}
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #D4AF37 0%, #C49B20 50%, #B8960C 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 12,
              boxShadow: '0 0 28px 6px rgba(212,175,55,0.25), 0 4px 12px rgba(0,0,0,0.3)',
              border: '2px solid rgba(212,175,55,0.5)',
            }}
          >
            {/* Crown SVG path */}
            <svg width="26" height="22" viewBox="0 0 26 22" fill="none">
              <path
                d="M2 18h22M2 18L5 8l6 5 2-8 2 8 6-5 3 10"
                stroke="#0A0E27"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'rgba(212,175,55,0.70)',
              textTransform: 'uppercase',
              letterSpacing: '0.30em',
              marginBottom: 8,
            }}
          >
            TONIGHT'S CHAMPION
          </div>
          <div
            style={{
              fontSize: 40,
              fontWeight: 800,
              color: '#ffffff',
              lineHeight: 1.15,
              marginBottom: 6,
              textAlign: 'center',
              padding: '0 32px',
            }}
          >
            {winner.player.name}
          </div>
          <div
            style={{
              fontSize: 48,
              fontWeight: 900,
              color: '#D4AF37',
              lineHeight: 1,
            }}
          >
            {winner.totalScore}
            <span
              style={{
                fontSize: 20,
                fontWeight: 600,
                color: 'rgba(212,175,55,0.55)',
                marginLeft: 8,
              }}
            >
              points
            </span>
          </div>
        </div>
      )}

      {/* ── 3. Leaderboard ──────────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          padding: '28px 72px 0 72px',
          gap: 12,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 10,
          }}
        >
          <div
            style={{
              width: 32,
              height: 1.5,
              background: 'rgba(212,175,55,0.40)',
              borderRadius: 1,
            }}
          />
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'rgba(255,255,255,0.40)',
              textTransform: 'uppercase',
              letterSpacing: '0.25em',
            }}
          >
            Final Standings
          </div>
          <div
            style={{
              width: 32,
              height: 1.5,
              background: 'rgba(212,175,55,0.40)',
              borderRadius: 1,
            }}
          />
        </div>
        {leaderboard.map((entry, i) => {
          const avatarColor = getPlayerColor(entry.player.avatar_id)
          const isFirst = i === 0

          return (
            <div
              key={entry.player.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 20,
                padding: '20px 24px',
                borderRadius: 20,
                background: isFirst
                  ? 'rgba(212,175,55,0.08)'
                  : 'rgba(255,255,255,0.03)',
                border: isFirst
                  ? '1px solid rgba(212,175,55,0.25)'
                  : '1px solid rgba(255,255,255,0.06)',
                boxShadow: isFirst
                  ? '0 0 24px 4px rgba(212,175,55,0.06)'
                  : 'none',
              }}
            >
              {/* Rank */}
              <div
                style={{
                  width: 40,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    fontSize: isFirst ? 24 : 22,
                    fontWeight: 800,
                    color: isFirst ? '#D4AF37' : 'rgba(255,255,255,0.25)',
                  }}
                >
                  {i + 1}
                </span>
              </div>

              {/* Avatar circle */}
              <div
                style={{
                  width: 52,
                  height: 52,
                  borderRadius: '50%',
                  background: `linear-gradient(135deg, ${avatarColor} 0%, ${avatarColor}88 100%)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  boxShadow: `0 0 12px 2px ${avatarColor}30`,
                  border: `2px solid ${avatarColor}44`,
                }}
              >
                <span
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: '#ffffff',
                    letterSpacing: '0.04em',
                    lineHeight: 1,
                    textShadow: '0 1px 3px rgba(0,0,0,0.4)',
                  }}
                >
                  {getPlayerInitials(entry.player.name)}
                </span>
              </div>

              {/* Name */}
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: isFirst ? '#ffffff' : 'rgba(255,255,255,0.75)',
                    lineHeight: 1.3,
                  }}
                >
                  {entry.player.name}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 400,
                    color: 'rgba(255,255,255,0.35)',
                    letterSpacing: '0.01em',
                  }}
                >
                  Draft {entry.ensembleScore} &nbsp;&middot;&nbsp; Picks {entry.confidenceScore} &nbsp;&middot;&nbsp; Bingo {entry.bingoScore}
                </span>
              </div>

              {/* Score */}
              <div
                style={{
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 4,
                }}
              >
                <span
                  style={{
                    fontSize: 32,
                    fontWeight: 800,
                    color: isFirst ? '#D4AF37' : 'rgba(255,255,255,0.85)',
                    lineHeight: 1,
                  }}
                >
                  {entry.totalScore}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 400,
                    color: 'rgba(255,255,255,0.25)',
                  }}
                >
                  pt
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── 4. Footer ──────────────────────────────────────────────────────── */}
      <div
        style={{
          height: 100,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        {/* Thin divider above footer */}
        <div
          style={{
            width: 120,
            height: 1,
            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.08), transparent)',
            marginBottom: 4,
          }}
        />
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'rgba(212,175,55,0.35)',
            letterSpacing: '0.20em',
            textTransform: 'uppercase',
          }}
        >
          Oscars Party 26
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 400,
            color: 'rgba(255,255,255,0.15)',
            letterSpacing: '0.12em',
          }}
        >
          Room {roomCode}
        </div>
      </div>
    </div>
  )
}
