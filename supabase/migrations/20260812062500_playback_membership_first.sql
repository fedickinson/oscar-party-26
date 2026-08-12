-- Resolve the caller's exact room membership before inspecting room playback
-- state, so cross-room claims fail on authority rather than leaking state.
create or replace function public.claim_room_remote_authority(
  p_room_id uuid,
  p_actor_player_id uuid
)
returns public.players
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_actor public.players%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_room_id::text, 0)
  );
  v_actor := private.require_room_playback_member(p_room_id, p_actor_player_id);
  if not exists (
    select 1 from public.rooms room
    where room.id = p_room_id
      and (
        room.phase = 'lobby'::public.room_phase
        or (room.phase = 'live'::public.room_phase and not room.show_started)
      )
  ) then
    raise exception 'remote authority closes when shared playback begins' using errcode = '55000';
  end if;
  if v_actor.watch_group is null then
    return v_actor;
  end if;

  perform 1 from public.players player
  where player.room_id = p_room_id
    and player.watch_group is not distinct from v_actor.watch_group
  order by player.id
  for update;

  perform set_config('app.playback_player_room_id', p_room_id::text, true);
  update public.players player
  set is_remote_holder = false
  where player.room_id = p_room_id
    and player.watch_group is not distinct from v_actor.watch_group
    and player.is_remote_holder;
  update public.players player
  set is_remote_holder = true
  where player.id = p_actor_player_id and player.room_id = p_room_id
  returning player.* into v_actor;
  perform set_config('app.playback_player_room_id', '', true);
  return v_actor;
end;
$$;

revoke all on function public.claim_room_remote_authority(uuid, uuid) from public;
grant execute on function public.claim_room_remote_authority(uuid, uuid)
  to anon, authenticated, service_role;

comment on function public.claim_room_remote_authority(uuid, uuid) is
  'Atomically assigns one screen holder after first proving the actor belongs to the exact room.';
