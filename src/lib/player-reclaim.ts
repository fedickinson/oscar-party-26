export interface ReclaimablePlayer {
  id: string
  name: string
  avatar_id: string
}

export type PlayerReclaimResolution<T extends ReclaimablePlayer> =
  | { status: 'none' }
  | { status: 'match'; player: T }
  | { status: 'ambiguous'; matches: number }

function normalizedExactName(name: string): string {
  return name.trim().toLocaleLowerCase('en-US')
}

/**
 * Resolves seat ownership without broadening the live rule: only one exact
 * name match, ignoring outer whitespace and case, can reclaim a player row.
 */
export function resolvePlayerReclaim<T extends ReclaimablePlayer>(
  players: T[],
  enteredName: string,
): PlayerReclaimResolution<T> {
  const name = normalizedExactName(enteredName)
  if (!name) return { status: 'none' }

  const matches = players.filter((player) => normalizedExactName(player.name) === name)
  if (matches.length === 0) return { status: 'none' }
  if (matches.length > 1) return { status: 'ambiguous', matches: matches.length }
  return { status: 'match', player: matches[0] }
}
