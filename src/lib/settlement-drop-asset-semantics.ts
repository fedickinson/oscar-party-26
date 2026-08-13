import {
  parseSettlementDropAssetExtractionManifest,
  planSettlementDropAssetExtraction,
  serializeSettlementDropAssetExtractionManifest,
  type SettlementDropAssetExtractionManifest,
  type SettlementDropAssetSourceSeal,
  type SettlementDropExtractedAsset,
} from './settlement-drop-asset-extraction'
import { sha256Hex } from './sha256'

export interface SealedTextArtifact {
  raw: string
  seal: SettlementDropAssetSourceSeal
}

export interface SettlementDropAssetStructuredAssignment {
  kind: 'character' | 'pundit' | 'player_sigil'
  consumer: string
  source: 'ceremony.CHARS.img' | 'ceremony.PUNDITS.img' | 'ceremony.PDATA.sigil'
}

export interface SettlementDropAssetSemanticsPacket {
  packet_version: 1
  artifact: 'settlement-drop-asset-semantics-review'
  target: { room_code: string }
  inputs: {
    ceremony: SettlementDropAssetSourceSeal
    legacy_assets: SettlementDropAssetSourceSeal
    extraction: SettlementDropAssetSourceSeal
  }
  coverage: {
    assets: number
    exact_ceremony_occurrences: number
    html_image_uses: number
    character_assignments: number
    pundit_assignments: number
    player_sigil_assignments: number
    assets_without_structured_assignment: number
  }
  assets: Array<SettlementDropExtractedAsset & {
    structured_assignments: SettlementDropAssetStructuredAssignment[]
    html_evidence: {
      occurrences: number
      image_uses: number
      empty_alt_uses: number
      classes: string[]
      nonempty_alt_texts: string[]
    }
    candidate_alt_texts: string[]
  }>
}

export interface SettlementDropAssetSemanticsDecisionTemplate {
  decision_version: 1
  artifact: 'settlement-drop-asset-semantics-decisions'
  target: { room_code: string }
  expected_packet_sha256: string
  decisions: Array<{
    asset_id: string
    approved_alt_text: null
    approve_structured_assignments: null
    note: null
  }>
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value
}

function validateSeal(artifact: SealedTextArtifact, label: string): SettlementDropAssetSourceSeal {
  const bytes = new TextEncoder().encode(artifact.raw).byteLength
  const digest = sha256Hex(artifact.raw)
  if (artifact.seal.bytes !== bytes || artifact.seal.sha256 !== digest) {
    throw new Error(`${label} seal does not match its bytes`)
  }
  return { name: requiredString(artifact.seal.name, `${label} seal name`), bytes, sha256: digest }
}

function parseLegacyAssets(raw: string): Record<string, string> {
  const value: unknown = JSON.parse(raw)
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('legacy assets must be an object')
  }
  return Object.fromEntries(Object.entries(value).map(([id, uri]) => {
    if (typeof uri !== 'string') throw new Error(`legacy asset ${id} must be a string`)
    return [id, uri]
  }))
}

function extractJsonObject(raw: string, variable: string): Record<string, unknown> {
  const marker = new RegExp(`\\bvar\\s+${variable}\\s*=\\s*`)
  const match = marker.exec(raw)
  if (!match) throw new Error(`ceremony variable ${variable} is missing`)
  const start = match.index + match[0].length
  if (raw[start] !== '{') throw new Error(`ceremony variable ${variable} must start with an object`)
  let depth = 0
  let string = false
  let escaped = false
  for (let index = start; index < raw.length; index += 1) {
    const character = raw[index]
    if (string) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') string = false
      continue
    }
    if (character === '"') string = true
    else if (character === '{') depth += 1
    else if (character === '}') {
      depth -= 1
      if (depth === 0) {
        const parsed: unknown = JSON.parse(raw.slice(start, index + 1))
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error(`ceremony variable ${variable} must be an object`)
        }
        return parsed as Record<string, unknown>
      }
    }
  }
  throw new Error(`ceremony variable ${variable} is unterminated`)
}

function uriOccurrences(raw: string, uri: string): number {
  let count = 0
  let index = 0
  while ((index = raw.indexOf(uri, index)) >= 0) {
    count += 1
    index += uri.length
  }
  return count
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}="([^"]*)"`).exec(tag)
  return match?.[1] ?? null
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
}

function structuredAssignments(
  ceremonyRaw: string,
  assetIdByUri: Map<string, string>,
): Map<string, SettlementDropAssetStructuredAssignment[]> {
  const result = new Map<string, SettlementDropAssetStructuredAssignment[]>()
  const add = (assetId: string, assignment: SettlementDropAssetStructuredAssignment) => {
    result.set(assetId, [...(result.get(assetId) ?? []), assignment])
  }
  const sources = [
    { variable: 'CHARS', kind: 'character', image: 'img', name: (key: string) => key, source: 'ceremony.CHARS.img' },
    { variable: 'PUNDITS', kind: 'pundit', image: 'img', name: (_key: string, row: Record<string, unknown>) => requiredString(row.name, 'pundit name'), source: 'ceremony.PUNDITS.img' },
    { variable: 'PDATA', kind: 'player_sigil', image: 'sigil', name: (key: string) => key, source: 'ceremony.PDATA.sigil' },
  ] as const

  for (const config of sources) {
    const collection = extractJsonObject(ceremonyRaw, config.variable)
    for (const [key, unknownRow] of Object.entries(collection)) {
      if (unknownRow === null || typeof unknownRow !== 'object' || Array.isArray(unknownRow)) {
        throw new Error(`ceremony.${config.variable} ${key} must be an object`)
      }
      const row = unknownRow as Record<string, unknown>
      const uri = requiredString(row[config.image], `ceremony.${config.variable} ${key}.${config.image}`)
      const assetId = assetIdByUri.get(uri)
      if (!assetId) throw new Error(`ceremony.${config.variable} ${key} references unknown asset bytes`)
      add(assetId, {
        kind: config.kind,
        consumer: config.name(key, row),
        source: config.source,
      })
    }
  }
  return result
}

export function buildSettlementDropAssetSemanticsPacket(input: {
  room_code: string
  ceremony: SealedTextArtifact
  legacy_assets: SealedTextArtifact
  extraction: SealedTextArtifact
}): SettlementDropAssetSemanticsPacket {
  const roomCode = requiredString(input.room_code, 'room_code')
  const ceremonySeal = validateSeal(input.ceremony, 'ceremony')
  const legacySeal = validateSeal(input.legacy_assets, 'legacy assets')
  const extractionSeal = validateSeal(input.extraction, 'asset extraction')
  const legacyAssets = parseLegacyAssets(input.legacy_assets.raw)
  const extraction = parseSettlementDropAssetExtractionManifest(input.extraction.raw)
  if (extraction.target.room_code !== roomCode) throw new Error('asset extraction room does not match room_code')
  const expected = planSettlementDropAssetExtraction({
    room_code: roomCode,
    source: legacySeal,
    assets: legacyAssets,
  }).manifest
  if (serializeSettlementDropAssetExtractionManifest(extraction)
    !== serializeSettlementDropAssetExtractionManifest(expected)) {
    throw new Error('asset extraction does not match the sealed legacy assets')
  }

  const assetIdByUri = new Map(Object.entries(legacyAssets).map(([id, uri]) => [uri, id]))
  if (assetIdByUri.size !== Object.keys(legacyAssets).length) {
    throw new Error('legacy assets contain duplicate image bytes under multiple IDs')
  }
  const assignments = structuredAssignments(input.ceremony.raw, assetIdByUri)
  const imageTags = [...input.ceremony.raw.matchAll(/<img\b[^>]*>/g)].map((match) => match[0])
  const extractionById = new Map(extraction.assets.map((asset) => [asset.id, asset]))
  const assets = Object.entries(legacyAssets)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([id, uri]) => {
      const extracted = extractionById.get(id)
      if (!extracted) throw new Error(`extraction is missing asset ${id}`)
      const matchingTags = imageTags.filter((tag) => tag.includes(uri))
      const structured = assignments.get(id) ?? []
      const observedAlts = matchingTags.map((tag) => attribute(tag, 'alt'))
        .filter((value): value is string => value !== null && Boolean(value.trim()))
      const consumerLabels = structured.map((assignment) => assignment.consumer)
      return {
        ...extracted,
        structured_assignments: structured,
        html_evidence: {
          occurrences: uriOccurrences(input.ceremony.raw, uri),
          image_uses: matchingTags.length,
          empty_alt_uses: matchingTags.filter((tag) => attribute(tag, 'alt') === '').length,
          classes: uniqueSorted(matchingTags.map((tag) => attribute(tag, 'class')).filter((value): value is string => value !== null)),
          nonempty_alt_texts: uniqueSorted(observedAlts),
        },
        candidate_alt_texts: uniqueSorted([...observedAlts, ...consumerLabels]),
      }
    })

  const allAssignments = assets.flatMap((asset) => asset.structured_assignments)
  return {
    packet_version: 1,
    artifact: 'settlement-drop-asset-semantics-review',
    target: { room_code: roomCode },
    inputs: { ceremony: ceremonySeal, legacy_assets: legacySeal, extraction: extractionSeal },
    coverage: {
      assets: assets.length,
      exact_ceremony_occurrences: assets.reduce((sum, asset) => sum + asset.html_evidence.occurrences, 0),
      html_image_uses: assets.reduce((sum, asset) => sum + asset.html_evidence.image_uses, 0),
      character_assignments: allAssignments.filter((assignment) => assignment.kind === 'character').length,
      pundit_assignments: allAssignments.filter((assignment) => assignment.kind === 'pundit').length,
      player_sigil_assignments: allAssignments.filter((assignment) => assignment.kind === 'player_sigil').length,
      assets_without_structured_assignment: assets.filter((asset) => asset.structured_assignments.length === 0).length,
    },
    assets,
  }
}

export function serializeSettlementDropAssetSemanticsPacket(
  packet: SettlementDropAssetSemanticsPacket,
): string {
  return `${JSON.stringify(packet, null, 2)}\n`
}

export function serializeSettlementDropAssetSemanticsDecisionTemplate(
  packet: SettlementDropAssetSemanticsPacket,
): string {
  const template: SettlementDropAssetSemanticsDecisionTemplate = {
    decision_version: 1,
    artifact: 'settlement-drop-asset-semantics-decisions',
    target: packet.target,
    expected_packet_sha256: sha256Hex(serializeSettlementDropAssetSemanticsPacket(packet)),
    decisions: packet.assets.map((asset) => ({
      asset_id: asset.id,
      approved_alt_text: null,
      approve_structured_assignments: null,
      note: null,
    })),
  }
  return `${JSON.stringify(template, null, 2)}\n`
}
