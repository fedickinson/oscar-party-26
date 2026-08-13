-- A NULL composite result is serialized by PostgREST as an object with every
-- field NULL, which is truthy in browser code. Return JSON so a lost welcome
-- race crosses the wire as actual JSON null while preserving the v1 RPC for
-- older clients.
create or replace function public.claim_player_welcome_authorized_v2(
  p_room_id uuid,
  p_actor_player_id uuid,
  p_target_player_id uuid,
  p_operator_capability text
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, extensions, pg_temp
as $$
declare
  v_player public.players%rowtype;
begin
  perform private.require_room_referee_authority(
    p_room_id, p_actor_player_id, p_operator_capability
  );
  if not exists (
    select 1 from public.rooms room
    where room.id = p_room_id
      and room.phase in ('lobby'::public.room_phase, 'live'::public.room_phase)
  ) then
    raise exception 'player welcomes are available only before or during live play'
      using errcode = '55000';
  end if;

  select player.* into v_player from public.players player
  where player.id = p_target_player_id and player.room_id = p_room_id for update;
  if not found then
    raise exception 'welcome target does not belong to the room' using errcode = '42501';
  end if;
  if v_player.welcomed_at is not null then return null; end if;

  perform set_config('app.player_narrative_room_id', p_room_id::text, true);
  update public.players player set welcomed_at = clock_timestamp()
  where player.id = p_target_player_id and player.room_id = p_room_id
    and player.welcomed_at is null
  returning player.* into v_player;
  perform set_config('app.player_narrative_room_id', '', true);
  return to_jsonb(v_player);
end;
$$;

revoke all on function public.claim_player_welcome_authorized_v2(uuid, uuid, uuid, text)
  from public;
grant execute on function public.claim_player_welcome_authorized_v2(uuid, uuid, uuid, text)
  to anon, authenticated, service_role;

comment on function public.claim_player_welcome_authorized_v2(uuid, uuid, uuid, text) is
  'Claims one room welcome and returns the player as JSON, or JSON null when another caller already owns the slot.';
