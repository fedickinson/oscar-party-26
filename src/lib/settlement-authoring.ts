import { parseSettlementManifest, type SettlementManifest } from './settlement-manifest'
import type {
  BingoMarkStatus,
  EntityType,
  RoomPhase,
  SettlementBingoMode,
  SettlementOutcome,
  SettlementWarrant,
} from '../types/database'

interface AuthoringRoom {
  id: string
  code: string
  phase: RoomPhase
  show_pack_id: string
  active_settlement_id: string | null
  game_model?: 'legacy_ensemble' | 'conviction_portfolio'
}

interface AuthoringShowPack {
  id: string
  pack_key: string
  version: number
  title: string
  status: string
}

interface AuthoringActiveSettlement {
  id: string
  room_id: string
  version: number
  title: string
  actor: string
  bingo_mode: SettlementBingoMode
  created_at: string
}

interface AuthoringCategory {
  id: number
  name: string
  points: number
  display_order: number
  announced_at: string | null
  show_pack_id: string | null
  room_id: string | null
  source_signature_beat_id?: number | null
}

interface AuthoringNamedEntity {
  id: string
  name: string
  type: EntityType
  film_name: string
}

interface AuthoringPlayer {
  id: string
  name: string
  is_host: boolean
}

interface AuthoringWinner {
  category_id: number
  winner_id: string
  tie_winner_id: string | null
}

interface AuthoringConfidencePick {
  id: string
  player_id: string
  category_id: number
  nominee_id: string
  confidence: number
}

interface AuthoringConvictionPick {
  player_id: string
  beat_id: number
}

interface AuthoringSignatureBeat {
  id: number
  name: string
  points: number
  entity_id: string
}

interface AuthoringDraftPick {
  id: string
  player_id: string
  entity_id: string
}

interface AuthoringBingoCard {
  id: string
  player_id: string
  squares: number[]
}

interface AuthoringBingoSquare {
  id: number
  slug: string
  title: string
}

interface AuthoringBingoMark {
  id: string
  card_id: string
  square_index: number
  status: BingoMarkStatus
  marked_at: string
}

interface AuthoringSettlementEntry {
  settlement_id: string
  entry_key: string
  name: string
  category_id: number | null
  outcome: SettlementOutcome
  points: number
  winner_id: string | null
  tie_winner_id: string | null
  display_order: number
  occurred_at: string | null
  warrant: SettlementWarrant
}

interface AuthoringSettlementMark {
  settlement_id: string
  card_id: string
  square_index: number
  marked_at: string
  warrant: SettlementWarrant
}

export interface SettlementAuthoringInput {
  room: AuthoringRoom
  showPack: AuthoringShowPack
  activeSettlement: AuthoringActiveSettlement | null
  activeSettlementEntries: AuthoringSettlementEntry[]
  activeSettlementMarks: AuthoringSettlementMark[]
  players: AuthoringPlayer[]
  categories: AuthoringCategory[]
  nominees: AuthoringNamedEntity[]
  roomWinners: AuthoringWinner[]
  confidencePicks: AuthoringConfidencePick[]
  convictionPicks?: AuthoringConvictionPick[]
  signatureBeats?: AuthoringSignatureBeat[]
  draftEntities: AuthoringNamedEntity[]
  draftPicks: AuthoringDraftPick[]
  bingoCards: AuthoringBingoCard[]
  bingoSquares: AuthoringBingoSquare[]
  bingoMarks: AuthoringBingoMark[]
}

interface SettlementManifestDraftEntry {
  key: string
  name: string
  category_id?: number
  outcome: SettlementOutcome | null
  points: number
  winner?: string
  tie_winner?: string
  occurred_at?: string
  warrant: SettlementWarrant | null
}

export interface SettlementAuthoringWorksheet {
  worksheet_version: 1
  artifact: 'settlement-authoring-worksheet'
  source: {
    room: AuthoringRoom
    show_pack: AuthoringShowPack
    active_settlement: AuthoringActiveSettlement | null
  }
  counts: {
    players: number
    current_entries: number
    resolved_entries: number
    unresolved_staked_entries: number
    approved_bingo_marks: number
    conviction_picks?: number
    conviction_beats?: number
    resolved_conviction_beats?: number
  }
  references: {
    players: AuthoringPlayer[]
    nominees: AuthoringNamedEntity[]
    draft_entities: Array<AuthoringNamedEntity & { owner_player_id: string | null }>
  }
  current_record: {
    source: 'live' | 'settled'
    entries: Array<{
      key: string
      category_id: number | null
      name: string
      points: number
      origin: 'authored' | 'room_declared' | 'unscored'
      status: 'provisional_resolved' | 'unresolved_stake' | 'settled'
      announced_at: string | null
      winner: { id: string; name: string } | null
      tie_winner: { id: string; name: string } | null
      stakes: Array<{
        player: { id: string; name: string }
        nominee: { id: string; name: string }
        confidence: number
      }>
      warrant?: SettlementWarrant
    }>
    approved_bingo_marks: Array<{
      card_id: string
      player: { id: string; name: string }
      square_index: number
      square: { id: number; slug: string; title: string }
      marked_at: string
      warrant?: SettlementWarrant
    }>
    convictions?: Array<{
      player: { id: string; name: string }
      beat: AuthoringSignatureBeat
      believer_count: number
      status: 'struck' | 'quiet'
    }>
  }
  manifest_draft: {
    version: 1
    title: string | null
    actor: string | null
    entries: SettlementManifestDraftEntry[]
    bingo: {
      mode: SettlementBingoMode | null
      marks: Array<{
        player: string
        square_slug: string
        marked_at?: string
        warrant: SettlementWarrant
      }>
      warrant?: SettlementWarrant
    }
    expected: {
      player_totals: Record<string, number | null>
      character_points: Record<string, number>
    }
  }
  authoring_queue: {
    entry_keys: string[]
    required_staked_category_ids: number[]
    required_conviction_beat_ids?: number[]
    bingo_decision: 'preserve_live_or_replace'
    expected_player_ids: string[]
    expected_character_reference_ids: string[]
    additional_fact_review: 'required'
  }
  issues: string[]
}

function duplicateIssues(
  rows: Array<{ id: string | number }>,
  label: string,
): string[] {
  const seen = new Set<string>()
  const duplicates = new Set<string>()
  for (const row of rows) {
    const id = String(row.id)
    if (seen.has(id)) duplicates.add(id)
    seen.add(id)
  }
  return [...duplicates].sort().map((id) => `${label} has duplicate id ${id}`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function resolvedParty(
  id: string | null,
  nomineesById: Map<string, AuthoringNamedEntity>,
): { id: string; name: string } | null {
  if (id === null) return null
  const nominee = nomineesById.get(id)
  return nominee ? { id: nominee.id, name: nominee.name } : null
}

export function buildSettlementAuthoringWorksheet(
  input: SettlementAuthoringInput,
): SettlementAuthoringWorksheet {
  const players = input.players.map((row) => ({ ...row })).sort((a, b) => a.id.localeCompare(b.id))
  const categories = input.categories.map((row) => ({ ...row })).sort((a, b) => (
    a.display_order - b.display_order || a.id - b.id
  ))
  const nominees = input.nominees.map((row) => ({ ...row })).sort((a, b) => a.id.localeCompare(b.id))
  const winners = input.roomWinners.map((row) => ({ ...row })).sort((a, b) => (
    a.category_id - b.category_id || a.winner_id.localeCompare(b.winner_id)
  ))
  const confidencePicks = input.confidencePicks.map((row) => ({ ...row })).sort((a, b) => (
    a.category_id - b.category_id || a.player_id.localeCompare(b.player_id) || a.id.localeCompare(b.id)
  ))
  const convictionPicks = (input.convictionPicks ?? []).map((row) => ({ ...row })).sort((a, b) => (
    a.beat_id - b.beat_id || a.player_id.localeCompare(b.player_id)
  ))
  const signatureBeats = (input.signatureBeats ?? []).map((row) => ({ ...row })).sort((a, b) => a.id - b.id)
  const draftEntities = input.draftEntities.map((row) => ({ ...row })).sort((a, b) => a.id.localeCompare(b.id))
  const draftPicks = input.draftPicks.map((row) => ({ ...row })).sort((a, b) => a.id.localeCompare(b.id))
  const bingoCards = input.bingoCards.map((row) => ({ ...row, squares: [...row.squares] }))
    .sort((a, b) => a.id.localeCompare(b.id))
  const bingoSquares = input.bingoSquares.map((row) => ({ ...row })).sort((a, b) => a.id - b.id)
  const bingoMarks = input.bingoMarks.map((row) => ({ ...row })).sort((a, b) => a.id.localeCompare(b.id))
  const activeEntries = input.activeSettlementEntries.map((row) => structuredClone(row)).sort((a, b) => (
    a.display_order - b.display_order || a.entry_key.localeCompare(b.entry_key)
  ))
  const activeMarks = input.activeSettlementMarks.map((row) => structuredClone(row)).sort((a, b) => (
    a.card_id.localeCompare(b.card_id) || a.square_index - b.square_index
  ))

  const issues = [
    ...duplicateIssues(players, 'player'),
    ...duplicateIssues(categories, 'category'),
    ...duplicateIssues(nominees, 'nominee'),
    ...duplicateIssues(draftEntities, 'draft entity'),
    ...duplicateIssues(draftPicks, 'draft pick'),
    ...duplicateIssues(bingoCards, 'bingo card'),
    ...duplicateIssues(bingoSquares, 'bingo square'),
    ...duplicateIssues(bingoMarks, 'bingo mark'),
    ...duplicateIssues(
      activeEntries.map((row) => ({ id: row.entry_key })),
      'active settlement entry',
    ),
  ]
  if (input.room.show_pack_id !== input.showPack.id) {
    issues.push(`room show pack ${input.room.show_pack_id} does not match registry ${input.showPack.id}`)
  }
  if (input.showPack.status !== 'published') {
    issues.push(`show pack status is ${input.showPack.status}, not published`)
  }
  if (input.room.phase !== 'finished' && input.room.phase !== 'closed') {
    issues.push(`room phase is ${input.room.phase}, not finished or closed`)
  }

  const playersById = new Map(players.map((row) => [row.id, row]))
  const categoriesById = new Map(categories.map((row) => [row.id, row]))
  const nomineesById = new Map(nominees.map((row) => [row.id, row]))
  const draftEntitiesById = new Map(draftEntities.map((row) => [row.id, row]))
  const signatureBeatsById = new Map(signatureBeats.map((row) => [row.id, row]))
  const bingoCardsById = new Map(bingoCards.map((row) => [row.id, row]))
  const bingoSquaresById = new Map(bingoSquares.map((row) => [row.id, row]))

  for (const category of categories) {
    const inPack = category.show_pack_id === input.room.show_pack_id && category.room_id === null
    const inRoom = category.room_id === input.room.id && category.show_pack_id === null
    if (!inPack && !inRoom) issues.push(`category ${category.id} is outside the room catalog`)
  }
  const winnersByCategory = new Map<number, AuthoringWinner[]>()
  for (const winner of winners) {
    if (!categoriesById.has(winner.category_id)) {
      issues.push(`winner references unknown category ${winner.category_id}`)
    }
    if (!nomineesById.has(winner.winner_id)) {
      issues.push(`winner for category ${winner.category_id} references unknown nominee ${winner.winner_id}`)
    }
    if (winner.tie_winner_id !== null && !nomineesById.has(winner.tie_winner_id)) {
      issues.push(`tie winner for category ${winner.category_id} references unknown nominee ${winner.tie_winner_id}`)
    }
    const current = winnersByCategory.get(winner.category_id) ?? []
    current.push(winner)
    winnersByCategory.set(winner.category_id, current)
  }
  for (const [categoryId, rows] of winnersByCategory) {
    if (rows.length > 1) issues.push(`category ${categoryId} has ${rows.length} room winner rows`)
  }

  const believerCountByBeat = new Map<number, number>()
  for (const pick of convictionPicks) {
    if (!playersById.has(pick.player_id)) {
      issues.push(`conviction pick ${pick.player_id}:${pick.beat_id} references unknown player ${pick.player_id}`)
    }
    if (!signatureBeatsById.has(pick.beat_id)) {
      issues.push(`conviction pick ${pick.player_id}:${pick.beat_id} references unknown beat ${pick.beat_id}`)
    }
    believerCountByBeat.set(pick.beat_id, (believerCountByBeat.get(pick.beat_id) ?? 0) + 1)
  }

  const stakesByCategory = new Map<number, AuthoringConfidencePick[]>()
  for (const pick of confidencePicks) {
    if (!playersById.has(pick.player_id)) {
      issues.push(`confidence pick ${pick.id} references unknown player ${pick.player_id}`)
    }
    if (!categoriesById.has(pick.category_id)) {
      issues.push(`confidence pick ${pick.id} references unknown category ${pick.category_id}`)
    }
    if (!nomineesById.has(pick.nominee_id)) {
      issues.push(`confidence pick ${pick.id} references unknown nominee ${pick.nominee_id}`)
    }
    const current = stakesByCategory.get(pick.category_id) ?? []
    current.push(pick)
    stakesByCategory.set(pick.category_id, current)
  }

  const ownerByEntity = new Map<string, string>()
  for (const pick of draftPicks) {
    if (!playersById.has(pick.player_id)) {
      issues.push(`draft pick ${pick.id} references unknown player ${pick.player_id}`)
    }
    if (!draftEntitiesById.has(pick.entity_id)) {
      issues.push(`draft pick ${pick.id} references unknown entity ${pick.entity_id}`)
    }
    if (ownerByEntity.has(pick.entity_id)) {
      issues.push(`draft entity ${pick.entity_id} is owned by more than one pick`)
    } else {
      ownerByEntity.set(pick.entity_id, pick.player_id)
    }
  }

  const cardsByPlayer = new Map<string, AuthoringBingoCard[]>()
  for (const card of bingoCards) {
    if (!playersById.has(card.player_id)) {
      issues.push(`bingo card ${card.id} references unknown player ${card.player_id}`)
    }
    if (card.squares.length !== 25) issues.push(`bingo card ${card.id} has ${card.squares.length} squares, not 25`)
    for (const squareId of card.squares) {
      if (squareId !== 0 && !bingoSquaresById.has(squareId)) {
        issues.push(`bingo card ${card.id} references unknown square ${squareId}`)
      }
    }
    const current = cardsByPlayer.get(card.player_id) ?? []
    current.push(card)
    cardsByPlayer.set(card.player_id, current)
  }
  for (const player of players) {
    const count = (cardsByPlayer.get(player.id) ?? []).length
    if (count !== 1) issues.push(`player ${player.id} has ${count} bingo cards, not 1`)
  }

  const stakesFor = (categoryId: number) => (stakesByCategory.get(categoryId) ?? [])
    .flatMap((pick) => {
      const player = playersById.get(pick.player_id)
      const nominee = nomineesById.get(pick.nominee_id)
      return player && nominee ? [{
        player: { id: player.id, name: player.name },
        nominee: { id: nominee.id, name: nominee.name },
        confidence: pick.confidence,
      }] : []
    })

  const isClosed = input.room.phase === 'closed'
  if (isClosed) {
    if (!input.activeSettlement || input.activeSettlement.id !== input.room.active_settlement_id) {
      issues.push('closed room active settlement does not match its active pointer')
    } else if (input.activeSettlement.room_id !== input.room.id) {
      issues.push(`active settlement ${input.activeSettlement.id} belongs to another room`)
    }
  } else if (input.activeSettlement || input.room.active_settlement_id !== null) {
    issues.push('finished room must not have an active settlement')
  }
  for (const entry of activeEntries) {
    if (entry.settlement_id !== input.room.active_settlement_id) {
      issues.push(`active entry ${entry.entry_key} belongs to settlement ${entry.settlement_id}`)
    }
    if (entry.category_id !== null && !categoriesById.has(entry.category_id)) {
      issues.push(`active entry ${entry.entry_key} references unknown category ${entry.category_id}`)
    }
    if (entry.winner_id !== null && !nomineesById.has(entry.winner_id)) {
      issues.push(`active entry ${entry.entry_key} references unknown winner ${entry.winner_id}`)
    }
    if (entry.tie_winner_id !== null && !nomineesById.has(entry.tie_winner_id)) {
      issues.push(`active entry ${entry.entry_key} references unknown tie winner ${entry.tie_winner_id}`)
    }
  }

  const currentEntries: SettlementAuthoringWorksheet['current_record']['entries'] = isClosed
    ? activeEntries.map((entry) => {
        const category = entry.category_id === null ? null : categoriesById.get(entry.category_id) ?? null
        return {
          key: entry.entry_key,
          category_id: entry.category_id,
          name: entry.name,
          points: entry.points,
          origin: entry.category_id === null
            ? 'unscored' as const
            : category?.room_id === input.room.id ? 'room_declared' as const : 'authored' as const,
          status: 'settled' as const,
          announced_at: entry.occurred_at,
          winner: resolvedParty(entry.winner_id, nomineesById),
          tie_winner: resolvedParty(entry.tie_winner_id, nomineesById),
          stakes: entry.category_id === null ? [] : stakesFor(entry.category_id),
          warrant: structuredClone(entry.warrant),
        }
      })
    : categories
        .filter((category) => winnersByCategory.has(category.id) || stakesByCategory.has(category.id))
        .map((category) => {
          const winnerRows = winnersByCategory.get(category.id) ?? []
          const winner = winnerRows.length === 1 ? winnerRows[0] : null
          return {
            key: `category-${category.id}`,
            category_id: category.id,
            name: category.name,
            points: category.points,
            origin: category.room_id === input.room.id ? 'room_declared' as const : 'authored' as const,
            status: winner ? 'provisional_resolved' as const : 'unresolved_stake' as const,
            announced_at: category.announced_at,
            winner: resolvedParty(winner?.winner_id ?? null, nomineesById),
            tie_winner: resolvedParty(winner?.tie_winner_id ?? null, nomineesById),
            stakes: stakesFor(category.id),
          }
        })

  const sourceMarks = isClosed
    ? activeMarks.map((mark) => ({ ...mark, id: `${mark.card_id}:${mark.square_index}` }))
    : bingoMarks.filter((mark) => mark.status === 'approved')
  const approvedBingoMarks: SettlementAuthoringWorksheet['current_record']['approved_bingo_marks'] = []
  for (const mark of sourceMarks) {
    if ('settlement_id' in mark && mark.settlement_id !== input.room.active_settlement_id) {
      issues.push(`active bingo mark ${mark.id} belongs to settlement ${mark.settlement_id}`)
    }
    const card = bingoCardsById.get(mark.card_id)
    if (!card) {
      issues.push(`approved bingo mark ${mark.id} references unknown card ${mark.card_id}`)
      continue
    }
    if (!Number.isInteger(mark.square_index) || mark.square_index < 0 || mark.square_index >= card.squares.length) {
      issues.push(`approved bingo mark ${mark.id} has invalid square index ${mark.square_index}`)
      continue
    }
    const player = playersById.get(card.player_id)
    if (!player) continue
    const squareId = card.squares[mark.square_index]
    const square = squareId === 0
      ? { id: 0, slug: 'free', title: 'FREE' }
      : bingoSquaresById.get(squareId)
    if (!square) {
      issues.push(`approved bingo mark ${mark.id} references unknown square ${squareId}`)
      continue
    }
    approvedBingoMarks.push({
      card_id: card.id,
      player: { id: player.id, name: player.name },
      square_index: mark.square_index,
      square: { id: square.id, slug: square.slug, title: square.title },
      marked_at: mark.marked_at,
      ...('warrant' in mark ? { warrant: structuredClone(mark.warrant) } : {}),
    })
  }
  approvedBingoMarks.sort((a, b) => (
    a.card_id.localeCompare(b.card_id) || a.square_index - b.square_index
  ))

  const manifestEntries: SettlementManifestDraftEntry[] = isClosed
    ? activeEntries.map((entry) => ({
        key: entry.entry_key,
        name: entry.name,
        ...(entry.category_id === null ? {} : { category_id: entry.category_id }),
        outcome: entry.outcome,
        points: entry.points,
        ...(entry.winner_id === null ? {} : { winner: entry.winner_id }),
        ...(entry.tie_winner_id === null ? {} : { tie_winner: entry.tie_winner_id }),
        ...(entry.occurred_at === null ? {} : { occurred_at: entry.occurred_at }),
        warrant: structuredClone(entry.warrant),
      }))
    : currentEntries.map((entry) => ({
        key: entry.key,
        name: entry.name,
        ...(entry.category_id === null ? {} : { category_id: entry.category_id }),
        outcome: null,
        points: entry.points,
        warrant: null,
      }))

  const struckBeatIds = new Set(isClosed
    ? activeEntries.flatMap((entry) => {
        const category = entry.category_id == null ? null : categoriesById.get(entry.category_id)
        return entry.outcome === 'resolved' && category?.source_signature_beat_id != null
          ? [category.source_signature_beat_id]
          : []
      })
    : categories.flatMap((category) => (
        category.source_signature_beat_id != null && winnersByCategory.has(category.id)
          ? [category.source_signature_beat_id]
          : []
      )))
  const convictions = convictionPicks.flatMap((pick) => {
    const player = playersById.get(pick.player_id)
    const beat = signatureBeatsById.get(pick.beat_id)
    return player && beat ? [{
      player: { id: player.id, name: player.name },
      beat,
      believer_count: believerCountByBeat.get(pick.beat_id) ?? 0,
      status: struckBeatIds.has(pick.beat_id) ? 'struck' as const : 'quiet' as const,
    }] : []
  })
  const includeConvictions = input.room.game_model === 'conviction_portfolio' || convictions.length > 0

  return {
    worksheet_version: 1,
    artifact: 'settlement-authoring-worksheet',
    source: {
      room: { ...input.room },
      show_pack: { ...input.showPack },
      active_settlement: input.activeSettlement ? { ...input.activeSettlement } : null,
    },
    counts: {
      players: players.length,
      current_entries: currentEntries.length,
      resolved_entries: currentEntries.filter((entry) => entry.winner !== null).length,
      unresolved_staked_entries: currentEntries.filter((entry) => entry.status === 'unresolved_stake').length,
      approved_bingo_marks: approvedBingoMarks.length,
      ...(includeConvictions ? {
        conviction_picks: convictions.length,
        conviction_beats: new Set(convictions.map((entry) => entry.beat.id)).size,
        resolved_conviction_beats: new Set(
          convictions.filter((entry) => entry.status === 'struck').map((entry) => entry.beat.id),
        ).size,
      } : {}),
    },
    references: {
      players,
      nominees,
      draft_entities: draftEntities.map((entity) => ({
        ...entity,
        owner_player_id: ownerByEntity.get(entity.id) ?? null,
      })),
    },
    current_record: {
      source: isClosed ? 'settled' : 'live',
      entries: currentEntries,
      approved_bingo_marks: approvedBingoMarks,
      ...(includeConvictions ? { convictions } : {}),
    },
    manifest_draft: {
      version: 1,
      title: null,
      actor: null,
      entries: manifestEntries,
      bingo: { mode: null, marks: [] },
      expected: {
        player_totals: Object.fromEntries(players.map((player) => [player.id, null])),
        character_points: {},
      },
    },
    authoring_queue: {
      entry_keys: manifestEntries.map((entry) => entry.key),
      required_staked_category_ids: [...stakesByCategory.keys()].sort((a, b) => a - b),
      ...(includeConvictions ? {
        required_conviction_beat_ids: [...new Set(convictions.map((entry) => entry.beat.id))]
          .sort((a, b) => a - b),
      } : {}),
      bingo_decision: 'preserve_live_or_replace',
      expected_player_ids: players.map((player) => player.id),
      expected_character_reference_ids: draftEntities.map((entity) => entity.id),
      additional_fact_review: 'required',
    },
    issues,
  }
}

export function serializeSettlementAuthoringWorksheet(
  worksheet: SettlementAuthoringWorksheet,
): string {
  return `${JSON.stringify(worksheet, null, 2)}\n`
}

export function finalizeSettlementAuthoringWorksheet(raw: string): SettlementManifest {
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`settlement authoring worksheet is not valid JSON: ${message}`)
  }
  if (!isRecord(value)) throw new Error('settlement authoring worksheet must be an object')
  const allowed = new Set([
    'worksheet_version', 'artifact', 'source', 'counts', 'references',
    'current_record', 'manifest_draft', 'authoring_queue', 'issues',
  ])
  const unknown = Object.keys(value).filter((key) => !allowed.has(key)).sort()
  if (unknown.length > 0) {
    throw new Error(`settlement authoring worksheet has unknown field ${unknown[0]}`)
  }
  if (value.worksheet_version !== 1 || value.artifact !== 'settlement-authoring-worksheet') {
    throw new Error('settlement authoring worksheet identity is invalid')
  }
  if (!Array.isArray(value.issues) || value.issues.some((issue) => typeof issue !== 'string')) {
    throw new Error('settlement authoring worksheet issues must be strings')
  }
  if (value.issues.length > 0) {
    throw new Error(`settlement authoring worksheet has integrity issues: ${value.issues[0]}`)
  }
  if (!isRecord(value.manifest_draft)) {
    throw new Error('settlement authoring worksheet manifest_draft is required')
  }
  if (!isRecord(value.authoring_queue)
    || !Array.isArray(value.authoring_queue.required_staked_category_ids)
    || !Array.isArray(value.authoring_queue.expected_player_ids)) {
    throw new Error('settlement authoring worksheet decision queues are required')
  }
  const requiredStakedCategoryIds = value.authoring_queue.required_staked_category_ids
  if (requiredStakedCategoryIds.some((id) => !Number.isInteger(id))) {
    throw new Error('worksheet required staked category ids must be integers')
  }
  const expectedPlayerIds = value.authoring_queue.expected_player_ids
  if (expectedPlayerIds.some((id) => typeof id !== 'string' || !id.trim())) {
    throw new Error('worksheet expected player ids must be non-empty strings')
  }
  if (!Array.isArray(value.manifest_draft.entries)) {
    throw new Error('settlement authoring worksheet manifest entries are required')
  }
  for (const categoryId of requiredStakedCategoryIds) {
    const present = value.manifest_draft.entries.some((entry) => (
      isRecord(entry) && entry.category_id === categoryId
    ))
    if (!present) throw new Error(`manifest draft is missing required staked category ${categoryId}`)
  }
  if (!isRecord(value.manifest_draft.expected)
    || !isRecord(value.manifest_draft.expected.player_totals)) {
    throw new Error('settlement authoring worksheet manifest player_totals are required')
  }
  const expectedKeys = [...expectedPlayerIds].sort()
  const actualKeys = Object.keys(value.manifest_draft.expected.player_totals).sort()
  if (JSON.stringify(expectedKeys) !== JSON.stringify(actualKeys)) {
    throw new Error('manifest draft player_totals must use the worksheet player ids exactly')
  }
  return parseSettlementManifest(JSON.stringify(value.manifest_draft))
}
