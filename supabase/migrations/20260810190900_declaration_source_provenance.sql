-- A room declaration may adjudicate an authored signature beat, but until now
-- it retained only copied display text and points. Preserve the canonical beat
-- link and the exact reviewed trigger contract at declaration time so a later
-- settlement receipt can prove the rule it renders. Manual declarations and
-- legacy beats without reviewed doctrine remain explicitly unlinked.

alter table public.categories
  add column if not exists source_signature_beat_id integer
    references public.signature_beats(id),
  add column if not exists source_trigger_contract jsonb;

alter table public.categories
  add constraint categories_source_provenance_complete
  check (
    (source_signature_beat_id is null and source_trigger_contract is null)
    or
    (source_signature_beat_id is not null and source_trigger_contract is not null)
  ) not valid;
alter table public.categories
  validate constraint categories_source_provenance_complete;

create or replace function public.guard_category_source_provenance()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_source public.signature_beats%rowtype;
begin
  if tg_op = 'UPDATE'
     and (
       new.source_signature_beat_id is distinct from old.source_signature_beat_id
       or new.source_trigger_contract is distinct from old.source_trigger_contract
     ) then
    raise exception 'declaration source provenance is immutable' using errcode = '23514';
  end if;

  if new.source_signature_beat_id is null then
    if new.source_trigger_contract is not null then
      raise exception 'declaration source provenance must be complete' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.room_id is null or new.show_pack_id is not null then
    raise exception 'only a room declaration may retain source-beat provenance' using errcode = '23514';
  end if;

  select * into v_source
  from public.signature_beats
  where id = new.source_signature_beat_id;

  if v_source.id is null
     or not public.beat_belongs_to_room_catalog(new.room_id, v_source.id) then
    raise exception 'declaration source beat must belong to the room catalog' using errcode = '23514';
  end if;
  if not public.trigger_contract_is_valid(v_source.trigger_contract) then
    raise exception 'declaration source beat needs reviewed trigger doctrine' using errcode = '23514';
  end if;
  if new.source_trigger_contract is distinct from v_source.trigger_contract then
    raise exception 'declaration trigger contract must exactly match its source beat' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_category_source_provenance on public.categories;
create trigger guard_category_source_provenance
before insert or update of source_signature_beat_id, source_trigger_contract
on public.categories
for each row execute function public.guard_category_source_provenance();

comment on column public.categories.source_signature_beat_id is
  'Reviewed signature beat adjudicated by this room declaration; null for manual, authored, and legacy declarations.';
comment on column public.categories.source_trigger_contract is
  'Exact reviewed source-beat doctrine frozen when the declaration was inserted.';
