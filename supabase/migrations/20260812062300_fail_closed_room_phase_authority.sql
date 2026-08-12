-- A missing transaction-local authorization marker reads as NULL. Collapse
-- that state to false so an ordinary browser update cannot bypass the room
-- transition guard through PostgreSQL three-valued boolean logic.
create or replace function public.guard_room_phase_authority()
returns trigger
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_authorized boolean;
begin
  if auth.role() = 'service_role' or tg_op = 'INSERT' then return new; end if;

  v_authorized := coalesce(
    current_setting('app.room_authority_id', true) = new.id::text,
    false
  ) or coalesce(
    current_setting('app.referee_room_id', true) = new.id::text,
    false
  );

  if (new.host_id is distinct from old.host_id
      or new.phase is distinct from old.phase
      or new.draft_order is distinct from old.draft_order
      or new.countdown_started_at is distinct from old.countdown_started_at)
     and not v_authorized then
    raise exception 'shared room transitions require an authorized operator command'
      using errcode = '42501';
  end if;
  if new.current_pick is distinct from old.current_pick
     and not v_authorized
     and current_setting('app.atomic_draft_room_id', true) is distinct from new.id::text then
    raise exception 'draft turn changes require an authorized command or atomic pick'
      using errcode = '42501';
  end if;
  if new.ready_players is distinct from old.ready_players
     and not v_authorized
     and current_setting('app.player_room_id', true) is distinct from new.id::text then
    raise exception 'ready state changes require the player-ready command'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_room_phase_authority()
  from public, anon, authenticated;

comment on function public.guard_room_phase_authority() is
  'Fail-closed trigger allowing shared room phase and draft-state transitions only under an explicit transaction-local authority marker.';
