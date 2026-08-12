-- A public host seat is presentation state, not caller identity. Mint the
-- private room bearer in the same transaction as a new room, then require the
-- current bearer plus current host seat for every shared pre-live transition.

create or replace function public.guard_room_operator_capability_revision()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.role() = 'service_role' then return new; end if;
  if tg_op = 'INSERT' then
    new.operator_capability_revision := 0;
  elsif new.operator_capability_revision is distinct from old.operator_capability_revision
    and current_setting('app.room_authority_id', true) is distinct from new.id::text then
    raise exception 'operator capability revision is database-owned' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.create_room_with_host(
  p_code text,
  p_name text,
  p_avatar_id text,
  p_color text
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, extensions, pg_temp
as $$
declare
  v_room_id uuid := gen_random_uuid();
  v_player_id uuid := gen_random_uuid();
  v_capability text := encode(extensions.gen_random_bytes(32), 'hex');
  v_room public.rooms%rowtype;
  v_player public.players%rowtype;
begin
  p_code := upper(trim(p_code));
  p_name := trim(p_name);
  p_avatar_id := trim(p_avatar_id);
  p_color := trim(p_color);

  if p_code is null or p_code !~ '^[A-Z0-9]{4,12}$' then
    raise exception 'room code must be 4 to 12 uppercase letters or numbers'
      using errcode = '22023';
  end if;
  if p_name is null or p_name = '' or char_length(p_name) > 24 then
    raise exception 'player name must be 1 to 24 characters' using errcode = '22023';
  end if;
  if p_avatar_id is null or p_avatar_id = '' or char_length(p_avatar_id) > 100 then
    raise exception 'avatar identity is required' using errcode = '22023';
  end if;
  if p_color is null or p_color = '' or char_length(p_color) > 64 then
    raise exception 'player color is required' using errcode = '22023';
  end if;

  perform set_config('app.room_authority_id', v_room_id::text, true);

  insert into public.rooms (id, code, host_id, phase, current_pick)
  values (v_room_id, p_code, null, 'lobby'::public.room_phase, 0);

  insert into public.players (
    id, room_id, name, avatar_id, color, is_host
  ) values (
    v_player_id, v_room_id, p_name, p_avatar_id, p_color, true
  ) returning * into v_player;

  insert into private.room_operator_capabilities (
    room_id, capability_sha256, generation, issued_at
  ) values (
    v_room_id,
    encode(extensions.digest(convert_to(v_capability, 'UTF8'), 'sha256'), 'hex'),
    1,
    clock_timestamp()
  );

  update public.rooms room
  set host_id = v_player_id,
      operator_capability_revision = 1
  where room.id = v_room_id
  returning room.* into v_room;

  -- Transaction-local authorization markers must never remain visible to a
  -- later RPC if a pooled database session reuses this transaction context.
  perform set_config('app.room_authority_id', '', true);

  return jsonb_build_object(
    'room', to_jsonb(v_room),
    'player', to_jsonb(v_player),
    'operator_capability', v_capability
  );
end;
$$;

create or replace function private.room_draft_pick_total(p_room public.rooms)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  return least(
      (select count(*)::integer from public.draft_entities entity
       where entity.show_pack_id = p_room.show_pack_id and entity.type = 'film'),
      jsonb_array_length(p_room.draft_order)
    ) + case when p_room.game_model = 'conviction_portfolio' then 0 else least(
      (select count(*)::integer
       from public.draft_entities entity
       where entity.show_pack_id = p_room.show_pack_id
         and entity.type = 'person'
         and case p_room.ensemble_mode
           when 'full' then true
           when 'films_only' then false
           when 'stars_and_films' then jsonb_typeof(entity.nominations) = 'array'
             and exists (
               select 1 from jsonb_array_elements(entity.nominations) nomination
               where nomination ->> 'category_id' in ('1', '8', '21', '22', '23')
             )
           else false
         end),
      jsonb_array_length(p_room.draft_order) * 4
    ) end;
end;
$$;

revoke all on function private.room_draft_pick_total(public.rooms)
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

create or replace function public.mark_player_ready(
  p_room_id uuid,
  p_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.players player
    where player.id = p_player_id and player.room_id = p_room_id
  ) then
    raise exception 'ready player does not belong to the room' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.rooms room
    where room.id = p_room_id and room.phase = 'pre_draft'::public.room_phase
  ) then
    raise exception 'players may ready only during pre-draft' using errcode = '55000';
  end if;

  perform set_config('app.player_room_id', p_room_id::text, true);
  update public.rooms room
  set ready_players = coalesce(room.ready_players, '[]'::jsonb) || to_jsonb(p_player_id::text)
  where room.id = p_room_id
    and not (coalesce(room.ready_players, '[]'::jsonb) @> to_jsonb(p_player_id::text));
  perform set_config('app.player_room_id', '', true);
end;
$$;

create or replace function public.begin_room_draft_countdown_authorized(
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
  if v_room.phase <> 'pre_draft'::public.room_phase then
    raise exception 'draft countdown requires the pre-draft phase' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.players player
    where player.room_id = p_room_id
      and not (coalesce(v_room.ready_players, '[]'::jsonb) @> to_jsonb(player.id::text))
  ) then
    raise exception 'every player must be ready before the countdown'
      using errcode = '23514';
  end if;
  if v_room.countdown_started_at is not null then return v_room; end if;

  perform set_config('app.room_authority_id', p_room_id::text, true);
  update public.rooms room set countdown_started_at = clock_timestamp()
  where room.id = p_room_id returning room.* into v_room;
  perform set_config('app.room_authority_id', '', true);
  return v_room;
end;
$$;

create or replace function public.open_room_draft_authorized(
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
  if v_room.phase = 'draft'::public.room_phase then return v_room; end if;
  if v_room.phase <> 'pre_draft'::public.room_phase
     or v_room.countdown_started_at is null
     or v_room.countdown_started_at > clock_timestamp() - interval '3 seconds' then
    raise exception 'the shared draft countdown has not completed' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.players player
    where player.room_id = p_room_id
      and not (coalesce(v_room.ready_players, '[]'::jsonb) @> to_jsonb(player.id::text))
  ) then
    raise exception 'every player must remain ready when the draft opens'
      using errcode = '23514';
  end if;

  perform set_config('app.room_authority_id', p_room_id::text, true);
  update public.rooms room set phase = 'draft'::public.room_phase
  where room.id = p_room_id returning room.* into v_room;
  perform set_config('app.room_authority_id', '', true);
  return v_room;
end;
$$;

create or replace function public.skip_room_draft_turn_authorized(
  p_room_id uuid,
  p_actor_player_id uuid,
  p_operator_capability text,
  p_expected_pick integer
)
returns public.rooms
language plpgsql
security definer
set search_path = private, public, extensions, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
  v_total integer;
begin
  perform private.require_room_referee_authority(
    p_room_id, p_actor_player_id, p_operator_capability
  );
  select room.* into v_room from public.rooms room where room.id = p_room_id for update;
  if v_room.phase <> 'draft'::public.room_phase then
    raise exception 'draft turn is stale' using errcode = '23514';
  end if;
  if v_room.current_pick = p_expected_pick + 1 then return v_room; end if;
  if v_room.current_pick is distinct from p_expected_pick then
    raise exception 'draft turn is stale' using errcode = '23514';
  end if;
  if jsonb_typeof(v_room.draft_order) is distinct from 'array'
     or jsonb_array_length(v_room.draft_order) = 0 then
    raise exception 'draft order is missing' using errcode = '23514';
  end if;
  v_total := private.room_draft_pick_total(v_room);
  if p_expected_pick < 0 or p_expected_pick >= v_total - 1 then
    raise exception 'the final draft turn cannot be skipped' using errcode = '23514';
  end if;

  perform set_config('app.room_authority_id', p_room_id::text, true);
  update public.rooms room set current_pick = p_expected_pick + 1
  where room.id = p_room_id returning room.* into v_room;
  perform set_config('app.room_authority_id', '', true);
  return v_room;
end;
$$;

create or replace function public.complete_room_draft_authorized(
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
  if v_room.phase <> 'draft'::public.room_phase
     or jsonb_typeof(v_room.draft_order) is distinct from 'array'
     or v_room.current_pick < private.room_draft_pick_total(v_room) then
    raise exception 'the draft ledger is not complete' using errcode = '55000';
  end if;

  perform set_config('app.room_authority_id', p_room_id::text, true);
  update public.rooms room set phase = 'confidence'::public.room_phase
  where room.id = p_room_id returning room.* into v_room;
  perform set_config('app.room_authority_id', '', true);
  return v_room;
end;
$$;

create or replace function public.open_room_live_authorized(
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
  if v_room.phase = 'live'::public.room_phase then return v_room; end if;
  if v_room.phase <> 'confidence'::public.room_phase then
    raise exception 'only the prediction floor may open live play' using errcode = '55000';
  end if;

  perform set_config('app.room_authority_id', p_room_id::text, true);
  update public.rooms room set phase = 'live'::public.room_phase
  where room.id = p_room_id returning room.* into v_room;
  perform set_config('app.room_authority_id', '', true);
  return v_room;
end;
$$;

-- A draft pick remains a player-owned direct insert, but its existing trigger
-- advances rooms.current_pick in the same transaction. Mark that exact room
-- explicitly before the validating/advancing trigger runs; trigger names are
-- ordered alphabetically, so aaa_authorize_* precedes every existing guard.
create or replace function public.aaa_authorize_draft_pick_room()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $atomic_draft_authority$
begin
  if auth.role() <> 'service_role' then
    perform set_config('app.atomic_draft_room_id', new.room_id::text, true);
  end if;
  return new;
end;
$atomic_draft_authority$;

create or replace function public.clear_draft_pick_room_authority()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $atomic_draft_cleanup$
begin
  perform set_config('app.atomic_draft_room_id', '', true);
  return new;
end;
$atomic_draft_cleanup$;

drop trigger if exists aaa_authorize_draft_pick_room on public.draft_picks;
create trigger aaa_authorize_draft_pick_room
before insert on public.draft_picks
for each row execute function public.aaa_authorize_draft_pick_room();

drop trigger if exists zz_clear_draft_pick_room_authority on public.draft_picks;
create trigger zz_clear_draft_pick_room_authority
after insert on public.draft_picks
for each row execute function public.clear_draft_pick_room_authority();

revoke all on function public.aaa_authorize_draft_pick_room()
  from public, anon, authenticated;
revoke all on function public.clear_draft_pick_room_authority()
  from public, anon, authenticated;

create or replace function public.guard_room_phase_authority()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_authorized boolean;
begin
  if auth.role() = 'service_role' or tg_op = 'INSERT' then return new; end if;

  v_authorized := coalesce(
    current_setting('app.room_authority_id', true) = new.id::text,
    false
  ) or coalesce(
    current_setting('app.referee_room_id', true) = new.id::text,
    false
  );

  if (new.host_id is distinct from old.host_id
      or new.phase is distinct from old.phase
      or new.draft_order is distinct from old.draft_order
      or new.countdown_started_at is distinct from old.countdown_started_at)
     and not v_authorized then
    raise exception 'shared room transitions require an authorized operator command'
      using errcode = '42501';
  end if;
  if new.current_pick is distinct from old.current_pick
     and not v_authorized
     and current_setting('app.atomic_draft_room_id', true) is distinct from new.id::text then
    raise exception 'draft turn changes require an authorized command or atomic pick'
      using errcode = '42501';
  end if;
  if new.ready_players is distinct from old.ready_players
     and not v_authorized
     and current_setting('app.player_room_id', true) is distinct from new.id::text then
    raise exception 'ready state changes require the player-ready command'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_room_phase_authority on public.rooms;
create trigger guard_room_phase_authority
before update of host_id, phase, draft_order, current_pick, ready_players, countdown_started_at
on public.rooms for each row execute function public.guard_room_phase_authority();

create or replace function public.guard_player_host_authority()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_room_id uuid;
begin
  if auth.role() = 'service_role' then return new; end if;
  v_room_id := case when tg_op = 'DELETE' then old.room_id else new.room_id end;
  if (tg_op = 'INSERT' and coalesce(new.is_host, false))
     or (tg_op = 'UPDATE' and new.is_host is distinct from old.is_host) then
    if current_setting('app.room_authority_id', true) is distinct from v_room_id::text
       then
      raise exception 'host seat changes require an authorized room command'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_player_host_authority_insert on public.players;
create trigger guard_player_host_authority_insert
before insert on public.players
for each row execute function public.guard_player_host_authority();

drop trigger if exists guard_player_host_authority_update on public.players;
create trigger guard_player_host_authority_update
before update of is_host on public.players
for each row execute function public.guard_player_host_authority();

revoke all on function public.guard_room_phase_authority()
  from public, anon, authenticated;
revoke all on function public.guard_player_host_authority()
  from public, anon, authenticated;

revoke all on function public.create_room_with_host(text, text, text, text) from public;
revoke all on function public.begin_room_draft_authorized(uuid, uuid, text, jsonb) from public;
revoke all on function public.begin_room_draft_countdown_authorized(uuid, uuid, text) from public;
revoke all on function public.open_room_draft_authorized(uuid, uuid, text) from public;
revoke all on function public.skip_room_draft_turn_authorized(uuid, uuid, text, integer) from public;
revoke all on function public.complete_room_draft_authorized(uuid, uuid, text) from public;
revoke all on function public.open_room_live_authorized(uuid, uuid, text) from public;
revoke all on function public.mark_player_ready(uuid, uuid) from public;

grant execute on function public.create_room_with_host(text, text, text, text)
  to anon, authenticated, service_role;
grant execute on function public.begin_room_draft_authorized(uuid, uuid, text, jsonb)
  to anon, authenticated, service_role;
grant execute on function public.begin_room_draft_countdown_authorized(uuid, uuid, text)
  to anon, authenticated, service_role;
grant execute on function public.open_room_draft_authorized(uuid, uuid, text)
  to anon, authenticated, service_role;
grant execute on function public.skip_room_draft_turn_authorized(uuid, uuid, text, integer)
  to anon, authenticated, service_role;
grant execute on function public.complete_room_draft_authorized(uuid, uuid, text)
  to anon, authenticated, service_role;
grant execute on function public.open_room_live_authorized(uuid, uuid, text)
  to anon, authenticated, service_role;
grant execute on function public.mark_player_ready(uuid, uuid)
  to anon, authenticated, service_role;

-- New anonymous rooms must be born through create_room_with_host so there is
-- no gap in which a public host id is the room's only authority. Existing room
-- rows remain readable and their non-authority player interactions still use
-- the ordinary table policies.
revoke insert on public.rooms from anon, authenticated;

comment on function public.create_room_with_host(text, text, text, text) is
  'Atomically creates a lobby, its host seat, and the first private room capability.';
comment on function public.begin_room_draft_authorized(uuid, uuid, text, jsonb) is
  'Capability-gated lobby-to-pre-draft command with a complete canonical roster order.';
comment on function public.begin_room_draft_countdown_authorized(uuid, uuid, text) is
  'Capability-gated database timestamp for the all-ready countdown.';
comment on function public.open_room_draft_authorized(uuid, uuid, text) is
  'Capability-gated pre-draft-to-draft command after the shared countdown.';
comment on function public.skip_room_draft_turn_authorized(uuid, uuid, text, integer) is
  'Capability-gated optimistic draft skip that preserves the final player-owned turn.';
comment on function public.complete_room_draft_authorized(uuid, uuid, text) is
  'Capability-gated draft-to-prediction command after every turn is spent.';
comment on function public.open_room_live_authorized(uuid, uuid, text) is
  'Capability-gated prediction-to-live phase command.';
