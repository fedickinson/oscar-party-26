-- Replace the capability-authorized witness queue with explicit JSON entity aliases.
-- PL/pgSQL output columns share the function scope, so a generic item alias is
-- ambiguous even when it originates inside a lateral subquery.
create or replace function public.list_pending_witness_proposals_authorized_v2(
  p_room_id uuid,
  p_actor_player_id uuid,
  p_operator_capability text
)
returns table (
  id uuid,
  source_signature_beat_id integer,
  beat_name text,
  trigger_text text,
  exclusions text[],
  adjudication jsonb,
  points integer,
  entity_id uuid,
  entity_name text,
  confidence integer,
  observed_at timestamp with time zone,
  frame_sha256 text,
  reference_manifest_sha256 text,
  reference_images_sha256 text,
  model_output_sha256 text,
  model text,
  created_at timestamp with time zone,
  observation_count integer,
  matching_entity_count integer,
  conflicting_entity_count integer,
  conflicting_entity_name text,
  ruling_options jsonb,
  minimum_confidence integer,
  maximum_confidence integer,
  latest_observed_at timestamp with time zone
)
language plpgsql
stable
security definer
set search_path = private, public, extensions, pg_temp
as $$
begin
  perform private.require_room_operator_capability(p_room_id, p_operator_capability);
  if not exists (
    select 1 from public.rooms room
    where room.id = p_room_id and room.host_id = p_actor_player_id
  ) then
    raise exception 'only the room host may read witness proposals' using errcode = '42501';
  end if;
  if exists (
    select 1
    from public.witness_proposals proposal
    where proposal.room_id = p_room_id
      and proposal.status = 'pending'
      and not (proposal.source_candidate ? 'adjudication')
  ) then
    raise exception 'pending witness proposal uses the legacy rule shape; review it before using the v2 queue'
      using errcode = '23514';
  end if;

  return query
  select
    proposal.id,
    proposal.source_signature_beat_id,
    proposal.source_candidate->>'title',
    proposal.source_candidate->>'condition',
    array(
      select exclusion.value
      from jsonb_array_elements_text(proposal.source_candidate->'exclusions')
        with ordinality exclusion(value, position)
      order by exclusion.position
    ),
    proposal.source_candidate->'adjudication',
    (proposal.source_candidate->>'points')::integer,
    proposal.entity_id,
    matched_entity.matched_item->>'name',
    proposal.confidence,
    proposal.observed_at,
    proposal.frame_sha256,
    proposal.reference_manifest_sha256,
    proposal.reference_images_sha256,
    proposal.model_output_sha256,
    proposal.model,
    proposal.created_at,
    aggregate.observation_count,
    aggregate.matching_entity_count,
    aggregate.conflicting_entity_count,
    case
      when aggregate.conflicting_entity_count > 0 then conflict_entity.conflict_item->>'name'
      else null
    end,
    rulings.options,
    aggregate.minimum_confidence,
    aggregate.maximum_confidence,
    aggregate.latest_observed_at
  from public.witness_proposals proposal
  cross join lateral (
    select entity_item as matched_item
    from jsonb_array_elements(proposal.source_candidate->'entities') entities(entity_item)
    where entity_item->>'entity_id' = proposal.entity_id::text
  ) matched_entity
  left join lateral (
    select entity_item as conflict_item
    from jsonb_array_elements(proposal.source_candidate->'entities') entities(entity_item)
    where entity_item->>'entity_id' <> proposal.entity_id::text
    limit 1
  ) conflict_entity on true
  cross join lateral (
    select
      count(*)::integer as observation_count,
      count(*) filter (where evidence.entity_id = proposal.entity_id)::integer
        as matching_entity_count,
      count(*) filter (where evidence.entity_id is distinct from proposal.entity_id)::integer
        as conflicting_entity_count,
      min(evidence.confidence)::integer as minimum_confidence,
      max(evidence.confidence)::integer as maximum_confidence,
      max(evidence.observed_at) as latest_observed_at
    from (
      select proposal.entity_id, proposal.confidence, proposal.observed_at
      union all
      select observation.entity_id, observation.confidence, observation.observed_at
      from public.witness_supporting_observations observation
      where observation.proposal_id = proposal.id
    ) evidence
  ) aggregate
  cross join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'entity_id', counts.entity_id,
        'entity_name', candidate_entity.candidate_item->>'name',
        'positive_count', counts.positive_count
      )
      order by (counts.entity_id = proposal.entity_id) desc, counts.entity_id
    ) as options
    from (
      select evidence.entity_id, count(*)::integer as positive_count
      from (
        select proposal.entity_id
        union all
        select observation.entity_id
        from public.witness_supporting_observations observation
        where observation.proposal_id = proposal.id
      ) evidence
      group by evidence.entity_id
    ) counts
    cross join lateral (
      select entity_item as candidate_item
      from jsonb_array_elements(proposal.source_candidate->'entities') entities(entity_item)
      where entity_item->>'entity_id' = counts.entity_id::text
    ) candidate_entity
  ) rulings
  where proposal.room_id = p_room_id and proposal.status = 'pending'
  order by proposal.created_at, proposal.id;
end;
$$;

revoke all on function public.list_pending_witness_proposals_authorized_v2(uuid, uuid, text)
  from public;
grant execute on function public.list_pending_witness_proposals_authorized_v2(uuid, uuid, text)
  to anon, authenticated, service_role;

comment on function public.list_pending_witness_proposals_authorized_v2(uuid, uuid, text) is
  'Private capability-authorized witness queue including the sealed observation-time exclusions required for host adjudication.';
comment on function public.witness_candidate_for_beat_v2(integer) is
  'Service-only witness candidate contract including explicit proxy, off-screen and mention adjudication; legacy v1 remains for historical evidence.';
