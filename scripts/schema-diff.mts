/**
 * Compares the local database against the live one, object by object.
 *
 * WHY THIS EXISTS
 * The baseline in supabase/migrations is reconstructed by scripts/schema-baseline.mts
 * rather than dumped with pg_dump, so "it applied without error" is not evidence
 * that local matches production — only that it is valid SQL. This asks both
 * databases the same questions and diffs the answers.
 *
 * Run it after regenerating the baseline, and any time you suspect local and
 * remote have drifted:
 *
 *   npx tsx scripts/schema-diff.mts
 *
 * Exits non-zero when they disagree, so it can gate a change.
 */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/**
 * One row per schema object, rendered identically on both sides. Ordering is
 * imposed at comparison time, not here, so the two servers cannot disagree
 * merely about sort collation.
 */
const FINGERPRINT = `
  select 'column' as kind,
         c.relname || '.' || a.attname as name,
         format_type(a.atttypid, a.atttypmod)
           || case when a.attnotnull then ' not null' else '' end
           || coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), '') as def
  from pg_attribute a
  join pg_class c     on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped

  union all
  select 'constraint', c.relname || '.' || con.conname, pg_get_constraintdef(con.oid)
  from pg_constraint con
  join pg_class c     on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'

  union all
  select 'index', tablename || '.' || indexname, indexdef
  from pg_indexes where schemaname = 'public'

  union all
  select 'rls', relname, case when relrowsecurity then 'enabled' else 'disabled' end
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'

  union all
  select 'policy', tablename || '.' || policyname,
         cmd || ' to ' || roles::text
           || coalesce(' using ' || qual, '')
           || coalesce(' check ' || with_check, '')
  from pg_policies where schemaname = 'public'

  union all
  select 'grant', table_name || '.' || grantee, privilege_type
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('anon','authenticated','service_role')

  union all
  select 'realtime', tablename, 'published'
  from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public'

  union all
  select 'enum', t.typname, string_agg(e.enumlabel, ',' order by e.enumsortorder)
  from pg_type t
  join pg_enum e      on e.enumtypid = t.oid
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public'
  group by t.typname

  union all
  select 'function', p.proname, md5(pg_get_functiondef(p.oid))
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind in ('f','p')
`

const ref = readFileSync(new URL('../supabase/.temp/project-ref', import.meta.url), 'utf8').trim()

function accessToken(): string {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN
  // The CLI keeps the token in the macOS keychain, go-keyring base64-wrapped.
  const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-a', 'access-token', '-w'], {
    encoding: 'utf8',
  }).trim()
  const prefix = 'go-keyring-base64:'
  return raw.startsWith(prefix) ? Buffer.from(raw.slice(prefix.length), 'base64').toString('utf8') : raw
}

async function remote(): Promise<Set<string>> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken()}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: FINGERPRINT }),
  })
  if (!res.ok) throw new Error(`remote query failed: ${res.status} ${await res.text()}`)
  const rows = (await res.json()) as Array<{ kind: string; name: string; def: string }>
  return new Set(rows.map((r) => `${r.kind}\t${r.name}\t${r.def ?? ''}`))
}

function local(): Set<string> {
  const container = execFileSync('docker', ['ps', '--filter', 'name=supabase_db_', '--format', '{{.Names}}'], {
    encoding: 'utf8',
  }).trim().split('\n')[0]
  if (!container) throw new Error('local stack is not running — run `supabase start` first')

  const out = execFileSync(
    'docker',
    ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-t', '-A', '-F', '\t', '-c', FINGERPRINT],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  )
  return new Set(
    out
      .split('\n')
      .map((l) => l.trimEnd())
      .filter(Boolean),
  )
}

const [remoteSet, localSet] = [await remote(), local()]

const onlyRemote = [...remoteSet].filter((r) => !localSet.has(r)).sort()
const onlyLocal = [...localSet].filter((r) => !remoteSet.has(r)).sort()

const show = (label: string, rows: string[]) => {
  if (!rows.length) return
  console.log(`\n${label} (${rows.length}):`)
  for (const r of rows.slice(0, 60)) console.log('  ' + r.replace(/\t/g, ' | '))
  if (rows.length > 60) console.log(`  ... and ${rows.length - 60} more`)
}

console.log(`remote objects: ${remoteSet.size}   local objects: ${localSet.size}`)
show('IN PRODUCTION BUT NOT LOCAL', onlyRemote)
show('IN LOCAL BUT NOT PRODUCTION', onlyLocal)

if (!onlyRemote.length && !onlyLocal.length) {
  console.log('\nIdentical. The baseline reproduces production exactly.')
  process.exit(0)
}
process.exit(1)
