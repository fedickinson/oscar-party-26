#!/usr/bin/env -S npx tsx

/**
 * Capture a bounded sequence of macOS screenshots into witness-observer ingress.
 * Planning is the default. Capture requires exact approved plan bytes plus a
 * separate privacy confirmation. This command never calls a model or database.
 */

import { execFile } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmdirSync,
  unlinkSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertWitnessCapturePng,
  buildWitnessCapturePlan,
  parseWitnessCapturePlan,
  serializeWitnessCapturePlan,
  witnessCaptureArguments,
  witnessCaptureFrameName,
  type WitnessCapturePlan,
  type WitnessCaptureSource,
} from '../src/lib/witness-capture'
import { canonicalProspectivePath, writeUtf8FileSafely } from './lib/safe-write.mts'

interface Options {
  room: string
  ingress: string
  source: WitnessCaptureSource
  intervalSeconds: number
  frameLimit: number
  planOutput?: string
  approvedPlan?: string
  capture: boolean
  confirmCapture?: string
}

const repositoryRoot = realpathSync(dirname(dirname(fileURLToPath(import.meta.url))))
const privateRoot = resolve(repositoryRoot, '.private', 'witness')
const screencapture = '/usr/sbin/screencapture'
const temporaryRoots = [...new Set([realpathSync(tmpdir()), realpathSync('/tmp')])]

function usage(): never {
  console.error([
    'Usage: npx tsx scripts/witness-capture.mts',
    '  --room CODE --ingress .private/witness/frames/CODE',
    '  (--display N | --window-id ID | --rectangle X,Y,W,H)',
    '  [--interval 15] [--frame-limit 40]',
    '  --plan-output .private/witness/CODE-capture-plan.json',
    '  [--capture --approved-plan PLAN.json --confirm-capture CODE]',
    '',
    'Default: writes only canonical plan bytes; no screen pixels are captured.',
    '`--capture` writes bounded PNG frames locally. It never sends them or declares facts.',
  ].join('\n'))
  process.exit(1)
}

function integer(value: string, label: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) throw new Error(`${label} must be an integer`)
  return parsed
}

function parseRectangle(value: string): Extract<WitnessCaptureSource, { kind: 'rectangle' }> {
  const parts = value.split(',')
  if (parts.length !== 4) throw new Error('--rectangle must be X,Y,W,H')
  const [x, y, width, height] = parts.map((part) => integer(part, '--rectangle coordinate'))
  return { kind: 'rectangle', x, y, width, height }
}

function parseArgs(argv: string[]): Options {
  let room = ''
  let ingress = ''
  let source: WitnessCaptureSource | undefined
  let intervalSeconds = 15
  let frameLimit = 40
  let planOutput: string | undefined
  let approvedPlan: string | undefined
  let capture = false
  let confirmCapture: string | undefined
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--room') room = argv[++index] ?? ''
    else if (arg === '--ingress') ingress = argv[++index] ?? ''
    else if (arg === '--display') {
      if (source) throw new Error('choose exactly one capture source')
      source = { kind: 'display', display: integer(argv[++index] ?? '', '--display') }
    } else if (arg === '--window-id') {
      if (source) throw new Error('choose exactly one capture source')
      source = { kind: 'window', window_id: integer(argv[++index] ?? '', '--window-id') }
    } else if (arg === '--rectangle') {
      if (source) throw new Error('choose exactly one capture source')
      source = parseRectangle(argv[++index] ?? '')
    } else if (arg === '--interval') intervalSeconds = integer(argv[++index] ?? '', '--interval')
    else if (arg === '--frame-limit') frameLimit = integer(argv[++index] ?? '', '--frame-limit')
    else if (arg === '--plan-output') planOutput = argv[++index] ?? ''
    else if (arg === '--approved-plan') approvedPlan = argv[++index] ?? ''
    else if (arg === '--capture') capture = true
    else if (arg === '--confirm-capture') confirmCapture = (argv[++index] ?? '').trim().toUpperCase()
    else if (arg === '--help' || arg === '-h') usage()
    else throw new Error(`unknown argument ${arg}`)
  }
  room = room.trim().toUpperCase()
  if (!room || !ingress || !source) usage()
  if (capture) {
    if (!approvedPlan) throw new Error('--capture requires --approved-plan')
    if (planOutput) throw new Error('--plan-output is valid only in plan mode')
    if (confirmCapture !== room) throw new Error(`--capture requires --confirm-capture ${room}`)
  } else {
    if (!planOutput) throw new Error('plan mode requires --plan-output')
    if (approvedPlan || confirmCapture) throw new Error('capture authority flags require --capture')
  }
  return {
    room,
    ingress,
    source,
    intervalSeconds,
    frameLimit,
    planOutput,
    approvedPlan,
    capture,
    confirmCapture,
  }
}

function inside(root: string, path: string): boolean {
  const fromRoot = relative(root, path)
  return fromRoot !== '' && !fromRoot.startsWith('..') && !isAbsolute(fromRoot)
}

function insideAllowedRoot(path: string): boolean {
  return inside(privateRoot, path) || temporaryRoots.some((root) => inside(root, path))
}

function resolvePrivatePath(option: string, existing: boolean): string {
  mkdirSync(privateRoot, { recursive: true, mode: 0o700 })
  const path = existing ? realpathSync(resolve(option)) : canonicalProspectivePath(option)
  if (!insideAllowedRoot(path)) {
    throw new Error('witness capture artifacts must stay under .private/witness or the system temporary directory')
  }
  return path
}

function ensureIngress(option: string): string {
  const prospective = canonicalProspectivePath(option)
  if (!insideAllowedRoot(prospective)) {
    throw new Error('witness capture ingress must stay under .private/witness or the system temporary directory')
  }
  mkdirSync(prospective, { recursive: true, mode: 0o700 })
  const ingress = realpathSync(prospective)
  assertPrivateDirectory(ingress)
  return ingress
}

interface DirectoryIdentity {
  device: number
  inode: number
}

function assertPrivateDirectory(path: string, expected?: DirectoryIdentity): DirectoryIdentity {
  const stats = lstatSync(path)
  if (!stats.isDirectory() || stats.isSymbolicLink() || realpathSync(path) !== path) {
    throw new Error('witness capture ingress must be a real directory')
  }
  if ((stats.mode & 0o077) !== 0) {
    throw new Error('witness capture ingress must not grant group or other permissions')
  }
  if (typeof process.getuid === 'function' && stats.uid !== process.getuid()) {
    throw new Error('witness capture ingress must be owned by the current user')
  }
  const identity = { device: stats.dev, inode: stats.ino }
  if (expected && (identity.device !== expected.device || identity.inode !== expected.inode)) {
    throw new Error('witness capture ingress changed during capture')
  }
  return identity
}

function sameSource(left: WitnessCaptureSource, right: WitnessCaptureSource): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function captureOne(plan: WitnessCapturePlan, output: string): Promise<void> {
  return new Promise((resolveCapture, rejectCapture) => {
    execFile(screencapture, witnessCaptureArguments(plan, output), (error, _stdout, stderr) => {
      if (error) {
        rejectCapture(new Error(`screencapture failed: ${stderr.trim() || error.message}`))
        return
      }
      resolveCapture()
    })
  })
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolveWait) => {
    let timer: ReturnType<typeof setTimeout>
    const finish = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolveWait()
    }
    timer = setTimeout(finish, milliseconds)
    signal.addEventListener('abort', finish, { once: true })
  })
}

async function runCapture(plan: WitnessCapturePlan): Promise<void> {
  if (process.platform !== 'darwin' || !existsSync(screencapture)) {
    throw new Error('witness screen capture requires macOS /usr/sbin/screencapture')
  }
  const controller = new AbortController()
  const stop = () => controller.abort()
  process.once('SIGINT', stop)
  process.once('SIGTERM', stop)
  const ingressIdentity = assertPrivateDirectory(plan.ingress)
  const staging = join(
    dirname(plan.ingress),
    `.witness-capture-staging-${plan.capture_key.slice(0, 16)}-${process.pid}`,
  )
  mkdirSync(staging, { mode: 0o700 })
  assertPrivateDirectory(staging)
  let captured = 0
  console.log(`[witness-capture] room=${plan.room} ingress=${plan.ingress}`)
  console.log(`[witness-capture] source=${JSON.stringify(plan.source)}`)
  console.log(`[witness-capture] authority=local-capture-only model_send=false auto_declare=false`)
  console.log(`[witness-capture] interval=${plan.interval_seconds}s frame_limit=${plan.frame_limit}`)
  try {
    while (!controller.signal.aborted && captured < plan.frame_limit) {
      const capturedAt = new Date().toISOString()
      const name = witnessCaptureFrameName(plan.room, capturedAt, captured + 1)
      const finalPath = join(plan.ingress, name)
      const partialPath = join(staging, `${name}.partial.png`)
      if (existsSync(finalPath) || existsSync(partialPath)) {
        throw new Error(`refusing to replace existing capture path ${finalPath}`)
      }
      try {
        await captureOne(plan, partialPath)
        const stats = lstatSync(partialPath)
        if (!stats.isFile() || stats.isSymbolicLink()) {
          throw new Error('screencapture did not produce a regular nonempty file')
        }
        assertWitnessCapturePng(readFileSync(partialPath))
        chmodSync(partialPath, 0o600)
        assertPrivateDirectory(plan.ingress, ingressIdentity)
        try {
          linkSync(partialPath, finalPath)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
            throw new Error(`refusing to replace existing capture path ${finalPath}`)
          }
          throw error
        }
      } finally {
        if (existsSync(partialPath)) unlinkSync(partialPath)
      }
      captured += 1
      console.log(`[witness-capture] captured=${captured}/${plan.frame_limit} file=${name}`)
      if (captured < plan.frame_limit && !controller.signal.aborted) {
        await wait(plan.interval_seconds * 1_000, controller.signal)
      }
    }
  } finally {
    process.removeListener('SIGINT', stop)
    process.removeListener('SIGTERM', stop)
    rmdirSync(staging)
  }
  console.log(`[witness-capture] stopped=true captured=${captured} model_send=false auto_declare=false`)
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const ingress = ensureIngress(options.ingress)
  const currentPlan = buildWitnessCapturePlan({
    room: options.room,
    ingress,
    source: options.source,
    intervalSeconds: options.intervalSeconds,
    frameLimit: options.frameLimit,
  })
  if (!options.capture) {
    const output = resolvePrivatePath(options.planOutput ?? '', false)
    writeUtf8FileSafely(output, serializeWitnessCapturePlan(currentPlan), false, 0o600)
    console.log(`[witness-capture] plan=${output}`)
    console.log(`[witness-capture] capture_key=${currentPlan.capture_key}`)
    console.log('[witness-capture] mode=plan screen_captured=false model_send=false auto_declare=false')
    return
  }

  const approvedPath = resolvePrivatePath(options.approvedPlan ?? '', true)
  const approved = parseWitnessCapturePlan(readFileSync(approvedPath, 'utf8'))
  if (approved.room !== currentPlan.room
      || approved.ingress !== currentPlan.ingress
      || !sameSource(approved.source, currentPlan.source)
      || approved.interval_seconds !== currentPlan.interval_seconds
      || approved.frame_limit !== currentPlan.frame_limit
      || approved.capture_key !== currentPlan.capture_key) {
    throw new Error('current capture request does not match the approved plan')
  }
  console.log(`[witness-capture] approved_plan=${approvedPath}`)
  console.log(`[witness-capture] capture_key=${approved.capture_key}`)
  await runCapture(approved)
}

main().catch((error) => {
  console.error(`[witness-capture] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
