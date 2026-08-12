-- Settlement closes both the outcome ledger and every room-scoped input that
-- can change its scores, recaps or provisional history. Old or stale anonymous
-- clients may keep running, but they cannot revise the closed record.
-- Service-role repair remains explicit operator authority and must be followed
-- by a new settlement version.

create or replace function public.guard_closed_room_record_input()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_old_room_id uuid;
  v_new_room_id uuid;
begin
  if auth.role() = 'service_role' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op <> 'INSERT' then v_old_room_id := old.room_id; end if;
  if tg_op <> 'DELETE' then v_new_room_id := new.room_id; end if;

  if exists (
    select 1 from public.rooms room
    where room.phase = 'closed'
      and room.id in (v_old_room_id, v_new_room_id)
  ) then
    raise exception 'room data is frozen after settlement' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create trigger guard_closed_players
before insert or update or delete on public.players
for each row execute function public.guard_closed_room_record_input();

create trigger guard_closed_confidence_picks
before insert or update or delete on public.confidence_picks
for each row execute function public.guard_closed_room_record_input();

create trigger guard_closed_draft_picks
before insert or update or delete on public.draft_picks
for each row execute function public.guard_closed_room_record_input();

create trigger guard_closed_bingo_cards
before insert or update or delete on public.bingo_cards
for each row execute function public.guard_closed_room_record_input();

create trigger guard_closed_messages
before insert or update or delete on public.messages
for each row execute function public.guard_closed_room_record_input();

create trigger guard_closed_player_verdicts
before insert or update or delete on public.player_verdicts
for each row execute function public.guard_closed_room_record_input();

create trigger guard_closed_beat_activations
before insert or update or delete on public.beat_activations
for each row execute function public.guard_closed_room_record_input();

create trigger guard_closed_room_winners
before insert or update or delete on public.room_winners
for each row execute function public.guard_closed_room_record_input();

create or replace function public.guard_closed_room_bingo_mark()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_old_card_id uuid;
  v_new_card_id uuid;
begin
  if auth.role() = 'service_role' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  if tg_op <> 'INSERT' then v_old_card_id := old.card_id; end if;
  if tg_op <> 'DELETE' then v_new_card_id := new.card_id; end if;

  if exists (
    select 1
    from public.bingo_cards card
    join public.rooms room on room.id = card.room_id
    where room.phase = 'closed'
      and card.id in (v_old_card_id, v_new_card_id)
  ) then
    raise exception 'live bingo data is frozen after settlement' using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

create trigger guard_closed_bingo_marks
before insert or update or delete on public.bingo_marks
for each row execute function public.guard_closed_room_bingo_mark();

create or replace function public.guard_active_settlement_category_values()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.role() = 'service_role'
     or (new.points is not distinct from old.points and new.tier is not distinct from old.tier) then
    return new;
  end if;

  if exists (
    select 1
    from public.rooms room
    join public.room_settlements settlement on settlement.id = room.active_settlement_id
    join public.room_settlement_entries entry on entry.settlement_id = settlement.id
    where room.phase = 'closed' and entry.category_id = old.id
  ) then
    raise exception 'category points and tier are frozen by an active settlement' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger guard_settled_category_values
before update on public.categories
for each row execute function public.guard_active_settlement_category_values();
