-- Conviction rows participate in the exact preflight identity checked while
-- the settlement command holds its room lock.

create or replace function public.settlement_input_snapshot(p_room_id uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'players', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name) order by p.id)
      from public.players p where p.room_id = p_room_id), '[]'::jsonb),
    'confidence_picks', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'player_id', p.player_id, 'category_id', p.category_id,
      'nominee_id', p.nominee_id, 'confidence', p.confidence) order by p.id)
      from public.confidence_picks p where p.room_id = p_room_id), '[]'::jsonb),
    'conviction_picks', coalesce((select jsonb_agg(jsonb_build_object(
      'player_id', p.player_id, 'beat_id', p.beat_id) order by p.player_id, p.beat_id)
      from public.conviction_picks p where p.room_id = p_room_id), '[]'::jsonb),
    'draft_picks', coalesce((select jsonb_agg(jsonb_build_object(
      'id', p.id, 'player_id', p.player_id, 'entity_id', p.entity_id) order by p.id)
      from public.draft_picks p where p.room_id = p_room_id), '[]'::jsonb),
    'bingo_cards', coalesce((select jsonb_agg(jsonb_build_object(
      'id', c.id, 'player_id', c.player_id, 'squares', c.squares) order by c.id)
      from public.bingo_cards c where c.room_id = p_room_id), '[]'::jsonb),
    'bingo_marks', coalesce((select jsonb_agg(jsonb_build_object(
      'card_id', mark.card_id, 'square_index', mark.square_index, 'marked_at', mark.marked_at)
      order by mark.card_id, mark.square_index)
      from public.bingo_marks mark
      join public.bingo_cards card on card.id = mark.card_id
      where card.room_id = p_room_id and mark.status = 'approved'), '[]'::jsonb)
  );
$$;

revoke all on function public.settlement_input_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.settlement_input_snapshot(uuid) to service_role;
