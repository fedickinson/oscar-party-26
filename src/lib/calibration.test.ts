import { describe, expect, it } from 'vitest'
import {
  buildCalibrationObservations,
  buildCalibrationReport,
  renderCalibrationMarkdown,
  type BeatCalibrationObservation,
  type BingoCalibrationObservation,
} from './calibration'

const bingoObservations: BingoCalibrationObservation[] = [
  {
    squareId: 1,
    title: 'Likely event',
    tier: 'likely',
    probabilityPct: 70,
    playerId: 'player-a',
    marked: true,
  },
  {
    squareId: 1,
    title: 'Likely event',
    tier: 'likely',
    probabilityPct: 70,
    playerId: 'player-b',
    marked: false,
  },
  {
    squareId: 2,
    title: 'Chaos event',
    tier: 'chaos',
    probabilityPct: 10,
    playerId: 'player-a',
    marked: true,
  },
]

const beatObservations: BeatCalibrationObservation[] = [
  {
    entity: 'Aegon',
    beat: 'Aegon Sass',
    odds: 'likely',
    probabilityPct: 70,
    result: 'fired',
  },
  {
    entity: 'Daemon',
    beat: 'Makes Peace',
    odds: 'toss_up',
    probabilityPct: 45,
    result: 'missed',
  },
  {
    entity: 'Ulf',
    beat: 'Six Minute Bundle',
    odds: 'toss_up',
    probabilityPct: 40,
    result: 'bundled',
  },
  {
    entity: 'Unknown',
    beat: 'No authored match',
    odds: null,
    probabilityPct: null,
    result: 'fired',
  },
  {
    entity: 'Alicent',
    beat: 'Categorical only',
    odds: 'likely',
    probabilityPct: null,
    result: 'missed',
  },
]

describe('buildCalibrationReport', () => {
  it('keeps exposure denominators and excludes bundles and unmatched beats from calibration', () => {
    const report = buildCalibrationReport({
      roomCode: 'TEST',
      sourceLabel: 'settled test record',
      bingoObservations,
      beatObservations,
    })

    expect(report.bingo.coverage).toEqual({
      exposures: 3,
      uniqueSquares: 2,
      marks: 2,
    })
    expect(report.bingo.byTier).toEqual([
      {
        tier: 'likely',
        exposures: 2,
        marks: 1,
        observedRatePct: 50,
        meanAuthoredProbabilityPct: 70,
        calibrationGapPct: -20,
      },
      {
        tier: 'chaos',
        exposures: 1,
        marks: 1,
        observedRatePct: 100,
        meanAuthoredProbabilityPct: 10,
        calibrationGapPct: 90,
      },
    ])
    expect(report.bingo.items[0]).toMatchObject({
      squareId: 1,
      exposures: 2,
      marks: 1,
      observedRatePct: 50,
    })

    expect(report.beats.coverage).toEqual({
      observations: 5,
      calibrated: 3,
      bundled: 1,
      unmatched: 1,
      withNumericProbability: 2,
    })
    expect(report.beats.byOdds).toEqual([
      {
        odds: 'likely',
        eligible: 2,
        fired: 1,
        missed: 1,
        observedRatePct: 50,
        numericProbabilityCoverage: 1,
        comparableObservedRatePct: 100,
        meanAuthoredProbabilityPct: 70,
        calibrationGapPct: 30,
      },
      {
        odds: 'toss_up',
        eligible: 1,
        fired: 0,
        missed: 1,
        observedRatePct: 0,
        numericProbabilityCoverage: 1,
        comparableObservedRatePct: 0,
        meanAuthoredProbabilityPct: 45,
        calibrationGapPct: -45,
      },
    ])
    expect(report.beats.excluded).toEqual([
      {
        entity: 'Ulf', beat: 'Six Minute Bundle', reason: 'bundled',
      },
      {
        entity: 'Unknown', beat: 'No authored match', reason: 'missing authored odds',
      },
    ])
  })

  it('renders the single-episode and repeated-exposure caveats with coverage', () => {
    const report = buildCalibrationReport({
      roomCode: 'TEST',
      sourceLabel: 'settled test record',
      bingoObservations,
      beatObservations,
    })
    const markdown = renderCalibrationMarkdown(report)

    expect(markdown).toContain('one episode')
    expect(markdown).toContain('player-card exposures, not independent episode outcomes')
    expect(markdown).toContain('Bundled beat outcomes are excluded')
    expect(markdown).toContain('| likely | 2 | 1 | 50.0% | 70.0% | -20.0 pp |')
    expect(markdown).toContain('3 of 5 beat observations entered the calibrated denominator')
    expect(markdown).toContain('| likely | 2 | 1 | 1 | 50.0% | 1/2 | 100.0% | 70.0% | +30.0 pp |')
  })
})

describe('buildCalibrationObservations', () => {
  it('reconciles settled player cards to snapshot ids and preserves uncertain beat evidence', () => {
    const observations = buildCalibrationObservations({
      roomCode: 'WDKH',
      rooms: [{ id: 'room-1', code: 'WDKH' }],
      players: [{ id: 'player-1', room_id: 'room-1', name: 'Tom and Betty' }],
      bingoCards: [{ id: 'card-1', room_id: 'room-1', player_id: 'player-1', squares: [10, 0] }],
      bingoSquares: [{
        id: 10,
        short_text: 'Dragon Fight',
        likelihood_tier: 'toss_up',
        probability_pct: 45,
      }],
      draftEntities: [{ id: 'entity-1', name: 'Daemon' }],
      signatureBeats: [{
        id: 1,
        entity_id: 'entity-1',
        name: 'Makes Peace',
        odds: 'Coin flip',
      }],
      settledRecord: {
        'Tom & Betty': {
          card: [
            { short: 'Dragon Fight', marked: true, free: false },
            { short: 'FREE', marked: true, free: true },
          ],
          roster: [{
            char: 'Daemon',
            beats: [
              { beat: 'Makes Peace', fired: true },
              { beat: 'Combined ruling', fired: 'bundle' },
            ],
          }],
        },
      },
      authoredBeatProbabilities: [{
        entity: 'Daemon', beat: 'Makes Peace', probabilityPct: 45,
      }],
    })

    expect(observations.bingoObservations).toEqual([{
      squareId: 10,
      title: 'Dragon Fight',
      tier: 'toss_up',
      probabilityPct: 45,
      playerId: 'player-1',
      marked: true,
    }])
    expect(observations.beatObservations).toEqual([
      {
        entity: 'Daemon', beat: 'Makes Peace', odds: 'toss_up',
        probabilityPct: 45, result: 'fired',
      },
      {
        entity: 'Daemon', beat: 'Combined ruling', odds: null,
        probabilityPct: null, result: 'bundled',
      },
    ])
  })

  it('refuses a settled card whose display label does not match its snapshot position', () => {
    expect(() => buildCalibrationObservations({
      roomCode: 'WDKH',
      rooms: [{ id: 'room-1', code: 'WDKH' }],
      players: [{ id: 'player-1', room_id: 'room-1', name: 'Alec' }],
      bingoCards: [{ id: 'card-1', room_id: 'room-1', player_id: 'player-1', squares: [10] }],
      bingoSquares: [{
        id: 10,
        short_text: 'Dragon Fight',
        likelihood_tier: 'toss_up',
        probability_pct: 45,
      }],
      draftEntities: [],
      signatureBeats: [],
      settledRecord: {
        Alec: {
          card: [{ short: 'Wrong Square', marked: true, free: false }],
          roster: [],
        },
      },
      authoredBeatProbabilities: [],
    })).toThrow('card position 1 is Wrong Square in the settled record but Dragon Fight in the snapshot')
  })

  it('refuses a settled record that silently omits a room player', () => {
    expect(() => buildCalibrationObservations({
      roomCode: 'WDKH',
      rooms: [{ id: 'room-1', code: 'WDKH' }],
      players: [
        { id: 'player-1', room_id: 'room-1', name: 'Alec' },
        { id: 'player-2', room_id: 'room-1', name: 'Frankie' },
      ],
      bingoCards: [{ id: 'card-1', room_id: 'room-1', player_id: 'player-1', squares: [0] }],
      bingoSquares: [],
      draftEntities: [],
      signatureBeats: [],
      settledRecord: {
        Alec: {
          card: [{ short: 'FREE', marked: true, free: true }],
          roster: [],
        },
      },
      authoredBeatProbabilities: [],
    })).toThrow('settled record is missing room player Frankie')
  })
})
