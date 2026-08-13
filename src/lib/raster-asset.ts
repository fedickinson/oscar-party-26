export type RasterAssetKind = 'avif' | 'jpeg' | 'png' | 'webp'

function hasBytes(
  bytes: Uint8Array,
  offset: number,
  expected: readonly number[],
): boolean {
  return offset >= 0
    && bytes.length >= offset + expected.length
    && expected.every((byte, index) => bytes[offset + index] === byte)
}

function hasAscii(bytes: Uint8Array, offset: number, expected: string): boolean {
  return hasBytes(bytes, offset, [...expected].map((character) => character.charCodeAt(0)))
}

function uint32BigEndian(bytes: Uint8Array, offset: number): number | null {
  if (bytes.length < offset + 4) return null
  return (
    bytes[offset] * 0x1000000
    + bytes[offset + 1] * 0x10000
    + bytes[offset + 2] * 0x100
    + bytes[offset + 3]
  )
}

function hasAvifBrand(bytes: Uint8Array): boolean {
  if (!hasAscii(bytes, 4, 'ftyp')) return false
  const declaredSize = uint32BigEndian(bytes, 0)
  if (declaredSize === null || declaredSize === 1) return false
  const boxEnd = declaredSize === 0 ? bytes.length : declaredSize
  if (boxEnd < 16 || boxEnd > bytes.length) return false
  for (let offset = 8; offset + 4 <= boxEnd; offset += offset === 8 ? 8 : 4) {
    if (hasAscii(bytes, offset, 'avif') || hasAscii(bytes, offset, 'avis')) return true
  }
  return false
}

/** Detects only the raster formats admitted by the show-pack portrait contract. */
export function detectRasterAssetKind(bytes: Uint8Array): RasterAssetKind | null {
  if (hasBytes(bytes, 0, [0xff, 0xd8, 0xff])) return 'jpeg'
  if (hasBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  if (hasAscii(bytes, 0, 'RIFF') && hasAscii(bytes, 8, 'WEBP')) return 'webp'
  if (hasAvifBrand(bytes)) return 'avif'
  return null
}

function expectedRasterKind(path: string): RasterAssetKind | null {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase()
  if (extension === 'jpg' || extension === 'jpeg') return 'jpeg'
  if (extension === 'png' || extension === 'webp' || extension === 'avif') return extension
  return null
}

/** Proves the sealed bytes agree with the reviewed portrait path. */
export function assertRasterAssetMatchesPath(path: string, bytes: Uint8Array): void {
  const expected = expectedRasterKind(path)
  if (!expected) throw new Error(`portrait ${path} has an unsupported raster extension`)
  const actual = detectRasterAssetKind(bytes)
  if (!actual) throw new Error(`portrait ${path} is not a recognized raster image`)
  if (actual !== expected) {
    throw new Error(`portrait extension ${expected} does not match ${actual} bytes`)
  }
}
