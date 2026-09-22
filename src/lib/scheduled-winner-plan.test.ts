import { describe, expect, it } from 'vitest'
import {
  buildScheduledWinnerPlan,
  composeScheduledWinnerAnnouncement,
  formatScheduledWinnerPlanTable,
  readScheduledWinnerEntries,
  type ScheduledWinnerCatalog,
  type ScheduledWinnerEntry,
} from './scheduled-winner-plan'

const AUTHORITY = "MTV's official post"
const SOURCE = 'https://www.mtv.com/news/vma-2026-winners'

const CATALOG: ScheduledWinnerCatalog = {
  room: {
    code: 'VMAS',
    phase: 'live',
    game_model: 'legacy_ensemble',
    show_pack_id: 'pack-1',
  },
  categories: [
    { id: 11, name: 'Video of the Year', show_pack_id: 'pack-1', room_id: null },
    { id: 12, name: 'Best Pop', show_pack_id: 'pack-1', room_id: null },
    { id: 13, name: 'Best New Artist', show_pack_id: 'pack-1', room_id: null },
    // A room-owned declaration row that happens to share a pack title. The
    // database command only accepts pack-owned rows, so it must never resolve.
    { id: 99, name: 'Video of the Year', show_pack_id: null, room_id: 'room-1' },
  ],
  nominees: [
    { id: 'n1', name: 'Ava Vale', pack_key: 'ava-vale' },
    { id: 'n2', name: 'Kilo Nine', pack_key: 'kilo-nine' },
    { id: 'n3', name: 'Ava Vale', pack_key: 'ava-vale-dj' },
  ],
  candidates: [
    { category_id: 11, nominee_id: 'n1' },
    { category_id: 11, nominee_id: 'n2' },
    { category_id: 12, nominee_id: 'n1' },
    { category_id: 12, nominee_id: 'n3' },
    { category_id: 13, nominee_id: 'n2' },
  ],
  declared: [],
}

function catalog(overrides: Partial<ScheduledWinnerCatalog> = {}): ScheduledWinnerCatalog {
  return { ...CATALOG, ...overrides }
}

function entry(
  category: string,
  winner: string,
  source: string = SOURCE,
): ScheduledWinnerEntry {
  return { category, winner, source }
}

function plan(entries: ScheduledWinnerEntry[], overrides: Partial<ScheduledWinnerCatalog> = {}) {
  return buildScheduledWinnerPlan({
    ...catalog(overrides),
    entries,
    authority: AUTHORITY,
  })
}

describe('reading the authored declaration list', () => {
  it('reads a closed list of category, winner and source in order', () => {
    const result = readScheduledWinnerEntries({
      declarations: [
        { category: 'Best Pop', winner: 'ava-vale', source: SOURCE },
        { category: 'Best New Artist', winner: 'Kilo Nine', source: SOURCE },
      ],
    })
    expect(result.failures).toEqual([])
    expect(result.entries).toEqual([
      { category: 'Best Pop', winner: 'ava-vale', source: SOURCE },
      { category: 'Best New Artist', winner: 'Kilo Nine', source: SOURCE },
    ])
  })

  it('refuses an entry with no source URL and names the entry', () => {
    const result = readScheduledWinnerEntries({
      declarations: [
        { category: 'Best Pop', winner: 'Ava Vale', source: SOURCE },
        { category: 'Best New Artist', winner: 'Kilo Nine', source: '   ' },
      ],
    })
    expect(result.entries).toEqual([])
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0]).toContain('entry 2 ("Best New Artist")')
    expect(result.failures[0]).toContain('source URL')
  })

  it('refuses an entry whose source is not an http or https URL', () => {
    const result = readScheduledWinnerEntries({
      declarations: [{ category: 'Best Pop', winner: 'Ava Vale', source: 'ask a friend' }],
    })
    expect(result.failures[0]).toContain('entry 1 ("Best Pop")')
    expect(result.failures[0]).toContain('http')
  })

  it('refuses a key the closed list does not define', () => {
    const result = readScheduledWinnerEntries({
      declarations: [
        { category: 'Best Pop', winner: 'Ava Vale', source: SOURCE, note: 'probably' },
      ],
    })
    expect(result.failures[0]).toContain('note')
  })

  it('refuses a document that is not a declarations list', () => {
    expect(readScheduledWinnerEntries({ winners: [] }).failures[0]).toContain('declarations')
    expect(readScheduledWinnerEntries({ declarations: [] }).failures[0]).toContain('declares nothing')
  })
})

describe('resolving entries against the room catalog', () => {
  it('matches a category title exactly and an artist by pack key', () => {
    const result = plan([entry('Best New Artist', 'kilo-nine')])
    expect(result.failures).toEqual([])
    expect(result.declarations).toEqual([
      {
        order: 1,
        category_id: 13,
        category_name: 'Best New Artist',
        winner_id: 'n2',
        winner_name: 'Kilo Nine',
        source: SOURCE,
        announcement: "Winner — Kilo Nine · Best New Artist · declared from MTV's official post: " + SOURCE,
      },
    ])
  })

  it('matches a category title and a display name without regard to case', () => {
    const result = plan([entry('  bEsT nEw ArTiSt ', 'kilo nine')])
    expect(result.failures).toEqual([])
    expect(result.declarations[0].category_id).toBe(13)
    expect(result.declarations[0].winner_id).toBe('n2')
  })

  it('prefers the artist id over a display name that collides with it', () => {
    const result = plan([entry('Best Pop', 'n3')])
    expect(result.failures).toEqual([])
    expect(result.declarations[0].winner_id).toBe('n3')
  })

  it('fails closed when a display name matches two candidates', () => {
    const result = plan([entry('Best Pop', 'Ava Vale')])
    expect(result.declarations).toEqual([])
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0]).toContain('entry 1 ("Best Pop")')
    expect(result.failures[0]).toContain('Ava Vale')
    expect(result.failures[0]).toContain('n1')
    expect(result.failures[0]).toContain('n3')
  })

  it('fails closed when two pack categories share a title', () => {
    const result = plan([entry('Best Pop', 'n1')], {
      categories: [
        { id: 12, name: 'Best Pop', show_pack_id: 'pack-1', room_id: null },
        { id: 14, name: 'best pop', show_pack_id: 'pack-1', room_id: null },
      ],
    })
    expect(result.declarations).toEqual([])
    expect(result.failures[0]).toContain('entry 1 ("Best Pop")')
    expect(result.failures[0]).toContain('12')
    expect(result.failures[0]).toContain('14')
  })

  it('never resolves a room-owned declaration row that shares a pack title', () => {
    const result = plan([entry('Video of the Year', 'n1')], {
      categories: [{ id: 99, name: 'Video of the Year', show_pack_id: null, room_id: 'room-1' }],
    })
    expect(result.declarations).toEqual([])
    expect(result.failures[0]).toContain('no pack-owned category')
  })

  it('fails closed when the winner is not a candidate in that category', () => {
    const result = plan([entry('Best New Artist', 'Ava Vale')])
    expect(result.declarations).toEqual([])
    expect(result.failures[0]).toContain('entry 1 ("Best New Artist")')
    expect(result.failures[0]).toContain('Ava Vale')
  })

  it('fails closed when an artist id names someone outside the candidate set', () => {
    const result = plan([entry('Best New Artist', 'n1')])
    expect(result.declarations).toEqual([])
    expect(result.failures[0]).toContain('not a candidate')
  })
})

describe('refusals that protect an already-resolved room', () => {
  it('refuses a category that already has a declared winner and names them', () => {
    const result = plan([entry('Video of the Year', 'Kilo Nine')], {
      declared: [{ category_id: 11, winner_id: 'n1', tie_winner_id: null }],
    })
    expect(result.declarations).toEqual([])
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0]).toContain('entry 1 ("Video of the Year")')
    expect(result.failures[0]).toContain('Ava Vale')
  })

  it('names both winners when the resolved category was a tie', () => {
    const result = plan([entry('Best Pop', 'n1')], {
      declared: [{ category_id: 12, winner_id: 'n1', tie_winner_id: 'n3' }],
    })
    expect(result.failures[0]).toContain('Ava Vale')
  })

  it('refuses the same category twice in one input', () => {
    const result = plan([
      entry('Video of the Year', 'Kilo Nine'),
      entry('Best Pop', 'n1'),
      entry('video of the year', 'Ava Vale'),
    ])
    expect(result.declarations).toEqual([])
    expect(result.failures).toHaveLength(1)
    expect(result.failures[0]).toContain('entry 3 ("video of the year")')
    expect(result.failures[0]).toContain('entry 1')
  })

  it('refuses a room that is not live', () => {
    const result = plan([entry('Best New Artist', 'n2')], {
      room: { ...CATALOG.room, phase: 'finished' },
    })
    expect(result.declarations).toEqual([])
    expect(result.failures[0]).toContain('finished')
    expect(result.failures[0]).toContain('live')
  })

  it('refuses a room that is not on the scheduled winner model', () => {
    const result = plan([entry('Best New Artist', 'n2')], {
      room: { ...CATALOG.room, game_model: 'conviction_portfolio' },
    })
    expect(result.declarations).toEqual([])
    expect(result.failures[0]).toContain('legacy_ensemble')
  })

  it('reports every refusal at once rather than only the first', () => {
    const result = plan([
      entry('Best Pop', 'Ava Vale'),
      entry('Best Rock', 'n2'),
    ])
    expect(result.failures).toHaveLength(2)
  })
})

describe('the declaration order the operator sees and applies', () => {
  it('keeps output order equal to input order, not slate order', () => {
    const result = plan([
      entry('Best New Artist', 'n2'),
      entry('Video of the Year', 'Kilo Nine'),
      entry('Best Pop', 'ava-vale'),
    ])
    expect(result.failures).toEqual([])
    expect(result.declarations.map((row) => row.order)).toEqual([1, 2, 3])
    expect(result.declarations.map((row) => row.category_id)).toEqual([13, 11, 12])
    expect(formatScheduledWinnerPlanTable(result.declarations).slice(1).map((line) => line.trim()))
      .toEqual([
        `1  Best New Artist    Kilo Nine  ${SOURCE}`,
        `2  Video of the Year  Kilo Nine  ${SOURCE}`,
        `3  Best Pop           Ava Vale   ${SOURCE}`,
      ])
  })
})

describe('the public announcement', () => {
  it('says the result came from the cited official post', () => {
    expect(composeScheduledWinnerAnnouncement({
      categoryName: 'Best Pop',
      winnerName: 'Ava Vale',
      authority: AUTHORITY,
      source: SOURCE,
    })).toBe(`Winner — Ava Vale · Best Pop · declared from MTV's official post: ${SOURCE}`)
  })
})
