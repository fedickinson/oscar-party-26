-- A closed settlement must not keep reading mutable live bingo rows. In
-- preserve_live mode the operator submits a warranted snapshot of the approved
-- live marks; the RPC proves the set is exact and stores it with the version.

create or replace function public.settle_room(
  p_room_code text,
  p_manifest_hash text,
  p_title text,
  p_actor text,
  p_bingo_mode text,
  p_entries jsonb,
  p_bingo_marks jsonb default '[]'::jsonb
)
returns table (settlement_id uuid, settlement_version integer, applied boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
  v_existing public.room_settlements%rowtype;
  v_settlement public.room_settlements%rowtype;
  v_version integer;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'settle_room requires the service role' using errcode = '42501';
  end if;

  select * into v_room
  from public.rooms
  where code = upper(btrim(p_room_code))
  for update;

  if not found then
    raise exception 'room % not found', upper(btrim(p_room_code));
  end if;
  if v_room.phase not in ('finished', 'closed') then
    raise exception 'room % must be finished before settlement; phase is %', v_room.code, v_room.phase;
  end if;
  if p_manifest_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'manifest hash must be 64 lowercase hexadecimal characters';
  end if;
  if length(btrim(coalesce(p_title, ''))) = 0 or length(btrim(coalesce(p_actor, ''))) = 0 then
    raise exception 'settlement title and actor are required';
  end if;
  if p_bingo_mode not in ('preserve_live', 'replace') then
    raise exception 'bingo mode must be preserve_live or replace';
  end if;
  if jsonb_typeof(p_entries) is distinct from 'array' or jsonb_typeof(p_bingo_marks) is distinct from 'array' then
    raise exception 'entries and bingo marks must be arrays';
  end if;

  select * into v_existing
  from public.room_settlements
  where room_id = v_room.id and manifest_hash = p_manifest_hash;
  if found then
    if v_room.active_settlement_id = v_existing.id then
      return query select v_existing.id, v_existing.version, false;
      return;
    end if;
    raise exception 'manifest % belongs to superseded settlement version %', p_manifest_hash, v_existing.version;
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_entries) as entry(
      entry_key text, name text, category_id integer, outcome text, points integer,
      winner_id uuid, tie_winner_id uuid, display_order integer, occurred_at timestamptz, warrant jsonb
    )
    where length(btrim(coalesce(entry_key, ''))) = 0
       or length(btrim(coalesce(name, ''))) = 0
       or outcome not in ('resolved', 'void')
       or points is null or points <= 0
       or display_order is null
       or (outcome = 'resolved' and winner_id is null)
       or (outcome = 'void' and (winner_id is not null or tie_winner_id is not null or category_id is null))
       or winner_id is not null and tie_winner_id is not distinct from winner_id
       or jsonb_typeof(warrant) is distinct from 'object'
       or warrant ->> 'verdict' is distinct from 'true'
       or jsonb_typeof(warrant -> 'sources') is distinct from 'array'
       or jsonb_array_length(warrant -> 'sources') = 0
       or exists (
         select 1 from jsonb_to_recordset(warrant -> 'sources') as source(kind text, ref text)
         where length(btrim(coalesce(kind, ''))) = 0 or length(btrim(coalesce(ref, ''))) = 0
       )
  ) then
    raise exception 'every entry needs a valid outcome, attribution, points, order and true warrant with sources';
  end if;

  if exists (
    select entry_key from jsonb_to_recordset(p_entries) as entry(entry_key text)
    group by entry_key having count(*) > 1
  ) or exists (
    select category_id from jsonb_to_recordset(p_entries) as entry(category_id integer)
    where category_id is not null group by category_id having count(*) > 1
  ) then
    raise exception 'entry keys and authored category ids must be unique within a settlement';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_entries) as entry(category_id integer, points integer)
    left join public.categories category on category.id = entry.category_id
    where entry.category_id is not null
      and (category.id is null or category.points <> entry.points)
  ) then
    raise exception 'authored settlement outcomes must reference an existing category with unchanged points';
  end if;

  if exists (
    select 1
    from (select distinct category_id from public.confidence_picks where room_id = v_room.id) pick
    left join jsonb_to_recordset(p_entries) as entry(category_id integer)
      on entry.category_id = pick.category_id
    where entry.category_id is null
  ) then
    raise exception 'every staked prediction category must have an explicit settled outcome';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_bingo_marks) as mark(
      card_id uuid, square_index integer, marked_at timestamptz, warrant jsonb
    )
    left join public.bingo_cards card on card.id = mark.card_id and card.room_id = v_room.id
    where card.id is null
       or square_index not between 0 and 24
       or jsonb_typeof(warrant) is distinct from 'object'
       or warrant ->> 'verdict' is distinct from 'true'
       or jsonb_typeof(warrant -> 'sources') is distinct from 'array'
       or jsonb_array_length(warrant -> 'sources') = 0
       or exists (
         select 1 from jsonb_to_recordset(warrant -> 'sources') as source(kind text, ref text)
         where length(btrim(coalesce(kind, ''))) = 0 or length(btrim(coalesce(ref, ''))) = 0
       )
  ) then
    raise exception 'settlement bingo marks need a room card, valid square and true warrant with sources';
  end if;
  if exists (
    select card_id, square_index
    from jsonb_to_recordset(p_bingo_marks) as mark(card_id uuid, square_index integer)
    group by card_id, square_index having count(*) > 1
  ) then
    raise exception 'settlement bingo marks must be unique';
  end if;

  if p_bingo_mode = 'preserve_live' and (
    exists (
      select live_mark.card_id, live_mark.square_index
      from public.bingo_marks live_mark
      join public.bingo_cards card on card.id = live_mark.card_id
      where card.room_id = v_room.id and live_mark.status = 'approved'
      except
      select mark.card_id, mark.square_index
      from jsonb_to_recordset(p_bingo_marks) as mark(card_id uuid, square_index integer)
    )
    or exists (
      select mark.card_id, mark.square_index
      from jsonb_to_recordset(p_bingo_marks) as mark(card_id uuid, square_index integer)
      except
      select live_mark.card_id, live_mark.square_index
      from public.bingo_marks live_mark
      join public.bingo_cards card on card.id = live_mark.card_id
      where card.room_id = v_room.id and live_mark.status = 'approved'
    )
  ) then
    raise exception 'preserve_live bingo marks must exactly snapshot the approved live marks';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.room_settlements where room_id = v_room.id;

  insert into public.room_settlements (
    room_id, version, manifest_hash, title, actor, bingo_mode, supersedes_id
  ) values (
    v_room.id, v_version, p_manifest_hash, btrim(p_title), btrim(p_actor),
    p_bingo_mode, v_room.active_settlement_id
  ) returning * into v_settlement;

  insert into public.room_settlement_entries (
    settlement_id, entry_key, name, category_id, outcome, points, winner_id,
    tie_winner_id, display_order, occurred_at, warrant
  )
  select v_settlement.id, entry.entry_key, entry.name, entry.category_id,
    entry.outcome, entry.points, entry.winner_id, entry.tie_winner_id,
    entry.display_order, entry.occurred_at, entry.warrant
  from jsonb_to_recordset(p_entries) as entry(
    entry_key text, name text, category_id integer, outcome text, points integer,
    winner_id uuid, tie_winner_id uuid, display_order integer, occurred_at timestamptz, warrant jsonb
  );

  insert into public.room_settlement_bingo_marks (
    settlement_id, card_id, square_index, marked_at, warrant
  )
  select v_settlement.id, mark.card_id, mark.square_index,
    coalesce(mark.marked_at, v_settlement.created_at), mark.warrant
  from jsonb_to_recordset(p_bingo_marks) as mark(
    card_id uuid, square_index integer, marked_at timestamptz, warrant jsonb
  );

  update public.rooms
  set active_settlement_id = v_settlement.id, phase = 'closed'
  where id = v_room.id;

  insert into public.messages (room_id, player_id, text)
  values (v_room.id, 'system', 'The researched record is closed: ' || v_settlement.title);

  return query select v_settlement.id, v_settlement.version, true;
end;
$$;

revoke all on function public.settle_room(text, text, text, text, text, jsonb, jsonb) from public;
revoke all on function public.settle_room(text, text, text, text, text, jsonb, jsonb) from anon, authenticated;
grant execute on function public.settle_room(text, text, text, text, text, jsonb, jsonb) to service_role;
