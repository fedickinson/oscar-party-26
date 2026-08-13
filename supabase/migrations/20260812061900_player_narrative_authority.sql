-- Allegiance changes and welcome claims create durable grounded narrative.
-- Keep allegiance player-owned but force it through a membership/state command;
-- bind the host welcome scheduler to the room bearer. Direct browser writes to
-- either narrative field fail closed.

create or replace function public.set_player_allegiance(
  p_room_id uuid,
  p_actor_player_id uuid,
  p_team text
)
returns public.players
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_player public.players%rowtype;
begin
  if p_team not in ('black', 'green') then
    raise exception 'allegiance must be black or green' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.rooms room
    where room.id = p_room_id and room.phase <> 'closed'::public.room_phase
  ) then
    raise exception 'allegiance is frozen after researched settlement'
      using errcode = '55000';
  end if;

  select player.* into v_player from public.players player
  where player.id = p_actor_player_id and player.room_id = p_room_id for update;
  if not found then
    raise exception 'allegiance actor does not belong to the room' using errcode = '42501';
  end if;
  if v_player.team is not distinct from p_team then return v_player; end if;

  perform set_config('app.player_narrative_room_id', p_room_id::text, true);
  update public.players player set team = p_team
  where player.id = p_actor_player_id and player.room_id = p_room_id
  returning player.* into v_player;
  perform set_config('app.player_narrative_room_id', '', true);
  return v_player;
end;
$$;

create or replace function public.claim_player_welcome_authorized(
  p_room_id uuid,
  p_actor_player_id uuid,
  p_target_player_id uuid,
  p_operator_capability text
)
returns public.players
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
  if v_player.welcomed_at is not null then
    raise exception 'player welcome was already claimed' using errcode = '23505';
  end if;

  perform set_config('app.player_narrative_room_id', p_room_id::text, true);
  update public.players player set welcomed_at = clock_timestamp()
  where player.id = p_target_player_id and player.room_id = p_room_id
    and player.welcomed_at is null
  returning player.* into v_player;
  perform set_config('app.player_narrative_room_id', '', true);
  return v_player;
end;
$$;

create or replace function public.guard_player_narrative_authority()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if tg_op = 'INSERT' then
    if new.team is not null or new.welcomed_at is not null then
      raise exception 'new seats must begin without narrative state'
        using errcode = '42501';
    end if;
    return new;
  end if;
  if current_setting('app.player_narrative_room_id', true) is distinct from new.room_id::text
     or new.room_id is distinct from old.room_id then
    raise exception 'player narrative state requires an authorized command'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_player_narrative_authority on public.players;
create trigger guard_player_narrative_authority
before insert or update of room_id, team, welcomed_at on public.players
for each row execute function public.guard_player_narrative_authority();

revoke all on function public.guard_player_narrative_authority()
  from public, anon, authenticated;
revoke all on function public.set_player_allegiance(uuid, uuid, text) from public;
revoke all on function public.claim_player_welcome_authorized(uuid, uuid, uuid, text) from public;
grant execute on function public.set_player_allegiance(uuid, uuid, text)
  to anon, authenticated, service_role;
grant execute on function public.claim_player_welcome_authorized(uuid, uuid, uuid, text)
  to anon, authenticated, service_role;

comment on function public.set_player_allegiance(uuid, uuid, text) is
  'Changes only the named room seat allegiance while preserving trigger-owned revision metadata.';
comment on function public.claim_player_welcome_authorized(uuid, uuid, uuid, text) is
  'Lets the current capability-bearing host claim one unwelcomed room seat exactly once.';
