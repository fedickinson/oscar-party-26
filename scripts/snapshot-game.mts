/**
 * snapshot-game — rolling JSON backups of the live database.
 *
 * WHY: every piece of game state lives in Supabase, and Supabase's free-tier
 * backup is daily. A bad mid-game migration or a fat-fingered DELETE during
 * the episode would otherwise be unrecoverable until tomorrow — which is to
 * say, unrecoverable. This dumps every table to timestamped JSON so the worst
 * case becomes "restore from a snapshot a few minutes old" via plain REST
 * inserts (the same pattern that archived and reseeded the Oscars data this
 * morning).
 *
 * Paginates at 1000 rows — the PostgREST default page burned us once already:
 * the first Oscars archive silently truncated messages at exactly 1000.
 *
 *   one-shot:  npx tsx scripts/snapshot-game.mts
 *   rolling:   npx tsx scripts/snapshot-game.mts --loop 300   (every 5 min)
 *
 * Snapshots land in .private/snapshots/<ISO-stamp>/ (gitignored, local disk —
 * a different failure domain from the hosted DB, which is the point).
 */

import { readFileSync, mkdirSync, writeFileSync } from 'fs'

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const pick = (k: string) =>
  env.split('\n').find((l) => l.startsWith(k + '='))!.split('=').slice(1).join('=').trim().replace(/^["']|["']$/g, '')
const URL_ = pick('VITE_SUPABASE_URL')
const KEY = pick('VITE_SUPABASE_ANON_KEY')

const TABLES = [
  'rooms', 'players', 'draft_picks', 'bingo_cards', 'bingo_marks',
  'messages', 'room_winners', 'categories', 'category_nominees',
  'signature_beats', 'beat_activations', 'confidence_picks',
  'nominees', 'draft_entities', 'bingo_squares',
]

const loopIdx = process.argv.indexOf('--loop')
const intervalS = loopIdx >= 0 ? Number(process.argv[loopIdx + 1] ?? 300) : 0

async function fetchAll(table: string): Promise<unknown[]> {
  const rows: unknown[] = []
  for (let page = 0; ; page++) {
    const res = await fetch(`${URL_}/rest/v1/${table}?select=*`, {
      headers: {
        apikey: KEY, Authorization: `Bearer ${KEY}`,
        Range: `${page * 1000}-${page * 1000 + 999}`,
      },
    })
    if (!res.ok) throw new Error(`${table}: ${res.status}`)
    const batch = (await res.json()) as unknown[]
    rows.push(...batch)
    if (batch.length < 1000) return rows
  }
}

async function snapshot() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const dir = new URL(`../.private/snapshots/${stamp}/`, import.meta.url).pathname
  mkdirSync(dir, { recursive: true })
  let total = 0
  for (const t of TABLES) {
    try {
      const rows = await fetchAll(t)
      writeFileSync(`${dir}${t}.json`, JSON.stringify(rows))
      total += rows.length
    } catch (e) {
      console.error(`  ${t}: FAILED ${String(e).slice(0, 80)}`)
    }
  }
  console.log(`[${new Date().toLocaleTimeString()}] snapshot ${stamp}: ${total} rows across ${TABLES.length} tables`)
}

if (intervalS > 0) {
  console.log(`rolling snapshots every ${intervalS}s — Ctrl-C to stop`)
  // Sequential loop, not setInterval: a slow dump must never overlap the next.
  for (;;) {
    await snapshot()
    await new Promise((r) => setTimeout(r, intervalS * 1000))
  }
} else {
  await snapshot()
}
