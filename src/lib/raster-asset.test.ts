import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AVATAR_CONFIGS } from '../data/avatars'
import {
  assertRasterAssetMatchesPath,
  detectRasterAssetKind,
} from './raster-asset'

const ascii = (value: string): number[] => [...new TextEncoder().encode(value)]

describe('raster asset signatures', () => {
  it('recognizes the browser raster formats admitted by show-pack portraits', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ])
    const webp = new Uint8Array([
      ...ascii('RIFF'), 0x04, 0x00, 0x00, 0x00, ...ascii('WEBP'),
    ])
    const avif = new Uint8Array([
      0x00, 0x00, 0x00, 0x14,
      ...ascii('ftyp'),
      ...ascii('mif1'),
      0x00, 0x00, 0x00, 0x00,
      ...ascii('avif'),
    ])

    expect(detectRasterAssetKind(jpeg)).toBe('jpeg')
    expect(detectRasterAssetKind(png)).toBe('png')
    expect(detectRasterAssetKind(webp)).toBe('webp')
    expect(detectRasterAssetKind(avif)).toBe('avif')
    expect(() => assertRasterAssetMatchesPath('/cast/queen.jpg', jpeg)).not.toThrow()
    expect(() => assertRasterAssetMatchesPath('/cast/queen.jpeg', jpeg)).not.toThrow()
  })

  it('rejects unknown and truncated bytes instead of trusting a raster suffix', () => {
    expect(() => assertRasterAssetMatchesPath(
      '/cast/queen.webp',
      new TextEncoder().encode('not an image'),
    )).toThrow('is not a recognized raster image')
    expect(() => assertRasterAssetMatchesPath(
      '/cast/queen.avif',
      new Uint8Array([
        0x00, 0x00, 0x00, 0x14,
        ...ascii('ftyp'),
        ...ascii('avif'),
      ]),
    )).toThrow('is not a recognized raster image')
  })

  it('rejects bytes whose raster format differs from the reviewed path', () => {
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ])
    expect(() => assertRasterAssetMatchesPath('/cast/queen.webp', png))
      .toThrow('portrait extension webp does not match png bytes')
  })

  it('keeps every legacy avatar config bound to a real matching public asset', () => {
    const configured = AVATAR_CONFIGS.flatMap((avatar) => avatar.imageUrl
      ? [{ id: avatar.id, publicPath: avatar.imageUrl }]
      : [])
    const missing = configured
      .filter(({ publicPath }) => !existsSync(join(process.cwd(), 'public', publicPath.slice(1))))
      .map(({ id, publicPath }) => `${id}: ${publicPath}`)

    expect(missing).toEqual([])

    for (const { publicPath } of configured) {
      const bytes = readFileSync(join(process.cwd(), 'public', publicPath.slice(1)))
      expect(() => assertRasterAssetMatchesPath(publicPath, bytes)).not.toThrow()
    }
  })
})
