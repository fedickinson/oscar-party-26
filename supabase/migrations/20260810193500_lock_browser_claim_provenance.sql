-- A losing browser claim can observe the active daemon instance for operator
-- diagnostics. Keep that observation from becoming mutation authority: every
-- browser-only mutation locks the claim and verifies browser provenance before
-- delegating to the shared service primitive.

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

revoke all on function public.complete_browser_companion_reaction_authorized(
  uuid, text, uuid, jsonb, text
) from public;
revoke all on function public.release_browser_companion_reaction_authorized(
  uuid, text, uuid, text
) from public;
revoke all on function public.schedule_browser_companion_reaction_authorized(
  uuid, text, uuid, jsonb, text
) from public;

grant execute on function public.complete_browser_companion_reaction_authorized(
  uuid, text, uuid, jsonb, text
) to anon, authenticated, service_role;
grant execute on function public.release_browser_companion_reaction_authorized(
  uuid, text, uuid, text
) to anon, authenticated, service_role;
grant execute on function public.schedule_browser_companion_reaction_authorized(
  uuid, text, uuid, jsonb, text
) to anon, authenticated, service_role;

comment on function public.complete_browser_companion_reaction_authorized(
  uuid, text, uuid, jsonb, text
) is 'Atomic browser publication requiring current capability and a browser-owned claim.';
comment on function public.release_browser_companion_reaction_authorized(
  uuid, text, uuid, text
) is 'Browser claim release requiring current capability and browser provenance.';
comment on function public.schedule_browser_companion_reaction_authorized(
  uuid, text, uuid, jsonb, text
) is 'Atomic browser staggered publication requiring current capability and a browser-owned claim.';
