import { describe, expect, it } from 'vitest'
import { containsDisallowedEmoji } from './generated-prose'

describe('generated prose character safety', () => {
  it('detects pictographs, flags, modifiers, variation selectors and keycaps', () => {
    const samples = [
      String.fromCodePoint(0x1f525),
      String.fromCodePoint(0x1f1fa, 0x1f1f8),
      String.fromCodePoint(0x1f3fd),
      `heart${String.fromCodePoint(0xfe0f)}`,
      `1${String.fromCodePoint(0x20e3)}`,
    ]

    expect(samples.every(containsDisallowedEmoji)).toBe(true)
  })

  it('allows ordinary prose, punctuation and markdown emphasis', () => {
    expect(containsDisallowedEmoji('**The record stands.** Wine, fire, and dragons.')).toBe(false)
  })
})
