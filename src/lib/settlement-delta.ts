import type {
  CategoryRow,
  NomineeRow,
  RoomSettlementEntryRow,
} from '../types/database'

export type SettlementDeltaFactDisposition =
  | 'confirmed'
  | 'changed'
  | 'added'
  | 'voided'
  | 'struck'

export interface SettlementDeltaIdentity {
  id: string
  name: string
}

export interface SettlementDeltaMarkPosition {
  card_id: string
  square_index: number
}

export type SettlementDeltaBefore =
  | { source: 'live'; categories: CategoryRow[] }
  | { source: 'settled'; entries: RoomSettlementEntryRow[] }

export interface SettlementDeltaInput {
  before: SettlementDeltaBefore
  after_entries: RoomSettlementEntryRow[]
  nominees: NomineeRow[]
  players: SettlementDeltaIdentity[]
  characters: SettlementDeltaIdentity[]
  before_player_totals: Record<string, number>
  after_player_totals: Record<string, number>
  before_character_points: Record<string, number>
  after_character_points: Record<string, number>
  before_bingo_marks: SettlementDeltaMarkPosition[]
  after_bingo_marks: SettlementDeltaMarkPosition[]
}

export interface SettlementDeltaFact {
  id: string
  disposition: SettlementDeltaFactDisposition
  before_title?: string
  after_title?: string
  before_outcome: 'resolved' | 'void' | 'absent'
  after_outcome: 'resolved' | 'void' | 'absent'
  before_winners: SettlementDeltaIdentity[]
  after_winners: SettlementDeltaIdentity[]
}

export interface SettlementDeltaValue {
  id: string
  name: string
  before: number
  after: number
  delta: number
}

export interface SettlementDeltaBingoMarks {
  before: number
  after: number
  added: number
  removed: number
  unchanged: number
}

export interface SettlementDeltaReport {
  before_source: SettlementDeltaBefore['source']
  facts: SettlementDeltaFact[]
  player_totals: SettlementDeltaValue[]
  character_points: SettlementDeltaValue[]
  bingo_marks: SettlementDeltaBingoMarks
}

interface CanonicalDeltaFact {
  id: string
  title: string
  outcome: 'resolved' | 'void'
  winners: SettlementDeltaIdentity[]
  order: number
}

function nomineeParty(
  nomineeId: string,
  nominees: Map<string, NomineeRow>,
  label: string,
): SettlementDeltaIdentity {
  const nominee = nominees.get(nomineeId)
  if (!nominee) throw new Error(`${label} references unknown nominee ${nomineeId}`)
  return { id: nominee.id, name: nominee.name }
}

function assertWinnerShape(
  outcome: 'resolved' | 'void',
  winnerId: string | null,
  tieWinnerId: string | null,
  label: string,
): void {
  if (outcome === 'resolved' && winnerId === null) {
    throw new Error(`${label} is resolved without a winner`)
  }
  if (outcome === 'void' && (winnerId !== null || tieWinnerId !== null)) {
    throw new Error(`${label} is void but has a winner`)
  }
  if (winnerId !== null && winnerId === tieWinnerId) {
    throw new Error(`${label} resolves the same winner twice`)
  }
}

function entryFact(
  entry: RoomSettlementEntryRow,
  nominees: Map<string, NomineeRow>,
  label: 'before' | 'after',
): CanonicalDeltaFact {
  const id = entry.category_id === null
    ? `entry:${entry.entry_key}`
    : `category:${entry.category_id}`
  const factLabel = `${label} fact ${id}`
  assertWinnerShape(entry.outcome, entry.winner_id, entry.tie_winner_id, factLabel)
  return {
    id,
    title: entry.name,
    outcome: entry.outcome,
    winners: [entry.winner_id, entry.tie_winner_id]
      .filter((winnerId): winnerId is string => winnerId !== null)
      .map((winnerId) => nomineeParty(winnerId, nominees, factLabel)),
    order: entry.display_order,
  }
}

function settledFacts(
  entries: RoomSettlementEntryRow[],
  nominees: Map<string, NomineeRow>,
  label: 'before' | 'after',
): CanonicalDeltaFact[] {
  const ids = new Set<string>()
  const orders = new Set<number>()
  return [...entries]
    .sort((left, right) => left.display_order - right.display_order || left.entry_key.localeCompare(right.entry_key))
    .map((entry) => {
      const fact = entryFact(entry, nominees, label)
      if (ids.has(fact.id)) throw new Error(`${label} settlement contains duplicate fact ${fact.id}`)
      ids.add(fact.id)
      if (!Number.isInteger(fact.order) || fact.order < 1) {
        throw new Error(`${label} fact ${fact.id} has invalid display order ${fact.order}`)
      }
      if (orders.has(fact.order)) {
        throw new Error(`${label} settlement contains duplicate display order ${fact.order}`)
      }
      orders.add(fact.order)
      return fact
    })
}

function liveFacts(
  categories: CategoryRow[],
  nominees: Map<string, NomineeRow>,
): CanonicalDeltaFact[] {
  const ids = new Set<number>()
  return [...categories]
    .sort((left, right) => left.display_order - right.display_order || left.id - right.id)
    .flatMap((category) => {
      if (ids.has(category.id)) throw new Error(`live record contains duplicate category ${category.id}`)
      ids.add(category.id)
      if (category.winner_id === null && category.tie_winner_id === null) return []
      const id = `category:${category.id}`
      assertWinnerShape('resolved', category.winner_id, category.tie_winner_id, `before fact ${id}`)
      return [{
        id,
        title: category.name,
        outcome: 'resolved' as const,
        winners: [category.winner_id, category.tie_winner_id]
          .filter((winnerId): winnerId is string => winnerId !== null)
          .map((winnerId) => nomineeParty(winnerId, nominees, `before fact ${id}`)),
        order: category.display_order,
      }]
    })
}

function sameFact(left: CanonicalDeltaFact, right: CanonicalDeltaFact): boolean {
  return left.title === right.title
    && left.outcome === right.outcome
    && left.winners.map((winner) => winner.id).join('\u0000')
      === right.winners.map((winner) => winner.id).join('\u0000')
}

function factDelta(
  before: CanonicalDeltaFact | undefined,
  after: CanonicalDeltaFact | undefined,
): SettlementDeltaFact {
  if (!before && !after) throw new Error('settlement delta fact needs a before or after value')
  let disposition: SettlementDeltaFactDisposition
  if (!after) disposition = 'struck'
  else if (after.outcome === 'void') {
    disposition = before && sameFact(before, after) ? 'confirmed' : 'voided'
  } else if (!before) disposition = 'added'
  else disposition = sameFact(before, after) ? 'confirmed' : 'changed'
  return {
    id: (after ?? before)!.id,
    disposition,
    ...(before === undefined ? {} : { before_title: before.title }),
    ...(after === undefined ? {} : { after_title: after.title }),
    before_outcome: before?.outcome ?? 'absent',
    after_outcome: after?.outcome ?? 'absent',
    before_winners: before?.winners.map((winner) => ({ ...winner })) ?? [],
    after_winners: after?.winners.map((winner) => ({ ...winner })) ?? [],
  }
}

function assertNamedIdentities(
  identities: SettlementDeltaIdentity[],
  label: string,
): Map<string, SettlementDeltaIdentity> {
  const result = new Map<string, SettlementDeltaIdentity>()
  for (const identity of identities) {
    if (!identity.id || !identity.name.trim()) throw new Error(`${label} contains an invalid identity`)
    if (result.has(identity.id)) throw new Error(`${label} contains duplicate identity ${identity.id}`)
    result.set(identity.id, identity)
  }
  return result
}

function assertLedger(
  ledger: Record<string, number>,
  identities: Map<string, SettlementDeltaIdentity>,
  label: string,
  complete: boolean,
): void {
  for (const [id, value] of Object.entries(ledger)) {
    if (!identities.has(id)) throw new Error(`${label} reference unknown identity ${id}`)
    if (!Number.isInteger(value)) throw new Error(`${label} value for ${id} must be an integer`)
  }
  if (complete) {
    const missing = [...identities.keys()].find((id) => !(id in ledger))
    if (missing) throw new Error(`${label} are missing identity ${missing}`)
  }
}

function namedDeltas(
  identitiesInput: SettlementDeltaIdentity[],
  before: Record<string, number>,
  after: Record<string, number>,
  label: string,
  complete: boolean,
  omitZeroRows: boolean,
): SettlementDeltaValue[] {
  const identities = assertNamedIdentities(identitiesInput, label)
  assertLedger(before, identities, `before ${label}`, complete)
  assertLedger(after, identities, `after ${label}`, complete)
  const rows = [...identities.values()].map((identity) => {
    const beforeValue = before[identity.id] ?? 0
    const afterValue = after[identity.id] ?? 0
    return {
      ...identity,
      before: beforeValue,
      after: afterValue,
      delta: afterValue - beforeValue,
    }
  }).filter((row) => !omitZeroRows || row.before !== 0 || row.after !== 0)
  return rows.sort((left, right) => (
    omitZeroRows
      ? Math.abs(right.delta) - Math.abs(left.delta) || left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
      : left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
  ))
}

function markSet(
  marks: SettlementDeltaMarkPosition[],
  label: string,
): Set<string> {
  const result = new Set<string>()
  for (const mark of marks) {
    if (!mark.card_id || !Number.isInteger(mark.square_index) || mark.square_index < 0 || mark.square_index > 24) {
      throw new Error(`${label} contain invalid position ${mark.card_id}:${mark.square_index}`)
    }
    const key = `${mark.card_id}:${mark.square_index}`
    if (result.has(key)) throw new Error(`${label} contain duplicate position ${key}`)
    result.add(key)
  }
  return result
}

export function buildSettlementDeltaReport(input: SettlementDeltaInput): SettlementDeltaReport {
  const nomineeMap = new Map(input.nominees.map((nominee) => [nominee.id, nominee]))
  if (nomineeMap.size !== input.nominees.length) throw new Error('nominees contain duplicate identities')
  const beforeFacts = input.before.source === 'live'
    ? liveFacts(input.before.categories, nomineeMap)
    : settledFacts(input.before.entries, nomineeMap, 'before')
  const afterFacts = settledFacts(input.after_entries, nomineeMap, 'after')
  const beforeById = new Map(beforeFacts.map((fact) => [fact.id, fact]))
  const afterIds = new Set(afterFacts.map((fact) => fact.id))
  const facts = [
    ...afterFacts.map((fact) => factDelta(beforeById.get(fact.id), fact)),
    ...beforeFacts.filter((fact) => !afterIds.has(fact.id)).map((fact) => factDelta(fact, undefined)),
  ]

  const beforeMarks = markSet(input.before_bingo_marks, 'before bingo marks')
  const afterMarks = markSet(input.after_bingo_marks, 'after bingo marks')
  const unchanged = [...beforeMarks].filter((mark) => afterMarks.has(mark)).length

  return {
    before_source: input.before.source,
    facts,
    player_totals: namedDeltas(
      input.players,
      input.before_player_totals,
      input.after_player_totals,
      'player totals',
      true,
      false,
    ),
    character_points: namedDeltas(
      input.characters,
      input.before_character_points,
      input.after_character_points,
      'character points',
      false,
      true,
    ),
    bingo_marks: {
      before: beforeMarks.size,
      after: afterMarks.size,
      added: afterMarks.size - unchanged,
      removed: beforeMarks.size - unchanged,
      unchanged,
    },
  }
}

function outcomeLabel(
  outcome: SettlementDeltaFact['before_outcome'] | SettlementDeltaFact['after_outcome'],
  winners: SettlementDeltaIdentity[],
  ambiguousNames: Set<string>,
): string {
  if (outcome === 'absent') return 'absent'
  if (outcome === 'void') return 'void'
  return winners.map((winner) => (
    ambiguousNames.has(winner.name) ? `${winner.name} (${winner.id})` : winner.name
  )).join(' + ')
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value)
}

function ambiguousIdentityNames(identities: SettlementDeltaIdentity[]): Set<string> {
  const idsByName = new Map<string, Set<string>>()
  for (const identity of identities) {
    const ids = idsByName.get(identity.name) ?? new Set<string>()
    ids.add(identity.id)
    idsByName.set(identity.name, ids)
  }
  return new Set(
    [...idsByName].filter(([, ids]) => ids.size > 1).map(([name]) => name),
  )
}

function displayIdentity(identity: SettlementDeltaIdentity, ambiguousNames: Set<string>): string {
  return ambiguousNames.has(identity.name) ? `${identity.name} (${identity.id})` : identity.name
}

export function formatSettlementDeltaReport(report: SettlementDeltaReport): string[] {
  const dispositions: SettlementDeltaFactDisposition[] = [
    'confirmed',
    'changed',
    'added',
    'voided',
    'struck',
  ]
  const counts = Object.fromEntries(dispositions.map((disposition) => [
    disposition,
    report.facts.filter((fact) => fact.disposition === disposition).length,
  ]))
  const lines = [
    `settlement delta (before=${report.before_source})`,
    `facts: ${dispositions.map((disposition) => `${disposition}=${counts[disposition]}`).join(' ')}`,
  ]
  const factNameAmbiguities = ambiguousIdentityNames(report.facts.flatMap((fact) => [
    ...fact.before_winners,
    ...fact.after_winners,
  ]))
  for (const fact of report.facts) {
    const title = fact.before_title && fact.after_title && fact.before_title !== fact.after_title
      ? `${fact.before_title} -> ${fact.after_title}`
      : (fact.after_title ?? fact.before_title as string)
    lines.push(
      `  [${fact.disposition}] ${title}: ${outcomeLabel(fact.before_outcome, fact.before_winners, factNameAmbiguities)} -> ${outcomeLabel(fact.after_outcome, fact.after_winners, factNameAmbiguities)}`,
    )
  }
  const playerNameAmbiguities = ambiguousIdentityNames(report.player_totals)
  lines.push('player totals:')
  lines.push(...(report.player_totals.length
    ? report.player_totals.map((row) => `  ${displayIdentity(row, playerNameAmbiguities)}: ${row.before} -> ${row.after} (${signed(row.delta)})`)
    : ['  none']))
  const characterNameAmbiguities = ambiguousIdentityNames(report.character_points)
  lines.push('character points:')
  lines.push(...(report.character_points.length
    ? report.character_points.map((row) => `  ${displayIdentity(row, characterNameAmbiguities)}: ${row.before} -> ${row.after} (${signed(row.delta)})`)
    : ['  none']))
  lines.push(
    `bingo marks: ${report.bingo_marks.before} -> ${report.bingo_marks.after} (+${report.bingo_marks.added} added, -${report.bingo_marks.removed} removed, ${report.bingo_marks.unchanged} unchanged)`,
  )
  return lines
}
