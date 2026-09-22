-- Post-show keepsakes for up to ten players.
--
-- WHY: the keepsake writer was authored for the seven-companion legacy room and
-- still rejects any packet whose row count exceeds seven. A pack room can seat
-- more people than the legacy cast has voices - the VMA rehearsal plans for four
-- to ten - and because the command demands the COMPLETE room player set, an
-- eighth player does not degrade the keepsake, it removes it: every attempt
-- fails and the room finishes with no keepsake at all. Widening the row bound to
-- one through ten, and the packet byte ceiling proportionally from 30000 to
-- 45000 (the same ~4300 bytes of headroom per row), restores the artifact for
-- the rooms we actually run.
--
-- ADDITIVE: this adds no column, drops nothing, renames nothing and retypes
-- nothing. It only relaxes an input bound, so every packet the old definition
-- accepted the new one still accepts, byte for byte, with the identical
-- complete-room-set check, the identical single claim key
-- 'keepsake:verdicts:v1' and the identical seal. An older bundle that still
-- sends at most seven rows is unaffected. A newer bundle running against a
-- database where this has NOT been applied gets the old, readable
-- 'keepsake verdicts require one through seven bounded rows' rejection.
--
-- APPLY BETWEEN SHOWS. It is a protected action (AGENTS.md: applying migrations
-- to the live project). Nothing here is hot-swappable mid-room: replacing the
-- function while a host tab is mid-keepsake would change the validator under an
-- open claim. Apply it with no live room, confirm with the user first.
--
-- SCOPE: only public.complete_grounded_player_verdicts changes. Its callers -
-- public.complete_grounded_player_verdicts_authorized (20260810193400) and
-- public.complete_grounded_runtime_player_verdicts_authorized (20260813000400)
-- - delegate row validation here and are deliberately left alone. The 1..7 bound
-- inside the runtime wrapper counts the pack's post-show VOICES, not players,
-- and is unrelated to how many people sit in the room. The body below is the
-- definition currently in the database: the 20260810192900 original carrying the
-- explicit uuid[] initializer applied by 20260812062100.

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
  v_player_ids uuid[] := '{}'::uuid[];
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
     or jsonb_array_length(p_rows) not between 1 and 10
     or octet_length(p_rows::text) > 45000 then
    raise exception 'keepsake verdicts require one through ten bounded rows' using errcode = '22023';
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

-- Privileges are restated exactly as they stand today, not as 20260810192900
-- first wrote them. That migration granted execute to anon and authenticated;
-- 20260810193400 revoked both when it put the operator-capability wrapper in
-- front of this command. create or replace preserves the existing ACL, so these
-- three statements are a no-op assertion of the current, narrower grant rather
-- than a re-widening of it.
revoke all on function public.complete_grounded_player_verdicts(
  uuid, uuid, text, uuid, jsonb, jsonb, integer, text
) from public;
revoke execute on function public.complete_grounded_player_verdicts(
  uuid, uuid, text, uuid, jsonb, jsonb, integer, text
) from anon, authenticated;
grant execute on function public.complete_grounded_player_verdicts(
  uuid, uuid, text, uuid, jsonb, jsonb, integer, text
) to service_role;

comment on function public.complete_grounded_player_verdicts(
  uuid, uuid, text, uuid, jsonb, jsonb, integer, text
) is 'Atomically writes the exact full-room grounded keepsake packet and completes its durable claim.';
