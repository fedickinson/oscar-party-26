import { describe, expect, it } from 'vitest'
import { deriveGmPulseReport } from './gm-pulse'

function message(id: string, playerId: string, text: string, second: number) {
  return {
    id,
    player_id: playerId,
    text,
    created_at: `2026-08-11T12:${Math.floor(second / 60).toString().padStart(2, '0')}:${(second % 60).toString().padStart(2, '0')}.000Z`,
  }
}

describe('deriveGmPulseReport', () => {
  it('derives complete player activity without the old recent-row cutoffs', () => {
    const players = [
      { id: 'host', name: 'Host', is_host: true, team: 'black' },
      { id: 'guest', name: 'Guest', is_host: false, team: null },
    ]
    const messages = [
      message('old-cast', 'ned', 'The record begins.', 1),
      message('old-host', 'host', 'Still here.', 2),
      message('old-declare', 'winner-divider', 'A turn — Vhagar · worth 5 · called by Host', 3),
      ...Array.from({ length: 1005 }, (_, index) => (
        message(`noise-${index.toString().padStart(4, '0')}`, 'guest', `Noise ${index}`, 60 + index)
      )),
    ]

    const report = deriveGmPulseReport({
      players,
      messages,
      cards: [{ id: 'host-card', player_id: 'host' }],
      marks: [
        { id: 'target-mark', card_id: 'host-card' },
        { id: 'foreign-mark', card_id: 'another-room-card' },
      ],
    })

    expect(report.players[0]).toMatchObject({
      player: players[0],
      last_chat_at: '2026-08-11T12:00:02.000Z',
      declaration_count: 1,
      declaration_attribution: 'exact',
      mark_count: 1,
    })
    expect(report.last_companion_at).toBe('2026-08-11T12:00:01.000Z')
  })

  it('refuses to attribute text-only declaration banners across duplicate names', () => {
    const players = [
      { id: 'one', name: 'Alex', is_host: true, team: null },
      { id: 'two', name: 'Alex', is_host: false, team: null },
    ]
    const report = deriveGmPulseReport({
      players,
      messages: [message('declare', 'winner-divider', 'A turn — Vhagar · worth 5 · called by Alex', 1)],
      cards: [],
      marks: [],
    })

    expect(report.players.map((row) => ({
      count: row.declaration_count,
      attribution: row.declaration_attribution,
    }))).toEqual([
      { count: null, attribution: 'ambiguous_name' },
      { count: null, attribution: 'ambiguous_name' },
    ])
  })

  it('returns exactly the last six public facts in chronological display order', () => {
    const facts = Array.from({ length: 8 }, (_, index) => (
      message(`fact-${index}`, index % 2 === 0 ? 'winner-divider' : 'system', `Fact ${index}`, index)
    ))
    const report = deriveGmPulseReport({ players: [], messages: facts, cards: [], marks: [] })

    expect(report.recent_facts.map((fact) => fact.id)).toEqual([
      'fact-2', 'fact-3', 'fact-4', 'fact-5', 'fact-6', 'fact-7',
    ])
  })
})
