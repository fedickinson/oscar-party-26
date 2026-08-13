#!/usr/bin/env -S npx tsx

import { existsSync, readFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import {
  buildCalibrationObservations,
  buildCalibrationReport,
  renderCalibrationMarkdown,
} from '../src/lib/calibration'
import {
  assertOutputDoesNotAliasSource,
  writeUtf8FileSafely,
  type ProtectedSource,
} from './lib/safe-write.mts'

interface CliOptions {
  snapshot: string
  record: string
  beatSource?: string
  room: string
  markdown?: string
  json?: string
  force: boolean
}

interface LegacyBeatSource {
  characters: Array<{
    name: string
    signature_beats: Array<{ name: string; estimated_probability_pct: number | string }>
  }>
  dragons: Array<{
    name: string
    signature_beats: Array<{ name: string; estimated_probability_pct: number | string }>
  }>
}

function usage(): never {
  console.error([
    'Usage: npx tsx scripts/calibration-report.mts',
    '  --snapshot SNAPSHOT_DIR --record SETTLED_PERSONAL.json --room CODE',
    '  [--beat-source AUTHORED_BEATS.json]',
    '  [--markdown REPORT.md] [--json REPORT.json] [--force]',
  ].join(' '))
  process.exit(1)
}

function parseArgs(argv: string[]): CliOptions {
  let snapshot = ''
  let record = ''
  let beatSource: string | undefined
  let room = ''
  let markdown: string | undefined
  let json: string | undefined
  let force = false

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--snapshot') snapshot = argv[++index] ?? ''
    else if (arg === '--record') record = argv[++index] ?? ''
    else if (arg === '--beat-source') beatSource = argv[++index] ?? ''
    else if (arg === '--room') room = argv[++index] ?? ''
    else if (arg === '--markdown') markdown = argv[++index] ?? ''
    else if (arg === '--json') json = argv[++index] ?? ''
    else if (arg === '--force') force = true
    else if (arg === '--help' || arg === '-h') usage()
    else throw new Error(`unknown argument ${arg}`)
  }

  if (!snapshot || !record || !room) usage()
  if (beatSource !== undefined && !beatSource) throw new Error('--beat-source needs a path')
  if (markdown !== undefined && !markdown) throw new Error('--markdown needs a path')
  if (json !== undefined && !json) throw new Error('--json needs a path')
  return { snapshot, record, beatSource, room: room.trim().toUpperCase(), markdown, json, force }
}

function readJson(path: string): unknown {
  if (!existsSync(path)) throw new Error(`input does not exist: ${path}`)
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`could not parse ${path}: ${message}`)
  }
}

function readArray(path: string): unknown[] {
  const value = readJson(path)
  if (!Array.isArray(value)) throw new Error(`${path} must contain a JSON array`)
  return value
}

function authoredProbabilities(source: unknown): Array<{
  entity: string
  beat: string
  probabilityPct: number
}> {
  if (source === null || typeof source !== 'object' || Array.isArray(source)) {
    throw new Error('authored beat source must be an object')
  }
  const value = source as Partial<LegacyBeatSource>
  if (!Array.isArray(value.characters) || !Array.isArray(value.dragons)) {
    throw new Error('authored beat source needs characters and dragons arrays')
  }
  return [...value.characters, ...value.dragons].flatMap((entity) => {
    if (typeof entity.name !== 'string' || !Array.isArray(entity.signature_beats)) {
      throw new Error('authored beat source has an invalid entity')
    }
    return entity.signature_beats.map((beat) => {
      const rawProbability = beat.estimated_probability_pct
      const probability = typeof rawProbability === 'number'
        ? rawProbability
        : typeof rawProbability === 'string' && /^\d+(?:\.\d+)?$/.test(rawProbability.trim())
          ? Number(rawProbability)
          : Number.NaN
      if (typeof beat.name !== 'string' || !Number.isFinite(probability)) {
        throw new Error(`authored beat source has an invalid beat for ${entity.name}`)
      }
      return {
        entity: entity.name,
        beat: beat.name,
        probabilityPct: probability,
      }
    })
  })
}

function main(): void {
  const options = parseArgs(process.argv.slice(2))
  const snapshotPath = resolve(options.snapshot)
  const recordPath = resolve(options.record)
  const beatSourcePath = options.beatSource ? resolve(options.beatSource) : undefined
  const markdownPath = options.markdown ? resolve(options.markdown) : undefined
  const jsonPath = options.json ? resolve(options.json) : undefined
  if (markdownPath && jsonPath && markdownPath === jsonPath) {
    throw new Error('Markdown and JSON outputs must use different paths')
  }

  const snapshotFiles = {
    rooms: join(snapshotPath, 'rooms.json'),
    players: join(snapshotPath, 'players.json'),
    bingoCards: join(snapshotPath, 'bingo_cards.json'),
    bingoSquares: join(snapshotPath, 'bingo_squares.json'),
    draftEntities: join(snapshotPath, 'draft_entities.json'),
    signatureBeats: join(snapshotPath, 'signature_beats.json'),
  }
  const sourcePaths = [recordPath, ...Object.values(snapshotFiles)]
  if (beatSourcePath) sourcePaths.push(beatSourcePath)
  const protectedSources: ProtectedSource[] = sourcePaths.map((path) => ({
    label: `calibration input ${basename(path)}`,
    path,
  }))
  if (markdownPath) {
    assertOutputDoesNotAliasSource(markdownPath, [
      ...protectedSources,
      ...(jsonPath ? [{ label: 'JSON output', path: jsonPath }] : []),
    ])
  }
  if (jsonPath) {
    assertOutputDoesNotAliasSource(jsonPath, [
      ...protectedSources,
      ...(markdownPath ? [{ label: 'Markdown output', path: markdownPath }] : []),
    ])
  }

  const settledRecord = readJson(recordPath)
  if (settledRecord === null || typeof settledRecord !== 'object' || Array.isArray(settledRecord)) {
    throw new Error('settled record must be a player-keyed object')
  }
  const observations = buildCalibrationObservations({
    roomCode: options.room,
    rooms: readArray(snapshotFiles.rooms) as never[],
    players: readArray(snapshotFiles.players) as never[],
    bingoCards: readArray(snapshotFiles.bingoCards) as never[],
    bingoSquares: readArray(snapshotFiles.bingoSquares) as never[],
    draftEntities: readArray(snapshotFiles.draftEntities) as never[],
    signatureBeats: readArray(snapshotFiles.signatureBeats) as never[],
    settledRecord: settledRecord as never,
    authoredBeatProbabilities: beatSourcePath
      ? authoredProbabilities(readJson(beatSourcePath))
      : [],
  })
  const report = buildCalibrationReport({
    roomCode: options.room,
    sourceLabel: `settled ${basename(recordPath)} with snapshot ${basename(snapshotPath)}`,
    ...observations,
  })
  const markdown = renderCalibrationMarkdown(report)
  const json = `${JSON.stringify(report, null, 2)}\n`

  console.log('[calibration] target=local-filesystem')
  console.log(`[calibration] mode=${markdownPath || jsonPath ? 'write' : 'dry-run'}`)
  console.log(`[calibration] room=${report.roomCode}`)
  console.log(`[calibration] bingo=${report.bingo.coverage.marks}/${report.bingo.coverage.exposures} marks/exposures`)
  console.log(`[calibration] beats=${report.beats.coverage.calibrated}/${report.beats.coverage.observations} calibrated`)
  console.log(`[calibration] bundled=${report.beats.coverage.bundled} unmatched=${report.beats.coverage.unmatched}`)

  if (!markdownPath && !jsonPath) {
    console.log('')
    process.stdout.write(markdown)
    return
  }
  if (markdownPath) {
    writeUtf8FileSafely(markdownPath, markdown, options.force)
    console.log(`[calibration] wrote=${markdownPath}`)
  }
  if (jsonPath) {
    writeUtf8FileSafely(jsonPath, json, options.force)
    console.log(`[calibration] wrote=${jsonPath}`)
  }
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`[calibration] ERROR: ${message}`)
  process.exit(1)
}
