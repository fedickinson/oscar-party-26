-- Bingo remains an honor-system game, but one public seat handle must be able
-- to deal and mark only that seat's own room-bound card. Move both writes into
-- idempotent commands, validate the authored square set in the database and
-- reject the old broad anonymous table mutations.

create or replace function private.require_room_bingo_member(
  p_room_id uuid,
  p_player_id uuid
)
returns public.players
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_player public.players%rowtype;
begin
  select player.* into v_player
  from public.players player
  where player.id = p_player_id and player.room_id = p_room_id;
  if not found then
    raise exception 'bingo actor does not belong to the room' using errcode = '42501';
  end if;
  return v_player;
end;
$$;

revoke all on function private.require_room_bingo_member(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.deal_player_bingo_card(
  p_room_id uuid,
  p_actor_player_id uuid,
  p_squares jsonb
)
returns public.bingo_cards
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
  v_card public.bingo_cards%rowtype;
  v_live_square_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_room_id::text, 0)
  );
  perform private.require_room_bingo_member(p_room_id, p_actor_player_id);

  select room.* into v_room
  from public.rooms room where room.id = p_room_id for update;
  if not found then raise exception 'room not found' using errcode = 'P0002'; end if;

  select card.* into v_card
  from public.bingo_cards card
  where card.room_id = p_room_id and card.player_id = p_actor_player_id
  for update;
  if found then return v_card; end if;

  if v_room.phase not in (
    'lobby'::public.room_phase,
    'pre_draft'::public.room_phase,
    'draft'::public.room_phase,
    'confidence'::public.room_phase,
    'live'::public.room_phase
  ) then
    raise exception 'bingo cards may be dealt only before the live floor closes'
      using errcode = '55000';
  end if;
  if jsonb_typeof(p_squares) is distinct from 'array'
     or jsonb_array_length(p_squares) <> 25 then
    raise exception 'bingo card must contain exactly 25 positions' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_squares) with ordinality position(value, ordinal)
    where jsonb_typeof(position.value) <> 'number'
       or position.value::text !~ '^[0-9]+$'
       or (position.ordinal = 13 and position.value::text <> '0')
       or (position.ordinal <> 13 and position.value::text = '0')
  ) then
    raise exception 'bingo card positions must be integer square ids with one center sentinel'
      using errcode = '22023';
  end if;
  if (
    select count(distinct position.value::text)
    from jsonb_array_elements(p_squares) with ordinality position(value, ordinal)
    where position.ordinal <> 13
  ) <> 24 then
    raise exception 'bingo card must contain 24 distinct authored squares'
      using errcode = '22023';
  end if;

  select count(*) into v_live_square_count
  from jsonb_array_elements_text(p_squares) with ordinality position(square_id, ordinal)
  join public.bingo_squares square
    on square.id = position.square_id::integer
   and square.show_pack_id = v_room.show_pack_id
  where position.ordinal <> 13;
  if v_live_square_count <> 24 then
    raise exception 'bingo card contains a square outside the room show pack'
      using errcode = '23514';
  end if;

  perform set_config('app.bingo_card_room_id', p_room_id::text, true);
  insert into public.bingo_cards (room_id, player_id, squares)
  values (p_room_id, p_actor_player_id, p_squares)
  returning * into v_card;
  perform set_config('app.bingo_card_room_id', '', true);
  return v_card;
end;
$$;

create or replace function public.set_player_bingo_mark(
  p_room_id uuid,
  p_actor_player_id uuid,
  p_card_id uuid,
  p_square_index integer,
  p_marked boolean
)
returns public.bingo_marks
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
  v_card public.bingo_cards%rowtype;
  v_mark public.bingo_marks%rowtype;
  v_square_id integer;
  v_mark_exists boolean;
begin
  if p_marked is null then
    raise exception 'bingo mark intent is required' using errcode = '22023';
  end if;
  if p_square_index is null or p_square_index < 0 or p_square_index > 24
     or p_square_index = 12 then
    raise exception 'bingo square index must name a non-center card position'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_room_id::text, 0)
  );
  perform private.require_room_bingo_member(p_room_id, p_actor_player_id);
  select room.* into v_room
  from public.rooms room where room.id = p_room_id for update;
  if not found then raise exception 'room not found' using errcode = 'P0002'; end if;
  if v_room.phase <> 'live'::public.room_phase then
    raise exception 'bingo marks may change only during live play' using errcode = '55000';
  end if;

  select card.* into v_card
  from public.bingo_cards card
  where card.id = p_card_id
    and card.room_id = p_room_id
    and card.player_id = p_actor_player_id
  for update;
  if not found then
    raise exception 'bingo actor does not own that room card' using errcode = '42501';
  end if;

  begin
    v_square_id := (v_card.squares ->> p_square_index)::integer;
  exception when others then
    raise exception 'bingo card position is not an authored square' using errcode = '23514';
  end;
  if v_square_id = 0 or not exists (
    select 1 from public.bingo_squares square
    where square.id = v_square_id and square.show_pack_id = v_room.show_pack_id
  ) then
    raise exception 'bingo card position is not an authored room square'
      using errcode = '23514';
  end if;

  select mark.* into v_mark
  from public.bingo_marks mark
  where mark.card_id = p_card_id and mark.square_index = p_square_index
  for update;
  v_mark_exists := found;

  perform set_config('app.bingo_mark_room_id', p_room_id::text, true);
  if p_marked then
    if v_mark_exists and v_mark.status = 'approved'::public.bingo_mark_status then
      perform set_config('app.bingo_mark_room_id', '', true);
      return v_mark;
    elsif v_mark_exists then
      update public.bingo_marks mark
      set status = 'approved'::public.bingo_mark_status,
          marked_at = clock_timestamp()
      where mark.id = v_mark.id
      returning mark.* into v_mark;
    else
      insert into public.bingo_marks (card_id, square_index, status, marked_at)
      values (
        p_card_id,
        p_square_index,
        'approved'::public.bingo_mark_status,
        clock_timestamp()
      )
      returning * into v_mark;
    end if;
  elsif v_mark_exists then
    delete from public.bingo_marks mark
    where mark.id = v_mark.id
    returning mark.* into v_mark;
  else
    v_mark := null;
  end if;
  perform set_config('app.bingo_mark_room_id', '', true);
  return v_mark;
end;
$$;

create or replace function public.guard_bingo_card_command_authority()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room_id uuid;
begin
  if auth.role() = 'service_role' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  v_room_id := case when tg_op = 'DELETE' then old.room_id else new.room_id end;
  if current_setting('app.bingo_card_room_id', true) is distinct from v_room_id::text
     or (tg_op = 'UPDATE' and (
       new.id is distinct from old.id
       or new.room_id is distinct from old.room_id
       or new.player_id is distinct from old.player_id
       or new.squares is distinct from old.squares
       or new.created_at is distinct from old.created_at
     )) then
    raise exception 'bingo cards require the player-owned deal command'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create or replace function public.guard_bingo_mark_command_authority()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old_room_id uuid;
  v_new_room_id uuid;
begin
  if auth.role() = 'service_role' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;
  if tg_op <> 'INSERT' then
    select card.room_id into v_old_room_id
    from public.bingo_cards card where card.id = old.card_id;
  end if;
  if tg_op <> 'DELETE' then
    select card.room_id into v_new_room_id
    from public.bingo_cards card where card.id = new.card_id;
  end if;
  if current_setting('app.bingo_mark_room_id', true)
       is distinct from coalesce(v_new_room_id, v_old_room_id)::text
     or (tg_op = 'UPDATE' and new.card_id is distinct from old.card_id) then
    raise exception 'bingo marks require the player-owned mark command'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists guard_bingo_card_authority on public.bingo_cards;
create trigger guard_bingo_card_authority
before insert or update or delete on public.bingo_cards
for each row execute function public.guard_bingo_card_command_authority();

drop trigger if exists guard_bingo_mark_authority on public.bingo_marks;
create trigger guard_bingo_mark_authority
before insert or update or delete on public.bingo_marks
for each row execute function public.guard_bingo_mark_command_authority();

revoke all on function public.guard_bingo_card_command_authority()
  from public, anon, authenticated;
revoke all on function public.guard_bingo_mark_command_authority()
  from public, anon, authenticated;
revoke all on function public.deal_player_bingo_card(uuid, uuid, jsonb) from public;
revoke all on function public.set_player_bingo_mark(uuid, uuid, uuid, integer, boolean)
  from public;
grant execute on function public.deal_player_bingo_card(uuid, uuid, jsonb)
  to anon, authenticated, service_role;
grant execute on function public.set_player_bingo_mark(uuid, uuid, uuid, integer, boolean)
  to anon, authenticated, service_role;

revoke insert, update, delete, truncate on public.bingo_cards from anon, authenticated;
revoke insert, update, delete, truncate on public.bingo_marks from anon, authenticated;

comment on function public.deal_player_bingo_card(uuid, uuid, jsonb) is
  'Idempotently deals one validated room-pack bingo card to the named room seat.';
comment on function public.set_player_bingo_mark(uuid, uuid, uuid, integer, boolean) is
  'Idempotently sets or clears one non-center mark on the named room seat own card.';
