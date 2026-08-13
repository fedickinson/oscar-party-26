#!/usr/bin/env -S npx tsx

/**
 * Issue or rotate the private bearer used by one room's operator review lane.
 *
 * Dry run is the default. Apply writes only a hashed capability to Postgres;
 * the raw value and phone link are saved with owner-only permissions under
 * .private/operator-capabilities/. The capability is never printed.
 */
import { existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildOperatorCapabilityLink,
  normalizeOperatorCapability,
} from '../src/lib/operator-capability'
import { supabaseConfig } from './lib/env.mts'
import { writeUtf8FileSafely } from './lib/safe-write.mts'

interface Options {
  room: string
  origin: string | null
  apply: boolean
  confirmRoom: string | null
  rotate: boolean
}

function usage(): string {
  return [
    'Usage: npx tsx scripts/issue-operator-capability.mts --room CODE',
    '  [--apply --confirm-room CODE --origin https://host.example] [--rotate]',
    '',
    'Default: local database, read-only status check.',
    'Use SUPABASE_TARGET=remote only for an explicitly authorized real room.',
  ].join('\n')
}

function parseArgs(argv: string[]): Options {
  let room = ''
  let origin: string | null = null
  let apply = false
  let confirmRoom: string | null = null
  let rotate = false

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--room') room = argv[++index] ?? ''
    else if (argument === '--origin') origin = argv[++index] ?? ''
    else if (argument === '--apply') apply = true
    else if (argument === '--confirm-room') confirmRoom = (argv[++index] ?? '').trim().toUpperCase()
    else if (argument === '--rotate') rotate = true
    else if (argument === '--help' || argument === '-h') throw new Error(usage())
    else throw new Error(`unknown argument ${argument}\n${usage()}`)
  }

  room = room.trim().toUpperCase()
  if (!/^[A-Z0-9]{4,12}$/.test(room)) {
    throw new Error(`room code must be 4 to 12 uppercase letters or numbers\n${usage()}`)
  }
  if (apply && confirmRoom !== room) {
    throw new Error(`--apply requires --confirm-room ${room}`)
  }
  if (apply && !origin) throw new Error('--apply requires --origin for the private phone link')
  if (!apply && (confirmRoom !== null || rotate || origin !== null)) {
    throw new Error('--confirm-room, --origin and --rotate are valid only with --apply')
  }
  return { room, origin, apply, confirmRoom, rotate }
}

async function request<T>(
  url: string,
  key: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  const body = await response.text()
  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${path}: ${response.status} ${body.slice(0, 500)}`)
  }
  return (body ? JSON.parse(body) : null) as T
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const config = supabaseConfig('local')
  if (!config.serviceKey) throw new Error('operator capability issuance requires a service role key')

  const rooms = await request<Array<{ id: string; code: string; host_id: string | null }>>(
    config.url,
    config.serviceKey,
    `rooms?code=eq.${encodeURIComponent(options.room)}&select=id,code,host_id`,
  )
  if (rooms.length !== 1) throw new Error(`expected one room ${options.room}, found ${rooms.length}`)
  const room = rooms[0]
  if (!room.host_id) throw new Error(`room ${options.room} has no host identity`)

  const status = await request<{ issued: boolean; generation?: number; issued_at?: string }>(
    config.url,
    config.serviceKey,
    'rpc/room_operator_capability_status',
    { method: 'POST', body: JSON.stringify({ p_room_id: room.id }) },
  )
  console.log('[operator-capability] mode=' + (options.apply ? 'apply' : 'dry-run'))
  console.log(`[operator-capability] room=${options.room} issued=${status.issued}`)
  if (!options.apply) {
    console.log('[operator-capability] no database or file write performed')
    return
  }
  if (status.issued && !options.rotate) {
    throw new Error(`room ${options.room} already has a capability; pass --rotate to invalidate it`)
  }

  const directory = resolve('.private', 'operator-capabilities')
  const tokenPath = resolve(directory, `${options.room}.token`)
  const linkPath = resolve(directory, `${options.room}.url`)
  const localFilesExist = existsSync(tokenPath) || existsSync(linkPath)
  if (localFilesExist && !options.rotate) {
    throw new Error(`local capability files already exist for ${options.room}; pass --rotate to replace them`)
  }
  mkdirSync(directory, { recursive: true })

  const issued = await request<{
    capability: string
    generation: number
    issued_at: string
    rotated: boolean
  }>(
    config.url,
    config.serviceKey,
    'rpc/issue_room_operator_capability',
    { method: 'POST', body: JSON.stringify({ p_room_id: room.id }) },
  )
  const capability = normalizeOperatorCapability(issued.capability)
  if (!capability) throw new Error('database returned an invalid operator capability')
  const link = buildOperatorCapabilityLink(options.origin!, options.room, capability)
  writeUtf8FileSafely(tokenPath, `${capability}\n`, options.rotate, 0o600)
  writeUtf8FileSafely(linkPath, `${link}\n`, options.rotate, 0o600)

  console.log(`[operator-capability] generation=${issued.generation} rotated=${issued.rotated}`)
  console.log(`[operator-capability] token_file=${tokenPath}`)
  console.log(`[operator-capability] phone_link_file=${linkPath}`)
  console.log('[operator-capability] raw capability not printed')
}

main().catch((error: unknown) => {
  console.error(`[operator-capability] ERROR: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
