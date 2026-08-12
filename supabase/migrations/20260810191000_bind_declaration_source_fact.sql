-- Source provenance is truthful only when the declaration remains the same
-- fact and payout as the reviewed signature beat. The first provenance guard
-- sealed the copied rule; this additive replacement also binds the declaration
-- name and points on every later update. Paired beats retain the two explicit
-- collision labels emitted by the operator console.

create or replace function public.guard_category_source_provenance()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_source public.signature_beats%rowtype;
  v_entity_name text;
  v_partner_name text;
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
  if new.points is distinct from v_source.points then
    raise exception 'declaration points must exactly match its source beat' using errcode = '23514';
  end if;

  select name into v_entity_name
  from public.draft_entities
  where id = v_source.entity_id;
  if v_source.partner_entity_id is not null then
    select name into v_partner_name
    from public.draft_entities
    where id = v_source.partner_entity_id;
  end if;

  if new.name is distinct from v_source.name
     and (
       v_source.partner_entity_id is null
       or new.name not in (
         v_source.name || ' — ' || split_part(btrim(v_entity_name), ' ', 1),
         v_source.name || ' — ' || split_part(btrim(v_partner_name), ' ', 1)
       )
     ) then
    raise exception 'declaration name must identify its source beat' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_category_source_provenance on public.categories;
create trigger guard_category_source_provenance
before insert or update
on public.categories
for each row execute function public.guard_category_source_provenance();

comment on function public.guard_category_source_provenance() is
  'Seals declaration provenance and binds sourced declaration names and points to the reviewed room-catalog beat.';
