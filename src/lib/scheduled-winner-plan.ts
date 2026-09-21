/**
 * scheduled-winner-plan.ts — pure resolution and planning for a batch of
 * scheduled winner declarations supplied as an authored, closed list.
 *
 * WHY THIS EXISTS
 * Results Night assumes the host declares each category as the broadcast hands
 * it over: open the spotlight, tap the nominee, confirm, close. That is the
 * right shape for a live envelope and the wrong shape for the tail of the
 * night, when the rest of the slate arrives at once as a single social post.
 * Ten declarations typed into a phone at the end of a long night is where the
 * expensive mistakes live, and the scheduled undo posts no chat correction, so
 * a mis-tap is silent until someone notices the leaderboard.
 *
 * So the operator authors the list once, where it can be read and checked
 * against the official post, and this module turns that list into an exact,
 * ordered plan or into refusals. Nothing here talks to a database: the script
 * supplies the room, the pack-owned slate, the candidate links and the winners
 * already recorded, and gets back either every declaration in input order or
 * every reason the batch cannot be trusted.
 *
 * FAIL CLOSED, AS A BATCH
 * A single unresolvable entry refuses the whole list. Declaring the nine
 * entries that did resolve and leaving the tenth for later would produce
 * exactly the half-finished, out-of-order state this command exists to avoid,
 * and the operator would have to reconstruct which ones landed.
 *
 * CATEGORY SCOPE
 * Only pack-owned rows resolve — `show_pack_id` set to the room's pack and no
 * `room_id`. That is not a preference: `declare_scheduled_winner` rejects
 * anything else, and a room-owned Story Night declaration row can legitimately
 * share a title with a pack category.
 */

export interface ScheduledWinnerEntry {
  /** Exact category title as the pack authored it. */
  category: string
  /** Artist id, pack key, or exact display name. */
  winner: string
  /** URL of the official post the result came from. */
  source: string
}

export interface ScheduledWinnerRoom {
  code: string
  phase: string
  game_model: string | null
  show_pack_id: string | null
}

export interface ScheduledWinnerCategory {
  id: number
  name: string
  show_pack_id?: string | null
  room_id?: string | null
}

export interface ScheduledWinnerNominee {
  id: string
  name: string
  pack_key?: string | null
}

export interface ScheduledWinnerCandidate {
  category_id: number
  nominee_id: string
}

export interface ScheduledWinnerDeclared {
  category_id: number
  winner_id: string
  tie_winner_id?: string | null
}

export interface ScheduledWinnerCatalog {
  room: ScheduledWinnerRoom
  categories: ScheduledWinnerCategory[]
  nominees: ScheduledWinnerNominee[]
  candidates: ScheduledWinnerCandidate[]
  declared: ScheduledWinnerDeclared[]
}

export interface PlannedScheduledWinner {
  /** 1-based position in the authored input, which is also the apply order. */
  order: number
  category_id: number
  category_name: string
  winner_id: string
  winner_name: string
  source: string
  announcement: string
}

export interface ScheduledWinnerPlan {
  declarations: PlannedScheduledWinner[]
  failures: string[]
}

export interface ScheduledWinnerEntryRead {
  entries: ScheduledWinnerEntry[]
  failures: string[]
}

/** The only keys an authored entry may carry. */
const ENTRY_KEYS = ['category', 'winner', 'source'] as const

function fold(value: string): string {
  return value.trim().toLowerCase()
}

/** Names an entry the way the operator will find it in their own file. */
function label(index: number, title: string | null): string {
  return title ? `entry ${index + 1} ("${title}")` : `entry ${index + 1}`
}

function isHttpUrl(value: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    return false
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:'
}

/**
 * Validates the authored document shape without touching the room catalog, so
 * a malformed file is refused before any database read happens.
 */
export function readScheduledWinnerEntries(document: unknown): ScheduledWinnerEntryRead {
  if (document === null || typeof document !== 'object' || Array.isArray(document)) {
    return { entries: [], failures: ['input must be a JSON object with a "declarations" array'] }
  }
  const raw = (document as Record<string, unknown>).declarations
  if (!Array.isArray(raw)) {
    return { entries: [], failures: ['input must be a JSON object with a "declarations" array'] }
  }
  if (raw.length === 0) {
    return { entries: [], failures: ['input declares nothing; add at least one entry'] }
  }

  const failures: string[] = []
  const entries: ScheduledWinnerEntry[] = []

  raw.forEach((candidate, index) => {
    if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
      failures.push(`${label(index, null)} is not an object`)
      return
    }
    const record = candidate as Record<string, unknown>
    const title = typeof record.category === 'string' && record.category.trim()
      ? record.category.trim()
      : null

    for (const key of Object.keys(record)) {
      if (!(ENTRY_KEYS as readonly string[]).includes(key)) {
        failures.push(
          `${label(index, title)} has an unexpected key "${key}"; ` +
            'an entry carries only category, winner and source',
        )
      }
    }
    if (!title) {
      failures.push(`${label(index, null)} has no category title`)
    }
    const winner = typeof record.winner === 'string' ? record.winner.trim() : ''
    if (!winner) {
      failures.push(`${label(index, title)} has no winner`)
    }
    const source = typeof record.source === 'string' ? record.source.trim() : ''
    if (!source) {
      failures.push(
        `${label(index, title)} has no source URL; ` +
          'every declaration must cite the official post it came from',
      )
    } else if (!isHttpUrl(source)) {
      failures.push(`${label(index, title)} source is not an http or https URL: "${source}"`)
    }
    if (title && winner && source && isHttpUrl(source)) {
      entries.push({ category: title, winner, source })
    }
  })

  return { entries: failures.length ? [] : entries, failures }
}

export function composeScheduledWinnerAnnouncement(input: {
  categoryName: string
  winnerName: string
  /** Who published the result, named in the room's own words. */
  authority: string
  source: string
}): string {
  return `Winner — ${input.winnerName} · ${input.categoryName} · ` +
    `declared from ${input.authority}: ${input.source}`
}

function describeDeclaredWinner(
  declared: ScheduledWinnerDeclared,
  nameById: Map<string, string>,
): string {
  const winner = nameById.get(declared.winner_id) ?? declared.winner_id
  const tie = declared.tie_winner_id
    ? nameById.get(declared.tie_winner_id) ?? declared.tie_winner_id
    : null
  return tie ? `${winner} and ${tie}` : winner
}

/**
 * Turns authored entries plus the room's own catalog into an ordered plan, or
 * into every reason the batch is refused. Never partially succeeds.
 */
export function buildScheduledWinnerPlan(input: ScheduledWinnerCatalog & {
  entries: ScheduledWinnerEntry[]
  authority: string
}): ScheduledWinnerPlan {
  const { room, entries, authority } = input
  const failures: string[] = []

  if (room.phase !== 'live') {
    failures.push(
      `room ${room.code} is ${room.phase}, not live; ` +
        'a scheduled winner may be declared only on a live floor',
    )
  }
  if (room.game_model !== 'legacy_ensemble') {
    failures.push(
      `room ${room.code} uses game model ${room.game_model ?? 'none'}, not legacy_ensemble; ` +
        'it has no scheduled winner slate',
    )
  }
  if (failures.length) return { declarations: [], failures }

  const packCategories = input.categories.filter((category) => (
    category.show_pack_id != null
    && category.show_pack_id === room.show_pack_id
    && category.room_id == null
  ))
  const categoriesByTitle = new Map<string, ScheduledWinnerCategory[]>()
  for (const category of packCategories) {
    const key = fold(category.name)
    const bucket = categoriesByTitle.get(key)
    if (bucket) bucket.push(category)
    else categoriesByTitle.set(key, [category])
  }

  const nomineeById = new Map(input.nominees.map((nominee) => [nominee.id, nominee]))
  const nameById = new Map(input.nominees.map((nominee) => [nominee.id, nominee.name]))
  const candidatesByCategory = new Map<number, string[]>()
  for (const candidate of input.candidates) {
    const bucket = candidatesByCategory.get(candidate.category_id)
    if (bucket) bucket.push(candidate.nominee_id)
    else candidatesByCategory.set(candidate.category_id, [candidate.nominee_id])
  }
  const declaredByCategory = new Map(
    input.declared.map((winner) => [winner.category_id, winner]),
  )

  const declarations: PlannedScheduledWinner[] = []
  /** Resolved category id -> the entry position that already claimed it. */
  const claimedCategories = new Map<number, number>()
  const claimedTitles = new Map<string, number>()

  entries.forEach((entry, index) => {
    const named = label(index, entry.category)
    const titleKey = fold(entry.category)

    const priorTitle = claimedTitles.get(titleKey)
    if (priorTitle !== undefined) {
      failures.push(`${named} repeats the category already declared by entry ${priorTitle + 1}`)
      return
    }
    claimedTitles.set(titleKey, index)

    const matches = categoriesByTitle.get(titleKey) ?? []
    if (matches.length === 0) {
      failures.push(`${named} matches no pack-owned category in room ${room.code}`)
      return
    }
    if (matches.length > 1) {
      failures.push(
        `${named} matches ${matches.length} pack-owned categories ` +
          `(ids ${matches.map((match) => match.id).join(', ')}); the slate title is not unique`,
      )
      return
    }
    const category = matches[0]

    const priorCategory = claimedCategories.get(category.id)
    if (priorCategory !== undefined) {
      failures.push(`${named} repeats the category already declared by entry ${priorCategory + 1}`)
      return
    }
    claimedCategories.set(category.id, index)

    const already = declaredByCategory.get(category.id)
    if (already) {
      failures.push(
        `${named} already has a declared winner: ${describeDeclaredWinner(already, nameById)}; ` +
          'undo it from the phone before declaring it again',
      )
      return
    }

    const candidateIds = candidatesByCategory.get(category.id) ?? []
    const candidates = candidateIds
      .map((id) => nomineeById.get(id))
      .filter((nominee): nominee is ScheduledWinnerNominee => nominee != null)

    // Identity first: an id or a pack key is exact and cannot collide with a
    // stage name two different artists both use.
    const wanted = entry.winner.trim()
    const byIdentity = candidates.filter((nominee) => (
      nominee.id === wanted || (nominee.pack_key != null && nominee.pack_key === wanted)
    ))
    const resolved = byIdentity.length > 0
      ? byIdentity
      : candidates.filter((nominee) => fold(nominee.name) === fold(wanted))

    if (resolved.length === 0) {
      failures.push(
        `${named} names winner "${entry.winner}", which is not a candidate in that category`,
      )
      return
    }
    if (resolved.length > 1) {
      failures.push(
        `${named} names winner "${entry.winner}", which matches ${resolved.length} candidates ` +
          `(${resolved.map((nominee) => nominee.id).join(', ')}); use the artist id or pack key`,
      )
      return
    }
    const winner = resolved[0]

    declarations.push({
      order: index + 1,
      category_id: category.id,
      category_name: category.name,
      winner_id: winner.id,
      winner_name: winner.name,
      source: entry.source,
      announcement: composeScheduledWinnerAnnouncement({
        categoryName: category.name,
        winnerName: winner.name,
        authority,
        source: entry.source,
      }),
    })
  })

  return { declarations: failures.length ? [] : declarations, failures }
}

/**
 * The dry-run table, in input order. Returned as lines so the caller owns the
 * stream and the test owns the exact text.
 */
export function formatScheduledWinnerPlanTable(
  declarations: PlannedScheduledWinner[],
): string[] {
  const rows = declarations.map((declaration) => [
    String(declaration.order),
    declaration.category_name,
    declaration.winner_name,
    declaration.source,
  ])
  const header = ['#', 'CATEGORY', 'WINNER', 'SOURCE']
  const widths = header.map((cell, column) => Math.max(
    cell.length,
    ...rows.map((row) => row[column].length),
    0,
  ))
  return [header, ...rows].map((row) => row
    .map((cell, column) => (column === row.length - 1 ? cell : cell.padEnd(widths[column])))
    .join('  ')
    .trimEnd())
}
