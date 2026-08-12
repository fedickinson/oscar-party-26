-- Scheduled spotlight changes are shared operator actions, not local UI state.
-- Lock the room and compare its database-owned revision so stale host tabs
-- cannot replace or close a newer ceremony opening.

create or replace function public.open_scheduled_spotlight(
  p_room_id uuid,
  p_category_id integer,
  p_expected_revision bigint,
  p_actor_player_id uuid
)
returns public.rooms
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
  v_result public.rooms%rowtype;
begin
  select room.* into v_room
  from public.rooms room
  where room.id = p_room_id
  for update;

  if not found then
    raise exception 'room not found' using errcode = 'P0002';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'spotlight revision precondition is required' using errcode = '22023';
  end if;
  if p_category_id is null then
    raise exception 'spotlight category is required' using errcode = '22023';
  end if;
  if v_room.host_id is distinct from p_actor_player_id
     or not exists (
       select 1
       from public.players player
       where player.id = p_actor_player_id
         and player.room_id = p_room_id
         and player.is_host
     ) then
    raise exception 'only the room host may open a scheduled spotlight' using errcode = '42501';
  end if;
  if v_room.phase <> 'live'::public.room_phase then
    raise exception 'scheduled spotlights may open only while the room is live' using errcode = '55000';
  end if;
  if v_room.game_model <> 'legacy_ensemble' then
    raise exception 'room does not use scheduled spotlights' using errcode = '55000';
  end if;

  -- Accept both a replay of the original command and an already-reconciled
  -- client asking for the same active category.
  if v_room.active_spotlight_category_id = p_category_id
     and (
       v_room.spotlight_revision = p_expected_revision
       or p_expected_revision = v_room.spotlight_revision - 1
     ) then
    return v_room;
  end if;

  if v_room.spotlight_revision <> p_expected_revision then
    raise exception 'spotlight changed before it could be opened' using errcode = 'P0001';
  end if;
  if v_room.active_spotlight_category_id is not null then
    raise exception 'close the active spotlight before opening another' using errcode = 'P0001';
  end if;
  if not exists (
    select 1
    from public.categories category
    where category.id = p_category_id
      and category.show_pack_id = v_room.show_pack_id
      and category.room_id is null
  ) then
    raise exception 'spotlight category does not belong to the room scheduled slate' using errcode = '23514';
  end if;
  if exists (
    select 1
    from public.room_winners winner
    where winner.room_id = p_room_id
      and winner.category_id = p_category_id
  ) then
    raise exception 'a resolved category cannot open a new spotlight' using errcode = '23514';
  end if;

  update public.rooms room
  set active_spotlight_category_id = p_category_id
  where room.id = p_room_id
  returning room.* into v_result;

  return v_result;
end;
$$;

revoke all on function public.open_scheduled_spotlight(uuid, integer, bigint, uuid) from public;
grant execute on function public.open_scheduled_spotlight(uuid, integer, bigint, uuid)
  to anon, authenticated, service_role;

comment on function public.open_scheduled_spotlight(uuid, integer, bigint, uuid) is
  'Room-locked, revision-checked host command for one unresolved scheduled-category spotlight opening.';

create or replace function public.close_scheduled_spotlight(
  p_room_id uuid,
  p_expected_category_id integer,
  p_expected_revision bigint,
  p_actor_player_id uuid
)
returns public.rooms
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
  v_result public.rooms%rowtype;
begin
  select room.* into v_room
  from public.rooms room
  where room.id = p_room_id
  for update;

  if not found then
    raise exception 'room not found' using errcode = 'P0002';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'spotlight revision precondition is required' using errcode = '22023';
  end if;
  if p_expected_category_id is null then
    raise exception 'expected spotlight category is required' using errcode = '22023';
  end if;
  if v_room.host_id is distinct from p_actor_player_id
     or not exists (
       select 1
       from public.players player
       where player.id = p_actor_player_id
         and player.room_id = p_room_id
         and player.is_host
     ) then
    raise exception 'only the room host may close a scheduled spotlight' using errcode = '42501';
  end if;
  if v_room.phase <> 'live'::public.room_phase then
    raise exception 'scheduled spotlights may close only while the room is live' using errcode = '55000';
  end if;
  if v_room.game_model <> 'legacy_ensemble' then
    raise exception 'room does not use scheduled spotlights' using errcode = '55000';
  end if;
  if v_room.spotlight_revision <> p_expected_revision then
    raise exception 'spotlight changed before it could be closed' using errcode = 'P0001';
  end if;

  if v_room.active_spotlight_category_id is null then
    return v_room;
  end if;
  if v_room.active_spotlight_category_id <> p_expected_category_id then
    raise exception 'a different spotlight is now active' using errcode = 'P0001';
  end if;

  update public.rooms room
  set active_spotlight_category_id = null
  where room.id = p_room_id
  returning room.* into v_result;

  return v_result;
end;
$$;

revoke all on function public.close_scheduled_spotlight(uuid, integer, bigint, uuid) from public;
grant execute on function public.close_scheduled_spotlight(uuid, integer, bigint, uuid)
  to anon, authenticated, service_role;

comment on function public.close_scheduled_spotlight(uuid, integer, bigint, uuid) is
  'Room-locked host compare-and-clear for the exact active scheduled spotlight revision.';
