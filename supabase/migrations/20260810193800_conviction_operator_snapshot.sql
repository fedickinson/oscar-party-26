-- Operator recovery must preserve conviction portfolios with the rest of the
-- room-owned game state.

create or replace function public.capture_operator_snapshot_v1()
returns jsonb language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'show_packs', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.show_packs r), '[]'::jsonb),
    'avatars', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.avatars r), '[]'::jsonb),
    'rooms', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.rooms r), '[]'::jsonb),
    'players', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.players r), '[]'::jsonb),
    'draft_picks', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.draft_picks r), '[]'::jsonb),
    'bingo_cards', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.bingo_cards r), '[]'::jsonb),
    'bingo_marks', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.bingo_marks r), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.messages r), '[]'::jsonb),
    'player_verdicts', coalesce((select jsonb_agg(to_jsonb(r) order by r.room_id, r.player_id) from public.player_verdicts r), '[]'::jsonb),
    'room_winners', coalesce((select jsonb_agg(to_jsonb(r) order by r.room_id, r.category_id) from public.room_winners r), '[]'::jsonb),
    'categories', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.categories r), '[]'::jsonb),
    'category_nominees', coalesce((select jsonb_agg(to_jsonb(r) order by r.category_id, r.nominee_id) from public.category_nominees r), '[]'::jsonb),
    'room_settlements', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.room_settlements r), '[]'::jsonb),
    'room_settlement_entries', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.room_settlement_entries r), '[]'::jsonb),
    'room_settlement_bingo_marks', coalesce((select jsonb_agg(to_jsonb(r) order by r.settlement_id, r.card_id, r.square_index) from public.room_settlement_bingo_marks r), '[]'::jsonb),
    'signature_beats', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.signature_beats r), '[]'::jsonb),
    'beat_activations', coalesce((select jsonb_agg(to_jsonb(r) order by r.room_id, r.beat_id) from public.beat_activations r), '[]'::jsonb),
    'conviction_picks', coalesce((select jsonb_agg(to_jsonb(r) order by r.room_id, r.player_id, r.beat_id) from public.conviction_picks r), '[]'::jsonb),
    'confidence_picks', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.confidence_picks r), '[]'::jsonb),
    'nominees', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.nominees r), '[]'::jsonb),
    'draft_entities', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.draft_entities r), '[]'::jsonb),
    'bingo_squares', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.bingo_squares r), '[]'::jsonb),
    'operator_heartbeats', coalesce((select jsonb_agg(to_jsonb(r) order by r.room_id, r.engine) from public.operator_heartbeats r), '[]'::jsonb),
    'witness_proposals', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.witness_proposals r), '[]'::jsonb)
  );
$$;

revoke all on function public.capture_operator_snapshot_v1() from public, anon, authenticated;
grant execute on function public.capture_operator_snapshot_v1() to service_role;
