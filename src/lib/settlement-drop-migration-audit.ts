import { parseSettlementReceipt, type SettlementReceipt } from './settlement-receipt'
import { isSettlementDropGrounding } from './settlement-drop-grounding'
import {
  planSettlementDropAssetExtraction,
  serializeSettlementDropAssetExtractionManifest,
  type SettlementDropAssetExtractionManifest,
} from './settlement-drop-asset-extraction'
import {
  buildSettlementDropPresentationStructurePacket,
  serializeSettlementDropPresentationStructurePacket,
  type SettlementDropPresentationStructurePacket,
} from './settlement-drop-presentation-structure'
import {
  buildSettlementDropPlayerIdentityPacket,
  serializeSettlementDropPlayerIdentityPacket,
  type SettlementDropPlayerIdentityPacket,
} from './settlement-drop-player-identity'
import {
  buildSettlementDropQuoteMarkupPacket,
  serializeSettlementDropQuoteMarkupPacket,
  type SettlementDropQuoteMarkupPacket,
} from './settlement-drop-quote-markup'
import {
  buildSettlementDropReceiptPrerequisitesPacket,
  RECEIPT_PREREQUISITE_TABLES,
  serializeSettlementDropReceiptPrerequisitesPacket,
  type SettlementDropReceiptPrerequisitesPacket,
} from './settlement-drop-receipt-prerequisites'
import {
  buildSettlementDropAssetSemanticsPacket,
  serializeSettlementDropAssetSemanticsPacket,
  type SettlementDropAssetSemanticsPacket,
} from './settlement-drop-asset-semantics'
import { sha256Hex } from './sha256'

type UnknownRecord = Record<string, unknown>

export interface SettlementDropMigrationArtifact {
  name: string
  bytes: number
  sha256: string
}

export interface SettlementDropMigrationAuditInput {
  room_code: string
  artifacts: {
    ceremony: SettlementDropMigrationArtifact
    tiers: SettlementDropMigrationArtifact
    takes: SettlementDropMigrationArtifact
    beatlines: SettlementDropMigrationArtifact
    personal: SettlementDropMigrationArtifact
    assets: SettlementDropMigrationArtifact
    board: SettlementDropMigrationArtifact
    receipt?: SettlementDropMigrationArtifact
    asset_extraction?: SettlementDropMigrationArtifact
    presentation_structure?: SettlementDropMigrationArtifact
    player_identity?: SettlementDropMigrationArtifact
    snapshot_rooms?: SettlementDropMigrationArtifact
    snapshot_players?: SettlementDropMigrationArtifact
    quote_markup?: SettlementDropMigrationArtifact
    receipt_prerequisites?: SettlementDropMigrationArtifact
    asset_semantics?: SettlementDropMigrationArtifact
  }
  tiers: unknown
  takes: unknown
  beatlines: unknown
  personal: unknown
  assets: unknown
  board: unknown
  receipt?: SettlementReceipt
  asset_extraction?: SettlementDropAssetExtractionManifest
  presentation_structure?: SettlementDropPresentationStructurePacket
  presentation_sources?: {
    ceremony_raw: string
    beatlines_raw: string
    takes_raw: string
  }
  player_identity?: SettlementDropPlayerIdentityPacket
  identity_sources?: {
    ceremony_raw: string
    tiers_raw: string
    personal_raw: string
    board_raw: string
    rooms_raw: string
    players_raw: string
  }
  quote_markup?: SettlementDropQuoteMarkupPacket
  quote_markup_source?: { takes_raw: string }
  receipt_prerequisites?: SettlementDropReceiptPrerequisitesPacket
  receipt_prerequisite_sources?: Record<typeof RECEIPT_PREREQUISITE_TABLES[number], string>
  asset_semantics?: SettlementDropAssetSemanticsPacket
  asset_semantics_sources?: { ceremony_raw: string; assets_raw: string; extraction_raw: string }
}

export type SettlementDropMigrationBlockerCode =
  | 'missing_settlement_receipt'
  | 'player_identity_mismatch'
  | 'player_identity_requires_approval'
  | 'ungrounded_quotes'
  | 'legacy_ledger_not_receipt_linked'
  | 'embedded_assets_require_extraction'
  | 'asset_semantics_require_authoring'
  | 'asset_semantics_requires_approval'
  | 'quote_markup_requires_plain_text_decision'
  | 'quote_markup_requires_approval'
  | 'presentation_structure_not_authored'
  | 'presentation_structure_requires_approval'

export interface SettlementDropMigrationBlocker {
  code: SettlementDropMigrationBlockerCode
  count?: number
  detail: string
  required_action: string
}

export interface SettlementDropMigrationAudit {
  audit_version: 1
  artifact: 'settlement-drop-migration-audit'
  target: { room_code: string }
  inputs: SettlementDropMigrationAuditInput['artifacts']
  inventory: {
    settlement_receipt: {
      provided: boolean
      score_events: number
      settled_facts: number
      prerequisites_packet_provided: boolean
      candidate_entries: number
      canonical_recovery_possible: boolean
    }
    players: {
      tiers: number
      personal_editions: number
      board_cards: number
      names_consistent: boolean
      identity_packet_provided: boolean
      exact_uuid_joins: number
      display_name_variants: number
    }
    muster: {
      tier_entries: number
      heavy: number
      impact: number
      present: number
      absent: number
    }
    quotes: {
      groups: number
      quotes: number
      references: number
      grounded: number
      with_markup: number
      markup_packet_provided: boolean
      emphasis_spans: number
    }
    ledger: {
      presentation_groups: number
      presentation_lines: number
      presentation_lines_with_receipt_link: number
      board_beats: number
      board_beats_with_id: number
    }
    assets: {
      total: number
      embedded_data_uris: number
      source_local_paths: number
      extracted_local_files: number
      extraction_source_matches: boolean
      semantics_packet_provided: boolean
      character_assignments: number
      pundit_assignments: number
      player_sigil_assignments: number
      assets_without_structured_assignment: number
    }
    personal_editions: {
      roster_slots: number
      bingo_squares: number
      marked_squares: number
    }
    presentation_structure: {
      packet_provided: boolean
      slides: number
      acts: number
      beats: number
      interstitials: number
      beatline_group_candidates: number
      take_groups_mapped: number
      unresolved_beatline_groups: string[]
    }
  }
  readiness: {
    ready_for_manifest: boolean
    recoverable_lanes: Array<
      | 'muster'
      | 'pundit_reference_sets'
      | 'board_evidence_candidates'
      | 'personal_editions'
      | 'portrait_inventory'
    >
  }
  blockers: SettlementDropMigrationBlocker[]
}

function isRecord(value: unknown): value is UnknownRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requireRecord(value: unknown, label: string): UnknownRecord {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  return value
}

function requireArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`)
  return value
}

function nonBlankString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value
}

function validateArtifact(value: SettlementDropMigrationArtifact, label: string): SettlementDropMigrationArtifact {
  if (!isRecord(value)) throw new Error(`${label} must be an object`)
  const name = nonBlankString(value.name, `${label}.name`)
  if (!Number.isInteger(value.bytes) || value.bytes < 0) throw new Error(`${label}.bytes must be a non-negative integer`)
  if (typeof value.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.sha256)) {
    throw new Error(`${label}.sha256 must be a lowercase SHA-256 digest`)
  }
  return { name, bytes: value.bytes, sha256: value.sha256 }
}

function setEquals(left: Set<string>, right: Set<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value))
}

function hasLegacyBoardBeatId(value: unknown): boolean {
  return (typeof value === 'string' && Boolean(value.trim()))
    || (Number.isInteger(value) && (value as number) >= 0)
}

function sealedRaw(
  raw: string,
  artifact: SettlementDropMigrationArtifact,
  label: string,
): { raw: string; seal: SettlementDropMigrationArtifact } {
  const bytes = new TextEncoder().encode(raw).byteLength
  const digest = sha256Hex(raw)
  if (bytes !== artifact.bytes || digest !== artifact.sha256) {
    throw new Error(`${label} raw bytes do not match its audit artifact`)
  }
  return { raw, seal: artifact }
}

/**
 * Inventories the hand-authored ceremony inputs without upgrading them into
 * canonical settlement evidence. Unknown joins remain blockers for a human or
 * a later receipt-backed adapter.
 */
export function buildSettlementDropMigrationAudit(
  input: SettlementDropMigrationAuditInput,
): SettlementDropMigrationAudit {
  const roomCode = nonBlankString(input.room_code, 'room_code')
  const artifacts = {
    ceremony: validateArtifact(input.artifacts.ceremony, 'artifacts.ceremony'),
    tiers: validateArtifact(input.artifacts.tiers, 'artifacts.tiers'),
    takes: validateArtifact(input.artifacts.takes, 'artifacts.takes'),
    beatlines: validateArtifact(input.artifacts.beatlines, 'artifacts.beatlines'),
    personal: validateArtifact(input.artifacts.personal, 'artifacts.personal'),
    assets: validateArtifact(input.artifacts.assets, 'artifacts.assets'),
    board: validateArtifact(input.artifacts.board, 'artifacts.board'),
    ...(input.artifacts.receipt
      ? { receipt: validateArtifact(input.artifacts.receipt, 'artifacts.receipt') }
      : {}),
    ...(input.artifacts.asset_extraction
      ? { asset_extraction: validateArtifact(input.artifacts.asset_extraction, 'artifacts.asset_extraction') }
      : {}),
    ...(input.artifacts.presentation_structure
      ? { presentation_structure: validateArtifact(input.artifacts.presentation_structure, 'artifacts.presentation_structure') }
      : {}),
    ...(input.artifacts.player_identity
      ? { player_identity: validateArtifact(input.artifacts.player_identity, 'artifacts.player_identity') }
      : {}),
    ...(input.artifacts.snapshot_rooms
      ? { snapshot_rooms: validateArtifact(input.artifacts.snapshot_rooms, 'artifacts.snapshot_rooms') }
      : {}),
    ...(input.artifacts.snapshot_players
      ? { snapshot_players: validateArtifact(input.artifacts.snapshot_players, 'artifacts.snapshot_players') }
      : {}),
    ...(input.artifacts.quote_markup
      ? { quote_markup: validateArtifact(input.artifacts.quote_markup, 'artifacts.quote_markup') }
      : {}),
    ...(input.artifacts.receipt_prerequisites
      ? { receipt_prerequisites: validateArtifact(input.artifacts.receipt_prerequisites, 'artifacts.receipt_prerequisites') }
      : {}),
    ...(input.artifacts.asset_semantics
      ? { asset_semantics: validateArtifact(input.artifacts.asset_semantics, 'artifacts.asset_semantics') }
      : {}),
  }

  const tiers = requireRecord(input.tiers, 'tiers')
  const takes = requireRecord(input.takes, 'takes')
  const beatlines = requireRecord(input.beatlines, 'beatlines')
  const personal = requireRecord(input.personal, 'personal')
  const assets = requireRecord(input.assets, 'assets')
  const board = requireRecord(input.board, 'board')
  const boardCards = requireArray(board.cards, 'board.cards')
  const boardBeats = requireArray(board.beats, 'board.beats')
  requireRecord(board.owners, 'board.owners')

  let receipt: SettlementReceipt | undefined
  if (input.receipt) {
    if (!artifacts.receipt) throw new Error('artifacts.receipt is required when receipt is provided')
    receipt = parseSettlementReceipt(JSON.stringify(input.receipt))
    if (receipt.room_code !== roomCode) throw new Error('receipt.room_code does not match room_code')
  } else if (artifacts.receipt) {
    throw new Error('receipt is required when artifacts.receipt is provided')
  }

  const tierPlayers = Object.entries(tiers).filter(([name]) => !name.startsWith('_'))
  const musterCounts = { heavy: 0, impact: 0, present: 0, absent: 0 }
  for (const [player, rawTiers] of tierPlayers) {
    const playerTiers = requireRecord(rawTiers, `tiers.${player}`)
    for (const tier of Object.keys(musterCounts) as Array<keyof typeof musterCounts>) {
      musterCounts[tier] += requireArray(playerTiers[tier], `tiers.${player}.${tier}`).length
    }
  }

  let quoteCount = 0
  let referenceCount = 0
  let groundedCount = 0
  let markupCount = 0
  for (const [group, rawQuotes] of Object.entries(takes)) {
    const quotes = requireArray(rawQuotes, `takes.${group}`)
    for (const [index, rawQuote] of quotes.entries()) {
      const quote = requireRecord(rawQuote, `takes.${group}[${index}]`)
      nonBlankString(quote.speaker, `takes.${group}[${index}].speaker`)
      const text = nonBlankString(quote.text, `takes.${group}[${index}].text`)
      const refs = requireArray(quote.refs, `takes.${group}[${index}].refs`)
        .map((entry, refIndex) => {
          const label = `takes.${group}[${index}].refs[${refIndex}]`
          if (typeof entry === 'string') return nonBlankString(entry, label)
          return nonBlankString(requireRecord(entry, label).name, `${label}.name`)
        })
      quoteCount += 1
      referenceCount += refs.length
      if (isSettlementDropGrounding(quote.grounding)) groundedCount += 1
      if (/<[^>]+>/.test(text)) markupCount += 1
    }
  }

  let presentationLineCount = 0
  let linkedPresentationLineCount = 0
  for (const [group, rawLines] of Object.entries(beatlines)) {
    const lines = requireArray(rawLines, `beatlines.${group}`)
    for (const [index, rawLine] of lines.entries()) {
      const line = requireRecord(rawLine, `beatlines.${group}[${index}]`)
      nonBlankString(line.kind, `beatlines.${group}[${index}].kind`)
      presentationLineCount += 1
      if ((typeof line.evidence_id === 'string' && line.evidence_id.trim())
        || (typeof line.fact_id === 'string' && line.fact_id.trim())) linkedPresentationLineCount += 1
    }
  }

  const assetValues = Object.values(assets)
  assetValues.forEach((value, index) => nonBlankString(value, `assets value ${index + 1}`))
  const embeddedAssets = assetValues.filter((value) => (value as string).startsWith('data:image/')).length
  const extraction = input.asset_extraction
  let extractionSourceMatches = false
  if (extraction) {
    if (!artifacts.asset_extraction) {
      throw new Error('artifacts.asset_extraction is required when asset_extraction is provided')
    }
    if (extraction.target.room_code !== roomCode) throw new Error('asset extraction room does not match room_code')
    extractionSourceMatches = extraction.source.name === artifacts.assets.name
      && extraction.source.bytes === artifacts.assets.bytes
      && extraction.source.sha256 === artifacts.assets.sha256
    if (!extractionSourceMatches) throw new Error('asset extraction source does not match artifacts.assets')
    const legacyIds = new Set(Object.keys(assets))
    const extractedIds = new Set(extraction.assets.map((asset) => asset.id))
    if (!setEquals(legacyIds, extractedIds)) throw new Error('asset extraction IDs do not exactly match legacy assets')
    const expectedExtraction = planSettlementDropAssetExtraction({
      room_code: roomCode,
      source: artifacts.assets,
      assets,
    }).manifest
    if (serializeSettlementDropAssetExtractionManifest(extraction)
      !== serializeSettlementDropAssetExtractionManifest(expectedExtraction)) {
      throw new Error('asset extraction does not match the sealed legacy asset bytes')
    }
  } else if (artifacts.asset_extraction) {
    throw new Error('asset_extraction is required when artifacts.asset_extraction is provided')
  }

  const presentationStructure = input.presentation_structure
  if (presentationStructure) {
    if (!artifacts.presentation_structure || !input.presentation_sources) {
      throw new Error('presentation structure artifact and source bytes are required with presentation_structure')
    }
    if (JSON.stringify(JSON.parse(input.presentation_sources.beatlines_raw)) !== JSON.stringify(beatlines)) {
      throw new Error('presentation beatlines raw bytes do not match parsed beatlines')
    }
    if (JSON.stringify(JSON.parse(input.presentation_sources.takes_raw)) !== JSON.stringify(takes)) {
      throw new Error('presentation takes raw bytes do not match parsed takes')
    }
    const expectedPresentation = buildSettlementDropPresentationStructurePacket({
      room_code: roomCode,
      ceremony: sealedRaw(input.presentation_sources.ceremony_raw, artifacts.ceremony, 'ceremony'),
      beatlines: sealedRaw(input.presentation_sources.beatlines_raw, artifacts.beatlines, 'beatlines'),
      takes: sealedRaw(input.presentation_sources.takes_raw, artifacts.takes, 'takes'),
    })
    if (serializeSettlementDropPresentationStructurePacket(presentationStructure)
      !== serializeSettlementDropPresentationStructurePacket(expectedPresentation)) {
      throw new Error('presentation structure does not match the sealed legacy sources')
    }
  } else if (artifacts.presentation_structure || input.presentation_sources) {
    throw new Error('presentation_structure is required with its artifact or source bytes')
  }

  const playerIdentity = input.player_identity
  if (playerIdentity) {
    if (!artifacts.player_identity || !artifacts.snapshot_rooms || !artifacts.snapshot_players
      || !input.identity_sources) {
      throw new Error('player identity artifact, snapshot artifacts and source bytes are required with player_identity')
    }
    sealedRaw(
      serializeSettlementDropPlayerIdentityPacket(playerIdentity),
      artifacts.player_identity,
      'player identity',
    )
    if (JSON.stringify(JSON.parse(input.identity_sources.tiers_raw)) !== JSON.stringify(tiers)) {
      throw new Error('identity tiers raw bytes do not match parsed tiers')
    }
    if (JSON.stringify(JSON.parse(input.identity_sources.personal_raw)) !== JSON.stringify(personal)) {
      throw new Error('identity personal raw bytes do not match parsed personal')
    }
    if (JSON.stringify(JSON.parse(input.identity_sources.board_raw)) !== JSON.stringify(board)) {
      throw new Error('identity board raw bytes do not match parsed board')
    }
    const expectedIdentity = buildSettlementDropPlayerIdentityPacket({
      room_code: roomCode,
      ceremony: sealedRaw(input.identity_sources.ceremony_raw, artifacts.ceremony, 'ceremony'),
      tiers: sealedRaw(input.identity_sources.tiers_raw, artifacts.tiers, 'tiers'),
      personal: sealedRaw(input.identity_sources.personal_raw, artifacts.personal, 'personal'),
      board: sealedRaw(input.identity_sources.board_raw, artifacts.board, 'board'),
      rooms: sealedRaw(input.identity_sources.rooms_raw, artifacts.snapshot_rooms, 'snapshot rooms'),
      players: sealedRaw(input.identity_sources.players_raw, artifacts.snapshot_players, 'snapshot players'),
    })
    if (serializeSettlementDropPlayerIdentityPacket(playerIdentity)
      !== serializeSettlementDropPlayerIdentityPacket(expectedIdentity)) {
      throw new Error('player identity does not match the sealed legacy and snapshot sources')
    }
  } else if (artifacts.player_identity || artifacts.snapshot_rooms || artifacts.snapshot_players
    || input.identity_sources) {
    throw new Error('player_identity is required with its artifact, snapshot artifacts or source bytes')
  }

  const quoteMarkup = input.quote_markup
  if (quoteMarkup) {
    if (!artifacts.quote_markup || !input.quote_markup_source) {
      throw new Error('quote markup artifact and source bytes are required with quote_markup')
    }
    sealedRaw(
      serializeSettlementDropQuoteMarkupPacket(quoteMarkup),
      artifacts.quote_markup,
      'quote markup',
    )
    if (JSON.stringify(JSON.parse(input.quote_markup_source.takes_raw)) !== JSON.stringify(takes)) {
      throw new Error('quote markup takes raw bytes do not match parsed takes')
    }
    const expectedQuoteMarkup = buildSettlementDropQuoteMarkupPacket({
      room_code: roomCode,
      takes: sealedRaw(input.quote_markup_source.takes_raw, artifacts.takes, 'takes'),
    })
    if (serializeSettlementDropQuoteMarkupPacket(quoteMarkup)
      !== serializeSettlementDropQuoteMarkupPacket(expectedQuoteMarkup)) {
      throw new Error('quote markup does not match the sealed legacy takes')
    }
  } else if (artifacts.quote_markup || input.quote_markup_source) {
    throw new Error('quote_markup is required with its artifact or source bytes')
  }

  const receiptPrerequisites = input.receipt_prerequisites
  if (receiptPrerequisites) {
    if (!artifacts.receipt_prerequisites || !input.receipt_prerequisite_sources) {
      throw new Error('receipt prerequisites artifact and source bytes are required with receipt_prerequisites')
    }
    sealedRaw(
      serializeSettlementDropReceiptPrerequisitesPacket(receiptPrerequisites),
      artifacts.receipt_prerequisites,
      'receipt prerequisites',
    )
    const expectedPrerequisites = buildSettlementDropReceiptPrerequisitesPacket({
      room_code: roomCode,
      tables: Object.fromEntries(RECEIPT_PREREQUISITE_TABLES.map((table) => {
        const raw = input.receipt_prerequisite_sources?.[table]
        if (typeof raw !== 'string') throw new Error(`receipt prerequisite source ${table} is required`)
        return [table, { raw, seal: receiptPrerequisites.inputs[table] }]
      })) as Parameters<typeof buildSettlementDropReceiptPrerequisitesPacket>[0]['tables'],
    })
    if (serializeSettlementDropReceiptPrerequisitesPacket(receiptPrerequisites)
      !== serializeSettlementDropReceiptPrerequisitesPacket(expectedPrerequisites)) {
      throw new Error('receipt prerequisites do not match the sealed snapshot sources')
    }
  } else if (artifacts.receipt_prerequisites || input.receipt_prerequisite_sources) {
    throw new Error('receipt_prerequisites is required with its artifact or source bytes')
  }

  const assetSemantics = input.asset_semantics
  if (assetSemantics) {
    if (!artifacts.asset_semantics || !input.asset_semantics_sources || !extraction
      || !artifacts.asset_extraction) {
      throw new Error('asset semantics artifact, extraction and source bytes are required with asset_semantics')
    }
    sealedRaw(
      serializeSettlementDropAssetSemanticsPacket(assetSemantics),
      artifacts.asset_semantics,
      'asset semantics',
    )
    if (JSON.stringify(JSON.parse(input.asset_semantics_sources.assets_raw)) !== JSON.stringify(assets)) {
      throw new Error('asset semantics raw assets do not match parsed assets')
    }
    const expectedSemantics = buildSettlementDropAssetSemanticsPacket({
      room_code: roomCode,
      ceremony: sealedRaw(input.asset_semantics_sources.ceremony_raw, artifacts.ceremony, 'ceremony'),
      legacy_assets: sealedRaw(input.asset_semantics_sources.assets_raw, artifacts.assets, 'assets'),
      extraction: sealedRaw(input.asset_semantics_sources.extraction_raw, artifacts.asset_extraction, 'asset extraction'),
    })
    if (serializeSettlementDropAssetSemanticsPacket(assetSemantics)
      !== serializeSettlementDropAssetSemanticsPacket(expectedSemantics)) {
      throw new Error('asset semantics do not match the sealed ceremony, assets and extraction')
    }
  } else if (artifacts.asset_semantics || input.asset_semantics_sources) {
    throw new Error('asset_semantics is required with its artifact or source bytes')
  }

  let rosterSlots = 0
  let bingoSquares = 0
  let markedSquares = 0
  for (const [player, rawEdition] of Object.entries(personal)) {
    const edition = requireRecord(rawEdition, `personal.${player}`)
    const roster = requireArray(edition.roster, `personal.${player}.roster`)
    const card = requireArray(edition.card, `personal.${player}.card`)
    rosterSlots += roster.length
    bingoSquares += card.length
    markedSquares += card.filter((rawSquare, index) => {
      const square = requireRecord(rawSquare, `personal.${player}.card[${index}]`)
      return square.marked === true
    }).length
  }

  const boardPlayerNames = new Set(boardCards.map((rawCard, index) => {
    const card = requireRecord(rawCard, `board.cards[${index}]`)
    return nonBlankString(card.player, `board.cards[${index}].player`)
  }))
  const tierPlayerNames = new Set(tierPlayers.map(([name]) => name))
  const personalPlayerNames = new Set(Object.keys(personal))
  const namesConsistent = setEquals(tierPlayerNames, personalPlayerNames)
    && setEquals(tierPlayerNames, boardPlayerNames)

  const blockers: SettlementDropMigrationBlocker[] = []
  if (!receipt) blockers.push({
    code: 'missing_settlement_receipt',
    detail: 'The presentation files are not the canonical owner of final totals, facts, or score events.',
    required_action: receiptPrerequisites?.canonical_state.canonical_receipt_recoverable === false
      ? 'Author and apply an authoritative settlement, then export its canonical receipt before compiling a drop.'
      : 'Export an existing canonical receipt or author and apply an authoritative settlement before compiling a drop.',
  })
  if (!namesConsistent && !playerIdentity) blockers.push({
    code: 'player_identity_mismatch',
    detail: 'Player display-name sets differ across tiers, personal editions, and board cards.',
    required_action: 'Approve one explicit mapping from each legacy display name to receipt player_id.',
  })
  if (playerIdentity) blockers.push({
    code: 'player_identity_requires_approval',
    count: playerIdentity.players.length,
    detail: `${playerIdentity.coverage.exact_uuid_joins} player identities are joined by exact UUID; ${playerIdentity.coverage.display_name_variants} display-name variant${playerIdentity.coverage.display_name_variants === 1 ? '' : 's'} remain and no canonical names have been approved.`,
    required_action: 'Review the source-bound identity packet and explicitly approve one canonical display name per player_id.',
  })
  if (groundedCount < quoteCount) blockers.push({
    code: 'ungrounded_quotes',
    count: quoteCount - groundedCount,
    detail: `${quoteCount - groundedCount} pundit quotes lack a valid grounded-line stamp.`,
    required_action: 'Publish replacements through scripts/grounded-line.mts and retain their grounding records.',
  })
  if (linkedPresentationLineCount < presentationLineCount) blockers.push({
    code: 'legacy_ledger_not_receipt_linked',
    count: presentationLineCount - linkedPresentationLineCount,
    detail: `${presentationLineCount - linkedPresentationLineCount} presentation ledger lines lack evidence_id or fact_id.`,
    required_action: 'Map each scored line to a receipt score event and each factual line to a settled fact.',
  })
  if (embeddedAssets > 0 && !extraction) blockers.push({
    code: 'embedded_assets_require_extraction',
    count: embeddedAssets,
    detail: `${embeddedAssets} assets are embedded data URIs, while the compiler requires confined local files.`,
    required_action: 'Extract each asset to a local image file and author explicit asset IDs, paths, and alt text.',
  })
  if (extraction && !assetSemantics) blockers.push({
    code: 'asset_semantics_require_authoring',
    count: extraction.assets.length,
    detail: `${extraction.assets.length} extracted local assets still need explicit alt text and manifest assignments.`,
    required_action: 'Author reviewed alt text and map each player, character, speaker and interstitial to an extracted asset ID.',
  })
  if (assetSemantics) blockers.push({
    code: 'asset_semantics_requires_approval',
    count: assetSemantics.coverage.assets,
    detail: `${assetSemantics.coverage.assets} extracted assets have source-bound usage evidence, but alt text and structured assignments remain unapproved.`,
    required_action: 'Review the null asset-semantics decision template and approve alt text plus structured assignments for every asset.',
  })
  if (markupCount > 0 && !quoteMarkup) blockers.push({
    code: 'quote_markup_requires_plain_text_decision',
    count: markupCount,
    detail: `${markupCount} quote texts contain legacy HTML markup that the compiler would escape.`,
    required_action: 'Approve plain-text emphasis or move emphasis into the renderer contract.',
  })
  if (quoteMarkup) blockers.push({
    code: 'quote_markup_requires_approval',
    count: quoteMarkup.coverage.quotes_with_markup,
    detail: `${quoteMarkup.coverage.quotes_with_markup} legacy quotes have source-bound plain-text candidates and emphasis spans, but no copy or treatment approvals.`,
    required_action: 'Review the null decision template and explicitly approve each plain-text quote plus its emphasis treatment.',
  })
  if (!presentationStructure) blockers.push({
    code: 'presentation_structure_not_authored',
    detail: 'Numeric take groups and B-prefixed ledger groups do not define settlement-drop acts, beats, weights, or interstitials.',
    required_action: 'Prepare a source-bound presentation structure packet before authoring compiler decisions.',
  })
  else blockers.push({
    code: 'presentation_structure_requires_approval',
    count: presentationStructure.coverage.beats,
    detail: `${presentationStructure.coverage.beats} observed beats still need explicit compiler IDs, weights, copy, assets and approved joins; unresolved beatlines: ${presentationStructure.coverage.unresolved_beatline_groups.join(', ') || 'none'}.`,
    required_action: 'Review the null decision template and author explicit show, act, beat, interstitial and join decisions.',
  })

  const recoverableLanes: SettlementDropMigrationAudit['readiness']['recoverable_lanes'] = []
  if (tierPlayers.length > 0) recoverableLanes.push('muster')
  if (quoteCount > 0) recoverableLanes.push('pundit_reference_sets')
  if (boardBeats.length > 0) recoverableLanes.push('board_evidence_candidates')
  if (Object.keys(personal).length > 0) recoverableLanes.push('personal_editions')
  if (assetValues.length > 0) recoverableLanes.push('portrait_inventory')

  return {
    audit_version: 1,
    artifact: 'settlement-drop-migration-audit',
    target: { room_code: roomCode },
    inputs: artifacts,
    inventory: {
      settlement_receipt: {
        provided: Boolean(receipt),
        score_events: receipt?.score_events.length ?? 0,
        settled_facts: receipt?.settled_facts?.length ?? 0,
        prerequisites_packet_provided: Boolean(receiptPrerequisites),
        candidate_entries: receiptPrerequisites?.coverage.candidate_entries ?? 0,
        canonical_recovery_possible: receiptPrerequisites?.canonical_state.canonical_receipt_recoverable ?? false,
      },
      players: {
        tiers: tierPlayers.length,
        personal_editions: Object.keys(personal).length,
        board_cards: boardCards.length,
        names_consistent: namesConsistent,
        identity_packet_provided: Boolean(playerIdentity),
        exact_uuid_joins: playerIdentity?.coverage.exact_uuid_joins ?? 0,
        display_name_variants: playerIdentity?.coverage.display_name_variants ?? 0,
      },
      muster: {
        tier_entries: Object.values(musterCounts).reduce((sum, count) => sum + count, 0),
        ...musterCounts,
      },
      quotes: {
        groups: Object.keys(takes).length,
        quotes: quoteCount,
        references: referenceCount,
        grounded: groundedCount,
        with_markup: markupCount,
        markup_packet_provided: Boolean(quoteMarkup),
        emphasis_spans: quoteMarkup?.coverage.emphasis_spans ?? 0,
      },
      ledger: {
        presentation_groups: Object.keys(beatlines).length,
        presentation_lines: presentationLineCount,
        presentation_lines_with_receipt_link: linkedPresentationLineCount,
        board_beats: boardBeats.length,
        board_beats_with_id: boardBeats.filter((rawBeat) => isRecord(rawBeat)
          && hasLegacyBoardBeatId(rawBeat.id)).length,
      },
      assets: {
        total: assetValues.length,
        embedded_data_uris: embeddedAssets,
        source_local_paths: assetValues.length - embeddedAssets,
        extracted_local_files: extraction?.assets.length ?? 0,
        extraction_source_matches: extractionSourceMatches,
        semantics_packet_provided: Boolean(assetSemantics),
        character_assignments: assetSemantics?.coverage.character_assignments ?? 0,
        pundit_assignments: assetSemantics?.coverage.pundit_assignments ?? 0,
        player_sigil_assignments: assetSemantics?.coverage.player_sigil_assignments ?? 0,
        assets_without_structured_assignment: assetSemantics?.coverage.assets_without_structured_assignment ?? 0,
      },
      personal_editions: { roster_slots: rosterSlots, bingo_squares: bingoSquares, marked_squares: markedSquares },
      presentation_structure: {
        packet_provided: Boolean(presentationStructure),
        slides: presentationStructure?.coverage.slides ?? 0,
        acts: presentationStructure?.coverage.acts ?? 0,
        beats: presentationStructure?.coverage.beats ?? 0,
        interstitials: presentationStructure?.coverage.interstitials ?? 0,
        beatline_group_candidates: presentationStructure?.coverage.beatline_group_candidates ?? 0,
        take_groups_mapped: presentationStructure?.coverage.take_groups_mapped ?? 0,
        unresolved_beatline_groups: presentationStructure?.coverage.unresolved_beatline_groups ?? [],
      },
    },
    readiness: { ready_for_manifest: blockers.length === 0, recoverable_lanes: recoverableLanes },
    blockers,
  }
}

export function serializeSettlementDropMigrationAudit(audit: SettlementDropMigrationAudit): string {
  return `${JSON.stringify(audit, null, 2)}\n`
}
