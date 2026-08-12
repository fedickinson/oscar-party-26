import { describe, expect, it } from 'vitest'
import { resolvePlayerReclaim } from './player-reclaim'

const players = [
  { id: 'player-a', name: 'Lady Aparaj', avatar_id: 'stark' },
  { id: 'player-b', name: 'Tom and Betty', avatar_id: 'hightower' },
]

describe('resolvePlayerReclaim', () => {
  it('recognizes one exact name after trimming and case folding', () => {
    expect(resolvePlayerReclaim(players, '  lady APARAJ ')).toEqual({
      status: 'match',
      player: players[0],
    })
  })

  it('does not broaden exact-name ownership or treat a blank name as a seat', () => {
    expect(resolvePlayerReclaim(players, 'Lady')).toEqual({ status: 'none' })
    expect(resolvePlayerReclaim(players, 'Tom & Betty')).toEqual({ status: 'none' })
    expect(resolvePlayerReclaim(players, '   ')).toEqual({ status: 'none' })
  })

  it('refuses to choose between duplicate exact names', () => {
    expect(resolvePlayerReclaim([
      ...players,
      { id: 'player-c', name: 'LADY APARAJ', avatar_id: 'tully' },
    ], 'Lady Aparaj')).toEqual({
      status: 'ambiguous',
      matches: 2,
    })
  })
})
