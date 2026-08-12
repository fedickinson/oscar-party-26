-- Closing live play is a shared phase transition. Keep old direct-write clients
-- compatible by clearing any active spotlight whenever they perform the one
-- valid provisional close, and give current clients a room-locked host command.

create or replace function public.clear_spotlight_on_live_floor_close()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.phase = 'live'::public.room_phase
     and new.phase = 'finished'::public.room_phase then
    new.active_spotlight_category_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists clear_spotlight_on_live_floor_close on public.rooms;
create trigger clear_spotlight_on_live_floor_close
before update of phase on public.rooms
for each row execute function public.clear_spotlight_on_live_floor_close();

comment on function public.clear_spotlight_on_live_floor_close() is
  'Clears the live ceremony pointer on live-to-finished writes, including mixed-version direct clients.';

create or replace function public.close_live_floor(
  p_room_id uuid,
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
  if v_room.host_id is distinct from p_actor_player_id
     or not exists (
       select 1
       from public.players player
       where player.id = p_actor_player_id
         and player.room_id = p_room_id
         and player.is_host
     ) then
    raise exception 'only the room host may close the live floor' using errcode = '42501';
  end if;

  if v_room.phase = 'finished'::public.room_phase
     and v_room.active_spotlight_category_id is null then
    return v_room;
  end if;
  if v_room.phase not in ('live'::public.room_phase, 'finished'::public.room_phase) then
    raise exception 'only a live room may move to provisional results' using errcode = '55000';
  end if;

  update public.rooms room
  set phase = 'finished'::public.room_phase,
      active_spotlight_category_id = null
  where room.id = p_room_id
  returning room.* into v_result;

  return v_result;
end;
$$;

revoke all on function public.close_live_floor(uuid, uuid) from public;
grant execute on function public.close_live_floor(uuid, uuid)
  to anon, authenticated, service_role;

comment on function public.close_live_floor(uuid, uuid) is
  'Room-locked, idempotent host transition from live play to the provisional finished ledger.';
