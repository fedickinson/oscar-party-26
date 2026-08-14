-- The authored compiler is the first post-show contract gate. Repeat the
-- essential identity and cadence checks in Postgres so a malformed bundle can
-- never use the security-definer keepsake path as a second source of truth.

create or replace function public.show_pack_post_show_contract_is_valid(p_bundle jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_voices jsonb;
  v_count integer;
  v_voice jsonb;
  v_index integer;
  v_previous_delay integer := -1;
begin
  if jsonb_typeof(p_bundle) is distinct from 'object'
     or jsonb_typeof(p_bundle -> 'commentary_voices') is distinct from 'array' then return false; end if;
  v_voices := p_bundle -> 'commentary_voices';
  v_count := jsonb_array_length(v_voices);
  if v_count not between 1 and 7 then return false; end if;
  if (select count(distinct voice ->> 'id') from jsonb_array_elements(v_voices) voice) <> v_count
     or exists (
       select 1 from jsonb_array_elements(v_voices) voice
       where jsonb_typeof(voice -> 'id') is distinct from 'string'
         or (voice ->> 'id') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
         or jsonb_typeof(voice #> '{runtime,post_show}') is distinct from 'object'
         or jsonb_typeof(voice #> '{runtime,post_show,farewell}') is distinct from 'object'
         or jsonb_typeof(voice #> '{runtime,post_show,keepsake}') is distinct from 'object'
         or jsonb_typeof(voice #> '{runtime,post_show,farewell,order}') is distinct from 'number'
         or jsonb_typeof(voice #> '{runtime,post_show,farewell,delay_seconds}') is distinct from 'number'
         or jsonb_typeof(voice #> '{runtime,post_show,farewell,instruction}') is distinct from 'string'
         or char_length(btrim(voice #>> '{runtime,post_show,farewell,instruction}')) = 0
         or jsonb_typeof(voice #> '{runtime,post_show,keepsake,instruction}') is distinct from 'string'
         or char_length(btrim(voice #>> '{runtime,post_show,keepsake,instruction}')) = 0
     ) then return false; end if;

  for v_voice in
    select voice
    from jsonb_array_elements(v_voices) voice
    order by (voice #>> '{runtime,post_show,farewell,order}')::integer
  loop
    v_index := coalesce(v_index, 0) + 1;
    if (v_voice #>> '{runtime,post_show,farewell,order}')::numeric <> v_index
       or (v_index = 1
         and (v_voice #>> '{runtime,post_show,farewell,delay_seconds}')::numeric <> 0)
       or (v_voice #>> '{runtime,post_show,farewell,delay_seconds}')::numeric < 0
       or (v_voice #>> '{runtime,post_show,farewell,delay_seconds}')::numeric > 90
       or (v_voice #>> '{runtime,post_show,farewell,delay_seconds}')::numeric <>
          trunc((v_voice #>> '{runtime,post_show,farewell,delay_seconds}')::numeric)
       or (v_voice #>> '{runtime,post_show,farewell,delay_seconds}')::integer <= v_previous_delay then
      return false;
    end if;
    v_previous_delay := (v_voice #>> '{runtime,post_show,farewell,delay_seconds}')::integer;
  end loop;
  return v_previous_delay >= 0;
exception when others then
  return false;
end;
$$;

create or replace function private.room_post_show_voice_is_valid(
  p_room_id uuid,
  p_voice_id text
)
returns boolean
language sql
stable
security definer
set search_path = private, public, pg_temp
as $$
  select coalesce(bool_or(
    room.show_pack_id <> '8f27e9a4-9f6b-4f3a-9c91-a6b862c98101'::uuid
    and pack.status = 'published'
    and public.show_pack_post_show_contract_is_valid(pack.compiled_bundle)
    and exists (
      select 1
      from jsonb_array_elements(pack.compiled_bundle -> 'commentary_voices') voice
      where voice ->> 'id' = p_voice_id
    )
  ), false)
  from public.rooms room
  join public.show_packs pack on pack.id = room.show_pack_id
  where room.id = p_room_id
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
  if current_setting('app.runtime_verdict_room_id', true) = v_room_id::text then
    if tg_op = 'DELETE'
       or not private.room_post_show_voice_is_valid(v_room_id, new.companion_id) then
      raise exception 'runtime keepsake byline is outside the room post-show contract'
        using errcode = '42501';
    end if;
    return new;
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

revoke all on function public.show_pack_post_show_contract_is_valid(jsonb) from public;
grant execute on function public.show_pack_post_show_contract_is_valid(jsonb)
  to anon, authenticated, service_role;
revoke all on function private.room_post_show_voice_is_valid(uuid, text) from public;

comment on function public.show_pack_post_show_contract_is_valid(jsonb) is
  'Pure database validation for a complete pack-owned post-show voice roster and exact farewell cadence.';
