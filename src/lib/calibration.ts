import type { LikelihoodTier } from '../types/database'

export interface BingoCalibrationObservation {
  squareId: number
  title: string
  tier: LikelihoodTier
  probabilityPct: number
  playerId: string
  marked: boolean
}

export type BeatCalibrationResult = 'fired' | 'missed' | 'bundled'

export interface BeatCalibrationObservation {
  entity: string
  beat: string
  odds: string | null
  probabilityPct: number | null
  result: BeatCalibrationResult
}

interface CalibrationSourceInput {
  roomCode: string
  rooms: Array<{ id: string; code: string }>
  players: Array<{ id: string; room_id: string; name: string }>
  bingoCards: Array<{
    id: string
    room_id: string
    player_id: string
    squares: number[]
  }>
  bingoSquares: Array<{
    id: number
    short_text: string
    likelihood_tier: LikelihoodTier
    probability_pct: number
  }>
  draftEntities: Array<{ id: string; name: string }>
  signatureBeats: Array<{
    id: number
    entity_id: string
    name: string
    odds: string
  }>
  settledRecord: Record<string, {
    card: Array<{ short: string; marked: boolean; free: boolean }>
    roster: Array<{
      char: string
      beats: Array<{ beat: string; fired: boolean | 'bundle' }>
    }>
  }>
  authoredBeatProbabilities: Array<{
    entity: string
    beat: string
    probabilityPct: number
  }>
}

interface CalibrationInput {
  roomCode: string
  sourceLabel: string
  bingoObservations: BingoCalibrationObservation[]
  beatObservations: BeatCalibrationObservation[]
}

export interface BingoCalibrationBucket {
  tier: LikelihoodTier
  exposures: number
  marks: number
  observedRatePct: number
  meanAuthoredProbabilityPct: number
  calibrationGapPct: number
}

export interface BingoCalibrationItem {
  squareId: number
  title: string
  tier: LikelihoodTier
  probabilityPct: number
  exposures: number
  marks: number
  observedRatePct: number
  calibrationGapPct: number
}

export interface BeatCalibrationBucket {
  odds: string
  eligible: number
  fired: number
  missed: number
  observedRatePct: number
  numericProbabilityCoverage: number
  comparableObservedRatePct: number | null
  meanAuthoredProbabilityPct: number | null
  calibrationGapPct: number | null
}

export interface BeatCalibrationItem {
  entity: string
  beat: string
  odds: string
  eligible: number
  fired: number
  missed: number
  observedRatePct: number
  probabilityPct: number | null
  calibrationGapPct: number | null
}

export interface CalibrationReport {
  schemaVersion: 1
  roomCode: string
  sourceLabel: string
  caveats: string[]
  bingo: {
    coverage: {
      exposures: number
      uniqueSquares: number
      marks: number
    }
    byTier: BingoCalibrationBucket[]
    items: BingoCalibrationItem[]
  }
  beats: {
    coverage: {
      observations: number
      calibrated: number
      bundled: number
      unmatched: number
      withNumericProbability: number
    }
    byOdds: BeatCalibrationBucket[]
    items: BeatCalibrationItem[]
    excluded: Array<{
      entity: string
      beat: string
      reason: 'bundled' | 'missing authored odds'
    }>
  }
}

const TIER_ORDER: LikelihoodTier[] = ['likely', 'toss_up', 'long_shot', 'chaos']
const ODDS_ORDER = ['likely', 'toss_up', 'long_shot', 'chaos']

function identityKey(value: string): string {
  return value
    .toLocaleLowerCase('en-US')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function wagerKey(entity: string, beat: string): string {
  return `${identityKey(entity)}\u0000${identityKey(beat)}`
}

function normalizeOdds(value: string): string {
  const normalized = identityKey(value).replace(/ /g, '_')
  if (normalized === 'coin_flip' || normalized === 'tossup') return 'toss_up'
  if (normalized === 'longshot') return 'long_shot'
  return normalized
}

function uniqueByIdentity<T>(rows: T[], label: string, key: (row: T) => string): Map<string, T> {
  const indexed = new Map<string, T>()
  for (const row of rows) {
    const identity = key(row)
    if (indexed.has(identity)) throw new Error(`${label} identity ${identity} is ambiguous`)
    indexed.set(identity, row)
  }
  return indexed
}

export function buildCalibrationObservations(input: CalibrationSourceInput): {
  bingoObservations: BingoCalibrationObservation[]
  beatObservations: BeatCalibrationObservation[]
} {
  const matchingRooms = input.rooms.filter(
    (room) => room.code.trim().toUpperCase() === input.roomCode.trim().toUpperCase(),
  )
  if (matchingRooms.length !== 1) {
    throw new Error(`expected exactly one room ${input.roomCode}; found ${matchingRooms.length}`)
  }
  const room = matchingRooms[0]
  const players = input.players.filter((player) => player.room_id === room.id)
  const playersByName = uniqueByIdentity(players, 'player', (player) => identityKey(player.name))
  const cardsByPlayer = new Map<string, CalibrationSourceInput['bingoCards']>()
  for (const card of input.bingoCards.filter((candidate) => candidate.room_id === room.id)) {
    const cards = cardsByPlayer.get(card.player_id) ?? []
    cards.push(card)
    cardsByPlayer.set(card.player_id, cards)
  }
  const squaresById = new Map(input.bingoSquares.map((square) => [square.id, square]))

  const entityNames = uniqueByIdentity(
    input.draftEntities,
    'draft entity',
    (entity) => entity.id,
  )
  const beatAuthoring = new Map<string, { odds: string }>()
  for (const beat of input.signatureBeats) {
    const entity = entityNames.get(beat.entity_id)
    if (!entity) continue
    const key = wagerKey(entity.name, beat.name)
    if (beatAuthoring.has(key)) {
      throw new Error(`signature beat ${entity.name} / ${beat.name} is ambiguous`)
    }
    beatAuthoring.set(key, { odds: normalizeOdds(beat.odds) })
  }

  const probabilities = new Map<string, number>()
  for (const authored of input.authoredBeatProbabilities) {
    validateProbability(authored.probabilityPct, `${authored.entity} / ${authored.beat}`)
    const key = wagerKey(authored.entity, authored.beat)
    const previous = probabilities.get(key)
    if (previous !== undefined && previous !== authored.probabilityPct) {
      throw new Error(`${authored.entity} / ${authored.beat} has conflicting probabilities`)
    }
    probabilities.set(key, authored.probabilityPct)
  }

  const bingoObservations: BingoCalibrationObservation[] = []
  const beatObservations: BeatCalibrationObservation[] = []
  const recordNames = new Set<string>()
  for (const [recordName, record] of Object.entries(input.settledRecord)) {
    const normalizedName = identityKey(recordName)
    if (recordNames.has(normalizedName)) {
      throw new Error(`settled player identity ${recordName} is ambiguous`)
    }
    recordNames.add(normalizedName)
    const player = playersByName.get(normalizedName)
    if (!player) throw new Error(`settled player ${recordName} is not in room ${input.roomCode}`)
    const cards = cardsByPlayer.get(player.id) ?? []
    if (cards.length !== 1) {
      throw new Error(`expected one bingo card for ${recordName}; found ${cards.length}`)
    }
    const card = cards[0]
    if (record.card.length !== card.squares.length) {
      throw new Error(
        `${recordName} has ${record.card.length} settled card positions but ${card.squares.length} snapshot positions`,
      )
    }
    record.card.forEach((settledSquare, index) => {
      const squareId = card.squares[index]
      if (settledSquare.free || squareId === 0) {
        if (!settledSquare.free || squareId !== 0) {
          throw new Error(`${recordName} card position ${index + 1} disagrees about the free center`)
        }
        return
      }
      const authored = squaresById.get(squareId)
      if (!authored) throw new Error(`bingo square ${squareId} is missing from the snapshot`)
      if (settledSquare.short.trim() !== authored.short_text.trim()) {
        throw new Error(
          `${recordName} card position ${index + 1} is ${settledSquare.short} in the settled record but ${authored.short_text} in the snapshot`,
        )
      }
      bingoObservations.push({
        squareId,
        title: authored.short_text,
        tier: authored.likelihood_tier,
        probabilityPct: authored.probability_pct,
        playerId: player.id,
        marked: settledSquare.marked,
      })
    })

    for (const rosterEntry of record.roster) {
      for (const settledBeat of rosterEntry.beats) {
        const key = wagerKey(rosterEntry.char, settledBeat.beat)
        const authored = beatAuthoring.get(key)
        let result: BeatCalibrationResult
        if (settledBeat.fired === true) result = 'fired'
        else if (settledBeat.fired === false) result = 'missed'
        else if (settledBeat.fired === 'bundle') result = 'bundled'
        else throw new Error(`${rosterEntry.char} / ${settledBeat.beat} has an invalid result`)
        beatObservations.push({
          entity: rosterEntry.char,
          beat: settledBeat.beat,
          odds: authored?.odds ?? null,
          probabilityPct: probabilities.get(key) ?? null,
          result,
        })
      }
    }
  }

  const missingPlayers = players
    .filter((player) => !recordNames.has(identityKey(player.name)))
    .map((player) => player.name)
    .sort((left, right) => left.localeCompare(right))
  if (missingPlayers.length > 0) {
    throw new Error(`settled record is missing room player ${missingPlayers.join(', ')}`)
  }

  return { bingoObservations, beatObservations }
}

function round1(value: number): number {
  return Math.round((value + Number.EPSILON) * 10) / 10
}

function rate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : round1((numerator / denominator) * 100)
}

function mean(values: number[]): number {
  return values.length === 0
    ? 0
    : round1(values.reduce((sum, value) => sum + value, 0) / values.length)
}

function compareOdds(left: string, right: string): number {
  const leftIndex = ODDS_ORDER.indexOf(left)
  const rightIndex = ODDS_ORDER.indexOf(right)
  const normalizedLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex
  const normalizedRight = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex
  return normalizedLeft - normalizedRight || left.localeCompare(right)
}

function validateProbability(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`${label} probability must be from 0 to 100`)
  }
}

export function buildCalibrationReport(input: CalibrationInput): CalibrationReport {
  const bingoBySquare = new Map<number, BingoCalibrationObservation[]>()
  for (const observation of input.bingoObservations) {
    validateProbability(observation.probabilityPct, `bingo square ${observation.squareId}`)
    const rows = bingoBySquare.get(observation.squareId) ?? []
    const canonical = rows[0]
    if (canonical && (
      canonical.title !== observation.title
      || canonical.tier !== observation.tier
      || canonical.probabilityPct !== observation.probabilityPct
    )) {
      throw new Error(`bingo square ${observation.squareId} has conflicting authored metadata`)
    }
    rows.push(observation)
    bingoBySquare.set(observation.squareId, rows)
  }

  const bingoItems: BingoCalibrationItem[] = [...bingoBySquare.entries()]
    .sort(([left], [right]) => left - right)
    .map(([squareId, observations]) => {
      const authored = observations[0]
      const marks = observations.filter((observation) => observation.marked).length
      const observedRatePct = rate(marks, observations.length)
      return {
        squareId,
        title: authored.title,
        tier: authored.tier,
        probabilityPct: authored.probabilityPct,
        exposures: observations.length,
        marks,
        observedRatePct,
        calibrationGapPct: round1(observedRatePct - authored.probabilityPct),
      }
    })

  const bingoByTier: BingoCalibrationBucket[] = TIER_ORDER
    .map((tier) => {
      const observations = input.bingoObservations.filter((observation) => observation.tier === tier)
      if (observations.length === 0) return null
      const marks = observations.filter((observation) => observation.marked).length
      const observedRatePct = rate(marks, observations.length)
      const meanAuthoredProbabilityPct = mean(
        observations.map((observation) => observation.probabilityPct),
      )
      return {
        tier,
        exposures: observations.length,
        marks,
        observedRatePct,
        meanAuthoredProbabilityPct,
        calibrationGapPct: round1(observedRatePct - meanAuthoredProbabilityPct),
      }
    })
    .filter((bucket): bucket is BingoCalibrationBucket => bucket !== null)

  const excluded: CalibrationReport['beats']['excluded'] = []
  const calibratedBeatObservations: BeatCalibrationObservation[] = []
  for (const observation of input.beatObservations) {
    if (observation.probabilityPct !== null) {
      validateProbability(observation.probabilityPct, `${observation.entity} / ${observation.beat}`)
    }
    if (observation.result === 'bundled') {
      excluded.push({
        entity: observation.entity,
        beat: observation.beat,
        reason: 'bundled',
      })
    } else if (observation.odds === null) {
      excluded.push({
        entity: observation.entity,
        beat: observation.beat,
        reason: 'missing authored odds',
      })
    } else {
      calibratedBeatObservations.push(observation)
    }
  }

  const beatByOddsMap = new Map<string, BeatCalibrationObservation[]>()
  const beatByItemMap = new Map<string, BeatCalibrationObservation[]>()
  for (const observation of calibratedBeatObservations) {
    const oddsRows = beatByOddsMap.get(observation.odds!) ?? []
    oddsRows.push(observation)
    beatByOddsMap.set(observation.odds!, oddsRows)

    const itemKey = `${observation.entity}\u0000${observation.beat}`
    const itemRows = beatByItemMap.get(itemKey) ?? []
    const canonical = itemRows[0]
    if (canonical && (
      canonical.odds !== observation.odds
      || canonical.probabilityPct !== observation.probabilityPct
    )) {
      throw new Error(`${observation.entity} / ${observation.beat} has conflicting authored metadata`)
    }
    itemRows.push(observation)
    beatByItemMap.set(itemKey, itemRows)
  }

  const beatByOdds: BeatCalibrationBucket[] = [...beatByOddsMap.entries()]
    .sort(([left], [right]) => compareOdds(left, right))
    .map(([odds, observations]) => {
      const fired = observations.filter((observation) => observation.result === 'fired').length
      const numeric = observations
        .filter((observation) => observation.probabilityPct !== null)
      const numericProbabilities = numeric
        .map((observation) => observation.probabilityPct as number)
      const observedRatePct = rate(fired, observations.length)
      const comparableObservedRatePct = numeric.length > 0
        ? rate(numeric.filter((observation) => observation.result === 'fired').length, numeric.length)
        : null
      const meanAuthoredProbabilityPct = numeric.length > 0 ? mean(numericProbabilities) : null
      return {
        odds,
        eligible: observations.length,
        fired,
        missed: observations.length - fired,
        observedRatePct,
        numericProbabilityCoverage: numeric.length,
        comparableObservedRatePct,
        meanAuthoredProbabilityPct,
        calibrationGapPct: meanAuthoredProbabilityPct === null || comparableObservedRatePct === null
          ? null
          : round1(comparableObservedRatePct - meanAuthoredProbabilityPct),
      }
    })

  const beatItems: BeatCalibrationItem[] = [...beatByItemMap.values()]
    .map((observations) => {
      const authored = observations[0]
      const fired = observations.filter((observation) => observation.result === 'fired').length
      const observedRatePct = rate(fired, observations.length)
      return {
        entity: authored.entity,
        beat: authored.beat,
        odds: authored.odds!,
        eligible: observations.length,
        fired,
        missed: observations.length - fired,
        observedRatePct,
        probabilityPct: authored.probabilityPct,
        calibrationGapPct: authored.probabilityPct === null
          ? null
          : round1(observedRatePct - authored.probabilityPct),
      }
    })
    .sort((left, right) => left.entity.localeCompare(right.entity) || left.beat.localeCompare(right.beat))

  const bingoMarks = input.bingoObservations.filter((observation) => observation.marked).length
  return {
    schemaVersion: 1,
    roomCode: input.roomCode,
    sourceLabel: input.sourceLabel,
    caveats: [
      'This is one episode. It is descriptive evidence, not enough data to retune authored probabilities.',
      'Bingo rates use player-card exposures, not independent episode outcomes; repeated squares measure both event occurrence and player marking.',
      'Beat rates use authored roster slots, not independent story events; mirrored or related triggers can describe the same scene.',
      'Bundled beat outcomes are excluded because a bundle does not prove that each underlying trigger fired.',
    ],
    bingo: {
      coverage: {
        exposures: input.bingoObservations.length,
        uniqueSquares: bingoBySquare.size,
        marks: bingoMarks,
      },
      byTier: bingoByTier,
      items: bingoItems,
    },
    beats: {
      coverage: {
        observations: input.beatObservations.length,
        calibrated: calibratedBeatObservations.length,
        bundled: excluded.filter((row) => row.reason === 'bundled').length,
        unmatched: excluded.filter((row) => row.reason === 'missing authored odds').length,
        withNumericProbability: calibratedBeatObservations
          .filter((observation) => observation.probabilityPct !== null).length,
      },
      byOdds: beatByOdds,
      items: beatItems,
      excluded,
    },
  }
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function pct(value: number | null): string {
  return value === null ? 'not authored' : `${value.toFixed(1)}%`
}

function gap(value: number | null): string {
  if (value === null) return 'not available'
  return `${value > 0 ? '+' : ''}${value.toFixed(1)} pp`
}

export function renderCalibrationMarkdown(report: CalibrationReport): string {
  const lines = [
    `# Calibration report: ${report.roomCode}`,
    '',
    `Source: ${report.sourceLabel}`,
    '',
    '## Reading this report',
    '',
    ...report.caveats.map((caveat) => `- ${caveat}`),
    '',
    '## Bingo calibration',
    '',
    `${report.bingo.coverage.marks} settled marks across ${report.bingo.coverage.exposures} card exposures and ${report.bingo.coverage.uniqueSquares} unique authored squares.`,
    '',
    '| Tier | Exposures | Marks | Mark rate | Mean authored | Gap |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    ...report.bingo.byTier.map((row) => (
      `| ${row.tier} | ${row.exposures} | ${row.marks} | ${pct(row.observedRatePct)} | ${pct(row.meanAuthoredProbabilityPct)} | ${gap(row.calibrationGapPct)} |`
    )),
    '',
    '### Squares shown to players',
    '',
    '| Square | Tier | Exposures | Marks | Mark rate | Authored | Gap |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
    ...report.bingo.items.map((row) => (
      `| ${escapeCell(row.title)} | ${row.tier} | ${row.exposures} | ${row.marks} | ${pct(row.observedRatePct)} | ${pct(row.probabilityPct)} | ${gap(row.calibrationGapPct)} |`
    )),
    '',
    '## Signature-beat calibration',
    '',
    `${report.beats.coverage.calibrated} of ${report.beats.coverage.observations} beat observations entered the calibrated denominator; ${report.beats.coverage.bundled} bundled and ${report.beats.coverage.unmatched} missing-authoring observations were excluded. Numeric probability coverage: ${report.beats.coverage.withNumericProbability} of ${report.beats.coverage.calibrated}.`,
    '',
    '| Authored odds | Eligible | Fired | Missed | Fire rate | Numeric coverage | Comparable fire rate | Mean authored | Gap |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...report.beats.byOdds.map((row) => (
      `| ${escapeCell(row.odds)} | ${row.eligible} | ${row.fired} | ${row.missed} | ${pct(row.observedRatePct)} | ${row.numericProbabilityCoverage}/${row.eligible} | ${pct(row.comparableObservedRatePct)} | ${pct(row.meanAuthoredProbabilityPct)} | ${gap(row.calibrationGapPct)} |`
    )),
    '',
    '### Eligible beats',
    '',
    '| Entity | Beat | Odds | Result | Authored | Gap |',
    '| --- | --- | --- | --- | ---: | ---: |',
    ...report.beats.items.map((row) => (
      `| ${escapeCell(row.entity)} | ${escapeCell(row.beat)} | ${escapeCell(row.odds)} | ${row.fired}/${row.eligible} fired | ${pct(row.probabilityPct)} | ${gap(row.calibrationGapPct)} |`
    )),
  ]

  if (report.beats.excluded.length > 0) {
    lines.push(
      '',
      '### Excluded beat observations',
      '',
      '| Entity | Beat | Reason |',
      '| --- | --- | --- |',
      ...report.beats.excluded.map((row) => (
        `| ${escapeCell(row.entity)} | ${escapeCell(row.beat)} | ${row.reason} |`
      )),
    )
  }

  return `${lines.join('\n')}\n`
}
