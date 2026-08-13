-- Watch-sync state moves every phone and therefore cannot remain an ordinary
-- anonymous table update. Player ids are still room seat handles rather than
-- authenticated identities, but the database now derives membership and
-- remote-holder status from its own rows, validates every state transition and
-- rejects direct mutations of both the shared clock and the fields that confer
-- playback authority.

create or replace function private.require_room_playback_member(
  p_room_id uuid,
  p_player_id uuid
)
returns public.players
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_player public.players%rowtype;
begin
  select player.* into v_player
  from public.players player
  where player.id = p_player_id and player.room_id = p_room_id;
  if not found then
    raise exception 'playback actor does not belong to the room' using errcode = '42501';
  end if;
  return v_player;
end;
$$;

create or replace function private.require_room_playback_holder(
  p_room_id uuid,
  p_player_id uuid
)
returns public.players
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_player public.players%rowtype;
begin
  v_player := private.require_room_playback_member(p_room_id, p_player_id);
  if v_player.watch_group is not null and not v_player.is_remote_holder then
    raise exception 'shared playback changes require the current screen holder'
      using errcode = '42501';
  end if;
  return v_player;
end;
$$;

revoke all on function private.require_room_playback_member(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.require_room_playback_holder(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.set_player_watch_group_authorized(
  p_room_id uuid,
  p_actor_player_id uuid,
  p_target_player_id uuid,
  p_watch_group text,
  p_operator_capability text
)
returns public.players
language plpgsql
security definer
set search_path = private, public, extensions, pg_temp
as $$
declare
  v_target public.players%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_room_id::text, 0)
  );
  perform private.require_room_playback_member(p_room_id, p_actor_player_id);
  if not exists (
    select 1 from public.rooms room
    where room.id = p_room_id
      and (
        room.phase = 'lobby'::public.room_phase
        or (room.phase = 'live'::public.room_phase and not room.show_started)
      )
  ) then
    raise exception 'watch locations close when shared playback begins' using errcode = '55000';
  end if;
  select player.* into v_target from public.players player
  where player.id = p_target_player_id and player.room_id = p_room_id for update;
  if not found then
    raise exception 'playback target does not belong to the room' using errcode = '42501';
  end if;
  if p_actor_player_id <> p_target_player_id then
    perform private.require_room_referee_authority(
      p_room_id, p_actor_player_id, p_operator_capability
    );
  end if;

  p_watch_group := nullif(trim(p_watch_group), '');
  if p_watch_group is not null and char_length(p_watch_group) > 80 then
    raise exception 'watch location must be at most 80 characters' using errcode = '22023';
  end if;

  perform set_config('app.playback_player_room_id', p_room_id::text, true);
  update public.players player
  set watch_group = p_watch_group,
      is_remote_holder = case
        when player.watch_group is distinct from p_watch_group then false
        else player.is_remote_holder
      end
  where player.id = p_target_player_id and player.room_id = p_room_id
  returning player.* into v_target;
  perform set_config('app.playback_player_room_id', '', true);
  return v_target;
end;
$$;

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

  -- Serialize every claimant for this screen before clearing and assigning the
  -- single holder, so concurrent taps cannot leave two true rows.
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

create or replace function public.start_episode_for_screen_authorized(
  p_room_id uuid,
  p_actor_player_id uuid,
  p_operator_capability text
)
returns public.rooms
language plpgsql
security definer
set search_path = private, public, extensions, pg_temp
as $$
declare
  v_actor public.players%rowtype;
  v_room public.rooms%rowtype;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_room_id::text, 0)
  );
  v_actor := private.require_room_playback_member(p_room_id, p_actor_player_id);
  select room.* into v_room from public.rooms room where room.id = p_room_id for update;
  if not found then raise exception 'room not found' using errcode = 'P0002'; end if;
  if v_room.phase <> 'live'::public.room_phase then
    raise exception 'playback may begin only in a live room' using errcode = '55000';
  end if;
  if v_actor.watch_group is not null and not v_actor.is_remote_holder then
    perform private.require_room_referee_authority(
      p_room_id, p_actor_player_id, p_operator_capability
    );
  end if;

  perform set_config('app.playback_player_room_id', p_room_id::text, true);
  if v_actor.watch_group is null then
    update public.players player set episode_started_at = clock_timestamp()
    where player.id = p_actor_player_id and player.episode_started_at is null;
  else
    update public.players player set episode_started_at = clock_timestamp()
    where player.room_id = p_room_id
      and player.watch_group = v_actor.watch_group
      and player.episode_started_at is null;
  end if;
  perform set_config('app.playback_player_room_id', '', true);

  perform set_config('app.playback_room_id', p_room_id::text, true);
  update public.rooms room set show_started = true
  where room.id = p_room_id and not room.show_started
  returning room.* into v_room;
  if not found then
    select room.* into v_room from public.rooms room where room.id = p_room_id;
  end if;
  perform set_config('app.playback_room_id', '', true);
  return v_room;
end;
$$;

create or replace function public.post_room_playback_beacon(
  p_room_id uuid,
  p_actor_player_id uuid,
  p_position_ms integer
)
returns public.rooms
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_actor public.players%rowtype;
  v_room public.rooms%rowtype;
begin
  v_actor := private.require_room_playback_holder(p_room_id, p_actor_player_id);
  if p_position_ms < 0 or p_position_ms > 86400000 then
    raise exception 'playback position is outside the supported range' using errcode = '22023';
  end if;
  if v_actor.episode_started_at is null then
    raise exception 'this screen has not started playback' using errcode = '55000';
  end if;
  select room.* into v_room from public.rooms room where room.id = p_room_id for update;
  if v_room.phase <> 'live'::public.room_phase or not v_room.show_started or v_room.is_paused then
    raise exception 'a running live room is required for a playback beacon' using errcode = '55000';
  end if;

  perform set_config('app.playback_room_id', p_room_id::text, true);
  update public.rooms room set
    sync_position_ms = p_position_ms,
    sync_posted_at = clock_timestamp(),
    sync_posted_by = p_actor_player_id::text
  where room.id = p_room_id returning room.* into v_room;
  perform set_config('app.playback_room_id', '', true);
  return v_room;
end;
$$;

create or replace function public.request_room_playback_pause(
  p_room_id uuid,
  p_actor_player_id uuid,
  p_reason text
)
returns public.rooms
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
begin
  perform private.require_room_playback_member(p_room_id, p_actor_player_id);
  p_reason := nullif(trim(p_reason), '');
  if p_reason is not null and char_length(p_reason) > 160 then
    raise exception 'pause reason must be at most 160 characters' using errcode = '22023';
  end if;
  select room.* into v_room from public.rooms room where room.id = p_room_id for update;
  if v_room.phase <> 'live'::public.room_phase or not v_room.show_started or v_room.is_paused then
    raise exception 'pause requests require running live playback' using errcode = '55000';
  end if;
  if v_room.pause_requested_by is not null
     and v_room.pause_requested_by <> p_actor_player_id::text then
    return v_room;
  end if;

  perform set_config('app.playback_room_id', p_room_id::text, true);
  update public.rooms room set
    pause_requested_by = p_actor_player_id::text,
    pause_reason = p_reason
  where room.id = p_room_id returning room.* into v_room;
  perform set_config('app.playback_room_id', '', true);
  return v_room;
end;
$$;

create or replace function public.cancel_room_playback_pause_request(
  p_room_id uuid,
  p_actor_player_id uuid
)
returns public.rooms
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
begin
  perform private.require_room_playback_member(p_room_id, p_actor_player_id);
  select room.* into v_room from public.rooms room where room.id = p_room_id for update;
  if v_room.pause_requested_by is distinct from p_actor_player_id::text then
    raise exception 'only the requesting seat may cancel this pause request'
      using errcode = '42501';
  end if;

  perform set_config('app.playback_room_id', p_room_id::text, true);
  update public.rooms room set pause_requested_by = null, pause_reason = null
  where room.id = p_room_id returning room.* into v_room;
  perform set_config('app.playback_room_id', '', true);
  return v_room;
end;
$$;

create or replace function public.confirm_room_playback_pause(
  p_room_id uuid,
  p_actor_player_id uuid,
  p_position_ms integer
)
returns public.rooms
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
begin
  perform private.require_room_playback_holder(p_room_id, p_actor_player_id);
  if p_position_ms < 0 or p_position_ms > 86400000 then
    raise exception 'playback position is outside the supported range' using errcode = '22023';
  end if;
  select room.* into v_room from public.rooms room where room.id = p_room_id for update;
  if v_room.is_paused then return v_room; end if;
  if v_room.phase <> 'live'::public.room_phase or not v_room.show_started
     or v_room.pause_requested_by is null then
    raise exception 'an active live pause request is required' using errcode = '55000';
  end if;

  perform set_config('app.playback_room_id', p_room_id::text, true);
  update public.rooms room set
    is_paused = true,
    paused_at_ms = p_position_ms,
    pause_requested_by = null,
    pause_reason = null,
    resume_ready = '[]'::jsonb,
    sync_position_ms = p_position_ms,
    sync_posted_at = clock_timestamp(),
    sync_posted_by = p_actor_player_id::text,
    resume_at = null
  where room.id = p_room_id returning room.* into v_room;
  perform set_config('app.playback_room_id', '', true);
  return v_room;
end;
$$;

create or replace function public.mark_room_playback_resume_ready(
  p_room_id uuid,
  p_actor_player_id uuid
)
returns public.rooms
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
begin
  perform private.require_room_playback_holder(p_room_id, p_actor_player_id);
  select room.* into v_room from public.rooms room where room.id = p_room_id for update;
  if v_room.phase <> 'live'::public.room_phase or not v_room.is_paused then
    raise exception 'resume readiness requires paused live playback' using errcode = '55000';
  end if;
  if coalesce(v_room.resume_ready, '[]'::jsonb) @> to_jsonb(p_actor_player_id::text) then
    return v_room;
  end if;

  perform set_config('app.playback_room_id', p_room_id::text, true);
  update public.rooms room set
    resume_ready = coalesce(room.resume_ready, '[]'::jsonb) || to_jsonb(p_actor_player_id::text)
  where room.id = p_room_id returning room.* into v_room;
  perform set_config('app.playback_room_id', '', true);
  return v_room;
end;
$$;

create or replace function public.schedule_room_playback_resume(
  p_room_id uuid,
  p_actor_player_id uuid,
  p_countdown_seconds integer
)
returns public.rooms
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
begin
  perform private.require_room_playback_holder(p_room_id, p_actor_player_id);
  if p_countdown_seconds < 3 or p_countdown_seconds > 30 then
    raise exception 'resume countdown must be between 3 and 30 seconds' using errcode = '22023';
  end if;
  select room.* into v_room from public.rooms room where room.id = p_room_id for update;
  if v_room.phase <> 'live'::public.room_phase or not v_room.is_paused then
    raise exception 'resume countdown requires paused live playback' using errcode = '55000';
  end if;
  if not (coalesce(v_room.resume_ready, '[]'::jsonb) @> to_jsonb(p_actor_player_id::text)) then
    raise exception 'the scheduling screen must be parked before resume' using errcode = '55000';
  end if;
  if v_room.resume_at is not null then return v_room; end if;

  perform set_config('app.playback_room_id', p_room_id::text, true);
  update public.rooms room set
    resume_at = clock_timestamp() + make_interval(secs => p_countdown_seconds)
  where room.id = p_room_id returning room.* into v_room;
  perform set_config('app.playback_room_id', '', true);
  return v_room;
end;
$$;

create or replace function public.cancel_room_playback_resume(
  p_room_id uuid,
  p_actor_player_id uuid
)
returns public.rooms
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
begin
  perform private.require_room_playback_holder(p_room_id, p_actor_player_id);
  select room.* into v_room from public.rooms room where room.id = p_room_id for update;
  if v_room.phase <> 'live'::public.room_phase or not v_room.is_paused then
    raise exception 'resume cancellation requires paused live playback' using errcode = '55000';
  end if;
  if v_room.resume_at is null then return v_room; end if;

  perform set_config('app.playback_room_id', p_room_id::text, true);
  update public.rooms room set resume_at = null
  where room.id = p_room_id returning room.* into v_room;
  perform set_config('app.playback_room_id', '', true);
  return v_room;
end;
$$;

create or replace function public.release_room_playback_resume(
  p_room_id uuid,
  p_actor_player_id uuid,
  p_expected_resume_at timestamptz
)
returns public.rooms
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
begin
  perform private.require_room_playback_holder(p_room_id, p_actor_player_id);
  select room.* into v_room from public.rooms room where room.id = p_room_id for update;
  if not v_room.is_paused then return v_room; end if;
  if v_room.phase <> 'live'::public.room_phase
     or v_room.resume_at is null
     or v_room.resume_at is distinct from p_expected_resume_at then
    raise exception 'the resume countdown is stale' using errcode = '23514';
  end if;
  if clock_timestamp() < v_room.resume_at then
    raise exception 'the resume countdown has not completed' using errcode = '55000';
  end if;

  perform set_config('app.playback_room_id', p_room_id::text, true);
  update public.rooms room set
    is_paused = false,
    resume_ready = '[]'::jsonb,
    pause_requested_by = null,
    pause_reason = null,
    resume_at = null,
    sync_position_ms = coalesce(room.paused_at_ms, 0),
    sync_posted_at = clock_timestamp(),
    sync_posted_by = p_actor_player_id::text
  where room.id = p_room_id returning room.* into v_room;
  perform set_config('app.playback_room_id', '', true);
  return v_room;
end;
$$;

create or replace function public.guard_room_playback_authority()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if current_setting('app.playback_room_id', true) is distinct from new.id::text then
    raise exception 'shared playback state requires an authorized playback command'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_room_playback_authority on public.rooms;
create trigger guard_room_playback_authority
before update of show_started, sync_position_ms, sync_posted_at, sync_posted_by,
  is_paused, pause_requested_by, pause_reason, paused_at_ms, resume_ready,
  point_person_ids, resume_at, episode_started_at
on public.rooms for each row execute function public.guard_room_playback_authority();

create or replace function public.guard_player_playback_authority()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if tg_op = 'INSERT' then
    if new.watch_group is not null
       or new.is_remote_holder
       or new.episode_started_at is not null then
      raise exception 'new seats must begin without playback authority'
        using errcode = '42501';
    end if;
    return new;
  end if;
  if current_setting('app.playback_player_room_id', true) is distinct from new.room_id::text
     or new.room_id is distinct from old.room_id then
    raise exception 'player playback state requires an authorized playback command'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_player_playback_authority on public.players;
create trigger guard_player_playback_authority
before insert or update of room_id, watch_group, is_remote_holder, episode_started_at
on public.players for each row execute function public.guard_player_playback_authority();

revoke all on function public.guard_room_playback_authority()
  from public, anon, authenticated;
revoke all on function public.guard_player_playback_authority()
  from public, anon, authenticated;

revoke all on function public.set_player_watch_group_authorized(uuid, uuid, uuid, text, text) from public;
revoke all on function public.claim_room_remote_authority(uuid, uuid) from public;
revoke all on function public.start_episode_for_screen_authorized(uuid, uuid, text) from public;
revoke all on function public.post_room_playback_beacon(uuid, uuid, integer) from public;
revoke all on function public.request_room_playback_pause(uuid, uuid, text) from public;
revoke all on function public.cancel_room_playback_pause_request(uuid, uuid) from public;
revoke all on function public.confirm_room_playback_pause(uuid, uuid, integer) from public;
revoke all on function public.mark_room_playback_resume_ready(uuid, uuid) from public;
revoke all on function public.schedule_room_playback_resume(uuid, uuid, integer) from public;
revoke all on function public.cancel_room_playback_resume(uuid, uuid) from public;
revoke all on function public.release_room_playback_resume(uuid, uuid, timestamptz) from public;

grant execute on function public.set_player_watch_group_authorized(uuid, uuid, uuid, text, text)
  to anon, authenticated, service_role;
grant execute on function public.claim_room_remote_authority(uuid, uuid)
  to anon, authenticated, service_role;
grant execute on function public.start_episode_for_screen_authorized(uuid, uuid, text)
  to anon, authenticated, service_role;
grant execute on function public.post_room_playback_beacon(uuid, uuid, integer)
  to anon, authenticated, service_role;
grant execute on function public.request_room_playback_pause(uuid, uuid, text)
  to anon, authenticated, service_role;
grant execute on function public.cancel_room_playback_pause_request(uuid, uuid)
  to anon, authenticated, service_role;
grant execute on function public.confirm_room_playback_pause(uuid, uuid, integer)
  to anon, authenticated, service_role;
grant execute on function public.mark_room_playback_resume_ready(uuid, uuid)
  to anon, authenticated, service_role;
grant execute on function public.schedule_room_playback_resume(uuid, uuid, integer)
  to anon, authenticated, service_role;
grant execute on function public.cancel_room_playback_resume(uuid, uuid)
  to anon, authenticated, service_role;
grant execute on function public.release_room_playback_resume(uuid, uuid, timestamptz)
  to anon, authenticated, service_role;

-- Keep the baseline signatures for a bundle already open during deployment,
-- but replace their caller-trusting bodies with the restrictive new commands.
-- The legacy start path deliberately has no host override because its signature
-- cannot carry the private capability; named-group callers must be the holder.
create or replace function public.mark_resume_ready(
  p_room_id uuid,
  p_player_id text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.mark_room_playback_resume_ready(p_room_id, p_player_id::uuid);
end;
$$;

create or replace function public.set_remote_holder(
  p_room_id uuid,
  p_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.claim_room_remote_authority(p_room_id, p_player_id);
end;
$$;

create or replace function public.start_episode_for_screen(
  p_room_id uuid,
  p_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.start_episode_for_screen_authorized(p_room_id, p_player_id, null);
end;
$$;

revoke all on function public.mark_resume_ready(uuid, text) from public;
revoke all on function public.set_remote_holder(uuid, uuid) from public;
revoke all on function public.start_episode_for_screen(uuid, uuid) from public;
grant execute on function public.mark_resume_ready(uuid, text)
  to anon, authenticated, service_role;
grant execute on function public.set_remote_holder(uuid, uuid)
  to anon, authenticated, service_role;
grant execute on function public.start_episode_for_screen(uuid, uuid)
  to anon, authenticated, service_role;

comment on function public.post_room_playback_beacon(uuid, uuid, integer) is
  'Publishes one database-timestamped playback-holder beacon after deriving holder authority.';
comment on function public.confirm_room_playback_pause(uuid, uuid, integer) is
  'Atomically parks a running room at the first holder-confirmed pause position.';
comment on function public.release_room_playback_resume(uuid, uuid, timestamptz) is
  'Releases paused playback only after the exact database-authored countdown matures.';
