/**
 * watch-groups.ts — pure helpers for who shares a screen with whom.
 *
 * THE RULE
 * A player with no stated location is on their OWN screen, alone. That is not a
 * missing value to be chased down — it is a valid, complete answer, and it is
 * the safest possible default: grouping someone with strangers by accident is
 * far worse than treating them as solo.
 *
 * Because a solo watcher is the only person on their screen, they are their own
 * remote-holder by definition. Nobody else could be. So there is no state in
 * which somebody is unable to pause, and no reason to block the game on it.
 *
 * No React, no Supabase. Unit-testable.
 */

import type { PlayerRow } from '../types/database'

/** True when this player is on a screen of their own. */
export function isSoloWatcher(p: PlayerRow): boolean {
  return !p.watch_group
}

/**
 * The screen this player is on. Solo watchers get a synthetic key off their id
 * so they can never collide with each other or with a named location.
 */
export function screenKey(p: PlayerRow): string {
  return p.watch_group ?? `solo:${p.id}`
}

/** Human label for a screen — a place name, or the person's own name. */
export function screenLabel(p: PlayerRow): string {
  return p.watch_group ?? `${p.name} (on their own)`
}

/**
 * Everyone who can pause. Explicit holders in named locations, plus every solo
 * watcher, who holds their own remote by definition.
 */
export function remoteHolderIds(players: PlayerRow[]): string[] {
  return players
    .filter((p) => p.is_remote_holder || isSoloWatcher(p))
    .map((p) => p.id)
}

/** Named locations only — solo watchers are never "missing" a holder. */
export function namedLocationsWithoutRemote(players: PlayerRow[]): string[] {
  const named = Array.from(
    new Set(players.map((p) => p.watch_group).filter((g): g is string => !!g)),
  )
  return named.filter(
    (loc) => !players.some((p) => p.watch_group === loc && p.is_remote_holder),
  )
}
