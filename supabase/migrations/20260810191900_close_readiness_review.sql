-- Close the non-auth correctness findings from the platform readiness review.
-- Caller identity remains a separate authority migration: the manual declare
-- RPC is security-invoker and therefore grants no privilege beyond the table
-- policies already used by the current client.

-- A published or retired pack is immutable even to ordinary service clients.
-- Database owners retain break-glass authority by disabling the trigger inside
-- an explicit migration; activation may mutate only draft catalogs.
create or replace function public.lock_show_pack_catalog_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old_pack_id uuid;
  v_new_pack_id uuid;
  v_old_status text;
  v_new_status text;
begin
  if tg_table_name = 'category_nominees' then
    if tg_op <> 'INSERT' then
      select category.show_pack_id into v_old_pack_id
      from public.categories category
      where category.id = old.category_id;
    end if;
    if tg_op <> 'DELETE' then
      select category.show_pack_id into v_new_pack_id
      from public.categories category
      where category.id = new.category_id;
    end if;
  else
    if tg_op <> 'INSERT' then v_old_pack_id := old.show_pack_id; end if;
    if tg_op <> 'DELETE' then v_new_pack_id := new.show_pack_id; end if;
  end if;

  if v_old_pack_id is not null then
    select pack.status into v_old_status
    from public.show_packs pack
    where pack.id = v_old_pack_id
    for key share;
    if not found then
      raise exception 'catalog row references a missing show pack' using errcode = '23503';
    end if;
    if v_old_status is distinct from 'draft' then
      raise exception 'published and retired show-pack catalogs are immutable' using errcode = '42501';
    end if;
  end if;

  if v_new_pack_id is not null and v_new_pack_id is distinct from v_old_pack_id then
    select pack.status into v_new_status
    from public.show_packs pack
    where pack.id = v_new_pack_id
    for key share;
    if not found then
      raise exception 'catalog row references a missing show pack' using errcode = '23503';
    end if;
    if v_new_status is distinct from 'draft' then
      raise exception 'published and retired show-pack catalogs are immutable' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- One room declaration is one transaction. The function is deliberately
-- security-invoker: until caller-bound auth lands it must not become a new
-- privilege-escalation surface.
create or replace function public.declare_room_event(
  p_room_id uuid,
  p_name text,
  p_points integer,
  p_nominee_id uuid,
  p_actor_player_id uuid,
  p_source_signature_beat_id integer default null,
  p_source_trigger_contract jsonb default null
)
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
  v_actor_name text;
  v_nominee public.nominees%rowtype;
  v_category public.categories%rowtype;
  v_winner public.room_winners%rowtype;
  v_announcement text;
begin
  if length(btrim(coalesce(p_name, ''))) = 0 then
    raise exception 'declaration name is required' using errcode = '22023';
  end if;
  if p_points is null or p_points <= 0 then
    raise exception 'declaration points must be positive' using errcode = '22023';
  end if;
  if (p_source_signature_beat_id is null) <> (p_source_trigger_contract is null) then
    raise exception 'declaration source provenance must be complete' using errcode = '23514';
  end if;

  select room.* into v_room
  from public.rooms room
  where room.id = p_room_id
  for update;
  if v_room.id is null then
    raise exception 'room not found' using errcode = 'P0002';
  end if;
  if v_room.phase <> 'live'::public.room_phase then
    raise exception 'declarations may be written only while the room is live' using errcode = '55000';
  end if;
  if v_room.host_id is distinct from p_actor_player_id then
    raise exception 'only the room host may declare an event' using errcode = '42501';
  end if;

  select player.name into v_actor_name
  from public.players player
  where player.id = p_actor_player_id and player.room_id = p_room_id;
  if v_actor_name is null then
    raise exception 'host player not found in room' using errcode = '42501';
  end if;

  select nominee.* into v_nominee
  from public.nominees nominee
  where nominee.id = p_nominee_id
    and nominee.show_pack_id = v_room.show_pack_id;
  if v_nominee.id is null then
    raise exception 'declaration nominee must belong to the room show pack' using errcode = '23514';
  end if;

  insert into public.categories (
    name, tier, points, display_order, show_pack_id, room_id,
    source_signature_beat_id, source_trigger_contract
  ) values (
    btrim(p_name),
    case when p_points >= 10 then 1 when p_points >= 6 then 2 else 3 end,
    p_points,
    1000000,
    null,
    p_room_id,
    p_source_signature_beat_id,
    p_source_trigger_contract
  ) returning * into v_category;

  insert into public.category_nominees (category_id, nominee_id)
  values (v_category.id, v_nominee.id);

  insert into public.room_winners (room_id, category_id, winner_id, tie_winner_id)
  values (p_room_id, v_category.id, v_nominee.id, null)
  returning * into v_winner;

  v_announcement := format(
    '%s — %s · worth %s · called by %s',
    v_category.name,
    v_nominee.name,
    v_category.points,
    v_actor_name
  );
  insert into public.messages (room_id, player_id, text)
  values (p_room_id, 'winner-divider', v_announcement);

  return jsonb_build_object(
    'category', to_jsonb(v_category),
    'winner', to_jsonb(v_winner),
    'announcement', v_announcement
  );
end;
$$;

revoke all on function public.declare_room_event(uuid, text, integer, uuid, uuid, integer, jsonb)
  from public;
grant execute on function public.declare_room_event(uuid, text, integer, uuid, uuid, integer, jsonb)
  to anon, authenticated, service_role;

-- The checked wrapper now proves that preserved-live timestamps supplied to
-- the inner writer are the same timestamps sealed by its room-lock snapshot.
create or replace function public.settle_room_checked(
  p_room_code text,
  p_manifest_hash text,
  p_title text,
  p_actor text,
  p_bingo_mode text,
  p_entries jsonb,
  p_bingo_marks jsonb,
  p_input_snapshot jsonb
)
returns table (settlement_id uuid, settlement_version integer, applied boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room_id uuid;
  v_actual_snapshot jsonb;
  v_submitted_marks jsonb;
  v_result record;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'settle_room_checked requires the service role' using errcode = '42501';
  end if;

  select room.id into v_room_id
  from public.rooms room
  where room.code = upper(btrim(p_room_code))
  for update;
  if not found then
    raise exception 'room % not found', upper(btrim(p_room_code));
  end if;

  v_actual_snapshot := public.settlement_input_snapshot(v_room_id);
  if p_input_snapshot is null or v_actual_snapshot is distinct from p_input_snapshot then
    raise exception 'settlement preflight is stale; room inputs changed; run the dry run again'
      using errcode = '23514';
  end if;

  if p_bingo_mode = 'preserve_live' then
    if jsonb_typeof(p_bingo_marks) is distinct from 'array' then
      raise exception 'preserved-live bingo marks must be an array' using errcode = '23514';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object(
      'card_id', mark.card_id,
      'square_index', mark.square_index,
      'marked_at', mark.marked_at
    ) order by mark.card_id, mark.square_index), '[]'::jsonb)
    into v_submitted_marks
    from jsonb_to_recordset(p_bingo_marks) as mark(
      card_id uuid,
      square_index integer,
      marked_at timestamptz
    );
    if v_submitted_marks is distinct from v_actual_snapshot->'bingo_marks' then
      raise exception 'preserved-live bingo timestamps differ from the preflight snapshot'
        using errcode = '23514';
    end if;
  end if;

  select result.settlement_id, result.settlement_version, result.applied
  into v_result
  from public.settle_room(
    p_room_code,
    p_manifest_hash,
    p_title,
    p_actor,
    p_bingo_mode,
    p_entries,
    p_bingo_marks
  ) result;

  return query
  select v_result.settlement_id, v_result.settlement_version, v_result.applied;
end;
$$;

revoke all on function public.settle_room_checked(text, text, text, text, text, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.settle_room_checked(text, text, text, text, text, jsonb, jsonb, jsonb)
  to service_role;

-- Witness acceptance resolves the exact compiled entity identity. Display
-- names remain presentation and may collide inside one show pack.
create or replace function public.review_witness_proposal(
  p_room_id uuid,
  p_proposal_id uuid,
  p_actor_player_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
  v_proposal public.witness_proposals%rowtype;
  v_beat public.signature_beats%rowtype;
  v_entity public.draft_entities%rowtype;
  v_nominee_id uuid;
  v_declaration_name text;
  v_declaration_id integer;
  v_actor_name text;
begin
  if p_action not in ('accept', 'dismiss') then
    raise exception 'witness action must be accept or dismiss' using errcode = '22023';
  end if;

  select room.* into v_room
  from public.rooms room
  where room.id = p_room_id
  for update;
  if v_room.id is null then raise exception 'room not found' using errcode = 'P0002'; end if;
  if v_room.host_id is distinct from p_actor_player_id then
    raise exception 'only the room host may review witness proposals' using errcode = '42501';
  end if;
  if v_room.phase <> 'live'::public.room_phase then
    raise exception 'witness proposals may be reviewed only while the room is live' using errcode = '55000';
  end if;

  select proposal.* into v_proposal
  from public.witness_proposals proposal
  where proposal.id = p_proposal_id
    and proposal.room_id = p_room_id
    and proposal.status = 'pending'
  for update;
  if v_proposal.id is null then
    raise exception 'pending witness proposal not found' using errcode = 'P0002';
  end if;

  select player.name into v_actor_name
  from public.players player
  where player.id = p_actor_player_id and player.room_id = p_room_id;
  if v_actor_name is null then
    raise exception 'host player not found in room' using errcode = '42501';
  end if;

  if p_action = 'dismiss' then
    update public.witness_proposals
    set status = 'dismissed', reviewed_by = p_actor_player_id, reviewed_at = clock_timestamp()
    where id = v_proposal.id;
    return jsonb_build_object('proposal_id', v_proposal.id, 'status', 'dismissed');
  end if;

  select beat.* into v_beat
  from public.signature_beats beat
  where beat.id = v_proposal.source_signature_beat_id
    and beat.show_pack_id = v_room.show_pack_id;
  select entity.* into v_entity
  from public.draft_entities entity
  where entity.id = v_proposal.entity_id
    and entity.show_pack_id = v_room.show_pack_id;
  if v_beat.id is null
     or v_entity.id is null
     or (v_entity.id is distinct from v_beat.entity_id
       and v_entity.id is distinct from v_beat.partner_entity_id)
     or not public.trigger_contract_is_valid(v_beat.trigger_contract) then
    raise exception 'witness proposal is stale against the room catalog' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.categories category
    where category.room_id = p_room_id
      and category.source_signature_beat_id = v_beat.id
  ) then
    raise exception 'witness beat is already declared' using errcode = '23505';
  end if;

  select nominee.id into v_nominee_id
  from public.nominees nominee
  where nominee.show_pack_id = v_room.show_pack_id
    and nominee.pack_key = v_entity.pack_key
    and nominee.type = v_entity.type;
  if v_nominee_id is null then
    raise exception 'witness entity must resolve to one stable room nominee' using errcode = '23514';
  end if;

  v_declaration_name := case
    when v_beat.partner_entity_id is null then v_beat.name
    else v_beat.name || ' — ' || split_part(btrim(v_entity.name), ' ', 1)
  end;

  insert into public.categories (
    name, tier, points, display_order, show_pack_id, room_id,
    source_signature_beat_id, source_trigger_contract
  ) values (
    v_declaration_name,
    case when v_beat.points >= 10 then 1 when v_beat.points >= 6 then 2 else 3 end,
    v_beat.points,
    1000000,
    null,
    p_room_id,
    v_beat.id,
    v_beat.trigger_contract
  ) returning categories.id into v_declaration_id;

  insert into public.category_nominees (category_id, nominee_id)
  values (v_declaration_id, v_nominee_id);
  insert into public.room_winners (room_id, category_id, winner_id, tie_winner_id)
  values (p_room_id, v_declaration_id, v_nominee_id, null);
  insert into public.messages (room_id, player_id, text)
  values (
    p_room_id,
    'system',
    format(
      '%s — %s (+%s) · proposed by the witness · confirmed by %s',
      v_declaration_name,
      v_entity.name,
      v_beat.points,
      v_actor_name
    )
  );
  update public.witness_proposals
  set
    status = 'accepted',
    declaration_category_id = v_declaration_id,
    reviewed_by = p_actor_player_id,
    reviewed_at = clock_timestamp()
  where id = v_proposal.id;

  return jsonb_build_object(
    'proposal_id', v_proposal.id,
    'status', 'accepted',
    'declaration_category_id', v_declaration_id
  );
end;
$$;

revoke all on function public.review_witness_proposal(uuid, uuid, uuid, text) from public;
grant execute on function public.review_witness_proposal(uuid, uuid, uuid, text)
  to anon, authenticated, service_role;

comment on function public.declare_room_event(uuid, text, integer, uuid, uuid, integer, jsonb) is
  'Security-invoker atomic room declaration: fact, nominee link, winner and public announcement.';
comment on function public.settle_room_checked(text, text, text, text, text, jsonb, jsonb, jsonb) is
  'Service-only settlement gate over the exact room input and preserved-mark timestamp snapshot.';
