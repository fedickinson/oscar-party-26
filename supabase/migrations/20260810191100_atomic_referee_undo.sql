-- A referee correction must not become three fallible client writes followed
-- by an optional chat message. Strike the provisional room declaration and
-- append its public correction in one transaction, under the room lock that
-- also serializes settlement. Authored show-pack categories are never eligible.

create or replace function public.undo_room_declaration(
  p_room_id uuid,
  p_category_id integer,
  p_actor_player_id uuid
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_host_id uuid;
  v_phase public.room_phase;
  v_actor_name text;
  v_category_name text;
  v_points integer;
  v_nominee_name text;
  v_correction text;
begin
  select room.host_id, room.phase
  into v_host_id, v_phase
  from public.rooms room
  where room.id = p_room_id
  for update;

  if not found then
    raise exception 'room not found' using errcode = 'P0002';
  end if;
  if v_host_id is distinct from p_actor_player_id then
    raise exception 'only the room host may strike a declaration' using errcode = '42501';
  end if;
  if v_phase not in ('live'::public.room_phase, 'finished'::public.room_phase) then
    raise exception 'declarations may be struck only while the record is provisional' using errcode = '55000';
  end if;

  select player.name
  into v_actor_name
  from public.players player
  where player.id = p_actor_player_id and player.room_id = p_room_id;
  if v_actor_name is null then
    raise exception 'host player not found in room' using errcode = '42501';
  end if;

  select category.name, category.points, nominee.name
  into v_category_name, v_points, v_nominee_name
  from public.categories category
  join public.room_winners winner
    on winner.room_id = p_room_id and winner.category_id = category.id
  join public.nominees nominee on nominee.id = winner.winner_id
  where category.id = p_category_id
    and category.room_id = p_room_id
    and category.show_pack_id is null
  for update of category;

  if not found then
    raise exception 'provisional room declaration not found' using errcode = 'P0002';
  end if;

  v_correction := format(
    'Correction: %s for %s (+%s) was struck by %s.',
    v_category_name,
    v_nominee_name,
    v_points,
    v_actor_name
  );

  delete from public.room_winners
  where room_id = p_room_id and category_id = p_category_id;

  delete from public.categories
  where id = p_category_id and room_id = p_room_id;

  if not found then
    raise exception 'declaration changed before it could be struck' using errcode = '40001';
  end if;

  insert into public.messages (room_id, player_id, text)
  values (p_room_id, 'system', v_correction);

  return v_correction;
end;
$$;

revoke all on function public.undo_room_declaration(uuid, integer, uuid) from public;
grant execute on function public.undo_room_declaration(uuid, integer, uuid)
  to anon, authenticated, service_role;

comment on function public.undo_room_declaration(uuid, integer, uuid) is
  'Host-only atomic referee action: strike one provisional room declaration and append its public correction.';
