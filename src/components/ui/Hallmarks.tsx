/**
 * Hallmarks.tsx — the hero marks of the game.
 *
 * Four marks, drawn at hero quality (not the 20px utility set):
 *   hallmark-iron-throne — "Event Resolved" seal on winner proclamations (neutral;
 *                          deliberately NOT faction-colored — the shared moment)
 *   hallmark-dance       — master mark: two dragons, Black and Green, circling.
 *                          Use hallmark-dance-small below 24px.
 *   hallmark-claim       — the Draft: a dragon with wings mantled, taking possession
 *   hallmark-signet      — confidence 24: a signet pressed into wax; accepts any
 *                          house device via <HallmarkSignet device="stark" />
 *
 * All marks are themeable: they resolve currentColor and the --t-* / --personal-*
 * token layer, so they recolor under [data-theme] and [data-allegiance] for free.
 *
 * <HallmarkDefs /> must be mounted once at the app root (App.tsx) — the marks
 * reference its <symbol> definitions via <use>.
 */

import rawSymbols from './hallmarks-symbols.svg?raw'

export function HallmarkDefs() {
  return (
    <div
      style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: rawSymbols }}
    />
  )
}

export type HallmarkId =
  | 'hallmark-iron-throne'
  | 'hallmark-dance'
  | 'hallmark-dance-small'
  | 'hallmark-claim'
  | 'hallmark-signet'
  | 'hallmark-comet'
  | 'hallmark-collision'
  | 'hallmark-horn'
  | 'hallmark-dance-hero'

interface HallmarkProps {
  id: HallmarkId
  size?: number
  className?: string
}

export function Hallmark({ id, size = 48, className = '' }: HallmarkProps) {
  // The Dance has a dedicated small optical size — drawn, not scaled.
  const resolved = id === 'hallmark-dance' && size <= 24 ? 'hallmark-dance-small' : id
  return (
    <svg width={size} height={size} className={className} aria-hidden>
      <use href={`#${resolved}`} />
    </svg>
  )
}
