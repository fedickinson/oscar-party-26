import { describe, expect, it } from 'vitest'
import {
  assertWitnessCapturePng,
  buildWitnessCapturePlan,
  parseWitnessCapturePlan,
  serializeWitnessCapturePlan,
  witnessCaptureArguments,
  witnessCaptureFrameName,
} from './witness-capture'

const INPUT = {
  room: 'abcd',
  ingress: '/private/repo/.private/witness/frames/ABCD',
  intervalSeconds: 15,
  frameLimit: 40,
}

describe('witness capture plan', () => {
  it('freezes one display capture into canonical review bytes', () => {
    const plan = buildWitnessCapturePlan({ ...INPUT, source: { kind: 'display', display: 1 } })

    expect(plan).toMatchObject({
      version: 1,
      artifact: 'witness-screen-capture-plan',
      room: 'ABCD',
      ingress: INPUT.ingress,
      source: { kind: 'display', display: 1 },
      interval_seconds: 15,
      frame_limit: 40,
      image_format: 'png',
      sends_to_model: false,
      declares_facts: false,
    })
    expect(plan.capture_key).toMatch(/^[a-f0-9]{64}$/)
    const raw = serializeWitnessCapturePlan(plan)
    expect(parseWitnessCapturePlan(raw)).toEqual(plan)
    expect(serializeWitnessCapturePlan(plan)).toBe(raw)
  })

  it('builds fixed noninteractive arguments for display, window, and rectangle targets', () => {
    expect(witnessCaptureArguments(
      buildWitnessCapturePlan({ ...INPUT, source: { kind: 'display', display: 2 } }),
      '/tmp/frame.partial',
    )).toEqual(['-x', '-r', '-t', 'png', '-D2', '/tmp/frame.partial'])
    expect(witnessCaptureArguments(
      buildWitnessCapturePlan({ ...INPUT, source: { kind: 'window', window_id: 901 } }),
      '/tmp/frame.partial',
    )).toEqual(['-x', '-r', '-t', 'png', '-l901', '/tmp/frame.partial'])
    expect(witnessCaptureArguments(
      buildWitnessCapturePlan({
        ...INPUT,
        source: { kind: 'rectangle', x: 10, y: 20, width: 1280, height: 720 },
      }),
      '/tmp/frame.partial',
    )).toEqual(['-x', '-r', '-t', 'png', '-R10,20,1280,720', '/tmp/frame.partial'])
  })

  it('requires a bounded, explicit capture target and private absolute ingress', () => {
    expect(() => buildWitnessCapturePlan({
      ...INPUT,
      ingress: 'frames',
      source: { kind: 'display', display: 1 },
    })).toThrow('ingress must be an absolute path')
    expect(() => buildWitnessCapturePlan({
      ...INPUT,
      frameLimit: 1_001,
      source: { kind: 'display', display: 1 },
    })).toThrow('frame limit must be an integer from 1 through 1000')
    expect(() => buildWitnessCapturePlan({
      ...INPUT,
      source: { kind: 'rectangle', x: -1, y: 0, width: 100, height: 100 },
    })).toThrow('rectangle coordinates must be non-negative integers')
    expect(() => buildWitnessCapturePlan({
      ...INPUT,
      source: { kind: 'window', window_id: 0 },
    })).toThrow('window id must be an integer from 1 through 2147483647')
  })

  it('admits only downstream-sized PNG bytes for publication', () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(() => assertWitnessCapturePng(png)).not.toThrow()
    expect(() => assertWitnessCapturePng(Uint8Array.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0])))
      .toThrow('capture output must be a PNG')
    expect(() => assertWitnessCapturePng(new Uint8Array((5 * 1024 * 1024) + 1)))
      .toThrow('capture output must contain 8 to 5242880 bytes')
  })

  it('rejects tampered and noncanonical approved plans', () => {
    const raw = serializeWitnessCapturePlan(
      buildWitnessCapturePlan({ ...INPUT, source: { kind: 'display', display: 1 } }),
    )
    expect(() => parseWitnessCapturePlan(raw.replace('"display": 1', '"display": 2')))
      .toThrow('capture_key does not match')
    expect(() => parseWitnessCapturePlan(raw.trim())).toThrow('approved witness capture plan is not canonical')
  })

  it('derives safe direct-child frame names without embedding source identifiers', () => {
    expect(witnessCaptureFrameName('ABCD', '2026-08-12T12:34:56.789Z', 7)).toBe(
      'frame-ABCD-2026-08-12T12-34-56-789Z-000007.png',
    )
    expect(() => witnessCaptureFrameName('ABCD', 'not-a-time', 1)).toThrow('capture time must be canonical')
    expect(() => witnessCaptureFrameName('ABCD', '2026-08-12T12:34:56.789Z', 0)).toThrow(
      'capture index must be a positive integer',
    )
  })
})
