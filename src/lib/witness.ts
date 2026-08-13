export interface WitnessReference {
  entity_key: string
  images: string[]
}

export interface WitnessReferenceManifest {
  schema_version: 1
  show_pack: {
    key: string
    version: number
  }
  references: WitnessReference[]
}

export interface WitnessCandidateEntity {
  entity_id: string
  entity_key: string
  name: string
}

export interface WitnessCandidate {
  beat_id: number
  beat_key: string
  title: string
  condition: string
  exclusions: string[]
  adjudication: {
    proxies: WitnessAdjudicationDecision
    offscreen: WitnessAdjudicationDecision
    mentions: WitnessAdjudicationDecision
  }
  points: number
  entities: WitnessCandidateEntity[]
}

export type WitnessAdjudicationDecision =
  | 'count'
  | 'do_not_count'
  | 'explicit_only'
  | 'principal_accepts_if_unrefused'

const WITNESS_ADJUDICATION_DECISIONS = new Set<WitnessAdjudicationDecision>([
  'count',
  'do_not_count',
  'explicit_only',
  'principal_accepts_if_unrefused',
])

export interface WitnessDecision {
  beat_id: number
  entity_id: string
  confidence: number
}

/** Maximum frame size accepted across capture and model-inspection boundaries. */
export const WITNESS_MAX_FRAME_BYTES = 5 * 1024 * 1024

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertExactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): void {
  const allowed = new Set(keys)
  const unknown = Object.keys(value).find((key) => !allowed.has(key))
  if (unknown) throw new Error(`${label} has unknown field ${unknown}`)
  const missing = keys.find((key) => !(key in value))
  if (missing) throw new Error(`${label} is missing field ${missing}`)
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value.trim()
}

function isConfinedImagePath(value: string): boolean {
  if (value.startsWith('/') || value.startsWith('\\') || value.includes('\\')) return false
  const parts = value.split('/')
  if (parts.some((part) => part === '' || part === '.' || part === '..')) return false
  return /\.(?:gif|jpe?g|png|webp)$/i.test(value)
}

export function parseWitnessReferenceManifest(raw: string): WitnessReferenceManifest {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('witness reference manifest must be valid JSON')
  }
  if (!isRecord(value)) throw new Error('witness reference manifest must be an object')
  assertExactKeys(value, ['schema_version', 'show_pack', 'references'], 'witness reference manifest')
  if (value.schema_version !== 1) throw new Error('witness reference manifest schema_version must be 1')
  if (!isRecord(value.show_pack)) throw new Error('witness reference manifest show_pack must be an object')
  assertExactKeys(value.show_pack, ['key', 'version'], 'witness reference manifest show_pack')
  const key = requiredText(value.show_pack.key, 'witness reference manifest show_pack key')
  if (!Number.isInteger(value.show_pack.version) || Number(value.show_pack.version) < 1) {
    throw new Error('witness reference manifest show_pack version must be a positive integer')
  }
  if (!Array.isArray(value.references) || value.references.length === 0) {
    throw new Error('witness reference manifest references must be a non-empty array')
  }

  const seen = new Set<string>()
  const references = value.references.map((reference, index): WitnessReference => {
    const label = `witness reference ${index + 1}`
    if (!isRecord(reference)) throw new Error(`${label} must be an object`)
    assertExactKeys(reference, ['entity_key', 'images'], label)
    const entityKey = requiredText(reference.entity_key, `${label} entity_key`)
    if (seen.has(entityKey)) throw new Error(`duplicate witness reference entity_key ${entityKey}`)
    seen.add(entityKey)
    if (!Array.isArray(reference.images) || reference.images.length < 1 || reference.images.length > 3) {
      throw new Error(`${label} images must contain one to three paths`)
    }
    const images = reference.images.map((image) => requiredText(image, `${label} image path`))
    if (images.some((image) => !isConfinedImagePath(image))) {
      throw new Error('reference image paths must stay inside the manifest directory')
    }
    if (new Set(images).size !== images.length) throw new Error(`${label} image paths must be unique`)
    return { entity_key: entityKey, images }
  })

  return {
    schema_version: 1,
    show_pack: { key, version: Number(value.show_pack.version) },
    references,
  }
}

function assertCandidates(candidates: WitnessCandidate[]): void {
  if (candidates.length === 0) throw new Error('at least one witness candidate is required')
  const beatIds = new Set<number>()
  for (const candidate of candidates) {
    if (!Number.isInteger(candidate.beat_id) || candidate.beat_id < 1) {
      throw new Error('witness beat id must be a positive integer')
    }
    if (beatIds.has(candidate.beat_id)) throw new Error(`duplicate witness beat id ${candidate.beat_id}`)
    beatIds.add(candidate.beat_id)
    requiredText(candidate.beat_key, `witness beat ${candidate.beat_id} key`)
    requiredText(candidate.title, `witness beat ${candidate.beat_id} title`)
    requiredText(candidate.condition, `witness beat ${candidate.beat_id} condition`)
    if (!Number.isInteger(candidate.points) || candidate.points < 1) {
      throw new Error(`witness beat ${candidate.beat_id} points must be a positive integer`)
    }
    if (!Array.isArray(candidate.exclusions) || candidate.exclusions.length === 0
      || candidate.exclusions.some((exclusion) => !exclusion.trim())) {
      throw new Error(`witness beat ${candidate.beat_id} exclusions are required`)
    }
    for (const dimension of ['proxies', 'offscreen', 'mentions'] as const) {
      if (!WITNESS_ADJUDICATION_DECISIONS.has(candidate.adjudication[dimension])) {
        throw new Error(`witness beat ${candidate.beat_id} adjudication ${dimension} is invalid`)
      }
    }
    if (!Array.isArray(candidate.entities)
      || candidate.entities.length < 1
      || candidate.entities.length > 2) {
      throw new Error(`witness beat ${candidate.beat_id} must have one or two entities`)
    }
    const entityIds = new Set<string>()
    for (const entity of candidate.entities) {
      const id = requiredText(entity.entity_id, `witness beat ${candidate.beat_id} entity id`)
      if (entityIds.has(id)) throw new Error(`witness beat ${candidate.beat_id} repeats entity ${id}`)
      entityIds.add(id)
      requiredText(entity.entity_key, `witness beat ${candidate.beat_id} entity key`)
      requiredText(entity.name, `witness beat ${candidate.beat_id} entity name`)
    }
  }
}

export function buildWitnessInstruction(candidates: WitnessCandidate[]): string {
  assertCandidates(candidates)
  const example = candidates[0]
  const board = candidates.map((candidate) => [
    `${candidate.beat_id} | ${candidate.beat_key} | ${candidate.title} | ${candidate.points} points`,
    `Condition: ${candidate.condition}`,
    `Exclusions: ${candidate.exclusions.join(' | ')}`,
    `Adjudication: proxies=${candidate.adjudication.proxies} | offscreen=${candidate.adjudication.offscreen} | mentions=${candidate.adjudication.mentions}`,
    `Allowed entity ids: ${candidate.entities.map((entity) => entity.entity_id).join(', ')}`,
  ].join('\n')).join('\n\n')

  return [
    'Judge only the supplied broadcast frame against this exhaustive board of undeclared possibilities.',
    'A title is only a label. Apply the full condition and every exclusion.',
    'Apply each candidate\'s explicit proxy, off-screen, and mention adjudication; do not substitute a global rule.',
    'Reference images identify entities; they do not prove that a beat occurred.',
    'If exactly one beat visibly occurred, select that beat and the allowed entity directly involved.',
    'If the frame is ambiguous or shows no complete beat under that candidate\'s full rule, return no proposal.',
    'Do not write an explanation, event label, point value, or other prose.',
    '',
    'UNDECLARED BOARD',
    board,
    '',
    `Return exactly {"proposal":null} or {"proposal":{"beat_id":${example.beat_id},"entity_id":"${example.entities[0].entity_id}","confidence":87}}.`,
    'Confidence must be an integer from 0 through 100. Return one JSON object and no surrounding text.',
  ].join('\n')
}

export function parseWitnessDecision(
  raw: string,
  candidates: WitnessCandidate[],
): WitnessDecision | null {
  assertCandidates(candidates)
  const trimmed = raw.trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    throw new Error('model response must be one JSON object with no surrounding text')
  }
  let value: unknown
  try {
    value = JSON.parse(trimmed)
  } catch {
    throw new Error('model response must be one JSON object with no surrounding text')
  }
  if (!isRecord(value)) throw new Error('model response must be one JSON object with no surrounding text')
  assertExactKeys(value, ['proposal'], 'model response')
  if (value.proposal === null) return null
  if (!isRecord(value.proposal)) throw new Error('model response proposal must be an object or null')
  assertExactKeys(value.proposal, ['beat_id', 'entity_id', 'confidence'], 'proposal')
  const beatId = value.proposal.beat_id
  const entityId = value.proposal.entity_id
  const confidence = value.proposal.confidence
  if (!Number.isInteger(beatId)) throw new Error('proposal beat_id must be an integer')
  const candidate = candidates.find((item) => item.beat_id === beatId)
  if (!candidate) throw new Error(`proposal beat ${String(beatId)} is not on the undeclared board`)
  if (typeof entityId !== 'string' || !candidate.entities.some((entity) => entity.entity_id === entityId)) {
    throw new Error(`proposal entity ${String(entityId)} does not belong to beat ${beatId}`)
  }
  if (!Number.isInteger(confidence) || Number(confidence) < 0 || Number(confidence) > 100) {
    throw new Error('proposal confidence must be an integer from 0 through 100')
  }
  return { beat_id: Number(beatId), entity_id: entityId, confidence: Number(confidence) }
}
