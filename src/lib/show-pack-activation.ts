import {
  compileShowPack,
  type EntityKind,
  type ShowPack,
  type TriggerContract,
} from './show-pack'

export interface CatalogTriggerContract extends TriggerContract {
  title: string
}

export interface ShowPackActivationPlan {
  compiled: ShowPack
  compiledBytes: string
  manifestSha256: string
  packRef: string
  showPackId: string
  showPack: {
    id: string
    pack_key: string
    version: number
    title: string
    property: string
    installment: string
    fact_source: ShowPack['pack']['fact_source']
    manifest_sha256: string
    compiled_bundle: ShowPack
    status: 'draft'
    published_at: null
  }
  nominees: Array<{
    id: string
    name: string
    type: 'person' | 'film'
    film_name: string
    image_url: string
    show_pack_id: string
    pack_key: string
  }>
  categories: Array<{
    id: number
    name: string
    tier: number
    points: number
    display_order: number
    winner_id: null
    announced_at: null
    show_pack_id: string
    room_id: null
    pack_key: string
    trigger_contract: CatalogTriggerContract
  }>
  categoryNominees: Array<{
    category_id: number
    nominee_id: string
  }>
  draftEntities: Array<{
    id: string
    name: string
    type: 'person' | 'film'
    nominations: Array<{
      category_id: number
      nominee_id: string
      category_name: string
      points: number
    }>
    film_name: string
    nom_count: number
    show_pack_id: string
    pack_key: string
  }>
  signatureBeats: Array<{
    id: number
    entity_id: string
    partner_entity_id: string | null
    name: string
    trigger_text: string
    odds: string
    points: number
    pitch: string
    show_pack_id: string
    pack_key: string
    trigger_contract: CatalogTriggerContract
  }>
  bingoSquares: Array<{
    id: number
    text: string
    short_text: string
    is_objective: false
    slug: string
    title: string
    category: string | null
    probability_pct: number
    likelihood_tier: string
    win_condition: string
    why_it_is_fun: string
    storyline_tags: string[]
    fun_type: null
    show_pack_id: string
    pack_key: string
    trigger_contract: CatalogTriggerContract
  }>
}

export interface ShowPackCatalogManifest {
  showPack: ShowPackActivationPlan['showPack']
  nominees: ShowPackActivationPlan['nominees']
  categories: ShowPackActivationPlan['categories']
  categoryNominees: ShowPackActivationPlan['categoryNominees']
  draftEntities: ShowPackActivationPlan['draftEntities']
  signatureBeats: ShowPackActivationPlan['signatureBeats']
  bingoSquares: ShowPackActivationPlan['bingoSquares']
}

/** Exact database projections reread after an activation install. */
export interface InstalledShowPackCatalog {
  showPack: (Omit<ShowPackActivationPlan['showPack'], 'status' | 'published_at'> & {
    status: 'draft' | 'published' | 'retired'
    published_at: string | null
  }) | null
  nominees: ShowPackActivationPlan['nominees']
  categories: ShowPackActivationPlan['categories']
  categoryNominees: ShowPackActivationPlan['categoryNominees']
  draftEntities: ShowPackActivationPlan['draftEntities']
  signatureBeats: ShowPackActivationPlan['signatureBeats']
  bingoSquares: ShowPackActivationPlan['bingoSquares']
}

export interface ShowPackActivationAttestation {
  matches: boolean
  issues: string[]
}

export interface ShowPackActivationAssessment {
  state: 'planned' | 'draft-partial' | 'draft-ready' | 'published-attested'
  attestation: ShowPackActivationAttestation
}

/** Closed JSON payload consumed by the atomic database publication command. */
export function buildShowPackCatalogManifest(
  plan: ShowPackActivationPlan,
): ShowPackCatalogManifest {
  return structuredClone({
    showPack: plan.showPack,
    nominees: plan.nominees,
    categories: plan.categories,
    categoryNominees: plan.categoryNominees,
    draftEntities: plan.draftEntities,
    signatureBeats: plan.signatureBeats,
    bingoSquares: plan.bingoSquares,
  })
}

const textEncoder = new TextEncoder()

async function digest(label: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', textEncoder.encode(label)))
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function stableUuid(label: string): Promise<string> {
  const bytes = (await digest(label)).slice(0, 16)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const value = hex(bytes)
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

async function stableInteger(label: string): Promise<number> {
  const bytes = await digest(label)
  const value = new DataView(bytes.buffer, bytes.byteOffset, 4).getUint32(0) & 0x7fffffff
  return value === 0 ? 1 : value
}

function legacyEntityType(kind: EntityKind): 'person' | 'film' {
  return kind === 'film' || kind === 'creature' || kind === 'object' ? 'film' : 'person'
}

function assertUniqueIds(rows: Array<{ id: string | number }>, label: string): void {
  const ids = new Set(rows.map((row) => row.id))
  if (ids.size !== rows.length) throw new Error(`${label} deterministic id collision; change a pack key`)
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value)
}

function compareRows<Row>(
  label: string,
  expected: Row[],
  actual: Row[],
  identify: (row: Row) => string,
  issues: string[],
): void {
  const expectedById = new Map(expected.map((row) => [identify(row), row]))
  const actualById = new Map<string, Row>()
  for (const row of actual) {
    const id = identify(row)
    if (actualById.has(id)) issues.push(`${label} duplicate id ${id}`)
    actualById.set(id, row)
  }

  const allIds = [...new Set([...expectedById.keys(), ...actualById.keys()])].sort()
  for (const id of allIds) {
    const wanted = expectedById.get(id)
    const found = actualById.get(id)
    if (!found) issues.push(`${label} missing id ${id}`)
    else if (!wanted) issues.push(`${label} unexpected id ${id}`)
    else if (canonicalJson(wanted) !== canonicalJson(found)) {
      issues.push(`${label} id ${id} differs from compiled plan`)
    }
  }
}

/**
 * Proves that the installed normalized catalog is exactly the compiled plan.
 * Publication must consume this reread, never the successful status of the
 * preceding HTTP inserts: a partial retry or stale candidate link is not a
 * complete pack.
 */
export function attestShowPackActivation(
  plan: ShowPackActivationPlan,
  installed: InstalledShowPackCatalog,
): ShowPackActivationAttestation {
  const issues: string[] = []
  if (!installed.showPack) {
    issues.push(`show packs missing id ${plan.showPackId}`)
  } else {
    const { status: _wantedStatus, published_at: _wantedPublishedAt, ...wanted } = plan.showPack
    const { status: _foundStatus, published_at: _foundPublishedAt, ...found } = installed.showPack
    if (canonicalJson(wanted) !== canonicalJson(found)) {
      issues.push(`show packs id ${plan.showPackId} differs from compiled plan`)
    }
  }
  compareRows('nominees', plan.nominees, installed.nominees, (row) => row.id, issues)
  compareRows('categories', plan.categories, installed.categories, (row) => String(row.id), issues)
  compareRows(
    'category nominees',
    plan.categoryNominees,
    installed.categoryNominees,
    (row) => `${row.category_id}:${row.nominee_id}`,
    issues,
  )
  compareRows('draft entities', plan.draftEntities, installed.draftEntities, (row) => row.id, issues)
  compareRows('signature beats', plan.signatureBeats, installed.signatureBeats, (row) => String(row.id), issues)
  compareRows('bingo squares', plan.bingoSquares, installed.bingoSquares, (row) => String(row.id), issues)
  return { matches: issues.length === 0, issues }
}

function installedNormalizedRowCount(catalog: InstalledShowPackCatalog): number {
  return catalog.nominees.length + catalog.categories.length + catalog.categoryNominees.length +
    catalog.draftEntities.length + catalog.signatureBeats.length + catalog.bingoSquares.length
}

/** Canonical fail-closed policy for every registry state the activation CLI can encounter. */
export function assessShowPackActivation(
  plan: ShowPackActivationPlan,
  installed: InstalledShowPackCatalog,
): ShowPackActivationAssessment {
  const registry = installed.showPack
  if (registry && (
    registry.id !== plan.showPackId || registry.manifest_sha256 !== plan.manifestSha256
  )) {
    throw new Error(`${plan.packRef} already exists with different compiled bytes`)
  }
  if (registry?.status === 'retired') {
    throw new Error(`${plan.packRef} is retired and cannot be republished or rebound`)
  }

  const attestation = attestShowPackActivation(plan, installed)
  const mismatch = () => new Error(
    `installed catalog does not match ${plan.packRef}:\n${attestation.issues.join('\n')}`,
  )
  if (registry?.status === 'published' && !attestation.matches) throw mismatch()
  if (registry?.status === 'draft' && attestation.issues.some((issue) => issue.startsWith('show packs '))) {
    throw mismatch()
  }
  if (!registry && installedNormalizedRowCount(installed) > 0) {
    throw new Error(`${plan.packRef} has normalized rows but no visible registry row`)
  }

  if (!registry) return { state: 'planned', attestation }
  if (registry.status === 'published') return { state: 'published-attested', attestation }
  return {
    state: attestation.matches ? 'draft-ready' : 'draft-partial',
    attestation,
  }
}

/**
 * Copies the doctrine fields that every normalized wager row must retain.
 * The compiled show pack remains canonical; this record makes the contract
 * available at the exact catalog row an operator will adjudicate.
 */
export function buildTriggerContract(
  trigger: TriggerContract & { title: string },
): CatalogTriggerContract {
  return {
    title: trigger.title,
    condition: trigger.condition,
    exclusions: [...trigger.exclusions],
    adjudication: {
      proxies: trigger.adjudication.proxies,
      offscreen: trigger.adjudication.offscreen,
      mentions: trigger.adjudication.mentions,
    },
    title_review: {
      status: trigger.title_review.status,
      note: trigger.title_review.note,
    },
    basis_claim_ids: [...trigger.basis_claim_ids],
  }
}

/**
 * Checks the narrower contract required by today's normalized game tables.
 * Compilation proves provenance and doctrine; activation additionally proves
 * that the bundle can power the current 25-cell card and beat primitives.
 */
export function assertActivatableShowPack(pack: ShowPack): void {
  const issues: string[] = []
  const draftableIds = new Set(
    pack.entities.filter((entity) => entity.draftable).map((entity) => entity.id),
  )
  if (pack.bingo_squares.length < 24) {
    issues.push('an activatable show pack needs at least 24 bingo squares')
  }
  if (!pack.entities.some((entity) => entity.draftable)) {
    issues.push('an activatable show pack needs at least one draftable entity')
  }
  for (const beat of pack.signature_beats) {
    if (beat.entity_ids.length < 1 || beat.entity_ids.length > 2) {
      issues.push(`signature beat ${beat.id} must name one entity or one explicit pair`)
    }
    if (beat.entity_ids.some((entityId) => !draftableIds.has(entityId))) {
      issues.push(`signature beat ${beat.id} references a non-draftable entity`)
    }
  }
  if (issues.length > 0) throw new Error(issues.join('\n'))
}

/**
 * Owns the complete deterministic projection from one compiled pack into the
 * normalized catalog rows. The activation CLI supplies only database state and
 * the authority to write this already-proven plan.
 */
export async function buildShowPackActivationPlan(
  input: ShowPack,
): Promise<ShowPackActivationPlan> {
  const compiled = compileShowPack(input)
  assertActivatableShowPack(compiled)
  const compiledBytes = `${JSON.stringify(compiled, null, 2)}\n`
  const manifestSha256 = hex(await digest(compiledBytes))
  const packRef = `${compiled.pack.id}@${compiled.pack.version}`
  const showPackId = await stableUuid(`show-pack:${packRef}`)

  const nomineeIdByKey = new Map(await Promise.all(
    compiled.entities.map(async (entity) => [
      entity.id,
      await stableUuid(`${packRef}:nominee:${entity.id}`),
    ] as const),
  ))
  const draftIdByKey = new Map(await Promise.all(
    compiled.entities.filter((entity) => entity.draftable).map(async (entity) => [
      entity.id,
      await stableUuid(`${packRef}:draft:${entity.id}`),
    ] as const),
  ))
  const categoryIdByKey = new Map(await Promise.all(
    compiled.predictions.map(async (prediction) => [
      prediction.id,
      await stableInteger(`${packRef}:category:${prediction.id}`),
    ] as const),
  ))

  const nominees = compiled.entities.map((entity) => ({
    id: nomineeIdByKey.get(entity.id)!,
    name: entity.name,
    type: legacyEntityType(entity.kind),
    film_name: entity.kind === 'film' || entity.kind === 'creature' ? entity.name : entity.group,
    image_url: entity.portrait.path,
    show_pack_id: showPackId,
    pack_key: entity.id,
  }))
  const categories = compiled.predictions.map((prediction, index) => ({
    id: categoryIdByKey.get(prediction.id)!,
    name: prediction.title,
    tier: prediction.tier,
    points: prediction.points,
    display_order: index + 1,
    winner_id: null,
    announced_at: null,
    show_pack_id: showPackId,
    room_id: null,
    pack_key: prediction.id,
    trigger_contract: buildTriggerContract(prediction),
  }))
  const categoryNominees = compiled.predictions.flatMap((prediction) => (
    prediction.candidate_entity_ids.map((entityKey) => ({
      category_id: categoryIdByKey.get(prediction.id)!,
      nominee_id: nomineeIdByKey.get(entityKey)!,
    }))
  ))
  const nominationsByEntity = new Map<string, ShowPackActivationPlan['draftEntities'][number]['nominations']>()
  for (const prediction of compiled.predictions) {
    for (const entityKey of prediction.candidate_entity_ids) {
      const rows = nominationsByEntity.get(entityKey) ?? []
      rows.push({
        category_id: categoryIdByKey.get(prediction.id)!,
        nominee_id: nomineeIdByKey.get(entityKey)!,
        category_name: prediction.title,
        points: prediction.points,
      })
      nominationsByEntity.set(entityKey, rows)
    }
  }
  const draftEntities = compiled.entities.filter((entity) => entity.draftable).map((entity) => ({
    id: draftIdByKey.get(entity.id)!,
    name: entity.name,
    type: legacyEntityType(entity.kind),
    nominations: nominationsByEntity.get(entity.id) ?? [],
    film_name: entity.kind === 'film' || entity.kind === 'creature' ? entity.name : entity.group,
    nom_count: nominationsByEntity.get(entity.id)?.length ?? 0,
    show_pack_id: showPackId,
    pack_key: entity.id,
  }))
  const signatureBeats = await Promise.all(compiled.signature_beats.map(async (beat) => ({
    id: await stableInteger(`${packRef}:beat:${beat.id}`),
    entity_id: draftIdByKey.get(beat.entity_ids[0])!,
    partner_entity_id: beat.entity_ids[1] ? draftIdByKey.get(beat.entity_ids[1])! : null,
    name: beat.title,
    trigger_text: beat.condition,
    odds: beat.likelihood_tier,
    points: beat.points,
    pitch: beat.pitch,
    show_pack_id: showPackId,
    pack_key: beat.id,
    trigger_contract: buildTriggerContract(beat),
  })))
  const bingoSquares = await Promise.all(compiled.bingo_squares.map(async (square) => ({
    id: await stableInteger(`${packRef}:bingo:${square.id}`),
    text: square.condition,
    short_text: square.title,
    is_objective: false as const,
    slug: `${compiled.pack.id}-v${compiled.pack.version}-${square.id}`,
    title: square.title,
    category: square.storyline_tags[0] ?? null,
    probability_pct: square.probability_pct,
    likelihood_tier: square.likelihood_tier,
    win_condition: square.condition,
    why_it_is_fun: square.why_it_is_fun,
    storyline_tags: [...square.storyline_tags],
    fun_type: null,
    show_pack_id: showPackId,
    pack_key: square.id,
    trigger_contract: buildTriggerContract(square),
  })))

  for (const [rows, label] of [
    [nominees, 'nominee'],
    [categories, 'category'],
    [draftEntities, 'draft entity'],
    [signatureBeats, 'signature beat'],
    [bingoSquares, 'bingo square'],
  ] as const) assertUniqueIds(rows, label)

  return {
    compiled,
    compiledBytes,
    manifestSha256,
    packRef,
    showPackId,
    showPack: {
      id: showPackId,
      pack_key: compiled.pack.id,
      version: compiled.pack.version,
      title: compiled.pack.title,
      property: compiled.pack.property,
      installment: compiled.pack.installment,
      fact_source: compiled.pack.fact_source,
      manifest_sha256: manifestSha256,
      compiled_bundle: compiled,
      status: 'draft',
      published_at: null,
    },
    nominees,
    categories,
    categoryNominees,
    draftEntities,
    signatureBeats,
    bingoSquares,
  }
}
