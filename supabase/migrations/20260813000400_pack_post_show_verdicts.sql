-- Preserve the legacy keepsake command exactly while allowing a published,
-- room-bound show pack to persist the voice ids in its complete post-show
-- contract. The existing command remains the canonical validator and atomic
-- writer for player coverage, highlights, grounding evidence and claim state.

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
  if current_setting('app.runtime_verdict_room_id', true) = v_room_id::text then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
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

create or replace function private.runtime_keepsake_rows_are_artwork_free(p_rows jsonb)
returns boolean
language plpgsql
immutable
set search_path = private, public, pg_temp
as $$
begin
  if jsonb_typeof(p_rows) is distinct from 'array' then return false; end if;
  return not exists (
    select 1
    from jsonb_array_elements(p_rows) item
    where jsonb_typeof(item) is distinct from 'object'
      or jsonb_typeof(item -> 'imagery') is distinct from 'array'
      or jsonb_array_length(item -> 'imagery') <> 0
  );
exception when others then
  return false;
end;
$$;

revoke all on function private.runtime_keepsake_rows_are_artwork_free(jsonb) from public;

create or replace function public.complete_grounded_runtime_player_verdicts_authorized(
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
declare
  v_room public.rooms%rowtype;
  v_pack public.show_packs%rowtype;
  v_voice_count integer;
  v_post_show_count integer;
  v_item jsonb;
  v_surrogate_rows jsonb;
  v_result record;
begin
  perform private.require_room_operator_capability(p_room_id, p_operator_capability);

  select room.* into v_room
  from public.rooms room
  where room.id = p_room_id
  for share;
  if v_room.id is null then raise exception 'room not found' using errcode = 'P0002'; end if;
  if v_room.show_pack_id = '8f27e9a4-9f6b-4f3a-9c91-a6b862c98101'::uuid then
    raise exception 'legacy rooms use the legacy keepsake command' using errcode = '22023';
  end if;

  select pack.* into v_pack
  from public.show_packs pack
  where pack.id = v_room.show_pack_id and pack.status = 'published';
  if v_pack.id is null or jsonb_typeof(v_pack.compiled_bundle) <> 'object'
     or jsonb_typeof(v_pack.compiled_bundle -> 'commentary_voices') <> 'array' then
    raise exception 'room show pack has no published runtime cast' using errcode = '22023';
  end if;

  select count(*), count(*) filter (
    where jsonb_typeof(voice -> 'runtime') = 'object'
      and jsonb_typeof(voice #> '{runtime,post_show}') = 'object'
      and jsonb_typeof(voice #> '{runtime,post_show,farewell}') = 'object'
      and jsonb_typeof(voice #> '{runtime,post_show,keepsake}') = 'object'
  ) into v_voice_count, v_post_show_count
  from jsonb_array_elements(v_pack.compiled_bundle -> 'commentary_voices') voice;
  if v_voice_count not between 1 and 7 or v_post_show_count <> v_voice_count then
    raise exception 'room show pack has no complete post-show voice contract' using errcode = '22023';
  end if;

  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'runtime keepsake rows must be an array' using errcode = '22023';
  end if;
  if not private.runtime_keepsake_rows_are_artwork_free(p_rows) then
    raise exception 'runtime keepsake rows require empty imagery until the pack owns artwork'
      using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_rows)
  loop
    if jsonb_typeof(v_item) is distinct from 'object'
       or jsonb_typeof(v_item -> 'companion_id') is distinct from 'string'
       or not exists (
         select 1
         from jsonb_array_elements(v_pack.compiled_bundle -> 'commentary_voices') voice
         where voice ->> 'id' = v_item ->> 'companion_id'
           and jsonb_typeof(voice #> '{runtime,post_show}') = 'object'
       ) then
      raise exception 'runtime keepsake row names a voice outside the room post-show cast'
        using errcode = '22023';
    end if;
  end loop;

  select jsonb_agg(
    jsonb_set(item.value, '{companion_id}', to_jsonb('ned'::text), false)
    order by item.ordinality
  ) into v_surrogate_rows
  from jsonb_array_elements(p_rows) with ordinality item(value, ordinality);

  select result.* into v_result
  from public.complete_grounded_player_verdicts(
    p_room_id,
    p_actor_player_id,
    p_reaction_key,
    p_instance_id,
    v_surrogate_rows,
    p_facts,
    p_attempts,
    p_model
  ) result;
  if not coalesce(v_result.completed, false) then
    return query select false, coalesce(v_result.written_count, 0);
    return;
  end if;

  perform set_config('app.runtime_verdict_room_id', p_room_id::text, true);
  for v_item in select value from jsonb_array_elements(p_rows)
  loop
    update public.player_verdicts verdict
    set companion_id = btrim(v_item ->> 'companion_id')
    where verdict.room_id = p_room_id
      and verdict.player_id = (v_item ->> 'player_id')::uuid;
  end loop;
  perform set_config('app.runtime_verdict_room_id', '', true);

  return query select true, v_result.written_count;
end;
$$;

revoke all on function public.complete_grounded_runtime_player_verdicts_authorized(
  uuid, uuid, text, uuid, jsonb, jsonb, integer, text, text
) from public;
grant execute on function public.complete_grounded_runtime_player_verdicts_authorized(
  uuid, uuid, text, uuid, jsonb, jsonb, integer, text, text
) to anon, authenticated, service_role;

comment on function public.complete_grounded_runtime_player_verdicts_authorized(
  uuid, uuid, text, uuid, jsonb, jsonb, integer, text, text
) is 'Atomically persists grounded keepsakes under the exact post-show voice ids authored by the room-bound published show pack.';
