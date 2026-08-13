-- Acceptance must hold the exact model-time catalog contract stable through
-- commit. Dismissal is different: it clears a proposal and writes no fact, so
-- later catalog drift must never strand it in the queue.

create or replace function public.guard_witness_observation_binding()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_expected jsonb;
  v_beat public.signature_beats%rowtype;
begin
  if tg_op = 'UPDATE'
     and new.source_candidate is distinct from old.source_candidate then
    raise exception 'witness source candidate is immutable' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' or new.status = 'accepted' then
    if new.status = 'accepted' then
      select beat.* into v_beat
      from public.signature_beats beat
      where beat.id = new.source_signature_beat_id
      for share;
      if v_beat.id is null then
        raise exception 'witness proposal is stale against its sealed source candidate'
          using errcode = '23514';
      end if;

      perform 1
      from public.draft_entities entity
      where entity.id = v_beat.entity_id
         or entity.id = v_beat.partner_entity_id
      for share;
    end if;

    v_expected := public.witness_candidate_for_beat(new.source_signature_beat_id);
    if v_expected is null or new.source_candidate is distinct from v_expected then
      raise exception 'witness proposal is stale against its sealed source candidate'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

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

  if new.status = 'dismissed' then
    if not exists (
      select 1 from public.players reviewer
      where reviewer.id = new.reviewed_by and reviewer.room_id = new.room_id
    ) then
      raise exception 'witness reviewer must belong to the room' using errcode = '23514';
    end if;
    return new;
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

comment on function public.guard_witness_observation_binding() is
  'Seals witness evidence and holds accepted beat/entity catalog rows against concurrent mutation.';
comment on function public.guard_witness_proposal() is
  'Validates witness lifecycle; stale proposals remain dismissible because dismissal writes no fact.';
