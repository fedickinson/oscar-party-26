-- REST pagination closes the 1,000-row truncation gap but cannot make 22
-- sequential table reads describe one database instant. Materialize the whole
-- operator backup as one SQL statement so every subquery shares one MVCC
-- snapshot. The exact v1 shape is intentionally service-only and versioned.

create or replace function public.capture_operator_snapshot_v1()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'show_packs', coalesce((
      select jsonb_agg(to_jsonb(snapshot_row) order by snapshot_row.id)
      from public.show_packs snapshot_row
    ), '[]'::jsonb),
    'avatars', coalesce((
      select jsonb_agg(to_jsonb(snapshot_row) order by snapshot_row.id)
      from public.avatars snapshot_row
    ), '[]'::jsonb),
    'rooms', coalesce((
      select jsonb_agg(to_jsonb(snapshot_row) order by snapshot_row.id)
      from public.rooms snapshot_row
    ), '[]'::jsonb),
    'players', coalesce((
      select jsonb_agg(to_jsonb(snapshot_row) order by snapshot_row.id)
      from public.players snapshot_row
    ), '[]'::jsonb),
    'draft_picks', coalesce((
      select jsonb_agg(to_jsonb(snapshot_row) order by snapshot_row.id)
      from public.draft_picks snapshot_row
    ), '[]'::jsonb),
    'bingo_cards', coalesce((
      select jsonb_agg(to_jsonb(snapshot_row) order by snapshot_row.id)
      from public.bingo_cards snapshot_row
    ), '[]'::jsonb),
    'bingo_marks', coalesce((
      select jsonb_agg(to_jsonb(snapshot_row) order by snapshot_row.id)
      from public.bingo_marks snapshot_row
    ), '[]'::jsonb),
    'messages', coalesce((
      select jsonb_agg(to_jsonb(snapshot_row) order by snapshot_row.id)
      from public.messages snapshot_row
    ), '[]'::jsonb),
    'player_verdicts', coalesce((
      select jsonb_agg(to_jsonb(snapshot_row) order by snapshot_row.room_id, snapshot_row.player_id)
      from public.player_verdicts snapshot_row
    ), '[]'::jsonb),
    'room_winners', coalesce((
      select jsonb_agg(to_jsonb(snapshot_row) order by snapshot_row.room_id, snapshot_row.category_id)
      from public.room_winners snapshot_row
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(to_jsonb(snapshot_row) order by snapshot_row.id)
      from public.categories snapshot_row
    ), '[]'::jsonb),
    'category_nominees', coalesce((
      select jsonb_agg(to_jsonb(snapshot_row) order by snapshot_row.category_id, snapshot_row.nominee_id)
      from public.category_nominees snapshot_row
    ), '[]'::jsonb),
    'room_settlements', coalesce((
      select jsonb_agg(to_jsonb(snapshot_row) order by snapshot_row.id)
      from public.room_settlements snapshot_row
    ), '[]'::jsonb),
    'room_settlement_entries', coalesce((
      select jsonb_agg(to_jsonb(snapshot_row) order by snapshot_row.id)
      from public.room_settlement_entries snapshot_row
    ), '[]'::jsonb),
    'room_settlement_bingo_marks', coalesce((
      select jsonb_agg(
        to_jsonb(snapshot_row)
        order by snapshot_row.settlement_id, snapshot_row.card_id, snapshot_row.square_index
      )
      from public.room_settlement_bingo_marks snapshot_row
    ), '[]'::jsonb),
    'signature_beats', coalesce((
      select jsonb_agg(to_jsonb(snapshot_row) order by snapshot_row.id)
      from public.signature_beats snapshot_row
    ), '[]'::jsonb),
    'beat_activations', coalesce((
      select jsonb_agg(to_jsonb(snapshot_row) order by snapshot_row.room_id, snapshot_row.beat_id)
      from public.beat_activations snapshot_row
    ), '[]'::jsonb),
    'confidence_picks', coalesce((
      select jsonb_agg(to_jsonb(snapshot_row) order by snapshot_row.id)
      from public.confidence_picks snapshot_row
    ), '[]'::jsonb),
    'nominees', coalesce((
      select jsonb_agg(to_jsonb(snapshot_row) order by snapshot_row.id)
      from public.nominees snapshot_row
    ), '[]'::jsonb),
    'draft_entities', coalesce((
      select jsonb_agg(to_jsonb(snapshot_row) order by snapshot_row.id)
      from public.draft_entities snapshot_row
    ), '[]'::jsonb),
    'bingo_squares', coalesce((
      select jsonb_agg(to_jsonb(snapshot_row) order by snapshot_row.id)
      from public.bingo_squares snapshot_row
    ), '[]'::jsonb),
    'operator_heartbeats', coalesce((
      select jsonb_agg(to_jsonb(snapshot_row) order by snapshot_row.room_id, snapshot_row.engine)
      from public.operator_heartbeats snapshot_row
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.capture_operator_snapshot_v1() from public, anon, authenticated;
grant execute on function public.capture_operator_snapshot_v1() to service_role;

comment on function public.capture_operator_snapshot_v1() is
  'Service-only v1 capture of all operator tables from one PostgreSQL statement snapshot.';
