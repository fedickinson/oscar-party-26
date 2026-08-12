-- A token-shaped browser value is not authority. Make the current room bearer
-- a database-enforced prerequisite both before browser model work and again at
-- publication, while retaining the legacy primitives for the service daemon.

alter table public.rooms
  add column if not exists operator_capability_revision bigint not null default 0
  check (operator_capability_revision >= 0);

update public.rooms room
set operator_capability_revision = capability.generation
from private.room_operator_capabilities capability
where capability.room_id = room.id
  and room.operator_capability_revision is distinct from capability.generation;

create or replace function public.guard_room_operator_capability_revision()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if tg_op = 'INSERT' then
    new.operator_capability_revision := 0;
  elsif new.operator_capability_revision is distinct from old.operator_capability_revision then
    raise exception 'operator capability revision is database-owned' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger initialize_room_operator_capability_revision
before insert on public.rooms
for each row execute function public.guard_room_operator_capability_revision();

create trigger protect_room_operator_capability_revision
before update of operator_capability_revision on public.rooms
for each row execute function public.guard_room_operator_capability_revision();

create or replace function public.issue_room_operator_capability(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = private, public, extensions, pg_temp
as $$
declare
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_now timestamp with time zone := clock_timestamp();
  v_rotated boolean;
  v_generation bigint;
begin
  if not exists (select 1 from public.rooms room where room.id = p_room_id) then
    raise exception 'room not found' using errcode = 'P0002';
  end if;

  select exists (
    select 1 from private.room_operator_capabilities capability
    where capability.room_id = p_room_id
  ) into v_rotated;

  insert into private.room_operator_capabilities (
    room_id, capability_sha256, generation, issued_at
  ) values (
    p_room_id,
    encode(extensions.digest(convert_to(v_token, 'UTF8'), 'sha256'), 'hex'),
    1,
    v_now
  )
  on conflict (room_id) do update
  set capability_sha256 = excluded.capability_sha256,
      generation = private.room_operator_capabilities.generation + 1,
      issued_at = excluded.issued_at
  returning generation into v_generation;

  update public.rooms
  set operator_capability_revision = v_generation
  where id = p_room_id;

  return jsonb_build_object(
    'capability', v_token,
    'generation', v_generation,
    'issued_at', v_now,
    'rotated', v_rotated
  );
end;
$$;

create or replace function public.validate_room_operator_capability(
  p_room_id uuid,
  p_operator_capability text
)
returns boolean
language plpgsql
stable
security definer
set search_path = private, public, extensions, pg_temp
as $$
begin
  perform private.require_room_operator_capability(p_room_id, p_operator_capability);
  return true;
end;
$$;

create or replace function public.claim_browser_companion_reaction_authorized(
  p_room_id uuid,
  p_reaction_key text,
  p_instance_id uuid,
  p_lease_seconds integer,
  p_operator_capability text
)
returns table (
  claimed boolean,
  active_engine text,
  active_instance_id uuid,
  active_lease_expires_at timestamptz,
  active_completed_at timestamptz
)
language plpgsql
security definer
set search_path = private, public, extensions, pg_temp
as $$
begin
  perform private.require_room_operator_capability(p_room_id, p_operator_capability);
  return query
  select result.*
  from public.claim_companion_reaction(
    p_room_id,
    p_reaction_key,
    'browser',
    p_instance_id,
    p_lease_seconds
  ) result;
end;
$$;

create or replace function public.complete_browser_companion_reaction_authorized(
  p_room_id uuid,
  p_reaction_key text,
  p_instance_id uuid,
  p_messages jsonb,
  p_operator_capability text
)
returns table (completed boolean, output_message_ids uuid[])
language plpgsql
security definer
set search_path = private, public, extensions, pg_temp
as $$
declare
  v_claim private.companion_reaction_claims%rowtype;
begin
  perform private.require_room_operator_capability(p_room_id, p_operator_capability);
  select claim.* into v_claim
  from private.companion_reaction_claims claim
  where claim.room_id = p_room_id
    and claim.reaction_key = p_reaction_key
  for update;
  if not found
     or v_claim.instance_id is distinct from p_instance_id
     or v_claim.engine is distinct from 'browser' then
    return query select false, coalesce(v_claim.output_message_ids, '{}'::uuid[]);
    return;
  end if;
  return query
  select result.*
  from public.complete_companion_reaction(
    p_room_id,
    p_reaction_key,
    p_instance_id,
    p_messages
  ) result;
end;
$$;

create or replace function public.release_browser_companion_reaction_authorized(
  p_room_id uuid,
  p_reaction_key text,
  p_instance_id uuid,
  p_operator_capability text
)
returns boolean
language plpgsql
security definer
set search_path = private, public, extensions, pg_temp
as $$
begin
  perform private.require_room_operator_capability(p_room_id, p_operator_capability);
  perform 1
  from private.companion_reaction_claims claim
  where claim.room_id = p_room_id
    and claim.reaction_key = p_reaction_key
    and claim.instance_id = p_instance_id
    and claim.engine = 'browser'
  for update;
  if not found then return false; end if;
  return public.release_companion_reaction(p_room_id, p_reaction_key, p_instance_id);
end;
$$;

create or replace function public.schedule_browser_companion_reaction_authorized(
  p_room_id uuid,
  p_reaction_key text,
  p_instance_id uuid,
  p_messages jsonb,
  p_operator_capability text
)
returns table (completed boolean, first_message_id uuid)
language plpgsql
security definer
set search_path = private, public, extensions, pg_temp
as $$
declare
  v_claim private.companion_reaction_claims%rowtype;
begin
  perform private.require_room_operator_capability(p_room_id, p_operator_capability);
  select claim.* into v_claim
  from private.companion_reaction_claims claim
  where claim.room_id = p_room_id
    and claim.reaction_key = p_reaction_key
  for update;
  if not found
     or v_claim.instance_id is distinct from p_instance_id
     or v_claim.engine is distinct from 'browser' then
    return query select false, null::uuid;
    return;
  end if;
  return query
  select result.*
  from public.schedule_staggered_companion_reaction(
    p_room_id,
    p_reaction_key,
    p_instance_id,
    p_messages
  ) result;
end;
$$;

create or replace function public.complete_grounded_player_verdicts_authorized(
  p_room_id uuid,
  p_actor_player_id uuid,
  p_reaction_key text,
  p_instance_id uuid,
  p_rows jsonb,
  p_facts jsonb,
  p_attempts integer,
  p_model text,
  p_operator_capability text
)
returns table (completed boolean, written_count integer)
language plpgsql
security definer
set search_path = private, public, extensions, pg_temp
as $$
begin
  perform private.require_room_operator_capability(p_room_id, p_operator_capability);
  return query
  select result.*
  from public.complete_grounded_player_verdicts(
    p_room_id,
    p_actor_player_id,
    p_reaction_key,
    p_instance_id,
    p_rows,
    p_facts,
    p_attempts,
    p_model
  ) result;
end;
$$;

revoke execute on function public.claim_companion_reaction(uuid, text, text, uuid, integer)
  from anon, authenticated;
revoke execute on function public.complete_companion_reaction(uuid, text, uuid, jsonb)
  from anon, authenticated;
revoke execute on function public.release_companion_reaction(uuid, text, uuid)
  from anon, authenticated;
revoke execute on function public.schedule_staggered_companion_reaction(uuid, text, uuid, jsonb)
  from anon, authenticated;
revoke execute on function public.complete_grounded_player_verdicts(
  uuid, uuid, text, uuid, jsonb, jsonb, integer, text
) from anon, authenticated;

revoke all on function public.validate_room_operator_capability(uuid, text) from public;
revoke all on function public.claim_browser_companion_reaction_authorized(
  uuid, text, uuid, integer, text
) from public;
revoke all on function public.complete_browser_companion_reaction_authorized(
  uuid, text, uuid, jsonb, text
) from public;
revoke all on function public.release_browser_companion_reaction_authorized(
  uuid, text, uuid, text
) from public;
revoke all on function public.schedule_browser_companion_reaction_authorized(
  uuid, text, uuid, jsonb, text
) from public;
revoke all on function public.complete_grounded_player_verdicts_authorized(
  uuid, uuid, text, uuid, jsonb, jsonb, integer, text, text
) from public;

grant execute on function public.validate_room_operator_capability(uuid, text)
  to anon, authenticated, service_role;
grant execute on function public.claim_browser_companion_reaction_authorized(
  uuid, text, uuid, integer, text
) to anon, authenticated, service_role;
grant execute on function public.complete_browser_companion_reaction_authorized(
  uuid, text, uuid, jsonb, text
) to anon, authenticated, service_role;
grant execute on function public.release_browser_companion_reaction_authorized(
  uuid, text, uuid, text
) to anon, authenticated, service_role;
grant execute on function public.schedule_browser_companion_reaction_authorized(
  uuid, text, uuid, jsonb, text
) to anon, authenticated, service_role;
grant execute on function public.complete_grounded_player_verdicts_authorized(
  uuid, uuid, text, uuid, jsonb, jsonb, integer, text, text
) to anon, authenticated, service_role;

comment on column public.rooms.operator_capability_revision is
  'Database-owned Realtime invalidation counter for room operator capability issuance and rotation.';
comment on function public.validate_room_operator_capability(uuid, text) is
  'Validates the current room bearer without exposing its private hash or generation.';
comment on function public.claim_browser_companion_reaction_authorized(
  uuid, text, uuid, integer, text
) is 'Browser reaction claim requiring the current room operator capability before model work.';
comment on function public.complete_browser_companion_reaction_authorized(
  uuid, text, uuid, jsonb, text
) is 'Atomic browser companion publication requiring the current room capability.';
comment on function public.schedule_browser_companion_reaction_authorized(
  uuid, text, uuid, jsonb, text
) is 'Atomic browser staggered publication requiring the current room capability.';
comment on function public.complete_grounded_player_verdicts_authorized(
  uuid, uuid, text, uuid, jsonb, jsonb, integer, text, text
) is 'Atomic grounded keepsake publication requiring current host role and room capability.';
