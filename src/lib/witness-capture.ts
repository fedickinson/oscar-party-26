import { canonicalizeJson } from './operator-snapshot'
import { sha256Hex } from './sha256'
import { WITNESS_MAX_FRAME_BYTES } from './witness'

export type WitnessCaptureSource =
  | { kind: 'display'; display: number }
  | { kind: 'window'; window_id: number }
  | { kind: 'rectangle'; x: number; y: number; width: number; height: number }

export interface WitnessCapturePlan {
  version: 1
  artifact: 'witness-screen-capture-plan'
  capture_key: string
  room: string
  ingress: string
  source: WitnessCaptureSource
  interval_seconds: number
  frame_limit: number
  image_format: 'png'
  sends_to_model: false
  declares_facts: false
}

interface WitnessCaptureInput {
  room: string
  ingress: string
  source: WitnessCaptureSource
  intervalSeconds: number
  frameLimit: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertExactKeys(value: Record<string, unknown>, keys: string[], label: string): void {
  const allowed = new Set(keys)
  const unknown = Object.keys(value).find((key) => !allowed.has(key))
  if (unknown) throw new Error(`${label} has unknown field ${unknown}`)
  const missing = keys.find((key) => !(key in value))
  if (missing) throw new Error(`${label} is missing field ${missing}`)
}

function integerInRange(value: unknown, minimum: number, maximum: number, label: string): number {
  if (!Number.isInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} through ${maximum}`)
  }
  return Number(value)
}

function parseRoom(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Z0-9]{4,12}$/.test(value)) {
    throw new Error('witness capture room must be 4 to 12 uppercase letters or numbers')
  }
  return value
}

function parseIngress(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/')) {
    throw new Error('witness capture ingress must be an absolute path')
  }
  if (value.includes('\0')) throw new Error('witness capture ingress is invalid')
  return value
}

function parseSource(value: unknown): WitnessCaptureSource {
  if (!isRecord(value) || typeof value.kind !== 'string') {
    throw new Error('witness capture source must be an object')
  }
  if (value.kind === 'display') {
    assertExactKeys(value, ['kind', 'display'], 'witness capture display source')
    return { kind: 'display', display: integerInRange(value.display, 1, 64, 'display') }
  }
  if (value.kind === 'window') {
    assertExactKeys(value, ['kind', 'window_id'], 'witness capture window source')
    return { kind: 'window', window_id: integerInRange(value.window_id, 1, 2_147_483_647, 'window id') }
  }
  if (value.kind === 'rectangle') {
    assertExactKeys(value, ['kind', 'x', 'y', 'width', 'height'], 'witness capture rectangle source')
    if (!Number.isInteger(value.x) || !Number.isInteger(value.y)
        || Number(value.x) < 0 || Number(value.y) < 0) {
      throw new Error('rectangle coordinates must be non-negative integers')
    }
    return {
      kind: 'rectangle',
      x: Number(value.x),
      y: Number(value.y),
      width: integerInRange(value.width, 1, 16_384, 'rectangle width'),
      height: integerInRange(value.height, 1, 16_384, 'rectangle height'),
    }
  }
  throw new Error('witness capture source kind must be display, window, or rectangle')
}

function core(plan: Omit<WitnessCapturePlan, 'capture_key'>): Omit<WitnessCapturePlan, 'capture_key'> {
  return plan
}

function captureKey(value: Omit<WitnessCapturePlan, 'capture_key'>): string {
  return sha256Hex(JSON.stringify(canonicalizeJson(value)))
}

function unchecked(plan: WitnessCapturePlan): string {
  return `${JSON.stringify(plan, null, 2)}\n`
}

export function buildWitnessCapturePlan(input: WitnessCaptureInput): WitnessCapturePlan {
  const room = input.room.trim().toUpperCase()
  const value = core({
    version: 1,
    artifact: 'witness-screen-capture-plan',
    room: parseRoom(room),
    ingress: parseIngress(input.ingress),
    source: parseSource(input.source),
    interval_seconds: integerInRange(input.intervalSeconds, 5, 3_600, 'capture interval'),
    frame_limit: integerInRange(input.frameLimit, 1, 1_000, 'frame limit'),
    image_format: 'png',
    sends_to_model: false,
    declares_facts: false,
  })
  return { ...value, capture_key: captureKey(value) }
}

export function parseWitnessCapturePlan(raw: string): WitnessCapturePlan {
  let value: unknown
  try { value = JSON.parse(raw) } catch { throw new Error('witness capture plan must be JSON') }
  if (!isRecord(value)) throw new Error('witness capture plan must be an object')
  assertExactKeys(value, [
    'version', 'artifact', 'capture_key', 'room', 'ingress', 'source',
    'interval_seconds', 'frame_limit', 'image_format', 'sends_to_model', 'declares_facts',
  ], 'witness capture plan')
  if (value.version !== 1 || value.artifact !== 'witness-screen-capture-plan') {
    throw new Error('witness capture plan identity is invalid')
  }
  if (typeof value.capture_key !== 'string' || !/^[a-f0-9]{64}$/.test(value.capture_key)) {
    throw new Error('witness capture plan capture_key is invalid')
  }
  if (value.image_format !== 'png' || value.sends_to_model !== false || value.declares_facts !== false) {
    throw new Error('witness capture plan authority is invalid')
  }
  const parsed = buildWitnessCapturePlan({
    room: parseRoom(value.room),
    ingress: parseIngress(value.ingress),
    source: parseSource(value.source),
    intervalSeconds: integerInRange(value.interval_seconds, 5, 3_600, 'capture interval'),
    frameLimit: integerInRange(value.frame_limit, 1, 1_000, 'frame limit'),
  })
  if (parsed.capture_key !== value.capture_key) {
    throw new Error('witness capture plan capture_key does not match its contents')
  }
  if (raw !== unchecked(parsed)) throw new Error('approved witness capture plan is not canonical')
  return parsed
}

export function serializeWitnessCapturePlan(plan: WitnessCapturePlan): string {
  return unchecked(parseWitnessCapturePlan(unchecked(plan)))
}

export function witnessCaptureArguments(plan: WitnessCapturePlan, outputPath: string): string[] {
  if (!outputPath.startsWith('/')) throw new Error('witness capture output must be an absolute path')
  const source = plan.source
  const target = source.kind === 'display'
    ? `-D${source.display}`
    : source.kind === 'window'
      ? `-l${source.window_id}`
      : `-R${source.x},${source.y},${source.width},${source.height}`
  return ['-x', '-r', '-t', 'png', target, outputPath]
}

export function assertWitnessCapturePng(bytes: Uint8Array): void {
  if (bytes.length < 8 || bytes.length > WITNESS_MAX_FRAME_BYTES) {
    throw new Error(`capture output must contain 8 to ${WITNESS_MAX_FRAME_BYTES} bytes`)
  }
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (!signature.every((byte, index) => bytes[index] === byte)) {
    throw new Error('capture output must be a PNG')
  }
}

export function witnessCaptureFrameName(room: string, capturedAt: string, index: number): string {
  const canonicalRoom = parseRoom(room.trim().toUpperCase())
  if (Number.isNaN(Date.parse(capturedAt)) || new Date(capturedAt).toISOString() !== capturedAt) {
    throw new Error('capture time must be canonical ISO')
  }
  if (!Number.isInteger(index) || index < 1 || index > 999_999) {
    throw new Error('capture index must be a positive integer up to 999999')
  }
  return `frame-${canonicalRoom}-${capturedAt.replace(/[:.]/g, '-')}-${String(index).padStart(6, '0')}.png`
}
