-- Public player ids describe seats, not callers. Bind every browser command
-- that can change the live referee record to the current room bearer as well
-- as the current host row, and close the direct-table escape hatches.

create or replace function private.require_room_referee_authority(
  p_room_id uuid,
  p_actor_player_id uuid,
  p_operator_capability text
)
returns void
language plpgsql
security definer
set search_path = private, public, extensions, pg_temp
as $$
begin
  perform private.require_room_operator_capability(
    p_room_id,
    p_operator_capability
  );

  perform 1
  from public.rooms room
  join public.players player
    on player.id = p_actor_player_id
   and player.room_id = room.id
   and player.is_host
  where room.id = p_room_id
    and room.host_id = p_actor_player_id
  for update of room, player;

  if not found then
    raise exception 'current room host authority is required'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.require_room_referee_authority(uuid, uuid, text)
  from public, anon, authenticated;

create or replace function public.declare_room_event_authorized(
  p_room_id uuid,
  p_name text,
  p_points integer,
  p_nominee_id uuid,
  p_actor_player_id uuid,
  p_operator_capability text,
  p_source_signature_beat_id integer default null,
  p_source_trigger_contract jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, extensions, pg_temp
as $$
begin
  perform private.require_room_referee_authority(
    p_room_id,
    p_actor_player_id,
    p_operator_capability
  );
  return public.declare_room_event(
    p_room_id,
    p_name,
    p_points,
    p_nominee_id,
    p_actor_player_id,
    p_source_signature_beat_id,
    p_source_trigger_contract
  );
end;
$$;

create or replace function public.undo_room_declaration_authorized(
  p_room_id uuid,
  p_category_id integer,
  p_actor_player_id uuid,
  p_operator_capability text
)
returns text
language plpgsql
security definer
set search_path = private, public, extensions, pg_temp
as $$
begin
  perform private.require_room_referee_authority(
    p_room_id,
    p_actor_player_id,
    p_operator_capability
  );
  return public.undo_room_declaration(
    p_room_id,
    p_category_id,
    p_actor_player_id
  );
end;
$$;

create or replace function public.declare_scheduled_winner_authorized(
  p_room_id uuid,
  p_category_id integer,
  p_winner_id uuid,
  p_tie_winner_id uuid,
  p_actor_player_id uuid,
  p_operator_capability text
)
returns public.room_winners
language plpgsql
security definer
set search_path = private, public, extensions, pg_temp
as $$
begin
  perform private.require_room_referee_authority(
    p_room_id,
    p_actor_player_id,
    p_operator_capability
  );
  return public.declare_scheduled_winner(
    p_room_id,
    p_category_id,
    p_winner_id,
    p_tie_winner_id,
    p_actor_player_id
  );
end;
$$;

create or replace function public.undo_scheduled_winner_authorized(
  p_room_id uuid,
  p_category_id integer,
  p_expected_winner_id uuid,
  p_expected_tie_winner_id uuid,
  p_actor_player_id uuid,
  p_operator_capability text
)
returns public.room_winners
language plpgsql
security definer
set search_path = private, public, extensions, pg_temp
as $$
begin
  perform private.require_room_referee_authority(
    p_room_id,
    p_actor_player_id,
    p_operator_capability
  );
  return public.undo_scheduled_winner(
    p_room_id,
    p_category_id,
    p_expected_winner_id,
    p_expected_tie_winner_id,
    p_actor_player_id
  );
end;
$$;

create or replace function public.open_scheduled_spotlight_authorized(
  p_room_id uuid,
  p_category_id integer,
  p_expected_revision bigint,
  p_actor_player_id uuid,
  p_operator_capability text
)
returns public.rooms
language plpgsql
security definer
set search_path = private, public, extensions, pg_temp
as $$
begin
  perform private.require_room_referee_authority(
    p_room_id,
    p_actor_player_id,
    p_operator_capability
  );
  perform set_config('app.referee_room_id', p_room_id::text, true);
  return public.open_scheduled_spotlight(
    p_room_id,
    p_category_id,
    p_expected_revision,
    p_actor_player_id
  );
end;
$$;

create or replace function public.close_scheduled_spotlight_authorized(
  p_room_id uuid,
  p_expected_category_id integer,
  p_expected_revision bigint,
  p_actor_player_id uuid,
  p_operator_capability text
)
returns public.rooms
language plpgsql
security definer
set search_path = private, public, extensions, pg_temp
as $$
begin
  perform private.require_room_referee_authority(
    p_room_id,
    p_actor_player_id,
    p_operator_capability
  );
  perform set_config('app.referee_room_id', p_room_id::text, true);
  return public.close_scheduled_spotlight(
    p_room_id,
    p_expected_category_id,
    p_expected_revision,
    p_actor_player_id
  );
end;
$$;

create or replace function public.close_live_floor_authorized(
  p_room_id uuid,
  p_actor_player_id uuid,
  p_operator_capability text
)
returns public.rooms
language plpgsql
security definer
set search_path = private, public, extensions, pg_temp
as $$
begin
  perform private.require_room_referee_authority(
    p_room_id,
    p_actor_player_id,
    p_operator_capability
  );
  perform set_config('app.referee_room_id', p_room_id::text, true);
  return public.close_live_floor(
    p_room_id,
    p_actor_player_id
  );
end;
$$;

-- A current browser has no reason to mutate the declaration ledger directly.
-- Narrow security-definer commands above (and the service role for repair)
-- own those writes; reads remain public for the shared realtime game.
revoke insert, update, delete, truncate on public.categories
  from anon, authenticated;
revoke insert, update, delete, truncate on public.category_nominees
  from anon, authenticated;
revoke insert, update, delete, truncate on public.room_winners
  from anon, authenticated;

-- Room rows still need broad browser updates for normal anonymous play. Reject
-- only the referee-owned spotlight field at the trigger boundary. A security-
-- definer authorized command executes its nested update as the function owner;
-- a direct REST mutation executes as anon or authenticated and fails closed.
create or replace function public.guard_room_spotlight_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.role() = 'service_role' then return new; end if;

  if tg_op = 'INSERT' then
    new.spotlight_revision := 0;
    new.spotlight_opened_at := null;
    return new;
  end if;

  if new.active_spotlight_category_id is distinct from old.active_spotlight_category_id
     and current_setting('app.referee_room_id', true) is distinct from new.id::text then
    raise exception 'spotlight transitions require an authorized referee command'
      using errcode = '42501';
  end if;

  if new.active_spotlight_category_id is distinct from old.active_spotlight_category_id then
    if new.active_spotlight_category_id is not null then
      new.spotlight_revision := old.spotlight_revision + 1;
      new.spotlight_opened_at := clock_timestamp();
    else
      new.spotlight_revision := old.spotlight_revision;
      new.spotlight_opened_at := old.spotlight_opened_at;
    end if;
  elsif new.spotlight_revision is distinct from old.spotlight_revision
     or new.spotlight_opened_at is distinct from old.spotlight_opened_at then
    raise exception 'spotlight transition metadata is database-owned' using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function public.clear_spotlight_on_live_floor_close()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.phase = 'live'::public.room_phase
     and new.phase = 'finished'::public.room_phase then
    if auth.role() <> 'service_role'
       and current_setting('app.referee_room_id', true) is distinct from new.id::text then
      raise exception 'closing the live floor requires an authorized referee command'
        using errcode = '42501';
    end if;
    new.active_spotlight_category_id := null;
  end if;
  return new;
end;
$$;

create or replace function public.guard_room_finished_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_entering_finished boolean;
begin
  if tg_op = 'INSERT' then
    v_entering_finished := new.phase = 'finished'::public.room_phase;
  else
    v_entering_finished := new.phase = 'finished'::public.room_phase
      and old.phase is distinct from 'finished'::public.room_phase;
  end if;

  if v_entering_finished
     and auth.role() <> 'service_role'
     and current_setting('app.referee_room_id', true) is distinct from new.id::text then
    raise exception 'entering provisional results requires an authorized referee command'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_room_finished_transition on public.rooms;
create trigger guard_room_finished_transition
before update of phase on public.rooms
for each row execute function public.guard_room_finished_transition();

drop trigger if exists guard_room_finished_room_insert on public.rooms;
create trigger guard_room_finished_room_insert
before insert on public.rooms
for each row execute function public.guard_room_finished_transition();

-- Legacy host-id-only primitives remain service-role repair tools. Ordinary
-- browsers can execute only the capability-gated command family.
revoke execute on function public.declare_room_event(
  uuid, text, integer, uuid, uuid, integer, jsonb
) from anon, authenticated;
revoke execute on function public.undo_room_declaration(uuid, integer, uuid)
  from anon, authenticated;
revoke execute on function public.declare_scheduled_winner(uuid, integer, uuid, uuid, uuid)
  from anon, authenticated;
revoke execute on function public.undo_scheduled_winner(uuid, integer, uuid, uuid, uuid)
  from anon, authenticated;
revoke execute on function public.open_scheduled_spotlight(uuid, integer, bigint, uuid)
  from anon, authenticated;
revoke execute on function public.close_scheduled_spotlight(uuid, integer, bigint, uuid)
  from anon, authenticated;
revoke execute on function public.close_live_floor(uuid, uuid)
  from anon, authenticated;

revoke all on function public.declare_room_event_authorized(
  uuid, text, integer, uuid, uuid, text, integer, jsonb
) from public;
revoke all on function public.undo_room_declaration_authorized(uuid, integer, uuid, text)
  from public;
revoke all on function public.declare_scheduled_winner_authorized(
  uuid, integer, uuid, uuid, uuid, text
) from public;
revoke all on function public.undo_scheduled_winner_authorized(
  uuid, integer, uuid, uuid, uuid, text
) from public;
revoke all on function public.open_scheduled_spotlight_authorized(
  uuid, integer, bigint, uuid, text
) from public;
revoke all on function public.close_scheduled_spotlight_authorized(
  uuid, integer, bigint, uuid, text
) from public;
revoke all on function public.close_live_floor_authorized(uuid, uuid, text)
  from public;

grant execute on function public.declare_room_event_authorized(
  uuid, text, integer, uuid, uuid, text, integer, jsonb
) to anon, authenticated, service_role;
grant execute on function public.undo_room_declaration_authorized(uuid, integer, uuid, text)
  to anon, authenticated, service_role;
grant execute on function public.declare_scheduled_winner_authorized(
  uuid, integer, uuid, uuid, uuid, text
) to anon, authenticated, service_role;
grant execute on function public.undo_scheduled_winner_authorized(
  uuid, integer, uuid, uuid, uuid, text
) to anon, authenticated, service_role;
grant execute on function public.open_scheduled_spotlight_authorized(
  uuid, integer, bigint, uuid, text
) to anon, authenticated, service_role;
grant execute on function public.close_scheduled_spotlight_authorized(
  uuid, integer, bigint, uuid, text
) to anon, authenticated, service_role;
grant execute on function public.close_live_floor_authorized(uuid, uuid, text)
  to anon, authenticated, service_role;

comment on function private.require_room_referee_authority(uuid, uuid, text) is
  'Requires both the current room host row and the current private room operator capability under one transaction lock.';
comment on function public.declare_room_event_authorized(
  uuid, text, integer, uuid, uuid, text, integer, jsonb
) is 'Capability-gated atomic manual room declaration command.';
comment on function public.undo_room_declaration_authorized(uuid, integer, uuid, text) is
  'Capability-gated atomic strike and public-correction command.';
comment on function public.declare_scheduled_winner_authorized(
  uuid, integer, uuid, uuid, uuid, text
) is 'Capability-gated scheduled single or tie winner command.';
comment on function public.undo_scheduled_winner_authorized(
  uuid, integer, uuid, uuid, uuid, text
) is 'Capability-gated scheduled winner compare-and-delete command.';
comment on function public.open_scheduled_spotlight_authorized(
  uuid, integer, bigint, uuid, text
) is 'Capability-gated revision-checked scheduled spotlight opening.';
comment on function public.close_scheduled_spotlight_authorized(
  uuid, integer, bigint, uuid, text
) is 'Capability-gated revision-checked scheduled spotlight close.';
comment on function public.close_live_floor_authorized(uuid, uuid, text) is
  'Capability-gated shared live-to-provisional phase transition.';
comment on function public.guard_room_spotlight_transition() is
  'Owns spotlight revision metadata and rejects direct browser spotlight mutations outside authorized referee commands.';
comment on function public.clear_spotlight_on_live_floor_close() is
  'Rejects direct browser live-floor closure; authorized referee commands and service repair clear the spotlight atomically.';
comment on function public.guard_room_finished_transition() is
  'Rejects every direct browser creation or transition into provisional results, including attempts to route around the live-floor close.';
