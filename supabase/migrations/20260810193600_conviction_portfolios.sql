-- New rooms may move scarcity from character ownership to a fixed open
-- portfolio of authored beats. Historical rooms retain the legacy ensemble
-- model; the current bundle opts newly created rooms into conviction.

alter table public.rooms
  add column if not exists game_model text not null default 'legacy_ensemble';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.rooms'::regclass
      and conname = 'rooms_game_model_check'
  ) then
    alter table public.rooms add constraint rooms_game_model_check
      check (game_model in ('legacy_ensemble', 'conviction_portfolio'));
  end if;
end $$;

create table if not exists public.conviction_picks (
  room_id uuid not null references public.rooms(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  beat_id integer not null references public.signature_beats(id) on delete cascade,
  created_at timestamp with time zone not null default now(),
  primary key (room_id, player_id, beat_id)
);

create or replace function public.guard_room_game_model()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.game_model is not distinct from old.game_model then return new; end if;
  if old.phase <> 'lobby'
     or exists (select 1 from public.draft_picks where room_id = old.id)
     or exists (select 1 from public.confidence_picks where room_id = old.id)
     or exists (select 1 from public.conviction_picks where room_id = old.id)
     or exists (select 1 from public.bingo_cards where room_id = old.id) then
    raise exception 'room game model is immutable after play begins' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_room_game_model_write on public.rooms;
create trigger guard_room_game_model_write
before update of game_model on public.rooms
for each row execute function public.guard_room_game_model();

alter table public.conviction_picks enable row level security;

drop policy if exists conviction_picks_select on public.conviction_picks;
create policy conviction_picks_select on public.conviction_picks
for select to anon, authenticated using (true);

drop policy if exists conviction_picks_insert on public.conviction_picks;
create policy conviction_picks_insert on public.conviction_picks
for insert to anon, authenticated with check (true);

drop policy if exists conviction_picks_delete on public.conviction_picks;
create policy conviction_picks_delete on public.conviction_picks
for delete to anon, authenticated using (true);

grant select, insert, delete on public.conviction_picks to anon, authenticated;
grant all on public.conviction_picks to service_role;

do $$
begin
  alter publication supabase_realtime add table public.conviction_picks;
exception when duplicate_object then null;
end $$;

create or replace function public.guard_conviction_pick()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_room_id uuid;
  v_player_id uuid;
  v_beat_id integer;
  v_room public.rooms%rowtype;
  v_count integer;
begin
  if auth.role() = 'service_role' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op = 'UPDATE' then
    raise exception 'conviction picks are immutable; delete and choose again' using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    v_room_id := old.room_id;
    v_player_id := old.player_id;
    v_beat_id := old.beat_id;
  else
    v_room_id := new.room_id;
    v_player_id := new.player_id;
    v_beat_id := new.beat_id;
  end if;

  select room.* into v_room
  from public.rooms room
  where room.id = v_room_id
  for key share;

  if not found then
    raise exception 'conviction room not found' using errcode = '23503';
  end if;
  if v_room.game_model <> 'conviction_portfolio' or v_room.phase <> 'confidence' then
    raise exception 'conviction picks require the conviction phase' using errcode = '23514';
  end if;

  -- The player lock serializes two simultaneous final-slot taps on one phone.
  perform 1 from public.players player
  where player.id = v_player_id and player.room_id = v_room_id
  for update;
  if not found then
    raise exception 'conviction pick belongs to another room' using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.signature_beats beat
    where beat.id = v_beat_id and beat.show_pack_id = v_room.show_pack_id
  ) then
    raise exception 'conviction pick must use its room catalog' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    select count(*) into v_count
    from public.conviction_picks pick
    where pick.room_id = v_room_id and pick.player_id = v_player_id;
    if v_count >= 12 then
      raise exception 'conviction portfolio already uses all 12 slots' using errcode = '23514';
    end if;
    return new;
  end if;
  return old;
end;
$$;

drop trigger if exists guard_conviction_pick_write on public.conviction_picks;
create trigger guard_conviction_pick_write
before insert or update or delete on public.conviction_picks
for each row execute function public.guard_conviction_pick();

create or replace function public.guard_conviction_declaration_once()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.source_signature_beat_id is null then return new; end if;
  if exists (
    select 1 from public.rooms room
    where room.id = new.room_id and room.game_model = 'conviction_portfolio'
  ) and exists (
    select 1 from public.categories category
    where category.room_id = new.room_id
      and category.source_signature_beat_id = new.source_signature_beat_id
      and category.id <> coalesce(new.id, -1)
  ) then
    raise exception 'conviction beat is already declared in this room' using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_conviction_declaration_once on public.categories;
create trigger guard_conviction_declaration_once
before insert or update of room_id, source_signature_beat_id on public.categories
for each row execute function public.guard_conviction_declaration_once();

-- Keep the existing atomic draft command, but conviction rooms stop after the
-- one-film identity round instead of assigning four character owners.
create or replace function public.guard_atomic_draft_pick()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
  v_player_count integer;
  v_film_count integer;
  v_person_count integer;
  v_film_picks integer;
  v_person_picks integer;
  v_total_picks integer;
  v_local_pick integer;
  v_round_index integer;
  v_position integer;
  v_order_index integer;
  v_expected_player_id text;
  v_expected_type public.entity_type;
  v_entity_type public.entity_type;
  v_entity_eligible boolean;
begin
  if auth.role() = 'service_role' then return new; end if;

  select room.* into v_room
  from public.rooms room
  where room.id = new.room_id
  for update;

  if not found then raise exception 'draft room not found' using errcode = '23503'; end if;
  if v_room.phase <> 'draft' then
    raise exception 'draft picks require the draft phase' using errcode = '23514';
  end if;
  if v_room.current_pick is distinct from new.pick_number then
    raise exception 'draft turn is stale' using errcode = '23514';
  end if;
  if jsonb_typeof(v_room.draft_order) is distinct from 'array'
     or jsonb_array_length(v_room.draft_order) = 0 then
    raise exception 'draft order is missing' using errcode = '23514';
  end if;

  v_player_count := jsonb_array_length(v_room.draft_order);
  select count(*) into v_film_count from public.draft_entities entity
  where entity.show_pack_id = v_room.show_pack_id and entity.type = 'film';
  select count(*) into v_person_count
  from public.draft_entities entity
  where entity.show_pack_id = v_room.show_pack_id
    and entity.type = 'person'
    and case v_room.ensemble_mode
      when 'full' then true
      when 'films_only' then false
      when 'stars_and_films' then
        jsonb_typeof(entity.nominations) = 'array'
        and exists (
          select 1 from jsonb_array_elements(entity.nominations) nomination
          where nomination ->> 'category_id' in ('1', '8', '21', '22', '23')
        )
      else false
    end;

  v_film_picks := least(v_film_count, v_player_count);
  v_person_picks := case
    when v_room.game_model = 'conviction_portfolio' then 0
    else least(v_person_count, v_player_count * 4)
  end;
  v_total_picks := v_film_picks + v_person_picks;

  if new.pick_number < 0 or new.pick_number >= v_total_picks then
    raise exception 'draft is complete' using errcode = '23514';
  end if;
  if new.pick_number < v_film_picks then
    v_expected_type := 'film';
    v_local_pick := new.pick_number;
  else
    v_expected_type := 'person';
    v_local_pick := new.pick_number - v_film_picks;
  end if;

  v_round_index := v_local_pick / v_player_count;
  v_position := v_local_pick % v_player_count;
  v_order_index := case when v_round_index % 2 = 0 then v_position
    else v_player_count - 1 - v_position end;
  v_expected_player_id := v_room.draft_order ->> v_order_index;

  if new.player_id::text is distinct from v_expected_player_id
     or not exists (
       select 1 from public.players player
       where player.id = new.player_id and player.room_id = new.room_id
     ) then
    raise exception 'draft pick belongs to another turn' using errcode = '23514';
  end if;

  select entity.type,
    case v_room.ensemble_mode
      when 'full' then true
      when 'films_only' then entity.type = 'film'
      when 'stars_and_films' then entity.type = 'film' or (
        entity.type = 'person'
        and jsonb_typeof(entity.nominations) = 'array'
        and exists (
          select 1 from jsonb_array_elements(entity.nominations) nomination
          where nomination ->> 'category_id' in ('1', '8', '21', '22', '23')
        )
      )
      else false
    end
  into v_entity_type, v_entity_eligible
  from public.draft_entities entity
  where entity.id = new.entity_id and entity.show_pack_id = v_room.show_pack_id;

  if not found or not coalesce(v_entity_eligible, false) or v_entity_type <> v_expected_type then
    raise exception 'draft entity is not eligible for this turn' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.draft_picks pick
    where pick.room_id = new.room_id
      and (pick.pick_number = new.pick_number or pick.entity_id = new.entity_id)
  ) then
    raise exception 'draft pick is already claimed' using errcode = '23505';
  end if;

  new.round := v_round_index + 1;
  update public.rooms set current_pick = new.pick_number + 1
  where id = new.room_id and phase = 'draft' and current_pick = new.pick_number;
  if not found then
    raise exception 'draft turn could not advance' using errcode = '23514';
  end if;
  return new;
end;
$$;
