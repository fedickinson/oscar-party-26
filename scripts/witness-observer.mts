#!/usr/bin/env -S npx tsx

/**
 * Continuously sample an explicit local frame ingress through witness-once.
 *
 * Existing files are ignored by default. At each interval, only the newest
 * stable direct-child image after the durable cursor is considered. Sending
 * images remains an explicit privacy/spend boundary, and witness-once can only
 * enqueue a sealed proposal for human review; this process never declares.
 */

import { createHash, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import {
  closeSync,
  existsSync,
  lstatSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  advanceWitnessObserverJournal,
  beginWitnessObserverAttempt,
  completeWitnessObserverAttempt,
  createWitnessObserverJournal,
  parseWitnessObserverJournal,
  selectNewestWitnessFrame,
  skipWitnessObserverAttempt,
  witnessObserverJournalHasHash,
  type WitnessFrameCandidate,
  type WitnessObserverJournal,
} from '../src/lib/witness-observer'
import { supabaseConfig } from './lib/env.mts'
import { writeUtf8FileSafely } from './lib/safe-write.mts'

interface Options {
  room: string
  ingress: string
  references: string
  intervalSeconds: number
  stableMilliseconds: number
  minimumConfidence: number
  sendFrames: boolean
  confirmRoom?: string
  includeExisting: boolean
  once: boolean
  skipInflightHash?: string
}

interface WorkerResult {
  exitCode: number
  output: string
}

const SUPPORTED_IMAGE = /\.(?:gif|jpe?g|png|webp)$/i

function usage(): never {
  console.error([
    'Usage: npx tsx scripts/witness-observer.mts',
    '  --room CODE --ingress DIRECTORY --references REFERENCES.json',
    '  [--interval 15] [--stable-ms 1000] [--minimum-confidence 70]',
    '  [--include-existing] [--once]',
    '  [--send-frames --confirm-room CODE]',
    '  [--skip-inflight SHA256]',
    '',
    'Default: local database, ignores existing frames, sends no image and writes no journal.',
    '`--send-frames` sends sampled frames and private references to Anthropic and may queue proposals.',
    'The observer never accepts a proposal or writes a canonical room fact.',
  ].join('\n'))
  process.exit(1)
}

function parseArgs(argv: string[]): Options {
  let room = ''
  let ingress = ''
  let references = ''
  let intervalSeconds = 15
  let stableMilliseconds = 1_000
  let minimumConfidence = 70
  let sendFrames = false
  let confirmRoom: string | undefined
  let includeExisting = false
  let once = false
  let skipInflightHash: string | undefined

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--room') room = argv[++index] ?? ''
    else if (arg === '--ingress') ingress = argv[++index] ?? ''
    else if (arg === '--references') references = argv[++index] ?? ''
    else if (arg === '--interval') intervalSeconds = Number(argv[++index] ?? '')
    else if (arg === '--stable-ms') stableMilliseconds = Number(argv[++index] ?? '')
    else if (arg === '--minimum-confidence') minimumConfidence = Number(argv[++index] ?? '')
    else if (arg === '--send-frames') sendFrames = true
    else if (arg === '--confirm-room') confirmRoom = (argv[++index] ?? '').trim().toUpperCase()
    else if (arg === '--include-existing') includeExisting = true
    else if (arg === '--once') once = true
    else if (arg === '--skip-inflight') skipInflightHash = (argv[++index] ?? '').trim()
    else if (arg === '--help' || arg === '-h') usage()
    else throw new Error(`unknown argument ${arg}`)
  }

  room = room.trim().toUpperCase()
  if (!room || !ingress || !references) usage()
  if (!/^[A-Z0-9]{4,12}$/.test(room)) {
    throw new Error('room code must be 4 to 12 uppercase letters or numbers')
  }
  if (!Number.isInteger(intervalSeconds) || intervalSeconds < 5 || intervalSeconds > 3_600) {
    throw new Error('--interval must be an integer from 5 through 3600 seconds')
  }
  if (!Number.isInteger(stableMilliseconds)
    || stableMilliseconds < 250
    || stableMilliseconds > 60_000) {
    throw new Error('--stable-ms must be an integer from 250 through 60000')
  }
  if (!Number.isInteger(minimumConfidence)
    || minimumConfidence < 0
    || minimumConfidence > 100) {
    throw new Error('--minimum-confidence must be an integer from 0 through 100')
  }
  if (sendFrames && confirmRoom !== room) {
    throw new Error(`--send-frames requires --confirm-room ${room}`)
  }
  if (!sendFrames && confirmRoom) {
    throw new Error('--confirm-room is valid only with --send-frames')
  }
  if (skipInflightHash && !sendFrames) {
    throw new Error('--skip-inflight is valid only with --send-frames')
  }
  if (skipInflightHash && !/^[a-f0-9]{64}$/.test(skipInflightHash)) {
    throw new Error('--skip-inflight must be the exact lowercase SHA-256 reported by the journal')
  }
  return {
    room,
    ingress,
    references,
    intervalSeconds,
    stableMilliseconds,
    minimumConfidence,
    sendFrames,
    confirmRoom,
    includeExisting,
    once,
    skipInflightHash,
  }
}

function directFrames(
  ingress: string,
  stableMilliseconds: number | null,
): WitnessFrameCandidate[] {
  const stableBefore = stableMilliseconds === null
    ? Number.POSITIVE_INFINITY
    : Date.now() - stableMilliseconds
  const frames: WitnessFrameCandidate[] = []
  for (const name of readdirSync(ingress)) {
    if (!SUPPORTED_IMAGE.test(name)) continue
    const path = join(ingress, name)
    let stats
    try { stats = lstatSync(path) } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }
    if (!stats.isFile() || stats.isSymbolicLink() || stats.size < 1 || stats.mtimeMs > stableBefore) continue
    frames.push({ name, path, size: stats.size, mtime_ms: stats.mtimeMs })
  }
  return frames
}

function frameHashIfStable(frame: WitnessFrameCandidate): string | null {
  const before = lstatSync(frame.path)
  if (!before.isFile() || before.isSymbolicLink()
    || before.size !== frame.size || before.mtimeMs !== frame.mtime_ms) return null
  const bytes = readFileSync(frame.path)
  const after = lstatSync(frame.path)
  if (!after.isFile() || after.isSymbolicLink()
    || after.size !== before.size || after.mtimeMs !== before.mtimeMs) return null
  return createHash('sha256').update(bytes).digest('hex')
}

function frameAfterWorker(frame: WitnessFrameCandidate): WitnessFrameCandidate {
  const stats = lstatSync(frame.path)
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`observed frame is no longer a regular file: ${frame.path}`)
  }
  return {
    name: basename(frame.path),
    path: frame.path,
    size: stats.size,
    mtime_ms: stats.mtimeMs,
  }
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function acquireLease(path: string, room: string): () => void {
  let descriptor: number | null = null
  while (descriptor === null) {
    try {
      descriptor = openSync(path, 'wx', 0o600)
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }

    let stats
    try { stats = lstatSync(path) } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }
    if (!stats.isFile() || stats.isSymbolicLink()) {
      throw new Error(`observer lease is not a regular file: ${path}`)
    }
    let owner: unknown
    try { owner = JSON.parse(readFileSync(path, 'utf8')) } catch {
      throw new Error(`observer lease is unreadable: ${path}`)
    }
    const pid = (owner as { pid?: unknown }).pid
    if (!Number.isInteger(pid) || Number(pid) < 1) {
      throw new Error(`observer lease has no valid owner: ${path}`)
    }
    if (processExists(Number(pid))) {
      throw new Error(`witness observer already runs for room ${room} as process ${pid}`)
    }

    const quarantine = `${path}.stale.${process.pid}.${randomUUID()}`
    try {
      renameSync(path, quarantine)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }
    const moved = lstatSync(quarantine)
    if (moved.dev !== stats.dev || moved.ino !== stats.ino) {
      try {
        linkSync(quarantine, path)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
        throw new Error('observer lease changed during stale recovery; refusing concurrent startup')
      } finally {
        if (existsSync(quarantine)) unlinkSync(quarantine)
      }
      continue
    }
    unlinkSync(quarantine)
  }

  try {
    writeFileSync(descriptor, `${JSON.stringify({ room, pid: process.pid })}\n`)
  } catch (error) {
    closeSync(descriptor)
    if (existsSync(path)) unlinkSync(path)
    throw error
  }
  closeSync(descriptor)
  let released = false
  return () => {
    if (released) return
    released = true
    if (!existsSync(path)) return
    try {
      const owner = JSON.parse(readFileSync(path, 'utf8')) as { pid?: number }
      if (owner.pid === process.pid) unlinkSync(path)
    } catch {
      // An externally replaced lease is not ours to remove. The original
      // observer error or shutdown outcome remains the more useful signal.
    }
  }
}

function writeJournal(path: string, journal: WitnessObserverJournal): void {
  writeUtf8FileSafely(path, `${JSON.stringify(journal, null, 2)}\n`, true, 0o600)
}

function runWorker(
  repositoryRoot: string,
  options: Options,
  frame: WitnessFrameCandidate,
): Promise<WorkerResult> {
  const tsxCli = resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs')
  const witnessOnce = resolve(repositoryRoot, 'scripts/witness-once.mts')
  const args = [
    tsxCli,
    witnessOnce,
    '--room', options.room,
    '--frame', frame.path,
    '--references', options.references,
    '--minimum-confidence', String(options.minimumConfidence),
    '--observed-at', new Date(frame.mtime_ms).toISOString(),
  ]
  if (options.sendFrames) args.push('--send-frame', '--confirm-room', options.room)

  return new Promise((resolveWorker, rejectWorker) => {
    const child = spawn(process.execPath, args, {
      cwd: repositoryRoot,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let output = ''
    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      output += text
      process.stdout.write(text)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      output += text
      process.stderr.write(text)
    })
    child.on('error', rejectWorker)
    child.on('close', (code) => resolveWorker({ exitCode: code ?? 1, output }))
  })
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolveWait) => setTimeout(resolveWait, milliseconds))
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const config = supabaseConfig('local')
  if (!config.serviceKey) {
    throw new Error('witness observer requires the service role for the selected target')
  }
  const repositoryRoot = realpathSync(fileURLToPath(new URL('../', import.meta.url)))
  const ingressInput = resolve(options.ingress)
  if (!existsSync(ingressInput)) throw new Error(`frame ingress does not exist: ${ingressInput}`)
  const ingress = realpathSync(ingressInput)
  if (!statSync(ingress).isDirectory()) throw new Error(`frame ingress is not a directory: ${ingress}`)
  const referencesInput = resolve(options.references)
  if (!existsSync(referencesInput)) throw new Error(`reference manifest does not exist: ${referencesInput}`)
  const references = realpathSync(referencesInput)
  if (!statSync(references).isFile()) throw new Error(`reference manifest is not a file: ${references}`)
  options.ingress = ingress
  options.references = references

  const privateDirectory = resolve(repositoryRoot, '.private', 'witness', options.room)
  mkdirSync(privateDirectory, { recursive: true, mode: 0o700 })
  if (realpathSync(privateDirectory) !== privateDirectory) {
    throw new Error('witness observer private directory must not be a symlink')
  }
  const ingressKey = createHash('sha256').update(ingress).digest('hex').slice(0, 16)
  const journalPath = join(privateDirectory, `observer-${ingressKey}.json`)
  const leasePath = join(privateDirectory, 'observer.lock')
  const releaseLease = acquireLease(leasePath, options.room)
  let stopping = false
  const stop = () => { stopping = true }
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)

  try {
    const initialFrames = directFrames(ingress, null)
    const initialNewest = selectNewestWitnessFrame(initialFrames, null)
    let journal: WitnessObserverJournal
    if (options.sendFrames && existsSync(journalPath)) {
      journal = parseWitnessObserverJournal(
        readFileSync(journalPath, 'utf8'),
        options.room,
        ingress,
      )
    } else {
      journal = createWitnessObserverJournal(
        options.room,
        ingress,
        options.includeExisting ? null : initialNewest,
      )
      if (options.sendFrames) writeJournal(journalPath, journal)
    }

    if (options.skipInflightHash) {
      journal = skipWitnessObserverAttempt(journal, options.skipInflightHash)
      writeJournal(journalPath, journal)
      console.log(`[witness-observer] uncertain_observation_skipped=${options.skipInflightHash}`)
      return
    } else if (journal.in_flight) {
      throw new Error(
        `uncertain prior observation ${journal.in_flight.sha256}; check the host review queue, `
        + `then rerun with --send-frames --confirm-room ${options.room} `
        + `--skip-inflight ${journal.in_flight.sha256}`,
      )
    }

    console.log(`[witness-observer] room=${options.room} ingress=${ingress}`)
    console.log(`[witness-observer] database_target=${config.target}`)
    console.log(`[witness-observer] mode=${options.sendFrames ? 'send' : 'plan'} interval=${options.intervalSeconds}s stable_ms=${options.stableMilliseconds}`)
    console.log(`[witness-observer] existing_frames=${options.includeExisting ? 'eligible' : 'ignored'} auto_declare=false`)
    if (options.sendFrames) console.log(`[witness-observer] journal=${journalPath}`)

    while (!stopping) {
      const candidates = directFrames(ingress, options.stableMilliseconds)
      const frame = selectNewestWitnessFrame(candidates, journal.cursor)
      if (!frame) {
        if (options.once) throw new Error('no new stable frame is available')
        await wait(options.intervalSeconds * 1_000)
        continue
      }
      const beforeHash = frameHashIfStable(frame)
      if (!beforeHash) {
        console.log(`[witness-observer] frame_changed=${frame.name}; retrying after interval`)
        if (options.once) throw new Error(`frame changed while reading: ${frame.name}`)
        await wait(options.intervalSeconds * 1_000)
        continue
      }

      if (witnessObserverJournalHasHash(journal, beforeHash)) {
        journal = advanceWitnessObserverJournal(journal, frame, beforeHash)
        if (options.sendFrames) writeJournal(journalPath, journal)
        console.log(`[witness-observer] duplicate_frame=${frame.name} sha256=${beforeHash}; image_sent=false`)
        if (options.once) return
        continue
      }

      console.log(`[witness-observer] sampling=${frame.name} sha256=${beforeHash}`)
      if (options.sendFrames) {
        journal = beginWitnessObserverAttempt(
          journal,
          frame,
          beforeHash,
          new Date().toISOString(),
        )
        writeJournal(journalPath, journal)
      }
      const result = await runWorker(repositoryRoot, options, frame)
      if (result.exitCode !== 0) {
        if (options.sendFrames) {
          throw new Error(
            `observation outcome is uncertain for ${beforeHash}; automatic retry is disabled; `
            + 'check the host review queue before resolving the in-flight journal',
          )
        }
        if (/must be live; current phase is/.test(result.output)) {
          throw new Error('room left live phase; witness observer stopped')
        }
        console.error(`[witness-observer] observation_failed=${frame.name}; journal_advanced=false`)
        if (options.once) throw new Error(`witness observation failed for ${frame.name}`)
        await wait(options.intervalSeconds * 1_000)
        continue
      }

      const workerHash = result.output.match(/\[witness\] frame_sha256=([a-f0-9]{64})/)?.[1]
      if (!workerHash) throw new Error('witness worker did not report its canonical frame hash')
      const completedFrame = frameAfterWorker(frame)
      const completedHash = frameHashIfStable(completedFrame)
      if (completedHash !== workerHash) {
        console.error(`[witness-observer] frame_changed_after_observation=${frame.name}; journal_advanced=false`)
        if (options.sendFrames) {
          throw new Error(
            `observation outcome is uncertain for ${beforeHash}; frame bytes changed before journaling`,
          )
        }
        if (options.once) throw new Error(`frame changed during observation: ${frame.name}`)
        await wait(options.intervalSeconds * 1_000)
        continue
      }
      journal = options.sendFrames
        ? completeWitnessObserverAttempt(journal, completedFrame, workerHash)
        : advanceWitnessObserverJournal(journal, completedFrame, workerHash)
      if (options.sendFrames) writeJournal(journalPath, journal)
      console.log(`[witness-observer] processed=${completedFrame.name} sha256=${workerHash}`)
      if (options.once) return
    }
    console.log('[witness-observer] stopped=true')
  } finally {
    process.removeListener('SIGINT', stop)
    process.removeListener('SIGTERM', stop)
    releaseLease()
  }
}

main().catch((error) => {
  console.error(`[witness-observer] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
