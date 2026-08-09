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
  const config = AVATAR_CONFIGS.find((a) => a.id === avatarId)
  return {
    primary: config?.colorPrimary ?? '#888888',
    secondary: config?.colorSecondary ?? '#444444',
  }
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

  return (
    <div
      style={{
        width: 1080,
        height: 1350,
        background: 'linear-gradient(135deg, #0A0E27 0%, #12163A 100%)',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Glow tinted to the player rather than to gold — this card is theirs. */}
      <div
        style={{
          position: 'absolute',
          top: 120,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 760,
          height: 560,
          background: `radial-gradient(ellipse, ${colors.primary}22 0%, ${colors.primary}08 55%, transparent 75%)`,
          pointerEvents: 'none',
        }}
      />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{ paddingTop: 76, textAlign: 'center', zIndex: 1 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'rgba(212,175,55,0.65)',
            letterSpacing: '0.32em',
            textTransform: 'uppercase',
            marginBottom: 12,
          }}
        >
          House of the Dragon
        </div>
        <div
          style={{
            fontSize: 15,
            fontWeight: 400,
            color: 'rgba(255,255,255,0.30)',
            letterSpacing: '0.20em',
          }}
        >
          SEASON 3 FINALE
        </div>
      </div>

      {/* ── Avatar ─────────────────────────────────────────────────────────── */}
      <div
        style={{
          marginTop: 64,
          width: 180,
          height: 180,
          borderRadius: 90,
          background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 100%)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 76,
          fontWeight: 800,
          color: '#ffffff',
          zIndex: 1,
        }}
      >
        {award.playerName.charAt(0).toUpperCase()}
      </div>

      <div
        style={{
          marginTop: 22,
          fontSize: 34,
          fontWeight: 600,
          color: 'rgba(255,255,255,0.85)',
          zIndex: 1,
        }}
      >
        {award.playerName}
      </div>

      {/* ── The title ──────────────────────────────────────────────────────── */}
      <div
        style={{
          marginTop: 30,
          fontSize: 68,
          fontWeight: 800,
          color: '#D4AF37',
          letterSpacing: '0.01em',
          textAlign: 'center',
          lineHeight: 1.05,
          padding: '0 70px',
          zIndex: 1,
        }}
      >
        {award.title}
      </div>

      <div
        style={{
          marginTop: 24,
          padding: '12px 28px',
          borderRadius: 999,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.12)',
          fontSize: 22,
          color: 'rgba(255,255,255,0.65)',
          zIndex: 1,
        }}
      >
        {award.stat}
      </div>

      {/* ── The verdict. Omitted entirely if generation failed — the card is
             composed to close cleanly without it rather than leave a hole. ── */}
      {verdict && (
        <div
          style={{
            marginTop: 46,
            padding: '0 96px',
            textAlign: 'center',
            zIndex: 1,
          }}
        >
          <div
            style={{
              fontSize: 27,
              lineHeight: 1.55,
              color: 'rgba(255,255,255,0.78)',
              fontStyle: 'italic',
            }}
          >
            &ldquo;{verdict.verdict}&rdquo;
          </div>
          <div
            style={{
              marginTop: 20,
              fontSize: 20,
              color: 'rgba(255,255,255,0.38)',
              letterSpacing: '0.06em',
            }}
          >
            — {companion?.name ?? verdict.companion_id}
          </div>
        </div>
      )}

      {/* ── Footer: placing + the link that makes this shareable ───────────── */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 190,
          borderTop: '1px solid rgba(255,255,255,0.08)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
        }}
      >
        <div style={{ fontSize: 30, fontWeight: 700, color: 'rgba(255,255,255,0.80)' }}>
          {entry ? `#${entry.rank} of the night · ${entry.totalScore} pts` : `Room ${roomCode}`}
        </div>
        <div
          style={{
            fontSize: 19,
            color: 'rgba(212,175,55,0.60)',
            letterSpacing: '0.08em',
          }}
        >
          {recapUrl}
        </div>
      </div>
    </div>
  )
}
