-- A draft claim and its turn advance are one database transaction. The
-- deployed client used to insert first and advance rooms.current_pick second;
-- a concurrent loser could therefore leave a permanent orphan pick. Keeping
-- this contract on INSERT also makes already-open clients safe: their later
-- conditional room update simply matches zero rows.

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
  -- Snapshot restore and explicit operator repair preserve historical rows
  -- without replaying the live turn machine.
  if auth.role() = 'service_role' then
    return new;
  end if;

  select room.* into v_room
  from public.rooms room
  where room.id = new.room_id
  for update;

  if not found then
    raise exception 'draft room not found' using errcode = '23503';
  end if;
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

  select count(*) into v_film_count
  from public.draft_entities entity
  where entity.show_pack_id = v_room.show_pack_id
    and entity.type = 'film';

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
          select 1
          from jsonb_array_elements(entity.nominations) nomination
          where nomination ->> 'category_id' in ('1', '8', '21', '22', '23')
        )
      else false
    end;

  -- The client authors one film round followed by at most four person rounds.
  v_film_picks := least(v_film_count, v_player_count);
  v_person_picks := least(v_person_count, v_player_count * 4);
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
  v_order_index := case
    when v_round_index % 2 = 0 then v_position
    else v_player_count - 1 - v_position
  end;
  v_expected_player_id := v_room.draft_order ->> v_order_index;

  if new.player_id::text is distinct from v_expected_player_id
     or not exists (
       select 1 from public.players player
       where player.id = new.player_id and player.room_id = new.room_id
     ) then
    raise exception 'draft pick belongs to another turn' using errcode = '23514';
  end if;

  select
    entity.type,
    case v_room.ensemble_mode
      when 'full' then true
      when 'films_only' then entity.type = 'film'
      when 'stars_and_films' then
        entity.type = 'film'
        or (
          entity.type = 'person'
          and jsonb_typeof(entity.nominations) = 'array'
          and exists (
            select 1
            from jsonb_array_elements(entity.nominations) nomination
            where nomination ->> 'category_id' in ('1', '8', '21', '22', '23')
          )
        )
      else false
    end
  into v_entity_type, v_entity_eligible
  from public.draft_entities entity
  where entity.id = new.entity_id
    and entity.show_pack_id = v_room.show_pack_id;

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

  -- Round is derived from the sub-draft. Normalizing it here preserves older
  -- clients that counted the film segment as part of the person round number.
  new.round := v_round_index + 1;

  update public.rooms
  set current_pick = new.pick_number + 1
  where id = new.room_id
    and phase = 'draft'
    and current_pick = new.pick_number;

  if not found then
    raise exception 'draft turn could not advance' using errcode = '23514';
  end if;
  return new;
end;
$$;
