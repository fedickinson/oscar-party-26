-- The first destructive operator repair primitive is deliberately narrow:
-- compare-and-swap one human chat row against a sealed snapshot plan, then
-- append a public correction in the same transaction. Synthetic and companion
-- transcript rows remain immutable through this command.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.operator_message_repairs (
  repair_key text primary key check (repair_key ~ '^[a-f0-9]{64}$'),
  room_id uuid not null references public.rooms(id) on delete cascade,
  room_show_pack_id uuid not null references public.show_packs(id),
  message_id uuid not null,
  action text not null check (action in ('replace_text', 'delete_extra')),
  snapshot_manifest_sha256 text not null
    check (snapshot_manifest_sha256 ~ '^[a-f0-9]{64}$'),
  expected_row jsonb not null check (jsonb_typeof(expected_row) = 'object'),
  desired_row jsonb,
  public_correction text not null
    check (char_length(btrim(public_correction)) between 1 and 400),
  correction_message_id uuid not null,
  applied_at timestamptz not null default clock_timestamp(),
  check (
    (action = 'replace_text' and desired_row is not null and jsonb_typeof(desired_row) = 'object')
    or (action = 'delete_extra' and desired_row is null)
  )
);

alter table private.operator_message_repairs
  add column if not exists room_show_pack_id uuid references public.show_packs(id);
alter table private.operator_message_repairs
  alter column room_show_pack_id set not null;

do $$
begin
  if to_regprocedure(
    'public.repair_room_message_from_snapshot(text,uuid,uuid,text,text,jsonb,jsonb,text)'
  ) is not null then
    execute 'revoke all on function public.repair_room_message_from_snapshot('
      || 'text, uuid, uuid, text, text, jsonb, jsonb, text) '
      || 'from public, anon, authenticated, service_role';
  end if;
end;
$$;

create index if not exists operator_message_repairs_room_applied
  on private.operator_message_repairs(room_id, applied_at, repair_key);

revoke all on private.operator_message_repairs from public, anon, authenticated;
grant select, insert on private.operator_message_repairs to service_role;

create or replace function public.repair_room_message_from_snapshot(
  p_repair_key text,
  p_room_id uuid,
  p_room_show_pack_id uuid,
  p_message_id uuid,
  p_action text,
  p_snapshot_manifest_sha256 text,
  p_expected_row jsonb,
  p_desired_row jsonb,
  p_public_correction text
)
returns table (
  repair_key text,
  action text,
  correction_message_id uuid,
  already_applied boolean,
  resulting_row jsonb
)
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
declare
  v_room public.rooms%rowtype;
  v_message public.messages%rowtype;
  v_receipt private.operator_message_repairs%rowtype;
  v_correction_id uuid;
  v_result jsonb;
  v_prefix text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'message repair requires service role' using errcode = '42501';
  end if;
  if p_repair_key is null or p_repair_key !~ '^[a-f0-9]{64}$'
     or p_snapshot_manifest_sha256 is null
     or p_snapshot_manifest_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'message repair digests are invalid' using errcode = '22023';
  end if;
  if p_action not in ('replace_text', 'delete_extra') then
    raise exception 'message repair action is invalid' using errcode = '22023';
  end if;
  if jsonb_typeof(p_expected_row) is distinct from 'object'
     or (select count(*) from jsonb_object_keys(p_expected_row)) <> 5
     or not (p_expected_row ?& array['id', 'room_id', 'player_id', 'text', 'created_at']) then
    raise exception 'message repair expected row is invalid' using errcode = '22023';
  end if;
  if (p_expected_row ->> 'id')::uuid is distinct from p_message_id
     or (p_expected_row ->> 'room_id')::uuid is distinct from p_room_id then
    raise exception 'message repair expected row identity is invalid' using errcode = '22023';
  end if;

  v_prefix := case p_action
    when 'replace_text' then
      'Operator correction: a player chat message was restored to the sealed record. '
    else
      'Operator correction: an extra player chat message was removed. '
  end;
  if p_public_correction is null
     or char_length(p_public_correction) not between char_length(v_prefix) + 1 and char_length(v_prefix) + 240
     or left(p_public_correction, char_length(v_prefix)) <> v_prefix
     or p_public_correction ~ '[[:cntrl:]]' then
    raise exception 'message repair public correction is invalid' using errcode = '22023';
  end if;

  select room.* into v_room
  from public.rooms room
  where room.id = p_room_id
  for update;
  if not found then raise exception 'room not found' using errcode = 'P0002'; end if;
  if v_room.phase = 'closed' then
    raise exception 'closed room chat cannot be repaired' using errcode = '42501';
  end if;
  if v_room.show_pack_id is distinct from p_room_show_pack_id then
    raise exception 'room show-pack identity changed after repair plan approval' using errcode = '40001';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_repair_key, 0));
  select receipt.* into v_receipt
  from private.operator_message_repairs receipt
  where receipt.repair_key = p_repair_key;
  if found then
    if v_receipt.room_id is distinct from p_room_id
       or v_receipt.room_show_pack_id is distinct from p_room_show_pack_id
       or v_receipt.message_id is distinct from p_message_id
       or v_receipt.action is distinct from p_action
       or v_receipt.snapshot_manifest_sha256 is distinct from p_snapshot_manifest_sha256
       or v_receipt.expected_row is distinct from p_expected_row
       or v_receipt.desired_row is distinct from p_desired_row
       or v_receipt.public_correction is distinct from p_public_correction then
      raise exception 'message repair key is already bound to different inputs' using errcode = '23505';
    end if;
    if p_action = 'replace_text' then
      select to_jsonb(message.*) into v_result
      from public.messages message
      where message.id = p_message_id and message.room_id = p_room_id;
      if v_result is distinct from p_desired_row then
        raise exception 'applied message repair result has drifted' using errcode = '40001';
      end if;
    else
      if exists (
        select 1 from public.messages message
        where message.id = p_message_id and message.room_id = p_room_id
      ) then
        raise exception 'applied message deletion has drifted' using errcode = '40001';
      end if;
      v_result := null;
    end if;
    if not exists (
      select 1 from public.messages message
      where message.id = v_receipt.correction_message_id
        and message.room_id = p_room_id
        and message.player_id = 'system'
        and message.text = p_public_correction
    ) then
      raise exception 'applied message repair correction has drifted' using errcode = '40001';
    end if;
    return query select p_repair_key, p_action, v_receipt.correction_message_id, true, v_result;
    return;
  end if;

  select message.* into v_message
  from public.messages message
  where message.id = p_message_id and message.room_id = p_room_id
  for update;
  if not found then
    raise exception 'target message is missing or belongs to another room' using errcode = '40001';
  end if;
  if to_jsonb(v_message) is distinct from p_expected_row then
    raise exception 'target message changed after repair plan approval' using errcode = '40001';
  end if;
  if not exists (
    select 1 from public.players player
    where player.id::text = v_message.player_id and player.room_id = p_room_id
  ) then
    raise exception 'target message is not authored by a current room player' using errcode = '42501';
  end if;
  if exists (
    select 1
    from private.companion_reaction_claims claim
    where claim.room_id = p_room_id and p_message_id = any(claim.output_message_ids)
  ) or exists (
    select 1
    from private.companion_reaction_deliveries delivery
    where delivery.room_id = p_room_id and delivery.message_id = p_message_id
  ) then
    raise exception 'companion output messages cannot be repaired' using errcode = '42501';
  end if;
  if exists (
    select 1
    from private.companion_reaction_claims claim
    where claim.room_id = p_room_id
      and claim.reaction_key like 'chat:' || p_message_id::text || ':%'
  ) or exists (
    select 1
    from private.companion_grounding_reviews review
    where review.room_id = p_room_id
      and review.reaction_key like 'chat:' || p_message_id::text || ':%'
  ) then
    raise exception 'chat messages with reaction provenance cannot be repaired' using errcode = '42501';
  end if;
  if exists (
    select 1
    from public.player_verdicts verdict
    where verdict.room_id = p_room_id
      and (
        exists (
          select 1
          from jsonb_array_elements(verdict.highlights) highlight
          where highlight ->> 'message_id' = p_message_id::text
        )
        or exists (
          select 1
          from jsonb_array_elements(coalesce(verdict.grounding_facts, '[]'::jsonb)) fact
          where position(p_message_id::text in (fact #>> '{}')) > 0
        )
      )
  ) then
    raise exception 'keepsake evidence messages cannot be repaired' using errcode = '42501';
  end if;

  if p_action = 'replace_text' then
    if jsonb_typeof(p_desired_row) is distinct from 'object'
       or (select count(*) from jsonb_object_keys(p_desired_row)) <> 5
       or not (p_desired_row ?& array['id', 'room_id', 'player_id', 'text', 'created_at'])
       or (p_desired_row - 'text') is distinct from (p_expected_row - 'text')
       or p_desired_row ->> 'text' is null
       or p_desired_row ->> 'text' = ''
       or p_desired_row ->> 'text' = p_expected_row ->> 'text' then
      raise exception 'message replacement may change only nonempty text' using errcode = '22023';
    end if;
    update public.messages message
    set text = p_desired_row ->> 'text'
    where message.id = p_message_id and message.room_id = p_room_id
    returning to_jsonb(message.*) into v_result;
    if v_result is distinct from p_desired_row then
      raise exception 'message replacement did not produce the approved row' using errcode = '40001';
    end if;
  else
    if p_desired_row is not null then
      raise exception 'message deletion desired row must be null' using errcode = '22023';
    end if;
    delete from public.messages message
    where message.id = p_message_id and message.room_id = p_room_id;
    v_result := null;
  end if;

  insert into public.messages (room_id, player_id, text)
  values (p_room_id, 'system', p_public_correction)
  returning id into v_correction_id;

  insert into private.operator_message_repairs (
    repair_key,
    room_id,
    room_show_pack_id,
    message_id,
    action,
    snapshot_manifest_sha256,
    expected_row,
    desired_row,
    public_correction,
    correction_message_id
  ) values (
    p_repair_key,
    p_room_id,
    p_room_show_pack_id,
    p_message_id,
    p_action,
    p_snapshot_manifest_sha256,
    p_expected_row,
    p_desired_row,
    p_public_correction,
    v_correction_id
  );

  return query select p_repair_key, p_action, v_correction_id, false, v_result;
end;
$$;

revoke all on function public.repair_room_message_from_snapshot(
  text, uuid, uuid, uuid, text, text, jsonb, jsonb, text
) from public, anon, authenticated;
grant execute on function public.repair_room_message_from_snapshot(
  text, uuid, uuid, uuid, text, text, jsonb, jsonb, text
) to service_role;

comment on table private.operator_message_repairs is
  'Idempotent receipts for sealed-snapshot compare-and-swap repairs of human chat messages.';
comment on function public.repair_room_message_from_snapshot(
  text, uuid, uuid, uuid, text, text, jsonb, jsonb, text
) is
  'Service-only atomic repair of one human chat row plus its public correction receipt.';
