-- One renewable lease per room engine. The table is read-only to clients;
-- narrow security-definer RPCs own claim, pulse, stale takeover and release.

create table if not exists public.operator_heartbeats (
  room_id uuid not null references public.rooms(id) on delete cascade,
  engine text not null check (engine in ('companion_daemon')),
  instance_id uuid not null,
  started_at timestamptz not null default clock_timestamp(),
  heartbeat_at timestamptz not null default clock_timestamp(),
  primary key (room_id, engine)
);

alter table public.operator_heartbeats enable row level security;
create policy "operator heartbeats are readable"
  on public.operator_heartbeats for select to anon, authenticated
  using (true);

revoke all on public.operator_heartbeats from anon, authenticated;
grant select on public.operator_heartbeats to anon, authenticated;
grant all on public.operator_heartbeats to service_role;

do $$ begin
  alter publication supabase_realtime add table public.operator_heartbeats;
exception when duplicate_object then null;
end $$;

create or replace function public.touch_operator_heartbeat(
  p_room_id uuid,
  p_engine text,
  p_instance_id uuid
)
returns table (
  claimed boolean,
  active_instance_id uuid,
  active_heartbeat_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_instance_id uuid;
  v_heartbeat_at timestamptz;
begin
  if p_engine is distinct from 'companion_daemon' then
    raise exception 'unknown operator engine %', p_engine using errcode = '22023';
  end if;
  if not exists (select 1 from public.rooms where id = p_room_id) then
    raise exception 'room not found' using errcode = 'P0002';
  end if;

  insert into public.operator_heartbeats (
    room_id, engine, instance_id, started_at, heartbeat_at
  ) values (
    p_room_id, p_engine, p_instance_id, v_now, v_now
  )
  on conflict (room_id, engine) do update
  set instance_id = excluded.instance_id,
      started_at = case
        when operator_heartbeats.instance_id = excluded.instance_id
          then operator_heartbeats.started_at
        else excluded.started_at
      end,
      heartbeat_at = excluded.heartbeat_at
  where operator_heartbeats.instance_id = excluded.instance_id
     or operator_heartbeats.heartbeat_at < v_now - interval '45 seconds'
  returning operator_heartbeats.instance_id, operator_heartbeats.heartbeat_at
  into v_instance_id, v_heartbeat_at;

  if found then
    return query select true, v_instance_id, v_heartbeat_at;
    return;
  end if;

  select heartbeat.instance_id, heartbeat.heartbeat_at
  into v_instance_id, v_heartbeat_at
  from public.operator_heartbeats heartbeat
  where heartbeat.room_id = p_room_id and heartbeat.engine = p_engine;
  return query select false, v_instance_id, v_heartbeat_at;
end;
$$;

create or replace function public.release_operator_heartbeat(
  p_room_id uuid,
  p_engine text,
  p_instance_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_released uuid;
begin
  if p_engine is distinct from 'companion_daemon' then
    raise exception 'unknown operator engine %', p_engine using errcode = '22023';
  end if;
  delete from public.operator_heartbeats
  where room_id = p_room_id
    and engine = p_engine
    and instance_id = p_instance_id
  returning instance_id into v_released;
  return v_released is not null;
end;
$$;

revoke all on function public.touch_operator_heartbeat(uuid, text, uuid) from public;
revoke all on function public.release_operator_heartbeat(uuid, text, uuid) from public;
grant execute on function public.touch_operator_heartbeat(uuid, text, uuid)
  to anon, authenticated, service_role;
grant execute on function public.release_operator_heartbeat(uuid, text, uuid)
  to anon, authenticated, service_role;
