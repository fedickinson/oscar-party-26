/**
 * PlayerShareCard — the card ONE player shares about their own night.
 *
 * WHY A SECOND SHARE CARD
 * The standings card is a scoreboard: identical for all six players, and only
 * flattering to one of them. Nobody posts a picture of themselves finishing
 * fourth. This card is about the person holding the phone — their title, the
 * passage a companion wrote about them, their line of the scoreboard — so there
 * is something worth posting regardless of where they placed.
 *
 * RENDERED OFF-SCREEN AND CAPTURED
 * Every style here is inline and every dimension is fixed. html-to-image
 * rasterises a detached DOM node with no stylesheet cascade and no layout
 * context, so Tailwind classes and relative units resolve to nothing. Same
 * constraint ShareCard works under.
 */

import { AVATAR_CONFIGS } from '../../data/avatars'
import { PLAYER_AVATARS } from '../../data/avatar-config'
import { getCompanionById } from '../../data/ai-companions'
import type { ScoredPlayer } from '../../lib/scoring'
import type { PlayerAward } from '../../lib/night-awards'
import type { PlayerVerdictRow } from '../../types/database'

export interface PlayerShareCardProps {
  award: PlayerAward
  entry: ScoredPlayer | undefined
  verdict: PlayerVerdictRow | undefined
  roomCode: string
  /** Absolute URL of the public recap, printed as the footer call to action. */
  recapUrl: string
}

function playerColors(avatarId: string): { primary: string; secondary: string } {
  // House-sigil ids first (the live roster); legacy Oscars cast as fallback.
  const house = PLAYER_AVATARS.find((a) => a.id === avatarId)
  if (house) return { primary: house.color, secondary: '#6E665B' }
  const config = AVATAR_CONFIGS.find((a) => a.id === avatarId)
  return {
    primary: config?.colorPrimary ?? '#6E665B',
    secondary: config?.colorSecondary ?? '#4A443C',
  }
}

type HouseKey =
  | 'targaryen'
  | 'hightower'
  | 'stark'
  | 'lannister'
  | 'velaryon'
  | 'baratheon'
  | 'blackwood'

function houseForAvatar(avatarId: string): HouseKey {
  const normalized = avatarId.toLowerCase()
  if (normalized.includes('hightower')) return 'hightower'
  if (normalized.includes('stark')) return 'stark'
  if (normalized.includes('lannister')) return 'lannister'
  if (normalized.includes('velaryon')) return 'velaryon'
  if (normalized.includes('baratheon')) return 'baratheon'
  if (normalized.includes('blackwood')) return 'blackwood'
  return 'targaryen'
}

function HouseDevice({ house }: { house: HouseKey }) {
  if (house === 'hightower') {
    return <path fill="#451d18" d="M24 88h52v9H24zm6-14h40l4 14H26zm6-18h28l4 18H32zm5-19h18l3 19H38zM36 29h28v10H36zm7-9h14v9H43zM50 2c3 8 11 11 8 19-2 5-6 7-8 11-2-4-8-6-8-11 0-7 5-11 8-19Z" />
  }
  if (house === 'stark') {
    return <path fill="#451d18" d="m15 15 24 14 18-10L84 8l-7 23 12 19-16 7-7 24-17 14-19-14-9-24-12-9 13-19Zm18 31 13 5 8-4 14 5-10 7-9 14-10-14-12-6Zm2-8 9-3-5 9Zm29-3 9 5-11 3Z" />
  }
  if (house === 'lannister') {
    return <path fill="#451d18" d="M61 8c-11 0-20 8-19 19l-13-6 3 13-13 5 15 8-10 14 15-2-3 21 13-11 8 23 7-21 17 9-7-20 16 1-13-15 12-11-18-2 5-15-15 7C76 15 70 8 61 8Zm-3 15 9 6-9 8-9-8Zm-9 26 10-7 8 9-6 11-12-2Zm6 17 8 2-4 12-8-8Z" />
  }
  if (house === 'velaryon') {
    return <path fill="#451d18" d="M58 7c-16 3-26 16-23 31 2 9 9 14 17 17-11 2-20 11-20 22 0 9 7 16 16 16 13 0 22-11 20-23-2-9-10-15-18-15 8-4 14-11 14-20 0-7-3-12-8-16l13-3-7-5 8-6ZM36 38c-12-8-22-6-29 2 8 0 13 4 16 10-7-1-12 2-14 7 13-1 19 7 29 9l8-13c-5-3-8-8-10-15Z" />
  }
  if (house === 'baratheon') {
    return <path fill="#451d18" d="M47 24 35 8l-4 18-17-9 8 20-15 4 20 12-7 27 21-9 9 24 9-24 21 9-7-27 20-12-15-4 8-20-17 9-4-18-12 16ZM30 45c8-12 32-16 43-1-9 0-15 3-20 10v28H43V54c-4-7-8-9-13-9Z" />
  }
  if (house === 'blackwood') {
    return <path fill="#451d18" d="M45 93V60L31 71l5-19-22 5 16-16-20-8 25-3-8-18 20 14L50 4l4 22 19-14-8 18 25 3-20 8 16 16-22-5 5 19-14-11v33ZM17 18c5-7 12-9 20-7-5 4-7 8-7 13-5-4-9-5-13-6Zm66 0c-5-7-12-9-20-7 5 4 7 8 7 13 5-4 9-5 13-6Z" />
  }
  return <path fill="#451d18" d="M50 48C39 33 25 29 10 37c9 3 14 8 18 15-9-3-16 0-20 6 13 1 19 10 28 17 6 4 12 5 18 3-8-7-11-14-8-23 3-8 6-13 4-24-1-10-7-20-17-25 4 8 4 14 1 19-5-7-11-9-18-4 9 4 12 11 13 19 8-2 14 1 21 8Zm0 0c11-15 25-19 40-11-9 3-14 8-18 15 9-3 16 0 20 6-13 1-19 10-28 17-6 4-12 5-18 3 8-7 11-14 8-23-3-8-6-13-4-24 1-10 7-20 17-25-4 8-4 14-1 19 5-7 11-9 18-4-9 4-12 11-13 19-8-2-14 1-21 8Zm0 8c-12 5-18 13-16 23 2 11 12 17 22 14 10-2 15-11 12-19-2-6-7-10-13-11 4 5 4 10 0 13-5 4-11 1-11-5 0-5 3-9 6-11Z" />
}

function SignetMark({ house }: { house: HouseKey }) {
  return (
    <svg width="250" height="250" viewBox="0 0 120 120" aria-hidden="true">
      <path fill="#743226" d="M25 83c1-8 8-13 15-15 4-7 13-10 21-7 7-4 17-1 21 6 9 1 15 7 15 15 5 6 2 14-5 18-5 8-14 10-22 7-6 6-16 6-23 1-9 2-17-3-19-11-6-3-7-10-3-14Z" />
      <path fill="#451d18" d="M29 92c8 5 17 7 27 6 12 5 25 1 31-8l8-3c2 5 0 10-5 14-5 7-13 9-21 6-6 6-16 6-23 1-8 2-15-2-18-9Z" />
      <path fill="#a4513e" d="M28 82c5-7 13-10 21-9 7-7 19-8 27-2 7 0 13 3 17 8-8-3-15-2-21 1-11-4-23-2-31 5-5-1-9-1-13 1Z" />
      <ellipse cx="60" cy="84" rx="22" ry="16" fill="#bca982" />
      <g transform="translate(50 74) scale(.2)">
        <HouseDevice house={house} />
      </g>
      <path fill="#24231f" fillRule="evenodd" d="M78 9c12 2 19 12 17 24-1 9-8 16-17 18L68 66l-11-7 11-17c-5-5-7-12-5-19 2-10 7-16 15-14Zm1 8c-5-1-8 3-9 9-1 7 2 14 8 16 5 1 9-4 10-10 1-7-3-14-9-15Z" />
      <path fill="#4a4744" d="m65 48 13 8-11 20-17-11Z" />
      <path fill="#a2988a" d="M75 11c7-2 15 4 18 11-5-5-10-7-15-6-6 1-9 6-9 12-2-9 0-15 6-17Zm-7 39 5 3-12 18-6-4Z" />
      <path fill="#24231f" d="m50 62 19 12-5 11-22-13Z" />
      <path fill="#4a4744" d="m45 61 24 14-5 12-26-15Z" />
      <path fill="#a2988a" d="m45 61 24 14-2 4-24-14Z" />
      <path fill="none" stroke="#17161a" strokeWidth="2" strokeLinecap="round" d="M72 20c3-4 8-5 12-2m-30 48 13 8" />
    </svg>
  )
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
              <path d="M0 12 10 3l10 9-10 9Zm20 0 10-9 10 9-10 9Z" fill="none" stroke="#d6cdba" strokeWidth="1.6" />
              <circle cx="10" cy="12" r="2.2" fill="#d6cdba" />
              <circle cx="30" cy="12" r="2.2" fill="#d6cdba" />
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export function PlayerShareCard({
  award,
  entry,
  verdict,
  roomCode,
  recapUrl,
}: PlayerShareCardProps) {
  const colors = playerColors(entry?.player.avatar_id ?? '')
  const companion = verdict ? getCompanionById(verdict.companion_id) : null
  const house = houseForAvatar(entry?.player.avatar_id ?? '')
  const isGreen = house === 'hightower' || house === 'lannister' || house === 'baratheon'
  const factionField = isGreen ? '#2c4034' : '#101014'
  const factionDevice = isGreen ? '#b9863f' : '#8e3b2e'

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
        alignItems: 'center',
        overflow: 'hidden',
        position: 'relative',
        clipPath:
          'polygon(0.6% 0.2%, 8% 0.5%, 16% 0.1%, 25% 0.4%, 35% 0.1%, 45% 0.5%, 55% 0.1%, 65% 0.4%, 75% 0.1%, 85% 0.5%, 99.4% 0.2%, 99.7% 9%, 99.3% 18%, 99.8% 28%, 99.4% 39%, 99.8% 50%, 99.4% 61%, 99.8% 72%, 99.3% 83%, 99.7% 92%, 99.4% 99.8%, 90% 99.5%, 80% 99.9%, 70% 99.6%, 60% 99.9%, 50% 99.5%, 40% 99.9%, 30% 99.6%, 20% 99.9%, 10% 99.5%, 0.6% 99.8%, 0.3% 91%, 0.7% 81%, 0.2% 71%, 0.6% 61%, 0.2% 51%, 0.7% 41%, 0.2% 31%, 0.6% 21%, 0.2% 11%)',
      }}
    >
      {/* Allegiance appears only as a heraldic edge, leaving the vellum neutral. */}
      <div style={{ position: 'absolute', inset: '0 auto 0 0', width: 22, background: factionField }} />
      <div style={{ position: 'absolute', inset: '0 0 0 auto', width: 22, background: factionField }} />
      <div style={{ position: 'absolute', inset: '0 auto 0 22px', width: 7, background: factionDevice }} />
      <div style={{ position: 'absolute', inset: '0 22px 0 auto', width: 7, background: factionDevice }} />
      <div
        style={{
          position: 'absolute',
          inset: 20,
          border: '1px solid #292219',
          boxShadow: 'inset 0 0 0 5px rgba(102,86,66,0.18)',
          pointerEvents: 'none',
        }}
      />

      <div style={{ alignSelf: 'stretch', margin: '30px 32px 0' }}>
        <MotifBand />
      </div>

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div style={{ paddingTop: 38, textAlign: 'center', zIndex: 1 }}>
        <div
          style={{
            fontFamily: 'Cinzel, Georgia, serif',
            fontSize: 13,
            fontWeight: 700,
            color: '#665642',
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
            marginBottom: 7,
          }}
        >
          Party Night Presents
        </div>
        <div
          style={{
            fontFamily: 'Cinzel, Georgia, serif',
            fontSize: 31,
            fontWeight: 800,
            color: '#292219',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          Fire <span style={{ color: '#8e3b2e' }}>&amp;</span> Blood
        </div>
        <div
          style={{
            marginTop: 6,
            fontFamily: 'Cormorant Garamond, Georgia, serif',
            fontSize: 18,
            fontWeight: 700,
            color: '#665642',
            letterSpacing: '0.035em',
          }}
        >
          House of the Dragon — Season 3 Finale
        </div>
      </div>

      {/* ── Player and title ─────────────────────────────────────────────── */}
      <div
        style={{
          marginTop: 34,
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          zIndex: 1,
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)`,
            border: '2px solid #292219',
            boxShadow: 'inset 0 0 0 4px rgba(240,229,203,0.32)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: 'Cinzel, Georgia, serif',
            fontSize: 30,
            fontWeight: 800,
            color: '#f0e5cb',
          }}
        >
          {award.playerName.charAt(0).toUpperCase()}
        </div>
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: '#665642',
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
            }}
          >
            This night belongs to
          </div>
          <div
            style={{
              marginTop: 4,
              fontFamily: 'Cinzel, Georgia, serif',
              fontSize: 43,
              fontWeight: 800,
              color: '#292219',
              lineHeight: 1.05,
            }}
          >
            {award.playerName}
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 24,
          padding: '0 72px',
          maxWidth: 960,
          fontFamily: 'Cinzel, Georgia, serif',
          fontSize: 61,
          fontWeight: 800,
          color: factionDevice,
          letterSpacing: '0.01em',
          textAlign: 'center',
          lineHeight: 1.02,
          zIndex: 1,
        }}
      >
        {award.title}
      </div>

      <div
        style={{
          marginTop: 20,
          padding: '9px 26px 10px',
          borderTop: '3px double #665642',
          borderBottom: '3px double #665642',
          fontFamily: 'Cormorant Garamond, Georgia, serif',
          fontSize: 24,
          fontWeight: 700,
          color: '#292219',
          zIndex: 1,
        }}
      >
        {award.stat}
      </div>

      {/* ── House signet ─────────────────────────────────────────────────── */}
      <div
        style={{
          marginTop: 4,
          height: 258,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          filter: 'drop-shadow(8px 11px 7px rgba(8,8,7,0.25))',
          transform: 'rotate(-2deg)',
          zIndex: 1,
        }}
      >
        <SignetMark house={house} />
      </div>

      {/* ── The verdict. Omitted entirely if generation failed — the card is
             composed to close cleanly without it rather than leave a hole. ── */}
      {verdict && (
        <div
          style={{
            marginTop: -12,
            width: 830,
            padding: '18px 42px 15px',
            borderTop: '1px solid rgba(102,86,66,0.56)',
            borderBottom: '1px solid rgba(102,86,66,0.56)',
            textAlign: 'center',
            zIndex: 1,
          }}
        >
          <div
            style={{
              fontFamily: 'Cormorant Garamond, Georgia, serif',
              fontSize: 28,
              fontWeight: 700,
              lineHeight: 1.34,
              color: '#292219',
              fontStyle: 'italic',
            }}
          >
            &ldquo;{verdict.verdict}&rdquo;
          </div>
          <div
            style={{
              marginTop: 10,
              fontFamily: 'Cinzel, Georgia, serif',
              fontSize: 13,
              fontWeight: 700,
              color: '#665642',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}
          >
            — {companion?.name ?? verdict.companion_id}
          </div>
        </div>
      )}

      {/* ── Footer: placing + the link that makes this shareable ─────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 190,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          paddingTop: 24,
        }}
      >
        <div
          style={{
            width: 760,
            borderTop: '3px double #292219',
            paddingTop: 18,
            textAlign: 'center',
            fontFamily: 'Cinzel, Georgia, serif',
            fontSize: 25,
            fontWeight: 700,
            color: '#292219',
            fontVariantNumeric: 'tabular-nums lining-nums',
          }}
        >
          {entry ? `#${entry.rank} of the night · ${entry.totalScore} pts` : `Room ${roomCode}`}
        </div>
        <div
          style={{
            maxWidth: 880,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontSize: 17,
            fontWeight: 700,
            color: factionDevice,
            letterSpacing: '0.07em',
          }}
        >
          {recapUrl}
        </div>
        <div style={{ alignSelf: 'stretch', margin: '6px 32px 0' }}>
          <MotifBand />
        </div>
      </div>
    </div>
  )
}
