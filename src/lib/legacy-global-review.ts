import type { LegacyShowPackAuthoringWorksheet } from './legacy-show-pack-authoring'
import { sha256Hex } from './sha256'

const SHA256 = /^[a-f0-9]{64}$/
export const LEGACY_GLOBAL_REVIEW_COLLECTIONS = [
  'sources', 'claims', 'commentary_voices', 'commentary_requests',
] as const

export type LegacyGlobalReviewCollection = typeof LEGACY_GLOBAL_REVIEW_COLLECTIONS[number]

export interface LegacyGlobalReviewSeal {
  sha256: string
  note: string
}

export interface LegacyGlobalReviewDecisionManifest {
  manifest_version: 1
  artifact: 'legacy-global-review-decisions'
  target: { pack_id: string; pack_version: number }
  legacy_worksheet_sha256: string
  approvals: Array<{
    collection: LegacyGlobalReviewCollection
    expected_sha256: string
    note: string
  }>
}

export interface LegacyGlobalReviewPacket {
  packet_version: 3
  artifact: 'legacy-global-review-packet'
  target: { pack_id: string; pack_version: number }
  legacy_worksheet_sha256: string
  authoring_worksheet_sha256: string
  decision_template_sha256: string | null
  collections: Array<{
    collection: LegacyGlobalReviewCollection
    sha256: string
    dependencies: Array<{
      collection: LegacyGlobalReviewCollection
      sha256: string
    }>
    current_review: 'current' | 'open'
    current_review_reason: string | null
    review_checks: string[]
    review_blockers: string[]
    entries: unknown[]
  }>
  deferred_collections: Array<{
    collection: LegacyGlobalReviewCollection
    blockers: string[]
  }>
  decision_template: {
    manifest_version: 1
    artifact: 'legacy-global-review-decisions'
    target: { pack_id: string; pack_version: number }
    legacy_worksheet_sha256: string
    approvals: Array<{
      collection: LegacyGlobalReviewCollection
      expected_sha256: string
      note: null
    }>
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record).sort().map((key) => (
      `${JSON.stringify(key)}:${canonical(record[key])}`
    )).join(',')}}`
  }
  return JSON.stringify(value)
}

function text(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be text`)
}

function exactKeys(value: object, expected: string[], label: string): void {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} fields are invalid`)
  }
}

function dependencyPayload(
  authoring: LegacyShowPackAuthoringWorksheet,
  collection: LegacyGlobalReviewCollection,
): unknown {
  const payload: Record<string, unknown> = { sources: authoring.sources }
  if (collection !== 'sources') payload.claims = authoring.claims
  if (collection === 'commentary_voices' || collection === 'commentary_requests') {
    payload.commentary_voices = authoring.commentary_voices
  }
  if (collection === 'commentary_requests') {
    payload.commentary_requests = authoring.commentary_requests
  }
  return payload
}

const REVIEW_DEPENDENCIES: Record<
  LegacyGlobalReviewCollection,
  LegacyGlobalReviewCollection[]
> = {
  sources: [],
  claims: ['sources'],
  commentary_voices: ['sources', 'claims'],
  commentary_requests: ['sources', 'claims', 'commentary_voices'],
}

const REVIEW_CHECKS: Record<LegacyGlobalReviewCollection, string[]> = {
  sources: [
    'Every source has the correct kind, honest title, and stable locator.',
    'Operator and authoring records identify the exact repository or settlement bytes they warrant.',
    'No source title or locator is being treated as proof beyond the source itself.',
  ],
  claims: [
    'Every claim text is fully supported by every cited source and stops at the canon cutoff.',
    'Screen, discourse, source-material, and authoring claims remain in their distinct canon lanes.',
    'Verified status is used only where the cited source kind supplies the required warrant.',
    'Authoring claims describe reviewed game rules only and do not masquerade as forecasts or screen facts.',
  ],
  commentary_voices: [
    'Every instruction controls expression and character voice, never introduces an event fact.',
    'Every attitude claim is source-material attitude_only and is appropriate to the named voice.',
    'Voice IDs, names, and instructions are complete, distinct, and show-neutral at the pipeline boundary.',
  ],
  commentary_requests: [
    'Every speaker references one reviewed voice and every fact claim is verified screen canon.',
    'Every angle claim is verified discourse canon and the authored angle does not assert a new fact.',
    'Every publication is ready, has zero residual findings, and its grounding stamp matches the request context.',
    'The generated line says no more than its numbered fact and angle blocks warrant.',
  ],
}

function collectionEntries(
  authoring: LegacyShowPackAuthoringWorksheet,
  collection: LegacyGlobalReviewCollection,
): unknown[] {
  if (collection === 'sources') return structuredClone(authoring.sources)
  if (collection === 'claims') return structuredClone(authoring.claims)
  if (collection === 'commentary_voices') return structuredClone(authoring.commentary_voices)
  return structuredClone(authoring.commentary_requests)
}

function commentaryReviewBlockers(
  authoring: LegacyShowPackAuthoringWorksheet,
): string[] {
  const counts = authoring.commentary_requests.reduce(
    (result, request) => {
      result[request.publication.status] += 1
      return result
    },
    { pending: 0, ready: 0, blocked: 0 },
  )
  const blockers: string[] = []
  if (counts.pending > 0) {
    blockers.push(
      `${counts.pending} commentary publication${counts.pending === 1 ? '' : 's'} remain${counts.pending === 1 ? 's' : ''} pending grounded generation`,
    )
  }
  if (counts.blocked > 0) {
    blockers.push(
      `${counts.blocked} commentary publication${counts.blocked === 1 ? ' is' : 's are'} blocked by residual grounding findings`,
    )
  }
  return blockers
}

function fencedJson(value: unknown): string[] {
  const json = JSON.stringify(value, null, 2)
  const longestFence = Math.max(
    0,
    ...[...json.matchAll(/`+/g)].map((match) => match[0].length),
  )
  const fence = '`'.repeat(Math.max(3, longestFence + 1))
  return [`${fence}json`, json, fence]
}

export function buildLegacyGlobalReviewPacket(
  authoring: LegacyShowPackAuthoringWorksheet,
  authoringWorksheetSha256: string,
): LegacyGlobalReviewPacket {
  if (!SHA256.test(authoringWorksheetSha256)) {
    throw new Error('authoring worksheet SHA-256 must be a lowercase SHA-256 digest')
  }
  if (typeof authoring.pack_draft.id !== 'string' || authoring.pack_draft.id.trim() === ''
    || !Number.isInteger(authoring.pack_draft.version) || Number(authoring.pack_draft.version) < 1) {
    throw new Error('authoring target must be complete before global review')
  }
  if (!SHA256.test(authoring.source.worksheet_sha256)) {
    throw new Error('legacy worksheet SHA-256 must be a lowercase SHA-256 digest')
  }
  const hashes = Object.fromEntries(LEGACY_GLOBAL_REVIEW_COLLECTIONS.map((collection) => (
    [collection, legacyGlobalReviewCollectionSha256(authoring, collection)]
  ))) as Record<LegacyGlobalReviewCollection, string>
  const target = {
    pack_id: authoring.pack_draft.id,
    pack_version: authoring.pack_draft.version as number,
  }
  const blockers = Object.fromEntries(LEGACY_GLOBAL_REVIEW_COLLECTIONS.map((collection) => [
    collection,
    collection === 'commentary_requests' ? commentaryReviewBlockers(authoring) : [],
  ])) as Record<LegacyGlobalReviewCollection, string[]>
  const openUnblockedCollections = LEGACY_GLOBAL_REVIEW_COLLECTIONS.filter((collection) => (
    legacyGlobalReviewSealIssue(authoring, collection) !== null && blockers[collection].length === 0
  ))
  const decisionTemplate = {
    manifest_version: 1 as const,
    artifact: 'legacy-global-review-decisions' as const,
    target,
    legacy_worksheet_sha256: authoring.source.worksheet_sha256,
    approvals: openUnblockedCollections.map((collection) => ({
      collection,
      expected_sha256: hashes[collection],
      note: null,
    })),
  }
  const decisionTemplateBytes = decisionTemplate.approvals.length > 0
    ? `${JSON.stringify(decisionTemplate, null, 2)}\n`
    : null
  return {
    packet_version: 3,
    artifact: 'legacy-global-review-packet',
    target,
    legacy_worksheet_sha256: authoring.source.worksheet_sha256,
    authoring_worksheet_sha256: authoringWorksheetSha256,
    decision_template_sha256: decisionTemplateBytes ? sha256Hex(decisionTemplateBytes) : null,
    collections: LEGACY_GLOBAL_REVIEW_COLLECTIONS.map((collection) => {
      const issue = legacyGlobalReviewSealIssue(authoring, collection)
      return {
        collection,
        sha256: hashes[collection],
        dependencies: REVIEW_DEPENDENCIES[collection].map((dependency) => ({
          collection: dependency,
          sha256: hashes[dependency],
        })),
        current_review: issue === null ? 'current' : 'open',
        current_review_reason: issue,
        review_checks: [...REVIEW_CHECKS[collection]],
        review_blockers: [...blockers[collection]],
        entries: collectionEntries(authoring, collection),
      }
    }),
    deferred_collections: LEGACY_GLOBAL_REVIEW_COLLECTIONS
      .filter((collection) => blockers[collection].length > 0)
      .map((collection) => ({
        collection,
        blockers: [...blockers[collection]],
      })),
    decision_template: decisionTemplate,
  }
}

export function serializeLegacyGlobalReviewPacket(packet: LegacyGlobalReviewPacket): string {
  const lines = [
    '# Legacy show-pack global review packet',
    '',
    'This packet grants no approval. Review any currently unblocked collection independently, then replace only its null decision-template note with a specific human attestation. Deferred collections require a later packet after their blockers are resolved.',
    '',
    `Target: ${packet.target.pack_id}@${packet.target.pack_version}`,
    `Legacy worksheet SHA-256: ${packet.legacy_worksheet_sha256}`,
    `Authoring worksheet SHA-256: ${packet.authoring_worksheet_sha256}`,
    `Decision template SHA-256: ${packet.decision_template_sha256 ?? 'none'}`,
  ]
  for (const section of packet.collections) {
    lines.push(
      '',
      `## ${section.collection}`,
      '',
      `Dependency hash: ${section.sha256}`,
      `Current review: ${section.current_review}`,
    )
    if (section.current_review_reason !== null) {
      lines.push(`Current review reason: ${section.current_review_reason}`)
    }
    lines.push('Dependencies:')
    if (section.dependencies.length === 0) lines.push('- None')
    for (const dependency of section.dependencies) {
      lines.push(`- ${dependency.collection}: ${dependency.sha256}`)
    }
    lines.push('Review checklist:')
    for (const check of section.review_checks) lines.push(`- ${check}`)
    lines.push('Review blockers:')
    if (section.review_blockers.length === 0) lines.push('- None detected')
    for (const blocker of section.review_blockers) lines.push(`- ${blocker}`)
    lines.push('', ...fencedJson(section.entries))
  }
  lines.push(
    '',
    '## Deferred collections',
    '',
  )
  if (packet.deferred_collections.length === 0) lines.push('- None')
  for (const deferred of packet.deferred_collections) {
    lines.push(`- ${deferred.collection}: ${deferred.blockers.join('; ')}`)
  }
  lines.push(
    '',
    '## Unblocked decision template',
    '',
    'This template contains only currently open, unblocked collections and remains intentionally invalid until a human replaces every null note with a nonblank review attestation. Remove any collection not actually reviewed; partial manifests are valid.',
  )
  if (packet.decision_template.approvals.length === 0) {
    lines.push('', 'No currently open, unblocked collections require a decision.', '')
  } else {
    lines.push('', ...fencedJson(packet.decision_template), '')
  }
  return lines.join('\n')
}

export function serializeLegacyGlobalReviewDecisionTemplate(
  packet: LegacyGlobalReviewPacket,
): string {
  if (packet.decision_template.approvals.length === 0) {
    throw new Error('no currently open, unblocked global review collections')
  }
  return `${JSON.stringify(packet.decision_template, null, 2)}\n`
}

export function legacyGlobalReviewCollectionSha256(
  authoring: LegacyShowPackAuthoringWorksheet,
  collection: LegacyGlobalReviewCollection,
): string {
  return sha256Hex(canonical(dependencyPayload(authoring, collection)))
}

export function legacyGlobalReviewSealIssue(
  authoring: LegacyShowPackAuthoringWorksheet,
  collection: LegacyGlobalReviewCollection,
): string | null {
  if (collection === 'commentary_requests') {
    const blockers = commentaryReviewBlockers(authoring)
    if (blockers.length > 0) return `${collection} review is blocked: ${blockers[0]}`
  }
  const seal = authoring.global_review[collection]
  if (seal === null) return `${collection} review is not approved`
  if (typeof seal !== 'object' || Array.isArray(seal)) return `${collection} review seal must be an object or null`
  const record = seal as unknown as Record<string, unknown>
  try { exactKeys(record, ['sha256', 'note'], `${collection} review seal`) } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  if (typeof record.sha256 !== 'string' || !SHA256.test(record.sha256)) {
    return `${collection} review seal sha256 must be a lowercase SHA-256 digest`
  }
  if (typeof record.note !== 'string' || record.note.trim() === '') {
    return `${collection} review seal note must be text`
  }
  if (record.sha256 !== legacyGlobalReviewCollectionSha256(authoring, collection)) {
    return `${collection} review seal is stale`
  }
  for (const dependency of REVIEW_DEPENDENCIES[collection]) {
    if (legacyGlobalReviewSealIssue(authoring, dependency) !== null) {
      return `${collection} review requires current ${dependency} review`
    }
  }
  return null
}

export function invalidateStaleLegacyGlobalReviewSeals(
  authoring: LegacyShowPackAuthoringWorksheet,
): void {
  if (authoring.global_review == null) return
  for (const collection of LEGACY_GLOBAL_REVIEW_COLLECTIONS) {
    if (authoring.global_review[collection] !== null
      && legacyGlobalReviewSealIssue(authoring, collection) !== null) {
      authoring.global_review[collection] = null
    }
  }
}

export function applyLegacyGlobalReviewDecisions(input: {
  authoring: LegacyShowPackAuthoringWorksheet
  manifest: LegacyGlobalReviewDecisionManifest
}): { worksheet: LegacyShowPackAuthoringWorksheet; applied_collections: LegacyGlobalReviewCollection[] } {
  const { authoring, manifest } = input
  exactKeys(manifest, [
    'manifest_version', 'artifact', 'target', 'legacy_worksheet_sha256', 'approvals',
  ], 'global review manifest')
  if (manifest.manifest_version !== 1 || manifest.artifact !== 'legacy-global-review-decisions') {
    throw new Error('global review manifest identity is invalid')
  }
  exactKeys(manifest.target, ['pack_id', 'pack_version'], 'global review target')
  if (manifest.target.pack_id !== authoring.pack_draft.id
    || manifest.target.pack_version !== authoring.pack_draft.version) {
    throw new Error('authoring target does not match the global review manifest')
  }
  if (!SHA256.test(manifest.legacy_worksheet_sha256)
    || manifest.legacy_worksheet_sha256 !== authoring.source.worksheet_sha256) {
    throw new Error('legacy worksheet SHA-256 does not match the global review manifest')
  }
  if (!Array.isArray(manifest.approvals) || manifest.approvals.length === 0) {
    throw new Error('global review approvals must not be empty')
  }
  const collections = manifest.approvals.map((approval) => approval.collection)
  if (new Set(collections).size !== collections.length) {
    throw new Error('global review collections must not contain duplicates')
  }
  const worksheet = structuredClone(authoring)
  const approvalIndex = new Map(manifest.approvals.map((approval, index) => (
    [approval.collection, index]
  )))
  for (const [index, approval] of manifest.approvals.entries()) {
    exactKeys(approval, ['collection', 'expected_sha256', 'note'], 'global review approval')
    if (!LEGACY_GLOBAL_REVIEW_COLLECTIONS.includes(approval.collection)) {
      throw new Error(`global review collection ${String(approval.collection)} is invalid`)
    }
    if (approval.collection === 'commentary_requests') {
      const blockers = commentaryReviewBlockers(authoring)
      if (blockers.length > 0) {
        throw new Error(`commentary_requests review cannot be approved: ${blockers[0]}`)
      }
    }
    for (const dependency of REVIEW_DEPENDENCIES[approval.collection]) {
      if (legacyGlobalReviewSealIssue(worksheet, dependency) === null) continue
      const dependencyIndex = approvalIndex.get(dependency)
      if (dependencyIndex === undefined) {
        throw new Error(`${approval.collection} review requires current ${dependency} review`)
      }
      if (dependencyIndex >= index) {
        throw new Error(`${approval.collection} review requires ${dependency} earlier in the same manifest`)
      }
    }
    text(approval.note, `${approval.collection} review note`)
    if (!SHA256.test(approval.expected_sha256)) {
      throw new Error(`${approval.collection} review hash must be a lowercase SHA-256 digest`)
    }
    const currentSha = legacyGlobalReviewCollectionSha256(worksheet, approval.collection)
    if (approval.expected_sha256 !== currentSha) {
      throw new Error(`${approval.collection} review hash does not match current collection dependencies`)
    }
    const prior = worksheet.global_review[approval.collection]
    if (prior !== null && prior.sha256 === currentSha && prior.note !== approval.note) {
      throw new Error(`${approval.collection} already has a conflicting review seal`)
    }
    worksheet.global_review[approval.collection] = {
      sha256: currentSha,
      note: approval.note,
    }
  }
  return { worksheet, applied_collections: collections }
}
