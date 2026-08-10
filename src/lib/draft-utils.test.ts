import { describe, expect, it } from 'vitest'
import { generateSnakeOrder, getCurrentDrafter, getRoundAndPick } from './draft-utils'

describe('generateSnakeOrder', () => {
  it('reverses every other round', () => {
    expect(generateSnakeOrder(['A', 'B', 'C', 'D'], 3)).toEqual([
      'A', 'B', 'C', 'D',
      'D', 'C', 'B', 'A',
      'A', 'B', 'C', 'D',
    ])
  })

  it('alternates AB BA AB with two players', () => {
    // Documented as correct-but-repetitive: with 2 players the snake reads
    // A,B,B,A,A,B. Pinned so nobody "fixes" it into strict alternation.
    expect(generateSnakeOrder(['A', 'B'], 3)).toEqual(['A', 'B', 'B', 'A', 'A', 'B'])
  })

  it('produces playerCount x rounds entries', () => {
    expect(generateSnakeOrder(['A', 'B', 'C'], 5)).toHaveLength(15)
  })

  it('does not mutate the caller of record', () => {
    const players = ['A', 'B', 'C']
    generateSnakeOrder(players, 4)
    expect(players).toEqual(['A', 'B', 'C'])
  })

  it('returns nothing for zero rounds or no players', () => {
    expect(generateSnakeOrder(['A', 'B'], 0)).toEqual([])
    expect(generateSnakeOrder([], 3)).toEqual([])
  })
})

describe('getCurrentDrafter', () => {
  const order = ['A', 'B', 'B', 'A']

  it('reads the player at the pick number', () => {
    expect(getCurrentDrafter(order, 0)).toBe('A')
    expect(getCurrentDrafter(order, 2)).toBe('B')
  })

  it('falls back to the first player past the end of the draft', () => {
    // Guards the window between the last pick and the phase change to confidence.
    expect(getCurrentDrafter(order, 99)).toBe('A')
  })

  it('returns null when there is no order at all', () => {
    expect(getCurrentDrafter([], 0)).toBeNull()
  })
})

describe('getRoundAndPick', () => {
  const order = ['A', 'B', 'C', 'D']

  it('converts a flat pick number into round and pick-in-round', () => {
    expect(getRoundAndPick(order, 0, 4)).toEqual({ round: 1, pickInRound: 1 })
    expect(getRoundAndPick(order, 3, 4)).toEqual({ round: 1, pickInRound: 4 })
    expect(getRoundAndPick(order, 4, 4)).toEqual({ round: 2, pickInRound: 1 })
    expect(getRoundAndPick(order, 7, 4)).toEqual({ round: 2, pickInRound: 4 })
  })

  it('numbers positionally regardless of which way the round flows', () => {
    // Round 2 runs D,C,B,A but pick 4 is still "round 2, pick 1".
    expect(getRoundAndPick(order, 4, 4).pickInRound).toBe(1)
  })

  it('survives a zero player count instead of dividing by zero', () => {
    expect(getRoundAndPick(order, 3, 0)).toEqual({ round: 4, pickInRound: 1 })
  })
})
