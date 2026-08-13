#!/usr/bin/env -S npx tsx

/**
 * Generates the additive migration that installs the repo-reviewed doctrine
 * for every legacy signature beat. The authoring artifact remains canonical;
 * stable legacy beat IDs are the migration bridge.
 *
 *   npx tsx scripts/generate-legacy-signature-doctrine-migration.mts
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const authoringPath = join(root, 'show-packs/research/hotd-s3-finale-authoring.json')
const outputPath = join(
  root,
  'supabase/migrations/20260812062700_install_legacy_signature_doctrine.sql',
)

type SignatureBeat = {
  legacy_signature_beat_id: number
  legacy_record: { title: string; trigger_text: string }
  contract: Record<string, unknown> | null
}

const authoring = JSON.parse(readFileSync(authoringPath, 'utf8')) as {
  signature_beats?: SignatureBeat[]
}
const beats = authoring.signature_beats ?? []
const ids = new Set(beats.map((beat) => beat.legacy_signature_beat_id))
if (beats.length !== 275 || ids.size !== 275) {
  throw new Error('legacy authoring must contain exactly 275 unique signature beats')
}
if (beats.some((beat) => beat.contract === null
  || beat.contract.condition !== beat.legacy_record.trigger_text)) {
  throw new Error('every legacy signature beat needs an exact reviewed contract')
}
const checkOnly = process.argv.includes('--check')
const unexpectedArgs = process.argv.slice(2).filter((arg) => arg !== '--check')
if (unexpectedArgs.length > 0) throw new Error(`unknown argument ${unexpectedArgs[0]}`)

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`
const values = beats
  .sort((left, right) => left.legacy_signature_beat_id - right.legacy_signature_beat_id)
  .map((beat) => {
    const contract = { title: beat.legacy_record.title, ...beat.contract }
    return `  (${beat.legacy_signature_beat_id}, ${quote(JSON.stringify(contract))}::jsonb)`
  })
  .join(',\n')

const sql = `-- Install the 275/275 reviewed signature-beat contracts from the canonical
-- legacy authoring artifact. The private mapping also fills future local seed
-- inserts, because migrations run before supabase/seed.sql on a clean reset.

create table if not exists private.legacy_signature_beat_doctrine (
  legacy_signature_beat_id integer primary key,
  trigger_contract jsonb not null
    check (public.trigger_contract_is_valid(trigger_contract))
);

revoke all on private.legacy_signature_beat_doctrine from public, anon, authenticated;

insert into private.legacy_signature_beat_doctrine (
  legacy_signature_beat_id,
  trigger_contract
) values
${values}
on conflict (legacy_signature_beat_id) do update
set trigger_contract = excluded.trigger_contract;

create or replace function private.fill_legacy_signature_beat_doctrine()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  if new.show_pack_id = '8f27e9a4-9f6b-4f3a-9c91-a6b862c98101'::uuid
     and new.trigger_contract is null then
    select doctrine.trigger_contract into new.trigger_contract
    from private.legacy_signature_beat_doctrine doctrine
    where doctrine.legacy_signature_beat_id = new.id;
    if new.trigger_contract is null then
      raise exception 'legacy signature beat % has no reviewed doctrine', new.id
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.fill_legacy_signature_beat_doctrine()
  from public, anon, authenticated;

drop trigger if exists aaa_fill_legacy_signature_beat_doctrine
  on public.signature_beats;
create trigger aaa_fill_legacy_signature_beat_doctrine
before insert or update of trigger_contract, show_pack_id
on public.signature_beats
for each row execute function private.fill_legacy_signature_beat_doctrine();

-- This is an explicit database-owner catalog migration. Ordinary service and
-- browser writes remain blocked by the immutability trigger before and after.
alter table public.signature_beats disable trigger lock_show_pack_catalog_write;
update public.signature_beats beat
set trigger_contract = doctrine.trigger_contract
from private.legacy_signature_beat_doctrine doctrine
where beat.show_pack_id = '8f27e9a4-9f6b-4f3a-9c91-a6b862c98101'::uuid
  and beat.id = doctrine.legacy_signature_beat_id
  and beat.trigger_contract is distinct from doctrine.trigger_contract;
alter table public.signature_beats enable trigger lock_show_pack_catalog_write;

do $$
declare
  v_catalog_count integer;
begin
  if (select count(*) from private.legacy_signature_beat_doctrine) <> 275 then
    raise exception 'legacy signature doctrine mapping is incomplete'
      using errcode = '23514';
  end if;
  select count(*) into v_catalog_count
  from public.signature_beats
  where show_pack_id = '8f27e9a4-9f6b-4f3a-9c91-a6b862c98101'::uuid;
  if v_catalog_count > 0 and (
    select count(*) from public.signature_beats
    where show_pack_id = '8f27e9a4-9f6b-4f3a-9c91-a6b862c98101'::uuid
      and public.trigger_contract_is_valid(trigger_contract)
  ) <> v_catalog_count then
    raise exception 'installed legacy signature doctrine is incomplete'
      using errcode = '23514';
  end if;
end;
$$;

comment on table private.legacy_signature_beat_doctrine is
  'Repo-reviewed doctrine keyed by stable legacy beat ID; fills clean local seeds and migrates existing legacy catalogs.';
`

console.log(`[legacy-signature-doctrine] beats=${beats.length}`)
if (checkOnly) {
  if (!existsSync(outputPath)) throw new Error(`generated migration is missing: ${outputPath}`)
  if (readFileSync(outputPath, 'utf8') !== sql) {
    throw new Error('generated migration has drifted from canonical legacy authoring')
  }
  console.log(`[legacy-signature-doctrine] current=${outputPath}`)
} else {
  if (existsSync(outputPath)) throw new Error(`output already exists: ${outputPath}`)
  writeFileSync(outputPath, sql)
  console.log(`[legacy-signature-doctrine] wrote=${outputPath}`)
}
