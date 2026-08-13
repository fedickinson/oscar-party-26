-- A Story Night may deliberately omit identity or use a shared, non-scoring
-- faction/banner choice. The room-bound contract owns that decision: each
-- ceremony has a distinct command path, and mixed-version clients fail closed.

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
        and p_contract->>'conviction_budget' is not null
        and p_contract->'identity' in (
          '{"selection":"exclusive_entity_draft","scoring":"none"}'::jsonb,
          '{"selection":"chosen_faction","scoring":"none"}'::jsonb,
          '{"selection":"none","scoring":"none"}'::jsonb
        )
        and p_contract->'scarcity' = jsonb_build_object(
          'commitments', 'fixed_budget',
          'identity', case p_contract#>>'{identity,selection}'
            when 'exclusive_entity_draft' then 'exclusive'
            when 'chosen_faction' then 'shared'
            else 'none'
          end
        )
        and p_contract->>'visibility' = 'open_counts'
        and p_contract->>'cadence' = 'immediate_facts_and_event_close'
        and p_contract->>'continuity' = 'canon_write_back'
      )
    ), false)
$$;

alter table public.players
  add constraint players_id_room_id_unique unique (id, room_id);

create table if not exists public.player_identity_selections (
  player_id uuid primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  show_pack_id uuid not null references public.show_packs(id),
  choice_key text not null check (length(btrim(choice_key)) between 1 and 100),
  selected_at timestamptz not null default now(),
  foreign key (player_id, room_id)
    references public.players(id, room_id) on delete cascade
);

create index if not exists player_identity_selections_room_id_idx
  on public.player_identity_selections(room_id);

alter table public.player_identity_selections enable row level security;
alter table public.player_identity_selections replica identity full;

drop policy if exists "identity selections are readable" on public.player_identity_selections;
create policy "identity selections are readable"
  on public.player_identity_selections for select to anon, authenticated
  using (true);

revoke all on table public.player_identity_selections from public, anon, authenticated;
grant select on table public.player_identity_selections to anon, authenticated;
grant all on table public.player_identity_selections to service_role;

do $$ begin
  alter publication supabase_realtime add table public.player_identity_selections;
exception when duplicate_object then null;
end $$;

create or replace function public.show_pack_identity_choices(p_show_pack_id uuid)
returns table(choice_key text)
language sql
stable
set search_path = public, pg_temp
as $$
  select authored.choice_key
  from (
    select btrim(entity.value->>'group') as choice_key,
           min(entity.ordinality) as first_authored
    from public.show_packs pack
    cross join lateral jsonb_array_elements(
      coalesce(pack.compiled_bundle->'entities', '[]'::jsonb)
    ) with ordinality as entity(value, ordinality)
    where pack.id = p_show_pack_id
      and pack.status = 'published'
      and length(btrim(entity.value->>'group')) > 0
    group by btrim(entity.value->>'group')
  ) authored
  order by authored.first_authored, authored.choice_key
$$;

revoke all on function public.show_pack_identity_choices(uuid) from public;
grant execute on function public.show_pack_identity_choices(uuid)
  to anon, authenticated, service_role;

create or replace function public.set_player_identity_choice(
  p_room_id uuid,
  p_actor_player_id uuid,
  p_choice_key text
)
returns public.player_identity_selections
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
  v_selection public.player_identity_selections%rowtype;
  v_choice_key text := btrim(p_choice_key);
begin
  select room.* into v_room
  from public.rooms room
  where room.id = p_room_id
  for key share;
  if not found then
    raise exception 'room not found' using errcode = 'P0002';
  end if;
  if v_room.phase <> 'lobby'::public.room_phase then
    raise exception 'identity choices are frozen after the lobby' using errcode = '55000';
  end if;
  if v_room.game_contract->>'commitment' is distinct from 'open_conviction'
     or v_room.game_contract#>>'{identity,selection}' is distinct from 'chosen_faction'
     or v_room.game_contract#>>'{identity,scoring}' is distinct from 'none'
     or v_room.game_contract#>>'{scarcity,identity}' is distinct from 'shared' then
    raise exception 'the room contract does not include shared faction choice'
      using errcode = '55000';
  end if;
  if not exists (
    select 1 from public.players player
    where player.id = p_actor_player_id and player.room_id = p_room_id
  ) then
    raise exception 'the acting player is not seated in this room' using errcode = '42501';
  end if;
  if v_choice_key is null or not exists (
    select 1
    from public.show_pack_identity_choices(v_room.show_pack_id) authored
    where authored.choice_key = v_choice_key
  ) then
    raise exception 'identity choice is not authored by this room show pack'
      using errcode = '23514';
  end if;

  insert into public.player_identity_selections (player_id, room_id, show_pack_id, choice_key)
  values (p_actor_player_id, p_room_id, v_room.show_pack_id, v_choice_key)
  on conflict (player_id) do update
  set room_id = excluded.room_id,
      show_pack_id = excluded.show_pack_id,
      choice_key = excluded.choice_key,
      selected_at = now()
  returning * into v_selection;
  return v_selection;
end;
$$;

revoke all on function public.set_player_identity_choice(uuid, uuid, text) from public;
grant execute on function public.set_player_identity_choice(uuid, uuid, text)
  to anon, authenticated, service_role;

create or replace function public.guard_chosen_faction_player_join()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
begin
  select room.* into v_room
  from public.rooms room
  where room.id = new.room_id
  for key share;
  if not found then return new; end if;
  if v_room.game_contract#>>'{identity,selection}' = 'chosen_faction'
     and v_room.phase <> 'lobby'::public.room_phase then
    raise exception 'chosen-faction rooms cannot add an unselected seat after the lobby'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_chosen_faction_player_join on public.players;
create trigger guard_chosen_faction_player_join
before insert on public.players
for each row execute function public.guard_chosen_faction_player_join();

revoke all on function public.guard_chosen_faction_player_join()
  from public, anon, authenticated;

create or replace function public.begin_room_draft_authorized(
  p_room_id uuid,
  p_actor_player_id uuid,
  p_operator_capability text,
  p_draft_order jsonb
)
returns public.rooms
language plpgsql
security definer
set search_path = private, public, extensions, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
begin
  perform private.require_room_referee_authority(
    p_room_id, p_actor_player_id, p_operator_capability
  );
  select room.* into v_room from public.rooms room where room.id = p_room_id for update;
  if v_room.phase <> 'lobby'::public.room_phase then
    raise exception 'only a lobby may begin the draft ceremony' using errcode = '55000';
  end if;
  if v_room.game_contract#>>'{identity,selection}' is distinct from 'exclusive_entity_draft' then
    raise exception 'the room contract does not include an identity draft' using errcode = '55000';
  end if;
  if jsonb_typeof(p_draft_order) is distinct from 'array'
     or jsonb_array_length(p_draft_order) < 2
     or jsonb_array_length(p_draft_order) <> (
       select count(*) from public.players player where player.room_id = p_room_id
     )
     or exists (
       select 1
       from jsonb_array_elements_text(p_draft_order) as requested(player_id)
       group by requested.player_id having count(*) <> 1
     )
     or exists (
       select 1
       from jsonb_array_elements_text(p_draft_order) as requested(player_id)
       left join public.players player
         on player.id::text = requested.player_id and player.room_id = p_room_id
       where player.id is null
     ) then
    raise exception 'draft order must contain every room player exactly once'
      using errcode = '23514';
  end if;

  perform set_config('app.room_authority_id', p_room_id::text, true);
  update public.rooms room
  set phase = 'pre_draft'::public.room_phase,
      draft_order = p_draft_order,
      current_pick = 0,
      ready_players = '[]'::jsonb,
      countdown_started_at = null
  where room.id = p_room_id
  returning room.* into v_room;
  perform set_config('app.room_authority_id', '', true);
  return v_room;
end;
$$;

create or replace function public.begin_room_convictions_authorized(
  p_room_id uuid,
  p_actor_player_id uuid,
  p_operator_capability text
)
returns public.rooms
language plpgsql
security definer
set search_path = private, public, extensions, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
begin
  perform private.require_room_referee_authority(
    p_room_id, p_actor_player_id, p_operator_capability
  );
  select room.* into v_room from public.rooms room where room.id = p_room_id for update;
  if v_room.phase = 'confidence'::public.room_phase then return v_room; end if;
  if v_room.phase <> 'lobby'::public.room_phase then
    raise exception 'only a lobby may open convictions directly' using errcode = '55000';
  end if;
  if v_room.game_contract->>'commitment' is distinct from 'open_conviction'
     or v_room.game_contract#>>'{identity,scoring}' is distinct from 'none' then
    raise exception 'the room contract requires an identity ceremony' using errcode = '55000';
  end if;
  if v_room.game_contract#>>'{identity,selection}' = 'none'
     and v_room.game_contract#>>'{scarcity,identity}' = 'none' then
    null;
  elsif v_room.game_contract#>>'{identity,selection}' = 'chosen_faction'
        and v_room.game_contract#>>'{scarcity,identity}' = 'shared' then
    if exists (
      select 1
      from public.players player
      where player.room_id = p_room_id
        and not exists (
          select 1
          from public.player_identity_selections selection
          where selection.player_id = player.id
            and selection.room_id = p_room_id
            and selection.show_pack_id = v_room.show_pack_id
            and exists (
              select 1
              from public.show_pack_identity_choices(v_room.show_pack_id) authored
              where authored.choice_key = selection.choice_key
            )
        )
    ) then
      raise exception 'every room player must choose an authored faction before convictions open'
        using errcode = '23514';
    end if;
  else
    raise exception 'the room contract requires an identity ceremony' using errcode = '55000';
  end if;
  if (select count(*) from public.players player where player.room_id = p_room_id) < 2 then
    raise exception 'the room needs at least two players before convictions open'
      using errcode = '23514';
  end if;

  perform set_config('app.room_authority_id', p_room_id::text, true);
  update public.rooms room
  set phase = 'confidence'::public.room_phase,
      draft_order = '[]'::jsonb,
      current_pick = 0,
      ready_players = '[]'::jsonb,
      countdown_started_at = null
  where room.id = p_room_id
  returning room.* into v_room;
  perform set_config('app.room_authority_id', '', true);
  return v_room;
end;
$$;

revoke all on function public.begin_room_convictions_authorized(uuid, uuid, text) from public;
grant execute on function public.begin_room_convictions_authorized(uuid, uuid, text)
  to anon, authenticated, service_role;

comment on function public.begin_room_draft_authorized(uuid, uuid, text, jsonb) is
  'Capability-gated lobby-to-pre-draft command allowed only by an exclusive identity-draft contract.';
comment on function public.begin_room_convictions_authorized(uuid, uuid, text) is
  'Capability-gated lobby-to-convictions command for no-identity rooms or chosen-faction rooms whose occupied seats have all selected.';
comment on function public.show_pack_identity_choices(uuid) is
  'Ordered shared identity options derived from the immutable entity groups in one published show pack.';
comment on function public.set_player_identity_choice(uuid, uuid, text) is
  'Lobby-only per-seat shared identity selection, validated against the room-bound show pack.';
comment on function public.guard_chosen_faction_player_join() is
  'Serializes chosen-faction joins against lobby close so convictions cannot acquire an unselected late seat.';
