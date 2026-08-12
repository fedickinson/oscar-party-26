-- Residual grounding findings are never publishable prose. Preserve them in a
-- private operator queue and use a room revision for Realtime invalidation.

alter table public.rooms
  add column if not exists grounding_review_revision bigint default 0 not null
  check (grounding_review_revision >= 0);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.companion_grounding_reviews (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  reaction_key text not null check (
    char_length(reaction_key) between 1 and 180
    and reaction_key ~ '^[a-z0-9:_-]+$'
  ),
  surface text not null check (
    char_length(surface) between 1 and 40
    and surface ~ '^[a-z0-9_-]+$'
  ),
  engine text not null check (engine in ('browser', 'daemon')),
  facts jsonb not null check (jsonb_typeof(facts) = 'array'),
  attempted_messages jsonb not null check (jsonb_typeof(attempted_messages) = 'array'),
  findings jsonb not null check (jsonb_typeof(findings) = 'array'),
  attempts integer not null check (attempts between 1 and 3),
  model text not null check (char_length(btrim(model)) between 1 and 80),
  status text not null default 'pending' check (status in ('pending', 'dismissed')),
  reviewed_by uuid references public.players(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or
    (status = 'dismissed' and reviewed_by is not null and reviewed_at is not null)
  )
);

create unique index if not exists companion_grounding_one_pending_reaction
  on private.companion_grounding_reviews(room_id, reaction_key)
  where status = 'pending';
create index if not exists companion_grounding_room_status_created
  on private.companion_grounding_reviews(room_id, status, created_at);

revoke all on private.companion_grounding_reviews from public, anon, authenticated;
grant all on private.companion_grounding_reviews to service_role;

create or replace function public.advance_companion_grounding_review_revision()
returns trigger
language plpgsql
set search_path = public, private, pg_temp
as $$
begin
  update public.rooms
  set grounding_review_revision = grounding_review_revision + 1
  where id = new.room_id;
  return new;
end;
$$;

create trigger advance_companion_grounding_review_revision
after insert or update on private.companion_grounding_reviews
for each row execute function public.advance_companion_grounding_review_revision();

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
     or jsonb_array_length(p_attempted_messages) > 4
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
     or jsonb_array_length(p_findings) not between 1 and 4
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

create or replace function public.list_pending_companion_grounding_reviews(
  p_room_id uuid,
  p_actor_player_id uuid
)
returns table (
  id uuid,
  reaction_key text,
  surface text,
  engine text,
  facts jsonb,
  attempted_messages jsonb,
  findings jsonb,
  attempts integer,
  model text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, private, pg_temp
as $$
begin
  if not exists (
    select 1 from public.rooms room
    where room.id = p_room_id and room.host_id = p_actor_player_id
  ) then
    raise exception 'only the room host may read grounding reviews' using errcode = '42501';
  end if;

  return query
  select
    review.id,
    review.reaction_key,
    review.surface,
    review.engine,
    review.facts,
    review.attempted_messages,
    review.findings,
    review.attempts,
    review.model,
    review.created_at
  from private.companion_grounding_reviews review
  where review.room_id = p_room_id and review.status = 'pending'
  order by review.created_at, review.id;
end;
$$;

create or replace function public.dismiss_companion_grounding_review(
  p_room_id uuid,
  p_review_id uuid,
  p_actor_player_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_updated uuid;
begin
  if not exists (
    select 1 from public.rooms room
    where room.id = p_room_id and room.host_id = p_actor_player_id
  ) then
    raise exception 'only the room host may dismiss grounding reviews' using errcode = '42501';
  end if;

  update private.companion_grounding_reviews review
  set status = 'dismissed',
      reviewed_by = p_actor_player_id,
      reviewed_at = clock_timestamp()
  where review.id = p_review_id
    and review.room_id = p_room_id
    and review.status = 'pending'
  returning review.id into v_updated;
  return v_updated is not null;
end;
$$;

revoke all on function public.record_companion_grounding_review(
  uuid, uuid, text, text, text, jsonb, jsonb, jsonb, integer, text
) from public;
revoke all on function public.list_pending_companion_grounding_reviews(uuid, uuid) from public;
revoke all on function public.dismiss_companion_grounding_review(uuid, uuid, uuid) from public;
grant execute on function public.record_companion_grounding_review(
  uuid, uuid, text, text, text, jsonb, jsonb, jsonb, integer, text
) to anon, authenticated, service_role;
grant execute on function public.list_pending_companion_grounding_reviews(uuid, uuid)
  to anon, authenticated, service_role;
grant execute on function public.dismiss_companion_grounding_review(uuid, uuid, uuid)
  to anon, authenticated, service_role;

comment on table private.companion_grounding_reviews is
  'Exact residual findings from generated batches that were blocked before chat persistence.';
comment on column public.rooms.grounding_review_revision is
  'Realtime invalidation counter for the host-only companion grounding review queue.';
