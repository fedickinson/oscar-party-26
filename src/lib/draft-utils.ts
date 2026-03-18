/**
 * Snake draft utilities — pure functions, zero side effects.
 *
 * These are deliberately free of React and Supabase so they can be:
 *   - Unit tested independently
 *   - Called safely on every render (no memoization required for correctness)
 *   - Reasoned about without understanding the app
 */

/**
 * Generates the full pick order for a snake draft.
 *
 * A "snake" draft alternates direction each round so later picks in one
 * round become earlier picks in the next. This balances advantage across
 * positions — being pick-1 in round 1 means being pick-last in round 2.
 *
 * Example — 4 players [A,B,C,D], 3 rounds:
 *   Round 1 (→): A  B  C  D
 *   Round 2 (←): D  C  B  A
 *   Round 3 (→): A  B  C  D
 *   Result: [A,B,C,D, D,C,B,A, A,B,C,D]
 *
 * The returned array has playerIds.length × rounds entries. If the total
 * entities available is fewer than this length, the draft ends early —
 * callers should cap at Math.min(snakeOrder.length, entityCount).
 */
export function generateSnakeOrder(playerIds: string[], rounds: number): string[] {
  const order: string[] = []
  for (let r = 0; r < rounds; r++) {
    // Even rounds go forward through players; odd rounds reverse.
    const roundPlayers = r % 2 === 0 ? playerIds : [...playerIds].reverse()
    order.push(...roundPlayers)
  }
  return order
}

/**
 * Returns the player ID whose turn it is.
 * pickNumber is 0-indexed (the first pick of the draft is pick 0).
 *
 * Falls back to snakeOrder[0] if pickNumber is out of range — this guards
 * against reading past the end during the brief window between draft
 * completion and the phase transition to 'confidence'.
 */
export function getCurrentDrafter(
  snakeOrder: string[],
  pickNumber: number,
): string | null {
  return snakeOrder[pickNumber] ?? snakeOrder[0] ?? null
}

/**
 * Converts a 0-indexed pick number to human-readable round and pick-in-round.
 *
 * Example — 4 players:
 *   pick 0  → Round 1, Pick 1
 *   pick 3  → Round 1, Pick 4
 *   pick 4  → Round 2, Pick 1
 *   pick 7  → Round 2, Pick 4
 *
 * NOTE: The snakeOrder parameter is accepted for API symmetry with the other
 * functions but is not used internally — round/pick numbers are positional
 * regardless of which direction the round flows.
 */
export function getRoundAndPick(
  _snakeOrder: string[],
  pickNumber: number,
  playerCount: number,
): { round: number; pickInRound: number } {
  const count = Math.max(1, playerCount)
  return {
    round: Math.floor(pickNumber / count) + 1,
    pickInRound: (pickNumber % count) + 1,
  }
}
