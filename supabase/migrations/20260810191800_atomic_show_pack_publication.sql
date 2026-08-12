-- Authored catalog rows are immutable to phones. Runtime clients may create,
-- update and remove only room-scoped declarations and their nominee links.
-- Every privileged catalog mutation also locks its pack registry, allowing the
-- publication RPC to attest and publish under one conflicting row lock.

drop policy if exists "anon can create events" on public.categories;
drop policy if exists "anon can remove events" on public.categories;
drop policy if exists categories_update on public.categories;
drop policy if exists "anon can create room declarations" on public.categories;
drop policy if exists "anon can remove room declarations" on public.categories;
drop policy if exists "anon can update room declarations" on public.categories;

create policy "anon can create room declarations"
  on public.categories for insert to anon, authenticated
  with check (room_id is not null and show_pack_id is null);
create policy "anon can remove room declarations"
  on public.categories for delete to anon, authenticated
  using (room_id is not null and show_pack_id is null);
create policy "anon can update room declarations"
  on public.categories for update to anon, authenticated
  using (room_id is not null and show_pack_id is null)
  with check (room_id is not null and show_pack_id is null);

drop policy if exists "anon can link events to nominees" on public.category_nominees;
drop policy if exists "anon can unlink events" on public.category_nominees;
drop policy if exists "anon can link room declarations" on public.category_nominees;
drop policy if exists "anon can unlink room declarations" on public.category_nominees;

create policy "anon can link room declarations"
  on public.category_nominees for insert to anon, authenticated
  with check (exists (
    select 1
    from public.categories category
    where category.id = category_id
      and category.room_id is not null
      and category.show_pack_id is null
  ));
create policy "anon can unlink room declarations"
  on public.category_nominees for delete to anon, authenticated
  using (exists (
    select 1
    from public.categories category
    where category.id = category_id
      and category.room_id is not null
      and category.show_pack_id is null
  ));

drop policy if exists "anon delete beats" on public.signature_beats;
drop policy if exists "anon seed beats" on public.signature_beats;
drop policy if exists "anon update beats" on public.signature_beats;

revoke insert, update, delete, truncate on public.signature_beats from anon, authenticated;
revoke insert, update, delete, truncate on public.bingo_squares from anon, authenticated;
revoke insert, update, delete, truncate on public.nominees from anon, authenticated;
revoke insert, update, delete, truncate on public.draft_entities from anon, authenticated;
revoke truncate on public.categories from anon, authenticated;
revoke truncate on public.category_nominees from anon, authenticated;

create or replace function public.lock_show_pack_catalog_write()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old_pack_id uuid;
  v_new_pack_id uuid;
begin
  if tg_table_name = 'category_nominees' then
    if tg_op <> 'INSERT' then
      select category.show_pack_id into v_old_pack_id
      from public.categories category
      where category.id = old.category_id;
    end if;
    if tg_op <> 'DELETE' then
      select category.show_pack_id into v_new_pack_id
      from public.categories category
      where category.id = new.category_id;
    end if;
  else
    if tg_op <> 'INSERT' then v_old_pack_id := old.show_pack_id; end if;
    if tg_op <> 'DELETE' then v_new_pack_id := new.show_pack_id; end if;
  end if;

  if v_old_pack_id is not null then
    perform 1
    from public.show_packs pack
    where pack.id = v_old_pack_id
    for key share;
    if not found then
      raise exception 'catalog row references a missing show pack' using errcode = '23503';
    end if;
  end if;
  if v_new_pack_id is not null and v_new_pack_id is distinct from v_old_pack_id then
    perform 1
    from public.show_packs pack
    where pack.id = v_new_pack_id
    for key share;
    if not found then
      raise exception 'catalog row references a missing show pack' using errcode = '23503';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.lock_show_pack_catalog_write() from public, anon, authenticated;

drop trigger if exists lock_show_pack_catalog_write on public.nominees;
create trigger lock_show_pack_catalog_write
before insert or update or delete on public.nominees
for each row execute function public.lock_show_pack_catalog_write();

drop trigger if exists lock_show_pack_catalog_write on public.draft_entities;
create trigger lock_show_pack_catalog_write
before insert or update or delete on public.draft_entities
for each row execute function public.lock_show_pack_catalog_write();

drop trigger if exists lock_show_pack_catalog_write on public.categories;
create trigger lock_show_pack_catalog_write
before insert or update or delete on public.categories
for each row execute function public.lock_show_pack_catalog_write();

drop trigger if exists lock_show_pack_catalog_write on public.category_nominees;
create trigger lock_show_pack_catalog_write
before insert or update or delete on public.category_nominees
for each row execute function public.lock_show_pack_catalog_write();

drop trigger if exists lock_show_pack_catalog_write on public.signature_beats;
create trigger lock_show_pack_catalog_write
before insert or update or delete on public.signature_beats
for each row execute function public.lock_show_pack_catalog_write();

drop trigger if exists lock_show_pack_catalog_write on public.bingo_squares;
create trigger lock_show_pack_catalog_write
before insert or update or delete on public.bingo_squares
for each row execute function public.lock_show_pack_catalog_write();

create or replace function public.jsonb_rowset_equal(p_expected jsonb, p_actual jsonb)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if jsonb_typeof(p_expected) <> 'array' or jsonb_typeof(p_actual) <> 'array' then
    return false;
  end if;
  if jsonb_array_length(p_expected) <> jsonb_array_length(p_actual) then
    return false;
  end if;
  if exists (
    select 1
    from (
      (select value from jsonb_array_elements(p_expected))
      except
      (select value from jsonb_array_elements(p_actual))
    ) difference
  ) then
    return false;
  end if;
  if exists (
    select 1
    from (
      (select value from jsonb_array_elements(p_actual))
      except
      (select value from jsonb_array_elements(p_expected))
    ) difference
  ) then
    return false;
  end if;
  return true;
exception when others then
  return false;
end;
$$;

revoke all on function public.jsonb_rowset_equal(jsonb, jsonb) from public, anon, authenticated;

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
    'manifest_sha256', v_pack.manifest_sha256,
    'compiled_bundle', v_pack.compiled_bundle,
    'status', 'draft',
    'published_at', null
  );
  if v_expected is distinct from v_actual then
    raise exception 'show-pack registry differs from compiled plan' using errcode = '23514';
  end if;
  if v_pack.compiled_bundle->>'schema_version' is distinct from '3'
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
    raise exception 'compiled show pack has an invalid entity portrait contract' using errcode = '23514';
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
