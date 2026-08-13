-- Preserve the complete wager contract beside every normalized catalog row.
-- The current HotD catalog predates the doctrine and is explicitly
-- grandfathered; room-scoped GM declarations are facts, not authored wagers.
-- Every later show pack must be screen-decidable, proxy-aware and title-reviewed
-- even when a privileged seed tool writes directly around the app compiler.

alter table public.categories
  add column if not exists trigger_contract jsonb;
alter table public.signature_beats
  add column if not exists trigger_contract jsonb;
alter table public.bingo_squares
  add column if not exists trigger_contract jsonb;

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
  if p_contract is null or jsonb_typeof(p_contract) <> 'object' then
    return false;
  end if;
  if not (p_contract ?& array[
    'condition', 'exclusions', 'adjudication', 'title_review', 'basis_claim_ids'
  ]) then
    return false;
  end if;
  for v_key in select jsonb_object_keys(p_contract) loop
    if v_key <> all (array[
      'condition', 'exclusions', 'adjudication', 'title_review', 'basis_claim_ids'
    ]) then
      return false;
    end if;
  end loop;

  if jsonb_typeof(p_contract->'condition') <> 'string'
    or length(btrim(p_contract->>'condition')) = 0 then
    return false;
  end if;

  if jsonb_typeof(p_contract->'exclusions') <> 'array'
    or jsonb_array_length(p_contract->'exclusions') = 0 then
    return false;
  end if;
  for v_item in select value from jsonb_array_elements(p_contract->'exclusions') loop
    if jsonb_typeof(v_item) <> 'string'
      or length(btrim(v_item #>> '{}')) = 0 then
      return false;
    end if;
  end loop;

  if jsonb_typeof(p_contract->'adjudication') <> 'object'
    or not ((p_contract->'adjudication') ?& array['proxies', 'offscreen', 'mentions']) then
    return false;
  end if;
  for v_key in select jsonb_object_keys(p_contract->'adjudication') loop
    if v_key <> all (array['proxies', 'offscreen', 'mentions']) then
      return false;
    end if;
  end loop;
  foreach v_dimension in array array['proxies', 'offscreen', 'mentions'] loop
    v_decision := p_contract->'adjudication'->>v_dimension;
    if v_decision is null or v_decision <> all (array[
      'count', 'do_not_count', 'explicit_only', 'principal_accepts_if_unrefused'
    ]) then
      return false;
    end if;
  end loop;

  if jsonb_typeof(p_contract->'title_review') <> 'object'
    or not ((p_contract->'title_review') ?& array['status', 'note']) then
    return false;
  end if;
  for v_key in select jsonb_object_keys(p_contract->'title_review') loop
    if v_key <> all (array['status', 'note']) then
      return false;
    end if;
  end loop;
  if p_contract->'title_review'->>'status' <> 'approved'
    or length(btrim(coalesce(p_contract->'title_review'->>'note', ''))) = 0 then
    return false;
  end if;

  if jsonb_typeof(p_contract->'basis_claim_ids') <> 'array'
    or jsonb_array_length(p_contract->'basis_claim_ids') = 0 then
    return false;
  end if;
  for v_item in select value from jsonb_array_elements(p_contract->'basis_claim_ids') loop
    if jsonb_typeof(v_item) <> 'string'
      or length(btrim(v_item #>> '{}')) = 0 then
      return false;
    end if;
  end loop;

  return true;
exception when others then
  return false;
end;
$$;

alter table public.categories
  add constraint categories_trigger_doctrine_check check (
    show_pack_id is null
    or show_pack_id = '8f27e9a4-9f6b-4f3a-9c91-a6b862c98101'
    or public.trigger_contract_is_valid(trigger_contract)
  );
alter table public.signature_beats
  add constraint signature_beats_trigger_doctrine_check check (
    show_pack_id = '8f27e9a4-9f6b-4f3a-9c91-a6b862c98101'
    or public.trigger_contract_is_valid(trigger_contract)
  );
alter table public.bingo_squares
  add constraint bingo_squares_trigger_doctrine_check check (
    show_pack_id = '8f27e9a4-9f6b-4f3a-9c91-a6b862c98101'
    or public.trigger_contract_is_valid(trigger_contract)
  );

comment on column public.categories.trigger_contract is
  'Compiled trigger doctrine for an authored prediction; null only for legacy catalog rows and room declarations.';
comment on column public.signature_beats.trigger_contract is
  'Compiled trigger doctrine retained beside the beat an operator adjudicates.';
comment on column public.bingo_squares.trigger_contract is
  'Compiled trigger doctrine retained beside the square an operator adjudicates.';
