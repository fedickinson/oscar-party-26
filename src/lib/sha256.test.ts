import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { sha256BytesHex, sha256Hex } from './sha256'

describe('browser-safe SHA-256', () => {
  it('matches the standard empty and abc vectors', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('matches Node for UTF-8 and multi-block input', () => {
    const input = 'Dragon record: Rhaenyra, Alicent, and Sheepstealer.\n'.repeat(20)
    expect(sha256Hex(input)).toBe(createHash('sha256').update(input).digest('hex'))
  })

  it('matches Node for arbitrary binary bytes', () => {
    const bytes = new Uint8Array([0x00, 0xff, 0x80, 0x01, 0xfe, 0x7f])
    expect(sha256BytesHex(bytes)).toBe(createHash('sha256').update(bytes).digest('hex'))
  })
})
