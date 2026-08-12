-- Reading or dismissing residual grounding evidence exposes private model
-- output. Apply the same room bearer boundary as witness review while leaving
-- evidence recording backward-compatible for mixed-version grounded engines.

create or replace function public.list_pending_companion_grounding_reviews_authorized(
  p_room_id uuid,
  p_actor_player_id uuid,
  p_operator_capability text
)
returns table (
  id uuid,
  reaction_key text,
  surface text,
  engine text,
  facts jsonb,
  attempted_messages jsonb,
  findings jsonb,
  attempts integer,
  model text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = private, public, extensions, pg_temp
as $$
begin
  perform private.require_room_operator_capability(p_room_id, p_operator_capability);
  return query
  select review.*
  from public.list_pending_companion_grounding_reviews(
    p_room_id,
    p_actor_player_id
  ) review;
end;
$$;

create or replace function public.dismiss_companion_grounding_review_authorized(
  p_room_id uuid,
  p_review_id uuid,
  p_actor_player_id uuid,
  p_operator_capability text
)
returns boolean
language plpgsql
security definer
set search_path = private, public, extensions, pg_temp
as $$
begin
  perform private.require_room_operator_capability(p_room_id, p_operator_capability);
  return public.dismiss_companion_grounding_review(
    p_room_id,
    p_review_id,
    p_actor_player_id
  );
end;
$$;

-- Service-role producers and repair tooling retain the legacy functions.
-- Anonymous and authenticated clients must cross the bearer boundary to read
-- or dismiss private residual evidence.
revoke execute on function public.list_pending_companion_grounding_reviews(uuid, uuid)
  from anon, authenticated;
revoke execute on function public.dismiss_companion_grounding_review(uuid, uuid, uuid)
  from anon, authenticated;

revoke all on function public.list_pending_companion_grounding_reviews_authorized(uuid, uuid, text)
  from public;
revoke all on function public.dismiss_companion_grounding_review_authorized(uuid, uuid, uuid, text)
  from public;
grant execute on function public.list_pending_companion_grounding_reviews_authorized(uuid, uuid, text)
  to anon, authenticated, service_role;
grant execute on function public.dismiss_companion_grounding_review_authorized(uuid, uuid, uuid, text)
  to anon, authenticated, service_role;

comment on function public.list_pending_companion_grounding_reviews_authorized(uuid, uuid, text) is
  'Private residual grounding queue read requiring current host role and room operator capability.';
comment on function public.dismiss_companion_grounding_review_authorized(uuid, uuid, uuid, text) is
  'Residual grounding dismissal requiring current host role and room operator capability.';
comment on column public.rooms.grounding_review_revision is
  'Realtime invalidation counter for the private capability-gated companion grounding review queue.';
