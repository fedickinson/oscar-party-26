-- A settlement must close the exact room inputs that passed operator
-- preflight. Room-input writers take a key-share lock before changing their
-- row; the checked command takes the room's update lock, compares a canonical
-- JSONB snapshot, and only then delegates to the versioned settlement write.

create or replace function public.settlement_input_snapshot(p_room_id uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'players', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', player.id, 'name', player.name)
        order by player.id
      )
      from public.players player
      where player.room_id = p_room_id
    ), '[]'::jsonb),
    'confidence_picks', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', pick.id,
          'player_id', pick.player_id,
          'category_id', pick.category_id,
          'nominee_id', pick.nominee_id,
          'confidence', pick.confidence
        ) order by pick.id
      )
      from public.confidence_picks pick
      where pick.room_id = p_room_id
    ), '[]'::jsonb),
    'draft_picks', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', pick.id,
          'player_id', pick.player_id,
          'entity_id', pick.entity_id
        ) order by pick.id
      )
      from public.draft_picks pick
      where pick.room_id = p_room_id
    ), '[]'::jsonb),
    'bingo_cards', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', card.id,
          'player_id', card.player_id,
          'squares', card.squares
        ) order by card.id
      )
      from public.bingo_cards card
      where card.room_id = p_room_id
    ), '[]'::jsonb)
  )
$$;

revoke all on function public.settlement_input_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.settlement_input_snapshot(uuid) to service_role;

create or replace function public.guard_closed_room_record_input()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_old_room_id uuid;
  v_new_room_id uuid;
  v_room_id uuid;
  v_phase public.room_phase;
begin
  if tg_op <> 'INSERT' then v_old_room_id := old.room_id; end if;
  if tg_op <> 'DELETE' then v_new_room_id := new.room_id; end if;

  for v_room_id in
    select distinct candidate.room_id
    from unnest(array[v_old_room_id, v_new_room_id]) candidate(room_id)
    where candidate.room_id is not null
    order by candidate.room_id
  loop
    select room.phase into v_phase
    from public.rooms room
    where room.id = v_room_id
    for key share;

    if auth.role() is distinct from 'service_role' and v_phase = 'closed' then
      raise exception 'room data is frozen after settlement' using errcode = '42501';
    end if;
  end loop;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create or replace function public.guard_closed_room_bingo_mark()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_old_card_id uuid;
  v_new_card_id uuid;
  v_room_id uuid;
  v_phase public.room_phase;
begin
  if tg_op <> 'INSERT' then v_old_card_id := old.card_id; end if;
  if tg_op <> 'DELETE' then v_new_card_id := new.card_id; end if;

  for v_room_id in
    select distinct card.room_id
    from public.bingo_cards card
    where card.id in (v_old_card_id, v_new_card_id)
    order by card.room_id
  loop
    select room.phase into v_phase
    from public.rooms room
    where room.id = v_room_id
    for key share;

    if auth.role() is distinct from 'service_role' and v_phase = 'closed' then
      raise exception 'live bingo data is frozen after settlement' using errcode = '42501';
    end if;
  end loop;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

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

-- The checked wrapper owns the only callable settlement authority. It remains
-- able to delegate as the function owner; service-role clients cannot skip the
-- canonical input snapshot by calling the legacy implementation directly.
revoke execute on function public.settle_room(text, text, text, text, text, jsonb, jsonb)
  from service_role;
