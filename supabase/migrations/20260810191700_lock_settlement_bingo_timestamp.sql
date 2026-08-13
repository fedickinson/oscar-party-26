-- Approved bingo timestamps are part of the researched record. Include them
-- in the room-lock preflight snapshot so an identity-preserving timestamp edit
-- cannot race settlement and leave the versioned mark stale.

create or replace function public.settlement_input_snapshot(p_room_id uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'players', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', player.id, 'name', player.name)
        order by player.id
      )
      from public.players player
      where player.room_id = p_room_id
    ), '[]'::jsonb),
    'confidence_picks', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', pick.id,
          'player_id', pick.player_id,
          'category_id', pick.category_id,
          'nominee_id', pick.nominee_id,
          'confidence', pick.confidence
        ) order by pick.id
      )
      from public.confidence_picks pick
      where pick.room_id = p_room_id
    ), '[]'::jsonb),
    'draft_picks', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', pick.id,
          'player_id', pick.player_id,
          'entity_id', pick.entity_id
        ) order by pick.id
      )
      from public.draft_picks pick
      where pick.room_id = p_room_id
    ), '[]'::jsonb),
    'bingo_cards', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', card.id,
          'player_id', card.player_id,
          'squares', card.squares
        ) order by card.id
      )
      from public.bingo_cards card
      where card.room_id = p_room_id
    ), '[]'::jsonb),
    'bingo_marks', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'card_id', mark.card_id,
          'square_index', mark.square_index,
          'marked_at', mark.marked_at
        ) order by mark.card_id, mark.square_index
      )
      from public.bingo_marks mark
      join public.bingo_cards card on card.id = mark.card_id
      where card.room_id = p_room_id and mark.status = 'approved'
    ), '[]'::jsonb)
  )
$$;

revoke all on function public.settlement_input_snapshot(uuid) from public, anon, authenticated;
grant execute on function public.settlement_input_snapshot(uuid) to service_role;
