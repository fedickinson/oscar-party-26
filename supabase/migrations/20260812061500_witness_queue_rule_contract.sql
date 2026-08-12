-- The host cannot adjudicate a witness proposal from its positive condition
-- alone. Expose the immutable observation-time exclusions through a new
-- capability-authorized read shape. The existing function stays intact for
-- mixed-version clients.

create or replace function public.witness_candidate_for_beat_v2(p_beat_id integer)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'beat_id', beat.id,
    'beat_key', beat.pack_key,
    'title', beat.name,
    'condition', btrim(beat.trigger_contract->>'condition'),
    'exclusions', beat.trigger_contract->'exclusions',
    'adjudication', beat.trigger_contract->'adjudication',
    'points', beat.points,
    'entities', case
      when beat.partner_entity_id is null then
        jsonb_build_array(jsonb_build_object(
          'entity_id', primary_entity.id,
          'entity_key', primary_entity.pack_key,
          'name', primary_entity.name
        ))
      else
        jsonb_build_array(
          jsonb_build_object(
            'entity_id', primary_entity.id,
            'entity_key', primary_entity.pack_key,
            'name', primary_entity.name
          ),
          jsonb_build_object(
            'entity_id', partner_entity.id,
            'entity_key', partner_entity.pack_key,
            'name', partner_entity.name
          )
        )
    end
  )
  from public.signature_beats beat
  join public.draft_entities primary_entity on primary_entity.id = beat.entity_id
  left join public.draft_entities partner_entity on partner_entity.id = beat.partner_entity_id
  where beat.id = p_beat_id;
$$;

revoke all on function public.witness_candidate_for_beat_v2(integer)
  from public, anon, authenticated;
grant execute on function public.witness_candidate_for_beat_v2(integer)
  to service_role;

alter table public.witness_proposals
  add column if not exists reviewed_entity_id uuid
    references public.draft_entities(id);

create or replace function public.guard_witness_observation_binding()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_expected jsonb;
  v_beat public.signature_beats%rowtype;
begin
  if tg_op = 'INSERT'
     and new.status = 'pending'
     and not (new.source_candidate ? 'adjudication')
     and auth.role() is distinct from 'service_role' then
    raise exception 'new witness proposals require sealed trigger adjudication'
      using errcode = '23514';
  end if;
  if tg_op = 'UPDATE'
     and new.source_candidate is distinct from old.source_candidate then
    raise exception 'witness source candidate is immutable' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE'
     and new.reviewed_entity_id is distinct from old.reviewed_entity_id
     and not (old.status = 'pending' and new.status = 'accepted') then
    raise exception 'witness reviewed entity is immutable outside acceptance'
      using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.status = 'accepted' and new.reviewed_entity_id is null then
    new.reviewed_entity_id := new.entity_id;
  end if;
  if new.status = 'dismissed' and new.reviewed_entity_id is not null then
    raise exception 'dismissed witness review cannot select an entity'
      using errcode = '23514';
  end if;
  if new.reviewed_entity_id is not null and not exists (
    select 1
    from jsonb_array_elements(new.source_candidate->'entities') candidate_entity
    where candidate_entity->>'entity_id' = new.reviewed_entity_id::text
  ) then
    raise exception 'witness reviewed entity must belong to the sealed candidate'
      using errcode = '23514';
  end if;

  -- Dismissal may clear a stale observation. Insertion and acceptance must
  -- match the candidate-contract version sealed at observation time. Keeping
  -- the legacy branch preserves accepted audit rows and snapshot recovery.
  if tg_op = 'INSERT' or new.status = 'accepted' then
    if new.status = 'accepted' then
      select beat.* into v_beat
      from public.signature_beats beat
      where beat.id = new.source_signature_beat_id
      for share;
      if v_beat.id is null then
        raise exception 'witness proposal is stale against its sealed source candidate'
          using errcode = '23514';
      end if;

      perform 1
      from public.draft_entities entity
      where entity.id = v_beat.entity_id
         or entity.id = v_beat.partner_entity_id
      for share;
    end if;

    v_expected := case
      when new.source_candidate ? 'adjudication'
        then public.witness_candidate_for_beat_v2(new.source_signature_beat_id)
      else public.witness_candidate_for_beat(new.source_signature_beat_id)
    end;
    if v_expected is null or new.source_candidate is distinct from v_expected then
      raise exception 'witness proposal is stale against its sealed source candidate'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

-- Later positive judgments for the same pending beat are evidence attached to
-- the original review unit. They never become declarations in their own right.
create table if not exists public.witness_supporting_observations (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.witness_proposals(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  entity_id uuid not null references public.draft_entities(id),
  confidence integer not null check (confidence between 0 and 100),
  observed_at timestamp with time zone not null,
  frame_sha256 text not null check (frame_sha256 ~ '^[a-f0-9]{64}$'),
  reference_manifest_sha256 text not null check (reference_manifest_sha256 ~ '^[a-f0-9]{64}$'),
  reference_images_sha256 text not null check (reference_images_sha256 ~ '^[a-f0-9]{64}$'),
  model_output_sha256 text not null check (model_output_sha256 ~ '^[a-f0-9]{64}$'),
  model text not null check (length(btrim(model)) > 0),
  created_at timestamp with time zone not null default now(),
  unique (proposal_id, frame_sha256)
);

create index if not exists witness_supporting_observations_proposal_time
  on public.witness_supporting_observations(proposal_id, observed_at, id);

alter table public.witness_supporting_observations enable row level security;
revoke all on public.witness_supporting_observations from public, anon, authenticated;
grant all on public.witness_supporting_observations to service_role;

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

create or replace function public.guard_witness_supporting_observation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_proposal public.witness_proposals%rowtype;
begin
  if tg_op = 'UPDATE' then
    raise exception 'witness supporting observation evidence is immutable'
      using errcode = '23514';
  end if;
  select proposal.* into v_proposal
  from public.witness_proposals proposal
  where proposal.id = new.proposal_id
  for update;
  if v_proposal.id is null
     or v_proposal.room_id is distinct from new.room_id then
    raise exception 'supporting observation requires its room proposal'
      using errcode = '23514';
  end if;
  if new.entity_id is distinct from v_proposal.entity_id
     and not exists (
       select 1
       from jsonb_array_elements(v_proposal.source_candidate->'entities') entity
       where entity->>'entity_id' = new.entity_id::text
     ) then
    raise exception 'supporting observation entity must belong to the sealed candidate'
      using errcode = '23514';
  end if;
  if new.reference_manifest_sha256 is distinct from v_proposal.reference_manifest_sha256
     or new.model is distinct from v_proposal.model then
    raise exception 'supporting observation must use the proposal reference manifest and model'
      using errcode = '23514';
  end if;
  if new.observed_at <= v_proposal.observed_at then
    raise exception 'supporting observation must follow the root evidence'
      using errcode = '23514';
  end if;
  if (
    select count(*) from public.witness_supporting_observations observation
    where observation.proposal_id = v_proposal.id
  ) >= 7 then
    raise exception 'a witness proposal may retain at most eight observations'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_witness_supporting_observation
  on public.witness_supporting_observations;
create trigger guard_witness_supporting_observation
before insert or update on public.witness_supporting_observations
for each row execute function public.guard_witness_supporting_observation();

create or replace function public.advance_witness_support_revision()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  update public.rooms
  set witness_revision = witness_revision + 1
  where id = case when tg_op = 'DELETE' then old.room_id else new.room_id end;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists advance_witness_support_revision
  on public.witness_supporting_observations;
create trigger advance_witness_support_revision
after insert or delete on public.witness_supporting_observations
for each row execute function public.advance_witness_support_revision();

create or replace function public.record_witness_observation_v2(
  p_room_id uuid,
  p_source_signature_beat_id integer,
  p_entity_id uuid,
  p_confidence integer,
  p_observed_at timestamp with time zone,
  p_frame_sha256 text,
  p_reference_manifest_sha256 text,
  p_reference_images_sha256 text,
  p_model_output_sha256 text,
  p_model text,
  p_source_candidate jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
  v_proposal public.witness_proposals%rowtype;
  v_expected jsonb;
  v_support_count integer;
  v_observation_id uuid;
begin
  select room.* into v_room
  from public.rooms room
  where room.id = p_room_id
  for update;
  if v_room.id is null then raise exception 'witness room not found' using errcode = 'P0002'; end if;
  if v_room.phase <> 'live'::public.room_phase then
    raise exception 'witness observations may be recorded only while the room is live'
      using errcode = '55000';
  end if;
  v_expected := public.witness_candidate_for_beat_v2(p_source_signature_beat_id);
  if v_expected is null or p_source_candidate is distinct from v_expected then
    raise exception 'witness observation is stale against its sealed source candidate'
      using errcode = '23514';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(p_source_candidate->'entities') entity
    where entity->>'entity_id' = p_entity_id::text
  ) then
    raise exception 'witness observation entity must belong to the sealed candidate'
      using errcode = '23514';
  end if;
  if p_confidence not between 0 and 100
     or p_frame_sha256 !~ '^[a-f0-9]{64}$'
     or p_reference_manifest_sha256 !~ '^[a-f0-9]{64}$'
     or p_reference_images_sha256 !~ '^[a-f0-9]{64}$'
     or p_model_output_sha256 !~ '^[a-f0-9]{64}$'
     or length(btrim(coalesce(p_model, ''))) = 0 then
    raise exception 'witness observation evidence is invalid' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.categories category
    where category.room_id = p_room_id
      and category.source_signature_beat_id = p_source_signature_beat_id
  ) then
    raise exception 'witness beat is already declared' using errcode = '23505';
  end if;

  select proposal.* into v_proposal
  from public.witness_proposals proposal
  where proposal.room_id = p_room_id
    and proposal.source_signature_beat_id = p_source_signature_beat_id
    and proposal.status = 'pending'
  for update;

  if v_proposal.id is null then
    insert into public.witness_proposals (
      room_id, source_signature_beat_id, entity_id, confidence, observed_at,
      frame_sha256, reference_manifest_sha256, reference_images_sha256,
      model_output_sha256, model, source_candidate
    ) values (
      p_room_id, p_source_signature_beat_id, p_entity_id, p_confidence, p_observed_at,
      p_frame_sha256, p_reference_manifest_sha256, p_reference_images_sha256,
      p_model_output_sha256, p_model, p_source_candidate
    ) returning * into v_proposal;
    return jsonb_build_object(
      'proposal_id', v_proposal.id,
      'observation_id', v_proposal.id,
      'disposition', 'created',
      'observation_count', 1
    );
  end if;

  if v_proposal.source_candidate is distinct from p_source_candidate
     or v_proposal.reference_manifest_sha256 is distinct from p_reference_manifest_sha256
     or v_proposal.model is distinct from p_model then
    raise exception 'supporting observation does not match the pending proposal evidence contract'
      using errcode = '23514';
  end if;
  if v_proposal.frame_sha256 = p_frame_sha256 then
    if v_proposal.entity_id is distinct from p_entity_id
       or v_proposal.confidence is distinct from p_confidence
       or v_proposal.observed_at is distinct from p_observed_at
       or v_proposal.model_output_sha256 is distinct from p_model_output_sha256 then
      raise exception 'duplicate witness frame does not match its sealed root evidence'
        using errcode = '23514';
    end if;
    return jsonb_build_object(
      'proposal_id', v_proposal.id,
      'observation_id', v_proposal.id,
      'disposition', 'duplicate',
      'observation_count', 1 + (
        select count(*) from public.witness_supporting_observations observation
        where observation.proposal_id = v_proposal.id
      )
    );
  end if;
  select observation.id into v_observation_id
  from public.witness_supporting_observations observation
  where observation.proposal_id = v_proposal.id
    and observation.frame_sha256 = p_frame_sha256;
  if v_observation_id is not null then
    if not exists (
      select 1 from public.witness_supporting_observations observation
      where observation.id = v_observation_id
        and observation.entity_id = p_entity_id
        and observation.confidence = p_confidence
        and observation.observed_at = p_observed_at
        and observation.model_output_sha256 = p_model_output_sha256
    ) then
      raise exception 'duplicate witness frame does not match its sealed supporting evidence'
        using errcode = '23514';
    end if;
    return jsonb_build_object(
      'proposal_id', v_proposal.id,
      'observation_id', v_observation_id,
      'disposition', 'duplicate',
      'observation_count', 1 + (
        select count(*) from public.witness_supporting_observations observation
        where observation.proposal_id = v_proposal.id
      )
    );
  end if;
  select count(*) into v_support_count
  from public.witness_supporting_observations observation
  where observation.proposal_id = v_proposal.id;
  if v_support_count >= 7 then
    return jsonb_build_object(
      'proposal_id', v_proposal.id,
      'observation_id', null,
      'disposition', 'saturated',
      'observation_count', 8
    );
  end if;

  insert into public.witness_supporting_observations (
    proposal_id, room_id, entity_id, confidence, observed_at, frame_sha256,
    reference_manifest_sha256, reference_images_sha256, model_output_sha256, model
  ) values (
    v_proposal.id, p_room_id, p_entity_id, p_confidence, p_observed_at, p_frame_sha256,
    p_reference_manifest_sha256, p_reference_images_sha256, p_model_output_sha256, p_model
  ) returning id into v_observation_id;
  return jsonb_build_object(
    'proposal_id', v_proposal.id,
    'observation_id', v_observation_id,
    'disposition', 'supported',
    'observation_count', v_support_count + 2
  );
end;
$$;

revoke all on function public.record_witness_observation_v2(
  uuid, integer, uuid, integer, timestamp with time zone, text, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.record_witness_observation_v2(
  uuid, integer, uuid, integer, timestamp with time zone, text, text, text, text, text, jsonb
) to service_role;

comment on table public.witness_supporting_observations is
  'Bounded immutable later positive frame judgments attached to one pending witness review unit; temporal support is not independent corroboration.';
comment on function public.record_witness_observation_v2(
  uuid, integer, uuid, integer, timestamp with time zone, text, text, text, text, text, jsonb
) is
  'Service-only room-locked record command: creates one pending proposal or appends one of at most seven distinct later supporting observations.';

create or replace function public.review_witness_proposal_v2(
  p_room_id uuid,
  p_proposal_id uuid,
  p_actor_player_id uuid,
  p_action text,
  p_selected_entity_id uuid default null,
  p_expected_observation_count integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
  v_proposal public.witness_proposals%rowtype;
  v_beat public.signature_beats%rowtype;
  v_entity public.draft_entities%rowtype;
  v_selected_entity_id uuid;
  v_evidenced_entity_count integer;
  v_observation_count integer;
  v_nominee_id uuid;
  v_declaration_name text;
  v_declaration_id integer;
  v_actor_name text;
begin
  if p_action not in ('accept', 'dismiss') then
    raise exception 'witness action must be accept or dismiss' using errcode = '22023';
  end if;
  if p_action = 'dismiss' and p_selected_entity_id is not null then
    raise exception 'dismissal cannot select a witness entity' using errcode = '22023';
  end if;
  if p_action = 'accept'
     and (p_expected_observation_count is null
       or p_expected_observation_count not between 1 and 8) then
    raise exception 'witness acceptance requires the reviewed observation count'
      using errcode = '22023';
  end if;

  select room.* into v_room
  from public.rooms room
  where room.id = p_room_id
  for update;
  if v_room.id is null then raise exception 'room not found' using errcode = 'P0002'; end if;
  if v_room.host_id is distinct from p_actor_player_id then
    raise exception 'only the room host may review witness proposals' using errcode = '42501';
  end if;
  if v_room.phase <> 'live'::public.room_phase then
    raise exception 'witness proposals may be reviewed only while the room is live'
      using errcode = '55000';
  end if;

  select proposal.* into v_proposal
  from public.witness_proposals proposal
  where proposal.id = p_proposal_id
    and proposal.room_id = p_room_id
    and proposal.status = 'pending'
  for update;
  if v_proposal.id is null then
    raise exception 'pending witness proposal not found' using errcode = 'P0002';
  end if;

  select player.name into v_actor_name
  from public.players player
  where player.id = p_actor_player_id and player.room_id = p_room_id;
  if v_actor_name is null then
    raise exception 'host player not found in room' using errcode = '42501';
  end if;

  if p_action = 'dismiss' then
    update public.witness_proposals
    set status = 'dismissed', reviewed_by = p_actor_player_id,
        reviewed_at = clock_timestamp(), reviewed_entity_id = null
    where id = v_proposal.id;
    return jsonb_build_object('proposal_id', v_proposal.id, 'status', 'dismissed');
  end if;

  select count(*), count(distinct evidence.entity_id)
  into v_observation_count, v_evidenced_entity_count
  from (
    select v_proposal.entity_id as entity_id
    union all
    select observation.entity_id
    from public.witness_supporting_observations observation
    where observation.proposal_id = v_proposal.id
  ) evidence;
  if v_observation_count is distinct from p_expected_observation_count then
    raise exception 'witness evidence changed after the host review loaded'
      using errcode = '40001';
  end if;
  if v_evidenced_entity_count > 1 and p_selected_entity_id is null then
    raise exception 'disputed witness evidence requires an explicit host entity ruling'
      using errcode = '23514';
  end if;
  v_selected_entity_id := coalesce(p_selected_entity_id, v_proposal.entity_id);
  if not exists (
    select 1
    from (
      select v_proposal.entity_id as entity_id
      union all
      select observation.entity_id
      from public.witness_supporting_observations observation
      where observation.proposal_id = v_proposal.id
    ) evidence
    where evidence.entity_id = v_selected_entity_id
  ) then
    raise exception 'host may select only an entity supported by retained positive evidence'
      using errcode = '23514';
  end if;

  select beat.* into v_beat
  from public.signature_beats beat
  where beat.id = v_proposal.source_signature_beat_id
    and beat.show_pack_id = v_room.show_pack_id;
  select entity.* into v_entity
  from public.draft_entities entity
  where entity.id = v_selected_entity_id
    and entity.show_pack_id = v_room.show_pack_id;
  if v_beat.id is null
     or v_entity.id is null
     or (v_entity.id is distinct from v_beat.entity_id
       and v_entity.id is distinct from v_beat.partner_entity_id)
     or not public.trigger_contract_is_valid(v_beat.trigger_contract) then
    raise exception 'witness proposal is stale against the room catalog'
      using errcode = '23514';
  end if;
  if exists (
    select 1 from public.categories category
    where category.room_id = p_room_id
      and category.source_signature_beat_id = v_beat.id
  ) then
    raise exception 'witness beat is already declared' using errcode = '23505';
  end if;

  select nominee.id into v_nominee_id
  from public.nominees nominee
  where nominee.show_pack_id = v_room.show_pack_id
    and nominee.pack_key = v_entity.pack_key
    and nominee.type = v_entity.type;
  if v_nominee_id is null then
    raise exception 'witness entity must resolve to one stable room nominee'
      using errcode = '23514';
  end if;

  v_declaration_name := case
    when v_beat.partner_entity_id is null then v_beat.name
    else v_beat.name || ' — ' || split_part(btrim(v_entity.name), ' ', 1)
  end;

  insert into public.categories (
    name, tier, points, display_order, show_pack_id, room_id,
    source_signature_beat_id, source_trigger_contract
  ) values (
    v_declaration_name,
    case when v_beat.points >= 10 then 1 when v_beat.points >= 6 then 2 else 3 end,
    v_beat.points,
    1000000,
    null,
    p_room_id,
    v_beat.id,
    v_beat.trigger_contract
  ) returning categories.id into v_declaration_id;

  insert into public.category_nominees (category_id, nominee_id)
  values (v_declaration_id, v_nominee_id);
  insert into public.room_winners (room_id, category_id, winner_id, tie_winner_id)
  values (p_room_id, v_declaration_id, v_nominee_id, null);
  insert into public.messages (room_id, player_id, text)
  values (
    p_room_id,
    'system',
    format(
      '%s — %s (+%s) · proposed by the witness · confirmed by %s',
      v_declaration_name,
      v_entity.name,
      v_beat.points,
      v_actor_name
    )
  );
  update public.witness_proposals
  set
    status = 'accepted',
    declaration_category_id = v_declaration_id,
    reviewed_entity_id = v_selected_entity_id,
    reviewed_by = p_actor_player_id,
    reviewed_at = clock_timestamp()
  where id = v_proposal.id;

  return jsonb_build_object(
    'proposal_id', v_proposal.id,
    'status', 'accepted',
    'reviewed_entity_id', v_selected_entity_id,
    'declaration_category_id', v_declaration_id
  );
end;
$$;

create or replace function public.review_witness_proposal_authorized_v2(
  p_room_id uuid,
  p_proposal_id uuid,
  p_actor_player_id uuid,
  p_action text,
  p_selected_entity_id uuid,
  p_expected_observation_count integer,
  p_operator_capability text
)
returns jsonb
language plpgsql
security definer
set search_path = private, public, extensions, pg_temp
as $$
begin
  perform private.require_room_operator_capability(p_room_id, p_operator_capability);
  return public.review_witness_proposal_v2(
    p_room_id,
    p_proposal_id,
    p_actor_player_id,
    p_action,
    p_selected_entity_id,
    p_expected_observation_count
  );
end;
$$;

revoke all on function public.review_witness_proposal_v2(uuid, uuid, uuid, text, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.review_witness_proposal_v2(uuid, uuid, uuid, text, uuid, integer)
  to service_role;
revoke all on function public.review_witness_proposal_authorized_v2(uuid, uuid, uuid, text, uuid, integer, text)
  from public;
grant execute on function public.review_witness_proposal_authorized_v2(uuid, uuid, uuid, text, uuid, integer, text)
  to anon, authenticated, service_role;

-- Older browser bundles cannot represent an explicit disputed-entity ruling.
-- Fail closed and require refresh; service-role recovery retains the legacy RPC.
revoke execute on function public.review_witness_proposal_authorized(uuid, uuid, uuid, text, text)
  from anon, authenticated;

comment on column public.witness_proposals.reviewed_entity_id is
  'Host-selected accepted entity; root entity_id remains the immutable first positive observation.';
comment on function public.review_witness_proposal_authorized_v2(uuid, uuid, uuid, text, uuid, integer, text) is
  'Capability-gated host ruling bound to the reviewed evidence count; may select only a sealed entity with retained positive evidence.';

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
    'witness_proposals', coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.witness_proposals r), '[]'::jsonb),
    'witness_supporting_observations', coalesce((select jsonb_agg(to_jsonb(r) order by r.proposal_id, r.observed_at, r.id) from public.witness_supporting_observations r), '[]'::jsonb)
  );
$$;

revoke all on function public.capture_operator_snapshot_v1()
  from public, anon, authenticated;
grant execute on function public.capture_operator_snapshot_v1()
  to service_role;
