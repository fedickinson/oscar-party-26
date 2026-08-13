#!/usr/bin/env -S npx tsx

/**
 * Inspect one operator-selected broadcast frame against the active room board.
 *
 * Plan mode is the default: it validates local evidence and the live board but
 * sends no image and writes nothing. `--send-frame` is the explicit privacy and
 * spend boundary. A successful model match queues a proposal only; the host's
 * phone remains the sole path from perception to the canonical fact ledger.
 *
 * The model emits IDs and confidence, never publishable prose. Beat title,
 * trigger, points and announcement text remain human-authored database facts.
 */

import { constants as fsConstants, copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import {
  buildWitnessInstruction,
  parseWitnessDecision,
  parseWitnessReferenceManifest,
  WITNESS_MAX_FRAME_BYTES,
  type WitnessCandidate,
  type WitnessAdjudicationDecision,
  type WitnessReferenceManifest,
} from '../src/lib/witness'
import { fetchAllRows } from '../src/hooks/fetch-all-rows'
import { anthropicOperatorKey, supabaseConfig } from './lib/env.mts'

const MODEL = 'claude-sonnet-5'
const MAX_REFERENCE_BYTES = 1024 * 1024
const MAX_REFERENCE_IMAGES = 48
const MAX_TOTAL_IMAGE_BYTES = 24 * 1024 * 1024

interface Options {
  room: string
  frame: string
  references: string
  minimumConfidence: number
  sendFrame: boolean
  confirmRoom?: string
  observedAt?: string
}

interface RoomWire {
  id: string
  code: string
  phase: string
  show_pack_id: string
}

interface PackWire {
  id: string
  pack_key: string
  version: number
  title: string
}

interface EntityWire {
  id: string
  pack_key: string
  name: string
}

interface BeatWire {
  id: number
  pack_key: string
  name: string
  points: number
  entity_id: string
  partner_entity_id: string | null
  trigger_contract: unknown
}

interface ImageBytes {
  path: string
  mediaType: 'image/gif' | 'image/jpeg' | 'image/png' | 'image/webp'
  bytes: Buffer
}

function usage(): never {
  console.error([
    'Usage: npx tsx scripts/witness-once.mts',
    '  --room CODE --frame FRAME --references REFERENCES.json',
    '  [--minimum-confidence 70] [--observed-at ISO_TIMESTAMP]',
    '  [--send-frame --confirm-room CODE]',
    '',
    'Default: local database, no Anthropic request, no write.',
    '`--send-frame` sends the frame and private references to Anthropic and may queue one proposal.',
  ].join('\n'))
  process.exit(1)
}

function parseArgs(argv: string[]): Options {
  let room = ''
  let frame = ''
  let references = ''
  let minimumConfidence = 70
  let sendFrame = false
  let confirmRoom: string | undefined
  let observedAt: string | undefined
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--room') room = argv[++index] ?? ''
    else if (arg === '--frame') frame = argv[++index] ?? ''
    else if (arg === '--references') references = argv[++index] ?? ''
    else if (arg === '--minimum-confidence') minimumConfidence = Number(argv[++index] ?? '')
    else if (arg === '--observed-at') observedAt = argv[++index] ?? ''
    else if (arg === '--send-frame') sendFrame = true
    else if (arg === '--confirm-room') confirmRoom = (argv[++index] ?? '').trim().toUpperCase()
    else if (arg === '--help' || arg === '-h') usage()
    else throw new Error(`unknown argument ${arg}`)
  }
  room = room.trim().toUpperCase()
  if (!room || !frame || !references) usage()
  if (!/^[A-Z0-9]{4,12}$/.test(room)) throw new Error('room code must be 4 to 12 uppercase letters or numbers')
  if (!Number.isInteger(minimumConfidence) || minimumConfidence < 0 || minimumConfidence > 100) {
    throw new Error('--minimum-confidence must be an integer from 0 through 100')
  }
  if (observedAt !== undefined) {
    if (!observedAt || Number.isNaN(Date.parse(observedAt))) throw new Error('--observed-at must be an ISO timestamp')
    observedAt = new Date(observedAt).toISOString()
  }
  if (sendFrame && confirmRoom !== room) {
    throw new Error(`--send-frame requires --confirm-room ${room}`)
  }
  if (!sendFrame && confirmRoom) throw new Error('--confirm-room is valid only with --send-frame')
  return { room, frame, references, minimumConfidence, sendFrame, confirmRoom, observedAt }
}

function sha256(bytes: string | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function imageMediaType(bytes: Buffer): ImageBytes['mediaType'] | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'))) return 'image/gif'
  if (bytes.length >= 12
    && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
    && bytes.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  return null
}

function loadImage(pathOption: string, maxBytes: number): ImageBytes {
  const unresolved = resolve(pathOption)
  if (!existsSync(unresolved)) throw new Error(`image does not exist: ${unresolved}`)
  const path = realpathSync(unresolved)
  const stats = statSync(path)
  if (!stats.isFile()) throw new Error(`image is not a file: ${path}`)
  if (stats.size < 1 || stats.size > maxBytes) {
    throw new Error(`image ${path} must contain 1 to ${maxBytes} bytes`)
  }
  const bytes = readFileSync(path)
  const mediaType = imageMediaType(bytes)
  if (!mediaType) throw new Error(`image ${path} has an unsupported or mismatched format`)
  return { path, mediaType, bytes }
}

function confinedReferencePath(manifestPath: string, relativePath: string): string {
  const root = realpathSync(dirname(manifestPath))
  const unresolved = resolve(root, relativePath)
  if (!existsSync(unresolved)) throw new Error(`reference image does not exist: ${relativePath}`)
  const path = realpathSync(unresolved)
  const fromRoot = relative(root, path)
  if (!fromRoot || fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
    throw new Error(`reference image escapes the manifest directory: ${relativePath}`)
  }
  return path
}

function triggerContract(value: unknown, beatId: number): {
  condition: string
  exclusions: string[]
  adjudication: WitnessCandidate['adjudication']
} {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`beat ${beatId} has no reviewed trigger contract`)
  }
  const record = value as Record<string, unknown>
  const adjudication = record.adjudication
  const decisions = new Set<WitnessAdjudicationDecision>([
    'count', 'do_not_count', 'explicit_only', 'principal_accepts_if_unrefused',
  ])
  if (typeof record.condition !== 'string' || !record.condition.trim()
    || !Array.isArray(record.exclusions)
    || record.exclusions.length === 0
    || record.exclusions.some((item) => typeof item !== 'string' || !item.trim())
    || adjudication === null || typeof adjudication !== 'object' || Array.isArray(adjudication)
    || Object.keys(adjudication).length !== 3
    || !(['proxies', 'offscreen', 'mentions'] as const).every((dimension) => (
      decisions.has((adjudication as Record<string, unknown>)[dimension] as WitnessAdjudicationDecision)
    ))) {
    throw new Error(`beat ${beatId} has an incomplete trigger contract`)
  }
  return {
    condition: record.condition.trim(),
    exclusions: record.exclusions as string[],
    adjudication: {
      proxies: (adjudication as Record<string, WitnessAdjudicationDecision>).proxies,
      offscreen: (adjudication as Record<string, WitnessAdjudicationDecision>).offscreen,
      mentions: (adjudication as Record<string, WitnessAdjudicationDecision>).mentions,
    },
  }
}

async function rest<T>(url: string, key: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })
  const raw = await response.text()
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${raw.slice(0, 300)}`)
  return (raw ? JSON.parse(raw) : null) as T
}

async function restAll<T>(url: string, key: string, path: string): Promise<T[]> {
  const result = await fetchAllRows<T, Error>(async (from, to) => {
    try {
      const data = await rest<T[]>(url, key, path, {
        headers: { Range: `${from}-${to}`, 'Range-Unit': 'items' },
      })
      return { data, error: null }
    } catch (error) {
      return { data: null, error: error instanceof Error ? error : new Error(String(error)) }
    }
  })
  if (result.error) throw result.error
  return result.data ?? []
}

function query(params: Record<string, string>): string {
  return new URLSearchParams(params).toString()
}

async function loadBoard(
  url: string,
  key: string,
  roomCode: string,
  manifest: WitnessReferenceManifest,
): Promise<{
  room: RoomWire
  pack: PackWire
  candidates: WitnessCandidate[]
  entities: Map<string, EntityWire>
  skippedForReferences: number
}> {
  const rooms = await rest<RoomWire[]>(url, key, `rooms?${query({
    select: 'id,code,phase,show_pack_id',
    code: `eq.${roomCode}`,
  })}`)
  if (rooms.length !== 1) throw new Error(`room ${roomCode} was not found exactly once`)
  const room = rooms[0]
  if (room.phase !== 'live') throw new Error(`room ${roomCode} must be live; current phase is ${room.phase}`)

  const [packs, beats, entityRows, declared, pending, support] = await Promise.all([
    rest<PackWire[]>(url, key, `show_packs?${query({ select: 'id,pack_key,version,title', id: `eq.${room.show_pack_id}` })}`),
    restAll<BeatWire>(url, key, `signature_beats?${query({
      select: 'id,pack_key,name,points,entity_id,partner_entity_id,trigger_contract',
      show_pack_id: `eq.${room.show_pack_id}`,
      order: 'id.asc',
    })}`),
    restAll<EntityWire>(url, key, `draft_entities?${query({
      select: 'id,pack_key,name', show_pack_id: `eq.${room.show_pack_id}`, order: 'id.asc',
    })}`),
    restAll<{ id: number; source_signature_beat_id: number | null }>(url, key, `categories?${query({
      select: 'id,source_signature_beat_id', room_id: `eq.${room.id}`, order: 'id.asc',
    })}`),
    restAll<{ id: string; source_signature_beat_id: number; source_candidate: unknown }>(url, key, `witness_proposals?${query({
      select: 'id,source_signature_beat_id,source_candidate', room_id: `eq.${room.id}`, status: 'eq.pending', order: 'id.asc',
    })}`),
    restAll<{ proposal_id: string }>(url, key, `witness_supporting_observations?${query({
      select: 'proposal_id', room_id: `eq.${room.id}`, order: 'proposal_id.asc',
    })}`),
  ])
  if (packs.length !== 1) throw new Error(`room ${roomCode} show pack was not found exactly once`)
  const pack = packs[0]
  if (pack.pack_key !== manifest.show_pack.key || pack.version !== manifest.show_pack.version) {
    throw new Error(
      `reference manifest targets ${manifest.show_pack.key}@${manifest.show_pack.version}; `
      + `room uses ${pack.pack_key}@${pack.version}`,
    )
  }
  const entities = new Map(entityRows.map((entity) => [entity.id, entity]))
  const referencedKeys = new Set(manifest.references.map((reference) => reference.entity_key))
  const supportCount = new Map<string, number>()
  for (const observation of support) {
    supportCount.set(observation.proposal_id, (supportCount.get(observation.proposal_id) ?? 0) + 1)
  }
  const unavailable = new Set(
    declared.map((row) => row.source_signature_beat_id).filter((id): id is number => id !== null),
  )
  for (const proposal of pending) {
    const candidate = proposal.source_candidate
    const isV2 = candidate !== null && typeof candidate === 'object' && !Array.isArray(candidate)
      && 'adjudication' in candidate
    if (!isV2 || (supportCount.get(proposal.id) ?? 0) >= 7) {
      unavailable.add(proposal.source_signature_beat_id)
    }
  }
  let skippedForReferences = 0
  const candidates: WitnessCandidate[] = []
  for (const beat of beats) {
    if (unavailable.has(beat.id)) continue
    const ids = [beat.entity_id, beat.partner_entity_id].filter((id): id is string => id !== null)
    const sides = ids.map((id) => entities.get(id))
    if (sides.some((entity) => entity === undefined)) throw new Error(`beat ${beat.id} has a missing entity`)
    if (sides.some((entity) => !entity!.pack_key || !referencedKeys.has(entity!.pack_key))) {
      skippedForReferences += 1
      continue
    }
    const contract = triggerContract(beat.trigger_contract, beat.id)
    candidates.push({
      beat_id: beat.id,
      beat_key: beat.pack_key,
      title: beat.name,
      condition: contract.condition,
      exclusions: contract.exclusions,
      adjudication: contract.adjudication,
      points: beat.points,
      entities: sides.map((entity) => ({
        entity_id: entity!.id,
        entity_key: entity!.pack_key,
        name: entity!.name,
      })),
    })
  }
  if (!candidates.length) throw new Error('no undeclared reviewed beats have complete local references')
  return { room, pack, candidates, entities, skippedForReferences }
}

function loadReferences(
  manifestPath: string,
  manifest: WitnessReferenceManifest,
  candidates: WitnessCandidate[],
): Array<{ entity: WitnessCandidate['entities'][number]; image: ImageBytes }> {
  const required = new Map(candidates.flatMap((candidate) => candidate.entities).map((entity) => [entity.entity_key, entity]))
  const output: Array<{ entity: WitnessCandidate['entities'][number]; image: ImageBytes }> = []
  for (const reference of manifest.references) {
    const entity = required.get(reference.entity_key)
    if (!entity) continue
    for (const path of reference.images) {
      output.push({
        entity,
        image: loadImage(confinedReferencePath(manifestPath, path), MAX_REFERENCE_BYTES),
      })
    }
  }
  if (output.length > MAX_REFERENCE_IMAGES) {
    throw new Error(`witness request has ${output.length} reference images; maximum is ${MAX_REFERENCE_IMAGES}`)
  }
  return output
}

function archiveFrame(roomCode: string, frame: ImageBytes, digest: string): string {
  const extensionByType: Record<ImageBytes['mediaType'], string> = {
    'image/gif': '.gif', 'image/jpeg': '.jpeg', 'image/png': '.png', 'image/webp': '.webp',
  }
  const directory = resolve('.private', 'witness', roomCode)
  mkdirSync(directory, { recursive: true })
  const destination = join(directory, `${digest}${extensionByType[frame.mediaType]}`)
  try {
    copyFileSync(frame.path, destination, fsConstants.COPYFILE_EXCL)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    if (sha256(readFileSync(destination)) !== digest) throw new Error(`archived witness frame hash mismatch: ${destination}`)
  }
  return destination
}

async function callWitness(
  apiKey: string,
  frame: ImageBytes,
  references: ReturnType<typeof loadReferences>,
  instruction: string,
): Promise<string> {
  const content: Array<Record<string, unknown>> = [
    { type: 'text', text: 'BROADCAST FRAME TO JUDGE' },
    { type: 'image', source: { type: 'base64', media_type: frame.mediaType, data: frame.bytes.toString('base64') } },
  ]
  for (const reference of references) {
    content.push({
      type: 'text',
      text: `REFERENCE ONLY: ${reference.entity.name} | entity_id=${reference.entity.entity_id}`,
    })
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: reference.image.mediaType,
        data: reference.image.bytes.toString('base64'),
      },
    })
  }
  content.push({ type: 'text', text: instruction })

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 200,
      thinking: { type: 'disabled' },
      output_config: { effort: 'low' },
      system: 'You are a conservative visual referee. Return only the exact requested JSON shape.',
      messages: [{ role: 'user', content }],
    }),
  })
  const raw = await response.text()
  let payload: unknown
  try { payload = JSON.parse(raw) } catch { throw new Error(`Anthropic returned non-JSON (${response.status})`) }
  if (!response.ok) throw new Error(`Anthropic request failed (${response.status}): ${raw.slice(0, 300)}`)
  const blocks = (payload as { content?: Array<{ type?: string; text?: string }> }).content ?? []
  const text = blocks.find((block) => block.type === 'text')?.text
  if (typeof text !== 'string' || !text) throw new Error('Anthropic response had no text decision')
  return text
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const config = supabaseConfig('local')
  if (!config.serviceKey) throw new Error('witness command requires the service role for the selected target')
  const manifestPath = realpathSync(resolve(options.references))
  const manifestBytes = readFileSync(manifestPath)
  const manifest = parseWitnessReferenceManifest(manifestBytes.toString('utf8'))
  const frame = loadImage(options.frame, WITNESS_MAX_FRAME_BYTES)
  const board = await loadBoard(config.url, config.serviceKey, options.room, manifest)
  const references = loadReferences(manifestPath, manifest, board.candidates)
  const totalImageBytes = frame.bytes.length + references.reduce((sum, item) => sum + item.image.bytes.length, 0)
  if (totalImageBytes > MAX_TOTAL_IMAGE_BYTES) {
    throw new Error(`witness request image payload is ${totalImageBytes} bytes; maximum is ${MAX_TOTAL_IMAGE_BYTES}`)
  }
  const instruction = buildWitnessInstruction(board.candidates)
  const frameHash = sha256(frame.bytes)
  const manifestHash = sha256(manifestBytes)
  const referenceImagesHash = sha256(references.map((reference) => (
    `${reference.entity.entity_key}\0${sha256(reference.image.bytes)}`
  )).join('\n'))
  const observedAt = options.observedAt ?? statSync(frame.path).mtime.toISOString()

  console.log(`[witness] room=${board.room.code} pack=${board.pack.pack_key}@${board.pack.version}`)
  console.log(`[witness] frame_sha256=${frameHash} observed_at=${observedAt}`)
  console.log(`[witness] candidates=${board.candidates.length} skipped_missing_references=${board.skippedForReferences}`)
  console.log(`[witness] reference_images=${references.length} image_bytes=${totalImageBytes}`)
  console.log(`[witness] minimum_confidence=${options.minimumConfidence}`)

  if (!options.sendFrame) {
    console.log('[witness] mode=plan; image_sent=false proposal_written=false')
    return
  }

  const apiKey = anthropicOperatorKey()
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required only with --send-frame')
  const archive = archiveFrame(board.room.code, frame, frameHash)
  console.log(`[witness] evidence_archive=${archive}`)
  console.log('[witness] sending selected frame and private references to Anthropic')
  const modelOutput = await callWitness(apiKey, frame, references, instruction)
  const decision = parseWitnessDecision(modelOutput, board.candidates)
  const outputHash = sha256(modelOutput)
  if (!decision) {
    console.log(`[witness] decision=none model_output_sha256=${outputHash} proposal_written=false`)
    return
  }
  if (decision.confidence < options.minimumConfidence) {
    console.log(
      `[witness] decision=below-threshold confidence=${decision.confidence} `
      + `model_output_sha256=${outputHash} proposal_written=false`,
    )
    return
  }
  const sourceCandidate = board.candidates.find((candidate) => candidate.beat_id === decision.beat_id)
  if (!sourceCandidate) throw new Error(`witness decision references unavailable beat ${decision.beat_id}`)

  const recorded = await rest<{
    proposal_id: string
    observation_id: string | null
    disposition: 'created' | 'supported' | 'duplicate' | 'saturated'
    observation_count: number
  }>(config.url, config.serviceKey, 'rpc/record_witness_observation_v2', {
    method: 'POST',
    body: JSON.stringify({
      p_room_id: board.room.id,
      p_source_signature_beat_id: decision.beat_id,
      p_entity_id: decision.entity_id,
      p_confidence: decision.confidence,
      p_observed_at: observedAt,
      p_frame_sha256: frameHash,
      p_reference_manifest_sha256: manifestHash,
      p_reference_images_sha256: referenceImagesHash,
      p_model_output_sha256: outputHash,
      p_model: MODEL,
      p_source_candidate: sourceCandidate,
    }),
  })
  console.log(
    `[witness] proposal=${recorded.proposal_id} confidence=${decision.confidence} `
    + `disposition=${recorded.disposition} observation_count=${recorded.observation_count} `
    + `proposal_written=${recorded.disposition === 'created'} support_written=${recorded.disposition === 'supported'}`,
  )
}

main().catch((error) => {
  console.error(`[witness] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
