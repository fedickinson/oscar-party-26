-- A pack-authored shared identity may change during the live room. Preserve the
-- exact prior choice and a monotonic revision so every client can narrate the
-- same transition once without treating a lobby selection as a live event.

alter table public.player_identity_selections
  add column if not exists previous_choice_key text,
  add column if not exists revision bigint not null default 0,
  add column if not exists changed_in_phase public.room_phase,
  add column if not exists changed_at timestamptz;

do $$ begin
  alter table public.player_identity_selections
    add constraint player_identity_selections_revision_nonnegative
    check (revision >= 0) not valid;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.player_identity_selections
    add constraint player_identity_selections_previous_choice_length
    check (
      previous_choice_key is null
      or length(btrim(previous_choice_key)) between 1 and 100
    ) not valid;
exception when duplicate_object then null;
end $$;

alter table public.player_identity_selections
  validate constraint player_identity_selections_revision_nonnegative;
alter table public.player_identity_selections
  validate constraint player_identity_selections_previous_choice_length;

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
  -- Serialize the phase decision with close/open commands. FOR KEY SHARE would
  -- allow a concurrent non-key phase UPDATE to commit while this command was
  -- waiting on the player row, producing a post-close identity revision.
  for update;
  if not found then
    raise exception 'room not found' using errcode = 'P0002';
  end if;
  if v_room.phase not in ('lobby'::public.room_phase, 'live'::public.room_phase) then
    raise exception 'identity choices may change only in the lobby or live room'
      using errcode = '55000';
  end if;
  if v_room.game_contract->>'commitment' is distinct from 'open_conviction'
     or v_room.game_contract#>>'{identity,selection}' is distinct from 'chosen_faction'
     or v_room.game_contract#>>'{identity,scoring}' is distinct from 'none'
     or v_room.game_contract#>>'{scarcity,identity}' is distinct from 'shared' then
    raise exception 'the room contract does not include shared faction choice'
      using errcode = '55000';
  end if;

  -- Serialize repeat taps and competing devices through the occupied seat.
  perform 1
  from public.players player
  where player.id = p_actor_player_id and player.room_id = p_room_id
  for update;
  if not found then
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

  select selection.* into v_selection
  from public.player_identity_selections selection
  where selection.player_id = p_actor_player_id
  for update;

  if not found then
    insert into public.player_identity_selections (
      player_id, room_id, show_pack_id, choice_key,
      previous_choice_key, revision, changed_in_phase, changed_at
    ) values (
      p_actor_player_id, p_room_id, v_room.show_pack_id, v_choice_key,
      null, 0, null, null
    )
    returning * into v_selection;
    return v_selection;
  end if;

  if v_selection.room_id is distinct from p_room_id
     or v_selection.show_pack_id is distinct from v_room.show_pack_id then
    raise exception 'identity selection does not belong to this room show pack'
      using errcode = '55000';
  end if;
  if v_selection.choice_key = v_choice_key then
    return v_selection;
  end if;

  update public.player_identity_selections selection
  set previous_choice_key = selection.choice_key,
      choice_key = v_choice_key,
      revision = selection.revision + 1,
      selected_at = clock_timestamp(),
      changed_in_phase = v_room.phase,
      changed_at = clock_timestamp()
  where selection.player_id = p_actor_player_id
  returning * into v_selection;

  return v_selection;
end;
$$;

revoke all on function public.set_player_identity_choice(uuid, uuid, text) from public;
grant execute on function public.set_player_identity_choice(uuid, uuid, text)
  to anon, authenticated, service_role;

comment on column public.player_identity_selections.revision is
  'Monotonic authored identity transition revision; zero is the silent initial selection.';
comment on column public.player_identity_selections.previous_choice_key is
  'Exact prior authored choice retained for the current revision.';
comment on column public.player_identity_selections.changed_in_phase is
  'Room phase that produced the current revision; only live revisions enter runtime ceremony.';
comment on function public.set_player_identity_choice(uuid, uuid, text) is
  'Player-owned pack identity command: initial lobby/live selection is revision zero; later lobby/live changes retain the latest exact transition.';
