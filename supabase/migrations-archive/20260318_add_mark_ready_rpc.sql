-- Atomic array_append for ready_players to prevent read-modify-write races.
-- Two players tapping "Ready" simultaneously could overwrite each other's entry
-- with a client-side read-modify-write. This function runs in the DB and is atomic.
create or replace function mark_player_ready(p_room_id uuid, p_player_id uuid)
returns void
language sql
security definer
as $$
  update rooms
  set ready_players = coalesce(ready_players, '[]'::jsonb) || to_jsonb(p_player_id::text)
  where id = p_room_id
    and not (ready_players @> to_jsonb(p_player_id::text));
$$;
