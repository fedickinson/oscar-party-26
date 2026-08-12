-- First rung of the witness ladder: a service-run perception command may queue
-- a structured claim, but only the room host can convert it into a fact. The
-- acceptance RPC re-reads the reviewed beat under the room lock and owns the
-- declaration, winner, public announcement and proposal resolution together.

alter table public.rooms
  add column if not exists witness_revision bigint default 0 not null
  check (witness_revision >= 0);

create table if not exists public.witness_proposals (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  source_signature_beat_id integer not null references public.signature_beats(id),
  entity_id uuid not null references public.draft_entities(id),
  confidence integer not null check (confidence between 0 and 100),
  observed_at timestamp with time zone not null,
  frame_sha256 text not null check (frame_sha256 ~ '^[a-f0-9]{64}$'),
  reference_manifest_sha256 text not null check (reference_manifest_sha256 ~ '^[a-f0-9]{64}$'),
  reference_images_sha256 text not null check (reference_images_sha256 ~ '^[a-f0-9]{64}$'),
  model_output_sha256 text not null check (model_output_sha256 ~ '^[a-f0-9]{64}$'),
  model text not null check (length(btrim(model)) > 0),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'dismissed')),
  -- Deliberately not a foreign key: referee undo deletes provisional categories,
  -- while this accepted observation must retain the struck declaration's id as
  -- audit history. The review trigger verifies the row at acceptance time.
  declaration_category_id integer,
  reviewed_by uuid references public.players(id),
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  check (
    (status = 'pending'
      and declaration_category_id is null
      and reviewed_by is null
      and reviewed_at is null)
    or
    (status = 'dismissed'
      and declaration_category_id is null
      and reviewed_by is not null
      and reviewed_at is not null)
    or
    (status = 'accepted'
      and declaration_category_id is not null
      and reviewed_by is not null
      and reviewed_at is not null)
  )
);

create unique index if not exists witness_proposals_one_pending_beat
  on public.witness_proposals(room_id, source_signature_beat_id)
  where status = 'pending';
create index if not exists witness_proposals_room_status_created
  on public.witness_proposals(room_id, status, created_at);

alter table public.witness_proposals enable row level security;
revoke all on public.witness_proposals from public, anon, authenticated;
grant all on public.witness_proposals to service_role;

create or replace function public.guard_witness_proposal()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
  v_beat public.signature_beats%rowtype;
  v_declaration public.categories%rowtype;
begin
  if tg_op = 'UPDATE' and (
    new.room_id is distinct from old.room_id
    or new.source_signature_beat_id is distinct from old.source_signature_beat_id
    or new.entity_id is distinct from old.entity_id
    or new.confidence is distinct from old.confidence
    or new.observed_at is distinct from old.observed_at
    or new.frame_sha256 is distinct from old.frame_sha256
    or new.reference_manifest_sha256 is distinct from old.reference_manifest_sha256
    or new.reference_images_sha256 is distinct from old.reference_images_sha256
    or new.model_output_sha256 is distinct from old.model_output_sha256
    or new.model is distinct from old.model
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'witness observation evidence is immutable' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and (
    old.status <> 'pending'
    or new.status not in ('accepted', 'dismissed')
  ) then
    raise exception 'a witness proposal may be reviewed exactly once' using errcode = '23514';
  end if;

  select room.* into v_room
  from public.rooms room
  where room.id = new.room_id;
  if v_room.id is null then
    raise exception 'witness proposal room not found' using errcode = '23503';
  end if;

  select beat.* into v_beat
  from public.signature_beats beat
  where beat.id = new.source_signature_beat_id;
  if v_beat.id is null
     or v_beat.show_pack_id is distinct from v_room.show_pack_id
     or not public.trigger_contract_is_valid(v_beat.trigger_contract) then
    raise exception 'witness proposal needs a reviewed beat from the room catalog' using errcode = '23514';
  end if;
  if new.entity_id is distinct from v_beat.entity_id
     and new.entity_id is distinct from v_beat.partner_entity_id then
    raise exception 'witness proposal entity must be one side of its beat' using errcode = '23514';
  end if;

  if new.status = 'pending' then
    if v_room.phase <> 'live'::public.room_phase then
      raise exception 'witness proposals may be queued only while the room is live' using errcode = '55000';
    end if;
    if exists (
      select 1 from public.categories category
      where category.room_id = new.room_id
        and category.source_signature_beat_id = new.source_signature_beat_id
    ) then
      raise exception 'witness beat is already declared' using errcode = '23505';
    end if;
  elsif new.status = 'dismissed' then
    if not exists (
      select 1 from public.players reviewer
      where reviewer.id = new.reviewed_by and reviewer.room_id = new.room_id
    ) then
      raise exception 'witness reviewer must belong to the room' using errcode = '23514';
    end if;
  else
    select category.* into v_declaration
    from public.categories category
    where category.id = new.declaration_category_id;
    if v_declaration.id is null
       or v_declaration.room_id is distinct from new.room_id
       or v_declaration.source_signature_beat_id is distinct from new.source_signature_beat_id then
      raise exception 'accepted witness proposal must identify its canonical declaration' using errcode = '23514';
    end if;
    if not exists (
      select 1 from public.players reviewer
      where reviewer.id = new.reviewed_by and reviewer.room_id = new.room_id
    ) then
      raise exception 'witness reviewer must belong to the room' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_witness_proposal on public.witness_proposals;
create trigger guard_witness_proposal
before insert or update on public.witness_proposals
for each row execute function public.guard_witness_proposal();

create or replace function public.advance_witness_revision()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_room_id uuid;
begin
  v_room_id := case when tg_op = 'DELETE' then old.room_id else new.room_id end;
  update public.rooms
  set witness_revision = witness_revision + 1
  where id = v_room_id;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists advance_witness_revision on public.witness_proposals;
create trigger advance_witness_revision
after insert or update or delete on public.witness_proposals
for each row execute function public.advance_witness_revision();

create or replace function public.list_pending_witness_proposals(
  p_room_id uuid,
  p_actor_player_id uuid
)
returns table (
  id uuid,
  source_signature_beat_id integer,
  beat_name text,
  trigger_text text,
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
  created_at timestamp with time zone
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.rooms room
    where room.id = p_room_id and room.host_id = p_actor_player_id
  ) then
    raise exception 'only the room host may read witness proposals' using errcode = '42501';
  end if;

  return query
  select
    proposal.id,
    proposal.source_signature_beat_id,
    beat.name,
    beat.trigger_text,
    beat.points,
    proposal.entity_id,
    entity.name,
    proposal.confidence,
    proposal.observed_at,
    proposal.frame_sha256,
    proposal.reference_manifest_sha256,
    proposal.reference_images_sha256,
    proposal.model_output_sha256,
    proposal.model,
    proposal.created_at
  from public.witness_proposals proposal
  join public.signature_beats beat on beat.id = proposal.source_signature_beat_id
  join public.draft_entities entity on entity.id = proposal.entity_id
  where proposal.room_id = p_room_id and proposal.status = 'pending'
  order by proposal.created_at, proposal.id;
end;
$$;

revoke all on function public.list_pending_witness_proposals(uuid, uuid) from public;
grant execute on function public.list_pending_witness_proposals(uuid, uuid)
  to anon, authenticated, service_role;

create or replace function public.review_witness_proposal(
  p_room_id uuid,
  p_proposal_id uuid,
  p_actor_player_id uuid,
  p_action text
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
  v_nominee_ids uuid[];
  v_nominee_id uuid;
  v_declaration_name text;
  v_declaration_id integer;
  v_actor_name text;
begin
  if p_action not in ('accept', 'dismiss') then
    raise exception 'witness action must be accept or dismiss' using errcode = '22023';
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
    raise exception 'witness proposals may be reviewed only while the room is live' using errcode = '55000';
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
    set status = 'dismissed', reviewed_by = p_actor_player_id, reviewed_at = clock_timestamp()
    where id = v_proposal.id;
    return jsonb_build_object('proposal_id', v_proposal.id, 'status', 'dismissed');
  end if;

  select beat.* into v_beat
  from public.signature_beats beat
  where beat.id = v_proposal.source_signature_beat_id
    and beat.show_pack_id = v_room.show_pack_id;
  select entity.* into v_entity
  from public.draft_entities entity
  where entity.id = v_proposal.entity_id
    and entity.show_pack_id = v_room.show_pack_id;
  if v_beat.id is null
     or v_entity.id is null
     or (v_entity.id is distinct from v_beat.entity_id
       and v_entity.id is distinct from v_beat.partner_entity_id)
     or not public.trigger_contract_is_valid(v_beat.trigger_contract) then
    raise exception 'witness proposal is stale against the room catalog' using errcode = '23514';
  end if;
  if exists (
    select 1 from public.categories category
    where category.room_id = p_room_id
      and category.source_signature_beat_id = v_beat.id
  ) then
    raise exception 'witness beat is already declared' using errcode = '23505';
  end if;

  select array_agg(nominee.id order by nominee.id)
  into v_nominee_ids
  from public.nominees nominee
  where nominee.show_pack_id = v_room.show_pack_id
    and nominee.name = v_entity.name;
  if cardinality(v_nominee_ids) is distinct from 1 then
    raise exception 'witness entity must resolve to exactly one room nominee' using errcode = '23514';
  end if;
  v_nominee_id := v_nominee_ids[1];
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
    reviewed_by = p_actor_player_id,
    reviewed_at = clock_timestamp()
  where id = v_proposal.id;

  return jsonb_build_object(
    'proposal_id', v_proposal.id,
    'status', 'accepted',
    'declaration_category_id', v_declaration_id
  );
end;
$$;

revoke all on function public.review_witness_proposal(uuid, uuid, uuid, text) from public;
grant execute on function public.review_witness_proposal(uuid, uuid, uuid, text)
  to anon, authenticated, service_role;

-- The operator seal is exact: adding one public table also updates the atomic
-- capture in the same migration, so snapshot tooling cannot silently omit it.
create or replace function public.capture_operator_snapshot_v1()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
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

comment on table public.witness_proposals is
  'Structured perception claims. Only a host review RPC may convert a pending proposal into a room fact.';
comment on column public.rooms.witness_revision is
  'Realtime invalidation counter for the host-only witness queue; proposal rows remain private.';
