-- Residual evidence is private operator data. Browser producers must prove the
-- same room capability used to read and dismiss it; the service-role daemon
-- retains the legacy function for phone-independent generation. Permission
-- revocation is a coordinated between-show change: old anonymous bundles
-- cannot preserve residuals after this migration lands.

create or replace function public.record_companion_grounding_review_authorized(
  p_room_id uuid,
  p_actor_player_id uuid,
  p_reaction_key text,
  p_surface text,
  p_engine text,
  p_facts jsonb,
  p_attempted_messages jsonb,
  p_findings jsonb,
  p_attempts integer,
  p_model text,
  p_operator_capability text
)
returns uuid
language plpgsql
security definer
set search_path = private, public, extensions, pg_temp
as $$
begin
  perform private.require_room_operator_capability(p_room_id, p_operator_capability);
  if p_engine is distinct from 'browser' then
    raise exception 'the capability-authorized browser grounding writer requires browser provenance'
      using errcode = '22023';
  end if;
  return public.record_companion_grounding_review(
    p_room_id,
    p_actor_player_id,
    p_reaction_key,
    p_surface,
    p_engine,
    p_facts,
    p_attempted_messages,
    p_findings,
    p_attempts,
    p_model
  );
end;
$$;

revoke execute on function public.record_companion_grounding_review(
  uuid, uuid, text, text, text, jsonb, jsonb, jsonb, integer, text
) from anon, authenticated;

revoke all on function public.record_companion_grounding_review_authorized(
  uuid, uuid, text, text, text, jsonb, jsonb, jsonb, integer, text, text
) from public;
grant execute on function public.record_companion_grounding_review_authorized(
  uuid, uuid, text, text, text, jsonb, jsonb, jsonb, integer, text, text
) to anon, authenticated, service_role;

comment on function public.record_companion_grounding_review(
  uuid, uuid, text, text, text, jsonb, jsonb, jsonb, integer, text
) is 'Service-role residual-evidence writer retained for the companion daemon.';
comment on function public.record_companion_grounding_review_authorized(
  uuid, uuid, text, text, text, jsonb, jsonb, jsonb, integer, text, text
) is 'Browser residual-evidence writer requiring current host role and room operator capability.';
