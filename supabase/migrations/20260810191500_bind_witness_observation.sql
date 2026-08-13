-- Bind every witness proposal to the exact authored candidate object presented
-- to the model. A later catalog edit therefore makes acceptance stale instead
-- of silently changing the fact the host is asked to declare.

alter table public.witness_proposals
  add column if not exists source_candidate jsonb;

do $$
begin
  if exists (
    select 1 from public.witness_proposals
    where source_candidate is null
  ) then
    raise exception 'cannot bind witness observations: an existing proposal has no sealed source candidate'
      using errcode = '23514';
  end if;
end;
$$;

alter table public.witness_proposals
  alter column source_candidate set not null;

alter table public.witness_proposals
  add constraint witness_source_candidate_object_check
  check (jsonb_typeof(source_candidate) = 'object') not valid;
alter table public.witness_proposals
  validate constraint witness_source_candidate_object_check;

create or replace function public.witness_candidate_for_beat(p_beat_id integer)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'beat_id', beat.id,
    'beat_key', beat.pack_key,
    'title', beat.name,
    'condition', btrim(beat.trigger_contract->>'condition'),
    'exclusions', beat.trigger_contract->'exclusions',
    'points', beat.points,
    'entities', case
      when beat.partner_entity_id is null then
        jsonb_build_array(jsonb_build_object(
          'entity_id', primary_entity.id,
          'entity_key', primary_entity.pack_key,
          'name', primary_entity.name
        ))
      else
        jsonb_build_array(
          jsonb_build_object(
            'entity_id', primary_entity.id,
            'entity_key', primary_entity.pack_key,
            'name', primary_entity.name
          ),
          jsonb_build_object(
            'entity_id', partner_entity.id,
            'entity_key', partner_entity.pack_key,
            'name', partner_entity.name
          )
        )
    end
  )
  from public.signature_beats beat
  join public.draft_entities primary_entity on primary_entity.id = beat.entity_id
  left join public.draft_entities partner_entity on partner_entity.id = beat.partner_entity_id
  where beat.id = p_beat_id;
$$;

revoke all on function public.witness_candidate_for_beat(integer) from public, anon, authenticated;
grant execute on function public.witness_candidate_for_beat(integer) to service_role;

create or replace function public.guard_witness_observation_binding()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_expected jsonb;
begin
  if tg_op = 'UPDATE'
     and new.source_candidate is distinct from old.source_candidate then
    raise exception 'witness source candidate is immutable' using errcode = '23514';
  end if;

  -- Dismissal may clear a stale observation. Insertion and acceptance must
  -- still match the exact catalog object that was presented to the model.
  if tg_op = 'INSERT' or new.status = 'accepted' then
    v_expected := public.witness_candidate_for_beat(new.source_signature_beat_id);
    if v_expected is null or new.source_candidate is distinct from v_expected then
      raise exception 'witness proposal is stale against its sealed source candidate'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_witness_observation_binding on public.witness_proposals;
create trigger guard_witness_observation_binding
before insert or update on public.witness_proposals
for each row execute function public.guard_witness_observation_binding();

-- Normal acceptance must still identify the declaration created in the same
-- transaction. A service-only recovery insert may restore accepted history
-- after referee undo removed that provisional category; if the id now exists,
-- it must still identify the same room and source beat.
create or replace function public.guard_witness_proposal()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
  v_beat public.signature_beats%rowtype;
  v_declaration public.categories%rowtype;
begin
  if tg_op = 'UPDATE' and (
    new.room_id is distinct from old.room_id
    or new.source_signature_beat_id is distinct from old.source_signature_beat_id
    or new.entity_id is distinct from old.entity_id
    or new.confidence is distinct from old.confidence
    or new.observed_at is distinct from old.observed_at
    or new.frame_sha256 is distinct from old.frame_sha256
    or new.reference_manifest_sha256 is distinct from old.reference_manifest_sha256
    or new.reference_images_sha256 is distinct from old.reference_images_sha256
    or new.model_output_sha256 is distinct from old.model_output_sha256
    or new.model is distinct from old.model
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'witness observation evidence is immutable' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and (
    old.status <> 'pending'
    or new.status not in ('accepted', 'dismissed')
  ) then
    raise exception 'a witness proposal may be reviewed exactly once' using errcode = '23514';
  end if;

  select room.* into v_room
  from public.rooms room
  where room.id = new.room_id;
  if v_room.id is null then
    raise exception 'witness proposal room not found' using errcode = '23503';
  end if;

  select beat.* into v_beat
  from public.signature_beats beat
  where beat.id = new.source_signature_beat_id;
  if v_beat.id is null
     or v_beat.show_pack_id is distinct from v_room.show_pack_id
     or not public.trigger_contract_is_valid(v_beat.trigger_contract) then
    raise exception 'witness proposal needs a reviewed beat from the room catalog' using errcode = '23514';
  end if;
  if new.entity_id is distinct from v_beat.entity_id
     and new.entity_id is distinct from v_beat.partner_entity_id then
    raise exception 'witness proposal entity must be one side of its beat' using errcode = '23514';
  end if;

  if new.status = 'pending' then
    if v_room.phase <> 'live'::public.room_phase then
      raise exception 'witness proposals may be queued only while the room is live' using errcode = '55000';
    end if;
    if exists (
      select 1 from public.categories category
      where category.room_id = new.room_id
        and category.source_signature_beat_id = new.source_signature_beat_id
    ) then
      raise exception 'witness beat is already declared' using errcode = '23505';
    end if;
  elsif new.status = 'dismissed' then
    if not exists (
      select 1 from public.players reviewer
      where reviewer.id = new.reviewed_by and reviewer.room_id = new.room_id
    ) then
      raise exception 'witness reviewer must belong to the room' using errcode = '23514';
    end if;
  else
    select category.* into v_declaration
    from public.categories category
    where category.id = new.declaration_category_id;
    if (tg_op = 'UPDATE' and v_declaration.id is null)
       or (v_declaration.id is not null and (
         v_declaration.room_id is distinct from new.room_id
         or v_declaration.source_signature_beat_id is distinct from new.source_signature_beat_id
       )) then
      raise exception 'accepted witness proposal must identify its canonical declaration' using errcode = '23514';
    end if;
    if not exists (
      select 1 from public.players reviewer
      where reviewer.id = new.reviewed_by and reviewer.room_id = new.room_id
    ) then
      raise exception 'witness reviewer must belong to the room' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

-- Clients may observe the invalidation counter but may not forge it. Only the
-- nested proposal trigger is allowed to advance the room revision.
create or replace function public.guard_witness_revision_write()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.witness_revision <> 0 then
      raise exception 'witness revision is database-owned' using errcode = '42501';
    end if;
  elsif new.witness_revision is distinct from old.witness_revision
        and pg_trigger_depth() < 2 then
    raise exception 'witness revision is database-owned' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_witness_revision_write on public.rooms;
create trigger guard_witness_revision_write
before insert or update on public.rooms
for each row execute function public.guard_witness_revision_write();

-- The host reviews the observation-time contract, not whatever mutable labels
-- happen to live in the catalog when the queue is opened.
drop function if exists public.list_pending_witness_proposals(uuid, uuid);
create function public.list_pending_witness_proposals(
  p_room_id uuid,
  p_actor_player_id uuid
)
returns table (
  id uuid,
  source_signature_beat_id integer,
  beat_name text,
  trigger_text text,
  points integer,
  entity_id uuid,
  entity_name text,
  confidence integer,
  observed_at timestamp with time zone,
  frame_sha256 text,
  reference_manifest_sha256 text,
  reference_images_sha256 text,
  model_output_sha256 text,
  model text,
  created_at timestamp with time zone
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.rooms room
    where room.id = p_room_id and room.host_id = p_actor_player_id
  ) then
    raise exception 'only the room host may read witness proposals' using errcode = '42501';
  end if;

  return query
  select
    proposal.id,
    proposal.source_signature_beat_id,
    proposal.source_candidate->>'title',
    proposal.source_candidate->>'condition',
    (proposal.source_candidate->>'points')::integer,
    proposal.entity_id,
    matched_entity.item->>'name',
    proposal.confidence,
    proposal.observed_at,
    proposal.frame_sha256,
    proposal.reference_manifest_sha256,
    proposal.reference_images_sha256,
    proposal.model_output_sha256,
    proposal.model,
    proposal.created_at
  from public.witness_proposals proposal
  cross join lateral (
    select item
    from jsonb_array_elements(proposal.source_candidate->'entities') item
    where item->>'entity_id' = proposal.entity_id::text
  ) matched_entity
  where proposal.room_id = p_room_id and proposal.status = 'pending'
  order by proposal.created_at, proposal.id;
end;
$$;

revoke all on function public.list_pending_witness_proposals(uuid, uuid) from public;
grant execute on function public.list_pending_witness_proposals(uuid, uuid)
  to anon, authenticated, service_role;

comment on column public.witness_proposals.source_candidate is
  'Exact authored candidate JSON shown to the vision model; immutable and revalidated before acceptance.';
