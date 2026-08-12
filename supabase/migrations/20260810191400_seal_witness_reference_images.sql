-- The manifest hash binds the entity-to-file map, not the bytes read from
-- those files. Seal the ordered reference-image content independently and
-- make that warrant immutable beside the frame and model-output hashes.

alter table public.witness_proposals
  add column if not exists reference_images_sha256 text;

do $$
begin
  if exists (
    select 1 from public.witness_proposals
    where reference_images_sha256 is null
  ) then
    raise exception 'cannot seal witness reference images: an existing proposal has no content hash'
      using errcode = '23514';
  end if;
end;
$$;

alter table public.witness_proposals
  alter column reference_images_sha256 set not null;

alter table public.witness_proposals
  add constraint witness_reference_images_digest_check
  check (reference_images_sha256 ~ '^[a-f0-9]{64}$') not valid;
alter table public.witness_proposals
  validate constraint witness_reference_images_digest_check;

create or replace function public.guard_witness_reference_images_hash()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.reference_images_sha256 is distinct from old.reference_images_sha256 then
    raise exception 'witness reference-image evidence is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_witness_reference_images_hash on public.witness_proposals;
create trigger guard_witness_reference_images_hash
before update of reference_images_sha256 on public.witness_proposals
for each row execute function public.guard_witness_reference_images_hash();

comment on column public.witness_proposals.reference_images_sha256 is
  'SHA-256 of the ordered entity-key and reference-image content hashes sent with the observation.';
