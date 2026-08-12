-- The show pack owns the fact model, so binding it also selects the matching
-- game model. Scheduled external streams retain confidence picks; room-declared
-- and AI-witnessed shows use open conviction portfolios.

create or replace function public.bind_room_game_model_to_show_pack()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_fact_source text;
begin
  select pack.fact_source into v_fact_source
  from public.show_packs pack
  where pack.id = new.show_pack_id;
  if v_fact_source is null then
    raise exception 'room show pack has no fact model' using errcode = '23503';
  end if;
  new.game_model := case
    when v_fact_source = 'scheduled' then 'legacy_ensemble'
    else 'conviction_portfolio'
  end;
  return new;
end;
$$;

drop trigger if exists select_room_game_model_on_insert on public.rooms;
create trigger select_room_game_model_on_insert
before insert on public.rooms
for each row execute function public.bind_room_game_model_to_show_pack();

drop trigger if exists select_room_game_model_on_pack_binding on public.rooms;
create trigger select_room_game_model_on_pack_binding
before update of show_pack_id on public.rooms
for each row execute function public.bind_room_game_model_to_show_pack();

comment on function public.bind_room_game_model_to_show_pack() is
  'Derives legacy confidence versus conviction portfolio from the room-bound show pack fact source.';
