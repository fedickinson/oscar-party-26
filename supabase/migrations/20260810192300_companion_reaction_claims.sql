-- Durable, cross-process idempotency for companion reactions. Claims live in
-- a private schema and can only be mutated through the narrow RPCs below.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.companion_reaction_claims (
  room_id uuid not null references public.rooms(id) on delete cascade,
  reaction_key text not null,
  engine text not null check (engine in ('browser', 'daemon')),
  instance_id uuid not null,
  claimed_at timestamptz not null default clock_timestamp(),
  lease_expires_at timestamptz not null,
  completed_at timestamptz,
  output_message_ids uuid[] not null default '{}',
  primary key (room_id, reaction_key),
  check (char_length(reaction_key) between 1 and 180),
  check (reaction_key ~ '^[a-z0-9:_-]+$'),
  check (lease_expires_at > claimed_at),
  check (completed_at is null or completed_at >= claimed_at)
);

revoke all on private.companion_reaction_claims from public, anon, authenticated;
grant all on private.companion_reaction_claims to service_role;

create or replace function public.claim_companion_reaction(
  p_room_id uuid,
  p_reaction_key text,
  p_engine text,
  p_instance_id uuid,
  p_lease_seconds integer default 60
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
set search_path = public, private, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_row private.companion_reaction_claims%rowtype;
  v_phase public.room_phase;
begin
  if p_engine not in ('browser', 'daemon') then
    raise exception 'unknown companion reaction engine %', p_engine using errcode = '22023';
  end if;
  if p_reaction_key is null
     or char_length(p_reaction_key) not between 1 and 180
     or p_reaction_key !~ '^[a-z0-9:_-]+$' then
    raise exception 'invalid companion reaction key' using errcode = '22023';
  end if;
  if p_lease_seconds not between 1 and 300 then
    raise exception 'companion reaction lease must be between 1 and 300 seconds' using errcode = '22023';
  end if;

  select room.phase into v_phase from public.rooms room where room.id = p_room_id;
  if not found then raise exception 'room not found' using errcode = 'P0002'; end if;
  if v_phase = 'closed' then
    raise exception 'room data is frozen after settlement' using errcode = '42501';
  end if;

  insert into private.companion_reaction_claims (
    room_id, reaction_key, engine, instance_id, claimed_at, lease_expires_at
  ) values (
    p_room_id, p_reaction_key, p_engine, p_instance_id,
    v_now, v_now + make_interval(secs => p_lease_seconds)
  )
  on conflict (room_id, reaction_key) do update
  set engine = excluded.engine,
      instance_id = excluded.instance_id,
      claimed_at = excluded.claimed_at,
      lease_expires_at = excluded.lease_expires_at
  where companion_reaction_claims.completed_at is null
    and (
      companion_reaction_claims.instance_id = excluded.instance_id
      or companion_reaction_claims.lease_expires_at <= v_now
    )
  returning * into v_row;

  if found then
    return query select true, v_row.engine, v_row.instance_id,
      v_row.lease_expires_at, v_row.completed_at;
    return;
  end if;

  select * into strict v_row
  from private.companion_reaction_claims claim
  where claim.room_id = p_room_id and claim.reaction_key = p_reaction_key;
  return query select false, v_row.engine, v_row.instance_id,
    v_row.lease_expires_at, v_row.completed_at;
end;
$$;

create or replace function public.complete_companion_reaction(
  p_room_id uuid,
  p_reaction_key text,
  p_instance_id uuid,
  p_messages jsonb
)
returns table (
  completed boolean,
  output_message_ids uuid[]
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_claim private.companion_reaction_claims%rowtype;
  v_item jsonb;
  v_message_id uuid;
  v_message_ids uuid[] := '{}';
  v_player_id text;
  v_text text;
begin
  select * into v_claim
  from private.companion_reaction_claims claim
  where claim.room_id = p_room_id and claim.reaction_key = p_reaction_key
  for update;

  if not found
     or v_claim.instance_id is distinct from p_instance_id
     or v_claim.completed_at is not null then
    return query select false, coalesce(v_claim.output_message_ids, '{}');
    return;
  end if;

  if jsonb_typeof(p_messages) is distinct from 'array'
     or jsonb_array_length(p_messages) not between 1 and 4 then
    raise exception 'companion reaction must contain one to four messages' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_messages)
  loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or not (v_item ? 'player_id')
       or not (v_item ? 'text') then
      raise exception 'invalid companion reaction message' using errcode = '22023';
    end if;
    v_player_id := btrim(v_item ->> 'player_id');
    v_text := btrim(v_item ->> 'text');
    if v_player_id = '' or char_length(v_player_id) > 80
       or v_text = '' or char_length(v_text) > 2000 then
      raise exception 'invalid companion reaction message content' using errcode = '22023';
    end if;

    insert into public.messages (room_id, player_id, text)
    values (p_room_id, v_player_id, v_text)
    returning id into v_message_id;
    v_message_ids := array_append(v_message_ids, v_message_id);
  end loop;

  update private.companion_reaction_claims claim
  set completed_at = clock_timestamp(),
      output_message_ids = v_message_ids,
      lease_expires_at = greatest(claim.lease_expires_at, clock_timestamp())
  where claim.room_id = p_room_id and claim.reaction_key = p_reaction_key;

  return query select true, v_message_ids;
end;
$$;

create or replace function public.release_companion_reaction(
  p_room_id uuid,
  p_reaction_key text,
  p_instance_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_released text;
begin
  delete from private.companion_reaction_claims claim
  where claim.room_id = p_room_id
    and claim.reaction_key = p_reaction_key
    and claim.instance_id = p_instance_id
    and claim.completed_at is null
  returning claim.reaction_key into v_released;
  return v_released is not null;
end;
$$;

revoke all on function public.claim_companion_reaction(uuid, text, text, uuid, integer) from public;
revoke all on function public.complete_companion_reaction(uuid, text, uuid, jsonb) from public;
revoke all on function public.release_companion_reaction(uuid, text, uuid) from public;
grant execute on function public.claim_companion_reaction(uuid, text, text, uuid, integer)
  to anon, authenticated, service_role;
grant execute on function public.complete_companion_reaction(uuid, text, uuid, jsonb)
  to anon, authenticated, service_role;
grant execute on function public.release_companion_reaction(uuid, text, uuid)
  to anon, authenticated, service_role;

comment on table private.companion_reaction_claims is
  'Durable leases and atomic output receipts preventing browser/daemon duplicate cast reactions.';
