-- The reusable ceremony engine originally admitted at most four lines, which
-- covered live reactions but not the authored seven-companion farewell. Widen
-- the same atomic schedule and private residual ledger to the complete cast.

alter table private.companion_reaction_deliveries
  drop constraint if exists companion_reaction_deliveries_message_index_check;
alter table private.companion_reaction_deliveries
  add constraint companion_reaction_deliveries_message_index_check
  check (message_index between 1 and 6);

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
     or jsonb_array_length(p_messages) not between 1 and 7
     or octet_length(p_messages::text) > 20000 then
    raise exception 'staggered companion reaction must contain one to seven messages'
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

create or replace function public.record_companion_grounding_review(
  p_room_id uuid,
  p_actor_player_id uuid,
  p_reaction_key text,
  p_surface text,
  p_engine text,
  p_facts jsonb,
  p_attempted_messages jsonb,
  p_findings jsonb,
  p_attempts integer,
  p_model text
)
returns uuid
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
  v_item jsonb;
  v_violation jsonb;
  v_id uuid;
begin
  select room.* into v_room
  from public.rooms room
  where room.id = p_room_id;
  if v_room.id is null then raise exception 'room not found' using errcode = 'P0002'; end if;
  if v_room.host_id is distinct from p_actor_player_id then
    raise exception 'only the room host may record a grounding review' using errcode = '42501';
  end if;
  if v_room.phase = 'closed' then
    raise exception 'room data is frozen after settlement' using errcode = '42501';
  end if;
  if p_reaction_key is null
     or char_length(p_reaction_key) not between 1 and 180
     or p_reaction_key !~ '^[a-z0-9:_-]+$' then
    raise exception 'invalid grounding reaction key' using errcode = '22023';
  end if;
  if p_surface is null
     or char_length(p_surface) not between 1 and 40
     or p_surface !~ '^[a-z0-9_-]+$' then
    raise exception 'invalid grounding surface' using errcode = '22023';
  end if;
  if p_engine not in ('browser', 'daemon') then
    raise exception 'invalid grounding engine' using errcode = '22023';
  end if;
  if p_attempts not between 1 and 3 then
    raise exception 'grounding attempts must be between one and three' using errcode = '22023';
  end if;
  if p_model is null or char_length(btrim(p_model)) not between 1 and 80 then
    raise exception 'grounding model is required' using errcode = '22023';
  end if;

  if jsonb_typeof(p_facts) is distinct from 'array'
     or jsonb_array_length(p_facts) not between 1 and 100
     or octet_length(p_facts::text) > 100000 then
    raise exception 'grounding facts must be a bounded non-empty array' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_facts)
  loop
    if jsonb_typeof(v_item) is distinct from 'string'
       or char_length(btrim(v_item #>> '{}')) not between 1 and 2000 then
      raise exception 'invalid grounding fact' using errcode = '22023';
    end if;
  end loop;

  if jsonb_typeof(p_attempted_messages) is distinct from 'array'
     or jsonb_array_length(p_attempted_messages) > 7
     or octet_length(p_attempted_messages::text) > 20000 then
    raise exception 'grounding attempted messages must be a bounded array' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_attempted_messages)
  loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or not (v_item ?& array['companion_id', 'text', 'delay_seconds'])
       or (select count(*) from jsonb_object_keys(v_item)) <> 3
       or jsonb_typeof(v_item -> 'companion_id') is distinct from 'string'
       or (v_item ->> 'companion_id') !~ '^[a-z0-9_-]+$'
       or jsonb_typeof(v_item -> 'text') is distinct from 'string'
       or char_length(btrim(v_item ->> 'text')) not between 1 and 2000
       or jsonb_typeof(v_item -> 'delay_seconds') is distinct from 'number'
       or ((v_item ->> 'delay_seconds')::numeric % 1) <> 0
       or (v_item ->> 'delay_seconds')::integer not between 0 and 600 then
      raise exception 'invalid grounding attempted message' using errcode = '22023';
    end if;
  end loop;

  if jsonb_typeof(p_findings) is distinct from 'array'
     or jsonb_array_length(p_findings) not between 1 and 7
     or octet_length(p_findings::text) > 30000 then
    raise exception 'grounding findings must be a bounded non-empty array' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_findings)
  loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or not (v_item ?& array['companion_id', 'text', 'violations'])
       or (select count(*) from jsonb_object_keys(v_item)) <> 3
       or jsonb_typeof(v_item -> 'companion_id') is distinct from 'string'
       or (v_item ->> 'companion_id') !~ '^[a-z0-9_-]+$'
       or jsonb_typeof(v_item -> 'text') is distinct from 'string'
       or char_length(v_item ->> 'text') > 2000
       or jsonb_typeof(v_item -> 'violations') is distinct from 'array'
       or jsonb_array_length(v_item -> 'violations') not between 1 and 20 then
      raise exception 'invalid grounding finding' using errcode = '22023';
    end if;
    for v_violation in select value from jsonb_array_elements(v_item -> 'violations')
    loop
      if jsonb_typeof(v_violation) is distinct from 'string'
         or char_length(btrim(v_violation #>> '{}')) not between 1 and 2000 then
        raise exception 'invalid grounding violation' using errcode = '22023';
      end if;
    end loop;
  end loop;

  insert into private.companion_grounding_reviews (
    room_id, reaction_key, surface, engine, facts, attempted_messages,
    findings, attempts, model
  ) values (
    p_room_id, p_reaction_key, p_surface, p_engine, p_facts,
    p_attempted_messages, p_findings, p_attempts, btrim(p_model)
  )
  on conflict (room_id, reaction_key) where status = 'pending' do nothing
  returning id into v_id;

  if v_id is null then
    select review.id into v_id
    from private.companion_grounding_reviews review
    where review.room_id = p_room_id
      and review.reaction_key = p_reaction_key
      and review.status = 'pending';
  end if;
  return v_id;
end;
$$;

comment on function public.schedule_staggered_companion_reaction(uuid, text, uuid, jsonb) is
  'Atomically seals one claimed batch of up to the full seven-companion cast, inserts its first line and schedules later lines.';
comment on function public.record_companion_grounding_review(uuid, uuid, text, text, text, jsonb, jsonb, jsonb, integer, text) is
  'Preserves bounded residual evidence for a grounded batch of up to the full cast.';
