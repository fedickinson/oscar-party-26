-- Scheduled winner declarations used to be three independent browser writes:
-- the winner row, correct confidence picks, and incorrect confidence picks.
-- Make confidence correctness a database-owned projection of room_winners so
-- new commands and mixed-version direct writes remain transactionally aligned.

create or replace function public.sync_confidence_outcomes_from_room_winner()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' or (
    tg_op = 'UPDATE' and (
      old.room_id is distinct from new.room_id
      or old.category_id is distinct from new.category_id
    )
  ) then
    update public.confidence_picks pick
    set is_correct = null
    where pick.room_id = old.room_id
      and pick.category_id = old.category_id
      and pick.is_correct is not null;
  end if;

  if tg_op <> 'DELETE' then
    update public.confidence_picks pick
    set is_correct = (
      pick.nominee_id = new.winner_id
      or (
        new.tie_winner_id is not null
        and pick.nominee_id = new.tie_winner_id
      )
    )
    where pick.room_id = new.room_id
      and pick.category_id = new.category_id
      and pick.is_correct is distinct from (
        pick.nominee_id = new.winner_id
        or (
          new.tie_winner_id is not null
          and pick.nominee_id = new.tie_winner_id
        )
      );
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists sync_confidence_outcomes_after_room_winner on public.room_winners;
create trigger sync_confidence_outcomes_after_room_winner
after insert or update or delete on public.room_winners
for each row execute function public.sync_confidence_outcomes_from_room_winner();

comment on function public.sync_confidence_outcomes_from_room_winner() is
  'Keeps confidence correctness transactionally derived from the provisional room winner, including mixed-version direct writes.';

-- Preserve rollout compatibility with older phones, which repeat the derived
-- correctness updates after writing room_winners, while rejecting any value
-- that disagrees with the canonical winner row. The confidence stake itself is
-- insert-only browser state and can only be created in its scheduled phase.
create or replace function public.guard_confidence_pick_projection()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
  v_expected boolean;
begin
  if auth.role() = 'service_role' then return new; end if;

  if tg_op = 'INSERT' then
    select room.* into v_room
    from public.rooms room
    where room.id = new.room_id;

    if not found then
      raise exception 'confidence room not found' using errcode = '23503';
    end if;
    if v_room.game_model <> 'legacy_ensemble'
       or v_room.phase <> 'confidence'::public.room_phase then
      raise exception 'confidence picks require the scheduled confidence phase' using errcode = '23514';
    end if;
    if not exists (
      select 1
      from public.players player
      where player.id = new.player_id
        and player.room_id = new.room_id
    ) then
      raise exception 'confidence player does not belong to the room' using errcode = '23514';
    end if;
    if new.is_correct is not null then
      raise exception 'confidence correctness is derived from the scheduled winner' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.room_id is distinct from old.room_id
     or new.player_id is distinct from old.player_id
     or new.category_id is distinct from old.category_id
     or new.nominee_id is distinct from old.nominee_id
     or new.confidence is distinct from old.confidence
     or new.created_at is distinct from old.created_at then
    raise exception 'a submitted confidence stake is immutable' using errcode = '23514';
  end if;

  select (
    new.nominee_id = winner.winner_id
    or (
      winner.tie_winner_id is not null
      and new.nominee_id = winner.tie_winner_id
    )
  ) into v_expected
  from public.room_winners winner
  where winner.room_id = new.room_id
    and winner.category_id = new.category_id;

  if not found then v_expected := null; end if;

  if new.is_correct is distinct from v_expected then
    raise exception 'confidence correctness must match the scheduled winner projection' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_confidence_pick_projection_write on public.confidence_picks;
create trigger guard_confidence_pick_projection_write
before insert or update on public.confidence_picks
for each row execute function public.guard_confidence_pick_projection();

comment on function public.guard_confidence_pick_projection() is
  'Makes browser confidence stakes insert-only and accepts only the correctness value derived from room_winners; service recovery remains explicit.';

create or replace function public.declare_scheduled_winner(
  p_room_id uuid,
  p_category_id integer,
  p_winner_id uuid,
  p_tie_winner_id uuid,
  p_actor_player_id uuid
)
returns public.room_winners
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
  v_existing public.room_winners%rowtype;
  v_result public.room_winners%rowtype;
begin
  select room.*
  into v_room
  from public.rooms room
  where room.id = p_room_id
  for update;

  if not found then
    raise exception 'room not found' using errcode = 'P0002';
  end if;
  if v_room.host_id is distinct from p_actor_player_id
     or not exists (
       select 1
       from public.players player
       where player.id = p_actor_player_id
         and player.room_id = p_room_id
         and player.is_host
     ) then
    raise exception 'only the room host may declare a scheduled winner' using errcode = '42501';
  end if;
  if v_room.phase <> 'live'::public.room_phase then
    raise exception 'scheduled winners may be declared only while the room is live' using errcode = '55000';
  end if;
  if v_room.game_model <> 'legacy_ensemble' then
    raise exception 'room does not use the scheduled winner model' using errcode = '55000';
  end if;
  if not exists (
    select 1
    from public.categories category
    where category.id = p_category_id
      and category.show_pack_id = v_room.show_pack_id
      and category.room_id is null
  ) then
    raise exception 'category does not belong to the room scheduled slate' using errcode = '23514';
  end if;
  if not exists (
    select 1
    from public.category_nominees candidate
    where candidate.category_id = p_category_id
      and candidate.nominee_id = p_winner_id
  ) then
    raise exception 'winner is not a candidate for the category' using errcode = '23514';
  end if;
  if p_tie_winner_id is not null and p_tie_winner_id = p_winner_id then
    raise exception 'tie winners must be distinct' using errcode = '23514';
  end if;
  if p_tie_winner_id is not null and not exists (
    select 1
    from public.category_nominees candidate
    where candidate.category_id = p_category_id
      and candidate.nominee_id = p_tie_winner_id
  ) then
    raise exception 'tie winner is not a candidate for the category' using errcode = '23514';
  end if;

  select winner.*
  into v_existing
  from public.room_winners winner
  where winner.room_id = p_room_id
    and winner.category_id = p_category_id
  for update;

  if found then
    if v_existing.winner_id = p_winner_id
       and v_existing.tie_winner_id is not distinct from p_tie_winner_id then
      return v_existing;
    end if;
    raise exception 'category is already resolved; undo it before declaring a different winner'
      using errcode = 'P0001';
  end if;

  insert into public.room_winners (
    room_id,
    category_id,
    winner_id,
    tie_winner_id
  ) values (
    p_room_id,
    p_category_id,
    p_winner_id,
    p_tie_winner_id
  )
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.declare_scheduled_winner(uuid, integer, uuid, uuid, uuid) from public;
grant execute on function public.declare_scheduled_winner(uuid, integer, uuid, uuid, uuid)
  to anon, authenticated, service_role;

comment on function public.declare_scheduled_winner(uuid, integer, uuid, uuid, uuid) is
  'Room-locked host command for an idempotent scheduled single/tie winner; confidence correctness follows from the room_winners trigger.';

create or replace function public.undo_scheduled_winner(
  p_room_id uuid,
  p_category_id integer,
  p_expected_winner_id uuid,
  p_expected_tie_winner_id uuid,
  p_actor_player_id uuid
)
returns public.room_winners
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
  v_result public.room_winners%rowtype;
begin
  select room.*
  into v_room
  from public.rooms room
  where room.id = p_room_id
  for update;

  if not found then
    raise exception 'room not found' using errcode = 'P0002';
  end if;
  if v_room.host_id is distinct from p_actor_player_id
     or not exists (
       select 1
       from public.players player
       where player.id = p_actor_player_id
         and player.room_id = p_room_id
         and player.is_host
     ) then
    raise exception 'only the room host may undo a scheduled winner' using errcode = '42501';
  end if;
  if v_room.phase not in ('live'::public.room_phase, 'finished'::public.room_phase) then
    raise exception 'scheduled winners may be undone only while the record is provisional' using errcode = '55000';
  end if;
  if v_room.game_model <> 'legacy_ensemble' then
    raise exception 'room does not use the scheduled winner model' using errcode = '55000';
  end if;
  if not exists (
    select 1
    from public.categories category
    where category.id = p_category_id
      and category.show_pack_id = v_room.show_pack_id
      and category.room_id is null
  ) then
    raise exception 'category does not belong to the room scheduled slate' using errcode = '23514';
  end if;

  delete from public.room_winners winner
  where winner.room_id = p_room_id
    and winner.category_id = p_category_id
    and winner.winner_id = p_expected_winner_id
    and winner.tie_winner_id is not distinct from p_expected_tie_winner_id
  returning * into v_result;

  if not found then
    raise exception 'scheduled winner changed before it could be undone' using errcode = 'P0001';
  end if;

  return v_result;
end;
$$;

revoke all on function public.undo_scheduled_winner(uuid, integer, uuid, uuid, uuid) from public;
grant execute on function public.undo_scheduled_winner(uuid, integer, uuid, uuid, uuid)
  to anon, authenticated, service_role;

comment on function public.undo_scheduled_winner(uuid, integer, uuid, uuid, uuid) is
  'Room-locked host compare-and-delete for one provisional scheduled result; confidence correctness resets in the same transaction.';
