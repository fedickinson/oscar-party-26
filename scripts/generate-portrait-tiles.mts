#!/usr/bin/env -S npx tsx

/**
 * Emits deterministic abstract PNG portrait tiles for show-pack entities.
 *
 * Dependency free: a hand-rolled PNG encoder over node:zlib, so a rerun with
 * the same pack id and entity ids produces byte-identical files. Each tile is a
 * two-tone diagonal split whose hues derive only from the entity id.
 *
 * Usage:
 *   npx tsx scripts/generate-portrait-tiles.mts --pack PACK_ID --entities a,b,c [--size 256]
 */

import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < 256; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type: string, data: Uint8Array): Buffer {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, Buffer.from(data), crc])
}

/** Truecolor 8-bit PNG from raw RGB rows, filter byte zero on every row. */
function encodePng(width: number, height: number, rgb: Uint8Array): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  header[10] = 0
  header[11] = 0
  header[12] = 0
  const stride = width * 3
  const raw = Buffer.alloc(height * (stride + 1))
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0
    Buffer.from(rgb.subarray(y * stride, (y + 1) * stride)).copy(raw, y * (stride + 1) + 1)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ])
}

/** Two deterministic tones plus a diagonal offset, all derived from the id. */
function tileFor(entityId: string, size: number): Buffer {
  const seed = createHash('sha256').update(`portrait-tile:${entityId}`).digest()
  const front: [number, number, number] = [seed[0], seed[1], seed[2]]
  const back: [number, number, number] = [
    (seed[3] + 96) % 256,
    (seed[4] + 96) % 256,
    (seed[5] + 96) % 256,
  ]
  const offset = seed[6] % size
  const band = 16 + (seed[7] % 24)
  const rgb = new Uint8Array(size * size * 3)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const diagonal = (x + y + offset) % (band * 2)
      const tone = diagonal < band ? front : back
      const index = (y * size + x) * 3
      rgb[index] = tone[0]
      rgb[index + 1] = tone[1]
      rgb[index + 2] = tone[2]
    }
  }
  return encodePng(size, size, rgb)
}

function parseArgs(argv: string[]): { pack: string; entities: string[]; size: number } {
  let pack = ''
  let entities: string[] = []
  let size = 256
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--pack') pack = argv[++index] ?? ''
    else if (arg === '--entities') {
      entities = (argv[++index] ?? '').split(',').map((value) => value.trim()).filter(Boolean)
    } else if (arg === '--size') size = Number.parseInt(argv[++index] ?? '', 10)
    else throw new Error(`unknown argument ${arg}`)
  }
  const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
  if (!slug.test(pack)) throw new Error('--pack must be a kebab-case slug')
  if (entities.length === 0) throw new Error('--entities needs at least one kebab-case slug')
  for (const entity of entities) {
    if (!slug.test(entity)) throw new Error(`entity ${entity} must be a kebab-case slug`)
  }
  if (!Number.isInteger(size) || size < 8 || size > 1024) {
    throw new Error('--size must be an integer from 8 through 1024')
  }
  return { pack, entities, size }
}

function main(): void {
  const options = parseArgs(process.argv.slice(2))
  const directory = resolve(repoRoot, 'public', 'portraits', options.pack)
  mkdirSync(directory, { recursive: true })
  console.log('[portrait-tiles] target=local-filesystem')
  console.log(`[portrait-tiles] pack=${options.pack} size=${options.size}x${options.size}`)
  for (const entity of options.entities) {
    const bytes = tileFor(entity, options.size)
    writeFileSync(join(directory, `${entity}.png`), bytes)
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    console.log(`/portraits/${options.pack}/${entity}.png ${sha256}`)
  }
  console.log(`[portrait-tiles] wrote=${options.entities.length} into ${directory}`)
}

try {
  main()
} catch (error) {
  console.error(`[portrait-tiles] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}
