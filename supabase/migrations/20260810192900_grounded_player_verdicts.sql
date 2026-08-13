-- A keepsake verdict is one room-wide grounded artifact. Its claim, complete
-- player set, provenance and write receipt commit together so a partial model
-- response or a dying host can never become the durable completion sentinel.

alter table public.player_verdicts
  add column if not exists grounding_reaction_key text,
  add column if not exists grounding_facts jsonb,
  add column if not exists grounding_attempts integer,
  add column if not exists grounding_model text,
  add column if not exists grounded_at timestamptz;

alter table public.player_verdicts
  drop constraint if exists player_verdicts_grounding_reaction_key_check,
  add constraint player_verdicts_grounding_reaction_key_check check (
    grounding_reaction_key is null or (
      char_length(grounding_reaction_key) between 1 and 180
      and grounding_reaction_key ~ '^[a-z0-9:_-]+$'
    )
  ),
  drop constraint if exists player_verdicts_grounding_facts_check,
  add constraint player_verdicts_grounding_facts_check check (
    grounding_facts is null or jsonb_typeof(grounding_facts) = 'array'
  ),
  drop constraint if exists player_verdicts_grounding_attempts_check,
  add constraint player_verdicts_grounding_attempts_check check (
    grounding_attempts is null or grounding_attempts between 1 and 3
  ),
  drop constraint if exists player_verdicts_grounding_model_check,
  add constraint player_verdicts_grounding_model_check check (
    grounding_model is null or char_length(btrim(grounding_model)) between 1 and 80
  ),
  drop constraint if exists player_verdicts_grounding_bundle_check,
  add constraint player_verdicts_grounding_bundle_check check (
    (grounding_reaction_key is null and grounding_facts is null
      and grounding_attempts is null and grounding_model is null and grounded_at is null)
    or
    (grounding_reaction_key is not null and grounding_facts is not null
      and grounding_attempts is not null and grounding_model is not null and grounded_at is not null)
  );

create or replace function public.complete_grounded_player_verdicts(
  p_room_id uuid,
  p_actor_player_id uuid,
  p_reaction_key text,
  p_instance_id uuid,
  p_rows jsonb,
  p_facts jsonb,
  p_attempts integer,
  p_model text
)
returns table (completed boolean, written_count integer)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
  v_claim private.companion_reaction_claims%rowtype;
  v_item jsonb;
  v_nested jsonb;
  v_player_id uuid;
  v_message_id uuid;
  v_player_ids uuid[] := '{}';
  v_room_player_ids uuid[];
  v_now timestamptz := clock_timestamp();
begin
  select room.* into v_room
  from public.rooms room
  where room.id = p_room_id
  for share;
  if v_room.id is null then raise exception 'room not found' using errcode = 'P0002'; end if;
  if v_room.host_id is distinct from p_actor_player_id then
    raise exception 'only the room host may complete keepsake verdicts' using errcode = '42501';
  end if;
  if v_room.phase is distinct from 'finished'::public.room_phase then
    raise exception 'keepsake verdicts require the provisional finished phase' using errcode = '42501';
  end if;
  if p_reaction_key is distinct from 'keepsake:verdicts:v1' then
    raise exception 'invalid keepsake verdict reaction key' using errcode = '22023';
  end if;

  select * into v_claim
  from private.companion_reaction_claims claim
  where claim.room_id = p_room_id and claim.reaction_key = p_reaction_key
  for update;
  if not found
     or v_claim.instance_id is distinct from p_instance_id
     or v_claim.engine is distinct from 'browser'
     or v_claim.completed_at is not null then
    return query select false, 0;
    return;
  end if;

  if jsonb_typeof(p_rows) is distinct from 'array'
     or jsonb_array_length(p_rows) not between 1 and 7
     or octet_length(p_rows::text) > 30000 then
    raise exception 'keepsake verdicts require one through seven bounded rows' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_array_elements(p_rows)) is distinct from
     (select count(distinct lower(value ->> 'title')) from jsonb_array_elements(p_rows)) then
    raise exception 'keepsake verdict titles must be unique' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_rows)
  loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or not (v_item ?& array['player_id', 'companion_id', 'title', 'verdict', 'highlights', 'imagery'])
       or (select count(*) from jsonb_object_keys(v_item)) <> 6
       or jsonb_typeof(v_item -> 'player_id') is distinct from 'string'
       or jsonb_typeof(v_item -> 'companion_id') is distinct from 'string'
       or jsonb_typeof(v_item -> 'title') is distinct from 'string'
       or jsonb_typeof(v_item -> 'verdict') is distinct from 'string'
       or jsonb_typeof(v_item -> 'highlights') is distinct from 'array'
       or jsonb_typeof(v_item -> 'imagery') is distinct from 'array' then
      raise exception 'invalid keepsake verdict row shape' using errcode = '22023';
    end if;
    if (v_item ->> 'player_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or (v_item ->> 'companion_id') not in ('ned', 'cersei', 'tyrion', 'joffrey', 'daenerys', 'olenna', 'arya')
       or char_length(btrim(v_item ->> 'title')) not between 1 and 80
       or char_length(btrim(v_item ->> 'verdict')) not between 1 and 2000
       or jsonb_array_length(v_item -> 'highlights') > 4
       or jsonb_array_length(v_item -> 'imagery') > 2 then
      raise exception 'invalid keepsake verdict row content' using errcode = '22023';
    end if;
    v_player_id := (v_item ->> 'player_id')::uuid;
    if v_player_id = any(v_player_ids) then
      raise exception 'duplicate keepsake verdict player' using errcode = '22023';
    end if;
    v_player_ids := array_append(v_player_ids, v_player_id);

    for v_nested in select value from jsonb_array_elements(v_item -> 'highlights')
    loop
      if jsonb_typeof(v_nested) is distinct from 'object'
         or not (v_nested ?& array['message_id', 'note'])
         or (select count(*) from jsonb_object_keys(v_nested)) <> 2
         or jsonb_typeof(v_nested -> 'message_id') is distinct from 'string'
         or jsonb_typeof(v_nested -> 'note') is distinct from 'string'
         or (v_nested ->> 'message_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         or char_length(v_nested ->> 'note') > 240 then
        raise exception 'invalid keepsake highlight' using errcode = '22023';
      end if;
      v_message_id := (v_nested ->> 'message_id')::uuid;
      if not exists (
        select 1 from public.messages message
        where message.id = v_message_id and message.room_id = p_room_id
      ) then
        raise exception 'keepsake highlight does not belong to the room' using errcode = '22023';
      end if;
    end loop;
    if (select count(*) from jsonb_array_elements(v_item -> 'highlights')) is distinct from
       (select count(distinct value ->> 'message_id') from jsonb_array_elements(v_item -> 'highlights')) then
      raise exception 'duplicate keepsake highlight' using errcode = '22023';
    end if;

    for v_nested in select value from jsonb_array_elements(v_item -> 'imagery')
    loop
      if jsonb_typeof(v_nested) is distinct from 'object'
         or not (v_nested ?& array['slot', 'slug', 'note'])
         or (select count(*) from jsonb_object_keys(v_nested)) <> 3
         or jsonb_typeof(v_nested -> 'slot') is distinct from 'string'
         or jsonb_typeof(v_nested -> 'slug') is distinct from 'string'
         or jsonb_typeof(v_nested -> 'note') is distinct from 'string'
         or (v_nested ->> 'slot') not in ('crest', 'hero')
         or char_length(v_nested ->> 'slug') not between 1 and 100
         or (v_nested ->> 'slug') !~ '^[a-z0-9_-]+$'
         or char_length(v_nested ->> 'note') > 240 then
        raise exception 'invalid keepsake imagery' using errcode = '22023';
      end if;
    end loop;
    if (select count(*) from jsonb_array_elements(v_item -> 'imagery')) is distinct from
       (select count(distinct value ->> 'slot') from jsonb_array_elements(v_item -> 'imagery'))
       or (select count(*) from jsonb_array_elements(v_item -> 'imagery')) is distinct from
       (select count(distinct value ->> 'slug') from jsonb_array_elements(v_item -> 'imagery')) then
      raise exception 'duplicate keepsake imagery' using errcode = '22023';
    end if;
  end loop;

  select array_agg(player.id order by player.id) into v_room_player_ids
  from public.players player where player.room_id = p_room_id;
  select array_agg(id order by id) into v_player_ids from unnest(v_player_ids) id;
  if v_player_ids is distinct from v_room_player_ids then
    raise exception 'keepsake verdict rows must match the complete room player set' using errcode = '22023';
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
  if p_attempts not between 1 and 3
     or p_model is null
     or char_length(btrim(p_model)) not between 1 and 80 then
    raise exception 'invalid keepsake grounding provenance' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_rows)
  loop
    insert into public.player_verdicts (
      room_id, player_id, companion_id, title, verdict, highlights, imagery,
      grounding_reaction_key, grounding_facts, grounding_attempts, grounding_model,
      grounded_at, created_at
    ) values (
      p_room_id,
      (v_item ->> 'player_id')::uuid,
      btrim(v_item ->> 'companion_id'),
      btrim(v_item ->> 'title'),
      btrim(v_item ->> 'verdict'),
      v_item -> 'highlights',
      v_item -> 'imagery',
      p_reaction_key,
      p_facts,
      p_attempts,
      btrim(p_model),
      v_now,
      v_now
    )
    on conflict (room_id, player_id) do update set
      companion_id = excluded.companion_id,
      title = excluded.title,
      verdict = excluded.verdict,
      highlights = excluded.highlights,
      imagery = excluded.imagery,
      grounding_reaction_key = excluded.grounding_reaction_key,
      grounding_facts = excluded.grounding_facts,
      grounding_attempts = excluded.grounding_attempts,
      grounding_model = excluded.grounding_model,
      grounded_at = excluded.grounded_at,
      created_at = excluded.created_at;
  end loop;

  update private.companion_reaction_claims claim
  set completed_at = v_now,
      lease_expires_at = greatest(claim.lease_expires_at, v_now)
  where claim.room_id = p_room_id and claim.reaction_key = p_reaction_key;

  return query select true, jsonb_array_length(p_rows);
end;
$$;

create or replace function public.guard_completed_grounded_player_verdicts()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_room_id uuid;
  v_completed_at timestamptz;
begin
  if auth.role() = 'service_role' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  v_room_id := case when tg_op = 'DELETE' then old.room_id else new.room_id end;
  select claim.completed_at into v_completed_at
  from private.companion_reaction_claims claim
  where claim.room_id = v_room_id
    and claim.reaction_key = 'keepsake:verdicts:v1'
  for share;
  if v_completed_at is not null then
    raise exception 'grounded keepsake verdicts are sealed' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists guard_completed_grounded_player_verdicts on public.player_verdicts;
create trigger guard_completed_grounded_player_verdicts
before insert or update or delete on public.player_verdicts
for each row execute function public.guard_completed_grounded_player_verdicts();

revoke all on function public.complete_grounded_player_verdicts(
  uuid, uuid, text, uuid, jsonb, jsonb, integer, text
) from public;
grant execute on function public.complete_grounded_player_verdicts(
  uuid, uuid, text, uuid, jsonb, jsonb, integer, text
) to anon, authenticated, service_role;

comment on function public.complete_grounded_player_verdicts(
  uuid, uuid, text, uuid, jsonb, jsonb, integer, text
) is 'Atomically writes the exact full-room grounded keepsake packet and completes its durable claim.';
comment on column public.player_verdicts.grounding_facts is
  'Exhaustive numbered-fact source projection audited before this keepsake prose was written.';
