#!/usr/bin/env -S npx tsx

/**
 * declare-scheduled-winners — declare a batch of post-broadcast results from an
 * authored list, one at a time, from the laptop.
 *
 * WHY THIS EXISTS
 * Roughly half of a VMA slate is never handed out on camera; it arrives as one
 * social post after the telecast (OPERATOR-CHECKLIST section 4.7, BRIEF D2).
 * Doing that from the phone means opening a spotlight and tapping through ten
 * or more declarations at the end of a long night, and a mistaken scheduled
 * declaration posts no chat correction when it is undone. So the operator
 * writes the list down first, where it can be read against MTV's own post, and
 * this command resolves it against the room's catalog before anything is
 * written.
 *
 * WHAT IT DOES NOT DO
 * It never opens or closes a spotlight, never touches bingo, signature beats or
 * the room phase, and never declares a tie — a tie is unusual enough to belong
 * on the phone, where the app asks for it separately. Closing the floor stays a
 * separate, deliberate host action.
 *
 * Dry run is the default and writes nothing. Applying requires the room code
 * twice and declares strictly in input order, pausing between declarations so
 * the cast daemon's staggered reactions stay legible instead of arriving as a
 * wall of chat. The first failure stops the run and the report names exactly
 * which entries were declared and which were not.
 *
 *   npx tsx scripts/declare-scheduled-winners.mts --room CODE --input winners.json
 *   npx tsx scripts/declare-scheduled-winners.mts --room CODE --input winners.json \
 *     --apply --confirm-room CODE --pause-seconds 60
 *
 * winners.json is a closed list:
 *   {"declarations":[{"category":"Best Pop","winner":"Ava Vale","source":"https://..."}]}
 *
 * Local by default, like every command that writes. Production requires an
 * explicit SUPABASE_TARGET=remote as well as the double confirmation.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildScheduledWinnerPlan,
  formatScheduledWinnerPlanTable,
  readScheduledWinnerEntries,
  type PlannedScheduledWinner,
  type ScheduledWinnerCandidate,
  type ScheduledWinnerCategory,
  type ScheduledWinnerDeclared,
  type ScheduledWinnerNominee,
  type ScheduledWinnerRoom,
} from '../src/lib/scheduled-winner-plan'
import { supabaseConfig } from './lib/env.mts'
import { readRoomOperatorCapability } from './lib/operator-room-read.mts'

/**
 * Who published the results this command declares from. Show-specific copy
 * lives here, not in the engine; the announcement text is otherwise the same
 * shape the phone writes when a winner lands.
 */
const DECLARATION_AUTHORITY = "MTV's official post"

const LOG = '[scheduled-winners]'

interface Options {
  room: string
  input: string
  apply: boolean
  confirmRoom: string | null
  pauseSeconds: number
}

function usage(): string {
  return [
    'Usage: npx tsx scripts/declare-scheduled-winners.mts --room CODE --input winners.json',
    '  [--apply --confirm-room CODE] [--pause-seconds 20]',
    '',
    'Default: local database, dry run, no rows written.',
    'Use SUPABASE_TARGET=remote only for an explicitly authorized real room.',
  ].join('\n')
}

function parseArgs(argv: string[]): Options {
  let room = ''
  let input = ''
  let apply = false
  let confirmRoom: string | null = null
  let pauseSeconds = 20

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--room') room = argv[++index] ?? ''
    else if (argument === '--input') input = argv[++index] ?? ''
    else if (argument === '--apply') apply = true
    else if (argument === '--confirm-room') confirmRoom = (argv[++index] ?? '').trim().toUpperCase()
    else if (argument === '--pause-seconds') {
      // Number('') is 0, which would silently pass validation and remove the
      // pacing; a missing value is refused before it can become a number.
      const raw = argv[++index]
      if (raw === undefined || raw.trim() === '') {
        throw new Error('--pause-seconds requires a value (whole seconds, 0 to 600)')
      }
      pauseSeconds = Number(raw)
    }
    else if (argument === '--help' || argument === '-h') throw new Error(usage())
    else throw new Error(`unknown argument ${argument}\n${usage()}`)
  }

  room = room.trim().toUpperCase()
  if (!/^[A-Z0-9]{4,12}$/.test(room)) {
    throw new Error(`room code must be 4 to 12 uppercase letters or numbers\n${usage()}`)
  }
  if (!input) throw new Error(`--input is required\n${usage()}`)
  if (!Number.isInteger(pauseSeconds) || pauseSeconds < 0 || pauseSeconds > 600) {
    throw new Error('--pause-seconds must be a whole number of seconds between 0 and 600')
  }
  if (apply && confirmRoom !== room) throw new Error(`--apply requires --confirm-room ${room}`)
  if (!apply && confirmRoom !== null) throw new Error('--confirm-room is valid only with --apply')
  return { room, input: resolve(input), apply, confirmRoom, pauseSeconds }
}

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms))
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))

  // Read and validate the authored file before touching any database, so a
  // malformed list is refused without a connection and without a write.
  let document: unknown
  try {
    document = JSON.parse(readFileSync(options.input, 'utf8'))
  } catch (error) {
    throw new Error(
      `could not read ${options.input}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  const { entries, failures: readFailures } = readScheduledWinnerEntries(document)
  if (readFailures.length) {
    for (const failure of readFailures) console.error(`${LOG} REFUSED ${failure}`)
    throw new Error(`${readFailures.length} problem(s) in ${options.input}; nothing was written`)
  }

  const config = supabaseConfig('local')
  console.log(`${LOG} target=${config.target}`)
  console.log(`${LOG} mode=${options.apply ? 'apply' : 'dry-run'}`)
  console.log(`${LOG} room=${options.room} input=${options.input} entries=${entries.length}`)
  console.log(`${LOG} pause_seconds=${options.pauseSeconds}`)

  const readKey = config.anonKey
  async function request(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await fetch(`${config.url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: readKey,
        Authorization: `Bearer ${readKey}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
        ...(init.headers ?? {}),
      },
    })
    const body = await response.text()
    if (!response.ok) {
      throw new Error(`${init.method ?? 'GET'} ${path}: ${response.status} ${body.slice(0, 500)}`)
    }
    return body ? JSON.parse(body) : null
  }

  /** Exhausts a deterministically ordered PostgREST query, page by page. */
  async function rows<Row>(path: string): Promise<Row[]> {
    const pageSize = 1000
    const collected: Row[] = []
    for (let from = 0; ; from += pageSize) {
      const page = await request(path, {
        headers: { 'Range-Unit': 'items', Range: `${from}-${from + pageSize - 1}` },
      }) as Row[]
      collected.push(...page)
      if (page.length < pageSize) return collected
    }
  }

  const roomRows = await rows<ScheduledWinnerRoom & { id: string; host_id: string | null }>(
    `rooms?code=eq.${encodeURIComponent(options.room)}` +
      '&select=id,code,phase,game_model,show_pack_id,host_id',
  )
  if (roomRows.length !== 1) {
    throw new Error(`expected one room ${options.room}, found ${roomRows.length}`)
  }
  const room = roomRows[0]
  if (!room.show_pack_id) throw new Error(`room ${options.room} has no show-pack binding`)

  const [categories, nominees, declared] = await Promise.all([
    rows<ScheduledWinnerCategory>(
      `categories?show_pack_id=eq.${room.show_pack_id}&room_id=is.null` +
        '&select=id,name,show_pack_id,room_id&order=display_order.asc,id.asc',
    ),
    rows<ScheduledWinnerNominee>(
      `nominees?show_pack_id=eq.${room.show_pack_id}&select=id,name,pack_key&order=id.asc`,
    ),
    rows<ScheduledWinnerDeclared>(
      `room_winners?room_id=eq.${room.id}` +
        '&select=category_id,winner_id,tie_winner_id&order=category_id.asc',
    ),
  ])

  const candidates: ScheduledWinnerCandidate[] = []
  const categoryIds = categories.map((category) => category.id)
  for (let index = 0; index < categoryIds.length; index += 100) {
    const ids = categoryIds.slice(index, index + 100).join(',')
    candidates.push(...await rows<ScheduledWinnerCandidate>(
      `category_nominees?category_id=in.(${ids})` +
        '&select=category_id,nominee_id&order=category_id.asc,nominee_id.asc',
    ))
  }
  console.log(
    `${LOG} slate=${categories.length} candidates=${candidates.length} already_declared=${declared.length}`,
  )

  const plan = buildScheduledWinnerPlan({
    room,
    categories,
    nominees,
    candidates,
    declared,
    entries,
    authority: DECLARATION_AUTHORITY,
  })
  if (plan.failures.length) {
    for (const failure of plan.failures) console.error(`${LOG} REFUSED ${failure}`)
    throw new Error(
      `${plan.failures.length} entr${plan.failures.length === 1 ? 'y' : 'ies'} could not be ` +
        'resolved; nothing was written',
    )
  }

  for (const line of formatScheduledWinnerPlanTable(plan.declarations)) console.log(`  ${line}`)

  if (!options.apply) {
    console.log(`${LOG} dry run only; ${plan.declarations.length} declaration(s) planned, no rows written`)
    return
  }

  if (!room.host_id) throw new Error(`room ${options.room} has no host identity to declare as`)
  const capability = readRoomOperatorCapability(options.room)
  if (!capability) {
    throw new Error(
      `no operator capability for ${options.room}; set ROOM_OPERATOR_CAPABILITY or issue one ` +
        'with scripts/issue-operator-capability.mts',
    )
  }
  console.log(`${LOG} capability=loaded`)

  const declaredNow: PlannedScheduledWinner[] = []
  let stoppedAt: PlannedScheduledWinner | null = null
  let failure: string | null = null

  for (const declaration of plan.declarations) {
    if (declaredNow.length > 0 && options.pauseSeconds > 0) {
      console.log(`${LOG} pausing ${options.pauseSeconds}s before entry ${declaration.order}`)
      await sleep(options.pauseSeconds * 1000)
    }
    try {
      // The same capability-gated, room-locked command the phone calls. The
      // database owns host identity, the live check, the pack-owned category,
      // the candidate link and the confidence projection.
      await request('rpc/declare_scheduled_winner_authorized', {
        method: 'POST',
        body: JSON.stringify({
          p_room_id: room.id,
          p_category_id: declaration.category_id,
          p_winner_id: declaration.winner_id,
          p_tie_winner_id: null,
          p_actor_player_id: room.host_id,
          p_operator_capability: capability,
        }),
      })
    } catch (error) {
      stoppedAt = declaration
      failure = error instanceof Error ? error.message : String(error)
      break
    }

    declaredNow.push(declaration)
    console.log(
      `${LOG} declared ${declaration.order}/${plan.declarations.length} ` +
        `"${declaration.category_name}" -> ${declaration.winner_name}`,
    )

    try {
      // The room hears the result the way it hears a live declaration, with
      // the post it came from named in the same line.
      await request('messages', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          room_id: room.id,
          player_id: 'winner-divider',
          text: declaration.announcement,
        }),
      })
    } catch (error) {
      stoppedAt = null
      failure = `the winner was declared but its announcement could not be posted: ${
        error instanceof Error ? error.message : String(error)
      }`
      break
    }
  }

  console.log(`${LOG} declared=${declaredNow.length}/${plan.declarations.length}`)
  for (const declaration of declaredNow) {
    console.log(`${LOG} DONE ${declaration.order} "${declaration.category_name}" -> ${declaration.winner_name}`)
  }
  const remaining = plan.declarations.filter((declaration) => !declaredNow.includes(declaration))
  for (const declaration of remaining) {
    console.log(
      `${LOG} NOT DECLARED ${declaration.order} "${declaration.category_name}" ` +
        `-> ${declaration.winner_name}`,
    )
  }
  if (failure) {
    const where = stoppedAt
      ? `entry ${stoppedAt.order} ("${stoppedAt.category_name}") failed: ${failure}`
      : failure
    throw new Error(`${where}; the remaining entries were not attempted`)
  }
}

main().catch((error: unknown) => {
  console.error(`${LOG} ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
