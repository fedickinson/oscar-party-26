-- Catalogs used to be singleton global tables. Give every authored row an
-- immutable show-pack owner, give live declarations a room owner, and bind
-- every room to exactly one published pack. Existing clients remain valid:
-- omitted scope columns default to the current legacy pack.

create table if not exists public.show_packs (
  id uuid primary key,
  pack_key text not null check (pack_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  version integer not null check (version > 0),
  title text not null check (length(btrim(title)) > 0),
  property text not null check (length(btrim(property)) > 0),
  installment text not null check (length(btrim(installment)) > 0),
  fact_source text not null check (fact_source in ('scheduled', 'room_declared', 'ai_witnessed')),
  manifest_sha256 text check (manifest_sha256 is null or manifest_sha256 ~ '^[0-9a-f]{64}$'),
  compiled_bundle jsonb,
  status text not null default 'draft' check (status in ('draft', 'published', 'retired')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  unique (pack_key, version),
  check ((status = 'draft') = (published_at is null))
);

alter table public.show_packs enable row level security;
create policy "published show packs are readable"
  on public.show_packs for select to anon, authenticated
  using (status = 'published');
grant select on public.show_packs to anon, authenticated;
grant all on public.show_packs to service_role;

insert into public.show_packs (
  id, pack_key, version, title, property, installment, fact_source, status, published_at
) values (
  '8f27e9a4-9f6b-4f3a-9c91-a6b862c98101',
  'hotd-s3-finale-legacy',
  1,
  'House of the Dragon Season 3 Finale Legacy Catalog',
  'House of the Dragon',
  'Season 3 finale',
  'room_declared',
  'published',
  now()
) on conflict (pack_key, version) do nothing;

alter table public.rooms
  add column if not exists show_pack_id uuid
  default '8f27e9a4-9f6b-4f3a-9c91-a6b862c98101'
  references public.show_packs(id);
update public.rooms set show_pack_id = '8f27e9a4-9f6b-4f3a-9c91-a6b862c98101'
where show_pack_id is null;
alter table public.rooms alter column show_pack_id set not null;

alter table public.nominees
  add column if not exists show_pack_id uuid
  default '8f27e9a4-9f6b-4f3a-9c91-a6b862c98101'
  references public.show_packs(id),
  add column if not exists pack_key text;
update public.nominees
set show_pack_id = '8f27e9a4-9f6b-4f3a-9c91-a6b862c98101', pack_key = coalesce(pack_key, id::text)
where show_pack_id is null or pack_key is null;
alter table public.nominees alter column show_pack_id set not null;
create unique index if not exists nominees_show_pack_key
  on public.nominees(show_pack_id, pack_key) where pack_key is not null;

alter table public.draft_entities
  add column if not exists show_pack_id uuid
  default '8f27e9a4-9f6b-4f3a-9c91-a6b862c98101'
  references public.show_packs(id),
  add column if not exists pack_key text;
update public.draft_entities
set show_pack_id = '8f27e9a4-9f6b-4f3a-9c91-a6b862c98101', pack_key = coalesce(pack_key, id::text)
where show_pack_id is null or pack_key is null;
alter table public.draft_entities alter column show_pack_id set not null;
create unique index if not exists draft_entities_show_pack_key
  on public.draft_entities(show_pack_id, pack_key) where pack_key is not null;

alter table public.bingo_squares
  add column if not exists show_pack_id uuid
  default '8f27e9a4-9f6b-4f3a-9c91-a6b862c98101'
  references public.show_packs(id),
  add column if not exists pack_key text;
update public.bingo_squares
set show_pack_id = '8f27e9a4-9f6b-4f3a-9c91-a6b862c98101', pack_key = coalesce(pack_key, slug)
where show_pack_id is null or pack_key is null;
alter table public.bingo_squares alter column show_pack_id set not null;
create unique index if not exists bingo_squares_show_pack_key
  on public.bingo_squares(show_pack_id, pack_key) where pack_key is not null;

alter table public.signature_beats
  add column if not exists show_pack_id uuid
  default '8f27e9a4-9f6b-4f3a-9c91-a6b862c98101'
  references public.show_packs(id),
  add column if not exists pack_key text;
update public.signature_beats
set show_pack_id = '8f27e9a4-9f6b-4f3a-9c91-a6b862c98101', pack_key = coalesce(pack_key, id::text)
where show_pack_id is null or pack_key is null;
alter table public.signature_beats alter column show_pack_id set not null;
create unique index if not exists signature_beats_show_pack_key
  on public.signature_beats(show_pack_id, pack_key) where pack_key is not null;

create or replace function public.next_signature_beat_id()
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id integer;
begin
  loop
    v_id := nextval('public.signature_beats_id_seq');
    exit when not exists (select 1 from public.signature_beats where id = v_id);
  end loop;
  return v_id;
end;
$$;
alter table public.signature_beats alter column id set default public.next_signature_beat_id();

create sequence if not exists public.categories_id_seq;
select setval('public.categories_id_seq', greatest(coalesce(max(id), 0), 1), true)
from public.categories;
alter sequence public.categories_id_seq owned by public.categories.id;
create or replace function public.next_category_id()
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_id integer;
begin
  loop
    v_id := nextval('public.categories_id_seq');
    exit when not exists (select 1 from public.categories where id = v_id);
  end loop;
  return v_id;
end;
$$;
alter table public.categories alter column id set default public.next_category_id();
grant usage, select on sequence public.categories_id_seq to anon, authenticated, service_role;

alter table public.categories
  add column if not exists show_pack_id uuid
  default '8f27e9a4-9f6b-4f3a-9c91-a6b862c98101'
  references public.show_packs(id),
  add column if not exists room_id uuid references public.rooms(id) on delete cascade,
  add column if not exists pack_key text;
update public.categories
set show_pack_id = '8f27e9a4-9f6b-4f3a-9c91-a6b862c98101', pack_key = coalesce(pack_key, id::text)
where show_pack_id is null and room_id is null;
create unique index if not exists categories_show_pack_key
  on public.categories(show_pack_id, pack_key) where show_pack_id is not null and pack_key is not null;
alter table public.categories
  add constraint categories_exactly_one_scope
  check (num_nonnulls(show_pack_id, room_id) = 1) not valid;
alter table public.categories validate constraint categories_exactly_one_scope;

create or replace function public.category_belongs_to_room_catalog(p_room_id uuid, p_category_id integer)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.rooms room
    join public.categories category on category.id = p_category_id
    where room.id = p_room_id
      and (category.show_pack_id = room.show_pack_id or category.room_id = room.id)
  )
$$;

create or replace function public.nominee_belongs_to_room_catalog(p_room_id uuid, p_nominee_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.rooms room
    join public.nominees nominee on nominee.id = p_nominee_id
    where room.id = p_room_id and nominee.show_pack_id = room.show_pack_id
  )
$$;

create or replace function public.entity_belongs_to_room_catalog(p_room_id uuid, p_entity_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.rooms room
    join public.draft_entities entity on entity.id = p_entity_id
    where room.id = p_room_id and entity.show_pack_id = room.show_pack_id
  )
$$;

create or replace function public.beat_belongs_to_room_catalog(p_room_id uuid, p_beat_id integer)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.rooms room
    join public.signature_beats beat on beat.id = p_beat_id
    where room.id = p_room_id and beat.show_pack_id = room.show_pack_id
  )
$$;

create or replace function public.guard_category_nominee_catalog()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_category public.categories%rowtype;
  v_nominee_pack uuid;
  v_room_pack uuid;
begin
  select * into v_category from public.categories where id = new.category_id;
  select show_pack_id into v_nominee_pack from public.nominees where id = new.nominee_id;
  if v_category.room_id is not null then
    select show_pack_id into v_room_pack from public.rooms where id = v_category.room_id;
  else
    v_room_pack := v_category.show_pack_id;
  end if;
  if v_category.id is null or v_nominee_pack is null or v_nominee_pack is distinct from v_room_pack then
    raise exception 'category nominee must belong to the same room catalog' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger guard_category_nominee_catalog
before insert or update on public.category_nominees
for each row execute function public.guard_category_nominee_catalog();

create or replace function public.guard_room_catalog_write()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_settlement_room_id uuid;
begin
  if tg_table_name = 'confidence_picks' then
    if not public.category_belongs_to_room_catalog(new.room_id, new.category_id)
       or not public.nominee_belongs_to_room_catalog(new.room_id, new.nominee_id)
       or not exists (
         select 1 from public.category_nominees
         where category_id = new.category_id and nominee_id = new.nominee_id
       ) then
      raise exception 'confidence pick must use its room catalog' using errcode = '23514';
    end if;
  elsif tg_table_name = 'draft_picks' then
    if not public.entity_belongs_to_room_catalog(new.room_id, new.entity_id) then
      raise exception 'draft pick must use its room catalog' using errcode = '23514';
    end if;
  elsif tg_table_name = 'beat_activations' then
    if not public.beat_belongs_to_room_catalog(new.room_id, new.beat_id) then
      raise exception 'beat activation must use its room catalog' using errcode = '23514';
    end if;
  elsif tg_table_name = 'room_winners' then
    if not public.category_belongs_to_room_catalog(new.room_id, new.category_id)
       or not public.nominee_belongs_to_room_catalog(new.room_id, new.winner_id)
       or not exists (
         select 1 from public.category_nominees
         where category_id = new.category_id and nominee_id = new.winner_id
       )
       or (new.tie_winner_id is not null and (
         not public.nominee_belongs_to_room_catalog(new.room_id, new.tie_winner_id)
         or not exists (
           select 1 from public.category_nominees
           where category_id = new.category_id and nominee_id = new.tie_winner_id
         )
       )) then
      raise exception 'room winner must use its room catalog' using errcode = '23514';
    end if;
  elsif tg_table_name = 'bingo_cards' then
    if exists (
      select 1
      from jsonb_array_elements_text(new.squares) square(value)
      join public.rooms room on room.id = new.room_id
      left join public.bingo_squares authored
        on authored.id = square.value::integer and authored.show_pack_id = room.show_pack_id
      where square.value::integer <> 0 and authored.id is null
    ) then
      raise exception 'bingo card must use its room catalog' using errcode = '23514';
    end if;
  elsif tg_table_name = 'room_settlement_entries' then
    select room_id into v_settlement_room_id
    from public.room_settlements where id = new.settlement_id;
    if (new.category_id is not null and not public.category_belongs_to_room_catalog(v_settlement_room_id, new.category_id))
       or (new.winner_id is not null and not public.nominee_belongs_to_room_catalog(v_settlement_room_id, new.winner_id))
       or (new.tie_winner_id is not null and not public.nominee_belongs_to_room_catalog(v_settlement_room_id, new.tie_winner_id)) then
      raise exception 'settlement entry must use its room catalog' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger guard_confidence_pick_catalog before insert or update on public.confidence_picks
for each row execute function public.guard_room_catalog_write();
create trigger guard_draft_pick_catalog before insert or update on public.draft_picks
for each row execute function public.guard_room_catalog_write();
create trigger guard_beat_activation_catalog before insert or update on public.beat_activations
for each row execute function public.guard_room_catalog_write();
create trigger guard_room_winner_catalog before insert or update on public.room_winners
for each row execute function public.guard_room_catalog_write();
create trigger guard_bingo_card_catalog before insert or update on public.bingo_cards
for each row execute function public.guard_room_catalog_write();
create trigger guard_settlement_entry_catalog before insert or update on public.room_settlement_entries
for each row execute function public.guard_room_catalog_write();

create or replace function public.guard_signature_beat_catalog()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.draft_entities entity
    where entity.id = new.entity_id and entity.show_pack_id = new.show_pack_id
  ) or (new.partner_entity_id is not null and not exists (
    select 1 from public.draft_entities partner
    where partner.id = new.partner_entity_id and partner.show_pack_id = new.show_pack_id
  )) then
    raise exception 'signature beat entities must belong to its show pack' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger guard_signature_beat_catalog before insert or update on public.signature_beats
for each row execute function public.guard_signature_beat_catalog();

create or replace function public.show_pack_is_playable(p_show_pack_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select
    exists (
      select 1
      from public.categories category
      join public.category_nominees candidate on candidate.category_id = category.id
      where category.show_pack_id = p_show_pack_id
      group by category.id
      having count(*) >= 2
    )
    and exists (select 1 from public.draft_entities where show_pack_id = p_show_pack_id)
    and exists (select 1 from public.signature_beats where show_pack_id = p_show_pack_id)
    and (select count(*) from public.bingo_squares where show_pack_id = p_show_pack_id) >= 24
$$;

create or replace function public.guard_room_show_pack_binding()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE' then
    if new.show_pack_id is not distinct from old.show_pack_id then return new; end if;
    if auth.role() is distinct from 'service_role' then
      raise exception 'show-pack binding requires the service role' using errcode = '42501';
    end if;
    if old.phase <> 'lobby' then
      raise exception 'show-pack binding is frozen after the lobby' using errcode = '23514';
    end if;
  end if;
  if not exists (select 1 from public.show_packs where id = new.show_pack_id and status = 'published') then
    raise exception 'room can only bind a published show pack' using errcode = '23514';
  end if;
  if not public.show_pack_is_playable(new.show_pack_id) then
    raise exception 'room can only bind a playable show pack' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and (
     exists (select 1 from public.draft_picks where room_id = old.id)
     or exists (select 1 from public.confidence_picks where room_id = old.id)
     or exists (select 1 from public.bingo_cards where room_id = old.id)
     or exists (select 1 from public.beat_activations where room_id = old.id)
     or exists (select 1 from public.room_winners where room_id = old.id)
  ) then
    raise exception 'room already has pack-dependent game state' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger guard_room_show_pack_binding before update of show_pack_id on public.rooms
for each row execute function public.guard_room_show_pack_binding();
create trigger guard_new_room_show_pack before insert on public.rooms
for each row execute function public.guard_room_show_pack_binding();

create or replace function public.guard_room_spotlight_catalog()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.active_spotlight_category_id is not null
     and not public.category_belongs_to_room_catalog(new.id, new.active_spotlight_category_id) then
    raise exception 'spotlight category must use its room catalog' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger guard_room_spotlight_catalog
before insert or update of active_spotlight_category_id on public.rooms
for each row execute function public.guard_room_spotlight_catalog();

create or replace function public.bind_room_show_pack(
  p_room_code text,
  p_pack_key text,
  p_pack_version integer
)
returns table (room_id uuid, show_pack_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pack_id uuid;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'bind_room_show_pack requires the service role' using errcode = '42501';
  end if;
  select id into v_pack_id from public.show_packs
  where pack_key = p_pack_key and version = p_pack_version and status = 'published';
  if v_pack_id is null then raise exception 'published show pack %@% not found', p_pack_key, p_pack_version; end if;
  return query
    update public.rooms
    set show_pack_id = v_pack_id
    where code = upper(btrim(p_room_code))
    returning rooms.id, rooms.show_pack_id;
  if not found then raise exception 'room % not found', upper(btrim(p_room_code)); end if;
end;
$$;
revoke all on function public.bind_room_show_pack(text, text, integer) from public, anon, authenticated;
grant execute on function public.bind_room_show_pack(text, text, integer) to service_role;

do $$ begin
  alter publication supabase_realtime add table public.show_packs;
exception when duplicate_object then null;
end $$;
