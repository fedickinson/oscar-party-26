import { describe, expect, it } from 'vitest'
import { renderPlayerRecapHtml } from './player-recap-html'
import type { PlayerRecapData } from './player-recap'

function recapWithRosterPortrait(): PlayerRecapData {
  return {
    roomCode: 'PROOF',
    playerName: 'Frankie',
    avatarColors: { primary: '#000000', secondary: '#111111' },
    avatarId: 'targaryen',
    title: 'Kept the Watch',
    titleIsBespoke: false,
    titleBlurb: 'A proof record.',
    titleStat: '4 points',
    verdict: null,
    rank: 1,
    playerCount: 1,
    totalScore: 4,
    confidenceScore: 0,
    ensembleScore: 4,
    bingoScore: 0,
    roster: [{
      name: 'Aegon & Sunfyre',
      portrait: {
        src: 'data:image/jpeg;base64,proof',
        alt: 'Aegon & Sunfyre portrait',
      },
      kind: 'character',
      pickNumber: 1,
      round: 1,
      points: 4,
      wins: [],
    }],
    draft: { totalPoints: 4, best: null, blanks: [], passedOn: null },
    predictions: [],
    predictionSummary: { hits: 0, total: 0, banked: 0, strandedPoints: 0 },
    moments: [],
    bingo: null,
    lines: [],
    imagery: {},
    recapUrl: 'https://example.test/recap/PROOF/player',
  }
}

describe('renderPlayerRecapHtml roster portraits', () => {
  it('embeds the fetched story portrait without weakening HTML escaping', () => {
    const html = renderPlayerRecapHtml(recapWithRosterPortrait())
    expect(html).toContain('class="roster-portrait"')
    expect(html).toContain('src="data:image/jpeg;base64,proof"')
    expect(html).toContain('alt="Aegon &amp; Sunfyre portrait"')
  })
})
