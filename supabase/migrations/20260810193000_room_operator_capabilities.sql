-- A public room code and public host player ID describe product role, not
-- caller authority. Bind the private witness review lane to a service-issued,
-- per-room bearer capability while keeping ordinary party entry anonymous.

create table if not exists private.room_operator_capabilities (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  capability_sha256 text not null check (capability_sha256 ~ '^[a-f0-9]{64}$'),
  generation bigint not null default 1 check (generation > 0),
  issued_at timestamp with time zone not null default clock_timestamp()
);

revoke all on private.room_operator_capabilities from public, anon, authenticated;
grant all on private.room_operator_capabilities to service_role;

create or replace function private.require_room_operator_capability(
  p_room_id uuid,
  p_operator_capability text
)
returns void
language plpgsql
stable
security definer
set search_path = private, public, extensions, pg_temp
as $$
begin
  if p_operator_capability is null
     or p_operator_capability !~ '^[a-f0-9]{64}$'
     or not exists (
       select 1
       from private.room_operator_capabilities capability
       where capability.room_id = p_room_id
         and capability.capability_sha256 = encode(
           extensions.digest(convert_to(p_operator_capability, 'UTF8'), 'sha256'),
           'hex'
         )
     ) then
    raise exception 'a valid operator capability is required for this room'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function private.require_room_operator_capability(uuid, text)
  from public, anon, authenticated;

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

  return jsonb_build_object(
    'capability', v_token,
    'generation', v_generation,
    'issued_at', v_now,
    'rotated', v_rotated
  );
end;
$$;

revoke all on function public.issue_room_operator_capability(uuid) from public, anon, authenticated;
grant execute on function public.issue_room_operator_capability(uuid) to service_role;

create or replace function public.room_operator_capability_status(p_room_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select case
    when capability.room_id is null then jsonb_build_object('issued', false)
    else jsonb_build_object(
      'issued', true,
      'generation', capability.generation,
      'issued_at', capability.issued_at
    )
  end
  from (select p_room_id as room_id) requested
  left join private.room_operator_capabilities capability
    on capability.room_id = requested.room_id;
$$;

revoke all on function public.room_operator_capability_status(uuid)
  from public, anon, authenticated;
grant execute on function public.room_operator_capability_status(uuid) to service_role;

create or replace function public.list_pending_witness_proposals_authorized(
  p_room_id uuid,
  p_actor_player_id uuid,
  p_operator_capability text
)
returns table (
  id uuid,
  source_signature_beat_id integer,
  beat_name text,
  trigger_text text,
  points integer,
  entity_id uuid,
  entity_name text,
  confidence integer,
  observed_at timestamp with time zone,
  frame_sha256 text,
  reference_manifest_sha256 text,
  reference_images_sha256 text,
  model_output_sha256 text,
  model text,
  created_at timestamp with time zone
)
language plpgsql
stable
security definer
set search_path = private, public, extensions, pg_temp
as $$
begin
  perform private.require_room_operator_capability(p_room_id, p_operator_capability);
  return query
  select proposal.*
  from public.list_pending_witness_proposals(p_room_id, p_actor_player_id) proposal;
end;
$$;

create or replace function public.review_witness_proposal_authorized(
  p_room_id uuid,
  p_proposal_id uuid,
  p_actor_player_id uuid,
  p_action text,
  p_operator_capability text
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, extensions, pg_temp
as $$
begin
  perform private.require_room_operator_capability(p_room_id, p_operator_capability);
  return public.review_witness_proposal(
    p_room_id,
    p_proposal_id,
    p_actor_player_id,
    p_action
  );
end;
$$;

-- The legacy host-ID-only entry points remain available to service-role
-- verification and repair, but ordinary clients must cross the capability gate.
revoke execute on function public.list_pending_witness_proposals(uuid, uuid)
  from anon, authenticated;
revoke execute on function public.review_witness_proposal(uuid, uuid, uuid, text)
  from anon, authenticated;

revoke all on function public.list_pending_witness_proposals_authorized(uuid, uuid, text)
  from public;
revoke all on function public.review_witness_proposal_authorized(uuid, uuid, uuid, text, text)
  from public;
grant execute on function public.list_pending_witness_proposals_authorized(uuid, uuid, text)
  to anon, authenticated, service_role;
grant execute on function public.review_witness_proposal_authorized(uuid, uuid, uuid, text, text)
  to anon, authenticated, service_role;

comment on table private.room_operator_capabilities is
  'Hashed room-scoped bearer authority for private operator review; raw capabilities are never stored.';
comment on function public.issue_room_operator_capability(uuid) is
  'Service-only issuance and rotation; returns the raw 256-bit capability exactly once.';
comment on function public.list_pending_witness_proposals_authorized(uuid, uuid, text) is
  'Private witness queue read requiring both current host role and room operator capability.';
comment on function public.review_witness_proposal_authorized(uuid, uuid, uuid, text, text) is
  'Atomic witness review requiring both current host role and room operator capability.';
