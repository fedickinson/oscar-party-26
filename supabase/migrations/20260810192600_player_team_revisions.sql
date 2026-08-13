-- Team changes are narrative events, but the player row previously retained
-- only the latest side. Give every transition a database-owned identity and
-- retain its immediately prior side so mixed-version clients and host reloads
-- can derive the same announcement and grounded reaction keys.

alter table public.players
  add column if not exists previous_team text,
  add column if not exists team_revision bigint not null default 0
    check (team_revision >= 0);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.players'::regclass
      and conname = 'players_previous_team_check'
  ) then
    alter table public.players
      add constraint players_previous_team_check
      check (previous_team is null or previous_team in ('black', 'green'));
  end if;
end
$$;

create or replace function public.guard_player_team_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Service-role snapshot restore and explicit repair may preserve an exact
  -- historical row. Ordinary clients never author revision metadata.
  if auth.role() = 'service_role' then return new; end if;

  if tg_op = 'INSERT' then
    new.previous_team := null;
    new.team_revision := 0;
    return new;
  end if;

  if new.team is distinct from old.team then
    new.previous_team := old.team;
    new.team_revision := old.team_revision + 1;
  elsif new.previous_team is distinct from old.previous_team
     or new.team_revision is distinct from old.team_revision then
    raise exception 'team transition metadata is database-owned' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger initialize_player_team_transition
before insert on public.players
for each row execute function public.guard_player_team_transition();

create trigger advance_player_team_transition
before update of team, previous_team, team_revision on public.players
for each row execute function public.guard_player_team_transition();

comment on column public.players.previous_team is
  'Immediately prior allegiance for the latest database-observed team transition.';
comment on column public.players.team_revision is
  'Database-owned monotonic identity for player allegiance transitions; zero is inherited baseline state.';
comment on function public.guard_player_team_transition() is
  'Normalizes client inserts and advances immutable team transition metadata exactly once per allegiance change.';
