-- A category id says what is open, but cannot distinguish close/reopen cycles.
-- Give every database-observed spotlight opening a monotonic room-owned identity
-- and timestamp so browser reloads, racing host tabs and legacy dividers agree
-- on which ceremony they are handling.

alter table public.rooms
  add column if not exists spotlight_revision bigint not null default 0
    check (spotlight_revision >= 0),
  add column if not exists spotlight_opened_at timestamptz;

create or replace function public.guard_room_spotlight_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Snapshot restore and explicit repair may preserve exact historical state.
  if auth.role() = 'service_role' then return new; end if;

  if tg_op = 'INSERT' then
    new.spotlight_revision := 0;
    new.spotlight_opened_at := null;
    return new;
  end if;

  if new.active_spotlight_category_id is distinct from old.active_spotlight_category_id then
    if new.active_spotlight_category_id is not null then
      new.spotlight_revision := old.spotlight_revision + 1;
      new.spotlight_opened_at := clock_timestamp();
    else
      new.spotlight_revision := old.spotlight_revision;
      new.spotlight_opened_at := old.spotlight_opened_at;
    end if;
  elsif new.spotlight_revision is distinct from old.spotlight_revision
     or new.spotlight_opened_at is distinct from old.spotlight_opened_at then
    raise exception 'spotlight transition metadata is database-owned' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger initialize_room_spotlight_transition
before insert on public.rooms
for each row execute function public.guard_room_spotlight_transition();

create trigger advance_room_spotlight_transition
before update of active_spotlight_category_id, spotlight_revision, spotlight_opened_at
on public.rooms
for each row execute function public.guard_room_spotlight_transition();

comment on column public.rooms.spotlight_revision is
  'Database-owned monotonic identity for non-null spotlight openings; zero is inherited baseline state.';
comment on column public.rooms.spotlight_opened_at is
  'Database time at which the latest non-null spotlight revision opened; closing preserves it.';
comment on function public.guard_room_spotlight_transition() is
  'Advances immutable spotlight opening metadata for old and new clients alike.';
