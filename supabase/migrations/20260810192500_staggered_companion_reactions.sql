-- Declared-event batches need both durable cross-engine ownership and theatrical
-- stagger. Seal the complete plan under the existing reaction claim, insert the
-- zero-delay line atomically, and let either engine idempotently flush later
-- lines only after their due time.

alter table private.companion_reaction_claims
  add column if not exists planned_messages jsonb not null default '[]'::jsonb
  check (jsonb_typeof(planned_messages) = 'array');

create table if not exists private.companion_reaction_deliveries (
  room_id uuid not null,
  reaction_key text not null,
  message_index smallint not null check (message_index between 1 and 3),
  player_id text not null check (
    char_length(player_id) between 1 and 80
    and player_id ~ '^[a-z0-9_-]+$'
  ),
  text text not null check (char_length(btrim(text)) between 1 and 2000),
  due_at timestamptz not null,
  delivered_at timestamptz,
  message_id uuid,
  primary key (room_id, reaction_key, message_index),
  foreign key (room_id, reaction_key)
    references private.companion_reaction_claims(room_id, reaction_key)
    on delete cascade,
  check (
    (delivered_at is null and message_id is null)
    or
    (delivered_at is not null and message_id is not null)
  )
);

create index if not exists companion_reaction_deliveries_due
  on private.companion_reaction_deliveries(room_id, due_at)
  where delivered_at is null;

revoke all on private.companion_reaction_deliveries from public, anon, authenticated;
grant all on private.companion_reaction_deliveries to service_role;

create or replace function public.schedule_staggered_companion_reaction(
  p_room_id uuid,
  p_reaction_key text,
  p_instance_id uuid,
  p_messages jsonb
)
returns table (
  completed boolean,
  first_message_id uuid
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_claim private.companion_reaction_claims%rowtype;
  v_item jsonb;
  v_index integer;
  v_player_id text;
  v_text text;
  v_delay integer;
  v_previous_delay integer := -1;
  v_first_message_id uuid;
  v_now timestamptz := clock_timestamp();
  v_phase public.room_phase;
begin
  select room.phase into v_phase
  from public.rooms room
  where room.id = p_room_id
  for share;
  if not found then raise exception 'room not found' using errcode = 'P0002'; end if;
  if v_phase = 'closed' then
    raise exception 'room data is frozen after settlement' using errcode = '42501';
  end if;

  select * into v_claim
  from private.companion_reaction_claims claim
  where claim.room_id = p_room_id and claim.reaction_key = p_reaction_key
  for update;

  if not found
     or v_claim.instance_id is distinct from p_instance_id
     or v_claim.completed_at is not null then
    return query select false, null::uuid;
    return;
  end if;

  if jsonb_typeof(p_messages) is distinct from 'array'
     or jsonb_array_length(p_messages) not between 1 and 4
     or octet_length(p_messages::text) > 20000 then
    raise exception 'staggered companion reaction must contain one to four messages'
      using errcode = '22023';
  end if;

  for v_item, v_index in
    select value, ordinality::integer - 1
    from jsonb_array_elements(p_messages) with ordinality
  loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or not (v_item ?& array['player_id', 'text', 'delay_seconds'])
       or (select count(*) from jsonb_object_keys(v_item)) <> 3 then
      raise exception 'invalid staggered companion reaction message' using errcode = '22023';
    end if;
    if jsonb_typeof(v_item -> 'player_id') is distinct from 'string'
       or jsonb_typeof(v_item -> 'text') is distinct from 'string'
       or jsonb_typeof(v_item -> 'delay_seconds') is distinct from 'number' then
      raise exception 'invalid staggered companion reaction message fields' using errcode = '22023';
    end if;

    v_player_id := btrim(v_item ->> 'player_id');
    v_text := btrim(v_item ->> 'text');
    begin
      v_delay := (v_item ->> 'delay_seconds')::integer;
    exception when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'staggered delay must be an integer' using errcode = '22023';
    end;
    if (v_item ->> 'delay_seconds')::numeric % 1 <> 0
       or v_player_id = ''
       or char_length(v_player_id) > 80
       or v_player_id !~ '^[a-z0-9_-]+$'
       or v_text = ''
       or char_length(v_text) > 2000
       or v_delay not between 0 and 90
       or (v_index = 0 and v_delay <> 0)
       or (v_index > 0 and v_delay <= v_previous_delay) then
      raise exception 'invalid staggered companion reaction content or ordering'
        using errcode = '22023';
    end if;

    if v_index = 0 then
      insert into public.messages (room_id, player_id, text)
      values (p_room_id, v_player_id, v_text)
      returning id into v_first_message_id;
    else
      insert into private.companion_reaction_deliveries (
        room_id, reaction_key, message_index, player_id, text, due_at
      ) values (
        p_room_id, p_reaction_key, v_index, v_player_id, v_text,
        v_now + make_interval(secs => v_delay)
      );
    end if;
    v_previous_delay := v_delay;
  end loop;

  update private.companion_reaction_claims claim
  set completed_at = v_now,
      output_message_ids = array[v_first_message_id],
      planned_messages = p_messages,
      lease_expires_at = greatest(claim.lease_expires_at, v_now)
  where claim.room_id = p_room_id and claim.reaction_key = p_reaction_key;

  return query select true, v_first_message_id;
end;
$$;

create or replace function public.deliver_due_companion_reactions(
  p_room_id uuid,
  p_limit integer default 20
)
returns table (
  delivered_count integer,
  message_ids uuid[]
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_phase public.room_phase;
  v_delivery private.companion_reaction_deliveries%rowtype;
  v_message_id uuid;
  v_count integer := 0;
  v_message_ids uuid[] := '{}';
begin
  if p_limit is null or p_limit not between 1 and 20 then
    raise exception 'delivery limit must be between one and twenty' using errcode = '22023';
  end if;

  select room.phase into v_phase
  from public.rooms room
  where room.id = p_room_id
  for share;
  if not found then raise exception 'room not found' using errcode = 'P0002'; end if;
  if v_phase = 'closed' then
    return query select 0, '{}'::uuid[];
    return;
  end if;

  for v_delivery in
    select delivery.*
    from private.companion_reaction_deliveries delivery
    where delivery.room_id = p_room_id
      and delivery.delivered_at is null
      and delivery.due_at <= clock_timestamp()
    order by delivery.due_at, delivery.reaction_key, delivery.message_index
    limit p_limit
    for update skip locked
  loop
    insert into public.messages (room_id, player_id, text)
    values (v_delivery.room_id, v_delivery.player_id, v_delivery.text)
    returning id into v_message_id;

    update private.companion_reaction_deliveries delivery
    set delivered_at = clock_timestamp(), message_id = v_message_id
    where delivery.room_id = v_delivery.room_id
      and delivery.reaction_key = v_delivery.reaction_key
      and delivery.message_index = v_delivery.message_index;

    update private.companion_reaction_claims claim
    set output_message_ids = array_append(claim.output_message_ids, v_message_id)
    where claim.room_id = v_delivery.room_id
      and claim.reaction_key = v_delivery.reaction_key;

    v_count := v_count + 1;
    v_message_ids := array_append(v_message_ids, v_message_id);
  end loop;

  return query select v_count, v_message_ids;
end;
$$;

revoke all on function public.schedule_staggered_companion_reaction(uuid, text, uuid, jsonb)
  from public;
revoke all on function public.deliver_due_companion_reactions(uuid, integer) from public;
grant execute on function public.schedule_staggered_companion_reaction(uuid, text, uuid, jsonb)
  to anon, authenticated, service_role;
grant execute on function public.deliver_due_companion_reactions(uuid, integer)
  to anon, authenticated, service_role;

comment on table private.companion_reaction_deliveries is
  'Immutable due-time delivery plan for a completed staggered companion reaction.';
comment on function public.schedule_staggered_companion_reaction(uuid, text, uuid, jsonb) is
  'Atomically seals one claimed batch, inserts its first line and schedules later lines.';
comment on function public.deliver_due_companion_reactions(uuid, integer) is
  'Idempotently inserts immutable scheduled companion lines whose due time has passed.';
