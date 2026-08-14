-- Make show behavior an explicit, versioned pack contract. Historical rows are
-- backfilled from their recorded behavior; fact_source remains compatibility
-- metadata and no longer chooses a new room's runtime.

alter table public.show_packs add column if not exists game_contract jsonb;
alter table public.rooms add column if not exists game_contract jsonb;

create or replace function public.results_night_game_contract()
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select '{
    "version": 1,
    "commitment": "confidence_allocation",
    "conviction_budget": null,
    "identity": {"selection": "exclusive_entity_draft", "scoring": "ensemble"},
    "scarcity": {"commitments": "ranked_allocation", "identity": "exclusive"},
    "visibility": "sealed_until_lock",
    "cadence": "immediate_per_outcome",
    "continuity": "no_carryover"
  }'::jsonb
$$;

create or replace function public.story_night_game_contract()
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select '{
    "version": 1,
    "commitment": "open_conviction",
    "conviction_budget": 12,
    "identity": {"selection": "exclusive_entity_draft", "scoring": "none"},
    "scarcity": {"commitments": "fixed_budget", "identity": "exclusive"},
    "visibility": "open_counts",
    "cadence": "immediate_facts_and_event_close",
    "continuity": "canon_write_back"
  }'::jsonb
$$;

create or replace function public.show_pack_game_contract_is_valid(p_contract jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_key text;
begin
  if p_contract is null
     or jsonb_typeof(p_contract) <> 'object'
     or not (p_contract ?& array[
       'version', 'commitment', 'conviction_budget', 'identity', 'scarcity',
       'visibility', 'cadence', 'continuity'
     ]) then return false;
  end if;
  for v_key in select jsonb_object_keys(p_contract) loop
    if v_key <> all (array[
      'version', 'commitment', 'conviction_budget', 'identity', 'scarcity',
      'visibility', 'cadence', 'continuity'
    ]) then return false; end if;
  end loop;
  if jsonb_typeof(p_contract->'version') <> 'number'
     or p_contract->>'version' <> '1'
     or jsonb_typeof(p_contract->'commitment') <> 'string'
     or p_contract->>'commitment' not in (
       'confidence_allocation', 'open_conviction', 'season_thesis'
     )
     or jsonb_typeof(p_contract->'identity') <> 'object'
     or not ((p_contract->'identity') ?& array['selection', 'scoring'])
     or (select count(*) from jsonb_object_keys(p_contract->'identity')) <> 2
     or jsonb_typeof(p_contract#>'{identity,selection}') <> 'string'
     or p_contract#>>'{identity,selection}' not in (
       'none', 'exclusive_entity_draft', 'chosen_faction'
     )
     or jsonb_typeof(p_contract#>'{identity,scoring}') <> 'string'
     or p_contract#>>'{identity,scoring}' not in ('none', 'ensemble')
     or jsonb_typeof(p_contract->'scarcity') <> 'object'
     or not ((p_contract->'scarcity') ?& array['commitments', 'identity'])
     or (select count(*) from jsonb_object_keys(p_contract->'scarcity')) <> 2
     or jsonb_typeof(p_contract#>'{scarcity,commitments}') <> 'string'
     or p_contract#>>'{scarcity,commitments}' not in (
       'none', 'ranked_allocation', 'fixed_budget'
     )
     or jsonb_typeof(p_contract#>'{scarcity,identity}') <> 'string'
     or p_contract#>>'{scarcity,identity}' not in ('none', 'shared', 'exclusive')
     or jsonb_typeof(p_contract->'visibility') <> 'string'
     or p_contract->>'visibility' not in (
       'open_counts', 'sealed_until_lock', 'hidden_until_resolution'
     )
     or jsonb_typeof(p_contract->'cadence') <> 'string'
     or p_contract->>'cadence' not in (
       'immediate_per_outcome', 'immediate_facts_and_event_close',
       'installment_and_season_close'
     )
     or jsonb_typeof(p_contract->'continuity') <> 'string'
     or p_contract->>'continuity' not in (
       'no_carryover', 'canon_write_back', 'cumulative_standings_and_canon'
     ) then return false;
  end if;
  if p_contract->>'commitment' = 'open_conviction' then
    if jsonb_typeof(p_contract->'conviction_budget') <> 'number'
       or (p_contract->>'conviction_budget')::numeric <> trunc((p_contract->>'conviction_budget')::numeric)
       or (p_contract->>'conviction_budget')::integer < 1 then return false; end if;
  elsif jsonb_typeof(p_contract->'conviction_budget') <> 'null' then
    return false;
  end if;
  return true;
exception when others then
  return false;
end;
$$;

create or replace function public.show_pack_game_contract_is_executable(p_contract jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(
    public.show_pack_game_contract_is_valid(p_contract)
    and p_contract in (
      public.results_night_game_contract(),
      public.story_night_game_contract()
    ), false)
$$;

alter table public.show_packs
  drop constraint if exists show_packs_game_contract_check;
alter table public.show_packs
  add constraint show_packs_game_contract_check
  check (game_contract is null or public.show_pack_game_contract_is_valid(game_contract))
  not valid;

alter table public.rooms
  drop constraint if exists rooms_game_contract_check;
alter table public.rooms
  add constraint rooms_game_contract_check
  check (game_contract is null or public.show_pack_game_contract_is_executable(game_contract))
  not valid;

update public.show_packs
set game_contract = case
  when fact_source = 'scheduled' then public.results_night_game_contract()
  else public.story_night_game_contract()
end
where game_contract is null;

update public.rooms
set game_contract = case
  when game_model = 'legacy_ensemble' then public.results_night_game_contract()
  else public.story_night_game_contract()
end
where game_contract is null;

alter table public.show_packs validate constraint show_packs_game_contract_check;
alter table public.rooms validate constraint rooms_game_contract_check;

create or replace function public.trigger_contract_is_valid(p_contract jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_item jsonb;
  v_key text;
  v_dimension text;
  v_decision text;
begin
  if p_contract is null or jsonb_typeof(p_contract) <> 'object' then return false; end if;
  if not (p_contract ?& array[
    'title', 'condition', 'exclusions', 'adjudication', 'title_review', 'basis_claim_ids'
  ]) then return false; end if;
  for v_key in select jsonb_object_keys(p_contract) loop
    if v_key <> all (array[
      'title', 'truth_authority', 'condition', 'exclusions', 'adjudication',
      'title_review', 'basis_claim_ids'
    ]) then return false; end if;
  end loop;
  if p_contract ? 'truth_authority' and (
       jsonb_typeof(p_contract->'truth_authority') <> 'string'
       or p_contract->>'truth_authority' not in (
         'official_result', 'operator_declaration', 'ai_proposal_human_confirmation'
       )
     ) then return false; end if;
  if jsonb_typeof(p_contract->'title') <> 'string'
     or length(btrim(p_contract->>'title')) = 0
     or jsonb_typeof(p_contract->'condition') <> 'string'
     or length(btrim(p_contract->>'condition')) = 0 then return false; end if;
  if jsonb_typeof(p_contract->'exclusions') <> 'array'
     or jsonb_array_length(p_contract->'exclusions') = 0 then return false; end if;
  for v_item in select value from jsonb_array_elements(p_contract->'exclusions') loop
    if jsonb_typeof(v_item) <> 'string'
       or length(btrim(v_item #>> '{}')) = 0 then return false; end if;
  end loop;
  if jsonb_typeof(p_contract->'adjudication') <> 'object'
     or not ((p_contract->'adjudication') ?& array['proxies', 'offscreen', 'mentions'])
     or (select count(*) from jsonb_object_keys(p_contract->'adjudication')) <> 3 then return false; end if;
  foreach v_dimension in array array['proxies', 'offscreen', 'mentions'] loop
    v_decision := p_contract->'adjudication'->>v_dimension;
    if v_decision is null or v_decision <> all (array[
      'count', 'do_not_count', 'explicit_only', 'principal_accepts_if_unrefused'
    ]) then return false; end if;
  end loop;
  if jsonb_typeof(p_contract->'title_review') <> 'object'
     or not ((p_contract->'title_review') ?& array['status', 'note'])
     or (select count(*) from jsonb_object_keys(p_contract->'title_review')) <> 2
     or p_contract->'title_review'->>'status' <> 'approved'
     or length(btrim(coalesce(p_contract->'title_review'->>'note', ''))) = 0 then return false; end if;
  if jsonb_typeof(p_contract->'basis_claim_ids') <> 'array'
     or jsonb_array_length(p_contract->'basis_claim_ids') = 0 then return false; end if;
  for v_item in select value from jsonb_array_elements(p_contract->'basis_claim_ids') loop
    if jsonb_typeof(v_item) <> 'string'
       or length(btrim(v_item #>> '{}')) = 0 then return false; end if;
  end loop;
  return true;
exception when others then
  return false;
end;
$$;

create or replace function public.bind_room_game_model_to_show_pack()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_contract jsonb;
begin
  select pack.game_contract into v_contract
  from public.show_packs pack
  where pack.id = new.show_pack_id;
  if not public.show_pack_game_contract_is_executable(v_contract) then
    raise exception 'room show pack has no executable game contract' using errcode = '23514';
  end if;
  new.game_contract := v_contract;
  new.game_model := case v_contract->>'commitment'
    when 'confidence_allocation' then 'legacy_ensemble'
    when 'open_conviction' then 'conviction_portfolio'
  end;
  return new;
end;
$$;

create or replace function public.guard_room_game_model()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.game_model is not distinct from old.game_model then return new; end if;
  if old.phase <> 'lobby'
     or exists (select 1 from public.draft_picks where room_id = old.id)
     or exists (select 1 from public.confidence_picks where room_id = old.id)
     or exists (select 1 from public.conviction_picks where room_id = old.id)
     or exists (select 1 from public.bingo_cards where room_id = old.id) then
    raise exception 'room game model is immutable after play begins' using errcode = '23514';
  end if;
  if new.show_pack_id is not distinct from old.show_pack_id then
    raise exception 'room game model can only change with its show pack' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.guard_room_game_contract()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.game_contract is not distinct from old.game_contract then return new; end if;
  if old.phase <> 'lobby'
     or exists (select 1 from public.draft_picks where room_id = old.id)
     or exists (select 1 from public.confidence_picks where room_id = old.id)
     or exists (select 1 from public.conviction_picks where room_id = old.id)
     or exists (select 1 from public.bingo_cards where room_id = old.id) then
    raise exception 'room game contract is immutable after commitments begin' using errcode = '23514';
  end if;
  if new.show_pack_id is not distinct from old.show_pack_id then
    raise exception 'room game contract can only change with its show pack' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_room_game_contract_write on public.rooms;
create trigger guard_room_game_contract_write
before update of game_contract on public.rooms
for each row execute function public.guard_room_game_contract();

comment on function public.bind_room_game_model_to_show_pack() is
  'Copies the explicit show-pack contract and derives the compatibility runtime model from commitment.';
comment on column public.show_packs.game_contract is
  'Versioned authored behavior contract; fact_source remains compatibility truth-delivery metadata.';
comment on column public.rooms.game_contract is
  'Immutable resolved behavior contract copied from the bound show pack.';


create or replace function public.publish_and_bind_show_pack(
  p_room_code text,
  p_catalog jsonb
)
returns table (room_id uuid, show_pack_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
  v_pack public.show_packs%rowtype;
  v_pack_id uuid;
  v_expected jsonb;
  v_actual jsonb;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'publish_and_bind_show_pack requires the service role' using errcode = '42501';
  end if;
  if jsonb_typeof(p_catalog) <> 'object'
     or not (p_catalog ?& array[
       'showPack', 'nominees', 'categories', 'categoryNominees',
       'draftEntities', 'signatureBeats', 'bingoSquares'
     ])
     or exists (
       select 1
       from jsonb_object_keys(p_catalog) key
       where key <> all (array[
         'showPack', 'nominees', 'categories', 'categoryNominees',
         'draftEntities', 'signatureBeats', 'bingoSquares'
       ])
     ) then
    raise exception 'show-pack catalog manifest has an invalid shape' using errcode = '23514';
  end if;

  v_expected := p_catalog->'showPack';
  if jsonb_typeof(v_expected) <> 'object' then
    raise exception 'show-pack registry manifest must be an object' using errcode = '23514';
  end if;
  if jsonb_typeof(v_expected->'id') is distinct from 'string'
     or length(btrim(v_expected->>'id')) = 0 then
    raise exception 'show-pack registry manifest has an invalid id' using errcode = '23514';
  end if;
  begin
    v_pack_id := (v_expected->>'id')::uuid;
  exception when others then
    raise exception 'show-pack registry manifest has an invalid id' using errcode = '23514';
  end;

  select room.* into v_room
  from public.rooms room
  where room.code = upper(btrim(p_room_code))
  for update;
  if v_room.id is null then
    raise exception 'room % not found', upper(btrim(p_room_code));
  end if;

  select pack.* into v_pack
  from public.show_packs pack
  where pack.id = v_pack_id
  for update;
  if v_pack.id is null then
    raise exception 'show pack % not found', v_pack_id;
  end if;
  if v_pack.status = 'retired' then
    raise exception 'retired show pack cannot be published or bound' using errcode = '23514';
  end if;

  v_actual := jsonb_build_object(
    'id', v_pack.id,
    'pack_key', v_pack.pack_key,
    'version', v_pack.version,
    'title', v_pack.title,
    'property', v_pack.property,
    'installment', v_pack.installment,
    'fact_source', v_pack.fact_source,
    'game_contract', v_pack.game_contract,
    'manifest_sha256', v_pack.manifest_sha256,
    'compiled_bundle', v_pack.compiled_bundle,
    'status', 'draft',
    'published_at', null
  );
  if v_expected is distinct from v_actual then
    raise exception 'show-pack registry differs from compiled plan' using errcode = '23514';
  end if;
  if v_pack.compiled_bundle->>'schema_version' is distinct from '4'
     or v_pack.game_contract is distinct from v_pack.compiled_bundle->'game_contract'
     or not public.show_pack_game_contract_is_executable(v_pack.game_contract)
     or exists (
       select 1
       from jsonb_array_elements(
         coalesce(v_pack.compiled_bundle->'predictions', '[]'::jsonb)
         || coalesce(v_pack.compiled_bundle->'signature_beats', '[]'::jsonb)
         || coalesce(v_pack.compiled_bundle->'bingo_squares', '[]'::jsonb)
       ) wager
       where wager->>'truth_authority' is null
          or wager->>'truth_authority' not in (
            'official_result', 'operator_declaration', 'ai_proposal_human_confirmation'
          )
     )
     or exists (
       select 1 from public.categories category
       where category.show_pack_id = v_pack.id
         and (
           category.trigger_contract->>'truth_authority' is null
           or category.trigger_contract->>'truth_authority' not in (
             'official_result', 'operator_declaration', 'ai_proposal_human_confirmation'
           )
         )
     )
     or exists (
       select 1 from public.signature_beats beat
       where beat.show_pack_id = v_pack.id
         and (
           beat.trigger_contract->>'truth_authority' is null
           or beat.trigger_contract->>'truth_authority' not in (
             'official_result', 'operator_declaration', 'ai_proposal_human_confirmation'
           )
         )
     )
     or exists (
       select 1 from public.bingo_squares square
       where square.show_pack_id = v_pack.id
         and (
           square.trigger_contract->>'truth_authority' is null
           or square.trigger_contract->>'truth_authority' not in (
             'official_result', 'operator_declaration', 'ai_proposal_human_confirmation'
           )
         )
     )
     or exists (
       select 1
       from jsonb_array_elements(v_pack.compiled_bundle->'predictions') wager
       left join public.categories category
         on category.show_pack_id = v_pack.id
        and category.pack_key = wager->>'id'
       where category.id is null
          or category.trigger_contract->>'truth_authority'
             is distinct from wager->>'truth_authority'
     )
     or exists (
       select 1
       from jsonb_array_elements(v_pack.compiled_bundle->'signature_beats') wager
       left join public.signature_beats beat
         on beat.show_pack_id = v_pack.id
        and beat.pack_key = wager->>'id'
       where beat.id is null
          or beat.trigger_contract->>'truth_authority'
             is distinct from wager->>'truth_authority'
     )
     or exists (
       select 1
       from jsonb_array_elements(v_pack.compiled_bundle->'bingo_squares') wager
       left join public.bingo_squares square
         on square.show_pack_id = v_pack.id
        and square.pack_key = wager->>'id'
       where square.id is null
          or square.trigger_contract->>'truth_authority'
             is distinct from wager->>'truth_authority'
     )
     or jsonb_typeof(v_pack.compiled_bundle->'entities') is distinct from 'array'
     or jsonb_array_length(v_pack.compiled_bundle->'entities') = 0
     or exists (
       select 1
       from jsonb_array_elements(v_pack.compiled_bundle->'entities') entity
       where jsonb_typeof(entity) <> 'object'
          or coalesce(entity->>'id', '') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
          or jsonb_typeof(entity->'portrait') is distinct from 'object'
          or coalesce(entity#>>'{portrait,path}', '') !~ '^/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+\.(?:avif|jpe?g|png|webp)$'
          or coalesce(entity#>>'{portrait,sha256}', '') !~ '^[0-9a-f]{64}$'
          or exists (
            select 1
            from jsonb_object_keys(entity->'portrait') key
            where key <> all (array['path', 'sha256'])
          )
     )
     or (
       select count(*)
       from jsonb_array_elements(v_pack.compiled_bundle->'entities') entity
     ) <> (
       select count(distinct entity->>'id')
       from jsonb_array_elements(v_pack.compiled_bundle->'entities') entity
     ) then
    raise exception 'compiled show pack has an invalid game or entity contract' using errcode = '23514';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', nominee.id,
    'name', nominee.name,
    'type', nominee.type,
    'film_name', nominee.film_name,
    'image_url', nominee.image_url,
    'show_pack_id', nominee.show_pack_id,
    'pack_key', nominee.pack_key
  )), '[]'::jsonb) into v_actual
  from public.nominees nominee
  where nominee.show_pack_id = v_pack.id;
  if not public.jsonb_rowset_equal(p_catalog->'nominees', v_actual) then
    raise exception 'installed nominees differ from compiled plan' using errcode = '23514';
  end if;
  if (select count(*) from public.nominees nominee where nominee.show_pack_id = v_pack.id)
       <> jsonb_array_length(v_pack.compiled_bundle->'entities')
     or exists (
       select 1
       from jsonb_array_elements(v_pack.compiled_bundle->'entities') entity
       left join public.nominees nominee
         on nominee.show_pack_id = v_pack.id
        and nominee.pack_key = entity->>'id'
       where nominee.id is null
          or nominee.image_url is distinct from entity#>>'{portrait,path}'
     ) then
    raise exception 'installed nominee portraits differ from compiled entities' using errcode = '23514';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', category.id,
    'name', category.name,
    'tier', category.tier,
    'points', category.points,
    'display_order', category.display_order,
    'winner_id', category.winner_id,
    'announced_at', category.announced_at,
    'show_pack_id', category.show_pack_id,
    'room_id', category.room_id,
    'pack_key', category.pack_key,
    'trigger_contract', category.trigger_contract
  )), '[]'::jsonb) into v_actual
  from public.categories category
  where category.show_pack_id = v_pack.id;
  if not public.jsonb_rowset_equal(p_catalog->'categories', v_actual) then
    raise exception 'installed predictions differ from compiled plan' using errcode = '23514';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'category_id', link.category_id,
    'nominee_id', link.nominee_id
  )), '[]'::jsonb) into v_actual
  from public.category_nominees link
  join public.categories category on category.id = link.category_id
  where category.show_pack_id = v_pack.id;
  if not public.jsonb_rowset_equal(p_catalog->'categoryNominees', v_actual) then
    raise exception 'installed prediction candidates differ from compiled plan' using errcode = '23514';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', entity.id,
    'name', entity.name,
    'type', entity.type,
    'nominations', entity.nominations,
    'film_name', entity.film_name,
    'nom_count', entity.nom_count,
    'show_pack_id', entity.show_pack_id,
    'pack_key', entity.pack_key
  )), '[]'::jsonb) into v_actual
  from public.draft_entities entity
  where entity.show_pack_id = v_pack.id;
  if not public.jsonb_rowset_equal(p_catalog->'draftEntities', v_actual) then
    raise exception 'installed draft entities differ from compiled plan' using errcode = '23514';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', beat.id,
    'entity_id', beat.entity_id,
    'partner_entity_id', beat.partner_entity_id,
    'name', beat.name,
    'trigger_text', beat.trigger_text,
    'odds', beat.odds,
    'points', beat.points,
    'pitch', beat.pitch,
    'show_pack_id', beat.show_pack_id,
    'pack_key', beat.pack_key,
    'trigger_contract', beat.trigger_contract
  )), '[]'::jsonb) into v_actual
  from public.signature_beats beat
  where beat.show_pack_id = v_pack.id;
  if not public.jsonb_rowset_equal(p_catalog->'signatureBeats', v_actual) then
    raise exception 'installed signature beats differ from compiled plan' using errcode = '23514';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', square.id,
    'text', square.text,
    'short_text', square.short_text,
    'is_objective', square.is_objective,
    'slug', square.slug,
    'title', square.title,
    'category', square.category,
    'probability_pct', square.probability_pct,
    'likelihood_tier', square.likelihood_tier,
    'win_condition', square.win_condition,
    'why_it_is_fun', square.why_it_is_fun,
    'storyline_tags', square.storyline_tags,
    'fun_type', square.fun_type,
    'show_pack_id', square.show_pack_id,
    'pack_key', square.pack_key,
    'trigger_contract', square.trigger_contract
  )), '[]'::jsonb) into v_actual
  from public.bingo_squares square
  where square.show_pack_id = v_pack.id;
  if not public.jsonb_rowset_equal(p_catalog->'bingoSquares', v_actual) then
    raise exception 'installed bingo squares differ from compiled plan' using errcode = '23514';
  end if;

  if not public.show_pack_is_playable(v_pack.id) then
    raise exception 'show pack is not playable' using errcode = '23514';
  end if;

  if v_pack.status = 'draft' then
    update public.show_packs
    set status = 'published', published_at = now()
    where id = v_pack.id;
  elsif v_pack.status <> 'published' then
    raise exception 'show pack has an invalid publication state' using errcode = '23514';
  end if;

  return query
    update public.rooms room
    set show_pack_id = v_pack.id
    where room.id = v_room.id
    returning room.id, room.show_pack_id;
end;
$$;

revoke all on function public.publish_and_bind_show_pack(text, jsonb) from public, anon, authenticated;
grant execute on function public.publish_and_bind_show_pack(text, jsonb) to service_role;

-- Service clients install draft rows but cannot publish or bind around the
-- exact transactional command. Database owners retain break-glass authority.
revoke update on public.show_packs from service_role;
revoke execute on function public.bind_room_show_pack(text, text, integer) from service_role;

comment on function public.publish_and_bind_show_pack(text, jsonb) is
  'Service-only atomic exact-catalog attestation, publication and lobby-room binding.';
