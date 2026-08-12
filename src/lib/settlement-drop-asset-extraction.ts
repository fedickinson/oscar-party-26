import { detectRasterAssetKind, type RasterAssetKind } from './raster-asset'
import { sha256BytesHex } from './sha256'

export interface SettlementDropAssetSourceSeal {
  name: string
  bytes: number
  sha256: string
}

export interface SettlementDropExtractedAsset {
  id: string
  path: string
  mime_type: 'image/avif' | 'image/jpeg' | 'image/png' | 'image/webp'
  bytes: number
  sha256: string
}

export interface SettlementDropAssetExtractionManifest {
  extraction_version: 1
  artifact: 'settlement-drop-asset-extraction'
  target: { room_code: string }
  source: SettlementDropAssetSourceSeal
  assets: SettlementDropExtractedAsset[]
}

export interface SettlementDropAssetExtractionPlan {
  manifest: SettlementDropAssetExtractionManifest
  files: Array<{ path: string; bytes: Uint8Array }>
}

const MIME_TO_KIND = {
  'image/avif': 'avif',
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const

const KIND_TO_MIME: Record<RasterAssetKind, SettlementDropExtractedAsset['mime_type']> = {
  avif: 'image/avif',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value
}

function requiredRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function assertExactKeys(value: Record<string, unknown>, allowed: string[], label: string): void {
  const allowedSet = new Set(allowed)
  const unknown = Object.keys(value).find((key) => !allowedSet.has(key))
  if (unknown) throw new Error(`${label} has unknown field ${unknown}`)
  const missing = allowed.find((key) => !(key in value))
  if (missing) throw new Error(`${label} is missing field ${missing}`)
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) throw new Error(`${label} must be a non-negative integer`)
  return value as number
}

function digest(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest`)
  }
  return value
}

function validateSource(value: SettlementDropAssetSourceSeal): SettlementDropAssetSourceSeal {
  const name = requiredString(value.name, 'source.name')
  if (!Number.isInteger(value.bytes) || value.bytes < 0) throw new Error('source.bytes must be a non-negative integer')
  if (typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256)) {
    throw new Error('source.sha256 must be a lowercase SHA-256 digest')
  }
  return { name, bytes: value.bytes, sha256: value.sha256 }
}

function decodeBase64(value: string, label: string): Uint8Array {
  if (!value || value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error(`${label} must be a base64 image data URI`)
  }
  const decoded = atob(value)
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0))
}

function decodeAsset(id: string, dataUri: unknown): { bytes: Uint8Array; kind: RasterAssetKind } {
  if (typeof dataUri !== 'string') throw new Error(`asset ${id} must be a base64 image data URI`)
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUri)
  if (!match) throw new Error(`asset ${id} must be a base64 image data URI`)
  const expected = MIME_TO_KIND[match[1] as keyof typeof MIME_TO_KIND]
  if (!expected) throw new Error(`asset ${id} has unsupported MIME type ${match[1]}`)
  const bytes = decodeBase64(match[2], `asset ${id}`)
  const actual = detectRasterAssetKind(bytes)
  if (!actual) throw new Error(`asset ${id} is not a recognized raster image`)
  if (actual !== expected) throw new Error(`asset ${id} declares ${match[1]} but contains ${actual} bytes`)
  return { bytes, kind: actual }
}

/** Plans byte-identical extraction without assigning any presentation semantics. */
export function planSettlementDropAssetExtraction(input: {
  room_code: string
  source: SettlementDropAssetSourceSeal
  assets: unknown
}): SettlementDropAssetExtractionPlan {
  const roomCode = requiredString(input.room_code, 'room_code')
  if (input.assets === null || typeof input.assets !== 'object' || Array.isArray(input.assets)) {
    throw new Error('assets must be an object')
  }
  const entries = Object.entries(input.assets)
  if (entries.length === 0) throw new Error('assets must contain at least one entry')

  const caseFolded = new Map<string, string>()
  for (const [id] of entries) {
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id)) throw new Error(`asset id ${id} is invalid`)
    const folded = id.toLocaleLowerCase('en-US')
    const prior = caseFolded.get(folded)
    if (prior) throw new Error(`asset IDs ${prior} and ${id} collide on a case-insensitive filesystem`)
    caseFolded.set(folded, id)
  }
  entries.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)

  const files: SettlementDropAssetExtractionPlan['files'] = []
  const assets: SettlementDropExtractedAsset[] = entries.map(([id, dataUri]) => {
    const decoded = decodeAsset(id, dataUri)
    const extension = decoded.kind === 'jpeg' ? 'jpeg' : decoded.kind
    const path = `assets/${id}.${extension}`
    const digest = sha256BytesHex(decoded.bytes)
    files.push({ path, bytes: decoded.bytes })
    return {
      id,
      path,
      mime_type: KIND_TO_MIME[decoded.kind],
      bytes: decoded.bytes.byteLength,
      sha256: digest,
    }
  })

  return {
    manifest: {
      extraction_version: 1,
      artifact: 'settlement-drop-asset-extraction',
      target: { room_code: roomCode },
      source: validateSource(input.source),
      assets,
    },
    files,
  }
}

export function serializeSettlementDropAssetExtractionManifest(
  manifest: SettlementDropAssetExtractionManifest,
): string {
  return `${JSON.stringify(manifest, null, 2)}\n`
}

export function parseSettlementDropAssetExtractionManifest(
  raw: string,
): SettlementDropAssetExtractionManifest {
  const value = requiredRecord(JSON.parse(raw), 'asset extraction')
  assertExactKeys(value, ['extraction_version', 'artifact', 'target', 'source', 'assets'], 'asset extraction')
  if (value.extraction_version !== 1) throw new Error('asset extraction extraction_version must be 1')
  if (value.artifact !== 'settlement-drop-asset-extraction') {
    throw new Error('asset extraction artifact is invalid')
  }
  const target = requiredRecord(value.target, 'asset extraction target')
  assertExactKeys(target, ['room_code'], 'asset extraction target')
  const source = requiredRecord(value.source, 'asset extraction source')
  assertExactKeys(source, ['name', 'bytes', 'sha256'], 'asset extraction source')
  if (!Array.isArray(value.assets) || value.assets.length === 0) {
    throw new Error('asset extraction assets must be a non-empty array')
  }
  const ids = new Set<string>()
  const paths = new Set<string>()
  const assets = value.assets.map((rawAsset, index) => {
    const label = `asset extraction asset ${index + 1}`
    const asset = requiredRecord(rawAsset, label)
    assertExactKeys(asset, ['id', 'path', 'mime_type', 'bytes', 'sha256'], label)
    const id = requiredString(asset.id, `${label}.id`)
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(id)) throw new Error(`${label}.id is invalid`)
    if (ids.has(id)) throw new Error(`duplicate extracted asset ${id}`)
    ids.add(id)
    const path = requiredString(asset.path, `${label}.path`)
    if (!/^assets\/[a-z0-9][a-z0-9_-]*\.(?:avif|jpeg|png|webp)$/i.test(path)) {
      throw new Error(`${label}.path must be a confined generated asset path`)
    }
    if (paths.has(path)) throw new Error(`duplicate extracted asset path ${path}`)
    paths.add(path)
    if (typeof asset.mime_type !== 'string' || !(asset.mime_type in MIME_TO_KIND)) {
      throw new Error(`${label}.mime_type is unsupported`)
    }
    const kind = MIME_TO_KIND[asset.mime_type as keyof typeof MIME_TO_KIND]
    const expectedPath = `assets/${id}.${kind === 'jpeg' ? 'jpeg' : kind}`
    if (path !== expectedPath) throw new Error(`${label}.path must equal ${expectedPath}`)
    return {
      id,
      path,
      mime_type: asset.mime_type as SettlementDropExtractedAsset['mime_type'],
      bytes: nonNegativeInteger(asset.bytes, `${label}.bytes`),
      sha256: digest(asset.sha256, `${label}.sha256`),
    }
  })
  const sorted = [...assets].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  if (assets.some((asset, index) => asset.id !== sorted[index].id)) {
    throw new Error('asset extraction assets must be sorted by id')
  }
  return {
    extraction_version: 1,
    artifact: 'settlement-drop-asset-extraction',
    target: { room_code: requiredString(target.room_code, 'asset extraction target.room_code') },
    source: {
      name: requiredString(source.name, 'asset extraction source.name'),
      bytes: nonNegativeInteger(source.bytes, 'asset extraction source.bytes'),
      sha256: digest(source.sha256, 'asset extraction source.sha256'),
    },
    assets,
  }
}
