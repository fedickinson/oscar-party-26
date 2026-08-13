-- P2 begins by making the Story Night portfolio size pack-owned. The room's
-- immutable copied game contract is the only budget authority for activation,
-- browser choices and database enforcement.

create or replace function public.show_pack_game_contract_is_executable(p_contract jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(
    public.show_pack_game_contract_is_valid(p_contract)
    and (
      p_contract = public.results_night_game_contract()
      or (
        p_contract->>'commitment' = 'open_conviction'
        and (p_contract - 'conviction_budget')
          = (public.story_night_game_contract() - 'conviction_budget')
      )
    ), false)
$$;

create or replace function public.show_pack_is_playable(p_show_pack_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select
    exists (
      select 1
      from public.show_packs pack
      where pack.id = p_show_pack_id
        and public.show_pack_game_contract_is_executable(pack.game_contract)
        and (
          pack.game_contract->>'commitment' <> 'open_conviction'
          or (
            select count(*)
            from public.signature_beats beat
            where beat.show_pack_id = pack.id
          ) >= (pack.game_contract->>'conviction_budget')::integer
        )
    )
    and exists (
      select 1
      from public.categories category
      join public.category_nominees candidate on candidate.category_id = category.id
      where category.show_pack_id = p_show_pack_id
      group by category.id
      having count(*) >= 2
    )
    and exists (select 1 from public.draft_entities where show_pack_id = p_show_pack_id)
    and exists (select 1 from public.signature_beats where show_pack_id = p_show_pack_id)
    and (select count(*) from public.bingo_squares where show_pack_id = p_show_pack_id) >= 24
$$;

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
  v_budget integer;
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
  if v_room.game_model <> 'conviction_portfolio'
     or v_room.phase <> 'confidence'
     or v_room.game_contract->>'commitment' <> 'open_conviction' then
    raise exception 'conviction picks require the conviction phase' using errcode = '23514';
  end if;

  v_budget := (v_room.game_contract->>'conviction_budget')::integer;
  if v_budget is null or v_budget < 1 then
    raise exception 'conviction room has no valid portfolio budget' using errcode = '23514';
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
    if v_count >= v_budget then
      raise exception 'conviction portfolio already uses all % slots', v_budget using errcode = '23514';
    end if;
    return new;
  end if;
  return old;
end;
$$;

comment on function public.show_pack_game_contract_is_executable(jsonb) is
  'Allows the proven Results profile and the proven Story profile with a positive pack-owned conviction budget.';
comment on function public.show_pack_is_playable(uuid) is
  'Requires normalized play data and enough authored Story beats to fill the pack-owned conviction budget.';
