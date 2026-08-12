import { describe, expect, it } from 'vitest'
import {
  parseSettlementDropAssetExtractionManifest,
  planSettlementDropAssetExtraction,
  serializeSettlementDropAssetExtractionManifest,
} from './settlement-drop-asset-extraction'

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01])
const webp = new Uint8Array([
  0x52, 0x49, 0x46, 0x46,
  0x04, 0x00, 0x00, 0x00,
  0x57, 0x45, 0x42, 0x50,
])

const asDataUri = (mime: string, bytes: Uint8Array) =>
  `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`

describe('planSettlementDropAssetExtraction', () => {
  it('decodes each asset into a deterministic compiler-ready local path', () => {
    const plan = planSettlementDropAssetExtraction({
      room_code: 'WDKH',
      source: {
        name: 'assets.json',
        bytes: 100,
        sha256: 'a'.repeat(64),
      },
      assets: {
        cast_ned: asDataUri('image/jpeg', jpeg),
        vhagar: asDataUri('image/webp', webp),
      },
    })

    expect(plan.manifest).toEqual({
      extraction_version: 1,
      artifact: 'settlement-drop-asset-extraction',
      target: { room_code: 'WDKH' },
      source: {
        name: 'assets.json',
        bytes: 100,
        sha256: 'a'.repeat(64),
      },
      assets: [
        {
          id: 'cast_ned',
          path: 'assets/cast_ned.jpeg',
          mime_type: 'image/jpeg',
          bytes: jpeg.byteLength,
          sha256: '780806275d97563cce1485a1bd48f4398ca42c7d0cf279b63d00a4a67ab7cd43',
        },
        {
          id: 'vhagar',
          path: 'assets/vhagar.webp',
          mime_type: 'image/webp',
          bytes: webp.byteLength,
          sha256: '3fe79651a92ea3850c3fc3dd9519a67c7f70b598fa238a3fd92042f6446e6452',
        },
      ],
    })
    expect(plan.files.map((file) => file.path)).toEqual([
      'assets/cast_ned.jpeg',
      'assets/vhagar.webp',
    ])
    expect(plan.files[0].bytes).toEqual(jpeg)
    expect(plan.files[1].bytes).toEqual(webp)
  })

  it('sorts assets by ID so source object order cannot change the handoff', () => {
    const source = { name: 'assets.json', bytes: 100, sha256: 'a'.repeat(64) }
    const left = planSettlementDropAssetExtraction({
      room_code: 'WDKH', source,
      assets: { vhagar: asDataUri('image/webp', webp), cast_ned: asDataUri('image/jpeg', jpeg) },
    })
    const right = planSettlementDropAssetExtraction({
      room_code: 'WDKH', source,
      assets: { cast_ned: asDataUri('image/jpeg', jpeg), vhagar: asDataUri('image/webp', webp) },
    })

    expect(serializeSettlementDropAssetExtractionManifest(left.manifest))
      .toBe(serializeSettlementDropAssetExtractionManifest(right.manifest))
  })

  it('rejects path-like asset IDs', () => {
    expect(() => planSettlementDropAssetExtraction({
      room_code: 'WDKH',
      source: { name: 'assets.json', bytes: 1, sha256: 'a'.repeat(64) },
      assets: { '../escape': asDataUri('image/jpeg', jpeg) },
    })).toThrow('asset id ../escape is invalid')
  })

  it('rejects non-base64, unsupported and byte-mismatched data URIs', () => {
    const source = { name: 'assets.json', bytes: 1, sha256: 'a'.repeat(64) }

    expect(() => planSettlementDropAssetExtraction({
      room_code: 'WDKH', source, assets: { ned: 'data:image/jpeg,not-base64' },
    })).toThrow('asset ned must be a base64 image data URI')
    expect(() => planSettlementDropAssetExtraction({
      room_code: 'WDKH', source, assets: { ned: asDataUri('image/gif', jpeg) },
    })).toThrow('asset ned has unsupported MIME type image/gif')
    expect(() => planSettlementDropAssetExtraction({
      room_code: 'WDKH', source, assets: { ned: asDataUri('image/webp', jpeg) },
    })).toThrow('asset ned declares image/webp but contains jpeg bytes')
  })

  it('rejects empty collections and duplicate IDs after case folding', () => {
    const source = { name: 'assets.json', bytes: 1, sha256: 'a'.repeat(64) }
    expect(() => planSettlementDropAssetExtraction({ room_code: 'WDKH', source, assets: {} }))
      .toThrow('assets must contain at least one entry')
    expect(() => planSettlementDropAssetExtraction({
      room_code: 'WDKH', source,
      assets: {
        Ned: asDataUri('image/jpeg', jpeg),
        ned: asDataUri('image/jpeg', jpeg),
      },
    })).toThrow('asset IDs Ned and ned collide on a case-insensitive filesystem')
  })

  it('strictly parses its serialized public handoff contract', () => {
    const plan = planSettlementDropAssetExtraction({
      room_code: 'WDKH',
      source: { name: 'assets.json', bytes: 100, sha256: 'a'.repeat(64) },
      assets: { cast_ned: asDataUri('image/jpeg', jpeg) },
    })
    const serialized = serializeSettlementDropAssetExtractionManifest(plan.manifest)

    expect(parseSettlementDropAssetExtractionManifest(serialized)).toEqual(plan.manifest)
    expect(() => parseSettlementDropAssetExtractionManifest(JSON.stringify({
      ...plan.manifest,
      private_note: 'must not cross the handoff',
    }))).toThrow('asset extraction has unknown field private_note')
    expect(() => parseSettlementDropAssetExtractionManifest(JSON.stringify({
      ...plan.manifest,
      assets: [{ ...plan.manifest.assets[0], path: 'assets/someone_else.jpeg' }],
    }))).toThrow('asset extraction asset 1.path must equal assets/cast_ned.jpeg')
  })
})
